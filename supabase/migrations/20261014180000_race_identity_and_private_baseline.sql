-- Additive guard only: no canonical backfill, merge, deletion, or batch decision.
create table private.canonical_revision (
 singleton boolean primary key default true check (singleton),
 revision bigint not null default 0 check (revision >= 0)
);
insert into private.canonical_revision(singleton) values(true);

create table private.athlete_source_identities (
 namespace text not null check (length(namespace) between 1 and 80),
 source_id text not null check (length(source_id) between 1 and 256),
 athlete_id text not null references public.athletes(id) on delete cascade deferrable initially deferred,
 evidence jsonb not null check (jsonb_typeof(evidence)='object'),
 reviewed_by uuid references auth.users(id), created_at timestamptz not null default now(),
 primary key(namespace,source_id)
);
create index athlete_source_identities_athlete_idx on private.athlete_source_identities(athlete_id);
create table private.result_occurrences (
 id uuid primary key default gen_random_uuid(),
 kind text not null check (kind in ('swim','relay')),
 swim_id text unique references public.swims(id) on delete cascade deferrable initially deferred,
 relay_id text unique references public.relay_results(id) on delete cascade deferrable initially deferred,
 result_id text generated always as (coalesce(swim_id,relay_id)) stored,
 base_key jsonb not null,
 occurrence text not null check (occurrence ~ '^[a-zA-Z0-9_:-]{1,128}$'),
 evidence jsonb not null check (jsonb_typeof(evidence)='object'),
 reviewed_by uuid references auth.users(id), created_at timestamptz not null default now(),
 check ((kind='swim' and swim_id is not null and relay_id is null) or (kind='relay' and relay_id is not null and swim_id is null)),
 unique(kind,result_id), unique(kind,base_key,occurrence)
);
create table private.result_source_identities (
 kind text not null check (kind in ('swim','relay')),
 namespace text not null check (length(namespace) between 1 and 80),
 source_id text not null check (length(source_id) between 1 and 256),
 occurrence_id uuid not null references private.result_occurrences(id) on delete cascade,
 evidence jsonb not null check (jsonb_typeof(evidence)='object'),
 reviewed_by uuid references auth.users(id), created_at timestamptz not null default now(),
 primary key(kind,namespace,source_id)
);
create index result_source_identities_occurrence_idx on private.result_source_identities(occurrence_id);
revoke all on private.canonical_revision, private.athlete_source_identities, private.result_occurrences, private.result_source_identities from public, anon, authenticated, service_role;

create function private.lock_canonical_write() returns trigger language plpgsql security definer set search_path='' as $$
begin perform pg_advisory_xact_lock(hashtext('velocity-records')); return null; end; $$;
create function private.advance_canonical_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new is not distinct from old then return null; end if;
 update private.canonical_revision set revision=revision+1 where singleton;
 return null;
end; $$;
revoke all on function private.lock_canonical_write(), private.advance_canonical_revision() from public,anon,authenticated,service_role;
-- People supplies athlete names in canonical snapshots; catalog and identity
-- mappings are included so an alias/catalog change invalidates an export too.
do $$ declare tab text; begin
 foreach tab in array array['public.teams','public.meets','public.athletes','public.swims','public.relay_results','public.people','public.training_groups','public.evidence_records','public.knowledge_entries','private.athlete_source_identities','private.result_occurrences','private.result_source_identities'] loop
  execute format('create trigger lock_canonical_write before insert or update or delete or truncate on %s for each statement execute function private.lock_canonical_write()',tab);
  execute format('create trigger advance_canonical_revision after insert or update or delete on %s for each row execute function private.advance_canonical_revision()',tab);
  execute format('create trigger advance_canonical_truncate after truncate on %s for each statement execute function private.advance_canonical_revision()',tab);
 end loop;
end; $$;

-- These indexes also cover unresolved legacy rows, which are intentionally not
-- auto-claimed by this migration.
create index swims_identity_candidates_idx on public.swims ((data->>'athleteId'),(data#>>'{meet,id}'),(data->>'eventCode'));
create index relay_identity_candidates_idx on public.relay_results ((data->>'teamId'),(data#>>'{meet,id}'),(data->>'eventCode'));
create index athletes_member_digest_idx on public.athletes ((data#>>'{sourceObservation,memberIdHash}')) where data#>>'{sourceObservation,memberIdHash}' is not null;

create function private.result_identity_base(kind text, body jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('subject',case when kind='swim' then body->>'athleteId' else body->>'teamId' end,
  'meet',body#>>'{meet,id}','date',body#>>'{meet,date}','event',body->>'eventCode',
  'course',coalesce(body->>'course',split_part(body->>'eventCode','_',3)),'round',coalesce(body->>'round','F'),
  -- Existing validate_relay_leadoff checks parent/member/flat-start evidence in
  -- the same statement. A relay first leg is a different start from an
  -- individual final, including when their measured times happen to be equal.
  'origin',case when kind='swim' and body->>'resultOrigin'='relay_leadoff' then 'relay_leadoff' else 'individual' end,
  'parentRelay',case when kind='swim' and body->>'resultOrigin'='relay_leadoff' then body->>'parentRelayResultId' end,
  'relayName',case when kind='relay' then coalesce(body->>'relayName','') end,
  'gender',case when kind='relay' then body->>'gender' end,'ageGroup',case when kind='relay' then body->>'ageGroup' end);
$$;
revoke all on function private.result_identity_base(text,jsonb) from public,anon,authenticated,service_role;

create function private.claim_athlete_identity(ns text, sid text, aid text, proof jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare claimed text;
begin
 perform pg_advisory_xact_lock(hashtext('velocity-records'));
 if ns is null or length(ns) not between 1 and 80 or sid is null or length(sid) not between 1 and 256 or aid is null
  or jsonb_typeof(proof) is distinct from 'object' then raise exception 'Invalid stable athlete identity claim'; end if;
 if ns='hytek-member' and (sid !~ '^[a-f0-9]{24}$' or exists(select 1 from public.athletes a
  where a.data#>>'{sourceObservation,memberIdHash}'=sid and a.id<>aid)) then
  raise exception 'Stable source member identity conflicts with a canonical athlete; review the alias' using errcode='23505';
 end if;
 insert into private.athlete_source_identities(namespace,source_id,athlete_id,evidence,reviewed_by)
 values(ns,sid,aid,proof,auth.uid()) on conflict(namespace,source_id) do nothing;
 select athlete_id into claimed from private.athlete_source_identities where namespace=ns and source_id=sid;
 if claimed is distinct from aid then raise exception 'Stable source member identity already belongs to another canonical athlete' using errcode='23505'; end if;
end; $$;
revoke all on function private.claim_athlete_identity(text,text,text,jsonb) from public,anon,authenticated,service_role;

create function private.claim_result_source(k text, ns text, sid text, oid uuid, proof jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare claimed uuid;
begin
 if ns is null or length(ns) not between 1 and 80 or sid is null or length(sid) not between 1 and 256 or jsonb_typeof(proof) is distinct from 'object' then raise exception 'Invalid source result identity'; end if;
 insert into private.result_source_identities(kind,namespace,source_id,occurrence_id,evidence,reviewed_by)
 values(k,ns,sid,oid,proof,auth.uid()) on conflict(kind,namespace,source_id) do nothing;
 select occurrence_id into claimed from private.result_source_identities where kind=k and namespace=ns and source_id=sid;
 if claimed is distinct from oid then raise exception 'Source result identity already belongs to another occurrence' using errcode='23505'; end if;
end; $$;
revoke all on function private.claim_result_source(text,text,text,uuid,jsonb) from public,anon,authenticated,service_role;

create function private.claim_result_identity(k text, rid text, body jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare base jsonb:=private.result_identity_base(k,body); proof jsonb:=body->'raceIdentity'; token text;
 existing private.result_occurrences; other record; oid uuid; distinct_start boolean:=false;
begin
 perform pg_advisory_xact_lock(hashtext('velocity-records'));
 if base->>'subject' is null or base->>'meet' is null or base->>'date' is null or base->>'event' is null then
  raise exception 'A canonical result requires athlete/team, meet, date, and event identity'; end if;
 if proof is not null then
  if jsonb_typeof(proof) is distinct from 'object' or coalesce(proof->>'occurrence','') !~ '^[a-zA-Z0-9_:-]{1,128}$'
   or coalesce(proof->>'reviewed','')<>'true' or length(trim(coalesce(proof->>'basis','')))=0
   or coalesce(proof->>'sourceUrl','') !~ '^https?://[^[:space:]]+$' then raise exception 'Occurrence identity requires reviewed evidence'; end if;
  token:=proof->>'occurrence'; distinct_start:=token<>'single';
 else
  if base->>'round' in ('S','TT') then raise exception 'Repeated/ambiguous rounds require a reviewed occurrence mapping'; end if;
  token:='single'; proof:=jsonb_build_object('basis','First canonical occurrence; alternate starts require separate reviewed evidence');
 end if;
 select * into existing from private.result_occurrences where kind=k and result_id=rid;
 if existing.id is not null and (existing.base_key is distinct from base or existing.occurrence is distinct from token) and body->'raceIdentity' is null then
  raise exception 'Changing canonical race identity requires reviewed occurrence evidence'; end if;
 for other in
  select s.id from public.swims s where k='swim' and s.id<>rid and s.data->>'athleteId'=base->>'subject'
   and s.data#>>'{meet,id}'=base->>'meet' and s.data->>'eventCode'=base->>'event' and private.result_identity_base(k,s.data)=base
  union all
  select s.id from public.relay_results s where k='relay' and s.id<>rid and s.data->>'teamId'=base->>'subject'
   and s.data#>>'{meet,id}'=base->>'meet' and s.data->>'eventCode'=base->>'event' and private.result_identity_base(k,s.data)=base
 loop
  if not distinct_start or not exists(select 1 from private.result_occurrences o where o.kind=k and o.result_id=other.id and o.base_key=base and o.occurrence<>token) then
   raise exception 'Existing or unresolved legacy performance overlaps; review an explicit distinct occurrence' using errcode='23505';
  end if;
 end loop;
 insert into private.result_occurrences(kind,swim_id,relay_id,base_key,occurrence,evidence,reviewed_by)
 values(k,case when k='swim' then rid end,case when k='relay' then rid end,base,token,proof,auth.uid())
 on conflict(kind,result_id) do update set base_key=excluded.base_key,occurrence=excluded.occurrence,evidence=excluded.evidence
 where private.result_occurrences.base_key is distinct from excluded.base_key or private.result_occurrences.occurrence is distinct from excluded.occurrence
 returning id into oid;
 if oid is null then select id into oid from private.result_occurrences where kind=k and result_id=rid; end if;
 if body->'externalResult' is not null then perform private.claim_result_source(k,body#>>'{externalResult,namespace}',body#>>'{externalResult,id}',oid,coalesce(body->'sourceObservation','{}')); end if;
 if k='swim' and body#>>'{sourceObservation,memberIdHash}' is not null then
  perform private.claim_athlete_identity('hytek-member',body#>>'{sourceObservation,memberIdHash}',body->>'athleteId',body->'sourceObservation');
 end if;
 return oid;
end; $$;
revoke all on function private.claim_result_identity(text,text,jsonb) from public,anon,authenticated,service_role;

create function private.guard_canonical_identity() returns trigger language plpgsql security definer set search_path='' as $$
declare k text:=case when tg_table_name='swims' then 'swim' else 'relay' end; previous jsonb;
begin
 if tg_table_name='athletes' then
  if new.data#>>'{sourceObservation,memberIdHash}' is not null then
   perform private.claim_athlete_identity('hytek-member',new.data#>>'{sourceObservation,memberIdHash}',new.id,new.data->'sourceObservation');
  end if;
 else
  -- Existing unclaimed rows may receive nonidentity corrections/details. Do not
  -- invent historical occurrence claims or rewrite their decisions in migration.
  -- put_record uses INSERT ON CONFLICT UPDATE. BEFORE INSERT runs even for an
  -- existing ID, so use its current fact for the same legacy exemption.
  if tg_op='UPDATE' then previous:=old.data;
  elsif k='swim' then select data into previous from public.swims where id=new.id;
  else select data into previous from public.relay_results where id=new.id; end if;
  if previous is not null and private.result_identity_base(k,new.data)=private.result_identity_base(k,previous)
   and new.data->'externalResult' is not distinct from previous->'externalResult'
   and new.data#>'{sourceObservation,memberIdHash}' is not distinct from previous#>'{sourceObservation,memberIdHash}'
   and new.data->'raceIdentity' is null and not exists(select 1 from private.result_occurrences where kind=k and result_id=new.id) then return new; end if;
  perform private.claim_result_identity(k,new.id,new.data);
 end if;
 return new;
end; $$;
revoke all on function private.guard_canonical_identity() from public,anon,authenticated,service_role;
create trigger guard_canonical_identity before insert or update on public.athletes for each row execute function private.guard_canonical_identity();
create trigger guard_canonical_identity before insert or update on public.swims for each row execute function private.guard_canonical_identity();
create trigger guard_canonical_identity before insert or update on public.relay_results for each row execute function private.guard_canonical_identity();

create or replace function private.validate_collection_identity_claims(writes jsonb, proof jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare claim jsonb; body jsonb; previous jsonb; w jsonb; oid uuid; k text; rid text;
begin
 perform pg_advisory_xact_lock(hashtext('velocity-records'));
 if proof ? 'athleteAliases' and jsonb_typeof(proof->'athleteAliases') is distinct from 'array' then raise exception 'Invalid athlete alias evidence'; end if;
 if proof ? 'resultAliases' and jsonb_typeof(proof->'resultAliases') is distinct from 'array' then raise exception 'Invalid result alias evidence'; end if;
 if jsonb_array_length(coalesce(proof->'athleteAliases','[]'))>100 or jsonb_array_length(coalesce(proof->'resultAliases','[]'))>100 then raise exception 'Too many identity claims'; end if;
 for claim in select * from jsonb_array_elements(coalesce(proof->'athleteAliases','[]')) loop
  if coalesce(claim->>'reviewed','')<>'true' or length(trim(coalesce(claim->>'basis','')))=0 or coalesce(claim->>'sourceUrl','') !~ '^https?://[^[:space:]]+$' then raise exception 'Aliases require reviewed source evidence'; end if;
  if not exists(select 1 from public.athletes where id=claim->>'athleteId') and not exists(select 1 from jsonb_array_elements(writes) candidate where candidate->>'path'='athletes/'||(claim->>'athleteId')) then raise exception 'Alias target is absent'; end if;
  perform private.claim_athlete_identity(claim->>'namespace',claim->>'sourceId',claim->>'athleteId',claim);
 end loop;
 for claim in select * from jsonb_array_elements(coalesce(proof->'resultAliases','[]')) loop
  k:=claim->>'kind'; rid:=claim->>'resultId';
  if k not in ('swim','relay') or k is null or coalesce(claim->>'reviewed','')<>'true' or length(trim(coalesce(claim->>'basis','')))=0 or coalesce(claim->>'sourceUrl','') !~ '^https?://[^[:space:]]+$' then raise exception 'Result aliases require reviewed source evidence'; end if;
  select candidate->'after' into body from jsonb_array_elements(writes) candidate where candidate->>'path'=(case when k='swim' then 'swims/' else 'relay_results/' end)||rid;
  if body is null then body:=private.collection_snapshot((case when k='swim' then 'swims/' else 'relay_results/' end)||rid); end if;
  if body is null then raise exception 'Result alias target is absent'; end if;
  oid:=private.claim_result_identity(k,rid,body);
  perform private.claim_result_source(k,claim->>'namespace',claim->>'sourceId',oid,claim);
 end loop;
 -- Allocate/validate every incoming stable claim before the first canonical
 -- write. Deferred foreign keys allow references to same-batch prerequisites.
 for w in select * from jsonb_array_elements(writes) where split_part(value->>'path','/',1)='athletes' loop
  if w#>>'{after,sourceObservation,memberIdHash}' is not null then
   perform private.claim_athlete_identity('hytek-member',w#>>'{after,sourceObservation,memberIdHash}',split_part(w->>'path','/',2),w#>'{after,sourceObservation}');
  end if;
 end loop;
 for w in select * from jsonb_array_elements(writes) where split_part(value->>'path','/',1) in ('swims','relay_results') and jsonb_typeof(value->'after')='object' loop
  k:=case when split_part(w->>'path','/',1)='swims' then 'swim' else 'relay' end;
  rid:=split_part(w->>'path','/',2); body:=w->'after'; previous:=private.collection_snapshot(w->>'path');
  if previous is not null and private.result_identity_base(k,previous)=private.result_identity_base(k,body)
   and previous->'externalResult' is not distinct from body->'externalResult' and body->'raceIdentity' is null
   and previous#>'{sourceObservation,memberIdHash}' is not distinct from body#>'{sourceObservation,memberIdHash}'
   and not exists(select 1 from private.result_occurrences where kind=k and result_id=rid) then continue; end if;
  perform private.claim_result_identity(k,rid,body);
 end loop;
end; $$;
revoke all on function private.validate_collection_identity_claims(jsonb,jsonb) from public,anon,authenticated,service_role;

alter table public.collection_batches add column canonical_revision bigint;

-- Preserve current staging, staff checks, before-images, dependency ordering,
-- decisions, and projection rebuilds; add revision checks under the same lock.
CREATE OR REPLACE FUNCTION private.stage_collection (
  worker_token text,
  batch        jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare worker private.collection_workers; w jsonb; supplied_read jsonb; root text; snapshots jsonb:='[]'; current_data jsonb; bid uuid; fp text; paths text[]:='{}'; guarded boolean; rev bigint; requested text;
begin
 select * into worker from private.collection_workers where token_hash=encode(extensions.digest(worker_token,'sha256'),'hex') and revoked_at is null;
 if worker.id is null or not coalesce(batch->>'division'=any(worker.divisions),false) then raise insufficient_privilege using message='Collector access denied'; end if;
 if pg_column_size(batch)>2097152 or jsonb_typeof(batch->'writes') is distinct from 'array'
  or jsonb_array_length(batch->'writes') not between 1 and 100 or batch->'evidence' is null or batch->'evidence'='null' then raise exception 'Batch requires evidence and 1–100 proposed records (maximum 2 MB)'; end if;
 perform pg_advisory_xact_lock(hashtext('velocity-records'));
 guarded:=exists(select 1 from jsonb_array_elements(batch->'writes') x where split_part(x->>'path','/',1)=any(array['teams','meets','athletes','swims','relay_results']));
 select revision into rev from private.canonical_revision where singleton;
 requested:=batch#>>'{evidence,identityGuard,revision}';
 if guarded and (requested is not null or batch#>>'{evidence,sourceManifestRequired}'='true') then
  if batch#>>'{evidence,identityGuard,version}' is distinct from '1' or requested is null or requested !~ '^[0-9]+$' or requested::numeric<>rev then
   raise exception 'Canonical baseline revision changed or is missing. Export and prepare a fresh batch.' using errcode='40001';
  end if;
 end if;

 if batch#>>'{evidence,sourceManifestRequired}'='true' then
  if batch#>>'{evidence,baselineComplete}' is distinct from 'true' or batch#>>'{evidence,catalogScope}' not in ('whole-catalog','pilot')
   or batch#>>'{evidence,catalogScope}' is null then raise exception 'Prepared races require complete baseline and explicit catalog/pilot scope'; end if;
  if batch#>>'{evidence,catalogScope}'='whole-catalog' and (
    jsonb_typeof(batch#>'{evidence,selectedMeetIds}') is distinct from 'array'
    or jsonb_array_length(batch#>'{evidence,selectedMeetIds}')<>(select count(*) from public.knowledge_entries where data->>'kind'='meet')
    or exists(select 1 from public.knowledge_entries where data->>'kind'='meet' and not ((batch#>'{evidence,selectedMeetIds}') ? id))) then
   raise exception 'Whole-catalog proposal must include every currently listed meet' using errcode='40001';
  end if;
  if batch#>>'{evidence,catalogScope}'='pilot' and batch->>'scope' not like 'Pilot race preparation:%' then
   raise exception 'Pilot proposals must be explicitly labeled'; end if;
 end if;
 -- Full split updates were prepared from an earlier baseline. Compare supplied
 -- reads under the same lock used for staging, so stale proposals cannot rebase
 -- silently over intervening administrator corrections.
 if batch ? 'reads' then
  if jsonb_typeof(batch->'reads') is distinct from 'array' or jsonb_array_length(batch->'reads')>1000 then raise exception 'Invalid proposal reads'; end if;
  for supplied_read in select * from jsonb_array_elements(batch->'reads') loop
   root:=split_part(supplied_read->>'path','/',1);
   if supplied_read->>'path' is null or supplied_read->>'path' !~ '^[a-z_]+/[a-zA-Z0-9_-]+$' or not (supplied_read ? 'before')
    or not ((batch->>'division'='workshare' and root='families')
     or (batch->>'division'='times' and root=any(array['athletes','swims','relay_results','meets','teams','venues','standards']))
     or (batch->>'division'='knowledge' and root='knowledge_entries')) then raise exception 'Invalid proposal read'; end if;
   current_data:=private.collection_snapshot(supplied_read->>'path');
   if coalesce(current_data,'null'::jsonb) is distinct from supplied_read->'before' then raise exception 'A record changed after preparation. Prepare a fresh proposal before staging.' using errcode='40001'; end if;
   if not exists(select 1 from jsonb_array_elements(batch->'writes') candidate where candidate->>'path'=supplied_read->>'path') then
    snapshots:=snapshots||jsonb_build_array(jsonb_build_object('path',supplied_read->>'path','before',current_data));
   end if;
  end loop;
 end if;
 for w in select * from jsonb_array_elements(batch->'writes') loop
  root:=split_part(w->>'path','/',1);
  if w->>'path' is null or w->>'path' !~ '^[a-z_]+/[a-zA-Z0-9_-]+$' or w->>'path'=any(paths)
   or jsonb_typeof(w->'after') is distinct from 'object' then raise exception 'Each proposal requires a unique record path and object; removals require manual review'; end if;
  if not ((batch->>'division'='workshare' and root='families')
    or (batch->>'division'='times' and root=any(array['athletes','swims','relay_results','meets','teams','venues','standards']))
    or (batch->>'division'='knowledge' and root='knowledge_entries')) then raise exception 'Record outside collection division'; end if;
  paths:=array_append(paths,w->>'path');
  current_data:=private.collection_snapshot(w->>'path');
  if root='standards' then
   perform private.validate_standard(w->'after',split_part(w->>'path','/',2));
   if batch->>'coverage' is distinct from 'complete' or not exists(select 1 from jsonb_array_elements(coalesce(batch->'reads','[]')) rd where rd->>'path'=w->>'path' and rd ? 'before') then
    raise exception 'Standards require complete edition coverage and an explicit baseline read';
   end if;
  end if;
  if root='families' and current_data is not null and batch->>'coverage'='partial' then
   if exists(select 1 from jsonb_array_elements(coalesce(current_data->'children','[]')) old_child
    where not exists(select 1 from jsonb_array_elements(coalesce(w#>'{after,children}','[]')) new_child where new_child->>'id'=old_child->>'id'))
    or exists(select 1 from jsonb_array_elements_text(coalesce(current_data->'authorizedEmails','[]')) old_email
    where not exists(select 1 from jsonb_array_elements_text(coalesce(w#>'{after,authorizedEmails}','[]')) new_email where lower(new_email)=lower(old_email)))
   then raise exception 'Partial roster collection cannot remove household members or authorized emails. Hold the proposal and review the complete household.'; end if;
  end if;
  snapshots:=snapshots||jsonb_build_array(jsonb_build_object('path',w->>'path','before',current_data));
 end loop;
 fp:=encode(extensions.digest((jsonb_build_object('division',batch->>'division','url',batch->>'sourceUrl','writes',batch->'writes','reads',snapshots)
  || case when guarded then jsonb_build_object('canonicalRevision',rev::text) else '{}'::jsonb end
  || case when (batch->'evidence') ? 'identityGuard' then jsonb_build_object('identityGuard',batch#>'{evidence,identityGuard}') else '{}'::jsonb end)::text,'sha256'),'hex');
 insert into public.collection_batches(division,scope,source_url,captured_at,coverage,evidence,writes,reads,fingerprint,worker_id,canonical_revision)
 values(batch->>'division',batch->>'scope',batch->>'sourceUrl',(batch->>'capturedAt')::timestamptz,batch->>'coverage',batch->'evidence',batch->'writes',snapshots,fp,worker.id,case when guarded then rev end)
 on conflict(fingerprint) do nothing returning id into bid;
 if bid is null then select id into bid from public.collection_batches where fingerprint=fp; end if;
 return bid;
end; $function$;

CREATE OR REPLACE FUNCTION private.review_collection (
  batch_id uuid,
  decision text,
  note     text DEFAULT ''::text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare b public.collection_batches; r jsonb; actual jsonb; affected_events text[]; details_only boolean:=false;
begin
 if not private.is_staff() then raise insufficient_privilege using message='Verified staff access required'; end if;
 if decision not in ('approved','held','declined') or decision is null then raise exception 'Invalid decision'; end if;
 perform pg_advisory_xact_lock(hashtext('velocity-records'));
 select * into b from public.collection_batches where id=batch_id for update;
 if b.id is null or b.status not in ('pending','held') then raise exception 'This batch has already been decided or does not exist'; end if;
 if decision='approved' then
  if exists(select 1 from jsonb_array_elements(b.writes) w where split_part(w->>'path','/',1)=any(array['teams','meets','athletes','swims','relay_results'])) then
   if b.canonical_revision is null or b.canonical_revision<>(select revision from private.canonical_revision where singleton) then
    raise exception 'Canonical baseline changed after staging. Export and revalidate this batch before approval.' using errcode='40001';
   end if;
   perform private.validate_collection_identity_claims(b.writes,coalesce(b.evidence->'identityGuard','{}'));
  end if;
  for r in select * from jsonb_array_elements(b.reads) loop
   actual:=private.collection_snapshot(r->>'path');
   if coalesce(actual,'null'::jsonb) is distinct from r->'before' then raise exception 'A record changed after collection. Collect a fresh proposal before approving.' using errcode='40001'; end if;
  end loop;
  -- Split details and private observations do not change individual eligibility
  -- or time rankings. Only skip a rebuild when every full after-image matches
  -- its existing, fresh before-image after removing these exact detail fields.
  details_only:=jsonb_array_length(b.writes)>0 and not exists(
   select 1 from jsonb_array_elements(b.writes) w
   where split_part(w->>'path','/',1)<>'swims' or jsonb_typeof(w->'after') is distinct from 'object'
    or not exists(select 1 from jsonb_array_elements(b.reads) baseline
     where baseline->>'path'=w->>'path' and jsonb_typeof(baseline->'before')='object'
      and ((w->'after')-array['splits','splitCoverage','sourceObservation'])
       = ((baseline->'before')-array['splits','splitCoverage','sourceObservation']))
  );
  perform set_config('velocity.defer_bests','true',true);
  -- The collector's JSON order is not a referential ordering. Parent rows
  -- must exist before swims are inserted, even when all are in one batch.
  for r in
   select value from jsonb_array_elements(b.writes) with ordinality as items(value,position)
   order by
    case when value->'after'='null'::jsonb then 1 else 0 end,
    (case split_part(value->>'path','/',1)
      when 'teams' then 1 when 'venues' then 2 when 'athletes' then 3
      when 'meets' then 4 when 'relay_results' then 5 when 'swims' then 6 else 7 end)
     * case when value->'after'='null'::jsonb then -1 else 1 end,
    position
  loop
   if split_part(r->>'path','/',1) in ('swims','relay_results') and r->'after'<>'null'::jsonb then
    if r#>>'{after,meet,id}' is not null and not exists(select 1 from public.meets where id=r#>>'{after,meet,id}') then
     raise exception 'Approve the meet batch for % before approving swim %. If no meet batch exists, collect the missing meet first.', r#>>'{after,meet,id}', r->>'path' using errcode='23503';
    end if;
    if r#>>'{after,athleteId}' is not null and not exists(select 1 from public.athletes where id=r#>>'{after,athleteId}') then
     raise exception 'Approve the athlete batch for % before approving swim %.', r#>>'{after,athleteId}', r->>'path' using errcode='23503';
    end if;
   end if;
   begin
    perform private.put_record(r->>'path',nullif(r->'after','null'::jsonb));
   exception when foreign_key_violation then
    raise exception 'Cannot approve record %: a referenced record is missing or still in use. Approve its prerequisite batch first, then refresh the queue.', r->>'path' using errcode='23503',detail=sqlerrm;
   end;
  end loop;
  perform set_config('velocity.defer_bests','false',true);
  if b.division='times' and not details_only and exists(select 1 from jsonb_array_elements(b.writes) w where split_part(w->>'path','/',1) not in ('relay_results','standards')) then
   if not exists(select 1 from jsonb_array_elements(b.writes) w where split_part(w->>'path','/',1) not in ('swims','relay_results')) then
    select array_agg(distinct event_code) into affected_events from (
     select w#>>'{after,eventCode}' event_code from jsonb_array_elements(b.writes) w where split_part(w->>'path','/',1)='swims'
     union all select rd#>>'{before,eventCode}' from jsonb_array_elements(b.reads) rd where split_part(rd->>'path','/',1)='swims'
    ) events where event_code is not null;
   end if;
   if coalesce(cardinality(affected_events),0)>0 then
    perform private.rebuild_bests_for_events(affected_events);
   else perform private.rebuild_bests(); end if;
  end if;
 end if;
 update public.collection_batches set status=decision,reviewed_by=auth.uid(),reviewed_at=now(),review_note=note where id=batch_id;
 insert into public.collection_reviews(batch_id,decision,reviewer_id,note) values(batch_id,decision,auth.uid(),note);
end; $function$;

-- A page is read under the canonical write lock. Subsequent pages must name the
-- same revision; clients discard the whole artifact on any mismatch.
create function public.private_race_baseline_page(collection_name text default null, after_id text default null, page_size integer default 100, expected_revision text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rev bigint; counts jsonb; rows jsonb; last_id text; total bigint; statement text;
begin
 if not private.is_staff() then raise insufficient_privilege using message='Verified staff access required'; end if;
 if page_size is null or page_size not between 1 and 500 or length(coalesce(after_id,''))>1200 then raise exception 'Invalid export page' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtext('velocity-records'));
 select revision into rev from private.canonical_revision where singleton;
 if expected_revision is not null and (expected_revision !~ '^[0-9]+$' or expected_revision::numeric<>rev) then
  raise exception 'Canonical data changed during export. Discard these pages and start again.' using errcode='40001'; end if;
 if collection_name is null then
 counts:=jsonb_build_object('teams',(select count(*) from public.teams),'meets',(select count(*) from public.meets),
  'athletes',(select count(*) from public.athletes),'swims',(select count(*) from public.swims),'relay_results',(select count(*) from public.relay_results),
  'catalog',(select count(*) from public.knowledge_entries where data->>'kind'='meet'),
  'athlete_identities',(select count(*) from private.athlete_source_identities),'result_occurrences',(select count(*) from private.result_occurrences),
  'result_sources',(select count(*) from private.result_source_identities));
  return jsonb_build_object('version',1,'revision',rev::text,'capturedAt',clock_timestamp(),'counts',counts);
 end if;
 if expected_revision is null or not collection_name=any(array['teams','meets','athletes','swims','relay_results','catalog','athlete_identities','result_occurrences','result_sources']) then raise exception 'A known collection and export revision are required' using errcode='22023'; end if;
 if collection_name=any(array['teams','meets','athletes','swims','relay_results']) then
  statement:=format('select id,private.collection_snapshot(%L||''/''||id) data from public.%I',collection_name,collection_name);
 elsif collection_name='catalog' then statement:='select id,data from public.knowledge_entries where data->>''kind''=''meet''';
 elsif collection_name='athlete_identities' then
  statement:='select jsonb_build_array(namespace,source_id)::text id,jsonb_build_object(''namespace'',namespace,''sourceId'',source_id,''athleteId'',athlete_id,''evidence'',evidence) data from private.athlete_source_identities';
 elsif collection_name='result_occurrences' then
  statement:='select id::text,jsonb_build_object(''kind'',kind,''resultId'',result_id,''baseKey'',base_key,''occurrence'',occurrence,''evidence'',evidence) data from private.result_occurrences';
 else
  statement:='select jsonb_build_array(kind,namespace,source_id)::text id,jsonb_build_object(''kind'',kind,''namespace'',namespace,''sourceId'',source_id,''occurrenceId'',occurrence_id,''evidence'',evidence) data from private.result_source_identities';
 end if;
 statement:='select coalesce(jsonb_agg(to_jsonb(page) order by id),''[]''::jsonb),max(id),count(*) from ('||
  'select id,data from ('||statement||') raw where ($1 is null or id>$1) order by id limit $2) page';
 execute statement into rows,last_id,total using after_id,page_size;
 if pg_column_size(rows)>4194304 then raise exception 'Export page is too large; request fewer rows' using errcode='54000'; end if;
 return jsonb_build_object('version',1,'revision',rev::text,'collection',collection_name,'rows',rows,
  'nextAfter',case when total=page_size then last_id end);
end; $$;
revoke all on function public.private_race_baseline_page(text,text,integer,text) from public,anon,service_role;
grant execute on function public.private_race_baseline_page(text,text,integer,text) to authenticated;

notify pgrst, 'reload schema';

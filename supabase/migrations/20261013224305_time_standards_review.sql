-- Validate new standards without rewriting existing editions.
create or replace function private.validate_standard(body jsonb, rid text)
returns void language plpgsql set search_path = '' as $$
declare field text; c record; g record; a record; e record; t jsonb; seen text[]; n integer:=0;
begin
 if jsonb_typeof(body) is distinct from 'object' then raise exception 'Standard must be an object'; end if;
 foreach field in array array['id','name','governingBody','seasonYears','effectiveDate','expirationDate','sourceUrl'] loop
  if jsonb_typeof(body->field) is distinct from 'string' or length(trim(body->>field))=0 then raise exception 'Standard requires %',field; end if;
 end loop;
 if body->>'id' is distinct from rid or coalesce(body->>'category','') not in ('motivational','championship') then raise exception 'Invalid standard identity/category'; end if;
 if body->>'sourceUrl' !~ '^https?://[^[:space:]]+$' then raise exception 'Official source URL required'; end if;
 foreach field in array array['effectiveDate','expirationDate'] loop
  if body->>field !~ '^\d{4}-\d{2}-\d{2}$' or to_char((body->>field)::date,'YYYY-MM-DD')<>body->>field then raise exception 'Invalid standard date'; end if;
 end loop;
 if (body->>'effectiveDate')::date>(body->>'expirationDate')::date then raise exception 'Standard dates reversed'; end if;
 if jsonb_typeof(body->'cuts') is distinct from 'object' then raise exception 'Cut matrix required'; end if;
 for c in select * from jsonb_each(body->'cuts') loop
  if c.key not in ('SCY','LCM','SCM') or jsonb_typeof(c.value)<>'object' then raise exception 'Invalid standard course'; end if;
  for g in select * from jsonb_each(c.value) loop
   if g.key not in ('F','M','Mixed') or jsonb_typeof(g.value)<>'object' then raise exception 'Invalid standard gender'; end if;
   for a in select * from jsonb_each(g.value) loop
    if length(trim(a.key))=0 or jsonb_typeof(a.value)<>'object' then raise exception 'Invalid age group'; end if;
    for e in select * from jsonb_each(a.value) loop
     if e.key !~ ('^[1-9][0-9]*_(FR|BK|BR|FL|IM|FR-R|MED-R)_'||c.key||'$') then raise exception 'Event and course must match'; end if;
     if jsonb_typeof(e.value->'cutsByTier') is distinct from 'array' then raise exception 'Event requires cutsByTier'; end if;
     if jsonb_array_length(e.value->'cutsByTier')=0 then raise exception 'Event requires cuts'; end if;
     seen:='{}';
     for t in select * from jsonb_array_elements(e.value->'cutsByTier') loop
      if jsonb_typeof(t->'tierName') is distinct from 'string' or length(trim(t->>'tierName'))=0 or t->>'tierName'=any(seen) then raise exception 'Invalid or duplicate tier'; end if;
      seen:=array_append(seen,t->>'tierName');
      if jsonb_typeof(t->'timeMs') is distinct from 'number' then raise exception 'Invalid cut time'; end if;
      if (t->>'timeMs')::numeric<=0 or (t->>'timeMs')::numeric>2147483647 or trunc((t->>'timeMs')::numeric)<>(t->>'timeMs')::numeric then raise exception 'Cut requires positive integer milliseconds'; end if;
      n:=n+1;
     end loop;
    end loop;
   end loop;
  end loop;
 end loop;
 if n=0 then raise exception 'Standard requires cuts'; end if;
end; $$;
revoke all on function private.validate_standard(jsonb,text) from public, anon, authenticated;
create or replace function private.check_standard() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.validate_standard(new.data,new.id); return new; end; $$;
revoke all on function private.check_standard() from public, anon, authenticated;
drop trigger if exists validate_standard on public.standards;
create trigger validate_standard before insert or update on public.standards for each row execute function private.check_standard();

-- Keep collector authorization, baseline checks and deduplication intact.
CREATE OR REPLACE FUNCTION private.stage_collection (
  worker_token text,
  batch        jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare worker private.collection_workers; w jsonb; supplied_read jsonb; root text; snapshots jsonb:='[]'; current_data jsonb; bid uuid; fp text; paths text[]:='{}';
begin
 select * into worker from private.collection_workers where token_hash=encode(extensions.digest(worker_token,'sha256'),'hex') and revoked_at is null;
 if worker.id is null or not coalesce(batch->>'division'=any(worker.divisions),false) then raise insufficient_privilege using message='Collector access denied'; end if;
 if pg_column_size(batch)>2097152 or jsonb_typeof(batch->'writes') is distinct from 'array'
  or jsonb_array_length(batch->'writes') not between 1 and 100 or batch->'evidence' is null or batch->'evidence'='null' then raise exception 'Batch requires evidence and 1–100 proposed records (maximum 2 MB)'; end if;
 perform pg_advisory_xact_lock(hashtext('velocity-records'));
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
 fp:=encode(extensions.digest(jsonb_build_object('division',batch->>'division','url',batch->>'sourceUrl','writes',batch->'writes','reads',snapshots)::text,'sha256'),'hex');
 insert into public.collection_batches(division,scope,source_url,captured_at,coverage,evidence,writes,reads,fingerprint,worker_id)
 values(batch->>'division',batch->>'scope',batch->>'sourceUrl',(batch->>'capturedAt')::timestamptz,batch->>'coverage',batch->'evidence',batch->'writes',snapshots,fp,worker.id)
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

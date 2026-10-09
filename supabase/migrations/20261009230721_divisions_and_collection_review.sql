SET local check_function_bodies = off;

ALTER TABLE "public"."swims"
  DROP CONSTRAINT "swims_check";

CREATE TABLE "private"."collection_workers" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"       text                     NOT NULL,
  "token_hash" text                     NOT NULL,
  "divisions"  text[]                   NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "collection_workers_pkey" PRIMARY KEY (id),
  CONSTRAINT "collection_workers_token_hash_key" UNIQUE (token_hash)
);

ALTER TABLE "private"."collection_workers"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."collection_batches" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "division"    text                     NOT NULL,
  "scope"       text                     NOT NULL,
  "source_url"  text                     NOT NULL,
  "captured_at" timestamp with time zone NOT NULL,
  "received_at" timestamp with time zone NOT NULL DEFAULT now(),
  "coverage"    text                     NOT NULL,
  "evidence"    jsonb                    NOT NULL,
  "writes"      jsonb                    NOT NULL,
  "reads"       jsonb                    NOT NULL,
  "fingerprint" text                     NOT NULL,
  "worker_id"   uuid                     NOT NULL,
  "status"      text                     NOT NULL DEFAULT 'pending'::text,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  CONSTRAINT "collection_batches_coverage_check" CHECK ((coverage = ANY (ARRAY['partial'::text, 'complete'::text]))),
  CONSTRAINT "collection_batches_division_check" CHECK ((division = ANY (ARRAY['workshare'::text, 'times'::text, 'knowledge'::text]))),
  CONSTRAINT "collection_batches_fingerprint_key" UNIQUE (fingerprint),
  CONSTRAINT "collection_batches_pkey" PRIMARY KEY (id),
  CONSTRAINT "collection_batches_scope_check" CHECK (((length(scope) >= 1) AND (length(scope) <= 2000))),
  CONSTRAINT "collection_batches_source_url_check" CHECK ((source_url ~ '^https://'::text)),
  CONSTRAINT "collection_batches_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'held'::text, 'approved'::text, 'declined'::text])))
);

ALTER TABLE "public"."collection_batches"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."collection_batches" FROM "anon";

CREATE TABLE "public"."collection_reviews" (
  "id"          bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "batch_id"    uuid                     NOT NULL,
  "decision"    text                     NOT NULL,
  "reviewer_id" uuid                     NOT NULL,
  "reviewed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "note"        text,
  CONSTRAINT "collection_reviews_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."collection_reviews"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."collection_reviews" FROM "anon";

CREATE TABLE "public"."knowledge_entries" (
  "id"              text                     NOT NULL,
  "data"            jsonb                    NOT NULL,
  "starts_on"       date,
  "ends_on"         date,
  "effective_from"  date,
  "effective_until" date,
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "knowledge_entries_check1" CHECK (((effective_until IS NULL) OR (effective_from IS NULL) OR (effective_until >= effective_from))),
  CONSTRAINT "knowledge_entries_check" CHECK (((ends_on IS NULL) OR (starts_on IS NULL) OR (ends_on >= starts_on))),
  CONSTRAINT "knowledge_entries_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."knowledge_entries"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."public_swims" (
  "id"         text  NOT NULL,
  "athlete_id" text  NOT NULL,
  "swim_date"  text  NOT NULL,
  "data"       jsonb NOT NULL,
  CONSTRAINT "public_swims_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."public_swims"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."workshare_members" (
  "id"         text                     NOT NULL,
  "family_id"  text                     NOT NULL,
  "name"       text                     NOT NULL,
  "group_name" text                     NOT NULL DEFAULT 'No Assignment'::text,
  "source_ids" jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workshare_members_name_check" CHECK ((length(TRIM(BOTH FROM name)) > 0)),
  CONSTRAINT "workshare_members_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."workshare_members"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."workshare_members" FROM "anon";

ALTER TABLE "public"."knowledge_entries"
  ADD COLUMN "kind" text GENERATED ALWAYS AS ((DATA ->> 'kind'::text)) STORED NOT NULL;

ALTER TABLE "public"."knowledge_entries"
  ADD COLUMN "title" text GENERATED ALWAYS AS ((DATA ->> 'title'::text)) STORED NOT NULL;

ALTER TABLE "public"."knowledge_entries"
  ADD COLUMN "parent_id" text GENERATED ALWAYS AS ((DATA ->> 'parentId'::text)) STORED;

ALTER TABLE "public"."knowledge_entries"
  ADD COLUMN "source_url" text GENERATED ALWAYS AS ((DATA ->> 'sourceUrl'::text)) STORED NOT NULL;

CREATE OR REPLACE FUNCTION private.collection_snapshot (
  record_path text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
 select case when starts_with(record_path,'families/') then
  (select f.data || jsonb_build_object('authorizedEmails',coalesce((select jsonb_agg(email order by email) from public.family_emails where family_id=f.id),'[]'::jsonb),
   'children',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'group',group_name) order by name) from public.workshare_members where family_id=f.id),'[]'::jsonb))
   from public.families f where f.id=split_part(record_path,'/',2))
 when starts_with(record_path,'knowledge_entries/') then (select data from public.knowledge_entries where id=split_part(record_path,'/',2))
 else (select data from public.app_records where path=record_path) end;
$function$;

CREATE OR REPLACE FUNCTION private.family_snapshot (
  fid  text,
  body jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select case when private.is_staff() or private.is_family(fid) or (select auth.jwt()->>'role')='service_role' then body || jsonb_build_object(
 'authorizedEmails',coalesce((select jsonb_agg(email order by email) from public.family_emails where family_id=fid),'[]'::jsonb),
 'children',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'group',group_name) order by name) from public.workshare_members where family_id=fid),'[]'::jsonb)) else null end;
$function$;

CREATE OR REPLACE FUNCTION private.publish_swim()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 insert into public.public_swims(id,athlete_id,swim_date,data) values(new.id,new.athlete_id,new.data#>>'{meet,date}',
  jsonb_build_object('id',new.id,'athleteId',new.athlete_id,'eventCode',new.event_code,'course',new.course,
   'timeMs',new.time_ms,'timeDisplay',case when new.time_ms>0 then private.format_time(new.time_ms) else new.status end,
   'status',new.status,'round',new.round,'isRelay',new.is_relay,'isOfficial',new.is_official,
   'teamId',new.data->>'teamId','meet',jsonb_build_object('id',new.meet_id,'name',new.data#>>'{meet,name}','date',new.data#>>'{meet,date}')))
 on conflict(id) do update set athlete_id=excluded.athlete_id,swim_date=excluded.swim_date,data=excluded.data;
 return new;
end; $function$;

CREATE OR REPLACE FUNCTION private.put_legacy_record (
  record_path text,
  body        jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare root text:=split_part(record_path,'/',1); rid text:=split_part(record_path,'/',2); pid text; gid text; item jsonb; current_family jsonb; tab text;
begin
 if record_path !~ '^[a-z_]+/[a-zA-Z0-9_-]+(/[a-z_]+/[a-zA-Z0-9_-]+)?$' then raise exception 'Invalid record path'; end if;
 if root=any(array['teams','people','athletes','families','venues','meets','swims','standards','practice_sessions','attendance','postings','registrations','manual_hours','work_descriptions','documents','public_athletes']) and array_length(string_to_array(record_path,'/'),1)=2 then
  if root='athletes' and body is not null then
   pid:=coalesce(body->>'personId','person_'||rid); gid:=coalesce(body#>>'{currentGroup,id}','unassigned');
   insert into public.training_groups(id,name) values(gid,coalesce(body#>>'{currentGroup,name}','No Assignment')) on conflict(id) do update set name=excluded.name;
   insert into public.people(id,data) values(pid,jsonb_build_object('name',trim((body#>>'{name,first}')||' '||(body#>>'{name,last}')),'structuredName',body->'name','athleteId',rid,'teamId',body->>'teamId')) on conflict(id) do update set data=public.people.data||excluded.data;
   insert into public.athletes(id,data,person_id,group_id) values(rid,body-'name',pid,gid) on conflict(id) do update set data=excluded.data,person_id=excluded.person_id,group_id=excluded.group_id;
   insert into public.public_athletes(id,data) values(rid,jsonb_strip_nulls(jsonb_build_object('id',rid,'name',body->'name','aliases',coalesce(body->'aliases','[]'::jsonb),'swimcloudId',body->'swimcloudId'))) on conflict(id) do update set data=excluded.data;
   return;
  elsif root='families' and body is not null then
   insert into public.families(id,data) values(rid,body-array['children','authorizedEmails']) on conflict(id) do update set data=excluded.data;
   delete from public.family_emails where family_id=rid;
   insert into public.family_emails select rid,lower(trim(value)) from jsonb_array_elements_text(coalesce(body->'authorizedEmails','[]'::jsonb)) on conflict do nothing;
   delete from public.family_people where family_id=rid and relationship='child';
   for item in select * from jsonb_array_elements(coalesce(body->'children','[]'::jsonb)) loop
    -- A selected swimmer ID is the identity; name-only children are newly created.
    if item->>'id' is null then
     item:=item||jsonb_build_object('id','ath_'||gen_random_uuid()::text);
     perform private.put_record('athletes/'||(item->>'id'),jsonb_build_object('id',item->>'id','name',jsonb_build_object('first',split_part(item->>'name',' ',1),'last',substring(item->>'name' from position(' ' in item->>'name')+1)),'teamId','velocity-swimming','status','active','aliases',jsonb_build_array(item->>'name'),'currentGroup',jsonb_build_object('id',lower(regexp_replace(item->>'group','[^a-zA-Z0-9]+','_','g')),'name',item->>'group','assignedAt',now())));
    end if;
    select person_id into pid from public.athletes where id=item->>'id';
    if pid is null then raise exception 'Select an existing swimmer'; end if;
    insert into public.family_people values(rid,pid,'child') on conflict do nothing;
   end loop;
   return;
  elsif root='registrations' and body is not null and body->>'status'='Complete' then
   body:=body||jsonb_build_object('shiftSnapshot',coalesce((select data->'shiftSnapshot' from public.registrations where id=rid),body->'shiftSnapshot',(select data from public.postings where id=body->>'postingId')));
  elsif root='postings' then
   -- Preserve earned credit atomically, before changing or archiving a shift.
   update public.registrations set data=data||jsonb_build_object('shiftSnapshot',(select data from public.postings where id=rid)) where posting_id=rid and data->>'status'='Complete' and not(data?'shiftSnapshot');
  end if;
  if body is null then execute format('delete from public.%I where id=$1',root) using rid;
  else execute format('insert into public.%I(id,data) values($1,$2) on conflict(id) do update set data=excluded.data',root) using rid,body; end if;
 elsif root='athletes' and split_part(record_path,'/',3)='bests' then
  if body is null then delete from public.athlete_bests where athlete_id=rid and event_code=split_part(record_path,'/',4);
  else insert into public.athlete_bests values(rid,split_part(record_path,'/',4),body) on conflict(athlete_id,event_code) do update set data=excluded.data; end if;
 elsif root=any(array['sources','source_bindings','record_provenance','import_batches','import_review_items','import_state','roster_metadata','events','analytics_snapshots','sync_requests']) then
  if record_path like 'sources/%/revisions/%' and body is not null and not exists(select 1 from storage.objects where bucket_id='evidence' and name=body->>'storagePath') then raise exception 'Upload evidence capture before revision'; end if;
  if (record_path like 'sources/%/checks/%' or record_path like 'sources/%/revisions/%' or record_path like 'record_provenance/%/events/%') and exists(select 1 from public.evidence_records where path=record_path) then raise exception 'Evidence history is immutable'; end if;
  if body is null then
   if root in ('sources','record_provenance') then raise exception 'Evidence is immutable'; end if;
   delete from public.evidence_records where path=record_path;
  else insert into public.evidence_records values(record_path,body) on conflict(path) do update set data=excluded.data; end if;
 else raise exception 'Unregistered record'; end if;
end; $function$;

CREATE OR REPLACE FUNCTION private.put_record (
  record_path text,
  body        jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare rid text:=split_part(record_path,'/',2); child jsonb; mid text; kept text[]:='{}';
begin
 if record_path !~ '^[a-z_]+/[a-zA-Z0-9_-]+(/[a-z_]+/[a-zA-Z0-9_-]+)?$' then raise exception 'Invalid record path'; end if;
 if record_path='families/'||rid and body is not null then
  insert into public.families(id,data) values(rid,body-array['children','authorizedEmails']) on conflict(id) do update set data=excluded.data;
  delete from public.family_emails where family_id=rid;
  insert into public.family_emails select rid,lower(trim(value)) from jsonb_array_elements_text(coalesce(body->'authorizedEmails','[]')) on conflict do nothing;
  for child in select * from jsonb_array_elements(coalesce(body->'children','[]')) loop
   mid:=coalesce(nullif(child->>'id',''),'member_'||gen_random_uuid()::text);
   if exists(select 1 from public.workshare_members where id=mid and family_id<>rid) then raise exception 'Member belongs to another household'; end if;
   if mid=any(kept) then raise exception 'Duplicate household member'; end if;
   insert into public.workshare_members(id,family_id,name,group_name) values(mid,rid,child->>'name',coalesce(child->>'group','No Assignment'))
    on conflict(id) do update set name=excluded.name,group_name=excluded.group_name,updated_at=now();
   kept:=array_append(kept,mid);
  end loop;
  delete from public.workshare_members where family_id=rid and not(id=any(kept));
 elsif record_path='knowledge_entries/'||rid then
  if body is null then delete from public.knowledge_entries where id=rid;
  else insert into public.knowledge_entries(id,data,starts_on,ends_on,effective_from,effective_until)
   values(rid,body,(body->>'startsOn')::date,(body->>'endsOn')::date,(body->>'effectiveFrom')::date,(body->>'effectiveUntil')::date)
   on conflict(id) do update set data=excluded.data,starts_on=excluded.starts_on,ends_on=excluded.ends_on,
    effective_from=excluded.effective_from,effective_until=excluded.effective_until,updated_at=now(); end if;
 else perform private.put_legacy_record(record_path,body); end if;
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
declare b public.collection_batches; r jsonb; actual jsonb;
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
  perform set_config('velocity.defer_bests','true',true);
  for r in select * from jsonb_array_elements(b.writes) loop perform private.put_record(r->>'path',r->'after'); end loop;
  perform set_config('velocity.defer_bests','false',true);
  if b.division='times' then perform private.rebuild_bests(); end if;
 end if;
 update public.collection_batches set status=decision,reviewed_by=auth.uid(),reviewed_at=now(),review_note=note where id=batch_id;
 insert into public.collection_reviews(batch_id,decision,reviewer_id,note) values(batch_id,decision,auth.uid(),note);
end; $function$;

CREATE OR REPLACE FUNCTION private.stage_collection (
  worker_token text,
  batch        jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare worker private.collection_workers; w jsonb; root text; snapshots jsonb:='[]'; current_data jsonb; bid uuid; fp text; paths text[]:='{}';
begin
 select * into worker from private.collection_workers where token_hash=encode(extensions.digest(worker_token,'sha256'),'hex') and revoked_at is null;
 if worker.id is null or not coalesce(batch->>'division'=any(worker.divisions),false) then raise insufficient_privilege using message='Collector access denied'; end if;
 if pg_column_size(batch)>2097152 or jsonb_typeof(batch->'writes') is distinct from 'array'
  or jsonb_array_length(batch->'writes') not between 1 and 100 or batch->'evidence' is null or batch->'evidence'='null' then raise exception 'Batch requires evidence and 1–100 proposed records (maximum 2 MB)'; end if;
 perform pg_advisory_xact_lock(hashtext('velocity-records'));
 for w in select * from jsonb_array_elements(batch->'writes') loop
  root:=split_part(w->>'path','/',1);
  if w->>'path' is null or w->>'path' !~ '^[a-z_]+/[a-zA-Z0-9_-]+$' or w->>'path'=any(paths)
   or jsonb_typeof(w->'after') is distinct from 'object' then raise exception 'Each proposal requires a unique record path and object; removals require manual review'; end if;
  if not ((batch->>'division'='workshare' and root='families')
    or (batch->>'division'='times' and root=any(array['athletes','swims','meets','teams','venues']))
    or (batch->>'division'='knowledge' and root='knowledge_entries')) then raise exception 'Record outside collection division'; end if;
  paths:=array_append(paths,w->>'path');
  current_data:=private.collection_snapshot(w->>'path');
  snapshots:=snapshots||jsonb_build_array(jsonb_build_object('path',w->>'path','before',current_data));
 end loop;
 fp:=encode(extensions.digest(jsonb_build_object('division',batch->>'division','url',batch->>'sourceUrl','writes',batch->'writes','reads',snapshots)::text,'sha256'),'hex');
 insert into public.collection_batches(division,scope,source_url,captured_at,coverage,evidence,writes,reads,fingerprint,worker_id)
 values(batch->>'division',batch->>'scope',batch->>'sourceUrl',(batch->>'capturedAt')::timestamptz,batch->>'coverage',batch->'evidence',batch->'writes',snapshots,fp,worker.id)
 on conflict(fingerprint) do nothing returning id into bid;
 if bid is null then select id into bid from public.collection_batches where fingerprint=fp; end if;
 return bid;
end; $function$;

CREATE OR REPLACE FUNCTION public.review_collection (
  batch_id uuid,
  decision text,
  note     text DEFAULT ''::text
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.review_collection(batch_id,decision,note); $function$;

REVOKE ALL ON FUNCTION "public"."review_collection"(uuid, text, text) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.stage_collection (
  worker_token text,
  batch        jsonb
)
  RETURNS uuid
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.stage_collection(worker_token,batch); $function$;

ALTER TABLE "public"."collection_batches"
  ADD CONSTRAINT "collection_batches_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);

ALTER TABLE "public"."collection_batches"
  ADD CONSTRAINT "collection_batches_worker_id_fkey" FOREIGN KEY (worker_id) REFERENCES private.collection_workers(id);

ALTER TABLE "public"."collection_reviews"
  ADD CONSTRAINT "collection_reviews_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES public.collection_batches(id);

ALTER TABLE "public"."collection_reviews"
  ADD CONSTRAINT "collection_reviews_reviewer_id_fkey" FOREIGN KEY (reviewer_id) REFERENCES auth.users(id);

ALTER TABLE "public"."knowledge_entries"
  ADD CONSTRAINT "knowledge_entries_kind_check" CHECK ((kind = ANY (ARRAY['region'::text, 'zone'::text, 'lsc'::text, 'team'::text, 'venue'::text, 'meet'::text, 'document'::text])));

ALTER TABLE "public"."knowledge_entries"
  ADD CONSTRAINT "knowledge_entries_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES public.knowledge_entries(id);

ALTER TABLE "public"."knowledge_entries"
  ADD CONSTRAINT "knowledge_entries_source_url_check" CHECK ((source_url ~ '^https://'::text));

ALTER TABLE "public"."knowledge_entries"
  ADD CONSTRAINT "knowledge_entries_title_check" CHECK ((length(TRIM(BOTH FROM title)) > 0));

ALTER TABLE "public"."public_swims"
  ADD CONSTRAINT "public_swims_athlete_id_fkey" FOREIGN KEY (athlete_id) REFERENCES public.public_athletes(id);

ALTER TABLE "public"."public_swims"
  ADD CONSTRAINT "public_swims_id_fkey" FOREIGN KEY (id) REFERENCES public.swims(id) ON DELETE CASCADE;

ALTER TABLE "public"."swims"
  ADD CONSTRAINT "swims_check" CHECK (((status <> 'OK'::text) OR ((time_ms IS NOT NULL) AND (time_ms > 0))));

ALTER TABLE "public"."workshare_members"
  ADD CONSTRAINT "workshare_members_family_id_fkey" FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;

CREATE INDEX collection_batches_queue_idx ON public.collection_batches USING btree (status, received_at DESC);

CREATE INDEX collection_batches_reviewer_idx ON public.collection_batches USING btree (reviewed_by);

CREATE INDEX collection_batches_worker_idx ON public.collection_batches USING btree (worker_id);

CREATE INDEX collection_reviews_batch_idx ON public.collection_reviews USING btree (batch_id);

CREATE INDEX collection_reviews_reviewer_idx ON public.collection_reviews USING btree (reviewer_id);

CREATE INDEX knowledge_kind_dates_idx ON public.knowledge_entries USING btree (kind, starts_on);

CREATE INDEX knowledge_parent_idx ON public.knowledge_entries USING btree (parent_id);

CREATE INDEX public_swims_athlete_date_idx ON public.public_swims USING btree (athlete_id, swim_date DESC, id);

CREATE UNIQUE INDEX swims_external_result_idx ON public.swims USING btree (((DATA #>> '{externalResult,namespace}'::text[])), ((DATA #>> '{externalResult,id}'::text[])))
  WHERE (((DATA #>> '{externalResult,namespace}'::text[]) IS NOT NULL) AND ((DATA #>> '{externalResult,id}'::text[]) IS NOT NULL));

CREATE INDEX workshare_members_family_idx ON public.workshare_members USING btree (family_id);

CREATE TRIGGER publish_swim
  AFTER INSERT OR UPDATE ON public.swims
  FOR EACH ROW
  EXECUTE FUNCTION private.publish_swim();

CREATE POLICY "staff_read" ON "public"."collection_batches"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT private.is_staff() AS is_staff));

CREATE POLICY "staff_read" ON "public"."collection_reviews"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT private.is_staff() AS is_staff));

CREATE POLICY "public_read" ON "public"."knowledge_entries"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

CREATE POLICY "public_read" ON "public"."public_swims"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

CREATE POLICY "family_read" ON "public"."workshare_members"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT private.is_staff() AS is_staff) OR private.is_family(family_id)));

CREATE POLICY "evidence_read" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'evidence'::text) AND ( SELECT private.is_staff() AS is_staff)));

REVOKE ALL ON FUNCTION "private"."collection_snapshot"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."collection_snapshot"(text) TO "postgres";

REVOKE ALL ON FUNCTION "private"."publish_swim"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."publish_swim"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."put_legacy_record"(text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."put_legacy_record"(text, jsonb) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "private"."review_collection"(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."review_collection"(uuid, text, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."stage_collection"(text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."stage_collection"(text, jsonb) TO "anon", "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."review_collection"(uuid, text, text) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."stage_collection"(text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."stage_collection"(text, jsonb) TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."collection_workers" TO "postgres";

REVOKE ALL ON TABLE "public"."collection_batches" FROM "authenticated";

GRANT SELECT ON TABLE "public"."collection_batches" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."collection_batches" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."collection_reviews" FROM "authenticated";

GRANT SELECT ON TABLE "public"."collection_reviews" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."collection_reviews" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."knowledge_entries" FROM "anon";

GRANT SELECT ON TABLE "public"."knowledge_entries" TO "anon";

REVOKE ALL ON TABLE "public"."knowledge_entries" FROM "authenticated";

GRANT SELECT ON TABLE "public"."knowledge_entries" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."knowledge_entries" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."public_swims" FROM "anon";

GRANT SELECT ON TABLE "public"."public_swims" TO "anon";

REVOKE ALL ON TABLE "public"."public_swims" FROM "authenticated";

GRANT SELECT ON TABLE "public"."public_swims" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."public_swims" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."workshare_members" FROM "authenticated";

GRANT SELECT ON TABLE "public"."workshare_members" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workshare_members" TO "postgres", "service_role";


-- Data changes are not captured by the schema diff. Preserve existing households.
insert into public.workshare_members(id,family_id,name,group_name)
 select fp.family_id||'_'||a.id,fp.family_id,p.name,coalesce(g.name,'No Assignment')
 from public.family_people fp join public.people p on p.id=fp.person_id
 join public.athletes a on a.person_id=p.id left join public.training_groups g on g.id=a.group_id
 where fp.relationship='child' on conflict(id) do nothing;
insert into storage.buckets(id,name,public,file_size_limit)
 values('evidence','evidence',false,20971520) on conflict(id) do nothing;
update public.swims set data=data;

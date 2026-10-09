SET local check_function_bodies = off;

CREATE SCHEMA "private";

CREATE TABLE "private"."guest_invitations" (
  "id"              text                     NOT NULL,
  "family_id"       text                     NOT NULL,
  "posting_id"      text                     NOT NULL,
  "created_by"      uuid                     NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at"      timestamp with time zone NOT NULL,
  "revoked_at"      timestamp with time zone,
  "registration_id" text,
  CONSTRAINT "guest_invitations_pkey" PRIMARY KEY (id)
);

ALTER TABLE "private"."guest_invitations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."reminders" (
  "registration_id"  text                     NOT NULL,
  "reminder_date"    date                     NOT NULL,
  "sent_at"          timestamp with time zone,
  "lease_until"      timestamp with time zone,
  "first_attempt_at" timestamp with time zone,
  "attempts"         integer                  NOT NULL DEFAULT 0,
  "delivery_id"      text,
  "last_error"       text,
  CONSTRAINT "reminders_pkey" PRIMARY KEY (registration_id, reminder_date)
);

ALTER TABLE "private"."reminders"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."administrators" (
  "user_id" uuid NOT NULL,
  CONSTRAINT "administrators_pkey" PRIMARY KEY (user_id)
);

ALTER TABLE "public"."administrators"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."athlete_bests" (
  "athlete_id" text  NOT NULL,
  "event_code" text  NOT NULL,
  "data"       jsonb NOT NULL,
  CONSTRAINT "athlete_bests_pkey" PRIMARY KEY (athlete_id, event_code)
);

ALTER TABLE "public"."athlete_bests"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."athletes" (
  "id"        text  NOT NULL,
  "data"      jsonb NOT NULL,
  "person_id" text  NOT NULL,
  "group_id"  text,
  CONSTRAINT "athletes_person_id_key" UNIQUE (person_id),
  CONSTRAINT "athletes_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."athletes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."attendance" (
  "id"   text  NOT NULL,
  "data" jsonb NOT NULL,
  CONSTRAINT "attendance_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."attendance"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."documents" (
  "id"   text  NOT NULL,
  "data" jsonb NOT NULL,
  CONSTRAINT "documents_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."documents"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."evidence_records" (
  "path" text  NOT NULL,
  "data" jsonb NOT NULL,
  CONSTRAINT "evidence_records_pkey" PRIMARY KEY (path)
);

ALTER TABLE "public"."evidence_records"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."families" (
  "id"   text  NOT NULL,
  "data" jsonb NOT NULL,
  CONSTRAINT "families_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."families"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."family_emails" (
  "family_id" text NOT NULL,
  "email"     text NOT NULL,
  CONSTRAINT "family_emails_email_check" CHECK ((email = lower(TRIM(BOTH FROM email)))),
  CONSTRAINT "family_emails_pkey" PRIMARY KEY (family_id, email)
);

ALTER TABLE "public"."family_emails"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."family_people" (
  "family_id"    text NOT NULL,
  "person_id"    text NOT NULL,
  "relationship" text NOT NULL,
  CONSTRAINT "family_people_pkey" PRIMARY KEY (family_id, person_id)
);

ALTER TABLE "public"."family_people"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."manual_hours" (
  "id"   text  NOT NULL,
  "data" jsonb NOT NULL,
  CONSTRAINT "manual_hours_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."manual_hours"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."meets" (
  "id"   text  NOT NULL,
  "data" jsonb NOT NULL,
  CONSTRAINT "meets_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."meets"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."people" (
  "id"   text  NOT NULL,
  "data" jsonb NOT NULL,
  CONSTRAINT "people_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."people"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."postings" (
  "id"   text  NOT NULL,
  "data" jsonb NOT NULL,
  CONSTRAINT "postings_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."postings"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."practice_sessions" (
  "id"   text  NOT NULL,
  "data" jsonb NOT NULL,
  CONSTRAINT "practice_sessions_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."practice_sessions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."public_athletes" (
  "id"   text  NOT NULL,
  "data" jsonb NOT NULL,
  CONSTRAINT "public_athletes_data_check" CHECK (((data - ARRAY['id'::text, 'name'::text, 'aliases'::text, 'swimcloudId'::text]) = '{}'::jsonb)),
  CONSTRAINT "public_athletes_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."public_athletes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."registrations" (
  "id"   text  NOT NULL,
  "data" jsonb NOT NULL,
  CONSTRAINT "registrations_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."registrations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."standard_cuts" (
  "standard_id" text    NOT NULL,
  "course"      text    NOT NULL,
  "gender"      text    NOT NULL,
  "age_group"   text    NOT NULL,
  "event_code"  text    NOT NULL,
  "tier"        text    NOT NULL,
  "time_ms"     integer NOT NULL,
  CONSTRAINT "standard_cuts_pkey" PRIMARY KEY (standard_id, course, gender, age_group, event_code, tier),
  CONSTRAINT "standard_cuts_time_ms_check" CHECK ((time_ms > 0))
);

ALTER TABLE "public"."standard_cuts"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."standards" (
  "id"   text  NOT NULL,
  "data" jsonb NOT NULL,
  CONSTRAINT "standards_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."standards"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."swims" (
  "id"   text  NOT NULL,
  "data" jsonb NOT NULL,
  CONSTRAINT "swims_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."swims"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."teams" (
  "id"   text  NOT NULL,
  "data" jsonb NOT NULL,
  CONSTRAINT "teams_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."teams"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."training_groups" (
  "id"   text NOT NULL,
  "name" text NOT NULL,
  CONSTRAINT "training_groups_name_key" UNIQUE (name),
  CONSTRAINT "training_groups_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."training_groups"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."venues" (
  "id"   text  NOT NULL,
  "data" jsonb NOT NULL,
  CONSTRAINT "venues_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."venues"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."work_descriptions" (
  "id"   text  NOT NULL,
  "data" jsonb NOT NULL,
  CONSTRAINT "work_descriptions_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."work_descriptions"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."athletes"
  ADD COLUMN "team_id" text GENERATED ALWAYS AS ((DATA ->> 'teamId'::text)) STORED;

ALTER TABLE "public"."attendance"
  ADD COLUMN "athlete_id" text GENERATED ALWAYS AS ((DATA ->> 'athleteId'::text)) STORED;

ALTER TABLE "public"."attendance"
  ADD COLUMN "session_id" text GENERATED ALWAYS AS ((DATA ->> 'sessionId'::text)) STORED;

ALTER TABLE "public"."documents"
  ADD COLUMN "team_id" text GENERATED ALWAYS AS ((DATA ->> 'teamId'::text)) STORED;

ALTER TABLE "public"."documents"
  ADD COLUMN "meet_id" text GENERATED ALWAYS AS ((DATA ->> 'meetId'::text)) STORED;

ALTER TABLE "public"."documents"
  ADD COLUMN "person_id" text GENERATED ALWAYS AS ((DATA ->> 'personId'::text)) STORED;

ALTER TABLE "public"."documents"
  ADD COLUMN "athlete_id" text GENERATED ALWAYS AS ((DATA ->> 'athleteId'::text)) STORED;

ALTER TABLE "public"."documents"
  ADD COLUMN "venue_id" text GENERATED ALWAYS AS ((DATA ->> 'venueId'::text)) STORED;

ALTER TABLE "public"."evidence_records"
  ADD COLUMN "root" text GENERATED ALWAYS AS (split_part(path, '/'::text, 1)) STORED;

ALTER TABLE "public"."manual_hours"
  ADD COLUMN "family_id" text GENERATED ALWAYS AS ((DATA ->> 'familyId'::text)) STORED;

ALTER TABLE "public"."meets"
  ADD COLUMN "team_id" text GENERATED ALWAYS AS ((DATA ->> 'teamId'::text)) STORED;

ALTER TABLE "public"."meets"
  ADD COLUMN "host_team_id" text GENERATED ALWAYS AS ((DATA ->> 'hostTeamId'::text)) STORED;

ALTER TABLE "public"."meets"
  ADD COLUMN "venue_id" text GENERATED ALWAYS AS ((DATA ->> 'venueId'::text)) STORED;

ALTER TABLE "public"."people"
  ADD COLUMN "name" text GENERATED ALWAYS AS ((DATA ->> 'name'::text)) STORED;

ALTER TABLE "public"."people"
  ADD COLUMN "team_id" text GENERATED ALWAYS AS ((DATA ->> 'teamId'::text)) STORED;

ALTER TABLE "public"."postings"
  ADD COLUMN "meet_id" text GENERATED ALWAYS AS ((DATA ->> 'meetId'::text)) STORED;

ALTER TABLE "public"."registrations"
  ADD COLUMN "posting_id" text GENERATED ALWAYS AS ((DATA ->> 'postingId'::text)) STORED;

ALTER TABLE "public"."registrations"
  ADD COLUMN "family_id" text GENERATED ALWAYS AS ((DATA ->> 'familyId'::text)) STORED;

ALTER TABLE "public"."registrations"
  ADD COLUMN "assignee_key" text GENERATED ALWAYS AS (lower(TRIM(BOTH FROM (DATA #>> '{assignee,name}'::text[])))) STORED;

ALTER TABLE "public"."swims"
  ADD COLUMN "athlete_id" text GENERATED ALWAYS AS ((DATA ->> 'athleteId'::text)) STORED;

ALTER TABLE "public"."swims"
  ADD COLUMN "meet_id" text GENERATED ALWAYS AS ((DATA #>> '{meet,id}'::text[])) STORED;

ALTER TABLE "public"."swims"
  ADD COLUMN "event_code" text GENERATED ALWAYS AS ((DATA ->> 'eventCode'::text)) STORED;

ALTER TABLE "public"."swims"
  ADD COLUMN "time_ms" integer GENERATED ALWAYS AS (((DATA ->> 'timeMs'::text))::integer) STORED;

ALTER TABLE "public"."swims"
  ADD COLUMN "course" text GENERATED ALWAYS AS ((DATA ->> 'course'::text)) STORED;

ALTER TABLE "public"."swims"
  ADD COLUMN "status" text GENERATED ALWAYS AS ((DATA ->> 'status'::text)) STORED;

ALTER TABLE "public"."teams"
  ADD COLUMN "name" text GENERATED ALWAYS AS ((DATA ->> 'name'::text)) STORED;

ALTER TABLE "public"."venues"
  ADD COLUMN "team_id" text GENERATED ALWAYS AS ((DATA ->> 'teamId'::text)) STORED;

CREATE OR REPLACE FUNCTION private.athlete_snapshot (
  body jsonb,
  pid  text,
  gid  text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
 select body || jsonb_build_object('personId',pid,'name',coalesce(p.data->'structuredName',jsonb_build_object('first',split_part(p.name,' ',1),'last',substring(p.name from position(' ' in p.name)+1))),'currentGroup',coalesce(body->'currentGroup','{}'::jsonb)||jsonb_build_object('id',gid,'name',coalesce(g.name,'No Assignment'))) from public.people p left join public.training_groups g on g.id=gid where p.id=pid;
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
 select case when private.is_staff() or private.is_family(fid) or (select auth.jwt()->>'role')='service_role' then body || jsonb_build_object('authorizedEmails',coalesce((select jsonb_agg(email order by email) from public.family_emails where family_id=fid),'[]'::jsonb),'children',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',p.name,'group',coalesce(g.name,'No Assignment')) order by p.name) from public.family_people fp join public.people p on p.id=fp.person_id join public.athletes a on a.person_id=p.id left join public.training_groups g on g.id=a.group_id where fp.family_id=fid and fp.relationship='child'),'[]'::jsonb)) else null end;
$function$;

CREATE OR REPLACE FUNCTION private.invoke_shift_reminders()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare project_url text; api_key text; cron_secret text;
begin
 select decrypted_secret into project_url from vault.decrypted_secrets where name='velocity_project_url';
 select decrypted_secret into api_key from vault.decrypted_secrets where name='velocity_publishable_key';
 select decrypted_secret into cron_secret from vault.decrypted_secrets where name='velocity_reminder_secret';
 if project_url is null or api_key is null or cron_secret is null then return;end if;
 perform net.http_post(url:=project_url||'/functions/v1/shift-reminders',headers:=jsonb_build_object('Content-Type','application/json','apikey',api_key,'x-cron-secret',cron_secret),body:='{}'::jsonb);
end;$function$;

CREATE OR REPLACE FUNCTION private.is_family (
  fid text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select auth.uid() is not null and exists(select 1 from public.family_emails f join auth.users u on lower(u.email)=f.email where f.family_id=fid and u.id=auth.uid() and u.email_confirmed_at is not null);
$function$;

CREATE OR REPLACE FUNCTION private.is_staff()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select auth.uid() is not null and (exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null and lower(split_part(u.email,'@',2))='velocity-swimming.com') or exists(select 1 from public.administrators a where a.user_id=auth.uid()));
$function$;

CREATE OR REPLACE FUNCTION private.open_shift (
  pid text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$ declare body jsonb;begin select data into body from public.postings where id=pid for update;if body is null or body#>>'{positions,max}' is null or (body#>>'{positions,max}')::integer<1 or body->>'date' is null or coalesce((body->>'archived')::boolean,false) or body->>'status' is distinct from 'Open' or private.shift_cutoff(body)<=now() then raise exception 'This shift is unavailable';end if;return body;end;$function$;

CREATE OR REPLACE FUNCTION private.put_record (
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

CREATE OR REPLACE FUNCTION private.rebuild_bests()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 delete from public.athlete_bests where true;
 insert into public.athlete_bests(athlete_id,event_code,data)
 select b.athlete_id,b.event_code,jsonb_build_object('eventCode',b.event_code,'distance',b.data->'distance','stroke',b.data->'stroke','course',b.course,'gender',b.data->>'gender','bestTimeMs',b.time_ms,'bestTimeDisplay',b.data->>'timeDisplay','swimDate',b.data#>>'{meet,date}','meetName',b.data#>>'{meet,name}','swimId',b.id,'standard',coalesce(b.data#>>'{standardsTag,usasMotivational}',''),'ageWhenSwum',b.data->'ageAtSwim','clubRankAllTime',rank() over(partition by b.event_code,b.course,b.data->>'gender' order by b.time_ms),'clubRankActiveRoster',case when a.data->>'status'='active' then (select count(distinct faster.athlete_id)+1 from public.swims faster join public.athletes fa on fa.id=faster.athlete_id where faster.status='OK' and faster.event_code=b.event_code and faster.course=b.course and faster.data->>'gender'=b.data->>'gender' and faster.time_ms<b.time_ms and fa.data->>'status'='active' and coalesce(faster.data->>'isOfficial','true')='true' and (coalesce(faster.data->>'isRelay','false')='false' or faster.data#>>'{relay,isLeadOffFlatStart}'='true')) else null end)
 from (select distinct on(athlete_id,event_code) * from public.swims where status='OK' and coalesce(data->>'isOfficial','true')='true' and (coalesce(data->>'isRelay','false')='false' or data#>>'{relay,isLeadOffFlatStart}'='true') order by athlete_id,event_code,time_ms,data#>>'{meet,date}',id) b join public.athletes a on a.id=b.athlete_id;
 return;
end; $function$;

CREATE OR REPLACE FUNCTION private.refresh_bests()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$ begin if current_setting('velocity.defer_bests',true) is distinct from 'true' then perform private.rebuild_bests();end if;return null;end;$function$;

CREATE OR REPLACE FUNCTION private.refresh_cuts()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare c record;g record;a record;e record;t jsonb;
begin
 delete from public.standard_cuts where standard_id=new.id;
 for c in select * from jsonb_each(coalesce(new.data->'cuts','{}'::jsonb)) loop
  for g in select * from jsonb_each(c.value) loop
   for a in select * from jsonb_each(g.value) loop
    for e in select * from jsonb_each(a.value) loop
     for t in select * from jsonb_array_elements(e.value->'cutsByTier') loop
      insert into public.standard_cuts values(new.id,c.key,g.key,a.key,e.key,t->>'tierName',(t->>'timeMs')::integer);
     end loop;
    end loop;
   end loop;
  end loop;
 end loop;
 return new;
end; $function$;

CREATE OR REPLACE FUNCTION private.shift_cutoff (
  body jsonb
)
  RETURNS timestamp WITH time zone
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$ select coalesce((body->>'endTime')::timestamptz,(((body->>'date')::timestamptz at time zone 'America/Los_Angeles')::date+1)::timestamp at time zone 'America/Los_Angeles'); $function$;

CREATE OR REPLACE FUNCTION private.signup (
  fid      text,
  pid      text,
  assignee jsonb
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare body jsonb; rid text:=gen_random_uuid()::text;
begin
 body:=private.open_shift(pid);
 if assignee->>'name' is null or length(trim(assignee->>'name')) not between 1 and 161 then raise exception 'Enter a volunteer name';end if;
 if exists(select 1 from public.registrations where family_id=fid and posting_id=pid and assignee_key=lower(trim(regexp_replace(assignee->>'name','\s+',' ','g')))) then raise exception 'This volunteer is already registered';end if;
 if (select count(*) from public.registrations where posting_id=pid)>=(body#>>'{positions,max}')::integer then raise exception 'This shift is full';end if;
 insert into public.registrations(id,data) values(rid,jsonb_build_object('familyId',fid,'postingId',pid,'assignee',assignee||jsonb_build_object('name',trim(regexp_replace(assignee->>'name','\s+',' ','g'))),'status','Pending'));
 return rid;
end;$function$;

CREATE OR REPLACE FUNCTION public.claim_shift_reminders (
  dry_run boolean DEFAULT true
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare candidate record; result jsonb:='[]'::jsonb; target date:= (now() at time zone 'America/Los_Angeles')::date+2; claim boolean;
begin
 for candidate in select r.id, r.data as registration, p.data as posting, array_agg(f.email order by f.email) as emails
 from public.registrations r join public.postings p on p.id=r.posting_id join public.family_emails f on f.family_id=r.family_id
 where r.data->>'status'='Pending' and coalesce((p.data->>'archived')::boolean,false)=false and p.data->>'status'<>'Completed'
 and ((p.data->>'date')::timestamptz at time zone 'America/Los_Angeles')::date=target group by r.id,p.data
 loop
  claim:=dry_run;
  if not dry_run then
   insert into private.reminders(registration_id,reminder_date,lease_until,first_attempt_at,attempts) values(candidate.id,target,now()+interval '5 minutes',now(),1)
   on conflict(registration_id,reminder_date) do update set lease_until=excluded.lease_until,attempts=private.reminders.attempts+1
   where private.reminders.sent_at is null and private.reminders.lease_until<now() and private.reminders.first_attempt_at>now()-interval '23 hours';
   claim:=found;
  end if;
  if claim then result:=result||jsonb_build_array(jsonb_build_object('registrationId',candidate.id,'date',target,'emails',candidate.emails,'name',candidate.registration#>>'{assignee,name}','title',candidate.posting->>'title','when',coalesce(candidate.posting->>'startTime',candidate.posting->>'date'),'key','velocity-shift-'||candidate.id||'-'||target));end if;
 end loop;
 return result;
end;$function$;

CREATE OR REPLACE FUNCTION public.collect_records (
  reads  jsonb,
  writes jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$ declare r jsonb;current_data jsonb;begin
 perform pg_advisory_xact_lock(hashtext('velocity-records'));
 perform set_config('velocity.defer_bests','true',true);
 for r in select * from jsonb_array_elements(reads) loop select data into current_data from public.app_records where path=r->>'path';if coalesce(current_data,'null'::jsonb) is distinct from r->'before' then raise exception 'Source changed during collection' using errcode='40001';end if;end loop;
 for r in select * from jsonb_array_elements(writes) loop perform private.put_record(r->>'path',case when r->'after'='null'::jsonb then null else r->'after' end);end loop;
perform set_config('velocity.defer_bests','false',true);if exists(select 1 from jsonb_array_elements(writes) w where starts_with(w->>'path','swims/') or starts_with(w->>'path','athletes/')) then perform private.rebuild_bests();end if;end;$function$;

CREATE OR REPLACE FUNCTION public.commit_records (
  reads  jsonb,
  writes jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r jsonb; current_data jsonb;
begin
 if not private.is_staff() then raise insufficient_privilege using message='Verified staff access required'; end if;
 if jsonb_array_length(writes)>450 or jsonb_array_length(reads)>1000 then raise exception 'Transaction too large'; end if;
 perform pg_advisory_xact_lock(hashtext('velocity-records'));
 perform set_config('velocity.defer_bests','true',true);
 for r in select * from jsonb_array_elements(reads) loop
  select data into current_data from public.app_records where path=r->>'path';
  if coalesce(current_data,'null'::jsonb) is distinct from r->'before' then raise exception 'Record changed after review' using errcode='40001'; end if;
 end loop;
 for r in select * from jsonb_array_elements(writes) loop
  if not exists(select 1 from jsonb_array_elements(reads) reviewed where reviewed->>'path'=r->>'path') then raise exception 'Every write requires a reviewed snapshot';end if;
  if r->>'path' like 'sources/%' then raise insufficient_privilege using message='Sources require verified collector'; end if;
  perform private.put_record(r->>'path',case when r->'after'='null'::jsonb then null else r->'after' end);
 end loop;
perform set_config('velocity.defer_bests','false',true);
 if exists(select 1 from jsonb_array_elements(writes) w where starts_with(w->>'path','swims/') or starts_with(w->>'path','athletes/')) then perform private.rebuild_bests();end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.export_records (
  after_path text DEFAULT NULL::text
)
  RETURNS TABLE (
    path text,
    data jsonb
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$ select path,data from public.app_records where (after_path is null or path>after_path) order by path limit 1000; $function$;

CREATE OR REPLACE FUNCTION public.finish_shift_reminder (
  registration_id text,
  reminder_date   date,
  delivery_id     text DEFAULT NULL::text,
  failure         text DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
 update private.reminders set sent_at=case when failure is null then now() else null end,delivery_id=finish_shift_reminder.delivery_id,last_error=failure,lease_until=now()+interval '5 minutes'
 where private.reminders.registration_id=finish_shift_reminder.registration_id and private.reminders.reminder_date=finish_shift_reminder.reminder_date and sent_at is null;
$function$;

CREATE OR REPLACE FUNCTION public.is_staff()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$ select private.is_staff(); $function$;

CREATE OR REPLACE FUNCTION public.projection_counts()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$ select jsonb_build_object('totalBestsWritten',count(*),'athletesCount',count(distinct athlete_id)) from public.athlete_bests; $function$;

CREATE OR REPLACE FUNCTION public.query_records (
  collection_path text,
  filters         jsonb   DEFAULT '[]'::jsonb,
  after_id        text    DEFAULT NULL::text,
  page_size       integer DEFAULT 1000,
  record_id       text    DEFAULT NULL::text
)
  RETURNS TABLE (
    path text,
    data jsonb
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare f jsonb; field_path text[]; sql text; op text;
begin
 if collection_path !~ '^[a-z_]+(/[a-zA-Z0-9_-]+/[a-z_]+)?$' or page_size not between 1 and 1000 then raise exception 'Invalid record query'; end if;
 sql := format('select path,data from public.app_records where starts_with(path,%L) and array_length(string_to_array(path,''/''),1)=%s',collection_path||'/',array_length(string_to_array(collection_path,'/'),1)+1);
 if record_id is not null then sql := sql||format(' and path=%L',collection_path||'/'||record_id); end if;
 if after_id is not null then sql := sql||format(' and path>%L',collection_path||'/'||after_id); end if;
 for f in select * from jsonb_array_elements(filters) loop
  if (f->>'field') !~ '^[a-zA-Z_][a-zA-Z0-9_.]*$' then raise exception 'Invalid field'; end if;
  field_path := string_to_array(f->>'field','.'); op:=f->>'op';
  if op='==' then sql:=sql||format(' and data#>%L::text[]=%L::jsonb',field_path,f->'value');
  elsif op='array-contains' then sql:=sql||format(' and data#>%L::text[] @> %L::jsonb',field_path,jsonb_build_array(f->'value'));
  elsif op='in' then sql:=sql||format(' and data#>%L::text[] in (select value from jsonb_array_elements(%L::jsonb))',field_path,f->'value');
  elsif op in ('>=','<=','>','<') then sql:=sql||format(' and data#>%L::text[] %s %L::jsonb',field_path,op,f->'value');
  else raise exception 'Unsupported filter'; end if;
 end loop;
 return query execute sql||format(' order by path limit %s',page_size);
end; $function$;

CREATE OR REPLACE FUNCTION public.times_page (
  mode          text    DEFAULT 'bests'::text,
  event_filter  text    DEFAULT NULL::text,
  course_filter text    DEFAULT NULL::text,
  page_from     integer DEFAULT 0,
  page_size     integer DEFAULT 50
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare rows jsonb; total integer;
begin
 if page_from<0 or page_size not between 1 and 100 then raise exception 'Invalid pagination';end if;
 if mode='swims' then
  if not private.is_staff() then raise insufficient_privilege using message='Staff access required for full race history';end if;
  select count(*) into total from public.swims where (event_filter is null or event_code=event_filter) and (course_filter is null or course=course_filter);
  select coalesce(jsonb_agg(data),'[]'::jsonb) into rows from (select data from public.swims where (event_filter is null or event_code=event_filter) and (course_filter is null or course=course_filter) order by data#>>'{meet,date}' desc,id limit page_size offset page_from) r;
 else
  select count(*) into total from public.athlete_bests where (event_filter is null or event_code=event_filter) and (course_filter is null or data->>'course'=course_filter);
  select coalesce(jsonb_agg(data),'[]'::jsonb) into rows from (select b.data||jsonb_build_object('athleteId',b.athlete_id,'athleteName',p.data->'name') as data from public.athlete_bests b join public.public_athletes p on p.id=b.athlete_id where (event_filter is null or b.event_code=event_filter) and (course_filter is null or b.data->>'course'=course_filter) and (mode<>'records' or coalesce((b.data->>'clubRankAllTime')::integer,0)=1) order by b.event_code,(b.data->>'bestTimeMs')::integer,b.athlete_id limit page_size offset page_from) r;
 end if;
 return jsonb_build_object('rows',rows,'total',total,'offset',page_from,'pageSize',page_size);
end;$function$;

CREATE OR REPLACE FUNCTION public.workshare_action (
  operation text,
  input     jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare fid text:=input->>'familyId';pid text:=input->>'postingId'; token text; hash text; invite private.guest_invitations%rowtype; body jsonb; rid text; cutoff timestamptz; reg jsonb; result jsonb;
begin
 if jsonb_typeof(input)<>'object' or octet_length(input::text)>10000 then raise exception 'Invalid request';end if;
 perform pg_advisory_xact_lock(hashtext('velocity-records'));
 if operation in ('getGuestInvitation','redeemGuestInvitation') then
  token:=input->>'token';if token is null or token !~ '^[a-f0-9]{64}$' then raise exception 'This invitation is unavailable';end if;
  hash:=encode(extensions.digest(token,'sha256'),'hex');select * into invite from private.guest_invitations where id=hash for update;
  if invite.id is null then raise exception 'This invitation is unavailable';end if;
  if operation='redeemGuestInvitation' and invite.registration_id is not null then return jsonb_build_object('registrationId',invite.registration_id);end if;
  if invite.revoked_at is not null or invite.expires_at<=now() or invite.registration_id is not null then raise exception 'This invitation is unavailable';end if;
  body:=private.open_shift(invite.posting_id);
  if operation='getGuestInvitation' then
   return jsonb_build_object('familyName',coalesce((select data->>'accountName' from public.families where id=invite.family_id),'Your sponsoring family'),'expiresAt',extract(epoch from invite.expires_at)*1000,'shift',jsonb_build_object('title',body->>'title','type',body->>'type','date',extract(epoch from (body->>'date')::timestamptz)*1000,'startTime',extract(epoch from (body->>'startTime')::timestamptz)*1000,'endTime',extract(epoch from (body->>'endTime')::timestamptz)*1000,'description',body->>'description'));
  end if;
  if length(trim(input->>'firstName')) not between 1 and 80 or length(trim(input->>'lastName')) not between 1 and 80 or length(trim(input->>'relation')) not between 1 and 100 or input->>'firstName' is null or input->>'lastName' is null or input->>'relation' is null then raise exception 'Enter your name and relationship';end if;
  rid:=private.signup(invite.family_id,invite.posting_id,jsonb_build_object('name',trim(input->>'firstName')||' '||trim(input->>'lastName'),'isGuest',true,'relation',trim(input->>'relation')));
  update private.guest_invitations set registration_id=rid where id=invite.id;
  return jsonb_build_object('registrationId',rid);
 end if;
 if auth.uid() is null then raise insufficient_privilege using message='Please sign in';end if;
 if operation in ('revokeGuestInvitation','cancelShiftRegistration') then
  if operation='revokeGuestInvitation' then select * into invite from private.guest_invitations where id=input->>'invitationId';fid:=invite.family_id;
  else select data into reg from public.registrations where id=input->>'registrationId';if reg is null then return '{"success":true}'::jsonb;end if;fid:=reg->>'familyId';end if;
 end if;
 if not(private.is_staff() or private.is_family(fid)) then raise insufficient_privilege using message='You cannot manage this family';end if;
 if operation='createGuestInvitation' then
  body:=private.open_shift(pid);
  if (select count(*) from private.guest_invitations where created_by=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'You can create up to 20 invitations per hour';end if;
  token:=encode(extensions.gen_random_bytes(32),'hex');hash:=encode(extensions.digest(token,'sha256'),'hex');cutoff:=least(now()+interval '7 days',private.shift_cutoff(body));
  insert into private.guest_invitations(id,family_id,posting_id,created_by,expires_at) values(hash,fid,pid,auth.uid(),cutoff);
  return jsonb_build_object('token',token,'invitationId',hash,'expiresAt',extract(epoch from cutoff)*1000);
 elsif operation='registerForShift' then
  rid:=private.signup(fid,pid,jsonb_build_object('name',input->>'name','isGuest',false));return jsonb_build_object('registrationId',rid);
 elsif operation='listGuestInvitations' then
  select coalesce(jsonb_agg(jsonb_build_object('invitationId',i.id,'postingId',i.posting_id,'shiftTitle',p.data->>'title','createdAt',extract(epoch from i.created_at)*1000,'expiresAt',extract(epoch from i.expires_at)*1000,'status',case when i.registration_id is not null then 'Redeemed' when i.revoked_at is not null then 'Revoked' when i.expires_at<=now() then 'Expired' else 'Active' end) order by i.created_at desc),'[]'::jsonb) into result from private.guest_invitations i join public.postings p on p.id=i.posting_id where i.family_id=fid;
  return jsonb_build_object('invitations',result);
 elsif operation='revokeGuestInvitation' then
  if invite.registration_id is not null then raise exception 'This invitation has already been used';end if;
  update private.guest_invitations set revoked_at=coalesce(revoked_at,now()) where id=invite.id;return '{"success":true}'::jsonb;
 elsif operation='cancelShiftRegistration' then
  select data into body from public.postings where id=reg->>'postingId';
  if not private.is_staff() and (reg->>'status'<>'Pending' or body is null or private.shift_cutoff(body)-now()<interval '24 hours') then raise exception 'Contact an administrator to cancel this registration';end if;
  -- Keep the invitation receipt for lost-response retries after cancellation.
  delete from public.registrations where id=input->>'registrationId';return '{"success":true}'::jsonb;
 end if;
 raise exception 'Unsupported action';
end; $function$;

ALTER TABLE "private"."guest_invitations"
  ADD CONSTRAINT "guest_invitations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "public"."administrators"
  ADD CONSTRAINT "administrators_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."athlete_bests"
  ADD CONSTRAINT "athlete_bests_athlete_id_fkey" FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE CASCADE;

ALTER TABLE "public"."attendance"
  ADD CONSTRAINT "attendance_athlete_id_fkey" FOREIGN KEY (athlete_id) REFERENCES public.athletes(id);

ALTER TABLE "public"."attendance"
  ADD CONSTRAINT "attendance_athlete_id_session_id_key" UNIQUE (athlete_id, session_id);

ALTER TABLE "public"."documents"
  ADD CONSTRAINT "documents_athlete_id_fkey" FOREIGN KEY (athlete_id) REFERENCES public.athletes(id);

ALTER TABLE "private"."guest_invitations"
  ADD CONSTRAINT "guest_invitations_family_id_fkey" FOREIGN KEY (family_id) REFERENCES public.families(id);

ALTER TABLE "public"."family_emails"
  ADD CONSTRAINT "family_emails_family_id_fkey" FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;

ALTER TABLE "public"."family_people"
  ADD CONSTRAINT "family_people_family_id_fkey" FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;

ALTER TABLE "public"."manual_hours"
  ADD CONSTRAINT "manual_hours_family_id_fkey" FOREIGN KEY (family_id) REFERENCES public.families(id);

ALTER TABLE "public"."documents"
  ADD CONSTRAINT "documents_meet_id_fkey" FOREIGN KEY (meet_id) REFERENCES public.meets(id);

ALTER TABLE "public"."athletes"
  ADD CONSTRAINT "athletes_person_id_fkey" FOREIGN KEY (person_id) REFERENCES public.people(id);

ALTER TABLE "public"."documents"
  ADD CONSTRAINT "documents_person_id_fkey" FOREIGN KEY (person_id) REFERENCES public.people(id);

ALTER TABLE "public"."family_people"
  ADD CONSTRAINT "family_people_person_id_fkey" FOREIGN KEY (person_id) REFERENCES public.people(id);

ALTER TABLE "public"."postings"
  ADD CONSTRAINT "postings_meet_id_fkey" FOREIGN KEY (meet_id) REFERENCES public.meets(id);

ALTER TABLE "private"."guest_invitations"
  ADD CONSTRAINT "guest_invitations_posting_id_fkey" FOREIGN KEY (posting_id) REFERENCES public.postings(id);

ALTER TABLE "public"."attendance"
  ADD CONSTRAINT "attendance_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.practice_sessions(id);

ALTER TABLE "public"."public_athletes"
  ADD CONSTRAINT "public_athletes_id_fkey" FOREIGN KEY (id) REFERENCES public.athletes(id) ON DELETE CASCADE;

ALTER TABLE "public"."registrations"
  ADD CONSTRAINT "registrations_family_id_fkey" FOREIGN KEY (family_id) REFERENCES public.families(id);

ALTER TABLE "private"."reminders"
  ADD CONSTRAINT "reminders_registration_id_fkey" FOREIGN KEY (registration_id) REFERENCES public.registrations(id) ON DELETE CASCADE;

ALTER TABLE "public"."registrations"
  ADD CONSTRAINT "registrations_posting_id_family_id_assignee_key_key" UNIQUE (posting_id, family_id, assignee_key);

ALTER TABLE "public"."registrations"
  ADD CONSTRAINT "registrations_posting_id_fkey" FOREIGN KEY (posting_id) REFERENCES public.postings(id);

ALTER TABLE "public"."standard_cuts"
  ADD CONSTRAINT "standard_cuts_standard_id_fkey" FOREIGN KEY (standard_id) REFERENCES public.standards(id) ON DELETE CASCADE;

ALTER TABLE "public"."swims"
  ADD CONSTRAINT "swims_athlete_id_fkey" FOREIGN KEY (athlete_id) REFERENCES public.athletes(id);

ALTER TABLE "public"."swims"
  ADD CONSTRAINT "swims_check" CHECK (((status <> 'OK'::text) OR (time_ms > 0)));

ALTER TABLE "public"."swims"
  ADD CONSTRAINT "swims_course_check" CHECK ((course = ANY (ARRAY['SCY'::text, 'SCM'::text, 'LCM'::text])));

ALTER TABLE "public"."swims"
  ADD CONSTRAINT "swims_meet_id_fkey" FOREIGN KEY (meet_id) REFERENCES public.meets(id);

ALTER TABLE "public"."swims"
  ADD CONSTRAINT "swims_status_check" CHECK ((status = ANY (ARRAY['OK'::text, 'DQ'::text, 'DFS'::text, 'NS'::text])));

ALTER TABLE "public"."athletes"
  ADD CONSTRAINT "athletes_team_id_fkey" FOREIGN KEY (team_id) REFERENCES public.teams(id);

ALTER TABLE "public"."documents"
  ADD CONSTRAINT "documents_team_id_fkey" FOREIGN KEY (team_id) REFERENCES public.teams(id);

ALTER TABLE "public"."meets"
  ADD CONSTRAINT "meets_host_team_id_fkey" FOREIGN KEY (host_team_id) REFERENCES public.teams(id);

ALTER TABLE "public"."meets"
  ADD CONSTRAINT "meets_team_id_fkey" FOREIGN KEY (team_id) REFERENCES public.teams(id);

ALTER TABLE "public"."people"
  ADD CONSTRAINT "people_team_id_fkey" FOREIGN KEY (team_id) REFERENCES public.teams(id);

ALTER TABLE "public"."athletes"
  ADD CONSTRAINT "athletes_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.training_groups(id);

ALTER TABLE "public"."documents"
  ADD CONSTRAINT "documents_venue_id_fkey" FOREIGN KEY (venue_id) REFERENCES public.venues(id);

ALTER TABLE "public"."meets"
  ADD CONSTRAINT "meets_venue_id_fkey" FOREIGN KEY (venue_id) REFERENCES public.venues(id);

ALTER TABLE "public"."venues"
  ADD CONSTRAINT "venues_team_id_fkey" FOREIGN KEY (team_id) REFERENCES public.teams(id);

CREATE VIEW "public"."app_records" WITH (security_invoker=true) AS  SELECT ('teams/'::text || teams.id) AS path,
    teams.data
   FROM public.teams
UNION ALL
 SELECT ('people/'::text || people.id) AS path,
    people.data
   FROM public.people
UNION ALL
 SELECT ('athletes/'::text || athletes.id) AS path,
    private.athlete_snapshot(athletes.data, athletes.person_id, athletes.group_id) AS data
   FROM public.athletes
UNION ALL
 SELECT ('families/'::text || families.id) AS path,
    private.family_snapshot(families.id, families.data) AS data
   FROM public.families
UNION ALL
 SELECT ('venues/'::text || venues.id) AS path,
    venues.data
   FROM public.venues
UNION ALL
 SELECT ('meets/'::text || meets.id) AS path,
    meets.data
   FROM public.meets
UNION ALL
 SELECT ('swims/'::text || swims.id) AS path,
    swims.data
   FROM public.swims
UNION ALL
 SELECT ('standards/'::text || standards.id) AS path,
    standards.data
   FROM public.standards
UNION ALL
 SELECT ('practice_sessions/'::text || practice_sessions.id) AS path,
    practice_sessions.data
   FROM public.practice_sessions
UNION ALL
 SELECT ('attendance/'::text || attendance.id) AS path,
    attendance.data
   FROM public.attendance
UNION ALL
 SELECT ('postings/'::text || postings.id) AS path,
    postings.data
   FROM public.postings
UNION ALL
 SELECT ('registrations/'::text || registrations.id) AS path,
    registrations.data
   FROM public.registrations
UNION ALL
 SELECT ('manual_hours/'::text || manual_hours.id) AS path,
    manual_hours.data
   FROM public.manual_hours
UNION ALL
 SELECT ('work_descriptions/'::text || work_descriptions.id) AS path,
    work_descriptions.data
   FROM public.work_descriptions
UNION ALL
 SELECT ('documents/'::text || documents.id) AS path,
    documents.data
   FROM public.documents
UNION ALL
 SELECT ('public_athletes/'::text || public_athletes.id) AS path,
    public_athletes.data
   FROM public.public_athletes
UNION ALL
 SELECT evidence_records.path,
    evidence_records.data
   FROM public.evidence_records
UNION ALL
 SELECT ((('athletes/'::text || athlete_bests.athlete_id) || '/bests/'::text) || athlete_bests.event_code) AS path,
    athlete_bests.data
   FROM public.athlete_bests
UNION ALL
 SELECT ('admins/'::text || (administrators.user_id)::text) AS path,
    jsonb_build_object('id', administrators.user_id) AS data
   FROM public.administrators;

CREATE INDEX athletes_group_id_idx ON public.athletes USING btree (group_id);

CREATE INDEX athletes_team_id_idx ON public.athletes USING btree (team_id);

CREATE INDEX attendance_session_id_idx ON public.attendance USING btree (session_id);

CREATE INDEX documents_athlete_id_idx ON public.documents USING btree (athlete_id);

CREATE INDEX documents_meet_id_idx ON public.documents USING btree (meet_id);

CREATE INDEX documents_person_id_idx ON public.documents USING btree (person_id);

CREATE INDEX documents_team_id_idx ON public.documents USING btree (team_id);

CREATE INDEX documents_venue_id_idx ON public.documents USING btree (venue_id);

CREATE INDEX evidence_records_root_path_idx ON public.evidence_records USING btree (root, path);

CREATE INDEX family_emails_email_idx ON public.family_emails USING btree (email);

CREATE INDEX family_people_person_id_idx ON public.family_people USING btree (person_id);

CREATE INDEX manual_hours_family_id_idx ON public.manual_hours USING btree (family_id);

CREATE INDEX meets_host_team_id_idx ON public.meets USING btree (host_team_id);

CREATE INDEX meets_team_id_idx ON public.meets USING btree (team_id);

CREATE INDEX meets_venue_id_idx ON public.meets USING btree (venue_id);

CREATE INDEX people_team_id_idx ON public.people USING btree (team_id);

CREATE INDEX postings_meet_id_idx ON public.postings USING btree (meet_id);

CREATE INDEX registrations_family_id_idx ON public.registrations USING btree (family_id);

CREATE INDEX swims_athlete_id_idx ON public.swims USING btree (athlete_id);

CREATE INDEX swims_event_code_time_ms_idx ON public.swims USING btree (event_code, time_ms)
  WHERE (status = 'OK'::text);

CREATE INDEX swims_meet_id_idx ON public.swims USING btree (meet_id);

CREATE INDEX venues_team_id_idx ON public.venues USING btree (team_id);

CREATE TRIGGER athlete_rank_refresh
  AFTER UPDATE ON public.athletes
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.refresh_bests();

CREATE TRIGGER refresh_cuts
  AFTER INSERT OR UPDATE ON public.standards
  FOR EACH ROW
  EXECUTE FUNCTION private.refresh_cuts();

CREATE TRIGGER refresh_bests
  AFTER INSERT OR DELETE OR UPDATE ON public.swims
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.refresh_bests();

CREATE POLICY "staff_read" ON "public"."administrators"
  FOR SELECT
  TO PUBLIC
  USING (private.is_staff());

CREATE POLICY "public_read" ON "public"."athlete_bests"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "staff_read" ON "public"."athletes"
  FOR SELECT
  TO PUBLIC
  USING (private.is_staff());

CREATE POLICY "staff_read" ON "public"."attendance"
  FOR SELECT
  TO PUBLIC
  USING (private.is_staff());

CREATE POLICY "staff_read" ON "public"."documents"
  FOR SELECT
  TO PUBLIC
  USING (private.is_staff());

CREATE POLICY "staff_read" ON "public"."evidence_records"
  FOR SELECT
  TO PUBLIC
  USING (private.is_staff());

CREATE POLICY "family_read" ON "public"."families"
  FOR SELECT
  TO PUBLIC
  USING ((( SELECT private.is_staff() AS is_staff) OR private.is_family(id)));

CREATE POLICY "family_read" ON "public"."family_emails"
  FOR SELECT
  TO PUBLIC
  USING ((( SELECT private.is_staff() AS is_staff) OR private.is_family(family_id)));

CREATE POLICY "family_read" ON "public"."family_people"
  FOR SELECT
  TO PUBLIC
  USING ((( SELECT private.is_staff() AS is_staff) OR private.is_family(family_id)));

CREATE POLICY "family_read" ON "public"."manual_hours"
  FOR SELECT
  TO PUBLIC
  USING ((( SELECT private.is_staff() AS is_staff) OR private.is_family(family_id)));

CREATE POLICY "staff_read" ON "public"."meets"
  FOR SELECT
  TO PUBLIC
  USING (private.is_staff());

CREATE POLICY "staff_read" ON "public"."people"
  FOR SELECT
  TO PUBLIC
  USING (private.is_staff());

CREATE POLICY "logged_in_postings" ON "public"."postings"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "staff_read" ON "public"."practice_sessions"
  FOR SELECT
  TO PUBLIC
  USING (private.is_staff());

CREATE POLICY "public_read" ON "public"."public_athletes"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "family_read" ON "public"."registrations"
  FOR SELECT
  TO PUBLIC
  USING ((( SELECT private.is_staff() AS is_staff) OR private.is_family(family_id)));

CREATE POLICY "public_read" ON "public"."standard_cuts"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "public_read" ON "public"."standards"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "staff_read" ON "public"."swims"
  FOR SELECT
  TO PUBLIC
  USING (private.is_staff());

CREATE POLICY "staff_read" ON "public"."teams"
  FOR SELECT
  TO PUBLIC
  USING (private.is_staff());

CREATE POLICY "public_read" ON "public"."training_groups"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "staff_read" ON "public"."venues"
  FOR SELECT
  TO PUBLIC
  USING (private.is_staff());

CREATE POLICY "logged_in_descriptions" ON "public"."work_descriptions"
  FOR SELECT
  TO "authenticated"
  USING (true);

REVOKE ALL ON FUNCTION "private"."athlete_snapshot"(jsonb, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."athlete_snapshot"(jsonb, text, text) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "private"."family_snapshot"(text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."family_snapshot"(text, jsonb) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "private"."invoke_shift_reminders"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."invoke_shift_reminders"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."is_family"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."is_family"(text) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "private"."is_staff"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."is_staff"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "private"."open_shift"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."open_shift"(text) TO "postgres";

REVOKE ALL ON FUNCTION "private"."put_record"(text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."put_record"(text, jsonb) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "private"."rebuild_bests"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."rebuild_bests"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "private"."refresh_bests"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."refresh_bests"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "private"."refresh_cuts"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."refresh_cuts"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "private"."shift_cutoff"(jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."shift_cutoff"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "private"."signup"(text, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."signup"(text, text, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."claim_shift_reminders"(boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."claim_shift_reminders"(boolean) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."collect_records"(jsonb, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."collect_records"(jsonb, jsonb) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."commit_records"(jsonb, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."commit_records"(jsonb, jsonb) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."export_records"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."export_records"(text) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."finish_shift_reminder"(text, date, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."finish_shift_reminder"(text, date, text, text) TO "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."is_staff"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."projection_counts"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."query_records"(text, jsonb, text, integer, text) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."times_page"(text, text, text, integer, integer) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."workshare_action"(text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."workshare_action"(text, jsonb) TO "anon", "authenticated", "postgres", "service_role";

GRANT USAGE ON SCHEMA "private" TO "anon", "authenticated";

GRANT CREATE, USAGE ON SCHEMA "private" TO "postgres";

GRANT USAGE ON SCHEMA "private" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."guest_invitations" TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."reminders" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."administrators" FROM "anon";

GRANT SELECT ON TABLE "public"."administrators" TO "anon";

REVOKE ALL ON TABLE "public"."administrators" FROM "authenticated";

GRANT SELECT ON TABLE "public"."administrators" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."administrators" TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."athlete_bests" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."athletes" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."attendance" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."documents" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."evidence_records" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."families" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."family_emails" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."family_people" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."manual_hours" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."meets" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."people" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."postings" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."practice_sessions" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."public_athletes" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."registrations" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."standard_cuts" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."standards" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."swims" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."teams" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."training_groups" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."venues" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."work_descriptions" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."app_records" TO "anon", "authenticated", "postgres", "service_role";


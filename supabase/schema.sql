-- Velocity Swimming. Core relations are first-class tables; JSON retains
-- source-specific facts and immutable audit snapshots, never relationships.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;
create table public.administrators(user_id uuid primary key references auth.users(id) on delete cascade);
create function private.is_staff() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null and lower(split_part(u.email,'@',2))='velocity-swimming.com') or exists(select 1 from public.administrators a where a.user_id=auth.uid()));
$$;
create function public.is_staff() returns boolean language sql stable security invoker set search_path='' as $$ select private.is_staff(); $$;
create table public.teams(id text primary key, data jsonb not null, name text generated always as (data->>'name') stored);
create table public.training_groups(id text primary key, name text not null unique);
create table public.people(id text primary key, data jsonb not null, name text generated always as (data->>'name') stored, team_id text generated always as (data->>'teamId') stored references public.teams(id));
create table public.athletes(id text primary key, data jsonb not null, person_id text not null unique references public.people(id), team_id text generated always as (data->>'teamId') stored references public.teams(id), group_id text references public.training_groups(id));
create table public.families(id text primary key, data jsonb not null);
create table public.family_emails(family_id text references public.families(id) on delete cascade, email text not null check(email=lower(trim(email))), primary key(family_id,email));
create table public.family_people(family_id text references public.families(id) on delete cascade, person_id text references public.people(id), relationship text not null, primary key(family_id,person_id));
create function private.is_family(fid text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.family_emails f join auth.users u on lower(u.email)=f.email where f.family_id=fid and u.id=auth.uid() and u.email_confirmed_at is not null);
$$;
create table public.venues(id text primary key,data jsonb not null,team_id text generated always as (data->>'teamId') stored references public.teams(id));
create table public.meets(id text primary key,data jsonb not null,team_id text generated always as (data->>'teamId') stored references public.teams(id),host_team_id text generated always as (data->>'hostTeamId') stored references public.teams(id),venue_id text generated always as (data->>'venueId') stored references public.venues(id));
create table public.swims(id text primary key,data jsonb not null,athlete_id text generated always as (data->>'athleteId') stored references public.athletes(id),meet_id text generated always as (data#>>'{meet,id}') stored references public.meets(id),event_code text generated always as (data->>'eventCode') stored,time_ms integer generated always as ((data->>'timeMs')::integer) stored,course text generated always as (data->>'course') stored,status text generated always as (data->>'status') stored,check(status<>'OK' or time_ms>0),check(course in ('SCY','SCM','LCM')),check(status in ('OK','DQ','DFS','NS')));
create table public.standards(id text primary key,data jsonb not null);
create table public.standard_cuts(standard_id text references public.standards(id) on delete cascade,course text,gender text,age_group text,event_code text,tier text,time_ms integer not null check(time_ms>0),primary key(standard_id,course,gender,age_group,event_code,tier));
create table public.practice_sessions(id text primary key,data jsonb not null);
create table public.attendance(id text primary key,data jsonb not null,athlete_id text generated always as (data->>'athleteId') stored references public.athletes(id),session_id text generated always as (data->>'sessionId') stored references public.practice_sessions(id),unique(athlete_id,session_id));
create table public.postings(id text primary key,data jsonb not null,meet_id text generated always as (data->>'meetId') stored references public.meets(id));
create table public.registrations(id text primary key,data jsonb not null,posting_id text generated always as (data->>'postingId') stored references public.postings(id),family_id text generated always as (data->>'familyId') stored references public.families(id),assignee_key text generated always as (lower(trim(data#>>'{assignee,name}'))) stored,unique(posting_id,family_id,assignee_key));
create table public.manual_hours(id text primary key,data jsonb not null,family_id text generated always as (data->>'familyId') stored references public.families(id));
create table public.work_descriptions(id text primary key,data jsonb not null);
create table public.documents(id text primary key,data jsonb not null,team_id text generated always as (data->>'teamId') stored references public.teams(id),meet_id text generated always as (data->>'meetId') stored references public.meets(id),person_id text generated always as (data->>'personId') stored references public.people(id),athlete_id text generated always as (data->>'athleteId') stored references public.athletes(id),venue_id text generated always as (data->>'venueId') stored references public.venues(id));
-- Provenance and source-specific annotation keys remain extensible; collection
-- names are allowlisted by the writer and nested history is append-only.
create table public.evidence_records(path text primary key,data jsonb not null,root text generated always as (split_part(path,'/',1)) stored);
create table public.public_athletes(id text primary key references public.athletes(id) on delete cascade,data jsonb not null check(data - array['id','name','aliases','swimcloudId']='{}'::jsonb));
create table public.athlete_bests(athlete_id text references public.athletes(id) on delete cascade,event_code text,data jsonb not null,primary key(athlete_id,event_code));
create table private.guest_invitations(id text primary key, family_id text not null references public.families(id),posting_id text not null references public.postings(id),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),expires_at timestamptz not null,revoked_at timestamptz,registration_id text references public.registrations(id));
create table private.reminders(registration_id text references public.registrations(id),reminder_date date, sent_at timestamptz, primary key(registration_id,reminder_date));

create function private.family_snapshot(fid text, body jsonb) returns jsonb language sql stable security definer set search_path='' as $$
 select case when private.is_staff() or private.is_family(fid) or (select auth.jwt()->>'role')='service_role' then body || jsonb_build_object('authorizedEmails',coalesce((select jsonb_agg(email order by email) from public.family_emails where family_id=fid),'[]'::jsonb),'children',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',p.name,'group',coalesce(g.name,'No Assignment')) order by p.name) from public.family_people fp join public.people p on p.id=fp.person_id join public.athletes a on a.person_id=p.id left join public.training_groups g on g.id=a.group_id where fp.family_id=fid and fp.relationship='child'),'[]'::jsonb)) else null end;
$$;
create function private.athlete_snapshot(body jsonb, pid text, gid text) returns jsonb language sql stable security invoker set search_path='' as $$
 select body || jsonb_build_object('personId',pid,'name',coalesce(case when trim((p.data#>>'{structuredName,first}')||' '||(p.data#>>'{structuredName,last}'))=p.name then p.data->'structuredName' else null end,jsonb_build_object('first',split_part(p.name,' ',1),'last',substring(p.name from position(' ' in p.name)+1))),'currentGroup',coalesce(body->'currentGroup','{}'::jsonb)||jsonb_build_object('id',gid,'name',coalesce(g.name,'No Assignment'))) from public.people p left join public.training_groups g on g.id=gid where p.id=pid;
$$;

create view public.app_records with (security_invoker=true) as
select 'teams/'||id as path, data as data from public.teams
union all
select 'people/'||id as path, data as data from public.people
union all
select 'athletes/'||id as path, private.athlete_snapshot(data,person_id,group_id) as data from public.athletes
union all
select 'families/'||id as path, private.family_snapshot(id,data) as data from public.families
union all
select 'venues/'||id as path, data as data from public.venues
union all
select 'meets/'||id as path, data as data from public.meets
union all
select 'swims/'||id as path, data as data from public.swims
union all
select 'standards/'||id as path, data as data from public.standards
union all
select 'practice_sessions/'||id as path, data as data from public.practice_sessions
union all
select 'attendance/'||id as path, data as data from public.attendance
union all
select 'postings/'||id as path, data as data from public.postings
union all
select 'registrations/'||id as path, data as data from public.registrations
union all
select 'manual_hours/'||id as path, data as data from public.manual_hours
union all
select 'work_descriptions/'||id as path, data as data from public.work_descriptions
union all
select 'documents/'||id as path, data as data from public.documents
union all
select 'public_athletes/'||id as path, data as data from public.public_athletes
union all
select path,data from public.evidence_records
union all
select 'athletes/'||athlete_id||'/bests/'||event_code,data from public.athlete_bests
union all
select 'admins/'||user_id::text,jsonb_build_object('id',user_id) from public.administrators;
alter table public.teams enable row level security;
grant select on public.teams to anon,authenticated;
create policy staff_read on public.teams for select using (private.is_staff());
alter table public.people enable row level security;
grant select on public.people to anon,authenticated;
create policy staff_read on public.people for select using (private.is_staff());
alter table public.athletes enable row level security;
grant select on public.athletes to anon,authenticated;
create policy staff_read on public.athletes for select using (private.is_staff());
alter table public.families enable row level security;
grant select on public.families to anon,authenticated;
create policy staff_read on public.families for select using (private.is_staff());
alter table public.venues enable row level security;
grant select on public.venues to anon,authenticated;
create policy staff_read on public.venues for select using (private.is_staff());
alter table public.meets enable row level security;
grant select on public.meets to anon,authenticated;
create policy staff_read on public.meets for select using (private.is_staff());
alter table public.swims enable row level security;
grant select on public.swims to anon,authenticated;
create policy staff_read on public.swims for select using (private.is_staff());
alter table public.standards enable row level security;
grant select on public.standards to anon,authenticated;
create policy staff_read on public.standards for select using (private.is_staff());
alter table public.practice_sessions enable row level security;
grant select on public.practice_sessions to anon,authenticated;
create policy staff_read on public.practice_sessions for select using (private.is_staff());
alter table public.attendance enable row level security;
grant select on public.attendance to anon,authenticated;
create policy staff_read on public.attendance for select using (private.is_staff());
alter table public.postings enable row level security;
grant select on public.postings to anon,authenticated;
create policy staff_read on public.postings for select using (private.is_staff());
alter table public.registrations enable row level security;
grant select on public.registrations to anon,authenticated;
create policy staff_read on public.registrations for select using (private.is_staff());
alter table public.manual_hours enable row level security;
grant select on public.manual_hours to anon,authenticated;
create policy staff_read on public.manual_hours for select using (private.is_staff());
alter table public.work_descriptions enable row level security;
grant select on public.work_descriptions to anon,authenticated;
create policy staff_read on public.work_descriptions for select using (private.is_staff());
alter table public.documents enable row level security;
grant select on public.documents to anon,authenticated;
create policy staff_read on public.documents for select using (private.is_staff());
alter table public.public_athletes enable row level security;
grant select on public.public_athletes to anon,authenticated;
create policy staff_read on public.public_athletes for select using (private.is_staff());
alter table public.training_groups enable row level security;
grant select on public.training_groups to anon,authenticated;
create policy staff_read on public.training_groups for select using (private.is_staff());
alter table public.family_emails enable row level security;
grant select on public.family_emails to anon,authenticated;
create policy staff_read on public.family_emails for select using (private.is_staff());
alter table public.family_people enable row level security;
grant select on public.family_people to anon,authenticated;
create policy staff_read on public.family_people for select using (private.is_staff());
alter table public.standard_cuts enable row level security;
grant select on public.standard_cuts to anon,authenticated;
create policy staff_read on public.standard_cuts for select using (private.is_staff());
alter table public.athlete_bests enable row level security;
grant select on public.athlete_bests to anon,authenticated;
create policy staff_read on public.athlete_bests for select using (private.is_staff());
alter table public.administrators enable row level security;
grant select on public.administrators to anon,authenticated;
create policy staff_read on public.administrators for select using (private.is_staff());
alter table public.evidence_records enable row level security;
grant select on public.evidence_records to anon,authenticated;
create policy staff_read on public.evidence_records for select using (private.is_staff());
create policy public_read on public.standards for select using (true);
create policy public_read on public.standard_cuts for select using (true);
create policy public_read on public.public_athletes for select using (true);
create policy public_read on public.athlete_bests for select using (true);
create policy public_read on public.training_groups for select using (true);
create policy family_read on public.families for select using (private.is_family(id));
create policy family_read on public.family_emails for select using (private.is_family(family_id));
create policy family_read on public.family_people for select using (private.is_family(family_id));
create policy family_read on public.registrations for select using (private.is_family(family_id));
create policy family_read on public.manual_hours for select using (private.is_family(family_id));
create policy logged_in_postings on public.postings for select to authenticated using (true);
create policy logged_in_descriptions on public.work_descriptions for select to authenticated using (true);
grant select on public.app_records to anon,authenticated;
create index on public.people(team_id);
create index on public.athletes(team_id);
create index on public.athletes(group_id);
create index on public.venues(team_id);
create index on public.meets(team_id);
create index on public.meets(host_team_id);
create index on public.meets(venue_id);
create index on public.swims(athlete_id);
create index on public.swims(meet_id);
create index on public.attendance(session_id);
create index on public.postings(meet_id);
create index on public.registrations(family_id);
create index on public.manual_hours(family_id);
create index on public.documents(team_id);
create index on public.documents(meet_id);
create index on public.documents(person_id);
create index on public.documents(athlete_id);
create index on public.documents(venue_id);
create index on public.family_people(person_id);
create index on public.family_emails(email);
create index on public.swims(event_code,time_ms) where status='OK';
create index on public.evidence_records(root,path);
-- Queries retain registered record paths for provenance links, but execute
-- filters, cursors and pagination in Postgres over relational projections.
create function public.query_records(collection_path text, filters jsonb default '[]', after_id text default null, page_size integer default 1000, record_id text default null) returns table(path text,data jsonb) language plpgsql stable security invoker set search_path='' as $$
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
end; $$;

create function private.put_record(record_path text, body jsonb) returns void language plpgsql security definer set search_path='' as $$
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
end; $$;

create function public.commit_records(reads jsonb, writes jsonb) returns void language plpgsql security definer set search_path='' as $$
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
end; $$;
-- Only authenticated staff may call put_record through commit_records. This
-- narrow private writer is not exposed to the Data API or callable by users.
revoke all on function private.put_record(text,jsonb) from public,anon,authenticated;
-- The API transaction function needs writer privileges; its explicit actor
-- check and fixed writer registry bound its SECURITY DEFINER authority.
alter function public.commit_records(jsonb,jsonb) security definer;
revoke all on function public.commit_records(jsonb,jsonb) from public,anon;
grant execute on function public.commit_records(jsonb,jsonb) to authenticated;

create function private.rebuild_bests() returns void language plpgsql security definer set search_path='' as $$
begin
 delete from public.athlete_bests where true;
 insert into public.athlete_bests(athlete_id,event_code,data)
 select b.athlete_id,b.event_code,jsonb_build_object('eventCode',b.event_code,'distance',b.data->'distance','stroke',b.data->'stroke','course',b.course,'gender',b.data->>'gender','bestTimeMs',b.time_ms,'bestTimeDisplay',private.format_time(b.time_ms),'swimDate',b.data#>>'{meet,date}','meetName',b.data#>>'{meet,name}','swimId',b.id,'standard',coalesce(b.data#>>'{standardsTag,usasMotivational}',''),'ageWhenSwum',b.data->'ageAtSwim','clubRankAllTime',rank() over(partition by b.event_code,b.course,b.data->>'gender' order by b.time_ms),'clubRankActiveRoster',case when a.data->>'status'='active' then (select count(distinct faster.athlete_id)+1 from public.swims faster join public.athletes fa on fa.id=faster.athlete_id where faster.status='OK' and faster.event_code=b.event_code and faster.course=b.course and faster.data->>'gender'=b.data->>'gender' and faster.time_ms<b.time_ms and fa.data->>'status'='active' and coalesce(faster.data->>'isOfficial','true')='true' and (coalesce(faster.data->>'isRelay','false')='false' or faster.data#>>'{relay,isLeadOffFlatStart}'='true')) else null end)
 from (select distinct on(athlete_id,event_code) * from public.swims where status='OK' and coalesce(data->>'isOfficial','true')='true' and (coalesce(data->>'isRelay','false')='false' or data#>>'{relay,isLeadOffFlatStart}'='true') order by athlete_id,event_code,time_ms,data#>>'{meet,date}',id) b join public.athletes a on a.id=b.athlete_id;
 return;
end; $$;
create function private.refresh_bests() returns trigger language plpgsql security definer set search_path='' as $$ begin if current_setting('velocity.defer_bests',true) is distinct from 'true' then perform private.rebuild_bests();end if;return null;end;$$;
create trigger refresh_bests after insert or update or delete on public.swims for each statement execute function private.refresh_bests();
create function private.refresh_cuts() returns trigger language plpgsql security definer set search_path='' as $$
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
end; $$;
create trigger refresh_cuts after insert or update on public.standards for each row execute function private.refresh_cuts();

insert into storage.buckets(id,name,public,file_size_limit) values('evidence','evidence',false,20971520) on conflict(id) do nothing;
create policy evidence_read on storage.objects for select to authenticated using(bucket_id='evidence' and private.is_staff());
-- Archives are only created by server-side collectors, never overwritten.
revoke all on all functions in schema private from public;
grant execute on function private.is_staff(),private.is_family(text),private.family_snapshot(text,jsonb),private.athlete_snapshot(jsonb,text,text) to anon,authenticated;
grant execute on all functions in schema private to service_role;
revoke all on public.administrators from anon,authenticated;
grant select on public.administrators to authenticated;
grant select,insert,update,delete on all tables in schema public to service_role;
grant all on all tables in schema private to service_role;
create function private.shift_cutoff(body jsonb) returns timestamptz language sql immutable set search_path='' as $$ select coalesce((body->>'endTime')::timestamptz,(((body->>'date')::timestamptz at time zone 'America/Los_Angeles')::date+1)::timestamp at time zone 'America/Los_Angeles'); $$;
create function private.open_shift(pid text) returns jsonb language plpgsql security definer set search_path='' as $$ declare body jsonb;begin select data into body from public.postings where id=pid for update;if body is null or body#>>'{positions,max}' is null or (body#>>'{positions,max}')::integer<1 or body->>'date' is null or coalesce((body->>'archived')::boolean,false) or body->>'status' is distinct from 'Open' or private.shift_cutoff(body)<=now() then raise exception 'This shift is unavailable';end if;return body;end;$$;
create function private.signup(fid text,pid text,assignee jsonb) returns text language plpgsql security definer set search_path='' as $$
declare body jsonb; rid text:=gen_random_uuid()::text;
begin
 body:=private.open_shift(pid);
 if assignee->>'name' is null or length(trim(assignee->>'name')) not between 1 and 161 then raise exception 'Enter a volunteer name';end if;
 if exists(select 1 from public.registrations where family_id=fid and posting_id=pid and assignee_key=lower(trim(regexp_replace(assignee->>'name','\s+',' ','g')))) then raise exception 'This volunteer is already registered';end if;
 if (select count(*) from public.registrations where posting_id=pid)>=(body#>>'{positions,max}')::integer then raise exception 'This shift is full';end if;
 insert into public.registrations(id,data) values(rid,jsonb_build_object('familyId',fid,'postingId',pid,'assignee',assignee||jsonb_build_object('name',trim(regexp_replace(assignee->>'name','\s+',' ','g'))),'status','Pending'));
 return rid;
end;$$;
create function public.workshare_action(operation text,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
end; $$;
revoke all on function public.workshare_action(text,jsonb) from public;
grant execute on function public.workshare_action(text,jsonb) to anon,authenticated;
revoke all on function private.shift_cutoff(jsonb),private.open_shift(text),private.signup(text,text,jsonb) from public,anon,authenticated;
grant select on public.administrators to anon;
-- Collector writes use a secret server key, with the same atomic conflict guards.
create function public.collect_records(reads jsonb,writes jsonb) returns void language plpgsql security invoker set search_path='' as $$ declare r jsonb;current_data jsonb;begin
 perform pg_advisory_xact_lock(hashtext('velocity-records'));
 perform set_config('velocity.defer_bests','true',true);
 for r in select * from jsonb_array_elements(reads) loop select data into current_data from public.app_records where path=r->>'path';if coalesce(current_data,'null'::jsonb) is distinct from r->'before' then raise exception 'Source changed during collection' using errcode='40001';end if;end loop;
 for r in select * from jsonb_array_elements(writes) loop perform private.put_record(r->>'path',case when r->'after'='null'::jsonb then null else r->'after' end);end loop;
perform set_config('velocity.defer_bests','false',true);if exists(select 1 from jsonb_array_elements(writes) w where starts_with(w->>'path','swims/') or starts_with(w->>'path','athletes/')) then perform private.rebuild_bests();end if;end;$$;
revoke all on function public.collect_records(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.collect_records(jsonb,jsonb) to service_role;
alter table private.guest_invitations drop constraint guest_invitations_registration_id_fkey;
-- A redeemed invitation keeps its immutable receipt even if the signup is canceled.
create function public.times_page(mode text default 'bests',event_filter text default null,course_filter text default null,page_from integer default 0,page_size integer default 50) returns jsonb language plpgsql stable security invoker set search_path='' as $$
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
end;$$;
create function public.projection_counts() returns jsonb language sql stable security invoker set search_path='' as $$ select jsonb_build_object('totalBestsWritten',count(*),'athletesCount',count(distinct athlete_id)) from public.athlete_bests; $$;

create trigger athlete_rank_refresh after update on public.athletes for each statement execute function private.refresh_bests();
alter table private.reminders drop constraint reminders_registration_id_fkey;
alter table private.reminders add foreign key(registration_id) references public.registrations(id) on delete cascade;
alter table private.reminders add column lease_until timestamptz, add column first_attempt_at timestamptz, add column attempts integer not null default 0, add column delivery_id text, add column last_error text;
alter table private.reminders enable row level security;
alter table private.guest_invitations enable row level security;
create function public.claim_shift_reminders(dry_run boolean default true) returns jsonb language plpgsql security invoker set search_path='' as $$
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
end;$$;
create function public.finish_shift_reminder(registration_id text, reminder_date date, delivery_id text default null, failure text default null) returns void language sql security invoker set search_path='' as $$
 update private.reminders set sent_at=case when failure is null then now() else null end,delivery_id=finish_shift_reminder.delivery_id,last_error=failure,lease_until=now()+interval '5 minutes'
 where private.reminders.registration_id=finish_shift_reminder.registration_id and private.reminders.reminder_date=finish_shift_reminder.reminder_date and sent_at is null;
$$;
revoke all on function public.claim_shift_reminders(boolean),public.finish_shift_reminder(text,date,text,text) from public,anon,authenticated;
grant execute on function public.claim_shift_reminders(boolean),public.finish_shift_reminder(text,date,text,text) to service_role;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create function private.invoke_shift_reminders() returns void language plpgsql security definer set search_path='' as $$
declare project_url text; api_key text; cron_secret text;
begin
 select decrypted_secret into project_url from vault.decrypted_secrets where name='velocity_project_url';
 select decrypted_secret into api_key from vault.decrypted_secrets where name='velocity_publishable_key';
 select decrypted_secret into cron_secret from vault.decrypted_secrets where name='velocity_reminder_secret';
 if project_url is null or api_key is null or cron_secret is null then return;end if;
 perform net.http_post(url:=project_url||'/functions/v1/shift-reminders',headers:=jsonb_build_object('Content-Type','application/json','apikey',api_key,'x-cron-secret',cron_secret),body:='{}'::jsonb);
end;$$;
revoke all on function private.invoke_shift_reminders() from public,anon,authenticated;
select cron.schedule('velocity-shift-reminders','0 * * * *','select private.invoke_shift_reminders()');
create function public.export_records(after_path text default null) returns table(path text,data jsonb) language sql stable security invoker set search_path='' as $$ select path,data from public.app_records where (after_path is null or path>after_path) order by path limit 1000; $$;
revoke all on function public.export_records(text) from public,anon,authenticated;
grant execute on function public.export_records(text) to service_role;

drop policy staff_read on public.standards;
drop policy staff_read on public.standard_cuts;
drop policy staff_read on public.public_athletes;
drop policy staff_read on public.athlete_bests;
drop policy staff_read on public.training_groups;
drop policy staff_read on public.postings;
drop policy staff_read on public.work_descriptions;
drop policy staff_read on public.families;
alter policy family_read on public.families using((select private.is_staff()) or private.is_family(id));
drop policy staff_read on public.family_emails;
alter policy family_read on public.family_emails using((select private.is_staff()) or private.is_family(family_id));
drop policy staff_read on public.family_people;
alter policy family_read on public.family_people using((select private.is_staff()) or private.is_family(family_id));
drop policy staff_read on public.registrations;
alter policy family_read on public.registrations using((select private.is_staff()) or private.is_family(family_id));
drop policy staff_read on public.manual_hours;
alter policy family_read on public.manual_hours using((select private.is_staff()) or private.is_family(family_id));

revoke all on function private.rebuild_bests() from public,anon,authenticated;grant execute on function private.rebuild_bests() to service_role;
alter table public.swims alter column athlete_id set not null, alter column meet_id set not null, alter column event_code set not null, alter column course set not null, alter column status set not null;
alter table public.swims add column round text generated always as (data->>'round') stored not null check(round in ('P','F','S','TT')),
add column is_official boolean generated always as (coalesce((data->>'isOfficial')::boolean,true)) stored not null,
add column is_relay boolean generated always as (coalesce((data->>'isRelay')::boolean,false)) stored not null;
alter table public.postings add check(data#>>'{positions,max}' is not null and (data#>>'{positions,max}')::integer>0 and (data#>>'{positions,min}')::integer>=0 and (data#>>'{positions,min}')::integer<=(data#>>'{positions,desired}')::integer and (data#>>'{positions,desired}')::integer<=(data#>>'{positions,max}')::integer);
alter table public.practice_sessions add column practice_date text generated always as (substring(data->>'date',1,10)) stored,
add column group_name text generated always as (data->>'trainingGroup') stored,
add column group_id text generated always as (data->>'trainingGroupId') stored references public.training_groups(id),add unique(practice_date,group_name);
create index on public.practice_sessions(group_id);
create function private.format_time(ms integer) returns text language sql immutable set search_path='' as $$ select case when ms>=60000 then (ms/60000)::text||':'||lpad(((ms%60000)/1000)::text,2,'0') else (ms/1000)::text end||'.'||lpad(((ms%1000)/10)::text,2,'0');$$;
revoke all on function private.format_time(integer) from public,anon,authenticated;
grant execute on function private.format_time(integer) to service_role;
revoke all on all tables in schema public from anon,authenticated;
grant select on all tables in schema public to anon,authenticated;

create function private.publish_person() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.public_athletes set data=data||jsonb_build_object('name',case when trim((new.data#>>'{structuredName,first}')||' '||(new.data#>>'{structuredName,last}'))=new.name then new.data->'structuredName' else jsonb_build_object('first',split_part(new.name,' ',1),'last',substring(new.name from position(' ' in new.name)+1)) end) where id in (select id from public.athletes where person_id=new.id);
 return new;
end;$$;
create trigger publish_person after insert or update on public.people for each row execute function private.publish_person();
revoke all on function private.publish_person() from public,anon,authenticated;
create function private.has_family() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.family_emails f join auth.users u on lower(u.email)=f.email where u.id=auth.uid() and u.email_confirmed_at is not null);$$;
revoke all on function private.has_family() from public;
grant execute on function private.has_family() to anon,authenticated;
alter policy logged_in_postings on public.postings using((select private.is_staff()) or (select private.has_family()));
alter policy logged_in_descriptions on public.work_descriptions using((select private.is_staff()) or (select private.has_family()));

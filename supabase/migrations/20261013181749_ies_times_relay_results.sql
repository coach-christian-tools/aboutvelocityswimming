-- Relay totals belong to a team; athlete participation is an ordered lineup.
-- Keep raw source observations and verification evidence in staff-only records.
create table public.relay_results (
 id text primary key,
 data jsonb not null check (jsonb_typeof(data)='object'),
 team_id text generated always as (data->>'teamId') stored not null references public.teams(id),
 meet_id text generated always as (data#>>'{meet,id}') stored references public.meets(id),
 event_code text generated always as (data->>'eventCode') stored not null,
 course text generated always as (data->>'course') stored not null,
 time_ms bigint generated always as (case when jsonb_typeof(data->'timeMs')='number' then (data->>'timeMs')::bigint else 0 end) stored,
 status text generated always as (coalesce(data->>'status','')) stored
);
alter table public.relay_results enable row level security;
create policy staff_read on public.relay_results for select to authenticated using ((select private.is_staff()));
revoke all on public.relay_results from anon,authenticated;
grant select on public.relay_results to anon,authenticated;
grant all on public.relay_results to service_role;
create index relay_results_team_meet_idx on public.relay_results(team_id,meet_id);
create index relay_results_members_idx on public.relay_results using gin ((data->'members'));

create table public.public_relay_results (
 id text primary key references public.relay_results(id) on delete cascade,
 team_id text not null references public.teams(id),
 swim_date text,
 data jsonb not null,
 times_course text generated always as (data->>'course') stored,
 times_event text generated always as (split_part(data->>'eventCode','_',1)||'_'||case when replace(split_part(data->>'eventCode','_',2),'-R','') in ('MED','IM') then 'MED-R' else replace(split_part(data->>'eventCode','_',2),'-R','')||'-R' end) stored,
 times_meet text generated always as (coalesce(nullif(data#>>'{meet,id}',''),coalesce(data#>>'{meet,name}','')||'_'||swim_date)) stored,
 times_time bigint generated always as (case when jsonb_typeof(data->'timeMs')='number' then (data->>'timeMs')::bigint else 0 end) stored
);
alter table public.public_relay_results enable row level security;
create policy public_read on public.public_relay_results for select to anon,authenticated using (true);
revoke all on public.public_relay_results from anon,authenticated;
grant select on public.public_relay_results to anon,authenticated;
grant all on public.public_relay_results to service_role;
create index public_relay_results_event_idx on public.public_relay_results(times_course,times_event,times_time,id);
create index public_relay_results_team_idx on public.public_relay_results(team_id,swim_date desc,id);
create index public_relay_results_meet_idx on public.public_relay_results(times_meet,id);
create index public_relay_results_members_idx on public.public_relay_results using gin ((data->'members'));

-- Rebuild each nested value from a fixed public field list, never JSON subtraction.
create function private.public_race_splits(body jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
  'distance',s->'distance','cumulativeMs',s->'cumulativeMs',
  'lapMs',case when jsonb_typeof(s->'lapMs')='number' then s->'lapMs' end)) order by ordinal),'[]'::jsonb)
 from jsonb_array_elements(case when jsonb_typeof(body->'splits')='array' then body->'splits' else '[]'::jsonb end) with ordinality as items(s,ordinal)
 where jsonb_typeof(s->'distance')='number' and (s->>'distance')::numeric>0
  and jsonb_typeof(s->'cumulativeMs')='number' and (s->>'cumulativeMs')::numeric>0;
$$;
create function private.public_relay_members(body jsonb) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
  'leg',m->'leg','athleteId',case when a.id is not null then to_jsonb(a.id) end,
  'name',coalesce(nullif(trim(coalesce(a.data#>>'{name,first}','')||' '||coalesce(a.data#>>'{name,last}','')),''),m->>'name','Name unavailable'),
  'gender',case when m->>'gender' in ('F','M','X') then m->'gender' end,
  'stroke',case when m->>'stroke' in ('FR','BK','BR','FL') then m->'stroke' end,
  'timeMs',case when jsonb_typeof(m->'timeMs')='number' then m->'timeMs' end,
  'leadOffEligible',case when jsonb_typeof(m->'leadOffEligible')='boolean' then m->'leadOffEligible' end)) order by (m->>'leg')::int),'[]'::jsonb)
 from jsonb_array_elements(case when jsonb_typeof(body->'members')='array' then body->'members' else '[]'::jsonb end) m
 left join public.public_athletes a on a.id=m->>'athleteId'
 where jsonb_typeof(m->'leg')='number' and m->>'leg' ~ '^[1-4]$';
$$;
revoke all on function private.public_race_splits(jsonb),private.public_relay_members(jsonb) from public,anon,authenticated;

-- The collector validates distance markers against evidence before proposing
-- splits. The database also rejects internally inconsistent approved timings.
create function private.validate_result_splits(body jsonb,total_distance integer,total_time bigint) returns void language plpgsql set search_path='' as $$
declare split jsonb; previous_distance integer:=0; previous_time bigint:=0; current_distance integer; split_ms bigint;
begin
 if body ? 'splits' then
  if jsonb_typeof(body->'splits') is distinct from 'array' or jsonb_array_length(body->'splits')>1000 then raise exception 'Invalid result splits'; end if;
  for split in select * from jsonb_array_elements(body->'splits') loop
   if jsonb_typeof(split->'distance') is distinct from 'number' or coalesce(split->>'distance','') !~ '^[0-9]{1,9}$'
    or jsonb_typeof(split->'cumulativeMs') is distinct from 'number' or coalesce(split->>'cumulativeMs','') !~ '^[0-9]{1,12}$' then raise exception 'Split distances and times must be positive integers'; end if;
   current_distance:=(split->>'distance')::integer; split_ms:=(split->>'cumulativeMs')::bigint;
   if current_distance<=previous_distance or current_distance>total_distance or split_ms<=previous_time or (total_time>0 and split_ms>total_time) then raise exception 'Split distances and cumulative times must increase within the result'; end if;
   if split ? 'lapMs' and (jsonb_typeof(split->'lapMs') is distinct from 'number' or coalesce(split->>'lapMs','') !~ '^[0-9]{1,12}$' or (split->>'lapMs')::bigint<>split_ms-previous_time) then raise exception 'Split elapsed time differs from cumulative timing'; end if;
   previous_distance:=current_distance; previous_time:=split_ms;
  end loop;
  if body->>'splitCoverage'='unavailable' and jsonb_array_length(body->'splits')>0 then raise exception 'Unavailable splits cannot include timings'; end if;
 end if;
 if body->>'splitCoverage'='complete' and (previous_distance=0 or previous_distance<>total_distance or previous_time<>total_time) then raise exception 'Complete splits must finish at the result distance and total'; end if;
end; $$;
revoke all on function private.validate_result_splits(jsonb,integer,bigint) from public,anon,authenticated;

create function private.validate_relay_result() returns trigger language plpgsql set search_path='' as $$
declare member jsonb; legs integer[]:='{}'; athlete_links text[]:='{}'; parent_lead public.swims;
begin
 if coalesce(new.data->>'course','') not in ('SCY','SCM','LCM') or coalesce(new.data->>'gender','') not in ('F','M','X')
  or coalesce(new.data->>'eventCode','') !~ '^[0-9]+_(FR-R|MED-R)_(SCY|SCM|LCM)$'
  or new.data->>'id' is distinct from new.id
  or coalesce(new.data->>'stroke','')<>(case when split_part(new.data->>'eventCode','_',2)='MED-R' then 'IM' else 'FR' end)
  or coalesce(new.data->>'round','') not in ('F','P','S','TT')
  or nullif(trim(new.data->>'relayName'),'') is null
  or split_part(new.data->>'eventCode','_',3)<>new.data->>'course'
  or coalesce(new.data->>'status','') not in ('OK','DQ','DFS','NS')
  or jsonb_typeof(new.data->'timeMs') is distinct from 'number' or coalesce(new.data->>'timeMs','') !~ '^[0-9]{1,9}$'
  or (new.data->>'status'='OK' and (new.data->>'timeMs')::bigint<=0)
  or jsonb_typeof(new.data->'isOfficial') is distinct from 'boolean'
  or jsonb_typeof(new.data->'distance') is distinct from 'number' or coalesce(new.data->>'distance','') !~ '^(100|200|400|800)$'
  or split_part(new.data->>'eventCode','_',1)<>new.data->>'distance'
  or jsonb_typeof(new.data->'members') is distinct from 'array' or jsonb_array_length(new.data->'members')>4
  or coalesce(new.data->>'splitCoverage','') not in ('complete','partial','unavailable') then raise exception 'Invalid relay result'; end if;
 if exists(select 1 from public.swims where id=new.id) then raise exception 'Relay and individual results require distinct identities'; end if;
 for member in select * from jsonb_array_elements(new.data->'members') loop
  if jsonb_typeof(member->'leg') is distinct from 'number' or member->>'leg' !~ '^[1-4]$'
   or (member->>'leg')::int=any(legs) or nullif(trim(member->>'name'),'') is null then raise exception 'Relay members require unique ordered legs and a public name'; end if;
  legs:=array_append(legs,(member->>'leg')::int);
  if nullif(member->>'athleteId','') is not null then
   if member->>'athleteId'=any(athlete_links) then raise exception 'Relay members require distinct athlete links'; end if;
   athlete_links:=array_append(athlete_links,member->>'athleteId');
  end if;
  if member ? 'timeMs' and (jsonb_typeof(member->'timeMs') is distinct from 'number' or coalesce(member->>'timeMs','') !~ '^[0-9]{1,9}$' or (member->>'timeMs')::bigint<=0 or ((new.data->>'timeMs')::bigint>0 and (member->>'timeMs')::bigint>(new.data->>'timeMs')::bigint)) then raise exception 'Invalid relay member timing'; end if;
  if member->>'leadOffEligible'='true' and (member->>'leg'<>'1' or nullif(member->>'athleteId','') is null) then raise exception 'Only a linked first member can have a verified lead-off'; end if;
  if nullif(member->>'athleteId','') is not null and not exists(select 1 from public.athletes where id=member->>'athleteId') then
   raise exception 'Approve athlete % before linking the relay member',member->>'athleteId' using errcode='23503';
  end if;
 end loop;
 perform private.validate_result_splits(new.data,(new.data->>'distance')::integer,(new.data->>'timeMs')::bigint);
 -- A lineup correction cannot detach an already verified lead-off result.
 for parent_lead in select * from public.swims where data->>'resultOrigin'='relay_leadoff' and data->>'parentRelayResultId'=new.id loop
  if parent_lead.course is distinct from new.data->>'course'
   or parent_lead.data->>'teamId' is distinct from new.data->>'teamId'
   or parent_lead.meet_id is distinct from new.data#>>'{meet,id}'
   or parent_lead.event_code is distinct from ((new.data->>'distance')::integer/4)::text||'_'||(case when split_part(new.data->>'eventCode','_',2)='MED-R' then 'BK' else 'FR' end)||'_'||(new.data->>'course')
   or not exists(select 1 from jsonb_array_elements(new.data->'members') m where m->>'leg'='1' and m->>'athleteId'=parent_lead.athlete_id and (m->>'timeMs' is null or (m->>'timeMs')::integer=parent_lead.time_ms)) then
   raise exception 'Correct or remove the verified lead-off before changing its relay member';
  end if;
 end loop;
 return new;
end; $$;
revoke all on function private.validate_relay_result() from public,anon,authenticated;
create trigger validate_relay_result before insert or update on public.relay_results for each row execute function private.validate_relay_result();

alter table public.swims add column parent_relay_result_id text generated always as (case when data->>'resultOrigin'='relay_leadoff' then data->>'parentRelayResultId' end) stored references public.relay_results(id);
create unique index swims_verified_relay_leadoff_idx on public.swims(parent_relay_result_id) where parent_relay_result_id is not null;
create function private.validate_relay_leadoff() returns trigger language plpgsql set search_path='' as $$
declare parent public.relay_results; leg_distance integer; lead_stroke text;
begin
 if exists(select 1 from public.relay_results where id=new.id) then raise exception 'Relay and individual results require distinct identities'; end if;
 if new.data ? 'splits' or new.data ? 'splitCoverage' then
  perform private.validate_result_splits(new.data,coalesce((new.data->>'distance')::integer,split_part(new.data->>'eventCode','_',1)::integer),(new.data->>'timeMs')::bigint);
 end if;
 if (new.data ? 'parentRelayResultId' or new.data ? 'leadOffVerification') and new.data->>'resultOrigin' is distinct from 'relay_leadoff' then raise exception 'Lead-off provenance requires its result origin'; end if;
 if new.data->>'resultOrigin'='relay_leadoff' then
  select * into parent from public.relay_results where id=new.data->>'parentRelayResultId';
  leg_distance:=split_part(parent.event_code,'_',1)::integer/4;
  lead_stroke:=case when replace(split_part(parent.event_code,'_',2),'-R','') in ('MED','IM') then 'BK' else 'FR' end;
  if parent.id is null or coalesce(new.data->>'isRelay','false')<>'false'
   or coalesce(new.data->>'isSplit','false')<>'false' or coalesce(new.data->>'isRelaySplit','false')<>'false'
   or new.data->>'status' is distinct from 'OK' or new.data->>'isOfficial' is distinct from 'true'
   or new.data#>>'{leadOffVerification,verified}' is distinct from 'true'
   or new.data#>>'{leadOffVerification,flatStart}' is distinct from 'true'
   or new.data#>>'{leadOffVerification,timingVerified}' is distinct from 'true'
   or new.data#>>'{leadOffVerification,leadOffStatus}' is distinct from 'OK'
   or coalesce(new.data#>>'{leadOffVerification,sourceUrl}','') !~ '^https?://[^[:space:]]+$'
   or coalesce(new.data#>>'{leadOffVerification,sourceUrl}','') ~ '^https?://[^/]*@'
   or new.data->>'eventCode' is distinct from leg_distance::text||'_'||lead_stroke||'_'||parent.course
   or new.data->>'distance' is distinct from leg_distance::text
   or new.data->>'stroke' is distinct from lead_stroke
   or new.data->>'course' is distinct from parent.course
   or new.data->>'teamId' is distinct from parent.team_id
   or new.data#>>'{meet,id}' is distinct from parent.meet_id
   or not exists(select 1 from jsonb_array_elements(parent.data->'members') m where m->>'leg'='1' and m->>'athleteId'=new.data->>'athleteId' and (m->>'timeMs' is null or m->>'timeMs'=new.data->>'timeMs')) then
   raise exception 'Relay lead-offs require a linked first member and independent verified flat-start timing evidence';
  end if;
 end if;
 return new;
end; $$;
revoke all on function private.validate_relay_leadoff() from public,anon,authenticated;
create trigger validate_relay_leadoff before insert or update on public.swims for each row execute function private.validate_relay_leadoff();

create function private.publish_relay_result() returns trigger language plpgsql security definer set search_path='' as $$
declare members jsonb:=private.public_relay_members(new.data);
begin
 insert into public.public_relay_results(id,team_id,swim_date,data)
 values(new.id,new.team_id,new.data#>>'{meet,date}',jsonb_strip_nulls(jsonb_build_object(
  'id',new.id,'eventCode',new.event_code,'course',new.course,'timeMs',new.time_ms,
  'timeDisplay',case when new.status='OK' and new.time_ms>0 then private.format_time(new.time_ms::integer) else new.status end,
  'status',new.status,'round',new.data->'round','isRelay',true,'isOfficial',new.data->'isOfficial',
  'teamId',new.team_id,'teamName',(select data->>'name' from public.teams where id=new.team_id),
  'gender',new.data->'gender','ageGroup',new.data->'ageGroup',
  'relay',jsonb_build_object('teamName',coalesce(new.data#>>'{relay,teamName}',new.data->>'relayName'),'leg',null),
  'meet',jsonb_build_object('id',new.meet_id,'name',new.data#>>'{meet,name}','date',new.data#>>'{meet,date}'),
  'members',members,'lineupCoverage',case when jsonb_array_length(members)=4 and not exists(select 1 from jsonb_array_elements(members) m where nullif(m->>'athleteId','') is null) then 'complete' when jsonb_array_length(members)>0 then 'partial' else 'unavailable' end,'splits',private.public_race_splits(new.data),
  'splitCoverage',new.data->'splitCoverage')))
 on conflict(id) do update set team_id=excluded.team_id,swim_date=excluded.swim_date,data=excluded.data;
 return new;
end; $$;
revoke all on function private.publish_relay_result() from public,anon,authenticated;
create trigger publish_relay_result after insert or update on public.relay_results for each row execute function private.publish_relay_result();

create function private.public_swim_data(s public.swims) returns jsonb language sql stable set search_path='' as $$
 select jsonb_strip_nulls(jsonb_build_object('id',s.id,'athleteId',s.athlete_id,'eventCode',s.event_code,'course',s.course,
  'timeMs',s.time_ms,'timeDisplay',case when s.time_ms>0 then private.format_time(s.time_ms) else s.status end,
  'status',s.status,'round',s.round,'isRelay',s.is_relay,'isOfficial',s.is_official,
  'gender',s.data->'gender','ageAtSwim',s.data->'ageAtSwim','ageGroup',s.data->'ageGroup',
  'isSplit',s.data->'isSplit','isRelaySplit',s.data->'isRelaySplit',
  'relay',case when s.data ? 'relay' then jsonb_strip_nulls(jsonb_build_object('teamName',s.data#>'{relay,teamName}','leg',s.data#>'{relay,leg}','isLeadOffFlatStart',s.data#>'{relay,isLeadOffFlatStart}')) end,
  'teamId',s.data->>'teamId','teamName',(select t.data->>'name' from public.teams t where t.id=s.data->>'teamId'),
  'meet',jsonb_build_object('id',s.meet_id,'name',s.data#>>'{meet,name}','date',s.data#>>'{meet,date}'),
  'splits',private.public_race_splits(s.data),'splitCoverage',case when s.data->>'splitCoverage' in ('complete','partial','unavailable') then s.data->'splitCoverage' else '"unavailable"'::jsonb end,
  'resultOrigin',case when s.data->>'resultOrigin'='relay_leadoff' then '"relay_leadoff"'::jsonb end,
  'parentRelayResultId',case when s.data->>'resultOrigin'='relay_leadoff' then s.data->'parentRelayResultId' end));
$$;
revoke all on function private.public_swim_data(public.swims) from public,anon,authenticated;
create or replace function private.publish_swim() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.public_swims(id,athlete_id,swim_date,data) values(new.id,new.athlete_id,new.data#>>'{meet,date}',private.public_swim_data(new))
 on conflict(id) do update set athlete_id=excluded.athlete_id,swim_date=excluded.swim_date,data=excluded.data;
 return new;
end; $$;
revoke all on function private.publish_swim() from public,anon,authenticated;
update public.public_swims p set data=private.public_swim_data(s) from public.swims s where s.id=p.id and p.data is distinct from private.public_swim_data(s);

create or replace function private.refresh_public_team_name() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.public_swims set data=data||jsonb_build_object('teamName',new.data->>'name') where data->>'teamId'=new.id and data->>'teamName' is distinct from new.data->>'name';
 update public.public_relay_results set data=data||jsonb_build_object('teamName',new.data->>'name') where team_id=new.id and data->>'teamName' is distinct from new.data->>'name';
 return new;
end; $$;
revoke all on function private.refresh_public_team_name() from public,anon,authenticated;


CREATE OR REPLACE VIEW "public"."app_records" WITH (security_invoker=true) AS  SELECT ('teams/'::text || teams.id) AS path,
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
   FROM public.administrators
UNION ALL SELECT 'relay_results/'||r.id,r.data FROM public.relay_results r;


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
 if root=any(array['teams','people','athletes','families','venues','meets','swims','relay_results','standards','practice_sessions','attendance','postings','registrations','manual_hours','work_descriptions','documents','public_athletes']) and array_length(string_to_array(record_path,'/'),1)=2 then
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

-- Each approval checks every collected read. Avoid scanning the app_records
-- UNION for a swim path; the underlying swims primary key is already indexed.
-- Keep invoker security, RLS, and the existing snapshot shape unchanged.
CREATE OR REPLACE FUNCTION private.collection_snapshot(record_path text)
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
 when record_path='relay_results/'||split_part(record_path,'/',2) then
  (select data from public.relay_results where id=split_part(record_path,'/',2))
 when record_path='swims/'||split_part(record_path,'/',2) then
  (select data from public.swims where id=split_part(record_path,'/',2))
 else (select data from public.app_records where path=record_path) end;
$function$;


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
     or (batch->>'division'='times' and root=any(array['athletes','swims','relay_results','meets','teams','venues']))
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
    or (batch->>'division'='times' and root=any(array['athletes','swims','relay_results','meets','teams','venues']))
    or (batch->>'division'='knowledge' and root='knowledge_entries')) then raise exception 'Record outside collection division'; end if;
  paths:=array_append(paths,w->>'path');
  current_data:=private.collection_snapshot(w->>'path');
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

-- Raw timing splits must never create precomputed individual bests.
CREATE OR REPLACE FUNCTION private.rebuild_bests()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  SET work_mem TO '64MB'
  AS $function$
begin
 insert into public.athlete_bests as existing(athlete_id,event_code,data)
 select b.athlete_id,b.event_code,jsonb_build_object('eventCode',b.event_code,'distance',b.data->'distance','stroke',b.data->'stroke','course',b.course,'gender',b.data->>'gender','bestTimeMs',b.time_ms,'bestTimeDisplay',private.format_time(b.time_ms),'swimDate',b.data#>>'{meet,date}','meetName',b.data#>>'{meet,name}','swimId',b.id,'standard',coalesce(b.data#>>'{standardsTag,usasMotivational}',''),'ageWhenSwum',b.data->'ageAtSwim','clubRankAllTime',rank() over(partition by b.event_code,b.course,b.data->>'gender' order by b.time_ms),'clubRankActiveRoster',case when a.data->>'status'='active' then (select count(distinct faster.athlete_id)+1 from public.swims faster join public.athletes fa on fa.id=faster.athlete_id where faster.status='OK' and coalesce(faster.data->>'isSplit','false')='false' and coalesce(faster.data->>'isRelaySplit','false')='false' and faster.event_code=b.event_code and faster.course=b.course and faster.data->>'gender'=b.data->>'gender' and faster.time_ms<b.time_ms and fa.data->>'status'='active' and coalesce(faster.data->>'isOfficial','true')='true' and (coalesce(faster.data->>'isRelay','false')='false' or faster.data#>>'{relay,isLeadOffFlatStart}'='true')) else null end)
 from (select distinct on(athlete_id,event_code) * from public.swims where status='OK' and coalesce(data->>'isSplit','false')='false' and coalesce(data->>'isRelaySplit','false')='false' and coalesce(data->>'isOfficial','true')='true' and (coalesce(data->>'isRelay','false')='false' or data#>>'{relay,isLeadOffFlatStart}'='true') order by athlete_id,event_code,time_ms,data#>>'{meet,date}',id) b join public.athletes a on a.id=b.athlete_id
 on conflict (athlete_id,event_code) do update set data=excluded.data
 where existing.data is distinct from excluded.data;
 -- Keep the original eligibility rules when removing bests with no candidate.
 delete from public.athlete_bests best where not exists(
  select 1 from public.swims s where s.athlete_id=best.athlete_id
   and s.event_code=best.event_code and s.status='OK' and coalesce(s.data->>'isSplit','false')='false' and coalesce(s.data->>'isRelaySplit','false')='false'
   and coalesce(s.data->>'isOfficial','true')='true'
   and (coalesce(s.data->>'isRelay','false')='false'
    or s.data#>>'{relay,isLeadOffFlatStart}'='true')
 );
 return;
end; $function$;

CREATE OR REPLACE FUNCTION private.rebuild_bests_for_events(event_codes text[])
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  SET work_mem TO '64MB'
  AS $function$
begin
 insert into public.athlete_bests as existing(athlete_id,event_code,data)
 select b.athlete_id,b.event_code,jsonb_build_object('eventCode',b.event_code,'distance',b.data->'distance','stroke',b.data->'stroke','course',b.course,'gender',b.data->>'gender','bestTimeMs',b.time_ms,'bestTimeDisplay',private.format_time(b.time_ms),'swimDate',b.data#>>'{meet,date}','meetName',b.data#>>'{meet,name}','swimId',b.id,'standard',coalesce(b.data#>>'{standardsTag,usasMotivational}',''),'ageWhenSwum',b.data->'ageAtSwim','clubRankAllTime',rank() over(partition by b.event_code,b.course,b.data->>'gender' order by b.time_ms),'clubRankActiveRoster',case when a.data->>'status'='active' then (select count(distinct faster.athlete_id)+1 from public.swims faster join public.athletes fa on fa.id=faster.athlete_id where faster.status='OK' and coalesce(faster.data->>'isSplit','false')='false' and coalesce(faster.data->>'isRelaySplit','false')='false' and faster.event_code=b.event_code and faster.course=b.course and faster.data->>'gender'=b.data->>'gender' and faster.time_ms<b.time_ms and fa.data->>'status'='active' and coalesce(faster.data->>'isOfficial','true')='true' and (coalesce(faster.data->>'isRelay','false')='false' or faster.data#>>'{relay,isLeadOffFlatStart}'='true')) else null end)
 from (select distinct on(athlete_id,event_code) * from public.swims where event_code=any(event_codes) and status='OK' and coalesce(data->>'isSplit','false')='false' and coalesce(data->>'isRelaySplit','false')='false' and coalesce(data->>'isOfficial','true')='true' and (coalesce(data->>'isRelay','false')='false' or data#>>'{relay,isLeadOffFlatStart}'='true') order by athlete_id,event_code,time_ms,data#>>'{meet,date}',id) b join public.athletes a on a.id=b.athlete_id
 on conflict (athlete_id,event_code) do update set data=excluded.data
 where existing.data is distinct from excluded.data;
 -- Keep the original eligibility rules when removing bests with no candidate.
 delete from public.athlete_bests best where best.event_code=any(event_codes) and not exists(
  select 1 from public.swims s where s.athlete_id=best.athlete_id
   and s.event_code=best.event_code and s.status='OK' and coalesce(s.data->>'isSplit','false')='false' and coalesce(s.data->>'isRelaySplit','false')='false'
   and coalesce(s.data->>'isOfficial','true')='true'
   and (coalesce(s.data->>'isRelay','false')='false'
    or s.data#>>'{relay,isLeadOffFlatStart}'='true')
 );
 return;
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
declare b public.collection_batches; r jsonb; actual jsonb; affected_events text[];
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
  if b.division='times' and exists(select 1 from jsonb_array_elements(b.writes) w where split_part(w->>'path','/',1)<>'relay_results') then
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

-- Staff queue metadata must not carry every raw record and snapshot.
-- Full evidence and comparisons remain on collection_batches, fetched by ID.
CREATE OR REPLACE FUNCTION private.collection_review_summary(value jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT CASE WHEN value IS NULL OR value = 'null'::jsonb THEN 'null'::jsonb ELSE
  jsonb_strip_nulls(jsonb_build_object(
   'name', value->'name', 'title', value->'title', 'gaps', value->'gaps',
   'teamId', value->'teamId', 'hostTeamId', value->'hostTeamId',
   'venueId', value->'venueId', 'athleteId', value->'athleteId',
   'parentRelayResultId',value->'parentRelayResultId','resultOrigin',value->'resultOrigin',
   'eventCode',value->'eventCode','timeMs',value->'timeMs','splitCoverage',value->'splitCoverage',
   'members',case when jsonb_typeof(value->'members')='array' then (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('leg',m->'leg','athleteId',m->'athleteId','name',m->'name'))),'[]'::jsonb) from jsonb_array_elements(value->'members') m) end,
   'meet', CASE WHEN value ? 'meet' THEN jsonb_strip_nulls(jsonb_build_object(
      'id', value#>'{meet,id}', 'name', value#>'{meet,name}', 'date', value#>'{meet,date}')) ELSE NULL END
  )) END;
$$;

alter table public.collection_batches alter column review_priority set expression as (
 case when jsonb_path_exists(writes, '$[*] ? (@.path like_regex "^(teams|venues|meets)/")') then 0
 when jsonb_path_exists(writes, '$[*] ? (@.path like_regex "^athletes/")') then 1
 when jsonb_path_exists(writes, '$[*] ? (@.path like_regex "^relay_results/")') then 2
 when jsonb_path_exists(writes, '$[*] ? (@.path like_regex "^swims/")') then 3 else 4 end
);


create or replace view public.ies_times_races with (security_invoker=true) as
select s.id,case when s.times_relay and s.times_leg is null then ''::text else s.athlete_id end as athlete_id,s.swim_date as date,s.times_course as course,s.times_event as event,s.times_time as time,
 coalesce(s.data->>'status','') as status,coalesce(s.data->>'round','') as round,s.times_team as team,
 coalesce(s.data->>'teamName','') as team_name,case when s.data->>'gender' in ('F','M','X') then s.data->>'gender' else '' end as gender,
 case when jsonb_typeof(s.data->'ageAtSwim')='number' and (s.data->>'ageAtSwim')::numeric>=0 and trunc((s.data->>'ageAtSwim')::numeric)=(s.data->>'ageAtSwim')::numeric then (s.data->>'ageAtSwim')::int end as age,
 case when jsonb_typeof(s.data->'isOfficial')='boolean' then (s.data->>'isOfficial')::boolean end as official,
 s.times_relay as relay,
 s.times_leg as relay_leg,
 coalesce(s.data#>>'{relay,teamName}','') as relay_name,coalesce(s.data->>'ageGroup','') as relay_age,
 s.times_split as split,
 s.times_meet as meet_id,coalesce(nullif(s.data#>>'{meet,name}',''),'Unnamed meet') as meet,
 coalesce(nullif(trim(coalesce(a.data#>>'{name,first}','')||' '||coalesce(a.data#>>'{name,last}','')),''),s.athlete_id) as athlete_name
from public.public_swims s join public.public_athletes a on a.id=s.athlete_id
union all
select s.id,''::text as athlete_id,s.swim_date,s.times_course,s.times_event,s.times_time,
 coalesce(s.data->>'status',''),coalesce(s.data->>'round',''),s.team_id,coalesce(s.data->>'teamName',''),
 case when s.data->>'gender' in ('F','M','X') then s.data->>'gender' else '' end,null::integer,
 case when jsonb_typeof(s.data->'isOfficial')='boolean' then (s.data->>'isOfficial')::boolean end,true,null::integer,
 coalesce(s.data#>>'{relay,teamName}',''),coalesce(s.data->>'ageGroup',''),false,
 s.times_meet,coalesce(nullif(s.data#>>'{meet,name}',''),'Unnamed meet'),''::text
from public.public_relay_results s;


create or replace function public.ies_times_json(r public.ies_times_races) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'athleteId',r.athlete_id,'athleteName',r.athlete_name,'date',r.date,'event',r.event,'course',r.course,'time',r.time,'status',r.status,'round',r.round,'team',r.team,'teamName',r.team_name,'gender',r.gender,'ageAtSwim',r.age,'official',r.official,'relay',r.relay,'relayLeg',r.relay_leg,'relayName',r.relay_name,'relayAgeGroup',r.relay_age,'split',r.split,'meetId',r.meet_id,'meet',r.meet) || coalesce((select jsonb_strip_nulls(jsonb_build_object('members',p.data->'members','lineupCoverage',p.data->'lineupCoverage','splits',p.data->'splits','splitCoverage',p.data->'splitCoverage','resultOrigin',p.data->'resultOrigin','parentRelayResultId',p.data->'parentRelayResultId')) from (select data from public.public_relay_results where id=r.id union all select data from public.public_swims where id=r.id) p limit 1),'{}'::jsonb);
$$;

create or replace function public.ies_times_query(query_kind text,input jsonb default '{}') returns jsonb language plpgsql stable set search_path='' set extra_float_digits=3 as $$
declare answer jsonb; start_at int:=coalesce((input->>'offset')::int,0); size int:=coalesce((input->>'limit')::int,25); needle text:=lower(trim(coalesce(input->>'search',''))); chosen public.ies_times_races; benchmark jsonb; today text:=to_char(current_timestamp at time zone 'America/Los_Angeles','YYYY-MM-DD'); cutoff text;
begin
 if start_at<0 or size not between 1 and 100 or length(needle)>100 then raise exception 'Invalid pagination or search'; end if;
 if query_kind='facets' then
 select jsonb_build_object('teams',(select coalesce(jsonb_agg(jsonb_build_array(id,name) order by name,id),'[]') from public.public_times_teams),
 'events',(select coalesce(jsonb_agg(event order by event),'[]') from (select distinct r.event from public.ies_times_races r join public.public_times_teams t on t.id=r.team where not r.relay) e),
 'relayEvents',(select coalesce(jsonb_agg(event order by event),'[]') from (select distinct r.event from public.ies_times_races r join public.public_times_teams t on t.id=r.team where r.relay and r.relay_leg is null) e),
 'years',(select coalesce(jsonb_agg(year order by year desc),'[]') from (select distinct left(r.date,4) as year from public.ies_times_races r join public.public_times_teams t on t.id=r.team) y),
 'relayAges',(select coalesce(jsonb_agg(age order by age),'[]') from (select distinct r.relay_age as age from public.ies_times_races r join public.public_times_teams t on t.id=r.team where r.relay and r.relay_age<>'' and r.status='OK' and r.time>0 and r.relay_leg is null) a)) into answer;
 elsif query_kind='rankings' then
 with eligible as (select r.* from public.ies_times_filtered(input) r where r.status='OK' and r.time>0 and not r.split and r.relay_leg is null),
 best as (select e.*,row_number() over(partition by athlete_id,event,course order by time,date desc,id) as pick from eligible e),
 selected as (select b.* from best b where input->>'mode'='performances' or b.relay or pick=1),
 ranked as (select s.*,rank() over(order by time) as position from selected s),
 searched as (select r.* from ranked r where needle='' or position(needle in lower(case when relay then coalesce(nullif(relay_name,''),team_name||' relay') else athlete_name end))>0),
 page as (select * from searched order by time,case when input->>'mode'='performances' or relay then id else athlete_id end,id limit size offset start_at)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('race',public.ies_times_json(r),'rank',p.position) order by p.time,case when input->>'mode'='performances' or p.relay then p.id else p.athlete_id end,p.id) from page p join public.ies_times_races r on r.id=p.id),'[]'),'total',(select count(*) from searched)) into answer;
 elsif query_kind='race' then
 select jsonb_build_object('rows',coalesce(jsonb_agg(jsonb_build_object('race',public.ies_times_json(r))),'[]'),'total',count(*)) into answer from public.ies_times_races r join public.public_times_teams t on t.id=r.team where r.id=input->>'raceId';
 elsif query_kind='analysis' then
 select * into chosen from public.ies_times_races where id=input->>'raceId';
 with eligible as (select r.* from public.ies_times_filtered(input||jsonb_build_object('event',chosen.event,'course',chosen.course,'relay',chosen.relay)) r where r.status='OK' and r.time>0 and not r.split and r.relay_leg is null),
 best as (select e.*,row_number() over(partition by athlete_id,event,course order by time,date desc,id) as pick from eligible e),
 cohort as (select * from best where chosen.relay or input->>'basis'='swims' or pick=1),
 counts as (select count(*) as n,count(*) filter(where time<chosen.time) as faster,count(*) filter(where time=chosen.time) as tied,count(*) filter(where time>chosen.time) as slower from cohort)
 select jsonb_build_object('count',n,'stats',case when n>0 and not chosen.relay and not chosen.split and chosen.relay_leg is null and chosen.status='OK' and chosen.time>0 then jsonb_build_object('value',((slower::double precision+tied::double precision/2)/n::double precision)*100,'count',n,'faster',faster,'tied',tied,'slower',slower,'rank',faster+1) else null end) into answer from counts;
 elsif query_kind='meets' then
 with all_meets as (select r.meet_id as id,max(r.meet) as name,max(r.date) as date,count(*) as count,jsonb_agg(distinct r.course) as courses from public.ies_times_races r join public.public_times_teams t on t.id=r.team group by r.meet_id),
 searched as (select * from all_meets where needle='' or position(needle in lower(name))>0), page as (select * from searched order by date desc,name,id limit size offset start_at)
 select jsonb_build_object('meets',coalesce((select jsonb_agg(to_jsonb(p) order by p.date desc,p.name,p.id) from page p),'[]'),'total',(select count(*) from searched)) into answer;
 elsif query_kind='meet_results' then
 with matching as (select * from public.ies_times_filtered(input) where meet_id=input->>'meetId'), page as (select * from matching order by event,time,id limit size offset start_at)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('race',public.ies_times_json(p)) order by p.event,p.time,p.id) from page p),'[]'),'total',(select count(*) from matching),
 'meet',(select jsonb_build_object('id',meet_id,'name',max(meet),'date',max(date),'count',count(*),'courses',jsonb_agg(distinct course)) from public.ies_times_races r join public.public_times_teams t on t.id=r.team where meet_id=input->>'meetId' group by meet_id)) into answer;
 elsif query_kind='profile' then
 with swims as (select * from public.ies_times_races where athlete_id=input->>'athleteId' and not relay),
 best as (select s.*,row_number() over(partition by event,course order by time,date desc,id) as pick from swims s where status='OK' and time>0 and not split and relay_leg is null)
 select jsonb_build_object('name',(select coalesce(nullif(trim(coalesce(data#>>'{name,first}','')||' '||coalesce(data#>>'{name,last}','')),''),id) from public.public_athletes where id=input->>'athleteId'),
 'count',(select count(*) from swims),'relayCount',(select count(*) from public.public_relay_results rr join public.public_times_teams t on t.id=rr.team_id where rr.data->'members' @> jsonb_build_array(jsonb_build_object('athleteId',input->>'athleteId'))),'pbs',coalesce((select jsonb_agg(public.ies_times_json(r) order by b.course,split_part(b.event,'_',1)::int,b.event) from best b join public.ies_times_races r on r.id=b.id where pick=1),'[]'),
 'events',coalesce((select jsonb_agg(key order by key) from (select distinct event||'_'||course as key from swims) e),'[]')) into answer;
 elsif query_kind='athlete_relays' then
 with matching as (select r.* from public.ies_times_races r join public.public_relay_results rr on rr.id=r.id join public.public_times_teams t on t.id=r.team where rr.data->'members' @> jsonb_build_array(jsonb_build_object('athleteId',input->>'athleteId'))),
 page as (select * from matching order by date desc,id limit size offset start_at)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('race',public.ies_times_json(p)) order by p.date desc,p.id) from page p),'[]'),'total',(select count(*) from matching)) into answer;
 elsif query_kind='athlete_history' then
 with matching as (select * from public.ies_times_races where athlete_id=input->>'athleteId' and not relay and event||'_'||course=input->>'historyEvent'),
 page as (select * from matching order by date desc,id limit size offset start_at),
 daily as (select m.*,row_number() over(partition by left(date,10) order by time,id) as pick from matching m where status='OK' and time>0 and not split and relay_leg is null)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('race',public.ies_times_json(p)) order by p.date desc,p.id) from page p),'[]'),'total',(select count(*) from matching),
 'points',coalesce((select jsonb_agg(public.ies_times_json(r) order by d.date,d.id) from daily d join public.ies_times_races r on r.id=d.id where pick=1),'[]')) into answer;
 elsif query_kind='records' then
 with eligible as (
 select s.id,s.athlete_id,s.date,s.course,s.event,s.time,s.relay,s.gender,
  public.ies_times_age(s.age,s.relay,s.relay_age) as age_group
 from public.ies_times_races s join public.public_times_teams t on t.id=s.team
 where s.team=input->>'team' and s.status='OK' and s.time>0 and s.gender in ('F','M','X') and not s.split and s.relay_leg is null
 ),
 fastest as (select e.*,min(time) over(partition by course,event,gender,age_group) as fastest from eligible e where age_group<>''),
 holders as (select f.*,row_number() over(partition by course,event,gender,age_group,case when relay then id else athlete_id end order by date,id) as pick from fastest f where time=fastest)
 select jsonb_build_object('races',coalesce(jsonb_agg(public.ies_times_json(r) order by h.course,h.event,h.gender,h.date,h.id),'[]')) into answer from holders h join public.ies_times_races r on r.id=h.id where pick=1;
 elsif query_kind='athletes' then
 select data into benchmark from public.standards where data->>'governingBody'='USA_Swimming' and data->>'category'='motivational' and data->>'effectiveDate'<=today and data->>'expirationDate'>=today order by data->>'effectiveDate' desc,id limit 1;
 cutoff:=to_char((today::date-interval '1 year')::date,'YYYY-MM-DD');
 -- Score only eligible event bests, retaining latest-day evidence across courses
 -- and teams before resolving affiliation, demographics, or conflicts.
 with individual as (select r.* from public.ies_times_races r where not relay and relay_leg is null and not split and left(date,10)<=today and (input->>'period'='all' or left(date,10)>=cutoff)),
 latest as (select athlete_id,max(left(date,10)) as date from individual group by athlete_id),
 ids as (select distinct r.athlete_id from individual r join latest l on l.athlete_id=r.athlete_id where r.team=input->>'team' and (input->>'period'='all' or left(r.date,10)=l.date)),
 candidate as (select r.* from individual r join ids on ids.athlete_id=r.athlete_id join latest l on l.athlete_id=r.athlete_id where (r.team=input->>'team' or (input->>'period'<>'all' and l.date=left(r.date,10))) and exists(select 1 from public.public_times_teams t where t.id=input->>'team')),
 best as (select distinct on (athlete_id,team,public.ies_times_age(c.age,c.relay,c.relay_age),gender,event,course) c.id from candidate c where status='OK' and time>0 and official=true and team=input->>'team' and course=input->>'course' order by athlete_id,team,public.ies_times_age(c.age,c.relay,c.relay_age),gender,event,course,time,date desc,id),
 last_bucket as (select distinct on (athlete_id,team,public.ies_times_age(c.age,c.relay,c.relay_age),gender) c.id from candidate c where input->>'period'='all' order by athlete_id,team,public.ies_times_age(c.age,c.relay,c.relay_age),gender,date desc,id),
 keep as (select id from best union select id from last_bucket union select c.id from candidate c join latest l on l.athlete_id=c.athlete_id where input->>'period'<>'all' and left(c.date,10)=l.date),
 cohort as (select c.* from candidate c join keep using(id)),
 recent_state as (
  select c.athlete_id,max(c.athlete_name) as name,l.date as latest_date,
   count(distinct jsonb_build_array(c.team,c.age,c.gender))>1 as conflict,
   case when count(distinct jsonb_build_array(c.team,c.age,c.gender))>1 then '' else max(public.ies_times_age(c.age,c.relay,c.relay_age)) end as age_group,
   case when count(distinct jsonb_build_array(c.team,c.age,c.gender))>1 then '' else max(c.gender) end as gender
  from cohort c join latest l on l.athlete_id=c.athlete_id and left(c.date,10)=l.date
  where input->>'period'<>'all' group by c.athlete_id,l.date
 ),
 historical_state as (
  select c.athlete_id,max(c.athlete_name) as name,max(c.date) as latest_date,false as conflict,public.ies_times_age(c.age,c.relay,c.relay_age) as age_group,c.gender
  from cohort c where input->>'period'='all' and c.team=input->>'team' group by c.athlete_id,public.ies_times_age(c.age,c.relay,c.relay_age),c.gender
 ),
 state as (select * from recent_state union all select * from historical_state),
 event_best as (
  select distinct on (s.athlete_id,s.age_group,s.gender,c.event) s.athlete_id,s.age_group,s.gender,s.conflict,c.id,c.event,c.time
  from state s join cohort c on c.athlete_id=s.athlete_id and c.team=input->>'team'
   and (s.conflict or (public.ies_times_age(c.age,c.relay,c.relay_age)=s.age_group and c.gender=s.gender))
  where c.course=input->>'course' and c.status='OK' and c.time>0 and c.official=true
  order by s.athlete_id,s.age_group,s.gender,c.event,c.time,c.date desc,c.id
 ),
 benchmarked as (
  select e.*,cut.time as standard_time,
   case when not e.conflict and e.age_group<>'' and e.gender in ('F','M') and cut.time>0
    then 100.0::double precision*cut.time::double precision/e.time::double precision end as event_score
  from event_best e left join lateral (
   select case when jsonb_typeof(value->'timeMs')='number' then (value->>'timeMs')::numeric end as time
   from jsonb_array_elements(coalesce(benchmark#>array['cuts',input->>'course',e.gender,case when e.age_group in ('8&U','9-10') then '10&U' else e.age_group end,e.event||'_'||(input->>'course'),'cutsByTier'],'[]')) with ordinality
   where value->>'tierName'='A' order by ordinality limit 1
  ) cut on true
 ),
 event_order as (
  select b.*,row_number() over(partition by athlete_id,age_group,gender order by event_score desc,event) as event_position
  from benchmarked b where event_score is not null
 ),
 scores as (
  select s.*,
   (select count(*) from event_best e where e.athlete_id=s.athlete_id and e.age_group=s.age_group and e.gender=s.gender) as eligible_count,
   exists(select 1 from benchmarked b where b.athlete_id=s.athlete_id and b.age_group=s.age_group and b.gender=s.gender and coalesce(b.standard_time,0)<=0) as missing_cut,
   (select count(*) from event_order e where e.athlete_id=s.athlete_id and e.age_group=s.age_group and e.gender=s.gender and e.event_position<=3) as event_count,
   (select floor(avg(event_score)*10+0.5)/10 from event_order e where e.athlete_id=s.athlete_id and e.age_group=s.age_group and e.gender=s.gender and e.event_position<=3) as score,
   coalesce((select jsonb_agg(jsonb_build_object('race',public.ies_times_json(r),'standardTime',e.standard_time,'score',e.event_score) order by e.event_score desc,e.event)
    from event_order e join public.ies_times_races r on r.id=e.id where e.athlete_id=s.athlete_id and e.age_group=s.age_group and e.gender=s.gender and e.event_position<=3),'[]') as events
  from state s
 ),
 classified as (
  select s.*,case when event_count=3 then 'ranked' when event_count>0 then 'provisional' else 'unscored' end as status,
   to_jsonb(array_remove(array[
    case when benchmark is null then 'Current verified motivational standards unavailable.' end,
    case when conflict then 'Latest-day records disagree on team, age, or gender.' end,
    case when age_group='' then 'Recorded age group unavailable.' end,
    case when gender not in ('F','M') then 'Gender benchmark unavailable.' end,
    case when not conflict and benchmark is not null and age_group<>'' and gender in ('F','M') and missing_cut then 'Some events have no matching A standard.' end,
    case when eligible_count=0 then 'No eligible official '||(input->>'course')||' results in this group and period.' end
   ],null)) as reasons
  from scores s
 ),
 ranked as (select c.*,rank() over(partition by age_group,gender,status order by score desc) as position from classified c),
 grouped as (
  select age_group,gender,jsonb_agg(jsonb_build_object('id',athlete_id,'name',name,'ageGroup',age_group,'gender',gender,'latestDate',latest_date,'score',score,'status',status,'events',events,'reasons',reasons)
   ||case when status='ranked' then jsonb_build_object('rank',position) else '{}'::jsonb end
   order by case status when 'ranked' then 0 when 'provisional' then 1 else 2 end,score desc nulls last,name,athlete_id) as athletes
  from ranked group by age_group,gender
 ),
 labeled as (select *,case age_group when '8&U' then '8 & under' when '9-10' then '9–10' when '11-12' then '11–12' when '13-14' then '13–14' when '15-16' then '15–16' when '17-18' then '17–18' when '19&O' then '19 & over' else 'Age unavailable' end as label,
  case age_group when '8&U' then 0 when '9-10' then 1 when '11-12' then 2 when '13-14' then 3 when '15-16' then 4 when '17-18' then 5 when '19&O' then 6 else 99 end as age_order from grouped)
 select jsonb_build_object('groups',coalesce(jsonb_agg(jsonb_build_object('ageGroup',age_group,'label',label,'gender',gender,'athletes',athletes) order by age_order,gender),'[]'),
  'standardName',benchmark->>'name','standardAvailable',benchmark is not null) into answer from labeled;
 else raise exception 'Unknown times view'; end if;
 return answer;
end; $$;

revoke all on function public.ies_times_query(text,jsonb) from public;
grant execute on function public.ies_times_query(text,jsonb) to anon,authenticated;
notify pgrst, 'reload schema';

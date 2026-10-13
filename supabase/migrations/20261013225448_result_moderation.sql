-- A result can belong to every enclosing category without duplicating the race.
-- Keep ies_times_age unchanged for athlete scores and age-specific standards.
create or replace function public.ies_times_age_range(age_group text) returns int4range
language plpgsql immutable security invoker set search_path='' as $$
declare key text:=upper(regexp_replace(age_group,'[[:space:]]','','g')); parts text[];
begin
 if key='OPEN' then return int4range(0,null,'[]'); end if;
 parts:=regexp_match(key,'^([0-9]{1,3})[-–]([0-9]{1,3})$');
 if parts is not null then
  if parts[1]::int>parts[2]::int then return null; end if;
  return int4range(parts[1]::int,parts[2]::int,'[]');
 end if;
 parts:=regexp_match(key,'^([0-9]{1,3})&(U|O)$');
 if parts is null then return null; end if;
 return case when parts[2]='U' then int4range(0,parts[1]::int,'[]') else int4range(parts[1]::int,null,'[]') end;
end; $$;
revoke all on function public.ies_times_age_range(text) from public;
grant execute on function public.ies_times_age_range(text) to anon,authenticated,service_role;

create or replace function public.ies_times_age_matches(age integer,relay boolean,relay_age text,groups jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
 select coalesce(jsonb_array_length(groups),0)=0 or exists (
  select 1 from jsonb_array_elements_text(groups) g(age_group)
  where case when relay then nullif(relay_age,'') is not null and (
   relay_age=g.age_group or public.ies_times_age_range(g.age_group) @> public.ies_times_age_range(relay_age)
  ) else age is not null and public.ies_times_age_range(g.age_group) @> age end
 );
$$;
revoke all on function public.ies_times_age_matches(integer,boolean,text,jsonb) from public;
grant execute on function public.ies_times_age_matches(integer,boolean,text,jsonb) to anon,authenticated,service_role;


-- Moderation survives collector upserts. Only the public decision is exposed;
-- reasons, notes, reviewer identity and source snapshots stay in private.
create table public.result_moderation (
 result_type text not null check (result_type in ('swim','relay')),
 result_id text not null,
 flagged boolean not null,
 version integer not null check (version > 0),
 primary key(result_type,result_id)
);
alter table public.result_moderation enable row level security;
revoke all on public.result_moderation from public,anon,authenticated;
grant select on public.result_moderation to anon,authenticated;
create policy public_status on public.result_moderation for select to anon,authenticated using (true);

create table private.result_moderation_events (
 result_type text not null,
 result_id text not null,
 version integer not null,
 action text not null check (action in ('flag','restore')),
 reason text,
 note text not null,
 actor_id uuid not null,
 actor_email text not null,
 created_at timestamptz not null default now(),
 snapshot jsonb not null,
 primary key(result_type,result_id,version)
);
alter table private.result_moderation_events enable row level security;
revoke all on private.result_moderation_events from public,anon,authenticated;
create function private.keep_moderation_history() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Moderation history is immutable'; end; $$;
revoke all on function private.keep_moderation_history() from public,anon,authenticated;
create trigger immutable_moderation_history before update or delete on private.result_moderation_events
 for each row execute function private.keep_moderation_history();

create function public.result_is_excluded(kind text,rid text,parent_id text default null)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.result_moderation m where m.flagged
  and ((m.result_type=kind and m.result_id=rid) or (m.result_type='relay' and m.result_id=parent_id)));
$$;
revoke all on function public.result_is_excluded(text,text,text) from public;
grant execute on function public.result_is_excluded(text,text,text) to anon,authenticated,service_role;

create view public.unflagged_times_swims with (security_invoker=true) as
 select s.* from public.public_swims s where not public.result_is_excluded('swim',s.id,s.data->>'parentRelayResultId');
create view public.unflagged_times_relays with (security_invoker=true) as
 select s.* from public.public_relay_results s where not public.result_is_excluded('relay',s.id);
revoke all on public.unflagged_times_swims,public.unflagged_times_relays from public,anon,authenticated;
grant select on public.unflagged_times_swims,public.unflagged_times_relays to anon,authenticated,service_role;
create view private.unflagged_swims with (security_invoker=true) as
 select s.* from public.swims s where not public.result_is_excluded('swim',s.id,s.data->>'parentRelayResultId');
revoke all on private.unflagged_swims from public,anon,authenticated;

create function public.race_moderation(r public.ies_times_races) returns jsonb
language sql stable security invoker set search_path='' as $$
 with identity as (
  select case when r.athlete_id='' and r.relay then 'relay' else 'swim' end as kind,
   (select s.data->>'parentRelayResultId' from public.public_swims s where s.id=r.id and s.athlete_id=r.athlete_id) as parent_id
 ), state as (
  select *,public.result_is_excluded(kind,r.id,parent_id) as excluded from identity
 )
 select jsonb_build_object('resultType',kind,'moderationStatus',case when excluded then 'flagged' else 'clear' end,
  'moderationInherited',coalesce(public.result_is_excluded('relay',parent_id),false),
  'calculationEligible',not excluded and r.status='OK' and r.time>0 and not r.split and r.relay_leg is null)
 from state;
$$;
revoke all on function public.race_moderation(public.ies_times_races) from public;
grant execute on function public.race_moderation(public.ies_times_races) to anon,authenticated,service_role;


-- Every derived calculation uses moderation before picking winners.
create or replace function public.ies_times_json(r public.ies_times_races) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'athleteId',case when r.relay and r.relay_leg is null then '' else r.athlete_id end,'athleteName',r.athlete_name,'date',r.date,'event',r.event,'course',r.course,'time',r.time,'status',r.status,'round',r.round,'team',r.team,'teamName',r.team_name,'gender',r.gender,'ageAtSwim',r.age,'official',r.official,'relay',r.relay,'relayLeg',r.relay_leg,'relayName',r.relay_name,'relayAgeGroup',r.relay_age,'split',r.split,'meetId',r.meet_id,'meet',r.meet) || coalesce((select jsonb_strip_nulls(jsonb_build_object('members',p.data->'members','lineupCoverage',p.data->'lineupCoverage','splits',p.data->'splits','splitCoverage',p.data->'splitCoverage','resultOrigin',p.data->'resultOrigin','parentRelayResultId',p.data->'parentRelayResultId')) from (select data from public.public_relay_results where id=r.id union all select data from public.public_swims where id=r.id) p limit 1),'{}'::jsonb) || public.race_moderation(r);
$$;

create or replace function public.ies_times_candidates(input jsonb)
returns table(id text,athlete_id text,date text,course text,event text,"time" bigint,relay boolean,search_name text)
language plpgsql stable security invoker set search_path='' set plan_cache_mode='force_custom_plan' as $$
declare relay_only boolean:=coalesce((input->>'relay')::boolean,false);
 needle text:=lower(trim(coalesce(input->>'search','')));
begin
 if relay_only then
  return query
  select s.id,''::text,s.swim_date,s.times_course,s.times_event,s.times_time,true,
   case when needle='' then '' else coalesce(nullif(s.data#>>'{relay,teamName}',''),coalesce(s.data->>'teamName','')||' relay') end
  from public.unflagged_times_relays s join public.public_times_teams t on t.id=s.team_id
  where s.data->>'status'='OK' and s.times_time>0
   and (coalesce(input->>'team','')='' or s.team_id=input->>'team')
   and (coalesce(input->>'course','')='' or s.times_course=input->>'course')
   and (coalesce(input->>'event','')='' or s.times_event=input->>'event')
   and (coalesce(input->>'year','')='' or left(s.swim_date,4)=input->>'year')
   and (coalesce(input->>'round','')='' or coalesce(s.data->>'round','')=input->>'round')
   and (coalesce(input->>'official','')='' or (s.data->>'isOfficial')::boolean=(input->>'official'='official'))
   and (not (input ? 'genders') or input->'genders' ? coalesce(s.data->>'gender',''))
   and public.ies_times_age_matches(null,true,coalesce(s.data->>'ageGroup',''),input->'ageGroups')
  union all
  select s.id,s.athlete_id,s.swim_date,s.times_course,s.times_event,s.times_time,true,
   case when needle='' then '' else coalesce(nullif(s.data#>>'{relay,teamName}',''),coalesce(s.data->>'teamName','')||' relay') end
  from public.unflagged_times_swims s join public.public_times_teams t on t.id=s.times_team
  join public.public_athletes a on a.id=s.athlete_id
  where s.times_relay and s.times_leg is null and not s.times_split and s.times_status='OK' and s.times_time>0
   and (coalesce(input->>'team','')='' or s.times_team=input->>'team')
   and (coalesce(input->>'course','')='' or s.times_course=input->>'course')
   and (coalesce(input->>'event','')='' or s.times_event=input->>'event')
   and (coalesce(input->>'year','')='' or left(s.swim_date,4)=input->>'year')
   and (coalesce(input->>'round','')='' or coalesce(s.data->>'round','')=input->>'round')
   and (coalesce(input->>'official','')='' or s.times_official=(input->>'official'='official'))
   and (not (input ? 'genders') or input->'genders' ? s.times_gender)
   and public.ies_times_age_matches(null,true,coalesce(s.data->>'ageGroup',''),input->'ageGroups');
 else
  return query
  select s.id,s.athlete_id,s.swim_date,s.times_course,s.times_event,s.times_time,false,
   case when needle='' then '' else coalesce(nullif(trim(coalesce(a.data#>>'{name,first}','')||' '||coalesce(a.data#>>'{name,last}','')),''),s.athlete_id) end
  from public.unflagged_times_swims s join public.public_times_teams t on t.id=s.times_team
  join public.public_athletes a on a.id=s.athlete_id
  where not s.times_relay and s.times_leg is null and not s.times_split and s.times_status='OK' and s.times_time>0
   and (coalesce(input->>'team','')='' or s.times_team=input->>'team')
   and (coalesce(input->>'course','')='' or s.times_course=input->>'course')
   and (coalesce(input->>'event','')='' or s.times_event=input->>'event')
   and (coalesce(input->>'year','')='' or left(s.swim_date,4)=input->>'year')
   and (coalesce(input->>'round','')='' or coalesce(s.data->>'round','')=input->>'round')
   and (coalesce(input->>'official','')='' or s.times_official=(input->>'official'='official'))
   and (not (input ? 'genders') or input->'genders' ? s.times_gender)
   and public.ies_times_age_matches(s.times_age,false,'',input->'ageGroups');
 end if;
end; $$;

create or replace function public.ies_times_query(query_kind text,input jsonb default '{}') returns jsonb language plpgsql stable set search_path='' set extra_float_digits=3 set plan_cache_mode='force_custom_plan' as $$
declare answer jsonb; start_at int:=coalesce((input->>'offset')::int,0); size int:=coalesce((input->>'limit')::int,25); needle text:=lower(trim(coalesce(input->>'search',''))); chosen public.ies_times_races; benchmark jsonb; today text:=to_char(current_timestamp at time zone 'America/Los_Angeles','YYYY-MM-DD'); cutoff text;
begin
 if start_at<0 or size not between 1 and 100 or length(needle)>100 then raise exception 'Invalid pagination or search'; end if;
 if query_kind='facets' then
 with individual as materialized (
  select s.times_event as event,left(s.swim_date,4) as year
  from public.public_swims s join public.public_times_teams t on t.id=s.times_team where not s.times_relay
 ), legacy_relays as materialized (
  select s.times_event as event,left(s.swim_date,4) as year,s.times_leg as leg,coalesce(s.data->>'ageGroup','') as age,
   s.times_status='OK' and s.times_time>0 as eligible
  from public.public_swims s join public.public_times_teams t on t.id=s.times_team where s.times_relay
 ), relays as materialized (
  select s.times_event as event,left(s.swim_date,4) as year,coalesce(s.data->>'ageGroup','') as age,
   s.data->>'status'='OK' and s.times_time>0 as eligible
  from public.public_relay_results s join public.public_times_teams t on t.id=s.team_id
 )
 select jsonb_build_object('teams',(select coalesce(jsonb_agg(jsonb_build_array(id,name) order by name,id),'[]') from public.public_times_teams),
  'events',(select coalesce(jsonb_agg(event order by event),'[]') from (select distinct event from individual) e),
  'relayEvents',(select coalesce(jsonb_agg(event order by event),'[]') from (select event from relays union select event from legacy_relays where leg is null) e),
  'years',(select coalesce(jsonb_agg(year order by year desc),'[]') from (select year from individual union select year from relays union select year from legacy_relays) y),
  'relayAges',(select coalesce(jsonb_agg(age order by age),'[]') from (select age from relays where eligible and age<>'' union select age from legacy_relays where eligible and leg is null and age<>'') a)) into answer;
 elsif query_kind='rankings' then
 with eligible as materialized (select * from public.ies_times_candidates(input)),
 best as (select e.*,row_number() over(partition by athlete_id,event,course order by time,date desc,id) as pick from eligible e),
 selected as (select b.* from best b where input->>'mode'='performances' or b.relay or pick=1),
 ranked as (select s.*,rank() over(order by time) as position from selected s),
 searched as (select r.* from ranked r where needle='' or position(needle in lower(search_name))>0),
 page as (select * from searched order by time,case when input->>'mode'='performances' or relay then id else athlete_id end,id limit size offset start_at)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('race',public.ies_times_json_id(p.id),'rank',p.position) order by p.time,case when input->>'mode'='performances' or p.relay then p.id else p.athlete_id end,p.id) from page p),'[]'),'total',(select count(*) from searched)) into answer;
 elsif query_kind='race' then
 select jsonb_build_object('rows',coalesce(jsonb_agg(jsonb_build_object('race',public.ies_times_json(r))),'[]'),'total',count(*)) into answer from public.ies_times_races r join public.public_times_teams t on t.id=r.team where r.id=input->>'raceId';
 elsif query_kind='analysis' then
 select * into chosen from public.ies_times_races where id=input->>'raceId';
 with eligible as (select * from public.ies_times_candidates(input||jsonb_build_object('event',chosen.event,'course',chosen.course,'relay',chosen.relay))),
 best as (select e.*,row_number() over(partition by athlete_id,event,course order by time,date desc,id) as pick from eligible e),
 cohort as (select * from best where chosen.relay or input->>'basis'='swims' or pick=1),
 counts as (select count(*) as n,count(*) filter(where time<chosen.time) as faster,count(*) filter(where time=chosen.time) as tied,count(*) filter(where time>chosen.time) as slower from cohort)
 select jsonb_build_object('count',n,'stats',case when n>0 and not chosen.relay and not chosen.split and chosen.relay_leg is null and chosen.status='OK' and chosen.time>0 and public.race_moderation(chosen)->>'moderationStatus'='clear' then jsonb_build_object('value',((slower::double precision+tied::double precision/2)/n::double precision)*100,'count',n,'faster',faster,'tied',tied,'slower',slower,'rank',faster+1) else null end) into answer from counts;
 elsif query_kind='meets' then
 with all_meets as (
  select r.meet_id as id,max(r.meet) as name,max(r.date) as date,count(*) as count,jsonb_agg(distinct r.course) as courses,
   bool_or((coalesce(input->>'course','')='' or r.course=input->>'course')
    and (coalesce(input->>'year','')='' or left(r.date,4)=input->>'year')) as matches_filters
  from public.ies_times_races r join public.public_times_teams t on t.id=r.team group by r.meet_id
 ), searched as (
  select id,name,date,count,courses from all_meets
  where matches_filters and (needle='' or position(needle in lower(name))>0)
 ), page as (select * from searched order by date desc,name,id limit size offset start_at)
 select jsonb_build_object('meets',coalesce((select jsonb_agg(to_jsonb(p) order by p.date desc,p.name,p.id) from page p),'[]'),'total',(select count(*) from searched)) into answer;
 elsif query_kind='meet_results' then
 -- Put the meet predicate inside both indexed source branches. The full-race
 -- filtering function otherwise expands every meet before its caller filters.
 with in_meet as materialized (
  select s.id,s.times_event as event,s.times_time as time,s.swim_date as date,s.times_course as course,s.times_team as team,
   case when coalesce(input->>'round','')='' then '' else coalesce(s.data->>'round','') end as round,s.times_official as official,s.times_gender as gender,s.times_age as age,
   s.times_relay as relay,s.times_leg as relay_leg,case when s.times_relay and coalesce(jsonb_array_length(input->'ageGroups'),0)>0 then coalesce(s.data->>'ageGroup','') else '' end as relay_age,
   s.times_meet_name as meet
  from public.public_swims s join public.public_athletes a on a.id=s.athlete_id
  join public.public_times_teams t on t.id=s.times_team where s.times_meet=input->>'meetId'
  union all
  select s.id,s.times_event,s.times_time,s.swim_date,s.times_course,s.team_id,coalesce(s.data->>'round',''),
   case when jsonb_typeof(s.data->'isOfficial')='boolean' then (s.data->>'isOfficial')::boolean end,
   case when s.data->>'gender' in ('F','M','X') then s.data->>'gender' else '' end,null::integer,true,null::integer,
   coalesce(s.data->>'ageGroup',''),coalesce(nullif(s.data#>>'{meet,name}',''),'Unnamed meet')
  from public.public_relay_results s join public.public_times_teams t on t.id=s.team_id where s.times_meet=input->>'meetId'
 ), matching as (
  select m.id,m.event,m.time from in_meet m
  where (coalesce(input->>'team','')='' or m.team=input->>'team')
   and (coalesce(input->>'course','')='' or m.course=input->>'course')
   and (coalesce(input->>'event','')='' or m.event=input->>'event')
   and (coalesce(input->>'year','')='' or left(m.date,4)=input->>'year')
   and (coalesce(input->>'round','')='' or m.round=input->>'round')
   and (coalesce(input->>'official','')='' or m.official=(input->>'official'='official'))
   and (not (input ? 'genders') or input->'genders' ? m.gender)
   and public.ies_times_age_matches(m.age,m.relay,m.relay_age,input->'ageGroups')
   and m.relay=coalesce((input->>'relay')::boolean,false) and (not m.relay or m.relay_leg is null)
 ), page as (select * from matching order by event,time,id limit size offset start_at)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('race',public.ies_times_json_id(p.id)) order by p.event,p.time,p.id) from page p),'[]'),
  'total',(select count(*) from matching),
  'meet',(select jsonb_build_object('id',input->>'meetId','name',max(m.meet),'date',max(m.date),'count',count(*),'courses',jsonb_agg(distinct m.course)) from in_meet m having count(*)>0)) into answer;
 elsif query_kind='profile' then
 with swims as materialized (
  select s.id,s.times_event as event,s.times_course as course,s.times_time as time,s.swim_date as date,s.times_status as status,s.times_split as split,s.times_leg as relay_leg,public.result_is_excluded('swim',s.id,s.data->>'parentRelayResultId') as excluded
  from public.public_swims s join public.public_athletes a on a.id=s.athlete_id
  where s.athlete_id=input->>'athleteId' and not s.times_relay
 ), best as (select s.*,row_number() over(partition by event,course order by time,date desc,id) as pick from swims s where not excluded and status='OK' and time>0 and not split and relay_leg is null)
 select jsonb_build_object('name',(select coalesce(nullif(trim(coalesce(data#>>'{name,first}','')||' '||coalesce(data#>>'{name,last}','')),''),id) from public.public_athletes where id=input->>'athleteId'),
 'count',(select count(*) from swims),'relayCount',(select count(*) from public.public_relay_results rr join public.public_times_teams t on t.id=rr.team_id where rr.data->'members' @> jsonb_build_array(jsonb_build_object('athleteId',input->>'athleteId'))),'pbs',coalesce((select jsonb_agg(public.ies_times_json_id(b.id) order by b.course,split_part(b.event,'_',1)::int,b.event) from best b where pick=1),'[]'),
 'events',coalesce((select jsonb_agg(key order by key) from (select distinct event||'_'||course as key from swims) e),'[]')) into answer;
 elsif query_kind='athlete_relays' then
 -- Count and paginate only matching approved team relays. Do not expand the
 -- individual race UNION or fetch athlete/source JSON for participation counts.
 with matching as materialized (
  select rr.id,rr.swim_date as date from public.public_relay_results rr
  join public.public_times_teams t on t.id=rr.team_id
  where rr.data->'members' @> jsonb_build_array(jsonb_build_object('athleteId',input->>'athleteId'))
 ), page as (select * from matching order by date desc,id limit size offset start_at)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('race',jsonb_build_object(
  'id',rr.id,'athleteId','','athleteName','','date',rr.swim_date,'event',rr.times_event,'course',rr.times_course,'time',rr.times_time,
  'status',coalesce(rr.data->>'status',''),'round',coalesce(rr.data->>'round',''),'team',rr.team_id,'teamName',coalesce(rr.data->>'teamName',''),
  'gender',coalesce(rr.data->>'gender',''),'ageAtSwim',null,'official',rr.data->'isOfficial','relay',true,'relayLeg',null,
  'relayName',coalesce(rr.data#>>'{relay,teamName}',''),'relayAgeGroup',coalesce(rr.data->>'ageGroup',''),'split',false,
  'meetId',rr.times_meet,'meet',coalesce(nullif(rr.data#>>'{meet,name}',''),'Unnamed meet'),
  'members',coalesce(rr.data->'members','[]'),'lineupCoverage',rr.data->'lineupCoverage',
  'splits',coalesce(rr.data->'splits','[]'),'splitCoverage',rr.data->'splitCoverage',
  'resultType','relay','moderationStatus',case when public.result_is_excluded('relay',rr.id) then 'flagged' else 'clear' end,
  'moderationInherited',false,'calculationEligible',not public.result_is_excluded('relay',rr.id) and rr.data->>'status'='OK' and rr.times_time>0)) order by p.date desc,p.id)
  from page p join public.public_relay_results rr on rr.id=p.id),'[]'),'total',(select count(*) from matching)) into answer;
 elsif query_kind='athlete_history' then
 with matching as (select * from public.ies_times_races where athlete_id=input->>'athleteId' and not relay and event||'_'||course=input->>'historyEvent'),
 page as (select * from matching order by date desc,id limit size offset start_at),
 daily as (select m.*,row_number() over(partition by left(date,10) order by time,id) as pick from matching m where public.race_moderation(m)->>'moderationStatus'='clear' and status='OK' and time>0 and not split and relay_leg is null)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('race',public.ies_times_json(p)) order by p.date desc,p.id) from page p),'[]'),'total',(select count(*) from matching),
 'points',coalesce((select jsonb_agg(public.ies_times_json_id(d.id) order by d.date,d.id) from daily d where pick=1),'[]')) into answer;
 elsif query_kind='records' then
 with eligible as (
  select s.id,s.athlete_id,s.swim_date as date,s.times_course as course,s.times_event as event,s.times_time as time,false as relay,s.times_gender as gender,
   s.times_age as age,''::text as relay_age
  from public.unflagged_times_swims s join public.public_times_teams t on t.id=s.times_team
  where s.times_team=input->>'team' and s.times_status='OK' and s.times_time>0 and s.times_gender in ('F','M','X')
   and not s.times_relay and s.times_leg is null and not s.times_split
  union all
  select s.id,''::text,s.swim_date,s.times_course,s.times_event,s.times_time,true,s.times_gender,null::integer,coalesce(s.data->>'ageGroup','')
  from public.unflagged_times_swims s join public.public_times_teams t on t.id=s.times_team
  where s.times_team=input->>'team' and s.times_status='OK' and s.times_time>0 and s.times_gender in ('F','M','X')
   and s.times_relay and s.times_leg is null and not s.times_split
  union all
  select s.id,''::text,s.swim_date,s.times_course,s.times_event,s.times_time,true,s.data->>'gender',null::integer,coalesce(s.data->>'ageGroup','')
  from public.unflagged_times_relays s join public.public_times_teams t on t.id=s.team_id
  where s.team_id=input->>'team' and s.data->>'status'='OK' and s.times_time>0 and s.data->>'gender' in ('F','M','X')
 ),
 groups as (
  select unnest(array['8&U','9-10','11-12','13-14','15-16','17-18','19&O','10&U','12&U','13&O','15&O','Open']) as age_group
  union select relay_age from eligible where relay and relay_age<>''
 ), categorized as (
  select e.*,g.age_group from eligible e join groups g
   on public.ies_times_age_matches(e.age,e.relay,e.relay_age,jsonb_build_array(g.age_group))
 ),
 fastest as (select e.*,min(time) over(partition by course,event,gender,age_group) as fastest from categorized e),
 holders as (select f.*,row_number() over(partition by course,event,gender,age_group,case when relay then id else athlete_id end order by date,id) as pick from fastest f where time=fastest),
 winners as (select distinct id,course,event,gender,date from holders where pick=1)
 select jsonb_build_object('races',coalesce(jsonb_agg(public.ies_times_json_id(h.id) order by h.course,h.event,h.gender,h.date,h.id),'[]')) into answer from winners h;
 elsif query_kind='athletes' then
 select data into benchmark from public.standards where data->>'governingBody'='USA_Swimming' and data->>'category'='motivational' and data->>'effectiveDate'<=today and data->>'expirationDate'>=today order by data->>'effectiveDate' desc,id limit 1;
 cutoff:=to_char((today::date-interval '1 year')::date,'YYYY-MM-DD');
 -- Score only eligible event bests, retaining latest-day evidence across courses
 -- and teams before resolving affiliation, demographics, or conflicts.
 with individual as materialized (
  select r.id,r.athlete_id,r.swim_date as date,r.times_course as course,r.times_event as event,r.times_time as time,
   r.times_status as status,r.times_team as team,r.times_gender as gender,r.times_age as age,r.times_official as official,
   false as relay,''::text as relay_age
  from public.unflagged_times_swims r
  where not r.times_relay and r.times_leg is null and not r.times_split and left(r.swim_date,10)<=today
   and (input->>'period'='all' or left(r.swim_date,10)>=cutoff)
   and exists(select 1 from public.public_athletes a where a.id=r.athlete_id)
 ),
 latest as (select athlete_id,max(left(date,10)) as date from individual group by athlete_id),
 ids as (select distinct r.athlete_id from individual r join latest l on l.athlete_id=r.athlete_id where r.team=input->>'team' and (input->>'period'='all' or left(r.date,10)=l.date)),
 candidate as (
  select r.*,coalesce(nullif(trim(coalesce(a.data#>>'{name,first}','')||' '||coalesce(a.data#>>'{name,last}','')),''),r.athlete_id) as athlete_name
  from individual r join ids on ids.athlete_id=r.athlete_id join latest l on l.athlete_id=r.athlete_id
  join public.public_athletes a on a.id=r.athlete_id where (r.team=input->>'team' or (input->>'period'<>'all' and l.date=left(r.date,10))) and exists(select 1 from public.public_times_teams t where t.id=input->>'team')),
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
   coalesce((select jsonb_agg(jsonb_build_object('race',public.ies_times_json_id(e.id),'standardTime',e.standard_time,'score',e.event_score) order by e.event_score desc,e.event)
    from event_order e where e.athlete_id=s.athlete_id and e.age_group=s.age_group and e.gender=s.gender and e.event_position<=3),'[]') as events
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

create or replace function private.rebuild_bests()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  SET work_mem TO '64MB'
  AS $function$
begin
 insert into public.athlete_bests as existing(athlete_id,event_code,data)
 select b.athlete_id,b.event_code,jsonb_build_object('eventCode',b.event_code,'distance',b.data->'distance','stroke',b.data->'stroke','course',b.course,'gender',b.data->>'gender','bestTimeMs',b.time_ms,'bestTimeDisplay',private.format_time(b.time_ms),'swimDate',b.data#>>'{meet,date}','meetName',b.data#>>'{meet,name}','swimId',b.id,'standard',coalesce(b.data#>>'{standardsTag,usasMotivational}',''),'ageWhenSwum',b.data->'ageAtSwim','clubRankAllTime',rank() over(partition by b.event_code,b.course,b.data->>'gender' order by b.time_ms),'clubRankActiveRoster',case when a.data->>'status'='active' then (select count(distinct faster.athlete_id)+1 from private.unflagged_swims faster join public.athletes fa on fa.id=faster.athlete_id where faster.status='OK' and coalesce(faster.data->>'isSplit','false')='false' and coalesce(faster.data->>'isRelaySplit','false')='false' and faster.event_code=b.event_code and faster.course=b.course and faster.data->>'gender'=b.data->>'gender' and faster.time_ms<b.time_ms and fa.data->>'status'='active' and coalesce(faster.data->>'isOfficial','true')='true' and (coalesce(faster.data->>'isRelay','false')='false' or faster.data#>>'{relay,isLeadOffFlatStart}'='true')) else null end)
 from (select distinct on(athlete_id,event_code) * from private.unflagged_swims where status='OK' and coalesce(data->>'isSplit','false')='false' and coalesce(data->>'isRelaySplit','false')='false' and coalesce(data->>'isOfficial','true')='true' and (coalesce(data->>'isRelay','false')='false' or data#>>'{relay,isLeadOffFlatStart}'='true') order by athlete_id,event_code,time_ms,data#>>'{meet,date}',id) b join public.athletes a on a.id=b.athlete_id
 on conflict (athlete_id,event_code) do update set data=excluded.data
 where existing.data is distinct from excluded.data;
 -- Keep the original eligibility rules when removing bests with no candidate.
 delete from public.athlete_bests best where not exists(
  select 1 from private.unflagged_swims s where s.athlete_id=best.athlete_id
   and s.event_code=best.event_code and s.status='OK' and coalesce(s.data->>'isSplit','false')='false' and coalesce(s.data->>'isRelaySplit','false')='false'
   and coalesce(s.data->>'isOfficial','true')='true'
   and (coalesce(s.data->>'isRelay','false')='false'
    or s.data#>>'{relay,isLeadOffFlatStart}'='true')
 );
 return;
end; $function$;

create or replace function private.rebuild_bests_for_events(event_codes text[])
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  SET work_mem TO '64MB'
  AS $function$
begin
 insert into public.athlete_bests as existing(athlete_id,event_code,data)
 select b.athlete_id,b.event_code,jsonb_build_object('eventCode',b.event_code,'distance',b.data->'distance','stroke',b.data->'stroke','course',b.course,'gender',b.data->>'gender','bestTimeMs',b.time_ms,'bestTimeDisplay',private.format_time(b.time_ms),'swimDate',b.data#>>'{meet,date}','meetName',b.data#>>'{meet,name}','swimId',b.id,'standard',coalesce(b.data#>>'{standardsTag,usasMotivational}',''),'ageWhenSwum',b.data->'ageAtSwim','clubRankAllTime',rank() over(partition by b.event_code,b.course,b.data->>'gender' order by b.time_ms),'clubRankActiveRoster',case when a.data->>'status'='active' then (select count(distinct faster.athlete_id)+1 from private.unflagged_swims faster join public.athletes fa on fa.id=faster.athlete_id where faster.status='OK' and coalesce(faster.data->>'isSplit','false')='false' and coalesce(faster.data->>'isRelaySplit','false')='false' and faster.event_code=b.event_code and faster.course=b.course and faster.data->>'gender'=b.data->>'gender' and faster.time_ms<b.time_ms and fa.data->>'status'='active' and coalesce(faster.data->>'isOfficial','true')='true' and (coalesce(faster.data->>'isRelay','false')='false' or faster.data#>>'{relay,isLeadOffFlatStart}'='true')) else null end)
 from (select distinct on(athlete_id,event_code) * from private.unflagged_swims where event_code=any(event_codes) and status='OK' and coalesce(data->>'isSplit','false')='false' and coalesce(data->>'isRelaySplit','false')='false' and coalesce(data->>'isOfficial','true')='true' and (coalesce(data->>'isRelay','false')='false' or data#>>'{relay,isLeadOffFlatStart}'='true') order by athlete_id,event_code,time_ms,data#>>'{meet,date}',id) b join public.athletes a on a.id=b.athlete_id
 on conflict (athlete_id,event_code) do update set data=excluded.data
 where existing.data is distinct from excluded.data;
 -- Keep the original eligibility rules when removing bests with no candidate.
 delete from public.athlete_bests best where best.event_code=any(event_codes) and not exists(
  select 1 from private.unflagged_swims s where s.athlete_id=best.athlete_id
   and s.event_code=best.event_code and s.status='OK' and coalesce(s.data->>'isSplit','false')='false' and coalesce(s.data->>'isRelaySplit','false')='false'
   and coalesce(s.data->>'isOfficial','true')='true'
   and (coalesce(s.data->>'isRelay','false')='false'
    or s.data#>>'{relay,isLeadOffFlatStart}'='true')
 );
 return;
end; $function$;

-- Staff-only entry points: invoker wrappers call checked private definer functions.
create function private.read_result_moderation(kind text,rid text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare raw jsonb; state public.result_moderation; history jsonb; sources jsonb; race jsonb;
begin
 if not private.is_staff() then raise insufficient_privilege using message='Verified staff access required'; end if;
 if kind='swim' then select data into raw from public.swims where id=rid;
 elsif kind='relay' then select data into raw from public.relay_results where id=rid;
 else raise exception 'Invalid result type' using errcode='22023'; end if;
 if raw is null and not exists(select 1 from private.result_moderation_events where result_type=kind and result_id=rid) then
  raise exception 'Result not found' using errcode='P0002'; end if;
 select * into state from public.result_moderation where result_type=kind and result_id=rid;
 select coalesce(jsonb_agg(to_jsonb(e)-'snapshot' order by version desc),'[]') into history
 from private.result_moderation_events e where result_type=kind and result_id=rid;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]') into sources from (
  select source_url,evidence,captured_at from public.collection_batches
  where writes @> jsonb_build_array(jsonb_build_object('path',case kind when 'swim' then 'swims/' else 'relay_results/' end||rid))
  order by captured_at desc limit 3
 ) s;
 select public.ies_times_json(r) into race from public.ies_times_races r where r.id=rid and
  (case when r.athlete_id='' and r.relay then 'relay' else 'swim' end)=kind;
 return jsonb_build_object('resultType',kind,'resultId',rid,'version',coalesce(state.version,0),
  'flagged',coalesce(state.flagged,false),'available',raw is not null,'race',race,'history',history,'sources',sources,
  'sourceData',raw,'originalSnapshot',(select snapshot from private.result_moderation_events where result_type=kind and result_id=rid order by version limit 1));
end; $$;
revoke all on function private.read_result_moderation(text,text) from public,anon,authenticated;
grant execute on function private.read_result_moderation(text,text) to authenticated;
create function public.read_result_moderation(result_type text,result_id text) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.read_result_moderation(result_type,result_id); $$;
revoke all on function public.read_result_moderation(text,text) from public,anon;
grant execute on function public.read_result_moderation(text,text) to authenticated;

create function private.list_result_moderation(page_from integer,page_size integer,include_restored boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_staff() then raise insufficient_privilege using message='Verified staff access required'; end if;
 if page_from is null or page_size is null or page_from<0 or page_size not between 1 and 50 then raise exception 'Invalid pagination' using errcode='22023'; end if;
 return jsonb_build_object('total',(select count(*) from public.result_moderation where flagged or include_restored),
 'results',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc,p.result_type,p.result_id) from (
  select m.*,e.reason,e.note,e.created_at,public.ies_times_json_id(m.result_id) as race
  from public.result_moderation m join private.result_moderation_events e using(result_type,result_id,version)
  where m.flagged or include_restored order by e.created_at desc,m.result_type,m.result_id limit page_size offset page_from
 ) p),'[]'));
end; $$;
revoke all on function private.list_result_moderation(integer,integer,boolean) from public,anon,authenticated;
grant execute on function private.list_result_moderation(integer,integer,boolean) to authenticated;
create function public.list_result_moderation(page_from integer default 0,page_size integer default 25,include_restored boolean default false) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.list_result_moderation(page_from,page_size,include_restored); $$;
revoke all on function public.list_result_moderation(integer,integer,boolean) from public,anon;
grant execute on function public.list_result_moderation(integer,integer,boolean) to authenticated;

create function private.moderate_result(kind text,rid text,decision text,reason_code text,review_note text,expected_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare raw jsonb; current_version integer; current_flag boolean; events text[];
begin
 if not private.is_staff() then raise insufficient_privilege using message='Verified staff access required'; end if;
 if kind is null or kind not in ('swim','relay') or rid is null or length(rid) not between 1 and 200
  or decision is null or decision not in ('flag','restore') or expected_version is null or expected_version<0
  or review_note is null or length(review_note)>4000 then raise exception 'Invalid moderation request' using errcode='22023'; end if;
 review_note:=trim(review_note);
 if decision='flag' and (reason_code is null or reason_code not in ('incorrect_time','incorrect_event_course','incorrect_swimmer_age','duplicate','other')) then
  raise exception 'Choose a reason' using errcode='22023'; end if;
 if (decision='restore' or reason_code='other') and review_note='' then raise exception 'An explanation is required' using errcode='22023'; end if;
 -- Share the import lock: moderation, source snapshots and bests commit together.
 perform pg_advisory_xact_lock(hashtext('velocity-records'));
 if kind='swim' then select data into raw from public.swims where id=rid;
 else select data into raw from public.relay_results where id=rid; end if;
 if raw is null then raise exception 'Result not found' using errcode='P0002'; end if;
 select version,flagged into current_version,current_flag from public.result_moderation where result_type=kind and result_id=rid;
 if coalesce(current_version,0)<>expected_version or coalesce(current_flag,false)=(decision='flag') then
  raise exception 'This result changed. Refresh before reviewing it again.' using errcode='40001'; end if;
 current_version:=coalesce(current_version,0)+1;
 insert into public.result_moderation values(kind,rid,decision='flag',current_version)
 on conflict(result_type,result_id) do update set flagged=excluded.flagged,version=excluded.version;
 insert into private.result_moderation_events(result_type,result_id,version,action,reason,note,actor_id,actor_email,snapshot)
 values(kind,rid,current_version,decision,case when decision='flag' then reason_code end,review_note,auth.uid(),
  (select email from auth.users where id=auth.uid()),raw);
 select array_agg(distinct event_code) into events from public.swims
 where (kind='swim' and id=rid) or (kind='relay' and data->>'parentRelayResultId'=rid);
 if events is not null then perform private.rebuild_bests_for_events(events); end if;
 return private.read_result_moderation(kind,rid);
end; $$;
revoke all on function private.moderate_result(text,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function private.moderate_result(text,text,text,text,text,integer) to authenticated;
create function public.moderate_result(result_type text,result_id text,action text,reason text,note text,expected_version integer) returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.moderate_result(result_type,result_id,action,reason,note,expected_version); $$;
revoke all on function public.moderate_result(text,text,text,text,text,integer) from public,anon;
grant execute on function public.moderate_result(text,text,text,text,text,integer) to authenticated;

notify pgrst, 'reload schema';

;

-- Publish only normalized event metadata; provenance remains private.
create function private.public_meet_event_metadata(d jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare n text:=d#>>'{sourceObservation,eventNumber}'; lo text:=d#>>'{sourceObservation,ageMinimum}'; hi text:=d#>>'{sourceObservation,ageMaximum}'; age_label text;
begin
 -- Individual ageGroup is an athlete classification, not proof of event division.
 if d->>'isRelay'='true' then age_label:=nullif(trim(d->>'ageGroup'),''); end if;
 if lo ~ '^[0-9]{1,2}$' and hi ~ '^[0-9]{1,2}$' and lo::int<=hi::int then
  age_label:=case when lo::int=0 and hi::int=99 then 'Open'
   when lo::int=0 then hi::int::text||'&U' when hi::int=99 then lo::int::text||'&O'
   when lo::int=hi::int then lo::int::text else lo::int::text||'-'||hi::int::text end;
 end if;
 -- Reviewed HY3 imports retain exact source-file provenance. Do not promote
 -- bare eventNumber fields, inferred relay lead-offs, or component splits.
 return jsonb_strip_nulls(jsonb_build_object('meetEventAgeGroup',age_label,'meetEventNumber',case
  when d#>>'{metadata,source}'='hytek_hy3'
   and d#>>'{sourceObservation,archiveSha256}' ~ '^[a-fA-F0-9]{64}$'
   and d#>>'{sourceObservation,url}' ~ '^https?://[^[:space:]]+$'
   and coalesce(d#>>'{sourceObservation,file}','')<>''
   and d#>>'{sourceObservation,line}' ~ '^[1-9][0-9]*$'
   and coalesce(d->>'resultOrigin','')<>'relay_leadoff'
   and coalesce(d->>'isSplit','false')<>'true' and coalesce(d->>'isRelaySplit','false')<>'true'
   and n ~ '^[0-9]{1,6}$' then case when n::int>0 then n::int end end));
end; $$;
revoke all on function private.public_meet_event_metadata(jsonb) from public,anon,authenticated;

-- This private trigger runs only during existing authorized publication paths.
create function private.project_meet_event_metadata() returns trigger
language plpgsql security definer set search_path='' as $$
declare source_data jsonb;
begin
 if tg_table_name='public_swims' then select s.data into source_data from public.swims s where s.id=new.id;
 else select r.data into source_data from public.relay_results r where r.id=new.id; end if;
 new.data:=(new.data-array['meetEventNumber','meetEventAgeGroup'])||private.public_meet_event_metadata(coalesce(source_data,'{}'));
 return new;
end; $$;
revoke all on function private.project_meet_event_metadata() from public,anon,authenticated;
create trigger project_meet_event_metadata before insert or update on public.public_swims
 for each row execute function private.project_meet_event_metadata();
create trigger project_meet_event_metadata before insert or update on public.public_relay_results
 for each row execute function private.project_meet_event_metadata();
-- Refresh projections from stored evidence only; no canonical data is enriched.
update public.public_swims p set data=p.data from public.swims s where s.id=p.id
 and (p.data-array['meetEventNumber','meetEventAgeGroup'])||private.public_meet_event_metadata(s.data) is distinct from p.data;
update public.public_relay_results p set data=p.data from public.relay_results s where s.id=p.id
 and (p.data-array['meetEventNumber','meetEventAgeGroup'])||private.public_meet_event_metadata(s.data) is distinct from p.data;

-- One source of event identities for the catalog and paginated results.
create function public.ies_meet_event_rows(meet_id text)
returns table(id text,event text,course text,gender text,relay boolean,age_group text,event_number integer,event_key text,team text,"time" integer,round text,status text)
language sql stable security invoker set search_path='' as $$
 with source as materialized (
  select s.id,s.times_event as event,s.times_course as course,s.times_gender as gender,s.times_relay as relay,
   coalesce(s.data->>'meetEventAgeGroup','') as age_group,(s.data->>'meetEventNumber')::integer as event_number,
   s.times_team as team,s.times_time as time,coalesce(s.data->>'round','') as round,s.times_status as status
  from public.public_swims s join public.public_athletes a on a.id=s.athlete_id
   join public.public_times_teams t on t.id=s.times_team
  where s.times_meet=meet_id and (not s.times_relay or s.times_leg is null)
  union all
  select s.id,s.times_event,s.times_course,coalesce(s.data->>'gender',''),true,
   coalesce(s.data->>'meetEventAgeGroup',''),(s.data->>'meetEventNumber')::integer,
   s.team_id,s.times_time,coalesce(s.data->>'round',''),coalesce(s.data->>'status','')
  from public.public_relay_results s join public.public_times_teams t on t.id=s.team_id where s.times_meet=meet_id
 ), conflicts as (
  select event_number,course,gender,age_group from source where event_number is not null
  group by event_number,course,gender,age_group having count(distinct (event,relay))>1
 ), resolved as (
  select s.id,s.event,s.course,s.gender,s.relay,s.age_group,
   case when c.event_number is null then s.event_number end as event_number,s.team,s.time,s.round,s.status
  from source s left join conflicts c using(event_number,course,gender,age_group)
 )
 select r.id,r.event,r.course,r.gender,r.relay,r.age_group,r.event_number,
  md5(jsonb_build_array(r.event_number,r.event,r.course,r.gender,r.relay,r.age_group)::text),r.team,r.time,r.round,r.status from resolved r;
$$;
revoke all on function public.ies_meet_event_rows(text) from public;
grant execute on function public.ies_meet_event_rows(text) to anon,authenticated,service_role;

create function public.ies_meet_navigation_query(query_kind text,input jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare answer jsonb; size int:=coalesce((input->>'limit')::int,25); start_at int:=coalesce((input->>'offset')::int,0); summary jsonb;
begin
 if size not between 1 and 100 or start_at<0 or coalesce(input->>'meetId','')='' then raise exception 'Invalid meet query'; end if;
 select jsonb_build_object('id',r.meet_id,'name',max(r.meet),'date',max(r.date),'count',count(*),'courses',jsonb_agg(distinct r.course)) into summary
 from public.ies_times_races r join public.public_times_teams t on t.id=r.team where r.meet_id=input->>'meetId' group by r.meet_id;
 if query_kind='meet_events' then
  with catalog as (
   select event_key,event,course,gender,relay,age_group,event_number,count(*) as count
   from public.ies_meet_event_rows(input->>'meetId') group by event_key,event,course,gender,relay,age_group,event_number
  ) select jsonb_build_object('meet',summary,'meetEvents',coalesce(jsonb_agg(jsonb_build_object(
   'key',event_key,'event',event,'course',course,'gender',gender,'relay',relay,'ageGroup',nullif(age_group,''),
   'eventNumber',event_number,'ordering',case when event_number is null then 'fallback' else 'official' end,'count',count)
   order by event_number nulls last,course,split_part(event,'_',1)::int,split_part(event,'_',2),gender,age_group,relay,event_key),'[]')) into answer from catalog;
 elsif query_kind='meet_results' then
  with matching as materialized (
   select * from public.ies_meet_event_rows(input->>'meetId') where event_key=input->>'meetEventKey'
    and (coalesce(input->>'team','')='' or team=input->>'team')
  ), page as (select * from matching order by round,case when status='OK' and time>0 then 0 else 1 end,time,id limit size offset start_at)
  select jsonb_build_object('meet',summary,'total',(select count(*) from matching),
   'rows',coalesce((select jsonb_agg(jsonb_build_object('race',public.ies_times_json_id(p.id))
    order by p.round,case when p.status='OK' and p.time>0 then 0 else 1 end,p.time,p.id) from page p),'[]')) into answer;
 else raise exception 'Invalid meet query'; end if;
 return answer;
end; $$;
revoke all on function public.ies_meet_navigation_query(text,jsonb) from public;
grant execute on function public.ies_meet_navigation_query(text,jsonb) to anon,authenticated,service_role;

create or replace function public.ies_times_query(query_kind text,input jsonb default '{}') returns jsonb language plpgsql stable set search_path='' set extra_float_digits=3 set plan_cache_mode='force_custom_plan' as $$
declare answer jsonb; start_at int:=coalesce((input->>'offset')::int,0); size int:=coalesce((input->>'limit')::int,25); needle text:=lower(trim(coalesce(input->>'search',''))); chosen public.ies_times_races; benchmark jsonb; today text:=to_char(current_timestamp at time zone 'America/Los_Angeles','YYYY-MM-DD'); cutoff text;
begin
 if query_kind='meet_events' or (query_kind='meet_results' and coalesce(input->>'meetEventKey','')<>'') then
  return public.ies_meet_navigation_query(query_kind,input);
 end if;
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

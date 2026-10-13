-- Metadata queries should read narrow indexes, then fetch detailed race JSON
-- only for the rows actually returned to the caller.
alter table public.public_swims
 add column times_status text generated always as (coalesce(data->>'status','')) stored,
 add column times_gender text generated always as (case when data->>'gender' in ('F','M','X') then data->>'gender' else '' end) stored,
 add column times_age integer generated always as (case when jsonb_typeof(data->'ageAtSwim')='number' and (data->>'ageAtSwim')::numeric>=0 and (data->>'ageAtSwim')::numeric<=2147483647 and trunc((data->>'ageAtSwim')::numeric)=(data->>'ageAtSwim')::numeric then (data->>'ageAtSwim')::integer end) stored,
 add column times_official boolean generated always as (case when jsonb_typeof(data->'isOfficial')='boolean' then (data->>'isOfficial')::boolean end) stored;
create index public_times_facets_idx on public.public_swims(times_relay,times_team,times_event,swim_date) include(times_leg);
create index public_times_records_idx on public.public_swims(times_team,times_course,times_event,times_gender,times_age,times_time,swim_date,id)
 include(athlete_id,times_status) where not times_relay and times_leg is null and not times_split;


create or replace view public.ies_times_races with (security_invoker=true) as
select s.id,s.athlete_id,s.swim_date as date,s.times_course as course,s.times_event as event,s.times_time as time,
 s.times_status as status,coalesce(s.data->>'round','') as round,s.times_team as team,
 coalesce(s.data->>'teamName','') as team_name,s.times_gender as gender,
 s.times_age as age,
 s.times_official as official,
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
 select jsonb_build_object('id',r.id,'athleteId',case when r.relay and r.relay_leg is null then '' else r.athlete_id end,'athleteName',r.athlete_name,'date',r.date,'event',r.event,'course',r.course,'time',r.time,'status',r.status,'round',r.round,'team',r.team,'teamName',r.team_name,'gender',r.gender,'ageAtSwim',r.age,'official',r.official,'relay',r.relay,'relayLeg',r.relay_leg,'relayName',r.relay_name,'relayAgeGroup',r.relay_age,'split',r.split,'meetId',r.meet_id,'meet',r.meet) || coalesce((select jsonb_strip_nulls(jsonb_build_object('members',p.data->'members','lineupCoverage',p.data->'lineupCoverage','splits',p.data->'splits','splitCoverage',p.data->'splitCoverage','resultOrigin',p.data->'resultOrigin','parentRelayResultId',p.data->'parentRelayResultId')) from (select data from public.public_relay_results where id=r.id union all select data from public.public_swims where id=r.id) p limit 1),'{}'::jsonb);
$$;

create or replace function public.ies_times_query(query_kind text,input jsonb default '{}') returns jsonb language plpgsql stable set search_path='' set extra_float_digits=3 as $$
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
  'splits',coalesce(rr.data->'splits','[]'),'splitCoverage',rr.data->'splitCoverage')) order by p.date desc,p.id)
  from page p join public.public_relay_results rr on rr.id=p.id),'[]'),'total',(select count(*) from matching)) into answer;
 elsif query_kind='athlete_history' then
 with matching as (select * from public.ies_times_races where athlete_id=input->>'athleteId' and not relay and event||'_'||course=input->>'historyEvent'),
 page as (select * from matching order by date desc,id limit size offset start_at),
 daily as (select m.*,row_number() over(partition by left(date,10) order by time,id) as pick from matching m where status='OK' and time>0 and not split and relay_leg is null)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('race',public.ies_times_json(p)) order by p.date desc,p.id) from page p),'[]'),'total',(select count(*) from matching),
 'points',coalesce((select jsonb_agg(public.ies_times_json(r) order by d.date,d.id) from daily d join public.ies_times_races r on r.id=d.id where pick=1),'[]')) into answer;
 elsif query_kind='records' then
 with eligible as (
  select s.id,s.athlete_id,s.swim_date as date,s.times_course as course,s.times_event as event,s.times_time as time,false as relay,s.times_gender as gender,
   public.ies_times_age(s.times_age,false,'') as age_group
  from public.public_swims s join public.public_times_teams t on t.id=s.times_team
  where s.times_team=input->>'team' and s.times_status='OK' and s.times_time>0 and s.times_gender in ('F','M','X')
   and not s.times_relay and s.times_leg is null and not s.times_split
  union all
  select s.id,''::text,s.swim_date,s.times_course,s.times_event,s.times_time,true,s.times_gender,coalesce(s.data->>'ageGroup','')
  from public.public_swims s join public.public_times_teams t on t.id=s.times_team
  where s.times_team=input->>'team' and s.times_status='OK' and s.times_time>0 and s.times_gender in ('F','M','X')
   and s.times_relay and s.times_leg is null and not s.times_split
  union all
  select s.id,''::text,s.swim_date,s.times_course,s.times_event,s.times_time,true,s.data->>'gender',coalesce(s.data->>'ageGroup','')
  from public.public_relay_results s join public.public_times_teams t on t.id=s.team_id
  where s.team_id=input->>'team' and s.data->>'status'='OK' and s.times_time>0 and s.data->>'gender' in ('F','M','X')
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
  if b.division='times' and not details_only and exists(select 1 from jsonb_array_elements(b.writes) w where split_part(w->>'path','/',1)<>'relay_results') then
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

analyze public.public_swims;
analyze public.public_relay_results;
analyze public.public_times_teams;
notify pgrst, 'reload schema';

-- Small approved public team directory. Operational IDs are preserved.
create table public.public_times_teams (
 id text primary key references public.teams(id) on delete cascade,
 name text not null, lsc_code text not null check (lsc_code='IE'), club_code text
);
alter table public.public_times_teams enable row level security;
create policy public_read on public.public_times_teams for select to anon, authenticated using (true);
revoke all on public.public_times_teams from anon,authenticated;
grant select on public.public_times_teams to anon, authenticated;
grant all on public.public_times_teams to service_role;
create function private.sync_times_teams() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.public_times_teams(id,name,lsc_code,club_code)
 select t.id,coalesce(t.data->>'name',t.id),'IE',t.data->>'clubCode' from public.teams t
 where t.data->>'lscCode'='IE' or (nullif(t.data->>'lscCode','') is null and exists (
  select 1 from public.knowledge_entries k where k.kind='team' and k.data->>'lscId'='usa-lsc-ie'
  and (k.data->>'teamId'=t.id or k.data->>'canonicalRecordPath'='teams/'||t.id or k.id=t.id)))
 on conflict(id) do update set name=excluded.name,club_code=excluded.club_code;
 delete from public.public_times_teams p where not exists (
  select 1 from public.teams t where t.id=p.id and (t.data->>'lscCode'='IE' or (nullif(t.data->>'lscCode','') is null and exists (
   select 1 from public.knowledge_entries k where k.kind='team' and k.data->>'lscId'='usa-lsc-ie'
   and (k.data->>'teamId'=t.id or k.data->>'canonicalRecordPath'='teams/'||t.id or k.id=t.id)))));
 return null;
end; $$;
revoke all on function private.sync_times_teams() from public,anon,authenticated;
create trigger sync_times_teams after insert or update or delete on public.teams for each statement execute function private.sync_times_teams();
create trigger sync_times_directory after insert or update or delete on public.knowledge_entries for each statement execute function private.sync_times_teams();
insert into public.public_times_teams(id,name,lsc_code,club_code)
select t.id,coalesce(t.data->>'name',t.id),'IE',t.data->>'clubCode' from public.teams t where t.data->>'lscCode'='IE' or (nullif(t.data->>'lscCode','') is null and exists (
 select 1 from public.knowledge_entries k where k.kind='team' and k.data->>'lscId'='usa-lsc-ie'
 and (k.data->>'teamId'=t.id or k.data->>'canonicalRecordPath'='teams/'||t.id or k.id=t.id)));

-- Indexed query columns add no private fields and require no aggregate rebuilds.
alter table public.public_swims
 add column times_course text generated always as (data->>'course') stored,
 add column times_event text generated always as (split_part(data->>'eventCode','_',1)||'_'||case when data->>'isRelay'='true' then case when replace(split_part(data->>'eventCode','_',2),'-R','') in ('MED','IM') then 'MED-R' else replace(split_part(data->>'eventCode','_',2),'-R','')||'-R' end else split_part(data->>'eventCode','_',2) end) stored,
 add column times_team text generated always as (data->>'teamId') stored,
 add column times_meet text generated always as (coalesce(nullif(data#>>'{meet,id}',''),coalesce(data#>>'{meet,name}','')||'_'||swim_date)) stored,
 add column times_time bigint generated always as (case when jsonb_typeof(data->'timeMs')='number' then (data->>'timeMs')::bigint else 0 end) stored,
 add column times_relay boolean generated always as (coalesce(data->>'isRelay'='true',false)) stored,
 add column times_leg integer generated always as (case when data#>>'{relay,leg}' is null then null when data#>>'{relay,leg}' ~ '^-?[0-9]{1,9}$' then (data#>>'{relay,leg}')::integer else -1 end) stored,
 add column times_split boolean generated always as (coalesce(data->>'isSplit'='true' or data->>'isRelaySplit'='true',false)) stored;
create index public_times_event_idx on public.public_swims(times_course,times_event,times_time,id);
create index public_times_team_idx on public.public_swims(times_team,swim_date desc,id);
create index public_times_meet_idx on public.public_swims(times_meet,id);

create view public.ies_times_races with (security_invoker=true) as
select s.id,s.athlete_id,s.swim_date as date,s.times_course as course,s.times_event as event,s.times_time as time,
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
from public.public_swims s join public.public_athletes a on a.id=s.athlete_id;
revoke all on public.ies_times_races from anon,authenticated;
grant select on public.ies_times_races to anon,authenticated;
create function public.ies_times_age(age integer,relay boolean,relay_age text) returns text language sql immutable set search_path='' as $$
 select case when relay then relay_age when age is null then '' when age<=8 then '8&U' when age<=10 then '9-10' when age<=12 then '11-12' when age<=14 then '13-14' when age<=16 then '15-16' when age<=18 then '17-18' else '19&O' end;
$$;
create function public.ies_times_json(r public.ies_times_races) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',r.id,'athleteId',r.athlete_id,'athleteName',r.athlete_name,'date',r.date,'event',r.event,'course',r.course,'time',r.time,'status',r.status,'round',r.round,'team',r.team,'teamName',r.team_name,'gender',r.gender,'ageAtSwim',r.age,'official',r.official,'relay',r.relay,'relayLeg',r.relay_leg,'relayName',r.relay_name,'relayAgeGroup',r.relay_age,'split',r.split,'meetId',r.meet_id,'meet',r.meet);
$$;
create function public.ies_times_filtered(input jsonb) returns setof public.ies_times_races language sql stable set search_path='' as $$
 select r.* from public.ies_times_races r join public.public_times_teams t on t.id=r.team
 where (coalesce(input->>'team','')='' or r.team=input->>'team')
 and (coalesce(input->>'course','')='' or r.course=input->>'course')
 and (coalesce(input->>'event','')='' or r.event=input->>'event')
 and (coalesce(input->>'year','')='' or left(r.date,4)=input->>'year')
 and (coalesce(input->>'round','')='' or r.round=input->>'round')
 and (coalesce(input->>'official','')='' or r.official=(input->>'official'='official'))
 and (not (input ? 'genders') or input->'genders' ? r.gender)
 and (coalesce(jsonb_array_length(input->'ageGroups'),0)=0 or input->'ageGroups' ? public.ies_times_age(r.age,r.relay,r.relay_age))
 and r.relay=coalesce((input->>'relay')::boolean,false) and (not r.relay or r.relay_leg is null);
$$;

create function public.ies_times_query(query_kind text,input jsonb default '{}') returns jsonb language plpgsql stable set search_path='' set extra_float_digits=3 as $$
declare answer jsonb; start_at int:=coalesce((input->>'offset')::int,0); size int:=coalesce((input->>'limit')::int,25); needle text:=lower(trim(coalesce(input->>'search',''))); chosen public.ies_times_races; benchmark jsonb; today text:=to_char(current_timestamp at time zone 'America/Los_Angeles','YYYY-MM-DD'); cutoff text;
begin
 if start_at<0 or size not between 1 and 100 or length(needle)>100 then raise exception 'Invalid pagination or search'; end if;
 if query_kind='facets' then
 select jsonb_build_object('teams',(select coalesce(jsonb_agg(jsonb_build_array(id,name) order by name,id),'[]') from public.public_times_teams),
 'events',(select coalesce(jsonb_agg(event order by event),'[]') from (select distinct r.event from public.ies_times_races r join public.public_times_teams t on t.id=r.team where not r.relay) e),
 'years',(select coalesce(jsonb_agg(year order by year desc),'[]') from (select distinct left(r.date,4) as year from public.ies_times_races r join public.public_times_teams t on t.id=r.team) y),
 'relayAges',(select coalesce(jsonb_agg(age order by age),'[]') from (select distinct r.relay_age as age from public.ies_times_races r join public.public_times_teams t on t.id=r.team where r.relay and r.relay_age<>'' and r.status='OK' and r.time>0 and r.relay_leg is null) a)) into answer;
 elsif query_kind='rankings' then
 with eligible as (select r.* from public.ies_times_filtered(input) r where r.status='OK' and r.time>0),
 best as (select e.*,row_number() over(partition by athlete_id,event,course order by time,date desc,id) as pick from eligible e),
 selected as (select b.* from best b where input->>'mode'='performances' or b.relay or pick=1),
 ranked as (select s.*,rank() over(order by time) as position from selected s),
 searched as (select r.* from ranked r where needle='' or position(needle in lower(case when relay then coalesce(nullif(relay_name,''),team_name||' relay') else athlete_name end))>0),
 page as (select * from searched order by time,case when input->>'mode'='performances' or relay then id else athlete_id end,id limit size offset start_at)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('race',public.ies_times_json(r),'rank',p.position) order by p.time,case when input->>'mode'='performances' or p.relay then p.id else p.athlete_id end,p.id) from page p join public.ies_times_races r on r.id=p.id),'[]'),'total',(select count(*) from searched)) into answer;
 elsif query_kind='analysis' then
 select * into chosen from public.ies_times_races where id=input->>'raceId';
 with eligible as (select r.* from public.ies_times_filtered(input||jsonb_build_object('event',chosen.event,'course',chosen.course,'relay',chosen.relay)) r where r.status='OK' and r.time>0),
 best as (select e.*,row_number() over(partition by athlete_id,event,course order by time,date desc,id) as pick from eligible e),
 cohort as (select * from best where chosen.relay or input->>'basis'='swims' or pick=1),
 counts as (select count(*) as n,count(*) filter(where time<chosen.time) as faster,count(*) filter(where time=chosen.time) as tied,count(*) filter(where time>chosen.time) as slower from cohort)
 select jsonb_build_object('count',n,'stats',case when n>0 and not chosen.relay and chosen.status='OK' and chosen.time>0 then jsonb_build_object('value',((slower::double precision+tied::double precision/2)/n::double precision)*100,'count',n,'faster',faster,'tied',tied,'slower',slower,'rank',faster+1) else null end) into answer from counts;
 elsif query_kind='meets' then
 with all_meets as (select r.meet_id as id,max(r.meet) as name,max(r.date) as date,count(*) as count,jsonb_agg(distinct r.course) as courses from public.ies_times_races r join public.public_times_teams t on t.id=r.team group by r.meet_id),
 searched as (select * from all_meets where needle='' or position(needle in lower(name))>0), page as (select * from searched order by date desc,name,id limit size offset start_at)
 select jsonb_build_object('meets',coalesce((select jsonb_agg(to_jsonb(p) order by p.date desc,p.name,p.id) from page p),'[]'),'total',(select count(*) from searched)) into answer;
 elsif query_kind='meet_results' then
 with matching as (select * from public.ies_times_filtered(input-'genders') where meet_id=input->>'meetId'), page as (select * from matching order by event,time,id limit size offset start_at)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('race',public.ies_times_json(p)) order by p.event,p.time,p.id) from page p),'[]'),'total',(select count(*) from matching),
 'meet',(select jsonb_build_object('id',meet_id,'name',max(meet),'date',max(date),'count',count(*),'courses',jsonb_agg(distinct course)) from public.ies_times_races r join public.public_times_teams t on t.id=r.team where meet_id=input->>'meetId' group by meet_id)) into answer;
 elsif query_kind='profile' then
 with swims as (select * from public.ies_times_races where athlete_id=input->>'athleteId' and not relay),
 best as (select s.*,row_number() over(partition by event,course order by time,date desc,id) as pick from swims s where status='OK' and time>0)
 select jsonb_build_object('name',(select coalesce(nullif(trim(coalesce(data#>>'{name,first}','')||' '||coalesce(data#>>'{name,last}','')),''),id) from public.public_athletes where id=input->>'athleteId'),
 'count',(select count(*) from swims),'pbs',coalesce((select jsonb_agg(public.ies_times_json(r) order by b.course,split_part(b.event,'_',1)::int,b.event) from best b join public.ies_times_races r on r.id=b.id where pick=1),'[]'),
 'events',coalesce((select jsonb_agg(key order by key) from (select distinct event||'_'||course as key from swims) e),'[]')) into answer;
 elsif query_kind='athlete_history' then
 with matching as (select * from public.ies_times_races where athlete_id=input->>'athleteId' and not relay and event||'_'||course=input->>'historyEvent'),
 page as (select * from matching order by date desc,id limit size offset start_at),
 daily as (select m.*,row_number() over(partition by left(date,10) order by time,id) as pick from matching m where status='OK' and time>0)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('race',public.ies_times_json(p)) order by p.date desc,p.id) from page p),'[]'),'total',(select count(*) from matching),
 'points',coalesce((select jsonb_agg(public.ies_times_json(r) order by d.date,d.id) from daily d join public.ies_times_races r on r.id=d.id where pick=1),'[]')) into answer;
 elsif query_kind='records' then
 with eligible as (
 select s.id,s.athlete_id,s.swim_date as date,s.times_course as course,s.times_event as event,s.times_time as time,s.times_relay as relay,s.data->>'gender' as gender,
  public.ies_times_age(case when jsonb_typeof(s.data->'ageAtSwim')='number' and (s.data->>'ageAtSwim')::numeric>=0 and trunc((s.data->>'ageAtSwim')::numeric)=(s.data->>'ageAtSwim')::numeric then (s.data->>'ageAtSwim')::integer end,s.times_relay,coalesce(s.data->>'ageGroup','')) as age_group
 from public.public_swims s join public.public_times_teams t on t.id=s.times_team
 where s.times_team=input->>'team' and s.data->>'status'='OK' and s.times_time>0 and s.data->>'gender' in ('F','M','X') and (not s.times_relay or s.times_leg is null)
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
-- All public functions are read-only invokers; no private tables are reachable.
revoke all on function public.ies_times_query(text,jsonb) from public;
grant execute on function public.ies_times_query(text,jsonb) to anon,authenticated;

analyze public.public_swims;

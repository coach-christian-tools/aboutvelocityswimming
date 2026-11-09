-- Aggregate activity once for the athlete page. Without MATERIALIZED, PostgreSQL
-- can rescan the entire archive for each athlete, exceeding the public API timeout.
create or replace function public.archive_observatory(input jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  needle text := lower(trim(coalesce(input->>'search','')));
  athlete_offset int := coalesce((input->>'athleteOffset')::int,0);
  result_offset int := coalesce((input->>'resultOffset')::int,0);
  answer jsonb;
begin
  if length(needle)>100 or athlete_offset<0 or athlete_offset>1000000 or result_offset<0 or result_offset>1000000
    or (coalesce(input->>'year','')<>'' and input->>'year' !~ '^[0-9]{4}$')
    or coalesce(input->>'course','') not in ('','SCY','SCM','LCM') then
    raise exception 'Invalid archive filters';
  end if;
  -- Work on scalar columns, never transfer the race archive to the browser.
  with base as materialized (
    select s.id,s.athlete_id,s.swim_date as date,left(s.swim_date,4) as year,
      coalesce(s.times_team,'') as team,s.times_course as course,
      coalesce(s.times_meet,'') as meet_id,s.times_meet_name as meet,
      s.archive_added_at
    from public.public_swims s
    where not s.times_relay and not s.times_split and s.times_leg is null
      and exists(select 1 from public.public_athletes a where a.id=s.athlete_id)
  ), matching as materialized (
    select b.* from base b
    where (coalesce(input->>'year','')='' or b.year=input->>'year')
      and (coalesce(input->>'team','')='' or b.team=input->>'team')
      and (coalesce(input->>'course','')='' or b.course=input->>'course')
      and (coalesce(input->>'meet','')='' or b.meet_id=input->>'meet')
      and (coalesce(input->>'athlete','')='' or b.athlete_id=input->>'athlete')
      and (needle='' or position(needle in lower(b.meet))>0 or exists(
        select 1 from public.public_athletes a where a.id=b.athlete_id
        and position(needle in lower(concat_ws(' ',a.data#>>'{name,first}',a.data#>>'{name,last}')))>0))
  ), years as (
    select year as id,count(*) as count,count(distinct meet_id) as meets from matching group by year
  ), meets as (
    select meet_id as id,max(meet) as name,min(date) as date,max(date) as last_date,
      count(*) as count,count(distinct athlete_id) as athletes,jsonb_agg(distinct course) as courses
    from matching group by meet_id
  ), athlete_counts as (
    select athlete_id as id,count(*) as count,min(date) as first,max(date) as last,
      count(distinct meet_id) as meets from matching group by athlete_id
  ), athlete_page as (
    select c.*,coalesce(nullif(trim(concat_ws(' ',a.data#>>'{name,first}',a.data#>>'{name,last}')),''),c.id) as name
    from athlete_counts c join public.public_athletes a on a.id=c.id
    order by c.count desc,c.id limit 120 offset athlete_offset
  ), months as materialized (
    select m.athlete_id,left(m.date,7) as month,count(*) as count
    from matching m join athlete_page a on a.id=m.athlete_id group by m.athlete_id,left(m.date,7)
  ), affiliations as materialized (
    select m.athlete_id,m.team,count(*) as count from matching m join athlete_page a on a.id=m.athlete_id
    group by m.athlete_id,m.team
  ), race_growth as (
    select left(date,7) as date,count(*) as count from matching where date ~ '^[0-9]{4}-[0-9]{2}' group by left(date,7)
  ), import_growth as (
    select to_char(archive_added_at at time zone 'UTC','YYYY-MM') as date,count(*) as count
    from matching where archive_added_at is not null group by 1
  ), team_ids as (select distinct team from base where team<>''),
  team_names as (
    select t.team as id,coalesce(nullif((select s.data->>'teamName' from public.public_swims s
      where s.times_team=t.team and nullif(s.data->>'teamName','') is not null limit 1),''),t.team) as name from team_ids t
  ), result_page as (
    select id,date from matching where coalesce(input->>'meet','')<>'' or coalesce(input->>'athlete','')<>''
    order by date desc,id limit 50 offset result_offset
  )
  select jsonb_build_object(
    'totals',(select jsonb_build_object('swims',count(*),'meets',count(distinct meet_id),'athletes',count(distinct athlete_id),
      'first',min(date),'last',max(date),'unknownImports',count(*) filter(where archive_added_at is null)) from matching),
    'facets',jsonb_build_object('years',coalesce((select jsonb_agg(year order by year desc) from (select distinct year from base where year ~ '^[0-9]{4}$') y),'[]'),
      'teams',coalesce((select jsonb_agg(to_jsonb(t) order by name,id) from team_names t),'[]')),
    'years',coalesce((select jsonb_agg(to_jsonb(y) order by id) from years y),'[]'),
    'meets',coalesce((select jsonb_agg(to_jsonb(m) order by count desc,id) from (select * from meets order by count desc,id limit 1000) m),'[]'),
    'athletes',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object(
      'months',coalesce((select jsonb_agg(jsonb_build_object('date',month,'count',count) order by month) from months m where m.athlete_id=a.id),'[]'),
      'teams',coalesce((select jsonb_agg(jsonb_build_object('id',f.team,'count',f.count) order by f.count desc,f.team) from affiliations f where f.athlete_id=a.id),'[]')
    ) order by a.count desc,a.id) from athlete_page a),'[]'),
    'raceGrowth',coalesce((select jsonb_agg(to_jsonb(g) order by date) from race_growth g),'[]'),
    'importGrowth',coalesce((select jsonb_agg(to_jsonb(g) order by date) from import_growth g),'[]'),
    'results',coalesce((select jsonb_agg(public.ies_times_json_id(p.id) order by p.date desc,p.id) from result_page p),'[]')
  ) into answer;
  return answer;
end;
$$;
revoke all on function public.archive_observatory(jsonb) from public;
grant execute on function public.archive_observatory(jsonb) to anon, authenticated, service_role;

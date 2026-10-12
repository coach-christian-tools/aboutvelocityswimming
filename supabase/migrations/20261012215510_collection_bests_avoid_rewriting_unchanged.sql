-- Preserve best-time and ranking rules, while avoiding writes for unchanged rows.
CREATE OR REPLACE FUNCTION private.rebuild_bests()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 insert into public.athlete_bests as existing(athlete_id,event_code,data)
 select b.athlete_id,b.event_code,jsonb_build_object('eventCode',b.event_code,'distance',b.data->'distance','stroke',b.data->'stroke','course',b.course,'gender',b.data->>'gender','bestTimeMs',b.time_ms,'bestTimeDisplay',private.format_time(b.time_ms),'swimDate',b.data#>>'{meet,date}','meetName',b.data#>>'{meet,name}','swimId',b.id,'standard',coalesce(b.data#>>'{standardsTag,usasMotivational}',''),'ageWhenSwum',b.data->'ageAtSwim','clubRankAllTime',rank() over(partition by b.event_code,b.course,b.data->>'gender' order by b.time_ms),'clubRankActiveRoster',case when a.data->>'status'='active' then (select count(distinct faster.athlete_id)+1 from public.swims faster join public.athletes fa on fa.id=faster.athlete_id where faster.status='OK' and faster.event_code=b.event_code and faster.course=b.course and faster.data->>'gender'=b.data->>'gender' and faster.time_ms<b.time_ms and fa.data->>'status'='active' and coalesce(faster.data->>'isOfficial','true')='true' and (coalesce(faster.data->>'isRelay','false')='false' or faster.data#>>'{relay,isLeadOffFlatStart}'='true')) else null end)
 from (select distinct on(athlete_id,event_code) * from public.swims where status='OK' and coalesce(data->>'isOfficial','true')='true' and (coalesce(data->>'isRelay','false')='false' or data#>>'{relay,isLeadOffFlatStart}'='true') order by athlete_id,event_code,time_ms,data#>>'{meet,date}',id) b join public.athletes a on a.id=b.athlete_id
 on conflict (athlete_id,event_code) do update set data=excluded.data
 where existing.data is distinct from excluded.data;
 -- Keep the original eligibility rules when removing bests with no candidate.
 delete from public.athlete_bests best where not exists(
  select 1 from public.swims s where s.athlete_id=best.athlete_id
   and s.event_code=best.event_code and s.status='OK'
   and coalesce(s.data->>'isOfficial','true')='true'
   and (coalesce(s.data->>'isRelay','false')='false'
    or s.data#>>'{relay,isLeadOffFlatStart}'='true')
 );
 return;
end; $function$;


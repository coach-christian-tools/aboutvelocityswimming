-- Materialize eligible bests once. Correlated existence checks previously scanned
-- the full swim history for each athlete and exceeded the API statement timeout.
create or replace function private.rebuild_bests_for_events(event_codes text[])
returns void language plpgsql security definer set search_path='' set work_mem='64MB' as $$
begin
 with bests as materialized (
  select b.*, a.data->>'status'='active' as active
  from (
   select distinct on(s.athlete_id,s.event_code) s.*
   from public.swims s
   where s.event_code=any(event_codes) and s.status='OK'
    and coalesce(s.data->>'isSplit','false')='false'
    and coalesce(s.data->>'isRelaySplit','false')='false'
    and coalesce(s.data->>'isOfficial','true')='true'
    and (coalesce(s.data->>'isRelay','false')='false' or s.data#>>'{relay,isLeadOffFlatStart}'='true')
    and not exists(select 1 from public.result_moderation m where m.result_type='swim' and m.result_id=s.id and m.flagged)
    and not exists(select 1 from public.result_moderation m where m.result_type='relay' and m.result_id=s.data->>'parentRelayResultId' and m.flagged)
   order by s.athlete_id,s.event_code,s.time_ms,s.data#>>'{meet,date}',s.id
  ) b join public.athletes a on a.id=b.athlete_id
 ), saved as (
  insert into public.athlete_bests as existing(athlete_id,event_code,data)
  select b.athlete_id,b.event_code,jsonb_build_object('eventCode',b.event_code,'distance',b.data->'distance','stroke',b.data->'stroke','course',b.course,'gender',b.data->>'gender','bestTimeMs',b.time_ms,'bestTimeDisplay',private.format_time(b.time_ms),'swimDate',b.data#>>'{meet,date}','meetName',b.data#>>'{meet,name}','swimId',b.id,'standard',coalesce(b.data#>>'{standardsTag,usasMotivational}',''),'ageWhenSwum',b.data->'ageAtSwim','clubRankAllTime',rank() over(partition by b.event_code,b.course,b.data->>'gender' order by b.time_ms),'clubRankActiveRoster',case when b.active then rank() over(partition by b.event_code,b.course,b.data->>'gender',b.active order by b.time_ms) else null end)
  from bests b
  on conflict(athlete_id,event_code) do update set data=excluded.data
  where existing.data is distinct from excluded.data
  returning athlete_id,event_code
 )
 delete from public.athlete_bests old
 where old.event_code=any(event_codes)
 and not exists(select 1 from bests b where b.athlete_id=old.athlete_id and b.event_code=old.event_code);
end; $$;

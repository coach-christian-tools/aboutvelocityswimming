-- Rebuild affected events for physically absent prerequisite additions.
-- Preserve all existing revision, identity, before-image, and approval checks.
-- Preserve full-history PB and active-rank semantics without per-PB history scans.
-- Changes no canonical records, permissions, or eligibility rules.
CREATE OR REPLACE FUNCTION private.rebuild_bests_for_events(event_codes text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
-- Eligibility expressions can be severely underestimated on imported history.
-- Keep those estimates from multiplying full materialized relations in loops.
-- This planner setting is restored automatically when the function exits.
SET search_path TO '' SET work_mem TO '64MB' SET enable_nestloop TO 'off' AS $function$
begin
 with eligible as materialized (
  select s.*,a.data->>'status'='active' as active
  from public.swims s join public.athletes a on a.id=s.athlete_id
  where s.event_code=any(event_codes) and s.status='OK' and coalesce(s.data->>'isSplit','false')='false'
   and coalesce(s.data->>'isRelaySplit','false')='false'
   and coalesce(s.data->>'isOfficial','true')='true'
   and (coalesce(s.data->>'isRelay','false')='false' or s.data#>>'{relay,isLeadOffFlatStart}'='true')
   and not exists(select 1 from public.result_moderation m where m.result_type='swim' and m.result_id=s.id and m.flagged)
   and not exists(select 1 from public.result_moderation m where m.result_type='relay' and m.result_id=s.data->>'parentRelayResultId' and m.flagged)
 ), bests as materialized (
  select distinct on(athlete_id,event_code) * from eligible
  order by athlete_id,event_code,time_ms,data#>>'{meet,date}',id
 ), active_minima as (
  -- The legacy rank counts each active athlete once for every historical
  -- event/course/gender bucket, even when that athlete's selected PB differs.
  select athlete_id,event_code,course,data->>'gender' as gender,min(time_ms) as time_ms
  from eligible where active
  group by athlete_id,event_code,course,data->>'gender'
 ), thresholds as (
  select event_code,course,gender,time_ms,sum(contribution) as contribution
  from (
   select event_code,course,gender,time_ms,count(*) as contribution
   from active_minima group by event_code,course,gender,time_ms
   union all
   select event_code,course,data->>'gender',time_ms,0::bigint
   from bests where active group by event_code,course,data->>'gender',time_ms
  ) points group by event_code,course,gender,time_ms
 ), active_ranks as (
  select event_code,course,gender,time_ms,
   coalesce(sum(contribution) over(partition by event_code,course,gender order by time_ms
    rows between unbounded preceding and 1 preceding),0)+1 as position
  from thresholds
 ), saved as (
  insert into public.athlete_bests as existing(athlete_id,event_code,data)
  select b.athlete_id,b.event_code,jsonb_build_object(
   'eventCode',b.event_code,'distance',b.data->'distance','stroke',b.data->'stroke','course',b.course,
   'gender',b.data->>'gender','bestTimeMs',b.time_ms,'bestTimeDisplay',private.format_time(b.time_ms),
   'swimDate',b.data#>>'{meet,date}','meetName',b.data#>>'{meet,name}','swimId',b.id,
   'standard',coalesce(b.data#>>'{standardsTag,usasMotivational}',''),'ageWhenSwum',b.data->'ageAtSwim',
   'clubRankAllTime',rank() over(partition by b.event_code,b.course,b.data->>'gender' order by b.time_ms),
   'clubRankActiveRoster',case when b.active then coalesce(r.position,1) else null end)
  from bests b left join active_ranks r on r.event_code=b.event_code and r.course=b.course
   and r.gender=b.data->>'gender' and r.time_ms=b.time_ms
  on conflict(athlete_id,event_code) do update set data=excluded.data
  where existing.data is distinct from excluded.data
  returning athlete_id,event_code
 )
 delete from public.athlete_bests old
 where old.event_code=any(event_codes) and not exists(select 1 from bests b where b.athlete_id=old.athlete_id and b.event_code=old.event_code);
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
declare b public.collection_batches; r jsonb; actual jsonb; affected_events text[]; details_only boolean:=false; fresh_prerequisites_only boolean:=false;
begin
 if not private.is_staff() then raise insufficient_privilege using message='Verified staff access required'; end if;
 if decision not in ('approved','held','declined') or decision is null then raise exception 'Invalid decision'; end if;
 perform pg_advisory_xact_lock(hashtext('velocity-records'));
 select * into b from public.collection_batches where id=batch_id for update;
 if b.id is null or b.status not in ('pending','held') then raise exception 'This batch has already been decided or does not exist'; end if;
 if decision='approved' then
  if exists(select 1 from jsonb_array_elements(b.writes) w where split_part(w->>'path','/',1)=any(array['teams','meets','athletes','swims','relay_results'])) then
   if b.canonical_revision is null or b.canonical_revision<>(select revision from private.canonical_revision where singleton) then
    raise exception 'Canonical baseline changed after staging. Export and revalidate this batch before approval.' using errcode='40001';
   end if;
   perform private.validate_collection_identity_claims(b.writes,coalesce(b.evidence->'identityGuard','{}'));
  end if;
  for r in select * from jsonb_array_elements(b.reads) loop
   actual:=private.collection_snapshot(r->>'path');
   if coalesce(actual,'null'::jsonb) is distinct from r->'before' then raise exception 'A record changed after collection. Collect a fresh proposal before approving.' using errcode='40001'; end if;
  end loop;
  -- Compute this before writes, under the canonical advisory lock. JSON-null
  -- snapshots alone do not prove that a physical canonical row is absent.
  fresh_prerequisites_only:=not exists(select 1 from jsonb_array_elements(b.writes) w
   where split_part(w->>'path','/',1) not in ('swims','relay_results')
   and not (jsonb_typeof(w->'after')='object'
    and exists(select 1 from jsonb_array_elements(b.reads) rd where rd->>'path'=w->>'path' and rd->'before'='null'::jsonb)
    and case split_part(w->>'path','/',1)
     when 'athletes' then not exists(select 1 from public.athletes where id=split_part(w->>'path','/',2))
     when 'meets' then not exists(select 1 from public.meets where id=split_part(w->>'path','/',2))
     else false end));
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
  if b.division='times' and not details_only and exists(select 1 from jsonb_array_elements(b.writes) w where split_part(w->>'path','/',1) not in ('relay_results','standards')) then
   if fresh_prerequisites_only then
    select array_agg(distinct event_code) into affected_events from (
     select w#>>'{after,eventCode}' event_code from jsonb_array_elements(b.writes) w where split_part(w->>'path','/',1)='swims'
     union all select rd#>>'{before,eventCode}' from jsonb_array_elements(b.reads) rd where split_part(rd->>'path','/',1)='swims'
    ) events where event_code is not null;
    if coalesce(cardinality(affected_events),0)>0 then
     perform private.rebuild_bests_for_events(affected_events);
    end if;
   else perform private.rebuild_bests(); end if;
  end if;
 end if;
 update public.collection_batches set status=decision,reviewed_by=auth.uid(),reviewed_at=now(),review_note=note where id=batch_id;
 insert into public.collection_reviews(batch_id,decision,reviewer_id,note) values(batch_id,decision,auth.uid(),note);
end; $function$;

-- Publish race-level gender and age at the swim for the requested IES filters.
-- Birth dates and private athlete fields remain excluded.
create or replace function private.publish_swim()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.public_swims(id,athlete_id,swim_date,data) values(new.id,new.athlete_id,new.data#>>'{meet,date}',
  jsonb_build_object('id',new.id,'athleteId',new.athlete_id,'eventCode',new.event_code,'course',new.course,
   'timeMs',new.time_ms,'timeDisplay',case when new.time_ms>0 then private.format_time(new.time_ms) else new.status end,
   'status',new.status,'round',new.round,'isRelay',new.is_relay,'isOfficial',new.is_official,
   'gender',new.data->'gender','ageAtSwim',new.data->'ageAtSwim',
   'teamId',new.data->>'teamId',
   'teamName',(select t.data->>'name' from public.teams t where t.id=new.data->>'teamId'),
   'meet',jsonb_build_object('id',new.meet_id,'name',new.data#>>'{meet,name}','date',new.data#>>'{meet,date}')))
 on conflict(id) do update set athlete_id=excluded.athlete_id,swim_date=excluded.swim_date,data=excluded.data;
 return new;
end; $$;
revoke all on function private.publish_swim() from public, anon, authenticated;

-- Backfill the same race-level fields for results already published.
update public.public_swims p
set data=p.data||jsonb_build_object('gender',s.data->'gender','ageAtSwim',s.data->'ageAtSwim')
from public.swims s
where s.id=p.id
and (p.data->'gender' is distinct from coalesce(s.data->'gender','null'::jsonb)
  or p.data->'ageAtSwim' is distinct from coalesce(s.data->'ageAtSwim','null'::jsonb));

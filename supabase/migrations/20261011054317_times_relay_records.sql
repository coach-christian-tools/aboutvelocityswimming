create or replace function private.publish_swim()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.public_swims(id,athlete_id,swim_date,data) values(new.id,new.athlete_id,new.data#>>'{meet,date}',
  jsonb_build_object('id',new.id,'athleteId',new.athlete_id,'eventCode',new.event_code,'course',new.course,
   'timeMs',new.time_ms,'timeDisplay',case when new.time_ms>0 then private.format_time(new.time_ms) else new.status end,
   'status',new.status,'round',new.round,'isRelay',new.is_relay,'isOfficial',new.is_official,
   'gender',new.data->'gender','ageAtSwim',new.data->'ageAtSwim',
   'ageGroup',case when new.is_relay then new.data->'ageGroup' else 'null'::jsonb end,
   'relay',case when new.is_relay then jsonb_build_object('teamName',new.data#>'{relay,teamName}','leg',new.data#>'{relay,leg}') else 'null'::jsonb end,
   'teamId',new.data->>'teamId',
   'teamName',(select t.data->>'name' from public.teams t where t.id=new.data->>'teamId'),
   'meet',jsonb_build_object('id',new.meet_id,'name',new.data#>>'{meet,name}','date',new.data#>>'{meet,date}')))
 on conflict(id) do update set athlete_id=excluded.athlete_id,swim_date=excluded.swim_date,data=excluded.data;
 return new;
end; $$;
revoke all on function private.publish_swim() from public, anon, authenticated;

-- Relay categories describe the whole event; an individual member age must not replace them.
-- Only public team labels and the leg marker are projected, never the raw relay payload.
update public.public_swims p
set data=p.data||jsonb_build_object('ageGroup',s.data->'ageGroup',
 'relay',jsonb_build_object('teamName',s.data#>'{relay,teamName}','leg',s.data#>'{relay,leg}'))
from public.swims s
where s.id=p.id and s.is_relay;

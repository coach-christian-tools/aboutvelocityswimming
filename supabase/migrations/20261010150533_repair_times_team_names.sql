-- Public results retain their stable team ID and expose only the canonical name.
create or replace function private.publish_swim()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.public_swims(id,athlete_id,swim_date,data) values(new.id,new.athlete_id,new.data#>>'{meet,date}',
  jsonb_build_object('id',new.id,'athleteId',new.athlete_id,'eventCode',new.event_code,'course',new.course,
   'timeMs',new.time_ms,'timeDisplay',case when new.time_ms>0 then private.format_time(new.time_ms) else new.status end,
   'status',new.status,'round',new.round,'isRelay',new.is_relay,'isOfficial',new.is_official,
   'teamId',new.data->>'teamId',
   'teamName',(select t.data->>'name' from public.teams t where t.id=new.data->>'teamId'),
   'meet',jsonb_build_object('id',new.meet_id,'name',new.data#>>'{meet,name}','date',new.data#>>'{meet,date}')))
 on conflict(id) do update set athlete_id=excluded.athlete_id,swim_date=excluded.swim_date,data=excluded.data;
 return new;
end; $$;
revoke all on function private.publish_swim() from public, anon, authenticated;

-- Keep existing result labels current when the canonical team name changes.
create or replace function private.refresh_public_team_name()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 update public.public_swims set data=data||jsonb_build_object('teamName',new.data->>'name')
 where data->>'teamId'=new.id
 and data->>'teamName' is distinct from new.data->>'name';
 return new;
end; $$;
revoke all on function private.refresh_public_team_name() from public, anon, authenticated;
create trigger refresh_public_team_name after insert or update of data on public.teams
for each row execute function private.refresh_public_team_name();

-- Repair public projections without changing race-time team affiliations.
update public.public_swims s set data=s.data||jsonb_build_object('teamName',t.data->>'name')
from public.teams t where t.id=s.data->>'teamId'
and s.data->>'teamName' is distinct from t.data->>'name';

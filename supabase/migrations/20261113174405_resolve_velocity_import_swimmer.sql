create table private.velocity_import_swimmer_resolutions (
  id uuid primary key default gen_random_uuid(),
  requested_row_id uuid not null unique references private.velocity_import_rows(id),
  member_hash text not null check (member_hash ~ '^[a-f0-9]{24}$'),
  athlete_id text not null,
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  match_version text not null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default now()
);

create index velocity_import_swimmer_resolutions_member_idx
  on private.velocity_import_swimmer_resolutions(member_hash, athlete_id);
alter table private.velocity_import_swimmer_resolutions enable row level security;
revoke all on private.velocity_import_swimmer_resolutions from public, anon, authenticated, service_role;

alter table private.velocity_import_rows
  drop constraint velocity_import_rows_status_check,
  add constraint velocity_import_rows_status_check check (status in ('pending', 'approved', 'duplicate', 'superseded')),
  add column swimmer_resolution_id uuid references private.velocity_import_swimmer_resolutions(id),
  add column supersedes_id uuid unique references private.velocity_import_rows(id);

create index velocity_import_swimmer_pending_idx
  on private.velocity_import_rows ((data#>>'{sourceObservation,memberIdHash}'))
  where kind = 'swim' and status = 'pending' and supplied_blocker is null and swimmer_resolution_id is null;
create index velocity_import_swimmer_resolution_rows_idx on private.velocity_import_rows(swimmer_resolution_id)
  where swimmer_resolution_id is not null;
create index velocity_import_selection_row_idx on private.velocity_import_selection_rows(row_id);

-- Share the canonical approval lock when staging so the affected set cannot
-- gain new rows between the reviewer's version check and the replacements.
create trigger velocity_import_stage_write_lock
  before insert on private.velocity_import_rows
  for each statement execute function private.lock_canonical_write();

-- Keep this identity recipe in sync with scripts/collection/race_import.py.
create function private.velocity_import_hytek_swim_digest(body jsonb, athlete_id text)
returns text language sql immutable set search_path = '' as $$
  select case when athlete_id is not null
      and nullif(body#>>'{sourceObservation,eventNumber}', '') is not null
      and nullif(body#>>'{meet,id}', '') is not null
      and nullif(body#>>'{meet,date}', '') is not null
      and nullif(body->>'eventCode', '') is not null
      and nullif(body->>'round', '') is not null
    then left(encode(extensions.digest(
      concat_ws('|', body#>>'{meet,id}', athlete_id, body#>>'{sourceObservation,eventNumber}',
        body->>'eventCode', body->>'round', body#>>'{meet,date}',
        case when body#>>'{raceIdentity,occurrence}' <> 'single'
          then 'occurrence:' || (body#>>'{raceIdentity,occurrence}') end
      ), 'sha256'), 'hex'), 24) end;
$$;

create function private.velocity_import_swimmer_member(item private.velocity_import_rows)
returns text language sql immutable set search_path = '' as $$
  select case when item.kind = 'swim'
    and coalesce(item.data->>'resultOrigin', 'individual') = 'individual'
    and coalesce(item.data->>'isRelay', 'false') = 'false'
    and item.data#>>'{metadata,source}' = 'hytek_hy3'
    and item.data#>>'{sourceObservation,memberIdHash}' ~ '^[a-f0-9]{24}$'
    and item.data#>>'{externalResult,namespace}' = 'hytek'
    and item.record_id = 'hytek_race_' || (item.data#>>'{externalResult,id}')
    and item.data#>>'{externalResult,id}' = private.velocity_import_hytek_swim_digest(item.data, item.data->>'athleteId')
    then item.data#>>'{sourceObservation,memberIdHash}' end;
$$;

create function private.velocity_import_swimmer_identity_targets(member_hash text)
returns table(athlete_id text) language sql stable set search_path = '' as $$
  select source.athlete_id from private.athlete_source_identities source
    where source.namespace = 'hytek-member' and source.source_id = $1
  union
  select a.id from public.athletes a where a.data#>>'{sourceObservation,memberIdHash}' = $1
  union
  select r.athlete_id from private.velocity_import_swimmer_resolutions r where r.member_hash = $1;
$$;

-- A resolved candidate no longer needs an athlete prerequisite. Check its
-- current stable source binding directly at preview and publication time.
alter function private.velocity_import_issue(private.velocity_import_rows, uuid, boolean)
  rename to velocity_import_base_issue;
create function private.velocity_import_issue(item private.velocity_import_rows, sid uuid default null, publish boolean default false)
returns text language plpgsql stable set search_path = '' as $$
declare
  reason text := private.velocity_import_base_issue(item, sid, publish);
  member_hash text;
begin
  if reason is not null or item.kind <> 'swim' then return reason; end if;
  member_hash := private.velocity_import_swimmer_member(item);
  if member_hash is not null and exists (
    select 1 from private.velocity_import_swimmer_identity_targets(member_hash) target
    where target.athlete_id <> item.data->>'athleteId'
  ) then return 'The source swimmer identity needs a reviewed canonical match.'; end if;
  return null;
end;
$$;

create function private.velocity_import_can_match_swimmer(item private.velocity_import_rows, issue text)
returns boolean language sql immutable set search_path = '' as $$
  select item.status = 'pending'
    and item.supplied_blocker is null
    and item.swimmer_resolution_id is null
    and coalesce(issue in (
      'The source swimmer identity needs a reviewed canonical match.',
      'A published swimmer has this name. Review the canonical swimmer match.',
      'The linked athlete name differs from the published record.',
      'The swimmer identity differs from the published profile.',
      'New swimmers require a stable source identity.',
      'The new swimmer ID overlaps an existing person or public profile.'
    ), false)
    and private.velocity_import_swimmer_member(item) is not null;
$$;

create function private.velocity_import_swimmer_group(member_hash text)
returns setof private.velocity_import_rows language sql stable set search_path = '' as $$
  select r.* from private.velocity_import_rows r
  where r.kind = 'swim' and r.status = 'pending' and r.supplied_blocker is null and r.swimmer_resolution_id is null
    and r.data#>>'{sourceObservation,memberIdHash}' = $1
    and private.velocity_import_swimmer_member(r) is not null;
$$;

create function private.velocity_import_swimmer_match_version(row_ids uuid[])
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(array_to_string(row_ids, ','), 'sha256'), 'hex');
$$;

create function private.velocity_import_swimmer_matches(input jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  item private.velocity_import_rows;
  member_hash text;
  captured_name text;
  captured_team_name text;
  staged_athlete text;
  search text := btrim(coalesce(input->>'search', ''));
  normalized_search text := private.velocity_import_normalize_name(search);
  normalized_name text;
  rows_in_group uuid[];
  candidates jsonb;
begin
  if auth.uid() is null or not private.is_staff() then
    raise insufficient_privilege using message = 'Verified staff access required.';
  end if;
  if length(search) > 200 then raise invalid_parameter_value using message = 'Invalid swimmer search.'; end if;
  select * into item from private.velocity_import_rows r where r.id = (input->>'id')::uuid;
  if item.id is null then raise sqlstate 'PT404' using message = 'Import row was not found.'; end if;
  if not private.velocity_import_can_match_swimmer(item, private.velocity_import_issue(item)) then
    raise sqlstate 'PT409' using message = 'The swimmer match is unavailable.';
  end if;

  member_hash := private.velocity_import_swimmer_member(item);
  staged_athlete := item.data->>'athleteId';
  captured_name := case when jsonb_typeof(item.data->'athleteName') = 'string' then item.data->>'athleteName'
    else btrim(concat_ws(' ', item.data#>>'{athleteName,first}', item.data#>>'{athleteName,last}')) end;
  captured_team_name := coalesce(item.data#>>'{sourceObservation,affiliation,name}', item.data->>'teamName',
    (select t.data->>'name' from public.teams t where t.id = item.data->>'teamId'),
    (select x#>>'{data,name}' from jsonb_array_elements(item.prerequisites) x
      where x->>'kind' = 'team' and x->>'id' = item.data->>'teamId'));
  normalized_name := private.velocity_import_normalize_name(captured_name);
  select array_agg(r.id order by r.id) into rows_in_group from private.velocity_import_swimmer_group(member_hash) r;

  with claimed as materialized (
    select target.athlete_id from private.velocity_import_swimmer_identity_targets(member_hash) target
  ), matching as (
    select a.id, p.name, t.data->>'name' as team_name,
      case when c.athlete_id is not null then 1 when a.id = staged_athlete then 2
        when normalized_name <> '' and private.velocity_import_normalize_name(p.name) = normalized_name then 3
        else 4 end as priority
    from public.athletes a
    join public.public_athletes public_profile on public_profile.id = a.id
    join public.people p on p.id = a.person_id
    left join public.teams t on t.id = a.data->>'teamId'
    left join claimed c on c.athlete_id = a.id
    where (c.athlete_id is not null and (select count(*) from claimed) = 1) or (
      not exists(select 1 from claimed) and (
        a.id = staged_athlete
        or (normalized_name <> '' and private.velocity_import_normalize_name(p.name) = normalized_name)
        or (search <> '' and (lower(a.id) = lower(search) or (normalized_search <> '' and
          strpos(private.velocity_import_normalize_name(p.name), normalized_search) > 0)))
      )
    )
    order by priority, p.name, a.id limit 25
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'teamName', team_name,
    'evidence', case priority when 1 then 'source_identity' when 2 then 'staged_link'
      when 3 then 'name_match' else 'search' end) order by priority, name, id), '[]')
  into candidates from matching;

  return jsonb_build_object('affected', cardinality(rows_in_group), 'capturedName', coalesce(nullif(captured_name, ''), item.label),
    'capturedTeamName', captured_team_name, 'currentAthleteId', staged_athlete, 'candidates', candidates,
    'matchVersion', private.velocity_import_swimmer_match_version(rows_in_group));
end;
$$;

create function private.resolve_velocity_import_swimmer(input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  reviewer uuid := auth.uid();
  item private.velocity_import_rows;
  resolution_id uuid;
  member_hash text;
  selected_athlete text := input->>'athleteId';
  review_reason text := btrim(input->>'reason');
  requested_version text := input->>'matchVersion';
  affected uuid[];
  updated integer;
  replacements jsonb;
begin
  if reviewer is null or not private.is_staff() then
    raise insufficient_privilege using message = 'Verified staff access required.';
  end if;
  if not coalesce(length(review_reason) between 1 and 1000 and selected_athlete ~ '^[a-zA-Z0-9_-]{1,180}$'
      and requested_version ~ '^[a-f0-9]{64}$', false) then
    raise invalid_parameter_value using message = 'Invalid swimmer match.';
  end if;

  perform pg_advisory_xact_lock(hashtext('velocity-records'));
  select * into item from private.velocity_import_rows r where r.id = (input->>'id')::uuid;
  if item.id is null then raise sqlstate 'PT404' using message = 'Import row was not found.'; end if;

  -- A lost response can retry the original request without resolving twice.
  select r.id into resolution_id from private.velocity_import_swimmer_resolutions r
  where r.requested_row_id = item.id and r.reviewed_by = reviewer and r.athlete_id = selected_athlete
    and r.reason = review_reason and r.match_version = requested_version;
  if resolution_id is null then
    if not private.velocity_import_can_match_swimmer(item, private.velocity_import_issue(item)) then
      raise sqlstate 'PT409' using message = 'The swimmer match is unavailable.';
    end if;
    member_hash := private.velocity_import_swimmer_member(item);
    if not exists(select 1 from public.athletes a join public.public_athletes p on p.id = a.id where a.id = selected_athlete)
      or exists(select 1 from private.velocity_import_swimmer_identity_targets(member_hash) target
        where target.athlete_id <> selected_athlete) then
      raise sqlstate 'PT409' using message = 'The selected swimmer conflicts with a verified source link or is unavailable.';
    end if;
    select array_agg(r.id order by r.id) into affected from private.velocity_import_swimmer_group(member_hash) r;
    if requested_version is distinct from private.velocity_import_swimmer_match_version(affected) then
      raise sqlstate 'PT409' using message = 'The affected swims changed. Review them again.';
    end if;

    insert into private.velocity_import_swimmer_resolutions(requested_row_id, member_hash, athlete_id, reason, match_version, reviewed_by)
    values(item.id, member_hash, selected_athlete, review_reason, requested_version, reviewer)
    returning id into resolution_id;

    with retired as (
      update private.velocity_import_rows r set status = 'superseded', swimmer_resolution_id = resolution_id,
        reviewed_by = reviewer, reviewed_at = now()
      where r.id = any(affected)
      returning r.*
    ), remapped as (
      select r.*, private.velocity_import_hytek_swim_digest(r.data, selected_athlete) as result_digest,
        coalesce((select jsonb_agg(linked order by ordinality)
          from jsonb_array_elements(r.prerequisites) with ordinality as d(linked, ordinality)
          where linked->>'kind' <> 'athlete'), '[]') as linked_records
      from retired r
    ), replacement as (
      select r.*, r.data || jsonb_build_object('id', 'hytek_race_' || r.result_digest,
        'athleteId', selected_athlete, 'externalResult', jsonb_build_object('namespace', 'hytek', 'id', r.result_digest)) as replacement_data
      from remapped r
    )
    insert into private.velocity_import_rows(
      batch_id, kind, record_id, data, prerequisites, locator, payload_hash, swimmer_resolution_id, supersedes_id
    )
    select r.batch_id, r.kind, 'hytek_race_' || r.result_digest, r.replacement_data, r.linked_records, r.locator,
      encode(extensions.digest(jsonb_build_array(r.replacement_data, r.linked_records, resolution_id, r.id)::text, 'sha256'), 'hex'),
      resolution_id, r.id
    from replacement r;
  end if;

  select count(*), case when count(*) filter (where r.status = 'pending') <= 5000
    then coalesce(jsonb_agg(r.id order by r.id) filter (where r.status = 'pending'), '[]') else '[]' end
  into updated, replacements from private.velocity_import_rows r
  where r.swimmer_resolution_id = resolution_id and r.supersedes_id is not null;
  return jsonb_build_object('updated', updated, 'rowIds', replacements);
end;
$$;

-- A frozen selection that includes an unprocessed original must be reviewed
-- again. Preserve already-completed approval receipts on retry.
alter function private.approve_velocity_import(uuid) rename to approve_velocity_import_selection;
create function private.approve_velocity_import(selection_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  reviewer uuid := auth.uid();
begin
  if reviewer is null or not private.is_staff() then
    raise insufficient_privilege using message = 'Verified staff access required.';
  end if;
  perform 1 from private.velocity_import_selections s where s.id = selection_id and s.reviewer_id = reviewer and s.previewed for update;
  if not found then raise sqlstate 'PT404' using message = 'Import selection was not found.'; end if;
  perform pg_advisory_xact_lock(hashtext('velocity-records'));
  if exists (
    select 1 from private.velocity_import_selection_rows sr join private.velocity_import_rows r on r.id = sr.row_id
    where sr.selection_id = approve_velocity_import.selection_id and sr.outcome is null and r.status = 'superseded'
  ) then raise sqlstate 'PT409' using message = 'A selected swim was corrected. Review a new selection.'; end if;
  return private.approve_velocity_import_selection(selection_id);
end;
$$;

-- The public wrapper must reference the new guard rather than the renamed
-- internal implementation.
create or replace function public.approve_velocity_import(selection_id uuid)
returns jsonb language sql set search_path = '' as $$
  select private.approve_velocity_import(selection_id);
$$;

create or replace function private.velocity_import_summary(item private.velocity_import_rows, captured timestamptz, selection_match boolean)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', item.id,
    'kind', item.kind,
    'recordId', item.record_id,
    'label', case when item.kind = 'swim' then coalesce(
      case when item.supersedes_id is not null then profile.name end,
      case when jsonb_typeof(item.data->'athleteName') = 'string' then nullif(item.data->>'athleteName', '')
           else nullif(btrim(concat_ws(' ', item.data#>>'{athleteName,first}', item.data#>>'{athleteName,last}')), '') end,
      profile.name,
      (select btrim(concat_ws(' ', x#>>'{data,name,first}', x#>>'{data,name,last}'))
       from jsonb_array_elements(item.prerequisites) x where x->>'kind' = 'athlete' and x->>'id' = item.data->>'athleteId'),
      item.label
    ) when item.kind = 'relay' then coalesce(item.data->>'relayName', item.label) else item.label end,
    'meetId', coalesce(item.data#>>'{meet,id}', item.data->>'canonicalMeetId', case when item.kind = 'meet' then item.record_id end),
    'meetName', coalesce(item.data#>>'{meet,name}', case when item.tab = 'meets' then item.label end),
    'eventCode', item.data->>'eventCode',
    'time', case when item.kind in ('swim','relay') then (item.data->>'timeMs')::bigint end,
    'startsOn', coalesce(item.data->>'startsOn', item.data->>'startDate', item.data#>>'{dates,startDate}', item.data#>>'{meet,date}'),
    'teamName', coalesce(item.data->>'teamName',
      (select data->>'name' from public.teams where id = item.data->>'teamId'),
      (select x#>>'{data,name}' from jsonb_array_elements(item.prerequisites) x where x->>'kind' = 'team' and x->>'id' = item.data->>'teamId')),
    'round', item.data->>'round',
    'course', coalesce(item.data->>'course', split_part(item.data->>'eventCode', '_', 3)),
    'status', item.status,
    'resultStatus', case when item.kind in ('swim','relay') then item.data->>'status' end,
    'blocker', case when item.status = 'pending' then coalesce(nullif(current_issue.reason, ''), item.review_blocker) end,
    'canResolveSwimmerMatch', private.velocity_import_can_match_swimmer(item, current_issue.reason),
    'batchId', item.batch_id,
    'capturedAt', captured,
    'selected', selection_match
  ) from (select case when item.status = 'pending' then private.velocity_import_issue(item) end as reason) current_issue
  left join lateral (
    select nullif(btrim(concat_ws(' ', a.data#>>'{name,first}', a.data#>>'{name,last}')), '') as name
    from public.public_athletes a where item.kind = 'swim' and a.id = item.data->>'athleteId'
  ) profile on true;
$$;

create function public.velocity_import_swimmer_matches(input jsonb)
returns jsonb language sql stable set search_path = '' as $$
  select private.velocity_import_swimmer_matches(input);
$$;
create function public.resolve_velocity_import_swimmer(input jsonb)
returns jsonb language sql set search_path = '' as $$
  select private.resolve_velocity_import_swimmer(input);
$$;

revoke all on function
  private.velocity_import_hytek_swim_digest(jsonb, text),
  private.velocity_import_swimmer_member(private.velocity_import_rows),
  private.velocity_import_swimmer_identity_targets(text),
  private.velocity_import_issue(private.velocity_import_rows, uuid, boolean),
  private.velocity_import_can_match_swimmer(private.velocity_import_rows, text),
  private.velocity_import_swimmer_group(text),
  private.velocity_import_swimmer_match_version(uuid[]),
  private.velocity_import_swimmer_matches(jsonb),
  private.resolve_velocity_import_swimmer(jsonb),
  private.approve_velocity_import_selection(uuid),
  private.approve_velocity_import(uuid),
  public.velocity_import_swimmer_matches(jsonb),
  public.resolve_velocity_import_swimmer(jsonb)
  from public, anon, authenticated, service_role;

grant execute on function
  private.velocity_import_swimmer_matches(jsonb), public.velocity_import_swimmer_matches(jsonb),
  private.resolve_velocity_import_swimmer(jsonb), public.resolve_velocity_import_swimmer(jsonb),
  private.approve_velocity_import(uuid)
  to authenticated;
notify pgrst, 'reload schema';

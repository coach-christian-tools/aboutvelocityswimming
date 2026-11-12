-- Additive collection inbox. The canonical tables and their public projections
-- receive writes only after a staff member confirms a frozen selection.
create table private.velocity_import_batches (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references private.collection_workers(id),
  division text not null check (division in ('times', 'knowledge')),
  source_url text not null,
  captured_at timestamptz not null,
  coverage text not null check (coverage in ('partial', 'complete', 'unknown')),
  sha256 text not null,
  source_scope text not null,
  unique (division, source_url, sha256, source_scope)
);

create table private.velocity_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references private.velocity_import_batches(id),
  kind text not null check (kind in ('catalog_meet', 'meet', 'swim', 'relay')),
  record_id text not null,
  data jsonb not null,
  prerequisites jsonb not null,
  locator text not null,
  payload_hash text not null,
  supplied_blocker text,
  review_blocker text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'duplicate')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  tab text generated always as (
    case when kind in ('catalog_meet', 'meet') then 'meets' else 'swims' end
  ) stored,
  label text generated always as (
    coalesce(nullif(data->>'title', ''), nullif(data->>'name', ''),
      nullif(btrim(coalesce(
        case when jsonb_typeof(data->'athleteName') = 'string' then data->>'athleteName'
             else nullif(btrim(coalesce(data#>>'{athleteName,first}', '') || ' ' || coalesce(data#>>'{athleteName,last}', '')), '')
        end, ''
      ) || ' ' || coalesce(data->>'eventCode', '') || ' ' || coalesce(data->>'timeDisplay', '')), ''),
      record_id)
  ) stored,
  unique (batch_id, kind, record_id, locator, payload_hash)
);

create index velocity_import_pending_page_idx on private.velocity_import_rows(tab, id) where status = 'pending';
create index velocity_import_pending_batch_idx on private.velocity_import_rows(batch_id, tab, id) where status = 'pending';
create index velocity_import_pending_record_idx on private.velocity_import_rows(kind, record_id) where status = 'pending';
create index velocity_import_pending_occurrence_idx on private.velocity_import_rows(
  kind, (private.result_identity_base(kind, data)), (coalesce(data#>>'{raceIdentity,occurrence}', 'single'))
) where status = 'pending' and kind in ('swim', 'relay');
create index velocity_import_pending_external_idx on private.velocity_import_rows(
  kind, (data#>>'{externalResult,namespace}'), (data#>>'{externalResult,id}')
) where status = 'pending' and data ? 'externalResult';
create function private.velocity_import_normalize_name(label text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(coalesce(label, ''), '[^[:alnum:]]+', '', 'g'));
$$;

create index velocity_import_meet_identity_idx on public.meets (
  (lower(btrim(data->>'name'))), (coalesce(data->>'startsOn', data->>'startDate', data#>>'{dates,startDate}'))
);
create index velocity_import_catalog_identity_idx on public.knowledge_entries(
  (lower(btrim(data->>'title'))), starts_on
) where kind = 'meet';
create index velocity_import_athlete_swimcloud_idx on public.athletes((data->>'swimcloudId'))
  where data->>'swimcloudId' is not null;

create index velocity_import_people_name_idx on public.people(private.velocity_import_normalize_name(name));
create index velocity_import_team_name_idx on public.teams(private.velocity_import_normalize_name(data->>'name'));
create index velocity_import_team_source_code_idx on public.teams((upper(data->>'lscCode')), (upper(data->>'clubCode')))
  where data->>'lscCode' is not null and data->>'clubCode' is not null;
create index velocity_import_meet_catalog_idx on public.meets((data->>'knowledgeEntryId'))
  where data->>'knowledgeEntryId' is not null;

create table private.velocity_import_selections (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  preview_required boolean not null,
  previewed boolean not null default false,
  preview_checked_count integer not null default 0,
  preview_blocked_count integer not null default 0,
  row_count integer not null default 0,
  meet_count integer not null default 0,
  approved_count integer not null default 0,
  duplicate_count integer not null default 0,
  blocked_count integer not null default 0
);

create index velocity_import_unstarted_selection_idx on private.velocity_import_selections(reviewer_id, created_at)
  where started_at is null;

create table private.velocity_import_selection_rows (
  selection_id uuid not null references private.velocity_import_selections(id) on delete cascade,
  row_id uuid not null references private.velocity_import_rows(id),
  sort_order smallint not null,
  new_prerequisites jsonb not null default '[]',
  preview_blocker text,
  preview_checked boolean not null default false,
  outcome text check (outcome in ('approved', 'duplicate', 'blocked')),
  primary key (selection_id, row_id)
);

create index velocity_import_selection_remaining_idx on private.velocity_import_selection_rows(selection_id, sort_order, row_id)
  where outcome is null;
create index velocity_import_selection_preview_idx on private.velocity_import_selection_rows(selection_id, sort_order, row_id)
  where not preview_checked;

alter table private.velocity_import_batches enable row level security;
alter table private.velocity_import_rows enable row level security;
alter table private.velocity_import_selections enable row level security;
alter table private.velocity_import_selection_rows enable row level security;
revoke all on private.velocity_import_batches, private.velocity_import_rows,
  private.velocity_import_selections, private.velocity_import_selection_rows
  from public, anon, authenticated, service_role;

create function private.velocity_import_sort(candidate_kind text) returns smallint
language sql immutable set search_path = '' as $$
  select (case candidate_kind when 'meet' then 1 when 'catalog_meet' then 2 when 'relay' then 3 else 4 end)::smallint;
$$;

create function private.velocity_import_path(kind text, record_id text) returns text
language sql immutable set search_path = '' as $$
  select case kind
    when 'catalog_meet' then 'knowledge_entries'
    when 'meet' then 'meets'
    when 'swim' then 'swims'
    when 'relay' then 'relay_results'
    when 'team' then 'teams'
    when 'athlete' then 'athletes'
    when 'venue' then 'venues'
  end || '/' || record_id;
$$;

-- Ignore only source provenance and review metadata when comparing result facts.
-- Splits, lineup, status, timing, and occurrence identity remain significant.
create function private.velocity_import_same_result(first jsonb, second jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select (first - array['id','sourceObservation','externalResult','raceIdentity','metadata'])
         = (second - array['id','sourceObservation','externalResult','raceIdentity','metadata'])
    and coalesce(first#>>'{raceIdentity,occurrence}', 'single') = coalesce(second#>>'{raceIdentity,occurrence}', 'single');
$$;

-- NULL means new. Empty text means a canonical duplicate. Other text is the
-- reason the candidate needs a correction or an identity review.
create function private.velocity_import_record_check(candidate_kind text, rid text, body jsonb)
returns text language plpgsql stable set search_path = '' as $$
declare current_data jsonb; source_target text; identity_base jsonb; candidate record; matches integer := 0;
  same_facts boolean := false; occurrence_token text := coalesce(body#>>'{raceIdentity,occurrence}', 'single');
begin
  current_data := private.collection_snapshot(private.velocity_import_path(candidate_kind, rid));
  if candidate_kind in ('swim', 'relay') then
    identity_base := private.result_identity_base(candidate_kind, body);
    select occurrence.result_id into source_target
    from private.result_source_identities source
    join private.result_occurrences occurrence on occurrence.id = source.occurrence_id
    where source.kind = candidate_kind and source.namespace = body#>>'{externalResult,namespace}'
      and source.source_id = body#>>'{externalResult,id}';
    if source_target is not null then
      if current_data is not null and source_target <> rid then
        return 'The record ID and source identity refer to different published results.';
      end if;
      if private.velocity_import_same_result(
        private.collection_snapshot(private.velocity_import_path(candidate_kind, source_target)), body
      ) then return ''; end if;
      return 'The source identity has different published facts. Use the correction workflow.';
    end if;
    if current_data is not null then
      if private.velocity_import_same_result(current_data, body) then return ''; end if;
      return 'This result ID has different published facts. Use the correction workflow.';
    end if;
    if (candidate_kind = 'swim' and exists(select 1 from public.relay_results where id = rid))
       or (candidate_kind = 'relay' and exists(select 1 from public.swims where id = rid)) then
      return 'An individual result and a relay cannot share a record ID.';
    end if;
    if occurrence_token = 'single' and identity_base->>'round' in ('S','TT') then
      return 'This round needs a reviewed occurrence mapping.';
    end if;
    for candidate in
      select s.id, s.data, o.occurrence
      from public.swims s left join private.result_occurrences o on o.swim_id = s.id
      where candidate_kind = 'swim' and s.data->>'athleteId' = identity_base->>'subject'
        and s.data#>>'{meet,id}' = identity_base->>'meet' and s.data->>'eventCode' = identity_base->>'event'
        and private.result_identity_base(candidate_kind, s.data) = identity_base
      union all
      select r.id, r.data, o.occurrence
      from public.relay_results r left join private.result_occurrences o on o.relay_id = r.id
      where candidate_kind = 'relay' and r.data->>'teamId' = identity_base->>'subject'
        and r.data#>>'{meet,id}' = identity_base->>'meet' and r.data->>'eventCode' = identity_base->>'event'
        and private.result_identity_base(candidate_kind, r.data) = identity_base
    loop
      if candidate.occurrence is null or candidate.occurrence = occurrence_token or occurrence_token = 'single' then
        matches := matches + 1;
        same_facts := private.velocity_import_same_result(candidate.data, body);
      end if;
    end loop;
    if matches = 1 and same_facts then return ''; end if;
    if matches > 0 then return 'A published result overlaps this occurrence. Review the source identity.'; end if;
  elsif candidate_kind = 'meet' and body->>'knowledgeEntryId' is not null and (
    exists (
      select 1 from public.knowledge_entries k where k.id = body->>'knowledgeEntryId'
        and (k.kind <> 'meet'
          or k.starts_on::text is distinct from coalesce(body->>'startsOn', body->>'startDate', body#>>'{dates,startDate}')
          or coalesce(k.ends_on, k.starts_on)::text is distinct from coalesce(
            body->>'endsOn', body->>'endDate', body#>>'{dates,endDate}', body->>'startsOn', body->>'startDate', body#>>'{dates,startDate}'))
    ) or exists (
      select 1 from public.meets m where m.data->>'knowledgeEntryId' = body->>'knowledgeEntryId' and m.id <> rid
    )
  ) then
    return 'This result archive disagrees with the published meet catalog link or dates.';
  elsif current_data is not null then
    if current_data - array['sourceObservation','sourceUrl'] = body - array['sourceObservation','sourceUrl'] then
      return '';
    end if;
    return 'This meet ID has different published facts. Use the correction workflow.';
  elsif candidate_kind = 'meet' and exists (
    select 1 from public.meets m where lower(btrim(m.data->>'name')) = lower(btrim(body->>'name'))
      and coalesce(m.data->>'startsOn', m.data->>'startDate', m.data#>>'{dates,startDate}')
        = coalesce(body->>'startsOn', body->>'startDate', body#>>'{dates,startDate}')
  ) then
    return 'A published meet has the same name and date. Review the canonical meet match.';
  elsif candidate_kind = 'catalog_meet' and exists (
    select 1 from public.knowledge_entries k where k.kind = 'meet'
      and lower(btrim(k.data->>'title')) = lower(btrim(body->>'title')) and k.starts_on = (body->>'startsOn')::date
  ) then
    return 'A published catalog meet has the same name and date. Review the meet match.';
  end if;
  return null;
end;
$$;

create function private.velocity_import_references(candidate_kind text, body jsonb, linked jsonb)
returns table(kind text, record_id text) language sql immutable set search_path = '' as $$
  select distinct ref.kind, ref.record_id
  from (
    select 'meet', body#>>'{meet,id}' where candidate_kind in ('swim', 'relay')
    union all select 'meet', body->>'canonicalMeetId' where candidate_kind = 'catalog_meet'
    union all select 'relay', body->>'parentRelayResultId' where candidate_kind = 'swim' and body->>'resultOrigin' = 'relay_leadoff'
    union all select 'athlete', body->>'athleteId' where candidate_kind = 'swim'
    union all select 'athlete', member->>'athleteId'
      from jsonb_array_elements(case when jsonb_typeof(body->'members') = 'array' then body->'members' else '[]' end) member
      where candidate_kind = 'relay'
    union all select 'team', body->>'teamId' where candidate_kind in ('meet', 'swim', 'relay')
    union all select 'team', body->>'hostTeamId' where candidate_kind = 'meet'
    union all select 'venue', body->>'venueId' where candidate_kind = 'meet'
    union all select 'team', item#>>'{data,teamId}' from jsonb_array_elements(linked) item where item->>'kind' = 'athlete'
  ) ref(kind, record_id)
  where nullif(ref.record_id, '') is not null;
$$;

-- New linked people need a stable source identifier. Existing linked rows are
-- identity assertions only. Never overwrite a team, athlete, venue or person.
create function private.velocity_import_prerequisite_issue(candidate_kind text, rid text, body jsonb, current_data jsonb)
returns text language plpgsql stable set search_path = '' as $$
declare member_hash text := body#>>'{sourceObservation,memberIdHash}';
  swimcloud_id text := body->>'swimcloudId'; canonical_name text; candidate_name text;
begin
  if candidate_kind = 'athlete' then
    if member_hash is not null and (
      member_hash !~ '^[a-f0-9]{24}$' or exists (
        select 1 from private.athlete_source_identities
        where namespace = 'hytek-member' and source_id = member_hash and athlete_id <> rid
      ) or exists (
        select 1 from public.athletes where data#>>'{sourceObservation,memberIdHash}' = member_hash and id <> rid
      )
    ) then return 'The source swimmer identity needs a reviewed canonical match.'; end if;
    if swimcloud_id is not null and exists (
      select 1 from public.athletes where data->>'swimcloudId' = swimcloud_id and id <> rid
    ) then return 'The source swimmer identity needs a reviewed canonical match.'; end if;
    if current_data is null and coalesce(member_hash, swimcloud_id) is null then
      return 'New swimmers require a stable source identity.';
    end if;
    if current_data is null and (
      exists(select 1 from public.people where id = 'person_' || rid) or
      exists(select 1 from public.public_athletes where id = rid)
    ) then return 'The new swimmer ID overlaps an existing person or public profile.'; end if;
    if current_data is not null and (
      member_hash is not null and current_data#>>'{sourceObservation,memberIdHash}' is not null
        and current_data#>>'{sourceObservation,memberIdHash}' <> member_hash
      or swimcloud_id is not null and current_data->>'swimcloudId' is not null
        and current_data->>'swimcloudId' <> swimcloud_id
    ) then return 'The swimmer identity differs from the published profile.'; end if;
    candidate_name := private.velocity_import_normalize_name(concat_ws(' ', body#>>'{name,first}', body#>>'{name,last}'));
    canonical_name := private.velocity_import_normalize_name(concat_ws(' ', current_data#>>'{name,first}', current_data#>>'{name,last}'));
    if current_data is null and exists (
      select 1 from public.people p join public.athletes a on a.person_id = p.id
      where private.velocity_import_normalize_name(p.name) = candidate_name
    ) then return 'A published swimmer has this name. Review the canonical swimmer match.'; end if;
  else
    candidate_name := private.velocity_import_normalize_name(body->>'name');
    canonical_name := private.velocity_import_normalize_name(current_data->>'name');
    if candidate_kind = 'team' and current_data is null and (
      exists (
        select 1 from public.teams t where private.velocity_import_normalize_name(t.data->>'name') = candidate_name
          and (coalesce(nullif(t.data->>'lscCode', ''), '') = '' or coalesce(nullif(t.data->>'clubCode', ''), '') = ''
            or coalesce(nullif(body->>'lscCode', ''), '') = '' or coalesce(nullif(body->>'clubCode', ''), '') = '')
      ) or exists (
        select 1 from public.teams t where t.data->>'lscCode' is not null and t.data->>'clubCode' is not null
          and upper(t.data->>'lscCode') = upper(body->>'lscCode') and upper(t.data->>'clubCode') = upper(body->>'clubCode')
      )
    ) then return 'A published team has this name or source code. Review the canonical team match.'; end if;
  end if;
  if current_data is not null and canonical_name <> '' and candidate_name <> canonical_name then
    return 'The linked ' || candidate_kind || ' name differs from the published record.';
  end if;
  return null;
end;
$$;

create function private.velocity_import_issue(item private.velocity_import_rows, sid uuid default null, publish boolean default false)
returns text language plpgsql stable set search_path = '' as $$
declare canonical_result text; ref record; linked jsonb; current_data jsonb; reason text;
  identity_base jsonb; occurrence_token text;
begin
  if item.supplied_blocker is not null then return item.supplied_blocker; end if;
  canonical_result := private.velocity_import_record_check(item.kind, item.record_id, item.data);
  if canonical_result is not null then return canonical_result; end if;
  identity_base := private.result_identity_base(item.kind, item.data);
  occurrence_token := coalesce(item.data#>>'{raceIdentity,occurrence}', 'single');
  if exists (
    select 1 from private.velocity_import_rows other
    where other.status = 'pending' and other.id <> item.id and other.kind = item.kind and other.record_id = item.record_id
      and other.supplied_blocker is null and (
        case when item.kind in ('swim','relay') then not private.velocity_import_same_result(other.data, item.data)
          else other.data - 'sourceObservation' <> item.data - 'sourceObservation' end
      )
  ) or (item.kind in ('swim','relay') and exists (
    select 1 from private.velocity_import_rows other
    where other.status = 'pending' and other.kind in ('swim','relay') and other.id <> item.id and other.kind = item.kind
      and other.supplied_blocker is null and private.result_identity_base(other.kind, other.data) = identity_base
      and coalesce(other.data#>>'{raceIdentity,occurrence}', 'single') = occurrence_token
      and not private.velocity_import_same_result(other.data, item.data)
  )) or (item.data ? 'externalResult' and exists (
    select 1 from private.velocity_import_rows other
    where other.status = 'pending' and other.id <> item.id and other.kind = item.kind and other.supplied_blocker is null
      and other.data ? 'externalResult'
      and other.data#>>'{externalResult,namespace}' = item.data#>>'{externalResult,namespace}'
      and other.data#>>'{externalResult,id}' = item.data#>>'{externalResult,id}'
      and not private.velocity_import_same_result(other.data, item.data)
  )) then
    return 'Pending captures disagree about this record. Review the source evidence.';
  end if;
  for ref in select * from private.velocity_import_references(item.kind, item.data, item.prerequisites) loop
    current_data := private.collection_snapshot(private.velocity_import_path(ref.kind, ref.record_id));
    linked := (
      select value->'data' from jsonb_array_elements(item.prerequisites)
      where value->>'kind' = ref.kind and value->>'id' = ref.record_id
    );
    if linked is not null then
      reason := private.velocity_import_prerequisite_issue(ref.kind, ref.record_id, linked, current_data);
      if reason is not null then return reason; end if;
    end if;
    if current_data is not null and current_data <> 'null'::jsonb then
      if ref.kind = 'meet' and item.kind in ('swim','relay') and (
        coalesce(current_data->>'startsOn', current_data->>'startDate', current_data#>>'{dates,startDate}') > item.data#>>'{meet,date}'
        or coalesce(current_data->>'endsOn', current_data->>'endDate', current_data#>>'{dates,endDate}') < item.data#>>'{meet,date}'
        or (item.data#>>'{sourceObservation,canonicalMeetCrosswalk,id}' is not null
          and item.data#>>'{sourceObservation,canonicalMeetCrosswalk,id}' <> ref.record_id)
      ) then return 'The result date or crosswalk disagrees with the published meet.'; end if;
      continue;
    end if;
    if linked is not null then
      if publish and not exists (
        select 1 from private.velocity_import_selection_rows sr
        cross join lateral jsonb_array_elements(sr.new_prerequisites) frozen
        where sr.selection_id = sid and sr.row_id = item.id
          and frozen->>'kind' = ref.kind and frozen->>'id' = ref.record_id
      ) then return 'A linked record changed after preview. Review a new selection.'; end if;
      continue;
    end if;
    if not publish and ref.kind in ('meet', 'relay') and exists (
      select 1 from private.velocity_import_selection_rows sr
      join private.velocity_import_rows parent on parent.id = sr.row_id
      where sr.selection_id = sid and parent.kind = ref.kind and parent.record_id = ref.record_id
        and parent.supplied_blocker is null and parent.status = 'pending'
        and private.velocity_import_issue(parent, sid) is null
    ) then continue; end if;
    return 'Select or approve the linked ' || ref.kind || ' (' || ref.record_id || ') first.';
  end loop;
  return null;
end;
$$;

create function private.stage_velocity_import(worker_token text, batch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  worker private.collection_workers;
  batch_id_value uuid;
  division_value text := batch->>'division';
  capture_url text := batch->>'sourceUrl';
  item jsonb;
  item_kind text;
  rid text;
  body jsonb;
  linked jsonb;
  dependency jsonb;
  recorded private.velocity_import_rows;
  staged integer := 0;
  duplicates integer := 0;
  blocked integer := 0;
  exceptions jsonb := '[]';
  reason text;
begin
  select * into worker from private.collection_workers
  where token_hash = encode(extensions.digest(worker_token, 'sha256'), 'hex') and revoked_at is null;
  if worker.id is null or not coalesce(division_value = any(worker.divisions), false) then
    raise insufficient_privilege using message = 'Collector access denied.';
  end if;
  if division_value not in ('knowledge', 'times')
    or pg_column_size(batch) > 2000000
    or jsonb_typeof(batch->'rows') is distinct from 'array'
    or coalesce(capture_url, '') !~ '^https?://[^[:space:]]+$' or length(capture_url) > 2048
    or coalesce(batch->>'sha256', '') !~ '^[a-f0-9]{64}$'
    or not coalesce(length(btrim(batch->>'sourceScope')) between 1 and 300, false)
    or coalesce(batch->>'coverage', '') not in ('complete', 'partial', 'unknown')
    or coalesce(batch->>'capturedAt', '') !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$'
    or not pg_input_is_valid(batch->>'capturedAt', 'timestamp with time zone')
  then raise invalid_parameter_value using message = 'Invalid import source or batch.'; end if;
  if jsonb_array_length(batch->'rows') not between 1 and 100 then
    raise invalid_parameter_value using message = 'Send 1–100 import rows per request.';
  end if;

  insert into private.velocity_import_batches(division, worker_id, source_url, captured_at, coverage, sha256, source_scope)
  values(division_value, worker.id, capture_url, (batch->>'capturedAt')::timestamptz,
    batch->>'coverage', batch->>'sha256', btrim(batch->>'sourceScope'))
  on conflict(division, source_url, sha256, source_scope) do nothing
  returning id into batch_id_value;
  if batch_id_value is null then
    select id into strict batch_id_value from private.velocity_import_batches
    where division = division_value and source_url = capture_url and sha256 = batch->>'sha256'
      and source_scope = btrim(batch->>'sourceScope');
  end if;

  for item in select value from jsonb_array_elements(batch->'rows') loop
    item_kind := coalesce(item->>'kind', '');
    rid := item->>'id';
    body := item->'data';
    linked := coalesce(item->'prerequisites', '[]');
    if not ((division_value = 'knowledge' and item_kind = 'catalog_meet')
      or (division_value = 'times' and item_kind in ('meet','swim','relay')))
    then raise insufficient_privilege using message = 'Row is outside the collector division.'; end if;
    if coalesce(rid, '') !~ '^[a-zA-Z0-9_-]{1,180}$'
      or jsonb_typeof(body) is distinct from 'object'
      or coalesce(body->>'id', rid) <> rid
      or pg_column_size(body) > 100000
      or jsonb_typeof(linked) is distinct from 'array'
      or length(coalesce(item->>'locator', rid)) > 300
      or length(coalesce(item->>'blocker', '')) > 500
    then raise invalid_parameter_value using message = 'Invalid import row.'; end if;
    if jsonb_array_length(linked) > 10 then
      raise invalid_parameter_value using message = 'Too many linked records in one import row.';
    end if;
    if item_kind = 'catalog_meet' then
      if body->>'kind' is distinct from 'meet' or nullif(btrim(body->>'title'), '') is null
        or coalesce(body->>'sourceUrl', capture_url) !~ '^https://[^[:space:]]+$'
        or coalesce(body->>'startsOn', '') !~ '^\d{4}-\d{2}-\d{2}$'
        or not pg_input_is_valid(body->>'startsOn', 'date')
        or jsonb_array_length(linked) > 0 then
        raise invalid_parameter_value using message = 'A catalog meet requires a title, valid start date, and HTTPS source.';
      end if;
      body := body || jsonb_build_object('sourceUrl', coalesce(body->>'sourceUrl', capture_url));
    elsif item_kind = 'meet' and nullif(btrim(body->>'name'), '') is null then
      raise invalid_parameter_value using message = 'A meet requires a name.';
    elsif item_kind in ('swim', 'relay') and (
      coalesce(body#>>'{meet,id}', '') !~ '^[a-zA-Z0-9_-]{1,180}$'
      or coalesce(body#>>'{meet,date}', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or not pg_input_is_valid(body#>>'{meet,date}', 'date')
      or coalesce(body->>'eventCode', '') !~ '^[0-9]{1,5}_[A-Z-]{2,5}_(SCY|SCM|LCM)$'
      or coalesce(body->>'course', '') <> split_part(body->>'eventCode', '_', 3)
      or jsonb_typeof(body->'timeMs') is distinct from 'number'
      or coalesce(body->>'timeMs', '') !~ '^[0-9]{1,12}$'
      or coalesce(body->>'status', '') not in ('OK', 'DQ', 'DFS', 'NS')
      or (body->>'status' = 'OK' and body->>'timeMs' ~ '^0+$')
      or (item_kind = 'swim' and coalesce(body->>'athleteId', '') !~ '^[a-zA-Z0-9_-]{1,180}$')
      or (item_kind = 'relay' and coalesce(body->>'teamId', '') !~ '^[a-zA-Z0-9_-]{1,180}$')
      or (item_kind = 'relay' and jsonb_typeof(body->'members') is distinct from 'array')
      or (body ? 'externalResult' and (
        coalesce(length(body#>>'{externalResult,namespace}'), 0) not between 1 and 80
        or coalesce(length(body#>>'{externalResult,id}'), 0) not between 1 and 256
      ))
      or coalesce(body#>>'{raceIdentity,occurrence}', 'single') !~ '^[a-zA-Z0-9_:-]{1,128}$'
    ) then raise invalid_parameter_value using message = 'A result requires a valid identity, event, date, status, and time.'; end if;

    -- IDs, nested references, and scope are verified before storing any row.
    body := body || jsonb_build_object('id', rid);
    for dependency in select value from jsonb_array_elements(linked) loop
      if coalesce(dependency->>'kind', '') not in ('athlete', 'team', 'venue')
        or coalesce(dependency->>'id', '') !~ '^[a-zA-Z0-9_-]{1,180}$'
        or jsonb_typeof(dependency->'data') is distinct from 'object'
        or coalesce(dependency#>>'{data,id}', dependency->>'id') <> dependency->>'id'
        or (
          select count(*) from jsonb_array_elements(linked) other
          where other->>'kind' = dependency->>'kind' and other->>'id' = dependency->>'id'
        ) <> 1
        or not exists (
          select 1 from private.velocity_import_references(item_kind, body, linked) ref
          where ref.kind = dependency->>'kind' and ref.record_id = dependency->>'id'
        )
        or (dependency->>'kind' = 'athlete' and (
          nullif(btrim(dependency#>>'{data,name,first}'), '') is null
          or nullif(btrim(dependency#>>'{data,name,last}'), '') is null
          or coalesce(dependency#>>'{data,swimcloudId}', '0') !~ '^[0-9]{1,18}$'
          or dependency#>'{data,personId}' is not null
          or dependency#>'{data,currentGroup}' is not null
        ))
        or (dependency->>'kind' <> 'athlete' and nullif(btrim(dependency#>>'{data,name}'), '') is null)
      then raise invalid_parameter_value using message = 'Invalid or unrelated linked record.'; end if;
    end loop;
    if exists (
      select 1 from private.velocity_import_references(item_kind, body, linked)
      where record_id !~ '^[a-zA-Z0-9_-]{1,180}$'
    ) then raise invalid_parameter_value using message = 'Invalid linked record ID.'; end if;

    insert into private.velocity_import_rows(batch_id, kind, record_id, data, prerequisites, locator, payload_hash, supplied_blocker)
    values(batch_id_value, item_kind, rid, body, linked, coalesce(nullif(item->>'locator', ''), rid),
      encode(extensions.digest(jsonb_build_array(body, linked, item->>'blocker')::text, 'sha256'), 'hex'),
      nullif(btrim(item->>'blocker'), ''))
    on conflict(batch_id, kind, record_id, locator, payload_hash) do nothing returning * into recorded;
    if recorded.id is null then
      duplicates := duplicates + 1;
      continue;
    end if;

    reason := private.velocity_import_issue(recorded);
    if reason = '' then
      update private.velocity_import_rows set status = 'duplicate' where id = recorded.id;
      duplicates := duplicates + 1;
    else
      staged := staged + 1;
      if reason is not null and reason not like 'Select or approve the linked %' then
        blocked := blocked + 1;
        if jsonb_array_length(exceptions) < 20 then
          exceptions := exceptions || jsonb_build_array(jsonb_build_object('id', rid, 'reason', reason));
        end if;
      end if;
    end if;
  end loop;
  return jsonb_build_object('batchId', batch_id_value, 'staged', staged, 'duplicates', duplicates,
    'blocked', blocked, 'exceptions', exceptions);
end;
$$;

create function private.velocity_import_summary(item private.velocity_import_rows, captured timestamptz, selection_match boolean)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', item.id,
    'kind', item.kind,
    'recordId', item.record_id,
    'label', case when item.kind = 'swim' then coalesce(
      case when jsonb_typeof(item.data->'athleteName') = 'string' then nullif(item.data->>'athleteName', '')
           else nullif(btrim(concat_ws(' ', item.data#>>'{athleteName,first}', item.data#>>'{athleteName,last}')), '') end,
      (select nullif(btrim(concat_ws(' ', a.data#>>'{name,first}', a.data#>>'{name,last}')), '')
       from public.public_athletes a where a.id = item.data->>'athleteId'),
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
    'blocker', case when item.status = 'pending' then coalesce(nullif(private.velocity_import_issue(item), ''), item.review_blocker) end,
    'batchId', item.batch_id,
    'capturedAt', captured,
    'selected', selection_match
  );
$$;

create function private.velocity_import_matches(query_tab text, query_search text, query_batch uuid)
returns setof private.velocity_import_rows language sql stable set search_path = '' as $$
  select r.* from private.velocity_import_rows r
  where r.status = 'pending' and r.tab = query_tab
    and (query_batch is null or r.batch_id = query_batch)
    and (coalesce(query_search, '') = '' or strpos(lower(
      concat_ws(' ', r.label, r.record_id, r.data#>>'{meet,name}', r.data#>>'{meet,id}', r.data->>'eventCode', r.data->>'teamName',
        (select concat_ws(' ', a.data#>>'{name,first}', a.data#>>'{name,last}')
         from public.public_athletes a where a.id = r.data->>'athleteId'),
        (select concat_ws(' ', p#>>'{data,name,first}', p#>>'{data,name,last}')
         from jsonb_array_elements(r.prerequisites) p where p->>'kind' = 'athlete' and p->>'id' = r.data->>'athleteId'))
    ), lower(query_search)) > 0);
$$;

create function private.velocity_import_queue(input jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  page_from integer := coalesce((input->>'offset')::integer, 0);
  page_tab text := input->>'kind';
  source_batch uuid := (input->>'batchId')::uuid;
  search text := btrim(input->>'search');
  only_selected boolean := coalesce((input->>'onlySelected')::boolean, false);
  ids uuid[];
  result jsonb;
begin
  if auth.uid() is null or not private.is_staff() then raise insufficient_privilege using message = 'Verified staff access required.'; end if;
  if page_tab is null or page_tab not in ('meets','swims') or page_from < 0 or length(search) > 200 then
    raise invalid_parameter_value using message = 'Invalid import queue filters.';
  end if;
  select array(select value::uuid from jsonb_array_elements_text(coalesce(input->'selectionIds', '[]'))) into ids;
  if cardinality(ids) > 10 then raise invalid_parameter_value using message = 'Too many selections.'; end if;

  with selected as materialized (
    select sr.row_id, sr.preview_blocker from private.velocity_import_selections s
    join private.velocity_import_selection_rows sr on sr.selection_id = s.id
    where s.reviewer_id = auth.uid() and s.id = any(ids)
  ), matches as materialized (
    select r.id from private.velocity_import_matches(page_tab, search, source_batch) r
    where not only_selected or exists(select 1 from selected where row_id = r.id)
  ), page as materialized (
    select id from matches order by id limit 30 offset page_from
  )
  select jsonb_build_object('rows', coalesce((
    select jsonb_agg(private.velocity_import_summary(r, b.captured_at, exists(select 1 from selected where row_id = r.id))
      || case when only_selected then jsonb_build_object('blocker', (
        select min(preview_blocker) from selected where row_id = r.id
      )) else '{}'::jsonb end order by r.id)
    from page join private.velocity_import_rows r on r.id = page.id join private.velocity_import_batches b on b.id = r.batch_id
  ), '[]'), 'total', (select count(*) from matches),
    'hasNext', (select count(*) from matches) > page_from + 30) into result;
  return result;
end;
$$;

create function private.velocity_import_preview_prerequisites(sid uuid)
returns table(kind text, id text, label text) language sql stable set search_path = '' as $$
  select distinct linked->>'kind', linked->>'id',
    case when linked->>'kind' = 'athlete'
      then btrim(concat_ws(' ', linked#>>'{data,name,first}', linked#>>'{data,name,last}'))
      else linked#>>'{data,name}' end
  from private.velocity_import_selection_rows sr cross join lateral jsonb_array_elements(sr.new_prerequisites) linked
  where sr.selection_id = sid and sr.preview_blocker is null;
$$;

create function private.velocity_import_detail(input jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
  sid uuid := (input->>'selectionId')::uuid;
  section text := input->>'section';
  page_from integer := coalesce((input->>'offset')::integer, 0);
begin
  if auth.uid() is null or not private.is_staff() then raise insufficient_privilege using message = 'Verified staff access required.'; end if;
  if sid is not null then
    if section is null or section not in ('prerequisites', 'blockers') or page_from < 0 then
      raise invalid_parameter_value using message = 'Invalid import preview section.';
    end if;
    if not exists(select 1 from private.velocity_import_selections where id = sid and reviewer_id = auth.uid() and previewed) then
      raise sqlstate 'PT404' using message = 'Import preview was not found.';
    end if;
    with matches as materialized (
      select jsonb_build_object('kind', p.kind, 'id', p.id, 'label', p.label) item, p.id, p.label, p.kind
      from private.velocity_import_preview_prerequisites(sid) p where section = 'prerequisites'
      union all
      select jsonb_build_object('id', r.id, 'label', r.label, 'reason', sr.preview_blocker), r.id::text, r.label, ''
      from private.velocity_import_selection_rows sr join private.velocity_import_rows r on r.id = sr.row_id
      where sr.selection_id = sid and sr.preview_blocker is not null and section = 'blockers'
    ), page as (
      select * from matches order by kind, label, id limit 30 offset page_from
    )
    select jsonb_build_object('rows', coalesce((select jsonb_agg(item order by kind, label, id) from page), '[]'),
      'total', (select count(*) from matches), 'hasNext', (select count(*) from matches) > page_from + 30) into result;
    return result;
  end if;
  select private.velocity_import_summary(r, b.captured_at, false) || jsonb_build_object(
    'data', r.data, 'prerequisites', r.prerequisites, 'sourceUrl', b.source_url, 'sha256', b.sha256,
    'coverage', b.coverage, 'sourceScope', b.source_scope, 'locator', r.locator
  ) into result from private.velocity_import_rows r join private.velocity_import_batches b on b.id = r.batch_id
  where r.id = (input->>'id')::uuid;
  if result is null then raise sqlstate 'PT404' using message = 'Import row was not found.'; end if;
  return result;
end;
$$;

-- This runs in the staff-checked selection RPC. Locking the selection
-- serializes retries while keeping each preparation request bounded.
create function private.velocity_import_prepare_selection(sid uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare
  selection private.velocity_import_selections;
  checked integer;
  blocked integer;
  result jsonb;
begin
  select * into selection from private.velocity_import_selections
  where id = sid and reviewer_id = auth.uid() for update;
  if selection.id is null then raise sqlstate 'PT404' using message = 'Import selection was not found.'; end if;

  if selection.preview_required and not selection.previewed then
    with next_rows as materialized (
      select sr.row_id from private.velocity_import_selection_rows sr
      where sr.selection_id = sid and not sr.preview_checked
      order by sr.sort_order, sr.row_id limit 300
    ), prepared as (
      update private.velocity_import_selection_rows sr
      set preview_blocker = nullif(private.velocity_import_issue(r, sid), ''),
        new_prerequisites = coalesce((
          select jsonb_agg(linked) from jsonb_array_elements(r.prerequisites) linked
          where private.collection_snapshot(private.velocity_import_path(linked->>'kind', linked->>'id')) is null
        ), '[]'),
        preview_checked = true
      from next_rows n join private.velocity_import_rows r on r.id = n.row_id
      where sr.selection_id = sid and sr.row_id = n.row_id
      returning sr.preview_blocker
    )
    select count(*), count(*) filter (where preview_blocker is not null) into checked, blocked from prepared;

    update private.velocity_import_selections s
    set preview_checked_count = s.preview_checked_count + checked,
      preview_blocked_count = s.preview_blocked_count + blocked,
      previewed = s.preview_checked_count + checked = s.row_count
    where s.id = sid returning * into selection;
  end if;

  result := jsonb_build_object(
    'selectionId', sid, 'selected', selection.row_count, 'meets', selection.meet_count,
    'swims', selection.row_count - selection.meet_count, 'blocked', selection.preview_blocked_count,
    'previewRemaining', case when selection.preview_required then selection.row_count - selection.preview_checked_count else 0 end,
    'prerequisiteCount', 0, 'prerequisites', '[]'::jsonb, 'blockers', '[]'::jsonb
  );
  if not selection.previewed then return result; end if;

  with details as materialized (
    select * from private.velocity_import_preview_prerequisites(sid)
  )
  select result || jsonb_build_object(
    'prerequisiteCount', (select count(*) from details),
    'prerequisites', coalesce((select jsonb_agg(p) from (select * from details order by kind, label, id limit 100) p), '[]'),
    'blockers', coalesce((select jsonb_agg(b) from (
      select r.id, r.label, sr.preview_blocker as reason
      from private.velocity_import_selection_rows sr join private.velocity_import_rows r on r.id = sr.row_id
      where sr.selection_id = sid and sr.preview_blocker is not null order by r.label, r.id limit 25
    ) b), '[]')
  ) into result;
  return result;
end;
$$;

create function private.velocity_import_selection(input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  reviewer uuid := auth.uid();
  sid uuid;
  ids uuid[];
  excluded uuid[];
  previous uuid[];
  filter jsonb;
  match_tab text;
  match_search text;
  match_batch uuid;
  selection_filters jsonb := coalesce(input->'matches', '[]');
  should_preview boolean := coalesce((input->>'preview')::boolean, true);
  selected_count integer;
  selected_meets integer;
begin
  if reviewer is null or not private.is_staff() then raise insufficient_privilege using message = 'Verified staff access required.'; end if;
  if input ? 'prepareSelectionId' then
    return private.velocity_import_prepare_selection((input->>'prepareSelectionId')::uuid);
  end if;
  if jsonb_typeof(selection_filters) is distinct from 'array' or jsonb_array_length(selection_filters) > 2 then
    raise invalid_parameter_value using message = 'Select at most two import filters.';
  end if;
  select array(select value::uuid from jsonb_array_elements_text(coalesce(input->'ids', '[]'))) into ids;
  select array(select value::uuid from jsonb_array_elements_text(coalesce(input->'excludeIds', '[]'))) into excluded;
  select array(select value::uuid from jsonb_array_elements_text(coalesce(input->'selectionIds', '[]'))) into previous;
  if cardinality(ids) > 5000 or cardinality(excluded) > 5000 or cardinality(previous) > 10 then
    raise invalid_parameter_value using message = 'Too many explicit IDs in this selection. Use Select all matching.';
  end if;
  if exists (
    select 1 from unnest(previous) requested
    where not exists(select 1 from private.velocity_import_selections where id = requested and reviewer_id = reviewer)
  ) then raise sqlstate 'PT404' using message = 'An import selection is unavailable. Select the rows again.'; end if;

  delete from private.velocity_import_selections s
  where s.reviewer_id = reviewer and s.started_at is null and s.created_at < now() - interval '1 day'
    and not (s.id = any(previous));
  insert into private.velocity_import_selections(reviewer_id, preview_required) values (reviewer, should_preview) returning id into sid;

  insert into private.velocity_import_selection_rows(selection_id, row_id, sort_order)
  select sid, r.id, private.velocity_import_sort(r.kind) from private.velocity_import_rows r
  where r.id in (
    select unnest(ids)
    union all
    select row_id from private.velocity_import_selection_rows where selection_id = any(previous)
  ) and r.status = 'pending' and not (r.id = any(excluded));
  for filter in select value from jsonb_array_elements(selection_filters) loop
    match_tab := filter->>'kind';
    match_search := btrim(filter->>'search');
    match_batch := (filter->>'batchId')::uuid;
    if match_tab is null or match_tab not in ('meets','swims') or length(match_search) > 200 then
      raise invalid_parameter_value using message = 'Invalid select-all filter.';
    end if;
    insert into private.velocity_import_selection_rows(selection_id, row_id, sort_order)
    select sid, r.id, private.velocity_import_sort(r.kind) from private.velocity_import_matches(match_tab, match_search, match_batch) r
    where not (r.id = any(excluded)) on conflict do nothing;
  end loop;

  select count(*), count(*) filter (where sr.sort_order <= 2) into selected_count, selected_meets
  from private.velocity_import_selection_rows sr where sr.selection_id = sid;
  update private.velocity_import_selections set row_count = selected_count, meet_count = selected_meets where id = sid;
  return private.velocity_import_prepare_selection(sid);
end;
$$;

create function private.approve_velocity_import(selection_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  reviewer uuid := auth.uid();
  sid uuid := selection_id;
  selected_row record;
  item private.velocity_import_rows;
  reason text;
  linked jsonb;
  linked_data jsonb;
  item_outcome text;
  published integer := 0;
  duplicates integer := 0;
  blocked integer := 0;
  event_codes text[] := '{}';
  receipt jsonb;
begin
  if reviewer is null or not private.is_staff() then raise insufficient_privilege using message = 'Verified staff access required.'; end if;
  perform 1 from private.velocity_import_selections s where s.id = sid and s.reviewer_id = reviewer and s.previewed for update;
  if not found then raise sqlstate 'PT404' using message = 'Import selection was not found.'; end if;
  update private.velocity_import_selections set started_at = coalesce(started_at, now()) where id = sid;
  perform pg_advisory_xact_lock(hashtext('velocity-records'));
  perform set_config('velocity.defer_bests', 'true', true);

  for selected_row in
    select r as item, sr.preview_blocker from private.velocity_import_selection_rows sr
    join private.velocity_import_rows r on r.id = sr.row_id
    where sr.selection_id = sid and sr.outcome is null
    order by sr.sort_order, sr.row_id
    limit 100 for update of sr, r
  loop
    item := selected_row.item;
    if item.status <> 'pending' then
      item_outcome := 'duplicate';
      reason := null;
    else
      reason := coalesce(selected_row.preview_blocker, private.velocity_import_issue(item, sid, true));
      item_outcome := case when reason = '' then 'duplicate' when reason is not null then 'blocked' else 'approved' end;
      if item_outcome = 'approved' then
        -- Row-level data failures must not publish its prerequisites or abort
        -- unrelated selections. Infrastructure errors roll back the chunk.
        begin
          for linked in
            select value from jsonb_array_elements(item.prerequisites)
            order by case value->>'kind' when 'team' then 1 when 'venue' then 2 else 3 end, value->>'id'
          loop
            if private.collection_snapshot(private.velocity_import_path(linked->>'kind', linked->>'id')) is null then
              linked_data := linked->'data' || jsonb_build_object('id', linked->>'id');
              if linked->>'kind' = 'athlete' then
                linked_data := linked_data || jsonb_build_object('currentGroup', jsonb_build_object(
                  'id', 'unassigned', 'name', coalesce(
                    (select name from public.training_groups where id = 'unassigned'), 'No Assignment')
                ));
              end if;
              perform private.put_record(private.velocity_import_path(linked->>'kind', linked->>'id'), linked_data);
            end if;
          end loop;
          perform private.put_record(private.velocity_import_path(item.kind, item.record_id), item.data);
        exception
          when unique_violation or foreign_key_violation or check_violation or not_null_violation
            or invalid_text_representation or invalid_datetime_format or datetime_field_overflow
            or numeric_value_out_of_range or raise_exception then
            item_outcome := 'blocked';
            reason := 'Publish validation failed. ' || left(sqlerrm, 400);
        end;
        if item_outcome = 'approved' then
          published := published + 1;
          if item.kind = 'swim' then event_codes := array_append(event_codes, item.data->>'eventCode'); end if;
        end if;
      end if;
      if item_outcome = 'blocked' then
        update private.velocity_import_rows set review_blocker = reason where id = item.id;
      else
        update private.velocity_import_rows set status = item_outcome, review_blocker = null,
          reviewed_by = reviewer, reviewed_at = now() where id = item.id;
      end if;
    end if;
    if item_outcome = 'blocked' then blocked := blocked + 1; end if;
    if item_outcome = 'duplicate' then duplicates := duplicates + 1; end if;
    update private.velocity_import_selection_rows sr set outcome = item_outcome
    where sr.selection_id = sid and sr.row_id = item.id;
  end loop;

  perform set_config('velocity.defer_bests', 'false', true);
  if cardinality(event_codes) > 0 then
    perform private.rebuild_bests_for_events(array(select distinct unnest(event_codes)));
  end if;
  update private.velocity_import_selections s set approved_count = s.approved_count + published,
    duplicate_count = s.duplicate_count + duplicates, blocked_count = s.blocked_count + blocked
  where s.id = sid returning jsonb_build_object(
    'selected', s.row_count, 'approved', s.approved_count, 'duplicates', s.duplicate_count, 'blocked', s.blocked_count,
    'remaining', s.row_count - s.approved_count - s.duplicate_count - s.blocked_count,
    'done', s.row_count = s.approved_count + s.duplicate_count + s.blocked_count,
    'published', published
  ) into receipt;
  return receipt;
end;
$$;

create function public.stage_velocity_import(worker_token text, batch jsonb)
returns jsonb language sql set search_path = '' as $$
  select private.stage_velocity_import(worker_token, batch);
$$;
create function public.velocity_import_queue(input jsonb)
returns jsonb language sql stable set search_path = '' as $$
  select private.velocity_import_queue(input);
$$;
create function public.velocity_import_detail(input jsonb)
returns jsonb language sql stable set search_path = '' as $$
  select private.velocity_import_detail(input);
$$;
create function public.velocity_import_selection(input jsonb)
returns jsonb language sql set search_path = '' as $$
  select private.velocity_import_selection(input);
$$;
create function public.approve_velocity_import(selection_id uuid)
returns jsonb language sql set search_path = '' as $$
  select private.approve_velocity_import(selection_id);
$$;

revoke all on function
  private.velocity_import_normalize_name(text),
  private.velocity_import_sort(text),
  private.velocity_import_path(text, text),
  private.velocity_import_same_result(jsonb, jsonb),
  private.velocity_import_record_check(text, text, jsonb),
  private.velocity_import_references(text, jsonb, jsonb),
  private.velocity_import_prerequisite_issue(text, text, jsonb, jsonb),
  private.velocity_import_issue(private.velocity_import_rows, uuid, boolean),
  private.velocity_import_summary(private.velocity_import_rows, timestamptz, boolean),
  private.velocity_import_matches(text, text, uuid),
  private.velocity_import_preview_prerequisites(uuid),
  private.velocity_import_prepare_selection(uuid),
  private.stage_velocity_import(text, jsonb),
  private.velocity_import_queue(jsonb),
  private.velocity_import_detail(jsonb),
  private.velocity_import_selection(jsonb),
  private.approve_velocity_import(uuid),
  public.stage_velocity_import(text, jsonb),
  public.velocity_import_queue(jsonb),
  public.velocity_import_detail(jsonb),
  public.velocity_import_selection(jsonb),
  public.approve_velocity_import(uuid)
  from public, anon, authenticated, service_role;

-- The immutable expression supports ordinary service-role writes to canonical
-- people and team tables as well as the inbox's indexed lookups.
grant execute on function private.velocity_import_normalize_name(text) to service_role;

grant execute on function private.stage_velocity_import(text, jsonb), public.stage_velocity_import(text, jsonb)
  to anon, authenticated;
grant execute on function private.velocity_import_queue(jsonb), public.velocity_import_queue(jsonb),
  private.velocity_import_detail(jsonb), public.velocity_import_detail(jsonb),
  private.velocity_import_selection(jsonb), public.velocity_import_selection(jsonb),
  private.approve_velocity_import(uuid), public.approve_velocity_import(uuid)
  to authenticated;
notify pgrst, 'reload schema';

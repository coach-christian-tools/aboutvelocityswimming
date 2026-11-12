create table public.times_ranking_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  filters jsonb not null check (jsonb_typeof(filters) = 'object'),
  search text not null default '' check (char_length(search) <= 100),
  created_at timestamptz not null default now()
);

create index times_ranking_bookmarks_user_order_idx
  on public.times_ranking_bookmarks (user_id, created_at, id);

alter table public.times_ranking_bookmarks enable row level security;
revoke all on public.times_ranking_bookmarks from public, anon, authenticated;
grant select, delete on public.times_ranking_bookmarks to authenticated;
grant insert (user_id, name, filters, search), update (name)
  on public.times_ranking_bookmarks to authenticated;
grant all on public.times_ranking_bookmarks to service_role;

create policy "Manage own ranking bookmarks" on public.times_ranking_bookmarks
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create function public.ies_times_recent(input jsonb default '{}')
returns jsonb
language plpgsql stable security invoker
set search_path = '' set extra_float_digits = 3 set plan_cache_mode = 'force_custom_plan'
as $$
declare
  start_at int := coalesce((input->>'offset')::int, 0);
  page_size int := coalesce((input->>'limit')::int, 25);
  needle text := lower(trim(coalesce(input->>'search', '')));
  answer jsonb;
begin
  if start_at < 0 or page_size not between 1 and 100 or length(needle) > 100 then
    raise exception 'Invalid pagination or search';
  end if;

  with matching as materialized (
    select id, nullif(date, '') as swim_date, time
    from public.ies_times_candidates(input)
    where needle = '' or position(needle in lower(search_name)) > 0
  ), page as (
    select * from matching
    order by swim_date desc nulls last, time, id
    limit page_size offset start_at
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(
      jsonb_build_object('race', public.ies_times_json_id(id))
      order by swim_date desc nulls last, time, id
    ) from page), '[]'::jsonb),
    'total', (select count(*) from matching)
  ) into answer;
  return answer;
end;
$$;

revoke all on function public.ies_times_recent(jsonb) from public;
grant execute on function public.ies_times_recent(jsonb) to anon, authenticated, service_role;

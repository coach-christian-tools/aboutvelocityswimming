-- Run with psql against the seeded local database; every fixture rolls back.
begin;
do $$
declare source jsonb; rid text; initial_time timestamptz;
begin
  select data into source from public.swims where not is_relay limit 1;
  assert source is not null, 'Seed the local database first';
  for i in 1..61 loop
    rid := 'observatory-fixture-' || i;
    insert into public.swims(id,data) values(rid,source || jsonb_build_object(
      'id',rid,'eventCode','100_FR_SCY','course','SCY','timeMs',60000+i,'status','OK','isRelay',false,
      'meet',source->'meet'||jsonb_build_object('name','Observatory fixture meet','date',case when i<=30 then '2004-06-01' else '2018-07-01' end),
      'raceIdentity',jsonb_build_object('occurrence',rid,'reviewed',true,'basis','Independent synthetic starts','sourceUrl','https://example.test/observatory')));
  end loop;
  select archive_added_at into initial_time from public.public_swims where id='observatory-fixture-1';
  assert initial_time is not null, 'New imports get an archive entry timestamp';
  update public.swims set data=jsonb_set(data,'{timeMs}','61000') where id='observatory-fixture-1';
  assert (select archive_added_at=initial_time from public.public_swims where id='observatory-fixture-1'), 'Editing does not change entry time';
  delete from public.public_swims where id='observatory-fixture-1';
  update public.swims set data=jsonb_set(data,'{timeMs}','62000') where id='observatory-fixture-1';
  assert (select archive_added_at=initial_time from public.public_swims where id='observatory-fixture-1'), 'Restoration does not invent a new import';
  update public.swims set archive_added_at=null where id='observatory-fixture-2';
  update public.swims set data=data where id='observatory-fixture-2';
end;
$$;
set local role anon;
do $$
declare result jsonb; filtered jsonb; selected jsonb; meet_id text;
begin
  result := public.archive_observatory('{"search":"Observatory fixture meet"}');
  assert (result#>>'{totals,swims}')::int=61, 'Totals count all matching results';
  assert (select sum((y->>'count')::int) from jsonb_array_elements(result->'years') y)=61, 'Year tiles reconcile';
  assert (select sum((m->>'count')::int) from jsonb_array_elements(result->'meets') m)=61, 'Meet tiles reconcile';
  assert (select sum((m->>'count')::int) from jsonb_array_elements(result->'raceGrowth') m)=61, 'Race growth reconciles';
  assert (select sum((m->>'count')::int) from jsonb_array_elements(result->'importGrowth') m)=60, 'Unknown import dates stay out of the curve';
  assert (result#>>'{totals,unknownImports}')::int=1, 'Unknown import dates are reported';
  filtered := public.archive_observatory('{"search":"Observatory fixture meet","year":"2004","course":"SCY"}');
  assert (filtered#>>'{totals,swims}')::int=30, 'Shared year and course filters intersect';
  filtered := public.archive_observatory('{"search":"Observatory fixture meet","course":"LCM"}');
  assert (filtered#>>'{totals,swims}')::int=0, 'Empty selection stays empty';
  meet_id := result#>>'{meets,0,id}';
  selected := public.archive_observatory(jsonb_build_object('search','Observatory fixture meet','meet',meet_id));
  assert jsonb_array_length(selected->'results')=50, 'Result details are bounded';
  selected := public.archive_observatory(jsonb_build_object('search','Observatory fixture meet','meet',meet_id,'resultOffset',50));
  assert jsonb_array_length(selected->'results')=11, 'Result pagination preserves the cohort';
  selected := public.archive_observatory(jsonb_build_object('search','Observatory fixture meet','athlete',result#>>'{athletes,0,id}'));
  assert (selected#>>'{totals,swims}')::int=61, 'Athlete drill-down uses the same filters';
  assert (select prosecdef=false from pg_proc where oid='public.archive_observatory(jsonb)'::regprocedure), 'RPC respects invoker RLS';
end;
$$;
rollback;

-- Sort matching meets by distance from the chosen day before paginating.
do $$
declare
  definition text;
  previous_section text := $previous$  select id,name,date,count,courses from all_meets
  where matches_filters and (needle='' or position(needle in lower(name))>0)
 ), page as (select * from searched order by date desc,name,id limit size offset start_at)
 select jsonb_build_object('meets',coalesce((select jsonb_agg(to_jsonb(p) order by p.date desc,p.name,p.id) from page p),'[]'),'total',(select count(*) from searched)) into answer;$previous$;
  new_section text := $new$  select id,name,date,count,courses,
   case when nullif(input->>'meetDate','') is not null
    and left(date,10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and pg_input_is_valid(left(date,10),'date')
    then abs(left(date,10)::date - (input->>'meetDate')::date)
   end as distance
  from all_meets
  where matches_filters and (needle='' or position(needle in lower(name))>0)
 ), page as (
  select * from searched order by distance nulls last,date desc,name,id limit size offset start_at
 )
 select jsonb_build_object(
  'meets',coalesce((select jsonb_agg(to_jsonb(p)-'distance' order by p.distance nulls last,p.date desc,p.name,p.id) from page p),'[]'),
  'total',(select count(*) from searched)
 ) into answer;$new$;
begin
  select pg_get_functiondef('public.ies_times_query(text,jsonb)'::regprocedure) into definition;
  if strpos(definition, new_section) > 0 then return; end if;
  if strpos(definition, previous_section) = 0 then
    raise exception 'Meet search query changed. Inspect before applying.';
  end if;
  execute replace(definition, previous_section, new_section);
end $$;

-- Keep specialized motivational editions out of the general athlete benchmark.
-- Replace only the known predicate, preserving concurrent query improvements.
do $$
declare definition text; needle text := $match$data->>'category'='motivational' and$match$;
begin
 select pg_get_functiondef('public.ies_times_query(text,jsonb)'::regprocedure) into definition;
 if position($already$coalesce(data->>'standardType','age-group')='age-group'$already$ in definition)>0 then return; end if;
 if position(needle in definition)=0 then raise exception 'Benchmark predicate changed; inspect before applying'; end if;
 definition:=replace(definition,needle,$replacement$data->>'category'='motivational' and coalesce(data->>'standardType','age-group')='age-group' and$replacement$);
 execute definition;
end $$;

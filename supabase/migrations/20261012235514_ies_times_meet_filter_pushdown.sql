-- Apply the selected meet before materializing the public filtered cohort.
create or replace function public.ies_times_filtered(input jsonb) returns setof public.ies_times_races language sql stable set search_path='' as $$
 select r.* from public.ies_times_races r join public.public_times_teams t on t.id=r.team
 where (coalesce(input->>'team','')='' or r.team=input->>'team')
 and (coalesce(input->>'course','')='' or r.course=input->>'course')
 and (coalesce(input->>'event','')='' or r.event=input->>'event')
 and (coalesce(input->>'meetId','')='' or r.meet_id=input->>'meetId')
 and (coalesce(input->>'year','')='' or left(r.date,4)=input->>'year')
 and (coalesce(input->>'round','')='' or r.round=input->>'round')
 and (coalesce(input->>'official','')='' or r.official=(input->>'official'='official'))
 and (not (input ? 'genders') or input->'genders' ? r.gender)
 and (coalesce(jsonb_array_length(input->'ageGroups'),0)=0 or input->'ageGroups' ? public.ies_times_age(r.age,r.relay,r.relay_age))
 and r.relay=coalesce((input->>'relay')::boolean,false) and (not r.relay or r.relay_leg is null);
$$;

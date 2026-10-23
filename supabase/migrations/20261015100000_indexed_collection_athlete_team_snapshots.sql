-- Preserve snapshot JSON using indexed team/athlete lookups. No data or access changes.
-- Preserve indexed lookups for both meet and standard proposal baselines.
CREATE OR REPLACE FUNCTION private.collection_snapshot(record_path text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
 select case when starts_with(record_path,'families/') then
  (select f.data || jsonb_build_object('authorizedEmails',coalesce((select jsonb_agg(email order by email) from public.family_emails where family_id=f.id),'[]'::jsonb),
   'children',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'group',group_name) order by name) from public.workshare_members where family_id=f.id),'[]'::jsonb))
   from public.families f where f.id=split_part(record_path,'/',2))
 when starts_with(record_path,'knowledge_entries/') then (select data from public.knowledge_entries where id=split_part(record_path,'/',2))
 when record_path='relay_results/'||split_part(record_path,'/',2) then
  (select data from public.relay_results where id=split_part(record_path,'/',2))
 when record_path='swims/'||split_part(record_path,'/',2) then
  (select data from public.swims where id=split_part(record_path,'/',2))
 when record_path='meets/'||split_part(record_path,'/',2) then
  (select data from public.meets where id=split_part(record_path,'/',2))
 when record_path='standards/'||split_part(record_path,'/',2) then
  (select data from public.standards where id=split_part(record_path,'/',2))
 when record_path='teams/'||split_part(record_path,'/',2) then
  (select data from public.teams where id=split_part(record_path,'/',2)
   union all select data from public.evidence_records where path=record_path)
 when record_path='athletes/'||split_part(record_path,'/',2) then
  (select private.athlete_snapshot(data,person_id,group_id) from public.athletes where id=split_part(record_path,'/',2)
   union all select data from public.evidence_records where path=record_path)
 else (select data from public.app_records where path=record_path) end;
$function$;

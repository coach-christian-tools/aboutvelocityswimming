-- Meet proposal snapshots must use the primary key instead of scanning the
-- app_records UNION. Preserve invoker security, RLS, and snapshot data shape.
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
 else (select data from public.app_records where path=record_path) end;
$function$;

SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.stage_collection (
  worker_token text,
  batch        jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare worker private.collection_workers; w jsonb; root text; snapshots jsonb:='[]'; current_data jsonb; bid uuid; fp text; paths text[]:='{}';
begin
 select * into worker from private.collection_workers where token_hash=encode(extensions.digest(worker_token,'sha256'),'hex') and revoked_at is null;
 if worker.id is null or not coalesce(batch->>'division'=any(worker.divisions),false) then raise insufficient_privilege using message='Collector access denied'; end if;
 if pg_column_size(batch)>2097152 or jsonb_typeof(batch->'writes') is distinct from 'array'
  or jsonb_array_length(batch->'writes') not between 1 and 100 or batch->'evidence' is null or batch->'evidence'='null' then raise exception 'Batch requires evidence and 1–100 proposed records (maximum 2 MB)'; end if;
 perform pg_advisory_xact_lock(hashtext('velocity-records'));
 for w in select * from jsonb_array_elements(batch->'writes') loop
  root:=split_part(w->>'path','/',1);
  if w->>'path' is null or w->>'path' !~ '^[a-z_]+/[a-zA-Z0-9_-]+$' or w->>'path'=any(paths)
   or jsonb_typeof(w->'after') is distinct from 'object' then raise exception 'Each proposal requires a unique record path and object; removals require manual review'; end if;
  if not ((batch->>'division'='workshare' and root='families')
    or (batch->>'division'='times' and root=any(array['athletes','swims','meets','teams','venues']))
    or (batch->>'division'='knowledge' and root='knowledge_entries')) then raise exception 'Record outside collection division'; end if;
  paths:=array_append(paths,w->>'path');
  current_data:=private.collection_snapshot(w->>'path');
  if root='families' and current_data is not null and batch->>'coverage'='partial' then
   if exists(select 1 from jsonb_array_elements(coalesce(current_data->'children','[]')) old_child
    where not exists(select 1 from jsonb_array_elements(coalesce(w#>'{after,children}','[]')) new_child where new_child->>'id'=old_child->>'id'))
    or exists(select 1 from jsonb_array_elements_text(coalesce(current_data->'authorizedEmails','[]')) old_email
    where not exists(select 1 from jsonb_array_elements_text(coalesce(w#>'{after,authorizedEmails}','[]')) new_email where lower(new_email)=lower(old_email)))
   then raise exception 'Partial roster collection cannot remove household members or authorized emails. Hold the proposal and review the complete household.'; end if;
  end if;
  snapshots:=snapshots||jsonb_build_array(jsonb_build_object('path',w->>'path','before',current_data));
 end loop;
 fp:=encode(extensions.digest(jsonb_build_object('division',batch->>'division','url',batch->>'sourceUrl','writes',batch->'writes','reads',snapshots)::text,'sha256'),'hex');
 insert into public.collection_batches(division,scope,source_url,captured_at,coverage,evidence,writes,reads,fingerprint,worker_id)
 values(batch->>'division',batch->>'scope',batch->>'sourceUrl',(batch->>'capturedAt')::timestamptz,batch->>'coverage',batch->'evidence',batch->'writes',snapshots,fp,worker.id)
 on conflict(fingerprint) do nothing returning id into bid;
 if bid is null then select id into bid from public.collection_batches where fingerprint=fp; end if;
 return bid;
end; $function$;


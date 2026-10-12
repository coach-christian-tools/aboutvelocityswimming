-- Staff queue metadata must not carry every raw record and snapshot.
-- Full evidence and comparisons remain on collection_batches, fetched by ID.
CREATE OR REPLACE FUNCTION private.collection_review_summary(value jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT CASE WHEN value IS NULL OR value = 'null'::jsonb THEN 'null'::jsonb ELSE
  jsonb_strip_nulls(jsonb_build_object(
   'name', value->'name', 'title', value->'title', 'gaps', value->'gaps',
   'teamId', value->'teamId', 'hostTeamId', value->'hostTeamId',
   'venueId', value->'venueId', 'athleteId', value->'athleteId',
   'meet', CASE WHEN value ? 'meet' THEN jsonb_strip_nulls(jsonb_build_object(
      'id', value#>'{meet,id}', 'name', value#>'{meet,name}', 'date', value#>'{meet,date}')) ELSE NULL END
  )) END;
$$;
REVOKE ALL ON FUNCTION private.collection_review_summary(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.collection_review_summary(jsonb) TO authenticated;

CREATE VIEW public.collection_batch_queue WITH (security_invoker = true) AS
SELECT b.id,b.division,b.scope,b.source_url,b.captured_at,b.received_at,b.coverage,
 b.status,b.review_note,b.reviewed_at,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('path',w->>'path',
    'after',private.collection_review_summary(w->'after')) ORDER BY ordinal),'[]'::jsonb)
  FROM jsonb_array_elements(b.writes) WITH ORDINALITY AS items(w,ordinal)) AS writes,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('path',r->>'path',
    'before',CASE WHEN r->'before' IS NULL OR r->'before'='null'::jsonb THEN 'null'::jsonb ELSE '{}'::jsonb END)
    ORDER BY ordinal),'[]'::jsonb)
  FROM jsonb_array_elements(b.reads) WITH ORDINALITY AS items(r,ordinal)) AS reads
FROM public.collection_batches b;
REVOKE ALL ON public.collection_batch_queue FROM PUBLIC, anon;
GRANT SELECT ON public.collection_batch_queue TO authenticated;

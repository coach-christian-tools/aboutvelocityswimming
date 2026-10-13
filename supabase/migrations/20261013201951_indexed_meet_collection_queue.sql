-- Preserve staff-only access while avoiding broad swim scans in meet indexing.
-- JSON expressions in a swim predicate cannot become index conditions under RLS.
-- Materialize canonical IDs first so both progress checks use swims_meet_id_idx.
CREATE OR REPLACE FUNCTION private.meet_collection_queue(input jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  result jsonb;
  exporting boolean := coalesce((input->>'export')::boolean,false);
  page_offset integer := coalesce((input->>'offset')::integer,0);
  search_pattern text;
BEGIN
  IF NOT private.is_staff() AND coalesce(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE insufficient_privilege USING MESSAGE = 'Staff access is required.';
  END IF;
  IF page_offset < 0 OR page_offset > 1000000 THEN RAISE EXCEPTION 'Invalid page offset.' USING ERRCODE = '22023'; END IF;
  search_pattern := '%' || replace(replace(replace(coalesce(input->>'search',''), chr(92), chr(92)||chr(92)), '%', chr(92)||'%'), '_', chr(92)||'_') || '%';
  WITH meet_keys AS MATERIALIZED (
    -- Compute the JSON-derived key before crossing the swims RLS barrier.
    -- A simple text parameter lets the existing meet_id index restrict rows.
    SELECT k.*, coalesce(nullif(k.data->>'canonicalMeetId',''),k.id) canonical_meet_id
    FROM public.knowledge_entries k WHERE k.kind = 'meet'
  ), catalog AS MATERIALIZED (
    SELECT k.id, k.title, k.starts_on, k.ends_on, k.source_url, k.data, k.canonical_meet_id,
      CASE WHEN jsonb_typeof(k.data->'participants') = 'array' THEN k.data->'participants' ELSE '[]'::jsonb END participants,
      CASE WHEN k.data->>'participationCoverage' IN ('unknown','partial','complete') THEN k.data->>'participationCoverage' ELSE 'unknown' END team_coverage,
      CASE WHEN k.data->>'meetCategory' IN ('sanctioned','approved','observed') THEN k.data->>'meetCategory' ELSE 'unknown' END category,
      coalesce(w.selected,false) selected, coalesce(w.priority,50) priority, coalesce(w.notes,'') notes,
      coalesce(w.blockers,'{}') blockers, coalesce(w.reconciliation_note,'') reconciliation_note, w.updated_at,
      coalesce(w.acquisition_state, CASE WHEN k.data->>'resultAcquisitionState' = 'downloaded' THEN 'downloaded' WHEN k.data->>'resultsStatus' = 'published' THEN 'available' ELSE 'unchecked' END) acquisition_state,
      CASE WHEN w.import_state = 'complete' THEN 'complete' WHEN swims.present THEN 'partially_approved' ELSE coalesce(w.import_state,'not_started') END import_state
    FROM meet_keys k
    LEFT JOIN public.meet_collection_work w ON w.meet_id = k.id
    -- Indexed existence suffices to derive progress; exact counts follow paging.
    LEFT JOIN LATERAL (SELECT true present FROM public.swims s WHERE s.meet_id = k.canonical_meet_id LIMIT 1) swims ON true
  ), classified AS MATERIALIZED (
    SELECT c.*, CASE
      WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(c.participants) p WHERE p->>'lscCode' = 'IE' AND p->>'basis' = 'recorded' AND p->>'representation' IN ('club','unattached')) THEN 'confirmed'
      WHEN c.team_coverage = 'complete' AND jsonb_array_length(c.participants) > 0 AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(c.participants) p WHERE coalesce(p->>'basis','') <> 'recorded'
          OR coalesce(p->>'representation','') <> 'club' OR coalesce(p->>'lscCode','') !~ '^[A-Z]{2}$' OR p->>'lscCode' = 'IE'
      ) THEN 'none' ELSE 'unknown' END ies_participation
    FROM catalog c
  ), filtered AS MATERIALIZED (
    SELECT c.* FROM classified c WHERE
      (coalesce(input->>'search','') = '' OR c.title ILIKE search_pattern ESCAPE chr(92) OR coalesce(c.data->>'location','') ILIKE search_pattern ESCAPE chr(92)
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(c.participants) p WHERE coalesce(p->>'name','') ILIKE search_pattern ESCAPE chr(92) OR coalesce(p->>'clubCode','') ILIKE search_pattern ESCAPE chr(92)))
      AND (coalesce(input->>'year','') = '' OR extract(year FROM c.starts_on)::integer = (input->>'year')::integer)
      AND (coalesce(input->>'category','') = '' OR c.category = input->>'category')
      AND (coalesce(input->>'ies','') = '' OR c.ies_participation = input->>'ies')
      AND (CASE WHEN exporting THEN c.selected WHEN input->'selected' IS NULL OR input->'selected' = 'null'::jsonb THEN true ELSE c.selected = (input->>'selected')::boolean END)
      AND (coalesce(input->>'progress','') = '' OR input->>'progress' = c.import_state OR (input->>'progress' = 'blocked' AND cardinality(c.blockers) > 0))
      AND (coalesce(input->>'team','') = '' OR EXISTS (SELECT 1 FROM jsonb_array_elements(c.participants) p WHERE input->>'team' IN (p->>'id',p->>'catalogTeamId',p->>'operationalTeamId')))
  ), page_ids AS MATERIALIZED (
    SELECT * FROM filtered ORDER BY selected DESC, CASE WHEN selected THEN priority ELSE 50 END,
      (import_state <> 'complete' AND ies_participation = 'confirmed' AND acquisition_state = 'downloaded') DESC,
      starts_on DESC NULLS LAST, title, id
    LIMIT CASE WHEN exporting THEN 5001 ELSE 30 END OFFSET CASE WHEN exporting THEN 0 ELSE page_offset END
  ), page AS (
    SELECT p.*, swims.count imported_swims FROM page_ids p
    LEFT JOIN LATERAL (SELECT count(*) count FROM public.swims s WHERE s.meet_id = p.canonical_meet_id) swims ON true
  ), team_facets AS (
    SELECT coalesce(nullif(p->>'catalogTeamId',''),nullif(p->>'operationalTeamId',''),p->>'id') id,
      min(coalesce(t.title,p->>'name')) name FROM classified c CROSS JOIN LATERAL jsonb_array_elements(c.participants) p
    LEFT JOIN public.knowledge_entries t ON t.id = p->>'catalogTeamId' AND t.kind = 'team'
    WHERE coalesce(p->>'id','') <> '' AND coalesce(p->>'name','') <> ''
    GROUP BY coalesce(nullif(p->>'catalogTeamId',''),nullif(p->>'operationalTeamId',''),p->>'id')
  )
  SELECT jsonb_build_object(
    'rows',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'title',title,'startsOn',starts_on,'endsOn',ends_on,'sourceUrl',source_url,'data',data,
      'participants',participants,'teamCoverage',team_coverage,'iesParticipation',ies_participation,'selected',selected,'priority',priority,'notes',notes,'blockers',blockers,
      'acquisitionState',acquisition_state,'importState',import_state,'reconciliationNote',reconciliation_note,'importedSwims',imported_swims,'updatedAt',updated_at)
      ORDER BY selected DESC, CASE WHEN selected THEN priority ELSE 50 END, (import_state <> 'complete' AND ies_participation = 'confirmed' AND acquisition_state = 'downloaded') DESC,
      starts_on DESC NULLS LAST, title,id) FROM page),'[]'::jsonb),
    'total',(SELECT count(*) FROM filtered),
    'hasNext',NOT exporting AND (SELECT count(*) FROM filtered) > page_offset + 30,
    'facets',jsonb_build_object('years',coalesce((SELECT jsonb_agg(meet_year ORDER BY meet_year DESC) FROM (SELECT DISTINCT extract(year FROM starts_on)::integer AS meet_year FROM classified WHERE starts_on IS NOT NULL) y),'[]'::jsonb),
      'teams',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name,id) FROM team_facets),'[]'::jsonb)),
    'coverage',coalesce((SELECT jsonb_agg(to_jsonb(cov) ORDER BY cov.year DESC,cov.checked_at DESC,cov.id) FROM public.collection_coverage cov),'[]'::jsonb),
    'summary',jsonb_build_object('total',(SELECT count(*) FROM classified),'selected',(SELECT count(*) FROM classified WHERE selected),
      'confirmedIES',(SELECT count(*) FROM classified WHERE ies_participation = 'confirmed'),'unfinished',(SELECT count(*) FROM classified WHERE import_state <> 'complete'))
  ) INTO result;
  IF exporting AND (result->>'total')::integer > 5000 THEN
    RAISE EXCEPTION 'The selected export exceeds 5,000 meets. Narrow the filters before exporting.' USING ERRCODE = '54000';
  END IF;
  RETURN result;
END;
$function$;

NOTIFY pgrst, 'reload schema';

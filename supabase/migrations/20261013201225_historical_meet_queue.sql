-- Staff workflow is separate from the publicly reviewed meet catalog.
CREATE TABLE public.meet_collection_work (
  meet_id text PRIMARY KEY REFERENCES public.knowledge_entries(id) ON DELETE CASCADE,
  selected boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 4000),
  blockers text[] NOT NULL DEFAULT '{}',
  acquisition_state text NOT NULL DEFAULT 'unchecked' CHECK (acquisition_state IN ('unchecked','available','downloaded','unavailable')),
  import_state text NOT NULL DEFAULT 'not_started' CHECK (import_state IN ('not_started','prepared','partially_approved','complete')),
  reconciliation_note text NOT NULL DEFAULT '' CHECK (length(reconciliation_note) <= 4000),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT meet_collection_complete_check CHECK (import_state <> 'complete' OR (length(trim(reconciliation_note)) > 0 AND cardinality(blockers) = 0))
);
CREATE TABLE public.collection_coverage (
  id text PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  source_url text NOT NULL CHECK (source_url ~ '^https://'),
  year integer NOT NULL CHECK (year BETWEEN 1900 AND 2200),
  category text NOT NULL CHECK (category IN ('sanctioned','approved','observed','unknown')),
  scope text NOT NULL CHECK (length(trim(scope)) BETWEEN 1 AND 2000),
  checked_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'not_checked' CHECK (status IN ('not_checked','partial','complete','blocked')),
  meet_count integer NOT NULL DEFAULT 0 CHECK (meet_count >= 0),
  gaps text[] NOT NULL DEFAULT '{}',
  UNIQUE (source_url, year, category, scope)
);
ALTER TABLE public.meet_collection_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_coverage ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_only ON public.meet_collection_work TO authenticated USING ((SELECT private.is_staff())) WITH CHECK ((SELECT private.is_staff()));
CREATE POLICY staff_only ON public.collection_coverage TO authenticated USING ((SELECT private.is_staff())) WITH CHECK ((SELECT private.is_staff()));
REVOKE ALL ON public.meet_collection_work, public.collection_coverage FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meet_collection_work, public.collection_coverage TO authenticated, service_role;
CREATE INDEX meet_collection_work_priority_idx ON public.meet_collection_work (selected DESC, priority, meet_id);
CREATE INDEX collection_coverage_year_idx ON public.collection_coverage (year DESC, category);

CREATE FUNCTION private.check_meet_collection_work() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.knowledge_entries WHERE id = NEW.meet_id AND kind = 'meet') THEN
    RAISE EXCEPTION 'Collection work must reference a catalog meet.' USING ERRCODE = '23514';
  END IF;
  IF cardinality(NEW.blockers) > 30 OR EXISTS (SELECT 1 FROM unnest(NEW.blockers) item WHERE item IS NULL OR length(trim(item)) NOT BETWEEN 1 AND 500) THEN
    RAISE EXCEPTION 'Supply up to 30 blockers, each under 500 characters.' USING ERRCODE = '23514';
  END IF;
  IF NEW.import_state = 'complete' AND NOT EXISTS (
    SELECT 1 FROM public.knowledge_entries k JOIN public.meets m
      ON m.id = coalesce(nullif(k.data->>'canonicalMeetId',''),k.id)
    WHERE k.id = NEW.meet_id AND k.kind = 'meet'
  ) THEN
    RAISE EXCEPTION 'Approve the canonical meet before marking its full results import complete.' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$function$;
CREATE TRIGGER meet_collection_work_check BEFORE INSERT OR UPDATE ON public.meet_collection_work FOR EACH ROW EXECUTE FUNCTION private.check_meet_collection_work();
REVOKE ALL ON FUNCTION private.check_meet_collection_work() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.update_meet_collection_work(input jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE
  current_work public.meet_collection_work;
  changed public.meet_collection_work;
  mid text := input->>'meetId';
  expected timestamptz;
  new_blockers text[];
BEGIN
  IF NOT private.is_staff() AND coalesce(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE insufficient_privilege USING MESSAGE = 'Staff access is required.';
  END IF;
  IF jsonb_typeof(input) IS DISTINCT FROM 'object' OR mid IS NULL OR mid !~ '^[a-zA-Z0-9_-]{1,128}$'
    OR NOT (input ? 'updatedAt') OR jsonb_typeof(input->'selected') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(input->'priority') IS DISTINCT FROM 'number' OR input->>'priority' !~ '^\d+$'
    OR (input->>'priority')::integer NOT BETWEEN 0 AND 100
    OR jsonb_typeof(input->'notes') IS DISTINCT FROM 'string' OR length(input->>'notes') > 4000
    OR jsonb_typeof(input->'blockers') IS DISTINCT FROM 'array'
    OR jsonb_array_length(input->'blockers') > 30
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(input->'blockers') item WHERE jsonb_typeof(item) <> 'string' OR length(trim(item#>>'{}')) NOT BETWEEN 1 AND 500)
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(input) k WHERE k NOT IN ('meetId','selected','priority','notes','blockers','acquisitionState','importState','reconciliationNote','updatedAt')) THEN
    RAISE EXCEPTION 'Invalid meet update.' USING ERRCODE = '22023';
  END IF;
  IF input ? 'acquisitionState' AND coalesce(input->>'acquisitionState','') NOT IN ('unchecked','available','downloaded','unavailable')
    OR input ? 'importState' AND coalesce(input->>'importState','') NOT IN ('not_started','prepared','partially_approved','complete')
    OR input ? 'reconciliationNote' AND (jsonb_typeof(input->'reconciliationNote') IS DISTINCT FROM 'string' OR length(input->>'reconciliationNote') > 4000) THEN
    RAISE EXCEPTION 'Invalid meet collection state.' USING ERRCODE = '22023';
  END IF;
  IF input->'updatedAt' <> 'null'::jsonb THEN
    IF jsonb_typeof(input->'updatedAt') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Supply the current meet version.' USING ERRCODE = '22023'; END IF;
    BEGIN expected := (input->>'updatedAt')::timestamptz;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'Invalid meet version.' USING ERRCODE = '22023'; END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.knowledge_entries WHERE id = mid AND kind = 'meet') THEN
    RAISE EXCEPTION 'This meet is no longer available.' USING ERRCODE = 'P0002';
  END IF;
  -- Serialize both first creation and updates. Compare the full PostgreSQL timestamp.
  PERFORM pg_advisory_xact_lock(hashtext('meet-collection-work'), hashtext(mid));
  SELECT * INTO current_work FROM public.meet_collection_work WHERE meet_id = mid FOR UPDATE;
  IF (current_work.meet_id IS NULL AND expected IS NOT NULL) OR (current_work.meet_id IS NOT NULL AND (expected IS NULL OR current_work.updated_at IS DISTINCT FROM expected)) THEN
    RAISE EXCEPTION 'This meet changed after you opened it. Refresh before saving.' USING ERRCODE = '40001';
  END IF;
  SELECT coalesce(array_agg(trim(item)), '{}') INTO new_blockers FROM jsonb_array_elements_text(input->'blockers') item;
  INSERT INTO public.meet_collection_work(meet_id,selected,priority,notes,blockers,acquisition_state,import_state,reconciliation_note)
  VALUES (mid,(input->>'selected')::boolean,(input->>'priority')::integer,input->>'notes',new_blockers,
    coalesce(input->>'acquisitionState',current_work.acquisition_state,'unchecked'),
    coalesce(input->>'importState',current_work.import_state,'not_started'),
    coalesce(input->>'reconciliationNote',current_work.reconciliation_note,''))
  ON CONFLICT (meet_id) DO UPDATE SET selected = excluded.selected, priority = excluded.priority,
    notes = excluded.notes, blockers = excluded.blockers, acquisition_state = excluded.acquisition_state,
    import_state = excluded.import_state, reconciliation_note = excluded.reconciliation_note
  RETURNING * INTO changed;
  RETURN jsonb_build_object('success',true,'updatedAt',changed.updated_at);
END;
$function$;
CREATE FUNCTION public.update_meet_collection_work(input jsonb) RETURNS jsonb
LANGUAGE sql SET search_path = '' AS $function$ SELECT private.update_meet_collection_work(input); $function$;
REVOKE ALL ON FUNCTION private.update_meet_collection_work(jsonb), public.update_meet_collection_work(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.update_meet_collection_work(jsonb), public.update_meet_collection_work(jsonb) TO authenticated, service_role;

CREATE FUNCTION private.meet_collection_queue(input jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = '' AS $function$
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
  WITH catalog AS MATERIALIZED (
    SELECT k.id, k.title, k.starts_on, k.ends_on, k.source_url, k.data,
      CASE WHEN jsonb_typeof(k.data->'participants') = 'array' THEN k.data->'participants' ELSE '[]'::jsonb END participants,
      CASE WHEN k.data->>'participationCoverage' IN ('unknown','partial','complete') THEN k.data->>'participationCoverage' ELSE 'unknown' END team_coverage,
      CASE WHEN k.data->>'meetCategory' IN ('sanctioned','approved','observed') THEN k.data->>'meetCategory' ELSE 'unknown' END category,
      coalesce(w.selected,false) selected, coalesce(w.priority,50) priority, coalesce(w.notes,'') notes,
      coalesce(w.blockers,'{}') blockers, coalesce(w.reconciliation_note,'') reconciliation_note, w.updated_at,
      coalesce(w.acquisition_state, CASE WHEN k.data->>'resultAcquisitionState' = 'downloaded' THEN 'downloaded' WHEN k.data->>'resultsStatus' = 'published' THEN 'available' ELSE 'unchecked' END) acquisition_state,
      CASE WHEN w.import_state = 'complete' THEN 'complete' WHEN swims.present THEN 'partially_approved' ELSE coalesce(w.import_state,'not_started') END import_state
    FROM public.knowledge_entries k
    LEFT JOIN public.meet_collection_work w ON w.meet_id = k.id
    -- Indexed existence suffices to derive progress; exact counts follow paging.
    LEFT JOIN LATERAL (SELECT EXISTS (SELECT 1 FROM public.swims s WHERE s.meet_id = coalesce(nullif(k.data->>'canonicalMeetId',''),k.id)) present) swims ON true
    WHERE k.kind = 'meet'
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
    LEFT JOIN LATERAL (SELECT count(*) count FROM public.swims s WHERE s.meet_id = coalesce(nullif(p.data->>'canonicalMeetId',''),p.id)) swims ON true
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
CREATE FUNCTION public.meet_collection_queue(input jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $function$ SELECT private.meet_collection_queue(input); $function$;
REVOKE ALL ON FUNCTION private.meet_collection_queue(jsonb), public.meet_collection_queue(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.meet_collection_queue(jsonb), public.meet_collection_queue(jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- A collection lookup must not scan every branch of app_records. In particular,
-- a family membership check should not evaluate staff RLS for every swim.
-- Keep the RPC and its security-invoker snapshots compatible with app_records.
CREATE OR REPLACE FUNCTION public.query_records (
  collection_path text,
  filters jsonb DEFAULT '[]'::jsonb,
  after_id text DEFAULT NULL::text,
  page_size integer DEFAULT 1000,
  record_id text DEFAULT NULL::text
)
RETURNS TABLE (path text, data jsonb)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  f jsonb;
  field_path text[];
  sql text;
  op text;
  source_sql text;
  evidence_sql text;
  table_name text;
  id_sql text;
  data_sql text;
  athlete_id text;
BEGIN
  IF collection_path IS NULL
    OR collection_path !~ '^[a-z_]+(/[a-zA-Z0-9_-]+/[a-z_]+)?$'
    OR page_size IS NULL OR page_size NOT BETWEEN 1 AND 1000
    OR jsonb_typeof(filters) IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'Invalid record query';
  END IF;

  -- These are exactly the top-level branches of the existing invoker view.
  -- Never interpolate an unregistered collection as a relation name.
  IF collection_path = ANY (ARRAY[
    'teams','people','athletes','families','venues','meets','swims',
    'standards','practice_sessions','attendance','postings','registrations',
    'manual_hours','work_descriptions','documents','public_athletes',
    'relay_results','admins'
  ]) THEN
    table_name := CASE WHEN collection_path='admins' THEN 'administrators' ELSE collection_path END;
    id_sql := CASE WHEN collection_path='admins' THEN 't.user_id::text' ELSE 't.id' END;
    data_sql := CASE collection_path
      WHEN 'athletes' THEN 'private.athlete_snapshot(t.data,t.person_id,t.group_id)'
      WHEN 'families' THEN 'private.family_snapshot(t.id,t.data)'
      WHEN 'admins' THEN 'jsonb_build_object(''id'',t.user_id)'
      ELSE 't.data'
    END;
    source_sql := format(
      'select %L || %s as path,%s as data from public.%I t where position(''/'' in %s)=0',
      collection_path||'/',id_sql,data_sql,table_name,id_sql
    );
    -- Apply ID lookup before evaluating snapshots; the text primary key can
    -- locate one record without materializing every athlete or family.
    IF record_id IS NOT NULL THEN
      source_sql := source_sql || format(' and %s=%L',id_sql,record_id);
    END IF;
  ELSIF collection_path ~ '^athletes/[a-zA-Z0-9_-]+/bests$' THEN
    athlete_id := split_part(collection_path,'/',2);
    source_sql := format(
      'select %L || t.event_code as path,t.data from public.athlete_bests t where t.athlete_id=%L and position(''/'' in t.event_code)=0',
      collection_path||'/',athlete_id
    );
    IF record_id IS NOT NULL THEN
      source_sql := source_sql || format(' and t.event_code=%L',record_id);
    END IF;
    -- Legacy SQL can store an athlete ID containing slashes. The view exposes
    -- one whose path happens to have this collection's exact depth, so keep
    -- that narrow branch rather than silently changing compatibility.
    source_sql := source_sql || format(
      ' union all select ''athletes/'' || a.id as path,private.athlete_snapshot(a.data,a.person_id,a.group_id) as data from public.athletes a where starts_with(a.id,%L) and array_length(string_to_array(a.id,''/''),1)=3',
      athlete_id||'/bests/'
    );
    IF record_id IS NOT NULL THEN
      source_sql := source_sql || format(' and a.id=%L',athlete_id||'/bests/'||record_id);
    END IF;
  ELSE
    -- Other registered evidence paths and future view branches retain their
    -- existing behavior. No additional tables become exposed by this change.
    source_sql := 'select path,data from public.app_records';
  END IF;

  IF table_name IS NOT NULL OR athlete_id IS NOT NULL THEN
    -- app_records also contains evidence_records without a prefix constraint.
    -- Preserve even an evidence record with a domain prefix, including UNION
    -- ALL duplicates, while its root/path index limits this to the same scope.
    evidence_sql := format(
      'select e.path,e.data from public.evidence_records e where e.root=%L and starts_with(e.path,%L) and array_length(string_to_array(e.path,''/''),1)=%s',
      split_part(collection_path,'/',1),collection_path||'/',
      array_length(string_to_array(collection_path,'/'),1)+1
    );
    IF record_id IS NOT NULL THEN
      evidence_sql := evidence_sql || format(' and e.path=%L',collection_path||'/'||record_id);
    END IF;
    source_sql := source_sql || ' union all ' || evidence_sql;
  END IF;

  sql := format(
    'select records.path,records.data from (%s) records where starts_with(records.path,%L) and array_length(string_to_array(records.path,''/''),1)=%s',
    source_sql,collection_path||'/',array_length(string_to_array(collection_path,'/'),1)+1
  );
  IF record_id IS NOT NULL THEN
    sql := sql || format(' and records.path=%L',collection_path||'/'||record_id);
  END IF;
  IF after_id IS NOT NULL THEN
    sql := sql || format(' and records.path>%L',collection_path||'/'||after_id);
  END IF;
  FOR f IN SELECT * FROM jsonb_array_elements(filters) LOOP
    IF jsonb_typeof(f) IS DISTINCT FROM 'object'
      OR f->>'field' IS NULL OR (f->>'field') !~ '^[a-zA-Z_][a-zA-Z0-9_.]*$'
    THEN
      RAISE EXCEPTION 'Invalid field';
    END IF;
    field_path := string_to_array(f->>'field','.');
    op := f->>'op';
    IF op='==' THEN
      sql := sql || format(' and records.data#>%L::text[]=%L::jsonb',field_path,f->'value');
    ELSIF op='array-contains' THEN
      sql := sql || format(' and records.data#>%L::text[] @> %L::jsonb',field_path,jsonb_build_array(f->'value'));
    ELSIF op='in' THEN
      sql := sql || format(' and records.data#>%L::text[] in (select value from jsonb_array_elements(%L::jsonb))',field_path,f->'value');
    ELSIF op IN ('>=','<=','>','<') THEN
      sql := sql || format(' and records.data#>%L::text[] %s %L::jsonb',field_path,op,f->'value');
    ELSE
      RAISE EXCEPTION 'Unsupported filter';
    END IF;
  END LOOP;
  RETURN QUERY EXECUTE sql || format(' order by records.path limit %s',page_size);
END;
$function$;

NOTIFY pgrst, 'reload schema';

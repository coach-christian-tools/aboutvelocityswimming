import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const config = JSON.parse(execFileSync("supabase", ["status", "--output", "json"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
}));
assert.equal(config.API_URL, "http://127.0.0.1:54321", "Record-query tests refuse hosted databases.");
const clients = Object.fromEntries(["staff", "familyA", "familyB", "anon"].map((name) => [
  name, createClient(config.API_URL, config.PUBLISHABLE_KEY, { auth: { persistSession: false } }),
]));
const users = {};
for (const [name, email] of [["staff", "coach@velocity-swimming.com"], ["familyA", "family-a@example.test"], ["familyB", "family-b@example.test"]]) {
  const { data, error } = await clients[name].auth.signInWithPassword({ email, password: "Velocity-local-test-2026!" });
  assert.ifError(error);
  users[name] = { sub: data.user.id, email, role: "authenticated" };
}
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const scope = `record-query-${randomUUID()}`;
const claims = (name) => `SET LOCAL ROLE ${name === "anon" ? "anon" : "authenticated"};
  SELECT set_config('request.jwt.claims',${quote(JSON.stringify(users[name] ?? { role: "anon" }))},true);`;
const run = (sql) => execFileSync("docker", ["exec", "-i", "supabase_db_aboutvelocityswimming", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], {
  input: `BEGIN;\n${sql}\nROLLBACK;\n`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
});
const helpers = `
CREATE FUNCTION pg_temp.assert_ok(condition boolean, explanation text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION '%',explanation; END IF; END; $$;
-- Compare against the actual invoker view, independently of the new routing.
CREATE FUNCTION pg_temp.assert_view_equivalent(cp text, fs jsonb DEFAULT '[]', cursor_id text DEFAULT NULL,
  ps integer DEFAULT 1000, rid text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE statement text; f jsonb; fp text[]; op text; legacy jsonb; routed jsonb;
BEGIN
  statement:=format('select path,data from public.app_records where starts_with(path,%L) and array_length(string_to_array(path,''/''),1)=%s',cp||'/',array_length(string_to_array(cp,'/'),1)+1);
  IF rid IS NOT NULL THEN statement:=statement||format(' and path=%L',cp||'/'||rid); END IF;
  IF cursor_id IS NOT NULL THEN statement:=statement||format(' and path>%L',cp||'/'||cursor_id); END IF;
  FOR f IN SELECT * FROM jsonb_array_elements(fs) LOOP
    fp:=string_to_array(f->>'field','.'); op:=f->>'op';
    IF op='==' THEN statement:=statement||format(' and data#>%L::text[]=%L::jsonb',fp,f->'value');
    ELSIF op='array-contains' THEN statement:=statement||format(' and data#>%L::text[] @> %L::jsonb',fp,jsonb_build_array(f->'value'));
    ELSIF op='in' THEN statement:=statement||format(' and data#>%L::text[] in (select value from jsonb_array_elements(%L::jsonb))',fp,f->'value');
    ELSE statement:=statement||format(' and data#>%L::text[] %s %L::jsonb',fp,op,f->'value'); END IF;
  END LOOP;
  statement:=statement||format(' order by path limit %s',ps);
  EXECUTE 'select coalesce(jsonb_agg(to_jsonb(r) order by path,data::text),''[]'') from ('||statement||') r' INTO legacy;
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY path,data::text),'[]') INTO routed FROM public.query_records(cp,fs,cursor_id,ps,rid) r;
  PERFORM pg_temp.assert_ok(routed=legacy,'View mismatch for '||cp);
END; $$;
`;
const fixtures = `
INSERT INTO public.documents(id,data)
SELECT ${quote(scope)}||'-'||suffix,jsonb_build_object('testScope',${quote(scope)},'name',suffix,'metrics',jsonb_build_object('score',score),
  'tags',tags,'nullable',NULL,'literal','O''Hara''; DROP TABLE public.documents; --')
FROM (VALUES ('a',1,'["one","shared"]'::jsonb),('b',2,'["two","shared"]'::jsonb),('c',3,'["three"]'::jsonb)) v(suffix,score,tags);
INSERT INTO public.documents(id,data) VALUES (${quote(`${scope}/hidden`)},jsonb_build_object('testScope',${quote(scope)},'name','hidden slash ID'));
INSERT INTO public.evidence_records(path,data) VALUES
  (${quote(`documents/${scope}-a`)},jsonb_build_object('testScope',${quote(scope)},'name','duplicate evidence','metrics',jsonb_build_object('score',9))),
  (${quote(`documents/${scope}-d`)},jsonb_build_object('testScope',${quote(scope)},'name','evidence','metrics',jsonb_build_object('score',4))),
  (${quote(`source_bindings/${scope}`)},jsonb_build_object('testScope',${quote(scope)},'name','fallback evidence')),
  (${quote(`sources/${scope}/checks/a`)},jsonb_build_object('testScope',${quote(scope)},'name','nested evidence'));
INSERT INTO public.people(id,data) VALUES (${quote(`${scope}-person`)},jsonb_build_object('name','Legacy Query Fixture','structuredName',jsonb_build_object('first','Legacy','last','Query Fixture')));
INSERT INTO public.athletes(id,data,person_id,group_id) VALUES (
  ${quote(`test-swimmer-a/bests/${scope}-legacy`)},jsonb_build_object('testScope',${quote(scope)},'teamId','velocity-swimming'),${quote(`${scope}-person`)},'juniors');
INSERT INTO public.athlete_bests(athlete_id,event_code,data) VALUES
  ('test-swimmer-a',${quote(`${scope}-a`)},jsonb_build_object('testScope',${quote(scope)},'bestTimeMs',50000)),
  ('test-swimmer-a',${quote(`${scope}-b`)},jsonb_build_object('testScope',${quote(scope)},'bestTimeMs',60000)),
  ('test-swimmer-a',${quote(`${scope}/hidden`)},jsonb_build_object('testScope',${quote(scope)},'bestTimeMs',70000));
INSERT INTO public.evidence_records(path,data) VALUES (${quote(`athletes/test-swimmer-a/bests/${scope}-a`)},jsonb_build_object('testScope',${quote(scope)},'bestTimeMs',51000));
INSERT INTO public.relay_results(id,data) VALUES (${quote(`${scope}-relay`)},jsonb_build_object(
  'id',${quote(`${scope}-relay`)},'course','SCY','gender','X','eventCode','200_FR-R_SCY','stroke','FR','round','F',
  'relayName','Synthetic Query Relay','teamId','velocity-swimming','meet',jsonb_build_object('id',(SELECT id FROM public.meets ORDER BY id LIMIT 1),'date','2001-01-01'),
  'status','OK','timeMs',120000,'isOfficial',false,'distance',200,'members','[]'::jsonb,'splitCoverage','unavailable'));
`;
const scoped = JSON.stringify([{ field: "testScope", op: "==", value: scope }]);
const withFilter = (field, op, value) => quote(JSON.stringify([{ field: "testScope", op: "==", value: scope }, { field, op, value }]));

await test("Data API preserves staff, household, and anonymous record visibility and joined snapshots", async () => {
  const query = async (name, path, recordId) => {
    const { data, error } = await clients[name].rpc("query_records", { collection_path: path, record_id: recordId });
    assert.ifError(error);
    return data;
  };
  assert.deepEqual((await query("familyA", "families")).map((r) => r.path), ["families/family-a"]);
  assert.deepEqual((await query("familyB", "families")).map((r) => r.path), ["families/family-b"]);
  assert.deepEqual(await query("familyA", "families", "family-b"), []);
  assert.deepEqual(await query("anon", "families"), []);
  assert.deepEqual(await query("familyA", "athletes"), []);
  assert.deepEqual(await query("anon", "swims"), []);
  assert.deepEqual(await query("familyA", "admins"), []);
  const family = (await query("staff", "families", "family-a"))[0].data;
  assert.ok(family.authorizedEmails.includes("family-a@example.test"));
  assert.ok(family.children.some((child) => child.id === "test-swimmer-a" && child.name === "Avery Example"));
  const athlete = (await query("staff", "athletes", "test-swimmer-a"))[0].data;
  assert.equal(athlete.name.first, "Avery");
  assert.equal(athlete.personId, "person_test-swimmer-a");
  assert.equal(athlete.currentGroup.name, "Juniors");
  assert.ok((await query("anon", "athletes/test-swimmer-a/bests")).length > 0);
  assert.deepEqual((await query("staff", "admins")).map((r) => r.data.id), [users.staff.sub]);
});

await test("all routed collections and fallback scopes match app_records under each caller's RLS", () => {
  const routes = ["teams", "people", "athletes", "families", "venues", "meets", "swims", "standards", "practice_sessions", "attendance", "postings", "registrations", "manual_hours", "work_descriptions", "documents", "public_athletes", "relay_results", "admins", "athletes/test-swimmer-a/bests", "sources", "source_bindings", `sources/${scope}/checks`, "knowledge_entries", "not_registered"];
  run(helpers + fixtures + ["staff", "familyA", "familyB", "anon"].map((name) => `${claims(name)}
    DO $$ BEGIN ${routes.map((path) => `PERFORM pg_temp.assert_view_equivalent(${quote(path)});`).join("\n")} END; $$;
    RESET ROLE;`).join("\n"));
});

await test("nested JSON equality, arrays, in, comparisons, null, and literal values preserve filter semantics", () => {
  run(helpers + fixtures + claims("staff") + `DO $$
  DECLARE rows jsonb; comparison text; expected integer;
  BEGIN
    PERFORM pg_temp.assert_ok((SELECT count(*)=5 FROM public.query_records('documents',${quote(scoped)})),'Known-prefix evidence rows or duplicates lost');
    PERFORM pg_temp.assert_view_equivalent('documents',${withFilter("metrics.score", "==", 2)});
    PERFORM pg_temp.assert_ok((SELECT count(*)=1 FROM public.query_records('documents',${withFilter("metrics.score", "==", 2)})),'Nested equality failed');
    PERFORM pg_temp.assert_view_equivalent('documents',${withFilter("tags", "array-contains", "shared")});
    PERFORM pg_temp.assert_ok((SELECT count(*)=2 FROM public.query_records('documents',${withFilter("tags", "array-contains", "shared")})),'Array membership failed');
    PERFORM pg_temp.assert_view_equivalent('documents',${withFilter("metrics.score", "in", [1, 3])});
    PERFORM pg_temp.assert_ok((SELECT count(*)=2 FROM public.query_records('documents',${withFilter("metrics.score", "in", [1, 3])})),'In filter failed');
    PERFORM pg_temp.assert_view_equivalent('documents',${withFilter("nullable", "==", null)});
    PERFORM pg_temp.assert_ok((SELECT count(*)=3 FROM public.query_records('documents',${withFilter("nullable", "==", null)})),'JSON null equality failed');
    PERFORM pg_temp.assert_view_equivalent('documents',${withFilter("literal", "==", "O'Hara'; DROP TABLE public.documents; --")});
    PERFORM pg_temp.assert_ok((SELECT count(*)=3 FROM public.query_records('documents',${withFilter("literal", "==", "O'Hara'; DROP TABLE public.documents; --")})),'Quoted literal changed');
    FOR comparison,expected IN SELECT * FROM (VALUES ('>=',4),('<=',2),('>',3),('<',1)) counts(op,n) LOOP
      rows:=jsonb_build_array(jsonb_build_object('field','testScope','op','==','value',${quote(scope)}),jsonb_build_object('field','metrics.score','op',comparison,'value',2));
      PERFORM pg_temp.assert_view_equivalent('documents',rows);
      PERFORM pg_temp.assert_ok((SELECT count(*)=expected FROM public.query_records('documents',rows)),'Comparison failed: '||comparison);
    END LOOP;
  END; $$;`);
});

await test("record IDs, lexical cursors, page limits, slash depths, and nested bests remain compatible", () => {
  run(helpers + fixtures + claims("staff") + `DO $$
  DECLARE first_path text; second_path text; fs jsonb:=${withFilter("metrics.score", "<=", 3)};
  BEGIN
    PERFORM pg_temp.assert_view_equivalent('documents',fs,NULL,1);
    SELECT path INTO first_path FROM public.query_records('documents',fs,NULL,1);
    SELECT path INTO second_path FROM public.query_records('documents',fs,substring(first_path from 11),1);
    PERFORM pg_temp.assert_ok(first_path=${quote(`documents/${scope}-a`)} AND second_path=${quote(`documents/${scope}-b`)},'Cursor ordering failed');
    PERFORM pg_temp.assert_view_equivalent('documents',fs,${quote(`${scope}-a`)},2);
    PERFORM pg_temp.assert_view_equivalent('documents','[]',NULL,1000,${quote(`${scope}-a`)});
    PERFORM pg_temp.assert_ok((SELECT count(*)=2 FROM public.query_records('documents','[]',NULL,1000,${quote(`${scope}-a`)})),'Exact-ID duplicate evidence compatibility failed');
    PERFORM pg_temp.assert_ok((SELECT count(*)=0 FROM public.query_records('documents','[]',NULL,1000,${quote(`${scope}/hidden`)})),'Slash ID leaked at wrong depth');
    PERFORM pg_temp.assert_view_equivalent('athletes/test-swimmer-a/bests',${quote(scoped)});
    PERFORM pg_temp.assert_ok((SELECT count(*)=4 FROM public.query_records('athletes/test-swimmer-a/bests',${quote(scoped)})),'Nested bests or slash athlete snapshot omitted');
    PERFORM pg_temp.assert_view_equivalent('athletes/test-swimmer-a/bests','[]',NULL,1000,${quote(`${scope}-legacy`)});
    PERFORM pg_temp.assert_ok((SELECT data#>>'{name,first}'='Legacy' FROM public.query_records('athletes/test-swimmer-a/bests','[]',NULL,1000,${quote(`${scope}-legacy`)})),'Slash athlete snapshot was not joined');
    PERFORM pg_temp.assert_view_equivalent('athletes/test-swimmer-a/bests',${quote(scoped)},${quote(`${scope}-a`)},1);
    PERFORM pg_temp.assert_ok((SELECT count(*)=0 FROM public.query_records('athletes','[]',NULL,1000,${quote(`test-swimmer-a/bests/${scope}-legacy`)})),'Nested athlete appeared in top-level collection');
    PERFORM pg_temp.assert_view_equivalent('relay_results','[]',NULL,1000,${quote(`${scope}-relay`)});
  END; $$;`);
});

await test("malformed query inputs and SQL injection never expose unrelated rows or execute statements", () => {
  run(helpers + fixtures + claims("staff") + `DO $$
  DECLARE cp text; size integer; fs jsonb; rejected boolean;
  BEGIN
    FOREACH cp IN ARRAY ARRAY['families'' OR true --','families/../swims','families/a/b/c','public.families',NULL] LOOP
      rejected:=false; BEGIN PERFORM * FROM public.query_records(cp); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
      PERFORM pg_temp.assert_ok(rejected,'Malformed collection accepted');
    END LOOP;
    FOREACH size IN ARRAY ARRAY[0,1001,NULL] LOOP
      rejected:=false; BEGIN PERFORM * FROM public.query_records('families','[]',NULL,size); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
      PERFORM pg_temp.assert_ok(rejected,'Invalid page size accepted');
    END LOOP;
    FOREACH fs IN ARRAY ARRAY['{}'::jsonb,'null'::jsonb,'[{}]'::jsonb,'[{"field":"name'' OR true --","op":"==","value":"a"}]'::jsonb,'[{"field":"name","op":"==''; DROP TABLE public.documents; --","value":"a"}]'::jsonb] LOOP
      rejected:=false; BEGIN PERFORM * FROM public.query_records('documents',fs); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
      PERFORM pg_temp.assert_ok(rejected,'Invalid filter accepted');
    END LOOP;
    PERFORM pg_temp.assert_ok((SELECT count(*)=0 FROM public.query_records('documents','[]',NULL,1000,'a'' OR true; DROP TABLE public.documents; --')),'Record ID escaped its literal');
    PERFORM pg_temp.assert_view_equivalent('documents',${quote(scoped)},'a''; DROP TABLE public.documents; --');
    PERFORM pg_temp.assert_ok((SELECT count(*)=4 FROM public.documents WHERE data->>'testScope'=${quote(scope)}),'SQL injection changed documents');
  END; $$;`);
});

await test("family and athlete lookups avoid unrelated swim and relay scans under restrictive RLS guards", () => {
  run(helpers + fixtures + `
  CREATE FUNCTION pg_temp.reject_unrelated_scan() RETURNS boolean LANGUAGE plpgsql VOLATILE AS $$
  BEGIN RAISE EXCEPTION 'Unrelated race table was scanned'; END; $$;
  CREATE POLICY record_query_no_scan ON public.swims AS RESTRICTIVE FOR SELECT TO authenticated USING (pg_temp.reject_unrelated_scan());
  CREATE POLICY record_query_no_scan ON public.relay_results AS RESTRICTIVE FOR SELECT TO authenticated USING (pg_temp.reject_unrelated_scan());
  ${claims("staff")}
  DO $$ DECLARE legacy_failed boolean:=false; BEGIN
    -- The control proves the guard catches the original all-branches plan.
    BEGIN PERFORM path FROM public.app_records WHERE starts_with(path,'families/');
    EXCEPTION WHEN OTHERS THEN IF SQLERRM='Unrelated race table was scanned' THEN legacy_failed:=true; ELSE RAISE; END IF; END;
    PERFORM pg_temp.assert_ok(legacy_failed,'RLS scan guard did not catch the legacy plan');
    PERFORM pg_temp.assert_ok((SELECT count(*)>=2 FROM public.query_records('families')),'Family lookup failed with unrelated scan guards');
    PERFORM pg_temp.assert_ok((SELECT count(*)=1 FROM public.query_records('families','[]',NULL,1,'family-a')),'Exact family ID lookup scanned races');
    PERFORM pg_temp.assert_ok((SELECT count(*)=1 FROM public.query_records('athletes','[]',NULL,1,'test-swimmer-a')),'Athlete snapshot lookup scanned races');
    PERFORM pg_temp.assert_ok((SELECT count(*)>0 FROM public.query_records('athletes/test-swimmer-a/bests')),'Nested best query scanned races');
  END; $$;`);
});

await test("direct routes retain invoker security and only require their selected relations", () => {
  run(helpers + `
  SELECT pg_temp.assert_ok(NOT prosecdef AND provolatile='s' AND proconfig @> ARRAY['search_path=""'], 'RPC security or stability changed')
    FROM pg_proc WHERE oid='public.query_records(text,jsonb,text,integer,text)'::regprocedure;
  REVOKE SELECT ON public.swims FROM authenticated;
  ${claims("staff")}
  DO $$ DECLARE denied boolean:=false; BEGIN
    PERFORM pg_temp.assert_ok((SELECT count(*)=1 FROM public.query_records('families','[]',NULL,1,'family-a')),'Family route still required unrelated table grant');
    BEGIN PERFORM * FROM public.query_records('swims'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
    PERFORM pg_temp.assert_ok(denied,'Invoker bypassed revoked swim grant');
    denied:=false;
    BEGIN PERFORM * FROM public.query_records('sources'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
    PERFORM pg_temp.assert_ok(denied,'Fallback stopped enforcing app_records relation grants');
  END; $$;`);
});

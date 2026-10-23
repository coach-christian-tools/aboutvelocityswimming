import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const config = JSON.parse(execFileSync("supabase", ["status", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
assert.equal(config.API_URL, "http://127.0.0.1:54321", "Meet queue fixtures refuse hosted databases.");
const make = () => createClient(config.API_URL, config.PUBLISHABLE_KEY, { auth: { persistSession: false } });
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const staff = make(), family = make(), anon = make();
for (const [client, email] of [[staff, "coach@velocity-swimming.com"], [family, "family-a@example.test"]]) {
  const { error } = await client.auth.signInWithPassword({ email, password: "Velocity-local-test-2026!" }); assert.ifError(error);
}
const prefix = "meet-queue-fixture-", year = 1988;
const id = index => prefix + String(index).padStart(2, "0");
const participant = (changes = {}) => ({ id: prefix + "pn", name: "Synthetic Outside Club", clubCode: "FIX", lscCode: "PN", basis: "recorded", representation: "club", evidence: [{ sourceUrl: "https://example.test/results" }], ...changes });
const fixtures = Array.from({ length: 35 }, (_, index) => ({
  id: id(index), starts_on: "1988-06-01", ends_on: "1988-06-02",
  data: { kind: "meet", title: "Synthetic queue meet " + String(index).padStart(2, "0"), sourceUrl: "https://example.test/meet/" + index,
    startsOn: "1988-06-01", endsOn: "1988-06-02", meetCategory: "sanctioned", resultsStatus: "published",
    participationCoverage: "complete", participationScope: "All recorded teams in synthetic source", participants: [participant()] },
}));
fixtures[0].data.participationCoverage = "unknown"; fixtures[0].data.participants = [];
fixtures[1].data.participants = [participant({ lscCode: "" })];
fixtures[2].data.participants = [participant({ representation: "school", lscCode: "IE" })];
fixtures[3].data.participants = [participant({ lscCode: "IE", basis: "entered" })];
fixtures[4].data.participants = [participant({ lscCode: "IE", representation: "unattached" })];
fixtures[5].data.participants = [participant({ representation: "unattached" })];
fixtures[27].data.participants = [participant({ id: prefix + "historical-alias-one", catalogTeamId: prefix + "shared-catalog-club" })];
fixtures[28].data.participants = [participant({ id: prefix + "historical-alias-two", catalogTeamId: prefix + "shared-catalog-club" })];
fixtures[34].data.title = "Synthetic literal %_\\ title";
fixtures[34].data.participants = [participant({ id: prefix + "ie", name: "Synthetic IE Club", lscCode: "IE", catalogTeamId: prefix + "catalog", operationalTeamId: prefix + "operational" })];
fixtures[34].data.resultAcquisitionState = "downloaded";

const queue = async (input = {}) => { const { data, error } = await staff.rpc("meet_collection_queue", { input: { year, ...input } }); assert.ifError(error); return data; };
const update = async (meetId, changes = {}) => staff.rpc("update_meet_collection_work", { input: { meetId, selected: true, priority: 50, notes: "Synthetic review note", blockers: [], updatedAt: null, ...changes } });
async function cleanup() {
  for (const [table, column] of [["collection_coverage", "id"], ["knowledge_entries", "id"], ["swims", "id"], ["meets", "id"]]) {
    const { error } = await admin.from(table).delete().like(column, prefix + "%"); assert.ifError(error);
  }
}
await cleanup();
try {
  let outcome = await admin.from("knowledge_entries").insert(fixtures); assert.ifError(outcome.error);
  outcome = await admin.from("collection_coverage").insert({ id: prefix + "coverage", source_url: "https://example.test/calendar", year, category: "sanctioned", scope: "Synthetic calendar reconciliation", status: "partial", meet_count: 35, gaps: ["Synthetic archival gap"] }); assert.ifError(outcome.error);

  await test("staff progress queries constrain the swim index before evaluating RLS", async () => {
    const { data: { user }, error } = await staff.auth.getUser(); assert.ifError(error);
    const quote = value => `'${String(value).replaceAll("'", "''")}'`;
    const output = execFileSync("docker", ["exec", "-i", "supabase_db_aboutvelocityswimming", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"], {
      encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
      input: String.raw`BEGIN;
        CREATE FUNCTION pg_temp.queue_plan() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
        DECLARE statement text; plan jsonb; start_at integer;
        BEGIN
          SELECT prosrc INTO statement FROM pg_proc WHERE oid='private.meet_collection_queue(jsonb)'::regprocedure;
          start_at:=position('WITH ' IN statement);
          statement:=substring(statement FROM start_at FOR position(' INTO result;' IN statement)-start_at);
          statement:=regexp_replace(statement,'\minput\M','''{}''::jsonb','g');
          statement:=regexp_replace(statement,'\mexporting\M','false','g');
          statement:=regexp_replace(statement,'\mpage_offset\M','0','g');
          statement:=regexp_replace(statement,'\msearch_pattern\M','''%%''','g');
          EXECUTE 'EXPLAIN (FORMAT JSON) '||statement INTO plan;
          RETURN plan;
        END; $$;
        SET LOCAL ROLE authenticated;
        DO $$ BEGIN PERFORM set_config('request.jwt.claims',${quote(JSON.stringify({ sub: user.id, role: "authenticated" }))},true); END; $$;
        -- Tiny local fixtures may prefer sequential scans. Make the index path
        -- visible so this check tests whether RLS permits its key condition.
        SET LOCAL enable_seqscan=off;
        SELECT pg_temp.queue_plan();
        ROLLBACK;`,
    });
    const plan = JSON.parse(output.trim());
    const scans = [];
    function visit(node) {
      if (!node || typeof node !== "object") return;
      if (node["Relation Name"] === "swims") scans.push(node);
      Object.values(node).forEach(value => Array.isArray(value) ? value.forEach(visit) : visit(value));
    }
    visit(plan);
    assert.ok(scans.length >= 2, "Explain both full-catalog progress existence and paginated swim counts");
    for (const scan of scans) {
      // PostgreSQL may choose a bitmap heap/index pair as fixture statistics
      // change. Check the underlying index condition in either valid plan.
      const index = scan["Node Type"] === "Bitmap Heap Scan"
        ? scan.Plans?.find(node => node["Node Type"] === "Bitmap Index Scan") : scan;
      assert.equal(index?.["Index Name"], "swims_meet_id_idx", JSON.stringify(scan));
      assert.match(index?.["Index Cond"] ?? "", /meet_id = .*canonical_meet_id/,
        "The meet key must restrict the index, rather than filter a complete swim scan");
      assert.match(scan.Filter ?? "", /private\.is_staff\(\)/, "The existing swim RLS check remains active");
    }
  });

  await test("staff-only ACL protects workflow, coverage and queue RPCs", async () => {
    assert.ok((await anon.rpc("meet_collection_queue", { input: {} })).error);
    assert.equal((await family.rpc("meet_collection_queue", { input: {} })).error?.code, "42501");
    assert.equal((await family.from("meet_collection_work").select("*")).data.length, 0);
    assert.equal((await family.from("collection_coverage").select("*")).data.length, 0);
    assert.ok((await family.from("meet_collection_work").insert({ meet_id: id(0), selected: true })).error);
    assert.equal((await family.rpc("update_meet_collection_work", { input: { meetId: id(0) } })).error?.code, "42501");
    assert.ok((await anon.from("collection_coverage").select("*")).error);
  });

  await test("search and participant filters run before pagination and escape literal wildcards", async () => {
    const first = await queue(); assert.equal(first.total, 35); assert.equal(first.rows.length, 30); assert.equal(first.hasNext, true);
    const second = await queue({ offset: 30 }); assert.equal(second.rows.length, 5); assert.equal(second.hasNext, false);
    assert.equal((await queue({ search: "%_\\" })).total, 1);
    assert.equal((await queue({ team: prefix + "ie" })).rows[0].id, id(34));
    assert.equal((await queue({ team: prefix + "catalog" })).total, 1);
    assert.equal((await queue({ team: prefix + "operational" })).total, 1);
    assert.equal((await queue({ team: prefix + "shared-catalog-club" })).total, 2);
    assert.equal(first.facets.teams.filter(team => team.id === prefix + "shared-catalog-club").length, 1);
    assert.equal((await queue({ category: "observed" })).total, 0);
    assert.ok(first.facets.years.includes(year));
    assert.ok(first.coverage.some(row => row.id === prefix + "coverage"));
    assert.equal((await queue({ search: "%_\\" })).rows[0].acquisitionState, "downloaded");
  });

  await test("attendance and historical affiliations remain conservative", async () => {
    const confirmed = await queue({ ies: "confirmed" }); assert.equal(confirmed.total, 2); assert.deepEqual(new Set(confirmed.rows.map(row => row.id)), new Set([id(4), id(34)]));
    assert.equal((await queue({ ies: "unknown" })).total, 5);
    assert.equal((await queue({ ies: "none" })).total, 28);
    assert.equal((await queue({ search: "Synthetic queue meet 00" })).rows[0].importState, "not_started");
  });

  await test("CAS guards first creation, repeated and concurrent edits", async () => {
    const first = await update(id(0)); assert.ifError(first.error); assert.ok(first.data.updatedAt);
    assert.equal((await update(id(0))).error?.code, "40001");
    const saved = await update(id(0), { updatedAt: first.data.updatedAt, notes: "Saved precise version", priority: 10 }); assert.ifError(saved.error);
    assert.notEqual(saved.data.updatedAt, first.data.updatedAt);
    const competing = await Promise.all([update(id(0), { updatedAt: saved.data.updatedAt, notes: "Concurrent one" }), update(id(0), { updatedAt: saved.data.updatedAt, notes: "Concurrent two" })]);
    assert.equal(competing.filter(result => !result.error).length, 1);
    assert.equal(competing.filter(result => result.error?.code === "40001").length, 1);
  });

  await test("database completion constraint requires reconciliation and no blockers", async () => {
    assert.equal((await update(id(1), { importState: "complete" })).error?.code, "23514");
    assert.equal((await update(id(1), { importState: "complete", reconciliationNote: "Source reconciled", blockers: ["Synthetic missing relay"] })).error?.code, "23514");
    assert.equal((await update(id(1), { importState: "complete", reconciliationNote: "Catalog teams indexed" })).error?.code, "23514", "A catalog index alone is not a full approved import");
    const incomplete = await update(id(2), { selected: false }); assert.ifError(incomplete.error);
    assert.equal((await admin.from("meet_collection_work").update({ import_state: "complete", reconciliation_note: "Attempted catalog-only completion" }).eq("meet_id", id(2))).error?.code, "23514");
    const approvedMeet = await admin.from("meets").insert({ id: id(1), data: { name: "Synthetic reconciled empty meet" } }); assert.ifError(approvedMeet.error);
    const complete = await update(id(1), { importState: "complete", reconciliationNote: "Approved meet has no eligible individual swims; all source rows reconciled as explicit exceptions" }); assert.ifError(complete.error);
    const row = (await queue({ progress: "complete" })).rows[0]; assert.equal(row.id, id(1)); assert.equal(row.importedSwims, 0); assert.equal(row.importState, "complete");
    assert.equal((await admin.from("meet_collection_work").update({ blockers: ["Unresolved"] }).eq("meet_id", id(1))).error?.code, "23514");
  });

  await test("existing swims imply partial approval instead of full reconciliation", async () => {
    const meetId = prefix + "canonical", raceId = prefix + "race";
    let outcome = await admin.from("meets").insert({ id: meetId, data: { name: "Synthetic canonical meet" } }); assert.ifError(outcome.error);
    outcome = await admin.from("knowledge_entries").update({ data: { ...fixtures[6].data, canonicalMeetId: meetId } }).eq("id", id(6)); assert.ifError(outcome.error);
    outcome = await admin.from("swims").insert({ id: raceId, data: { id: raceId, athleteId: "test-swimmer-a", teamId: "velocity-swimming", athleteName: { first: "Synthetic", last: "Fixture" }, gender: "F", ageAtSwim: 12, ageGroup: "11-12", eventCode: "100_FR_SCY", distance: 100, stroke: "FR", course: "SCY", timeMs: 60000, timeDisplay: "1:00.00", status: "OK", round: "F", isRelay: false, isOfficial: true, meet: { id: meetId, name: "Synthetic canonical meet", date: "1988-06-01" }, metadata: { source: "manual", createdAt: "2026-10-13T00:00:00Z" } } }); assert.ifError(outcome.error);
    const row = (await queue({ progress: "partially_approved" })).rows.find(row => row.id === id(6)); assert.ok(row); assert.equal(row.importedSwims, 1); assert.equal(row.importState, "partially_approved");
  });

  await test("selected priorities lead, then unfinished downloaded IES meets sort by date", async () => {
    for (const [index, priority] of [[0, 75], [1, 5]]) {
      const work = await staff.from("meet_collection_work").select("updated_at").eq("meet_id", id(index)).single(); assert.ifError(work.error);
      const result = await update(id(index), { updatedAt: work.data.updated_at, selected: true, priority }); assert.ifError(result.error);
    }
    for (const [index, date, acquisitionState, priority, importState] of [
      [29, "1988-12-31", "available", 0, "not_started"],
      [30, "1988-02-01", "downloaded", 100, "not_started"],
      [31, "1988-10-01", "downloaded", 95, "not_started"],
      [32, "1988-12-01", "downloaded", 0, "complete"],
      [33, "1988-12-30", "available", 0, "prepared"],
    ]) {
      const data = { ...fixtures[index].data, startsOn: date, endsOn: date, participants: [participant({ lscCode: "IE" })] };
      const catalog = await admin.from("knowledge_entries").update({ data, starts_on: date, ends_on: date }).eq("id", id(index)); assert.ifError(catalog.error);
      if (importState === "complete") {
        const approvedMeet = await admin.from("meets").insert({ id: id(index), data: { name: "Synthetic approved completed meet" } }); assert.ifError(approvedMeet.error);
      }
      const result = await update(id(index), { selected: false, priority, acquisitionState, importState,
        reconciliationNote: importState === "complete" ? "Synthetic full-source reconciliation" : "" }); assert.ifError(result.error);
    }
    const rows = (await queue()).rows;
    assert.deepEqual(rows.slice(0, 5).map(row => row.id), [id(1), id(0), id(31), id(34), id(30)]);
    assert.equal(rows[5].id, id(29), "Available-only results do not get the downloaded boost");
    assert.ok(rows.findIndex(row => row.id === id(32)) > rows.findIndex(row => row.id === id(30)), "Reconciled completed meets do not get the unfinished boost");
  });

  await test("selected export returns every selected match without page truncation", async () => {
    for (const fixture of fixtures) {
      const work = await staff.from("meet_collection_work").select("updated_at").eq("meet_id", fixture.id).maybeSingle(); assert.ifError(work.error);
      const result = await update(fixture.id, { updatedAt: work.data?.updated_at ?? null }); assert.ifError(result.error);
    }
    const exported = await queue({ export: true, selected: false, offset: 30 });
    assert.equal(exported.total, 35); assert.equal(exported.rows.length, 35); assert.equal(exported.hasNext, false); assert.ok(exported.rows.every(row => row.selected));
    const page = await queue({ selected: true }); assert.equal(page.rows.length, 30); assert.equal(page.total, 35);
  });
} finally { await cleanup(); }

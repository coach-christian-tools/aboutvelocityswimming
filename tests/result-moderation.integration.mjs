import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const run = (sql) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_aboutvelocityswimming",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-q",
    ],
    {
      input: "BEGIN;\n" + sql + "\nROLLBACK;",
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
const fixture = `
CREATE FUNCTION pg_temp.check_ok(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END; $$;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('1f25093a-a2ed-4ea6-a3ae-e38fe783cb81','moderation-staff@example.test',now()),
 ('1f25093a-a2ed-4ea6-a3ae-e38fe783cb82','moderation-user@example.test',now()),
 ('1f25093a-a2ed-4ea6-a3ae-e38fe783cb83','moderation-unverified@example.test',null);
INSERT INTO public.administrators(user_id) VALUES ('1f25093a-a2ed-4ea6-a3ae-e38fe783cb81'),('1f25093a-a2ed-4ea6-a3ae-e38fe783cb83');
SELECT private.put_record('teams/mod-fixture-team','{"name":"Atomic Swim Club fixture","lscCode":"IE"}');
SELECT private.put_record('meets/mod-fixture-meet','{"name":"2026 IE PSA Pendleton Open fixture"}');
SELECT private.put_record('athletes/mod-fixture-athlete','{"id":"mod-fixture-athlete","name":{"first":"Maison","last":"Velasquez"},"status":"active","teamId":"mod-fixture-team"}');
SELECT private.put_record('athletes/mod-fixture-other','{"id":"mod-fixture-other","name":{"first":"Other","last":"Swimmer"},"status":"active","teamId":"mod-fixture-team"}');
CREATE FUNCTION pg_temp.swim(rid text, athlete text, ms integer, extra jsonb default '{}') RETURNS void LANGUAGE sql AS $$
 SELECT private.put_record('swims/'||rid,jsonb_build_object('id',rid,'athleteId',athlete,'eventCode','100_FR_LCM','course','LCM','distance',100,'stroke','FR',
 'raceIdentity',jsonb_build_object('occurrence',rid,'reviewed',true,'basis','Independent synthetic moderation starts','sourceUrl','https://example.test/fixture-starts'),'timeMs',ms,'status','OK','round','F','isOfficial',true,'isRelay',false,'gender','M','ageAtSwim',12,'teamId','mod-fixture-team',
 'meet',jsonb_build_object('id','mod-fixture-meet','name','2026 IE PSA Pendleton Open','date','2026-07-04'),'sourceObservation','private-source-marker')||extra); $$;
SELECT pg_temp.swim('mod-fixture-bad','mod-fixture-athlete',26150);
SELECT pg_temp.swim('mod-fixture-next','mod-fixture-athlete',60000);
SELECT pg_temp.swim('mod-fixture-tie','mod-fixture-other',60000);
SELECT pg_temp.swim('mod-fixture-split','mod-fixture-athlete',22000,'{"isSplit":true}');
SELECT private.put_record('relay_results/mod-fixture-relay','{"id":"mod-fixture-relay","relayName":"Atomic fixture A","splitCoverage":"unavailable","eventCode":"200_FR-R_LCM","course":"LCM","distance":200,"stroke":"FR","timeMs":125000,"status":"OK","round":"F","isRelay":true,"isOfficial":true,"gender":"M","ageGroup":"11-12","teamId":"mod-fixture-team","meet":{"id":"mod-fixture-meet","name":"2026 IE PSA Pendleton Open","date":"2026-07-04"},"members":[{"leg":1,"athleteId":"mod-fixture-athlete","name":"Maison Velasquez","stroke":"FR","timeMs":29000}]}');
SELECT pg_temp.swim('mod-fixture-leadoff','mod-fixture-athlete',29000,'{"eventCode":"50_FR_LCM","distance":50,"resultOrigin":"relay_leadoff","parentRelayResultId":"mod-fixture-relay","leadOffVerification":{"verified":true,"flatStart":true,"timingVerified":true,"leadOffStatus":"OK","sourceUrl":"https://example.test/source"}}');
SELECT private.rebuild_bests_for_events(array['100_FR_LCM','50_FR_LCM']);
CREATE FUNCTION pg_temp.query(kind text, extra jsonb default '{}') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.ies_times_query(kind,'{"team":"mod-fixture-team","event":"100_FR","course":"LCM","mode":"bests","genders":["M"],"athleteId":"mod-fixture-athlete","historyEvent":"100_FR_LCM","meetId":"mod-fixture-meet","period":"all"}'::jsonb||extra); $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"1f25093a-a2ed-4ea6-a3ae-e38fe783cb81","role":"authenticated"}',true);
`;
const flag = (id, version = 0, kind = "swim") =>
  `SELECT public.moderate_result('${kind}','${id}','flag','incorrect_time','private-staff-note',${version});`;
const restore = (id, version = 1, kind = "swim") =>
  `SELECT public.moderate_result('${kind}','${id}','restore','','Checked original source',${version});`;

function check(sql) {
  try {
    run(fixture + sql);
  } catch (error) {
    throw new Error(error.stderr?.toString() || error.message);
  }
}
test("flag excludes incorrect 26.15 from all calculations, retains public history, promotes ties, survives reimport and restores", () =>
  check(`
 SELECT pg_temp.check_ok(pg_temp.query('rankings')#>>'{rows,0,race,id}'='mod-fixture-bad','initial winner');
 ${flag("mod-fixture-bad")}
 SELECT pg_temp.check_ok(pg_temp.query('rankings')#>>'{total}'='2','both valid athletes remain');
 SELECT pg_temp.check_ok(pg_temp.query('rankings')#>>'{rows,0,rank}'='1' AND pg_temp.query('rankings')#>>'{rows,1,rank}'='1','ties rerank');
 SELECT pg_temp.check_ok(NOT (pg_temp.query('records')::text LIKE '%mod-fixture-bad%'),'records exclude');
 SELECT pg_temp.check_ok(pg_temp.query('profile')#>>'{pbs,1,id}'='mod-fixture-next','PB fallback');
 SELECT pg_temp.check_ok(NOT ((pg_temp.query('athlete_history')->'points')::text LIKE '%mod-fixture-bad%'),'chart excludes');
 SELECT pg_temp.check_ok((pg_temp.query('athlete_history')->'rows')::text LIKE '%mod-fixture-bad%','history preserves');
 SELECT pg_temp.check_ok((pg_temp.query('meet_results')->'rows')::text LIKE '%mod-fixture-bad%','meet preserves');
 SELECT pg_temp.check_ok(pg_temp.query('analysis','{"raceId":"mod-fixture-bad"}')->'stats'='null','no percentile');
 SELECT pg_temp.check_ok(NOT (pg_temp.query('athletes')::text LIKE '%mod-fixture-bad%'),'athlete scores exclude');
 SELECT pg_temp.check_ok((SELECT data->>'swimId'='mod-fixture-next' FROM public.athlete_bests WHERE athlete_id='mod-fixture-athlete' AND event_code='100_FR_LCM'),'stored PB fallback');
 SELECT pg_temp.check_ok(public.ies_times_json_id('mod-fixture-bad')->>'status'='OK','race status preserved');
 SELECT pg_temp.check_ok(public.ies_times_json_id('mod-fixture-bad')->>'moderationStatus'='flagged','public label');
 SELECT pg_temp.check_ok(NOT (public.ies_times_json_id('mod-fixture-bad')::text LIKE '%private-%'),'no private fields');
 SELECT pg_temp.check_ok(public.read_result_moderation('swim','mod-fixture-bad')#>>'{history,0,note}'='private-staff-note','private audit');
 RESET ROLE;
 SELECT pg_temp.swim('mod-fixture-bad','mod-fixture-athlete',26150);
 SELECT private.rebuild_bests_for_events(array['100_FR_LCM']);
 SET LOCAL ROLE authenticated;
 SELECT pg_temp.check_ok(public.result_is_excluded('swim','mod-fixture-bad'),'reimport preserves flag');
 ${flag("mod-fixture-next")}
 SELECT pg_temp.check_ok(NOT EXISTS(SELECT 1 FROM public.athlete_bests WHERE athlete_id='mod-fixture-athlete' AND event_code='100_FR_LCM'),'remove PB when none remains');
 ${restore("mod-fixture-bad")}
 SELECT pg_temp.check_ok(pg_temp.query('rankings')#>>'{rows,0,race,id}'='mod-fixture-bad','restored winner');
 SELECT pg_temp.check_ok((SELECT data->>'swimId'='mod-fixture-bad' FROM public.athlete_bests WHERE athlete_id='mod-fixture-athlete' AND event_code='100_FR_LCM'),'restored stored best');
 SELECT pg_temp.check_ok(jsonb_array_length(public.read_result_moderation('swim','mod-fixture-bad')->'history')=2,'audit keeps flag and restore');
 DO $$ BEGIN
  PERFORM public.moderate_result('swim','mod-fixture-bad','flag','incorrect_time','',0);
  RAISE EXCEPTION 'Stale update accepted'; EXCEPTION WHEN serialization_failure THEN NULL; END; $$;
 DO $$ BEGIN
  PERFORM public.moderate_result('swim','mod-fixture-bad','flag','other','',2);
  RAISE EXCEPTION 'Blank other reason accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END; $$;
 RESET ROLE;
 DO $$ BEGIN
  UPDATE private.result_moderation_events SET note='tampered' WHERE result_id='mod-fixture-bad';
  RAISE EXCEPTION 'Audit changed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Moderation history is immutable' THEN RAISE; END IF; END; $$;
`));
test("relay exclusion propagates to lead-offs, child flags survive parent restoration, splits are independently flaggable", () =>
  check(`
 ${flag("mod-fixture-relay", 0, "relay")}
 SELECT pg_temp.check_ok(public.ies_times_json_id('mod-fixture-leadoff')->>'moderationInherited'='true','parent propagation');
 SELECT pg_temp.check_ok(NOT ((pg_temp.query('profile')->'pbs')::text LIKE '%mod-fixture-leadoff%'),'lead-off PB excluded');
 SELECT pg_temp.check_ok(pg_temp.query('rankings','{"relay":true,"event":"200_FR-R"}')->>'total'='0','relay ranking excludes');
 SELECT pg_temp.check_ok(pg_temp.query('athlete_relays')#>>'{rows,0,race,moderationStatus}'='flagged','relay participation labelled');
 ${flag("mod-fixture-leadoff")}
 ${restore("mod-fixture-relay", 1, "relay")}
 SELECT pg_temp.check_ok(public.result_is_excluded('swim','mod-fixture-leadoff'),'child flag survives');
 ${restore("mod-fixture-leadoff")}
 SELECT pg_temp.check_ok(public.ies_times_json_id('mod-fixture-leadoff')->>'calculationEligible'='true','lead-off restored');
 ${flag("mod-fixture-split")}
 ${restore("mod-fixture-split")}
 SELECT pg_temp.check_ok(public.ies_times_json_id('mod-fixture-split')->>'calculationEligible'='false','restored split remains ineligible');
`));
test("anonymous, nonstaff and unverified staff cannot moderate or read private evidence", () =>
  check(`
 ${flag("mod-fixture-bad")}
 SET LOCAL ROLE anon;
 SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
 SELECT pg_temp.check_ok(public.ies_times_json_id('mod-fixture-bad')->>'moderationStatus'='flagged','anonymous status visible');
 DO $$ BEGIN PERFORM public.read_result_moderation('swim','mod-fixture-bad'); RAISE EXCEPTION 'Anonymous read accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; $$;
 DO $$ BEGIN PERFORM public.moderate_result('swim','mod-fixture-bad','restore','','checked',1); RAISE EXCEPTION 'Anonymous write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; $$;
 SET LOCAL ROLE authenticated;
 SELECT set_config('request.jwt.claims','{"sub":"1f25093a-a2ed-4ea6-a3ae-e38fe783cb82","role":"authenticated"}',true);
 DO $$ BEGIN PERFORM public.read_result_moderation('swim','mod-fixture-bad'); RAISE EXCEPTION 'Nonstaff read accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; $$;
 DO $$ BEGIN PERFORM public.list_result_moderation(); RAISE EXCEPTION 'Nonstaff list accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; $$;
 DO $$ BEGIN PERFORM public.moderate_result('swim','mod-fixture-bad','restore','','checked',1); RAISE EXCEPTION 'Nonstaff write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; $$;
 DO $$ BEGIN UPDATE public.result_moderation SET flagged=false; RAISE EXCEPTION 'Direct update accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; $$;
 SELECT set_config('request.jwt.claims','{"sub":"1f25093a-a2ed-4ea6-a3ae-e38fe783cb83","role":"authenticated"}',true);
 DO $$ BEGIN PERFORM public.moderate_result('swim','mod-fixture-bad','restore','','checked',1); RAISE EXCEPTION 'Unverified write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; $$;
`));
test("review history survives source deletion and missing results cannot be restored", () =>
  check(`
    ${flag("mod-fixture-bad")}
    RESET ROLE;
    SELECT private.put_record('swims/mod-fixture-bad',null);
    SET LOCAL ROLE authenticated;
    SELECT pg_temp.check_ok(public.read_result_moderation('swim','mod-fixture-bad')->>'available'='false','deleted source remains reviewable');
    SELECT pg_temp.check_ok(public.read_result_moderation('swim','mod-fixture-bad')#>>'{originalSnapshot,timeMs}'='26150','original evidence survives');
    DO $$ BEGIN
      PERFORM public.moderate_result('swim','mod-fixture-bad','restore','','Checked source',1);
      RAISE EXCEPTION 'Missing result restored'; EXCEPTION WHEN no_data_found THEN NULL; END; $$;
  `));


test("event rebuild preserves legacy historical active ranks, null gender, ties, exclusions, and no-op rows", () => {
  const legacy = readFileSync("supabase/migrations/20261013225448_result_moderation.sql", "utf8")
    .match(/create or replace function private\.rebuild_bests\(\)[\s\S]*?end; \$function\$;/i)?.[0]
    .replace("private.rebuild_bests()", "pg_temp.legacy_rebuild_bests()");
  if (!legacy) throw new Error("Legacy full rebuild oracle was not found");
  check(`RESET ROLE;
    SELECT set_config('velocity.defer_bests','true',true);
    ${legacy}
    SELECT private.put_record('athletes/mod-fixture-inactive','{"id":"mod-fixture-inactive","name":{"first":"Inactive","last":"Fixture"},"status":"inactive"}');
    SELECT private.put_record('athletes/mod-fixture-null-a','{"id":"mod-fixture-null-a","name":{"first":"Null A","last":"Fixture"},"status":"active"}');
    SELECT private.put_record('athletes/mod-fixture-null-b','{"id":"mod-fixture-null-b","name":{"first":"Null B","last":"Fixture"},"status":"active"}');
    SELECT pg_temp.swim('mod-fixture-female-history','mod-fixture-athlete',40000,'{"gender":"F"}');
    SELECT pg_temp.swim('mod-fixture-female-history-tie','mod-fixture-athlete',40000,'{"gender":"F"}');
    SELECT pg_temp.swim('mod-fixture-female-target','mod-fixture-other',50000,'{"gender":"F"}');
    SELECT pg_temp.swim('mod-fixture-inactive-fast','mod-fixture-inactive',20000,'{"gender":"F"}');
    SELECT pg_temp.swim('mod-fixture-null-a','mod-fixture-null-a',45000,'{"gender":null}');
    SELECT pg_temp.swim('mod-fixture-null-b','mod-fixture-null-b',55000,'{"gender":null}');
    SELECT pg_temp.swim('mod-fixture-dq','mod-fixture-other',11000,'{"status":"DQ","gender":"F"}');
    SELECT pg_temp.swim('mod-fixture-unofficial','mod-fixture-other',12000,'{"isOfficial":false,"gender":"F"}');
    SELECT pg_temp.swim('mod-fixture-relay-split','mod-fixture-other',13000,'{"isRelaySplit":true,"gender":"F"}');
    SELECT pg_temp.swim('mod-fixture-flagged','mod-fixture-other',14000,'{"gender":"F"}');
    INSERT INTO public.result_moderation(result_type,result_id,flagged,version) VALUES
      ('swim','mod-fixture-flagged',true,1),('relay','mod-fixture-relay',true,1);
    SELECT pg_temp.legacy_rebuild_bests();
    CREATE TEMP TABLE expected_full_bests AS SELECT athlete_id,event_code,data FROM public.athlete_bests;
    DELETE FROM public.athlete_bests;
    INSERT INTO public.athlete_bests(athlete_id,event_code,data) VALUES
      ('mod-fixture-other','100_FR_LCM','{"wrong":true}'),
      ('mod-fixture-other','50_FR_LCM','{"stale":true}');
    SELECT private.rebuild_bests_for_events(array(select distinct event_code from public.swims));
    SELECT pg_temp.check_ok(NOT EXISTS(
      (SELECT athlete_id,event_code,data FROM expected_full_bests EXCEPT SELECT athlete_id,event_code,data FROM public.athlete_bests)
      UNION ALL
      (SELECT athlete_id,event_code,data FROM public.athlete_bests EXCEPT SELECT athlete_id,event_code,data FROM expected_full_bests)
    ),'full rebuild changed legacy output');
    SELECT pg_temp.check_ok((SELECT data->>'clubRankActiveRoster'='2' FROM public.athlete_bests WHERE athlete_id='mod-fixture-other' AND event_code='100_FR_LCM'),'historical gender minimum must count once');
    SELECT pg_temp.check_ok((SELECT bool_and(data->>'clubRankActiveRoster'='1') FROM public.athlete_bests WHERE athlete_id IN ('mod-fixture-null-a','mod-fixture-null-b')),'null gender keeps SQL equality semantics');
    CREATE TEMP TABLE unchanged_full_bests AS SELECT athlete_id,event_code,ctid AS row_tid FROM public.athlete_bests;
    SELECT private.rebuild_bests_for_events(array(select distinct event_code from public.swims));
    SELECT pg_temp.check_ok(NOT EXISTS(SELECT 1 FROM unchanged_full_bests x LEFT JOIN public.athlete_bests b USING(athlete_id,event_code) WHERE b.ctid IS DISTINCT FROM x.row_tid),'no-op rebuild rewrote rows');
    UPDATE public.swims SET data=jsonb_set(data,'{status}','"DQ"') WHERE id LIKE 'mod-fixture-%' AND coalesce(data->>'resultOrigin','')<>'relay_leadoff';
    SELECT pg_temp.legacy_rebuild_bests();
    DELETE FROM expected_full_bests;
    INSERT INTO expected_full_bests SELECT athlete_id,event_code,data FROM public.athlete_bests;
    INSERT INTO public.athlete_bests(athlete_id,event_code,data) VALUES ('mod-fixture-other','100_FR_LCM','{"stale":true}');
    SELECT private.rebuild_bests_for_events(array(select distinct event_code from public.swims));
    SELECT pg_temp.check_ok(NOT EXISTS(
      (SELECT athlete_id,event_code,data FROM expected_full_bests EXCEPT SELECT athlete_id,event_code,data FROM public.athlete_bests)
      UNION ALL
      (SELECT athlete_id,event_code,data FROM public.athlete_bests EXCEPT SELECT athlete_id,event_code,data FROM expected_full_bests)
    ),'full rebuild cleanup changed legacy output');
    SELECT pg_temp.check_ok(NOT EXISTS(SELECT 1 FROM public.athlete_bests WHERE athlete_id LIKE 'mod-fixture-%'),'full rebuild retained ineligible fixture PBs');
  `);
});

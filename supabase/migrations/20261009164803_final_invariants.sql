SET local check_function_bodies = off;

REVOKE ALL ON FUNCTION "public"."claim_shift_reminders"(boolean) FROM "anon";

REVOKE ALL ON FUNCTION "public"."claim_shift_reminders"(boolean) FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."collect_records"(jsonb, jsonb) FROM "anon";

REVOKE ALL ON FUNCTION "public"."collect_records"(jsonb, jsonb) FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."commit_records"(jsonb, jsonb) FROM "anon";

REVOKE ALL ON FUNCTION "public"."export_records"(text) FROM "anon";

REVOKE ALL ON FUNCTION "public"."export_records"(text) FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."finish_shift_reminder"(text, date, text, text) FROM "anon";

REVOKE ALL ON FUNCTION "public"."finish_shift_reminder"(text, date, text, text) FROM "authenticated";

ALTER TABLE "public"."practice_sessions"
  ADD COLUMN "practice_date" text GENERATED ALWAYS AS ("substring"((DATA ->> 'date'::text), 1, 10)) STORED;

ALTER TABLE "public"."practice_sessions"
  ADD COLUMN "group_name" text GENERATED ALWAYS AS ((DATA ->> 'trainingGroup'::text)) STORED;

ALTER TABLE "public"."practice_sessions"
  ADD COLUMN "group_id" text GENERATED ALWAYS AS ((DATA ->> 'trainingGroupId'::text)) STORED;

ALTER TABLE "public"."swims"
  ADD COLUMN "round" text GENERATED ALWAYS AS ((DATA ->> 'round'::text)) STORED NOT NULL;

ALTER TABLE "public"."swims"
  ADD COLUMN "is_official" boolean GENERATED ALWAYS AS (COALESCE(((DATA ->> 'isOfficial'::text))::boolean, true)) STORED NOT NULL;

ALTER TABLE "public"."swims"
  ADD COLUMN "is_relay" boolean GENERATED ALWAYS AS (COALESCE(((DATA ->> 'isRelay'::text))::boolean, false)) STORED NOT NULL;

ALTER TABLE "public"."swims"
  ALTER COLUMN "athlete_id" SET NOT NULL;

ALTER TABLE "public"."swims"
  ALTER COLUMN "course" SET NOT NULL;

ALTER TABLE "public"."swims"
  ALTER COLUMN "event_code" SET NOT NULL;

ALTER TABLE "public"."swims"
  ALTER COLUMN "meet_id" SET NOT NULL;

ALTER TABLE "public"."swims"
  ALTER COLUMN "status" SET NOT NULL;

CREATE OR REPLACE FUNCTION private.athlete_snapshot (
  body jsonb,
  pid  text,
  gid  text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
 select body || jsonb_build_object('personId',pid,'name',coalesce(case when trim((p.data#>>'{structuredName,first}')||' '||(p.data#>>'{structuredName,last}'))=p.name then p.data->'structuredName' else null end,jsonb_build_object('first',split_part(p.name,' ',1),'last',substring(p.name from position(' ' in p.name)+1))),'currentGroup',coalesce(body->'currentGroup','{}'::jsonb)||jsonb_build_object('id',gid,'name',coalesce(g.name,'No Assignment'))) from public.people p left join public.training_groups g on g.id=gid where p.id=pid;
$function$;

CREATE OR REPLACE FUNCTION private.format_time (
  ms integer
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$ select case when ms>=60000 then (ms/60000)::text||':'||lpad(((ms%60000)/1000)::text,2,'0') else (ms/1000)::text end||'.'||lpad(((ms%1000)/10)::text,2,'0');$function$;

CREATE OR REPLACE FUNCTION private.publish_person()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 update public.public_athletes set data=data||jsonb_build_object('name',case when trim((new.data#>>'{structuredName,first}')||' '||(new.data#>>'{structuredName,last}'))=new.name then new.data->'structuredName' else jsonb_build_object('first',split_part(new.name,' ',1),'last',substring(new.name from position(' ' in new.name)+1)) end) where id in (select id from public.athletes where person_id=new.id);
 return new;
end;$function$;

CREATE OR REPLACE FUNCTION private.rebuild_bests()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 delete from public.athlete_bests where true;
 insert into public.athlete_bests(athlete_id,event_code,data)
 select b.athlete_id,b.event_code,jsonb_build_object('eventCode',b.event_code,'distance',b.data->'distance','stroke',b.data->'stroke','course',b.course,'gender',b.data->>'gender','bestTimeMs',b.time_ms,'bestTimeDisplay',private.format_time(b.time_ms),'swimDate',b.data#>>'{meet,date}','meetName',b.data#>>'{meet,name}','swimId',b.id,'standard',coalesce(b.data#>>'{standardsTag,usasMotivational}',''),'ageWhenSwum',b.data->'ageAtSwim','clubRankAllTime',rank() over(partition by b.event_code,b.course,b.data->>'gender' order by b.time_ms),'clubRankActiveRoster',case when a.data->>'status'='active' then (select count(distinct faster.athlete_id)+1 from public.swims faster join public.athletes fa on fa.id=faster.athlete_id where faster.status='OK' and faster.event_code=b.event_code and faster.course=b.course and faster.data->>'gender'=b.data->>'gender' and faster.time_ms<b.time_ms and fa.data->>'status'='active' and coalesce(faster.data->>'isOfficial','true')='true' and (coalesce(faster.data->>'isRelay','false')='false' or faster.data#>>'{relay,isLeadOffFlatStart}'='true')) else null end)
 from (select distinct on(athlete_id,event_code) * from public.swims where status='OK' and coalesce(data->>'isOfficial','true')='true' and (coalesce(data->>'isRelay','false')='false' or data#>>'{relay,isLeadOffFlatStart}'='true') order by athlete_id,event_code,time_ms,data#>>'{meet,date}',id) b join public.athletes a on a.id=b.athlete_id;
 return;
end; $function$;

ALTER TABLE "public"."postings"
  ADD CONSTRAINT "postings_data_check" CHECK ((((data #>> '{positions,max}'::text[]) IS
    NOT NULL) AND (((data #>> '{positions,max}'::text[]))::integer > 0) AND (((data #>> '{positions,min}'::text[]))::integer >= 0) AND
    (((data #>> '{positions,min}'::text[]))::integer <= ((data #>> '{positions,desired}'::text[]))::integer) AND
    (((data #>> '{positions,desired}'::text[]))::integer <= ((data #>> '{positions,max}'::text[]))::integer)));

ALTER TABLE "public"."practice_sessions"
  ADD CONSTRAINT "practice_sessions_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.training_groups(id);

ALTER TABLE "public"."practice_sessions"
  ADD CONSTRAINT "practice_sessions_practice_date_group_name_key" UNIQUE (practice_date, group_name);

ALTER TABLE "public"."swims"
  ADD CONSTRAINT "swims_round_check" CHECK ((round = ANY (ARRAY['P'::text, 'F'::text, 'S'::text, 'TT'::text])));

CREATE INDEX practice_sessions_group_id_idx ON public.practice_sessions USING btree (group_id);

CREATE TRIGGER publish_person
  AFTER INSERT OR UPDATE ON public.people
  FOR EACH ROW
  EXECUTE FUNCTION private.publish_person();

REVOKE ALL ON FUNCTION "private"."format_time"(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."format_time"(integer) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "private"."publish_person"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."publish_person"() TO "postgres";

REVOKE ALL ON TABLE "public"."athlete_bests" FROM "anon";

GRANT SELECT ON TABLE "public"."athlete_bests" TO "anon";

REVOKE ALL ON TABLE "public"."athlete_bests" FROM "authenticated";

GRANT SELECT ON TABLE "public"."athlete_bests" TO "authenticated";

REVOKE ALL ON TABLE "public"."athletes" FROM "anon";

GRANT SELECT ON TABLE "public"."athletes" TO "anon";

REVOKE ALL ON TABLE "public"."athletes" FROM "authenticated";

GRANT SELECT ON TABLE "public"."athletes" TO "authenticated";

REVOKE ALL ON TABLE "public"."attendance" FROM "anon";

GRANT SELECT ON TABLE "public"."attendance" TO "anon";

REVOKE ALL ON TABLE "public"."attendance" FROM "authenticated";

GRANT SELECT ON TABLE "public"."attendance" TO "authenticated";

REVOKE ALL ON TABLE "public"."documents" FROM "anon";

GRANT SELECT ON TABLE "public"."documents" TO "anon";

REVOKE ALL ON TABLE "public"."documents" FROM "authenticated";

GRANT SELECT ON TABLE "public"."documents" TO "authenticated";

REVOKE ALL ON TABLE "public"."evidence_records" FROM "anon";

GRANT SELECT ON TABLE "public"."evidence_records" TO "anon";

REVOKE ALL ON TABLE "public"."evidence_records" FROM "authenticated";

GRANT SELECT ON TABLE "public"."evidence_records" TO "authenticated";

REVOKE ALL ON TABLE "public"."families" FROM "anon";

GRANT SELECT ON TABLE "public"."families" TO "anon";

REVOKE ALL ON TABLE "public"."families" FROM "authenticated";

GRANT SELECT ON TABLE "public"."families" TO "authenticated";

REVOKE ALL ON TABLE "public"."family_emails" FROM "anon";

GRANT SELECT ON TABLE "public"."family_emails" TO "anon";

REVOKE ALL ON TABLE "public"."family_emails" FROM "authenticated";

GRANT SELECT ON TABLE "public"."family_emails" TO "authenticated";

REVOKE ALL ON TABLE "public"."family_people" FROM "anon";

GRANT SELECT ON TABLE "public"."family_people" TO "anon";

REVOKE ALL ON TABLE "public"."family_people" FROM "authenticated";

GRANT SELECT ON TABLE "public"."family_people" TO "authenticated";

REVOKE ALL ON TABLE "public"."manual_hours" FROM "anon";

GRANT SELECT ON TABLE "public"."manual_hours" TO "anon";

REVOKE ALL ON TABLE "public"."manual_hours" FROM "authenticated";

GRANT SELECT ON TABLE "public"."manual_hours" TO "authenticated";

REVOKE ALL ON TABLE "public"."meets" FROM "anon";

GRANT SELECT ON TABLE "public"."meets" TO "anon";

REVOKE ALL ON TABLE "public"."meets" FROM "authenticated";

GRANT SELECT ON TABLE "public"."meets" TO "authenticated";

REVOKE ALL ON TABLE "public"."people" FROM "anon";

GRANT SELECT ON TABLE "public"."people" TO "anon";

REVOKE ALL ON TABLE "public"."people" FROM "authenticated";

GRANT SELECT ON TABLE "public"."people" TO "authenticated";

REVOKE ALL ON TABLE "public"."postings" FROM "anon";

GRANT SELECT ON TABLE "public"."postings" TO "anon";

REVOKE ALL ON TABLE "public"."postings" FROM "authenticated";

GRANT SELECT ON TABLE "public"."postings" TO "authenticated";

REVOKE ALL ON TABLE "public"."practice_sessions" FROM "anon";

GRANT SELECT ON TABLE "public"."practice_sessions" TO "anon";

REVOKE ALL ON TABLE "public"."practice_sessions" FROM "authenticated";

GRANT SELECT ON TABLE "public"."practice_sessions" TO "authenticated";

REVOKE ALL ON TABLE "public"."public_athletes" FROM "anon";

GRANT SELECT ON TABLE "public"."public_athletes" TO "anon";

REVOKE ALL ON TABLE "public"."public_athletes" FROM "authenticated";

GRANT SELECT ON TABLE "public"."public_athletes" TO "authenticated";

REVOKE ALL ON TABLE "public"."registrations" FROM "anon";

GRANT SELECT ON TABLE "public"."registrations" TO "anon";

REVOKE ALL ON TABLE "public"."registrations" FROM "authenticated";

GRANT SELECT ON TABLE "public"."registrations" TO "authenticated";

REVOKE ALL ON TABLE "public"."standard_cuts" FROM "anon";

GRANT SELECT ON TABLE "public"."standard_cuts" TO "anon";

REVOKE ALL ON TABLE "public"."standard_cuts" FROM "authenticated";

GRANT SELECT ON TABLE "public"."standard_cuts" TO "authenticated";

REVOKE ALL ON TABLE "public"."standards" FROM "anon";

GRANT SELECT ON TABLE "public"."standards" TO "anon";

REVOKE ALL ON TABLE "public"."standards" FROM "authenticated";

GRANT SELECT ON TABLE "public"."standards" TO "authenticated";

REVOKE ALL ON TABLE "public"."swims" FROM "anon";

GRANT SELECT ON TABLE "public"."swims" TO "anon";

REVOKE ALL ON TABLE "public"."swims" FROM "authenticated";

GRANT SELECT ON TABLE "public"."swims" TO "authenticated";

REVOKE ALL ON TABLE "public"."teams" FROM "anon";

GRANT SELECT ON TABLE "public"."teams" TO "anon";

REVOKE ALL ON TABLE "public"."teams" FROM "authenticated";

GRANT SELECT ON TABLE "public"."teams" TO "authenticated";

REVOKE ALL ON TABLE "public"."training_groups" FROM "anon";

GRANT SELECT ON TABLE "public"."training_groups" TO "anon";

REVOKE ALL ON TABLE "public"."training_groups" FROM "authenticated";

GRANT SELECT ON TABLE "public"."training_groups" TO "authenticated";

REVOKE ALL ON TABLE "public"."venues" FROM "anon";

GRANT SELECT ON TABLE "public"."venues" TO "anon";

REVOKE ALL ON TABLE "public"."venues" FROM "authenticated";

GRANT SELECT ON TABLE "public"."venues" TO "authenticated";

REVOKE ALL ON TABLE "public"."work_descriptions" FROM "anon";

GRANT SELECT ON TABLE "public"."work_descriptions" TO "anon";

REVOKE ALL ON TABLE "public"."work_descriptions" FROM "authenticated";

GRANT SELECT ON TABLE "public"."work_descriptions" TO "authenticated";

REVOKE ALL ON TABLE "public"."app_records" FROM "anon";

GRANT SELECT ON TABLE "public"."app_records" TO "anon";

REVOKE ALL ON TABLE "public"."app_records" FROM "authenticated";

GRANT SELECT ON TABLE "public"."app_records" TO "authenticated";


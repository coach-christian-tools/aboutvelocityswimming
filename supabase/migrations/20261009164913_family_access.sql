SET local check_function_bodies = off;

DROP POLICY "logged_in_postings" ON "public"."postings";

DROP POLICY "logged_in_descriptions" ON "public"."work_descriptions";

CREATE OR REPLACE FUNCTION private.has_family()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$ select exists(select 1 from public.family_emails f join auth.users u on lower(u.email)=f.email where u.id=auth.uid() and u.email_confirmed_at is not null);$function$;

CREATE POLICY "logged_in_postings" ON "public"."postings"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT private.is_staff() AS is_staff) OR ( SELECT private.has_family() AS has_family)));

CREATE POLICY "logged_in_descriptions" ON "public"."work_descriptions"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT private.is_staff() AS is_staff) OR ( SELECT private.has_family() AS has_family)));

REVOKE ALL ON FUNCTION "private"."has_family"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."has_family"() TO "anon", "authenticated", "postgres";


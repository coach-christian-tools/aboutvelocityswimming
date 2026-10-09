SET local check_function_bodies = off;

CREATE TABLE "private"."administrator_emails" (
  "email" text NOT NULL,
  CONSTRAINT "administrator_emails_email_check" CHECK ((email = lower(TRIM(BOTH FROM email)))),
  CONSTRAINT "administrator_emails_pkey" PRIMARY KEY (email)
);

ALTER TABLE "private"."administrator_emails"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.is_staff()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select auth.uid() is not null and exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null
 and (exists(select 1 from public.administrators a where a.user_id=u.id)
 or exists(select 1 from private.administrator_emails a where a.email=lower(u.email))));
$function$;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."administrator_emails" TO "postgres";

-- Preserve previously verified staff during rollout; new staff require explicit grants.
insert into public.administrators(user_id)
select id from auth.users where email_confirmed_at is not null
 and lower(split_part(email,'@',2))='velocity-swimming.com' on conflict do nothing;

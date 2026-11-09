-- Stale proposals need new evidence, not a retry of the same transaction.
-- PostgREST 14 retries SQLSTATE 40001 indefinitely, even after an HTTP timeout.
-- Return HTTP 409 without changing validation, atomicity, or function privileges.
DO $migration$
DECLARE
 definition text := pg_get_functiondef('private.review_collection(uuid,text,text)'::regprocedure);
 patched text;
BEGIN
 patched := replace(definition, 'errcode=''40001''', 'errcode=''PT409''');
 IF (length(definition) - length(replace(definition, 'errcode=''40001''', ''))) / length('errcode=''40001''') <> 2 THEN
  RAISE EXCEPTION 'Expected exactly two stale-proposal checks in private.review_collection';
 END IF;
 EXECUTE patched;
END;
$migration$;

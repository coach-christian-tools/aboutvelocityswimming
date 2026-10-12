-- Approvals are serialized by the existing advisory lock. Give this RPC a
-- bounded runtime for its atomic writes and best-time rebuild, without changing
-- the default timeout for other API requests.
ALTER FUNCTION public.review_collection(uuid,text,text)
  SET statement_timeout TO '30s';
-- Keep the two best-time sorts in memory as the imported results grow.
ALTER FUNCTION private.rebuild_bests()
  SET work_mem TO '64MB';
NOTIFY pgrst, 'reload schema';

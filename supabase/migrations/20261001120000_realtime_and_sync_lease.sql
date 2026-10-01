-- Near-real-time Recent TX: realtime publication + atomic sync lease.
-- Service role bypasses RLS. The browser uses only the publishable key.

-- Compare-and-update lease. Holds a row lock only for this statement, which
-- is safe with Supabase's transaction pooler (session advisory locks are not).
CREATE OR REPLACE FUNCTION public.acquire_sync_lease(
  p_sync_key text,
  p_ttl_seconds integer
)
RETURNS TABLE (
  acquired boolean,
  last_indexed_block bigint,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.sync_state%ROWTYPE;
BEGIN
  IF p_sync_key IS NULL OR length(p_sync_key) = 0 THEN
    RAISE EXCEPTION 'sync key required';
  END IF;

  SELECT * INTO r
  FROM public.sync_state
  WHERE sync_key = p_sync_key
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.sync_state (sync_key, last_indexed_block, status)
    VALUES (p_sync_key, 0, 'syncing');
    acquired := true;
    last_indexed_block := 0;
    status := 'syncing';
    RETURN NEXT;
    RETURN;
  END IF;

  IF r.status = 'syncing'
     AND r.updated_at > now() - make_interval(secs => GREATEST(p_ttl_seconds, 30))
  THEN
    acquired := false;
    last_indexed_block := r.last_indexed_block;
    status := r.status;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.sync_state
  SET status = 'syncing',
      last_error = NULL,
      updated_at = now()
  WHERE sync_key = p_sync_key;

  acquired := true;
  last_indexed_block := r.last_indexed_block;
  status := 'syncing';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_sync_lease(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acquire_sync_lease(text, integer) TO service_role;

-- Transactions must be in the realtime publication or postgres_changes never fires.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'transactions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
    END IF;
  END IF;
END $$;

-- INSERT/UPDATE payloads include the full row for the anon SELECT policy.
ALTER TABLE public.transactions REPLICA IDENTITY FULL;

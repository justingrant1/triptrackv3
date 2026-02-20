-- Advisory lock function for serializing trip creation per user.
-- This prevents race conditions where two concurrent email processing requests
-- both find no existing trip and both create new ones.
--
-- PostgreSQL advisory locks are session-level and automatically released
-- when the session/transaction ends. We use pg_advisory_xact_lock which
-- is transaction-scoped (auto-released on COMMIT/ROLLBACK).
--
-- The lock key is derived from the user's UUID to ensure per-user serialization
-- without blocking other users.

CREATE OR REPLACE FUNCTION acquire_trip_creation_lock(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  lock_key bigint;
BEGIN
  -- Convert UUID to a stable bigint for advisory lock
  -- We use the first 8 bytes of the UUID hash
  lock_key := ('x' || left(md5(p_user_id::text), 15))::bit(60)::bigint;
  
  -- Acquire advisory lock (blocks until available, auto-released on transaction end)
  PERFORM pg_advisory_xact_lock(lock_key);
END;
$$;

-- Also create a try-lock version that returns immediately if lock is held
CREATE OR REPLACE FUNCTION try_acquire_trip_creation_lock(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  lock_key bigint;
BEGIN
  lock_key := ('x' || left(md5(p_user_id::text), 15))::bit(60)::bigint;
  RETURN pg_try_advisory_xact_lock(lock_key);
END;
$$;

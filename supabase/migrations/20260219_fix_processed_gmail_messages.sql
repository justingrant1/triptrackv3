-- Fix processed_gmail_messages table
-- The original migration may not have been applied, or the schema cache may be stale.
-- This migration ensures the table exists with the correct schema.

-- Add status column if it doesn't exist (handles case where table exists but column is missing)
DO $$ BEGIN
  ALTER TABLE processed_gmail_messages ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'processed';
EXCEPTION
  WHEN undefined_table THEN
    -- Table doesn't exist at all — create it
    CREATE TABLE processed_gmail_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
      gmail_message_id text NOT NULL,
      status text NOT NULL DEFAULT 'processed',
      processed_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id, gmail_message_id)
    );
END $$;

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_processed_gmail_user_message
  ON processed_gmail_messages(user_id, gmail_message_id);

CREATE INDEX IF NOT EXISTS idx_processed_gmail_processed_at
  ON processed_gmail_messages(processed_at);

-- Add index on status for querying stale 'processing' records
CREATE INDEX IF NOT EXISTS idx_processed_gmail_status
  ON processed_gmail_messages(status);

-- Enable RLS
ALTER TABLE processed_gmail_messages ENABLE ROW LEVEL SECURITY;

-- Add service role bypass policy so edge functions can insert/update/delete
-- (The edge function uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS,
--  but we add explicit policies for completeness)
DO $$ BEGIN
  CREATE POLICY "Service role full access on processed_gmail_messages"
    ON processed_gmail_messages
    FOR ALL
    USING (true)
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

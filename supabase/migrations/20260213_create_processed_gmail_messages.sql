-- Create table to track which Gmail messages have been processed
-- This prevents re-processing the same email multiple times and re-creating deleted trips/reservations

CREATE TABLE IF NOT EXISTS processed_gmail_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  gmail_message_id text NOT NULL,
  status text NOT NULL DEFAULT 'processed',
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, gmail_message_id)
);

-- Index for fast lookups during batch deduplication
CREATE INDEX IF NOT EXISTS idx_processed_gmail_user_message
  ON processed_gmail_messages(user_id, gmail_message_id);

-- Index for cleanup queries (e.g., delete old processed messages)
CREATE INDEX IF NOT EXISTS idx_processed_gmail_processed_at
  ON processed_gmail_messages(processed_at);

-- Enable Row Level Security
ALTER TABLE processed_gmail_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own processed messages
DO $$ BEGIN
  CREATE POLICY "Users can view own processed messages"
    ON processed_gmail_messages
    FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Policy: Users can insert their own processed messages
DO $$ BEGIN
  CREATE POLICY "Users can insert own processed messages"
    ON processed_gmail_messages
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Policy: Users can delete their own processed messages (for cleanup)
DO $$ BEGIN
  CREATE POLICY "Users can delete own processed messages"
    ON processed_gmail_messages
    FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

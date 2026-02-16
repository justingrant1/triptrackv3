-- Create table to track deleted trips and prevent them from being recreated
-- This solves the bug where deleted trips reappear when new emails about the same trip arrive

CREATE TABLE IF NOT EXISTS deleted_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  destination text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  -- Store original trip name for debugging/logging
  original_trip_name text
);

-- Index for fast lookups during trip creation (check if destination+dates match a deleted trip)
CREATE INDEX IF NOT EXISTS idx_deleted_trips_user_destination_dates
  ON deleted_trips(user_id, destination, start_date, end_date);

-- Index for cleanup queries (auto-delete records older than 6 months)
CREATE INDEX IF NOT EXISTS idx_deleted_trips_deleted_at
  ON deleted_trips(deleted_at);

-- Enable Row Level Security
ALTER TABLE deleted_trips ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own deleted trips
CREATE POLICY "Users can view own deleted trips"
  ON deleted_trips
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own deleted trips
CREATE POLICY "Users can insert own deleted trips"
  ON deleted_trips
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own deleted trip records (if they want to allow recreation)
CREATE POLICY "Users can delete own deleted trip records"
  ON deleted_trips
  FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-cleanup function: Delete records older than 6 months
-- This matches the Gmail search window (6 months) so we don't block trips indefinitely
CREATE OR REPLACE FUNCTION cleanup_old_deleted_trips()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM deleted_trips
  WHERE deleted_at < NOW() - INTERVAL '6 months';
END;
$$;

-- Note: You can manually run this cleanup with:
-- SELECT cleanup_old_deleted_trips();
-- Or set up a cron job in Supabase to run it weekly

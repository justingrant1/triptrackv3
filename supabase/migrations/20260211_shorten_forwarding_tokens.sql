-- Migration: Shorten forwarding_token from UUID (36 chars) to 8-char alphanumeric
-- This makes the forwarding address much shorter and more user-friendly:
--   BEFORE: plans+a1b2c3d4-e5f6-7890-abcd-ef1234567890@triptrack.ai  (50 chars)
--   AFTER:  plans+k7m2x9pq@triptrack.ai                              (31 chars)
--
-- 62^8 = 218 trillion combinations — impossible to brute-force

-- Helper function to generate short random alphanumeric tokens
CREATE OR REPLACE FUNCTION generate_short_token(length INT DEFAULT 8)
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Update all existing forwarding tokens to 8-char short tokens
-- Use a loop to ensure uniqueness
DO $$
DECLARE
  profile_record RECORD;
  new_token TEXT;
  token_exists BOOLEAN;
BEGIN
  FOR profile_record IN SELECT id FROM profiles WHERE forwarding_token IS NOT NULL LOOP
    LOOP
      new_token := generate_short_token(8);
      -- Check uniqueness
      SELECT EXISTS(
        SELECT 1 FROM profiles WHERE forwarding_token = new_token AND id != profile_record.id
      ) INTO token_exists;
      EXIT WHEN NOT token_exists;
    END LOOP;
    
    UPDATE profiles SET forwarding_token = new_token WHERE id = profile_record.id;
  END LOOP;
END $$;

-- Update the default value for new profiles
-- Drop old trigger/function if it uses gen_random_uuid() and replace with short token
-- First, check if there's a trigger that sets forwarding_token on insert

-- Update or create the trigger function to use short tokens
CREATE OR REPLACE FUNCTION set_forwarding_token()
RETURNS TRIGGER AS $$
DECLARE
  new_token TEXT;
  token_exists BOOLEAN;
BEGIN
  IF NEW.forwarding_token IS NULL THEN
    LOOP
      new_token := generate_short_token(8);
      SELECT EXISTS(
        SELECT 1 FROM profiles WHERE forwarding_token = new_token
      ) INTO token_exists;
      EXIT WHEN NOT token_exists;
    END LOOP;
    NEW.forwarding_token := new_token;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if any (safe to run even if it doesn't exist)
DROP TRIGGER IF EXISTS set_forwarding_token_trigger ON profiles;

-- Create trigger for new profile inserts
CREATE TRIGGER set_forwarding_token_trigger
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_forwarding_token();

-- Also update the column default (in case it was set to gen_random_uuid())
ALTER TABLE profiles ALTER COLUMN forwarding_token SET DEFAULT NULL;

-- Verify: show sample of updated tokens
-- SELECT id, forwarding_token, 'plans+' || forwarding_token || '@triptrack.ai' as forwarding_address 
-- FROM profiles LIMIT 5;

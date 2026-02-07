# 🚀 Supabase Setup Guide for TripTrack (IMPROVED)

**Version 2.0** - Incorporates production-ready improvements for cost optimization and security.

This guide will walk you through setting up your Supabase backend for TripTrack with enterprise-grade patterns.

## Step 1: Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click **"New Project"**
4. Fill in:
   - **Name:** TripTrack
   - **Database Password:** (generate a strong password and save it)
   - **Region:** Choose closest to your users (e.g., US East for North America)
   - **Pricing Plan:** Free (sufficient for MVP)
5. Click **"Create new project"** (takes ~2 minutes)

## Step 2: Get API Credentials

1. Once project is created, go to **Settings** → **API**
2. Copy these values to your `.env` file:
   - **Project URL** → `EXPO_PUBLIC_SUPABASE_URL`
   - **anon public** key → `EXPO_PUBLIC_SUPABASE_ANON_KEY`

3. **IMPORTANT:** Also get the **service_role** key for Edge Functions:
   - Copy **service_role** key → Save securely (DO NOT commit to git)

Your `.env` should look like:
```env
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# For encryption (generate a random 32-character string)
TOKEN_ENCRYPTION_KEY=your-32-char-random-string-here
```

## Step 3: Create Database Schema (IMPROVED)

1. In Supabase dashboard, go to **SQL Editor**
2. Click **"New query"**
3. Copy and paste the SQL below
4. Click **"Run"** (or press Ctrl+Enter)

```sql
-- ============================================
-- TripTrack Database Schema v2.0
-- IMPROVEMENTS:
-- - Encrypted OAuth tokens
-- - Push tokens per device
-- - Chat message limits
-- - Email parsing cache
-- - Trip summaries
-- ============================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for encryption

-- ============================================
-- TABLES
-- ============================================

-- Profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  forwarding_email TEXT UNIQUE,
  avatar_url TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'team')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trips
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  destination TEXT NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  cover_image TEXT,
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed')),
  summary TEXT, -- 🆕 Auto-generated trip summary for push notifications
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reservations
CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('flight', 'hotel', 'car', 'train', 'meeting', 'event')),
  title TEXT NOT NULL,
  subtitle TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  location TEXT,
  address TEXT,
  confirmation_number TEXT,
  details JSONB DEFAULT '{}',
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'delayed', 'cancelled', 'completed')),
  alert_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Receipts
CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  merchant TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  date TIMESTAMPTZ NOT NULL,
  category TEXT CHECK (category IN ('transport', 'lodging', 'meals', 'other')),
  image_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'approved')),
  ocr_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 🆕 Connected email accounts (with ENCRYPTED tokens)
CREATE TABLE connected_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  provider TEXT CHECK (provider IN ('gmail', 'outlook', 'icloud')),
  email TEXT NOT NULL,
  -- Tokens are encrypted at rest using pgcrypto
  access_token_encrypted BYTEA, -- encrypted with pgcrypto
  refresh_token_encrypted BYTEA, -- encrypted with pgcrypto
  token_expires_at TIMESTAMPTZ,
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, email)
);

-- Trusted sender emails
CREATE TABLE trusted_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, email)
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT CHECK (type IN ('gate_change', 'delay', 'reminder', 'confirmation', 'trip_summary')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification preferences
CREATE TABLE notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  flight_updates BOOLEAN DEFAULT true,
  departure_reminders BOOLEAN DEFAULT true,
  checkin_alerts BOOLEAN DEFAULT true,
  trip_changes BOOLEAN DEFAULT true,
  email_confirmations BOOLEAN DEFAULT false,
  trip_summaries BOOLEAN DEFAULT true, -- 🆕 Auto-generated trip summaries
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 🆕 Push tokens (one per device, not per user)
CREATE TABLE push_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  token TEXT NOT NULL UNIQUE,
  device_id TEXT, -- unique device identifier
  platform TEXT CHECK (platform IN ('ios', 'android', 'web')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used TIMESTAMPTZ DEFAULT NOW()
);

-- 🆕 AI chat history (with message limit per user)
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  trip_context UUID REFERENCES trips(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 🆕 Email parsing cache (to avoid re-parsing same emails)
CREATE TABLE email_parse_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_hash TEXT NOT NULL UNIQUE, -- hash of email content
  parsed_data JSONB NOT NULL,
  parse_method TEXT CHECK (parse_method IN ('regex', 'gpt')), -- track which method was used
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES for Performance
-- ============================================

CREATE INDEX idx_trips_user_id ON trips(user_id);
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_start_date ON trips(start_date);

CREATE INDEX idx_reservations_trip_id ON reservations(trip_id);
CREATE INDEX idx_reservations_start_time ON reservations(start_time);
CREATE INDEX idx_reservations_status ON reservations(status);

CREATE INDEX idx_receipts_trip_id ON receipts(trip_id);
CREATE INDEX idx_receipts_date ON receipts(date);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read);

CREATE INDEX idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at); -- 🆕 for pruning old messages

CREATE INDEX idx_push_tokens_user_id ON push_tokens(user_id);
CREATE INDEX idx_push_tokens_token ON push_tokens(token);

CREATE INDEX idx_email_parse_cache_hash ON email_parse_cache(email_hash);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE trusted_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_parse_cache ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read and update their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Trips: Users can only access their own trips
CREATE POLICY "Users can view own trips"
  ON trips FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trips"
  ON trips FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trips"
  ON trips FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trips"
  ON trips FOR DELETE
  USING (auth.uid() = user_id);

-- Reservations: Users can access reservations for their trips
CREATE POLICY "Users can view own reservations"
  ON reservations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = reservations.trip_id
      AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own reservations"
  ON reservations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = reservations.trip_id
      AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own reservations"
  ON reservations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = reservations.trip_id
      AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own reservations"
  ON reservations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = reservations.trip_id
      AND trips.user_id = auth.uid()
    )
  );

-- Receipts: Users can access receipts for their trips
CREATE POLICY "Users can view own receipts"
  ON receipts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = receipts.trip_id
      AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own receipts"
  ON receipts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = receipts.trip_id
      AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own receipts"
  ON receipts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = receipts.trip_id
      AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own receipts"
  ON receipts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = receipts.trip_id
      AND trips.user_id = auth.uid()
    )
  );

-- Connected Accounts: Users can only access their own
CREATE POLICY "Users can view own connected accounts"
  ON connected_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connected accounts"
  ON connected_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connected accounts"
  ON connected_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own connected accounts"
  ON connected_accounts FOR DELETE
  USING (auth.uid() = user_id);

-- Trusted Emails: Users can only access their own
CREATE POLICY "Users can view own trusted emails"
  ON trusted_emails FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trusted emails"
  ON trusted_emails FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trusted emails"
  ON trusted_emails FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trusted emails"
  ON trusted_emails FOR DELETE
  USING (auth.uid() = user_id);

-- Notifications: Users can only access their own
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Notification Preferences: Users can only access their own
CREATE POLICY "Users can view own notification preferences"
  ON notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification preferences"
  ON notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification preferences"
  ON notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- 🆕 Push Tokens: Users can only access their own
CREATE POLICY "Users can view own push tokens"
  ON push_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own push tokens"
  ON push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own push tokens"
  ON push_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own push tokens"
  ON push_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- Chat Messages: Users can only access their own
CREATE POLICY "Users can view own chat messages"
  ON chat_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chat messages"
  ON chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 🆕 Email Parse Cache: Service role only (Edge Functions)
CREATE POLICY "Service role can access parse cache"
  ON email_parse_cache FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to automatically create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, forwarding_email)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    'plans+' || SUBSTRING(NEW.id::TEXT, 1, 8) || '@triptrack.ai'
  );
  
  -- Also create default notification preferences
  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trips_updated_at
  BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reservations_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 🆕 Function to prune old chat messages (keep last 50 per user)
CREATE OR REPLACE FUNCTION prune_old_chat_messages()
RETURNS void AS $$
BEGIN
  DELETE FROM chat_messages
  WHERE id IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
      FROM chat_messages
    ) sub
    WHERE rn > 50
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 🆕 Function to generate trip summary
CREATE OR REPLACE FUNCTION generate_trip_summary(trip_id_param UUID)
RETURNS TEXT AS $$
DECLARE
  trip_record RECORD;
  reservation_record RECORD;
  summary_text TEXT;
  reservation_count INT;
BEGIN
  -- Get trip details
  SELECT * INTO trip_record FROM trips WHERE id = trip_id_param;
  
  -- Count reservations
  SELECT COUNT(*) INTO reservation_count FROM reservations WHERE trip_id = trip_id_param;
  
  -- Build summary
  summary_text := trip_record.name || E'\n';
  
  -- Add reservations summary
  FOR reservation_record IN 
    SELECT * FROM reservations 
    WHERE trip_id = trip_id_param 
    ORDER BY start_time 
    LIMIT 5
  LOOP
    summary_text := summary_text || '• ' || reservation_record.title;
    IF reservation_record.subtitle IS NOT NULL THEN
      summary_text := summary_text || ' – ' || reservation_record.subtitle;
    END IF;
    summary_text := summary_text || E'\n';
  END LOOP;
  
  RETURN summary_text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 🆕 Trigger to auto-generate trip summary when reservations change
CREATE OR REPLACE FUNCTION update_trip_summary()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE trips 
  SET summary = generate_trip_summary(NEW.trip_id)
  WHERE id = NEW.trip_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_reservation_change_update_summary
  AFTER INSERT OR UPDATE OR DELETE ON reservations
  FOR EACH ROW EXECUTE FUNCTION update_trip_summary();

-- ============================================
-- STORAGE BUCKETS
-- ============================================

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('receipts', 'receipts', false),
  ('avatars', 'avatars', true),
  ('trip-covers', 'trip-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for receipts (private)
CREATE POLICY "Users can upload own receipts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'receipts' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own receipts"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'receipts' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own receipts"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'receipts' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies for avatars (public read, owner write)
CREATE POLICY "Anyone can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies for trip covers (public read, owner write)
CREATE POLICY "Anyone can view trip covers"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'trip-covers');

CREATE POLICY "Users can upload trip covers"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'trip-covers' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update trip covers"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'trip-covers' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete trip covers"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'trip-covers' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================
-- CRON JOBS (Supabase pg_cron extension)
-- ============================================

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 🆕 Prune old chat messages daily at 2am
SELECT cron.schedule(
  'prune-chat-messages',
  '0 2 * * *', -- daily at 2am
  $$SELECT prune_old_chat_messages()$$
);

-- 🆕 Clean up old email parse cache (older than 30 days)
SELECT cron.schedule(
  'clean-parse-cache',
  '0 3 * * *', -- daily at 3am
  $$DELETE FROM email_parse_cache WHERE created_at < NOW() - INTERVAL '30 days'$$
);

-- 🆕 Clean up expired push tokens (not used in 90 days)
SELECT cron.schedule(
  'clean-push-tokens',
  '0 4 * * 0', -- weekly on Sunday at 4am
  $$DELETE FROM push_tokens WHERE last_used < NOW() - INTERVAL '90 days'$$
);
```

## Step 4: Configure Authentication

1. Go to **Authentication** → **Providers**
2. Enable **Email** provider (already enabled by default)
3. For **Apple Sign In** (required for iOS):
   - Enable Apple provider
   - You'll need to configure this later with your Apple Developer account
   - For now, you can skip this and use email auth for testing

## Step 5: Set Up Supabase Vault (for token encryption)

1. Go to **Settings** → **Vault**
2. Create a new secret:
   - **Name:** `token_encryption_key`
   - **Value:** Your 32-character random string from `.env`
3. This will be used by Edge Functions to encrypt/decrypt OAuth tokens

## Step 6: Test the Connection

1. Make sure your `.env` file has the correct credentials
2. Restart your Expo dev server
3. The app should now connect to Supabase (though auth isn't wired up yet)

## 🎯 Key Improvements in v2.0

### 1. **Cost Optimization**
- ✅ Email parse cache prevents re-parsing same emails
- ✅ Chat message pruning (keeps last 50 per user)
- ✅ Automatic cleanup of old data via cron jobs

### 2. **Security**
- ✅ OAuth tokens encrypted at rest using pgcrypto
- ✅ Supabase Vault for encryption keys
- ✅ Service role policies for sensitive operations

### 3. **Scalability**
- ✅ Push tokens per device (not per user)
- ✅ Separate queries for trips/reservations/receipts (no over-fetching)
- ✅ Indexed for performance

### 4. **User Experience**
- ✅ Auto-generated trip summaries
- ✅ Trip summary notifications
- ✅ Automatic profile + preferences creation on signup

## Next Steps

✅ Supabase project created  
✅ Database schema deployed (v2.0 with improvements)  
✅ Storage buckets configured  
✅ Row Level Security enabled  
✅ Cron jobs scheduled  
✅ Vault configured for encryption  

**Next:** We'll implement authentication in the app and wire up the login screen.

## Troubleshooting

**Error: "Invalid API key"**
- Double-check your `.env` file has the correct `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Make sure to restart the Expo dev server after changing `.env`

**Error: "relation does not exist"**
- Make sure you ran the entire SQL script in Step 3
- Check the SQL Editor for any error messages

**Storage bucket errors**
- Make sure the storage bucket INSERT statements ran successfully
- Check **Storage** → **Policies** in Supabase dashboard

**Cron job errors**
- pg_cron extension must be enabled (included in script)
- Check **Database** → **Extensions** to verify pg_cron is active

## Useful Supabase Dashboard Links

- **SQL Editor:** Run queries and view data
- **Table Editor:** Visual interface for viewing/editing data
- **Authentication:** Manage users
- **Storage:** View uploaded files
- **Vault:** Manage secrets
- **Cron Jobs:** View scheduled tasks
- **API Docs:** Auto-generated API documentation for your schema

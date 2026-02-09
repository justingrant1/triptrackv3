# Deploy Flight Tracking Edge Functions

## Step 1: Install Supabase CLI

### Option A: Using Scoop (Recommended for Windows)
```powershell
# Install Scoop if you don't have it
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex

# Install Supabase CLI
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

### Option B: Using npm
```bash
npm install -g supabase
```

### Option C: Manual Download
Download from: https://github.com/supabase/cli/releases

## Step 2: Login to Supabase

```bash
supabase login
```

This will open a browser window to authenticate with your Supabase account.

## Step 3: Link Your Project

```bash
supabase link --project-ref jucngvlcnxjyvjxydmco
```

(Your project ref is from your SUPABASE_URL: `https://jucngvlcnxjyvjxydmco.supabase.co`)

## Step 4: Set the AirLabs API Key

```bash
supabase secrets set AIRLABS_API_KEY=your_airlabs_key_here
```

Get your key from: https://airlabs.co (free tier: 1,000 calls/month)

## Step 5: Deploy the Edge Functions

```bash
# Deploy the flight status checker
supabase functions deploy check-flight-status

# Deploy the cron fan-out function
supabase functions deploy flight-status-cron
```

## Step 6: Verify Deployment

Check the Supabase Dashboard:
1. Go to https://supabase.com/dashboard/project/jucngvlcnxjyvjxydmco/functions
2. You should see both functions listed:
   - `check-flight-status`
   - `flight-status-cron`

## Step 7: Test the Functions

### Test check-flight-status (from your app)
The app will automatically call this when you:
- Pull to refresh on a trip with flights
- View a trip detail screen with flights (background polling)

### Test flight-status-cron (manual test)
```bash
curl -X POST \
  https://jucngvlcnxjyvjxydmco.supabase.co/functions/v1/flight-status-cron \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Step 8: Set Up Cron Job (Optional - for automatic background updates)

In Supabase Dashboard → SQL Editor, run:

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule flight status checks every 15 minutes
SELECT cron.schedule(
  'flight-status-check',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jucngvlcnxjyvjxydmco.supabase.co/functions/v1/flight-status-cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Replace `YOUR_SERVICE_ROLE_KEY` with your actual service role key from:
https://supabase.com/dashboard/project/jucngvlcnxjyvjxydmco/settings/api

## Troubleshooting

### "Function not found" error
- Make sure you're logged in: `supabase login`
- Make sure you've linked the project: `supabase link --project-ref jucngvlcnxjyvjxydmco`

### "AIRLABS_API_KEY not configured" error
- Set the secret: `supabase secrets set AIRLABS_API_KEY=your_key`
- Verify it's set: `supabase secrets list`

### Edge function errors
- Check logs in Supabase Dashboard → Functions → [function name] → Logs
- Common issues:
  - Missing API key
  - Invalid flight number format
  - AirLabs API rate limit exceeded (free tier: 1,000/month)

## Alternative: Deploy via Supabase Dashboard

If CLI doesn't work, you can deploy manually:

1. Go to https://supabase.com/dashboard/project/jucngvlcnxjyvjxydmco/functions
2. Click "Create a new function"
3. Name: `check-flight-status`
4. Copy/paste the code from `supabase/functions/check-flight-status/index.ts`
5. Set `verify_jwt = true` in settings
6. Repeat for `flight-status-cron` (with `verify_jwt = false`)

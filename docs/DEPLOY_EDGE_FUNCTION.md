# How to Deploy the Updated Edge Function

Since the Supabase CLI can't be installed via npm, here are your options:

## Option 1: Deploy via Supabase Dashboard (Easiest)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **Edge Functions** in the left sidebar
4. Find the `parse-travel-email` function
5. Click on it to edit
6. Copy the entire contents of `supabase/functions/parse-travel-email/index.ts`
7. Paste it into the editor
8. Click **Deploy** or **Save**

## Option 2: Install Supabase CLI via Scoop (Windows)

```powershell
# Install Scoop if you don't have it
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression

# Install Supabase CLI
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

Then deploy:
```bash
supabase functions deploy parse-travel-email
```

## Option 3: Install via Chocolatey (Windows)

```powershell
# Install Chocolatey if you don't have it (run as Administrator)
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install Supabase CLI
choco install supabase
```

Then deploy:
```bash
supabase functions deploy parse-travel-email
```

## Option 4: Manual Deployment via API

You can also deploy using the Supabase Management API, but Option 1 (Dashboard) is much simpler.

## Recommended: Use Option 1 (Dashboard)

The easiest way is to just copy/paste the code into the Supabase Dashboard. It takes 30 seconds and doesn't require any CLI installation.

## After Deployment

Once deployed, test it by:
1. Getting your forwarding address from the app (on the Add Trip screen)
2. Forwarding a travel confirmation email to that address
3. Checking if the trip appears in your app

## Cloudflare Setup

Don't forget to enable catch-all routing in Cloudflare:
1. Go to Cloudflare Dashboard → Email Routing
2. Enable catch-all routing for `*@triptrack.ai`
3. Route all emails to your Worker

This allows addresses like `plans+abc123@triptrack.ai` to work.

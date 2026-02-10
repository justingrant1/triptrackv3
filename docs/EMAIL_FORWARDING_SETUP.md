# 📧 Email Forwarding Setup Guide

**Complete guide to set up email forwarding with AI parsing for TripTrack**

---

## 🎯 Overview

This guide will help you set up the complete email forwarding pipeline so users can forward travel confirmation emails to `plans@triptrack.ai` and have trips automatically created.

**Architecture:**
```
User forwards email → SendGrid/Mailgun → Supabase Edge Function → AI Parsing → Trip Created → Push Notification
```

---

## 📋 Prerequisites

- ✅ Supabase project set up
- ✅ OpenAI API key
- ✅ Domain name (e.g., `triptrack.ai`)
- ✅ SendGrid or Mailgun account
- ✅ Supabase CLI installed

---

## 🚀 Step 1: Deploy Supabase Edge Function

### 1.1 Install Supabase CLI

```bash
# macOS/Linux
brew install supabase/tap/supabase

# Windows
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Or via npm
npm install -g supabase
```

### 1.2 Login to Supabase

```bash
supabase login
```

### 1.3 Link to Your Project

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Find your project ref in Supabase Dashboard → Settings → General → Reference ID

### 1.4 Set Environment Variables

```bash
# Set OpenAI API key
supabase secrets set OPENAI_API_KEY=your_openai_api_key_here

# Supabase URL and service key are automatically available
```

### 1.5 Deploy the Function

```bash
supabase functions deploy parse-travel-email
```

### 1.6 Get the Function URL

After deployment, you'll get a URL like:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/parse-travel-email
```

**Save this URL** - you'll need it for the webhook configuration.

---

## 📨 Step 2: Choose Email Service (SendGrid or Mailgun)

### Option A: SendGrid (Recommended)

#### 2.1 Create SendGrid Account
- Go to https://sendgrid.com
- Sign up for free account (100 emails/day free)

#### 2.2 Verify Your Domain
1. Go to Settings → Sender Authentication
2. Click "Authenticate Your Domain"
3. Enter your domain (e.g., `triptrack.ai`)
4. Add the DNS records SendGrid provides to your domain registrar

#### 2.3 Set Up Inbound Parse
1. Go to Settings → Inbound Parse
2. Click "Add Host & URL"
3. Configure:
   - **Subdomain:** `plans` (creates `plans@triptrack.ai`)
   - **Domain:** `triptrack.ai`
   - **Destination URL:** Your Supabase function URL from Step 1.6
   - **Check:** "POST the raw, full MIME message"
4. Click "Add"

#### 2.4 Add MX Record
Add this MX record to your DNS:
```
Type: MX
Host: plans
Value: mx.sendgrid.net
Priority: 10
TTL: 3600
```

---

### Option B: Mailgun

#### 2.1 Create Mailgun Account
- Go to https://mailgun.com
- Sign up (5,000 emails/month free for 3 months)

#### 2.2 Add Your Domain
1. Go to Sending → Domains
2. Click "Add New Domain"
3. Enter `triptrack.ai`
4. Add the DNS records Mailgun provides

#### 2.3 Set Up Route
1. Go to Sending → Routes
2. Click "Create Route"
3. Configure:
   - **Expression Type:** Match Recipient
   - **Recipient:** `plans@triptrack.ai`
   - **Actions:** 
     - Forward to URL: Your Supabase function URL
     - Check "POST"
4. Save

#### 2.4 Add MX Record
Add this MX record to your DNS:
```
Type: MX
Host: plans
Value: mxa.mailgun.org
Priority: 10
TTL: 3600
```

---

## 🔐 Step 3: Set Up Trusted Emails Table

The edge function checks if the sender is in the `trusted_emails` table before processing.

### 3.1 Verify Table Exists

Run this SQL in Supabase SQL Editor:

```sql
-- Check if table exists
SELECT * FROM trusted_emails LIMIT 1;
```

If it doesn't exist, create it:

```sql
CREATE TABLE trusted_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, email)
);

-- Enable RLS
ALTER TABLE trusted_emails ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own trusted emails
CREATE POLICY "Users can view own trusted emails"
  ON trusted_emails FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own trusted emails
CREATE POLICY "Users can insert own trusted emails"
  ON trusted_emails FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own trusted emails
CREATE POLICY "Users can delete own trusted emails"
  ON trusted_emails FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX idx_trusted_emails_email ON trusted_emails(email);
CREATE INDEX idx_trusted_emails_user_verified ON trusted_emails(user_id, verified);
```

### 3.2 Add Your Email as Trusted

For testing, add your email:

```sql
INSERT INTO trusted_emails (user_id, email, verified)
VALUES (
  'YOUR_USER_ID_HERE',  -- Get from auth.users table
  'your-email@gmail.com',
  true  -- Set to true for testing
);
```

---

## 🧪 Step 4: Test the Pipeline

### 4.1 Test the Edge Function Directly

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/parse-travel-email \
  -H "Content-Type: application/json" \
  -d '{
    "from": "your-email@gmail.com",
    "text": "Your flight confirmation for AA 182 from LAX to JFK on March 15, 2026 at 10:00 AM. Confirmation: ABC123"
  }'
```

Expected response:
```json
{
  "success": true,
  "trip_id": "uuid-here",
  "trip_name": "Los Angeles to New York Trip",
  "reservations_count": 1
}
```

### 4.2 Test Email Forwarding

1. Forward a real travel confirmation email to `plans@triptrack.ai`
2. Check Supabase logs:
   ```bash
   supabase functions logs parse-travel-email
   ```
3. Check your app - the trip should appear!

---

## 🔍 Step 5: Monitoring & Debugging

### 5.1 View Function Logs

```bash
# Real-time logs
supabase functions logs parse-travel-email --follow

# Recent logs
supabase functions logs parse-travel-email --limit 50
```

### 5.2 Common Issues

**Issue: "Email from untrusted sender"**
- Solution: Add the sender's email to `trusted_emails` table with `verified=true`

**Issue: "No JSON found in AI response"**
- Solution: Email format might be unusual. Check logs to see what AI returned.
- Try with a different travel email format.

**Issue: "Failed to create trip"**
- Solution: Check Supabase RLS policies allow inserts for the user.

**Issue: Webhook not receiving emails**
- Solution: 
  - Verify DNS records are propagated (use `dig plans.triptrack.ai MX`)
  - Check SendGrid/Mailgun dashboard for delivery logs
  - Ensure function URL is correct and publicly accessible

### 5.3 Test DNS Propagation

```bash
# Check MX record
dig plans.triptrack.ai MX

# Should show:
# plans.triptrack.ai. 3600 IN MX 10 mx.sendgrid.net.
```

---

## 💰 Cost Estimates

### SendGrid
- **Free Tier:** 100 emails/day
- **Essentials:** $19.95/mo for 50K emails/month
- **Pro:** $89.95/mo for 100K emails/month

### Mailgun
- **Free Trial:** 5,000 emails/month for 3 months
- **Foundation:** $35/mo for 50K emails/month
- **Growth:** $80/mo for 100K emails/month

### Supabase Edge Functions
- **Free Tier:** 500K invocations/month
- **Pro:** $25/mo for 2M invocations/month

### OpenAI (GPT-4o-mini)
- **Cost:** ~$0.15 per 1M input tokens, $0.60 per 1M output tokens
- **Per email:** ~$0.001 (very cheap!)
- **1000 emails:** ~$1

**Total for 1000 emails/month:** ~$20-40/mo (mostly SendGrid/Mailgun)

---

## 🔒 Security Best Practices

### 1. Email Verification
Always verify trusted emails before allowing forwarding:

```sql
-- Only process verified emails
UPDATE trusted_emails 
SET verified = true 
WHERE id = 'email-id-here';
```

### 2. Rate Limiting
Add rate limiting to prevent abuse:

```typescript
// In edge function
const MAX_EMAILS_PER_DAY = 50;

const { count } = await supabase
  .from('trips')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', userId)
  .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

if (count && count >= MAX_EMAILS_PER_DAY) {
  throw new Error('Daily email limit reached');
}
```

### 3. Webhook Authentication
Add a secret token to verify requests:

```typescript
// In edge function
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET');
const providedSecret = req.headers.get('x-webhook-secret');

if (providedSecret !== WEBHOOK_SECRET) {
  throw new Error('Invalid webhook secret');
}
```

Then configure in SendGrid/Mailgun to send the header.

---

## 📊 Success Metrics

Track these metrics to ensure the pipeline is working:

1. **Email Processing Rate:** % of emails successfully parsed
2. **AI Accuracy:** % of trips created correctly
3. **User Adoption:** # of users with trusted emails set up
4. **Error Rate:** % of failed email processing attempts

Query for metrics:

```sql
-- Emails processed today
SELECT COUNT(*) FROM trips 
WHERE created_at >= CURRENT_DATE;

-- Success rate (trips with reservations)
SELECT 
  COUNT(DISTINCT t.id) as trips_with_reservations,
  (SELECT COUNT(*) FROM trips WHERE created_at >= CURRENT_DATE) as total_trips
FROM trips t
JOIN reservations r ON r.trip_id = t.id
WHERE t.created_at >= CURRENT_DATE;
```

---

## 🎉 You're Done!

Your email forwarding pipeline is now live! Users can:

1. Add their email to trusted emails in the app
2. Forward travel confirmations to `plans@triptrack.ai`
3. Watch trips appear automatically with AI-extracted details
4. Get push notifications when trips are added

---

## 🆘 Support

If you encounter issues:

1. Check function logs: `supabase functions logs parse-travel-email`
2. Verify DNS records: `dig plans.triptrack.ai MX`
3. Test with curl (Step 4.1)
4. Check SendGrid/Mailgun delivery logs
5. Verify trusted_emails table has correct data

---

## 📚 Additional Resources

- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [SendGrid Inbound Parse Docs](https://docs.sendgrid.com/for-developers/parsing-email/setting-up-the-inbound-parse-webhook)
- [Mailgun Routes Docs](https://documentation.mailgun.com/en/latest/user_manual.html#routes)
- [OpenAI API Docs](https://platform.openai.com/docs/api-reference)

---

*Last Updated: February 6, 2026*

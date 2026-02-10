# Email Forwarding Security Fix

## Problem Identified

The previous trusted email system had a critical security vulnerability:
- Multiple users could add the same email as "trusted"
- User A could add User B's email and receive User B's trips
- No verification that the email owner consented to being "trusted"

## Solution: Token-Based Forwarding

Each user now gets a **unique forwarding address** that only they know. The address itself authenticates the user.

### How It Works

**Before (Insecure):**
```
1. User forwards email to plans@triptrack.ai
2. System looks up sender email in trusted_emails table
3. Creates trip for that user
❌ Problem: Anyone can add any email as trusted
```

**After (Secure):**
```
1. User forwards email to plans+abc123@triptrack.ai
                                    ^^^^^^
                              Their unique token
2. System extracts token from recipient address
3. Looks up user by token in profiles table
4. Creates trip for that user
✅ Secure: Only the user who knows their token can use it
```

## Database Migration Required

You need to add a `forwarding_token` column to the `profiles` table:

```sql
-- Add forwarding_token column to profiles
ALTER TABLE profiles 
ADD COLUMN forwarding_token TEXT UNIQUE;

-- Generate unique tokens for existing users
UPDATE profiles 
SET forwarding_token = encode(gen_random_bytes(8), 'hex')
WHERE forwarding_token IS NULL;

-- Make it NOT NULL after populating
ALTER TABLE profiles 
ALTER COLUMN forwarding_token SET NOT NULL;

-- Create index for fast lookups
CREATE INDEX idx_profiles_forwarding_token ON profiles(forwarding_token);
```

### To run this migration:

1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Paste the SQL above
4. Click "Run"

## Code Changes Made

### 1. Supabase Edge Function (`supabase/functions/parse-travel-email/index.ts`)

**Changed from:**
- Looking up sender email in `trusted_emails` table
- Using `.single()` which fails if multiple users have same email

**Changed to:**
- Extracting token from recipient address (`plans+TOKEN@triptrack.ai`)
- Looking up user by `forwarding_token` in `profiles` table
- Secure and unique per user

### 2. Token Extraction Logic

The function now supports multiple formats:
- `plans+abc123@triptrack.ai` (plus-addressing)
- `abc123@triptrack.ai` (direct addressing)

### 3. Error Messages

Updated error messages to guide users to use their unique address.

## Next Steps (To Complete)

### 1. Update Profile Hook

Add a function to generate/fetch the user's forwarding token:

```typescript
// src/lib/hooks/useProfile.ts
export function useForwardingAddress() {
  const { user } = useAuthStore();
  
  return useQuery({
    queryKey: ['forwarding-address', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('profiles')
        .select('forwarding_token')
        .eq('id', user.id)
        .single();
      
      if (error) throw error;
      
      return `plans+${data.forwarding_token}@triptrack.ai`;
    },
    enabled: !!user,
  });
}
```

### 2. Update App UI

Show the user their unique forwarding address in the app:
- Profile screen
- "How to Add Trips" screen
- Onboarding flow

Example UI:
```
📧 Your Forwarding Address
plans+abc123@triptrack.ai

Forward your travel confirmation emails to this address 
to automatically add trips to TripTrack.
```

### 3. Cloudflare Email Routing Setup

Enable **catch-all** routing in Cloudflare:
1. Go to Cloudflare Dashboard → Email Routing
2. Enable catch-all routing for `*@triptrack.ai`
3. Route all emails to your Worker

This allows `plans+anything@triptrack.ai` to work.

## Security Benefits

✅ **No more shared emails** — each user has a unique address  
✅ **No verification needed** — the token itself is the authentication  
✅ **Works with any sender** — user can forward from any email account  
✅ **Simple** — less code, fewer database tables  
✅ **Scalable** — no conflicts between users  

## Trusted Emails Table

The `trusted_emails` table can now be:
- **Removed entirely** (simplest)
- **Repurposed as spam filter** (optional) — only process emails from these senders

## Testing

After deploying:

1. Run the SQL migration
2. Deploy the updated Edge Function
3. Get your forwarding address from the app
4. Forward a travel confirmation email to it
5. Verify the trip is created in your account

## Rollback Plan

If needed, you can revert to the old system by:
1. Reverting the Edge Function code
2. Keeping the `forwarding_token` column (it won't hurt)
3. Re-enabling trusted emails

But the new system is more secure and should be kept.

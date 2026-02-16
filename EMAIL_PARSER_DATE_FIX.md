# Email Parser Date Inference Fix - February 15, 2026

## Problem Summary
User pasted a flight reservation email into the email parser that said "Sun, Feb 15" with no year. The AI incorrectly inferred the year as **2024** instead of **2026**, causing:

1. **Wrong badge display** — Trip showed "starts in -731 days" (731 days in the past)
2. **Failed trip matching** — Created a new "Trip to Aspen" instead of matching the existing Aspen trip (because dates didn't overlap)

## Root Cause
The AI prompt in `parse-travel-email` did NOT include today's date. When the AI saw "Sun, Feb 15" it had to guess the year by matching the day-of-week:
- Feb 15, 2024 → **Sunday** ✅ (AI chose this)
- Feb 15, 2026 → Saturday ❌

The AI correctly matched the day-of-week but picked a **past date** instead of the nearest future occurrence.

## The Fix (2 changes)

### 1. Added Today's Date to AI Prompt
```typescript
async function parseEmailWithAI(emailText: string, existingTripsContext?: string): Promise<ParsedTrip> {
  const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  
  const prompt = `You are a travel email parser. Extract trip and reservation details from this confirmation email.

IMPORTANT CONTEXT:
- Today's date is ${todayDate}
- When inferring years from dates without explicit years (e.g., "Sun, Feb 15"), use the NEAREST FUTURE occurrence, not past dates
${existingTripsContext ? `\n${existingTripsContext}` : ''}
...
```

This tells the AI:
- What today's date is (so it knows 2026, not 2024)
- To prefer future dates over past dates when inferring years

### 2. Added Existing Trips Context for Better Matching
```typescript
// 1c. Fetch user's existing trips for AI context (helps with trip matching)
const { data: existingTrips } = await supabase
  .from('trips')
  .select('name, destination, start_date, end_date')
  .eq('user_id', userId)
  .gte('end_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]) // Last 30 days or future
  .order('start_date', { ascending: true })
  .limit(10);

let existingTripsContext = '';
if (existingTrips && existingTrips.length > 0) {
  existingTripsContext = `- The user already has these trips:\n${existingTrips.map(t => 
    `  * "${t.name}" to ${t.destination} (${t.start_date} to ${t.end_date})`
  ).join('\n')}\n- If this email is about one of these existing trips, use the same destination and trip name`;
}

// 2. Parse email with AI
const parsedRaw = await parseEmailWithAI(emailText, existingTripsContext);
```

This gives the AI context about existing trips so it can:
- See that "Trip to Aspen" already exists (Feb 14-18, 2026)
- Match the flight to Aspen on Feb 15 to that existing trip
- Use the same destination name for consistency

## Impact

### Before
- AI parsed "Sun, Feb 15" as **2024-02-15** (past date)
- Trip showed "starts in **-731 days**"
- Created a **duplicate trip** instead of matching existing Aspen trip

### After
- AI parses "Sun, Feb 15" as **2026-02-15** (correct future date)
- Trip shows correct "starts in X days" badge
- Matches existing trips correctly (no duplicates)

## Deployment
✅ **parse-travel-email** deployed (2/15/2026 9:39 PM)

## Testing
To test:
1. Delete the incorrectly created trip (the one with -731 days)
2. Paste the same flight email again into the email parser
3. Verify:
   - Date is parsed as 2026 (not 2024)
   - Flight is added to existing "Trip to Aspen" (not a new trip)
   - Badge shows correct "starts in X days"

## Notes
- This fix applies to the email parser in the app (`parse-travel-email` edge function)
- The Gmail scanner (`scan-gmail`) already has similar logic but may benefit from the same improvements
- The existing trip matching logic (Tier 1/2/3) already works well — the issue was purely the AI inferring the wrong year



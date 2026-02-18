# Timezone Fix — Cross-Timezone Tracking

## Problem

When tracking someone traveling in a distant timezone (e.g., Bali UTC+8 from New York UTC-5), several issues occurred:

1. **Today tab not showing events**: A hotel check-in on Feb 17 in Bali wouldn't show on the Today tab because it was still Feb 16 in New York
2. **Flight API date mismatch**: The flight status API (AirLabs) might return wrong-date data because the stored date was off by a day due to timezone conversion
3. **Times displayed incorrectly**: A flight departing at 11:00 AM Tokyo time would show as 9:00 PM or 2:00 AM depending on how the timezone was interpreted

### Root Cause

Times were stored as timezone-naive strings (e.g., `2026-02-17T11:00:00`) which JavaScript interprets differently depending on the runtime:
- **Hermes (React Native)**: Treats as UTC → 11:00 UTC
- **V8 (Deno edge functions)**: Treats as UTC → 11:00 UTC  
- **Safari**: Treats as local time → 11:00 EST

This meant a Tokyo 11:00 AM departure was stored as `2026-02-17T11:00:00` but interpreted as 11:00 UTC (which is 8:00 PM Tokyo time — wrong by 9 hours).

## Solution: UTC at Ingestion + Local Time Preservation

### Architecture

```
Email arrives → AI Parser extracts:
  - Local time: "11:00" 
  - Timezone: "+09:00" (Tokyo)
  - Converts to UTC: "2026-02-17T02:00:00.000Z"
  
Stored in database:
  - start_time: "2026-02-17T02:00:00.000Z"  (UTC — for comparisons)
  - details['Local Start Time']: "2026-02-17T11:00:00"  (for display)
  - details['Departure Timezone']: "+09:00"  (for timezone-aware logic)
```

### Changes Made

#### 1. Email Parser (`supabase/functions/parse-travel-email/index.ts`)
- AI prompt now requests timezone offsets for all locations
- New `convertToUTC()` function converts local times to UTC at ingestion
- Stores original local times in `details['Local Start Time']` and `details['Local End Time']`
- Stores timezone offsets in `details['Departure Timezone']`, `details['Arrival Timezone']`, `details['Location Timezone']`

#### 2. Client Utils (`src/lib/utils.ts`)
- New `getLocalTimeISO()` helper retrieves stored local time for display
- `isReservationToday()` / `isReservationTomorrow()` now timezone-aware:
  - Uses event's timezone to determine "today" at the event location
  - A Feb 17 Bali event shows as "today" when it's Feb 17 in Bali, even if it's Feb 16 in New York
- `getContextualTimeInfo()` uses `getLocalTimeISO()` for display times
- Removed 100+ line `AIRPORT_TIMEZONE_OFFSETS` lookup table (AI provides offsets directly)

#### 3. Flight Status Checker (`supabase/functions/check-flight-status/index.ts`)
- `getDepTimeUTC()` now detects proper UTC strings (with Z suffix) and parses directly
- `isCorrectFlightDate()` uses local date from `details['Local Start Time']` for comparison with API's local departure date
- Legacy fallback chain preserved for old data

### How It Works — Example

**Flight: GA881, Tokyo NRT → Bali DPS, Feb 17 at 11:00 AM JST**

**At ingestion:**
- AI extracts: departure 11:00, timezone +09:00
- `convertToUTC("2026-02-17T11:00:00", "+09:00")` → `"2026-02-17T02:00:00.000Z"`
- Stored: `start_time = "2026-02-17T02:00:00.000Z"`
- Stored: `details['Local Start Time'] = "2026-02-17T11:00:00"`
- Stored: `details['Departure Timezone'] = "+09:00"`

**On the Today tab (user in New York, Feb 16 at 8 PM EST):**
- `isReservationToday()` checks:
  - Local date from details: `2026-02-17`
  - Current date in event timezone (+09:00): Feb 17 ✓ → Shows as "Today"!
- Display time: `getLocalTimeISO()` → `"2026-02-17T11:00:00"` → "11:00 AM"

**Flight status API check:**
- `getDepTimeUTC()` sees Z suffix → parses directly → correct UTC instant
- `isCorrectFlightDate()` compares API local date with stored local date → match ✓

### Backward Compatibility

All changes are backward-compatible with existing data:
- `getLocalTimeISO()` falls back to `start_time` if no local time in details
- `isReservationToday()` falls back to device timezone if no event timezone
- `getDepTimeUTC()` falls back to timezone offset lookup → airport code lookup → naive parse
- Old reservations continue to work; new ones get the improved UTC handling

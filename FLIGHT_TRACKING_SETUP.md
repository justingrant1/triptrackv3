# Flight Tracking & Live Status — Setup Guide

## Overview

TripTrack now includes real-time flight tracking powered by AirLabs API. The system provides:

- **Live flight status**: On time, delayed, cancelled, diverted, in flight, landed
- **Gate & terminal updates**: Departure gate, terminal, arrival gate
- **Baggage carousel info**: Which carousel to pick up bags
- **Delay tracking**: How many minutes late, with color-coded severity
- **iOS push notifications**: Gate changes, delays, cancellations, diversions
- **Tiered polling**: Smart polling intervals based on flight proximity
- **Pull-to-refresh**: Manual refresh on trip detail screen

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Client (React Native / Expo)                           │
│                                                         │
│  useFlightStatusPolling() ──→ check-flight-status       │
│  useRefreshFlightStatus() ──→ (edge function)           │
│  FlightStatusBar component                              │
│  CompactFlightStatus component                          │
└──────────────────────┬──────────────────────────────────┘
                       │ Supabase Functions Invoke
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Supabase Edge Function: check-flight-status            │
│                                                         │
│  Modes:                                                 │
│  • validate  — check flight number, return details      │
│  • reservation — check single flight                    │
│  • trip      — check all flights in a trip              │
│  • user      — check all upcoming flights for a user    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ AirLabs API (server-side only)                  │    │
│  │ GET /api/v9/flight?flight_iata=AA182            │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  Change Detection:                                      │
│  • Compares old vs new status data                      │
│  • Detects: gate, terminal, delay, status, time,        │
│    baggage, cancellation, diversion changes              │
│  • Creates notification records + sends push             │
│                                                         │
│  Storage:                                               │
│  • Updates reservation.details._flight_status            │
│  • Updates reservation.status (delayed/cancelled)        │
│  • Updates reservation.alert_message                     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Supabase Edge Function: flight-status-cron             │
│                                                         │
│  Runs every 15 minutes via Supabase cron                │
│  Finds all flights departing in next 48h                │
│  Groups by user, invokes check-flight-status per user   │
│  Applies tiered polling to avoid unnecessary API calls  │
└─────────────────────────────────────────────────────────┘
```

## Tiered Polling Strategy

| Time to Departure | Polling Interval |
|---|---|
| > 24 hours | Every 6 hours |
| 4–24 hours | Every 1 hour |
| 1–4 hours | Every 15 minutes |
| < 1 hour (boarding) | Every 5 minutes |
| In flight | Every 5 minutes |
| Landed (waiting for baggage) | Every 5 minutes |
| Landed + baggage assigned | Stop |
| Cancelled / Incident | Stop |

## Setup Steps

### 1. Get AirLabs API Key

1. Go to https://airlabs.co and create a free account
2. The free tier includes 1,000 API calls/month
3. Copy your API key

### 2. Set Environment Variables

Add to your Supabase project secrets:

```bash
supabase secrets set AIRLABS_API_KEY=your_airlabs_api_key_here
```

### 3. Deploy Edge Functions

```bash
# Deploy the flight status checker
supabase functions deploy check-flight-status

# Deploy the cron fan-out function
supabase functions deploy flight-status-cron
```

### 4. Set Up Cron Job (Optional — for background polling)

In the Supabase Dashboard → Database → Extensions, enable `pg_cron`.

Then run this SQL to schedule the cron:

```sql
-- Run flight status cron every 15 minutes
SELECT cron.schedule(
  'flight-status-check',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/flight-status-cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Replace `YOUR_PROJECT_REF` and `YOUR_SERVICE_ROLE_KEY` with your actual values.

### 5. Database: Add `delayed` Status (if not already present)

The reservation status enum may need updating:

```sql
-- Check if 'delayed' is already in the enum
-- If not, add it:
ALTER TYPE reservation_status ADD VALUE IF NOT EXISTS 'delayed';
```

### 6. Database: Ensure Notifications Table Exists

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL DEFAULT 'confirmation',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast user queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read) WHERE read = false;

-- RLS policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);
```

## Files Created/Modified

### New Files
- `src/lib/flight-status.ts` — Client-side types, utilities, edge function callers
- `src/lib/hooks/useFlightStatus.ts` — React Query hooks for flight tracking
- `src/components/FlightStatusBar.tsx` — Visual flight status component (full + compact)
- `supabase/functions/check-flight-status/index.ts` — Main edge function
- `supabase/functions/flight-status-cron/index.ts` — Cron fan-out function

### Modified Files
- `src/app/trip/[id].tsx` — Added FlightStatusBar to reservation cards, pull-to-refresh, background polling

## How It Works

### When a user adds a flight reservation:
1. The flight number is extracted from the title (e.g., "AA 182")
2. On the trip detail screen, the polling hook starts checking based on departure time
3. The edge function calls AirLabs, compares with previous data, detects changes
4. Changes are stored in `reservation.details._flight_status`
5. The FlightStatusBar component renders the live data

### When a change is detected:
1. The edge function compares old vs new flight data
2. Changes are categorized by severity (info, warning, critical)
3. Warning/critical changes create notification records in Supabase
4. Push notifications are sent via Expo Push API
5. The reservation's `alert_message` is updated with the most important change
6. The reservation's `status` is updated (e.g., to "delayed" or "cancelled")

### Push Notification Types:
- **Gate Change**: "AA182 — Gate changed from B12 to C7"
- **Delay**: "AA182 — Flight delayed 45 minutes"
- **Cancellation**: "AA182 — Flight has been cancelled"
- **Diversion**: "AA182 — Flight has been diverted"
- **Terminal Change**: "AA182 — Terminal changed from 1 to 3"

## AirLabs API Notes

- Free tier: 1,000 calls/month
- Paid plans available for higher volume
- Real-time data for most major airlines
- Returns: status, gates, terminals, delays, baggage, aircraft type
- API docs: https://airlabs.co/docs/flight

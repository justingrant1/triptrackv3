# TripTrack Notification System

## Overview

Complete push notification and local reminder system for flight status updates, gate changes, delays, and trip reminders.

## Architecture

### Push Notifications (Server → Device)
- **Expo Push Notifications** via `expo-notifications`
- Push token registered on app launch → saved to `profiles.push_token` in Supabase
- Server-side edge function `check-flight-status` sends push notifications when flight status changes
- Respects user notification preferences from `notification_preferences` table

### Local Reminders (On-Device)
- Scheduled locally using `expo-notifications` date triggers
- **Deduplication system** using AsyncStorage to track scheduled notification IDs per entity
- Automatically rescheduled when reservations/trips are created or updated
- Automatically cancelled when reservations/trips are deleted

### Notification Inbox (Supabase-backed)
- `notifications` table stores all notifications with 30-day retention
- Real-time queries via React Query with 30-second polling
- Unread count badge on bell icon (Today tab header)
- Mark as read, mark all read, delete individual notifications
- Tap notification → navigate to associated trip

## Files Modified/Created

### New Files
- `src/lib/hooks/useNotifications.ts` — React Query hooks for notification CRUD
- `NOTIFICATION_SYSTEM.md` — This documentation

### Modified Files
- `src/lib/notifications.ts` — Added smart reminder deduplication system
- `src/app/notifications.tsx` — Rewrote with real Supabase data (was mock)
- `src/app/_layout.tsx` — Push token registration + notification listeners
- `src/app/(tabs)/index.tsx` — Unread badge on bell icon
- `src/lib/hooks/useReservations.ts` — Auto-schedule/cancel reminders on CRUD
- `src/lib/hooks/useTrips.ts` — Auto-schedule/cancel reminders on CRUD
- `app.json` — Added expo-notifications plugin config
- `supabase/functions/check-flight-status/index.ts` — Push notifications + preference checks

## Reminder Schedule

| Type    | Reminder 1      | Reminder 2       |
|---------|-----------------|------------------|
| Flight  | 24h before      | 3h before        |
| Hotel   | 4h before       | —                |
| Car     | 2h before       | —                |
| Train   | 2h before       | —                |
| Event   | 1h before       | —                |
| Trip    | 24h before      | 2h before        |

## Supabase Tables Required

### `notifications`
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('gate_change', 'delay', 'cancellation', 'reminder', 'confirmation', 'trip_summary')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
  reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notifications" ON notifications FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role can insert" ON notifications FOR INSERT WITH CHECK (true);
```

### `profiles` (add column)
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_token TEXT;
```

### `notification_preferences`
```sql
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  flight_updates BOOLEAN DEFAULT true,
  gate_changes BOOLEAN DEFAULT true,
  delays BOOLEAN DEFAULT true,
  trip_reminders BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

## Deployment Checklist

- [ ] Run SQL migrations for `notifications` table
- [ ] Add `push_token` column to `profiles`
- [ ] Deploy `check-flight-status` edge function
- [ ] Deploy `flight-status-cron` edge function
- [ ] Set `AVIATIONSTACK_API_KEY` secret in Supabase
- [ ] Build new app binary with `expo-notifications` plugin
- [ ] Test push notifications on physical device

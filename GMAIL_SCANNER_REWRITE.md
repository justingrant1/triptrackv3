# Gmail Scanner Rewrite — Implementation Guide

## Overview
Complete rewrite of `supabase/functions/scan-gmail/index.ts` to make trip detection smarter, scan PDF attachments, and avoid duplicates.

---

## Phase 1: Core Infrastructure (Imports, Types, Constants)
**Status:** ✅ COMPLETE

### What was done:
- Added imports (serve, createClient)
- Added CORS headers
- Added TypeScript interfaces: GmailMessage, GmailMessageDetail, PdfAttachmentInfo, ClassificationResult, ParsedTripData, ScanStats
- Added `KNOWN_TRAVEL_DOMAINS` Set with 130+ domains (airlines, hotels, booking platforms, car rentals, rail, cruises, corporate travel)
- Added `isKnownTravelSender()` helper that extracts domain from From header and checks both exact and parent domain (handles subdomains like email.delta.com)

---

## Phase 2: Smarter Gmail Search Query
**Status:** ✅ COMPLETE

### What was done:
- Built search query with 28 travel-specific subject phrases (boarding pass, flight confirmation, hotel reservation, etc.)
- Added known-sender + generic keyword combo (confirmation from delta.com = OK, confirmation from opentable.com = filtered)
- Added negative exclusions: unsubscribe, invitation, coupon, sale, promo, newsletter, digest, weekly, survey, rate your, how was, leave a review, earn points, special offer, limited time
- Added label exclusions: -label:spam -label:promotions
- Kept 6-month date filter, max 50 results

---

## Phase 3: Recursive Email Body Extraction
**Status:** ✅ COMPLETE

### What was done:
- Created `decodeBase64Url()` with try-catch error handling
- Created `stripHtml()` — removes style/script blocks, strips tags, decodes HTML entities, collapses whitespace
- Created `extractEmailBody()` — recursively walks entire MIME parts tree, collects text/plain and text/html at any depth, prefers plain text
- Created `findPdfAttachments()` — recursively finds PDF parts with attachmentId, skips >10MB
- Created `getGmailMessage()` — fetches full email with headers, recursive body, and attachment info

---

## Phase 4: PDF Attachment Detection & Extraction
**Status:** ✅ COMPLETE

### What was done:
- Created `downloadAttachment()` — calls Gmail attachment API, converts base64url to standard base64
- Created `extractTextFromPdf()` — sends PDF to GPT-4o vision for text extraction, max_tokens 2000, temperature 0
- Only processes first PDF per email
- Graceful fallback — returns empty string on any failure

---

## Phase 5: Two-Stage AI Classification
**Status:** ✅ COMPLETE

### What was done:
- Created `classifyEmail()` — Stage 1 cheap filter using GPT-4o-mini
- Detailed system prompt defining what IS a real trip vs what is NOT (local restaurants, events, ride-share, newsletters, marketing, loyalty, price alerts, review requests, etc.)
- Returns { is_real_trip, confidence, rejection_reason }
- Threshold: is_real_trip === true AND confidence >= 0.7
- Settings: temperature 0, max_tokens 100, response_format json_object
- Graceful fallback on API errors (lets email through)

---

## Phase 6: Improved Full AI Extraction (Stage 2)
**Status:** ✅ COMPLETE

### What was done:
- Rewrote `parseEmailWithAI()` with today's date for relative date resolution
- PDF text appended with "--- ATTACHED DOCUMENT CONTENT ---" separator
- Enhanced extraction schema with type-specific fields (flights, hotels, car rentals, trains, cruises)
- Handles multi-segment trips (outbound + return = full date range)
- Uses null for missing fields, not empty strings
- Content truncated to 8000 chars to avoid token limits

---

## Phase 7: Deduplication & Message Tracking
**Status:** ✅ COMPLETE

### What was done:
- Created `markMessageProcessed()` — upserts to processed_gmail_messages with status
- Status values: "processed", "rejected_by_classifier", "parse_no_travel_data", "past_trip", "error"
- Created `isMessageProcessed()` — uses maybeSingle() instead of single()
- Created `isDuplicateReservation()` — checks by confirmation_number first, then by type + start_time
- Added SQL for processed_gmail_messages table creation in file header comment

---

## Phase 8: Trip Management Improvements
**Status:** ✅ COMPLETE

### What was done:
- Created `isTripTooOld()` — checks if trip ended 7+ days ago
- Created `findOrCreateTrip()` — finds existing trip by destination + overlapping dates, or creates new one
- Trip date expansion — when reservation extends beyond existing trip dates, updates trip start/end
- Better error handling — marks failed messages as "error" status

---

## Phase 9: Main Handler & Stats
**Status:** ✅ COMPLETE

### What was done:
- Complete processing flow: auth → get account → search Gmail → for each message: check processed → fetch → classify → extract PDF → parse → filter past → find/create trip → dedup → insert reservation → mark processed
- Returns detailed stats: messagesScanned, skippedAlreadyProcessed, skippedByClassifier, skippedPastTrips, emailsProcessed, tripsCreated, reservationsCreated, pdfAttachmentsProcessed, duplicatesSkipped, errors
- Maps car_rental type to car for database compatibility

---

## Phase 10: Verify Trip Sorting
**Status:** ✅ COMPLETE (No changes needed)

### Verified:
- `useTrips()` sorts by start_date descending (most recent first) ✅
- `useUpcomingTrips()` sorts by start_date ascending (soonest first) ✅

---

## Database Prerequisite
The `processed_gmail_messages` table must exist in Supabase:
```sql
CREATE TABLE IF NOT EXISTS processed_gmail_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  gmail_message_id text NOT NULL,
  status text NOT NULL DEFAULT 'processed',
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, gmail_message_id)
);

CREATE INDEX idx_processed_gmail_user_message 
  ON processed_gmail_messages(user_id, gmail_message_id);
```

## Summary of Changes
| File | Change |
|------|--------|
| `supabase/functions/scan-gmail/index.ts` | Complete rewrite — smart search, 2-stage AI, PDF extraction, dedup, message tracking |
| `src/lib/hooks/useTrips.ts` | No changes needed — sorting already correct |

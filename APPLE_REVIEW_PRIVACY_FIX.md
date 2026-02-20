# Apple Review Privacy Fix — Guidelines 5.1.1(i) & 5.1.2(i)

**Date:** February 19, 2026  
**Submission ID:** e2ff716a-75eb-4842-9371-79337581b004  
**Issue:** App shares user data with third-party AI service (OpenAI) without proper disclosure and consent

## Problem

Apple rejected the app because it sends user data to OpenAI without:
1. Disclosing what data is sent
2. Identifying who the data is sent to
3. Obtaining user permission before sharing

## AI Features That Send Data to OpenAI

| Feature | Data Sent | Edge Function |
|---------|-----------|---------------|
| AI Concierge (Chat) | Chat messages + trip/reservation context | `ai-chat/index.ts` |
| Email Parser | Travel confirmation email text | `parse-travel-email/index.ts` |
| Receipt Scanner | Receipt images (base64) | `ai-receipt-scan/index.ts` |
| Boarding Pass Scanner | Boarding pass images (base64) | `extract-boarding-pass/index.ts` |
| Gmail Auto-Scan | Email content from connected Gmail | `scan-gmail/index.ts` |

## Solution

### 1. Onboarding Privacy Consent Slide (Slide 5)

**File:** `src/app/onboarding.tsx`

Added a 5th onboarding slide ("Your Data & AI") that:
- ✅ **Discloses what data is sent** — Lists 3 categories: chat messages & trip details, travel confirmation emails, receipt & boarding pass images
- ✅ **Identifies who data is sent to** — Explicitly names "OpenAI" with highlighted styling
- ✅ **Obtains user permission** — "By continuing, you consent to this data sharing" + tapping "Get Started" = consent
- ✅ **Links to Privacy Policy** — Tappable link to `https://triptrack.ai/privacy`

**Key behaviors:**
- Skip button on earlier slides jumps to the privacy slide (not past it) — users cannot bypass consent
- "Get Started" button stores consent flags in AsyncStorage
- Skip button is hidden on the privacy slide itself

### 2. Consent Storage

**File:** `src/app/onboarding.tsx` → `handleGetStarted()`

Three AsyncStorage keys set on completion:
```
ai_data_consent = "true"
ai_data_consent_date = ISO 8601 timestamp
onboarding_complete = "true"
```

### 3. AI Data Usage in Profile

**File:** `src/app/(tabs)/profile.tsx`

Added "AI Data Usage" menu item in the Support section that shows an Alert dialog explaining:
- What each AI feature does
- What data is sent for each
- That data is processed securely and never sold
- Link to Privacy Policy

### 4. Privacy Policy Link

**File:** `src/app/(tabs)/profile.tsx`

Privacy Policy link was already present in the Support section → `https://triptrack.ai/privacy`

## Files Changed

| File | Change |
|------|--------|
| `src/app/onboarding.tsx` | Added 5th privacy/consent slide, Skip→privacy redirect, consent storage, fixed Privacy Policy URL |
| `src/app/(tabs)/profile.tsx` | Added "AI Data Usage" menu item with Brain icon |

### Bug Fix (Feb 19, 2026 — Session 2)
- Fixed Privacy Policy URL in onboarding slide: `triptrack.com/privacy` → `triptrack.ai/privacy` (now consistent with profile screen)

## App Review Response

Suggested response to Apple:

> We have addressed the privacy concerns in our updated build:
>
> 1. **Onboarding consent screen** — A new 5th onboarding slide clearly discloses that user data (chat messages, travel emails, receipt/boarding pass images) is sent to OpenAI to power AI features. Users must view this screen and tap "Get Started" to consent before using the app.
>
> 2. **AI Data Usage section** — Available in Profile → Support → AI Data Usage, providing detailed information about what data each AI feature sends and to whom.
>
> 3. **Privacy Policy** — Accessible from both the onboarding consent screen and the Profile screen, detailing all data collection, usage, and third-party sharing practices.
>
> Users cannot skip the privacy consent screen during onboarding — the Skip button redirects to the consent slide rather than bypassing it.

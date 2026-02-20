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

### 5. Runtime Consent Gates (Feb 20, 2026)

**File:** `src/lib/hooks/useAIConsent.ts`

Created a reusable hook that checks AsyncStorage for `ai_data_consent` before any AI feature runs. If consent hasn't been granted, it shows an Alert dialog that:
- ✅ **Discloses what data is sent** — Lists specific data types
- ✅ **Identifies who data is sent to** — Names "OpenAI" explicitly
- ✅ **Obtains user permission** — "Allow" button grants consent, "Don't Allow" blocks the feature
- ✅ **Links to Privacy Policy** — Tappable link in the alert

**Consent gates added to every AI feature entry point:**

| Screen | File | AI Feature Blocked |
|--------|------|--------------------|
| AI Concierge | `src/app/modal.tsx` | Chat with AI |
| Receipt Scanner | `src/app/add-receipt.tsx` | AI receipt scan |
| Boarding Pass | `src/app/boarding-pass.tsx` | AI boarding pass extraction |
| Email Parser | `src/app/parse-email.tsx` | AI email parsing |
| Gmail Connect | `src/app/connected-accounts.tsx` | Gmail auto-scan (sends to AI) |

### 6. AI Data Sharing Toggle in Profile

**File:** `src/app/(tabs)/profile.tsx`

Added "AI Data Sharing" toggle in the Support section that:
- Shows current consent status with a visual toggle switch
- Allows users to **revoke consent** at any time (with confirmation)
- Allows users to **re-enable consent** with full disclosure
- Links to Privacy Policy from the enable dialog

## Files Changed

| File | Change |
|------|--------|
| `src/app/onboarding.tsx` | Added 5th privacy/consent slide, Skip→privacy redirect, consent storage, fixed Privacy Policy URL |
| `src/app/(tabs)/profile.tsx` | Added "AI Data Usage" info, "AI Data Sharing" toggle with revoke/grant |
| `src/lib/hooks/useAIConsent.ts` | **NEW** — Reusable consent hook with `checkAndRequestConsent()`, `hasConsent`, `grantConsent()`, `revokeConsent()` |
| `src/app/modal.tsx` | Added consent gate before AI chat |
| `src/app/add-receipt.tsx` | Added consent gate before receipt scan |
| `src/app/boarding-pass.tsx` | Added consent gate before boarding pass extraction |
| `src/app/parse-email.tsx` | Added consent gate before email parsing |
| `src/app/connected-accounts.tsx` | Added consent gate before Gmail connect |

### Bug Fix (Feb 19, 2026 — Session 2)
- Fixed Privacy Policy URL in onboarding slide: `triptrack.com/privacy` → `triptrack.ai/privacy` (now consistent with profile screen)

## App Review Response

Suggested response to Apple:

> We have addressed the privacy concerns in our updated build:
>
> 1. **Onboarding consent screen** — A new 5th onboarding slide clearly discloses that user data (chat messages, travel emails, receipt/boarding pass images) is sent to OpenAI to power AI features. Users must view this screen and tap "Get Started" to consent before using the app. The Skip button redirects to the consent slide rather than bypassing it.
>
> 2. **Runtime consent gates** — Every AI-powered feature (AI Concierge, email parsing, receipt scanning, boarding pass extraction, Gmail connect) now checks for consent before sending any data. If consent hasn't been granted, a dialog appears explaining what data will be sent, identifying OpenAI as the recipient, and requiring explicit "Allow" permission. Users can decline and still use non-AI features.
>
> 3. **AI Data Sharing toggle** — Available in Profile → Support → AI Data Sharing, users can revoke or re-grant AI data sharing consent at any time with a toggle switch and confirmation dialog.
>
> 4. **AI Data Usage disclosure** — Available in Profile → Support → AI Data Usage, providing detailed information about what data each AI feature sends and to whom.
>
> 5. **Privacy Policy** — Accessible from the onboarding consent screen, runtime consent dialogs, and the Profile screen, detailing all data collection, usage, and third-party sharing practices.

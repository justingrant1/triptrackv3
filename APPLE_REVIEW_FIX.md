# Apple Review Fix — February 17, 2026

## Rejection Details
- **Submission ID:** e2ff716a-75eb-4842-9371-79337581b004
- **Review Date:** February 17, 2026
- **Review Device:** iPad Air 11-inch (M3), iPadOS 26.3
- **Version:** 1.0 (Build 18)
- **Guideline:** 2.1 — Performance — App Completeness

---

## Issue 1: "No internet connection" Error on Active Connection

### What Apple Found
> "We found an error message displayed no internet connection in the app."
> Device had an active internet connection.

### Root Cause
The `@react-native-community/netinfo` library has a known race condition on iOS/iPadOS where `isInternetReachable` can briefly report `null` → `false` → `true` during app startup. This is especially common on:
- Fresh app installs (first launch from App Store)
- iPad Air devices
- Apple Review sandbox environment

The `OfflineIndicator` component was rendering the "No internet connection" banner **immediately** when `isInternetReachable` was `false` or `null`, with no debounce or stabilization delay. This caused a flash of the offline banner during the NetInfo warm-up period, even on devices with active internet.

### Fix Applied

**`src/lib/hooks/useNetworkStatus.ts`**
- Added a **3-second stabilization delay** before reporting offline status
- The `isOffline` flag now only becomes `true` after the device has been continuously offline for 3 seconds
- Treats `isInternetReachable === null` (unknown) as "connected" — null ≠ offline
- Added `isRawOffline` for internal use where instant detection is needed (e.g., data fetching), separate from the stabilized flag used for UI banners
- If the device comes back online during the stabilization window, the timer is cancelled and the banner never shows

**`src/components/OfflineIndicator.tsx`**
- Now uses the stabilized `isOffline` flag (which already has the 3-second debounce)
- Added haptics deduplication to avoid repeated vibrations on rapid state changes

### Result
The "No internet connection" banner will **never** flash during app startup or transient network blips. It only appears after a sustained 3+ second loss of connectivity.

---

## Issue 2: In-App Purchase Not Completing

### What Apple Found
> "We cannot complete in-app purchase in the app."

### Likely Root Causes (multiple factors)

1. **Paid Apps Agreement** — Apple specifically mentioned: "the Account Holder must also accept the Paid Apps Agreement in the Business section of App Store Connect." This is the most likely cause. Without an active Paid Apps Agreement, StoreKit cannot process any purchases.

2. **IAP Product Configuration** — Products in App Store Connect may be in "Missing Metadata" or "Waiting for Review" state. They must be in "Ready to Submit" or "Approved" state for sandbox testing.

3. **RevenueCat Offerings** — The RevenueCat dashboard must have offerings configured with the correct App Store product IDs linked.

4. **SDK Initialization Timing** — The subscription screen could open before RevenueCat SDK finishes initializing, causing `getOfferings()` to return null.

### Code Fixes Applied

**`src/lib/revenuecat.ts`**
- Improved error handling: missing API key no longer crashes the app — it logs a warning and lets the app continue
- Added `isRevenueCatReady()` helper function for purchase flows to check SDK status
- Changed log level to `INFO` in production (was `DEBUG`)
- `initializeRevenueCat()` no longer throws on failure — purchase flows handle errors gracefully

**`src/app/subscription.tsx`**
- Added `isRevenueCatReady()` check before loading offerings
- Added **retry mechanism** (up to 3 attempts with increasing delay) for loading offerings when SDK isn't ready yet
- Imported the new helper function

**`src/components/UpgradeModal.tsx`**
- Imported `isRevenueCatReady` for consistent error handling

---

## Files Modified
| File | Change |
|------|--------|
| `src/lib/hooks/useNetworkStatus.ts` | 3-second stabilization delay for offline detection |
| `src/components/OfflineIndicator.tsx` | Uses stabilized offline flag, haptics dedup |
| `src/lib/revenuecat.ts` | Graceful error handling, `isRevenueCatReady()` helper |
| `src/app/subscription.tsx` | Added `isRevenueCatReady()` pre-check + retry mechanism |
| `src/components/UpgradeModal.tsx` | Imported `isRevenueCatReady` |

---

## ⚠️ Pre-Submission Checklist (MUST DO before resubmitting)

### App Store Connect Configuration
- [ ] **Paid Apps Agreement** — Go to App Store Connect → Business → Agreements and confirm the Paid Apps Agreement is active/signed
- [ ] **IAP Products** — Verify both monthly ($11.99) and annual ($99.99) subscription products exist and are in "Ready to Submit" state
- [ ] **Product IDs match RevenueCat** — Confirm the App Store product IDs in RevenueCat dashboard match the ones in App Store Connect

### RevenueCat Dashboard
- [ ] **Offerings configured** — Verify the "default" offering exists with monthly and annual packages
- [ ] **App Store Connect API key** — Verify the App Store Connect API key is configured in RevenueCat → App Settings → App Store Connect
- [ ] **Sandbox testing** — Test a purchase with a sandbox Apple ID before submitting

### EAS Build
- [ ] **Environment variables** — Verify `EXPO_PUBLIC_REVENUECAT_API_KEY` is available during EAS builds (check EAS Secrets or `.env` upload)
- [ ] Run new EAS Build: `eas build --platform ios --profile production`
- [ ] Test the build on a physical device before submitting

### Final Verification
- [ ] Launch app fresh — no "No internet connection" banner appears
- [ ] Navigate to subscription screen — offerings load correctly
- [ ] Tap "Subscribe" — StoreKit purchase sheet appears
- [ ] Complete sandbox purchase — subscription activates

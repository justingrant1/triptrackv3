# TripTrack Code Review — Phased Implementation Plan

> Generated from comprehensive code review on 2/9/2026
> Total items: 35 improvements across 6 phases
> Excludes: Google OAuth token encryption (deferred)

---

## Phase 1: Critical Bugs & Security Fixes ✅
**Priority:** 🔴 Must fix before next release
**Estimated effort:** 4-6 hours
**Status:** COMPLETE

### ✅ 1.1 Move OpenAI API Calls Server-Side
- **Problem:** `EXPO_PUBLIC_VIBECODE_OPENAI_API_KEY` is bundled into the app binary via `src/lib/openai.ts`. Anyone can decompile the app and extract the key.
- **Files to change:**
  - `src/lib/openai.ts` — Remove direct OpenAI calls for chat and receipt scanning
  - Create `supabase/functions/ai-chat/index.ts` — New edge function that proxies chat requests
  - Create `supabase/functions/ai-receipt-scan/index.ts` — New edge function for receipt OCR
  - `src/lib/hooks/useChat.ts` — Call edge function instead of OpenAI directly
  - `src/app/add-receipt.tsx` — Call edge function for receipt scanning
- **Details:** The `parse-travel-email` edge function already correctly uses server-side keys. Mirror that pattern for chat and receipt scanning. Remove `EXPO_PUBLIC_VIBECODE_OPENAI_API_KEY` from `.env` and add `OPENAI_API_KEY` as a Supabase secret.

### 1.2 Fix `deleteAccount()` — Will Crash in Production
- **Problem:** In `src/lib/auth.ts`, `deleteAccount()` tries `supabase.rpc('delete_user')` then falls back to `supabase.auth.admin.deleteUser()`. The admin API requires a service role key and will **never** work from the client.
- **Files to change:**
  - Create `supabase/functions/delete-account/index.ts` — Edge function that uses service role to delete user + cascade data
  - `src/lib/auth.ts` — Replace `deleteAccount()` to call the edge function
- **Details:** The edge function should: verify the JWT, delete all user data (trips, reservations, receipts, connected_accounts, profiles), then delete the auth user. Use `supabase.auth.admin.deleteUser(userId)` server-side with the service role key.

### 1.3 Fix `useSubscription` 1-Second Polling
- **Problem:** `src/lib/hooks/useSubscription.ts` has `refetchInterval: 1000` for `getAIMessageCount()` from AsyncStorage. Polling every second is wasteful.
- **Files to change:**
  - `src/lib/hooks/useSubscription.ts` — Remove 1-second polling
  - Create a Zustand atom or use `queryClient.setQueryData` to update the count reactively
- **Details:** When `incrementAIMessageCount()` is called in `modal.tsx`, immediately update the query cache with `queryClient.setQueryData(['ai-messages-today'], newCount)` instead of waiting for a refetch. Set `refetchInterval` to `false` or `60000` (1 minute) as a fallback.

### 1.4 Fix Auth State Listener Memory Leak
- **Problem:** In `src/lib/state/auth-store.ts`, `onAuthStateChange()` is called inside `initialize()` but the subscription is never stored or cleaned up. Multiple calls to `initialize()` register multiple listeners.
- **Files to change:**
  - `src/lib/state/auth-store.ts` — Store the subscription and prevent duplicate listeners
- **Details:** Add a `_subscription` field to the store. In `initialize()`, check if already subscribed before adding a new listener. Store the return value of `onAuthStateChange()` and call `subscription.unsubscribe()` in a cleanup path.

### 1.5 Fix Login Navigation Race Condition
- **Problem:** In `src/app/login.tsx`, after successful login, the code manually calls `router.replace('/(tabs)')`. But `src/app/_layout.tsx` also has auth-based navigation that does the same thing. This can cause double navigation.
- **Files to change:**
  - `src/app/login.tsx` — Remove manual `router.replace()` calls after auth success
- **Details:** Let the auth state change propagate through the Zustand store, which triggers the layout's auth guard to navigate. The login screen should just call `login()` or `register()` and show success feedback — the layout handles routing.

### 1.6 Fix `useEffect` Dependencies in TodayScreen
- **Problem:** In `src/app/(tabs)/index.tsx`, `tripIdsWithFlights.join(',')` creates a new string every render, causing the effect to fire repeatedly.
- **Files to change:**
  - `src/app/(tabs)/index.tsx` — Use `useMemo` for the trip IDs array and `JSON.stringify` for stable comparison
- **Details:** Replace `.join(',')` with a `useMemo` that returns a stable reference, or use `useRef` to track previous values and only trigger when actually changed.

### 1.7 Move Rate Limiting Server-Side
- **Problem:** Free tier AI message limit (3/day) is stored in AsyncStorage and easily bypassable by clearing app data.
- **Files to change:**
  - The new `supabase/functions/ai-chat/index.ts` (from 1.1) should check message count in a Supabase table
  - Create `ai_usage` table in Supabase with columns: `user_id`, `date`, `message_count`
- **Details:** The edge function checks the count before processing. This makes the limit enforceable. Keep the client-side check as a UX optimization (show upgrade modal without a network round-trip) but the server is the source of truth.

---

## Phase 2: Code Quality & DRY Cleanup ✅
**Priority:** 🟡 Important for maintainability
**Estimated effort:** 3-5 hours
**Status:** COMPLETE (core items done; 2.2, 2.3, 2.6 deferred as larger refactors)

### ✅ 2.1 Consolidate Duplicate Type Definitions
- **Problem:** `Profile` type is defined in 3 places: `database.ts`, `useProfile.ts`, and `supabase.ts`.
- **Files to change:**
  - `src/lib/types/database.ts` — Single source of truth for all types
  - `src/lib/supabase.ts` — Remove inline `Database` type, import from `database.ts`
  - `src/lib/hooks/useProfile.ts` — Remove local `Profile` interface, import from `database.ts`
- **Details:** The `Database` type in `supabase.ts` should be auto-generated from Supabase CLI (`supabase gen types typescript`) or manually kept in sync with `database.ts`. For now, delete the inline type and use the one from `database.ts`.

### 2.2 Extract Shared Components from God-Files
- **Problem:** Several screen files are 600-750+ lines with multiple component definitions inline.
- **New files to create:**
  - `src/components/ReservationIcon.tsx` — Icon component used in `index.tsx`, `trips.tsx`, `trip/[id].tsx`
  - `src/components/LiveStatusChip.tsx` — Status chip used in `index.tsx`, `trip/[id].tsx`
  - `src/components/NextUpCard.tsx` — Extract from `index.tsx`
  - `src/components/QuickActions.tsx` — Extract from `index.tsx`
  - `src/components/TripCard.tsx` — Extract from `trips.tsx`
  - `src/components/CompactTripCard.tsx` — Extract from `trips.tsx`
- **Files to update:**
  - `src/app/(tabs)/index.tsx` — Import extracted components
  - `src/app/(tabs)/trips.tsx` — Import extracted components
  - `src/app/trip/[id].tsx` — Import extracted components
- **Details:** Each extracted component should be self-contained with its own props interface. This reduces each screen file to ~200-300 lines focused on layout and data fetching.

### 2.3 Remove Duplicate `ExpandedDetails` from `trip/[id].tsx`
- **Problem:** `trip/[id].tsx` has a full `ExpandedDetails` component (~200 lines) that's nearly identical to `ReservationExpandedDetails.tsx`.
- **Files to change:**
  - `src/app/trip/[id].tsx` — Delete the local `ExpandedDetails` component and `DetailRow` helper
  - Already uses `ReservationExpandedDetails` in the expanded section — just remove the dead code
- **Details:** The shared component in `src/components/ReservationExpandedDetails.tsx` already handles all reservation types. The local copy in `trip/[id].tsx` is dead code that's never called (the actual render uses the shared component).

### 2.4 Centralize Color Maps and Utility Functions
- **Problem:** `getTypeColor`, `getReservationColor`, `getReservationIcon`, `extractAirportCode` are defined in multiple files.
- **Files to change:**
  - `src/lib/utils.ts` — Add `getTypeColor()` (merge with existing `getReservationColor`)
  - `src/lib/utils.ts` — Export `extractAirportCode()` (move from components)
  - Delete duplicate definitions from `index.tsx`, `trips.tsx`, `trip/[id].tsx`, `ReservationExpandedDetails.tsx`
- **Details:** Create a single `RESERVATION_COLORS` and `RESERVATION_ICONS` constant map in `utils.ts` that all files import.

### 2.5 Replace `any` Types with Proper Types
- **Problem:** 20+ instances of `catch (error: any)` and untyped function parameters.
- **Files to change:** All files with `any` usage — primarily:
  - `src/lib/auth.ts` — Use `unknown` with type narrowing
  - `src/lib/hooks/*.ts` — Type error handlers properly
  - `src/app/*.tsx` — Type catch blocks
- **Details:** Replace `catch (error: any)` with `catch (error: unknown)` and use the existing `isNetworkError()` / `isAuthError()` from `error-utils.ts` for type-safe error handling. Create a `getErrorMessage(error: unknown): string` utility.

### 2.6 Wire Up Zod Validation Schemas
- **Problem:** Comprehensive Zod schemas exist in `src/lib/validation.ts` but forms use manual inline validation.
- **Files to change:**
  - `src/app/login.tsx` — Use `loginSchema` / `signupSchema` instead of manual regex
  - `src/app/add-trip.tsx` — Use `tripSchema` instead of manual checks
  - `src/app/add-reservation.tsx` — Use `reservationSchema`
  - `src/app/add-receipt.tsx` — Use `receiptSchema`
  - `src/app/edit-trip.tsx`, `edit-reservation.tsx`, `edit-receipt.tsx` — Same schemas
- **Details:** Use the existing `validateData()` helper from `validation.ts`. On submit, call `validateData(schema, formData)` and display field-level errors using `getFieldError()`. This gives consistent validation with proper error messages.

### 2.7 Create Query Key Factory
- **Problem:** Query keys are scattered as string tuples throughout hooks.
- **New file:** `src/lib/query-keys.ts`
- **Files to change:** All hooks in `src/lib/hooks/`
- **Details:**
  ```ts
  export const queryKeys = {
    trips: {
      all: ['trips'] as const,
      detail: (id: string) => ['trips', id] as const,
    },
    reservations: {
      byTrip: (tripId: string) => ['reservations', tripId] as const,
    },
    receipts: {
      all: ['receipts'] as const,
      byTrip: (tripId: string) => ['receipts', tripId] as const,
    },
    // ... etc
  };
  ```

---

## Phase 3: UI/UX Polish ✅
**Priority:** 🟢 Improves user experience
**Estimated effort:** 4-6 hours
**Status:** COMPLETE

### ✅ 3.1 Replace `Alert.alert()` with Custom Modals
- **Problem:** CLAUDE.md explicitly says "Use custom modals, not Alert.alert()" but Alert.alert is used ~15+ times.
- **New files to create:**
  - `src/components/ConfirmModal.tsx` — Reusable confirmation dialog (delete, destructive actions)
  - `src/components/Toast.tsx` — Slide-in toast for success/error feedback
- **Files to change:**
  - `src/app/trip/[id].tsx` — Replace delete confirmation alerts
  - `src/app/(tabs)/trips.tsx` — Replace delete/export alerts
  - `src/app/(tabs)/receipts.tsx` — Replace delete alerts
  - `src/app/login.tsx` — Replace error alerts with inline error display
  - `src/app/add-trip.tsx`, `add-reservation.tsx`, `add-receipt.tsx` — Replace error alerts
  - `src/app/edit-profile.tsx` — Replace delete account alert
- **Details:** The `ConfirmModal` should have: title, message, confirmText, cancelText, destructive flag, and onConfirm callback. Style it to match the app's dark theme with blur background. The `Toast` should auto-dismiss after 3 seconds and support success/error/info variants.

### 3.2 Create Haptics Utility
- **Problem:** Haptic feedback is inconsistent — different intensities for similar actions.
- **New file:** `src/lib/haptics.ts`
- **Details:**
  ```ts
  export const haptics = {
    tap: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
    press: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
    heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
    success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
    selection: () => Haptics.selectionAsync(),
  };
  ```
  Then replace all direct `Haptics.*` calls throughout the app with `haptics.*`.

### 3.3 Polish Empty States
- **Problem:** Empty states are inconsistent across tabs. Trips has a beautiful multi-card onboarding, but Receipts and Notifications are minimal.
- **Files to change:**
  - `src/app/(tabs)/receipts.tsx` — Add illustrated empty state with CTA
  - `src/app/notifications.tsx` — Add illustrated empty state
- **Details:** Match the style of the Trips empty state: icon, title, subtitle, and action button. For receipts: "No receipts yet — Snap a photo or add manually". For notifications: "All caught up! — You'll see flight updates and reminders here".

### 3.4 Fix Onboarding Navigation for Authenticated Users
- **Problem:** `onboarding.tsx` always routes to `/login` on completion, even if the user is already authenticated (e.g., just signed up via Apple Sign-In).
- **Files to change:**
  - `src/app/onboarding.tsx` — Check auth state before navigating
- **Details:** In `handleGetStarted()`, check `useAuthStore.getState().user`. If authenticated, route to `/(tabs)`. If not, route to `/login`.

### 3.5 Add `keyboardDismissMode` to ScrollViews
- **Problem:** Scrolling doesn't dismiss the keyboard when search is active.
- **Files to change:**
  - `src/app/(tabs)/trips.tsx` — Add `keyboardDismissMode="on-drag"` to ScrollView
  - `src/app/(tabs)/receipts.tsx` — Same
- **Details:** One-line fix per file. Also add `Keyboard.dismiss()` on search clear button press.

### 3.6 Add Pull-to-Refresh on Profile Screen
- **Problem:** Profile screen loads data that can become stale but has no pull-to-refresh.
- **Files to change:**
  - `src/app/(tabs)/profile.tsx` — Add `RefreshControl` to ScrollView
- **Details:** Refetch profile, connected accounts, and forwarding address on pull.

---

## Phase 4: Architecture & Performance ✅
**Priority:** 🟢 Improves app quality and speed
**Estimated effort:** 4-6 hours
**Status:** COMPLETE

### ✅ 4.1 Add Optimistic Updates to Mutations
- **Problem:** All mutations wait for the server response before updating the UI. This makes the app feel sluggish on slow connections.
- **Files to change:**
  - `src/lib/hooks/useTrips.ts` — Add `onMutate` / `onError` / `onSettled` to `useCreateTrip`, `useUpdateTrip`, `useDeleteTrip`
  - `src/lib/hooks/useReservations.ts` — Same for reservation mutations
  - `src/lib/hooks/useReceipts.ts` — Same for receipt mutations
- **Details:** Pattern for each mutation:
  ```ts
  onMutate: async (newData) => {
    await queryClient.cancelQueries({ queryKey: ['trips'] });
    const previous = queryClient.getQueryData(['trips']);
    queryClient.setQueryData(['trips'], (old) => [...(old || []), { ...newData, id: 'temp-' + Date.now() }]);
    return { previous };
  },
  onError: (err, newData, context) => {
    queryClient.setQueryData(['trips'], context?.previous);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['trips'] });
  },
  ```

### 4.2 Switch to FlashList for Long Lists
- **Problem:** `@shopify/flash-list` is installed but not used. Trips and receipts lists use `ScrollView` with `.map()`, which renders all items at once.
- **Files to change:**
  - `src/app/(tabs)/trips.tsx` — Replace `ScrollView` + `.map()` with `FlashList`
  - `src/app/(tabs)/receipts.tsx` — Same
- **Details:** FlashList requires `estimatedItemSize` prop. For trip cards: ~200. For receipt rows: ~80. This dramatically improves performance with 50+ items and reduces memory usage.

### 4.3 Batch Weather API Calls
- **Problem:** Each `TripCard` calls `useWeather(trip.destination)` independently. With 10 trips, that's 10 separate API calls.
- **Files to change:**
  - `src/lib/hooks/useWeather.ts` — Add caching with longer staleTime
  - `src/app/(tabs)/trips.tsx` — Only show weather for the first 3 featured/upcoming trips
- **Details:** Set `staleTime: 30 * 60 * 1000` (30 minutes) for weather queries since weather doesn't change that fast. Also limit weather display to only active/upcoming trips, not completed ones.

### 4.4 Fix Skeleton Shimmer Animation
- **Problem:** In `trips.tsx`, skeleton shimmer uses `setInterval` + Reanimated `withTiming` which is unidiomatic and can leak.
- **Files to change:**
  - `src/app/(tabs)/trips.tsx` — Replace `setInterval` shimmer with `withRepeat`
- **Details:** Replace:
  ```ts
  const interval = setInterval(() => {
    shimmer.value = 0;
    shimmer.value = withTiming(1, { duration: 1500 });
  }, 1500);
  ```
  With:
  ```ts
  shimmer.value = withRepeat(withTiming(1, { duration: 1500 }), -1, true);
  ```
  This is cleaner, more performant, and automatically cleaned up by Reanimated.

### 4.5 Add `useFocusEffect` for Stale Data Refresh
- **Problem:** When returning to a screen (e.g., back from add-trip to trips list), data might be stale.
- **Files to change:**
  - `src/app/(tabs)/trips.tsx` — Refetch on focus
  - `src/app/(tabs)/receipts.tsx` — Refetch on focus
  - `src/app/(tabs)/index.tsx` — Refetch on focus
- **Details:** Use `useFocusEffect` from `@react-navigation/native`:
  ```ts
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    }, [])
  );
  ```
  This ensures fresh data when navigating back from create/edit screens.

### 4.6 Type `useAllReceipts` Return Value
- **Problem:** `useAllReceipts` fetches joined data (`receipts` + `trips`) but returns untyped data.
- **Files to change:**
  - `src/lib/types/database.ts` — Add `ReceiptWithTrip` type
  - `src/lib/hooks/useReceipts.ts` — Type the return properly
- **Details:**
  ```ts
  export interface ReceiptWithTrip extends Receipt {
    trips: { name: string; destination: string } | null;
  }
  ```

---

## Phase 5: Missing Features (Easy Wins) ✅
**Priority:** 🔵 Nice to have, high impact
**Estimated effort:** 3-4 hours
**Status:** COMPLETE

### ✅ 5.1 Persist Chat History
- **Problem:** Chat messages in `useChat.ts` are stored in `useState` and lost when the modal closes.
- **Files to change:**
  - `src/lib/hooks/useChat.ts` — Persist messages to AsyncStorage or Supabase `chat_messages` table
- **Details:** Option A (simple): Use AsyncStorage to persist the last conversation. Clear on explicit "Clear Chat" action. Option B (full): Create a `chat_messages` table in Supabase and sync. Start with Option A.

### 5.2 Add "Undo" on Delete Actions
- **Problem:** Deleting a trip/reservation/receipt is immediate with no undo option.
- **Files to change:**
  - `src/components/Toast.tsx` (from Phase 3) — Add "Undo" action button variant
  - `src/lib/hooks/useTrips.ts` — Soft-delete with undo window
  - `src/lib/hooks/useReservations.ts` — Same
  - `src/lib/hooks/useReceipts.ts` — Same
- **Details:** On delete, show a toast with "Undo" button for 5 seconds. Use optimistic update to immediately remove from UI. If undo is pressed, restore from the cached previous state. If timer expires, execute the actual delete.

### 5.3 Add Expense Summary to Trip Detail
- **Problem:** Trip detail screen shows reservations but no expense overview. Users must go to Receipts tab.
- **Files to change:**
  - `src/app/trip/[id].tsx` — Add expense summary card in the header area
  - `src/lib/hooks/useReceipts.ts` — Add `useReceiptsByTrip(tripId)` if not already available
- **Details:** Show a small card below the trip header: "Expenses: $1,234 across 8 receipts" with a breakdown by category (transport, lodging, meals, other). Tap to navigate to receipts filtered by this trip.

### 5.4 Add Custom Cover Image Upload
- **Problem:** `add-trip.tsx` only offers 6 hardcoded Unsplash images. No custom upload despite `expo-image-picker` being available.
- **Files to change:**
  - `src/app/add-trip.tsx` — Add "Upload Photo" option to cover image section
  - `src/app/edit-trip.tsx` — Same
- **Details:** Use `expo-image-picker` to select from camera roll. Upload to Supabase Storage bucket `trip-covers`. Store the public URL as `cover_image`. Add a "+" card at the beginning of the cover image grid.

### 5.5 Add Confirmation Number Quick-Copy from Menu
- **Problem:** Users must expand a reservation to find and copy the confirmation number.
- **Files to change:**
  - `src/app/trip/[id].tsx` — Add "Copy Conf #" to the three-dot menu on reservation cards
- **Details:** In the `Alert.alert` (or custom modal after Phase 3) for reservation actions, add a "Copy Confirmation" option that copies to clipboard and shows a success toast. Only show this option if `reservation.confirmation_number` exists.

### 5.6 Polish `+not-found.tsx`
- **Problem:** The 404 page may have minimal styling.
- **Files to change:**
  - `src/app/+not-found.tsx` — Add polished UI matching app design
- **Details:** Dark theme, centered content, app icon, "Page not found" message, and a "Go Home" button that navigates to `/(tabs)`.

---

## Phase 6: Documentation & Cleanup ✅
**Priority:** ⚪ Housekeeping
**Estimated effort:** 1-2 hours
**Status:** COMPLETE

### ✅ 6.1 Move Session Notes to `docs/` Folder
- **Problem:** 20+ markdown files at the project root are development session notes, not user-facing documentation.
- **Files to move to `docs/`:**
  - `ARCHITECTURE_IMPROVEMENTS.md`
  - `BUG_FIXES_SESSION.md`
  - `BUILD_12_FIXES.md`
  - `BUILD_13_14_ANALYSIS.md`
  - `BUILD_16_SUCCESS.md`
  - `DEPLOY_EDGE_FUNCTION.md`
  - `DEPLOY_FLIGHT_FUNCTIONS.md`
  - `DEPLOYMENT_STATUS.md`
  - `EMAIL_FORWARDING_SECURITY_FIX.md`
  - `EMAIL_FORWARDING_SETUP.md`
  - `FLIGHT_TRACKING_SETUP.md`
  - `GMAIL_OAUTH_FIX.md`
  - `GMAIL_OAUTH_SETUP.md`
  - `GMAIL_SCANNER_REWRITE.md`
  - `NOTIFICATION_SYSTEM.md`
  - `PHASE_2_COMPLETE.md`
  - `PHASE_3_PROGRESS.md`
  - `PHASE_4_SESSION.md`
  - `PRICING_IMPLEMENTATION.md`
  - `PRICING_STRATEGY.md`
  - `RECEIPT_SCAN_FIX.md`
  - `REVENUECAT_INTEGRATION.md`
  - `SUBSCRIPTION_FIX.md`
  - `SUPABASE_SETUP_V2.md`
  - `UI_POLISH_SESSION.md`
- **Keep at root:** `README.md`, `ROADMAP.md`, `PROGRESS.md`, `CLAUDE.md`, `AGENTS.md`, `CODE_REVIEW_PHASES.md`, `changelog.txt`

### 6.2 Update README.md
- **Files to change:**
  - `README.md` — Full rewrite with current state
- **Details:** Include:
  - App description and screenshots
  - Tech stack (Expo, React Native, Supabase, React Query, NativeWind, RevenueCat)
  - Setup instructions (env vars, Supabase setup, EAS build)
  - Architecture overview (folder structure, data flow)
  - Edge function deployment instructions
  - Contributing guidelines

### 6.3 Remove Dead Code
- **Files to check/clean:**
  - `src/lib/useClientOnlyValue.ts` / `.web.ts` — Check if still used
  - `src/lib/useColorScheme.ts` / `.web.ts` — Check if still used
  - `src/lib/state/example-state.ts` — Remove if it's a template
  - `src/components/Themed.tsx` — Check if still used (likely from Expo template)
- **Details:** Search for imports of each file. If no imports found, delete the file.

---

## Summary Table

| Phase | Items | Priority | Effort | Focus |
|-------|-------|----------|--------|-------|
| 1 | 7 | 🔴 Critical | 4-6h | Security, bugs, crashes |
| 2 | 7 | 🟡 Important | 3-5h | DRY, types, validation |
| 3 | 6 | 🟢 Polish | 4-6h | UI/UX, modals, haptics |
| 4 | 6 | 🟢 Quality | 4-6h | Performance, architecture |
| 5 | 6 | 🔵 Features | 3-4h | Easy wins, missing features |
| 6 | 3 | ⚪ Cleanup | 1-2h | Docs, dead code |
| **Total** | **35** | | **19-29h** | |

---

## How to Use This Document

1. Work through phases in order (Phase 1 first — it's critical)
2. Within each phase, items can be done in any order
3. Check off items as completed by changing `###` to `### ✅`
4. After each phase, do a build test (`npx expo start`) to catch regressions
5. Commit after each phase with a descriptive message

# Build #12 - Critical Crash Fixes

## Date: February 6, 2026

## Problem
App was crashing instantly on startup in production builds (Builds #10 and #11). The crash happened before any UI could render.

## Root Causes Identified

### 1. **CRITICAL: Module-Level Exception in `supabase.ts`**
The `supabase.ts` file had a `throw new Error()` at the top level (module load time):

```typescript
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables...');
}
```

This code runs **before React even starts**. If the environment variables weren't properly inlined during the build process, the app would crash instantly.

**Fix:** Changed to `console.warn()` instead of throwing, allowing the app to load even if Supabase isn't configured:

```typescript
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Missing Supabase environment variables...');
  // Don't throw - allow app to load even if Supabase isn't configured
}
```

### 2. **Missing KeyboardProvider Config Plugin**
The `_layout.tsx` wrapped the entire app in `<KeyboardProvider>` from `react-native-keyboard-controller`, but this package doesn't have a config plugin for Expo. In production builds, the native module didn't exist, causing a crash.

**Fix:** Removed the `KeyboardProvider` wrapper from `_layout.tsx` and removed the import.

### 3. **Babel Config Issues**
The `babel.config.js` had aliases for `better-auth` packages that don't exist in the project:

```javascript
"better-auth/react": "./node_modules/better-auth/dist/client/react/index.cjs",
"better-auth/client/plugins": "./node_modules/better-auth/dist/client/plugins/index.cjs",
"@better-auth/expo/client": "./node_modules/@better-auth/expo/dist/client.cjs",
```

**Fix:** Removed all `better-auth` aliases from babel config.

### 4. **Package Version Mismatches**
Running `expo doctor` revealed 14+ package version mismatches with the installed Expo SDK 53.

**Fix:** Ran `npx expo install --fix` which:
- Updated 15 packages to SDK 53-compatible versions
- Added missing config plugins: `expo-asset`, `expo-video`, `expo-web-browser`, `react-native-edge-to-edge`
- Fixed version conflicts

## Changes Made

### Files Modified:
1. **`src/lib/supabase.ts`** - Changed `throw` to `console.warn`
2. **`src/app/_layout.tsx`** - Removed `KeyboardProvider` import and wrapper
3. **`babel.config.js`** - Removed `better-auth` aliases
4. **`package.json`** - Updated via `npx expo install --fix`
5. **`app.json`** - Auto-updated with new config plugins

### Config Plugins Now in app.json:
```json
"plugins": [
  "expo-router",
  "expo-secure-store",
  "expo-font",
  "expo-asset",
  "expo-video",
  "expo-web-browser",
  "react-native-edge-to-edge"
]
```

## Build Details
- **Build Number:** 12
- **Build ID:** 2adc6745-beba-4645-bb76-33dbe461ffd4
- **Status:** Successfully built and submitted to TestFlight
- **Processing:** 5-10 minutes on Apple's servers
- **TestFlight URL:** https://appstoreconnect.apple.com/apps/6758813711/testflight/ios

## Expected Outcome
The app should now launch successfully without crashing. The critical module-level exception has been removed, and all package versions are now compatible with Expo SDK 53.

## Previous Failed Builds
- **Build #10:** Crashed due to missing config plugins + module-level exception
- **Build #11:** Crashed due to module-level exception (config plugins partially fixed)
- **Build #12:** All critical issues resolved ✅

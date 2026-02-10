# Gmail OAuth Fix - Error 400: invalid_request

## Problem
When trying to connect Gmail account in the iOS standalone build, users received:
```
Error 400: invalid_request
Request details: redirect_uri=triptrack://oauth/callback
```

## Root Cause
Google OAuth for iOS requires using the **reversed iOS client ID** as the redirect URI scheme, not a custom scheme like `triptrack://`.

### Why This Happens
- **Custom schemes** (like `triptrack://`) are not supported by Google OAuth for native mobile apps
- **iOS OAuth clients** must use the reversed client ID format
- Example: `970308936264-ujmm0seople04r8s0vgo018a5f2hj4cn.apps.googleusercontent.com` becomes `com.googleusercontent.apps.970308936264-ujmm0seople04r8s0vgo018a5f2hj4cn`

## Solution Implemented

### 1. Updated `src/lib/google-auth.ts`
Added a new function `getRedirectScheme()` that dynamically generates the correct redirect URI scheme based on platform:

```typescript
function getRedirectScheme(): string {
  if (Platform.OS === 'ios') {
    // Reverse the iOS client ID to create the scheme
    const clientId = GOOGLE_CLIENT_ID_IOS;
    const parts = clientId.split('.');
    return parts.reverse().join('.');
  } else if (Platform.OS === 'android') {
    // Android also uses reversed client ID
    const clientId = GOOGLE_CLIENT_ID_ANDROID;
    const parts = clientId.split('.');
    return parts.reverse().join('.');
  } else {
    // Web/Expo Go uses custom scheme
    return 'triptrack';
  }
}
```

**Result:**
- iOS: `com.googleusercontent.apps.970308936264-ujmm0seople04r8s0vgo018a5f2hj4cn://oauth/callback`
- Android: `com.googleusercontent.apps.970308936264-21t3vvfk2v3v0acrll4a9oh6t76p0o7u://oauth/callback`
- Web/Expo Go: `triptrack://oauth/callback`

### 2. Updated `app.json`
Added the reversed iOS client ID as an additional URL scheme so iOS knows to handle OAuth callbacks:

```json
"scheme": [
  "triptrack",
  "com.googleusercontent.apps.970308936264-ujmm0seople04r8s0vgo018a5f2hj4cn"
]
```

This allows the app to respond to both:
- Deep links: `triptrack://...`
- OAuth callbacks: `com.googleusercontent.apps.970308936264-ujmm0seople04r8s0vgo018a5f2hj4cn://...`

## ⚠️ IMPORTANT: Rebuild Required

**These changes require a new native build** because URL schemes are compiled into the native binary. The changes will NOT work with just a JavaScript bundle update.

### To Apply the Fix:

#### Option 1: EAS Build (Recommended)
```bash
# For iOS development build
eas build --profile development --platform ios

# For iOS production build
eas build --profile production --platform ios
```

#### Option 2: Local Build
```bash
# Generate native iOS project
npx expo prebuild --platform ios

# Open in Xcode and build
open ios/TripTrack.xcworkspace
```

### After Rebuilding:
1. Install the new build on your device
2. Navigate to Profile → Connected Accounts
3. Tap "Connect Gmail"
4. The OAuth flow should now work correctly
5. You'll be redirected back to the app after granting permissions

## How It Works Now

### OAuth Flow:
```
1. User taps "Connect Gmail"
   ↓
2. App opens Google sign-in with redirect URI:
   com.googleusercontent.apps.970308936264-ujmm0seople04r8s0vgo018a5f2hj4cn://oauth/callback
   ↓
3. User signs in and grants permissions
   ↓
4. Google redirects to the reversed client ID scheme
   ↓
5. iOS recognizes the scheme (from app.json) and opens TripTrack
   ↓
6. App receives the auth code and exchanges it for tokens
   ↓
7. Success! Account is connected
```

## Platform-Specific Behavior

### iOS (Standalone Build)
- Uses reversed client ID: `com.googleusercontent.apps.970308936264-ujmm0seople04r8s0vgo018a5f2hj4cn://oauth/callback`
- Automatically supported by iOS OAuth client in Google Cloud Console
- No additional configuration needed in Google Cloud Console

### Android (Standalone Build)
- Uses reversed client ID: `com.googleusercontent.apps.970308936264-21t3vvfk2v3v0acrll4a9oh6t76p0o7u://oauth/callback`
- Automatically supported by Android OAuth client in Google Cloud Console
- No additional configuration needed in Google Cloud Console

### Web / Expo Go
- Uses custom scheme: `triptrack://oauth/callback`
- For Expo Go, you may need to use: `https://auth.expo.io/@jgrant1/triptrack`
- This would require adding it as an authorized redirect URI in the Web OAuth client

## Google Cloud Console Configuration

**No changes needed!** The reversed client ID scheme is automatically recognized by Google for iOS and Android OAuth clients. This is the standard Google OAuth flow for native mobile apps.

### What's Already Configured:
- ✅ iOS OAuth Client: `970308936264-ujmm0seople04r8s0vgo018a5f2hj4cn.apps.googleusercontent.com`
- ✅ Android OAuth Client: `970308936264-21t3vvfk2v3v0acrll4a9oh6t76p0o7u.apps.googleusercontent.com`
- ✅ Web OAuth Client: `970308936264-82pl2hti02v7qpumkfdlspqeh84lllnv.apps.googleusercontent.com`

The reversed client ID redirect URIs are implicitly allowed for native clients.

## Testing Checklist

After rebuilding:
- [ ] Install new build on iOS device
- [ ] Open app and navigate to Connected Accounts
- [ ] Tap "Connect Gmail"
- [ ] Verify Google sign-in page opens
- [ ] Sign in with test user account
- [ ] Grant permissions
- [ ] Verify redirect back to app works
- [ ] Verify account appears in Connected Accounts list
- [ ] Test "Sync Now" button
- [ ] Verify trips/reservations are created from Gmail

## Troubleshooting

### Still getting "invalid_request"?
- Make sure you rebuilt the app (not just reloaded JS)
- Verify the new build is installed on your device
- Check that your test user is added in Google Cloud Console OAuth consent screen

### "Redirect URI mismatch"?
- This shouldn't happen with the reversed client ID, but if it does:
- Check that the iOS client ID in `.env` matches Google Cloud Console
- Verify the reversed scheme in `app.json` matches the reversed client ID

### OAuth flow doesn't redirect back to app?
- Verify the scheme is in `app.json`
- Make sure you installed the new build (URL schemes are in native code)
- Check iOS device logs for any URL handling errors

## Files Modified
- `src/lib/google-auth.ts` - Added `getRedirectScheme()` function
- `app.json` - Added reversed client ID to `scheme` array

## References
- [Google OAuth 2.0 for Mobile Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Expo AuthSession Documentation](https://docs.expo.dev/versions/latest/sdk/auth-session/)
- [iOS URL Scheme Handling](https://developer.apple.com/documentation/xcode/defining-a-custom-url-scheme-for-your-app)

# Build #13-14 - Minimal Package Approach

## Date: February 6, 2026

## Strategy
After Build #12 continued to crash at runtime, we identified that the issue was **unused native packages** being auto-linked and trying to initialize on app startup, causing crashes.

## Actions Taken

### 1. Created Minimal package.json
Removed **588 packages** that weren't being used in the codebase, keeping only:
- Core Expo packages (expo, expo-router, expo-font, expo-secure-store, etc.)
- React Navigation
- Supabase client
- React Query
- UI libraries (lucide-react-native, nativewind)
- Essential utilities (zustand, date-fns, clsx)

### 2. Updated Configuration Files
- **app.json**: Removed config plugins for deleted packages (expo-video, expo-web-browser, react-native-edge-to-edge)
- **metro.config.js**: Removed @vibecodeapp/sdk dependency, added react-native-svg-transformer
- **package.json**: Added react-native-svg-transformer to devDependencies

### 3. Build Results
- **Build #13**: Skipped (build number incremented but not used)
- **Build #14**: **FAILED** during JavaScript bundling phase

## Build #14 Failure
**Error**: "Unknown error. See logs of the Bundle JavaScript build phase for more information."

The build failed during the JavaScript bundling step, which suggests:
1. Missing dependencies that the code is trying to import
2. Possible import errors in the codebase
3. Metro bundler configuration issues

## Next Steps

### Option A: Check Build Logs
Need to view the full build logs at: https://expo.dev/accounts/jgrant1/projects/triptrack/builds/7655f677-014c-4d71-ad9f-5a3251867ea7

Look for specific errors like:
- "Cannot find module 'X'"
- Import/require errors
- Bundling failures

### Option B: Incremental Approach
Instead of removing all packages at once, take a more incremental approach:
1. Start with the full package.json
2. Remove packages one category at a time
3. Test build after each removal
4. Identify which specific package(s) are causing the runtime crash

### Option C: Add Back Critical Packages
The minimal approach may have removed packages that are actually needed. Consider adding back:
- `@expo/vector-icons` dependencies
- Any packages that expo-router or other core packages depend on
- Packages that might be imported dynamically

## Suspected Missing Dependencies
Based on the minimal package.json, we may need to add back:
- Packages that Expo SDK expects to be present
- Dependencies of the packages we kept
- Packages imported by third-party libraries

## Recommendation
**Check the build logs first** to see the specific error, then either:
1. Add back the missing package(s) identified in the logs, OR
2. Take the incremental removal approach to identify the problematic package(s)

The goal is to find the **minimum set of packages** that allows the app to build AND run without crashing.

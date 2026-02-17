import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from '@/lib/useColorScheme';
import { QueryClient, focusManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@/lib/query-persister';
import { isAuthError } from '@/lib/error-utils';
import { supabase } from '@/lib/supabase';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { useAuthStore } from '@/lib/state/auth-store';
import { View, ActivityIndicator, Text, AppState, Platform } from 'react-native';
import { useFonts } from 'expo-font';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { initializeRevenueCat } from '@/lib/revenuecat';
import { subscribeToDeepLinks, getInitialDeepLink, handleDeepLink } from '@/lib/sharing';
import { updateTripStatuses } from '@/lib/trip-status';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { registerForPushNotifications, savePushToken } from '@/lib/notifications';
import * as Notifications from 'expo-notifications';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// ─── React Query ↔ React Native AppState Bridge ─────────────────────────────
// React Query's refetchOnWindowFocus only works on web. For React Native, we
// connect AppState so that when the user returns from background (e.g., after
// checking a notification, switching apps), all stale queries silently refetch.
// This makes the app feel "always fresh" without any pull-to-refresh needed.
function onAppStateChange(status: string) {
  if (Platform.OS !== 'web') {
    focusManager.setFocused(status === 'active');
  }
}
AppState.addEventListener('change', onAppStateChange);

// Configure React Query for offline-first behavior
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 24 hours — persisted data stays usable offline for a full day
      gcTime: 1000 * 60 * 60 * 24,
      // Keep data fresh for 5 minutes — background refresh when online
      staleTime: 1000 * 60 * 5,
      // Retry failed requests (but not auth errors)
      retry: (failureCount, error) => {
        // Don't retry auth errors — they need a session refresh, not a retry
        if (isAuthError(error)) return false;
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Network mode for offline support
      networkMode: 'offlineFirst',
    },
    mutations: {
      // Retry mutations on network errors (but not auth errors)
      retry: (failureCount, error) => {
        if (isAuthError(error)) return false;
        return failureCount < 1;
      },
      networkMode: 'offlineFirst',
    },
  },
});

// Create the AsyncStorage persister for cache persistence across app restarts
const asyncStoragePersister = createAsyncStoragePersister();

// Handle auth errors globally: attempt session refresh when JWT expires
queryClient.getQueryCache().subscribe((event) => {
  if (event.type === 'updated' && event.query.state.status === 'error') {
    const error = event.query.state.error;
    if (isAuthError(error)) {
      console.log('[Auth] Query failed with auth error, attempting session refresh...');
      supabase.auth.refreshSession().then(({ error: refreshError }) => {
        if (refreshError) {
          console.warn('[Auth] Session refresh failed:', refreshError.message);
          // If refresh fails, the auth store listener will handle logout
        } else {
          console.log('[Auth] Session refreshed, invalidating failed queries...');
          // Retry the failed query after successful refresh
          queryClient.invalidateQueries({ queryKey: event.query.queryKey });
        }
      });
    }
  }
});

function RootLayoutNav({
  colorScheme,
  fontsLoaded,
}: {
  colorScheme: 'light' | 'dark' | null | undefined;
  fontsLoaded: boolean;
}) {
  const router = useRouter();
  const segments = useSegments();
  const { user, isInitialized, initialize } = useAuthStore();

  // Initialize auth on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Clear React Query cache when user changes (logout or account switch)
  // This prevents stale data from a previous account leaking to a new user
  const previousUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const currentUserId = user?.id ?? null;

    // Skip the very first render (initialization)
    if (previousUserIdRef.current === undefined) {
      previousUserIdRef.current = currentUserId;
      return;
    }

    // User changed (logout, login as different user, or account switch)
    if (previousUserIdRef.current !== currentUserId) {
      console.log('[Auth] User changed, clearing query cache...',
        previousUserIdRef.current ? 'old user' : 'no user',
        '→',
        currentUserId ? 'new user' : 'logged out'
      );

      // Clear in-memory cache immediately
      queryClient.clear();

      // Also clear the persisted AsyncStorage cache
      try {
        const result = asyncStoragePersister.removeClient();
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch((err: unknown) => {
            console.warn('[Auth] Failed to clear persisted cache:', err);
          });
        }
      } catch (err) {
        console.warn('[Auth] Failed to clear persisted cache:', err);
      }

      previousUserIdRef.current = currentUserId;
    }
  }, [user?.id]);

  // Initialize RevenueCat when user is authenticated
  useEffect(() => {
    if (user?.id) {
      initializeRevenueCat(user.id).catch((error) => {
        console.error('Failed to initialize RevenueCat:', error);
      });
    }
  }, [user?.id]);

  // Update trip statuses when user logs in
  useEffect(() => {
    if (user?.id) {
      updateTripStatuses(user.id).then(({ updated, error }) => {
        if (error) {
          console.error('Failed to update trip statuses:', error);
        } else if (updated > 0) {
          console.log(`Updated ${updated} trip status(es)`);
        }
      });
    }
  }, [user?.id]);

  // Register for push notifications when user is authenticated
  useEffect(() => {
    if (!user?.id) return;

    registerForPushNotifications().then((token) => {
      if (token) {
        savePushToken(token);
        console.log('[Push] Registered with token:', token.substring(0, 20) + '...');
      }
    });
  }, [user?.id]);

  // Notification listeners: tap-to-navigate + foreground handling
  useEffect(() => {
    if (!user) return;

    // When user taps a notification → navigate to the relevant trip
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        if (data?.tripId) {
          router.push(`/trip/${data.tripId}`);
        } else {
          // No trip context — go to notifications inbox
          router.push('/notifications');
        }
      }
    );

    // Foreground notification received — refresh data silently so the UI updates
    // immediately when a flight status change or new trip notification arrives
    const receivedSubscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('[Push] Foreground notification:', notification.request.content.title);
        // Silently invalidate trip/reservation queries so fresh data loads in background
        queryClient.invalidateQueries({ queryKey: ['trips'] });
        queryClient.invalidateQueries({ queryKey: ['reservations'] });
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
    );

    return () => {
      responseSubscription.remove();
      receivedSubscription.remove();
    };
  }, [user, router]);

  // Handle deep links
  useEffect(() => {
    if (!user) return;

    // Handle initial deep link (app opened via link)
    getInitialDeepLink().then(async (url) => {
      if (url) {
        const result = await handleDeepLink(url);
        if (result?.type === 'trip') {
          router.push(`/trip/${result.id}`);
        }
      }
    });

    // Subscribe to deep link events (app already open)
    const subscription = subscribeToDeepLinks(async (url) => {
      const result = await handleDeepLink(url);
      if (result?.type === 'trip') {
        router.push(`/trip/${result.id}`);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [user, router]);

  // Handle auth-based navigation
  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === 'login';
    const inOnboarding = segments[0] === 'onboarding';

    if (!user && !inAuthGroup && !inOnboarding) {
      // Redirect to login if not authenticated (but not if on onboarding — 
      // onboarding handles its own navigation when complete)
      router.replace('/login');
    } else if (user && inAuthGroup) {
      // User just authenticated while on login screen.
      // Check if this is a brand new account — if so, send to onboarding.
      const createdAt = user.created_at ? new Date(user.created_at).getTime() : 0;
      const isNewUser = (Date.now() - createdAt) < 30000; // Created within last 30 seconds

      if (isNewUser) {
        router.replace('/onboarding');
      } else {
        router.replace('/(tabs)');
      }
    }
    // Don't redirect away from onboarding — let the user complete it
  }, [user, segments, isInitialized, router]);

  // Hide splash screen when both fonts and auth are ready
  useEffect(() => {
    if (isInitialized && fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [isInitialized, fontsLoaded]);

  // Track how long we've been loading — show helpful message on slow connections
  const [loadingTooLong, setLoadingTooLong] = React.useState(false);
  const [loadingVeryLong, setLoadingVeryLong] = React.useState(false);
  
  React.useEffect(() => {
    if (isInitialized && fontsLoaded) return;
    
    const timer1 = setTimeout(() => setLoadingTooLong(true), 5000); // 5s
    const timer2 = setTimeout(() => setLoadingVeryLong(true), 15000); // 15s
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isInitialized, fontsLoaded]);

  if (!isInitialized || !fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000',
          paddingHorizontal: 32,
        }}
      >
        <ActivityIndicator size="large" color="#3b82f6" />
        {loadingTooLong && (
          <Text style={{ color: '#94A3B8', marginTop: 16, fontSize: 14, textAlign: 'center' }}>
            Loading your trips...
          </Text>
        )}
        {loadingVeryLong && (
          <Text style={{ color: '#64748B', marginTop: 8, fontSize: 13, textAlign: 'center' }}>
            Slow connection detected. Please check your internet and try again.
          </Text>
        )}
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="modal"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen name="trip/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen
          name="add-receipt"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
        <Stack.Screen name="subscription" options={{ headerShown: false }} />
        <Stack.Screen
          name="notification-settings"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="connected-accounts"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="trusted-emails" options={{ headerShown: false }} />
        <Stack.Screen name="add-trip" options={{ headerShown: false }} />
        <Stack.Screen name="edit-trip" options={{ headerShown: false }} />
        <Stack.Screen
          name="add-reservation"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="edit-reservation"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="edit-receipt"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="parse-email"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="boarding-pass"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="forgot-password"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="onboarding"
          options={{ headerShown: false, animation: 'fade' }}
        />
        <Stack.Screen
          name="login"
          options={{ headerShown: false, animation: 'fade' }}
        />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        // Max age for persisted cache: 24 hours
        maxAge: 1000 * 60 * 60 * 24,
        // Buster string — increment to invalidate old caches on app updates
        buster: 'v3',
      }}
      onSuccess={() => {
        // After restoring cached data from AsyncStorage, immediately invalidate
        // all queries to trigger background refetches. This ensures deleted items
        // don't reappear from stale persisted cache.
        queryClient.invalidateQueries();
      }}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <RootLayoutNav colorScheme={colorScheme} fontsLoaded={fontsLoaded} />
        <OfflineIndicator />
      </GestureHandlerRootView>
    </PersistQueryClientProvider>
  );
}

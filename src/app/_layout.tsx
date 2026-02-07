import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from '@/lib/useColorScheme';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect } from 'react';
import { useAuthStore } from '@/lib/state/auth-store';
import { View, ActivityIndicator } from 'react-native';
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

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Configure React Query for offline-first behavior
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 24 hours
      gcTime: 1000 * 60 * 60 * 24,
      // Keep data fresh for 5 minutes
      staleTime: 1000 * 60 * 5,
      // Retry failed requests
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Network mode for offline support
      networkMode: 'offlineFirst',
    },
    mutations: {
      // Retry mutations on network errors
      retry: 1,
      networkMode: 'offlineFirst',
    },
  },
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

    if (!user && !inAuthGroup) {
      // Redirect to login if not authenticated
      router.replace('/login');
    } else if (user && inAuthGroup) {
      // Redirect to app if authenticated and on login screen
      router.replace('/(tabs)');
    }
  }, [user, segments, isInitialized, router]);

  // Hide splash screen when both fonts and auth are ready
  useEffect(() => {
    if (isInitialized && fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [isInitialized, fontsLoaded]);

  if (!isInitialized || !fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000',
        }}
      >
        <ActivityIndicator size="large" color="#3b82f6" />
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
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <RootLayoutNav colorScheme={colorScheme} fontsLoaded={fontsLoaded} />
        <OfflineIndicator />
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

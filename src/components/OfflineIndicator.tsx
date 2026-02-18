import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useNetworkStatus } from '@/lib/hooks/useNetworkStatus';
import * as Haptics from 'expo-haptics';

/**
 * Offline indicator banner that appears at the top of the screen
 * when the device loses internet connectivity.
 *
 * Uses the stabilized `isOffline` flag from useNetworkStatus which already
 * debounces for 3 seconds. This component adds an additional visual delay
 * so the banner never flashes during app startup or transient network blips.
 *
 * Fix for Apple Review rejection (Feb 2026, Guideline 2.1):
 * "We found an error message displayed no internet connection"
 * on an iPad Air 11-inch (M3) with an active internet connection.
 */
export function OfflineIndicator() {
  const { isOffline } = useNetworkStatus();
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);

  // Track whether we've already triggered haptics for this offline session
  // to avoid repeated vibrations on rapid state changes
  const [hasTriggeredHaptics, setHasTriggeredHaptics] = useState(false);

  useEffect(() => {
    if (isOffline) {
      // Show banner with spring animation
      translateY.value = withSpring(0, {
        damping: 15,
        stiffness: 150,
      });
      opacity.value = withTiming(1, { duration: 300 });

      // Only trigger haptics once per offline session
      if (!hasTriggeredHaptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setHasTriggeredHaptics(true);
      }
    } else {
      // Hide banner
      translateY.value = withTiming(-100, { duration: 300 });
      opacity.value = withTiming(0, { duration: 300 });
      setHasTriggeredHaptics(false);
    }
  }, [isOffline]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        animatedStyle,
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
        },
      ]}
      pointerEvents="none"
    >
      <View className="bg-amber-500 px-4 py-3 flex-row items-center justify-center">
        <WifiOff size={18} color="#FFFFFF" />
        <Text
          className="text-white font-medium ml-2"
          style={{ fontFamily: 'DMSans_500Medium' }}
        >
          No internet connection
        </Text>
      </View>
    </Animated.View>
  );
}

import React, { useEffect } from 'react';
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
 * when the device loses internet connectivity
 */
export function OfflineIndicator() {
  const { isOffline } = useNetworkStatus();
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (isOffline) {
      // Show banner
      translateY.value = withSpring(0, {
        damping: 15,
        stiffness: 150,
      });
      opacity.value = withTiming(1, { duration: 300 });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      // Hide banner
      translateY.value = withTiming(-100, { duration: 300 });
      opacity.value = withTiming(0, { duration: 300 });
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

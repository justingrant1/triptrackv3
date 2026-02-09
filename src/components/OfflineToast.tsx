import React, { useEffect, useCallback } from 'react';
import { View, Text } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

interface OfflineToastProps {
  /** Whether to show the toast */
  visible: boolean;
  /** Message to display */
  message?: string;
  /** Called when the toast finishes auto-dismissing */
  onDismiss: () => void;
  /** How long to show the toast (ms). Default 2500 */
  duration?: number;
}

/**
 * Brief auto-dismissing toast that slides up from the bottom.
 * Used to inform the user that they're offline after a pull-to-refresh.
 */
export function OfflineToast({
  visible,
  message = "You're offline — showing saved data",
  onDismiss,
  duration = 2500,
}: OfflineToastProps) {
  const translateY = useSharedValue(100);
  const opacity = useSharedValue(0);

  const dismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (visible) {
      // Slide up, hold, then slide down
      opacity.value = withSequence(
        withTiming(1, { duration: 250 }),
        withDelay(duration, withTiming(0, { duration: 300 }))
      );
      translateY.value = withSequence(
        withTiming(0, { duration: 250 }),
        withDelay(
          duration,
          withTiming(100, { duration: 300 }, (finished) => {
            if (finished) {
              runOnJS(dismiss)();
            }
          })
        )
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      translateY.value = 100;
      opacity.value = 0;
    }
  }, [visible, duration, dismiss]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        animatedStyle,
        {
          position: 'absolute',
          bottom: 100,
          left: 20,
          right: 20,
          zIndex: 9999,
        },
      ]}
      pointerEvents="none"
    >
      <View
        style={{
          backgroundColor: 'rgba(30, 41, 59, 0.95)',
          borderRadius: 16,
          paddingHorizontal: 20,
          paddingVertical: 14,
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: 'rgba(71, 85, 105, 0.5)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
          elevation: 8,
        }}
      >
        <WifiOff size={18} color="#F59E0B" />
        <Text
          style={{
            color: '#F1F5F9',
            fontSize: 14,
            marginLeft: 10,
            flex: 1,
            fontFamily: 'DMSans_500Medium',
          }}
        >
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

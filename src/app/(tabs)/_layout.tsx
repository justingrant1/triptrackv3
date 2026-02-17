import React from 'react';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export const unstable_settings = {
  initialRouteName: 'trips',
};

function FloatingAIButton() {
  const router = useRouter();
  const pulse = useSharedValue(1);
  const glow = useSharedValue(0.6);

  React.useEffect(() => {
    // Breathing pulse animation
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    // Glow ring animation
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.6, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/modal');
  };

  return (
    <Pressable
      onPress={handlePress}
      style={styles.fabContainer}
      accessibilityLabel="Ask AI Concierge"
      accessibilityRole="button"
    >
      {/* Animated glow ring */}
      <Animated.View
        style={[styles.fabGlow, glowStyle]}
      />

      <Animated.View style={pulseStyle}>
        <LinearGradient
          colors={['#A855F7', '#7C3AED']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Sparkles size={26} color="#FFFFFF" />
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

export default function TabLayout() {
  return (
    <ErrorBoundary
      fallbackTitle="Tab Error"
      fallbackMessage="Something went wrong with this tab. Please try again."
    >
      <View style={styles.container}>
        <NativeTabs
          minimizeBehavior="onScrollDown"
          disableTransparentOnScrollEdge
        >
          <NativeTabs.Trigger name="trips">
            <Label>Trips</Label>
            <Icon sf={{ default: 'map', selected: 'map.fill' }} />
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="index">
            <Label>Today</Label>
            <Icon sf={{ default: 'safari', selected: 'safari.fill' }} />
          </NativeTabs.Trigger>

          {/* Hidden placeholder — AI is accessed via floating button */}
          <NativeTabs.Trigger name="ask-ai" hidden />

          <NativeTabs.Trigger name="receipts">
            <Label>Receipts</Label>
            <Icon sf="receipt" />
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="profile">
            <Label>Profile</Label>
            <Icon sf={{ default: 'person', selected: 'person.fill' }} />
          </NativeTabs.Trigger>
        </NativeTabs>

        {/* Floating AI Concierge Button */}
        <FloatingAIButton />
      </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fabContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 90 : 70,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  fabGlow: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#A855F7',
    opacity: 0.3,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
});

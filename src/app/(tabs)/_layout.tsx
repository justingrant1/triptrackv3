import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, Pressable, Platform } from 'react-native';
import { Compass, Map, Receipt, User, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export const unstable_settings = {
  initialRouteName: 'trips',
};

function TabBarIcon({ icon: Icon, color, focused }: { icon: typeof Compass; color: string; focused: boolean }) {
  const scale = useSharedValue(focused ? 1 : 0.9);
  
  React.useEffect(() => {
    scale.value = withSpring(focused ? 1.1 : 0.9, {
      damping: 15,
      stiffness: 200,
    });
  }, [focused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle} className="items-center justify-center">
      <Icon size={24} color={color} strokeWidth={focused ? 2.5 : 2} />
    </Animated.View>
  );
}

function AskAIButton() {
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
      style={{
        top: -20,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Animated glow ring */}
      <Animated.View
        style={[
          glowStyle,
          {
            position: 'absolute',
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: '#A855F7',
            opacity: 0.3,
          },
        ]}
      />
      
      <Animated.View style={pulseStyle}>
        <LinearGradient
          colors={['#A855F7', '#7C3AED']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
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
          }}
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
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#FFFFFF',
          tabBarInactiveTintColor: '#64748B',
          tabBarStyle: {
            position: 'absolute',
            backgroundColor: Platform.OS === 'ios' ? 'transparent' : 'rgba(10, 15, 28, 0.95)',
            borderTopWidth: 0,
            height: 88,
            paddingTop: 8,
            paddingBottom: 28,
            elevation: 0,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.1,
            shadowRadius: 12,
          },
          tabBarBackground: () => (
            Platform.OS === 'ios' ? (
              <BlurView
                intensity={80}
                tint="dark"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(10, 15, 28, 0.7)',
                  borderTopWidth: 1,
                  borderTopColor: 'rgba(51, 65, 85, 0.3)',
                }}
              />
            ) : null
          ),
          tabBarLabelStyle: {
            fontFamily: 'DMSans_500Medium',
            fontSize: 11,
            marginTop: 4,
          },
        }}
        initialRouteName="trips"
      >
      <Tabs.Screen
        name="trips"
        options={{
          title: 'Trips',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon icon={Map} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon icon={Compass} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="ask-ai"
        options={{
          title: '',
          tabBarButton: () => <AskAIButton />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
          },
        }}
      />
      <Tabs.Screen
        name="receipts"
        options={{
          title: 'Receipts',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon icon={Receipt} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon icon={User} color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
    </ErrorBoundary>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, Dimensions, FlatList, ViewToken } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  Plane,
  Mail,
  Sparkles,
  ChevronRight,
  Send,
  Radar,
  Clock,
  MapPin,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  interpolate,
  Extrapolate,
  useAnimatedScrollHandler,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/lib/state/auth-store';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Slide Data ──────────────────────────────────────────────

interface OnboardingSlide {
  id: string;
  type: 'hero' | 'import' | 'flight' | 'assistant';
  accentColor: string;
  gradient: [string, string];
}

const slides: OnboardingSlide[] = [
  {
    id: '1',
    type: 'hero',
    accentColor: '#3B82F6',
    gradient: ['#3B82F6', '#2563EB'],
  },
  {
    id: '2',
    type: 'import',
    accentColor: '#8B5CF6',
    gradient: ['#8B5CF6', '#7C3AED'],
  },
  {
    id: '3',
    type: 'flight',
    accentColor: '#10B981',
    gradient: ['#10B981', '#059669'],
  },
  {
    id: '4',
    type: 'assistant',
    accentColor: '#F59E0B',
    gradient: ['#F59E0B', '#D97706'],
  },
];

// ─── Slide 1: Hero ───────────────────────────────────────────

function HeroSlide() {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [1, 1.08], [0.15, 0.35]),
    transform: [{ scale: interpolate(pulse.value, [1, 1.08], [1, 1.3]) }],
  }));

  return (
    <View className="flex-1 items-center justify-center px-8">
      {/* Animated glow ring */}
      <Animated.View
        style={[glowStyle, { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#3B82F6' }]}
      />

      {/* Icon container */}
      <Animated.View
        style={pulseStyle}
        className="w-36 h-36 rounded-full items-center justify-center mb-10"
      >
        <LinearGradient
          colors={['#3B82F6', '#6366F1']}
          style={{ width: 144, height: 144, borderRadius: 72, alignItems: 'center', justifyContent: 'center' }}
        >
          <Plane size={64} color="#FFFFFF" strokeWidth={1.5} />
        </LinearGradient>
      </Animated.View>

      {/* App name */}
      <Text
        className="text-white text-4xl font-bold text-center mb-3"
        style={{ fontFamily: 'DMSans_700Bold', letterSpacing: -0.5 }}
      >
        TripTrack
      </Text>

      {/* Tagline */}
      <Text
        className="text-slate-400 text-lg text-center"
        style={{ fontFamily: 'DMSans_400Regular', lineHeight: 26 }}
      >
        Your entire trip, in your pocket
      </Text>
    </View>
  );
}

// ─── Slide 2: Smart Import ───────────────────────────────────

function ImportSlide() {
  const methods = [
    {
      icon: Mail,
      color: '#3B82F6',
      bg: 'rgba(59,130,246,0.15)',
      title: 'Connect Gmail',
      desc: 'Auto-scan your inbox',
    },
    {
      icon: Sparkles,
      color: '#A855F7',
      bg: 'rgba(168,85,247,0.15)',
      title: 'AI Email Parser',
      desc: 'Paste any confirmation email',
    },
    {
      icon: Send,
      color: '#14B8A6',
      bg: 'rgba(20,184,166,0.15)',
      title: 'Forward Emails',
      desc: 'Send to your unique address',
    },
  ];

  return (
    <View className="flex-1 items-center justify-center px-8">
      {/* Heading */}
      <Text
        className="text-white text-3xl font-bold text-center mb-2"
        style={{ fontFamily: 'DMSans_700Bold', letterSpacing: -0.3 }}
      >
        Add trips effortlessly
      </Text>
      <Text
        className="text-slate-400 text-base text-center mb-10"
        style={{ fontFamily: 'DMSans_400Regular' }}
      >
        Three smart ways to import your travel plans
      </Text>

      {/* Method cards */}
      <View className="w-full gap-3">
        {methods.map((method, index) => {
          const Icon = method.icon;
          return (
            <Animated.View
              key={index}
              entering={FadeInDown.duration(400).delay(200 + index * 120)}
            >
              <View
                className="flex-row items-center rounded-2xl p-4 border"
                style={{
                  backgroundColor: method.bg,
                  borderColor: `${method.color}30`,
                }}
              >
                <View
                  className="w-11 h-11 rounded-xl items-center justify-center"
                  style={{ backgroundColor: `${method.color}25` }}
                >
                  <Icon size={22} color={method.color} />
                </View>
                <View className="flex-1 ml-3">
                  <Text
                    className="font-bold text-base"
                    style={{ fontFamily: 'DMSans_700Bold', color: method.color }}
                  >
                    {method.title}
                  </Text>
                  <Text
                    className="text-slate-400 text-sm mt-0.5"
                    style={{ fontFamily: 'DMSans_400Regular' }}
                  >
                    {method.desc}
                  </Text>
                </View>
              </View>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Slide 3: Live Flight Tracking ──────────────────────────

function FlightSlide() {
  const radarSpin = useSharedValue(0);

  useEffect(() => {
    radarSpin.value = withRepeat(
      withTiming(360, { duration: 4000, easing: Easing.linear }),
      -1,
      false,
    );
  }, []);

  const radarStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${radarSpin.value}deg` }],
  }));

  return (
    <View className="flex-1 items-center justify-center px-8">
      {/* Radar icon with rotation */}
      <View className="w-28 h-28 rounded-full items-center justify-center mb-8" style={{ backgroundColor: 'rgba(16,185,129,0.12)' }}>
        <Animated.View style={radarStyle}>
          <Radar size={56} color="#10B981" strokeWidth={1.5} />
        </Animated.View>
      </View>

      {/* Heading */}
      <Text
        className="text-white text-3xl font-bold text-center mb-2"
        style={{ fontFamily: 'DMSans_700Bold', letterSpacing: -0.3 }}
      >
        Real-time flight updates
      </Text>
      <Text
        className="text-slate-400 text-base text-center mb-10"
        style={{ fontFamily: 'DMSans_400Regular' }}
      >
        Gate changes, delays, and status — all automatic
      </Text>

      {/* Mini flight status mockup */}
      <View className="w-full">
        <Animated.View entering={FadeInDown.duration(400).delay(300)}>
          <View className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/40">
            {/* Flight header */}
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center">
                <Plane size={16} color="#10B981" />
                <Text className="text-white font-bold ml-2" style={{ fontFamily: 'DMSans_700Bold' }}>
                  AA 1234
                </Text>
              </View>
              <View className="bg-emerald-500/20 px-2.5 py-1 rounded-full">
                <Text className="text-emerald-400 text-xs font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                  On Time
                </Text>
              </View>
            </View>

            {/* Route */}
            <View className="flex-row items-center justify-between">
              <View className="items-center">
                <Text className="text-white text-lg font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>JFK</Text>
                <Text className="text-slate-500 text-xs" style={{ fontFamily: 'DMSans_400Regular' }}>New York</Text>
              </View>

              {/* Flight path line */}
              <View className="flex-1 mx-4 items-center">
                <View className="w-full h-px bg-slate-700" />
                <View className="absolute">
                  <Plane size={14} color="#10B981" style={{ transform: [{ rotate: '90deg' }] }} />
                </View>
              </View>

              <View className="items-center">
                <Text className="text-white text-lg font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>LAX</Text>
                <Text className="text-slate-500 text-xs" style={{ fontFamily: 'DMSans_400Regular' }}>Los Angeles</Text>
              </View>
            </View>

            {/* Status details */}
            <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-slate-700/40">
              <View className="flex-row items-center">
                <Clock size={12} color="#64748B" />
                <Text className="text-slate-400 text-xs ml-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                  Departs 2:30 PM
                </Text>
              </View>
              <View className="flex-row items-center">
                <MapPin size={12} color="#64748B" />
                <Text className="text-slate-400 text-xs ml-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                  Gate B22
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

// ─── Slide 4: AI Assistant ───────────────────────────────────

function AssistantSlide() {
  const sparkle = useSharedValue(0.8);

  useEffect(() => {
    sparkle.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.8, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const sparkleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sparkle.value }],
    opacity: interpolate(sparkle.value, [0.8, 1.15], [0.7, 1]),
  }));

  const chatBubbles = [
    { text: "What's the weather in Paris?", isUser: true },
    { text: '☀️ 72°F and sunny — perfect for sightseeing!', isUser: false },
    { text: 'When does my flight board?', isUser: true },
    { text: '🛫 Gate B22 boards at 2:10 PM — 45 min from now', isUser: false },
  ];

  return (
    <View className="flex-1 items-center justify-center px-8">
      {/* Sparkle icon */}
      <Animated.View style={sparkleStyle} className="mb-6">
        <View className="w-24 h-24 rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(245,158,11,0.12)' }}>
          <Sparkles size={48} color="#F59E0B" strokeWidth={1.5} />
        </View>
      </Animated.View>

      {/* Heading */}
      <Text
        className="text-white text-3xl font-bold text-center mb-2"
        style={{ fontFamily: 'DMSans_700Bold', letterSpacing: -0.3 }}
      >
        Ask anything about your trip
      </Text>
      <Text
        className="text-slate-400 text-base text-center mb-8"
        style={{ fontFamily: 'DMSans_400Regular' }}
      >
        Your AI knows your entire itinerary
      </Text>

      {/* Chat mockup */}
      <View className="w-full gap-2">
        {chatBubbles.map((bubble, index) => (
          <Animated.View
            key={index}
            entering={FadeInDown.duration(300).delay(300 + index * 150)}
            className={`flex-row ${bubble.isUser ? 'justify-end' : 'justify-start'}`}
          >
            <View
              className="rounded-2xl px-4 py-2.5 max-w-[85%]"
              style={{
                backgroundColor: bubble.isUser
                  ? 'rgba(59,130,246,0.2)'
                  : 'rgba(245,158,11,0.1)',
                borderWidth: 1,
                borderColor: bubble.isUser
                  ? 'rgba(59,130,246,0.3)'
                  : 'rgba(245,158,11,0.2)',
                borderBottomRightRadius: bubble.isUser ? 4 : 16,
                borderBottomLeftRadius: bubble.isUser ? 16 : 4,
              }}
            >
              <Text
                className="text-sm"
                style={{
                  fontFamily: 'DMSans_400Regular',
                  color: bubble.isUser ? '#93C5FD' : '#FCD34D',
                }}
              >
                {bubble.text}
              </Text>
            </View>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

// ─── Slide Renderer ──────────────────────────────────────────

function SlideContent({ item, index, scrollX }: { item: OnboardingSlide; index: number; scrollX: Animated.SharedValue<number> }) {
  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * SCREEN_WIDTH,
      index * SCREEN_WIDTH,
      (index + 1) * SCREEN_WIDTH,
    ];

    const scale = interpolate(scrollX.value, inputRange, [0.85, 1, 0.85], Extrapolate.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0, 1, 0], Extrapolate.CLAMP);
    const translateY = interpolate(scrollX.value, inputRange, [30, 0, 30], Extrapolate.CLAMP);

    return {
      transform: [{ scale }, { translateY }],
      opacity,
    };
  });

  return (
    <View style={{ width: SCREEN_WIDTH }}>
      <Animated.View style={[animatedStyle, { flex: 1 }]}>
        {item.type === 'hero' && <HeroSlide />}
        {item.type === 'import' && <ImportSlide />}
        {item.type === 'flight' && <FlightSlide />}
        {item.type === 'assistant' && <AssistantSlide />}
      </Animated.View>
    </View>
  );
}

// ─── Paginator ───────────────────────────────────────────────

function Paginator({ data, scrollX }: { data: OnboardingSlide[]; scrollX: Animated.SharedValue<number> }) {
  return (
    <View className="flex-row justify-center items-center mb-6">
      {data.map((_, index) => {
        const animatedStyle = useAnimatedStyle(() => {
          const inputRange = [
            (index - 1) * SCREEN_WIDTH,
            index * SCREEN_WIDTH,
            (index + 1) * SCREEN_WIDTH,
          ];

          const width = interpolate(scrollX.value, inputRange, [8, 28, 8], Extrapolate.CLAMP);
          const opacity = interpolate(scrollX.value, inputRange, [0.25, 1, 0.25], Extrapolate.CLAMP);
          const bgOpacity = interpolate(scrollX.value, inputRange, [0.3, 1, 0.3], Extrapolate.CLAMP);

          return { width, opacity: bgOpacity };
        });

        return (
          <Animated.View
            key={index}
            style={[animatedStyle, { backgroundColor: data[index].accentColor }]}
            className="h-2 rounded-full mx-1"
          />
        );
      })}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useSharedValue(0);
  const slidesRef = useRef<FlatList>(null);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const viewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index || 0);
    }
  }).current;

  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (currentIndex < slides.length - 1) {
      slidesRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      handleGetStarted();
    }
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    handleGetStarted();
  };

  const handleGetStarted = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Mark onboarding as complete
    await AsyncStorage.setItem('onboarding_complete', 'true');

    // If already authenticated (e.g. signed up via Apple Sign-In), go straight to tabs
    const currentUser = useAuthStore.getState().user;
    if (currentUser) {
      router.replace('/(tabs)');
    } else {
      router.replace('/login');
    }
  };

  const isLastSlide = currentIndex === slides.length - 1;
  const currentSlide = slides[currentIndex];

  return (
    <View className="flex-1 bg-slate-950">
      <LinearGradient
        colors={['#0F172A', '#020617']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        {/* Skip Button */}
        {!isLastSlide && (
          <Animated.View
            entering={FadeInDown.duration(500)}
            className="absolute top-4 right-5 z-10"
          >
            <Pressable
              onPress={handleSkip}
              className="px-4 py-2 rounded-full"
              style={{ backgroundColor: 'rgba(100,116,139,0.15)' }}
            >
              <Text
                className="text-slate-500 font-medium text-sm"
                style={{ fontFamily: 'DMSans_500Medium' }}
              >
                Skip
              </Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Slides */}
        <Animated.FlatList
          data={slides}
          renderItem={({ item, index }) => (
            <SlideContent item={item} index={index} scrollX={scrollX} />
          )}
          horizontal
          showsHorizontalScrollIndicator={false}
          pagingEnabled
          bounces={false}
          keyExtractor={(item) => item.id}
          onScroll={scrollHandler}
          onViewableItemsChanged={viewableItemsChanged}
          viewabilityConfig={viewConfig}
          ref={slidesRef}
          scrollEventThrottle={16}
        />

        {/* Bottom Section */}
        <View className="px-6 pb-6">
          <Paginator data={slides} scrollX={scrollX} />

          {/* Next / Get Started Button */}
          <Pressable
            onPress={handleNext}
            className="rounded-2xl overflow-hidden"
            style={{
              shadowColor: currentSlide.accentColor,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.35,
              shadowRadius: 12,
              elevation: 8,
            }}
          >
            <LinearGradient
              colors={currentSlide.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ paddingVertical: 18, paddingHorizontal: 32 }}
              className="flex-row items-center justify-center"
            >
              <Text
                className="text-white text-lg font-bold mr-2"
                style={{ fontFamily: 'DMSans_700Bold' }}
              >
                {isLastSlide ? 'Get Started' : 'Next'}
              </Text>
              <ChevronRight size={22} color="#FFFFFF" />
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

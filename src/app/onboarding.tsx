import React, { useState, useRef } from 'react';
import { View, Text, Pressable, Dimensions, FlatList, ViewToken } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Plane, Mail, Sparkles, ChevronRight } from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  interpolate,
  Extrapolate,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingSlide {
  id: string;
  icon: typeof Plane;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  gradient: [string, string];
}

const slides: OnboardingSlide[] = [
  {
    id: '1',
    icon: Plane,
    iconColor: '#3B82F6',
    iconBg: '#3B82F620',
    title: 'Track All Your Trips',
    description: 'Organize flights, hotels, car rentals, and more in one beautiful app. Never lose a confirmation again.',
    gradient: ['#3B82F6', '#2563EB'],
  },
  {
    id: '2',
    icon: Mail,
    iconColor: '#8B5CF6',
    iconBg: '#8B5CF620',
    title: 'Forward & Forget',
    description: 'Simply forward your travel confirmation emails. Our AI extracts all the details automatically.',
    gradient: ['#8B5CF6', '#7C3AED'],
  },
  {
    id: '3',
    icon: Sparkles,
    iconColor: '#F59E0B',
    iconBg: '#F59E0B20',
    title: 'AI Travel Assistant',
    description: 'Ask questions about your trips, get weather updates, and receive smart recommendations.',
    gradient: ['#F59E0B', '#D97706'],
  },
];

function OnboardingSlide({ item, index, scrollX }: { item: OnboardingSlide; index: number; scrollX: Animated.SharedValue<number> }) {
  const Icon = item.icon;

  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * SCREEN_WIDTH,
      index * SCREEN_WIDTH,
      (index + 1) * SCREEN_WIDTH,
    ];

    const scale = interpolate(
      scrollX.value,
      inputRange,
      [0.8, 1, 0.8],
      Extrapolate.CLAMP
    );

    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0.3, 1, 0.3],
      Extrapolate.CLAMP
    );

    return {
      transform: [{ scale }],
      opacity,
    };
  });

  return (
    <View style={{ width: SCREEN_WIDTH }} className="flex-1 items-center justify-center px-8">
      <Animated.View style={animatedStyle} className="items-center">
        {/* Icon */}
        <View
          style={{ backgroundColor: item.iconBg }}
          className="w-32 h-32 rounded-full items-center justify-center mb-12"
        >
          <Icon size={64} color={item.iconColor} strokeWidth={1.5} />
        </View>

        {/* Title */}
        <Text
          className="text-white text-3xl font-bold text-center mb-4"
          style={{ fontFamily: 'DMSans_700Bold' }}
        >
          {item.title}
        </Text>

        {/* Description */}
        <Text
          className="text-slate-400 text-lg text-center leading-7"
          style={{ fontFamily: 'DMSans_400Regular' }}
        >
          {item.description}
        </Text>
      </Animated.View>
    </View>
  );
}

function Paginator({ data, scrollX }: { data: OnboardingSlide[]; scrollX: Animated.SharedValue<number> }) {
  return (
    <View className="flex-row justify-center items-center mb-8">
      {data.map((_, index) => {
        const animatedStyle = useAnimatedStyle(() => {
          const inputRange = [
            (index - 1) * SCREEN_WIDTH,
            index * SCREEN_WIDTH,
            (index + 1) * SCREEN_WIDTH,
          ];

          const width = interpolate(
            scrollX.value,
            inputRange,
            [8, 24, 8],
            Extrapolate.CLAMP
          );

          const opacity = interpolate(
            scrollX.value,
            inputRange,
            [0.3, 1, 0.3],
            Extrapolate.CLAMP
          );

          return {
            width,
            opacity,
          };
        });

        return (
          <Animated.View
            key={index}
            style={[animatedStyle]}
            className="h-2 rounded-full bg-blue-500 mx-1"
          />
        );
      })}
    </View>
  );
}

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
    
    // Navigate to login
    router.replace('/login');
  };

  const isLastSlide = currentIndex === slides.length - 1;

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
            className="absolute top-4 right-4 z-10"
          >
            <Pressable
              onPress={handleSkip}
              className="bg-slate-800/50 px-4 py-2 rounded-full"
            >
              <Text
                className="text-slate-400 font-medium"
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
            <OnboardingSlide item={item} index={index} scrollX={scrollX} />
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
        <View className="px-8 pb-8">
          <Paginator data={slides} scrollX={scrollX} />

          {/* Next/Get Started Button */}
          <Animated.View entering={FadeInUp.duration(500).delay(200)}>
            <Pressable
              onPress={handleNext}
              className="rounded-2xl overflow-hidden"
            >
              <LinearGradient
                colors={slides[currentIndex].gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                className="py-4 px-8 flex-row items-center justify-center"
              >
                <Text
                  className="text-white text-lg font-bold mr-2"
                  style={{ fontFamily: 'DMSans_700Bold' }}
                >
                  {isLastSlide ? 'Get Started' : 'Next'}
                </Text>
                <ChevronRight size={24} color="#FFFFFF" />
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}

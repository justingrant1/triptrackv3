import React from 'react';
import { View, Text, ScrollView, Pressable, Image, Dimensions, ActivityIndicator, RefreshControl, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  Plane,
  Building2,
  Car,
  Calendar,
  ChevronRight,
  Plus,
  MapPin,
  Mail,
  AlertCircle,
  Trash2,
  Edit3,
  Search,
  X,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeInRight,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useTrips, useDeleteTrip } from '@/lib/hooks/useTrips';
import type { Trip } from '@/lib/types/database';
import { formatDateRange, getDaysUntil } from '@/lib/utils';
import { getWeatherIcon } from '@/lib/weather';
import { useWeather } from '@/lib/hooks/useWeather';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;

// Skeleton Loader Components
function TripCardSkeleton({ index }: { index: number }) {
  const shimmer = useSharedValue(0);

  React.useEffect(() => {
    shimmer.value = withTiming(1, { duration: 1500 });
    const interval = setInterval(() => {
      shimmer.value = 0;
      shimmer.value = withTiming(1, { duration: 1500 });
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: shimmer.value * 0.5 + 0.5,
  }));

  return (
    <Animated.View 
      entering={FadeInDown.duration(500).delay(index * 100)}
      className="mb-4"
      style={{ width: CARD_WIDTH }}
    >
      <View className="rounded-3xl overflow-hidden bg-slate-800/50">
        {/* Image Skeleton */}
        <Animated.View 
          style={shimmerStyle}
          className="h-44 bg-slate-700/50"
        />
        
        {/* Bottom Section Skeleton */}
        <View className="px-4 py-3">
          <Animated.View 
            style={shimmerStyle}
            className="h-4 bg-slate-700/50 rounded w-32"
          />
        </View>
      </View>
    </Animated.View>
  );
}

function CompactTripCardSkeleton({ index }: { index: number }) {
  const shimmer = useSharedValue(0);

  React.useEffect(() => {
    shimmer.value = withTiming(1, { duration: 1500 });
    const interval = setInterval(() => {
      shimmer.value = 0;
      shimmer.value = withTiming(1, { duration: 1500 });
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: shimmer.value * 0.5 + 0.5,
  }));

  return (
    <Animated.View 
      entering={FadeInRight.duration(400).delay(index * 80)}
      className="bg-slate-800/50 rounded-2xl p-4 flex-row items-center border border-slate-700/50 mb-3"
    >
      <Animated.View 
        style={shimmerStyle}
        className="w-14 h-14 rounded-xl bg-slate-700/50"
      />
      <View className="flex-1 ml-3">
        <Animated.View 
          style={shimmerStyle}
          className="h-4 bg-slate-700/50 rounded w-32 mb-2"
        />
        <Animated.View 
          style={shimmerStyle}
          className="h-3 bg-slate-700/50 rounded w-24 mb-2"
        />
        <Animated.View 
          style={shimmerStyle}
          className="h-3 bg-slate-700/50 rounded w-28"
        />
      </View>
    </Animated.View>
  );
}

function TripCard({ trip, index }: { trip: Trip; index: number }) {
  const router = useRouter();
  const deleteTrip = useDeleteTrip();
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
    ],
  }));

  const actionButtonsStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < -20 ? 1 : 0,
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const handlePress = () => {
    if (translateX.value < -10) {
      // If swiped, reset instead of navigating
      translateX.value = withSpring(0);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/trip/${trip.id}`);
  };

  const handleEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    translateX.value = withSpring(0);
    router.push(`/edit-trip?id=${trip.id}`);
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    translateX.value = withSpring(0);
    
    Alert.alert(
      'Delete Trip',
      `Are you sure you want to delete "${trip.name}"? This will also delete all reservations and receipts.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeleting(true);
              await deleteTrip.mutateAsync(trip.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error: any) {
              setIsDeleting(false);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Error', error.message || 'Failed to delete trip');
            }
          },
        },
      ]
    );
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      // Only allow left swipe
      if (event.translationX < 0) {
        translateX.value = Math.max(event.translationX, -140);
      }
    })
    .onEnd(() => {
      if (translateX.value < -70) {
        // Snap to open
        translateX.value = withSpring(-140);
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
      } else {
        // Snap to closed
        translateX.value = withSpring(0);
      }
    });

  const daysUntil = getDaysUntil(new Date(trip.start_date));
  const isActive = trip.status === 'active';
  const isUpcoming = trip.status === 'upcoming';
  const { data: weather } = useWeather(trip.destination);

  const getStatusBadge = () => {
    if (isActive) {
      return (
        <View className="bg-emerald-500/90 px-3 py-1 rounded-full flex-row items-center">
          <View className="w-1.5 h-1.5 rounded-full bg-white mr-1.5" />
          <Text className="text-white text-xs font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
            Active
          </Text>
        </View>
      );
    }
    if (isUpcoming && daysUntil <= 14) {
      return (
        <View className="bg-blue-500/90 px-3 py-1 rounded-full">
          <Text className="text-white text-xs font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
            {daysUntil === 0 ? 'Starts today' : daysUntil === 1 ? 'Starts tomorrow' : `Starts in ${daysUntil} days`}
          </Text>
        </View>
      );
    }
    return null;
  };

  if (isDeleting) {
    return (
      <Animated.View 
        exiting={FadeOut.duration(300)}
        className="mb-4"
        style={{ width: CARD_WIDTH }}
      >
        <View className="rounded-3xl overflow-hidden bg-slate-800/50 h-44 items-center justify-center">
          <ActivityIndicator size="large" color="#EF4444" />
          <Text className="text-slate-400 mt-2" style={{ fontFamily: 'DMSans_400Regular' }}>
            Deleting...
          </Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(500).delay(index * 100)} className="mb-4">
      {/* Action Buttons Background */}
      <Animated.View 
        style={[actionButtonsStyle]}
        className="absolute right-0 top-0 bottom-0 flex-row items-center gap-2 pr-5"
      >
        <Pressable
          onPress={handleEdit}
          className="bg-blue-500 w-16 h-16 rounded-2xl items-center justify-center"
        >
          <Edit3 size={24} color="#FFFFFF" />
        </Pressable>
        <Pressable
          onPress={handleDelete}
          className="bg-red-500 w-16 h-16 rounded-2xl items-center justify-center"
        >
          <Trash2 size={24} color="#FFFFFF" />
        </Pressable>
      </Animated.View>

      {/* Swipeable Card */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={animatedStyle}>
          <Pressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={handlePress}
          >
            <View className="rounded-3xl overflow-hidden" style={{ width: CARD_WIDTH }}>
            {/* Cover Image */}
            <View className="h-44 relative">
              <Image
                source={{ uri: trip.cover_image ?? 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800' }}
                className="w-full h-full"
                resizeMode="cover"
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.8)']}
                style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 100 }}
              />

              {/* Status Badge */}
              <View className="absolute top-4 right-4">
                {getStatusBadge()}
              </View>

              {/* Trip Info Overlay */}
              <View className="absolute bottom-4 left-4 right-4">
                <Text className="text-white text-xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                  {trip.name}
                </Text>
                <View className="flex-row items-center mt-1">
                  <MapPin size={14} color="#94A3B8" />
                  <Text className="text-slate-300 text-sm ml-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                    {trip.destination}
                  </Text>
                  {(isActive || isUpcoming) && weather && (
                    <Text className="text-slate-400 text-sm ml-1.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                      · {weather.temperature}° {getWeatherIcon(weather.condition)}
                    </Text>
                  )}
                </View>
              </View>
            </View>

            {/* Bottom Section - Date */}
            <View className="bg-slate-800/90 px-4 py-3 flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Calendar size={14} color="#64748B" />
                <Text className="text-slate-400 text-sm ml-1.5" style={{ fontFamily: 'DMSans_500Medium' }}>
                  {formatDateRange(new Date(trip.start_date), new Date(trip.end_date))}
                </Text>
              </View>
              <ChevronRight size={16} color="#64748B" />
            </View>
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

function CompactTripCard({ trip, index }: { trip: Trip; index: number }) {
  const router = useRouter();
  const deleteTrip = useDeleteTrip();
  const translateX = useSharedValue(0);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const actionButtonsStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < -20 ? 1 : 0,
  }));

  const handlePress = () => {
    if (translateX.value < -10) {
      translateX.value = withSpring(0);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/trip/${trip.id}`);
  };

  const handleEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    translateX.value = withSpring(0);
    router.push(`/edit-trip?id=${trip.id}`);
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    translateX.value = withSpring(0);
    
    Alert.alert(
      'Delete Trip',
      `Are you sure you want to delete "${trip.name}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeleting(true);
              await deleteTrip.mutateAsync(trip.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error: any) {
              setIsDeleting(false);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Error', error.message || 'Failed to delete trip');
            }
          },
        },
      ]
    );
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      if (event.translationX < 0) {
        translateX.value = Math.max(event.translationX, -140);
      }
    })
    .onEnd(() => {
      if (translateX.value < -70) {
        translateX.value = withSpring(-140);
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
      } else {
        translateX.value = withSpring(0);
      }
    });

  if (isDeleting) {
    return (
      <Animated.View 
        exiting={FadeOut.duration(300)}
        className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 mb-3 items-center justify-center"
        style={{ height: 86 }}
      >
        <ActivityIndicator size="small" color="#EF4444" />
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInRight.duration(400).delay(index * 80)} className="mb-3">
      {/* Action Buttons Background */}
      <Animated.View 
        style={[actionButtonsStyle]}
        className="absolute right-0 top-0 bottom-0 flex-row items-center gap-2 pr-5"
      >
        <Pressable
          onPress={handleEdit}
          className="bg-blue-500 w-12 h-12 rounded-xl items-center justify-center"
        >
          <Edit3 size={18} color="#FFFFFF" />
        </Pressable>
        <Pressable
          onPress={handleDelete}
          className="bg-red-500 w-12 h-12 rounded-xl items-center justify-center"
        >
          <Trash2 size={18} color="#FFFFFF" />
        </Pressable>
      </Animated.View>

      {/* Swipeable Card */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={animatedStyle}>
          <Pressable
            onPress={handlePress}
            className="bg-slate-800/50 rounded-2xl p-4 flex-row items-center border border-slate-700/50"
          >
        <Image
          source={{ uri: trip.cover_image ?? 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=200' }}
          className="w-14 h-14 rounded-xl"
          resizeMode="cover"
        />
        <View className="flex-1 ml-3">
          <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
            {trip.name}
          </Text>
          <Text className="text-slate-400 text-sm mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
            {trip.destination}
          </Text>
          <Text className="text-slate-500 text-xs mt-1" style={{ fontFamily: 'SpaceMono_400Regular' }}>
            {formatDateRange(new Date(trip.start_date), new Date(trip.end_date))}
          </Text>
        </View>
            <ChevronRight size={18} color="#64748B" />
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

export default function TripsScreen() {
  const router = useRouter();
  const { data: trips = [], isLoading, error, refetch } = useTrips();
  const [refreshing, setRefreshing] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [showSearch, setShowSearch] = React.useState(false);

  // Filter trips based on search query
  const filteredTrips = React.useMemo(() => {
    if (!searchQuery.trim()) return trips;
    
    const query = searchQuery.toLowerCase();
    return trips.filter(trip => 
      trip.name.toLowerCase().includes(query) ||
      trip.destination.toLowerCase().includes(query)
    );
  }, [trips, searchQuery]);

  const activeTrips = filteredTrips.filter((t) => t.status === 'active');
  const upcomingTrips = filteredTrips.filter((t) => t.status === 'upcoming');
  const pastTrips = filteredTrips.filter((t) => t.status === 'completed');

  const featuredTrips = [...activeTrips, ...upcomingTrips];

  const handleAddTrip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/add-trip');
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <View className="flex-1 bg-slate-950">
      <LinearGradient
        colors={['#0F172A', '#020617']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView className="flex-1" edges={['top']}>
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#3b82f6"
            />
          }
        >
          {/* Header */}
          <Animated.View
            entering={FadeInDown.duration(500)}
            className="px-5 pt-4 pb-4"
          >
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-1">
                <Text className="text-white text-2xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                  Your Trips
                </Text>
                <Text className="text-slate-400 text-sm mt-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                  {featuredTrips.length} upcoming · {pastTrips.length} completed
                </Text>
              </View>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowSearch(!showSearch);
                    if (showSearch) setSearchQuery('');
                  }}
                  className="bg-slate-800/80 p-3 rounded-full border border-slate-700/50"
                >
                  {showSearch ? (
                    <X size={20} color="#94A3B8" />
                  ) : (
                    <Search size={20} color="#94A3B8" />
                  )}
                </Pressable>
                <Pressable
                  onPress={handleAddTrip}
                  className="bg-blue-500 p-3 rounded-full"
                >
                  <Plus size={20} color="#FFFFFF" />
                </Pressable>
              </View>
            </View>

            {/* Search Bar */}
            {showSearch && (
              <Animated.View entering={FadeInDown.duration(300)}>
                <View className="bg-slate-800/80 rounded-xl px-4 py-3 flex-row items-center border border-slate-700/50">
                  <Search size={18} color="#64748B" />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search trips..."
                    placeholderTextColor="#64748B"
                    className="flex-1 text-white ml-2"
                    style={{ fontFamily: 'DMSans_400Regular', fontSize: 16 }}
                    autoFocus
                  />
                  {searchQuery.length > 0 && (
                    <Pressable
                      onPress={() => setSearchQuery('')}
                      className="p-1"
                    >
                      <X size={16} color="#64748B" />
                    </Pressable>
                  )}
                </View>
              </Animated.View>
            )}
          </Animated.View>

          {/* Loading State with Skeletons */}
          {isLoading && (
            <View className="px-5">
              <TripCardSkeleton index={0} />
              <TripCardSkeleton index={1} />
              <TripCardSkeleton index={2} />
            </View>
          )}

          {/* Error State */}
          {error && (
            <Animated.View
              entering={FadeInDown.duration(600)}
              className="mx-5 bg-red-500/10 rounded-3xl p-8 items-center border border-red-500/30"
            >
              <AlertCircle size={32} color="#EF4444" />
              <Text className="text-red-400 text-lg font-semibold text-center mt-4" style={{ fontFamily: 'DMSans_700Bold' }}>
                Failed to load trips
              </Text>
              <Text className="text-red-400/70 text-sm text-center mt-2" style={{ fontFamily: 'DMSans_400Regular' }}>
                {error.message}
              </Text>
              <Pressable
                onPress={() => refetch()}
                className="mt-4 bg-red-500 px-5 py-2.5 rounded-full"
              >
                <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                  Try Again
                </Text>
              </Pressable>
            </Animated.View>
          )}

          {/* Featured Trips */}
          {!isLoading && !error && featuredTrips.length > 0 && (
            <View className="px-5">
              {featuredTrips.map((trip, index) => (
                <TripCard key={trip.id} trip={trip} index={index} />
              ))}
            </View>
          )}

          {/* Empty State */}
          {!isLoading && !error && featuredTrips.length === 0 && (
            <Animated.View
              entering={FadeInDown.duration(600)}
              className="mx-5 bg-slate-800/30 rounded-3xl p-8 items-center border border-slate-700/30"
            >
              <View className="bg-slate-700/30 p-4 rounded-full mb-4">
                {searchQuery ? <Search size={32} color="#64748B" /> : <Plane size={32} color="#64748B" />}
              </View>
              <Text className="text-slate-300 text-lg font-semibold text-center" style={{ fontFamily: 'DMSans_700Bold' }}>
                {searchQuery ? 'No trips found' : 'No upcoming trips'}
              </Text>
              <Text className="text-slate-500 text-sm text-center mt-2 px-4" style={{ fontFamily: 'DMSans_400Regular' }}>
                {searchQuery 
                  ? `No trips match "${searchQuery}"`
                  : 'Forward your flight, hotel, and travel confirmation emails to get started'
                }
              </Text>
              {!searchQuery && (
                <Pressable
                  onPress={handleAddTrip}
                  className="mt-4 bg-blue-500 px-5 py-2.5 rounded-full flex-row items-center"
                >
                  <Mail size={16} color="#FFFFFF" />
                  <Text className="text-white font-semibold ml-2" style={{ fontFamily: 'DMSans_700Bold' }}>
                    How to Add Trips
                  </Text>
                </Pressable>
              )}
            </Animated.View>
          )}

          {/* Past Trips */}
          {!isLoading && !error && pastTrips.length > 0 && (
            <View className="mt-8 px-5 pb-8">
              <Text className="text-slate-300 text-sm font-semibold uppercase tracking-wider mb-4" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                Past Trips
              </Text>
              {pastTrips.map((trip, index) => (
                <CompactTripCard key={trip.id} trip={trip} index={index} />
              ))}
            </View>
          )}

          <View className="h-8" />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

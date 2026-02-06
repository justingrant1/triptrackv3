import React from 'react';
import { View, Text, ScrollView, Pressable, Image, Dimensions } from 'react-native';
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
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTripStore, Trip } from '@/lib/store';
import { formatDateRange, getDaysUntil } from '@/lib/utils';
import { getWeatherForDestination, getWeatherIcon } from '@/lib/weather';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;

function TripCard({ trip, index }: { trip: Trip; index: number }) {
  const router = useRouter();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/trip/${trip.id}`);
  };

  const daysUntil = getDaysUntil(trip.startDate);
  const isActive = trip.status === 'active';
  const isUpcoming = trip.status === 'upcoming';
  const weather = getWeatherForDestination(trip.destination);

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

  // Count reservations by type for quick stats
  const flightCount = trip.reservations.filter(r => r.type === 'flight').length;
  const hotelCount = trip.reservations.filter(r => r.type === 'hotel').length;
  const carCount = trip.reservations.filter(r => r.type === 'car').length;

  return (
    <Animated.View entering={FadeInDown.duration(500).delay(index * 100)}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        className="mb-4"
      >
        <Animated.View style={animatedStyle}>
          <View className="rounded-3xl overflow-hidden" style={{ width: CARD_WIDTH }}>
            {/* Cover Image */}
            <View className="h-44 relative">
              <Image
                source={{ uri: trip.coverImage ?? 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800' }}
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
                  {(isActive || isUpcoming) && (
                    <Text className="text-slate-400 text-sm ml-1.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                      · {weather.temperature}° {getWeatherIcon(weather.condition)}
                    </Text>
                  )}
                </View>
              </View>
            </View>

            {/* Bottom Section - Quick Stats */}
            <View className="bg-slate-800/90 px-4 py-3 flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Calendar size={14} color="#64748B" />
                <Text className="text-slate-400 text-sm ml-1.5" style={{ fontFamily: 'DMSans_500Medium' }}>
                  {formatDateRange(trip.startDate, trip.endDate)}
                </Text>
              </View>
              <View className="flex-row items-center">
                {flightCount > 0 && (
                  <View className="flex-row items-center mr-2">
                    <Plane size={12} color="#64748B" />
                    <Text className="text-slate-400 text-xs ml-1" style={{ fontFamily: 'DMSans_500Medium' }}>
                      {flightCount}
                    </Text>
                  </View>
                )}
                {hotelCount > 0 && (
                  <View className="flex-row items-center mr-2">
                    <Building2 size={12} color="#64748B" />
                    <Text className="text-slate-400 text-xs ml-1" style={{ fontFamily: 'DMSans_500Medium' }}>
                      {hotelCount}
                    </Text>
                  </View>
                )}
                {carCount > 0 && (
                  <View className="flex-row items-center mr-2">
                    <Car size={12} color="#64748B" />
                    <Text className="text-slate-400 text-xs ml-1" style={{ fontFamily: 'DMSans_500Medium' }}>
                      {carCount}
                    </Text>
                  </View>
                )}
                <ChevronRight size={16} color="#64748B" />
              </View>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function CompactTripCard({ trip, index }: { trip: Trip; index: number }) {
  const router = useRouter();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/trip/${trip.id}`);
  };

  return (
    <Animated.View entering={FadeInRight.duration(400).delay(index * 80)}>
      <Pressable
        onPress={handlePress}
        className="bg-slate-800/50 rounded-2xl p-4 flex-row items-center border border-slate-700/50 mb-3"
      >
        <Image
          source={{ uri: trip.coverImage ?? 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=200' }}
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
            {formatDateRange(trip.startDate, trip.endDate)}
          </Text>
        </View>
        <ChevronRight size={18} color="#64748B" />
      </Pressable>
    </Animated.View>
  );
}

export default function TripsScreen() {
  const router = useRouter();
  const trips = useTripStore((s) => s.trips);

  const activeTrips = trips.filter((t) => t.status === 'active');
  const upcomingTrips = trips.filter((t) => t.status === 'upcoming');
  const pastTrips = trips.filter((t) => t.status === 'completed');

  const featuredTrips = [...activeTrips, ...upcomingTrips];

  const handleAddTrip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/add-trip');
  };

  return (
    <View className="flex-1 bg-slate-950">
      <LinearGradient
        colors={['#0F172A', '#020617']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView className="flex-1" edges={['top']}>
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          {/* Header */}
          <Animated.View
            entering={FadeInDown.duration(500)}
            className="px-5 pt-4 pb-6"
          >
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-white text-2xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                  Your Trips
                </Text>
                <Text className="text-slate-400 text-sm mt-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                  {featuredTrips.length} upcoming · {pastTrips.length} completed
                </Text>
              </View>
              <Pressable
                onPress={handleAddTrip}
                className="bg-blue-500 p-3 rounded-full"
              >
                <Plus size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          </Animated.View>

          {/* Featured Trips */}
          {featuredTrips.length > 0 && (
            <View className="px-5">
              {featuredTrips.map((trip, index) => (
                <TripCard key={trip.id} trip={trip} index={index} />
              ))}
            </View>
          )}

          {/* Empty State */}
          {featuredTrips.length === 0 && (
            <Animated.View
              entering={FadeInDown.duration(600)}
              className="mx-5 bg-slate-800/30 rounded-3xl p-8 items-center border border-slate-700/30"
            >
              <View className="bg-slate-700/30 p-4 rounded-full mb-4">
                <Plane size={32} color="#64748B" />
              </View>
              <Text className="text-slate-300 text-lg font-semibold text-center" style={{ fontFamily: 'DMSans_700Bold' }}>
                No upcoming trips
              </Text>
              <Text className="text-slate-500 text-sm text-center mt-2 px-4" style={{ fontFamily: 'DMSans_400Regular' }}>
                Forward your flight, hotel, and travel confirmation emails to get started
              </Text>
              <Pressable
                onPress={handleAddTrip}
                className="mt-4 bg-blue-500 px-5 py-2.5 rounded-full flex-row items-center"
              >
                <Mail size={16} color="#FFFFFF" />
                <Text className="text-white font-semibold ml-2" style={{ fontFamily: 'DMSans_700Bold' }}>
                  How to Add Trips
                </Text>
              </Pressable>
            </Animated.View>
          )}

          {/* Past Trips */}
          {pastTrips.length > 0 && (
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

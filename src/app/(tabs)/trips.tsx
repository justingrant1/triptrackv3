import React from 'react';
import { View, Text, ScrollView, Pressable, Image, Dimensions, ActivityIndicator, RefreshControl, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  Plane,
  Building2,
  Car,
  Train,
  Users,
  Ticket,
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
  Sparkles,
  Lock,
  CheckCircle2,
  PenLine,
  Send,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeInRight,
  FadeOut,
  interpolate,
  Extrapolation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withRepeat,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useTrips, useDeleteTrip } from '@/lib/hooks/useTrips';
import { useReservationCounts } from '@/lib/hooks/useReservations';
import { useConnectedAccounts, useSyncGmail } from '@/lib/hooks/useConnectedAccounts';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { useForwardingAddress } from '@/lib/hooks/useProfile';
import { UpgradeModal } from '@/components/UpgradeModal';
import * as Clipboard from 'expo-clipboard';
import type { Trip } from '@/lib/types/database';
import { formatDateRange, getDaysUntil, parseDateOnly } from '@/lib/utils';
import { getWeatherIcon } from '@/lib/weather';
import { useWeather } from '@/lib/hooks/useWeather';
import { updateTripStatuses } from '@/lib/trip-status';
import { useAuthStore } from '@/lib/state/auth-store';
import { isNetworkError, isAuthError, getOfflineFriendlyMessage } from '@/lib/error-utils';
import { OfflineToast } from '@/components/OfflineToast';
import { WifiOff } from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;

// Skeleton Loader Components
function TripCardSkeleton({ index }: { index: number }) {
  const shimmer = useSharedValue(0);

  React.useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1500 }), -1, true);
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
    shimmer.value = withRepeat(withTiming(1, { duration: 1500 }), -1, true);
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

// Shared spring configs for buttery-smooth iOS feel
const SNAP_SPRING = { damping: 22, stiffness: 220, mass: 0.8 };
const CLOSE_SPRING = { damping: 26, stiffness: 300, mass: 0.7 };
const ACTION_SNAP_POINT = -148; // Width of action buttons area

function TripCard({ trip, index }: { trip: Trip; index: number }) {
  const router = useRouter();
  const deleteTrip = useDeleteTrip();
  const { data: reservationCounts } = useReservationCounts(trip.id);
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const contextX = useSharedValue(0);
  const hasTriggeredHaptic = useSharedValue(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
    ],
  }));

  // Smooth interpolated reveal for action buttons
  const actionButtonsStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, -40, -80],
      [0, 0.5, 1],
      Extrapolation.CLAMP
    );
    const buttonScale = interpolate(
      translateX.value,
      [0, -60, ACTION_SNAP_POINT],
      [0.6, 0.85, 1],
      Extrapolation.CLAMP
    );
    return {
      opacity,
      transform: [{ scale: buttonScale }],
    };
  });

  // Individual button animations for staggered reveal
  const editButtonStyle = useAnimatedStyle(() => {
    const buttonTranslateX = interpolate(
      translateX.value,
      [0, -80, ACTION_SNAP_POINT],
      [40, 10, 0],
      Extrapolation.CLAMP
    );
    return { transform: [{ translateX: buttonTranslateX }] };
  });

  const deleteButtonStyle = useAnimatedStyle(() => {
    const buttonTranslateX = interpolate(
      translateX.value,
      [0, -100, ACTION_SNAP_POINT],
      [60, 15, 0],
      Extrapolation.CLAMP
    );
    return { transform: [{ translateX: buttonTranslateX }] };
  });

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 200 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  };

  const handlePress = () => {
    if (translateX.value < -10) {
      translateX.value = withSpring(0, CLOSE_SPRING);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/trip/${trip.id}`);
  };

  const handleEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    translateX.value = withSpring(0, CLOSE_SPRING);
    router.push(`/edit-trip?id=${trip.id}`);
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    translateX.value = withSpring(0, CLOSE_SPRING);
    
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

  const tapGesture = Gesture.Tap()
    .onStart(() => {
      scale.value = withSpring(0.98, { damping: 15, stiffness: 200 });
    })
    .onEnd((_event, success) => {
      scale.value = withSpring(1, { damping: 15, stiffness: 200 });
      if (success) {
        // If card is swiped open, close it instead of navigating
        if (translateX.value < -10) {
          translateX.value = withSpring(0, CLOSE_SPRING);
        } else {
          runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
          runOnJS(router.push)(`/trip/${trip.id}`);
        }
      }
    });

  const panGesture = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onBegin(() => {
      contextX.value = translateX.value;
      hasTriggeredHaptic.value = false;
    })
    .onUpdate((event) => {
      const newX = contextX.value + event.translationX;
      
      // Clamp: no right-past-zero, rubber-band past snap point
      if (newX > 0) {
        // Rubber band right (resistance when trying to go past 0)
        translateX.value = newX * 0.15;
      } else if (newX < ACTION_SNAP_POINT) {
        // Rubber band left past snap point
        const overshoot = newX - ACTION_SNAP_POINT;
        translateX.value = ACTION_SNAP_POINT + overshoot * 0.2;
      } else {
        translateX.value = newX;
      }

      // Haptic feedback when crossing the snap threshold
      if (translateX.value < ACTION_SNAP_POINT * 0.5 && !hasTriggeredHaptic.value) {
        hasTriggeredHaptic.value = true;
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
      }
    })
    .onEnd((event) => {
      // Velocity-based: fast swipe left opens, fast swipe right closes
      if (event.velocityX < -500) {
        translateX.value = withSpring(ACTION_SNAP_POINT, SNAP_SPRING);
        return;
      }
      if (event.velocityX > 500) {
        translateX.value = withSpring(0, CLOSE_SPRING);
        return;
      }

      // Position-based: past halfway = snap open, otherwise close
      if (translateX.value < ACTION_SNAP_POINT * 0.45) {
        translateX.value = withSpring(ACTION_SNAP_POINT, SNAP_SPRING);
      } else {
        translateX.value = withSpring(0, CLOSE_SPRING);
      }
    });

  // Compose: pan takes priority over tap — both in same gesture system
  const composedGesture = Gesture.Race(panGesture, tapGesture);

  const daysUntil = getDaysUntil(parseDateOnly(trip.start_date));
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
      {/* Action Buttons — staggered reveal */}
      <Animated.View 
        style={[actionButtonsStyle]}
        className="absolute right-0 top-0 bottom-0 flex-row items-center gap-3 pr-4"
      >
        <Animated.View style={editButtonStyle}>
          <Pressable
            onPress={handleEdit}
            className="bg-blue-500 w-16 h-16 rounded-2xl items-center justify-center"
            style={{ shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 }}
          >
            <Edit3 size={22} color="#FFFFFF" />
          </Pressable>
        </Animated.View>
        <Animated.View style={deleteButtonStyle}>
          <Pressable
            onPress={handleDelete}
            className="bg-red-500 w-16 h-16 rounded-2xl items-center justify-center"
            style={{ shadowColor: '#EF4444', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 }}
          >
            <Trash2 size={22} color="#FFFFFF" />
          </Pressable>
        </Animated.View>
      </Animated.View>

      {/* Swipeable Card */}
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={animatedStyle}>
          <View
            style={{
              width: CARD_WIDTH,
              borderRadius: 28,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
              shadowColor: isActive ? '#10B981' : '#3B82F6',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.15,
              shadowRadius: 24,
              elevation: 8,
            }}
          >
            {/* Cover Image — taller for cinematic feel */}
            <View style={{ height: 208, position: 'relative' }}>
              <Image
                source={{ uri: trip.cover_image ?? 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800' }}
                className="w-full h-full"
                resizeMode="cover"
              />
              {/* 3-stop cinematic gradient */}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.88)']}
                locations={[0, 0.5, 1]}
                style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 140 }}
              />

              {/* Status Badge */}
              <View className="absolute top-4 right-4">
                {getStatusBadge()}
              </View>

              {/* Trip Info Overlay */}
              <View className="absolute bottom-4 left-5 right-5">
                <Text className="text-white text-xl font-bold" style={{ fontFamily: 'DMSans_700Bold', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}>
                  {trip.name}
                </Text>
                <View className="flex-row items-center mt-1.5">
                  <MapPin size={14} color="#CBD5E1" />
                  <Text className="text-slate-200 text-sm ml-1" style={{ fontFamily: 'DMSans_500Medium' }}>
                    {trip.destination}
                  </Text>
                  {(isActive || isUpcoming) && weather && (
                    <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginLeft: 8, flexDirection: 'row', alignItems: 'center' }}>
                      <Text className="text-white text-xs" style={{ fontFamily: 'DMSans_500Medium' }}>
                        {weather.temperature}° {getWeatherIcon(weather.condition)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Bottom Section — glassmorphic bar */}
            <View
              style={{
                backgroundColor: 'rgba(15,23,42,0.85)',
                paddingHorizontal: 16,
                paddingVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderTopWidth: 1,
                borderTopColor: 'rgba(255,255,255,0.06)',
              }}
            >
              <View className="flex-row items-center">
                <Calendar size={14} color="#64748B" />
                <Text className="text-slate-400 text-sm ml-1.5" style={{ fontFamily: 'DMSans_500Medium' }}>
                  {formatDateRange(parseDateOnly(trip.start_date), parseDateOnly(trip.end_date))}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                {/* Reservation Count Pill Badges */}
                {reservationCounts && (
                  <>
                    {reservationCounts.flight > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(59,130,246,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                        <Plane size={12} color="#60A5FA" />
                        <Text style={{ color: '#60A5FA', fontSize: 11, marginLeft: 4, fontFamily: 'DMSans_700Bold' }}>
                          {reservationCounts.flight}
                        </Text>
                      </View>
                    )}
                    {reservationCounts.hotel > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(139,92,246,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                        <Building2 size={12} color="#A78BFA" />
                        <Text style={{ color: '#A78BFA', fontSize: 11, marginLeft: 4, fontFamily: 'DMSans_700Bold' }}>
                          {reservationCounts.hotel}
                        </Text>
                      </View>
                    )}
                    {reservationCounts.car > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16,185,129,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                        <Car size={12} color="#34D399" />
                        <Text style={{ color: '#34D399', fontSize: 11, marginLeft: 4, fontFamily: 'DMSans_700Bold' }}>
                          {reservationCounts.car}
                        </Text>
                      </View>
                    )}
                    {reservationCounts.train > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245,158,11,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                        <Train size={12} color="#FBBF24" />
                        <Text style={{ color: '#FBBF24', fontSize: 11, marginLeft: 4, fontFamily: 'DMSans_700Bold' }}>
                          {reservationCounts.train}
                        </Text>
                      </View>
                    )}
                    {reservationCounts.event > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(6,182,212,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                        <Ticket size={12} color="#22D3EE" />
                        <Text style={{ color: '#22D3EE', fontSize: 11, marginLeft: 4, fontFamily: 'DMSans_700Bold' }}>
                          {reservationCounts.event}
                        </Text>
                      </View>
                    )}
                    {reservationCounts.meeting > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(236,72,153,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                        <Users size={12} color="#F472B6" />
                        <Text style={{ color: '#F472B6', fontSize: 11, marginLeft: 4, fontFamily: 'DMSans_700Bold' }}>
                          {reservationCounts.meeting}
                        </Text>
                      </View>
                    )}
                  </>
                )}
                <ChevronRight size={16} color="#475569" />
              </View>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const COMPACT_SNAP_POINT = -128; // Slightly smaller for compact cards

function CompactTripCard({ trip, index }: { trip: Trip; index: number }) {
  const router = useRouter();
  const deleteTrip = useDeleteTrip();
  const translateX = useSharedValue(0);
  const contextX = useSharedValue(0);
  const hasTriggeredHaptic = useSharedValue(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Smooth interpolated reveal
  const actionButtonsStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, -30, -70],
      [0, 0.4, 1],
      Extrapolation.CLAMP
    );
    const buttonScale = interpolate(
      translateX.value,
      [0, -50, COMPACT_SNAP_POINT],
      [0.5, 0.8, 1],
      Extrapolation.CLAMP
    );
    return {
      opacity,
      transform: [{ scale: buttonScale }],
    };
  });

  const editButtonStyle = useAnimatedStyle(() => {
    const x = interpolate(
      translateX.value,
      [0, -70, COMPACT_SNAP_POINT],
      [30, 8, 0],
      Extrapolation.CLAMP
    );
    return { transform: [{ translateX: x }] };
  });

  const deleteButtonStyle = useAnimatedStyle(() => {
    const x = interpolate(
      translateX.value,
      [0, -90, COMPACT_SNAP_POINT],
      [50, 12, 0],
      Extrapolation.CLAMP
    );
    return { transform: [{ translateX: x }] };
  });

  const handlePress = () => {
    if (translateX.value < -10) {
      translateX.value = withSpring(0, CLOSE_SPRING);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/trip/${trip.id}`);
  };

  const handleEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    translateX.value = withSpring(0, CLOSE_SPRING);
    router.push(`/edit-trip?id=${trip.id}`);
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    translateX.value = withSpring(0, CLOSE_SPRING);
    
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

  const tapGesture = Gesture.Tap()
    .onEnd((_event, success) => {
      if (success) {
        if (translateX.value < -10) {
          translateX.value = withSpring(0, CLOSE_SPRING);
        } else {
          runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
          runOnJS(router.push)(`/trip/${trip.id}`);
        }
      }
    });


  const panGesture = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onBegin(() => {
      contextX.value = translateX.value;
      hasTriggeredHaptic.value = false;
    })
    .onUpdate((event) => {
      const newX = contextX.value + event.translationX;
      
      if (newX > 0) {
        translateX.value = newX * 0.15;
      } else if (newX < COMPACT_SNAP_POINT) {
        const overshoot = newX - COMPACT_SNAP_POINT;
        translateX.value = COMPACT_SNAP_POINT + overshoot * 0.2;
      } else {
        translateX.value = newX;
      }

      if (translateX.value < COMPACT_SNAP_POINT * 0.5 && !hasTriggeredHaptic.value) {
        hasTriggeredHaptic.value = true;
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
      }
    })
    .onEnd((event) => {
      if (event.velocityX < -500) {
        translateX.value = withSpring(COMPACT_SNAP_POINT, SNAP_SPRING);
        return;
      }
      if (event.velocityX > 500) {
        translateX.value = withSpring(0, CLOSE_SPRING);
        return;
      }

      if (translateX.value < COMPACT_SNAP_POINT * 0.45) {
        translateX.value = withSpring(COMPACT_SNAP_POINT, SNAP_SPRING);
      } else {
        translateX.value = withSpring(0, CLOSE_SPRING);
      }
    });

  // Compose: pan takes priority over tap
  const composedGesture = Gesture.Race(panGesture, tapGesture);

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
      {/* Action Buttons — staggered reveal */}
      <Animated.View 
        style={[actionButtonsStyle]}
        className="absolute right-0 top-0 bottom-0 flex-row items-center gap-2 pr-3"
      >
        <Animated.View style={editButtonStyle}>
          <Pressable
            onPress={handleEdit}
            className="bg-blue-500 w-12 h-12 rounded-xl items-center justify-center"
            style={{ shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 4 }}
          >
            <Edit3 size={18} color="#FFFFFF" />
          </Pressable>
        </Animated.View>
        <Animated.View style={deleteButtonStyle}>
          <Pressable
            onPress={handleDelete}
            className="bg-red-500 w-12 h-12 rounded-xl items-center justify-center"
            style={{ shadowColor: '#EF4444', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 4 }}
          >
            <Trash2 size={18} color="#FFFFFF" />
          </Pressable>
        </Animated.View>
      </Animated.View>

      {/* Swipeable Card */}
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={animatedStyle}>
          <View
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
                {formatDateRange(parseDateOnly(trip.start_date), parseDateOnly(trip.end_date))}
              </Text>
            </View>
            <ChevronRight size={18} color="#64748B" />
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

// Auto-sync interval: 1 hour
const AUTO_SYNC_INTERVAL_MS = 60 * 60 * 1000;

export default function TripsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: trips = [], isLoading, error, refetch } = useTrips();
  const { data: connectedAccounts } = useConnectedAccounts();
  const syncGmail = useSyncGmail();
  const [refreshing, setRefreshing] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [showSearch, setShowSearch] = React.useState(false);
  const [showOfflineToast, setShowOfflineToast] = React.useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = React.useState(false);
  const hasAutoSynced = React.useRef(false);
  const { isPro } = useSubscription();
  const { data: forwardingAddress, isLoading: loadingAddress } = useForwardingAddress();
  const queryClient = useQueryClient();
  const hasGmailConnected = (connectedAccounts ?? []).some((a: any) => a.provider === 'gmail');

  // Refetch trips when screen gains focus (e.g. returning from add/edit)
  // Guard against race conditions: don't refetch while mutations are in-flight
  // to prevent stale server data from overwriting optimistic updates
  useFocusEffect(
    React.useCallback(() => {
      // Small delay to let any pending mutation settle first
      const timer = setTimeout(() => {
        // Skip refetch if any mutations (delete, update) are currently running
        // This prevents a stale GET response from overwriting the optimistic delete
        if (queryClient.isMutating() > 0) {
          console.log('[Trips] Skipping refetch — mutation in progress');
          return;
        }
        
        queryClient.refetchQueries({
          queryKey: ['trips'],
          type: 'active',
        });
      }, 300);
      return () => clearTimeout(timer);
    }, [queryClient])
  );

  // Determine if we should suppress the error and show cached data instead
  const hasCachedData = trips.length > 0;
  const isOfflineWithCache = !!error && isNetworkError(error) && hasCachedData;
  const isOfflineWithoutCache = !!error && isNetworkError(error) && !hasCachedData;
  const isRealError = !!error && !isNetworkError(error) && !isAuthError(error);

  // Auto-sync Gmail when screen loads (if connected and stale)
  React.useEffect(() => {
    if (hasAutoSynced.current) return;
    if (!connectedAccounts || connectedAccounts.length === 0) return;
    if (syncGmail.isPending) return;

    const gmailAccount = connectedAccounts.find(a => a.provider === 'gmail');
    if (!gmailAccount) return;

    // Check if last sync was more than 1 hour ago
    const lastSync = gmailAccount.last_sync ? new Date(gmailAccount.last_sync).getTime() : 0;
    const now = Date.now();
    
    if (now - lastSync > AUTO_SYNC_INTERVAL_MS) {
      hasAutoSynced.current = true;
      console.log('Auto-syncing Gmail (last sync:', gmailAccount.last_sync || 'never', ')');
      
      // Silent background sync — no UI feedback unless it finds new trips
      syncGmail.mutate({ accountId: gmailAccount.id }, {
        onSuccess: (data: any) => {
          if (data?.summary?.tripsCreated > 0 || data?.summary?.reservationsCreated > 0) {
            console.log('Auto-sync found new trips:', data.summary);
            // Refetch trips to show new ones
            refetch();
          }
        },
        onError: (err: any) => {
          // Silent failure — don't bother the user
          console.warn('Auto-sync failed:', err.message);
        },
      });
    }
  }, [connectedAccounts]);

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

  // Featured trips: active first, then upcoming — sorted soonest first (ascending)
  const featuredTrips = [...activeTrips, ...upcomingTrips].sort(
    (a, b) => parseDateOnly(a.start_date).getTime() - parseDateOnly(b.start_date).getTime()
  );

  // Past trips: most recent first (descending) — already in correct order from useTrips()
  // but explicitly sort to be safe after filtering
  const sortedPastTrips = pastTrips.sort(
    (a, b) => parseDateOnly(b.start_date).getTime() - parseDateOnly(a.start_date).getTime()
  );

  const handleAddTrip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/add-trip');
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    
    // Safety timeout: never let the spinner hang for more than 8 seconds
    const safetyTimer = setTimeout(() => setRefreshing(false), 8000);
    
    try {
      // Update trip statuses first
      if (user?.id) {
        await updateTripStatuses(user.id).catch(() => {});
      }
      
      // Trigger Gmail sync in the background (fire-and-forget)
      // Don't await — this can take 60-90+ seconds and would freeze the spinner
      if (connectedAccounts && connectedAccounts.length > 0) {
        const gmailAccount = connectedAccounts.find(a => a.provider === 'gmail');
        if (gmailAccount && !syncGmail.isPending) {
          syncGmail.mutate({ accountId: gmailAccount.id }, {
            onSuccess: (data: any) => {
              if (data?.summary?.tripsCreated > 0 || data?.summary?.reservationsCreated > 0) {
                console.log('Pull-to-refresh sync found new trips:', data.summary);
                refetch(); // Refresh trip list with new data
              }
            },
            onError: (err: any) => {
              if (!err.message?.includes('wait')) {
                console.warn('Pull-to-refresh sync failed:', err.message);
              }
            },
          });
        }
      }
      
      // Refetch local data (fast — ~200ms)
      const result = await refetch();
      
      // If refetch failed with a network error, show the offline toast
      if (result.error && isNetworkError(result.error)) {
        setShowOfflineToast(true);
      }
    } catch (err: any) {
      // Network error during refresh — show toast instead of error state
      if (isNetworkError(err)) {
        setShowOfflineToast(true);
      }
    }
    
    clearTimeout(safetyTimer);
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
          keyboardDismissMode="on-drag"
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
                <Text className="text-white text-3xl font-bold" style={{ fontFamily: 'DMSans_700Bold', letterSpacing: -0.5 }}>
                  Your Trips
                </Text>
                <View className="flex-row items-center mt-1.5 gap-3">
                  <View className="flex-row items-center">
                    <View className="w-2 h-2 rounded-full bg-blue-400 mr-1.5" />
                    <Text className="text-slate-400 text-sm" style={{ fontFamily: 'DMSans_500Medium' }}>
                      {featuredTrips.length} upcoming
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <View className="w-2 h-2 rounded-full bg-slate-500 mr-1.5" />
                    <Text className="text-slate-400 text-sm" style={{ fontFamily: 'DMSans_500Medium' }}>
                      {sortedPastTrips.length} completed
                    </Text>
                  </View>
                </View>
              </View>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowSearch(!showSearch);
                    if (showSearch) setSearchQuery('');
                  }}
                  style={{
                    backgroundColor: 'rgba(30,41,59,0.8)',
                    padding: 12,
                    borderRadius: 50,
                    borderWidth: 1,
                    borderColor: 'rgba(148,163,184,0.15)',
                  }}
                >
                  {showSearch ? (
                    <X size={20} color="#94A3B8" />
                  ) : (
                    <Search size={20} color="#94A3B8" />
                  )}
                </Pressable>
                <Pressable
                  onPress={handleAddTrip}
                >
                  <LinearGradient
                    colors={['#3B82F6', '#2563EB']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      padding: 12,
                      borderRadius: 50,
                      shadowColor: '#3B82F6',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.3,
                      shadowRadius: 8,
                      elevation: 6,
                    }}
                  >
                    <Plus size={20} color="#FFFFFF" />
                  </LinearGradient>
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

          {/* Offline with no cache — friendly offline message */}
          {isOfflineWithoutCache && (
            <Animated.View
              entering={FadeInDown.duration(600)}
              className="mx-5 bg-amber-500/10 rounded-3xl p-8 items-center border border-amber-500/30"
            >
              <WifiOff size={32} color="#F59E0B" />
              <Text className="text-amber-400 text-lg font-semibold text-center mt-4" style={{ fontFamily: 'DMSans_700Bold' }}>
                You're offline
              </Text>
              <Text className="text-amber-400/70 text-sm text-center mt-2" style={{ fontFamily: 'DMSans_400Regular' }}>
                {getOfflineFriendlyMessage(error, false)}
              </Text>
            </Animated.View>
          )}

          {/* Real error (not network, not auth) — show the error */}
          {isRealError && (
            <Animated.View
              entering={FadeInDown.duration(600)}
              className="mx-5 bg-red-500/10 rounded-3xl p-8 items-center border border-red-500/30"
            >
              <AlertCircle size={32} color="#EF4444" />
              <Text className="text-red-400 text-lg font-semibold text-center mt-4" style={{ fontFamily: 'DMSans_700Bold' }}>
                Failed to load trips
              </Text>
              <Text className="text-red-400/70 text-sm text-center mt-2" style={{ fontFamily: 'DMSans_400Regular' }}>
                {error?.message}
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

          {/* Featured Trips — show even when offline if we have cached data */}
          {!isLoading && (!error || isOfflineWithCache) && featuredTrips.length > 0 && (
            <View className="px-5">
              {featuredTrips.map((trip, index) => (
                <TripCard key={trip.id} trip={trip} index={index} />
              ))}
            </View>
          )}

          {/* Empty State — Search */}
          {!isLoading && !error && featuredTrips.length === 0 && !!searchQuery && (
            <Animated.View
              entering={FadeInDown.duration(600)}
              className="mx-5 bg-slate-800/30 rounded-3xl p-8 items-center border border-slate-700/30"
            >
              <View className="bg-slate-700/30 p-4 rounded-full mb-4">
                <Search size={32} color="#64748B" />
              </View>
              <Text className="text-slate-300 text-lg font-semibold text-center" style={{ fontFamily: 'DMSans_700Bold' }}>
                No trips found
              </Text>
              <Text className="text-slate-500 text-sm text-center mt-2 px-4" style={{ fontFamily: 'DMSans_400Regular' }}>
                {`No trips match "${searchQuery}"`}
              </Text>
            </Animated.View>
          )}

          {/* Empty State — Onboarding Pathways */}
          {!isLoading && !error && featuredTrips.length === 0 && !searchQuery && (
            <View className="px-5">
              {/* Hero */}
              <Animated.View
                entering={FadeInDown.duration(500).delay(0)}
                className="items-center mb-6"
              >
                <View
                  className="w-16 h-16 rounded-full items-center justify-center mb-4"
                  style={{ backgroundColor: 'rgba(59,130,246,0.15)' }}
                >
                  <Plane size={28} color="#3B82F6" />
                </View>
                <Text className="text-white text-xl font-bold text-center" style={{ fontFamily: 'DMSans_700Bold' }}>
                  Add Your First Trip
                </Text>
                <Text className="text-slate-400 text-sm text-center mt-1.5 px-6" style={{ fontFamily: 'DMSans_400Regular' }}>
                  Choose how you'd like to get started
                </Text>
              </Animated.View>

              {/* Card 1: Connect Gmail (recommended for Pro) */}
              <Animated.View entering={FadeInDown.duration(400).delay(80)}>
                {!hasGmailConnected ? (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (user && isPro) {
                        router.push('/connected-accounts');
                      } else if (user) {
                        setShowUpgradeModal(true);
                      } else {
                        router.push('/login');
                      }
                    }}
                    className="rounded-2xl p-4 mb-3 border"
                    style={{
                      backgroundColor: 'rgba(59,130,246,0.08)',
                      borderColor: 'rgba(59,130,246,0.25)',
                    }}
                  >
                    <View className="flex-row items-center">
                      <View className="p-2.5 rounded-xl" style={{ backgroundColor: 'rgba(59,130,246,0.2)' }}>
                        <Mail size={22} color="#3B82F6" />
                      </View>
                      <View className="flex-1 ml-3">
                        <View className="flex-row items-center">
                          <Text className="text-blue-400 font-bold text-base" style={{ fontFamily: 'DMSans_700Bold' }}>
                            Connect Gmail
                          </Text>
                          {(!user || !isPro) && (
                            <View className="bg-amber-500/20 px-2 py-0.5 rounded-full ml-2">
                              <Text className="text-amber-400 text-xs font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                                PRO
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text className="text-slate-400 text-sm mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                          {!user
                            ? 'Sign in to auto-scan your travel emails'
                            : !isPro
                              ? 'Upgrade to Pro to auto-scan your inbox'
                              : 'Auto-scan your inbox for travel bookings'}
                        </Text>
                      </View>
                      {!user || !isPro ? (
                        <Lock size={16} color="#64748B" />
                      ) : (
                        <ChevronRight size={18} color="#3B82F6" />
                      )}
                    </View>
                  </Pressable>
                ) : (
                  <View
                    className="rounded-2xl p-4 mb-3 border"
                    style={{
                      backgroundColor: 'rgba(16,185,129,0.08)',
                      borderColor: 'rgba(16,185,129,0.25)',
                    }}
                  >
                    <View className="flex-row items-center">
                      <View className="p-2.5 rounded-xl" style={{ backgroundColor: 'rgba(16,185,129,0.2)' }}>
                        <CheckCircle2 size={22} color="#10B981" />
                      </View>
                      <View className="flex-1 ml-3">
                        <Text className="text-emerald-400 font-bold text-base" style={{ fontFamily: 'DMSans_700Bold' }}>
                          Gmail Connected
                        </Text>
                        <Text className="text-slate-400 text-sm mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                          Your travel emails are being auto-scanned
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </Animated.View>

              {/* Card 2: AI Email Parser */}
              <Animated.View entering={FadeInDown.duration(400).delay(160)}>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push('/parse-email');
                  }}
                  className="rounded-2xl p-4 mb-3 border"
                  style={{
                    backgroundColor: 'rgba(168,85,247,0.08)',
                    borderColor: 'rgba(168,85,247,0.25)',
                  }}
                >
                  <View className="flex-row items-center">
                    <View className="p-2.5 rounded-xl" style={{ backgroundColor: 'rgba(168,85,247,0.2)' }}>
                      <Sparkles size={22} color="#A855F7" />
                    </View>
                    <View className="flex-1 ml-3">
                      <Text className="text-purple-400 font-bold text-base" style={{ fontFamily: 'DMSans_700Bold' }}>
                        AI Email Parser
                      </Text>
                      <Text className="text-slate-400 text-sm mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                        Paste a confirmation email — AI extracts the trip
                      </Text>
                    </View>
                    <ChevronRight size={18} color="#A855F7" />
                  </View>
                </Pressable>
              </Animated.View>

              {/* Card 3: Forward Emails */}
              <Animated.View entering={FadeInDown.duration(400).delay(240)}>
                <View
                  className="rounded-2xl p-4 mb-3 border"
                  style={{
                    backgroundColor: 'rgba(20,184,166,0.06)',
                    borderColor: 'rgba(20,184,166,0.2)',
                  }}
                >
                  <View className="flex-row items-start">
                    <View className="p-2.5 rounded-xl" style={{ backgroundColor: 'rgba(20,184,166,0.15)' }}>
                      <Send size={20} color="#14B8A6" />
                    </View>
                    <View className="flex-1 ml-3">
                      <Text className="text-teal-400 font-bold text-sm" style={{ fontFamily: 'DMSans_700Bold' }}>
                        Forward an Email
                      </Text>
                      <Text className="text-slate-500 text-xs mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                        Forward travel confirmations to your unique address
                      </Text>
                      {loadingAddress ? (
                        <View className="bg-slate-800/60 rounded-lg px-3 py-1.5 mt-2">
                          <ActivityIndicator size="small" color="#14B8A6" />
                        </View>
                      ) : forwardingAddress ? (
                        <Pressable
                          onPress={async () => {
                            await Clipboard.setStringAsync(forwardingAddress);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            Alert.alert('Copied!', 'Forwarding address copied to clipboard');
                          }}
                          className="bg-slate-800/60 rounded-lg px-3 py-1.5 mt-2 flex-row items-center justify-between"
                        >
                          <Text
                            className="text-teal-400 text-xs flex-1"
                            style={{ fontFamily: 'SpaceMono_400Regular' }}
                            numberOfLines={1}
                          >
                            {forwardingAddress}
                          </Text>
                          <Text className="text-slate-600 text-xs ml-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                            Copy
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                </View>
              </Animated.View>

              {/* Card 4: Create Manually */}
              <Animated.View entering={FadeInDown.duration(400).delay(320)}>
                <Pressable
                  onPress={handleAddTrip}
                  className="rounded-2xl p-4 mb-3 border"
                  style={{
                    backgroundColor: 'rgba(100,116,139,0.08)',
                    borderColor: 'rgba(100,116,139,0.2)',
                  }}
                >
                  <View className="flex-row items-center">
                    <View className="p-2.5 rounded-xl" style={{ backgroundColor: 'rgba(100,116,139,0.15)' }}>
                      <PenLine size={20} color="#94A3B8" />
                    </View>
                    <View className="flex-1 ml-3">
                      <Text className="text-slate-300 font-bold text-sm" style={{ fontFamily: 'DMSans_700Bold' }}>
                        Create Manually
                      </Text>
                      <Text className="text-slate-500 text-xs mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                        Enter trip details yourself
                      </Text>
                    </View>
                    <ChevronRight size={18} color="#64748B" />
                  </View>
                </Pressable>
              </Animated.View>
            </View>
          )}

          {/* Past Trips — show even when offline if we have cached data */}
          {!isLoading && (!error || isOfflineWithCache) && sortedPastTrips.length > 0 && (
            <View className="mt-8 px-5 pb-8">
              {/* Styled divider with label */}
              <View className="flex-row items-center mb-5">
                <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(51,65,85,0.5)' }} />
                <Text className="text-slate-500 text-xs font-semibold uppercase tracking-widest mx-4" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                  Past Trips
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(51,65,85,0.5)' }} />
              </View>
              {sortedPastTrips.map((trip, index) => (
                <CompactTripCard key={trip.id} trip={trip} index={index} />
              ))}
            </View>
          )}

          <View className="h-8" />
        </ScrollView>
      </SafeAreaView>

      {/* Offline toast — shown after pull-to-refresh fails */}
      <OfflineToast
        visible={showOfflineToast}
        onDismiss={() => setShowOfflineToast(false)}
      />

      {/* Upgrade Modal */}
      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason="gmail-connect"
      />
    </View>
  );
}

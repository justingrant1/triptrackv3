import React from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  Plane,
  Building2,
  Car,
  Users,
  Ticket,
  Train,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Clock,
  MapPin,
  Bell,
  Sparkles,
  Receipt,
  Navigation,
  Phone,
  CreditCard,
  Hash,
  Info,
  ExternalLink,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useUpcomingTrips } from '@/lib/hooks/useTrips';
import { useUpcomingReservations } from '@/lib/hooks/useReservations';
import type { Reservation } from '@/lib/types/database';
import { formatTime, formatDate, getCountdown, isToday, isTomorrow } from '@/lib/utils';
import { useAuthStore } from '@/lib/state/auth-store';
import { getWeatherIcon } from '@/lib/weather';
import { useWeather } from '@/lib/hooks/useWeather';

type ReservationType = Reservation['type'];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const ReservationIcon = ({ type, size = 20, color = '#FFFFFF' }: { type: ReservationType; size?: number; color?: string }) => {
  const icons: Record<ReservationType, React.ReactNode> = {
    flight: <Plane size={size} color={color} />,
    hotel: <Building2 size={size} color={color} />,
    car: <Car size={size} color={color} />,
    train: <Train size={size} color={color} />,
    meeting: <Users size={size} color={color} />,
    event: <Ticket size={size} color={color} />,
  };
  return icons[type] ?? <Plane size={size} color={color} />;
};

const getTypeColor = (type: ReservationType): [string, string] => {
  const colors: Record<ReservationType, [string, string]> = {
    flight: ['#3B82F6', '#1D4ED8'],
    hotel: ['#8B5CF6', '#6D28D9'],
    car: ['#10B981', '#047857'],
    train: ['#F59E0B', '#D97706'],
    meeting: ['#EC4899', '#BE185D'],
    event: ['#06B6D4', '#0891B2'],
  };
  return colors[type] ?? ['#6B7280', '#4B5563'];
};

/**
 * Open directions in user's choice of Apple Maps or Google Maps.
 * Shows an alert picker on iOS; on Android goes straight to Google Maps.
 */
function openDirections(destination: string, reservation?: Reservation) {
  // For flights, try to use the departure airport as the destination
  let query = destination;
  if (reservation?.type === 'flight') {
    const departureAirport = reservation.details?.['Departure Airport'];
    if (departureAirport) {
      query = `${departureAirport} Airport`;
    }
  }

  const encoded = encodeURIComponent(query);

  if (Platform.OS === 'ios') {
    Alert.alert(
      'Get Directions',
      `Navigate to ${query}`,
      [
        {
          text: 'Apple Maps',
          onPress: () => {
            Linking.openURL(`maps://?daddr=${encoded}&dirflg=d`).catch(() => {
              Linking.openURL(`https://maps.apple.com/?daddr=${encoded}`);
            });
          },
        },
        {
          text: 'Google Maps',
          onPress: () => {
            Linking.openURL(`comgooglemaps://?daddr=${encoded}&directionsmode=driving`).catch(() => {
              Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`);
            });
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  } else {
    // Android — use Google Maps intent
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`);
  }
}

/**
 * Render the expanded detail rows for a reservation.
 */
function ReservationDetails({ reservation }: { reservation: Reservation }) {
  const [primary] = getTypeColor(reservation.type);
  const details = reservation.details || {};
  const detailEntries = Object.entries(details).filter(
    ([_, value]) => value !== null && value !== undefined && value !== ''
  );

  return (
    <View className="mt-3 pt-3 border-t border-slate-700/50">
      {/* Confirmation Number */}
      {reservation.confirmation_number && (
        <View className="flex-row items-center mb-2.5">
          <Hash size={14} color="#64748B" />
          <Text className="text-slate-500 text-xs ml-2 w-24" style={{ fontFamily: 'DMSans_500Medium' }}>
            Confirmation
          </Text>
          <Text className="text-white text-sm flex-1" style={{ fontFamily: 'SpaceMono_700Bold' }}>
            {reservation.confirmation_number}
          </Text>
        </View>
      )}

      {/* Location / Address */}
      {reservation.location && (
        <View className="flex-row items-center mb-2.5">
          <MapPin size={14} color="#64748B" />
          <Text className="text-slate-500 text-xs ml-2 w-24" style={{ fontFamily: 'DMSans_500Medium' }}>
            Location
          </Text>
          <Text className="text-slate-300 text-sm flex-1" style={{ fontFamily: 'DMSans_400Regular' }}>
            {reservation.location}
          </Text>
        </View>
      )}

      {reservation.address && (
        <Pressable
          onPress={() => openDirections(reservation.address!, reservation)}
          className="flex-row items-center mb-2.5"
        >
          <Navigation size={14} color="#3B82F6" />
          <Text className="text-slate-500 text-xs ml-2 w-24" style={{ fontFamily: 'DMSans_500Medium' }}>
            Address
          </Text>
          <Text className="text-blue-400 text-sm flex-1 underline" style={{ fontFamily: 'DMSans_400Regular' }}>
            {reservation.address}
          </Text>
        </Pressable>
      )}

      {/* Time range */}
      {reservation.end_time && (
        <View className="flex-row items-center mb-2.5">
          <Clock size={14} color="#64748B" />
          <Text className="text-slate-500 text-xs ml-2 w-24" style={{ fontFamily: 'DMSans_500Medium' }}>
            Time
          </Text>
          <Text className="text-slate-300 text-sm flex-1" style={{ fontFamily: 'DMSans_400Regular' }}>
            {formatTime(new Date(reservation.start_time))} → {formatTime(new Date(reservation.end_time))}
          </Text>
        </View>
      )}

      {/* Dynamic detail fields */}
      {detailEntries.map(([key, value]) => (
        <View key={key} className="flex-row items-center mb-2.5">
          <Info size={14} color="#64748B" />
          <Text className="text-slate-500 text-xs ml-2 w-24" style={{ fontFamily: 'DMSans_500Medium' }}>
            {key}
          </Text>
          <Text className="text-slate-300 text-sm flex-1" style={{ fontFamily: 'DMSans_400Regular' }}>
            {String(value)}
          </Text>
        </View>
      ))}

      {/* Status */}
      {reservation.status && (
        <View className="flex-row items-center mb-1">
          <View
            className="w-2 h-2 rounded-full mr-2 ml-1"
            style={{
              backgroundColor:
                reservation.status === 'confirmed' ? '#10B981' :
                reservation.status === 'delayed' ? '#F59E0B' :
                reservation.status === 'cancelled' ? '#EF4444' : '#6B7280',
            }}
          />
          <Text className="text-slate-500 text-xs w-24" style={{ fontFamily: 'DMSans_500Medium' }}>
            Status
          </Text>
          <Text className="text-slate-300 text-sm capitalize" style={{ fontFamily: 'DMSans_500Medium' }}>
            {reservation.status}
          </Text>
        </View>
      )}
    </View>
  );
}

function NextUpCard({ reservation }: { reservation: Reservation }) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState(false);
  const [primary, secondary] = getTypeColor(reservation.type);
  const countdown = getCountdown(new Date(reservation.start_time));

  const pulseAnim = useSharedValue(1);

  React.useEffect(() => {
    pulseAnim.value = withRepeat(
      withTiming(1.08, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const handleToggleExpand = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setExpanded(!expanded);
  };

  // Get gate/seat info for flights
  const gateInfo = reservation.type === 'flight' && reservation.address ? reservation.address.split(',')[0] : null;
  const seatInfo = reservation.details?.['Seat'];

  // Get action label based on type
  const getActionLabel = () => {
    switch (reservation.type) {
      case 'flight': return countdown.urgent ? 'Board' : 'Departs';
      case 'hotel': return 'Check-in';
      case 'car': return 'Pickup';
      case 'meeting': return 'Starts';
      case 'train': return 'Departs';
      default: return 'Starts';
    }
  };

  return (
    <Pressable
      onPress={handleToggleExpand}
      className="mx-4 overflow-hidden rounded-3xl"
    >
      <Animated.View entering={FadeInDown.duration(600).springify()}>
        <LinearGradient
          colors={[primary, secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: 2, borderRadius: 24 }}
        >
          <View className="rounded-3xl bg-slate-900/95 p-6">
            {/* Top Row - Type & Countdown */}
            <View className="flex-row items-start justify-between mb-4">
              <View className="flex-row items-center flex-1">
                <Animated.View
                  style={[
                    animatedStyle,
                    {
                      backgroundColor: primary + '30',
                      padding: 14,
                      borderRadius: 18,
                    },
                  ]}
                >
                  <ReservationIcon type={reservation.type} size={28} color={primary} />
                </Animated.View>
                <View className="ml-4 flex-1">
                  <Text className="text-slate-400 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                    Next Up
                  </Text>
                  <Text className="text-white text-xl font-bold mt-1" style={{ fontFamily: 'DMSans_700Bold' }}>
                    {reservation.title}
                  </Text>
                  {reservation.subtitle && (
                    <Text className="text-slate-300 text-base mt-0.5" style={{ fontFamily: 'DMSans_500Medium' }}>
                      {reservation.subtitle}
                    </Text>
                  )}
                </View>
              </View>

              {/* Big Countdown */}
              <View className={`px-4 py-2 rounded-2xl ${countdown.urgent ? 'bg-amber-500/20' : 'bg-white/10'}`}>
                <Text className={`text-2xl font-bold ${countdown.urgent ? 'text-amber-400' : 'text-white'}`} style={{ fontFamily: 'SpaceMono_700Bold' }}>
                  {countdown.label}
                </Text>
                <Text className={`text-xs text-center ${countdown.urgent ? 'text-amber-400/80' : 'text-slate-400'}`} style={{ fontFamily: 'DMSans_500Medium' }}>
                  {getActionLabel()}
                </Text>
              </View>
            </View>

            {/* Quick Info Row - Gate/Seat for flights, Time/Location for others */}
            <View className="flex-row items-center bg-slate-800/50 rounded-xl p-3 mb-3">
              <Clock size={16} color="#94A3B8" />
              <Text className="text-white text-base ml-2 font-medium" style={{ fontFamily: 'SpaceMono_700Bold' }}>
                {formatTime(new Date(reservation.start_time))}
              </Text>

              {reservation.type === 'flight' && (gateInfo || seatInfo) && (
                <>
                  <View className="w-px h-4 bg-slate-600 mx-3" />
                  {gateInfo && (
                    <Text className="text-slate-300 text-sm" style={{ fontFamily: 'DMSans_500Medium' }}>
                      {gateInfo}
                    </Text>
                  )}
                  {seatInfo && (
                    <Text className="text-slate-400 text-sm ml-2" style={{ fontFamily: 'DMSans_400Regular' }}>
                      Seat {seatInfo.split(' ')[0]}
                    </Text>
                  )}
                </>
              )}
            </View>

            {reservation.address && reservation.type !== 'flight' && !expanded && (
              <View className="flex-row items-center mb-3">
                <MapPin size={14} color="#64748B" />
                <Text className="text-slate-400 text-sm ml-2 flex-1" numberOfLines={1} style={{ fontFamily: 'DMSans_400Regular' }}>
                  {reservation.address}
                </Text>
              </View>
            )}

            {reservation.alert_message && (
              <View className="bg-amber-500/20 rounded-xl p-3 flex-row items-center mb-3">
                <AlertCircle size={16} color="#F59E0B" />
                <Text className="text-amber-400 text-sm ml-2 flex-1 font-medium" style={{ fontFamily: 'DMSans_500Medium' }}>
                  {reservation.alert_message}
                </Text>
              </View>
            )}

            {/* Expanded Details */}
            {expanded && (
              <Animated.View entering={FadeInDown.duration(300)}>
                <ReservationDetails reservation={reservation} />

                {/* View Full Trip link */}
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/trip/${reservation.trip_id}`);
                  }}
                  className="flex-row items-center justify-center mt-3 pt-3 border-t border-slate-700/30"
                >
                  <ExternalLink size={14} color="#64748B" />
                  <Text className="text-slate-500 text-sm ml-1.5" style={{ fontFamily: 'DMSans_500Medium' }}>
                    View Full Trip
                  </Text>
                </Pressable>
              </Animated.View>
            )}

            {/* Toggle indicator */}
            <View className="flex-row items-center justify-end mt-1">
              <Text className="text-slate-400 text-sm mr-1" style={{ fontFamily: 'DMSans_500Medium' }}>
                {expanded ? 'Less' : 'Details'}
              </Text>
              {expanded ? (
                <ChevronUp size={16} color="#94A3B8" />
              ) : (
                <ChevronDown size={16} color="#94A3B8" />
              )}
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

function UpcomingItem({ reservation, index }: { reservation: Reservation; index: number }) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState(false);
  const [primary] = getTypeColor(reservation.type);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded(!expanded);
  };

  return (
    <Animated.View entering={FadeInRight.duration(400).delay(index * 100)}>
      <Pressable
        onPress={handlePress}
        className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50"
      >
        <View className="flex-row items-center">
          <View
            style={{ backgroundColor: primary + '20', padding: 10, borderRadius: 12 }}
          >
            <ReservationIcon type={reservation.type} size={18} color={primary} />
          </View>
          <View className="flex-1 ml-3">
            <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
              {reservation.title}
            </Text>
            {reservation.subtitle && (
              <Text className="text-slate-400 text-sm mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                {reservation.subtitle}
              </Text>
            )}
          </View>
          <View className="items-end">
            <Text className="text-white text-sm font-medium" style={{ fontFamily: 'SpaceMono_700Bold' }}>
              {formatTime(new Date(reservation.start_time))}
            </Text>
            <Text className="text-slate-500 text-xs mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
              {isToday(new Date(reservation.start_time)) ? 'Today' : isTomorrow(new Date(reservation.start_time)) ? 'Tomorrow' : formatDate(new Date(reservation.start_time))}
            </Text>
          </View>
          {expanded ? (
            <ChevronUp size={14} color="#64748B" style={{ marginLeft: 6 }} />
          ) : (
            <ChevronDown size={14} color="#64748B" style={{ marginLeft: 6 }} />
          )}
        </View>

        {/* Expanded Details */}
        {expanded && (
          <Animated.View entering={FadeInDown.duration(250)}>
            <ReservationDetails reservation={reservation} />

            {/* View Full Trip link */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/trip/${reservation.trip_id}`);
              }}
              className="flex-row items-center justify-center mt-2 pt-2 border-t border-slate-700/30"
            >
              <ExternalLink size={13} color="#64748B" />
              <Text className="text-slate-500 text-xs ml-1.5" style={{ fontFamily: 'DMSans_500Medium' }}>
                View Full Trip
              </Text>
            </Pressable>
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function QuickAction({ icon, label, color, onPress }: { icon: React.ReactNode; label: string; color: string; onPress: () => void }) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      className="flex-1 items-center"
    >
      <Animated.View style={animatedStyle}>
        <View
          style={{ backgroundColor: color + '20', padding: 14, borderRadius: 16 }}
        >
          {icon}
        </View>
      </Animated.View>
      <Text className="text-slate-400 text-xs mt-2 text-center" style={{ fontFamily: 'DMSans_500Medium' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function TodayScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [refreshing, setRefreshing] = React.useState(false);
  
  const { data: upcomingTrips = [], refetch: refetchTrips } = useUpcomingTrips();
  const { data: upcomingReservations = [], refetch: refetchReservations } = useUpcomingReservations();

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchTrips(), refetchReservations()]);
    setRefreshing(false);
  }, [refetchTrips, refetchReservations]);

  const activeTrip = upcomingTrips.find(t => t.status === 'active');
  const nextUp = upcomingReservations[0];
  
  // Separate today vs later
  const todayReservations = upcomingReservations.filter(r => isToday(new Date(r.start_time)));
  const laterToday = todayReservations.slice(1);
  
  // Get upcoming reservations in next 48 hours (for "Coming Up" section)
  const upcoming48h = upcomingReservations;

  // Get weather for active trip
  const { data: weather } = useWeather(activeTrip?.destination);

  const handleNavigate = () => {
    if (nextUp?.address) {
      openDirections(nextUp.address, nextUp);
    } else if (nextUp) {
      // No address — try to use departure airport for flights
      const departureAirport = nextUp.details?.['Departure Airport'];
      if (departureAirport) {
        openDirections(`${departureAirport} Airport`, nextUp);
      } else if (nextUp.location) {
        openDirections(nextUp.location, nextUp);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  };

  const handleActiveTripPress = () => {
    if (activeTrip) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/trip/${activeTrip.id}`);
    }
  };

  // Contextual quick actions based on next item
  const getQuickActions = () => {
    if (!nextUp) {
      return [
        { icon: <Sparkles size={22} color="#8B5CF6" />, label: 'Assistant', color: '#8B5CF6', onPress: () => router.push('/modal') },
        { icon: <Receipt size={22} color="#10B981" />, label: 'Add Receipt', color: '#10B981', onPress: () => router.push('/add-receipt') },
      ];
    }

    const baseActions = [];

    switch (nextUp.type) {
      case 'flight':
        baseActions.push(
          { icon: <Navigation size={22} color="#3B82F6" />, label: 'To Airport', color: '#3B82F6', onPress: handleNavigate },
          { icon: <CreditCard size={22} color="#8B5CF6" />, label: 'Boarding Pass', color: '#8B5CF6', onPress: () => router.push(`/trip/${nextUp.trip_id}`) }
        );
        break;
      case 'hotel':
        baseActions.push(
          { icon: <Navigation size={22} color="#3B82F6" />, label: 'Navigate', color: '#3B82F6', onPress: handleNavigate },
          { icon: <Phone size={22} color="#8B5CF6" />, label: 'Call Hotel', color: '#8B5CF6', onPress: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning) }
        );
        break;
      case 'car':
        baseActions.push(
          { icon: <Navigation size={22} color="#3B82F6" />, label: 'Navigate', color: '#3B82F6', onPress: handleNavigate },
          { icon: <CreditCard size={22} color="#8B5CF6" />, label: 'Confirmation', color: '#8B5CF6', onPress: () => router.push(`/trip/${nextUp.trip_id}`) }
        );
        break;
      default:
        baseActions.push(
          { icon: <Navigation size={22} color="#3B82F6" />, label: 'Navigate', color: '#3B82F6', onPress: handleNavigate },
          { icon: <Sparkles size={22} color="#8B5CF6" />, label: 'Assistant', color: '#8B5CF6', onPress: () => router.push('/modal') }
        );
    }

    baseActions.push(
      { icon: <Receipt size={22} color="#10B981" />, label: 'Add Receipt', color: '#10B981', onPress: () => router.push('/add-receipt') }
    );

    return baseActions;
  };

  const quickActions = getQuickActions();

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
              onRefresh={onRefresh}
              tintColor="#3b82f6"
            />
          }
        >
          {/* Compact Header */}
          <Animated.View
            entering={FadeInDown.duration(500)}
            className="px-5 pt-3 pb-4"
          >
            <View className="flex-row items-center justify-between">
              {/* Compact greeting with trip context */}
              <View className="flex-1">
                {activeTrip && weather ? (
                  <Pressable onPress={handleActiveTripPress} className="flex-row items-center">
                    <View className="w-2 h-2 rounded-full bg-emerald-500 mr-2" />
                    <Text className="text-white text-lg font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                      {activeTrip.destination}
                    </Text>
                    <Text className="text-slate-500 text-base ml-2" style={{ fontFamily: 'DMSans_400Regular' }}>
                      {weather.temperature}° {getWeatherIcon(weather.condition)}
                    </Text>
                    <ChevronRight size={16} color="#64748B" className="ml-1" />
                  </Pressable>
                ) : (
                  <Text className="text-white text-lg font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                    Today
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/notifications');
                }}
                className="bg-slate-800/80 p-2.5 rounded-full border border-slate-700/50"
              >
                <Bell size={18} color="#94A3B8" />
              </Pressable>
            </View>
          </Animated.View>

          {/* Next Up Card */}
          {nextUp ? (
            <NextUpCard reservation={nextUp} />
          ) : (
            <Animated.View
              entering={FadeInDown.duration(600)}
              className="mx-4 bg-slate-800/30 rounded-3xl p-8 items-center border border-slate-700/30"
            >
              <View className="bg-slate-700/30 p-4 rounded-full mb-4">
                <Sparkles size={32} color="#64748B" />
              </View>
              <Text className="text-slate-300 text-lg font-semibold text-center" style={{ fontFamily: 'DMSans_700Bold' }}>
                No upcoming events
              </Text>
              <Text className="text-slate-500 text-sm text-center mt-2" style={{ fontFamily: 'DMSans_400Regular' }}>
                Forward your travel emails to start tracking
              </Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push('/(tabs)/profile');
                }}
                className="mt-4 bg-blue-500 px-5 py-2.5 rounded-full"
              >
                <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                  Learn How
                </Text>
              </Pressable>
            </Animated.View>
          )}

          {/* Contextual Quick Actions */}
          <Animated.View
            entering={FadeInDown.duration(500).delay(200)}
            className="flex-row px-5 mt-5"
          >
            {quickActions.map((action, index) => (
              <React.Fragment key={action.label}>
                {index > 0 && <View className="w-3" />}
                <QuickAction
                  icon={action.icon}
                  label={action.label}
                  color={action.color}
                  onPress={action.onPress}
                />
              </React.Fragment>
            ))}
          </Animated.View>

          {/* Later Today / Upcoming */}
          {laterToday.length > 0 && (
            <View className="mt-8 px-5">
              <Text className="text-slate-300 text-sm font-semibold uppercase tracking-wider mb-4" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                Later Today
              </Text>
              <View className="gap-3">
                {laterToday.map((res, i) => (
                  <UpcomingItem key={res.id} reservation={res} index={i} />
                ))}
              </View>
            </View>
          )}

          {upcoming48h.length > (todayReservations.length > 0 ? todayReservations.length : 1) && (
            <View className="mt-8 px-5 pb-8">
              <Text className="text-slate-300 text-sm font-semibold uppercase tracking-wider mb-4" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                Coming Up
              </Text>
              <View className="gap-3">
                {upcoming48h
                  .slice(todayReservations.length > 0 ? todayReservations.length : 1)
                  .map((res, i) => (
                    <UpcomingItem key={res.id} reservation={res} index={i} />
                  ))}
              </View>
            </View>
          )}

          <View className="h-8" />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

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
  ExternalLink,
  Check,
  X,
  ArrowDown,
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
import { formatTime, formatDate, getCountdown, isToday, isTomorrow, getFlightAwareCountdown, getContextualTimeInfo } from '@/lib/utils';
import { useAuthStore } from '@/lib/state/auth-store';
import { getWeatherIcon } from '@/lib/weather';
import { useWeather } from '@/lib/hooks/useWeather';
import { ReservationExpandedDetails } from '@/components/ReservationExpandedDetails';
import { FlightStatusBar } from '@/components/FlightStatusBar';
import { useUnreadNotificationCount } from '@/lib/hooks/useNotifications';
import { isNetworkError } from '@/lib/error-utils';
import { OfflineToast } from '@/components/OfflineToast';
import { getStoredFlightStatus, checkFlightStatusForTrip, getPollingInterval } from '@/lib/flight-status';
import type { FlightStatusData } from '@/lib/flight-status';
import { useRefreshFlightStatus } from '@/lib/hooks/useFlightStatus';

type ReservationType = Reservation['type'];

/** Check if a reservation is cancelled (DB status or live flight API status) */
function isReservationCancelled(reservation: Reservation): boolean {
  if (reservation.status === 'cancelled') return true;
  if (reservation.type === 'flight') {
    const flightStatus = reservation.details?._flight_status as FlightStatusData | undefined;
    if (flightStatus?.flight_status === 'cancelled') return true;
  }
  return false;
}

/**
 * Determine if a reservation is still actionable for "Next Up".
 * Filters out things the user no longer needs to act on:
 * - Cancelled reservations
 * - Flights that have departed, are in-flight, or have landed
 * - Non-flight reservations whose start time is >30 min in the past
 *
 * The idea: "Next Up" = the next thing you need to physically do something about.
 */
function isNextUpCandidate(reservation: Reservation): boolean {
  const now = new Date();

  // Never show cancelled reservations as Next Up
  if (isReservationCancelled(reservation)) return false;

  // Flight-specific smart filtering using live status data
  if (reservation.type === 'flight') {
    const flightStatus = reservation.details?._flight_status as FlightStatusData | undefined;

    if (flightStatus) {
      const phase = flightStatus.flight_status;

      // If API says landed → done, skip
      if (phase === 'landed') return false;

      // If API says active (in-flight) → user is on the plane, skip
      if (phase === 'active') return false;

      // If API says cancelled/incident/diverted → skip
      if (phase === 'cancelled' || phase === 'incident' || phase === 'diverted') return false;

      // Check for actual departure/arrival timestamps even if API phase is stale
      if (flightStatus.arr_actual) return false; // Has landed
      if (flightStatus.dep_actual) return false;  // Has departed

      // If estimated arrival is in the past, flight has likely landed
      if (flightStatus.arr_estimated) {
        const arrEst = new Date(flightStatus.arr_estimated);
        if (arrEst.getTime() < now.getTime()) return false;
      }
    }

    // No live data — use scheduled departure time
    const depTime = new Date(reservation.start_time);
    const minsSinceDeparture = (now.getTime() - depTime.getTime()) / 60000;
    // If departure was >30 min ago and we have no live data, assume departed
    if (minsSinceDeparture > 30) return false;

    return true;
  }

  // Non-flight reservations: skip if start time was >30 min ago
  const startTime = new Date(reservation.start_time);
  const minsSinceStart = (now.getTime() - startTime.getTime()) / 60000;
  if (minsSinceStart > 30) return false;

  return true;
}

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


function NextUpCard({ reservation }: { reservation: Reservation }) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState(false);
  const [primary, secondary] = getTypeColor(reservation.type);

  // Get live flight status data (if available)
  const flightStatus = reservation.type === 'flight' ? getStoredFlightStatus(reservation) : null;

  // Use flight-aware countdown that respects actual flight phase
  const smartCountdown = getFlightAwareCountdown(reservation, flightStatus);

  // Get contextual time info (label + time) based on flight phase
  const timeInfo = getContextualTimeInfo(reservation, flightStatus);

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
  // Also check live flight status for gate info
  const liveGate = flightStatus?.dep_gate;
  const displayGate = liveGate ? `Gate ${liveGate}` : gateInfo;

  // ─── Countdown Badge Visual System ─────────────────────────────────────────
  // Each phase gets a unique gradient, icon, and animation personality

  const getCountdownGradient = (): [string, string] => {
    switch (smartCountdown.colorHint) {
      case 'green': return ['#059669', '#10B981'];   // Landed — rich emerald
      case 'blue': return ['#2563EB', '#3B82F6'];    // In Flight — vivid blue
      case 'amber': return ['#D97706', '#F59E0B'];   // Boarding — warm amber
      case 'red': return ['#DC2626', '#EF4444'];      // Cancelled — alert red
      default: return smartCountdown.urgent
        ? ['#D97706', '#F59E0B']                       // Urgent — amber
        : ['#334155', '#475569'];                      // Default — subtle slate
    }
  };

  const getCountdownTextColor = () => {
    // All gradient badges use white text for maximum contrast
    return '#FFFFFF';
  };

  const getCountdownIcon = () => {
    switch (smartCountdown.colorHint) {
      case 'green': return <Check size={14} color="#FFFFFF" strokeWidth={3} />;
      case 'blue': return <Plane size={14} color="#FFFFFF" strokeWidth={2} style={{ transform: [{ rotate: '45deg' }] }} />;
      case 'amber': return <Clock size={14} color="#FFFFFF" strokeWidth={2} />;
      case 'red': return <X size={14} color="#FFFFFF" strokeWidth={3} />;
      default: return smartCountdown.urgent
        ? <Clock size={14} color="#FFFFFF" strokeWidth={2} />
        : null;
    }
  };

  // Pulsing glow for active states (in-flight, boarding)
  const shouldPulse = smartCountdown.colorHint === 'blue' || smartCountdown.colorHint === 'amber';
  const badgeGlowAnim = useSharedValue(0.6);

  React.useEffect(() => {
    if (shouldPulse) {
      badgeGlowAnim.value = withRepeat(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      badgeGlowAnim.value = 0.8;
    }
  }, [shouldPulse]);

  const badgeGlowStyle = useAnimatedStyle(() => ({
    opacity: badgeGlowAnim.value,
  }));

  const countdownTextColor = getCountdownTextColor();
  const countdownGradient = getCountdownGradient();
  const countdownIcon = getCountdownIcon();

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

              {/* ✦ Hero Countdown Badge — gradient + glow + status icon */}
              <View style={{ position: 'relative' }}>
                {/* Animated glow layer behind the badge */}
                {shouldPulse && (
                  <Animated.View
                    style={[
                      badgeGlowStyle,
                      {
                        position: 'absolute',
                        top: -4,
                        left: -4,
                        right: -4,
                        bottom: -4,
                        borderRadius: 20,
                        backgroundColor: countdownGradient[0],
                        shadowColor: countdownGradient[0],
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.6,
                        shadowRadius: 16,
                        elevation: 12,
                      },
                    ]}
                  />
                )}
                <LinearGradient
                  colors={countdownGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    paddingHorizontal: 18,
                    paddingVertical: 12,
                    borderRadius: 16,
                    alignItems: 'center',
                    minWidth: 80,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.15)',
                  }}
                >
                  {/* Status micro-icon */}
                  {countdownIcon && (
                    <View style={{
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      borderRadius: 10,
                      width: 20,
                      height: 20,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 4,
                    }}>
                      {countdownIcon}
                    </View>
                  )}
                  {/* Big countdown number */}
                  <Text
                    style={{
                      fontFamily: 'SpaceMono_700Bold',
                      fontSize: 26,
                      lineHeight: 30,
                      color: countdownTextColor,
                      textShadowColor: 'rgba(0,0,0,0.3)',
                      textShadowOffset: { width: 0, height: 1 },
                      textShadowRadius: 4,
                    }}
                  >
                    {smartCountdown.label}
                  </Text>
                  {/* Action label */}
                  <Text
                    style={{
                      fontFamily: 'DMSans_700Bold',
                      fontSize: 11,
                      color: countdownTextColor,
                      opacity: 0.9,
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                      marginTop: 2,
                    }}
                  >
                    {smartCountdown.actionLabel}
                  </Text>
                </LinearGradient>
              </View>
            </View>

            {/* Quick Info Row — contextual time label + gate/seat */}
            <View className="flex-row items-center bg-slate-800/50 rounded-xl p-3 mb-3">
              <Clock size={16} color="#94A3B8" />
              <Text className="text-slate-400 text-xs ml-1.5 mr-1" style={{ fontFamily: 'DMSans_500Medium' }}>
                {timeInfo.label}
              </Text>
              <Text className="text-white text-base font-medium" style={{ fontFamily: 'SpaceMono_700Bold' }}>
                {timeInfo.time}
              </Text>

              {reservation.type === 'flight' && (displayGate || seatInfo) && (
                <>
                  <View className="w-px h-4 bg-slate-600 mx-3" />
                  {displayGate && (
                    <Text className="text-slate-300 text-sm" style={{ fontFamily: 'DMSans_500Medium' }}>
                      {displayGate}
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

            {/* Flight Status Bar — always visible for flights with live data */}
            {reservation.type === 'flight' && (() => {
              const flightStatus = getStoredFlightStatus(reservation);
              if (!flightStatus) return null;
              return (
                <View className="mb-3">
                  <FlightStatusBar status={flightStatus} compact={false} />
                </View>
              );
            })()}

            {/* Expanded Details — uses same beautiful component as trip detail page */}
            {expanded && (
              <Animated.View entering={FadeInDown.duration(300)}>
                <View className="mt-3 pt-3 border-t border-slate-700/50">
                  <ReservationExpandedDetails reservation={reservation} compact showFlightStatus={false} />
                </View>

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
  const cancelled = isReservationCancelled(reservation);

  // Get live flight status for contextual time display
  const flightStatus = reservation.type === 'flight' ? getStoredFlightStatus(reservation) : null;
  const timeInfo = getContextualTimeInfo(reservation, flightStatus);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded(!expanded);
  };

  return (
    <Animated.View entering={FadeInRight.duration(400).delay(index * 100)}>
      <Pressable
        onPress={handlePress}
        style={{
          backgroundColor: cancelled ? 'rgba(239,68,68,0.06)' : 'rgba(30,41,59,0.5)',
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          borderColor: cancelled ? 'rgba(239,68,68,0.2)' : 'rgba(51,65,85,0.5)',
          opacity: cancelled ? 0.75 : 1,
        }}
      >
        <View className="flex-row items-center">
          <View
            style={{ backgroundColor: (cancelled ? '#EF4444' : primary) + '20', padding: 10, borderRadius: 12 }}
          >
            <ReservationIcon type={reservation.type} size={18} color={cancelled ? '#EF4444' : primary} />
          </View>
          <View className="flex-1 ml-3">
            <View className="flex-row items-center">
              <Text
                style={{
                  color: cancelled ? '#94A3B8' : '#FFFFFF',
                  fontFamily: 'DMSans_700Bold',
                  fontSize: 15,
                  textDecorationLine: cancelled ? 'line-through' : 'none',
                }}
              >
                {reservation.title}
              </Text>
              {cancelled && (
                <View style={{ backgroundColor: 'rgba(239,68,68,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginLeft: 8 }}>
                  <Text style={{ color: '#EF4444', fontSize: 10, fontFamily: 'DMSans_700Bold' }}>
                    Cancelled
                  </Text>
                </View>
              )}
            </View>
            {reservation.subtitle && (
              <Text className="text-slate-400 text-sm mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                {reservation.subtitle}
              </Text>
            )}
          </View>
          <View className="items-end">
            <Text
              className="text-sm font-medium"
              style={{
                fontFamily: 'SpaceMono_700Bold',
                color: cancelled ? '#64748B' : '#FFFFFF',
                textDecorationLine: cancelled ? 'line-through' : 'none',
              }}
            >
              {timeInfo.time}
            </Text>
            <Text className="text-slate-500 text-xs mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
              {timeInfo.label}{' · '}{isToday(new Date(reservation.start_time)) ? 'Today' : isTomorrow(new Date(reservation.start_time)) ? 'Tomorrow' : formatDate(new Date(reservation.start_time))}
            </Text>
          </View>
          {expanded ? (
            <ChevronUp size={14} color="#64748B" style={{ marginLeft: 6 }} />
          ) : (
            <ChevronDown size={14} color="#64748B" style={{ marginLeft: 6 }} />
          )}
        </View>

        {/* Compact Flight Status Bar — always visible for flights with live data */}
        {reservation.type === 'flight' && !cancelled && (() => {
          const flightStatus = getStoredFlightStatus(reservation);
          if (!flightStatus) return null;
          return (
            <View className="mt-3">
              <FlightStatusBar status={flightStatus} compact />
            </View>
          );
        })()}

        {/* Expanded Details — uses same beautiful component as trip detail page */}
        {expanded && (
          <Animated.View entering={FadeInDown.duration(250)}>
            <View className="mt-3 pt-3 border-t border-slate-700/50">
              <ReservationExpandedDetails reservation={reservation} compact showFlightStatus={false} />
            </View>

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
    // Only animate back — don't trigger action here (scroll-safe)
    scale.value = withSpring(1);
  };

  const handlePress = () => {
    // onPress only fires for intentional taps, not scroll gestures
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      unstable_pressDelay={80}
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
  const [showOfflineToast, setShowOfflineToast] = React.useState(false);
  
  const { data: upcomingTrips = [], refetch: refetchTrips } = useUpcomingTrips();
  const { data: upcomingReservations = [], refetch: refetchReservations } = useUpcomingReservations();
  const { data: unreadCount = 0 } = useUnreadNotificationCount();

  // Flight status refresh mutation — triggers the edge function to get fresh data from AirLabs
  const refreshFlightStatus = useRefreshFlightStatus();

  // Find trip IDs that have flight reservations (for flight status refresh)
  const tripIdsWithFlights = React.useMemo(() => {
    const ids = new Set<string>();
    upcomingReservations.forEach(r => {
      if (r.type === 'flight' && r.trip_id) {
        ids.add(r.trip_id);
      }
    });
    return Array.from(ids);
  }, [upcomingReservations]);

  // ─── Automatic Flight Status Polling ───────────────────────────────────────
  // Find the nearest upcoming flight to determine polling interval
  const nearestFlight = React.useMemo(() => {
    return upcomingReservations
      .filter(r => r.type === 'flight' && !isReservationCancelled(r))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0] ?? null;
  }, [upcomingReservations]);

  React.useEffect(() => {
    if (!nearestFlight || tripIdsWithFlights.length === 0) return;

    const departureTime = new Date(nearestFlight.start_time);
    const storedStatus = getStoredFlightStatus(nearestFlight);
    const arrivalTime = nearestFlight.end_time ? new Date(nearestFlight.end_time) : null;

    const interval = getPollingInterval(
      departureTime,
      storedStatus?.flight_status,
      arrivalTime,
    );

    // No polling needed (flight landed/cancelled or too far out)
    if (!interval) return;

    console.log(`[TodayScreen] Flight polling every ${Math.round(interval / 60000)}m for ${nearestFlight.title}`);

    const pollFlightStatus = async () => {
      for (const tripId of tripIdsWithFlights) {
        try {
          await checkFlightStatusForTrip(tripId);
        } catch (err) {
          console.error('[TodayScreen] Flight poll error:', err);
        }
      }
      // Refetch reservations to pick up updated flight status from DB
      refetchReservations();
    };

    const timer = setInterval(pollFlightStatus, interval);

    // Also do an initial check when the screen mounts / flight changes
    pollFlightStatus();

    return () => clearInterval(timer);
  }, [nearestFlight?.id, JSON.stringify(tripIdsWithFlights)]);

  // ─── Pull-to-Refresh ──────────────────────────────────────────────────────
  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      // Refresh flight status from the API for all trips with flights
      const flightRefreshPromises = tripIdsWithFlights.map(tripId =>
        refreshFlightStatus.mutateAsync(tripId).catch(err => {
          console.warn('[TodayScreen] Flight refresh failed for trip', tripId, err);
          return null;
        })
      );

      const [tripsResult, reservationsResult] = await Promise.all([
        refetchTrips(),
        refetchReservations(),
        // Also trigger flight status API refresh in parallel
        ...flightRefreshPromises,
      ]);
      
      // After flight status updates, refetch reservations again to get fresh data
      if (tripIdsWithFlights.length > 0) {
        await refetchReservations();
      }

      // If either refetch failed with a network error, show the offline toast
      if (
        (tripsResult.error && isNetworkError(tripsResult.error)) ||
        (reservationsResult.error && isNetworkError(reservationsResult.error))
      ) {
        setShowOfflineToast(true);
      }
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        setShowOfflineToast(true);
      }
    }
    setRefreshing(false);
  }, [refetchTrips, refetchReservations, tripIdsWithFlights, refreshFlightStatus]);

  const activeTrip = upcomingTrips.find(t => t.status === 'active');
  
  // Smart "Next Up" — only show reservations the user still needs to act on
  // Skips: cancelled, departed, in-flight, landed flights, and past events
  const nextUp = upcomingReservations.find(r => isNextUpCandidate(r)) ?? null;
  const nextUpIndex = nextUp ? upcomingReservations.indexOf(nextUp) : -1;
  
  // Separate today vs later (include cancelled ones in the list, just not as "Next Up")
  const todayReservations = upcomingReservations.filter(r => isToday(new Date(r.start_time)));
  // "Later today" = today's reservations minus the one shown as Next Up
  const laterToday = todayReservations.filter(r => r.id !== nextUp?.id);
  
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
                {unreadCount > 0 && (
                  <View
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      backgroundColor: '#EF4444',
                      borderRadius: 10,
                      minWidth: 18,
                      height: 18,
                      justifyContent: 'center',
                      alignItems: 'center',
                      paddingHorizontal: 4,
                      borderWidth: 2,
                      borderColor: '#020617',
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 10, fontFamily: 'DMSans_700Bold' }}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
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
                  router.push('/(tabs)/trips');
                }}
                className="mt-4 bg-blue-500 px-5 py-2.5 rounded-full"
              >
                <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                  Add a Trip
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

      {/* Offline toast — shown after pull-to-refresh fails */}
      <OfflineToast
        visible={showOfflineToast}
        onDismiss={() => setShowOfflineToast(false)}
      />
    </View>
  );
}

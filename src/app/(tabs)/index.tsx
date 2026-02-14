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
import { formatTime, formatDate, formatDateFromISO, getCountdown, isToday, isTomorrow, isTodayISO, isTomorrowISO, getFlightAwareCountdown, getContextualTimeInfo, getFlightDepartureUTC, getReservationStartUTC, parseDateOnly } from '@/lib/utils';
import { useAuthStore } from '@/lib/state/auth-store';
import { useProfile } from '@/lib/hooks/useProfile';
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
import { useResponsive } from '@/lib/hooks/useResponsive';
import { ResponsiveContainer } from '@/components/ResponsiveContainer';
import { updateTripStatuses } from '@/lib/trip-status';

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
 * Determine if a reservation is currently in progress (active/underway).
 * - Flights: in-flight (has departed but not landed)
 * - Other reservations: start time has passed but end time hasn't (e.g., hotel stay)
 * 
 * TRAVEL-AWARE: Hotels and car rentals should NOT be "in progress" if there's
 * an active in-flight reservation — the traveler can't physically be using them yet.
 */
function isInProgress(reservation: Reservation, allReservations: Reservation[]): boolean {
  const now = new Date();

  // Skip cancelled items
  if (isReservationCancelled(reservation)) return false;

  // Flight-specific: check if in-flight
  if (reservation.type === 'flight') {
    const flightStatus = reservation.details?._flight_status as FlightStatusData | undefined;

    if (flightStatus) {
      // API says active (in-flight)
      if (flightStatus.flight_status === 'active') return true;

      // Has departed but not landed
      if (flightStatus.dep_actual && !flightStatus.arr_actual) return true;

      // If landed, not in progress
      if (flightStatus.flight_status === 'landed' || flightStatus.arr_actual) return false;
    }

    // Fallback: check if departure time has passed
    const depTime = getFlightDepartureUTC(reservation);
    const minsSinceDeparture = (now.getTime() - depTime.getTime()) / 60000;
    // If departed >30 min ago and no live data saying otherwise, assume in-flight
    if (minsSinceDeparture > 30) return true;

    return false;
  }

  // Non-flight reservations: in progress if started but not ended
  // BUG FIX: Use timezone-aware start time
  const startTime = getReservationStartUTC(reservation);
  const endTime = reservation.end_time ? new Date(reservation.end_time) : null;

  const hasStarted = startTime.getTime() < now.getTime();
  const hasEnded = endTime ? endTime.getTime() < now.getTime() : false;

  // TRAVEL-AWARE: If there's an active in-flight reservation, hotels and car rentals
  // can't be "in progress" yet — the traveler is still on the plane
  if ((reservation.type === 'hotel' || reservation.type === 'car') && hasStarted && !hasEnded) {
    const activeFlightInProgress = allReservations.some(r => 
      r.type === 'flight' && r.id !== reservation.id && isInProgress(r, allReservations)
    );
    if (activeFlightInProgress) return false;
  }

  // Hotels: Use a longer grace period (6 hours) since check-in times are soft starts
  // (check-in at 3 PM doesn't mean you're AT the hotel at 3:01 PM)
  if (reservation.type === 'hotel' && hasStarted && !hasEnded) {
    const hoursSinceCheckIn = (now.getTime() - startTime.getTime()) / 3600000;
    // Only mark as "in progress" if check-in was >6 hours ago (likely actually checked in)
    return hoursSinceCheckIn > 6;
  }

  return hasStarted && !hasEnded;
}

/**
 * Determine if a reservation is still actionable for "Next Up".
 * Filters out things the user no longer needs to act on:
 * - Cancelled reservations
 * - Flights that have departed, are in-flight, or have landed
 * - Reservations with type-specific grace periods (soft starts vs hard starts)
 *
 * The idea: "Next Up" = the next thing you need to physically do something about.
 * 
 * TRAVEL-AWARE: Hotels and car rentals have flexible pickup/check-in windows,
 * so they stay actionable much longer than hard-start events like flights.
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

      // Live data says flight is still scheduled (possibly delayed) — it's actionable.
      // Don't fall through to the time-based check which uses the original departure
      // time and would incorrectly exclude delayed flights that haven't departed yet.
      return true;
    }

    // No live data — use scheduled departure time as fallback
    const depTime = getFlightDepartureUTC(reservation);
    const minsSinceDeparture = (now.getTime() - depTime.getTime()) / 60000;
    // If departure was >30 min ago and we have no live data, assume departed
    if (minsSinceDeparture > 30) return false;

    return true;
  }

  // Non-flight reservations: use type-specific grace periods
  // BUG FIX: Use timezone-aware start time
  const startTime = getReservationStartUTC(reservation);
  const minsSinceStart = (now.getTime() - startTime.getTime()) / 60000;
  
  // Type-specific grace periods based on real-world travel patterns:
  // - Hotels: 8 hours (check-in windows are typically 3 PM–11 PM)
  // - Car rentals: 4 hours (pickup counters are flexible, but not all day)
  // - Trains: 30 min (hard start time, like flights)
  // - Events/Meetings: 30 min (hard start time)
  switch (reservation.type) {
    case 'hotel':
      // Hotels have the longest grace period — check-in is available all evening
      if (minsSinceStart > 480) return false; // 8 hours
      break;
    case 'car':
      // Car rentals are flexible but not as much as hotels
      if (minsSinceStart > 240) return false; // 4 hours
      break;
    case 'train':
    case 'event':
    case 'meeting':
      // Hard start times — 30 min grace period
      if (minsSinceStart > 30) return false;
      break;
    default:
      // Default: 30 min grace period
      if (minsSinceStart > 30) return false;
  }

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
              {timeInfo.label}{' · '}{isTodayISO(reservation.start_time) ? 'Today' : isTomorrowISO(reservation.start_time) ? 'Tomorrow' : formatDateFromISO(reservation.start_time)}
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
  const responsive = useResponsive();
  
  const { data: upcomingTrips = [], refetch: refetchTrips } = useUpcomingTrips();
  const { data: upcomingReservations = [], refetch: refetchReservations } = useUpcomingReservations();
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const { data: profile } = useProfile();

  // Ambient orb animations
  const orb1X = useSharedValue(-100);
  const orb1Y = useSharedValue(50);
  const orb2X = useSharedValue(200);
  const orb2Y = useSharedValue(150);

  React.useEffect(() => {
    // Slow drifting orbs
    orb1X.value = withRepeat(
      withTiming(100, { duration: 20000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    orb1Y.value = withRepeat(
      withTiming(150, { duration: 15000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    orb2X.value = withRepeat(
      withTiming(-50, { duration: 18000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    orb2Y.value = withRepeat(
      withTiming(80, { duration: 22000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const orb1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: orb1X.value }, { translateY: orb1Y.value }],
  }));

  const orb2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: orb2X.value }, { translateY: orb2Y.value }],
  }));

  // Time-aware greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    const firstName = profile?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';
    
    if (hour < 12) return `Good morning, ${firstName}`;
    if (hour < 18) return `Good afternoon, ${firstName}`;
    return `Good evening, ${firstName}`;
  };

  const getGreetingEmoji = () => {
    const hour = new Date().getHours();
    if (hour < 12) return '☀️';
    if (hour < 18) return '👋';
    return '🌙';
  };

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

  // ─── Pull-to-Refresh ──────────────────────────────────────────────────────
  // Note: Automatic flight status polling is handled by:
  // 1. Trip detail page (useFlightStatusPolling hook)
  // 2. Server-side cron job (every 15 min)
  // This screen only refreshes on pull-to-refresh to avoid duplicate API calls
  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      // Update trip statuses first (active → completed if end date passed)
      if (user?.id) {
        await updateTripStatuses(user.id).catch(() => {});
      }

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
  }, [refetchTrips, refetchReservations, tripIdsWithFlights, refreshFlightStatus, user]);

  // Find the active trip with client-side date guard to prevent stale data
  const activeTrip = upcomingTrips.find(t => {
    if (t.status !== 'active') return false;
    // Client-side guard: make sure the trip hasn't ended
    const endDate = parseDateOnly(t.end_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    return endDate >= today;
  });
  
  // Smart "Next Up" — only show reservations the user still needs to act on
  // Skips: cancelled, departed, in-flight, landed flights, and past events
  const nextUp = upcomingReservations.find(r => isNextUpCandidate(r)) ?? null;
  const nextUpIndex = nextUp ? upcomingReservations.indexOf(nextUp) : -1;
  
  // Separate today vs later (include cancelled ones in the list, just not as "Next Up")
  // BUG FIX: Use isTodayISO to avoid timezone conversion
  const todayReservations = upcomingReservations.filter(r => isTodayISO(r.start_time));
  
  // Split today's reservations into categories
  const inProgressItems = todayReservations.filter(r => isInProgress(r, upcomingReservations));
  // "Later today" = today's reservations minus nextUp and in-progress items
  const laterToday = todayReservations.filter(r => 
    r.id !== nextUp?.id && !isInProgress(r, upcomingReservations)
  );
  
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
          { icon: <CreditCard size={22} color="#8B5CF6" />, label: 'Boarding Pass', color: '#8B5CF6', onPress: () => router.push(`/boarding-pass?reservationId=${nextUp.id}`) }
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

      {/* Ambient gradient orbs */}
      <Animated.View
        style={[
          orb1Style,
          {
            position: 'absolute',
            width: 300,
            height: 300,
            borderRadius: 150,
            backgroundColor: '#3B82F6',
            opacity: 0.08,
            top: -50,
            left: -100,
          },
        ]}
      />
      <Animated.View
        style={[
          orb2Style,
          {
            position: 'absolute',
            width: 250,
            height: 250,
            borderRadius: 125,
            backgroundColor: '#8B5CF6',
            opacity: 0.06,
            top: 100,
            right: -80,
          },
        ]}
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
          {/* Hero Header with Greeting */}
          <ResponsiveContainer>
            <Animated.View
              entering={FadeInDown.duration(600)}
              className="px-5 pt-4 pb-6"
            >
            <View className="flex-row items-start justify-between mb-4">
              <View className="flex-1">
                {/* Time-aware greeting */}
                <Animated.View entering={FadeInDown.duration(700).delay(100)}>
                  <Text className="text-slate-400 text-sm mb-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                    {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </Text>
                  <Text className="text-white text-2xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                    {getGreeting()} {getGreetingEmoji()}
                  </Text>
                </Animated.View>

                {/* Active trip context */}
                {activeTrip && weather && (
                  <Animated.View entering={FadeInDown.duration(700).delay(200)}>
                    <Pressable onPress={handleActiveTripPress} className="flex-row items-center mt-3">
                      <View className="w-2 h-2 rounded-full bg-emerald-500 mr-2" />
                      <Text className="text-emerald-400 text-sm font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                        {activeTrip.destination}
                      </Text>
                      <Text className="text-slate-500 text-sm ml-2" style={{ fontFamily: 'DMSans_400Regular' }}>
                        {weather.temperature}° {getWeatherIcon(weather.condition)}
                      </Text>
                      <ChevronRight size={14} color="#64748B" className="ml-1" />
                    </Pressable>
                  </Animated.View>
                )}
              </View>

              {/* Notification bell */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/notifications');
                }}
                className="bg-slate-800/60 p-3 rounded-full border border-slate-700/40"
              >
                <Bell size={20} color="#94A3B8" />
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
          </ResponsiveContainer>

          {/* Next Up Card */}
          <ResponsiveContainer>
            {nextUp ? (
              <View className="px-5">
                <NextUpCard reservation={nextUp} />
              </View>
            ) : (
              <View className="px-5">
                <Animated.View
                  entering={FadeInDown.duration(600)}
                  className="bg-slate-800/30 rounded-3xl p-8 items-center border border-slate-700/30"
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
              </View>
            )}
          </ResponsiveContainer>

          {/* Contextual Quick Actions */}
          <ResponsiveContainer>
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
          </ResponsiveContainer>

          {/* Later Today / Upcoming */}
          <ResponsiveContainer>
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
              <View className="mt-8 px-5">
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

            {/* In Progress — items currently underway (in-flight, hotel stays, etc.) */}
            {inProgressItems.length > 0 && (
              <View className="mt-8 px-5 pb-8">
              <View className="flex-row items-center mb-4">
                <Plane size={14} color="#3B82F6" style={{ transform: [{ rotate: '45deg' }] }} />
                <Text className="text-slate-400 text-sm font-semibold uppercase tracking-wider ml-2" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                  In Progress
                </Text>
              </View>
              <View className="gap-3">
                {inProgressItems.map((res, i) => (
                  <UpcomingItem key={res.id} reservation={res} index={i} />
                ))}
              </View>
              </View>
            )}
          </ResponsiveContainer>

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

import React from 'react';
import { View, Text, ScrollView, Pressable, Image, Dimensions, SectionList, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Plane,
  Building2,
  Car,
  Users,
  Ticket,
  Train,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Copy,
  AlertCircle,
  CheckCircle,
  Share2,
  Sparkles,
  Plus,
  Edit3,
  MoreVertical,
  Receipt,
  DollarSign,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  interpolate,
  useAnimatedScrollHandler,
  Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useQueryClient } from '@tanstack/react-query';
import { useTrip, useDeleteTrip } from '@/lib/hooks/useTrips';
import { useReservations, useDeleteReservation } from '@/lib/hooks/useReservations';
import { useTripExpenses } from '@/lib/hooks/useReceipts';
import type { Reservation } from '@/lib/types/database';
import { formatTime, formatTimeFromISO, formatDate, formatDateLong, formatDateFromISO, formatCurrency, isToday, isTomorrow, isTodayISO, isTomorrowISO, getLiveStatus, LiveStatus, getFlightDuration, parseDateOnly, getContextualTimeInfo, getFlightDepartureUTC, getReservationEndUTC, getLocalTimeISO, isReservationToday, isReservationTomorrow } from '@/lib/utils';
import { getWeatherIcon } from '@/lib/weather';
import { useWeather } from '@/lib/hooks/useWeather';
import { shareTripNative } from '@/lib/sharing';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FlightStatusBar } from '@/components/FlightStatusBar';
import { ReservationExpandedDetails } from '@/components/ReservationExpandedDetails';
import { useRefreshFlightStatus, useFlightStatusPolling } from '@/lib/hooks/useFlightStatus';
import { getStoredFlightStatus, getFlightPhaseLabel, inferFlightPhase } from '@/lib/flight-status';
import type { FlightStatusData, FlightPhase } from '@/lib/flight-status';

/** Convert real flight API status to a LiveStatus chip for the card badge.
 *  Uses inferFlightPhase() so the badge reflects actual timestamps,
 *  not just the raw (possibly stale) API status field. */
function getFlightLiveStatus(status: FlightStatusData): LiveStatus {
  const effectivePhase = inferFlightPhase(status);
  const delayMins = status.dep_delay ?? 0;

  switch (effectivePhase) {
    case 'scheduled':
      if (delayMins >= 15) {
        return { label: `Delayed ${delayMins}m`, color: 'amber', pulse: false };
      }
      // Check if boarding window (within 30 min of departure)
      // CRITICAL: Use dep_scheduled_utc (real UTC time) for accurate comparison
      if (status.dep_scheduled_utc) {
        // Force UTC interpretation by appending 'Z' if missing
        const utcSafe = status.dep_scheduled_utc.match(/[Zz]$|[+-]\d{2}:?\d{2}$/)
          ? status.dep_scheduled_utc
          : status.dep_scheduled_utc.replace(' ', 'T') + 'Z';
        const depUtcMs = new Date(utcSafe).getTime();
        if (!isNaN(depUtcMs)) {
          const delayMs = (status.dep_delay ?? 0) * 60 * 1000;
          const actualDepMs = depUtcMs + delayMs;
          const minsUntil = (actualDepMs - Date.now()) / (1000 * 60);
          if (minsUntil <= 30 && minsUntil > 0) {
            return { label: 'Boarding', color: 'blue', pulse: true };
          }
          if (minsUntil <= 0) {
            // Departure time passed but no dep_actual — likely boarding/taxiing
            return { label: 'Boarding', color: 'blue', pulse: true };
          }
        }
      }
      return { label: 'On Time', color: 'green', pulse: false };
    case 'active':
      return { label: 'In Flight', color: 'blue', pulse: true };
    case 'landed':
      return { label: 'Landed', color: 'green', pulse: false };
    case 'cancelled':
      return { label: 'Cancelled', color: 'red', pulse: false };
    case 'diverted':
      return { label: 'Diverted', color: 'red', pulse: true };
    case 'incident':
      return { label: 'Incident', color: 'red', pulse: true };
    case 'unknown':
    default:
      // Never say "Scheduled" when we don't know — be honest
      return { label: 'Status Unknown', color: 'slate', pulse: false };
  }
}

type ReservationType = Reservation['type'];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HEADER_HEIGHT = 320;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedSectionList = Animated.createAnimatedComponent(SectionList<Reservation>);

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

const getTypeColor = (type: ReservationType): string => {
  const colors: Record<ReservationType, string> = {
    flight: '#3B82F6',
    hotel: '#8B5CF6',
    car: '#10B981',
    train: '#F59E0B',
    meeting: '#EC4899',
    event: '#06B6D4',
  };
  return colors[type] ?? '#6B7280';
};

const getStatusColor = (status: Reservation['status']): string => {
  const colors: Record<Reservation['status'], string> = {
    confirmed: '#10B981',
    delayed: '#F59E0B',
    cancelled: '#EF4444',
    completed: '#64748B',
  };
  return colors[status];
};

// Live status chip component
function LiveStatusChip({ status }: { status: LiveStatus }) {
  const colorMap = {
    green: { bg: '#10B98120', text: '#10B981', dot: '#10B981' },
    amber: { bg: '#F59E0B20', text: '#F59E0B', dot: '#F59E0B' },
    blue: { bg: '#3B82F620', text: '#3B82F6', dot: '#3B82F6' },
    slate: { bg: '#64748B20', text: '#64748B', dot: '#64748B' },
    red: { bg: '#EF444420', text: '#EF4444', dot: '#EF4444' },
  };

  const colors = colorMap[status.color];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: colors.bg }}>
      {status.pulse && (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.dot, marginRight: 6 }} />
      )}
      <Text style={{ fontSize: 11, fontFamily: 'DMSans_500Medium', color: colors.text }}>
        {status.label}
      </Text>
    </View>
  );
}

// Helper: Detail row component
function DetailRow({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <View className="flex-row justify-between items-center py-1.5">
      <Text className="text-slate-500 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
        {label}
      </Text>
      <Text
        className={`text-sm ${value ? 'text-slate-300' : 'text-slate-600'}`}
        style={{ fontFamily: mono ? 'SpaceMono_400Regular' : 'DMSans_500Medium' }}
      >
        {value || '—'}
      </Text>
    </View>
  );
}

// Helper: extract airport code from strings like "Miami (MIA)" or "MIA - Miami International"
function extractAirportCode(str: string | null | undefined): string | null {
  if (!str) return null;
  const match = str.match(/\b([A-Z]{3})\b/);
  return match ? match[1] : null;
}

// Type-specific expanded details
function ExpandedDetails({ reservation, onCopyConfirmation }: { reservation: Reservation; onCopyConfirmation: () => void }) {
  const d = reservation.details || {};

  // ✈️ FLIGHT layout
  if (reservation.type === 'flight') {
    const depAirport = d['Departure Airport'] || d['From'] || null;
    const arrAirport = d['Arrival Airport'] || d['To'] || null;
    const depCode = extractAirportCode(depAirport) || extractAirportCode(reservation.title);
    const arrCode = extractAirportCode(arrAirport) || extractAirportCode(reservation.title);
    const depTime = reservation.start_time ? formatTimeFromISO(reservation.start_time) : null;
    const arrTime = reservation.end_time ? formatTimeFromISO(reservation.end_time) : null;

    // Clean airport names (remove code if we extracted it)
    const depName = depAirport?.replace(/\s*\([A-Z]{3}\)\s*/g, '').replace(/^[A-Z]{3}\s*[-–]\s*/, '') || null;
    const arrName = arrAirport?.replace(/\s*\([A-Z]{3}\)\s*/g, '').replace(/^[A-Z]{3}\s*[-–]\s*/, '') || null;

    return (
      <View className="px-4 py-3">
        {/* Visual Flight Route */}
        {(depCode || arrCode) && (
          <View className="bg-slate-700/20 rounded-xl p-4 mb-3">
            <View className="flex-row items-center justify-between">
              {/* Departure */}
              <View className="items-center flex-1">
                <Text className="text-white text-xl font-bold" style={{ fontFamily: 'SpaceMono_700Bold' }}>
                  {depCode || '---'}
                </Text>
                <Text className="text-slate-400 text-xs mt-1 text-center" numberOfLines={1} style={{ fontFamily: 'DMSans_400Regular' }}>
                  {depName || 'Departure'}
                </Text>
                {depTime && (
                  <Text className="text-slate-500 text-xs mt-0.5" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                    {depTime}
                  </Text>
                )}
              </View>

              {/* Route line with plane */}
              <View className="flex-row items-center mx-2 flex-1 justify-center">
                <View className="h-px bg-slate-600 flex-1" />
                <Plane size={16} color="#3B82F6" style={{ marginHorizontal: 4 }} />
                <View className="h-px bg-slate-600 flex-1" />
              </View>

              {/* Arrival */}
              <View className="items-center flex-1">
                <Text className="text-white text-xl font-bold" style={{ fontFamily: 'SpaceMono_700Bold' }}>
                  {arrCode || '---'}
                </Text>
                <Text className="text-slate-400 text-xs mt-1 text-center" numberOfLines={1} style={{ fontFamily: 'DMSans_400Regular' }}>
                  {arrName || 'Arrival'}
                </Text>
                {arrTime && (
                  <Text className="text-slate-500 text-xs mt-0.5" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                    {arrTime}
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Confirmation */}
        {reservation.confirmation_number && (
          <Pressable
            onPress={onCopyConfirmation}
            className="flex-row items-center justify-between bg-slate-700/30 rounded-xl p-3 mb-3"
          >
            <View>
              <Text className="text-slate-500 text-xs" style={{ fontFamily: 'DMSans_400Regular' }}>
                Confirmation
              </Text>
              <Text className="text-white text-sm mt-0.5" style={{ fontFamily: 'SpaceMono_700Bold' }}>
                {reservation.confirmation_number}
              </Text>
            </View>
            <Copy size={16} color="#64748B" />
          </Pressable>
        )}

        {/* Flight details — always show Gate & Seat */}
        <DetailRow label="Flight" value={d['Flight Number'] || d['Flight']} mono />
        <DetailRow label="Airline" value={d['Airline']} />
        <DetailRow label="Class" value={d['Class']} />
        <DetailRow label="Seat" value={d['Seat']} mono />
        <DetailRow label="Gate" value={d['Gate']} mono />
        {d['Terminal'] && <DetailRow label="Terminal" value={d['Terminal']} />}
        {d['Baggage'] && <DetailRow label={/food|meal|snack|purchase/i.test(d['Baggage']) ? 'Meals' : 'Baggage'} value={d['Baggage']} />}
        {d['Duration'] && <DetailRow label="Duration" value={d['Duration']} />}
        {d['Aircraft'] && <DetailRow label="Aircraft" value={d['Aircraft']} />}
      </View>
    );
  }

  // 🏨 HOTEL layout
  if (reservation.type === 'hotel') {
    const checkIn = reservation.start_time ? formatTimeFromISO(reservation.start_time) : null;
    const checkOut = reservation.end_time ? formatTimeFromISO(reservation.end_time) : null;
    const checkInDate = reservation.start_time ? formatDate(new Date(reservation.start_time)) : null;
    const checkOutDate = reservation.end_time ? formatDate(new Date(reservation.end_time)) : null;

    // Calculate nights
    let nights: number | null = null;
    if (reservation.start_time && reservation.end_time) {
      const diffMs = new Date(reservation.end_time).getTime() - new Date(reservation.start_time).getTime();
      nights = Math.round(diffMs / (1000 * 60 * 60 * 24));
    }

    return (
      <View className="px-4 py-3">
        {/* Check-in / Check-out visual */}
        <View className="bg-slate-700/20 rounded-xl p-4 mb-3">
          <View className="flex-row justify-between">
            <View className="flex-1">
              <Text className="text-slate-500 text-xs uppercase tracking-wider" style={{ fontFamily: 'DMSans_500Medium' }}>
                Check-in
              </Text>
              <Text className="text-white text-sm font-bold mt-1" style={{ fontFamily: 'DMSans_700Bold' }}>
                {checkInDate || '—'}
              </Text>
              {checkIn && (
                <Text className="text-slate-400 text-xs mt-0.5" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                  {checkIn}
                </Text>
              )}
            </View>
            {nights !== null && (
              <View className="items-center justify-center mx-3">
                <View className="bg-purple-500/20 px-3 py-1.5 rounded-full">
                  <Text className="text-purple-400 text-xs font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                    {nights} {nights === 1 ? 'night' : 'nights'}
                  </Text>
                </View>
              </View>
            )}
            <View className="flex-1 items-end">
              <Text className="text-slate-500 text-xs uppercase tracking-wider" style={{ fontFamily: 'DMSans_500Medium' }}>
                Check-out
              </Text>
              <Text className="text-white text-sm font-bold mt-1" style={{ fontFamily: 'DMSans_700Bold' }}>
                {checkOutDate || '—'}
              </Text>
              {checkOut && (
                <Text className="text-slate-400 text-xs mt-0.5" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                  {checkOut}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Address */}
        {reservation.address && (
          <View className="flex-row items-start mb-3">
            <MapPin size={14} color="#64748B" />
            <Text className="text-slate-400 text-sm ml-2 flex-1" style={{ fontFamily: 'DMSans_400Regular' }}>
              {reservation.address}
            </Text>
          </View>
        )}

        {/* Confirmation */}
        {reservation.confirmation_number && (
          <Pressable
            onPress={onCopyConfirmation}
            className="flex-row items-center justify-between bg-slate-700/30 rounded-xl p-3 mb-3"
          >
            <View>
              <Text className="text-slate-500 text-xs" style={{ fontFamily: 'DMSans_400Regular' }}>
                Confirmation
              </Text>
              <Text className="text-white text-sm mt-0.5" style={{ fontFamily: 'SpaceMono_700Bold' }}>
                {reservation.confirmation_number}
              </Text>
            </View>
            <Copy size={16} color="#64748B" />
          </Pressable>
        )}

        {/* Hotel details — always show Room Type */}
        <DetailRow label="Room Type" value={d['Room Type'] || d['Room']} />
        {d['Guest'] && <DetailRow label="Guest" value={d['Guest']} />}
        {d['Guests'] && <DetailRow label="Guests" value={d['Guests']} />}
        {d['Hotel Chain'] && <DetailRow label="Hotel Chain" value={d['Hotel Chain']} />}
        {d['Amenities'] && <DetailRow label="Amenities" value={d['Amenities']} />}
        {d['WiFi'] && <DetailRow label="WiFi" value={d['WiFi']} />}
        {d['Parking'] && <DetailRow label="Parking" value={d['Parking']} />}
      </View>
    );
  }

  // 🚗 CAR RENTAL layout
  if (reservation.type === 'car') {
    const pickupTime = reservation.start_time ? formatTimeFromISO(reservation.start_time) : null;
    const pickupDate = reservation.start_time ? formatDate(new Date(reservation.start_time)) : null;
    const dropoffTime = reservation.end_time ? formatTimeFromISO(reservation.end_time) : null;
    const dropoffDate = reservation.end_time ? formatDate(new Date(reservation.end_time)) : null;

    return (
      <View className="px-4 py-3">
        {/* Pickup / Dropoff visual */}
        <View className="bg-slate-700/20 rounded-xl p-4 mb-3">
          {/* Pickup */}
          <View className="flex-row items-start mb-3">
            <View className="bg-emerald-500/20 w-8 h-8 rounded-full items-center justify-center mr-3 mt-0.5">
              <Text className="text-emerald-400 text-xs font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>P</Text>
            </View>
            <View className="flex-1">
              <Text className="text-slate-500 text-xs uppercase tracking-wider" style={{ fontFamily: 'DMSans_500Medium' }}>
                Pickup
              </Text>
              <Text className="text-white text-sm font-bold mt-0.5" style={{ fontFamily: 'DMSans_700Bold' }}>
                {pickupDate || '—'}{pickupTime ? ` at ${pickupTime}` : ''}
              </Text>
              <Text className="text-slate-400 text-xs mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                {d['Pickup Location'] || reservation.address || '—'}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View className="ml-4 border-l border-dashed border-slate-600 h-2 mb-3" />

          {/* Dropoff */}
          <View className="flex-row items-start">
            <View className="bg-red-500/20 w-8 h-8 rounded-full items-center justify-center mr-3 mt-0.5">
              <Text className="text-red-400 text-xs font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>D</Text>
            </View>
            <View className="flex-1">
              <Text className="text-slate-500 text-xs uppercase tracking-wider" style={{ fontFamily: 'DMSans_500Medium' }}>
                Drop-off
              </Text>
              <Text className="text-white text-sm font-bold mt-0.5" style={{ fontFamily: 'DMSans_700Bold' }}>
                {dropoffDate || '—'}{dropoffTime ? ` at ${dropoffTime}` : ''}
              </Text>
              <Text className="text-slate-400 text-xs mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                {d['Dropoff Location'] || d['Drop-off Location'] || reservation.address || '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* Confirmation */}
        {reservation.confirmation_number && (
          <Pressable
            onPress={onCopyConfirmation}
            className="flex-row items-center justify-between bg-slate-700/30 rounded-xl p-3 mb-3"
          >
            <View>
              <Text className="text-slate-500 text-xs" style={{ fontFamily: 'DMSans_400Regular' }}>
                Confirmation
              </Text>
              <Text className="text-white text-sm mt-0.5" style={{ fontFamily: 'SpaceMono_700Bold' }}>
                {reservation.confirmation_number}
              </Text>
            </View>
            <Copy size={16} color="#64748B" />
          </Pressable>
        )}

        {/* Car details */}
        {d['Company'] && <DetailRow label="Company" value={d['Company']} />}
        {d['Car Type'] && <DetailRow label="Car Type" value={d['Car Type']} />}
        {d['Vehicle'] && <DetailRow label="Vehicle" value={d['Vehicle']} />}
        {d['Insurance'] && <DetailRow label="Insurance" value={d['Insurance']} />}
      </View>
    );
  }

  // 🚂 TRAIN layout
  if (reservation.type === 'train') {
    const depStation = d['Departure Station'] || d['From'] || null;
    const arrStation = d['Arrival Station'] || d['To'] || null;
    const depTime = reservation.start_time ? formatTimeFromISO(reservation.start_time) : null;
    const arrTime = reservation.end_time ? formatTimeFromISO(reservation.end_time) : null;

    return (
      <View className="px-4 py-3">
        {/* Visual Train Route */}
        {(depStation || arrStation) && (
          <View className="bg-slate-700/20 rounded-xl p-4 mb-3">
            <View className="flex-row items-center justify-between">
              <View className="items-center flex-1">
                <Text className="text-white text-sm font-bold text-center" style={{ fontFamily: 'DMSans_700Bold' }}>
                  {depStation || '—'}
                </Text>
                {depTime && (
                  <Text className="text-slate-500 text-xs mt-0.5" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                    {depTime}
                  </Text>
                )}
              </View>
              <View className="flex-row items-center mx-2 flex-1 justify-center">
                <View className="h-px bg-slate-600 flex-1" />
                <Train size={16} color="#F59E0B" style={{ marginHorizontal: 4 }} />
                <View className="h-px bg-slate-600 flex-1" />
              </View>
              <View className="items-center flex-1">
                <Text className="text-white text-sm font-bold text-center" style={{ fontFamily: 'DMSans_700Bold' }}>
                  {arrStation || '—'}
                </Text>
                {arrTime && (
                  <Text className="text-slate-500 text-xs mt-0.5" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                    {arrTime}
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Confirmation */}
        {reservation.confirmation_number && (
          <Pressable
            onPress={onCopyConfirmation}
            className="flex-row items-center justify-between bg-slate-700/30 rounded-xl p-3 mb-3"
          >
            <View>
              <Text className="text-slate-500 text-xs" style={{ fontFamily: 'DMSans_400Regular' }}>
                Confirmation
              </Text>
              <Text className="text-white text-sm mt-0.5" style={{ fontFamily: 'SpaceMono_700Bold' }}>
                {reservation.confirmation_number}
              </Text>
            </View>
            <Copy size={16} color="#64748B" />
          </Pressable>
        )}

        {/* Train details */}
        {d['Train Number'] && <DetailRow label="Train" value={d['Train Number']} mono />}
        {d['Operator'] && <DetailRow label="Operator" value={d['Operator']} />}
        <DetailRow label="Seat" value={d['Seat']} mono />
        {d['Car'] && <DetailRow label="Car" value={d['Car']} />}
        {d['Class'] && <DetailRow label="Class" value={d['Class']} />}
        {d['Platform'] && <DetailRow label="Platform" value={d['Platform']} />}
      </View>
    );
  }

  // 📋 GENERIC layout (meetings, events, etc.)
  return (
    <View className="px-4 py-3">
      {reservation.address && (
        <View className="flex-row items-start mb-3">
          <MapPin size={14} color="#64748B" />
          <Text className="text-slate-400 text-sm ml-2 flex-1" style={{ fontFamily: 'DMSans_400Regular' }}>
            {reservation.address}
          </Text>
        </View>
      )}

      {reservation.confirmation_number && (
        <Pressable
          onPress={onCopyConfirmation}
          className="flex-row items-center justify-between bg-slate-700/30 rounded-xl p-3 mb-3"
        >
          <View>
            <Text className="text-slate-500 text-xs" style={{ fontFamily: 'DMSans_400Regular' }}>
              Confirmation
            </Text>
            <Text className="text-white text-sm mt-0.5" style={{ fontFamily: 'SpaceMono_700Bold' }}>
              {reservation.confirmation_number}
            </Text>
          </View>
          <Copy size={16} color="#64748B" />
        </Pressable>
      )}

      {/* Generic details — hide empty values */}
      {Object.entries(d).map(([key, value]) => {
        if (!value || (typeof value === 'string' && !value.trim())) return null;
        return <DetailRow key={key} label={key} value={String(value)} />;
      })}
    </View>
  );
}

function ReservationCard({ reservation, index, isFirst, isLast, tripId }: {
  reservation: Reservation;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  tripId: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState(false);
  const deleteReservation = useDeleteReservation();
  const typeColor = getTypeColor(reservation.type);
  const statusColor = getStatusColor(reservation.status);
  
  // For flights with API data, use the real flight status instead of time-based guess
  // Use getStoredFlightStatus() which validates the data matches this reservation's date
  const flightStatusData = reservation.type === 'flight' ? getStoredFlightStatus(reservation) : null;
  const liveStatus: LiveStatus | null = flightStatusData
    ? getFlightLiveStatus(flightStatusData)
    : getLiveStatus(
        reservation.type,
        // BUG FIX: Use timezone-aware start time for flights, device-local for others
        reservation.type === 'flight' ? getFlightDepartureUTC(reservation) : new Date(reservation.start_time),
        reservation.end_time ? (reservation.type === 'flight' ? getReservationEndUTC(reservation) ?? undefined : new Date(reservation.end_time)) : undefined,
        reservation.status
      );

  const handleCopyConfirmation = async () => {
    if (reservation.confirmation_number) {
      await Clipboard.setStringAsync(reservation.confirmation_number);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded(!expanded);
  };

  const handleEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/edit-reservation?id=${reservation.id}`);
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    Alert.alert(
      'Delete Reservation',
      `Are you sure you want to delete "${reservation.title}"?`,
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
              await deleteReservation.mutateAsync({ id: reservation.id, tripId });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Error', error.message || 'Failed to delete reservation');
            }
          },
        },
      ]
    );
  };

  // Extract gate and seat for flights to show inline
  const gateInfo = reservation.type === 'flight' && reservation.address ? reservation.address.split(',')[0] : null;
  const seatInfo = reservation.type === 'flight' ? reservation.details?.['Seat']?.split(' ')[0] : null;

  // Determine if this flight is cancelled
  const isCancelled = reservation.status === 'cancelled' ||
    flightStatusData?.flight_status === 'cancelled';

  return (
    <Animated.View
      entering={FadeInRight.duration(400).delay(index * 80)}
      className="flex-row"
    >
      {/* Timeline — with ambient glow */}
      <View className="w-12 items-center">
        <View
          className={`w-0.5 flex-1 ${isFirst ? 'bg-transparent' : 'bg-slate-700/60'}`}
          style={{ marginBottom: -12 }}
        />
        <View style={{ position: 'relative' }}>
          {/* Glow ring */}
          {!isCancelled && (
            <View
              style={{
                position: 'absolute',
                top: -3,
                left: -3,
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: typeColor + '25',
              }}
            />
          )}
          <View
            style={{
              backgroundColor: isCancelled ? '#EF4444' : typeColor,
              width: 12,
              height: 12,
              borderRadius: 6,
              opacity: isCancelled ? 0.6 : 1,
              shadowColor: isCancelled ? '#EF4444' : typeColor,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: isCancelled ? 0 : 0.5,
              shadowRadius: 6,
              elevation: isCancelled ? 0 : 4,
            }}
          />
        </View>
        <View
          className={`w-0.5 flex-1 ${isLast ? 'bg-transparent' : 'bg-slate-700/60'}`}
          style={{ marginTop: -12 }}
        />
      </View>

      {/* Card Content */}
      <AnimatedPressable
        onPress={handlePress}
        onLongPress={handleDelete}
        className="flex-1 mb-4"
      >
        <View
          className="rounded-2xl overflow-hidden"
          style={{
            backgroundColor: isCancelled ? 'rgba(239,68,68,0.06)' : 'rgba(30,41,59,0.6)',
            borderWidth: 1,
            borderColor: isCancelled ? 'rgba(239,68,68,0.25)' : 'rgba(51,65,85,0.5)',
          }}
        >
          {/* Main Row */}
          <View className="p-4">
            <View className="flex-row items-start">
              <View
                style={{ backgroundColor: typeColor + '20', padding: 10, borderRadius: 12 }}
              >
                <ReservationIcon type={reservation.type} size={20} color={typeColor} />
              </View>
              <View className="flex-1 ml-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-white font-bold text-base flex-1" style={{ fontFamily: 'DMSans_700Bold' }}>
                    {reservation.title}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    {liveStatus ? (
                      <LiveStatusChip status={liveStatus} />
                    ) : (
                      <View
                        className="px-2 py-0.5 rounded-full flex-row items-center"
                        style={{ backgroundColor: statusColor + '20' }}
                      >
                        {reservation.status === 'confirmed' && <CheckCircle size={10} color={statusColor} />}
                        {reservation.status === 'delayed' && <AlertCircle size={10} color={statusColor} />}
                        <Text
                          className="text-xs ml-1 capitalize"
                          style={{ color: statusColor, fontFamily: 'DMSans_500Medium' }}
                        >
                          {reservation.status}
                        </Text>
                      </View>
                    )}
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        const actions: any[] = [];
                        if (reservation.confirmation_number) {
                          actions.push({
                            text: `Copy Conf # (${reservation.confirmation_number})`,
                            onPress: handleCopyConfirmation,
                          });
                        }
                        actions.push(
                          { text: 'Edit', onPress: handleEdit },
                          { text: 'Delete', onPress: handleDelete, style: 'destructive' },
                          { text: 'Cancel', style: 'cancel' },
                        );
                        Alert.alert(reservation.title, 'Choose an action', actions);
                      }}
                      className="p-1"
                    >
                      <MoreVertical size={16} color="#64748B" />
                    </Pressable>
                  </View>
                </View>
                {reservation.subtitle && (
                  <Text className="text-slate-400 text-sm mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                    {reservation.subtitle}
                    {reservation.type === 'flight' && (gateInfo || seatInfo) && (
                      <Text className="text-slate-500" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                        {gateInfo ? ` · ${gateInfo}` : ''}
                        {seatInfo ? ` · ${seatInfo}` : ''}
                      </Text>
                    )}
                  </Text>
                )}
                <View className="flex-row items-center mt-2">
                  <Clock size={12} color="#64748B" />
                  <Text className="text-slate-500 text-xs ml-1" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                    {reservation.type === 'flight' || reservation.type === 'train'
                      ? (() => {
                          // For flights with live API data, prefer the API's local airport time
                          // over the stored reservation time (which may have timezone issues)
                          const contextInfo = reservation.type === 'flight' && flightStatusData
                            ? getContextualTimeInfo(reservation, flightStatusData)
                            : null;
                          const depTime = contextInfo?.time || formatTimeFromISO(getLocalTimeISO(reservation, 'start'));
                          const flightDur = getFlightDuration(reservation);
                          if (flightDur) {
                            return `${depTime} · ${flightDur}`;
                          }
                          if (reservation.end_time) {
                            // Fallback: compute duration only for non-flight or same-timezone trips
                            // For flights, naive end-start is wrong because departure/arrival are in different timezones
                            if (reservation.type !== 'flight') {
                              const diffMs = new Date(reservation.end_time).getTime() - new Date(reservation.start_time).getTime();
                              const totalMins = Math.round(diffMs / 60000);
                              if (totalMins > 0 && totalMins < 1440) {
                                const hrs = Math.floor(totalMins / 60);
                                const mins = totalMins % 60;
                                const duration = hrs > 0
                                  ? (mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`)
                                  : `${mins}m`;
                                return `${depTime} · ${duration}`;
                              }
                            }
                          }
                          return depTime;
                        })()
                      : (() => {
                          // Hotels, cars, etc. — show time range using local times
                          const startTime = formatTimeFromISO(getLocalTimeISO(reservation, 'start'));
                          if (reservation.end_time) {
                            return `${startTime} - ${formatTimeFromISO(getLocalTimeISO(reservation, 'end'))}`;
                          }
                          return startTime;
                        })()
                    }
                  </Text>
                </View>
              </View>
            </View>

            {/* Cancellation Banner */}
            {isCancelled && (() => {
              const cancelInfo: Record<string, { title: string; subtitle: string }> = {
                flight: { title: 'Flight Cancelled', subtitle: 'Contact your airline for rebooking options' },
                hotel: { title: 'Booking Cancelled', subtitle: 'Contact the hotel for alternatives' },
                car: { title: 'Rental Cancelled', subtitle: 'Contact the rental company for options' },
                train: { title: 'Train Cancelled', subtitle: 'Contact the operator for rebooking options' },
                event: { title: 'Event Cancelled', subtitle: 'Contact the organizer for details' },
                meeting: { title: 'Meeting Cancelled', subtitle: 'Check with the organizer for updates' },
              };
              const info = cancelInfo[reservation.type] ?? { title: 'Cancelled', subtitle: 'Contact the provider for options' };
              return (
                <View className="mt-3 bg-red-500/15 rounded-xl p-3 flex-row items-center border border-red-500/20">
                  <AlertCircle size={16} color="#EF4444" />
                  <View className="ml-2 flex-1">
                    <Text className="text-red-400 text-sm font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                      {info.title}
                    </Text>
                    <Text className="text-red-400/70 text-xs mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                      {info.subtitle}
                    </Text>
                  </View>
                </View>
              );
            })()}

            {/* Alert */}
            {reservation.alert_message && !isCancelled && (
              <View className="mt-3 bg-amber-500/10 rounded-xl p-3 flex-row items-center">
                <AlertCircle size={14} color="#F59E0B" />
                <Text className="text-amber-400 text-xs ml-2 flex-1" style={{ fontFamily: 'DMSans_500Medium' }}>
                  {reservation.alert_message}
                </Text>
              </View>
            )}

            {/* Flight Status Bar — hero element for flights with live data */}
            {reservation.type === 'flight' && (() => {
              const flightStatus = getStoredFlightStatus(reservation);
              if (!flightStatus) return null;
              return (
                <View className="mt-3">
                  <FlightStatusBar status={flightStatus} compact={!expanded} />
                </View>
              );
            })()}
          </View>

          {/* Expanded Details — Type-specific layouts (shared component) */}
          {expanded && (
            <Animated.View
              entering={FadeInDown.duration(300)}
              className="border-t border-slate-700/50"
            >
              <ReservationExpandedDetails reservation={reservation} showFlightStatus={false} />
            </Animated.View>
          )}
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

function TripDetailScreenContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  
  const { data: trip, isLoading: tripLoading } = useTrip(id);
  const { data: reservations = [], isLoading: reservationsLoading } = useReservations(id);
  const { data: weather } = useWeather(trip?.destination);
  const { data: expenses } = useTripExpenses(id);
  const deleteTrip = useDeleteTrip();
  
  // Flight status: pull-to-refresh mutation + background polling
  const queryClient = useQueryClient();
  const refreshFlightStatus = useRefreshFlightStatus();
  const flightReservations = React.useMemo(
    () => reservations.filter((r: Reservation) => r.type === 'flight'),
    [reservations],
  );
  useFlightStatusPolling(id, flightReservations);

  const [refreshing, setRefreshing] = React.useState(false);
  const [showExpenses, setShowExpenses] = React.useState(false);

  const handleRefresh = React.useCallback(async () => {
    if (!id) return;
    setRefreshing(true);
    try {
      console.log('[FlightRefresh] Starting refresh for trip:', id);
      console.log('[FlightRefresh] Flight reservations count:', flightReservations.length);
      if (flightReservations.length > 0) {
        // Log the flight numbers we're looking for
        flightReservations.forEach((r: Reservation) => {
          const flightNum = r.details?.['Flight Number'] || r.details?.['Flight'] || r.title;
          console.log(`[FlightRefresh] Reservation "${r.title}" - Flight: ${flightNum}`);
        });
        const result = await refreshFlightStatus.mutateAsync(id);
        console.log('[FlightRefresh] Result:', JSON.stringify(result, null, 2));
        
        // Force refetch reservations from DB to get updated flight details
        await queryClient.invalidateQueries({ queryKey: ['reservations', id] });
        
        if (result?.results) {
          const errors = result.results.filter((r: any) => r.error);
          if (errors.length > 0) {
            Alert.alert(
              'Flight Status',
              errors.map((e: any) => `${e.flight_iata || 'Unknown'}: ${e.error}`).join('\n'),
            );
          } else {
            const updated = result.results.filter((r: any) => r.status);
            if (updated.length > 0) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          }
        }
      } else {
        console.log('[FlightRefresh] No flight reservations found in this trip');
      }
    } catch (e: any) {
      console.error('[FlightRefresh] Error:', e);
      Alert.alert('Flight Status Error', e?.message || 'Failed to check flight status. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, [id, flightReservations.length]);

  const scrollY = useSharedValue(0);
  const isLoading = tripLoading || reservationsLoading;

  const handleDeleteTrip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    Alert.alert(
      'Delete Trip',
      `Are you sure you want to delete "${trip?.name}"? This will also delete all reservations and receipts.`,
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
              await deleteTrip.mutateAsync(id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch (error: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Error', error.message || 'Failed to delete trip');
            }
          },
        },
      ]
    );
  };

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 150], [1, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(scrollY.value, [-100, 0], [1.2, 1], Extrapolation.CLAMP) },
    ],
  }));

  const titleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [100, 180], [0, 1], Extrapolation.CLAMP),
  }));

  if (isLoading) {
    return (
      <View className="flex-1 bg-slate-950 items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="text-slate-400 mt-4" style={{ fontFamily: 'DMSans_400Regular' }}>
          Loading trip...
        </Text>
      </View>
    );
  }

  if (!trip) {
    return (
      <View className="flex-1 bg-slate-950 items-center justify-center">
        <Text className="text-white">Trip not found</Text>
      </View>
    );
  }

  // Group reservations by date — use LOCAL time so Bali events show on the correct date
  const reservationsByDate = reservations.reduce((acc: Record<string, Reservation[]>, res: Reservation) => {
    // Use local time ISO (from details['Local Start Time'] or fallback to start_time)
    // to extract the correct local date for grouping
    const localISO = getLocalTimeISO(res, 'start');
    const dateKey = formatDateLong(new Date(localISO.match(/^(\d{4})-(\d{2})-(\d{2})/)![0] + 'T12:00:00'));
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(res);
    return acc;
  }, {});

  const sortedDates = Object.keys(reservationsByDate).sort(
    (a, b) => new Date(reservationsByDate[a][0].start_time).getTime() - new Date(reservationsByDate[b][0].start_time).getTime()
  );

  // Travel-logical type priority: transportation always comes before destination
  const getTypePriority = (type: ReservationType): number => {
    const priorities: Record<ReservationType, number> = {
      flight: 1,   // You arrive/depart first
      train: 2,    // Transit
      car: 3,      // Pick up rental after arriving
      hotel: 4,    // Check in last
      event: 5,
      meeting: 6,
    };
    return priorities[type] ?? 99;
  };

  // Helper: determine if a type is transportation (flight/train) vs destination (hotel/car/event)
  const isTransportation = (type: ReservationType): boolean => {
    return type === 'flight' || type === 'train';
  };

  // Create sections for SectionList with sticky headers
  const sections = sortedDates.map((dateKey) => {
    const dateReservations = reservationsByDate[dateKey];
    const firstRes = dateReservations[0];
    // BUG FIX: Use timezone-aware isReservationToday/isReservationTomorrow
    // so that a flight departing "today" in Tokyo shows as "Today" even when
    // the user's device is still on yesterday's date in a western timezone.
    const dateLabel = isReservationToday(firstRes)
      ? 'Today'
      : isReservationTomorrow(firstRes)
      ? 'Tomorrow'
      : dateKey;

    // Smart sort within each day:
    // 1. Transportation (flights/trains) ALWAYS come before destination types (hotels/cars)
    // 2. Within same category, sort chronologically
    // 3. For items in same category with close times, use type priority as tiebreaker
    const sortedReservations = [...dateReservations].sort((a, b) => {
      const isTransportA = isTransportation(a.type);
      const isTransportB = isTransportation(b.type);

      // Rule 1: Transportation always comes first
      if (isTransportA && !isTransportB) return -1;
      if (!isTransportA && isTransportB) return 1;

      // Rule 2: Both in same category (both transport or both destination) — sort by time
      const timeA = new Date(a.start_time).getTime();
      const timeB = new Date(b.start_time).getTime();
      const timeDiff = timeA - timeB;

      // If times are more than 2 hours apart, use strict chronological order
      const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
      if (Math.abs(timeDiff) > TWO_HOURS_MS) {
        return timeDiff;
      }

      // Rule 3: Times are close — use type priority as tiebreaker
      const priorityA = getTypePriority(a.type);
      const priorityB = getTypePriority(b.type);
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // Same type and close times — fall back to chronological
      return timeDiff;
    });

    return {
      title: dateLabel,
      data: sortedReservations,
    };
  });

  return (
    <View className="flex-1 bg-slate-950">
      {/* Header Image */}
      <Animated.View
        style={[headerAnimatedStyle, { position: 'absolute', top: 0, left: 0, right: 0, height: HEADER_HEIGHT }]}
      >
        <Image
          source={{ uri: trip.cover_image ?? 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800' }}
          style={{ width: SCREEN_WIDTH, height: HEADER_HEIGHT }}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(2,6,23,0.3)', 'rgba(2,6,23,0.9)', '#020617']}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
      </Animated.View>

      {/* Fixed Header Bar */}
      <SafeAreaView edges={['top']} className="absolute top-0 left-0 right-0 z-10">
        <View className="flex-row items-center justify-between px-4 py-2">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            className="bg-black/30 p-2.5 rounded-full"
          >
            <ChevronLeft size={22} color="#FFFFFF" />
          </Pressable>

          <Animated.Text
            style={[titleAnimatedStyle, { fontFamily: 'DMSans_700Bold' }]}
            className="text-white text-lg font-bold"
          >
            {trip.name}
          </Animated.Text>

          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/edit-trip?id=${trip.id}`);
              }}
              className="bg-black/30 p-2.5 rounded-full"
            >
              <Edit3 size={20} color="#FFFFFF" />
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/add-reservation?tripId=${trip.id}`);
              }}
              className="bg-black/30 p-2.5 rounded-full"
            >
              <Plus size={20} color="#FFFFFF" />
            </Pressable>
            <Pressable
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (trip) {
                  const success = await shareTripNative(trip);
                  if (success) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }
                }
              }}
              className="bg-black/30 p-2.5 rounded-full"
            >
              <Share2 size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {/* Scrollable Content */}
      <AnimatedSectionList
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: HEADER_HEIGHT - 40, paddingBottom: 100 }}
        stickySectionHeadersEnabled={true}
        sections={sections}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#3B82F6"
            colors={['#3B82F6']}
            progressViewOffset={HEADER_HEIGHT - 40}
          />
        }
        ListHeaderComponent={() => (
          <View className="px-5 pb-6">
            <Pressable onLongPress={handleDeleteTrip}>
              <Text className="text-white text-4xl font-bold" style={{ fontFamily: 'DMSans_700Bold', letterSpacing: -0.5 }}>
                {trip.name}
              </Text>
            </Pressable>

            {/* Info pills row */}
            <View className="flex-row flex-wrap items-center mt-3 gap-2">
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(30,41,59,0.7)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(51,65,85,0.5)' }}>
                <MapPin size={14} color="#94A3B8" />
                <Text className="text-slate-300 text-sm ml-1.5" style={{ fontFamily: 'DMSans_500Medium' }}>
                  {trip.destination}
                </Text>
              </View>
              {trip.status !== 'completed' && weather && (
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(30,41,59,0.7)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(51,65,85,0.5)' }}>
                  <Text className="text-slate-300 text-sm" style={{ fontFamily: 'DMSans_500Medium' }}>
                    {weather.temperature}° {getWeatherIcon(weather.condition)}
                  </Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(30,41,59,0.7)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(51,65,85,0.5)' }}>
                <Clock size={14} color="#64748B" />
                <Text className="text-slate-400 text-xs ml-1.5" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                  {formatDateLong(parseDateOnly(trip.start_date))} – {formatDateLong(parseDateOnly(trip.end_date))}
                </Text>
              </View>
            </View>

            {/* Expense Summary — discreet collapsed pill, expandable */}
            {expenses && expenses.total > 0 && (
              <View style={{ marginTop: 12 }}>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowExpenses(!showExpenses);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: 'rgba(30,41,59,0.5)',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: 'rgba(51,65,85,0.4)',
                  }}
                >
                  <Receipt size={14} color="#64748B" />
                  <Text className="text-slate-400 text-xs ml-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                    {expenses.count} receipt{expenses.count !== 1 ? 's' : ''} · {formatCurrency(expenses.total)}
                  </Text>
                  <View style={{ flex: 1 }} />
                  {showExpenses ? (
                    <ChevronUp size={14} color="#64748B" />
                  ) : (
                    <ChevronDown size={14} color="#64748B" />
                  )}
                </Pressable>

                {/* Expanded expense details */}
                {showExpenses && (
                  <Animated.View entering={FadeInDown.duration(250)}>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push('/(tabs)/receipts');
                      }}
                      style={{ marginTop: 8, borderRadius: 16, overflow: 'hidden' }}
                    >
                      <LinearGradient
                        colors={['rgba(16,185,129,0.08)', 'rgba(16,185,129,0.02)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{ padding: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(16,185,129,0.15)', flexDirection: 'row', alignItems: 'center' }}
                      >
                        <View style={{ backgroundColor: 'rgba(16,185,129,0.15)', padding: 8, borderRadius: 12 }}>
                          <DollarSign size={18} color="#10B981" />
                        </View>
                        <View className="flex-1 ml-3">
                          <Text className="text-white text-base font-bold" style={{ fontFamily: 'SpaceMono_700Bold' }}>
                            {formatCurrency(expenses.total)}
                          </Text>
                          {expenses.byCategory && Object.keys(expenses.byCategory).length > 0 && (
                            <Text className="text-slate-400 text-xs mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                              {Object.entries(expenses.byCategory).map(([cat, amt]) => `${cat} ${formatCurrency(amt as number)}`).join(' · ')}
                            </Text>
                          )}
                        </View>
                        <Text className="text-slate-500 text-xs" style={{ fontFamily: 'DMSans_500Medium' }}>
                          View All →
                        </Text>
                      </LinearGradient>
                    </Pressable>
                  </Animated.View>
                )}
              </View>
            )}
          </View>
        )}
        renderSectionHeader={({ section }) => (
          <View className="px-5 pt-3 pb-4 bg-slate-950">
            <View className="flex-row items-center">
              <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: '#3B82F6', marginRight: 10 }} />
              <Text
                className="text-slate-200 text-sm font-semibold uppercase tracking-wider"
                style={{ fontFamily: 'SpaceMono_400Regular' }}
              >
                {section.title}
              </Text>
              <View style={{ backgroundColor: 'rgba(59,130,246,0.12)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginLeft: 8 }}>
                <Text style={{ color: '#60A5FA', fontSize: 11, fontFamily: 'DMSans_700Bold' }}>{section.data.length}</Text>
              </View>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(51,65,85,0.4)', marginLeft: 12 }} />
            </View>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <View className="px-5">
            <ReservationCard
              reservation={item}
              index={index}
              isFirst={index === 0}
              isLast={index === section.data.length - 1}
              tripId={id}
            />
          </View>
        )}
      />

      {/* Floating Ask AI Button */}
      <Animated.View
        entering={FadeInDown.duration(500).delay(300)}
        style={{
          position: 'absolute',
          bottom: 30,
          right: 20,
        }}
      >
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push('/modal');
          }}
          style={{
            shadowColor: '#A855F7',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
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
            }}
          >
            <Sparkles size={24} color="#FFFFFF" />
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function TripDetailScreen() {
  return (
    <ErrorBoundary
      fallbackTitle="Trip Error"
      fallbackMessage="Something went wrong loading this trip. Please try again."
    >
      <TripDetailScreenContent />
    </ErrorBoundary>
  );
}

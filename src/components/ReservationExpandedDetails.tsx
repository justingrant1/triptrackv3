import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Plane, Train, MapPin, Copy } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import type { Reservation } from '@/lib/types/database';
import { formatTime, formatTimeFromISO, formatDate } from '@/lib/utils';
import { FlightStatusBar } from '@/components/FlightStatusBar';
import { getStoredFlightStatus } from '@/lib/flight-status';

// Helper: Detail row component
export function DetailRow({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
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
export function extractAirportCode(str: string | null | undefined): string | null {
  if (!str) return null;
  const match = str.match(/\b([A-Z]{3})\b/);
  return match ? match[1] : null;
}

interface Props {
  reservation: Reservation;
  /** Show FlightStatusBar inside the expanded details (default true) */
  showFlightStatus?: boolean;
  /** Compact mode for smaller cards (Today tab) */
  compact?: boolean;
}

/**
 * Type-specific expanded details for reservations.
 * Shared between the trip detail page and the Today tab.
 */
export function ReservationExpandedDetails({ reservation, showFlightStatus = true, compact = false }: Props) {
  const d = reservation.details || {};

  const handleCopyConfirmation = async () => {
    if (reservation.confirmation_number) {
      await Clipboard.setStringAsync(reservation.confirmation_number);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  // ✈️ FLIGHT layout
  if (reservation.type === 'flight') {
    const depAirport = d['Departure Airport'] || d['From'] || null;
    const arrAirport = d['Arrival Airport'] || d['To'] || null;
    const depCode = extractAirportCode(depAirport) || extractAirportCode(reservation.title);
    const arrCode = extractAirportCode(arrAirport) || extractAirportCode(reservation.title);
    // Use formatTimeFromISO to preserve local departure/arrival times (avoids timezone conversion)
    const depTime = reservation.start_time ? formatTimeFromISO(reservation.start_time) : null;
    const arrTime = reservation.end_time ? formatTimeFromISO(reservation.end_time) : null;

    // Calculate flight duration
    let flightDuration: string | null = d['Duration'] || d['Journey Time'] || null;
    if (!flightDuration && reservation.start_time && reservation.end_time) {
      const diffMs = new Date(reservation.end_time).getTime() - new Date(reservation.start_time).getTime();
      const diffMins = Math.round(diffMs / 60000);
      if (diffMins > 0 && diffMins < 1440) { // sanity check: less than 24h
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        flightDuration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      }
    }

    // Clean airport names (remove code if we extracted it)
    const depName = depAirport?.replace(/\s*\([A-Z]{3}\)\s*/g, '').replace(/^[A-Z]{3}\s*[-–]\s*/, '') || null;
    const arrName = arrAirport?.replace(/\s*\([A-Z]{3}\)\s*/g, '').replace(/^[A-Z]{3}\s*[-–]\s*/, '') || null;

    // Always get live flight status for detail rows (gate, terminal, etc.)
    const liveFlightStatus = getStoredFlightStatus(reservation);
    // Only show the FlightStatusBar component if requested
    const showFlightStatusBar = showFlightStatus ? liveFlightStatus : null;

    return (
      <View className={compact ? 'py-2' : 'px-4 py-3'}>
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

              {/* Route line with plane + duration */}
              <View className="items-center mx-2 flex-1 justify-center">
                <View className="flex-row items-center w-full">
                  <View className="h-px bg-slate-600 flex-1" />
                  <Plane size={16} color="#3B82F6" style={{ marginHorizontal: 4 }} />
                  <View className="h-px bg-slate-600 flex-1" />
                </View>
                {flightDuration && (
                  <Text className="text-blue-400 text-xs mt-1" style={{ fontFamily: 'DMSans_500Medium' }}>
                    {flightDuration}
                  </Text>
                )}
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

        {/* Flight Status Bar */}
        {showFlightStatusBar && (
          <View className="mb-3">
            <FlightStatusBar status={showFlightStatusBar} compact={compact} />
          </View>
        )}

        {/* Confirmation */}
        {reservation.confirmation_number && (
          <Pressable
            onPress={handleCopyConfirmation}
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

        {/* Flight details — grouped: departure → arrival → personal */}
        <DetailRow label="Flight" value={liveFlightStatus?.flight_iata || d['Flight Number'] || d['Flight']} mono />
        <DetailRow label="Airline" value={liveFlightStatus?.airline_name || d['Airline']} />

        {/* Departure info */}
        <DetailRow label="Dep. Gate" value={liveFlightStatus?.dep_gate || d['Gate']} mono />
        <DetailRow label="Dep. Terminal" value={liveFlightStatus?.dep_terminal || d['Terminal']} />

        {/* Arrival info — sourced from live flight status, falling back to static details */}
        <DetailRow label="Arr. Gate" value={liveFlightStatus?.arr_gate || d['Arrival Gate']} mono />
        <DetailRow label="Arr. Terminal" value={liveFlightStatus?.arr_terminal || d['Arrival Terminal']} />

        {/* Personal / booking details */}
        <DetailRow label="Seat" value={d['Seat']} mono />
        <DetailRow label="Class" value={d['Class']} />
        {d['Baggage'] && <DetailRow label={/food|meal|snack|purchase/i.test(d['Baggage']) ? 'Meals' : 'Baggage'} value={d['Baggage']} />}
        {d['Duration'] && <DetailRow label="Duration" value={d['Duration']} />}
        {d['Aircraft'] && <DetailRow label="Aircraft" value={d['Aircraft']} />}
      </View>
    );
  }

  // 🏨 HOTEL layout
  if (reservation.type === 'hotel') {
    const checkIn = reservation.start_time ? formatTime(new Date(reservation.start_time)) : null;
    const checkOut = reservation.end_time ? formatTime(new Date(reservation.end_time)) : null;
    const checkInDate = reservation.start_time ? formatDate(new Date(reservation.start_time)) : null;
    const checkOutDate = reservation.end_time ? formatDate(new Date(reservation.end_time)) : null;

    let nights: number | null = null;
    if (reservation.start_time && reservation.end_time) {
      const diffMs = new Date(reservation.end_time).getTime() - new Date(reservation.start_time).getTime();
      nights = Math.round(diffMs / (1000 * 60 * 60 * 24));
    }

    return (
      <View className={compact ? 'py-2' : 'px-4 py-3'}>
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
            onPress={handleCopyConfirmation}
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
    const pickupTime = reservation.start_time ? formatTime(new Date(reservation.start_time)) : null;
    const pickupDate = reservation.start_time ? formatDate(new Date(reservation.start_time)) : null;
    const dropoffTime = reservation.end_time ? formatTime(new Date(reservation.end_time)) : null;
    const dropoffDate = reservation.end_time ? formatDate(new Date(reservation.end_time)) : null;

    return (
      <View className={compact ? 'py-2' : 'px-4 py-3'}>
        <View className="bg-slate-700/20 rounded-xl p-4 mb-3">
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
          <View className="ml-4 border-l border-dashed border-slate-600 h-2 mb-3" />
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

        {reservation.confirmation_number && (
          <Pressable
            onPress={handleCopyConfirmation}
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
    const depTime = reservation.start_time ? formatTime(new Date(reservation.start_time)) : null;
    const arrTime = reservation.end_time ? formatTime(new Date(reservation.end_time)) : null;

    return (
      <View className={compact ? 'py-2' : 'px-4 py-3'}>
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

        {reservation.confirmation_number && (
          <Pressable
            onPress={handleCopyConfirmation}
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
    <View className={compact ? 'py-2' : 'px-4 py-3'}>
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
          onPress={handleCopyConfirmation}
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

      {Object.entries(d)
        .filter(([key, value]) => value && !key.startsWith('_') && typeof value !== 'object' && (typeof value !== 'string' || value.trim()))
        .map(([key, value]) => (
          <DetailRow key={key} label={key} value={String(value)} />
        ))}
    </View>
  );
}

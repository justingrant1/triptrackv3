/**
 * Flight Status Hooks
 *
 * React Query hooks for flight tracking. All calls go through the
 * check-flight-status edge function — never directly to AirLabs.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  checkFlightStatusForTrip,
  checkFlightStatusForReservation,
  validateFlightNumber,
  getPollingInterval,
  getStoredFlightStatus,
  extractFlightNumber,
} from '../flight-status';
import type {
  FlightCheckBatchResult,
  FlightCheckResult,
  FlightValidationResult,
  FlightStatusData,
} from '../flight-status';
import type { Reservation } from '../types/database';

/**
 * Get the stored flight status for a reservation from its details JSONB.
 * This reads from the React Query cache (no API call).
 */
export function useStoredFlightStatus(reservation: Reservation | undefined): FlightStatusData | null {
  if (!reservation || reservation.type !== 'flight') return null;
  return getStoredFlightStatus(reservation) ?? null;
}

/**
 * Check flight status for all flights in a trip.
 * Used for pull-to-refresh on the trip detail screen.
 *
 * This is a mutation (not a query) because it's triggered by user action
 * and has side effects (updates Supabase, creates notifications).
 */
export function useRefreshFlightStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tripId: string): Promise<FlightCheckBatchResult> => {
      return checkFlightStatusForTrip(tripId);
    },
    onSuccess: (_data, tripId) => {
      // Invalidate reservations cache so UI picks up the updated details
      queryClient.invalidateQueries({ queryKey: ['reservations', tripId] });
      // Also invalidate upcoming reservations (Today screen)
      queryClient.invalidateQueries({ queryKey: ['reservations', 'upcoming'] });
    },
  });
}

/**
 * Check flight status for a single reservation.
 */
export function useRefreshSingleFlightStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reservationId,
      tripId,
    }: {
      reservationId: string;
      tripId: string;
    }): Promise<FlightCheckResult> => {
      return checkFlightStatusForReservation(reservationId);
    },
    onSuccess: (_data, { tripId }) => {
      queryClient.invalidateQueries({ queryKey: ['reservations', tripId] });
      queryClient.invalidateQueries({ queryKey: ['reservations', 'upcoming'] });
    },
  });
}

/**
 * Tiered polling for flight status on a trip.
 *
 * Calculates the appropriate polling interval based on the nearest upcoming
 * flight's departure time, then uses React Query's refetchInterval to
 * automatically re-check at the right cadence.
 *
 * The query calls the edge function which calls AirLabs server-side.
 */
export function useFlightStatusPolling(
  tripId: string | undefined,
  flightReservations: Reservation[],
) {
  // Find the nearest upcoming flight to determine polling interval
  const nearestFlight = flightReservations
    .filter((r) => r.type === 'flight')
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    )[0];

  // Calculate polling interval based on nearest flight
  let pollingInterval: number | false = false;

  if (nearestFlight) {
    const departureTime = new Date(nearestFlight.start_time);
    const storedStatus = getStoredFlightStatus(nearestFlight);
    const arrivalTime = nearestFlight.end_time
      ? new Date(nearestFlight.end_time)
      : null;

    const interval = getPollingInterval(
      departureTime,
      storedStatus?.flight_status,
      arrivalTime,
    );

    pollingInterval = interval ?? false;
  }

  return useQuery({
    queryKey: ['flight-status', 'polling', tripId],
    queryFn: async (): Promise<FlightCheckBatchResult | null> => {
      if (!tripId) return null;
      try {
        return await checkFlightStatusForTrip(tripId);
      } catch (error) {
        console.error('Flight status polling error:', error);
        return null;
      }
    },
    enabled: !!tripId && flightReservations.length > 0 && pollingInterval !== false,
    refetchInterval: pollingInterval,
    // Don't show stale data as loading
    placeholderData: (prev) => prev,
    // Don't retry aggressively for polling
    retry: 1,
    // Keep data fresh
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Validate a flight number when the user enters it.
 * Returns flight details if found (airports, times, terminal, gate).
 */
export function useValidateFlightNumber() {
  return useMutation({
    mutationFn: async ({
      flightNumber,
      date,
    }: {
      flightNumber: string;
      date?: string;
    }): Promise<FlightValidationResult> => {
      // First clean the flight number
      const cleaned = extractFlightNumber(flightNumber);
      if (!cleaned) {
        return {
          valid: false,
          flight_iata: flightNumber,
          airline_name: null,
          dep_iata: null,
          dep_airport: null,
          dep_terminal: null,
          dep_gate: null,
          dep_scheduled: null,
          arr_iata: null,
          arr_airport: null,
          arr_terminal: null,
          arr_scheduled: null,
          flight_status: 'unknown',
          error: 'Invalid flight number format. Use format like AA182 or AA 182.',
        };
      }

      return validateFlightNumber(cleaned, date);
    },
  });
}

/**
 * Check if any flight in a list of reservations has live tracking data.
 */
export function hasAnyFlightTracking(reservations: Reservation[]): boolean {
  return reservations.some(
    (r) => r.type === 'flight' && r.details?._flight_status != null,
  );
}

/**
 * Get the count of flights with active tracking in a trip.
 */
export function getTrackedFlightCount(reservations: Reservation[]): number {
  return reservations.filter(
    (r) => r.type === 'flight' && r.details?._flight_status != null,
  ).length;
}

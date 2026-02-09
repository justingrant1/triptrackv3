/**
 * Flight Status Service
 * 
 * Client-side types and utilities for flight tracking.
 * All API calls go through the Supabase edge function (check-flight-status)
 * to keep the AirLabs API key server-side and centralize change detection.
 */

import { supabase } from './supabase';
import type { Reservation } from './types/database';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Standardized flight status from any provider */
export interface FlightStatusData {
  /** IATA flight number e.g. "AA182" */
  flight_iata: string;
  /** Airline name */
  airline_name: string | null;
  /** Airline IATA code e.g. "AA" */
  airline_iata: string | null;

  // Departure info
  dep_iata: string | null;
  dep_airport: string | null;
  dep_terminal: string | null;
  dep_gate: string | null;
  dep_scheduled: string | null;
  dep_estimated: string | null;
  dep_actual: string | null;
  dep_delay: number | null; // minutes

  // Arrival info
  arr_iata: string | null;
  arr_airport: string | null;
  arr_terminal: string | null;
  arr_gate: string | null;
  arr_baggage: string | null;
  arr_scheduled: string | null;
  arr_estimated: string | null;
  arr_actual: string | null;
  arr_delay: number | null; // minutes

  // Status
  flight_status: FlightPhase;
  aircraft_icao: string | null;

  // Metadata
  last_checked: string;
  provider: 'airlabs' | 'manual';
}

/** Possible flight phases */
export type FlightPhase =
  | 'scheduled'
  | 'active'      // in the air
  | 'landed'
  | 'cancelled'
  | 'incident'
  | 'diverted'
  | 'unknown';

/** A detected change between old and new flight data */
export interface FlightChange {
  type: FlightChangeType;
  field: string;
  old_value: string | number | null;
  new_value: string | number | null;
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export type FlightChangeType =
  | 'gate_change'
  | 'terminal_change'
  | 'delay_change'
  | 'status_change'
  | 'time_change'
  | 'baggage_update'
  | 'cancellation'
  | 'diversion';

/** Result from the check-flight-status edge function */
export interface FlightCheckResult {
  reservation_id: string;
  flight_iata: string;
  status: FlightStatusData | null;
  changes: FlightChange[];
  error: string | null;
}

/** Result from checking all flights for a user/trip */
export interface FlightCheckBatchResult {
  results: FlightCheckResult[];
  checked_at: string;
  total_api_calls: number;
}

/** Validation result when entering a flight number */
export interface FlightValidationResult {
  valid: boolean;
  flight_iata: string;
  airline_name: string | null;
  dep_iata: string | null;
  dep_airport: string | null;
  dep_terminal: string | null;
  dep_gate: string | null;
  dep_scheduled: string | null;
  arr_iata: string | null;
  arr_airport: string | null;
  arr_terminal: string | null;
  arr_scheduled: string | null;
  flight_status: FlightPhase;
  error: string | null;
}

// ─── Polling Interval Logic ──────────────────────────────────────────────────

/**
 * Calculate the appropriate polling interval based on how close the flight is.
 * Returns interval in milliseconds, or null if polling should stop.
 * 
 * Tiered strategy:
 * - >24h out: every 6 hours
 * - 4-24h out: every 1 hour
 * - 1-4h out: every 15 minutes
 * - Boarding window through landing: every 5 minutes
 * - After landing confirmation: stop polling
 */
export function getPollingInterval(
  departureTime: Date,
  flightStatus?: FlightPhase,
  arrivalTime?: Date | null,
): number | null {
  const now = new Date();

  // If flight has landed, cancelled, or had an incident — stop polling
  if (flightStatus === 'landed' || flightStatus === 'cancelled' || flightStatus === 'incident') {
    return null;
  }

  // If we have an arrival time and it's in the past by more than 2 hours, stop
  if (arrivalTime) {
    const timeSinceLanding = now.getTime() - arrivalTime.getTime();
    if (timeSinceLanding > 2 * 60 * 60 * 1000) {
      return null;
    }
  }

  const msUntilDeparture = departureTime.getTime() - now.getTime();
  const hoursUntilDeparture = msUntilDeparture / (1000 * 60 * 60);

  // Flight is active (in the air) — poll every 5 minutes
  if (flightStatus === 'active') {
    return 5 * 60 * 1000;
  }

  // Already departed (but we don't have 'active' status) — poll every 5 minutes
  if (hoursUntilDeparture < 0) {
    return 5 * 60 * 1000;
  }

  // Within boarding window (< 1 hour) — poll every 5 minutes
  if (hoursUntilDeparture <= 1) {
    return 5 * 60 * 1000;
  }

  // 1-4 hours out — poll every 15 minutes
  if (hoursUntilDeparture <= 4) {
    return 15 * 60 * 1000;
  }

  // 4-24 hours out — poll every 1 hour
  if (hoursUntilDeparture <= 24) {
    return 60 * 60 * 1000;
  }

  // More than 24 hours out — poll every 6 hours
  return 6 * 60 * 60 * 1000;
}

// ─── Flight Number Utilities ─────────────────────────────────────────────────

/**
 * Extract a clean IATA flight number from various formats.
 * Handles: "AA 182", "AA182", "American Airlines 182", "AA-182"
 * Returns null if no valid flight number found.
 */
export function extractFlightNumber(input: string): string | null {
  if (!input) return null;

  // Clean up the input
  const cleaned = input.trim().toUpperCase();

  // Try direct IATA format: "AA182" or "AA 182" or "AA-182"
  const iataMatch = cleaned.match(/^([A-Z]{2})\s*[-]?\s*(\d{1,4})$/);
  if (iataMatch) {
    return `${iataMatch[1]}${iataMatch[2]}`;
  }

  // Try format with airline code in the string: "AA 182 to JFK"
  const partialMatch = cleaned.match(/\b([A-Z]{2})\s*[-]?\s*(\d{1,4})\b/);
  if (partialMatch) {
    return `${partialMatch[1]}${partialMatch[2]}`;
  }

  // Try 3-letter ICAO code: "AAL182"
  const icaoMatch = cleaned.match(/^([A-Z]{3})\s*(\d{1,4})$/);
  if (icaoMatch) {
    return `${icaoMatch[1]}${icaoMatch[2]}`;
  }

  return null;
}

/**
 * Check if a reservation has flight status data stored in its details.
 */
export function hasFlightStatus(reservation: Reservation): boolean {
  return (
    reservation.type === 'flight' &&
    reservation.details?._flight_status != null
  );
}

/**
 * Get the stored flight status data from a reservation's details.
 */
export function getStoredFlightStatus(reservation: Reservation): FlightStatusData | null {
  if (!hasFlightStatus(reservation)) return null;
  return reservation.details._flight_status as FlightStatusData;
}

/**
 * Get the previous flight status (for change detection on client side).
 */
export function getPreviousFlightStatus(reservation: Reservation): FlightStatusData | null {
  return reservation.details?._previous_flight_status as FlightStatusData | null;
}

// ─── Edge Function Callers ───────────────────────────────────────────────────

/**
 * Call the check-flight-status edge function for a specific trip.
 * This is what pull-to-refresh calls.
 */
export async function checkFlightStatusForTrip(tripId: string): Promise<FlightCheckBatchResult> {
  console.log('[checkFlightStatusForTrip] Starting for trip:', tripId);
  
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    console.error('[checkFlightStatusForTrip] Session error:', sessionError);
    throw new Error('Session error: ' + sessionError.message);
  }
  if (!session) {
    console.error('[checkFlightStatusForTrip] No session found');
    throw new Error('Not authenticated — please log in again');
  }
  
  console.log('[checkFlightStatusForTrip] Calling edge function with session user:', session.user.id);
  console.log('[checkFlightStatusForTrip] Token expires at:', new Date((session.expires_at || 0) * 1000).toISOString());

  // Use direct fetch instead of supabase.functions.invoke to get better error details
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const functionUrl = `${supabaseUrl}/functions/v1/check-flight-status`;
  
  console.log('[checkFlightStatusForTrip] Fetching:', functionUrl);
  
  const fetchResponse = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
    },
    body: JSON.stringify({
      mode: 'trip',
      trip_id: tripId,
    }),
  });

  console.log('[checkFlightStatusForTrip] Response status:', fetchResponse.status);
  
  const responseText = await fetchResponse.text();
  console.log('[checkFlightStatusForTrip] Response body:', responseText.substring(0, 500));

  if (!fetchResponse.ok) {
    throw new Error(`Flight status check failed (${fetchResponse.status}): ${responseText.substring(0, 200)}`);
  }

  try {
    return JSON.parse(responseText) as FlightCheckBatchResult;
  } catch {
    throw new Error(`Invalid response from flight status: ${responseText.substring(0, 200)}`);
  }
}

/**
 * Call the check-flight-status edge function for a single reservation.
 */
export async function checkFlightStatusForReservation(reservationId: string): Promise<FlightCheckResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await supabase.functions.invoke('check-flight-status', {
    body: {
      mode: 'reservation',
      reservation_id: reservationId,
    },
  });

  if (response.error) {
    throw new Error(response.error.message || 'Failed to check flight status');
  }

  return response.data as FlightCheckResult;
}

/**
 * Validate a flight number by calling the edge function.
 * Used when user enters a flight number in the add-reservation form.
 */
export async function validateFlightNumber(
  flightNumber: string,
  date?: string,
): Promise<FlightValidationResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await supabase.functions.invoke('check-flight-status', {
    body: {
      mode: 'validate',
      flight_iata: flightNumber,
      date: date || undefined,
    },
  });

  if (response.error) {
    throw new Error(response.error.message || 'Failed to validate flight');
  }

  return response.data as FlightValidationResult;
}

// ─── Inferred Phase Helper ───────────────────────────────────────────────────

/** Hard ceiling for any flight — no commercial flight exceeds 20 hours */
const MAX_FLIGHT_DURATION_MS = 20 * 60 * 60 * 1000;

/**
 * Infer the effective flight phase from timestamps when the API status
 * is unreliable (unknown, or contradicts actual departure/arrival data).
 *
 * Returns the inferred phase, or the original phase if no inference is possible.
 */
export function inferFlightPhase(status: FlightStatusData): FlightPhase {
  const apiPhase = status.flight_status;

  // If the API gives us a definitive terminal state, trust it
  if (apiPhase === 'landed' || apiPhase === 'cancelled' || apiPhase === 'incident' || apiPhase === 'diverted') {
    return apiPhase;
  }

  // If we have an actual arrival time, the flight has landed
  if (status.arr_actual) {
    return 'landed';
  }

  // If we have an actual departure time, the flight has at least departed
  if (status.dep_actual) {
    const depActualMs = new Date(status.dep_actual).getTime();
    const now = Date.now();
    const timeSinceDeparture = now - depActualMs;

    // Estimate flight duration from dep_actual → arr_estimated/arr_scheduled
    let estimatedDurationMs = MAX_FLIGHT_DURATION_MS;
    const arrTime = status.arr_estimated || status.arr_scheduled;
    if (arrTime) {
      const arrMs = new Date(arrTime).getTime();
      estimatedDurationMs = Math.max(arrMs - depActualMs, 60 * 60 * 1000); // at least 1 hour
    }

    // Add 1-hour buffer past estimated arrival before giving up
    const landingDeadline = estimatedDurationMs + 60 * 60 * 1000;

    if (timeSinceDeparture > landingDeadline) {
      // Way past when it should have landed — data gap, not still flying
      return 'unknown';
    }

    // Flight departed and within reasonable flight window → in flight
    return 'active';
  }

  // If API says active but no dep_actual, trust the API
  if (apiPhase === 'active') {
    return 'active';
  }

  // If API says scheduled and departure time hasn't passed, trust it
  if (apiPhase === 'scheduled') {
    return 'scheduled';
  }

  // No useful data to infer from
  return apiPhase;
}

// ─── Display Helpers ─────────────────────────────────────────────────────────

/**
 * Map flight phase to a human-readable label.
 * When status data is available, uses inferFlightPhase for accuracy.
 */
export function getFlightPhaseLabel(phase: FlightPhase, status?: FlightStatusData): string {
  const effectivePhase = status ? inferFlightPhase(status) : phase;
  const labels: Record<FlightPhase, string> = {
    scheduled: 'Scheduled',
    active: 'In Flight',
    landed: 'Landed',
    cancelled: 'Cancelled',
    incident: 'Incident',
    diverted: 'Diverted',
    unknown: 'Status Unknown',
  };
  return labels[effectivePhase] ?? 'Status Unknown';
}

/**
 * Map flight phase to color scheme.
 * When status data is available, uses inferFlightPhase for accuracy.
 */
export function getFlightPhaseColor(phase: FlightPhase, status?: FlightStatusData): {
  bg: string;
  text: string;
  dot: string;
  pulse: boolean;
} {
  const effectivePhase = status ? inferFlightPhase(status) : phase;
  switch (effectivePhase) {
    case 'scheduled':
      return { bg: '#10B98120', text: '#10B981', dot: '#10B981', pulse: false };
    case 'active':
      return { bg: '#3B82F620', text: '#3B82F6', dot: '#3B82F6', pulse: true };
    case 'landed':
      return { bg: '#10B98120', text: '#10B981', dot: '#10B981', pulse: false };
    case 'cancelled':
      return { bg: '#EF444420', text: '#EF4444', dot: '#EF4444', pulse: false };
    case 'incident':
      return { bg: '#EF444420', text: '#EF4444', dot: '#EF4444', pulse: true };
    case 'diverted':
      return { bg: '#F59E0B20', text: '#F59E0B', dot: '#F59E0B', pulse: true };
    default:
      return { bg: '#64748B20', text: '#64748B', dot: '#64748B', pulse: false };
  }
}

/** Get delay severity color */
export function getDelayColor(delayMinutes: number | null): string {
  if (!delayMinutes || delayMinutes <= 0) return '#10B981'; // green — on time
  if (delayMinutes <= 15) return '#F59E0B'; // amber — minor delay
  if (delayMinutes <= 60) return '#F97316'; // orange — moderate delay
  return '#EF4444'; // red — significant delay
}

/** Format delay for display */
export function formatDelay(delayMinutes: number | null): string | null {
  if (!delayMinutes || delayMinutes <= 0) return null;
  if (delayMinutes < 60) return `${delayMinutes}m late`;
  const hours = Math.floor(delayMinutes / 60);
  const mins = delayMinutes % 60;
  return mins > 0 ? `${hours}h ${mins}m late` : `${hours}h late`;
}

/** Get the flight progress as a 0-1 value for the status bar */
export function getFlightProgress(status: FlightStatusData): number {
  switch (status.flight_status) {
    case 'scheduled':
      // Calculate progress based on how close to departure
      if (status.dep_scheduled) {
        const depTime = new Date(status.dep_scheduled).getTime();
        const now = Date.now();
        const hoursUntil = (depTime - now) / (1000 * 60 * 60);
        if (hoursUntil > 24) return 0;
        if (hoursUntil > 4) return 0.05;
        if (hoursUntil > 1) return 0.1;
        if (hoursUntil > 0) return 0.15;
        return 0.2; // should be departed but status hasn't updated
      }
      return 0;
    case 'active':
      // Estimate progress based on departure and arrival times
      if (status.dep_actual && status.arr_estimated) {
        const depTime = new Date(status.dep_actual).getTime();
        const arrTime = new Date(status.arr_estimated).getTime();
        const now = Date.now();
        const totalDuration = arrTime - depTime;
        const elapsed = now - depTime;
        if (totalDuration <= 0) return 0.5;
        return Math.min(0.9, Math.max(0.3, 0.3 + (elapsed / totalDuration) * 0.6));
      }
      return 0.5;
    case 'landed':
      return 1;
    case 'cancelled':
    case 'incident':
    case 'diverted':
      return 0;
    default:
      return 0;
  }
}

/** Determine the active step in the flight journey */
export type FlightStep = 'scheduled' | 'boarding' | 'departed' | 'in_flight' | 'landed';

export function getActiveFlightStep(status: FlightStatusData): FlightStep {
  // Use inferred phase for accuracy when API status is unreliable
  const effectivePhase = inferFlightPhase(status);

  if (effectivePhase === 'landed') return 'landed';
  if (effectivePhase === 'active') return 'in_flight';

  // If we have dep_actual but inference says unknown (past landing deadline),
  // show departed as the last known step
  if (status.dep_actual) return 'departed';

  // Check if boarding based on time
  if (status.dep_scheduled) {
    const depTime = new Date(status.dep_estimated || status.dep_scheduled).getTime();
    const now = Date.now();
    const minsUntil = (depTime - now) / (1000 * 60);
    if (minsUntil <= 30 && minsUntil > 0) return 'boarding';
  }

  return 'scheduled';
}

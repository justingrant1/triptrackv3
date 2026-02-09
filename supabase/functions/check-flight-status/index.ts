/**
 * Supabase Edge Function: check-flight-status
 *
 * Modes:
 *   - "trip"        → check all flights for a specific trip (pull-to-refresh)
 *   - "reservation"  → check a single flight reservation
 *   - "validate"     → validate a flight number and return pre-populated data
 *   - "user"         → check all upcoming flights for a user (cron fan-out)
 *
 * All AirLabs API calls happen here — the client never calls AirLabs directly.
 * Change detection compares old vs new data and records transitions.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Config ──────────────────────────────────────────────────────────────────

const AIRLABS_API_KEY = Deno.env.get("AIRLABS_API_KEY") ?? "";
const AIRLABS_BASE = "https://airlabs.co/api/v9";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─── Types ───────────────────────────────────────────────────────────────────

interface FlightStatusData {
  flight_iata: string;
  airline_name: string | null;
  airline_iata: string | null;
  dep_iata: string | null;
  dep_airport: string | null;
  dep_terminal: string | null;
  dep_gate: string | null;
  dep_scheduled: string | null;
  dep_estimated: string | null;
  dep_actual: string | null;
  dep_delay: number | null;
  arr_iata: string | null;
  arr_airport: string | null;
  arr_terminal: string | null;
  arr_gate: string | null;
  arr_baggage: string | null;
  arr_scheduled: string | null;
  arr_estimated: string | null;
  arr_actual: string | null;
  arr_delay: number | null;
  flight_status: string;
  aircraft_icao: string | null;
  last_checked: string;
  provider: "airlabs";
}

interface FlightChange {
  type: string;
  field: string;
  old_value: string | number | null;
  new_value: string | number | null;
  severity: "info" | "warning" | "critical";
  message: string;
}

interface Reservation {
  id: string;
  trip_id: string;
  type: string;
  title: string;
  subtitle: string | null;
  start_time: string;
  end_time: string | null;
  location: string | null;
  address: string | null;
  confirmation_number: string | null;
  details: Record<string, any>;
  status: string;
  alert_message: string | null;
}

// ─── AirLabs Status Normalization ────────────────────────────────────────────

/**
 * Map raw AirLabs status strings to our FlightPhase enum.
 * AirLabs can return various status values that don't match our types.
 * Logs unmapped values so we can expand the mapping over time.
 */
function normalizeAirLabsStatus(rawStatus: string | null | undefined, flightIata: string): string {
  if (!rawStatus) return "unknown";

  const normalized = rawStatus.toLowerCase().trim();

  // Known AirLabs status → our FlightPhase mapping
  const statusMap: Record<string, string> = {
    // Direct matches
    "scheduled": "scheduled",
    "active": "active",
    "landed": "landed",
    "cancelled": "cancelled",
    "incident": "incident",
    "diverted": "diverted",
    // AirLabs variations
    "en-route": "active",
    "en_route": "active",
    "enroute": "active",
    "in-flight": "active",
    "in_flight": "active",
    "inflight": "active",
    "airborne": "active",
    "flying": "active",
    "started": "active",
    "departed": "active",
    "taxiing": "active",
    "boarding": "scheduled",  // still on ground
    "gate": "scheduled",
    "check-in": "scheduled",
    "delayed": "scheduled",   // delayed is still scheduled phase
    "arrived": "landed",
    "on-ground": "landed",
    "on_ground": "landed",
    "canceled": "cancelled",  // alternate spelling
    "redirected": "diverted",
    "unknown": "unknown",
  };

  const mapped = statusMap[normalized];
  if (mapped) return mapped;

  // Log unmapped values so we can expand the mapping
  console.warn(
    `[AirLabs] Unmapped flight status "${rawStatus}" for flight ${flightIata}. ` +
    `Defaulting to "unknown". Add this value to normalizeAirLabsStatus().`
  );

  return "unknown";
}

// ─── AirLabs API ─────────────────────────────────────────────────────────────

/**
 * Call AirLabs flight API for a given IATA flight number.
 * Returns null if the flight is not found or API errors.
 */
async function fetchFlightFromAirLabs(
  flightIata: string
): Promise<FlightStatusData | null> {
  if (!AIRLABS_API_KEY) {
    console.error("AIRLABS_API_KEY not configured");
    return null;
  }

  try {
    const url = `${AIRLABS_BASE}/flight?flight_iata=${encodeURIComponent(flightIata)}&api_key=${AIRLABS_API_KEY}`;
    console.log(`Fetching flight status for ${flightIata}`);

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`AirLabs API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();

    // AirLabs returns { response: { ... } } for a single flight
    const flight = data.response;
    if (!flight) {
      console.log(`No flight data found for ${flightIata}`);
      return null;
    }

    // Normalize AirLabs status to our FlightPhase enum
    const normalizedStatus = normalizeAirLabsStatus(flight.status, flightIata);

    return {
      flight_iata: flight.flight_iata ?? flightIata,
      airline_name: flight.airline_name ?? null,
      airline_iata: flight.airline_iata ?? null,
      dep_iata: flight.dep_iata ?? null,
      dep_airport: flight.dep_name ?? null,
      dep_terminal: flight.dep_terminal ?? null,
      dep_gate: flight.dep_gate ?? null,
      dep_scheduled: flight.dep_time ?? null,
      dep_estimated: flight.dep_estimated ?? null,
      dep_actual: flight.dep_actual ?? null,
      dep_delay: flight.delayed ?? null,
      arr_iata: flight.arr_iata ?? null,
      arr_airport: flight.arr_name ?? null,
      arr_terminal: flight.arr_terminal ?? null,
      arr_gate: flight.arr_gate ?? null,
      arr_baggage: flight.arr_baggage ?? null,
      arr_scheduled: flight.arr_time ?? null,
      arr_estimated: flight.arr_estimated ?? null,
      arr_actual: flight.arr_actual ?? null,
      arr_delay: flight.arr_delayed ?? null,
      flight_status: normalizedStatus,
      aircraft_icao: flight.aircraft_icao ?? null,
      last_checked: new Date().toISOString(),
      provider: "airlabs",
    };
  } catch (error) {
    console.error(`Error fetching flight ${flightIata}:`, error);
    return null;
  }
}

// ─── Change Detection ────────────────────────────────────────────────────────

/**
 * Compare old and new flight status data, return array of detected changes.
 * Only reports fields that actually changed.
 */
function detectChanges(
  oldStatus: FlightStatusData | null,
  newStatus: FlightStatusData
): FlightChange[] {
  const changes: FlightChange[] = [];

  if (!oldStatus) {
    // First time we have data — no changes to report
    return changes;
  }

  // Gate change
  if (oldStatus.dep_gate !== newStatus.dep_gate && newStatus.dep_gate) {
    changes.push({
      type: "gate_change",
      field: "dep_gate",
      old_value: oldStatus.dep_gate,
      new_value: newStatus.dep_gate,
      severity: "warning",
      message: oldStatus.dep_gate
        ? `Gate changed from ${oldStatus.dep_gate} to ${newStatus.dep_gate}`
        : `Gate assigned: ${newStatus.dep_gate}`,
    });
  }

  // Terminal change
  if (oldStatus.dep_terminal !== newStatus.dep_terminal && newStatus.dep_terminal) {
    changes.push({
      type: "terminal_change",
      field: "dep_terminal",
      old_value: oldStatus.dep_terminal,
      new_value: newStatus.dep_terminal,
      severity: "warning",
      message: oldStatus.dep_terminal
        ? `Terminal changed from ${oldStatus.dep_terminal} to ${newStatus.dep_terminal}`
        : `Terminal assigned: ${newStatus.dep_terminal}`,
    });
  }

  // Departure delay change
  if (oldStatus.dep_delay !== newStatus.dep_delay && newStatus.dep_delay !== null) {
    const oldDelay = oldStatus.dep_delay ?? 0;
    const newDelay = newStatus.dep_delay;

    if (newDelay > oldDelay && newDelay > 0) {
      const severity = newDelay >= 60 ? "critical" : newDelay >= 15 ? "warning" : "info";
      changes.push({
        type: "delay_change",
        field: "dep_delay",
        old_value: oldDelay,
        new_value: newDelay,
        severity,
        message:
          newDelay < 60
            ? `Flight delayed ${newDelay} minutes`
            : `Flight delayed ${Math.floor(newDelay / 60)}h ${newDelay % 60}m`,
      });
    } else if (newDelay < oldDelay && oldDelay > 0) {
      changes.push({
        type: "delay_change",
        field: "dep_delay",
        old_value: oldDelay,
        new_value: newDelay,
        severity: "info",
        message:
          newDelay <= 0
            ? "Flight back on schedule"
            : `Delay reduced to ${newDelay} minutes`,
      });
    }
  }

  // Status change
  if (oldStatus.flight_status !== newStatus.flight_status) {
    let severity: "info" | "warning" | "critical" = "info";
    let message = `Flight status: ${newStatus.flight_status}`;

    switch (newStatus.flight_status) {
      case "cancelled":
        severity = "critical";
        message = "Flight has been cancelled";
        changes.push({
          type: "cancellation",
          field: "flight_status",
          old_value: oldStatus.flight_status,
          new_value: newStatus.flight_status,
          severity,
          message,
        });
        return changes; // Cancellation is the most important — return early
      case "diverted":
        severity = "critical";
        message = "Flight has been diverted";
        changes.push({
          type: "diversion",
          field: "flight_status",
          old_value: oldStatus.flight_status,
          new_value: newStatus.flight_status,
          severity,
          message,
        });
        return changes;
      case "active":
        message = "Flight has departed";
        break;
      case "landed":
        message = "Flight has landed";
        break;
    }

    changes.push({
      type: "status_change",
      field: "flight_status",
      old_value: oldStatus.flight_status,
      new_value: newStatus.flight_status,
      severity,
      message,
    });
  }

  // Arrival gate (usually appears after landing)
  if (oldStatus.arr_gate !== newStatus.arr_gate && newStatus.arr_gate) {
    changes.push({
      type: "gate_change",
      field: "arr_gate",
      old_value: oldStatus.arr_gate,
      new_value: newStatus.arr_gate,
      severity: "info",
      message: `Arrival gate: ${newStatus.arr_gate}`,
    });
  }

  // Baggage carousel
  if (oldStatus.arr_baggage !== newStatus.arr_baggage && newStatus.arr_baggage) {
    changes.push({
      type: "baggage_update",
      field: "arr_baggage",
      old_value: oldStatus.arr_baggage,
      new_value: newStatus.arr_baggage,
      severity: "info",
      message: `Baggage at carousel ${newStatus.arr_baggage}`,
    });
  }

  // Departure time change (estimated vs scheduled)
  if (
    oldStatus.dep_estimated !== newStatus.dep_estimated &&
    newStatus.dep_estimated &&
    newStatus.dep_estimated !== newStatus.dep_scheduled
  ) {
    changes.push({
      type: "time_change",
      field: "dep_estimated",
      old_value: oldStatus.dep_estimated,
      new_value: newStatus.dep_estimated,
      severity: "warning",
      message: `New estimated departure: ${formatTimeShort(newStatus.dep_estimated)}`,
    });
  }

  // Arrival time change
  if (
    oldStatus.arr_estimated !== newStatus.arr_estimated &&
    newStatus.arr_estimated &&
    newStatus.arr_estimated !== newStatus.arr_scheduled
  ) {
    changes.push({
      type: "time_change",
      field: "arr_estimated",
      old_value: oldStatus.arr_estimated,
      new_value: newStatus.arr_estimated,
      severity: "info",
      message: `New estimated arrival: ${formatTimeShort(newStatus.arr_estimated)}`,
    });
  }

  return changes;
}

function formatTimeShort(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

// ─── Extract Flight Number from Reservation ──────────────────────────────────

function extractFlightIata(reservation: Reservation): string | null {
  // 1. Check details for explicit flight number
  const detailsFlightNum =
    reservation.details?.["Flight Number"] ??
    reservation.details?.["Flight"] ??
    reservation.details?.flight_iata ??
    null;

  if (detailsFlightNum) {
    const cleaned = cleanFlightNumber(String(detailsFlightNum));
    if (cleaned) return cleaned;
  }

  // 2. Try to extract from title (e.g. "AA 182" or "AA182 to JFK")
  const titleMatch = cleanFlightNumber(reservation.title);
  if (titleMatch) return titleMatch;

  // 3. Try subtitle
  if (reservation.subtitle) {
    const subMatch = cleanFlightNumber(reservation.subtitle);
    if (subMatch) return subMatch;
  }

  return null;
}

function cleanFlightNumber(input: string): string | null {
  if (!input) return null;
  const cleaned = input.trim().toUpperCase();

  // Match "AA182", "AA 182", "AA-182"
  const match = cleaned.match(/\b([A-Z]{2})\s*[-]?\s*(\d{1,4})\b/);
  if (match) return `${match[1]}${match[2]}`;

  return null;
}

// ─── Process a Single Reservation ────────────────────────────────────────────

async function processReservation(
  supabase: any,
  reservation: Reservation
): Promise<{
  reservation_id: string;
  flight_iata: string;
  status: FlightStatusData | null;
  changes: FlightChange[];
  error: string | null;
}> {
  const flightIata = extractFlightIata(reservation);

  if (!flightIata) {
    return {
      reservation_id: reservation.id,
      flight_iata: "",
      status: null,
      changes: [],
      error: "Could not extract flight number from reservation",
    };
  }

  // Fetch from AirLabs
  const newStatus = await fetchFlightFromAirLabs(flightIata);

  if (!newStatus) {
    return {
      reservation_id: reservation.id,
      flight_iata: flightIata,
      status: null,
      changes: [],
      error: "Flight not found or API unavailable",
    };
  }

  // Get previous status for change detection
  const oldStatus: FlightStatusData | null =
    reservation.details?._flight_status ?? null;

  // Detect changes
  const changes = detectChanges(oldStatus, newStatus);

  // Build updated details — preserve existing fields, add/update flight status
  const updatedDetails = {
    ...reservation.details,
    _flight_status: newStatus,
    _previous_flight_status: oldStatus,
    // Also update human-readable fields for display
    "Flight Number": newStatus.flight_iata,
    ...(newStatus.airline_name && { Airline: newStatus.airline_name }),
    ...(newStatus.dep_gate && { Gate: newStatus.dep_gate }),
    ...(newStatus.dep_terminal && { Terminal: newStatus.dep_terminal }),
    ...(newStatus.arr_baggage && { Baggage: `Carousel ${newStatus.arr_baggage}` }),
    ...(newStatus.dep_iata && { "Departure Airport": newStatus.dep_airport ? `${newStatus.dep_airport} (${newStatus.dep_iata})` : newStatus.dep_iata }),
    ...(newStatus.arr_iata && { "Arrival Airport": newStatus.arr_airport ? `${newStatus.arr_airport} (${newStatus.arr_iata})` : newStatus.arr_iata }),
    ...(newStatus.aircraft_icao && { Aircraft: newStatus.aircraft_icao }),
  };

  // Map AirLabs status to reservation status
  let reservationStatus = reservation.status;
  if (newStatus.flight_status === "cancelled") {
    reservationStatus = "cancelled";
  } else if (
    newStatus.flight_status === "active" ||
    newStatus.flight_status === "landed"
  ) {
    reservationStatus = "confirmed"; // keep as confirmed while active
  } else if (newStatus.dep_delay && newStatus.dep_delay >= 15) {
    reservationStatus = "delayed";
  }

  // Build alert message from most important change
  let alertMessage = reservation.alert_message;
  if (changes.length > 0) {
    // Pick the highest severity change
    const criticalChange = changes.find((c) => c.severity === "critical");
    const warningChange = changes.find((c) => c.severity === "warning");
    const topChange = criticalChange ?? warningChange ?? changes[0];
    alertMessage = topChange.message;
  }

  // Update the reservation in Supabase
  const { error: updateError } = await supabase
    .from("reservations")
    .update({
      details: updatedDetails,
      status: reservationStatus,
      alert_message: alertMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reservation.id);

  if (updateError) {
    console.error(`Failed to update reservation ${reservation.id}:`, updateError);
  }

  // Create notification entries for significant changes
  if (changes.length > 0) {
    await createNotificationsForChanges(
      supabase,
      reservation,
      changes,
      newStatus
    );
  }

  return {
    reservation_id: reservation.id,
    flight_iata: flightIata,
    status: newStatus,
    changes,
    error: updateError ? updateError.message : null,
  };
}

// ─── Create Notifications for Changes ────────────────────────────────────────

async function createNotificationsForChanges(
  supabase: any,
  reservation: Reservation,
  changes: FlightChange[],
  status: FlightStatusData
) {
  try {
    // Get the trip to find the user_id
    const { data: trip } = await supabase
      .from("trips")
      .select("user_id")
      .eq("id", reservation.trip_id)
      .single();

    if (!trip) return;

    // Fetch user's notification preferences
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("flight_updates, departure_reminders, trip_changes")
      .eq("user_id", trip.user_id)
      .single();

    // Default to true if no preferences row exists
    const flightUpdatesEnabled = prefs?.flight_updates ?? true;
    const tripChangesEnabled = prefs?.trip_changes ?? true;

    const notifications = changes
      .filter((c) => c.severity !== "info") // Only warning and critical
      .map((change) => {
        let type = "confirmation";
        if (change.type === "gate_change" || change.type === "terminal_change") {
          type = "gate_change";
        } else if (change.type === "delay_change" || change.type === "time_change") {
          type = "delay";
        } else if (change.type === "cancellation" || change.type === "diversion") {
          type = "delay"; // Use delay type for critical status changes
        }

        return {
          user_id: trip.user_id,
          type,
          title: `${status.flight_iata} — ${change.message}`,
          message: `${reservation.title}: ${change.message}`,
          trip_id: reservation.trip_id,
          read: false,
        };
      });

    if (notifications.length > 0) {
      // Always insert into notifications table (for the inbox)
      const { error } = await supabase
        .from("notifications")
        .insert(notifications);

      if (error) {
        console.error("Failed to create notifications:", error);
      }

      // Only send push notifications if user has flight_updates enabled
      if (!flightUpdatesEnabled) {
        console.log(`Push notifications disabled for user ${trip.user_id} — skipping push`);
        return;
      }

      // Get push token
      const { data: profile } = await supabase
        .from("profiles")
        .select("push_token")
        .eq("id", trip.user_id)
        .single();

      if (profile?.push_token) {
        // Batch push notifications via Expo Push API (supports array)
        const pushMessages = notifications.map((notif) => ({
          to: profile.push_token,
          title: notif.title,
          body: notif.message,
          data: {
            tripId: reservation.trip_id,
            reservationId: reservation.id,
            type: "flight_update",
          },
          sound: "default",
          priority: "high",
          // Critical changes (cancellation, diversion) bypass silent mode
          ...(changes.some((c) => c.severity === "critical") && {
            channelId: "critical",
          }),
        }));

        try {
          await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify(pushMessages),
          });
          console.log(`Sent ${pushMessages.length} push notification(s) to user ${trip.user_id}`);
        } catch (pushError) {
          console.error("Failed to send push notifications:", pushError);
        }
      }
    }
  } catch (error) {
    console.error("Error creating notifications:", error);
  }
}

// ─── Tiered Polling Check ────────────────────────────────────────────────────

/**
 * Determine if a reservation should be checked based on tiered polling.
 * Used by the cron fan-out to avoid unnecessary API calls.
 */
function shouldCheckNow(reservation: Reservation): boolean {
  const lastChecked = reservation.details?._flight_status?.last_checked;
  const flightStatus = reservation.details?._flight_status?.flight_status;

  // If flight has landed or been cancelled, don't check again
  // (unless we haven't checked for baggage yet after landing)
  if (flightStatus === "cancelled" || flightStatus === "incident") {
    return false;
  }

  if (flightStatus === "landed") {
    // Check once more for baggage info, then stop
    if (!lastChecked) return true;
    const timeSinceCheck = Date.now() - new Date(lastChecked).getTime();
    const hasBaggage = reservation.details?._flight_status?.arr_baggage;
    // If we already have baggage info or it's been more than 2 hours since landing, stop
    if (hasBaggage || timeSinceCheck > 2 * 60 * 60 * 1000) return false;
    return timeSinceCheck > 5 * 60 * 1000; // Check every 5 min for baggage
  }

  const departureTime = new Date(reservation.start_time);
  const now = new Date();
  const hoursUntilDeparture =
    (departureTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Determine required interval based on tiered strategy
  let requiredIntervalMs: number;

  if (flightStatus === "active" || hoursUntilDeparture < 0) {
    requiredIntervalMs = 5 * 60 * 1000; // 5 minutes
  } else if (hoursUntilDeparture <= 1) {
    requiredIntervalMs = 5 * 60 * 1000; // 5 minutes
  } else if (hoursUntilDeparture <= 4) {
    requiredIntervalMs = 15 * 60 * 1000; // 15 minutes
  } else if (hoursUntilDeparture <= 24) {
    requiredIntervalMs = 60 * 60 * 1000; // 1 hour
  } else {
    requiredIntervalMs = 6 * 60 * 60 * 1000; // 6 hours
  }

  // If never checked, check now
  if (!lastChecked) return true;

  const timeSinceLastCheck = Date.now() - new Date(lastChecked).getTime();
  return timeSinceLastCheck >= requiredIntervalMs;
}

// ─── Main Handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, apikey, x-client-info",
      },
    });
  }

  try {
    const body = await req.json();
    const { mode } = body;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Mode: validate ─────────────────────────────────────────────────
    if (mode === "validate") {
      const { flight_iata } = body;
      if (!flight_iata) {
        return jsonResponse({ valid: false, error: "No flight number provided" }, 400);
      }

      const cleaned = cleanFlightNumber(flight_iata);
      if (!cleaned) {
        return jsonResponse({
          valid: false,
          flight_iata: flight_iata,
          error: "Invalid flight number format. Use format like AA182 or AA 182.",
        }, 400);
      }

      const status = await fetchFlightFromAirLabs(cleaned);
      if (!status) {
        return jsonResponse({
          valid: false,
          flight_iata: cleaned,
          error: "Flight not found. Check the flight number and try again.",
        });
      }

      return jsonResponse({
        valid: true,
        flight_iata: status.flight_iata,
        airline_name: status.airline_name,
        dep_iata: status.dep_iata,
        dep_airport: status.dep_airport,
        dep_terminal: status.dep_terminal,
        dep_gate: status.dep_gate,
        dep_scheduled: status.dep_scheduled,
        arr_iata: status.arr_iata,
        arr_airport: status.arr_airport,
        arr_terminal: status.arr_terminal,
        arr_scheduled: status.arr_scheduled,
        flight_status: status.flight_status,
        error: null,
      });
    }

    // ── Mode: reservation ──────────────────────────────────────────────
    if (mode === "reservation") {
      const { reservation_id } = body;
      if (!reservation_id) {
        return jsonResponse({ error: "reservation_id required" }, 400);
      }

      const { data: reservation, error } = await supabase
        .from("reservations")
        .select("*")
        .eq("id", reservation_id)
        .single();

      if (error || !reservation) {
        return jsonResponse({ error: "Reservation not found" }, 404);
      }

      if (reservation.type !== "flight") {
        return jsonResponse({
          reservation_id,
          flight_iata: "",
          status: null,
          changes: [],
          error: "Not a flight reservation",
        });
      }

      const result = await processReservation(supabase, reservation);
      return jsonResponse(result);
    }

    // ── Mode: trip ─────────────────────────────────────────────────────
    if (mode === "trip") {
      const { trip_id } = body;
      if (!trip_id) {
        return jsonResponse({ error: "trip_id required" }, 400);
      }

      const { data: reservations, error } = await supabase
        .from("reservations")
        .select("*")
        .eq("trip_id", trip_id)
        .eq("type", "flight")
        .order("start_time", { ascending: true });

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      const results = [];
      let apiCalls = 0;

      for (const reservation of reservations ?? []) {
        const result = await processReservation(supabase, reservation);
        results.push(result);
        if (result.status) apiCalls++;
      }

      return jsonResponse({
        results,
        checked_at: new Date().toISOString(),
        total_api_calls: apiCalls,
      });
    }

    // ── Mode: user ─────────────────────────────────────────────────────
    // Used by the cron fan-out function
    if (mode === "user") {
      const { user_id } = body;
      if (!user_id) {
        return jsonResponse({ error: "user_id required" }, 400);
      }

      // Get all upcoming flight reservations for this user (next 48 hours)
      const now = new Date();
      const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      // Also include flights that departed up to 12 hours ago (might still be in air)
      const past12h = new Date(now.getTime() - 12 * 60 * 60 * 1000);

      const { data: reservations, error } = await supabase
        .from("reservations")
        .select("*, trips!inner(user_id)")
        .eq("trips.user_id", user_id)
        .eq("type", "flight")
        .gte("start_time", past12h.toISOString())
        .lte("start_time", in48h.toISOString())
        .order("start_time", { ascending: true });

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      const results = [];
      let apiCalls = 0;

      for (const reservation of reservations ?? []) {
        // Apply tiered polling — only check if enough time has passed
        if (!shouldCheckNow(reservation)) {
          console.log(
            `Skipping ${reservation.id} — not due for check yet`
          );
          continue;
        }

        const result = await processReservation(supabase, reservation);
        results.push(result);
        if (result.status) apiCalls++;
      }

      return jsonResponse({
        results,
        checked_at: new Date().toISOString(),
        total_api_calls: apiCalls,
      });
    }

    return jsonResponse({ error: `Unknown mode: ${mode}` }, 400);
  } catch (error: any) {
    console.error("Edge function error:", error);
    return jsonResponse({ error: error.message || "Internal server error" }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

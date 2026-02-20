export const config = {
  verify_jwt: false,
};

// Supabase Edge Function: Parse Travel Email
// Receives emails from SendGrid/Mailgun, extracts trip details with AI, creates trips/reservations


import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ParsedReservation {
  type: 'flight' | 'hotel' | 'car' | 'train' | 'meeting' | 'event';
  title: string;
  subtitle?: string;
  start_time: string;
  end_time?: string;
  location?: string;
  address?: string;
  confirmation_number?: string;
  status?: 'confirmed' | 'cancelled';
  details?: Record<string, any>;
}

interface ParsedTrip {
  trip_name: string;
  destination: string;
  country?: string;
  region?: string;
  start_date: string;
  end_date: string;
  reservations: ParsedReservation[];
}

/**
 * Convert a local time + UTC offset to a proper UTC ISO string.
 * 
 * The AI provides local times (e.g., "2026-02-17T11:00:00" for 11 AM Tokyo)
 * plus timezone offsets (e.g., "+09:00" for JST). We combine them to get
 * the real UTC instant and store that in the database.
 * 
 * This means ALL start_time/end_time values in the DB are in UTC,
 * making all date comparisons trivial (no timezone math needed on the client).
 * 
 * The original timezone offset is preserved in the reservation's `details`
 * field so the client can convert back to local time for display.
 * 
 * Examples:
 *   ("2026-02-17T11:00:00", "+09:00") → "2026-02-17T02:00:00Z"  (Tokyo 11 AM → UTC 2 AM)
 *   ("2026-02-17T14:00:00", "+08:00") → "2026-02-17T06:00:00Z"  (Bali 2 PM → UTC 6 AM)
 *   ("2026-02-17T08:00:00", "-05:00") → "2026-02-17T13:00:00Z"  (NYC 8 AM → UTC 1 PM)
 * 
 * If no timezone offset is available, stores the time as-is with Z appended
 * (assumes UTC — better than treating as device-local on the client).
 */
function convertToUTC(localTime: string | null | undefined, tzOffset: string | null | undefined): string | null {
  if (!localTime) return null;

  // Strip any existing offset/Z from the local time string first
  const stripped = localTime.replace(/[Zz]$/, '').replace(/[+-]\d{2}:?\d{2}$/, '');

  if (!tzOffset) {
    // No timezone info — append Z (treat as UTC, which is the safest default)
    return stripped + 'Z';
  }

  // Parse the offset: "+09:00" → +540 minutes, "-05:00" → -300 minutes
  const m = tzOffset.match(/^([+-])(\d{1,2}):?(\d{2})$/);
  if (!m) {
    // Invalid offset format — fall back to appending Z
    console.warn(`[UTC Convert] Invalid timezone offset "${tzOffset}" — treating as UTC`);
    return stripped + 'Z';
  }

  const sign = m[1] === '+' ? 1 : -1;
  const offsetMinutes = sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));

  // Parse the local time as if it were UTC (no offset applied yet)
  const localDate = new Date(stripped + 'Z');
  if (isNaN(localDate.getTime())) {
    console.warn(`[UTC Convert] Invalid date "${localTime}" — returning null`);
    return null;
  }

  // Subtract the offset to get real UTC
  // e.g., 11:00 local in +09:00 → 11:00 - 9h = 02:00 UTC
  const utcMs = localDate.getTime() - (offsetMinutes * 60 * 1000);
  return new Date(utcMs).toISOString();
}

/**
 * Validate and correct invalid dates that AI might hallucinate.
 * Handles cases like Feb 29 in non-leap years, Apr 31, etc.
 * 
 * Examples:
 *   "2026-02-29" → "2026-02-28" (2026 is not a leap year)
 *   "2026-04-31" → "2026-04-30" (April has 30 days)
 *   "2026-02-29T12:00:00" → "2026-02-28T12:00:00"
 */
function validateAndCorrectDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;

  try {
    // Parse the date string
    const parsed = new Date(dateStr);
    
    // Check if it's a valid date
    if (isNaN(parsed.getTime())) {
      console.warn(`[Date Validation] Invalid date: ${dateStr}`);
      return null;
    }

    // Extract components from the original string
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})(T.*)?$/);
    if (!match) {
      // Not in expected format, return as-is if valid
      return dateStr;
    }

    const [, yearStr, monthStr, dayStr, timePart] = match;
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    // Check if the parsed date matches the input components
    // If not, the date was invalid (e.g., Feb 29 in non-leap year)
    if (
      parsed.getFullYear() !== year ||
      parsed.getMonth() + 1 !== month ||
      parsed.getDate() !== day
    ) {
      // Date rolled over - clamp to last valid day of the month
      const lastDayOfMonth = new Date(year, month, 0).getDate();
      const correctedDay = Math.min(day, lastDayOfMonth);
      const corrected = `${yearStr}-${monthStr}-${correctedDay.toString().padStart(2, '0')}${timePart || ''}`;
      console.warn(`[Date Validation] Corrected invalid date: ${dateStr} → ${corrected}`);
      return corrected;
    }

    // Date is valid
    return dateStr;
  } catch (error) {
    console.error(`[Date Validation] Error validating date: ${dateStr}`, error);
    return null;
  }
}

/**
 * Validate and correct all dates in a parsed trip object.
 */
function validateParsedTripDates(parsed: ParsedTrip): ParsedTrip {
  // Validate trip dates
  const validatedStartDate = validateAndCorrectDate(parsed.start_date);
  const validatedEndDate = validateAndCorrectDate(parsed.end_date);

  if (!validatedStartDate || !validatedEndDate) {
    throw new Error('Invalid trip dates after validation');
  }

  // Validate reservation dates
  const validatedReservations = parsed.reservations.map((res) => ({
    ...res,
    start_time: validateAndCorrectDate(res.start_time) || res.start_time,
    end_time: res.end_time ? validateAndCorrectDate(res.end_time) || res.end_time : res.end_time,
  }));

  return {
    ...parsed,
    start_date: validatedStartDate,
    end_date: validatedEndDate,
    reservations: validatedReservations,
  };
}

async function parseEmailWithAI(emailText: string, existingTripsContext?: string): Promise<ParsedTrip> {
  const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  
  const prompt = `You are a travel email parser. Extract trip and reservation details from this confirmation email.

IMPORTANT CONTEXT:
- Today's date is ${todayDate}
- When inferring years from dates without explicit years (e.g., "Sun, Feb 15"), use the NEAREST FUTURE occurrence, not past dates
${existingTripsContext ? `\n${existingTripsContext}` : ''}

Return ONLY valid JSON in this exact format:
{
  "trip_name": "Brief trip name (e.g., 'New York Business Trip', 'Austin Vacation')",
  "destination": "City, State/Country",
  "country": "Full country name (e.g., 'Indonesia', 'United States', 'Japan')",
  "region": "State, province, island, or sub-region (e.g., 'Bali', 'California', 'Hokkaido'). Use null if not applicable.",
  "start_date": "YYYY-MM-DD (earliest date)",
  "end_date": "YYYY-MM-DD (latest date)",
  "reservations": [
    {
      "type": "flight" | "hotel" | "car" | "train" | "meeting" | "event",
      "title": "Main title (e.g., 'AA 182 to JFK', 'Marriott Downtown')",
      "subtitle": "Secondary info (e.g., 'American Airlines', 'Deluxe King Room')",
      "start_time": "YYYY-MM-DDTHH:MM:SS (ISO 8601, LOCAL time at the location — do NOT append Z or timezone offset)",
      "end_time": "YYYY-MM-DDTHH:MM:SS (optional, LOCAL time — do NOT append Z or timezone offset)",
      "location": "Airport code or city",
      "address": "Full address if available",
      "confirmation_number": "Confirmation/booking number",
      "status": "confirmed" or "cancelled" (use "cancelled" ONLY if the email is explicitly a cancellation notice),
      "details": {
        "Flight Number": "flight number like 'AA 1234' or 'UA 567' — REQUIRED for flights",
        "Airline": "full airline name like 'American Airlines' or 'United Airlines' — REQUIRED for flights",
        "Departure Airport": "departure airport name with code like 'Miami International Airport (MIA)' — REQUIRED for flights",
        "Arrival Airport": "arrival airport name with code like 'George Bush Intercontinental Airport (IAH)' — REQUIRED for flights",
        "Duration": "flight duration as 'Xh Ym' (e.g. '11h 55m') — REQUIRED for flights, calculate from departure/arrival times and timezone difference",
        "Departure Timezone": "UTC offset of departure location as '+HH:MM' or '-HH:MM' (e.g. '-08:00' for LAX, '+09:00' for NRT) — REQUIRED for flights",
        "Arrival Timezone": "UTC offset of arrival location as '+HH:MM' or '-HH:MM' (e.g. '+09:00' for NRT, '-05:00' for JFK) — REQUIRED for flights",
        "Location Timezone": "UTC offset of the reservation location as '+HH:MM' or '-HH:MM' (e.g. '+08:00' for Bali, '+09:00' for Tokyo) — REQUIRED for hotels, car rentals, and all non-flight reservations",
        "Seat": "seat number (flights)",
        "Gate": "gate number (flights)",
        "Terminal": "terminal (flights)",
        "Room": "room type (hotels)",
        "Phone": "hotel front desk phone number with country code (hotels)",
        "Vehicle": "car type (rentals)",
        "any_other_key": "any other relevant detail"
      }
    }
  ]
}

Rules:
- Extract ALL reservations from the email (flights, hotels, cars, etc.)
- Use ISO 8601 format for all timestamps (YYYY-MM-DDTHH:MM:SS)
- IMPORTANT: Always use LOCAL time at the departure/arrival/check-in location. Do NOT append Z or timezone offsets.
- ⚠️ TIME ACCURACY: Be very careful with 12:00. In 24-hour format: 12:00 = noon (12 PM), 00:00 = midnight (12 AM). If the email says "12:00" or "12 PM" or "noon", use T12:00:00 NOT T00:00:00. Only use T00:00:00 for actual midnight departures.
- ⚠️ MISSING TIMES: If the email does NOT include a specific departure/check-in time, use a reasonable default: T09:00:00 for morning activities (flights, trains, car pickups), T15:00:00 for hotel check-ins, T12:00:00 for events. Add "Time Estimated": true to the details object.
- ⚠️ TIMEZONE REQUIRED: You MUST always provide "Location Timezone" for non-flight reservations (hotels, trains, cars, events, meetings). Look up the UTC offset for the city. For example: Marrakech, Morocco = "+01:00", Tokyo = "+09:00", New York = "-05:00", London = "+00:00", Paris = "+01:00", Dubai = "+04:00", Bali = "+08:00".
- For flights: departure time = local time at departure airport, arrival time = local time at arrival airport
- For flights: extract airline, flight number, departure/arrival times, airports, seat, gate
- For hotels: extract hotel name, check-in/out times, room type, address
- For cars: extract company, pickup/return times, vehicle type, location
- For trains/buses: extract operator, departure/arrival times, stations, seat/class if available
- Infer trip name from destination and purpose if not explicit
- If multiple reservations, group them under one trip
- Return ONLY the JSON, no other text

Email:
${emailText}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || '';
  
  // Extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in AI response');
  }

  const parsed: ParsedTrip = JSON.parse(jsonMatch[0]);

  // Validate required fields
  if (!parsed.trip_name || !parsed.destination || !parsed.start_date || !parsed.end_date) {
    throw new Error('Missing required trip fields');
  }

  if (!parsed.reservations || parsed.reservations.length === 0) {
    throw new Error('No reservations found in email');
  }

  return parsed;
}

/**
 * Check if two destinations are in the same geographic region.
 * Uses heuristic string matching on destination, country, and region fields.
 */
function areDestinationsRelated(
  newDestination: string,
  newCountry: string | undefined,
  newRegion: string | undefined,
  existingDestination: string,
  existingName: string
): boolean {
  const normalize = (s: string) => s.toLowerCase().trim();
  const newDest = normalize(newDestination);
  const existDest = normalize(existingDestination);
  const existName = normalize(existingName);

  // Exact match
  if (newDest === existDest) return true;

  // One destination contains the other (e.g., "Denpasar" vs "Denpasar, Bali")
  if (newDest.includes(existDest) || existDest.includes(newDest)) return true;

  // Check if the trip name contains the new destination or vice versa
  if (existName.includes(newDest) || newDest.includes(existName.replace('trip to ', ''))) return true;

  // Extract words from both destinations for overlap checking
  const newWords = new Set(newDest.split(/[\s,]+/).filter(w => w.length > 2));
  const existWords = new Set(existDest.split(/[\s,]+/).filter(w => w.length > 2));

  // Check for shared significant words (e.g., "Denpasar, Bali" and "Ubud, Bali" both contain "Bali")
  for (const word of newWords) {
    if (existWords.has(word)) return true;
  }

  // Check if region matches any word in existing destination or trip name
  if (newRegion) {
    const region = normalize(newRegion);
    if (existDest.includes(region) || existName.includes(region)) return true;
    for (const word of existWords) {
      if (region.includes(word) || word.includes(region)) return true;
    }
  }

  // Check if country matches
  if (newCountry) {
    const country = normalize(newCountry);
    if (existDest.includes(country) || existName.includes(country)) return true;
  }

  return false;
}

/**
 * Check if a destination is unknown/generic (AI couldn't determine location).
 */
function isUnknownDestination(destination: string): boolean {
  const normalized = destination.toLowerCase().trim();
  const unknownPatterns = [
    'unknown',
    'not specified',
    'n/a',
    'tbd',
    'to be determined',
  ];
  return unknownPatterns.some(pattern => normalized.includes(pattern));
}

/**
 * Check if a trip was previously deleted by the user.
 * Uses fuzzy destination matching (same logic as trip merging) to catch variations.
 * Returns true if a matching deleted trip is found.
 */
async function wasTripDeleted(
  supabase: any,
  userId: string,
  destination: string,
  country: string | undefined,
  region: string | undefined,
  startDate: string,
  endDate: string
): Promise<boolean> {
  // Fetch all deleted trips for this user within a reasonable time window
  // (±7 days buffer to catch slight date variations in different emails)
  const bufferDays = 7;
  const bufferedStart = new Date(startDate);
  bufferedStart.setDate(bufferedStart.getDate() - bufferDays);
  const bufferedEnd = new Date(endDate);
  bufferedEnd.setDate(bufferedEnd.getDate() + bufferDays);
  const bufferedStartStr = bufferedStart.toISOString().split('T')[0];
  const bufferedEndStr = bufferedEnd.toISOString().split('T')[0];

  const { data: deletedTrips } = await supabase
    .from('deleted_trips')
    .select('destination, start_date, end_date, original_trip_name')
    .eq('user_id', userId)
    .gte('end_date', bufferedStartStr)
    .lte('start_date', bufferedEndStr);

  if (!deletedTrips || deletedTrips.length === 0) {
    return false;
  }

  // Check each deleted trip for geographic relatedness using the same fuzzy logic
  for (const deleted of deletedTrips) {
    if (areDestinationsRelated(destination, country, region, deleted.destination, deleted.original_trip_name || '')) {
      console.log(`[Deleted Trip Match] "${destination}" matches previously deleted trip: "${deleted.original_trip_name}" (${deleted.destination})`);
      return true;
    }
  }

  return false;
}

/**
 * Find an existing trip that matches the destination and overlapping dates,
 * or create a new one. Uses tiered matching:
 * 
 * Tier 1: Exact destination + overlapping dates
 * Tier 2: Fuzzy destination (same region/country) + overlapping/adjacent dates (±3 day buffer)
 * Tier 3: Unknown destination + overlapping dates → merge into the only matching trip
 * 
 * NEW: Checks deleted_trips table to prevent recreating trips the user has deleted.
 */
async function findOrCreateTripForEmail(
  supabase: any,
  userId: string,
  parsed: ParsedTrip
): Promise<string | null> {
  const { destination, country, region, start_date, end_date } = parsed;

  // === Tier 1: Exact destination match + overlapping dates ===
  const { data: exactMatches } = await supabase
    .from('trips')
    .select('id, start_date, end_date, name, destination')
    .eq('user_id', userId)
    .eq('destination', destination)
    .gte('end_date', start_date)
    .lte('start_date', end_date);

  if (exactMatches && exactMatches.length > 0) {
    const trip = exactMatches[0];
    console.log(`[Tier 1] Exact destination match — using trip: ${trip.id} (${trip.name})`);
    await expandTripDates(supabase, trip, start_date, end_date);
    return trip.id;
  }

  // === Tier 2: Fuzzy destination + overlapping/adjacent dates (±3 day buffer) ===
  const bufferDays = 3;
  const bufferedStart = new Date(start_date);
  bufferedStart.setDate(bufferedStart.getDate() - bufferDays);
  const bufferedEnd = new Date(end_date);
  bufferedEnd.setDate(bufferedEnd.getDate() + bufferDays);
  const bufferedStartStr = bufferedStart.toISOString().split('T')[0];
  const bufferedEndStr = bufferedEnd.toISOString().split('T')[0];

  const { data: nearbyTrips } = await supabase
    .from('trips')
    .select('id, start_date, end_date, name, destination')
    .eq('user_id', userId)
    .gte('end_date', bufferedStartStr)
    .lte('start_date', bufferedEndStr);

  if (nearbyTrips && nearbyTrips.length > 0) {
    for (const trip of nearbyTrips) {
      if (areDestinationsRelated(destination, country, region, trip.destination, trip.name)) {
        console.log(`[Tier 2] Fuzzy destination match — "${destination}" ≈ "${trip.destination}" (trip: ${trip.name}) — using trip: ${trip.id}`);
        await expandTripDates(supabase, trip, start_date, end_date);
        return trip.id;
      }
    }
  }

  // === Tier 3: Unknown destination + overlapping dates → merge into the only matching trip ===
  // If AI couldn't determine the destination (e.g., hotel email without clear location),
  // and there's exactly ONE trip in the date range, merge into it.
  // This handles cases like: flight to NYC on Feb 27 + hotel check-in on Feb 27 (unknown location)
  if (isUnknownDestination(destination) && nearbyTrips && nearbyTrips.length === 1) {
    const trip = nearbyTrips[0];
    console.log(`[Tier 3] Unknown destination + single matching trip by date — using trip: ${trip.id} (${trip.name})`);
    await expandTripDates(supabase, trip, start_date, end_date);
    return trip.id;
  }

  // === Email forwarding = intentional re-add ===
  // Unlike scan-gmail (automatic background scanning), parse-travel-email is triggered
  // when a user MANUALLY forwards an email to plans+x@triptrack.ai.
  // If they previously deleted a trip and are now re-forwarding the email,
  // they clearly want to re-add it. So we skip the deleted_trips check here.
  //
  // Additionally, remove the deleted_trips entry so future Gmail scans
  // won't block this trip either (the user has expressed intent to re-add it).
  const wasDeleted = await wasTripDeleted(
    supabase,
    userId,
    destination,
    country,
    region,
    start_date,
    end_date
  );

  if (wasDeleted) {
    console.log(`[Deleted Trip Override] User previously deleted a trip matching "${destination}" — but this is an intentional email forward, so allowing re-creation`);
    
    // Remove the deleted_trips entry so Gmail scan won't block it either
    // (Use same fuzzy matching window to find and remove the entry)
    const bufferDaysDeleted = 7;
    const bufferedStartDeleted = new Date(start_date);
    bufferedStartDeleted.setDate(bufferedStartDeleted.getDate() - bufferDaysDeleted);
    const bufferedEndDeleted = new Date(end_date);
    bufferedEndDeleted.setDate(bufferedEndDeleted.getDate() + bufferDaysDeleted);

    const { data: deletedEntries } = await supabase
      .from('deleted_trips')
      .select('id, destination, original_trip_name')
      .eq('user_id', userId)
      .gte('end_date', bufferedStartDeleted.toISOString().split('T')[0])
      .lte('start_date', bufferedEndDeleted.toISOString().split('T')[0]);

    if (deletedEntries) {
      for (const entry of deletedEntries) {
        if (areDestinationsRelated(destination, country, region, entry.destination, entry.original_trip_name || '')) {
          await supabase
            .from('deleted_trips')
            .delete()
            .eq('id', entry.id);
          console.log(`[Deleted Trip Override] Removed deleted_trips entry: "${entry.original_trip_name}" (${entry.destination})`);
        }
      }
    }
  }

  // === No match found — create new trip (with race-condition protection) ===
  // Multiple concurrent emails for the same destination can reach this point
  // simultaneously (e.g., flight + hotel forwarded at the same time).
  // We use a brief delay + re-check pattern to let the first one win.
  
  // Small random delay (100-500ms) to desynchronize concurrent requests
  const jitterMs = 100 + Math.random() * 400;
  await new Promise(resolve => setTimeout(resolve, jitterMs));
  
  // Re-check after delay — another request may have created the trip by now
  const { data: recheck } = await supabase
    .from('trips')
    .select('id, start_date, end_date, name, destination')
    .eq('user_id', userId)
    .gte('end_date', bufferedStartStr)
    .lte('start_date', bufferedEndStr);

  if (recheck && recheck.length > 0) {
    // Check for exact or fuzzy match among newly created trips
    for (const trip of recheck) {
      if (trip.destination === destination || areDestinationsRelated(destination, country, region, trip.destination, trip.name)) {
        console.log(`[Race Protection] Found trip created by concurrent request — using trip: ${trip.id} (${trip.name})`);
        await expandTripDates(supabase, trip, start_date, end_date);
        return trip.id;
      }
    }
  }

  // Still no match — safe to create
  const { data: newTrip, error: tripError } = await supabase
    .from('trips')
    .insert({
      user_id: userId,
      name: parsed.trip_name,
      destination,
      start_date,
      end_date,
      cover_image: null,
      status: 'upcoming',
    })
    .select()
    .single();

  if (tripError || !newTrip) {
    console.error('Error creating trip:', tripError);
    return null;
  }

  console.log(`Created new trip: ${newTrip.id} — ${destination}`);
  return newTrip.id;
}

/**
 * Expand trip dates if the new reservation extends beyond the existing range.
 */
async function expandTripDates(
  supabase: any,
  trip: { id: string; start_date: string; end_date: string },
  newStart: string,
  newEnd: string
): Promise<void> {
  const updates: Record<string, string> = {};
  if (newStart < trip.start_date) {
    updates.start_date = newStart;
  }
  if (newEnd > trip.end_date) {
    updates.end_date = newEnd;
  }
  if (Object.keys(updates).length > 0) {
    await supabase.from('trips').update(updates).eq('id', trip.id);
    console.log(`Expanded trip dates:`, updates);
  }
}

/**
 * Check if a reservation already exists (duplicate detection).
 * Uses multiple strategies to catch duplicates from different emails
 * about the same booking (confirmation, check-in, boarding pass, etc.).
 * 
 * Ported from scan-gmail to ensure both ingestion paths have the same dedup logic.
 */
async function isDuplicateReservation(
  supabase: any,
  tripId: string,
  reservation: ParsedReservation
): Promise<boolean> {
  // Check 1: Same type + same start_time in same trip (most precise)
  if (reservation.start_time) {
    const { data: byTypeAndTime } = await supabase
      .from('reservations')
      .select('id')
      .eq('trip_id', tripId)
      .eq('type', reservation.type)
      .eq('start_time', reservation.start_time)
      .maybeSingle();

    if (byTypeAndTime) {
      console.log(`[Dedup] Found duplicate by type+time: ${reservation.title}`);
      return true;
    }
  }

  // Check 2: FLIGHT-SPECIFIC — same flight number in same trip
  // This is the key dedup check: booking confirmation, check-in email,
  // and boarding pass all reference the same flight number (e.g., "AA 1531")
  // but may report slightly different times.
  if (reservation.type === 'flight') {
    const flightNumber = reservation.details?.['Flight Number'];
    if (flightNumber) {
      // Normalize flight number: strip spaces, uppercase (e.g., "AA 1531" → "AA1531")
      const normalizedFlightNum = flightNumber.toString().replace(/\s+/g, '').toUpperCase();

      // Get all flight reservations in this trip
      const { data: existingFlights } = await supabase
        .from('reservations')
        .select('id, details, start_time')
        .eq('trip_id', tripId)
        .eq('type', 'flight');

      if (existingFlights && existingFlights.length > 0) {
        for (const existing of existingFlights) {
          const existingFlightNum = existing.details?.['Flight Number'];
          if (existingFlightNum) {
            const normalizedExisting = existingFlightNum.toString().replace(/\s+/g, '').toUpperCase();
            if (normalizedFlightNum === normalizedExisting) {
              console.log(`[Dedup] Found duplicate flight by flight number: ${flightNumber} (existing: ${existing.id})`);
              return true;
            }
          }
        }
      }
    }

    // Check 2b: FLIGHT fuzzy match — same route on same day
    // Catches cases where flight number is missing or formatted differently
    // by comparing departure/arrival airports + same calendar day
    if (reservation.start_time && reservation.details) {
      const depAirport = reservation.details['Departure Airport'];
      const arrAirport = reservation.details['Arrival Airport'];

      if (depAirport && arrAirport) {
        const parsedDate = new Date(reservation.start_time);
        const dayStart = new Date(parsedDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(parsedDate);
        dayEnd.setHours(23, 59, 59, 999);

        const { data: sameDayFlights } = await supabase
          .from('reservations')
          .select('id, details, start_time')
          .eq('trip_id', tripId)
          .eq('type', 'flight')
          .gte('start_time', dayStart.toISOString())
          .lte('start_time', dayEnd.toISOString());

        if (sameDayFlights && sameDayFlights.length > 0) {
          const normalizedDep = depAirport.toString().toUpperCase().trim();
          const normalizedArr = arrAirport.toString().toUpperCase().trim();

          for (const existing of sameDayFlights) {
            const existingDep = existing.details?.['Departure Airport']?.toString().toUpperCase().trim();
            const existingArr = existing.details?.['Arrival Airport']?.toString().toUpperCase().trim();

            if (existingDep === normalizedDep && existingArr === normalizedArr) {
              console.log(`[Dedup] Found duplicate flight by route+date: ${depAirport}→${arrAirport} on ${parsedDate.toDateString()} (existing: ${existing.id})`);
              return true;
            }
          }
        }
      }
    }
  }

  // Check 3: Same confirmation number in THIS trip (for non-flight types)
  // For flights, we skip this since multiple legs share the same confirmation
  if (reservation.confirmation_number && reservation.type !== 'flight') {
    const { data: byConfirmation } = await supabase
      .from('reservations')
      .select('id')
      .eq('trip_id', tripId)
      .eq('confirmation_number', reservation.confirmation_number)
      .maybeSingle();

    if (byConfirmation) {
      console.log(`[Dedup] Found duplicate by confirmation number in trip: ${reservation.confirmation_number}`);
      return true;
    }
  }

  // Check 4: Same confirmation number across ALL user's trips (cross-trip dedup)
  // This catches duplicates when concurrent webhook deliveries create different trips
  // and both try to insert the same reservation. We check ALL trips for the user.
  if (reservation.confirmation_number && reservation.type !== 'flight') {
    const { data: crossTripMatch } = await supabase
      .from('reservations')
      .select('id, trip_id')
      .eq('confirmation_number', reservation.confirmation_number)
      .eq('type', reservation.type)
      .limit(1);

    if (crossTripMatch && crossTripMatch.length > 0) {
      console.log(`[Dedup] Found duplicate by confirmation number across trips: ${reservation.confirmation_number} (in trip ${crossTripMatch[0].trip_id})`);
      return true;
    }
  }

  return false;
}

/**
 * Generate a stable hash for email deduplication.
 * Uses sender + subject + first 500 chars of body to create a unique identifier.
 */
async function generateEmailHash(from: string, subject: string, body: string): Promise<string> {
  const content = `${from}|${subject}|${body.substring(0, 500)}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `email_${hashHex.substring(0, 32)}`;
}

/**
 * Atomically claim an email for processing (prevents race conditions).
 * Inserts a 'processing' record — if it already exists, returns 'already_claimed'.
 * 
 * Returns:
 *   'claimed'         — Successfully claimed, proceed with processing
 *   'already_claimed' — Another request already claimed this email
 *   'stale_reclaimed' — Was stuck in 'processing' for >2 min, reclaimed
 *   'reforward'       — Was processed >5 min ago, user is intentionally re-forwarding
 */
type ClaimResult = 'claimed' | 'already_claimed' | 'stale_reclaimed' | 'reforward';

async function claimEmailForProcessing(
  supabase: any,
  userId: string,
  emailHash: string
): Promise<ClaimResult> {
  try {
    // Try to insert a 'processing' record. If the unique constraint
    // (user_id, gmail_message_id) is violated, the email was already claimed.
    const { error } = await supabase
      .from('processed_gmail_messages')
      .insert({
        user_id: userId,
        gmail_message_id: emailHash,
        status: 'processing',
        processed_at: new Date().toISOString(),
      });

    if (error) {
      // Unique constraint violation = already exists
      if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
        // Check the existing record's status and age
        const { data: existing } = await supabase
          .from('processed_gmail_messages')
          .select('status, processed_at')
          .eq('user_id', userId)
          .eq('gmail_message_id', emailHash)
          .maybeSingle();

        if (existing) {
          const ageMs = Date.now() - new Date(existing.processed_at).getTime();
          const ageMinutes = ageMs / 60000;

          // Case 1: Stuck in 'processing' for >2 minutes (crashed/timed out)
          if (existing.status === 'processing' && ageMinutes > 2) {
            console.log(`[Claim] Stale 'processing' record (${ageMinutes.toFixed(1)} min old) — reclaiming`);
            await supabase
              .from('processed_gmail_messages')
              .update({ status: 'processing', processed_at: new Date().toISOString() })
              .eq('user_id', userId)
              .eq('gmail_message_id', emailHash);
            return 'stale_reclaimed';
          }

          // Case 2: Successfully processed >5 minutes ago (intentional re-forward)
          if (existing.status === 'processed' && ageMinutes > 5) {
            console.log(`[Claim] Previously processed ${ageMinutes.toFixed(1)} min ago — treating as intentional re-forward`);
            await supabase
              .from('processed_gmail_messages')
              .update({ status: 'processing', processed_at: new Date().toISOString() })
              .eq('user_id', userId)
              .eq('gmail_message_id', emailHash);
            return 'reforward';
          }

          // Case 3: Failed previously — allow retry
          if (existing.status === 'failed') {
            console.log(`[Claim] Previously failed — allowing retry`);
            await supabase
              .from('processed_gmail_messages')
              .update({ status: 'processing', processed_at: new Date().toISOString() })
              .eq('user_id', userId)
              .eq('gmail_message_id', emailHash);
            return 'stale_reclaimed';
          }

          // Case 4: Recently processed or currently processing — this is a webhook retry, skip it
          console.log(`[Claim] Email already ${existing.status} (${ageMinutes.toFixed(1)} min ago) — skipping webhook retry`);
          return 'already_claimed';
        }

        // Couldn't read existing record — skip to be safe
        return 'already_claimed';
      }

      // Some other DB error — log it but DON'T fail open anymore.
      // The PGRST204 "status column not found" error was causing all dedup to be bypassed.
      // Instead, we'll retry once, and if it still fails, skip processing.
      console.error(`[Claim] DB error claiming email:`, error);
      
      // If it's a schema cache error, try a direct approach without the status column
      if (error.code === 'PGRST204' || error.message?.includes('schema cache')) {
        console.warn(`[Claim] Schema cache error — table may need migration. Blocking duplicate processing.`);
        return 'already_claimed';
      }
      
      return 'already_claimed';
    }

    return 'claimed'; // Successfully claimed
  } catch (err) {
    console.error(`[Claim] Exception claiming email:`, err);
    // Don't fail open — block processing to prevent duplicates
    return 'already_claimed';
  }
}

/**
 * Mark an email as processed to prevent reprocessing.
 */
async function markEmailProcessed(
  supabase: any,
  userId: string,
  emailHash: string,
  status: string
): Promise<void> {
  try {
    await supabase
      .from('processed_gmail_messages')
      .upsert(
        {
          user_id: userId,
          gmail_message_id: emailHash,
          status,
          processed_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,gmail_message_id' }
      );
  } catch (error) {
    console.warn(`Failed to mark email as processed:`, error);
  }
}

serve(async (req) => {
  let emailHash: string | undefined;
  let userId: string | undefined;
  try {
    // CORS headers
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Parse incoming email from SendGrid/Mailgun
    const contentType = req.headers.get('content-type') || '';
    let emailData: any;

    if (contentType.includes('application/json')) {
      // SendGrid format
      emailData = await req.json();
    } else if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      // Mailgun format
      const formData = await req.formData();
      emailData = {
  from: formData.get('from'),
  to: formData.get('to'),
  recipient: formData.get('recipient'),   // ← ADD THIS
  subject: formData.get('subject'),
  text: formData.get('text') || formData.get('body-plain'),
  html: formData.get('html') || formData.get('body-html'),
};
    } else {
      throw new Error('Unsupported content type');
    }

    const recipientEmail = emailData.to || emailData.recipient || '';
    const emailText = emailData.text || emailData.html || '';
    const emailFrom = emailData.from || '';
    const emailSubject = emailData.subject || '';

    if (!recipientEmail || !emailText) {
      throw new Error('Missing recipient or email content');
    }

    console.log('Processing email to:', recipientEmail);

    // Extract forwarding token from recipient address
    // Format: plans+TOKEN@triptrack.ai or TOKEN@triptrack.ai
    let forwardingToken = '';
    
    // Try to extract from plus-addressing: plans+abc123@triptrack.ai
    const plusMatch = recipientEmail.match(/\+([^@]+)@/);
    if (plusMatch) {
      forwardingToken = plusMatch[1];
    } else {
      // Try to extract from subdomain or direct address: abc123@triptrack.ai
      const atMatch = recipientEmail.match(/^([^@]+)@/);
      if (atMatch && atMatch[1] !== 'plans') {
        forwardingToken = atMatch[1];
      }
    }

    if (!forwardingToken) {
      console.log('No forwarding token found in recipient:', recipientEmail);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid forwarding address',
          recipient: recipientEmail,
          message: 'Please use your unique forwarding address from the app'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('Forwarding token:', forwardingToken);

    // Initialize Supabase client with service role key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Look up user by forwarding token
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('forwarding_token', forwardingToken)
      .single();

    if (profileError || !profile) {
      console.log('Invalid forwarding token:', forwardingToken);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid forwarding token',
          message: 'This forwarding address is not recognized. Please check your unique address in the app.'
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    userId = profile.id;
    console.log('Processing for user:', userId);

    // 1b. Atomic email deduplication — claim the hash BEFORE processing.
    // This prevents race conditions where two webhook deliveries of the same
    // email both pass the "already processed?" check simultaneously.
    // We insert a 'processing' record first; if it already exists, we skip.
    emailHash = await generateEmailHash(emailFrom, emailSubject, emailText);
    const claimResult = await claimEmailForProcessing(supabase, userId!, emailHash);
    
    if (claimResult === 'already_claimed') {
      // This is a webhook retry or duplicate delivery — skip it
      console.log(`Email already claimed (hash: ${emailHash}) — skipping duplicate webhook delivery`);
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Email already being processed or recently processed',
          skipped: true,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Email hash: ${emailHash} — claim result: ${claimResult}`);

    // 1c. Fetch user's existing trips for AI context (helps with trip matching)
    const { data: existingTrips } = await supabase
      .from('trips')
      .select('name, destination, start_date, end_date')
      .eq('user_id', userId)
      .gte('end_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]) // Last 30 days or future
      .order('start_date', { ascending: true })
      .limit(10);

    let existingTripsContext = '';
    if (existingTrips && existingTrips.length > 0) {
      existingTripsContext = `- The user already has these trips:\n${existingTrips.map(t => 
        `  * "${t.name}" to ${t.destination} (${t.start_date} to ${t.end_date})`
      ).join('\n')}
- ⚠️ CRITICAL: The existing trips above are ONLY for reference — they tell you what trips already exist so you can use consistent spelling if the email genuinely refers to the same place.
- You MUST extract the destination from the EMAIL CONTENT ONLY. Look at the actual airports, cities, and addresses mentioned in the email.
- For flights: the destination is the ARRIVAL city of the LAST flight leg. If the email shows MIA→IAH (Miami to Houston), the destination is "Houston, TX" — NOT any existing trip's destination.
- NEVER copy or be influenced by an existing trip's destination unless the email genuinely refers to that exact same city.
- If the email mentions airports (e.g., MIA, IAH, LAX, JFK), use those airport codes to determine the actual cities. Do NOT confuse them with existing trip destinations.`;
    }

    // 2. Parse email with AI
    const parsedRaw = await parseEmailWithAI(emailText, existingTripsContext);
    
    // 2b. Validate and correct dates (handles AI hallucinations like Feb 29 in non-leap years)
    const parsed = validateParsedTripDates(parsedRaw);
    console.log('Parsed trip:', parsed.trip_name);

    // 3. Find existing trip or create new one (smart matching)
    const tripId = await findOrCreateTripForEmail(supabase, userId, parsed);

    if (!tripId) {
      // Trip creation failed (DB error) — return error
      console.log('[Trip Creation Failed] Could not create or find a matching trip');
      await markEmailProcessed(supabase, userId!, emailHash!, 'failed_trip_creation');
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Failed to create trip from email',
          error: 'trip_creation_failed',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('Using trip:', tripId);

    // 4. Create all reservations (handle cancellations by updating existing + dedup check)
    let reservationsCreated = 0;
    let cancellationsUpdated = 0;
    let duplicatesSkipped = 0;

    for (const res of parsed.reservations) {
      const reservationStatus = res.status === 'cancelled' ? 'cancelled' : 'confirmed';

      // If cancellation email, try to update existing reservation
      if (reservationStatus === 'cancelled' && res.confirmation_number) {
        const { data: existingRes } = await supabase
          .from('reservations')
          .select('id')
          .eq('trip_id', tripId)
          .eq('confirmation_number', res.confirmation_number)
          .maybeSingle();

        if (existingRes) {
          await supabase
            .from('reservations')
            .update({ status: 'cancelled' })
            .eq('id', existingRes.id);
          console.log(`Updated existing reservation to cancelled: ${res.title} (${existingRes.id})`);
          cancellationsUpdated++;
          continue;
        }
      }

      // Check for duplicates BEFORE inserting
      const isDuplicate = await isDuplicateReservation(supabase, tripId, res);
      if (isDuplicate) {
        console.log(`[Dedup] Skipping duplicate reservation: ${res.title}`);
        duplicatesSkipped++;
        continue;
      }

      // Determine the timezone offset for UTC conversion
      // Flights: use Departure Timezone for start_time, Arrival Timezone for end_time
      // Hotels/Cars/etc: use Location Timezone for both
      const details = res.details || {};
      let startTzOffset: string | undefined;
      let endTzOffset: string | undefined;

      if (res.type === 'flight') {
        startTzOffset = details['Departure Timezone'];
        endTzOffset = details['Arrival Timezone'];
      } else {
        startTzOffset = details['Location Timezone'];
        endTzOffset = details['Location Timezone'];
      }

      // Also store the original local times in details so the client can display them
      if (res.start_time) {
        details['Local Start Time'] = res.start_time;
      }
      if (res.end_time) {
        details['Local End Time'] = res.end_time;
      }

      // Convert local times → UTC for storage
      const utcStartTime = convertToUTC(res.start_time, startTzOffset);
      const utcEndTime = convertToUTC(res.end_time, endTzOffset);

      // Insert the reservation with UTC times
      const { error: insertError } = await supabase
        .from('reservations')
        .insert({
          trip_id: tripId,
          type: res.type,
          title: res.title,
          subtitle: res.subtitle || null,
          start_time: utcStartTime || res.start_time,
          end_time: utcEndTime || res.end_time || null,
          location: res.location || null,
          address: res.address || null,
          confirmation_number: res.confirmation_number || null,
          details,
          status: reservationStatus,
          alert_message: null,
        });

      if (insertError) {
        console.error(`Failed to insert reservation: ${res.title}`, insertError);
        throw new Error(`Failed to create reservation: ${insertError.message}`);
      }

      reservationsCreated++;
      console.log(`Created reservation: ${res.title}`);
    }

    const totalProcessed = reservationsCreated + cancellationsUpdated;

    console.log(`Processed ${totalProcessed} reservations (${reservationsCreated} created, ${cancellationsUpdated} cancellations updated, ${duplicatesSkipped} duplicates skipped)`);

    // 4b. If NO reservations were actually created/updated, delete the trip if it was just created
    //     This prevents empty ghost trips from accumulating when duplicate emails arrive
    if (totalProcessed === 0 && reservationsCreated === 0 && cancellationsUpdated === 0) {
      // Check if this trip has any reservations at all
      const { data: tripReservations } = await supabase
        .from('reservations')
        .select('id')
        .eq('trip_id', tripId)
        .limit(1);

      if (!tripReservations || tripReservations.length === 0) {
        // Empty trip — delete it
        await supabase
          .from('trips')
          .delete()
          .eq('id', tripId);
        console.log(`Deleted empty trip ${tripId} (all reservations were duplicates)`);
      }
    }

    // 4c. If cancellations were processed, check if ALL reservations in the trip are now cancelled.
    //     If so, mark the trip as 'completed' so it moves to Past Trips.
    if (cancellationsUpdated > 0) {
      const { data: allReservations } = await supabase
        .from('reservations')
        .select('id, status')
        .eq('trip_id', tripId);

      if (allReservations && allReservations.length > 0) {
        const allCancelled = allReservations.every((r: any) => r.status === 'cancelled');
        if (allCancelled) {
          await supabase
            .from('trips')
            .update({ status: 'completed', updated_at: new Date().toISOString() })
            .eq('id', tripId);
          console.log(`All reservations cancelled — marked trip ${tripId} as completed`);
        }
      }
    }

    // 5. Send push notification AND create in-app notification ONLY if something new was actually added
    if (totalProcessed > 0) {
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('push_token')
        .eq('id', userId)
        .single();

      // Send iOS push notification
      if (userProfile?.push_token) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: userProfile.push_token,
            title: '✈️ New Trip Added!',
            body: `${parsed.trip_name} has been added with ${totalProcessed} reservation(s).`,
            data: { tripId },
          }),
        });
        console.log('Push notification sent');
      }

      // Create in-app notification
      await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          type: 'confirmation',
          title: '✈️ New Trip Added!',
          message: `${parsed.trip_name} has been added with ${totalProcessed} reservation(s).`,
          trip_id: tripId,
          reservation_id: null,
          read: false,
        });
      console.log('In-app notification created');
    } else {
      console.log('No new reservations — skipping notifications');
    }

    // 5b. Mark email as processed to prevent reprocessing
    await markEmailProcessed(supabase, userId!, emailHash!, 'processed');

    // 6. Return success
    return new Response(
      JSON.stringify({
        success: true,
        trip_id: tripId,
        trip_name: parsed.trip_name,
        reservations_count: totalProcessed,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('Error processing email:', error);

    // Mark the email as 'failed' so it doesn't stay stuck in 'processing' forever.
    // This allows future retries (the claim logic treats 'failed' as retryable).
    try {
      if (emailHash && userId) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        await markEmailProcessed(supabase, userId!, emailHash!, 'failed');
        console.log(`Marked email ${emailHash} as 'failed'`);
      }
    } catch (markError) {
      console.warn('Failed to mark email as failed:', markError);
    }

    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});

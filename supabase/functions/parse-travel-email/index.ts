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

async function parseEmailWithAI(emailText: string): Promise<ParsedTrip> {
  const prompt = `You are a travel email parser. Extract trip and reservation details from this confirmation email.

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
        "Seat": "seat number (flights)",
        "Gate": "gate number (flights)",
        "Terminal": "terminal (flights)",
        "Room": "room type (hotels)",
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
- For flights: departure time = local time at departure airport, arrival time = local time at arrival airport
- For flights: extract airline, flight number, departure/arrival times, airports, seat, gate
- For hotels: extract hotel name, check-in/out times, room type, address
- For cars: extract company, pickup/return times, vehicle type, location
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
 * Find an existing trip that matches the destination and overlapping dates,
 * or create a new one. Uses tiered matching:
 * 
 * Tier 1: Exact destination + overlapping dates
 * Tier 2: Fuzzy destination (same region/country) + overlapping/adjacent dates (±3 day buffer)
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

  // === No match found — create new trip ===
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

serve(async (req) => {
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

    const userId = profile.id;
    console.log('Processing for user:', userId);

    // 2. Parse email with AI
    const parsed = await parseEmailWithAI(emailText);
    console.log('Parsed trip:', parsed.trip_name);

    // 3. Find existing trip or create new one (smart matching)
    const tripId = await findOrCreateTripForEmail(supabase, userId, parsed);

    if (!tripId) {
      throw new Error('Failed to find or create trip');
    }

    console.log('Using trip:', tripId);

    // 4. Create all reservations (handle cancellations by updating existing)
    const reservationsToInsert: any[] = [];
    let cancellationsUpdated = 0;

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

      reservationsToInsert.push({
        trip_id: tripId,
        type: res.type,
        title: res.title,
        subtitle: res.subtitle || null,
        start_time: res.start_time,
        end_time: res.end_time || null,
        location: res.location || null,
        address: res.address || null,
        confirmation_number: res.confirmation_number || null,
        details: res.details || {},
        status: reservationStatus,
        alert_message: null,
      });
    }

    if (reservationsToInsert.length > 0) {
      const { error: reservationsError } = await supabase
        .from('reservations')
        .insert(reservationsToInsert);

      if (reservationsError) {
        throw new Error(`Failed to create reservations: ${reservationsError.message}`);
      }
    }

    const totalProcessed = reservationsToInsert.length + cancellationsUpdated;

    console.log(`Processed ${totalProcessed} reservations (${reservationsToInsert.length} created, ${cancellationsUpdated} cancellations updated)`);

    // 4b. If cancellations were processed, check if ALL reservations in the trip are now cancelled.
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

    // 5. Send push notification (if user has push token)
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', userId)
      .single();

    if (userProfile?.push_token) {
      // Send Expo push notification
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
    }

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
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});

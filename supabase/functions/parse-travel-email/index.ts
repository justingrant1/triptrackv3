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
  details?: Record<string, any>;
}

interface ParsedTrip {
  trip_name: string;
  destination: string;
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
  "start_date": "YYYY-MM-DD (earliest date)",
  "end_date": "YYYY-MM-DD (latest date)",
  "reservations": [
    {
      "type": "flight" | "hotel" | "car" | "train" | "meeting" | "event",
      "title": "Main title (e.g., 'AA 182 to JFK', 'Marriott Downtown')",
      "subtitle": "Secondary info (e.g., 'American Airlines', 'Deluxe King Room')",
      "start_time": "YYYY-MM-DDTHH:MM:SS (ISO 8601)",
      "end_time": "YYYY-MM-DDTHH:MM:SS (optional, for hotels/events)",
      "location": "Airport code or city",
      "address": "Full address if available",
      "confirmation_number": "Confirmation/booking number",
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
- Use ISO 8601 format for all timestamps
- Include timezone if available, otherwise use UTC
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

    let senderEmail = emailData.from || emailData.sender || '';
    const emailText = emailData.text || emailData.html || '';

    if (!senderEmail || !emailText) {
      throw new Error('Missing sender or email content');
    }

    // Extract pure email if formatted like "Name <email@example.com>"
    const emailMatch = senderEmail.match(/<(.+?)>/);
    if (emailMatch) {
      senderEmail = emailMatch[1];
    }

    // Normalize sender email
    senderEmail = senderEmail.trim().toLowerCase();

    console.log('Processing email from:', senderEmail);

    // Initialize Supabase client with service role key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Look up the sender in trusted_emails to find which user account to use
    const { data: trustedEmail, error: trustedError } = await supabase
      .from('trusted_emails')
      .select('user_id, verified')
      .eq('email', senderEmail)
      .eq('verified', true)
      .single();

    if (trustedError || !trustedEmail) {
      console.log('Email from untrusted sender:', senderEmail);
      return new Response(
        JSON.stringify({ 
          error: 'Email from untrusted sender',
          sender: senderEmail,
          message: 'Please add this email to your trusted emails list in the app'
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userId = trustedEmail.user_id;
    console.log('Processing for user:', userId);

    // 2. Parse email with AI
    const parsed = await parseEmailWithAI(emailText);
    console.log('Parsed trip:', parsed.trip_name);

    // 3. Create trip
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .insert({
        user_id: userId,
        name: parsed.trip_name,
        destination: parsed.destination,
        start_date: parsed.start_date,
        end_date: parsed.end_date,
        cover_image: null,
        status: 'upcoming',
      })
      .select()
      .single();

    if (tripError || !trip) {
      throw new Error(`Failed to create trip: ${tripError?.message}`);
    }

    console.log('Created trip:', trip.id);

    // 4. Create all reservations
    const reservations = parsed.reservations.map(res => ({
      trip_id: trip.id,
      type: res.type,
      title: res.title,
      subtitle: res.subtitle || null,
      start_time: res.start_time,
      end_time: res.end_time || null,
      location: res.location || null,
      address: res.address || null,
      confirmation_number: res.confirmation_number || null,
      details: res.details || {},
      status: 'confirmed',
      alert_message: null,
    }));

    const { error: reservationsError } = await supabase
      .from('reservations')
      .insert(reservations);

    if (reservationsError) {
      throw new Error(`Failed to create reservations: ${reservationsError.message}`);
    }

    console.log(`Created ${reservations.length} reservations`);

    // 5. Send push notification (if user has push token)
    const { data: profile } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', userId)
      .single();

    if (profile?.push_token) {
      // Send Expo push notification
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: profile.push_token,
          title: '✈️ New Trip Added!',
          body: `${parsed.trip_name} has been added with ${reservations.length} reservation(s).`,
          data: { tripId: trip.id },
        }),
      });
    }

    // 6. Return success
    return new Response(
      JSON.stringify({
        success: true,
        trip_id: trip.id,
        trip_name: parsed.trip_name,
        reservations_count: reservations.length,
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

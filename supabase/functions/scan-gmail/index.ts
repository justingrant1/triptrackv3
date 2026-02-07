import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GmailMessage {
  id: string;
  threadId: string;
}

interface GmailMessageDetail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  body: string;
}

/**
 * Search Gmail for travel-related emails
 */
async function searchGmailForTravelEmails(
  accessToken: string,
  maxResults: number = 50
): Promise<GmailMessage[]> {
  // Search query for common travel email senders
  const query = [
    'from:(airlines.com OR booking.com OR expedia.com OR hotels.com OR airbnb.com OR uber.com OR lyft.com OR hertz.com OR enterprise.com OR amtrak.com OR delta.com OR united.com OR american.com OR southwest.com)',
    'OR subject:(confirmation OR booking OR reservation OR itinerary OR ticket OR boarding)',
  ].join(' ');

  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Gmail API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.messages || [];
}

/**
 * Get full email content by message ID
 */
async function getGmailMessage(
  accessToken: string,
  messageId: string
): Promise<GmailMessageDetail> {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Gmail API error: ${response.statusText}`);
  }

  const data = await response.json();

  // Extract headers
  const headers = data.payload.headers;
  const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
  const from = headers.find((h: any) => h.name === 'From')?.value || '';
  const date = headers.find((h: any) => h.name === 'Date')?.value || '';

  // Extract body (handle both plain text and HTML)
  let body = '';
  if (data.payload.body.data) {
    body = atob(data.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
  } else if (data.payload.parts) {
    // Multi-part message
    const textPart = data.payload.parts.find(
      (part: any) => part.mimeType === 'text/plain' || part.mimeType === 'text/html'
    );
    if (textPart?.body?.data) {
      body = atob(textPart.body.data.replace(/-/g, '+').replace(/_/g, '/'));
    }
  }

  return {
    id: data.id,
    threadId: data.threadId,
    subject,
    from,
    date,
    body,
  };
}

/**
 * Parse email with OpenAI GPT-4
 * Reuses the same parsing logic from parse-travel-email function
 */
async function parseEmailWithAI(emailContent: string, subject: string): Promise<any> {
  const openaiApiKey = Deno.env.get('EXPO_PUBLIC_VIBECODE_OPENAI_API_KEY');
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const prompt = `You are a travel email parser. Extract structured information from this travel confirmation email.

Email Subject: ${subject}

Email Content:
${emailContent}

Extract the following information and return as JSON:
{
  "type": "flight" | "hotel" | "car" | "train" | "meeting" | "event",
  "title": "Brief title (e.g., 'Flight to Paris', 'Hilton Downtown')",
  "subtitle": "Additional details (e.g., airline + flight number, hotel address)",
  "start_time": "ISO 8601 datetime",
  "end_time": "ISO 8601 datetime (optional)",
  "location": "City or venue name",
  "address": "Full address (optional)",
  "confirmation_number": "Booking/confirmation number",
  "details": {
    // Type-specific details (e.g., gate, seat, room number, etc.)
  },
  "destination": "Destination city for trip grouping",
  "trip_dates": {
    "start": "ISO 8601 date",
    "end": "ISO 8601 date"
  }
}

If this is not a travel-related email, return: { "error": "Not a travel email" }`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that extracts structured data from travel emails. Always respond with valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  return JSON.parse(content);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get request body
    const { accountId } = await req.json();

    if (!accountId) {
      throw new Error('Missing accountId parameter');
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Get connected account
    const { data: account, error: accountError } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (accountError || !account) {
      throw new Error('Connected account not found');
    }

    // Search Gmail for travel emails
    console.log('Searching Gmail for travel emails...');
    const messages = await searchGmailForTravelEmails(account.access_token, 20);
    console.log(`Found ${messages.length} potential travel emails`);

    let processedCount = 0;
    let createdTrips = 0;
    let createdReservations = 0;

    // Process each message
    for (const message of messages) {
      try {
        // Check if message already processed (duplicate detection)
        const { data: existingMessage } = await supabase
          .from('processed_gmail_messages')
          .select('id')
          .eq('user_id', user.id)
          .eq('gmail_message_id', message.id)
          .single();

        if (existingMessage) {
          console.log(`Skipping already processed message: ${message.id}`);
          continue;
        }

        // Get full message content
        const emailDetail = await getGmailMessage(account.access_token, message.id);
        console.log(`Processing email: ${emailDetail.subject}`);

        // Parse with AI
        const parsed = await parseEmailWithAI(emailDetail.body, emailDetail.subject);

        // Skip if not a travel email
        if (parsed.error) {
          console.log(`Skipping: ${parsed.error}`);
          continue;
        }

        // Find or create trip
        let tripId: string;
        const { data: existingTrips } = await supabase
          .from('trips')
          .select('id')
          .eq('user_id', user.id)
          .eq('destination', parsed.destination)
          .gte('end_date', parsed.trip_dates.start)
          .lte('start_date', parsed.trip_dates.end);

        if (existingTrips && existingTrips.length > 0) {
          // Use existing trip
          tripId = existingTrips[0].id;
          console.log(`Using existing trip: ${tripId}`);
        } else {
          // Create new trip
          const { data: newTrip, error: tripError } = await supabase
            .from('trips')
            .insert({
              user_id: user.id,
              name: `Trip to ${parsed.destination}`,
              destination: parsed.destination,
              start_date: parsed.trip_dates.start,
              end_date: parsed.trip_dates.end,
              status: 'upcoming',
            })
            .select()
            .single();

          if (tripError) {
            console.error('Error creating trip:', tripError);
            continue;
          }

          tripId = newTrip.id;
          createdTrips++;
          console.log(`Created new trip: ${tripId}`);
        }

        // Create reservation
        const { error: reservationError } = await supabase
          .from('reservations')
          .insert({
            trip_id: tripId,
            type: parsed.type,
            title: parsed.title,
            subtitle: parsed.subtitle,
            start_time: parsed.start_time,
            end_time: parsed.end_time,
            location: parsed.location,
            address: parsed.address,
            confirmation_number: parsed.confirmation_number,
            details: parsed.details || {},
            status: 'confirmed',
          });

        if (reservationError) {
          console.error('Error creating reservation:', reservationError);
          continue;
        }

        createdReservations++;
        processedCount++;
        console.log(`Created reservation for ${parsed.title}`);
      } catch (error) {
        console.error(`Error processing message ${message.id}:`, error);
        // Continue with next message
      }
    }

    // Return summary
    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          messagesScanned: messages.length,
          emailsProcessed: processedCount,
          tripsCreated: createdTrips,
          reservationsCreated: createdReservations,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in scan-gmail function:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

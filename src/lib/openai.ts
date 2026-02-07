/**
 * OpenAI API Service
 * Handles all interactions with OpenAI's API including chat completions and vision
 */

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_VIBECODE_OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Send a chat completion request to OpenAI
 */
export async function createChatCompletion(
  options: ChatCompletionOptions
): Promise<ChatCompletionResponse> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini', // Fast and cost-effective
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 500,
      stream: options.stream ?? false,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Create a streaming chat completion
 * For React Native, we use non-streaming and simulate streaming by yielding the full response
 */
export async function* createStreamingChatCompletion(
  options: ChatCompletionOptions
): AsyncGenerator<string, void, unknown> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  // React Native doesn't support ReadableStream, so we use non-streaming
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 500,
      stream: false, // Changed to false for React Native compatibility
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data: ChatCompletionResponse = await response.json();
  const content = data.choices[0]?.message?.content || '';
  
  // Simulate streaming by yielding words with small delays
  const words = content.split(' ');
  for (let i = 0; i < words.length; i++) {
    yield words[i] + (i < words.length - 1 ? ' ' : '');
    // Small delay to simulate streaming (optional)
    await new Promise(resolve => setTimeout(resolve, 30));
  }
}

/**
 * Extract text from an image using GPT-4 Vision
 */
export async function extractTextFromImage(
  imageUrl: string,
  prompt: string = 'Extract all text from this image, including merchant name, amount, date, and any other relevant details.'
): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o', // Vision model
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data: ChatCompletionResponse = await response.json();
  return data.choices[0]?.message?.content || '';
}

/**
 * Extract receipt data from an image
 * Returns structured data for merchant, amount, date, etc.
 */
export interface ReceiptData {
  merchant: string;
  amount: number;
  date: string;
  category?: 'transport' | 'lodging' | 'meals' | 'other';
  currency?: string;
}

export async function extractReceiptData(imageUrl: string): Promise<ReceiptData> {
  const prompt = `Extract the following information from this receipt image and return it as JSON:
{
  "merchant": "merchant name",
  "amount": numeric amount (just the number, no currency symbol),
  "date": "YYYY-MM-DD format",
  "category": "transport" | "lodging" | "meals" | "other" (best guess),
  "currency": "USD" | "EUR" | etc (if visible, otherwise USD)
}

Only return the JSON, no other text.`;

  const response = await extractTextFromImage(imageUrl, prompt);
  
  try {
    // Try to parse JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      return {
        merchant: data.merchant || 'Unknown Merchant',
        amount: parseFloat(data.amount) || 0,
        date: data.date || new Date().toISOString().split('T')[0],
        category: data.category || 'other',
        currency: data.currency || 'USD',
      };
    }
  } catch (e) {
    console.error('Failed to parse receipt data:', e);
  }

  // Fallback if parsing fails
  return {
    merchant: 'Unknown Merchant',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    category: 'other',
    currency: 'USD',
  };
}

/**
 * Parse travel confirmation email into structured trip/reservation data
 */
export interface ParsedReservation {
  type: 'flight' | 'hotel' | 'car' | 'train' | 'meeting' | 'event';
  title: string;
  subtitle?: string;
  start_time: string; // ISO 8601
  end_time?: string; // ISO 8601
  location?: string;
  address?: string;
  confirmation_number?: string;
  details?: Record<string, any>;
}

export interface ParsedTrip {
  trip_name: string;
  destination: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  reservations: ParsedReservation[];
}

export async function parseEmailToReservation(emailText: string): Promise<ParsedTrip> {
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

  try {
    const response = await createChatCompletion({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3, // Lower temperature for more consistent parsing
      maxTokens: 1500,
    });

    const content = response.choices[0]?.message?.content || '';
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed: ParsedTrip = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!parsed.trip_name || !parsed.destination || !parsed.start_date || !parsed.end_date) {
      throw new Error('Missing required trip fields');
    }

    if (!parsed.reservations || parsed.reservations.length === 0) {
      throw new Error('No reservations found in email');
    }

    // Validate each reservation
    parsed.reservations = parsed.reservations.filter(res => {
      return res.type && res.title && res.start_time;
    });

    if (parsed.reservations.length === 0) {
      throw new Error('No valid reservations after validation');
    }

    return parsed;
  } catch (error: any) {
    console.error('Email parsing error:', error);
    throw new Error(`Failed to parse email: ${error.message}`);
  }
}

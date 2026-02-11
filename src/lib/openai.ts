/**
 * OpenAI API Service — Server-Side Proxy
 * 
 * All OpenAI calls are proxied through Supabase Edge Functions so the API key
 * never leaves the server. The client sends authenticated requests to our edge
 * functions, which forward them to OpenAI with the server-side key.
 * 
 * Edge functions used:
 * - ai-chat: Chat completions (used by Concierge)
 * - ai-receipt-scan: Receipt OCR via GPT-4 Vision
 * - parse-travel-email: Email parsing (already server-side)
 */

import { supabase } from './supabase';

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
 * Get the current session token for authenticated edge function calls
 */
async function getAuthToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated — please sign in');
  }
  return session.access_token;
}

/**
 * Get the Supabase anon key for API gateway authentication
 */
function getAnonKey(): string {
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY not configured');
  return key;
}

/**
 * Get the Supabase Functions URL
 */
function getFunctionsUrl(): string {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('EXPO_PUBLIC_SUPABASE_URL not configured');
  return url.replace('.supabase.co', '.supabase.co/functions/v1');
}

/**
 * Send a chat completion request via the ai-chat edge function
 */
export async function createChatCompletion(
  options: ChatCompletionOptions
): Promise<ChatCompletionResponse> {
  const token = await getAuthToken();
  const functionsUrl = getFunctionsUrl();

  const response = await fetch(`${functionsUrl}/ai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': getAnonKey(),
    },
    body: JSON.stringify({
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? 500,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    
    // Handle rate limit specifically
    if (response.status === 429) {
      throw new Error(error.error || 'Daily AI message limit reached. Upgrade to Pro for unlimited messages.');
    }
    
    throw new Error(error.error || `AI service error: ${response.status}`);
  }

  return response.json();
}

/**
 * Create a "streaming" chat completion
 * Since we proxy through an edge function (non-streaming), we simulate streaming
 * by yielding words from the full response with small delays.
 */
export async function* createStreamingChatCompletion(
  options: ChatCompletionOptions
): AsyncGenerator<string, void, unknown> {
  const data = await createChatCompletion(options);
  const content = data.choices[0]?.message?.content || '';
  
  // Simulate streaming by yielding words with small delays
  const words = content.split(' ');
  for (let i = 0; i < words.length; i++) {
    yield words[i] + (i < words.length - 1 ? ' ' : '');
    await new Promise(resolve => setTimeout(resolve, 30));
  }
}

/**
 * Extract text from an image using GPT-4 Vision via edge function
 * Supports both URLs and base64 data URIs
 */
export async function extractTextFromImage(
  imageUrl: string,
  _prompt?: string
): Promise<string> {
  // This is now handled by the ai-receipt-scan edge function
  // For backward compatibility, we call extractReceiptData and return raw text
  const data = await extractReceiptData(imageUrl);
  return JSON.stringify(data);
}

/**
 * Extract receipt data from an image via the ai-receipt-scan edge function
 */
export interface ReceiptData {
  merchant: string;
  amount: number;
  date: string;
  category?: 'transport' | 'lodging' | 'meals' | 'other';
  currency?: string;
}

export async function extractReceiptData(imageUrlOrBase64: string): Promise<ReceiptData> {
  const token = await getAuthToken();
  const functionsUrl = getFunctionsUrl();

  const response = await fetch(`${functionsUrl}/ai-receipt-scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': getAnonKey(),
    },
    body: JSON.stringify({ imageUrl: imageUrlOrBase64 }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    
    if (response.status === 403 && error.upgrade) {
      throw new Error('Receipt scanning requires a Pro subscription');
    }
    
    throw new Error(error.error || `Receipt scan error: ${response.status}`);
  }

  return response.json();
}

/**
 * Parse travel confirmation email into structured trip/reservation data
 * NOTE: This already uses the parse-travel-email edge function (called from parse-email.tsx).
 * Keeping this client-side version for backward compatibility with any direct callers.
 */
export interface ParsedReservation {
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

export interface ParsedTrip {
  trip_name: string;
  destination: string;
  start_date: string;
  end_date: string;
  reservations: ParsedReservation[];
}

export async function parseEmailToReservation(emailText: string): Promise<ParsedTrip> {
  // Use the ai-chat edge function for email parsing too
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
      "details": {}
    }
  ]
}

Email:
${emailText}`;

  try {
    const response = await createChatCompletion({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      maxTokens: 1500,
    });

    const content = response.choices[0]?.message?.content || '';
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed: ParsedTrip = JSON.parse(jsonMatch[0]);

    if (!parsed.trip_name || !parsed.destination || !parsed.start_date || !parsed.end_date) {
      throw new Error('Missing required trip fields');
    }

    if (!parsed.reservations || parsed.reservations.length === 0) {
      throw new Error('No reservations found in email');
    }

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

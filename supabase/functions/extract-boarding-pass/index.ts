// Supabase Edge Function: Extract Boarding Pass QR Code
// Uses GPT-4o Vision to find and decode QR codes from boarding pass screenshots.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured on server');
    }

    // Authenticate
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create client with user's auth context (recommended Supabase pattern)
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('Auth error:', authError?.message);
      return new Response(JSON.stringify({ error: authError?.message || 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { imageUrl } = await req.json();

    if (!imageUrl) {
      return new Response(JSON.stringify({ error: 'imageUrl is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GPT-4o Vision prompt — specialized for boarding pass QR extraction
    const prompt = `You are analyzing a screenshot of a boarding pass. Your job is to find and decode the QR code, barcode, or Aztec code in the image.

IMPORTANT INSTRUCTIONS:
1. Find the QR code, barcode (PDF417), or Aztec code in the image
2. Try to decode/read the raw data encoded in it. For boarding passes, this is typically an IATA BCBP (Bar Coded Boarding Pass) string starting with "M1" followed by passenger name and flight details.
3. Determine the bounding box of the code as percentages of the image dimensions (0-100)
4. Extract any visible passenger name and flight information from the boarding pass text (NOT from the QR code)

Return ONLY valid JSON in this exact format:
{
  "qrData": "the raw encoded data string if you can decode it, or null if you cannot",
  "qrType": "qr" or "barcode" or "aztec" or "unknown",
  "boundingBox": {
    "x": number (left edge as percentage 0-100),
    "y": number (top edge as percentage 0-100),
    "width": number (width as percentage 0-100),
    "height": number (height as percentage 0-100)
  },
  "passengerName": "LASTNAME/FIRSTNAME or null if not visible",
  "flightInfo": "AA 1234 JFK-LAX or similar summary, or null",
  "confidence": "high" or "medium" or "low" (how confident you are in the QR data decode)
}

If you cannot find any QR code, barcode, or scannable code in the image, return:
{
  "qrData": null,
  "qrType": "none",
  "boundingBox": null,
  "passengerName": null,
  "flightInfo": null,
  "confidence": "none"
}`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
            ],
          },
        ],
        max_tokens: 1000,
        temperature: 0.1, // Low temperature for accuracy
      }),
    });

    if (!openaiResponse.ok) {
      const err = await openaiResponse.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(err.error?.message || `OpenAI API error: ${openaiResponse.status}`);
    }

    const data = await openaiResponse.json();
    const content = data.choices[0]?.message?.content || '';

    // Parse the JSON response
    let result = {
      qrData: null as string | null,
      qrType: 'unknown' as string,
      boundingBox: null as { x: number; y: number; width: number; height: number } | null,
      passengerName: null as string | null,
      flightInfo: null as string | null,
      confidence: 'none' as string,
    };

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        result = {
          qrData: parsed.qrData || null,
          qrType: parsed.qrType || 'unknown',
          boundingBox: parsed.boundingBox || null,
          passengerName: parsed.passengerName || null,
          flightInfo: parsed.flightInfo || null,
          confidence: parsed.confidence || 'none',
        };
      }
    } catch (e) {
      console.error('Failed to parse boarding pass JSON:', e, 'Raw content:', content);
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Boarding pass extraction error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Supabase Edge Function: AI Chat
// Proxies chat requests to OpenAI so the API key stays server-side.
// Also enforces server-side rate limiting for free-tier users.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const FREE_DAILY_LIMIT = 3;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured on server');
    }

    // Authenticate the user from the JWT in the Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract the token and verify it directly
    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError?.message);
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Service-role client for DB operations (bypasses RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Check user's plan
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();

    const plan = profile?.plan || 'free';

    // Server-side rate limiting for free users
    if (plan === 'free') {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // Check today's usage from ai_usage table
      const { data: usage } = await supabase
        .from('ai_usage')
        .select('message_count')
        .eq('user_id', user.id)
        .eq('date', today)
        .single();

      const currentCount = usage?.message_count || 0;

      if (currentCount >= FREE_DAILY_LIMIT) {
        return new Response(JSON.stringify({
          error: 'Daily AI message limit reached',
          limit: FREE_DAILY_LIMIT,
          used: currentCount,
          upgrade: true,
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Increment usage count (upsert)
      await supabase
        .from('ai_usage')
        .upsert({
          user_id: user.id,
          date: today,
          message_count: currentCount + 1,
        }, { onConflict: 'user_id,date' });
    }

    // Parse request body
    const { messages, temperature = 0.7, maxTokens = 500 } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call OpenAI
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
    });

    if (!openaiResponse.ok) {
      const err = await openaiResponse.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(err.error?.message || `OpenAI API error: ${openaiResponse.status}`);
    }

    const data = await openaiResponse.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('AI chat error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

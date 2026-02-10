// Supabase Edge Function: Delete Account
// Securely deletes a user account and all associated data using the service role key.
// The client cannot use admin.deleteUser() — only the server can.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    // Authenticate the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Verify the JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;
    console.log(`[delete-account] Deleting user ${userId}`);

    // Delete all user data in order (respecting foreign key constraints)
    // 1. Delete receipts (references trips)
    const { error: receiptsErr } = await supabase
      .from('receipts')
      .delete()
      .eq('user_id', userId);
    if (receiptsErr) console.warn('Failed to delete receipts:', receiptsErr.message);

    // 2. Delete reservations (references trips)
    // First get all trip IDs for this user
    const { data: userTrips } = await supabase
      .from('trips')
      .select('id')
      .eq('user_id', userId);

    if (userTrips && userTrips.length > 0) {
      const tripIds = userTrips.map(t => t.id);
      const { error: reservationsErr } = await supabase
        .from('reservations')
        .delete()
        .in('trip_id', tripIds);
      if (reservationsErr) console.warn('Failed to delete reservations:', reservationsErr.message);
    }

    // 3. Delete trips
    const { error: tripsErr } = await supabase
      .from('trips')
      .delete()
      .eq('user_id', userId);
    if (tripsErr) console.warn('Failed to delete trips:', tripsErr.message);

    // 4. Delete connected accounts
    const { error: connectedErr } = await supabase
      .from('connected_accounts')
      .delete()
      .eq('user_id', userId);
    if (connectedErr) console.warn('Failed to delete connected accounts:', connectedErr.message);

    // 5. Delete notifications
    const { error: notifErr } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId);
    if (notifErr) console.warn('Failed to delete notifications:', notifErr.message);

    // 6. Delete AI usage
    const { error: aiErr } = await supabase
      .from('ai_usage')
      .delete()
      .eq('user_id', userId);
    if (aiErr) console.warn('Failed to delete AI usage:', aiErr.message);

    // 7. Delete profile
    const { error: profileErr } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);
    if (profileErr) console.warn('Failed to delete profile:', profileErr.message);

    // 8. Delete the auth user (requires service role)
    const { error: deleteUserErr } = await supabase.auth.admin.deleteUser(userId);
    if (deleteUserErr) {
      console.error('Failed to delete auth user:', deleteUserErr.message);
      return new Response(JSON.stringify({ error: 'Failed to delete auth user: ' + deleteUserErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[delete-account] Successfully deleted user ${userId}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Delete account error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

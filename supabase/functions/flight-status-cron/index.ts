/**
 * Supabase Edge Function: flight-status-cron
 *
 * Lightweight fan-out function that runs on a cron schedule (every 15 minutes).
 * Queries all flight reservations departing in the next 48 hours (or departed
 * up to 12 hours ago), groups them by user, and invokes check-flight-status
 * once per user.
 *
 * This keeps flight data fresh even when no user has the app open.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (_req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const past12h = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    // Find all flight reservations in the relevant time window
    const { data: reservations, error } = await supabase
      .from("reservations")
      .select("trip_id, trips!inner(user_id)")
      .eq("type", "flight")
      .gte("start_time", past12h.toISOString())
      .lte("start_time", in48h.toISOString());

    if (error) {
      console.error("Error querying reservations:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!reservations || reservations.length === 0) {
      console.log("No upcoming flights to check");
      return new Response(
        JSON.stringify({ message: "No upcoming flights", users_checked: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Group by user_id (deduplicate)
    const userIds = new Set<string>();
    for (const res of reservations) {
      const userId = (res as any).trips?.user_id;
      if (userId) userIds.add(userId);
    }

    console.log(`Found ${reservations.length} flights across ${userIds.size} users`);

    // Invoke check-flight-status for each user
    const results: Array<{ user_id: string; success: boolean; error?: string }> = [];

    for (const userId of userIds) {
      try {
        const { error: invokeError } = await supabase.functions.invoke(
          "check-flight-status",
          {
            body: {
              mode: "user",
              user_id: userId,
            },
          }
        );

        if (invokeError) {
          console.error(`Error checking flights for user ${userId}:`, invokeError);
          results.push({ user_id: userId, success: false, error: invokeError.message });
        } else {
          results.push({ user_id: userId, success: true });
        }
      } catch (err: any) {
        console.error(`Exception checking flights for user ${userId}:`, err);
        results.push({ user_id: userId, success: false, error: err.message });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(`Checked ${successCount}/${userIds.size} users successfully`);

    return new Response(
      JSON.stringify({
        message: "Cron complete",
        users_checked: userIds.size,
        successful: successCount,
        failed: userIds.size - successCount,
        results,
        checked_at: new Date().toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Cron function error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

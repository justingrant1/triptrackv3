import { supabase } from './supabase';
import { parseDateOnly } from './utils';
import type { Trip } from './types/database';

/**
 * Check if all reservations in a trip are cancelled.
 * Returns true if the trip has reservations and every one is cancelled.
 */
async function areAllReservationsCancelled(tripId: string): Promise<boolean> {
  try {
    const { data: reservations, error } = await supabase
      .from('reservations')
      .select('id, status')
      .eq('trip_id', tripId);

    if (error || !reservations || reservations.length === 0) return false;

    return reservations.every((r) => r.status === 'cancelled');
  } catch {
    return false;
  }
}

/**
 * Determine the correct status for a trip based on its dates
 */
export function calculateTripStatus(startDate: string, endDate: string): 'upcoming' | 'active' | 'completed' {
  const now = new Date();
  // Use parseDateOnly to correctly handle Supabase timestamptz date strings
  // (e.g., "2026-02-12T00:00:00+00:00") without timezone shift
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  // Set time to start of day for accurate comparison
  now.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (now < start) {
    return 'upcoming';
  } else if (now >= start && now <= end) {
    return 'active';
  } else {
    return 'completed';
  }
}

/**
 * Update trip statuses based on current date
 * Call this on app launch and pull-to-refresh
 */
export async function updateTripStatuses(userId: string): Promise<{ updated: number; error: Error | null }> {
  try {
    // Fetch all trips for the user
    const { data: trips, error: fetchError } = await supabase
      .from('trips')
      .select('*')
      .eq('user_id', userId);

    if (fetchError) throw fetchError;
    if (!trips || trips.length === 0) {
      return { updated: 0, error: null };
    }

    let updatedCount = 0;

    // Update each trip if status has changed
    for (const trip of trips) {
      let correctStatus = calculateTripStatus(trip.start_date, trip.end_date);

      // If trip is upcoming or active, check if all reservations are cancelled.
      // If so, move it to completed (Past Trips) regardless of dates.
      if (correctStatus !== 'completed') {
        const allCancelled = await areAllReservationsCancelled(trip.id);
        if (allCancelled) {
          correctStatus = 'completed';
        }
      }
      
      if (trip.status !== correctStatus) {
        const { error: updateError } = await supabase
          .from('trips')
          .update({ status: correctStatus, updated_at: new Date().toISOString() })
          .eq('id', trip.id);

        if (updateError) {
          console.error(`Failed to update trip ${trip.id}:`, updateError);
        } else {
          updatedCount++;
        }
      }
    }

    return { updated: updatedCount, error: null };
  } catch (error: any) {
    console.error('Error updating trip statuses:', error);
    return { updated: 0, error };
  }
}

/**
 * Update a single trip's status
 */
export async function updateSingleTripStatus(tripId: string, startDate: string, endDate: string): Promise<{ error: Error | null }> {
  try {
    const correctStatus = calculateTripStatus(startDate, endDate);
    
    const { error } = await supabase
      .from('trips')
      .update({ status: correctStatus, updated_at: new Date().toISOString() })
      .eq('id', tripId);

    if (error) throw error;

    return { error: null };
  } catch (error: any) {
    console.error('Error updating trip status:', error);
    return { error };
  }
}

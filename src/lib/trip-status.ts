import { supabase } from './supabase';
import type { Trip } from './types/database';

/**
 * Determine the correct status for a trip based on its dates
 */
export function calculateTripStatus(startDate: string, endDate: string): 'upcoming' | 'active' | 'completed' {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);

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
      const correctStatus = calculateTripStatus(trip.start_date, trip.end_date);
      
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

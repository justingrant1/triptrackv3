import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { Trip, TripInsert, TripUpdate } from '../types/database';
import { rescheduleRemindersForTrip, cancelRemindersForTrip } from '../notifications';

/**
 * Fetch all trips for the current user
 */
export function useTrips() {
  return useQuery({
    queryKey: ['trips'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .order('start_date', { ascending: false });

      if (error) throw error;
      return data as Trip[];
    },
  });
}

/**
 * Fetch a single trip by ID
 */
export function useTrip(tripId: string | undefined) {
  return useQuery({
    queryKey: ['trips', tripId],
    queryFn: async () => {
      if (!tripId) return null;

      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('id', tripId)
        .single();

      if (error) throw error;
      return data as Trip;
    },
    enabled: !!tripId,
  });
}

/**
 * Fetch upcoming trips (status = 'upcoming' or 'active')
 */
export function useUpcomingTrips() {
  return useQuery({
    queryKey: ['trips', 'upcoming'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .in('status', ['upcoming', 'active'])
        .order('start_date', { ascending: true });

      if (error) throw error;
      return data as Trip[];
    },
  });
}

/**
 * Create a new trip
 */
export function useCreateTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (trip: TripInsert) => {
      const { data, error } = await supabase
        .from('trips')
        .insert(trip)
        .select()
        .single();

      if (error) throw error;
      return data as Trip;
    },
    onSuccess: (data) => {
      // Invalidate and refetch trips
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      // Schedule local reminders for the new trip
      rescheduleRemindersForTrip(data).catch(console.error);
    },
  });
}

/**
 * Update an existing trip
 */
export function useUpdateTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TripUpdate }) => {
      const { data, error } = await supabase
        .from('trips')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Trip;
    },
    onSuccess: (data) => {
      // Invalidate trips list and specific trip
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['trips', data.id] });
      // Reschedule reminders with updated dates
      rescheduleRemindersForTrip(data).catch(console.error);
    },
  });
}

/**
 * Delete a trip
 */
export function useDeleteTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tripId: string) => {
      const { error } = await supabase
        .from('trips')
        .delete()
        .eq('id', tripId);

      if (error) throw error;
      return tripId;
    },
    onSuccess: (tripId) => {
      // Invalidate trips list
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      // Cancel local reminders for deleted trip
      cancelRemindersForTrip(tripId).catch(console.error);
    },
  });
}

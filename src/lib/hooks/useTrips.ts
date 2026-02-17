import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { queryKeys } from '../query-keys';
import type { Trip, TripInsert, TripUpdate } from '../types/database';
import { rescheduleRemindersForTrip, cancelRemindersForTrip } from '../notifications';

/**
 * Fetch all trips for the current user
 */
export function useTrips() {
  return useQuery({
    queryKey: queryKeys.trips.all,
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
    queryKey: queryKeys.trips.detail(tripId ?? ''),
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
    queryKey: queryKeys.trips.upcoming,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .in('status', ['upcoming', 'active'])
        .order('start_date', { ascending: true });

      if (error) throw error;
      return data as Trip[];
    },
    // Upcoming trips are time-sensitive — refresh more often than the global default
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

/**
 * Create a new trip — optimistic update adds it to the list immediately
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
    onMutate: async (newTrip) => {
      // Cancel in-flight fetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.trips.all });

      const previous = queryClient.getQueryData<Trip[]>(queryKeys.trips.all);

      // Optimistically add the trip with a temp ID
      const optimisticTrip: Trip = {
        id: `temp-${Date.now()}`,
        user_id: '',
        name: newTrip.name,
        destination: newTrip.destination,
        start_date: newTrip.start_date,
        end_date: newTrip.end_date,
        cover_image: newTrip.cover_image ?? null,
        status: newTrip.status,
        summary: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      queryClient.setQueryData<Trip[]>(queryKeys.trips.all, (old) => [
        optimisticTrip,
        ...(old ?? []),
      ]);

      return { previous };
    },
    onError: (_err, _newTrip, context) => {
      // Roll back to previous state on error
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.trips.all, context.previous);
      }
    },
    onSuccess: async (data) => {
      // Schedule local reminders for the new trip
      rescheduleRemindersForTrip(data).catch(console.error);

      // Clear any matching deleted_trips records so future emails can merge into this trip
      // This handles the case where a user manually recreates a trip they previously deleted
      try {
        const bufferDays = 7;
        const bufferedStart = new Date(data.start_date);
        bufferedStart.setDate(bufferedStart.getDate() - bufferDays);
        const bufferedEnd = new Date(data.end_date);
        bufferedEnd.setDate(bufferedEnd.getDate() + bufferDays);

        await supabase
          .from('deleted_trips')
          .delete()
          .eq('destination', data.destination)
          .gte('end_date', bufferedStart.toISOString().split('T')[0])
          .lte('start_date', bufferedEnd.toISOString().split('T')[0]);

        console.log(`Cleared deleted_trips records for manually recreated trip: ${data.destination}`);
      } catch (error) {
        console.warn('Failed to clear deleted_trips records:', error);
        // Don't throw - trip creation succeeded, this is just cleanup
      }
    },
    onSettled: () => {
      // Always refetch to get the real server state
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.upcoming });
    },
  });
}

/**
 * Update an existing trip — optimistic update reflects changes immediately
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
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.trips.all });
      await queryClient.cancelQueries({ queryKey: queryKeys.trips.detail(id) });

      const previousList = queryClient.getQueryData<Trip[]>(queryKeys.trips.all);
      const previousDetail = queryClient.getQueryData<Trip>(queryKeys.trips.detail(id));

      // Optimistically update the list
      queryClient.setQueryData<Trip[]>(queryKeys.trips.all, (old) =>
        (old ?? []).map((trip) =>
          trip.id === id ? { ...trip, ...updates, updated_at: new Date().toISOString() } : trip
        )
      );

      // Optimistically update the detail
      if (previousDetail) {
        queryClient.setQueryData<Trip>(queryKeys.trips.detail(id), {
          ...previousDetail,
          ...updates,
          updated_at: new Date().toISOString(),
        } as Trip);
      }

      return { previousList, previousDetail };
    },
    onError: (_err, { id }, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(queryKeys.trips.all, context.previousList);
      }
      if (context?.previousDetail) {
        queryClient.setQueryData(queryKeys.trips.detail(id), context.previousDetail);
      }
    },
    onSuccess: (data) => {
      rescheduleRemindersForTrip(data).catch(console.error);
    },
    onSettled: (_data, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.upcoming });
    },
  });
}

/**
 * Delete a trip — optimistic update removes it from the list immediately
 */
export function useDeleteTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tripId: string) => {
      // STEP 1: Fetch the trip details BEFORE deleting (we need destination + dates)
      const { data: trip, error: fetchError } = await supabase
        .from('trips')
        .select('destination, start_date, end_date, name, user_id')
        .eq('id', tripId)
        .single();

      if (fetchError) throw fetchError;

      // STEP 2: Record the deleted trip fingerprint to prevent recreation
      // This prevents the trip from reappearing when new emails about it arrive
      if (trip) {
        const { error: insertError } = await supabase
          .from('deleted_trips')
          .insert({
            user_id: trip.user_id, // ← CRITICAL FIX: This was missing, causing silent insert failures
            destination: trip.destination,
            start_date: trip.start_date,
            end_date: trip.end_date,
            original_trip_name: trip.name,
          });
        
        if (insertError) {
          console.error('[Delete Trip] Failed to record deleted trip:', insertError);
          // Note: We don't throw — deletion should proceed even if logging fails
        } else {
          console.log(`[Delete Trip] Recorded deleted trip: ${trip.name} (${trip.destination})`);
        }
      }

      // STEP 3: Delete the trip (cascade deletes reservations via DB foreign key)
      const { error } = await supabase
        .from('trips')
        .delete()
        .eq('id', tripId);

      if (error) throw error;
      return tripId;
    },
    onMutate: async (tripId) => {
      // Cancel all trip-related queries to prevent stale refetches from overwriting
      await queryClient.cancelQueries({ queryKey: queryKeys.trips.all });
      await queryClient.cancelQueries({ queryKey: queryKeys.trips.upcoming });
      await queryClient.cancelQueries({ queryKey: queryKeys.trips.detail(tripId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.reservations.byTrip(tripId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.reservations.upcoming });

      const previousAll = queryClient.getQueryData<Trip[]>(queryKeys.trips.all);
      const previousUpcoming = queryClient.getQueryData<Trip[]>(queryKeys.trips.upcoming);

      // Optimistically remove the trip from all lists
      queryClient.setQueryData<Trip[]>(queryKeys.trips.all, (old) =>
        (old ?? []).filter((trip) => trip.id !== tripId)
      );
      queryClient.setQueryData<Trip[]>(queryKeys.trips.upcoming, (old) =>
        (old ?? []).filter((trip) => trip.id !== tripId)
      );
      // Remove the detail cache so navigating back doesn't show stale data
      queryClient.removeQueries({ queryKey: queryKeys.trips.detail(tripId) });

      return { previousAll, previousUpcoming, tripId };
    },
    onError: (_err, _tripId, context) => {
      if (context?.previousAll) {
        queryClient.setQueryData(queryKeys.trips.all, context.previousAll);
      }
      if (context?.previousUpcoming) {
        queryClient.setQueryData(queryKeys.trips.upcoming, context.previousUpcoming);
      }
    },
    onSuccess: (tripId) => {
      // Explicitly remove from all related caches to ensure persisted cache is correct
      queryClient.setQueryData<Trip[]>(queryKeys.trips.all, (old) =>
        (old ?? []).filter((trip) => trip.id !== tripId)
      );
      queryClient.setQueryData<Trip[]>(queryKeys.trips.upcoming, (old) =>
        (old ?? []).filter((trip) => trip.id !== tripId)
      );
      
      // Remove all reservations for this trip from caches
      // (Supabase cascade-deletes them, so our cache should too)
      queryClient.removeQueries({ queryKey: queryKeys.reservations.byTrip(tripId) });
      queryClient.removeQueries({ queryKey: queryKeys.trips.detail(tripId) });
      
      // Also clean up any reservations from this trip in the upcoming cache
      queryClient.setQueryData<any[]>(queryKeys.reservations.upcoming, (old) =>
        (old ?? []).filter((r) => r.trip_id !== tripId)
      );

      cancelRemindersForTrip(tripId).catch(console.error);
    },
    onSettled: async () => {
      // Cancel any in-flight queries first — a stale refetch (e.g. from useFocusEffect)
      // may still be pending with data that includes the deleted trip. We must cancel
      // these before invalidating to prevent the stale response from overwriting our
      // optimistic delete after invalidation triggers a fresh refetch.
      await queryClient.cancelQueries({ queryKey: queryKeys.trips.all });
      await queryClient.cancelQueries({ queryKey: queryKeys.trips.upcoming });
      await queryClient.cancelQueries({ queryKey: queryKeys.reservations.upcoming });
      
      // Now safe to invalidate — fresh refetches will not include the deleted trip
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.upcoming });
      queryClient.invalidateQueries({ queryKey: queryKeys.reservations.upcoming });
    },
  });
}

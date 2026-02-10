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
    onSuccess: (data) => {
      // Schedule local reminders for the new trip
      rescheduleRemindersForTrip(data).catch(console.error);
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
      const { error } = await supabase
        .from('trips')
        .delete()
        .eq('id', tripId);

      if (error) throw error;
      return tripId;
    },
    onMutate: async (tripId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.trips.all });

      const previous = queryClient.getQueryData<Trip[]>(queryKeys.trips.all);

      // Optimistically remove the trip
      queryClient.setQueryData<Trip[]>(queryKeys.trips.all, (old) =>
        (old ?? []).filter((trip) => trip.id !== tripId)
      );

      return { previous };
    },
    onError: (_err, _tripId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.trips.all, context.previous);
      }
    },
    onSuccess: (tripId) => {
      cancelRemindersForTrip(tripId).catch(console.error);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.upcoming });
    },
  });
}

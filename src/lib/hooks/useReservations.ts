import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { queryKeys } from '../query-keys';
import type { Reservation, ReservationInsert, ReservationUpdate } from '../types/database';
import { rescheduleRemindersForReservation, cancelRemindersForReservation } from '../notifications';

/**
 * Fetch all reservations for a specific trip
 */
export function useReservations(tripId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.reservations.byTrip(tripId ?? ''),
    queryFn: async () => {
      if (!tripId) return [];

      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('trip_id', tripId)
        .order('start_time', { ascending: true });

      if (error) throw error;
      return data as Reservation[];
    },
    enabled: !!tripId,
  });
}

/**
 * Fetch a single reservation by ID
 */
export function useReservation(reservationId: string | undefined) {
  return useQuery({
    queryKey: ['reservations', 'single', reservationId],
    queryFn: async () => {
      if (!reservationId) return null;

      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('id', reservationId)
        .single();

      if (error) throw error;
      return data as Reservation;
    },
    enabled: !!reservationId,
  });
}

/**
 * Create a new reservation — optimistic update adds it to the trip's list
 */
export function useCreateReservation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reservation: ReservationInsert) => {
      const { data, error } = await supabase
        .from('reservations')
        .insert(reservation)
        .select()
        .single();

      if (error) throw error;
      return data as Reservation;
    },
    onMutate: async (newReservation) => {
      const tripKey = queryKeys.reservations.byTrip(newReservation.trip_id);
      await queryClient.cancelQueries({ queryKey: tripKey });

      const previous = queryClient.getQueryData<Reservation[]>(tripKey);

      const optimistic: Reservation = {
        id: `temp-${Date.now()}`,
        trip_id: newReservation.trip_id,
        type: newReservation.type,
        title: newReservation.title,
        subtitle: newReservation.subtitle ?? null,
        start_time: newReservation.start_time,
        end_time: newReservation.end_time ?? null,
        location: newReservation.location ?? null,
        address: newReservation.address ?? null,
        confirmation_number: newReservation.confirmation_number ?? null,
        details: newReservation.details ?? {},
        status: newReservation.status ?? 'confirmed',
        alert_message: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      queryClient.setQueryData<Reservation[]>(tripKey, (old) => {
        const list = [...(old ?? []), optimistic];
        return list.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
      });

      return { previous, tripId: newReservation.trip_id };
    },
    onError: (_err, _newRes, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.reservations.byTrip(context.tripId),
          context.previous
        );
      }
    },
    onSuccess: (data) => {
      rescheduleRemindersForReservation(data).catch(console.error);
    },
    onSettled: (_data, _err, newReservation) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reservations.byTrip(newReservation.trip_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(newReservation.trip_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.reservations.upcoming });
    },
  });
}

/**
 * Update an existing reservation — optimistic update reflects changes immediately
 */
export function useUpdateReservation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: ReservationUpdate }) => {
      const { data, error } = await supabase
        .from('reservations')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Reservation;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reservations.byTrip(data.trip_id) });
      queryClient.invalidateQueries({ queryKey: ['reservations', 'single', data.id] });
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(data.trip_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.reservations.upcoming });
      rescheduleRemindersForReservation(data).catch(console.error);
    },
  });
}

/**
 * Delete a reservation — optimistic update removes it from the list immediately
 */
export function useDeleteReservation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, tripId }: { id: string; tripId: string }) => {
      // CRITICAL: Cancel notifications BEFORE deleting from DB
      // This ensures we have the reservation ID available for cancellation
      console.log(`[DeleteReservation] Cancelling notifications for reservation ${id}`);
      await cancelRemindersForReservation(id);

      const { error } = await supabase
        .from('reservations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { id, tripId };
    },
    onMutate: async ({ id, tripId }) => {
      const tripKey = queryKeys.reservations.byTrip(tripId);
      const upcomingKey = queryKeys.reservations.upcoming;
      
      await queryClient.cancelQueries({ queryKey: tripKey });
      await queryClient.cancelQueries({ queryKey: upcomingKey });

      const previousTrip = queryClient.getQueryData<Reservation[]>(tripKey);
      const previousUpcoming = queryClient.getQueryData<Reservation[]>(upcomingKey);

      // Optimistically remove from trip-specific cache
      queryClient.setQueryData<Reservation[]>(tripKey, (old) =>
        (old ?? []).filter((r) => r.id !== id)
      );

      // Optimistically remove from upcoming cache
      queryClient.setQueryData<Reservation[]>(upcomingKey, (old) =>
        (old ?? []).filter((r) => r.id !== id)
      );

      return { previousTrip, previousUpcoming, tripId, id };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTrip) {
        queryClient.setQueryData(
          queryKeys.reservations.byTrip(context.tripId),
          context.previousTrip
        );
      }
      if (context?.previousUpcoming) {
        queryClient.setQueryData(
          queryKeys.reservations.upcoming,
          context.previousUpcoming
        );
      }
      // If deletion failed, we should reschedule notifications
      // But we don't have the reservation data here, so we'll rely on the UI refresh
      console.error('[DeleteReservation] Failed to delete, notifications may need rescheduling');
    },
    onSuccess: ({ id, tripId }) => {
      // Explicitly remove from all related caches to ensure persisted cache is correct
      const tripKey = queryKeys.reservations.byTrip(tripId);
      const upcomingKey = queryKeys.reservations.upcoming;

      queryClient.setQueryData<Reservation[]>(tripKey, (old) =>
        (old ?? []).filter((r) => r.id !== id)
      );
      queryClient.setQueryData<Reservation[]>(upcomingKey, (old) =>
        (old ?? []).filter((r) => r.id !== id)
      );
    },
    onSettled: (_data, _err, { tripId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reservations.byTrip(tripId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(tripId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.reservations.upcoming });
    },
  });
}

/**
 * Fetch upcoming reservations (from start of today through next 48 hours).
 * Includes reservations that already started today so flights that have
 * departed but not yet landed still appear on the Today tab.
 */
export function useUpcomingReservations() {
  return useQuery({
    queryKey: queryKeys.reservations.upcoming,
    queryFn: async () => {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .gte('start_time', startOfToday.toISOString())
        .lte('start_time', in48Hours.toISOString())
        .order('start_time', { ascending: true });

      if (error) throw error;
      return data as Reservation[];
    },
  });
}

/**
 * Get reservation counts by type for a trip
 */
export function useReservationCounts(tripId: string | undefined) {
  return useQuery({
    queryKey: ['reservations', 'counts', tripId],
    queryFn: async () => {
      if (!tripId) return { flight: 0, hotel: 0, car: 0, train: 0, meeting: 0, event: 0 };

      const { data, error } = await supabase
        .from('reservations')
        .select('type')
        .eq('trip_id', tripId);

      if (error) throw error;

      const counts = {
        flight: 0,
        hotel: 0,
        car: 0,
        train: 0,
        meeting: 0,
        event: 0,
      };

      data.forEach((reservation) => {
        const type = reservation.type as keyof typeof counts;
        if (type in counts) {
          counts[type]++;
        }
      });

      return counts;
    },
    enabled: !!tripId,
  });
}

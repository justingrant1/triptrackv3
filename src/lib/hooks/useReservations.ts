import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { Reservation, ReservationInsert, ReservationUpdate } from '../types/database';
import { rescheduleRemindersForReservation, cancelRemindersForReservation } from '../notifications';

/**
 * Fetch all reservations for a specific trip
 */
export function useReservations(tripId: string | undefined) {
  return useQuery({
    queryKey: ['reservations', tripId],
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
 * Create a new reservation
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
    onSuccess: (data) => {
      // Invalidate reservations for this trip
      queryClient.invalidateQueries({ queryKey: ['reservations', data.trip_id] });
      // Also invalidate the trip to update summary
      queryClient.invalidateQueries({ queryKey: ['trips', data.trip_id] });
      // Schedule local reminders for the new reservation
      rescheduleRemindersForReservation(data).catch(console.error);
    },
  });
}

/**
 * Update an existing reservation
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
      // Invalidate reservations for this trip
      queryClient.invalidateQueries({ queryKey: ['reservations', data.trip_id] });
      queryClient.invalidateQueries({ queryKey: ['reservations', 'single', data.id] });
      // Also invalidate the trip to update summary
      queryClient.invalidateQueries({ queryKey: ['trips', data.trip_id] });
      // Reschedule reminders with updated times
      rescheduleRemindersForReservation(data).catch(console.error);
    },
  });
}

/**
 * Delete a reservation
 */
export function useDeleteReservation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, tripId }: { id: string; tripId: string }) => {
      const { error } = await supabase
        .from('reservations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { id, tripId };
    },
    onSuccess: (data) => {
      // Invalidate reservations for this trip
      queryClient.invalidateQueries({ queryKey: ['reservations', data.tripId] });
      // Also invalidate the trip to update summary
      queryClient.invalidateQueries({ queryKey: ['trips', data.tripId] });
      // Cancel local reminders for deleted reservation
      cancelRemindersForReservation(data.id).catch(console.error);
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
    queryKey: ['reservations', 'upcoming'],
    queryFn: async () => {
      const now = new Date();
      // Start of today (midnight local time)
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

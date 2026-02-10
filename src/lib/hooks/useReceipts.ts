import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { queryKeys } from '../query-keys';
import type { Receipt, ReceiptInsert, ReceiptUpdate, ReceiptWithTrip } from '../types/database';

/**
 * Fetch all receipts for a specific trip
 */
export function useReceipts(tripId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.receipts.byTrip(tripId ?? ''),
    queryFn: async () => {
      if (!tripId) return [];

      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .eq('trip_id', tripId)
        .order('date', { ascending: false });

      if (error) throw error;
      return data as Receipt[];
    },
    enabled: !!tripId,
  });
}

/**
 * Fetch all receipts for the current user (across all trips)
 * Returns receipts with joined trip data (name, destination)
 */
export function useAllReceipts() {
  return useQuery({
    queryKey: queryKeys.receipts.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipts')
        .select('*, trips(name, destination)')
        .order('date', { ascending: false });

      if (error) throw error;
      return data as ReceiptWithTrip[];
    },
  });
}

/**
 * Fetch a single receipt by ID
 */
export function useReceipt(receiptId: string | undefined) {
  return useQuery({
    queryKey: ['receipts', 'single', receiptId],
    queryFn: async () => {
      if (!receiptId) return null;

      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .eq('id', receiptId)
        .single();

      if (error) throw error;
      return data as Receipt;
    },
    enabled: !!receiptId,
  });
}

/**
 * Create a new receipt — optimistic update adds it to the list
 */
export function useCreateReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (receipt: ReceiptInsert) => {
      const { data, error } = await supabase
        .from('receipts')
        .insert(receipt)
        .select()
        .single();

      if (error) throw error;
      return data as Receipt;
    },
    onMutate: async (newReceipt) => {
      const tripKey = queryKeys.receipts.byTrip(newReceipt.trip_id);
      await queryClient.cancelQueries({ queryKey: tripKey });
      await queryClient.cancelQueries({ queryKey: queryKeys.receipts.all });

      const previousTrip = queryClient.getQueryData<Receipt[]>(tripKey);
      const previousAll = queryClient.getQueryData<ReceiptWithTrip[]>(queryKeys.receipts.all);

      const optimistic: Receipt = {
        id: `temp-${Date.now()}`,
        trip_id: newReceipt.trip_id,
        reservation_id: newReceipt.reservation_id ?? null,
        merchant: newReceipt.merchant,
        amount: newReceipt.amount,
        currency: newReceipt.currency,
        date: newReceipt.date,
        category: newReceipt.category,
        image_url: newReceipt.image_url ?? null,
        status: newReceipt.status ?? 'pending',
        ocr_data: newReceipt.ocr_data ?? null,
        created_at: new Date().toISOString(),
      };

      queryClient.setQueryData<Receipt[]>(tripKey, (old) => [optimistic, ...(old ?? [])]);

      return { previousTrip, previousAll, tripId: newReceipt.trip_id };
    },
    onError: (_err, _newReceipt, context) => {
      if (context?.previousTrip) {
        queryClient.setQueryData(queryKeys.receipts.byTrip(context.tripId), context.previousTrip);
      }
      if (context?.previousAll) {
        queryClient.setQueryData(queryKeys.receipts.all, context.previousAll);
      }
    },
    onSettled: (_data, _err, newReceipt) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.receipts.byTrip(newReceipt.trip_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.receipts.all });
    },
  });
}

/**
 * Update an existing receipt
 */
export function useUpdateReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: ReceiptUpdate }) => {
      const { data, error } = await supabase
        .from('receipts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Receipt;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.receipts.byTrip(data.trip_id) });
      queryClient.invalidateQueries({ queryKey: ['receipts', 'single', data.id] });
      queryClient.invalidateQueries({ queryKey: queryKeys.receipts.all });
    },
  });
}

/**
 * Delete a receipt — optimistic update removes it from the list immediately
 */
export function useDeleteReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, tripId }: { id: string; tripId: string }) => {
      const { error } = await supabase
        .from('receipts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { id, tripId };
    },
    onMutate: async ({ id, tripId }) => {
      const tripKey = queryKeys.receipts.byTrip(tripId);
      await queryClient.cancelQueries({ queryKey: tripKey });
      await queryClient.cancelQueries({ queryKey: queryKeys.receipts.all });

      const previousTrip = queryClient.getQueryData<Receipt[]>(tripKey);
      const previousAll = queryClient.getQueryData<ReceiptWithTrip[]>(queryKeys.receipts.all);

      queryClient.setQueryData<Receipt[]>(tripKey, (old) =>
        (old ?? []).filter((r) => r.id !== id)
      );
      queryClient.setQueryData<ReceiptWithTrip[]>(queryKeys.receipts.all, (old) =>
        (old ?? []).filter((r) => r.id !== id)
      );

      return { previousTrip, previousAll, tripId };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTrip) {
        queryClient.setQueryData(queryKeys.receipts.byTrip(context.tripId), context.previousTrip);
      }
      if (context?.previousAll) {
        queryClient.setQueryData(queryKeys.receipts.all, context.previousAll);
      }
    },
    onSettled: (_data, _err, { tripId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.receipts.byTrip(tripId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.receipts.all });
    },
  });
}

/**
 * Calculate total expenses for a trip
 */
export function useTripExpenses(tripId: string | undefined) {
  return useQuery({
    queryKey: ['receipts', 'expenses', tripId],
    queryFn: async () => {
      if (!tripId) return { total: 0, byCategory: {} as Record<string, number>, count: 0 };

      const { data, error } = await supabase
        .from('receipts')
        .select('amount, currency, category')
        .eq('trip_id', tripId);

      if (error) throw error;

      const receipts = data as Pick<Receipt, 'amount' | 'currency' | 'category'>[];
      const total = receipts.reduce((sum, receipt) => sum + receipt.amount, 0);
      
      const byCategory = receipts.reduce((acc, receipt) => {
        const category = receipt.category || 'other';
        acc[category] = (acc[category] || 0) + receipt.amount;
        return acc;
      }, {} as Record<string, number>);

      return { total, byCategory, count: receipts.length };
    },
    enabled: !!tripId,
  });
}

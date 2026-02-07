import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { Receipt, ReceiptInsert, ReceiptUpdate } from '../types/database';

/**
 * Fetch all receipts for a specific trip
 */
export function useReceipts(tripId: string | undefined) {
  return useQuery({
    queryKey: ['receipts', tripId],
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
 */
export function useAllReceipts() {
  return useQuery({
    queryKey: ['receipts', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipts')
        .select('*, trips(name, destination)')
        .order('date', { ascending: false });

      if (error) throw error;
      return data;
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
 * Create a new receipt
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
    onSuccess: (data) => {
      // Invalidate receipts for this trip
      queryClient.invalidateQueries({ queryKey: ['receipts', data.trip_id] });
      queryClient.invalidateQueries({ queryKey: ['receipts', 'all'] });
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
      // Invalidate receipts for this trip
      queryClient.invalidateQueries({ queryKey: ['receipts', data.trip_id] });
      queryClient.invalidateQueries({ queryKey: ['receipts', 'single', data.id] });
      queryClient.invalidateQueries({ queryKey: ['receipts', 'all'] });
    },
  });
}

/**
 * Delete a receipt
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
    onSuccess: (data) => {
      // Invalidate receipts for this trip
      queryClient.invalidateQueries({ queryKey: ['receipts', data.tripId] });
      queryClient.invalidateQueries({ queryKey: ['receipts', 'all'] });
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
      if (!tripId) return { total: 0, byCategory: {} };

      const { data, error } = await supabase
        .from('receipts')
        .select('amount, currency, category')
        .eq('trip_id', tripId);

      if (error) throw error;

      const receipts = data as Receipt[];
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

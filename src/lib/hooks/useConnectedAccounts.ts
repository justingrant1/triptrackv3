import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/state/auth-store';
import type { ConnectedAccount, ConnectedAccountInsert } from '@/lib/types/database';
import { revokeToken } from '@/lib/google-auth';

/**
 * Fetch all connected accounts for the current user
 */
export function useConnectedAccounts() {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ['connected-accounts', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('connected_accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ConnectedAccount[];
    },
    enabled: !!user?.id,
  });
}

/**
 * Fetch a single connected account by ID
 */
export function useConnectedAccount(accountId: string | undefined) {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ['connected-account', accountId],
    queryFn: async () => {
      if (!user?.id || !accountId) throw new Error('Missing required parameters');

      const { data, error } = await supabase
        .from('connected_accounts')
        .select('*')
        .eq('id', accountId)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      return data as ConnectedAccount;
    },
    enabled: !!user?.id && !!accountId,
  });
}

/**
 * Add a new connected account
 */
export function useAddConnectedAccount() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (account: ConnectedAccountInsert) => {
      if (!user?.id) throw new Error('User not authenticated');

      // Calculate token expiry time
      const tokenExpiry = new Date();
      tokenExpiry.setSeconds(tokenExpiry.getSeconds() + 3600); // Default 1 hour

      const { data, error } = await supabase
        .from('connected_accounts')
        .insert({
          ...account,
          user_id: user.id,
          token_expiry: tokenExpiry.toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data as ConnectedAccount;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connected-accounts', user?.id] });
    },
  });
}

/**
 * Update a connected account (e.g., refresh tokens, update last sync)
 */
export function useUpdateConnectedAccount() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async ({
      accountId,
      updates,
    }: {
      accountId: string;
      updates: Partial<ConnectedAccountInsert>;
    }) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('connected_accounts')
        .update(updates)
        .eq('id', accountId)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data as ConnectedAccount;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['connected-accounts', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['connected-account', variables.accountId] });
    },
  });
}

/**
 * Delete a connected account and revoke OAuth tokens
 */
export function useDeleteConnectedAccount() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (accountId: string) => {
      if (!user?.id) throw new Error('User not authenticated');

      // First, get the account to revoke the token
      const { data: account, error: fetchError } = await supabase
        .from('connected_accounts')
        .select('*')
        .eq('id', accountId)
        .eq('user_id', user.id)
        .single();

      if (fetchError) throw fetchError;

      // Revoke the OAuth token with Google
      if (account.access_token) {
        await revokeToken(account.access_token);
      }

      // Delete from database
      const { error: deleteError } = await supabase
        .from('connected_accounts')
        .delete()
        .eq('id', accountId)
        .eq('user_id', user.id);

      if (deleteError) throw deleteError;

      return accountId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connected-accounts', user?.id] });
    },
  });
}

/**
 * Trigger a Gmail sync for a connected account.
 * This calls the Supabase Edge Function to scan Gmail.
 * 
 * Supports auto-pagination: if the edge function returns has_more=true
 * (it hit the time budget before processing all emails), the client
 * automatically calls again to continue where it left off.
 * Max 4 rounds to prevent infinite loops.
 * 
 * The onProgress callback is called after each round with cumulative stats.
 */
export function useSyncGmail() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async ({ accountId, onProgress }: { accountId: string; onProgress?: (stats: { emailsProcessed: number; tripsCreated: number; reservationsCreated: number; round: number; scanning: boolean }) => void }) => {
      if (!user?.id) throw new Error('User not authenticated');

      // Rate limiting: Check last sync time (5 minutes minimum between syncs)
      const { data: account } = await supabase
        .from('connected_accounts')
        .select('last_sync')
        .eq('id', accountId)
        .eq('user_id', user.id)
        .single();

      if (account?.last_sync) {
        const lastSyncTime = new Date(account.last_sync).getTime();
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        
        if (now - lastSyncTime < fiveMinutes) {
          const waitTime = Math.ceil((fiveMinutes - (now - lastSyncTime)) / 1000 / 60);
          throw new Error(`Please wait ${waitTime} minute(s) before syncing again`);
        }
      }

      // Auto-pagination: loop until has_more is false or max rounds reached
      const MAX_ROUNDS = 4;
      let cumulativeStats = {
        emailsProcessed: 0,
        tripsCreated: 0,
        reservationsCreated: 0,
      };
      let lastData: any = null;

      for (let round = 1; round <= MAX_ROUNDS; round++) {
        console.log(`[Gmail Sync] Round ${round}/${MAX_ROUNDS}...`);
        
        onProgress?.({
          ...cumulativeStats,
          round,
          scanning: true,
        });

        const { data, error } = await supabase.functions.invoke('scan-gmail', {
          body: { accountId },
        });

        if (error) throw error;
        lastData = data;

        // Accumulate stats from this round
        const summary = data?.summary;
        if (summary) {
          cumulativeStats.emailsProcessed += summary.emailsProcessed || 0;
          cumulativeStats.tripsCreated += summary.tripsCreated || 0;
          cumulativeStats.reservationsCreated += summary.reservationsCreated || 0;
        }

        onProgress?.({
          ...cumulativeStats,
          round,
          scanning: false,
        });

        // If no more emails to process, we're done
        if (!summary?.has_more) {
          console.log(`[Gmail Sync] Complete after ${round} round(s)`);
          break;
        }

        console.log(`[Gmail Sync] has_more=true, continuing to round ${round + 1}...`);
      }

      // Update last_sync timestamp
      await supabase
        .from('connected_accounts')
        .update({ last_sync: new Date().toISOString() })
        .eq('id', accountId)
        .eq('user_id', user.id);

      // Return cumulative results
      return {
        ...lastData,
        cumulativeStats,
      };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['connected-accounts', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['connected-account', variables.accountId] });
      // Also invalidate trips since new ones may have been created
      queryClient.invalidateQueries({ queryKey: ['trips', user?.id] });
    },
  });
}

/**
 * Trigger a Gmail receipt scan for a connected account.
 * Calls the same scan-gmail edge function with mode: 'receipts'.
 * Scans last 30 days for travel-related receipts (hotel invoices,
 * flight charges, rental receipts) and auto-assigns to matching trips.
 */
export function useScanEmailReceipts() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (accountId: string) => {
      if (!user?.id) throw new Error('User not authenticated');

      // Call the Supabase Edge Function with receipt mode
      const { data, error } = await supabase.functions.invoke('scan-gmail', {
        body: {
          accountId,
          mode: 'receipts',
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connected-accounts', user?.id] });
      // Invalidate receipts since new ones may have been created
      queryClient.invalidateQueries({ queryKey: ['all-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
    },
  });
}

/**
 * Check if a token needs to be refreshed
 */
export function isTokenExpired(tokenExpiry: string | null): boolean {
  if (!tokenExpiry) return true;
  const expiryDate = new Date(tokenExpiry);
  const now = new Date();
  // Consider expired if less than 5 minutes remaining
  return expiryDate.getTime() - now.getTime() < 5 * 60 * 1000;
}

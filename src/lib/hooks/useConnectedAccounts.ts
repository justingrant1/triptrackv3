import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/state/auth-store';
import { useSyncStore } from '@/lib/state/sync-store';
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
 * Calls the Supabase Edge Function once with a 90-second client timeout.
 *
 * The edge function handles its own time budget (~115s) and returns
 * has_more=true if it didn't finish — but we don't loop on the client.
 * One round is enough: on subsequent syncs, already-processed emails
 * are skipped instantly via batch dedup.
 *
 * Key reliability features:
 * - 90s client-side timeout prevents hanging forever
 * - last_sync is updated in onSettled (success OR error) so it always reflects the attempt
 * - The sync store has a 2-minute safety auto-reset as a final backstop
 */
export function useSyncGmail() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async ({ accountId }: { accountId: string }) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { startSync } = useSyncStore.getState();

      // Mark sync as in-progress globally (starts progress phase animation)
      startSync(accountId);

      // Rate limiting: 2 minutes minimum between syncs
      const { data: account } = await supabase
        .from('connected_accounts')
        .select('last_sync')
        .eq('id', accountId)
        .eq('user_id', user.id)
        .single();

      if (account?.last_sync) {
        const lastSyncTime = new Date(account.last_sync).getTime();
        const now = Date.now();
        const twoMinutes = 2 * 60 * 1000;

        if (now - lastSyncTime < twoMinutes) {
          const waitSecs = Math.ceil((twoMinutes - (now - lastSyncTime)) / 1000);
          throw new Error(
            waitSecs > 60
              ? `Please wait ${Math.ceil(waitSecs / 60)} minute(s) before syncing again`
              : `Please wait ${waitSecs} seconds before syncing again`
          );
        }
      }

      // Single edge function call with a 90-second client timeout
      console.log('[Gmail Sync] Starting single-round sync...');

      const TIMEOUT_MS = 90_000;

      const edgeFnPromise = supabase.functions.invoke('scan-gmail', {
        body: { accountId },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('__SYNC_TIMEOUT__')),
          TIMEOUT_MS
        );
      });

      let data: any;
      let timedOut = false;

      try {
        const result = await Promise.race([edgeFnPromise, timeoutPromise]);
        // result is { data, error } from supabase.functions.invoke
        const { data: responseData, error } = result as any;
        if (error) throw error;
        data = responseData;
      } catch (err: any) {
        if (err?.message === '__SYNC_TIMEOUT__') {
          // The edge function is still running server-side — trips may still be created.
          // We treat this as a soft success so the user isn't alarmed.
          console.log('[Gmail Sync] Client timeout reached (90s) — edge function may still be running');
          timedOut = true;
          data = { success: true, timedOut: true, summary: { tripsCreated: 0, reservationsCreated: 0, emailsProcessed: 0 } };
        } else {
          throw err;
        }
      }

      console.log('[Gmail Sync] Complete', timedOut ? '(timed out on client)' : '');

      return {
        ...data,
        timedOut,
        cumulativeStats: {
          emailsProcessed: data?.summary?.emailsProcessed || 0,
          tripsCreated: data?.summary?.tripsCreated || 0,
          reservationsCreated: data?.summary?.reservationsCreated || 0,
        },
      };
    },
    onSettled: (_data, _error, variables) => {
      const { finishSync } = useSyncStore.getState();

      // Always clear global sync state (success or error)
      finishSync();

      // Always update last_sync so the UI shows a timestamp and rate limiter works.
      // Even on error, a sync was attempted.
      if (user?.id && variables?.accountId) {
        supabase
          .from('connected_accounts')
          .update({ last_sync: new Date().toISOString() })
          .eq('id', variables.accountId)
          .eq('user_id', user.id)
          .then(() => {
            // Refresh the accounts list so "Last sync: Just now" appears
            queryClient.invalidateQueries({ queryKey: ['connected-accounts', user?.id] });
          });
      }

      // Invalidate trips since new ones may have been created
      queryClient.invalidateQueries({ queryKey: ['connected-accounts', user?.id] });
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

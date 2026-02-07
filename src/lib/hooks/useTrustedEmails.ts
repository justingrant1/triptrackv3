/**
 * Trusted Emails Hooks
 * Manage trusted email addresses for email forwarding
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuthStore } from '../state/auth-store';

export interface TrustedEmail {
  id: string;
  user_id: string;
  email: string;
  verified: boolean;
  created_at: string;
}

export interface TrustedEmailInsert {
  email: string;
  verified?: boolean;
}

/**
 * Fetch all trusted emails for the current user
 */
export function useTrustedEmails() {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ['trusted-emails', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('trusted_emails')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as TrustedEmail[];
    },
    enabled: !!user,
  });
}

/**
 * Add a new trusted email
 */
export function useAddTrustedEmail() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (email: string) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('trusted_emails')
        .insert({
          user_id: user.id,
          email: email.toLowerCase().trim(),
          verified: false, // Will need email verification
        })
        .select()
        .single();

      if (error) throw error;
      return data as TrustedEmail;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trusted-emails'] });
    },
  });
}

/**
 * Remove a trusted email
 */
export function useDeleteTrustedEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('trusted_emails')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trusted-emails'] });
    },
  });
}

/**
 * Verify a trusted email (admin/backend only typically)
 */
export function useVerifyTrustedEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('trusted_emails')
        .update({ verified: true })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as TrustedEmail;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trusted-emails'] });
    },
  });
}

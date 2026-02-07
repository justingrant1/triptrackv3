/**
 * Notification Preferences Hooks
 * Manage user notification settings
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuthStore } from '../state/auth-store';

export interface NotificationPreferences {
  user_id: string;
  flight_updates: boolean;
  departure_reminders: boolean;
  checkin_alerts: boolean;
  trip_changes: boolean;
  email_confirmations: boolean;
  updated_at: string;
}

export interface NotificationPreferencesUpdate {
  flight_updates?: boolean;
  departure_reminders?: boolean;
  checkin_alerts?: boolean;
  trip_changes?: boolean;
  email_confirmations?: boolean;
}

/**
 * Fetch notification preferences for the current user
 */
export function useNotificationPreferences() {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ['notification-preferences', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      // If no preferences exist, create default ones
      if (error && error.code === 'PGRST116') {
        const { data: newPrefs, error: insertError } = await supabase
          .from('notification_preferences')
          .insert({
            user_id: user.id,
            flight_updates: true,
            departure_reminders: true,
            checkin_alerts: true,
            trip_changes: true,
            email_confirmations: false,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        return newPrefs as NotificationPreferences;
      }

      if (error) throw error;
      return data as NotificationPreferences;
    },
    enabled: !!user,
  });
}

/**
 * Update notification preferences
 */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (preferences: NotificationPreferencesUpdate) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('notification_preferences')
        .update({
          ...preferences,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data as NotificationPreferences;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
  });
}

/**
 * Toggle a single notification preference
 */
export function useToggleNotificationPreference() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async ({ key, value }: { key: keyof NotificationPreferencesUpdate; value: boolean }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('notification_preferences')
        .update({
          [key]: value,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data as NotificationPreferences;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
  });
}

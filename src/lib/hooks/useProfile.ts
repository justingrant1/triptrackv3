import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/state/auth-store';

export interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  forwarding_email: string | null;
  forwarding_token: string | null;
  avatar_url: string | null;
  plan: 'free' | 'pro' | 'team';
  created_at: string;
  updated_at: string;
}

export interface UpdateProfileInput {
  name?: string;
  avatar_url?: string;
}

// Fetch current user's profile
export function useProfile() {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      return data as Profile;
    },
    enabled: !!user?.id,
  });
}

// Update profile
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (input: UpdateProfileInput) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('profiles')
        .update(input)
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data as Profile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
  });
}

// Get user's unique forwarding address
export function useForwardingAddress() {
  const { user } = useAuthStore();
  
  return useQuery({
    queryKey: ['forwarding-address', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('profiles')
        .select('forwarding_token')
        .eq('id', user.id)
        .single();
      
      if (error) throw error;
      
      if (!data.forwarding_token) {
        throw new Error('Forwarding token not found. Please contact support.');
      }
      
      return `plans+${data.forwarding_token}@triptrack.ai`;
    },
    enabled: !!user,
  });
}

// Upload avatar to Supabase Storage
export async function uploadAvatar(userId: string, uri: string): Promise<string> {
  try {
    // Fetch the image as a blob
    const response = await fetch(uri);
    const blob = await response.blob();

    // Generate unique filename
    const fileExt = uri.split('.').pop() || 'jpg';
    const fileName = `${userId}/${Date.now()}.${fileExt}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(fileName, blob, {
        contentType: `image/${fileExt}`,
        upsert: true,
      });

    if (error) throw error;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(data.path);

    return publicUrl;
  } catch (error) {
    console.error('Error uploading avatar:', error);
    throw error;
  }
}

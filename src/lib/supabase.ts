import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Supabase configuration
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '⚠️ Missing Supabase environment variables. Please ensure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set.'
  );
  // Don't throw - allow app to load even if Supabase isn't configured
  // This prevents instant crashes in production builds
}

// Custom storage implementation using expo-secure-store
// This ensures auth tokens are stored securely on the device
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    return SecureStore.deleteItemAsync(key);
  },
};

// Create Supabase client with secure storage
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS !== 'web' ? ExpoSecureStoreAdapter : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Database types (will be auto-generated from Supabase later)
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string | null;
          email: string | null;
          forwarding_email: string | null;
          avatar_url: string | null;
          plan: 'free' | 'pro' | 'team';
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      trips: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          destination: string;
          start_date: string;
          end_date: string;
          cover_image: string | null;
          status: 'upcoming' | 'active' | 'completed';
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['trips']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['trips']['Insert']>;
      };
      reservations: {
        Row: {
          id: string;
          trip_id: string;
          type: 'flight' | 'hotel' | 'car' | 'train' | 'meeting' | 'event';
          title: string;
          subtitle: string | null;
          start_time: string;
          end_time: string | null;
          location: string | null;
          address: string | null;
          confirmation_number: string | null;
          details: Record<string, string>;
          status: 'confirmed' | 'delayed' | 'cancelled' | 'completed';
          alert_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['reservations']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['reservations']['Insert']>;
      };
      receipts: {
        Row: {
          id: string;
          trip_id: string;
          reservation_id: string | null;
          merchant: string;
          amount: number;
          currency: string;
          date: string;
          category: 'transport' | 'lodging' | 'meals' | 'other';
          image_url: string | null;
          status: 'pending' | 'submitted' | 'approved';
          ocr_data: Record<string, any> | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['receipts']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['receipts']['Insert']>;
      };
    };
  };
};

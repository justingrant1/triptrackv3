import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { signIn, signUp, signOut, getSession, onAuthStateChange } from '../auth';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  
  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, name?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  /**
   * Initialize auth state and set up listener
   */
  initialize: async () => {
    try {
      // Get current session
      const { session, error } = await getSession();
      
      if (error) {
        console.error('Error getting session:', error);
        set({ isInitialized: true, isLoading: false });
        return;
      }

      set({
        session,
        user: session?.user ?? null,
        isInitialized: true,
        isLoading: false,
      });

      // Set up auth state listener
      onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event);
        set({
          session,
          user: session?.user ?? null,
        });
      });
    } catch (error: any) {
      console.error('Error initializing auth:', error);
      set({ isInitialized: true, isLoading: false });
    }
  },

  /**
   * Sign in with email and password
   */
  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });

    try {
      const { user, session, error } = await signIn(email, password);

      if (error) {
        set({ isLoading: false, error: error.message });
        return { success: false, error: error.message };
      }

      set({
        user,
        session,
        isLoading: false,
        error: null,
      });

      return { success: true };
    } catch (error: any) {
      const errorMessage = error.message || 'An unexpected error occurred';
      set({ isLoading: false, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  },

  /**
   * Sign up with email and password
   */
  register: async (email: string, password: string, name?: string) => {
    set({ isLoading: true, error: null });

    try {
      const { user, session, error } = await signUp(email, password, name);

      if (error) {
        set({ isLoading: false, error: error.message });
        return { success: false, error: error.message };
      }

      // Check if email confirmation is required
      if (!session && user) {
        set({ isLoading: false, error: null });
        return {
          success: true,
          error: 'Please check your email to confirm your account',
        };
      }

      set({
        user,
        session,
        isLoading: false,
        error: null,
      });

      return { success: true };
    } catch (error: any) {
      const errorMessage = error.message || 'An unexpected error occurred';
      set({ isLoading: false, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  },

  /**
   * Sign out current user
   */
  logout: async () => {
    set({ isLoading: true, error: null });

    try {
      const { error } = await signOut();

      if (error) {
        set({ isLoading: false, error: error.message });
        return;
      }

      set({
        user: null,
        session: null,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      set({ isLoading: false, error: error.message || 'An unexpected error occurred' });
    }
  },

  /**
   * Clear error message
   */
  clearError: () => {
    set({ error: null });
  },
}));

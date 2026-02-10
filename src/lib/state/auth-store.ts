import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { signIn, signUp, signOut, getSession, onAuthStateChange } from '../auth';
import { signInWithApple as appleSignIn } from '../apple-auth';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  _authSubscription: { unsubscribe: () => void } | null;
  
  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, name?: string) => Promise<{ success: boolean; error?: string }>;
  signInWithApple: () => Promise<{ success: boolean; isNewUser: boolean; cancelled?: boolean; error?: string }>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: false,
  isInitialized: false,
  error: null,
  _authSubscription: null,

  /**
   * Initialize auth state and set up listener.
   * Handles offline gracefully: if getSession fails with a network error,
   * we still mark as initialized so the app can show cached data.
   */
  initialize: async () => {
    try {
      // Get current session
      const { session, error } = await getSession();
      
      if (error) {
        console.error('Error getting session:', error);
        // If we have a persisted session from Supabase's SecureStore,
        // the auth state listener below will pick it up.
        // Mark as initialized so the app doesn't hang on the splash screen.
        set({ isInitialized: true, isLoading: false });

        // Attempt a session refresh in case the token is expired
        // This will silently fail if offline (which is fine)
        const { supabase: supabaseClient } = await import('../supabase');
        supabaseClient.auth.refreshSession().catch(() => {
          // Silent failure — if offline, we'll retry when back online
          console.log('[Auth] Session refresh failed during init (likely offline)');
        });
        return;
      }

      set({
        session,
        user: session?.user ?? null,
        isInitialized: true,
        isLoading: false,
      });

      // Set up auth state listener (only once — prevent duplicate subscriptions)
      if (!get()._authSubscription) {
        const { data: subscription } = onAuthStateChange((event, session) => {
          console.log('Auth state changed:', event);
          set({
            session,
            user: session?.user ?? null,
          });
        });
        set({ _authSubscription: subscription?.subscription ?? null });
      }
    } catch (error: any) {
      console.error('Error initializing auth:', error);
      // Even on error, mark as initialized so the app can proceed
      // with cached data if available
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
   * Sign in with Apple (native iOS)
   */
  signInWithApple: async () => {
    set({ isLoading: true, error: null });

    try {
      const { user, session, error, isNewUser } = await appleSignIn();

      // User cancelled — not an error, just return silently
      if (!user && !session && !error) {
        set({ isLoading: false });
        return { success: false, isNewUser: false, cancelled: true };
      }

      if (error) {
        set({ isLoading: false, error: error.message });
        return { success: false, isNewUser: false, error: error.message };
      }

      set({
        user,
        session,
        isLoading: false,
        error: null,
      });

      return { success: true, isNewUser };
    } catch (error: any) {
      const errorMessage = error.message || 'Apple Sign-In failed';
      set({ isLoading: false, error: errorMessage });
      return { success: false, isNewUser: false, error: errorMessage };
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

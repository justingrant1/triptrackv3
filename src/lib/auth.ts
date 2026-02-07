import { supabase } from './supabase';
import type { User, Session } from '@supabase/supabase-js';

export interface AuthError {
  message: string;
  status?: number;
}

export interface AuthResponse {
  user: User | null;
  session: Session | null;
  error: AuthError | null;
}

/**
 * Sign up a new user with email and password
 */
export async function signUp(email: string, password: string, name?: string): Promise<AuthResponse> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || email.split('@')[0], // Use email prefix as default name
        },
      },
    });

    if (error) {
      return {
        user: null,
        session: null,
        error: { message: error.message, status: error.status },
      };
    }

    return {
      user: data.user,
      session: data.session,
      error: null,
    };
  } catch (error: any) {
    return {
      user: null,
      session: null,
      error: { message: error.message || 'An unexpected error occurred' },
    };
  }
}

/**
 * Sign in an existing user with email and password
 */
export async function signIn(email: string, password: string): Promise<AuthResponse> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return {
        user: null,
        session: null,
        error: { message: error.message, status: error.status },
      };
    }

    return {
      user: data.user,
      session: data.session,
      error: null,
    };
  } catch (error: any) {
    return {
      user: null,
      session: null,
      error: { message: error.message || 'An unexpected error occurred' },
    };
  }
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<{ error: AuthError | null }> {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return { error: { message: error.message, status: error.status } };
    }

    return { error: null };
  } catch (error: any) {
    return { error: { message: error.message || 'An unexpected error occurred' } };
  }
}

/**
 * Get the current session
 */
export async function getSession(): Promise<{ session: Session | null; error: AuthError | null }> {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      return { session: null, error: { message: error.message, status: error.status } };
    }

    return { session: data.session, error: null };
  } catch (error: any) {
    return { session: null, error: { message: error.message || 'An unexpected error occurred' } };
  }
}

/**
 * Get the current user
 */
export async function getCurrentUser(): Promise<{ user: User | null; error: AuthError | null }> {
  try {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      return { user: null, error: { message: error.message, status: error.status } };
    }

    return { user: data.user, error: null };
  } catch (error: any) {
    return { user: null, error: { message: error.message || 'An unexpected error occurred' } };
  }
}

/**
 * Send password reset email
 */
export async function resetPassword(email: string): Promise<{ error: AuthError | null }> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'triptrack://reset-password', // Deep link for mobile
    });

    if (error) {
      return { error: { message: error.message, status: error.status } };
    }

    return { error: null };
  } catch (error: any) {
    return { error: { message: error.message || 'An unexpected error occurred' } };
  }
}

/**
 * Update user password
 */
export async function updatePassword(newPassword: string): Promise<{ error: AuthError | null }> {
  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return { error: { message: error.message, status: error.status } };
    }

    return { error: null };
  } catch (error: any) {
    return { error: { message: error.message || 'An unexpected error occurred' } };
  }
}

/**
 * Delete the current user account
 * WARNING: This will permanently delete the user and all associated data
 */
export async function deleteAccount(): Promise<{ error: AuthError | null }> {
  try {
    // First, get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { error: { message: 'No authenticated user found' } };
    }

    // Delete the user account (this will cascade delete all related data due to RLS policies)
    const { error } = await supabase.rpc('delete_user');

    if (error) {
      // If RPC doesn't exist, try the admin API approach
      // Note: This requires the user to be authenticated
      const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
      
      if (deleteError) {
        return { error: { message: deleteError.message } };
      }
    }

    // Sign out after deletion
    await supabase.auth.signOut();

    return { error: null };
  } catch (error: any) {
    return { error: { message: error.message || 'Failed to delete account' } };
  }
}

/**
 * Listen to auth state changes
 */
export function onAuthStateChange(callback: (event: string, session: Session | null) => void) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

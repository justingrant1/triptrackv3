import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import type { User, Session } from '@supabase/supabase-js';

export interface AppleAuthResponse {
  user: User | null;
  session: Session | null;
  error: { message: string } | null;
  isNewUser: boolean;
}

/**
 * Check if Apple Sign-In is available on this device.
 * Only available on iOS 13+ — returns false on Android and web.
 */
export function isAppleSignInAvailable(): boolean {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync !== undefined;
}

/**
 * Perform native Apple Sign-In and authenticate with Supabase.
 *
 * Flow:
 * 1. Generate a random nonce and hash it with SHA-256
 * 2. Present the native Apple sign-in sheet with the hashed nonce
 * 3. Apple returns an identity token (JWT) containing the hashed nonce
 * 4. Send the raw nonce + identity token to Supabase via signInWithIdToken
 * 5. Supabase verifies the token with Apple and creates/signs in the user
 */
export async function signInWithApple(): Promise<AppleAuthResponse> {
  try {
    // 1. Generate a cryptographically secure random nonce
    const rawNonce = Crypto.randomUUID();

    // 2. Hash the nonce with SHA-256 (Apple requires the hashed version)
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce
    );

    // 3. Present the native Apple sign-in sheet
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    // 4. Ensure we got an identity token
    if (!credential.identityToken) {
      return {
        user: null,
        session: null,
        error: { message: 'No identity token received from Apple' },
        isNewUser: false,
      };
    }

    // 5. Sign in with Supabase using the Apple ID token
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce, // Supabase needs the raw nonce to verify against the hashed one in the JWT
    });

    if (error) {
      return {
        user: null,
        session: null,
        error: { message: error.message },
        isNewUser: false,
      };
    }

    // 6. Detect new user by checking if the account was just created (within last 30s)
    // Apple only provides the user's name on the very first authorization for this app,
    // so we can't rely on fullName alone — if the user re-authorizes or hid their email,
    // fullName will be null even for a brand new Supabase account.
    const fullName = credential.fullName;
    const createdAt = data.user?.created_at ? new Date(data.user.created_at).getTime() : 0;
    const isNewUser = (Date.now() - createdAt) < 30000; // Created within last 30 seconds

    if (isNewUser && data.user) {
      const displayName = [fullName?.givenName, fullName?.familyName]
        .filter(Boolean)
        .join(' ');

      if (displayName) {
        // Update user metadata with the name from Apple
        await supabase.auth.updateUser({
          data: { name: displayName },
        });

        // Also update the profile table if it exists
        await supabase
          .from('profiles')
          .update({ name: displayName })
          .eq('id', data.user.id)
          .single();
      }
    }

    return {
      user: data.user,
      session: data.session,
      error: null,
      isNewUser,
    };
  } catch (error: any) {
    // Handle user cancellation gracefully
    if (error.code === 'ERR_REQUEST_CANCELED') {
      return {
        user: null,
        session: null,
        error: null, // Not an error — user just cancelled
        isNewUser: false,
      };
    }

    return {
      user: null,
      session: null,
      error: { message: error.message || 'Apple Sign-In failed' },
      isNewUser: false,
    };
  }
}

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

// Enable web browser to dismiss properly on iOS
WebBrowser.maybeCompleteAuthSession();

// Google OAuth configuration
// These will be set up in Google Cloud Console
const GOOGLE_CLIENT_ID_IOS = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS || '';
const GOOGLE_CLIENT_ID_ANDROID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID || '';
const GOOGLE_CLIENT_ID_WEB = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB || '';

// Gmail API scope - read-only access to Gmail
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

// OAuth endpoints
const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

/**
 * Get the appropriate Google Client ID for the current platform
 */
function getClientId(): string {
  if (Platform.OS === 'ios') {
    return GOOGLE_CLIENT_ID_IOS;
  } else if (Platform.OS === 'android') {
    return GOOGLE_CLIENT_ID_ANDROID;
  } else {
    return GOOGLE_CLIENT_ID_WEB;
  }
}

/**
 * Get the redirect URI scheme for OAuth
 * For iOS: Use reversed client ID (required by Google)
 * For Android: Use reversed client ID
 * For Web: Use custom scheme
 */
function getRedirectScheme(): string {
  if (Platform.OS === 'ios') {
    // Reverse the iOS client ID to create the scheme
    // e.g., "970308936264-ujmm0seople04r8s0vgo018a5f2hj4cn.apps.googleusercontent.com"
    // becomes "com.googleusercontent.apps.970308936264-ujmm0seople04r8s0vgo018a5f2hj4cn"
    const clientId = GOOGLE_CLIENT_ID_IOS;
    const parts = clientId.split('.');
    return parts.reverse().join('.');
  } else if (Platform.OS === 'android') {
    // Android also uses reversed client ID
    const clientId = GOOGLE_CLIENT_ID_ANDROID;
    const parts = clientId.split('.');
    return parts.reverse().join('.');
  } else {
    // Web/Expo Go uses custom scheme
    return 'triptrack';
  }
}

/**
 * Create an OAuth request configuration
 */
export function useGoogleAuthRequest() {
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: getRedirectScheme(),
    path: 'oauth/callback',
  });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: getClientId(),
      scopes: GMAIL_SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      // Prompt user to select account every time
      extraParams: {
        access_type: 'offline', // Request refresh token
        prompt: 'consent', // Force consent screen to get refresh token
      },
    },
    discovery
  );

  return { request, response, promptAsync, redirectUri };
}

/**
 * Exchange authorization code for access token and refresh token
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  codeVerifier?: string
): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  email: string;
  error?: string;
}> {
  try {
    const clientId = getClientId();

    const tokenResponse = await fetch(discovery.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        ...(codeVerifier && { code_verifier: codeVerifier }),
      }).toString(),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }

    // Get user email from Google
    const userInfoResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      }
    );

    const userInfo = await userInfoResponse.json();

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      expiresIn: tokenData.expires_in,
      email: userInfo.email,
    };
  } catch (error: any) {
    console.error('Error exchanging code for tokens:', error);
    return {
      accessToken: '',
      refreshToken: null,
      expiresIn: 0,
      email: '',
      error: error.message || 'Failed to exchange authorization code',
    };
  }
}

/**
 * Refresh an expired access token using a refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
  error?: string;
}> {
  try {
    const clientId = getClientId();

    const tokenResponse = await fetch(discovery.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        grant_type: 'refresh_token',
      }).toString(),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }

    return {
      accessToken: tokenData.access_token,
      expiresIn: tokenData.expires_in,
    };
  } catch (error: any) {
    console.error('Error refreshing access token:', error);
    return {
      accessToken: '',
      expiresIn: 0,
      error: error.message || 'Failed to refresh access token',
    };
  }
}

/**
 * Revoke access token (disconnect account)
 */
export async function revokeToken(token: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${discovery.revocationEndpoint}?token=${token}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to revoke token');
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error revoking token:', error);
    return {
      success: false,
      error: error.message || 'Failed to revoke token',
    };
  }
}

/**
 * Search Gmail for travel-related emails
 * This will be called from the Supabase Edge Function
 */
export async function searchGmailForTravelEmails(
  accessToken: string,
  maxResults: number = 50
): Promise<{
  messages: Array<{ id: string; threadId: string }>;
  error?: string;
}> {
  try {
    // Search query for common travel email senders
    const query = [
      'from:(airlines.com OR booking.com OR expedia.com OR hotels.com OR airbnb.com OR uber.com OR lyft.com OR hertz.com OR enterprise.com OR amtrak.com OR delta.com OR united.com OR american.com OR southwest.com)',
      'OR subject:(confirmation OR booking OR reservation OR itinerary OR ticket OR boarding)',
    ].join(' ');

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || 'Failed to search Gmail');
    }

    return {
      messages: data.messages || [],
    };
  } catch (error: any) {
    console.error('Error searching Gmail:', error);
    return {
      messages: [],
      error: error.message || 'Failed to search Gmail',
    };
  }
}

/**
 * Get full email content by message ID
 */
export async function getGmailMessage(
  accessToken: string,
  messageId: string
): Promise<{
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  body: string;
  error?: string;
}> {
  try {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || 'Failed to get message');
    }

    // Extract headers
    const headers = data.payload.headers;
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const date = headers.find((h: any) => h.name === 'Date')?.value || '';

    // Extract body (handle both plain text and HTML)
    let body = '';
    if (data.payload.body.data) {
      body = Buffer.from(data.payload.body.data, 'base64').toString('utf-8');
    } else if (data.payload.parts) {
      // Multi-part message
      const textPart = data.payload.parts.find(
        (part: any) => part.mimeType === 'text/plain' || part.mimeType === 'text/html'
      );
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
    }

    return {
      id: data.id,
      threadId: data.threadId,
      subject,
      from,
      date,
      body,
    };
  } catch (error: any) {
    console.error('Error getting Gmail message:', error);
    return {
      id: '',
      threadId: '',
      subject: '',
      from: '',
      date: '',
      body: '',
      error: error.message || 'Failed to get message',
    };
  }
}

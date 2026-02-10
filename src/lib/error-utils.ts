/**
 * Centralized error classification for offline-first behavior.
 * Distinguishes network errors (show cached data) from auth errors (trigger re-auth).
 */

/**
 * Returns true if the error is a network connectivity issue
 * (device offline, DNS failure, timeout, etc.)
 */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false;

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);

  const networkPatterns = [
    'Network request failed',
    'Failed to fetch',
    'NetworkError',
    'net::ERR_',
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'ETIMEDOUT',
    'timeout',
    'AbortError',
    'The Internet connection appears to be offline',
    'A server with the specified hostname could not be found',
    'The network connection was lost',
  ];

  return networkPatterns.some((pattern) =>
    message.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Returns true if the error is an authentication / authorization issue
 * (expired JWT, invalid refresh token, 401/403, etc.)
 */
export function isAuthError(error: unknown): boolean {
  if (!error) return false;

  // Check for HTTP status codes on the error object
  if (typeof error === 'object' && error !== null) {
    const statusCode =
      'status' in error ? (error as { status: unknown }).status :
      'statusCode' in error ? (error as { statusCode: unknown }).statusCode :
      'code' in error ? (error as { code: unknown }).code :
      undefined;

    if (statusCode === 401 || statusCode === 403) return true;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);

  const authPatterns = [
    'JWT expired',
    'Invalid Refresh Token',
    'Refresh Token Not Found',
    'invalid claim',
    'token is expired',
    'not authenticated',
    'invalid_grant',
    'Auth session missing',
    'session_not_found',
  ];

  return authPatterns.some((pattern) =>
    message.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Safely extract a message string from any error type.
 * Use this instead of `(error as any).message` or `catch (error: any)`.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'An unexpected error occurred';
}

/**
 * Returns a user-friendly error message based on error type
 */
export function getOfflineFriendlyMessage(error: unknown, hasCache: boolean): string {
  if (isNetworkError(error)) {
    return hasCache
      ? "You're offline — showing saved data"
      : "You're offline and there's no saved data yet. Connect to the internet to load your trips.";
  }

  if (isAuthError(error)) {
    return 'Your session has expired. Reconnecting…';
  }

  // Generic fallback
  const message =
    error instanceof Error ? error.message : 'Something went wrong';
  return message;
}

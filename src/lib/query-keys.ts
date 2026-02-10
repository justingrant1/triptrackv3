/**
 * Centralized query key factory for React Query.
 * 
 * Using a factory ensures:
 * - Consistent key structure across all hooks
 * - Easy invalidation of related queries (e.g. invalidate all trip queries)
 * - Type-safe keys with `as const`
 * - Single source of truth — no scattered string tuples
 */

export const queryKeys = {
  // ─── Trips ──────────────────────────────────────────────────────────────────
  trips: {
    all: ['trips'] as const,
    upcoming: ['trips', 'upcoming'] as const,
    detail: (id: string) => ['trips', id] as const,
  },

  // ─── Reservations ──────────────────────────────────────────────────────────
  reservations: {
    all: ['reservations'] as const,
    upcoming: ['reservations', 'upcoming'] as const,
    byTrip: (tripId: string) => ['reservations', tripId] as const,
  },

  // ─── Receipts ──────────────────────────────────────────────────────────────
  receipts: {
    all: ['receipts'] as const,
    byTrip: (tripId: string) => ['receipts', tripId] as const,
  },

  // ─── Profile ───────────────────────────────────────────────────────────────
  profile: {
    current: (userId?: string) => ['profile', userId] as const,
    forwardingAddress: (userId?: string) => ['forwarding-address', userId] as const,
  },

  // ─── Notifications ─────────────────────────────────────────────────────────
  notifications: {
    all: ['notifications'] as const,
    unreadCount: ['notifications', 'unread-count'] as const,
    preferences: (userId?: string) => ['notification-preferences', userId] as const,
  },

  // ─── Connected Accounts ────────────────────────────────────────────────────
  connectedAccounts: {
    all: ['connected-accounts'] as const,
  },

  // ─── Trusted Emails ────────────────────────────────────────────────────────
  trustedEmails: {
    all: ['trusted-emails'] as const,
  },

  // ─── Weather ───────────────────────────────────────────────────────────────
  weather: {
    byLocation: (location?: string) => ['weather', location] as const,
  },

  // ─── Flight Status ─────────────────────────────────────────────────────────
  flightStatus: {
    byTrip: (tripId: string) => ['flight-status', tripId] as const,
  },

  // ─── Subscription / AI Usage ───────────────────────────────────────────────
  subscription: {
    current: ['subscription'] as const,
    aiMessagesToday: ['ai-messages-today'] as const,
  },

  // ─── Chat ──────────────────────────────────────────────────────────────────
  chat: {
    messages: ['chat-messages'] as const,
  },
} as const;

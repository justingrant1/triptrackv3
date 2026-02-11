/**
 * Chat hooks for AI Concierge
 * Manages conversation history with AsyncStorage persistence
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createChatCompletion, createStreamingChatCompletion, ChatMessage } from '@/lib/openai';
import { useTrips } from './useTrips';
import { useAllReceipts } from './useReceipts';
import { useAuthStore } from '@/lib/state/auth-store';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import type { Reservation, ReceiptWithTrip } from '@/lib/types/database';

const CHAT_STORAGE_KEY_PREFIX = 'triptrack_chat_history_';
const MAX_PERSISTED_MESSAGES = 50; // Keep last 50 messages to avoid storage bloat

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/** Serializable version for AsyncStorage */
interface PersistedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO string
}

/**
 * Hook for managing chat conversations with AI.
 * Messages are persisted to AsyncStorage so they survive modal close / app restart.
 */
export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Get current user for scoped storage
  const { user } = useAuthStore();
  const storageKey = `${CHAT_STORAGE_KEY_PREFIX}${user?.id ?? 'anonymous'}`;

  // Get ALL user data for AI context — no limits
  const { data: trips = [] } = useTrips();
  const { data: allReceipts = [] } = useAllReceipts();

  // Fetch ALL reservations across all trips in one query
  const { data: allReservations = [] } = useQuery({
    queryKey: ['reservations', 'all-for-chat'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .order('start_time', { ascending: true });
      if (error) throw error;
      return data as Reservation[];
    },
  });

  // ─── Persistence ──────────────────────────────────────────────────────────

  /** Load messages from AsyncStorage on mount and when user changes */
  useEffect(() => {
    let cancelled = false;

    // Reset state for new user
    setMessages([]);
    setIsHydrated(false);

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (cancelled) return;
        if (raw) {
          const persisted: PersistedMessage[] = JSON.parse(raw);
          const hydrated: Message[] = persisted.map((m) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          }));
          setMessages(hydrated);
        }
      } catch (err) {
        console.warn('Failed to load chat history:', err);
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  /** Save messages to AsyncStorage whenever they change (after hydration) */
  useEffect(() => {
    if (!isHydrated) return;

    const persist = async () => {
      try {
        const toSave: PersistedMessage[] = messages
          .slice(-MAX_PERSISTED_MESSAGES)
          .map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp.toISOString(),
          }));
        await AsyncStorage.setItem(storageKey, JSON.stringify(toSave));
      } catch (err) {
        console.warn('Failed to save chat history:', err);
      }
    };

    persist();
  }, [messages, isHydrated, storageKey]);

  // ─── System Prompt ────────────────────────────────────────────────────────

  // Group reservations by trip_id for efficient lookup
  const reservationsByTrip = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const res of allReservations) {
      const list = map.get(res.trip_id) || [];
      list.push(res);
      map.set(res.trip_id, list);
    }
    return map;
  }, [allReservations]);

  // Group receipts by trip_id
  const receiptsByTrip = useMemo(() => {
    const map = new Map<string, ReceiptWithTrip[]>();
    for (const receipt of allReceipts) {
      const list = map.get(receipt.trip_id) || [];
      list.push(receipt);
      map.set(receipt.trip_id, list);
    }
    return map;
  }, [allReceipts]);

  /**
   * Build a comprehensive system prompt with ALL user data.
   * Includes today's date, all trips sorted chronologically,
   * all reservations per trip, and all expenses.
   */
  const buildSystemPrompt = useCallback((): string => {
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const typeEmoji: Record<string, string> = {
      flight: '✈️',
      hotel: '🏨',
      car: '🚗',
      train: '🚆',
      cruise: '🚢',
      meeting: '📅',
      event: '🎫',
      other: '📌',
    };

    let prompt = `You are a helpful travel concierge assistant for TripTrack. You help users with their trips, reservations, travel plans, and expenses.

Today is ${todayStr}.

Be concise, friendly, and helpful. Use emojis occasionally. When the user asks about "next" flights/trips, use today's date to determine the chronologically next one. Always give specific dates, times, and confirmation numbers when available.

IMPORTANT: At the end of EVERY response, include exactly 3 follow-up question suggestions the user might want to ask next. Format them like this:
[SUGGESTIONS]
First suggested question here
Second suggested question here
Third suggested question here
[/SUGGESTIONS]
Make the suggestions contextual and relevant to what was just discussed. Keep them short (under 40 chars each). Never repeat a suggestion the user already asked.

`;

    if (trips.length === 0) {
      prompt += `The user hasn't added any trips yet. Encourage them to connect their Gmail account to auto-import trips, forward travel confirmation emails, or manually add trips.\n`;
      return prompt;
    }

    // Sort trips by start_date ascending (soonest first)
    const sortedTrips = [...trips].sort(
      (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    );

    // Classify trips
    const todayDate = now.toISOString().split('T')[0];
    const upcomingTrips = sortedTrips.filter((t) => t.start_date >= todayDate || (t.start_date <= todayDate && t.end_date >= todayDate));
    const pastTrips = sortedTrips.filter((t) => t.end_date < todayDate);

    prompt += `═══ USER'S TRIPS (${trips.length} total) ═══\n\n`;

    // Show upcoming/active trips first with full detail
    if (upcomingTrips.length > 0) {
      prompt += `── UPCOMING & ACTIVE TRIPS ──\n`;
      for (const trip of upcomingTrips) {
        const isActive = trip.start_date <= todayDate && trip.end_date >= todayDate;
        const status = isActive ? '🟢 ACTIVE NOW' : '📅 Upcoming';
        prompt += `\n${trip.name} — ${trip.destination}\n`;
        prompt += `  ${status} | ${trip.start_date} to ${trip.end_date}\n`;

        // Add all reservations for this trip
        const tripReservations = reservationsByTrip.get(trip.id) || [];
        if (tripReservations.length > 0) {
          prompt += `  Reservations (${tripReservations.length}):\n`;
          for (const res of tripReservations) {
            const emoji = typeEmoji[res.type] || '📌';
            const startDt = new Date(res.start_time);
            const dateStr = startDt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const timeStr = startDt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            prompt += `    ${emoji} ${res.title}`;
            if (res.subtitle) prompt += ` (${res.subtitle})`;
            prompt += ` — ${dateStr} ${timeStr}`;
            if (res.status === 'cancelled') prompt += ' [CANCELLED]';
            prompt += '\n';
            if (res.confirmation_number) prompt += `       Conf: ${res.confirmation_number}\n`;
            if (res.location) prompt += `       Location: ${res.location}\n`;
            // Include key details for flights
            if (res.type === 'flight' && res.details) {
              const d = res.details as Record<string, any>;
              if (d['Departure Airport'] && d['Arrival Airport']) {
                prompt += `       Route: ${d['Departure Airport']} → ${d['Arrival Airport']}\n`;
              }
              if (d['Flight Number']) prompt += `       Flight: ${d['Flight Number']}\n`;
              if (d['Seat']) prompt += `       Seat: ${d['Seat']}\n`;
              if (d['Gate']) prompt += `       Gate: ${d['Gate']}\n`;
            }
            if (res.end_time) {
              const endDt = new Date(res.end_time);
              const endDateStr = endDt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const endTimeStr = endDt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
              prompt += `       Ends: ${endDateStr} ${endTimeStr}\n`;
            }
          }
        }

        // Add expenses for this trip
        const tripReceipts = receiptsByTrip.get(trip.id) || [];
        if (tripReceipts.length > 0) {
          const total = tripReceipts.reduce((sum, r) => sum + r.amount, 0);
          const currency = tripReceipts[0]?.currency || 'USD';
          const byCategory: Record<string, number> = {};
          for (const r of tripReceipts) {
            byCategory[r.category] = (byCategory[r.category] || 0) + r.amount;
          }
          prompt += `  Expenses: ${currency} ${total.toFixed(2)} total (${tripReceipts.length} receipts)\n`;
          const catParts = Object.entries(byCategory).map(([cat, amt]) => `${cat}: ${amt.toFixed(2)}`);
          if (catParts.length > 0) prompt += `    Breakdown: ${catParts.join(', ')}\n`;
        }
      }
    }

    // Show past trips with less detail
    if (pastTrips.length > 0) {
      prompt += `\n── PAST TRIPS ──\n`;
      for (const trip of pastTrips) {
        const tripReceipts = receiptsByTrip.get(trip.id) || [];
        const tripReservations = reservationsByTrip.get(trip.id) || [];
        const total = tripReceipts.reduce((sum, r) => sum + r.amount, 0);
        prompt += `  ${trip.name} — ${trip.destination} (${trip.start_date} to ${trip.end_date})`;
        prompt += ` | ${tripReservations.length} reservations`;
        if (total > 0) prompt += ` | $${total.toFixed(2)} spent`;
        prompt += '\n';
      }
    }

    // Overall expense summary
    if (allReceipts.length > 0) {
      const grandTotal = allReceipts.reduce((sum, r) => sum + r.amount, 0);
      prompt += `\n═══ EXPENSE SUMMARY ═══\n`;
      prompt += `Total across all trips: $${grandTotal.toFixed(2)} (${allReceipts.length} receipts)\n`;
    }

    return prompt;
  }, [trips, allReservations, allReceipts, reservationsByTrip, receiptsByTrip]);

  // ─── Send Message ─────────────────────────────────────────────────────────

  /**
   * Send a message and get AI response (non-streaming)
   */
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    setIsLoading(true);
    setError(null);

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);

    try {
      // Build messages array for API
      const apiMessages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt() },
        ...messages.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        { role: 'user', content: content.trim() },
      ];

      // Get AI response
      const response = await createChatCompletion({
        messages: apiMessages,
        temperature: 0.7,
        maxTokens: 1000,
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.choices[0].message.content,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to get response from AI';
      setError(message);
      console.error('Chat error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [messages, buildSystemPrompt]);

  /**
   * Send a message and get streaming AI response
   */
  const sendMessageStreaming = useCallback(async (content: string) => {
    if (!content.trim()) return;

    setIsLoading(true);
    setError(null);
    setSuggestions([]); // Clear previous suggestions

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);

    // Create placeholder for assistant message
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, assistantMessage]);

    try {
      // Build messages array for API
      const apiMessages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt() },
        ...messages.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        { role: 'user', content: content.trim() },
      ];

      // Stream AI response
      const stream = createStreamingChatCompletion({
        messages: apiMessages,
        temperature: 0.7,
        maxTokens: 1000,
      });

      let fullContent = '';
      for await (const chunk of stream) {
        fullContent += chunk;
        // Strip suggestions block from displayed content during streaming
        const displayContent = fullContent.replace(/\[SUGGESTIONS\][\s\S]*?(\[\/SUGGESTIONS\])?$/, '').trim();
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: displayContent }
              : msg
          )
        );
      }

      // Parse and extract suggestions from the final content
      const suggestionsMatch = fullContent.match(/\[SUGGESTIONS\]([\s\S]*?)\[\/SUGGESTIONS\]/);
      if (suggestionsMatch) {
        const parsed = suggestionsMatch[1]
          .split('\n')
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0);
        setSuggestions(parsed.slice(0, 3));

        // Update the stored message to not include the suggestions block
        const cleanContent = fullContent.replace(/\[SUGGESTIONS\][\s\S]*?\[\/SUGGESTIONS\]/, '').trim();
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: cleanContent }
              : msg
          )
        );
      } else {
        setSuggestions([]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to get response from AI';
      setError(message);
      console.error('Chat error:', err);
      
      // Remove the placeholder message on error
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessageId));
    } finally {
      setIsLoading(false);
    }
  }, [messages, buildSystemPrompt]);

  /**
   * Clear conversation history (both in-memory and persisted)
   */
  const clearMessages = useCallback(async () => {
    setMessages([]);
    setError(null);
    setSuggestions([]);
    try {
      await AsyncStorage.removeItem(storageKey);
    } catch (err) {
      console.warn('Failed to clear chat history:', err);
    }
  }, [storageKey]);

  return {
    messages,
    isLoading,
    isHydrated,
    error,
    suggestions,
    sendMessage,
    sendMessageStreaming,
    clearMessages,
  };
}

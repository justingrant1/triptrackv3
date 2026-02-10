/**
 * Chat hooks for AI Concierge
 * Manages conversation history with AsyncStorage persistence
 */

import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createChatCompletion, createStreamingChatCompletion, ChatMessage } from '@/lib/openai';
import { useTrips } from './useTrips';
import { useUpcomingReservations } from './useReservations';
import { useAuthStore } from '@/lib/state/auth-store';

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

  // Get current user for scoped storage
  const { user } = useAuthStore();
  const storageKey = `${CHAT_STORAGE_KEY_PREFIX}${user?.id ?? 'anonymous'}`;

  // Get user's trip context for AI
  const { data: trips = [] } = useTrips();
  const { data: upcomingReservations = [] } = useUpcomingReservations();

  // ─── Persistence ──────────────────────────────────────────────────────────

  // Clear messages when user changes (logout/login)
  useEffect(() => {
    setMessages([]);
    setIsHydrated(false);
  }, [user?.id]);

  /** Load messages from AsyncStorage on mount / user change */
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
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
        setIsHydrated(true);
      }
    })();
  }, []);

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
  }, [messages, isHydrated]);

  // ─── System Prompt ────────────────────────────────────────────────────────

  /**
   * Build system prompt with user's trip context
   */
  const buildSystemPrompt = useCallback((): string => {
    let prompt = `You are a helpful travel concierge assistant for TripTrack. You help users with their trips, reservations, and travel plans.

Be concise, friendly, and helpful. Use emojis occasionally to make responses more engaging.

`;

    // Add trip context if available
    if (trips.length > 0) {
      prompt += `\nThe user has ${trips.length} trip(s):\n`;
      trips.slice(0, 3).forEach((trip) => {
        prompt += `- ${trip.name} to ${trip.destination} (${new Date(trip.start_date).toLocaleDateString()} - ${new Date(trip.end_date).toLocaleDateString()})\n`;
      });
    }

    // Add upcoming reservations context
    if (upcomingReservations.length > 0) {
      prompt += `\nUpcoming reservations:\n`;
      upcomingReservations.slice(0, 5).forEach((res) => {
        prompt += `- ${res.type}: ${res.title}${res.subtitle ? ` (${res.subtitle})` : ''} at ${new Date(res.start_time).toLocaleString()}\n`;
        if (res.confirmation_number) {
          prompt += `  Confirmation: ${res.confirmation_number}\n`;
        }
      });
    }

    if (trips.length === 0) {
      prompt += `\nThe user hasn't added any trips yet. Encourage them to forward travel confirmation emails or manually add trips.`;
    }

    return prompt;
  }, [trips, upcomingReservations]);

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
        maxTokens: 500,
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
        maxTokens: 500,
      });

      let fullContent = '';
      for await (const chunk of stream) {
        fullContent += chunk;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: fullContent }
              : msg
          )
        );
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
    try {
      await AsyncStorage.removeItem(storageKey);
    } catch (err) {
      console.warn('Failed to clear chat history:', err);
    }
  }, []);

  return {
    messages,
    isLoading,
    isHydrated,
    error,
    sendMessage,
    sendMessageStreaming,
    clearMessages,
  };
}

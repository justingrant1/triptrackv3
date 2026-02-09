import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

const CACHE_KEY = 'TRIPTRACK_QUERY_CACHE';

/**
 * AsyncStorage-based persister for React Query.
 * Saves the entire query cache to disk so it survives app restarts
 * and is available immediately when the app opens offline.
 */
export function createAsyncStoragePersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        const serialized = JSON.stringify(client);
        await AsyncStorage.setItem(CACHE_KEY, serialized);
      } catch (error) {
        console.warn('[QueryPersister] Failed to persist cache:', error);
      }
    },
    restoreClient: async (): Promise<PersistedClient | undefined> => {
      try {
        const serialized = await AsyncStorage.getItem(CACHE_KEY);
        if (!serialized) return undefined;
        return JSON.parse(serialized) as PersistedClient;
      } catch (error) {
        console.warn('[QueryPersister] Failed to restore cache:', error);
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        await AsyncStorage.removeItem(CACHE_KEY);
      } catch (error) {
        console.warn('[QueryPersister] Failed to remove cache:', error);
      }
    },
  };
}

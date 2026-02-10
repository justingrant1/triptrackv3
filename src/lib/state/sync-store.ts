import { create } from 'zustand';

/**
 * Global sync state store.
 * Tracks whether a Gmail sync is in progress so the UI stays accurate
 * even when the user navigates away from the Connected Accounts screen.
 */
interface SyncState {
  isSyncing: boolean;
  syncAccountId: string | null;
  startSync: (accountId: string) => void;
  finishSync: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  isSyncing: false,
  syncAccountId: null,

  startSync: (accountId: string) => {
    set({ isSyncing: true, syncAccountId: accountId });
  },

  finishSync: () => {
    set({ isSyncing: false, syncAccountId: null });
  },
}));

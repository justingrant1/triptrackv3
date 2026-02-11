import { create } from 'zustand';

/**
 * Progress phases shown to the user during Gmail sync.
 * Each phase has a message and the delay (in ms) before advancing to the next.
 */
const SYNC_PHASES = [
  { message: 'Connecting to Gmail...', delay: 3000 },
  { message: 'Scanning your inbox...', delay: 7000 },
  { message: 'Processing travel emails...', delay: 20000 },
  { message: 'Checking for new trips...', delay: 30000 },
  { message: 'Almost done...', delay: 0 }, // stays here until sync finishes
] as const;

/** Maximum time (ms) before auto-resetting isSyncing to prevent stuck UI */
const MAX_SYNC_DURATION_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Global sync state store.
 * Tracks whether a Gmail sync is in progress so the UI stays accurate
 * even when the user navigates away from the Connected Accounts screen.
 *
 * Includes animated progress phases so the user sees visual movement
 * and a safety auto-reset to prevent the UI from getting stuck forever.
 */
interface SyncState {
  isSyncing: boolean;
  syncAccountId: string | null;
  /** Current user-facing status message */
  statusMessage: string;
  /** Index into SYNC_PHASES */
  phaseIndex: number;
  startSync: (accountId: string) => void;
  finishSync: () => void;
}

// Timer handles stored outside Zustand to avoid serialization issues
let _phaseTimer: ReturnType<typeof setTimeout> | null = null;
let _safetyTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers() {
  if (_phaseTimer) {
    clearTimeout(_phaseTimer);
    _phaseTimer = null;
  }
  if (_safetyTimer) {
    clearTimeout(_safetyTimer);
    _safetyTimer = null;
  }
}

/** Schedule the next phase transition */
function scheduleNextPhase() {
  const { phaseIndex, isSyncing } = useSyncStore.getState();
  if (!isSyncing) return;

  const phase = SYNC_PHASES[phaseIndex];
  if (!phase || phase.delay === 0) return; // last phase — stay here

  const nextIndex = phaseIndex + 1;
  if (nextIndex >= SYNC_PHASES.length) return;

  _phaseTimer = setTimeout(() => {
    const current = useSyncStore.getState();
    if (!current.isSyncing) return; // sync finished while waiting

    useSyncStore.setState({
      phaseIndex: nextIndex,
      statusMessage: SYNC_PHASES[nextIndex].message,
    });

    // Schedule the phase after that
    scheduleNextPhase();
  }, phase.delay);
}

export const useSyncStore = create<SyncState>((set) => ({
  isSyncing: false,
  syncAccountId: null,
  statusMessage: '',
  phaseIndex: 0,

  startSync: (accountId: string) => {
    // Clear any leftover timers from a previous sync
    clearTimers();

    set({
      isSyncing: true,
      syncAccountId: accountId,
      phaseIndex: 0,
      statusMessage: SYNC_PHASES[0].message,
    });

    // Start cycling through progress phases
    scheduleNextPhase();

    // Safety auto-reset: if sync hasn't finished in MAX_SYNC_DURATION_MS, force-reset
    _safetyTimer = setTimeout(() => {
      const current = useSyncStore.getState();
      if (current.isSyncing) {
        console.warn('[SyncStore] Safety auto-reset triggered — sync exceeded max duration');
        current.finishSync();
      }
    }, MAX_SYNC_DURATION_MS);
  },

  finishSync: () => {
    clearTimers();
    set({
      isSyncing: false,
      syncAccountId: null,
      statusMessage: '',
      phaseIndex: 0,
    });
  },
}));

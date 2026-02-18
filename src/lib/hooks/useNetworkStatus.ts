import { useEffect, useState, useRef, useCallback } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

/**
 * Stabilization delay (ms) before reporting offline status.
 * Prevents false "No internet connection" banners during:
 * - App startup (NetInfo warm-up: null → false → true)
 * - Transient network blips
 * - iPad Air / fresh install race conditions
 *
 * Apple Review rejection (Feb 2026) specifically flagged this:
 * "We found an error message displayed no internet connection"
 * on an iPad Air with an active internet connection.
 */
const OFFLINE_STABILIZATION_DELAY_MS = 3000;

/**
 * Hook to monitor network connectivity status.
 *
 * Uses a stabilization delay so the `isOffline` flag only becomes `true`
 * after the device has been continuously offline for OFFLINE_STABILIZATION_DELAY_MS.
 * This avoids false positives from NetInfo's initial reachability check
 * (which can briefly report isInternetReachable = null/false on iOS).
 */
export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isInternetReachable, setIsInternetReachable] = useState<boolean>(true);

  // Stabilized offline flag — only true after sustained offline state
  const [isStabilizedOffline, setIsStabilizedOffline] = useState<boolean>(false);

  // Timer ref for debouncing offline transitions
  const offlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateNetworkState = useCallback((state: NetInfoState) => {
    const connected = state.isConnected ?? true;
    // Treat null (unknown) as reachable — null ≠ offline.
    // NetInfo returns null during its initial reachability probe on iOS.
    const reachable = state.isInternetReachable ?? true;

    setIsConnected(connected);
    setIsInternetReachable(reachable);

    const rawOffline = !connected || !reachable;

    if (rawOffline) {
      // Device appears offline — start stabilization timer.
      // Only flip isStabilizedOffline after the delay to filter out transient blips.
      if (!offlineTimerRef.current) {
        offlineTimerRef.current = setTimeout(() => {
          setIsStabilizedOffline(true);
          offlineTimerRef.current = null;
        }, OFFLINE_STABILIZATION_DELAY_MS);
      }
    } else {
      // Device is online — cancel any pending offline timer and clear flag immediately.
      if (offlineTimerRef.current) {
        clearTimeout(offlineTimerRef.current);
        offlineTimerRef.current = null;
      }
      setIsStabilizedOffline(false);
    }
  }, []);

  useEffect(() => {
    // Get initial state
    NetInfo.fetch().then(updateNetworkState);

    // Subscribe to network state updates
    const unsubscribe = NetInfo.addEventListener(updateNetworkState);

    return () => {
      unsubscribe();
      if (offlineTimerRef.current) {
        clearTimeout(offlineTimerRef.current);
      }
    };
  }, [updateNetworkState]);

  return {
    isConnected,
    isInternetReachable,
    /**
     * Stabilized offline flag.
     * Only true after the device has been continuously offline for 3 seconds.
     * Safe to use for showing UI banners without false positives.
     */
    isOffline: isStabilizedOffline,
    /**
     * Raw (unstabilized) offline flag — true immediately when NetInfo reports offline.
     * Use this for network-aware data fetching logic where you want instant detection,
     * but NOT for user-facing UI like banners or toasts.
     */
    isRawOffline: !isConnected || !isInternetReachable,
  };
}

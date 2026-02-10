/**
 * Centralized haptic feedback utility.
 * 
 * Provides consistent haptic patterns across the app:
 * - tap: Light feedback for button taps, toggles, selections
 * - press: Medium feedback for primary actions, confirmations
 * - heavy: Heavy feedback for destructive actions, major state changes
 * - success: Success notification (e.g. saved, completed)
 * - error: Error notification (e.g. failed, invalid)
 * - warning: Warning notification (e.g. destructive action about to happen)
 * - selection: Ultra-light selection feedback (e.g. picker changes)
 */

import * as Haptics from 'expo-haptics';

export const haptics = {
  /** Light impact — button taps, toggles, navigation */
  tap: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),

  /** Medium impact — primary actions, confirmations, expand/collapse */
  press: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),

  /** Heavy impact — destructive actions, major state changes */
  heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),

  /** Success notification — save complete, action succeeded */
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),

  /** Error notification — action failed, validation error */
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),

  /** Warning notification — about to do something destructive */
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),

  /** Ultra-light selection — picker changes, scroll snaps */
  selection: () => Haptics.selectionAsync(),
} as const;

import type { Reservation } from './types/database';
import type { FlightStatusData, FlightPhase } from './flight-status';

type ReservationType = Reservation['type'];

export const formatTime = (date: Date): string => {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export const formatDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

export const formatDateLong = (date: Date): string => {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
};

export const formatDateRange = (start: Date, end: Date): string => {
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });

  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()}-${end.getDate()}`;
  }
  return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}`;
};

export const getRelativeTime = (date: Date): string => {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  // Past events - don't show "ago", show status
  if (diffMins < 0) {
    return 'Started';
  }

  if (diffMins < 60) return `in ${diffMins}m`;
  if (diffHours < 24) return `in ${diffHours}h`;
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return `in ${diffDays} days`;
  return formatDate(date);
};

// Get detailed countdown for "Next Up" card
export const getCountdown = (date: Date): { label: string; urgent: boolean; minutes: number } => {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;

  if (diffMins < 0) {
    return { label: 'Now', urgent: true, minutes: diffMins };
  }
  if (diffMins < 30) {
    return { label: `${diffMins}m`, urgent: true, minutes: diffMins };
  }
  if (diffMins < 60) {
    return { label: `${diffMins}m`, urgent: false, minutes: diffMins };
  }
  if (hours < 24) {
    return { label: mins > 0 ? `${hours}h ${mins}m` : `${hours}h`, urgent: hours < 2, minutes: diffMins };
  }
  return { label: `${Math.floor(hours / 24)}d ${hours % 24}h`, urgent: false, minutes: diffMins };
};

export const isToday = (date: Date): boolean => {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
};

export const isTomorrow = (date: Date): boolean => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return (
    date.getDate() === tomorrow.getDate() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getFullYear() === tomorrow.getFullYear()
  );
};

// ─── Centralized Reservation Color & Icon Maps ──────────────────────────────
// Single source of truth — import these instead of redefining in each screen.

/** Primary + secondary gradient colors for each reservation type */
export const RESERVATION_COLORS: Record<ReservationType, [string, string]> = {
  flight: ['#3B82F6', '#1D4ED8'],
  hotel: ['#8B5CF6', '#6D28D9'],
  car: ['#10B981', '#047857'],
  train: ['#F59E0B', '#D97706'],
  meeting: ['#EC4899', '#BE185D'],
  event: ['#06B6D4', '#0891B2'],
};

/** Lucide icon name for each reservation type */
export const RESERVATION_ICON_NAMES: Record<ReservationType, string> = {
  flight: 'Plane',
  hotel: 'Building2',
  car: 'Car',
  train: 'Train',
  meeting: 'Users',
  event: 'Ticket',
};

export const getReservationIcon = (type: ReservationType): string => {
  return RESERVATION_ICON_NAMES[type] ?? 'Plane';
};

export const getReservationColor = (type: ReservationType): string => {
  return RESERVATION_COLORS[type]?.[0] ?? '#6B7280';
};

/** Get [primary, secondary] gradient pair for a reservation type */
export const getTypeGradient = (type: ReservationType): [string, string] => {
  return RESERVATION_COLORS[type] ?? ['#6B7280', '#4B5563'];
};

/** Extract airport code from a string like "JFK - John F. Kennedy" → "JFK" */
export const extractAirportCode = (text: string | null | undefined): string | null => {
  if (!text) return null;
  const match = text.match(/\b([A-Z]{3})\b/);
  return match ? match[1] : null;
};

export const formatCurrency = (amount: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const getDaysUntil = (date: Date): number => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
};

// Live status chip for reservations - makes the app feel alive
export type LiveStatus = {
  label: string;
  color: 'green' | 'amber' | 'blue' | 'slate' | 'red';
  pulse?: boolean;
};

export const getLiveStatus = (
  type: ReservationType,
  startTime: Date,
  endTime?: Date,
  status?: string
): LiveStatus | null => {
  const now = new Date();
  const diffMins = Math.floor((startTime.getTime() - now.getTime()) / 60000);
  const diffHours = diffMins / 60;
  const diffDays = diffHours / 24;

  // Handle completed/cancelled
  if (status === 'cancelled') {
    return { label: 'Cancelled', color: 'red' };
  }
  if (status === 'completed') {
    return { label: 'Completed', color: 'slate' };
  }

  // Check if currently happening
  if (endTime) {
    const endDiff = endTime.getTime() - now.getTime();
    if (diffMins <= 0 && endDiff > 0) {
      // Currently in progress
      switch (type) {
        case 'flight':
          return { label: 'In Flight', color: 'blue', pulse: true };
        case 'hotel':
          return { label: 'Checked In', color: 'green' };
        case 'meeting':
          return { label: 'In Progress', color: 'amber', pulse: true };
        case 'event':
          return { label: 'Happening Now', color: 'amber', pulse: true };
        case 'car':
          return { label: 'Active Rental', color: 'green' };
        default:
          return { label: 'In Progress', color: 'blue', pulse: true };
      }
    }
    // Just ended
    if (endDiff <= 0 && endDiff > -30 * 60000) {
      switch (type) {
        case 'flight':
          return { label: 'Landed', color: 'green' };
        case 'meeting':
          return { label: 'Just Ended', color: 'slate' };
        default:
          return null;
      }
    }
  }

  // Flight specific statuses
  if (type === 'flight') {
    if (diffMins <= 0) return { label: 'Departed', color: 'blue' };
    if (diffMins <= 15) return { label: 'Final Call', color: 'red', pulse: true };
    if (diffMins <= 30) return { label: 'Boarding', color: 'amber', pulse: true };
    if (diffMins <= 45) return { label: 'Boarding Soon', color: 'amber' };
    if (diffHours <= 2) return { label: 'Gate Open', color: 'green' };
    if (diffHours <= 3) return { label: 'Check-in Open', color: 'blue' };
  }

  // Hotel specific
  if (type === 'hotel') {
    if (diffMins <= 0 && diffMins > -60) return { label: 'Check-in Now', color: 'green', pulse: true };
    if (diffHours <= 3 && diffHours > 0) return { label: 'Check-in Soon', color: 'blue' };
  }

  // General upcoming status
  if (diffDays >= 1 && diffDays < 2) {
    return { label: 'Tomorrow', color: 'blue' };
  }
  if (diffHours <= 1 && diffHours > 0) {
    return { label: 'Starting Soon', color: 'amber' };
  }

  return null;
};

// ─── Flight-Aware Countdown & Labels ─────────────────────────────────────────

/**
 * Smart countdown that accounts for live flight status.
 * Returns the right label + action text based on the actual flight phase,
 * not just the scheduled departure time.
 */
export interface FlightAwareCountdown {
  /** The countdown value to display (e.g. "2h 15m", "Now", "✓") */
  label: string;
  /** The action/context label below the countdown (e.g. "Arrives", "Landed", "Departs") */
  actionLabel: string;
  /** Whether to show urgent styling */
  urgent: boolean;
  /** Raw minutes value (negative = past) */
  minutes: number;
  /** Color hint: 'green' for landed/on-time, 'blue' for in-flight, 'amber' for boarding, 'red' for cancelled */
  colorHint: 'green' | 'blue' | 'amber' | 'red' | 'default';
}

export function getFlightAwareCountdown(
  reservation: Reservation,
  flightStatus: FlightStatusData | null,
): FlightAwareCountdown {
  const now = new Date();

  // If no flight status data, fall back to basic countdown
  if (!flightStatus || reservation.type !== 'flight') {
    return getBasicCountdown(reservation);
  }

  // Import inferFlightPhase inline to avoid circular deps — we use the same logic
  const phase = inferFlightPhaseLocal(flightStatus);

  switch (phase) {
    case 'landed': {
      const arrTime = flightStatus.arr_actual || flightStatus.arr_estimated || flightStatus.arr_scheduled;
      return {
        label: '✓',
        actionLabel: 'Landed',
        urgent: false,
        minutes: 0,
        colorHint: 'green',
      };
    }

    case 'active': {
      // In flight — count down to estimated arrival
      const arrTime = flightStatus.arr_estimated || flightStatus.arr_scheduled;
      if (arrTime) {
        const arrDate = new Date(arrTime);
        const diffMs = arrDate.getTime() - now.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins <= 0) {
          return { label: 'Soon', actionLabel: 'Landing', urgent: true, minutes: diffMins, colorHint: 'blue' };
        }
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        const timeLabel = hours > 0
          ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`)
          : `${diffMins}m`;
        return { label: timeLabel, actionLabel: 'Arrives', urgent: false, minutes: diffMins, colorHint: 'blue' };
      }
      return { label: '✈', actionLabel: 'In Flight', urgent: false, minutes: 0, colorHint: 'blue' };
    }

    case 'cancelled': {
      return { label: '✕', actionLabel: 'Cancelled', urgent: false, minutes: 0, colorHint: 'red' };
    }

    case 'diverted': {
      return { label: '⚠', actionLabel: 'Diverted', urgent: true, minutes: 0, colorHint: 'red' };
    }

    case 'incident': {
      return { label: '⚠', actionLabel: 'Incident', urgent: true, minutes: 0, colorHint: 'red' };
    }

    default: {
      // scheduled / unknown — use departure time (estimated if available)
      const depTime = flightStatus.dep_estimated || flightStatus.dep_scheduled || reservation.start_time;
      const depDate = new Date(depTime);
      const diffMs = depDate.getTime() - now.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      // Check if we're in the boarding window (≤30 min before departure)
      if (diffMins <= 30 && diffMins > 0) {
        return { label: `${diffMins}m`, actionLabel: 'Board', urgent: true, minutes: diffMins, colorHint: 'amber' };
      }
      if (diffMins <= 0) {
        // Past departure but API still says scheduled — likely boarding/departing
        return { label: 'Now', actionLabel: 'Board', urgent: true, minutes: diffMins, colorHint: 'amber' };
      }

      // Normal countdown to departure
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      const timeLabel = hours >= 24
        ? `${Math.floor(hours / 24)}d ${hours % 24}h`
        : hours > 0
          ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`)
          : `${diffMins}m`;
      return {
        label: timeLabel,
        actionLabel: 'Departs',
        urgent: diffMins < 120,
        minutes: diffMins,
        colorHint: 'default',
      };
    }
  }
}

/**
 * Basic countdown for non-flight reservations or flights without live data.
 */
function getBasicCountdown(reservation: Reservation): FlightAwareCountdown {
  const now = new Date();
  const startDate = new Date(reservation.start_time);
  const diffMs = startDate.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;

  const actionLabels: Record<string, string> = {
    flight: diffMins <= 30 && diffMins > 0 ? 'Board' : diffMins <= 0 ? 'Board' : 'Departs',
    hotel: 'Check-in',
    car: 'Pickup',
    meeting: 'Starts',
    train: 'Departs',
    event: 'Starts',
  };

  if (diffMins < 0) {
    return {
      label: 'Now',
      actionLabel: actionLabels[reservation.type] || 'Starts',
      urgent: true,
      minutes: diffMins,
      colorHint: 'default',
    };
  }
  if (diffMins < 30) {
    return {
      label: `${diffMins}m`,
      actionLabel: actionLabels[reservation.type] || 'Starts',
      urgent: true,
      minutes: diffMins,
      colorHint: reservation.type === 'flight' ? 'amber' : 'default',
    };
  }

  const timeLabel = hours >= 24
    ? `${Math.floor(hours / 24)}d ${hours % 24}h`
    : hours > 0
      ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`)
      : `${diffMins}m`;

  return {
    label: timeLabel,
    actionLabel: actionLabels[reservation.type] || 'Starts',
    urgent: diffMins < 120,
    minutes: diffMins,
    colorHint: 'default',
  };
}

/**
 * Get the contextual time info to display on the card.
 * Returns a label + formatted time that makes sense for the current flight phase.
 */
export function getContextualTimeInfo(
  reservation: Reservation,
  flightStatus: FlightStatusData | null,
): { label: string; time: string } {
  if (reservation.type !== 'flight' || !flightStatus) {
    // Non-flight: show start time with type-appropriate label
    const labels: Record<string, string> = {
      flight: 'Departs',
      hotel: 'Check-in',
      car: 'Pickup',
      meeting: 'Starts',
      train: 'Departs',
      event: 'Starts',
    };
    return {
      label: labels[reservation.type] || 'Starts',
      time: formatTime(new Date(reservation.start_time)),
    };
  }

  const phase = inferFlightPhaseLocal(flightStatus);

  switch (phase) {
    case 'landed': {
      const arrTime = flightStatus.arr_actual || flightStatus.arr_estimated || flightStatus.arr_scheduled;
      return {
        label: flightStatus.arr_actual ? 'Arrived' : 'Arrival',
        time: arrTime ? formatTime(new Date(arrTime)) : '—',
      };
    }
    case 'active': {
      const arrTime = flightStatus.arr_estimated || flightStatus.arr_scheduled;
      return {
        label: 'Est. Arrival',
        time: arrTime ? formatTime(new Date(arrTime)) : '—',
      };
    }
    case 'cancelled':
      return {
        label: 'Was scheduled',
        time: formatTime(new Date(flightStatus.dep_scheduled || reservation.start_time)),
      };
    default: {
      // Scheduled — show departure time (estimated if different from scheduled)
      const depTime = flightStatus.dep_estimated || flightStatus.dep_scheduled || reservation.start_time;
      const isEstimated = flightStatus.dep_estimated && flightStatus.dep_estimated !== flightStatus.dep_scheduled;
      return {
        label: isEstimated ? 'Est. Departure' : 'Departs',
        time: formatTime(new Date(depTime)),
      };
    }
  }
}

/**
 * Local copy of inferFlightPhase to avoid circular dependency with flight-status.ts.
 * Mirrors the logic in flight-status.ts exactly.
 */
function inferFlightPhaseLocal(status: FlightStatusData): FlightPhase {
  const apiPhase = status.flight_status;

  if (apiPhase === 'landed' || apiPhase === 'cancelled' || apiPhase === 'incident' || apiPhase === 'diverted') {
    return apiPhase;
  }

  if (status.arr_actual) {
    return 'landed';
  }

  if (status.dep_actual) {
    const depActualMs = new Date(status.dep_actual).getTime();
    const now = Date.now();
    const timeSinceDeparture = now - depActualMs;

    const MAX_FLIGHT_DURATION_MS = 20 * 60 * 60 * 1000;
    let estimatedDurationMs = MAX_FLIGHT_DURATION_MS;
    const arrTime = status.arr_estimated || status.arr_scheduled;
    if (arrTime) {
      const arrMs = new Date(arrTime).getTime();
      estimatedDurationMs = Math.max(arrMs - depActualMs, 60 * 60 * 1000);
    }

    const landingDeadline = estimatedDurationMs + 60 * 60 * 1000;
    if (timeSinceDeparture > landingDeadline) {
      return 'unknown';
    }

    return 'active';
  }

  if (apiPhase === 'active') return 'active';
  if (apiPhase === 'scheduled') return 'scheduled';

  return apiPhase;
}

// Calculate when to leave for a destination (for flights, adds buffer time)
export const getLeaveNowSuggestion = (
  type: ReservationType,
  startTime: Date,
  estimatedDriveMinutes: number = 25 // Default estimate
): { shouldShow: boolean; leaveIn: number; driveTime: number } | null => {
  const now = new Date();
  const diffMins = Math.floor((startTime.getTime() - now.getTime()) / 60000);

  // Only show for flights within 4 hours
  if (type !== 'flight' || diffMins > 240 || diffMins < 0) {
    return null;
  }

  // For flights, recommend arriving 2 hours before (domestic) or 3 hours (international)
  // This is simplified - just using 2 hours
  const bufferMinutes = 120;
  const leaveInMinutes = diffMins - bufferMinutes - estimatedDriveMinutes;

  // Only show if they should leave within the next hour
  if (leaveInMinutes > 60 || leaveInMinutes < -30) {
    return null;
  }

  return {
    shouldShow: true,
    leaveIn: Math.max(0, leaveInMinutes),
    driveTime: estimatedDriveMinutes,
  };
};

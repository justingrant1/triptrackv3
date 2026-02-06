import { ReservationType } from './store';

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

export const getReservationIcon = (type: ReservationType): string => {
  const icons: Record<ReservationType, string> = {
    flight: 'Plane',
    hotel: 'Building2',
    car: 'Car',
    train: 'Train',
    meeting: 'Users',
    event: 'Ticket',
  };
  return icons[type];
};

export const getReservationColor = (type: ReservationType): string => {
  const colors: Record<ReservationType, string> = {
    flight: '#3B82F6', // blue
    hotel: '#8B5CF6', // purple
    car: '#10B981', // green
    train: '#F59E0B', // amber
    meeting: '#EC4899', // pink
    event: '#06B6D4', // cyan
  };
  return colors[type];
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

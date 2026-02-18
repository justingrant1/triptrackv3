import type { Reservation } from './types/database';
import type { FlightStatusData, FlightPhase } from './flight-status';

// ─── UTC-Based Time Utilities ────────────────────────────────────────────────
// 
// ALL reservation start_time/end_time values in the database are stored as UTC.
// The email parser converts local times → UTC at ingestion using AI-provided
// timezone offsets. This means:
//
// 1. `new Date(reservation.start_time)` gives the correct UTC instant
// 2. All comparisons (isToday, countdowns, etc.) work with UTC directly
// 3. No airport timezone lookup table needed
// 4. Original local times are preserved in details['Local Start Time'] for display
// 5. Timezone offsets are in details['Departure Timezone'] / details['Location Timezone']
//
// For DISPLAY, we use the stored local times from details to show "11:00 AM"
// (the local departure time) rather than converting UTC back.

/**
 * Convert a local time string + timezone offset to a real UTC Date.
 * Used for legacy data that may not have been converted to UTC at ingestion.
 * 
 * @param localISO - Timezone-naive ISO string like "2026-02-12T10:10:00"
 * @param tzOffset - Timezone offset string like "-08:00", "+09:00", "-05:00"
 * @returns A Date object representing the correct UTC instant, or null if offset is missing
 */
export function toUTCDate(localISO: string, tzOffset: string | null | undefined): Date | null {
  if (!localISO || !tzOffset) return null;
  
  try {
    const offsetMatch = tzOffset.match(/^([+-])(\d{1,2}):?(\d{2})$/);
    if (!offsetMatch) return null;
    
    const sign = offsetMatch[1] === '+' ? 1 : -1;
    const hours = parseInt(offsetMatch[2], 10);
    const minutes = parseInt(offsetMatch[3], 10);
    const totalOffsetMinutes = sign * (hours * 60 + minutes);
    
    const stripped = localISO.replace(/[Zz]$/, '').replace(/[+-]\d{2}:?\d{2}$/, '');
    const localDate = new Date(stripped + 'Z');
    if (isNaN(localDate.getTime())) return null;
    const utcMs = localDate.getTime() - (totalOffsetMinutes * 60 * 1000);
    const result = new Date(utcMs);
    return isNaN(result.getTime()) ? null : result;
  } catch {
    return null;
  }
}

/**
 * Get the flight duration for a reservation.
 * Uses a priority chain:
 * 1. AI-provided "Duration" field (most accurate for cross-timezone flights)
 * 2. Timezone-aware calculation using departure/arrival timezone offsets
 * 3. Naive calculation from start_time/end_time (accurate for same-timezone flights)
 * 
 * @returns Duration string like "11h 55m", or null if cannot be determined
 */
export function getFlightDuration(reservation: Reservation): string | null {
  const details = reservation.details as Record<string, any> | null;
  
  // Priority 1: AI-provided duration string
  const aiDuration = details?.['Duration'] || details?.['Journey Time'];
  if (aiDuration && typeof aiDuration === 'string' && aiDuration.trim()) {
    return aiDuration.trim();
  }
  
  // Priority 2: Timezone-aware calculation
  if (reservation.start_time && reservation.end_time && details) {
    const depTz = details['Departure Timezone'] as string | undefined;
    const arrTz = details['Arrival Timezone'] as string | undefined;
    
    if (depTz && arrTz) {
      const depUTC = toUTCDate(reservation.start_time, depTz);
      const arrUTC = toUTCDate(reservation.end_time, arrTz);
      
      if (depUTC && arrUTC) {
        const diffMs = arrUTC.getTime() - depUTC.getTime();
        if (diffMs > 0) {
          const totalMins = Math.round(diffMs / 60000);
          const hours = Math.floor(totalMins / 60);
          const mins = totalMins % 60;
          if (hours > 0) {
            return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
          }
          return `${mins}m`;
        }
      }
    }
  }
  
  // Priority 3: Naive calculation (works when times are in same timezone)
  // For cross-timezone flights without offset data, this may be inaccurate
  // but still useful as a rough estimate
  if (reservation.start_time && reservation.end_time) {
    const start = new Date(reservation.start_time);
    const end = new Date(reservation.end_time);
    const diffMs = end.getTime() - start.getTime();
    // Allow up to 30 hours (covers ultra-long-haul + timezone artifacts)
    if (diffMs > 0 && diffMs < 30 * 60 * 60 * 1000) {
      const totalMins = Math.round(diffMs / 60000);
      const hours = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      if (hours > 0) {
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
      }
      return `${mins}m`;
    }
  }
  
  return null;
}

/**
 * Get the correct UTC departure Date for a flight reservation.
 * 
 * NEW: Since times are now stored as UTC in the database, this is simple —
 * just parse the start_time directly. For legacy data without UTC conversion,
 * falls back to using the Departure Timezone from details.
 */
export function getFlightDepartureUTC(reservation: Reservation): Date {
  // Try direct parse first — new data is already UTC (ends with Z or has offset)
  const direct = safeParseDate(reservation.start_time);
  if (!isNaN(direct.getTime())) {
    // Check if it looks like proper UTC (has Z or offset)
    if (reservation.start_time?.match(/[Zz]$|[+-]\d{2}:?\d{2}$/)) {
      return direct;
    }
  }
  
  // Legacy fallback: use Departure Timezone from details to convert
  const details = reservation.details as Record<string, any> | null;
  const depTz = details?.['Departure Timezone'] as string | undefined;
  const utcDate = toUTCDate(reservation.start_time, depTz);
  if (utcDate) return utcDate;
  
  // Last resort: parse as-is (Hermes treats naive strings as UTC)
  return direct;
}

/**
 * Get the correct UTC arrival Date for a flight reservation.
 */
export function getFlightArrivalUTC(reservation: Reservation): Date | null {
  if (!reservation.end_time) return null;
  
  // Try direct parse — new data is already UTC
  const direct = safeParseDate(reservation.end_time);
  if (!isNaN(direct.getTime())) {
    if (reservation.end_time?.match(/[Zz]$|[+-]\d{2}:?\d{2}$/)) {
      return direct;
    }
  }
  
  // Legacy fallback
  const details = reservation.details as Record<string, any> | null;
  const arrTz = details?.['Arrival Timezone'] as string | undefined;
  const utcDate = toUTCDate(reservation.end_time, arrTz);
  if (utcDate) return utcDate;
  
  return direct;
}

/**
 * Get the correct UTC start time for any reservation type.
 * 
 * NEW: Since all times are stored as UTC, this is straightforward.
 * For legacy data, falls back to timezone offset from details.
 */
export function getReservationStartUTC(reservation: Reservation): Date {
  // Try direct parse — new data is already UTC
  const direct = safeParseDate(reservation.start_time);
  if (!isNaN(direct.getTime())) {
    if (reservation.start_time?.match(/[Zz]$|[+-]\d{2}:?\d{2}$/)) {
      return direct;
    }
  }
  
  // Legacy fallback: use timezone from details
  const details = reservation.details as Record<string, any> | null;
  const tz = reservation.type === 'flight'
    ? details?.['Departure Timezone']
    : details?.['Location Timezone'];
  const utcDate = toUTCDate(reservation.start_time, tz);
  if (utcDate) return utcDate;
  
  return direct;
}

/**
 * Get the correct UTC end time for any reservation type.
 */
export function getReservationEndUTC(reservation: Reservation): Date | null {
  if (!reservation.end_time) return null;
  
  const direct = safeParseDate(reservation.end_time);
  if (!isNaN(direct.getTime())) {
    if (reservation.end_time?.match(/[Zz]$|[+-]\d{2}:?\d{2}$/)) {
      return direct;
    }
  }
  
  // Legacy fallback
  const details = reservation.details as Record<string, any> | null;
  const tz = reservation.type === 'flight'
    ? details?.['Arrival Timezone']
    : details?.['Location Timezone'];
  const utcDate = toUTCDate(reservation.end_time, tz);
  if (utcDate) return utcDate;
  
  return direct;
}

/**
 * Safely parse a date string, handling Supabase formats with microseconds
 * that can cause Invalid Date on iOS JavaScriptCore.
 * e.g., "2026-02-12T10:10:00.000000" → valid Date
 */
export function safeParseDate(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date(); // fallback to now
  
  // Try direct parsing first
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  
  // If that fails, try trimming microseconds (>3 decimal places)
  // "2026-02-12T10:10:00.000000" → "2026-02-12T10:10:00.000"
  const trimmed = dateStr.replace(/(\.\d{3})\d+/, '$1');
  d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d;
  
  // Try replacing space with T (Supabase sometimes returns "2026-02-12 10:10:00")
  const withT = dateStr.replace(' ', 'T');
  d = new Date(withT);
  if (!isNaN(d.getTime())) return d;
  
  // Last resort: extract date parts manually
  const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (match) {
    return new Date(
      parseInt(match[1]),
      parseInt(match[2]) - 1,
      parseInt(match[3]),
      parseInt(match[4]),
      parseInt(match[5])
    );
  }
  
  return new Date(); // absolute fallback
}

type ReservationType = Reservation['type'];

/**
 * Parse a date-only value as LOCAL noon, not UTC midnight.
 * Prevents the off-by-one-day display bug in Western Hemisphere timezones.
 * 
 * JavaScript's `new Date("2026-02-12")` creates midnight UTC, which in EST
 * becomes 7 PM on Feb 11 — showing the wrong date. Using noon local time
 * ensures no timezone on Earth (+14 to -12) can shift it to a different day.
 * 
 * Handles multiple formats from Supabase:
 * - Pure date: "2026-02-12"
 * - Timestamptz: "2026-02-12T00:00:00+00:00" or "2026-02-12 00:00:00+00"
 * - With microseconds: "2026-02-12T00:00:00.000000+00:00"
 */
export function parseDateOnly(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date();
  // Extract just the YYYY-MM-DD portion from any string that starts with a date.
  // This function is ONLY used for date-only fields (trip.start_date, trip.end_date),
  // so it's always safe to discard the time/timezone portion.
  const dateMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    return new Date(dateMatch[1] + 'T12:00:00');
  }
  return new Date(dateStr);
}

export const formatTime = (date: Date): string => {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

/**
 * Get the local time ISO string for display purposes.
 * 
 * Since start_time/end_time are now stored as UTC, we can't extract the local
 * time directly from them. Instead, we use the original local times that were
 * saved in the reservation's details by the email parser.
 * 
 * Falls back to the raw start_time/end_time for legacy data or when details
 * don't have the local time stored.
 */
export function getLocalTimeISO(reservation: Reservation, which: 'start' | 'end' = 'start'): string {
  const details = reservation.details as Record<string, any> | null;
  
  if (which === 'start') {
    // Try stored local time first
    const localTime = details?.['Local Start Time'];
    if (localTime && typeof localTime === 'string') return localTime;
    // Fallback to start_time (works for legacy data where times are local)
    return reservation.start_time;
  } else {
    const localTime = details?.['Local End Time'];
    if (localTime && typeof localTime === 'string') return localTime;
    return reservation.end_time || '';
  }
}

/**
 * Format a time string from an ISO timestamp, preserving the original local time.
 * 
 * Travel times (flights, hotels, etc.) should ALWAYS display in the local time
 * of the departure/arrival/check-in location — NOT the user's device timezone.
 * 
 * This function extracts the time directly from the ISO string to avoid
 * any device timezone conversion. Works for both:
 * - Timezone-naive strings: "2026-03-14T10:10:00" (from email parser)
 * - Timezone-aware strings: "2026-03-14T10:10:00Z" or "2026-03-14T10:10:00+00:00" (from APIs)
 * 
 * For timezone-aware strings, we STILL extract the raw time because travel APIs
 * (like AirLabs) return local airport times — the offset is informational, not
 * something we should convert from.
 */
export const formatTimeFromISO = (isoString: string): string => {
  if (!isoString) return '—';
  
  // Always try to extract time directly from the ISO string first.
  // This preserves the local time at the location (airport, hotel, etc.)
  // regardless of the user's device timezone.
  const match = isoString.match(/T(\d{2}):(\d{2})/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = match[2];
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${displayHour}:${minutes} ${period}`;
  }
  
  // Fallback: if no T separator found, try Date parsing as last resort
  return formatTime(new Date(isoString));
};

export const formatDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Format a date from an ISO timestamp, preserving the original date.
 * 
 * Like formatTimeFromISO, this extracts the date directly from the ISO string
 * to avoid device timezone conversion. A reservation on "2026-03-14" should
 * always display as March 14, regardless of the user's timezone.
 */
export const formatDateFromISO = (isoString: string): string => {
  if (!isoString) return '—';
  
  // Extract YYYY-MM-DD from the ISO string
  const match = isoString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // JS months are 0-indexed
    const day = parseInt(match[3], 10);
    
    // Create date at noon local time to avoid any timezone edge cases
    const date = new Date(year, month, day, 12, 0, 0);
    return formatDate(date);
  }
  
  // Fallback
  return formatDate(new Date(isoString));
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

/**
 * Check if an ISO date string represents today, without timezone conversion.
 * 
 * Extracts the date portion from the ISO string and compares it against
 * the device's current date. Prevents the bug where "2026-03-14T10:10:00"
 * (local airport time) gets interpreted as UTC and shifts to the wrong day.
 */
export const isTodayISO = (isoString: string): boolean => {
  if (!isoString) return false;
  
  // Extract YYYY-MM-DD from the ISO string
  const match = isoString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return false;
  
  const isoYear = parseInt(match[1], 10);
  const isoMonth = parseInt(match[2], 10);
  const isoDay = parseInt(match[3], 10);
  
  // Get today's date in device timezone
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1; // JS months are 0-indexed
  const todayDay = today.getDate();
  
  return isoYear === todayYear && isoMonth === todayMonth && isoDay === todayDay;
};

/**
 * Check if an ISO date string represents tomorrow, without timezone conversion.
 */
export const isTomorrowISO = (isoString: string): boolean => {
  if (!isoString) return false;
  
  // Extract YYYY-MM-DD from the ISO string
  const match = isoString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return false;
  
  const isoYear = parseInt(match[1], 10);
  const isoMonth = parseInt(match[2], 10);
  const isoDay = parseInt(match[3], 10);
  
  // Get tomorrow's date in device timezone
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowYear = tomorrow.getFullYear();
  const tomorrowMonth = tomorrow.getMonth() + 1;
  const tomorrowDay = tomorrow.getDate();
  
  return isoYear === tomorrowYear && isoMonth === tomorrowMonth && isoDay === tomorrowDay;
};

// ─── Timezone-Aware "Today" / "Tomorrow" for Reservations ────────────────────
// These functions solve the cross-timezone problem: when tracking someone in
// Bali (UTC+8) from New York (UTC-5), a hotel check-in on Feb 17 in Bali
// should show as "today" even when it's still Feb 16 in New York — because
// it IS Feb 17 in Bali right now.

/**
 * Parse a UTC offset string like "+09:00" or "-05:00" into total minutes.
 * Returns null if the string is invalid.
 */
function parseOffsetMinutes(tzOffset: string | null | undefined): number | null {
  if (!tzOffset) return null;
  const m = tzOffset.match(/^([+-])(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const sign = m[1] === '+' ? 1 : -1;
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
}

/**
 * Get the current date (YYYY-MM-DD components) in a specific UTC offset timezone.
 * 
 * Example: If it's Feb 16 at 8 PM in New York (UTC-5), the current UTC time is
 * Feb 17 at 1 AM. In Tokyo (UTC+9), it's Feb 17 at 10 AM.
 * So getCurrentDateInTimezone('+09:00') returns { year: 2026, month: 2, day: 17 }.
 */
function getCurrentDateInTimezone(tzOffset: string): { year: number; month: number; day: number } | null {
  const offsetMinutes = parseOffsetMinutes(tzOffset);
  if (offsetMinutes === null) return null;
  
  // Get current UTC time in milliseconds
  const nowUtcMs = Date.now();
  // Add the timezone offset to get the local time in that timezone
  const localMs = nowUtcMs + (offsetMinutes * 60 * 1000);
  // Create a Date from the adjusted milliseconds (interpreted as UTC to extract components)
  const localDate = new Date(localMs);
  
  return {
    year: localDate.getUTCFullYear(),
    month: localDate.getUTCMonth() + 1, // 1-indexed
    day: localDate.getUTCDate(),
  };
}

/**
 * Resolve the best available timezone offset for a reservation.
 * 
 * Uses AI-provided timezone offsets stored in the reservation's details.
 * No airport lookup table needed — the AI knows the timezone of every airport
 * and city in the world.
 * 
 * Priority chain:
 * 1. "Departure Timezone" (flights — event starts at departure location)
 * 2. "Location Timezone" (hotels, cars, etc.)
 * 3. "Arrival Timezone" (fallback for hotels at flight destination)
 * 4. null (no timezone info — caller falls back to device timezone)
 */
export function getReservationTimezone(reservation: Reservation): string | null {
  const details = reservation.details as Record<string, any> | null;
  
  if (reservation.type === 'flight') {
    // For flights, use departure timezone (the event starts at the departure location)
    const depTz = details?.['Departure Timezone'] as string | undefined;
    if (depTz) return depTz;
  }
  
  // For non-flights, use Location Timezone (set by AI for hotels, cars, etc.)
  const locTz = details?.['Location Timezone'] as string | undefined;
  if (locTz) return locTz;
  
  // Fallback: try Arrival Timezone (useful for hotels at a flight destination)
  const arrTz = details?.['Arrival Timezone'] as string | undefined;
  if (arrTz) return arrTz;
  
  return null;
}

/**
 * TIMEZONE-AWARE: Check if a reservation is happening "today".
 * 
 * Uses the event's timezone to determine what "today" means at the event location.
 * This solves the cross-timezone tracking problem: when you're in New York (UTC-5)
 * tracking someone in Bali (UTC+8), a Feb 17 hotel check-in shows as "today"
 * when it's already Feb 17 in Bali, even though it's still Feb 16 in New York.
 * 
 * Falls back to device timezone comparison if no timezone info is available.
 */
export function isReservationToday(reservation: Reservation): boolean {
  if (!reservation.start_time) return false;
  
  // Extract the date from the LOCAL start time (not UTC start_time)
  // This ensures we compare the date as it appears at the event location
  const localISO = getLocalTimeISO(reservation, 'start');
  const match = localISO.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return false;
  
  const resYear = parseInt(match[1], 10);
  const resMonth = parseInt(match[2], 10);
  const resDay = parseInt(match[3], 10);
  
  // Try to resolve the event's timezone
  const eventTz = getReservationTimezone(reservation);
  
  if (eventTz) {
    // Get the current date in the EVENT's timezone
    const eventToday = getCurrentDateInTimezone(eventTz);
    if (eventToday) {
      // Check if the reservation date matches "today" in the event's timezone
      if (resYear === eventToday.year && resMonth === eventToday.month && resDay === eventToday.day) {
        return true;
      }
    }
  }
  
  // Also check device timezone (covers cases where event TZ is unknown,
  // or where the event is "today" in the viewer's timezone too)
  const deviceToday = new Date();
  const deviceYear = deviceToday.getFullYear();
  const deviceMonth = deviceToday.getMonth() + 1;
  const deviceDay = deviceToday.getDate();
  
  return resYear === deviceYear && resMonth === deviceMonth && resDay === deviceDay;
}

/**
 * TIMEZONE-AWARE: Check if a reservation is happening "tomorrow".
 * Same logic as isReservationToday but for the next day.
 */
export function isReservationTomorrow(reservation: Reservation): boolean {
  if (!reservation.start_time) return false;
  
  // Use local time for date extraction (same as isReservationToday)
  const localISO = getLocalTimeISO(reservation, 'start');
  const match = localISO.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return false;
  
  const resYear = parseInt(match[1], 10);
  const resMonth = parseInt(match[2], 10);
  const resDay = parseInt(match[3], 10);
  
  // Try event timezone
  const eventTz = getReservationTimezone(reservation);
  
  if (eventTz) {
    const eventToday = getCurrentDateInTimezone(eventTz);
    if (eventToday) {
      // Calculate tomorrow in the event's timezone
      // (add 1 day to the event's "today" — handle month/year rollover via Date math)
      const eventTodayDate = new Date(Date.UTC(eventToday.year, eventToday.month - 1, eventToday.day + 1));
      const eventTomorrowYear = eventTodayDate.getUTCFullYear();
      const eventTomorrowMonth = eventTodayDate.getUTCMonth() + 1;
      const eventTomorrowDay = eventTodayDate.getUTCDate();
      
      if (resYear === eventTomorrowYear && resMonth === eventTomorrowMonth && resDay === eventTomorrowDay) {
        return true;
      }
    }
  }
  
  // Also check device timezone
  const deviceTomorrow = new Date();
  deviceTomorrow.setDate(deviceTomorrow.getDate() + 1);
  const tomorrowYear = deviceTomorrow.getFullYear();
  const tomorrowMonth = deviceTomorrow.getMonth() + 1;
  const tomorrowDay = deviceTomorrow.getDate();
  
  return resYear === tomorrowYear && resMonth === tomorrowMonth && resDay === tomorrowDay;
}

/**
 * TIMEZONE-AWARE: Get the display label for a reservation's date context.
 * Returns "Today", "Tomorrow", or a formatted date string.
 * Uses the event's timezone to determine what "today" means.
 */
export function getReservationDateLabel(reservation: Reservation): string {
  if (isReservationToday(reservation)) return 'Today';
  if (isReservationTomorrow(reservation)) return 'Tomorrow';
  return formatDateFromISO(reservation.start_time);
}

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
      // scheduled / unknown — use live flight data for countdown when available.
      // dep_scheduled_utc is the original scheduled departure in UTC.
      // Add dep_delay (minutes) to get the actual expected departure time.
      // This is more accurate than reservation.start_time which may have
      // timezone storage issues (local time stored as UTC).
      const depUtcStr = flightStatus.dep_scheduled_utc;
      if (depUtcStr) {
        // CRITICAL: dep_scheduled_utc may lack a 'Z' suffix (e.g. "2026-02-12 07:20").
        // Without 'Z', new Date() treats it as LOCAL time on the device, causing
        // the countdown to be off by the device's UTC offset (e.g. 5 hours in EST).
        // Force UTC interpretation by appending 'Z' if no timezone indicator exists.
        const utcSafe = depUtcStr.match(/[Zz]$|[+-]\d{2}:?\d{2}$/)
          ? depUtcStr
          : depUtcStr.replace(' ', 'T') + 'Z';
        const depUtcMs = new Date(utcSafe).getTime();
        if (!isNaN(depUtcMs)) {
          const delayMs = (flightStatus.dep_delay ?? 0) * 60 * 1000;
          const actualDepMs = depUtcMs + delayMs;
          const diffMs = actualDepMs - now.getTime();
          const diffMins = Math.floor(diffMs / 60000);
          const hours = Math.floor(diffMins / 60);
          const mins = diffMins % 60;

          const isDelayed = flightStatus.dep_estimated && flightStatus.dep_estimated !== flightStatus.dep_scheduled;
          const actionLabel = isDelayed
            ? (diffMins <= 30 && diffMins > 0 ? 'Board' : 'Departs')
            : (diffMins <= 30 && diffMins > 0 ? 'Board' : 'Departs');

          if (diffMins < 0) {
            return { label: 'Now', actionLabel: 'Board', urgent: true, minutes: diffMins, colorHint: 'default' };
          }
          if (diffMins < 30) {
            return { label: `${diffMins}m`, actionLabel, urgent: true, minutes: diffMins, colorHint: 'amber' };
          }

          const timeLabel = hours >= 24
            ? `${Math.floor(hours / 24)}d ${hours % 24}h`
            : hours > 0
              ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`)
              : `${diffMins}m`;

          return { label: timeLabel, actionLabel, urgent: diffMins < 120, minutes: diffMins, colorHint: 'default' };
        }
      }
      // No live UTC data — fall back to basic countdown
      return getBasicCountdown(reservation);
    }
  }
}

/**
 * Basic countdown for non-flight reservations or flights without live data.
 * For flights, uses timezone-aware UTC departure time when available.
 */
function getBasicCountdown(reservation: Reservation): FlightAwareCountdown {
  const now = new Date();
  // For flights, use timezone-aware departure time for accurate countdown
  let startDate = reservation.type === 'flight'
    ? getFlightDepartureUTC(reservation)
    : safeParseDate(reservation.start_time);
  
  // ABSOLUTE NaN guard — if startDate is still invalid, use safeParseDate as last resort
  if (isNaN(startDate.getTime())) {
    startDate = safeParseDate(reservation.start_time);
  }
  
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
    // Use getLocalTimeISO to display the original local time (not UTC)
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
      time: formatTimeFromISO(getLocalTimeISO(reservation, 'start')),
    };
  }

  const phase = inferFlightPhaseLocal(flightStatus);

  switch (phase) {
    case 'landed': {
      // For landed flights, show arrival time from reservation (local time)
      // Fall back to flight status only if reservation has no end_time
      return {
        label: flightStatus.arr_actual ? 'Arrived' : 'Arrival',
        time: reservation.end_time
          ? formatTimeFromISO(reservation.end_time)
          : formatTimeFromISO(flightStatus.arr_actual || flightStatus.arr_estimated || flightStatus.arr_scheduled || reservation.start_time),
      };
    }
    case 'active': {
      // In-flight — show arrival time from reservation (local time)
      return {
        label: 'Est. Arrival',
        time: reservation.end_time
          ? formatTimeFromISO(reservation.end_time)
          : formatTimeFromISO(flightStatus.arr_estimated || flightStatus.arr_scheduled || reservation.end_time || reservation.start_time),
      };
    }
    case 'cancelled':
      return {
        label: 'Was scheduled',
        time: formatTimeFromISO(reservation.start_time),
      };
    default: {
      // Scheduled — prefer live flight data (local airport times from AirLabs)
      // over reservation.start_time which may have timezone storage issues.
      // AirLabs dep_estimated/dep_scheduled are LOCAL airport times, perfect for display.
      const liveDepTime = flightStatus.dep_estimated || flightStatus.dep_scheduled;
      return {
        label: flightStatus.dep_estimated && flightStatus.dep_estimated !== flightStatus.dep_scheduled
          ? 'New Dep.'
          : 'Departs',
        time: liveDepTime
          ? formatTimeFromISO(liveDepTime)
          : formatTimeFromISO(reservation.start_time),
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

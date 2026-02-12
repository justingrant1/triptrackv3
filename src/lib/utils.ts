import type { Reservation } from './types/database';
import type { FlightStatusData, FlightPhase } from './flight-status';

// ─── IATA Airport Timezone Lookup ────────────────────────────────────────────
// Fallback for reservations that don't have explicit "Departure Timezone" in details.
// Maps major IATA airport codes to their standard UTC offset strings.
// This covers the ~100 busiest airports worldwide.
const AIRPORT_TIMEZONE_OFFSETS: Record<string, string> = {
  // US - Eastern (UTC-5)
  ATL: '-05:00', JFK: '-05:00', EWR: '-05:00', LGA: '-05:00', BOS: '-05:00',
  MIA: '-05:00', FLL: '-05:00', MCO: '-05:00', PHL: '-05:00', CLT: '-05:00',
  IAD: '-05:00', DCA: '-05:00', BWI: '-05:00', DTW: '-05:00', CLE: '-05:00',
  PIT: '-05:00', RDU: '-05:00', TPA: '-05:00', RSW: '-05:00', PBI: '-05:00',
  BUF: '-05:00', SYR: '-05:00', JAX: '-05:00', IND: '-05:00', CMH: '-05:00',
  CVG: '-05:00', SDF: '-05:00', BNA: '-05:00', MEM: '-05:00',
  // US - Central (UTC-6)
  ORD: '-06:00', MDW: '-06:00', DFW: '-06:00', IAH: '-06:00', HOU: '-06:00',
  MSP: '-06:00', STL: '-06:00', MCI: '-06:00', AUS: '-06:00', SAT: '-06:00',
  MSY: '-06:00', OMA: '-06:00', MKE: '-06:00', OKC: '-06:00', TUL: '-06:00',
  // US - Mountain (UTC-7)
  DEN: '-07:00', SLC: '-07:00', PHX: '-07:00', ABQ: '-07:00', ELP: '-07:00',
  TUS: '-07:00', BOI: '-07:00', COS: '-07:00',
  // US - Pacific (UTC-8)
  LAX: '-08:00', SFO: '-08:00', SEA: '-08:00', SAN: '-08:00', PDX: '-08:00',
  SJC: '-08:00', OAK: '-08:00', SMF: '-08:00', BUR: '-08:00', SNA: '-08:00',
  LGB: '-08:00', ONT: '-08:00', PSP: '-08:00',
  // US - Alaska/Hawaii
  ANC: '-09:00', HNL: '-10:00', OGG: '-10:00', KOA: '-10:00', LIH: '-10:00',
  // Canada
  YYZ: '-05:00', YUL: '-05:00', YOW: '-05:00', YVR: '-08:00', YYC: '-07:00',
  YEG: '-07:00', YWG: '-06:00', YHZ: '-04:00',
  // Mexico / Central America
  MEX: '-06:00', CUN: '-05:00', GDL: '-06:00', SJD: '-07:00', PVR: '-06:00',
  SJO: '-06:00', PTY: '-05:00',
  // Caribbean
  SXM: '-04:00', MBJ: '-05:00', NAS: '-05:00', PUJ: '-04:00', SDQ: '-04:00',
  SJU: '-04:00', STT: '-04:00', AUA: '-04:00', CUR: '-04:00',
  // South America
  GRU: '-03:00', GIG: '-03:00', EZE: '-03:00', SCL: '-04:00', BOG: '-05:00',
  LIM: '-05:00', UIO: '-05:00', CCS: '-04:00',
  // Europe - GMT/UTC+0
  LHR: '+00:00', LGW: '+00:00', STN: '+00:00', LTN: '+00:00', MAN: '+00:00',
  EDI: '+00:00', DUB: '+00:00', LIS: '+00:00',
  // Europe - CET (UTC+1)
  CDG: '+01:00', ORY: '+01:00', AMS: '+01:00', FRA: '+01:00', MUC: '+01:00',
  ZRH: '+01:00', BCN: '+01:00', MAD: '+01:00', FCO: '+01:00', MXP: '+01:00',
  VCE: '+01:00', BRU: '+01:00', VIE: '+01:00', CPH: '+01:00', OSL: '+01:00',
  ARN: '+01:00', HEL: '+02:00', WAW: '+01:00', PRG: '+01:00', BUD: '+01:00',
  // Europe - EET (UTC+2)
  ATH: '+02:00', IST: '+03:00', CAI: '+02:00',
  // Middle East
  DXB: '+04:00', AUH: '+04:00', DOH: '+03:00', RUH: '+03:00', JED: '+03:00',
  AMM: '+03:00', TLV: '+02:00', BAH: '+03:00', KWI: '+03:00', MCT: '+04:00',
  // Africa
  JNB: '+02:00', CPT: '+02:00', NBO: '+03:00', ADD: '+03:00', LOS: '+01:00',
  ACC: '+00:00', CMN: '+01:00',
  // South Asia
  DEL: '+05:30', BOM: '+05:30', BLR: '+05:30', MAA: '+05:30', CCU: '+05:30',
  HYD: '+05:30', CMB: '+05:30', DAC: '+06:00', KTM: '+05:45',
  // Southeast Asia
  SIN: '+08:00', BKK: '+07:00', KUL: '+08:00', CGK: '+07:00', MNL: '+08:00',
  SGN: '+07:00', HAN: '+07:00', RGN: '+06:30', PNH: '+07:00',
  // East Asia
  NRT: '+09:00', HND: '+09:00', KIX: '+09:00', ICN: '+09:00', GMP: '+09:00',
  PEK: '+08:00', PVG: '+08:00', HKG: '+08:00', TPE: '+08:00', CTS: '+09:00',
  FUK: '+09:00', NGO: '+09:00',
  // Oceania
  SYD: '+11:00', MEL: '+11:00', BNE: '+10:00', PER: '+08:00', AKL: '+13:00',
  CHC: '+13:00', NAN: '+12:00',
};

/**
 * Look up the UTC offset for an IATA airport code.
 * Returns offset string like "-08:00" or null if not found.
 */
function getAirportTimezoneOffset(code: string | null | undefined): string | null {
  if (!code) return null;
  return AIRPORT_TIMEZONE_OFFSETS[code.toUpperCase()] ?? null;
}

/**
 * Extract departure airport code from a reservation's title, subtitle, or details.
 * Looks for patterns like "LAX → HND", "From: LAX", "Departure Airport: LAX"
 */
function extractDepartureAirport(reservation: Reservation): string | null {
  const details = reservation.details as Record<string, any> | null;
  
  // Check details fields first (most reliable)
  const depAirport = details?.['Departure Airport'] || details?.['From'] || details?.['Origin'];
  if (depAirport && typeof depAirport === 'string') {
    const code = extractAirportCode(depAirport);
    if (code) return code;
  }
  
  // Check title for "XXX → YYY" or "XXX - YYY" pattern
  const title = reservation.title || '';
  const routeMatch = title.match(/\b([A-Z]{3})\s*[→\-–>]+\s*[A-Z]{3}\b/);
  if (routeMatch) return routeMatch[1];
  
  // Check subtitle
  const subtitle = reservation.subtitle || '';
  const subRouteMatch = subtitle.match(/\b([A-Z]{3})\s*[→\-–>]+\s*[A-Z]{3}\b/);
  if (subRouteMatch) return subRouteMatch[1];
  
  // Check location field
  const location = reservation.location || '';
  const locCode = extractAirportCode(location);
  if (locCode) return locCode;
  
  return null;
}

/**
 * Extract arrival airport code from a reservation's title, subtitle, or details.
 */
function extractArrivalAirport(reservation: Reservation): string | null {
  const details = reservation.details as Record<string, any> | null;
  
  // Check details fields first
  const arrAirport = details?.['Arrival Airport'] || details?.['To'] || details?.['Destination'];
  if (arrAirport && typeof arrAirport === 'string') {
    const code = extractAirportCode(arrAirport);
    if (code) return code;
  }
  
  // Check title for "XXX → YYY" pattern — grab the second code
  const title = reservation.title || '';
  const routeMatch = title.match(/\b[A-Z]{3}\s*[→\-–>]+\s*([A-Z]{3})\b/);
  if (routeMatch) return routeMatch[1];
  
  // Check subtitle
  const subtitle = reservation.subtitle || '';
  const subRouteMatch = subtitle.match(/\b[A-Z]{3}\s*[→\-–>]+\s*([A-Z]{3})\b/);
  if (subRouteMatch) return subRouteMatch[1];
  
  return null;
}

// ─── Timezone-Aware Flight Utilities ─────────────────────────────────────────

/**
 * Convert a local time string + timezone offset to a real UTC Date.
 * 
 * Our DB stores times as timezone-naive local times (e.g., "2026-02-12T10:10:00").
 * To compute accurate countdowns, we need to know the UTC offset at the location.
 * 
 * @param localISO - Timezone-naive ISO string like "2026-02-12T10:10:00"
 * @param tzOffset - Timezone offset string like "-08:00", "+09:00", "-05:00"
 * @returns A Date object representing the correct UTC instant, or null if offset is missing
 */
export function toUTCDate(localISO: string, tzOffset: string | null | undefined): Date | null {
  if (!localISO || !tzOffset) return null;
  
  try {
    // Parse the offset string (e.g., "-08:00" → -480 minutes, "+09:00" → +540 minutes)
    const offsetMatch = tzOffset.match(/^([+-])(\d{1,2}):?(\d{2})$/);
    if (!offsetMatch) return null;
    
    const sign = offsetMatch[1] === '+' ? 1 : -1;
    const hours = parseInt(offsetMatch[2], 10);
    const minutes = parseInt(offsetMatch[3], 10);
    const totalOffsetMinutes = sign * (hours * 60 + minutes);
    
    // Parse the local time as if it were UTC, then subtract the offset to get real UTC
    // e.g., 10:10 at UTC-8 → real UTC is 10:10 + 8:00 = 18:10 UTC
    // Strip any existing timezone suffix first — Supabase returns "+00:00" which
    // would create a malformed string like "...+00:00Z" causing Invalid Date.
    const stripped = localISO.replace(/[Zz]$/, '').replace(/[+-]\d{2}:?\d{2}$/, '');
    const localDate = new Date(stripped + 'Z'); // Force UTC interpretation
    if (isNaN(localDate.getTime())) return null; // Guard: Invalid Date → return null
    const utcMs = localDate.getTime() - (totalOffsetMinutes * 60 * 1000);
    const result = new Date(utcMs);
    return isNaN(result.getTime()) ? null : result; // Double guard
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
 * Priority chain:
 * 1. Explicit "Departure Timezone" from details (set by email parser)
 * 2. Airport code lookup from title/details (e.g., LAX → UTC-8)
 * 3. safeParseDate fallback (treats as UTC on Hermes — least accurate)
 */
export function getFlightDepartureUTC(reservation: Reservation): Date {
  const details = reservation.details as Record<string, any> | null;
  const depTz = details?.['Departure Timezone'] as string | undefined;
  
  // Priority 1: Explicit timezone from details
  const utcDate = toUTCDate(reservation.start_time, depTz);
  if (utcDate) return utcDate;
  
  // Priority 2: Look up timezone from departure airport code
  const depCode = extractDepartureAirport(reservation);
  const airportTz = getAirportTimezoneOffset(depCode);
  const airportUtc = toUTCDate(reservation.start_time, airportTz);
  if (airportUtc) return airportUtc;
  
  // Priority 3: Fallback — safeParseDate (Hermes treats naive strings as UTC)
  return safeParseDate(reservation.start_time);
}

/**
 * Get the correct UTC arrival Date for a flight reservation.
 * Priority chain mirrors getFlightDepartureUTC:
 * 1. Explicit "Arrival Timezone" from details
 * 2. Airport code lookup from title/details (e.g., HND → UTC+9)
 * 3. Direct Date parsing fallback
 */
export function getFlightArrivalUTC(reservation: Reservation): Date | null {
  if (!reservation.end_time) return null;
  const details = reservation.details as Record<string, any> | null;
  const arrTz = details?.['Arrival Timezone'] as string | undefined;
  
  // Priority 1: Explicit timezone from details
  const utcDate = toUTCDate(reservation.end_time, arrTz);
  if (utcDate) return utcDate;
  
  // Priority 2: Look up timezone from arrival airport code
  const arrCode = extractArrivalAirport(reservation);
  const airportTz = getAirportTimezoneOffset(arrCode);
  const airportUtc = toUTCDate(reservation.end_time, airportTz);
  if (airportUtc) return airportUtc;
  
  // Priority 3: Fallback
  return safeParseDate(reservation.end_time);
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
      // scheduled / unknown — use live flight data for countdown when available.
      // dep_scheduled_utc is the original scheduled departure in UTC.
      // Add dep_delay (minutes) to get the actual expected departure time.
      // This is more accurate than reservation.start_time which may have
      // timezone storage issues (local time stored as UTC).
      const depUtcStr = flightStatus.dep_scheduled_utc;
      if (depUtcStr) {
        const depUtcMs = new Date(depUtcStr).getTime();
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
      time: formatTimeFromISO(reservation.start_time),
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

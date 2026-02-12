/**
 * Boarding Pass Utilities
 *
 * Handles QR code extraction from boarding pass screenshots,
 * QR code regeneration, image upload/cache, and storage management.
 */

import * as FileSystem from 'expo-file-system/legacy';
import QRCode from 'qrcode';
import { supabase } from './supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BoardingPassExtractionResult {
  qrData: string | null;
  qrType: 'qr' | 'barcode' | 'aztec' | 'unknown' | 'none';
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  passengerName: string | null;
  flightInfo: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
}

export interface BoardingPassData {
  /** URL of the original uploaded image in Supabase Storage */
  originalImageUrl: string | null;
  /** Decoded QR code data string (if extraction succeeded) */
  qrData: string | null;
  /** Type of code detected */
  qrType: 'qr' | 'barcode' | 'aztec' | 'unknown' | 'none';
  /** Bounding box of the QR code in the original image (percentages) */
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  /** Extracted passenger name */
  passengerName: string | null;
  /** Extracted flight info summary */
  flightInfo: string | null;
  /** Confidence level of QR decode */
  confidence: string;
}

// ─── Auth Helpers ────────────────────────────────────────────────────────────

async function getAuthToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated — please sign in');
  }
  return session.access_token;
}

function getAnonKey(): string {
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY not configured');
  return key;
}

function getFunctionsUrl(): string {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('EXPO_PUBLIC_SUPABASE_URL not configured');
  return url.replace('.supabase.co', '.supabase.co/functions/v1');
}

// ─── QR Extraction (via Edge Function) ──────────────────────────────────────

/**
 * Send a boarding pass image to the edge function for QR code extraction.
 * Accepts a base64 data URI (data:image/jpeg;base64,...) or a public URL.
 */
export async function extractBoardingPassQR(
  imageUrlOrBase64: string
): Promise<BoardingPassExtractionResult> {
  const token = await getAuthToken();
  const functionsUrl = getFunctionsUrl();

  const response = await fetch(`${functionsUrl}/extract-boarding-pass`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': getAnonKey(),
    },
    body: JSON.stringify({ imageUrl: imageUrlOrBase64 }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Extraction error: ${response.status}`);
  }

  return response.json();
}

// ─── QR Code Generation ─────────────────────────────────────────────────────

/**
 * Generate a clean QR code image as a base64 data URL from raw data.
 * Returns a PNG data URL that can be displayed in an <Image> component.
 */
export async function generateQRCodeDataUrl(
  data: string,
  size: number = 400
): Promise<string> {
  try {
    const dataUrl = await QRCode.toDataURL(data, {
      width: size,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    });
    return dataUrl;
  } catch (error: any) {
    console.error('[BoardingPass] QR generation failed:', error);
    throw new Error('Failed to generate QR code');
  }
}

// ─── Image Upload ────────────────────────────────────────────────────────────

/**
 * Upload a boarding pass image to Supabase Storage.
 * Returns the public URL of the uploaded image.
 */
export async function uploadBoardingPassImage(
  reservationId: string,
  localUri: string
): Promise<string> {
  // Read the image as base64
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: 'base64',
  });

  if (!base64) {
    throw new Error('Failed to read image data');
  }

  const fileName = `boarding-pass-${reservationId}-${Date.now()}.jpg`;

  // Convert base64 to ArrayBuffer
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const { error: uploadError } = await supabase.storage
    .from('boarding-passes')
    .upload(fileName, bytes.buffer, {
      contentType: 'image/jpeg',
    });

  // If bucket doesn't exist, try the receipts bucket as fallback
  if (uploadError) {
    console.warn('[BoardingPass] Upload to boarding-passes bucket failed, trying receipts:', uploadError.message);

    const { error: fallbackError } = await supabase.storage
      .from('receipts')
      .upload(`boarding-passes/${fileName}`, bytes.buffer, {
        contentType: 'image/jpeg',
      });

    if (fallbackError) {
      throw new Error(`Upload failed: ${fallbackError.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('receipts')
      .getPublicUrl(`boarding-passes/${fileName}`);

    return publicUrl;
  }

  const { data: { publicUrl } } = supabase.storage
    .from('boarding-passes')
    .getPublicUrl(fileName);

  return publicUrl;
}

// ─── Local Caching ───────────────────────────────────────────────────────────

const CACHE_DIR = `${FileSystem.documentDirectory}boarding-passes/`;

/**
 * Ensure the local cache directory exists.
 */
async function ensureCacheDir(): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

/**
 * Cache a boarding pass image locally for offline access.
 * Returns the local file URI.
 */
export async function cacheBoardingPassLocally(
  reservationId: string,
  remoteUrl: string
): Promise<string> {
  await ensureCacheDir();
  const localPath = `${CACHE_DIR}${reservationId}.jpg`;

  try {
    const { uri } = await FileSystem.downloadAsync(remoteUrl, localPath);
    return uri;
  } catch (error: any) {
    console.warn('[BoardingPass] Failed to cache locally:', error.message);
    return remoteUrl; // Fall back to remote URL
  }
}

/**
 * Get the local cached path for a boarding pass (if it exists).
 */
export async function getCachedBoardingPass(
  reservationId: string
): Promise<string | null> {
  const localPath = `${CACHE_DIR}${reservationId}.jpg`;
  const info = await FileSystem.getInfoAsync(localPath);
  return info.exists ? localPath : null;
}

// ─── Storage in Reservation Details ──────────────────────────────────────────

/**
 * Save boarding pass data to a reservation's details field.
 */
export async function saveBoardingPassToReservation(
  reservationId: string,
  data: BoardingPassData
): Promise<void> {
  // First get the current reservation to merge details
  const { data: reservation, error: fetchError } = await supabase
    .from('reservations')
    .select('details')
    .eq('id', reservationId)
    .single();

  if (fetchError) throw new Error(`Failed to fetch reservation: ${fetchError.message}`);

  const currentDetails = reservation?.details || {};

  const updatedDetails = {
    ...currentDetails,
    _boarding_pass_original_url: data.originalImageUrl,
    _boarding_pass_qr_data: data.qrData,
    _boarding_pass_qr_type: data.qrType,
    _boarding_pass_bbox: data.boundingBox,
    _boarding_pass_passenger: data.passengerName,
    _boarding_pass_flight_info: data.flightInfo,
    _boarding_pass_confidence: data.confidence,
    _boarding_pass_updated_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabase
    .from('reservations')
    .update({ details: updatedDetails })
    .eq('id', reservationId);

  if (updateError) throw new Error(`Failed to save boarding pass: ${updateError.message}`);
}

/**
 * Get boarding pass data from a reservation's details field.
 */
export function getBoardingPassFromReservation(
  details: Record<string, any> | undefined
): BoardingPassData | null {
  if (!details) return null;

  const originalUrl = details._boarding_pass_original_url;
  if (!originalUrl) return null;

  return {
    originalImageUrl: originalUrl,
    qrData: details._boarding_pass_qr_data || null,
    qrType: details._boarding_pass_qr_type || 'unknown',
    boundingBox: details._boarding_pass_bbox || null,
    passengerName: details._boarding_pass_passenger || null,
    flightInfo: details._boarding_pass_flight_info || null,
    confidence: details._boarding_pass_confidence || 'none',
  };
}

/**
 * Delete boarding pass data from a reservation.
 */
export async function deleteBoardingPassFromReservation(
  reservationId: string
): Promise<void> {
  const { data: reservation, error: fetchError } = await supabase
    .from('reservations')
    .select('details')
    .eq('id', reservationId)
    .single();

  if (fetchError) throw new Error(`Failed to fetch reservation: ${fetchError.message}`);

  const currentDetails = { ...(reservation?.details || {}) };

  // Remove all boarding pass fields
  delete currentDetails._boarding_pass_original_url;
  delete currentDetails._boarding_pass_qr_data;
  delete currentDetails._boarding_pass_qr_type;
  delete currentDetails._boarding_pass_bbox;
  delete currentDetails._boarding_pass_passenger;
  delete currentDetails._boarding_pass_flight_info;
  delete currentDetails._boarding_pass_confidence;
  delete currentDetails._boarding_pass_updated_at;

  const { error: updateError } = await supabase
    .from('reservations')
    .update({ details: currentDetails })
    .eq('id', reservationId);

  if (updateError) throw new Error(`Failed to delete boarding pass: ${updateError.message}`);

  // Clean up local cache
  try {
    const localPath = `${CACHE_DIR}${reservationId}.jpg`;
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists) {
      await FileSystem.deleteAsync(localPath);
    }
  } catch (e) {
    // Ignore cache cleanup errors
  }
}

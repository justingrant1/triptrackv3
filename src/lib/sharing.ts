/**
 * Sharing utilities for generating and handling deep links
 */

import * as Linking from 'expo-linking';
import { Share, Platform } from 'react-native';
import type { Trip } from './types/database';

/**
 * Generate a deep link URL for a trip
 */
export function generateTripDeepLink(tripId: string): string {
  // For production, this would be a universal link like https://triptrack.app/trip/[id]
  // For now, we'll use the custom scheme
  return Linking.createURL(`/trip/${tripId}`);
}

/**
 * Generate a shareable message for a trip
 */
export function generateTripShareMessage(trip: Trip): string {
  const deepLink = generateTripDeepLink(trip.id);
  
  return `Check out my trip to ${trip.destination}! 🌍

${trip.name}
${new Date(trip.start_date).toLocaleDateString()} - ${new Date(trip.end_date).toLocaleDateString()}

View in TripTrack: ${deepLink}`;
}

/**
 * Share a trip using the native share sheet
 */
export async function shareTripNative(trip: Trip): Promise<boolean> {
  try {
    const message = generateTripShareMessage(trip);
    
    const result = await Share.share(
      {
        message,
        title: `Trip to ${trip.destination}`,
        url: Platform.OS === 'ios' ? generateTripDeepLink(trip.id) : undefined,
      },
      {
        dialogTitle: `Share ${trip.name}`,
        subject: `Trip to ${trip.destination}`,
      }
    );

    return result.action === Share.sharedAction;
  } catch (error) {
    console.error('Failed to share trip:', error);
    return false;
  }
}

/**
 * Parse a deep link URL and extract the trip ID
 */
export function parseTripDeepLink(url: string): string | null {
  try {
    const { path, queryParams } = Linking.parse(url);
    
    // Handle /trip/[id] format
    if (path?.startsWith('trip/')) {
      const tripId = path.replace('trip/', '');
      return tripId || null;
    }
    
    // Handle query param format (?tripId=xxx)
    if (queryParams?.tripId) {
      return queryParams.tripId as string;
    }
    
    return null;
  } catch (error) {
    console.error('Failed to parse deep link:', error);
    return null;
  }
}

/**
 * Handle an incoming deep link
 */
export async function handleDeepLink(url: string): Promise<{ type: 'trip'; id: string } | null> {
  const tripId = parseTripDeepLink(url);
  
  if (tripId) {
    return { type: 'trip', id: tripId };
  }
  
  return null;
}

/**
 * Get the initial deep link URL (if app was opened via deep link)
 */
export async function getInitialDeepLink(): Promise<string | null> {
  try {
    const url = await Linking.getInitialURL();
    return url;
  } catch (error) {
    console.error('Failed to get initial URL:', error);
    return null;
  }
}

/**
 * Subscribe to deep link events
 */
export function subscribeToDeepLinks(
  callback: (url: string) => void
): { remove: () => void } {
  const subscription = Linking.addEventListener('url', (event) => {
    callback(event.url);
  });
  
  return subscription;
}

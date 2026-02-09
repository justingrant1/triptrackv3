/**
 * Push Notifications Service
 * Handles notification permissions, registration, scheduling,
 * and smart local reminders with deduplication.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const REMINDER_STORAGE_KEY = '@triptrack_reminders';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request notification permissions and get push token
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications only work on physical devices');
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    console.log('Push token:', token);

    // Configure Android channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3B82F6',
      });
    }

    return token;
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }
}

/**
 * Save push token to user profile
 */
export async function savePushToken(token: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Update profile with push token
    const { error } = await supabase
      .from('profiles')
      .update({ push_token: token })
      .eq('id', user.id);

    if (error) throw error;
  } catch (error) {
    console.error('Error saving push token:', error);
  }
}

/**
 * Schedule a local notification
 */
export async function scheduleNotification(
  title: string,
  body: string,
  trigger: Date | number,
  data?: any
): Promise<string> {
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
    },
    trigger:
      typeof trigger === 'number'
        ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: trigger }
        : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
  });

  return notificationId;
}

/**
 * Cancel a scheduled notification
 */
export async function cancelNotification(notificationId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Get all scheduled notifications
 */
export async function getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  return await Notifications.getAllScheduledNotificationsAsync();
}

/**
 * Schedule trip reminder notifications
 */
export async function scheduleTripReminders(
  tripName: string,
  startDate: Date,
  tripId: string
): Promise<void> {
  const now = new Date();
  const timeUntilTrip = startDate.getTime() - now.getTime();
  const hoursUntilTrip = timeUntilTrip / (1000 * 60 * 60);

  // Schedule notifications at different intervals
  const reminders = [
    { hours: 24, title: 'Trip Tomorrow!', body: `${tripName} starts tomorrow. Ready to go?` },
    { hours: 2, title: 'Trip Starting Soon', body: `${tripName} starts in 2 hours!` },
  ];

  for (const reminder of reminders) {
    if (hoursUntilTrip > reminder.hours) {
      const triggerDate = new Date(startDate.getTime() - reminder.hours * 60 * 60 * 1000);
      
      await scheduleNotification(
        reminder.title,
        reminder.body,
        triggerDate,
        { tripId, type: 'trip_reminder' }
      );
    }
  }
}

/**
 * Schedule reservation reminder
 */
export async function scheduleReservationReminder(
  title: string,
  startTime: Date,
  reservationId: string,
  type: string
): Promise<void> {
  const now = new Date();
  const timeUntilReservation = startTime.getTime() - now.getTime();
  const hoursUntilReservation = timeUntilReservation / (1000 * 60 * 60);

  // Different reminder times based on reservation type
  let reminderHours = 2; // Default 2 hours
  if (type === 'flight') {
    reminderHours = 3; // 3 hours for flights
  } else if (type === 'hotel') {
    reminderHours = 4; // 4 hours for hotel check-in
  }

  if (hoursUntilReservation > reminderHours) {
    const triggerDate = new Date(startTime.getTime() - reminderHours * 60 * 60 * 1000);
    
    await scheduleNotification(
      `${type.charAt(0).toUpperCase() + type.slice(1)} Reminder`,
      `${title} in ${reminderHours} hours`,
      triggerDate,
      { reservationId, type: 'reservation_reminder' }
    );
  }
}

/**
 * Send immediate notification (for testing)
 */
export async function sendTestNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'TripTrack Test 🎉',
      body: 'Notifications are working!',
      data: { test: true },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1 },
  });
}

// ─── Smart Reminder Deduplication ────────────────────────────────────────────

/**
 * Get stored reminder notification IDs for a given entity (reservation or trip).
 */
async function getStoredReminderIds(entityId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(REMINDER_STORAGE_KEY);
    const map: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    return map[entityId] ?? [];
  } catch {
    return [];
  }
}

/**
 * Store reminder notification IDs for a given entity.
 */
async function storeReminderIds(entityId: string, notificationIds: string[]): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(REMINDER_STORAGE_KEY);
    const map: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    if (notificationIds.length === 0) {
      delete map[entityId];
    } else {
      map[entityId] = notificationIds;
    }
    await AsyncStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(map));
  } catch (error) {
    console.error('[Reminders] Failed to store reminder IDs:', error);
  }
}

/**
 * Cancel all existing local reminders for a given entity (reservation or trip).
 */
async function cancelRemindersForEntity(entityId: string): Promise<void> {
  const existingIds = await getStoredReminderIds(entityId);
  for (const id of existingIds) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // Notification may have already fired or been dismissed — ignore
    }
  }
  await storeReminderIds(entityId, []);
}

/**
 * Reschedule all local reminders for a reservation.
 * Cancels any existing reminders first, then schedules new ones based on current times.
 * This is the single entry point — call it on create, update, or after flight status changes.
 */
export async function rescheduleRemindersForReservation(reservation: {
  id: string;
  title: string;
  type: string;
  start_time: string;
  trip_id: string;
}): Promise<void> {
  // Cancel existing reminders for this reservation
  await cancelRemindersForEntity(reservation.id);

  const startTime = new Date(reservation.start_time);
  const now = new Date();
  const hoursUntil = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Don't schedule reminders for past events
  if (hoursUntil <= 0) return;

  const newIds: string[] = [];

  // Type-specific reminder schedule
  const reminders: Array<{ hours: number; title: string; body: string }> = [];

  switch (reservation.type) {
    case 'flight':
      if (hoursUntil > 3) {
        reminders.push({
          hours: 3,
          title: '✈️ Flight in 3 Hours',
          body: `${reservation.title} — time to head to the airport`,
        });
      }
      if (hoursUntil > 24) {
        reminders.push({
          hours: 24,
          title: '✈️ Flight Tomorrow',
          body: `${reservation.title} departs tomorrow. Check in online!`,
        });
      }
      break;

    case 'hotel':
      if (hoursUntil > 4) {
        reminders.push({
          hours: 4,
          title: '🏨 Check-in in 4 Hours',
          body: `${reservation.title} — check-in time approaching`,
        });
      }
      break;

    case 'car':
      if (hoursUntil > 2) {
        reminders.push({
          hours: 2,
          title: '🚗 Car Pickup in 2 Hours',
          body: `${reservation.title} — don't forget your license`,
        });
      }
      break;

    case 'train':
      if (hoursUntil > 2) {
        reminders.push({
          hours: 2,
          title: '🚂 Train in 2 Hours',
          body: `${reservation.title} — head to the station`,
        });
      }
      break;

    default:
      if (hoursUntil > 1) {
        reminders.push({
          hours: 1,
          title: '📅 Event in 1 Hour',
          body: `${reservation.title} starts soon`,
        });
      }
      break;
  }

  // Schedule each reminder
  for (const reminder of reminders) {
    const triggerDate = new Date(startTime.getTime() - reminder.hours * 60 * 60 * 1000);

    // Only schedule if trigger is in the future
    if (triggerDate.getTime() > now.getTime()) {
      try {
        const notifId = await scheduleNotification(
          reminder.title,
          reminder.body,
          triggerDate,
          {
            reservationId: reservation.id,
            tripId: reservation.trip_id,
            type: 'reservation_reminder',
          }
        );
        newIds.push(notifId);
      } catch (error) {
        console.error('[Reminders] Failed to schedule:', error);
      }
    }
  }

  // Store the new IDs for future cancellation
  if (newIds.length > 0) {
    await storeReminderIds(reservation.id, newIds);
    console.log(`[Reminders] Scheduled ${newIds.length} reminder(s) for ${reservation.title}`);
  }
}

/**
 * Reschedule all local reminders for a trip.
 * Cancels existing trip-level reminders, then schedules new ones.
 */
export async function rescheduleRemindersForTrip(trip: {
  id: string;
  name: string;
  start_date: string;
}): Promise<void> {
  const tripKey = `trip_${trip.id}`;
  await cancelRemindersForEntity(tripKey);

  const startDate = new Date(trip.start_date);
  const now = new Date();
  const hoursUntil = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntil <= 0) return;

  const newIds: string[] = [];

  const reminders = [
    { hours: 24, title: '🧳 Trip Tomorrow!', body: `${trip.name} starts tomorrow. Ready to go?` },
    { hours: 2, title: '🧳 Trip Starting Soon', body: `${trip.name} starts in 2 hours!` },
  ];

  for (const reminder of reminders) {
    if (hoursUntil > reminder.hours) {
      const triggerDate = new Date(startDate.getTime() - reminder.hours * 60 * 60 * 1000);
      if (triggerDate.getTime() > now.getTime()) {
        try {
          const notifId = await scheduleNotification(
            reminder.title,
            reminder.body,
            triggerDate,
            { tripId: trip.id, type: 'trip_reminder' }
          );
          newIds.push(notifId);
        } catch (error) {
          console.error('[Reminders] Failed to schedule trip reminder:', error);
        }
      }
    }
  }

  if (newIds.length > 0) {
    await storeReminderIds(tripKey, newIds);
    console.log(`[Reminders] Scheduled ${newIds.length} trip reminder(s) for ${trip.name}`);
  }
}

/**
 * Cancel all reminders for a reservation (call on delete).
 */
export async function cancelRemindersForReservation(reservationId: string): Promise<void> {
  await cancelRemindersForEntity(reservationId);
  console.log(`[Reminders] Cancelled reminders for reservation ${reservationId}`);
}

/**
 * Cancel all reminders for a trip (call on delete).
 */
export async function cancelRemindersForTrip(tripId: string): Promise<void> {
  await cancelRemindersForEntity(`trip_${tripId}`);
  console.log(`[Reminders] Cancelled reminders for trip ${tripId}`);
}

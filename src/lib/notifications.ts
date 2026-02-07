/**
 * Push Notifications Service
 * Handles notification permissions, registration, and scheduling
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

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

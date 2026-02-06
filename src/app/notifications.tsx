import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  Bell,
  Plane,
  AlertCircle,
  CheckCircle,
  Clock,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTripStore } from '@/lib/store';
import { formatDate, formatTime } from '@/lib/utils';

interface Notification {
  id: string;
  type: 'gate_change' | 'delay' | 'reminder' | 'confirmation';
  title: string;
  message: string;
  time: Date;
  read: boolean;
  tripId?: string;
}

// Mock notifications
const mockNotifications: Notification[] = [
  {
    id: '1',
    type: 'gate_change',
    title: 'Gate Changed',
    message: 'Flight AA 182 gate changed from B8 to B12',
    time: new Date(Date.now() - 30 * 60 * 1000),
    read: false,
    tripId: 'trip-1',
  },
  {
    id: '2',
    type: 'reminder',
    title: 'Leave for Airport',
    message: 'Recommended departure in 2 hours to make your flight',
    time: new Date(Date.now() - 2 * 60 * 60 * 1000),
    read: false,
    tripId: 'trip-1',
  },
  {
    id: '3',
    type: 'confirmation',
    title: 'Hotel Confirmed',
    message: 'Your reservation at The William Vale has been confirmed',
    time: new Date(Date.now() - 24 * 60 * 60 * 1000),
    read: true,
    tripId: 'trip-1',
  },
  {
    id: '4',
    type: 'confirmation',
    title: 'Trip Created',
    message: 'Austin Tech Summit trip has been added to your calendar',
    time: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    read: true,
    tripId: 'trip-2',
  },
];

const getNotificationIcon = (type: Notification['type']) => {
  switch (type) {
    case 'gate_change':
      return <AlertCircle size={20} color="#F59E0B" />;
    case 'delay':
      return <Clock size={20} color="#EF4444" />;
    case 'reminder':
      return <Bell size={20} color="#3B82F6" />;
    case 'confirmation':
      return <CheckCircle size={20} color="#10B981" />;
  }
};

const getNotificationColor = (type: Notification['type']) => {
  switch (type) {
    case 'gate_change':
      return '#F59E0B';
    case 'delay':
      return '#EF4444';
    case 'reminder':
      return '#3B82F6';
    case 'confirmation':
      return '#10B981';
  }
};

function NotificationItem({ notification, index }: { notification: Notification; index: number }) {
  const router = useRouter();
  const color = getNotificationColor(notification.type);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (notification.tripId) {
      router.push(`/trip/${notification.tripId}`);
    }
  };

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMs / 3600000);
    const diffDays = Math.round(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    return formatDate(date);
  };

  return (
    <Animated.View entering={FadeInRight.duration(400).delay(index * 80)}>
      <Pressable
        onPress={handlePress}
        className={`rounded-2xl p-4 flex-row border mb-3 ${
          notification.read
            ? 'bg-slate-800/30 border-slate-700/30'
            : 'bg-slate-800/60 border-slate-700/50'
        }`}
      >
        <View style={{ backgroundColor: color + '20', padding: 10, borderRadius: 12 }}>
          {getNotificationIcon(notification.type)}
        </View>
        <View className="flex-1 ml-3">
          <View className="flex-row items-center justify-between">
            <Text
              className={`font-semibold ${notification.read ? 'text-slate-400' : 'text-white'}`}
              style={{ fontFamily: 'DMSans_700Bold' }}
            >
              {notification.title}
            </Text>
            {!notification.read && (
              <View className="w-2 h-2 rounded-full bg-blue-500" />
            )}
          </View>
          <Text
            className={`text-sm mt-1 ${notification.read ? 'text-slate-500' : 'text-slate-400'}`}
            style={{ fontFamily: 'DMSans_400Regular' }}
          >
            {notification.message}
          </Text>
          <Text
            className="text-slate-600 text-xs mt-2"
            style={{ fontFamily: 'SpaceMono_400Regular' }}
          >
            {getTimeAgo(notification.time)}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications] = React.useState(mockNotifications);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <View className="flex-1 bg-slate-950">
      <LinearGradient
        colors={['#0F172A', '#020617']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Header */}
        <View className="flex-row items-center px-5 py-4">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            className="bg-slate-800/80 p-2.5 rounded-full border border-slate-700/50 mr-4"
          >
            <ChevronLeft size={22} color="#FFFFFF" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-white text-xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
              Notifications
            </Text>
            {unreadCount > 0 && (
              <Text className="text-slate-400 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                {unreadCount} unread
              </Text>
            )}
          </View>
          {unreadCount > 0 && (
            <Pressable
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              className="px-3 py-1.5"
            >
              <Text className="text-blue-400 text-sm" style={{ fontFamily: 'DMSans_500Medium' }}>
                Mark all read
              </Text>
            </Pressable>
          )}
        </View>

        <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
          {notifications.length > 0 ? (
            notifications.map((notification, index) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                index={index}
              />
            ))
          ) : (
            <Animated.View
              entering={FadeInDown.duration(600)}
              className="bg-slate-800/30 rounded-3xl p-8 items-center border border-slate-700/30 mt-8"
            >
              <View className="bg-slate-700/30 p-4 rounded-full mb-4">
                <Bell size={32} color="#64748B" />
              </View>
              <Text className="text-slate-300 text-lg font-semibold text-center" style={{ fontFamily: 'DMSans_700Bold' }}>
                No notifications
              </Text>
              <Text className="text-slate-500 text-sm text-center mt-2" style={{ fontFamily: 'DMSans_400Regular' }}>
                We'll notify you about gate changes, delays, and reminders
              </Text>
            </Animated.View>
          )}

          <View className="h-8" />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

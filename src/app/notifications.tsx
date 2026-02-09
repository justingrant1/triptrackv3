import React from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
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
  Trash2,
  Settings,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDeleteNotification,
} from '@/lib/hooks/useNotifications';
import type { Notification } from '@/lib/types/database';
import { formatDate } from '@/lib/utils';

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
    case 'trip_summary':
      return <Plane size={20} color="#8B5CF6" />;
    default:
      return <Bell size={20} color="#64748B" />;
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
    case 'trip_summary':
      return '#8B5CF6';
    default:
      return '#64748B';
  }
};

function NotificationItem({
  notification,
  index,
  onPress,
  onDelete,
}: {
  notification: Notification;
  index: number;
  onPress: () => void;
  onDelete: () => void;
}) {
  const color = getNotificationColor(notification.type);

  const getTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMs / 3600000);
    const diffDays = Math.round(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    return formatDate(date);
  };

  return (
    <Animated.View entering={FadeInRight.duration(400).delay(index * 60)}>
      <Pressable
        onPress={onPress}
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
              className={`font-semibold flex-1 ${notification.read ? 'text-slate-400' : 'text-white'}`}
              style={{ fontFamily: 'DMSans_700Bold' }}
              numberOfLines={1}
            >
              {notification.title}
            </Text>
            <View className="flex-row items-center ml-2">
              {!notification.read && (
                <View className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
              )}
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onDelete();
                }}
                hitSlop={8}
                className="p-1"
              >
                <Trash2 size={14} color="#475569" />
              </Pressable>
            </View>
          </View>
          <Text
            className={`text-sm mt-1 ${notification.read ? 'text-slate-500' : 'text-slate-400'}`}
            style={{ fontFamily: 'DMSans_400Regular' }}
            numberOfLines={2}
          >
            {notification.message}
          </Text>
          <Text
            className="text-slate-600 text-xs mt-2"
            style={{ fontFamily: 'SpaceMono_400Regular' }}
          >
            {getTimeAgo(notification.created_at)}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { data: notifications = [], isLoading, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const deleteNotification = useDeleteNotification();
  const [refreshing, setRefreshing] = React.useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Clear iOS badge when this screen mounts
  React.useEffect(() => {
    Notifications.setBadgeCountAsync(0);
  }, []);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleNotificationPress = (notification: Notification) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Mark as read
    if (!notification.read) {
      markRead.mutate(notification.id);
    }

    // Navigate to trip if available
    if (notification.trip_id) {
      router.push(`/trip/${notification.trip_id}`);
    }
  };

  const handleDelete = (notificationId: string) => {
    deleteNotification.mutate(notificationId);
  };

  const handleMarkAllRead = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    markAllRead.mutate();
  };

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
          <View className="flex-row items-center gap-2">
            {unreadCount > 0 && (
              <Pressable
                onPress={handleMarkAllRead}
                className="px-3 py-1.5"
                disabled={markAllRead.isPending}
              >
                <Text className="text-blue-400 text-sm" style={{ fontFamily: 'DMSans_500Medium' }}>
                  {markAllRead.isPending ? 'Marking...' : 'Mark all read'}
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/notification-settings');
              }}
              className="bg-slate-800/80 p-2 rounded-full border border-slate-700/50"
            >
              <Settings size={18} color="#94A3B8" />
            </Pressable>
          </View>
        </View>

        <ScrollView
          className="flex-1 px-5"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#3b82f6"
            />
          }
        >
          {isLoading ? (
            <View className="items-center justify-center py-20">
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text className="text-slate-400 mt-4" style={{ fontFamily: 'DMSans_400Regular' }}>
                Loading notifications...
              </Text>
            </View>
          ) : notifications.length > 0 ? (
            notifications.map((notification, index) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                index={index}
                onPress={() => handleNotificationPress(notification)}
                onDelete={() => handleDelete(notification.id)}
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
                We'll notify you about gate changes, delays, and reminders for your upcoming flights
              </Text>
            </Animated.View>
          )}

          <View className="h-8" />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

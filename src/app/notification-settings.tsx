import React from 'react';
import { View, Text, ScrollView, Pressable, Switch, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  Plane,
  Bell,
  Clock,
  AlertCircle,
  Mail,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/lib/hooks/useNotificationPreferences';

interface NotificationSetting {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  iconColor: string;
  enabled: boolean;
}

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { data: preferences, isLoading } = useNotificationPreferences();
  const updatePreferences = useUpdateNotificationPreferences();

  const settingsConfig: NotificationSetting[] = [
    {
      id: 'flight_updates',
      title: 'Flight Updates',
      description: 'Gate changes, delays, and cancellations',
      icon: <Plane size={20} color="#3B82F6" />,
      iconColor: '#3B82F6',
      enabled: preferences?.flight_updates ?? true,
    },
    {
      id: 'departure_reminders',
      title: 'Departure Reminders',
      description: 'Remind me when to leave for the airport',
      icon: <Clock size={20} color="#10B981" />,
      iconColor: '#10B981',
      enabled: preferences?.departure_reminders ?? true,
    },
    {
      id: 'checkin_alerts',
      title: 'Check-in Alerts',
      description: 'Notify when online check-in opens',
      icon: <Bell size={20} color="#F59E0B" />,
      iconColor: '#F59E0B',
      enabled: preferences?.checkin_alerts ?? true,
    },
    {
      id: 'trip_changes',
      title: 'Trip Changes',
      description: 'Updates when reservations are modified',
      icon: <AlertCircle size={20} color="#EF4444" />,
      iconColor: '#EF4444',
      enabled: preferences?.trip_changes ?? true,
    },
    {
      id: 'email_confirmations',
      title: 'Email Confirmations',
      description: 'Confirm when trips are added via email',
      icon: <Mail size={20} color="#8B5CF6" />,
      iconColor: '#8B5CF6',
      enabled: preferences?.email_confirmations ?? false,
    },
  ];

  const toggleSetting = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const currentValue = preferences?.[id as keyof typeof preferences] ?? false;
    
    try {
      await updatePreferences.mutateAsync({
        [id]: !currentValue,
      });
    } catch (error) {
      console.error('Failed to update notification preference:', error);
    }
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
          <Text className="text-white text-xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
            Notifications
          </Text>
        </View>

        <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(500)}>
            <Text className="text-slate-400 text-sm mb-4" style={{ fontFamily: 'DMSans_400Regular' }}>
              Choose which notifications you'd like to receive
            </Text>

            {isLoading ? (
              <View className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-8 items-center">
                <ActivityIndicator size="large" color="#3B82F6" />
              </View>
            ) : (
              <View className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
                {settingsConfig.map((setting, index) => (
                  <View
                    key={setting.id}
                    className={`flex-row items-center p-4 ${
                      index < settingsConfig.length - 1 ? 'border-b border-slate-700/30' : ''
                    }`}
                  >
                    <View style={{ backgroundColor: setting.iconColor + '20', padding: 10, borderRadius: 12 }}>
                      {setting.icon}
                    </View>
                    <View className="flex-1 ml-3">
                      <Text className="text-white font-medium" style={{ fontFamily: 'DMSans_500Medium' }}>
                        {setting.title}
                      </Text>
                      <Text className="text-slate-500 text-sm mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                        {setting.description}
                      </Text>
                    </View>
                    <Switch
                      value={setting.enabled}
                      onValueChange={() => toggleSetting(setting.id)}
                      trackColor={{ false: '#334155', true: '#3B82F6' }}
                      thumbColor={setting.enabled ? '#FFFFFF' : '#94A3B8'}
                      disabled={updatePreferences.isPending}
                    />
                  </View>
                ))}
              </View>
            )}
          </Animated.View>

          {/* Info Card */}
          <Animated.View
            entering={FadeInDown.duration(500).delay(100)}
            className="mt-6 bg-blue-500/10 rounded-2xl p-4 border border-blue-500/20"
          >
            <View className="flex-row items-start">
              <Bell size={20} color="#3B82F6" />
              <View className="flex-1 ml-3">
                <Text className="text-slate-300 text-sm font-medium" style={{ fontFamily: 'DMSans_500Medium' }}>
                  Push Notifications
                </Text>
                <Text className="text-slate-500 text-sm mt-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                  Make sure notifications are enabled in your device settings to receive alerts.
                </Text>
              </View>
            </View>
          </Animated.View>

          <View className="h-8" />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

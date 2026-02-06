import React from 'react';
import { View, Text, ScrollView, Pressable, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  Mail,
  Copy,
  ChevronRight,
  User,
  CreditCard,
  Bell,
  HelpCircle,
  LogOut,
  Shield,
  Sparkles,
  CheckCircle,
  ExternalLink,
  Link2,
  AtSign,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useTripStore } from '@/lib/store';

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-6">
      <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 px-1" style={{ fontFamily: 'SpaceMono_400Regular' }}>
        {title}
      </Text>
      <View className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
        {children}
      </View>
    </View>
  );
}

function MenuItem({
  icon,
  iconColor,
  label,
  sublabel,
  trailing,
  onPress,
  isLast = false,
  index = 0,
  badge,
}: {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  sublabel?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  isLast?: boolean;
  index?: number;
  badge?: React.ReactNode;
}) {
  return (
    <Animated.View entering={FadeInRight.duration(400).delay(index * 50)}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress?.();
        }}
        className={`flex-row items-center p-4 ${!isLast ? 'border-b border-slate-700/30' : ''}`}
      >
        <View style={{ backgroundColor: iconColor + '20', padding: 8, borderRadius: 10 }}>
          {icon}
        </View>
        <View className="flex-1 ml-3">
          <View className="flex-row items-center">
            <Text className="text-white font-medium" style={{ fontFamily: 'DMSans_500Medium' }}>
              {label}
            </Text>
            {badge}
          </View>
          {sublabel && (
            <Text className="text-slate-500 text-sm mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
              {sublabel}
            </Text>
          )}
        </View>
        {trailing ?? <ChevronRight size={18} color="#64748B" />}
      </Pressable>
    </Animated.View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const user = useTripStore((s) => s.user);
  const [copied, setCopied] = React.useState(false);
  const copyScale = useSharedValue(1);

  const handleCopyEmail = async () => {
    if (user?.forwardingEmail) {
      await Clipboard.setStringAsync(user.forwardingEmail);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCopied(true);
      copyScale.value = withSequence(
        withSpring(1.2),
        withSpring(1)
      );
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: copyScale.value }],
  }));

  const getPlanBadge = () => {
    if (user?.plan === 'pro') {
      return (
        <View className="bg-purple-500/20 px-2 py-0.5 rounded-full flex-row items-center">
          <Sparkles size={10} color="#A855F7" />
          <Text className="text-purple-400 text-xs ml-1 font-medium" style={{ fontFamily: 'DMSans_500Medium' }}>
            Pro
          </Text>
        </View>
      );
    }
    return null;
  };

  return (
    <View className="flex-1 bg-slate-950">
      <LinearGradient
        colors={['#0F172A', '#020617']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView className="flex-1" edges={['top']}>
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          {/* Header */}
          <Animated.View
            entering={FadeInDown.duration(500)}
            className="px-5 pt-4 pb-6"
          >
            <Text className="text-white text-2xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
              Profile
            </Text>
          </Animated.View>

          {/* User Card */}
          <Animated.View
            entering={FadeInDown.duration(500).delay(100)}
            className="mx-5 mb-6"
          >
            <Pressable onPress={() => router.push('/edit-profile')}>
              <View className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
                <View className="flex-row items-center">
                  <View className="w-16 h-16 rounded-full bg-blue-500 items-center justify-center">
                    <Text className="text-white text-2xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                      {user?.name?.charAt(0) ?? 'A'}
                    </Text>
                  </View>
                  <View className="flex-1 ml-4">
                    <View className="flex-row items-center">
                      <Text className="text-white text-lg font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                        {user?.name ?? 'Alex Chen'}
                      </Text>
                      <View className="ml-2">{getPlanBadge()}</View>
                    </View>
                    <Text className="text-slate-400 text-sm mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                      {user?.email ?? 'alex@startup.io'}
                    </Text>
                  </View>
                  <ChevronRight size={20} color="#64748B" />
                </View>
              </View>
            </Pressable>
          </Animated.View>

          {/* Email Forwarding Card */}
          <Animated.View
            entering={FadeInDown.duration(500).delay(200)}
            className="mx-5 mb-6"
          >
            <LinearGradient
              colors={['#3B82F6', '#1D4ED8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 20, padding: 1 }}
            >
              <View className="bg-slate-900/95 rounded-[19px] p-5">
                <View className="flex-row items-center mb-3">
                  <View className="bg-blue-500/20 p-2.5 rounded-xl">
                    <Mail size={20} color="#3B82F6" />
                  </View>
                  <View className="ml-3">
                    <Text className="text-white font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                      Email Forwarding
                    </Text>
                    <Text className="text-slate-400 text-xs" style={{ fontFamily: 'DMSans_400Regular' }}>
                      Forward travel emails to add trips
                    </Text>
                  </View>
                </View>

                <Pressable
                  onPress={handleCopyEmail}
                  className="bg-slate-800/80 rounded-xl p-4 flex-row items-center justify-between"
                >
                  <View>
                    <Text className="text-slate-400 text-xs" style={{ fontFamily: 'DMSans_400Regular' }}>
                      Your forwarding address
                    </Text>
                    <Text className="text-white text-base mt-0.5" style={{ fontFamily: 'SpaceMono_700Bold' }}>
                      {user?.forwardingEmail ?? 'plans@triptrack.ai'}
                    </Text>
                  </View>
                  <Animated.View style={copyAnimatedStyle}>
                    {copied ? (
                      <CheckCircle size={20} color="#10B981" />
                    ) : (
                      <Copy size={20} color="#64748B" />
                    )}
                  </Animated.View>
                </Pressable>

                <View className="mt-4 gap-2">
                  <Text className="text-slate-300 text-sm font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                    How it works:
                  </Text>
                  <View className="flex-row items-start">
                    <View className="w-5 h-5 rounded-full bg-blue-500/20 items-center justify-center mt-0.5">
                      <Text className="text-blue-400 text-xs font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>1</Text>
                    </View>
                    <Text className="text-slate-400 text-sm ml-2 flex-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                      Forward flight, hotel, or car confirmations
                    </Text>
                  </View>
                  <View className="flex-row items-start">
                    <View className="w-5 h-5 rounded-full bg-blue-500/20 items-center justify-center mt-0.5">
                      <Text className="text-blue-400 text-xs font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>2</Text>
                    </View>
                    <Text className="text-slate-400 text-sm ml-2 flex-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                      AI extracts dates, times, and details
                    </Text>
                  </View>
                  <View className="flex-row items-start">
                    <View className="w-5 h-5 rounded-full bg-blue-500/20 items-center justify-center mt-0.5">
                      <Text className="text-blue-400 text-xs font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>3</Text>
                    </View>
                    <Text className="text-slate-400 text-sm ml-2 flex-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                      Your trip appears automatically
                    </Text>
                  </View>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Menu Sections */}
          <View className="px-5">
            {/* Email & Connections */}
            <MenuSection title="Email & Connections">
              <MenuItem
                icon={<Link2 size={18} color="#10B981" />}
                iconColor="#10B981"
                label="Connect Gmail"
                sublabel="Auto-scan travel emails"
                onPress={() => router.push('/connected-accounts')}
                index={0}
                badge={
                  <View className="bg-emerald-500/20 px-2 py-0.5 rounded-full ml-2">
                    <Text className="text-emerald-400 text-xs" style={{ fontFamily: 'DMSans_500Medium' }}>
                      1 connected
                    </Text>
                  </View>
                }
              />
              <MenuItem
                icon={<AtSign size={18} color="#3B82F6" />}
                iconColor="#3B82F6"
                label="Trusted Emails"
                sublabel="Manage allowed senders"
                onPress={() => router.push('/trusted-emails')}
                index={1}
                isLast
              />
            </MenuSection>

            {/* Account */}
            <MenuSection title="Account">
              <MenuItem
                icon={<User size={18} color="#3B82F6" />}
                iconColor="#3B82F6"
                label="Edit Profile"
                onPress={() => router.push('/edit-profile')}
                index={2}
              />
              <MenuItem
                icon={<CreditCard size={18} color="#8B5CF6" />}
                iconColor="#8B5CF6"
                label="Subscription"
                sublabel="Pro Plan"
                onPress={() => router.push('/subscription')}
                index={3}
              />
              <MenuItem
                icon={<Bell size={18} color="#F59E0B" />}
                iconColor="#F59E0B"
                label="Notifications"
                onPress={() => router.push('/notification-settings')}
                index={4}
                isLast
              />
            </MenuSection>

            <MenuSection title="Support">
              <MenuItem
                icon={<HelpCircle size={18} color="#06B6D4" />}
                iconColor="#06B6D4"
                label="Help Center"
                onPress={() => Linking.openURL('https://triptrack.ai/help')}
                index={5}
                trailing={<ExternalLink size={16} color="#64748B" />}
              />
              <MenuItem
                icon={<Shield size={18} color="#10B981" />}
                iconColor="#10B981"
                label="Privacy Policy"
                onPress={() => Linking.openURL('https://triptrack.ai/privacy')}
                index={6}
                trailing={<ExternalLink size={16} color="#64748B" />}
                isLast
              />
            </MenuSection>

            <MenuSection title="Danger Zone">
              <MenuItem
                icon={<LogOut size={18} color="#EF4444" />}
                iconColor="#EF4444"
                label="Sign Out"
                onPress={() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)}
                index={7}
                isLast
                trailing={null}
              />
            </MenuSection>
          </View>

          {/* Version */}
          <View className="items-center py-8">
            <Text className="text-slate-600 text-xs" style={{ fontFamily: 'SpaceMono_400Regular' }}>
              TripTrack.ai v1.0.0
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

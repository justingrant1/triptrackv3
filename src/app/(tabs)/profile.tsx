import React, { useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Linking, RefreshControl, Share, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  Mail,
  Copy,
  ChevronRight,
  ChevronDown,
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
  Trash2,
  Star,
  Share2,
  Plane,
  Globe,
  CalendarDays,
  DollarSign,
  Crown,
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
import Constants from 'expo-constants';
import { useAuthStore } from '@/lib/state/auth-store';
import { useProfile, useForwardingAddress } from '@/lib/hooks/useProfile';
import { useConnectedAccounts } from '@/lib/hooks/useConnectedAccounts';
import { useTrips } from '@/lib/hooks/useTrips';
import { useAllReceipts } from '@/lib/hooks/useReceipts';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { Alert, Image } from 'react-native';
import { deleteAccount } from '@/lib/auth';
import { parseDateOnly } from '@/lib/utils';

// Dynamic version from app config
const appVersion = Constants.expoConfig?.version || '1.0.0';
const buildNumber = Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode?.toString() || '0';

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
        {trailing !== undefined ? trailing : <ChevronRight size={18} color="#64748B" />}
      </Pressable>
    </Animated.View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { data: profile, refetch: refetchProfile } = useProfile();
  const { data: connectedAccounts, refetch: refetchAccounts } = useConnectedAccounts();
  const { data: forwardingAddress, isLoading: loadingAddress, refetch: refetchAddress } = useForwardingAddress();
  const { data: trips = [] } = useTrips();
  const { data: allReceipts = [] } = useAllReceipts();
  const { isPro } = useSubscription();
  const [copied, setCopied] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [showHowItWorks, setShowHowItWorks] = React.useState(false);
  const copyScale = useSharedValue(1);
  
  const connectedCount = connectedAccounts?.length || 0;

  // Compute travel stats
  const travelStats = React.useMemo(() => {
    const completedTrips = trips.filter(t => t.status === 'completed').length;
    const totalTrips = trips.length;
    
    // Unique destinations (cities)
    const destinations = new Set(trips.map(t => t.destination?.toLowerCase().trim()).filter(Boolean));
    
    // Total days traveling
    let totalDays = 0;
    for (const trip of trips) {
      if (trip.start_date && trip.end_date) {
        const start = parseDateOnly(trip.start_date);
        const end = parseDateOnly(trip.end_date);
        const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
        totalDays += days;
      }
    }
    
    // Total spend from receipts
    const totalSpend = allReceipts.reduce((sum, r) => sum + (r.amount || 0), 0);
    
    return {
      totalTrips,
      completedTrips,
      destinations: destinations.size,
      totalDays,
      totalSpend,
    };
  }, [trips, allReceipts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchProfile(), refetchAccounts(), refetchAddress()]);
    setRefreshing(false);
  }, [refetchProfile, refetchAccounts, refetchAddress]);

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await logout();
            router.replace('/login');
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data including trips, reservations, and receipts. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Alert.alert(
              'Are you absolutely sure?',
              'This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Forever',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const { error } = await deleteAccount();
                      if (error) {
                        Alert.alert('Error', error.message || 'Failed to delete account');
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                      } else {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        router.replace('/login');
                      }
                    } catch (error: any) {
                      Alert.alert('Error', error.message || 'Failed to delete account');
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleRateApp = () => {
    const iosUrl = 'https://apps.apple.com/app/triptrack/id6740043592?action=write-review';
    const androidUrl = 'market://details?id=com.triptrack.app';
    Linking.openURL(Platform.OS === 'ios' ? iosUrl : androidUrl).catch(() => {
      Linking.openURL('https://triptrack.ai');
    });
  };

  const handleShareApp = async () => {
    try {
      await Share.share({
        message: Platform.OS === 'ios'
          ? 'Check out TripTrack — it auto-organizes your travel plans from email! https://apps.apple.com/app/triptrack/id6740043592'
          : 'Check out TripTrack — it auto-organizes your travel plans from email! https://triptrack.ai',
      });
    } catch {
      // User cancelled
    }
  };

  const userName = profile?.name || user?.email?.split('@')[0] || 'User';
  const userInitial = userName.charAt(0).toUpperCase();
  const userPlan = profile?.plan || 'free';

  const handleCopyEmail = async () => {
    if (!forwardingAddress) return;
    
    await Clipboard.setStringAsync(forwardingAddress);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    copyScale.value = withSequence(
      withSpring(1.2),
      withSpring(1)
    );
    setTimeout(() => setCopied(false), 2000);
  };

  const copyAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: copyScale.value }],
  }));

  return (
    <View className="flex-1 bg-slate-950">
      <LinearGradient
        colors={['#0F172A', '#020617']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView className="flex-1" edges={['top']}>
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#3b82f6"
            />
          }
        >
          {/* Header */}
          <Animated.View
            entering={FadeInDown.duration(500)}
            className="px-5 pt-4 pb-6"
          >
            <Text className="text-white text-2xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
              Profile
            </Text>
          </Animated.View>

          {/* User Card with Pro Badge */}
          <Animated.View
            entering={FadeInDown.duration(500).delay(100)}
            className="mx-5 mb-6"
          >
            <Pressable onPress={() => router.push('/edit-profile')}>
              <View className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
                <View className="flex-row items-center">
                  {profile?.avatar_url ? (
                    <View className="w-16 h-16 rounded-full overflow-hidden bg-slate-700">
                      <Image
                        source={{ uri: profile.avatar_url }}
                        style={{ width: 64, height: 64 }}
                        resizeMode="cover"
                      />
                    </View>
                  ) : (
                    <View className="w-16 h-16 rounded-full bg-blue-500 items-center justify-center">
                      <Text className="text-white text-2xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                        {userInitial}
                      </Text>
                    </View>
                  )}
                  <View className="flex-1 ml-4">
                    <View className="flex-row items-center">
                      <Text className="text-white text-lg font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                        {userName}
                      </Text>
                      {isPro && (
                        <View className="bg-amber-500/20 px-2.5 py-1 rounded-full ml-2 flex-row items-center">
                          <Crown size={12} color="#F59E0B" />
                          <Text className="text-amber-400 text-xs font-bold ml-1" style={{ fontFamily: 'DMSans_700Bold' }}>
                            PRO
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-slate-400 text-sm mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                      {profile?.email || user?.email || 'user@example.com'}
                    </Text>
                    {!isPro && (
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.push('/subscription');
                        }}
                        className="mt-2 self-start"
                      >
                        <LinearGradient
                          colors={['#8B5CF6', '#6D28D9']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={{ borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 }}
                        >
                          <Text className="text-white text-xs font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                            ✨ Upgrade to Pro
                          </Text>
                        </LinearGradient>
                      </Pressable>
                    )}
                  </View>
                  <ChevronRight size={20} color="#64748B" />
                </View>
              </View>
            </Pressable>
          </Animated.View>

          {/* Travel Stats Card */}
          {travelStats.totalTrips > 0 && (
            <Animated.View
              entering={FadeInDown.duration(500).delay(150)}
              className="mx-5 mb-6"
            >
              <View className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-5">
                <Text className="text-slate-300 text-sm font-semibold mb-4" style={{ fontFamily: 'DMSans_700Bold' }}>
                  Your Travel Stats
                </Text>
                <View className="flex-row flex-wrap">
                  {/* Total Trips */}
                  <View className="w-1/2 mb-4 pr-2">
                    <View className="flex-row items-center mb-1">
                      <View className="bg-blue-500/15 p-1.5 rounded-lg mr-2">
                        <Plane size={14} color="#3B82F6" />
                      </View>
                      <Text className="text-white text-xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                        {travelStats.totalTrips}
                      </Text>
                    </View>
                    <Text className="text-slate-500 text-xs" style={{ fontFamily: 'DMSans_400Regular' }}>
                      Total Trips
                    </Text>
                  </View>

                  {/* Destinations */}
                  <View className="w-1/2 mb-4 pl-2">
                    <View className="flex-row items-center mb-1">
                      <View className="bg-emerald-500/15 p-1.5 rounded-lg mr-2">
                        <Globe size={14} color="#10B981" />
                      </View>
                      <Text className="text-white text-xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                        {travelStats.destinations}
                      </Text>
                    </View>
                    <Text className="text-slate-500 text-xs" style={{ fontFamily: 'DMSans_400Regular' }}>
                      Destinations
                    </Text>
                  </View>

                  {/* Days Traveling */}
                  <View className="w-1/2 pr-2">
                    <View className="flex-row items-center mb-1">
                      <View className="bg-purple-500/15 p-1.5 rounded-lg mr-2">
                        <CalendarDays size={14} color="#A855F7" />
                      </View>
                      <Text className="text-white text-xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                        {travelStats.totalDays}
                      </Text>
                    </View>
                    <Text className="text-slate-500 text-xs" style={{ fontFamily: 'DMSans_400Regular' }}>
                      Days Traveling
                    </Text>
                  </View>

                  {/* Total Spend */}
                  {travelStats.totalSpend > 0 && (
                    <View className="w-1/2 pl-2">
                      <View className="flex-row items-center mb-1">
                        <View className="bg-amber-500/15 p-1.5 rounded-lg mr-2">
                          <DollarSign size={14} color="#F59E0B" />
                        </View>
                        <Text className="text-white text-xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                          ${travelStats.totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </Text>
                      </View>
                      <Text className="text-slate-500 text-xs" style={{ fontFamily: 'DMSans_400Regular' }}>
                        Total Tracked
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </Animated.View>
          )}

          {/* Email Forwarding Card — Compact with collapsible "How it works" */}
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
                  <View className="ml-3 flex-1">
                    <Text className="text-white font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                      Email Forwarding
                    </Text>
                    <Text className="text-slate-400 text-xs" style={{ fontFamily: 'DMSans_400Regular' }}>
                      Forward travel emails to add trips
                    </Text>
                  </View>
                </View>

                {loadingAddress ? (
                  <View className="bg-slate-800/80 rounded-xl p-4 items-center">
                    <Text className="text-slate-400 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                      Loading your address...
                    </Text>
                  </View>
                ) : forwardingAddress ? (
                  <Pressable
                    onPress={handleCopyEmail}
                    className="bg-slate-800/80 rounded-xl p-4 flex-row items-center justify-between"
                  >
                    <View className="flex-1">
                      <Text className="text-slate-400 text-xs" style={{ fontFamily: 'DMSans_400Regular' }}>
                        Your forwarding address
                      </Text>
                      <Text className="text-white text-sm mt-0.5" style={{ fontFamily: 'SpaceMono_700Bold' }} numberOfLines={1}>
                        {forwardingAddress}
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
                ) : (
                  <View className="bg-slate-800/80 rounded-xl p-4">
                    <Text className="text-slate-400 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                      Unable to load forwarding address
                    </Text>
                  </View>
                )}

                {/* Collapsible "How it works" */}
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowHowItWorks(!showHowItWorks);
                  }}
                  className="flex-row items-center justify-center mt-3 py-1"
                >
                  <Text className="text-blue-400 text-xs font-medium" style={{ fontFamily: 'DMSans_500Medium' }}>
                    {showHowItWorks ? 'Hide' : 'How it works'}
                  </Text>
                  <ChevronDown
                    size={14}
                    color="#60A5FA"
                    style={{ marginLeft: 4, transform: [{ rotate: showHowItWorks ? '180deg' : '0deg' }] }}
                  />
                </Pressable>

                {showHowItWorks && (
                  <Animated.View entering={FadeInDown.duration(300)} className="mt-2 gap-2">
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
                  </Animated.View>
                )}
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Menu Sections */}
          <View className="px-5">
            {/* Email & Connections */}
            <MenuSection title="Email & Connections">
              <MenuItem
                icon={<Sparkles size={18} color="#8B5CF6" />}
                iconColor="#8B5CF6"
                label="Parse Email"
                sublabel="Paste travel confirmation to add trip"
                onPress={() => router.push('/parse-email')}
                index={0}
              />
              <MenuItem
                icon={<Link2 size={18} color="#10B981" />}
                iconColor="#10B981"
                label="Connect Gmail"
                sublabel="Auto-scan travel emails"
                onPress={() => router.push('/connected-accounts')}
                index={1}
                badge={
                  connectedCount > 0 ? (
                    <View className="bg-emerald-500/20 px-2 py-0.5 rounded-full ml-2">
                      <Text className="text-emerald-400 text-xs" style={{ fontFamily: 'DMSans_500Medium' }}>
                        {connectedCount} connected
                      </Text>
                    </View>
                  ) : undefined
                }
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
                sublabel={isPro ? 'Pro Plan' : userPlan === 'team' ? 'Team Plan' : 'Free Plan'}
                onPress={() => router.push('/subscription')}
                index={3}
                badge={
                  isPro ? (
                    <View className="bg-amber-500/20 px-2 py-0.5 rounded-full ml-2">
                      <Text className="text-amber-400 text-xs font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                        ✨ Active
                      </Text>
                    </View>
                  ) : undefined
                }
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

            {/* Support */}
            <MenuSection title="Support">
              <MenuItem
                icon={<Star size={18} color="#F59E0B" />}
                iconColor="#F59E0B"
                label="Rate TripTrack"
                sublabel="Love the app? Leave a review!"
                onPress={handleRateApp}
                index={5}
                trailing={<ExternalLink size={16} color="#64748B" />}
              />
              <MenuItem
                icon={<Share2 size={18} color="#3B82F6" />}
                iconColor="#3B82F6"
                label="Share with Friends"
                sublabel="Help others organize their trips"
                onPress={handleShareApp}
                index={6}
                trailing={null}
              />
              <MenuItem
                icon={<HelpCircle size={18} color="#06B6D4" />}
                iconColor="#06B6D4"
                label="Help Center"
                onPress={() => Linking.openURL('https://triptrack.ai/help')}
                index={7}
                trailing={<ExternalLink size={16} color="#64748B" />}
              />
              <MenuItem
                icon={<Shield size={18} color="#10B981" />}
                iconColor="#10B981"
                label="Privacy Policy"
                onPress={() => Linking.openURL('https://triptrack.ai/privacy')}
                index={8}
                trailing={<ExternalLink size={16} color="#64748B" />}
                isLast
              />
            </MenuSection>

            {/* Sign Out — standalone, separated from Delete */}
            <View className="mb-6">
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  handleSignOut();
                }}
                className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-4 flex-row items-center justify-center"
              >
                <LogOut size={18} color="#94A3B8" />
                <Text className="text-slate-300 font-medium ml-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                  Sign Out
                </Text>
              </Pressable>
            </View>

            {/* Danger Zone — Delete Account only */}
            <MenuSection title="Danger Zone">
              <MenuItem
                icon={<Trash2 size={18} color="#DC2626" />}
                iconColor="#DC2626"
                label="Delete Account"
                sublabel="Permanently delete your account and all data"
                onPress={handleDeleteAccount}
                index={9}
                isLast
                trailing={null}
              />
            </MenuSection>
          </View>

          {/* Version — Dynamic */}
          <View className="items-center py-8">
            <Text className="text-slate-600 text-xs" style={{ fontFamily: 'SpaceMono_400Regular' }}>
              TripTrack v{appVersion} ({buildNumber})
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

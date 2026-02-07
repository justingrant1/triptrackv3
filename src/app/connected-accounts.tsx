import React from 'react';
import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  Plus,
  Check,
  RefreshCw,
  Unlink,
  Zap,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { UpgradeModal } from '@/components/UpgradeModal';

interface ConnectedAccount {
  id: string;
  provider: 'gmail' | 'outlook' | 'icloud';
  email: string;
  connected: boolean;
  lastSync?: Date;
}

const providerInfo = {
  gmail: {
    name: 'Gmail',
    color: '#EA4335',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Gmail_icon_%282020%29.svg/512px-Gmail_icon_%282020%29.svg.png',
  },
  outlook: {
    name: 'Outlook',
    color: '#0078D4',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Microsoft_Office_Outlook_%282018%E2%80%93present%29.svg/512px-Microsoft_Office_Outlook_%282018%E2%80%93present%29.svg.png',
  },
  icloud: {
    name: 'iCloud Mail',
    color: '#3693F3',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/ICloud_logo.svg/512px-ICloud_logo.svg.png',
  },
};

export default function ConnectedAccountsScreen() {
  const router = useRouter();
  const [accounts, setAccounts] = React.useState<ConnectedAccount[]>([
    {
      id: '1',
      provider: 'gmail',
      email: 'alex.chen@gmail.com',
      connected: true,
      lastSync: new Date(Date.now() - 5 * 60 * 1000),
    },
  ]);

  const [isConnecting, setIsConnecting] = React.useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = React.useState(false);
  const { canConnectGmail } = useSubscription();

  const handleConnectGmail = () => {
    // Check if user can connect Gmail (Pro feature)
    if (!canConnectGmail) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setShowUpgradeModal(true);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsConnecting(true);
    // Simulate OAuth flow
    setTimeout(() => {
      setIsConnecting(false);
      // In real app, this would open OAuth
    }, 1000);
  };

  const handleConnectOutlook = () => {
    // Check if user can connect Outlook (Pro feature)
    if (!canConnectGmail) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setShowUpgradeModal(true);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Would open Outlook OAuth
  };

  const handleDisconnect = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAccounts(accounts.filter(a => a.id !== id));
  };

  const handleSync = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAccounts(accounts.map(a =>
      a.id === id ? { ...a, lastSync: new Date() } : a
    ));
  };

  const getTimeSinceSync = (date?: Date) => {
    if (!date) return 'Never';
    const mins = Math.round((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.round(mins / 60)}h ago`;
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
            Connected Accounts
          </Text>
        </View>

        <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
          {/* Auto-Scan Info */}
          <Animated.View
            entering={FadeInDown.duration(500)}
            className="mb-6"
          >
            <LinearGradient
              colors={['#10B981', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 16, padding: 20 }}
            >
              <View className="flex-row items-center">
                <Zap size={24} color="#FFFFFF" />
                <View className="ml-3 flex-1">
                  <Text className="text-white font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                    Auto-Scan Enabled
                  </Text>
                  <Text className="text-white/80 text-sm mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                    We'll automatically find and add your travel emails
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Connected Accounts */}
          {accounts.length > 0 && (
            <Animated.View entering={FadeInDown.duration(500).delay(100)}>
              <Text className="text-slate-300 text-sm font-semibold uppercase tracking-wider mb-3" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                Connected
              </Text>

              <View className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden mb-6">
                {accounts.map((account, index) => {
                  const provider = providerInfo[account.provider];
                  return (
                    <Animated.View
                      key={account.id}
                      entering={FadeInRight.duration(400).delay(index * 50)}
                      className={`p-4 ${index < accounts.length - 1 ? 'border-b border-slate-700/30' : ''}`}
                    >
                      <View className="flex-row items-center">
                        <View className="w-12 h-12 rounded-xl bg-white items-center justify-center">
                          <Image
                            source={{ uri: provider.logo }}
                            className="w-7 h-7"
                            resizeMode="contain"
                          />
                        </View>
                        <View className="flex-1 ml-3">
                          <View className="flex-row items-center">
                            <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                              {provider.name}
                            </Text>
                            <View className="bg-emerald-500/20 px-2 py-0.5 rounded-full ml-2 flex-row items-center">
                              <Check size={10} color="#10B981" />
                              <Text className="text-emerald-400 text-xs ml-1" style={{ fontFamily: 'DMSans_500Medium' }}>
                                Connected
                              </Text>
                            </View>
                          </View>
                          <Text className="text-slate-400 text-sm mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                            {account.email}
                          </Text>
                          <Text className="text-slate-500 text-xs mt-1" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                            Last sync: {getTimeSinceSync(account.lastSync)}
                          </Text>
                        </View>
                      </View>

                      <View className="flex-row mt-3 gap-2">
                        <Pressable
                          onPress={() => handleSync(account.id)}
                          className="flex-1 bg-slate-700/50 py-2.5 rounded-xl flex-row items-center justify-center"
                        >
                          <RefreshCw size={16} color="#94A3B8" />
                          <Text className="text-slate-300 text-sm ml-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                            Sync Now
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleDisconnect(account.id)}
                          className="bg-red-500/10 py-2.5 px-4 rounded-xl flex-row items-center"
                        >
                          <Unlink size={16} color="#EF4444" />
                        </Pressable>
                      </View>
                    </Animated.View>
                  );
                })}
              </View>
            </Animated.View>
          )}

          {/* Add Account */}
          <Animated.View entering={FadeInDown.duration(500).delay(200)}>
            <Text className="text-slate-300 text-sm font-semibold uppercase tracking-wider mb-3" style={{ fontFamily: 'SpaceMono_400Regular' }}>
              Add Account
            </Text>

            <View className="gap-3">
              {/* Gmail */}
              <Pressable
                onPress={handleConnectGmail}
                className="bg-slate-800/50 rounded-2xl p-4 flex-row items-center border border-slate-700/50"
              >
                <View className="w-12 h-12 rounded-xl bg-white items-center justify-center">
                  <Image
                    source={{ uri: providerInfo.gmail.logo }}
                    className="w-7 h-7"
                    resizeMode="contain"
                  />
                </View>
                <View className="flex-1 ml-3">
                  <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                    Connect Gmail
                  </Text>
                  <Text className="text-slate-400 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                    Auto-import travel emails from Google
                  </Text>
                </View>
                <Plus size={20} color="#64748B" />
              </Pressable>

              {/* Outlook */}
              <Pressable
                onPress={handleConnectOutlook}
                className="bg-slate-800/50 rounded-2xl p-4 flex-row items-center border border-slate-700/50"
              >
                <View className="w-12 h-12 rounded-xl bg-white items-center justify-center">
                  <Image
                    source={{ uri: providerInfo.outlook.logo }}
                    className="w-7 h-7"
                    resizeMode="contain"
                  />
                </View>
                <View className="flex-1 ml-3">
                  <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                    Connect Outlook
                  </Text>
                  <Text className="text-slate-400 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                    Auto-import from Microsoft 365
                  </Text>
                </View>
                <Plus size={20} color="#64748B" />
              </Pressable>
            </View>
          </Animated.View>

          {/* Manual Forward Option */}
          <Animated.View
            entering={FadeInDown.duration(500).delay(300)}
            className="mt-6"
          >
            <Pressable
              onPress={() => router.push('/trusted-emails')}
              className="bg-slate-800/30 rounded-2xl p-4 flex-row items-center border border-slate-700/30"
            >
              <View className="bg-slate-700/50 p-3 rounded-xl">
                <Mail size={20} color="#64748B" />
              </View>
              <View className="flex-1 ml-3">
                <Text className="text-slate-300 font-medium" style={{ fontFamily: 'DMSans_500Medium' }}>
                  Prefer manual forwarding?
                </Text>
                <Text className="text-slate-500 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                  Manage trusted email addresses
                </Text>
              </View>
              <ChevronRight size={18} color="#64748B" />
            </Pressable>
          </Animated.View>

          <View className="h-8" />
        </ScrollView>
      </SafeAreaView>

      {/* Upgrade Modal */}
      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason="gmail-connect"
      />
    </View>
  );
}

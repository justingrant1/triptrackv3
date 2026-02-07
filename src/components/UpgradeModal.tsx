/**
 * UpgradeModal - Beautiful paywall UI
 * Shows when users hit feature limits on the free plan
 */

import React from 'react';
import { View, Text, Pressable, Modal, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  X,
  Crown,
  Check,
  Sparkles,
  Zap,
  Mail,
  Camera,
  FileText,
  Plane,
} from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { getOfferings, purchasePackage } from '@/lib/revenuecat';
import { useQueryClient } from '@tanstack/react-query';

export type UpgradeReason =
  | 'trips'
  | 'ai'
  | 'receipt-ocr'
  | 'receipt-limit'
  | 'csv-export'
  | 'email-parsing'
  | 'gmail-connect';

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  reason: UpgradeReason;
}

const REASON_CONFIG: Record<
  UpgradeReason,
  {
    title: string;
    description: string;
    icon: React.ReactNode;
    color: string;
  }
> = {
  trips: {
    title: 'Unlimited Trips',
    description: "You've reached your 3 trip limit on the free plan. Upgrade to Pro for unlimited trips and never worry about limits again.",
    icon: <Plane size={32} color="#8B5CF6" />,
    color: '#8B5CF6',
  },
  ai: {
    title: 'Unlimited AI Concierge',
    description: "You've used your 3 free AI messages today. Upgrade to Pro for unlimited conversations with your travel concierge.",
    icon: <Sparkles size={32} color="#8B5CF6" />,
    color: '#8B5CF6',
  },
  'receipt-ocr': {
    title: 'Receipt Scanning',
    description: 'Scan receipts with your camera and let AI extract all the details automatically. Available on Pro.',
    icon: <Camera size={32} color="#8B5CF6" />,
    color: '#8B5CF6',
  },
  'receipt-limit': {
    title: 'Unlimited Receipts',
    description: "You've reached your 10 receipt limit this month. Upgrade to Pro for unlimited receipt tracking.",
    icon: <FileText size={32} color="#8B5CF6" />,
    color: '#8B5CF6',
  },
  'csv-export': {
    title: 'Advanced Exports',
    description: 'Export your expenses as CSV or formatted PDF reports. Perfect for expense reimbursement.',
    icon: <FileText size={32} color="#8B5CF6" />,
    color: '#8B5CF6',
  },
  'email-parsing': {
    title: 'Email Auto-Parse',
    description: 'Forward your travel confirmation emails and let AI automatically create trips and reservations.',
    icon: <Mail size={32} color="#8B5CF6" />,
    color: '#8B5CF6',
  },
  'gmail-connect': {
    title: 'Gmail Auto-Scan',
    description: 'Connect your Gmail and automatically import all your travel bookings. No forwarding needed.',
    icon: <Zap size={32} color="#8B5CF6" />,
    color: '#8B5CF6',
  },
};

const PRO_FEATURES = [
  'Unlimited trips',
  'Unlimited AI concierge',
  'Receipt OCR scanning',
  'Unlimited receipts',
  'Email auto-parsing',
  'Gmail auto-scan',
  'CSV & PDF exports',
  'Priority support',
];

export function UpgradeModal({ visible, onClose, reason }: UpgradeModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { usage, limits } = useSubscription();
  const [billingPeriod, setBillingPeriod] = React.useState<'monthly' | 'annual'>('annual');
  const [isPurchasing, setIsPurchasing] = React.useState(false);

  const config = REASON_CONFIG[reason];

  const handleUpgrade = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPurchasing(true);

    try {
      // Load offerings
      const offerings = await getOfferings();
      
      if (!offerings?.current) {
        throw new Error('No subscription packages available');
      }

      // Find the selected package
      const selectedPackage = offerings.current.availablePackages.find(
        pkg => billingPeriod === 'monthly' 
          ? (pkg.identifier === '$rc_monthly' || pkg.packageType === 'MONTHLY')
          : (pkg.identifier === '$rc_annual' || pkg.packageType === 'ANNUAL')
      );

      if (!selectedPackage) {
        throw new Error('Selected package not available');
      }

      // Purchase the package
      await purchasePackage(selectedPackage);
      
      // Refresh profile to get updated plan
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
      
      Alert.alert(
        '🎉 Welcome to Pro!',
        'Your subscription is now active. Enjoy unlimited trips, AI concierge, and all premium features!',
        [{ text: 'Awesome!' }]
      );
    } catch (error: any) {
      if (!error.userCancelled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          'Purchase Failed',
          error.message || 'Something went wrong. Please try again.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'View Plans', onPress: () => { onClose(); router.push('/subscription'); } }
          ]
        );
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable className="flex-1 bg-black/80 justify-end" onPress={handleClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <Animated.View entering={SlideInDown.duration(400).springify()} className="bg-slate-900 rounded-t-3xl">
            {/* Header */}
            <View className="px-5 pt-6 pb-4">
              <Pressable onPress={handleClose} className="absolute top-6 right-5 z-10">
                <X size={24} color="#94A3B8" />
              </Pressable>

              <Animated.View entering={FadeInDown.duration(500)} className="items-center mb-4">
                <View
                  className="p-4 rounded-full mb-3"
                  style={{ backgroundColor: config.color + '20' }}
                >
                  {config.icon}
                </View>
                <Text
                  className="text-white text-2xl font-bold text-center"
                  style={{ fontFamily: 'DMSans_700Bold' }}
                >
                  {config.title}
                </Text>
                <Text
                  className="text-slate-400 text-center mt-2 px-4"
                  style={{ fontFamily: 'DMSans_400Regular' }}
                >
                  {config.description}
                </Text>
              </Animated.View>

              {/* Usage Stats (if applicable) */}
              {(reason === 'trips' || reason === 'ai' || reason === 'receipt-limit') && (
                <Animated.View
                  entering={FadeInDown.duration(500).delay(100)}
                  className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 mb-4"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-slate-400 text-sm" style={{ fontFamily: 'DMSans_500Medium' }}>
                      {reason === 'trips' && 'Active Trips'}
                      {reason === 'ai' && 'AI Messages Today'}
                      {reason === 'receipt-limit' && 'Receipts This Month'}
                    </Text>
                    <Text className="text-white font-bold" style={{ fontFamily: 'SpaceMono_700Bold' }}>
                      {reason === 'trips' && `${usage.activeTrips} / ${limits.trips}`}
                      {reason === 'ai' && `${usage.aiMessagesToday} / ${limits.aiMessagesPerDay}`}
                      {reason === 'receipt-limit' && `${usage.receiptsThisMonth} / ${limits.receiptsPerMonth}`}
                    </Text>
                  </View>
                </Animated.View>
              )}

              {/* Billing Toggle */}
              <Animated.View entering={FadeInDown.duration(500).delay(150)} className="mb-4">
                <View className="bg-slate-800/50 rounded-xl p-1 flex-row border border-slate-700/50">
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setBillingPeriod('monthly');
                    }}
                    className={`flex-1 py-2.5 rounded-lg ${
                      billingPeriod === 'monthly' ? 'bg-slate-700' : ''
                    }`}
                  >
                    <Text
                      className={`text-center font-semibold ${
                        billingPeriod === 'monthly' ? 'text-white' : 'text-slate-400'
                      }`}
                      style={{ fontFamily: 'DMSans_700Bold' }}
                    >
                      Monthly
                    </Text>
                    <Text
                      className={`text-center text-xs ${
                        billingPeriod === 'monthly' ? 'text-slate-300' : 'text-slate-500'
                      }`}
                      style={{ fontFamily: 'DMSans_400Regular' }}
                    >
                      $11.99/mo
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setBillingPeriod('annual');
                    }}
                    className={`flex-1 py-2.5 rounded-lg ${
                      billingPeriod === 'annual' ? 'bg-purple-500' : ''
                    }`}
                  >
                    <View className="flex-row items-center justify-center">
                      <Text
                        className={`text-center font-semibold ${
                          billingPeriod === 'annual' ? 'text-white' : 'text-slate-400'
                        }`}
                        style={{ fontFamily: 'DMSans_700Bold' }}
                      >
                        Annual
                      </Text>
                      {billingPeriod === 'annual' && (
                        <View className="bg-emerald-500 px-1.5 py-0.5 rounded ml-1">
                          <Text className="text-white text-xs font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                            30% OFF
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text
                      className={`text-center text-xs ${
                        billingPeriod === 'annual' ? 'text-white/80' : 'text-slate-500'
                      }`}
                      style={{ fontFamily: 'DMSans_400Regular' }}
                    >
                      $99.99/yr
                    </Text>
                  </Pressable>
                </View>
              </Animated.View>
            </View>

            {/* Features List */}
            <ScrollView className="max-h-64 px-5" showsVerticalScrollIndicator={false}>
              <Animated.View entering={FadeInDown.duration(500).delay(200)}>
                <Text
                  className="text-slate-400 text-xs uppercase tracking-wider mb-3"
                  style={{ fontFamily: 'SpaceMono_400Regular' }}
                >
                  Everything in Pro
                </Text>
                <View className="gap-2 mb-4">
                  {PRO_FEATURES.map((feature, index) => (
                    <Animated.View
                      key={index}
                      entering={FadeIn.duration(300).delay(250 + index * 50)}
                      className="flex-row items-center"
                    >
                      <View className="bg-purple-500/20 p-1 rounded-full">
                        <Check size={12} color="#A855F7" />
                      </View>
                      <Text
                        className="text-slate-300 ml-2"
                        style={{ fontFamily: 'DMSans_400Regular' }}
                      >
                        {feature}
                      </Text>
                    </Animated.View>
                  ))}
                </View>
              </Animated.View>
            </ScrollView>

            {/* CTA Buttons */}
            <View className="px-5 pb-6 pt-4">
              <Animated.View entering={FadeInDown.duration(500).delay(300)}>
                <Pressable 
                  onPress={handleUpgrade} 
                  disabled={isPurchasing}
                  className="bg-purple-500 rounded-2xl py-4 mb-3"
                >
                  <View className="flex-row items-center justify-center">
                    {isPurchasing ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Crown size={20} color="#FFFFFF" />
                        <Text
                          className="text-white font-bold ml-2 text-base"
                          style={{ fontFamily: 'DMSans_700Bold' }}
                        >
                          {billingPeriod === 'monthly' ? 'Subscribe for $11.99/mo' : 'Subscribe for $99.99/yr'}
                        </Text>
                      </>
                    )}
                  </View>
                </Pressable>

                <Pressable onPress={handleClose} className="py-3">
                  <Text
                    className="text-slate-400 text-center font-medium"
                    style={{ fontFamily: 'DMSans_500Medium' }}
                  >
                    Not now
                  </Text>
                </Pressable>
              </Animated.View>
            </View>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

import React from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  Check,
  Sparkles,
  Zap,
  Users,
  Crown,
  RefreshCw,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useProfile } from '@/lib/hooks/useProfile';
import { getOfferings, purchasePackage, restorePurchases, getPackageDetails, getCustomerInfo, isRevenueCatReady } from '@/lib/revenuecat';
import { PurchasesPackage } from 'react-native-purchases';
import { useQueryClient } from '@tanstack/react-query';

interface PlanFeature {
  text: string;
  included: boolean;
}

interface Plan {
  id: string;
  name: string;
  price: string;
  period: string;
  description: string;
  features: PlanFeature[];
  icon: React.ReactNode;
  color: string;
  popular?: boolean;
}

const plans: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: '/forever',
    description: 'Everything you need to get started',
    icon: <Zap size={24} color="#64748B" />,
    color: '#64748B',
    features: [
      { text: '3 active trips', included: true },
      { text: 'Unlimited reservations', included: true },
      { text: '10 receipts/month', included: true },
      { text: '3 AI messages/day', included: true },
      { text: 'Email parsing', included: false },
      { text: 'Receipt OCR scanning', included: false },
      { text: 'CSV/PDF exports', included: false },
      { text: 'Gmail auto-scan', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$11.99',
    period: '/month',
    description: 'Your trips, on autopilot',
    icon: <Sparkles size={24} color="#8B5CF6" />,
    color: '#8B5CF6',
    popular: true,
    features: [
      { text: 'Unlimited trips', included: true },
      { text: 'Unlimited reservations', included: true },
      { text: 'Unlimited receipts', included: true },
      { text: 'Unlimited AI concierge', included: true },
      { text: 'Email auto-parsing', included: true },
      { text: 'Receipt OCR scanning', included: true },
      { text: 'CSV & PDF exports', included: true },
      { text: 'Gmail auto-scan', included: true },
      { text: 'Priority support', included: true },
    ],
  },
  {
    id: 'team',
    name: 'Team',
    price: '$39.99',
    period: '/month',
    description: 'Travel management for your team',
    icon: <Users size={24} color="#3B82F6" />,
    color: '#3B82F6',
    features: [
      { text: 'Everything in Pro', included: true },
      { text: '5 team members included', included: true },
      { text: 'Shared trip visibility', included: true },
      { text: 'Team expense reports', included: true },
      { text: 'Admin dashboard', included: true },
      { text: 'Dedicated support', included: true },
    ],
  },
];

function PlanCard({ plan, isCurrentPlan, onSelect, isPurchasing, displayPrice, displayPeriod }: { 
  plan: Plan; 
  isCurrentPlan: boolean; 
  onSelect: () => void; 
  isPurchasing?: boolean;
  displayPrice?: string;
  displayPeriod?: string;
}) {
  return (
    <Pressable onPress={onSelect} className="mb-4">
      <View
        className={`rounded-2xl border-2 p-5 ${
          isCurrentPlan
            ? 'border-purple-500 bg-purple-500/10'
            : 'border-slate-700/50 bg-slate-800/50'
        }`}
      >
        {plan.popular && (
          <View className="absolute -top-3 right-4 bg-purple-500 px-3 py-1 rounded-full">
            <Text className="text-white text-xs font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
              POPULAR
            </Text>
          </View>
        )}

        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center">
            <View style={{ backgroundColor: plan.color + '20', padding: 10, borderRadius: 12 }}>
              {plan.icon}
            </View>
            <View className="ml-3">
              <Text className="text-white text-lg font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                {plan.name}
              </Text>
              <Text className="text-slate-400 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                {plan.description}
              </Text>
            </View>
          </View>
          {isCurrentPlan && (
            <View className="bg-purple-500 p-1.5 rounded-full">
              <Check size={14} color="#FFFFFF" />
            </View>
          )}
        </View>

        <View className="flex-row items-baseline mb-4">
          <Text className="text-white text-3xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
            {displayPrice || plan.price}
          </Text>
          <Text className="text-slate-400 text-sm ml-1" style={{ fontFamily: 'DMSans_400Regular' }}>
            {displayPeriod || plan.period}
          </Text>
        </View>

        <View className="gap-2">
          {plan.features.map((feature, index) => (
            <View key={index} className="flex-row items-center">
              <View
                className={`w-5 h-5 rounded-full items-center justify-center ${
                  feature.included ? 'bg-emerald-500/20' : 'bg-slate-700/30'
                }`}
              >
                {feature.included ? (
                  <Check size={12} color="#10B981" />
                ) : (
                  <Text className="text-slate-500 text-xs">-</Text>
                )}
              </View>
              <Text
                className={`ml-2 text-sm ${feature.included ? 'text-slate-300' : 'text-slate-500'}`}
                style={{ fontFamily: 'DMSans_400Regular' }}
              >
                {feature.text}
              </Text>
            </View>
          ))}
        </View>

        {!isCurrentPlan && plan.id === 'pro' && (
          <Pressable
            onPress={onSelect}
            disabled={isPurchasing}
            className={`mt-4 py-3 rounded-xl items-center ${
              plan.popular ? 'bg-purple-500' : 'bg-slate-700'
            }`}
          >
            {isPurchasing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                Upgrade to Pro
              </Text>
            )}
          </Pressable>
        )}
        {!isCurrentPlan && plan.id !== 'pro' && (
          <Pressable
            onPress={onSelect}
            className="mt-4 py-3 rounded-xl items-center bg-slate-700"
          >
            <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
              {plan.id === 'free' ? 'Downgrade' : 'Coming Soon'}
            </Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const currentPlanId = profile?.plan ?? 'free';
  const [billingPeriod, setBillingPeriod] = React.useState<'monthly' | 'annual'>('annual');
  const [isLoading, setIsLoading] = React.useState(false);
  const [isPurchasing, setIsPurchasing] = React.useState(false);
  const [monthlyPackage, setMonthlyPackage] = React.useState<PurchasesPackage | null>(null);
  const [annualPackage, setAnnualPackage] = React.useState<PurchasesPackage | null>(null);

  // Load offerings from RevenueCat (with retry for SDK initialization timing)
  React.useEffect(() => {
    loadOfferings();
  }, []);

  const loadOfferings = async (retryCount = 0) => {
    setIsLoading(true);
    try {
      // Check if RevenueCat is properly configured before attempting to load offerings
      if (!isRevenueCatReady()) {
        // SDK might not be initialized yet — retry after a short delay (up to 3 attempts)
        if (retryCount < 3) {
          console.log(`⏳ RevenueCat not ready yet, retrying in ${(retryCount + 1)}s... (attempt ${retryCount + 1}/3)`);
          setTimeout(() => loadOfferings(retryCount + 1), (retryCount + 1) * 1000);
          return;
        }
        console.warn('⚠️ RevenueCat not ready after 3 retries — skipping offerings load');
        return;
      }

      const offerings = await getOfferings();
      
      if (offerings?.current) {
        const packages = offerings.current.availablePackages;
        
        // Try SDK convenience properties first
        let monthly = offerings.current.monthly;
        let annual = offerings.current.annual;
        
        // Fallback: search availablePackages if convenience properties are null
        if (!monthly || !annual) {
          console.log('⚠️ SDK convenience properties null, searching availablePackages...');
          
          if (!monthly) {
            monthly = packages.find(pkg => {
              const id = pkg.identifier?.toLowerCase() || '';
              const type = String(pkg.packageType || '').toUpperCase();
              return (
                id.includes('monthly') || 
                id === '$rc_monthly' || 
                type === 'MONTHLY' ||
                type.includes('MONTH')
              );
            }) || null;
          }
          
          if (!annual) {
            annual = packages.find(pkg => {
              const id = pkg.identifier?.toLowerCase() || '';
              const type = String(pkg.packageType || '').toUpperCase();
              return (
                id.includes('annual') || 
                id.includes('yearly') ||
                id === '$rc_annual' || 
                type === 'ANNUAL' ||
                type === 'YEARLY' ||
                type.includes('YEAR')
              );
            }) || null;
          }
        }
        
        setMonthlyPackage(monthly);
        setAnnualPackage(annual);
        
        console.log('📦 Loaded packages:', {
          monthly: monthly ? getPackageDetails(monthly) : 'NOT FOUND',
          annual: annual ? getPackageDetails(annual) : 'NOT FOUND',
        });
        
        // If only one package type is available, auto-select it
        if (monthly && !annual) {
          console.log('⚠️ Only monthly package available, auto-selecting monthly');
          setBillingPeriod('monthly');
        } else if (annual && !monthly) {
          console.log('⚠️ Only annual package available, auto-selecting annual');
          setBillingPeriod('annual');
        }
      }
    } catch (error) {
      console.error('Failed to load offerings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPlan = async (planId: string) => {
    if (planId === 'free' || planId === 'team') {
      // Free and Team not implemented yet
      Alert.alert(
        planId === 'free' ? 'Downgrade' : 'Team Plan',
        planId === 'free' 
          ? 'To downgrade, please cancel your subscription in the App Store.'
          : 'Team plans coming soon! Contact support for early access.'
      );
      return;
    }

    if (planId === 'pro') {
      await handlePurchasePro();
    }
  };

  const handlePurchasePro = async () => {
    // Try to get the selected package, with fallback logic
    let selectedPackage = billingPeriod === 'monthly' ? monthlyPackage : annualPackage;
    
    // Fallback: if selected package is null, try the other one
    if (!selectedPackage) {
      console.warn(`⚠️ ${billingPeriod} package not available, trying fallback...`);
      selectedPackage = billingPeriod === 'monthly' ? annualPackage : monthlyPackage;
      
      if (selectedPackage) {
        console.log(`✅ Using ${billingPeriod === 'monthly' ? 'annual' : 'monthly'} package as fallback`);
      }
    }
    
    // If still no package, show error
    if (!selectedPackage) {
      console.error('❌ No subscription packages available');
      Alert.alert(
        'Error', 
        'No subscription packages are currently available. Please check your internet connection and try again, or contact support if the issue persists.'
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPurchasing(true);

    try {
      // ── Pre-check: does this Apple ID already have an active TripTrack Pro subscription?
      // If so, restore it instead of triggering a new purchase (avoids Apple's
      // "You're currently subscribed to this" dialog).
      const customerInfo = await getCustomerInfo();
      const alreadyHasPro =
        customerInfo?.entitlements?.active?.['TripTrack Pro'] !== undefined;

      if (alreadyHasPro) {
        console.log('🔄 Apple ID already has TripTrack Pro — restoring instead of purchasing');
        await restorePurchases();

        // Refresh profile to get updated plan
        queryClient.invalidateQueries({ queryKey: ['profile'] });
        queryClient.invalidateQueries({ queryKey: ['revenuecat-entitlement'] });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          '🎉 Welcome to Pro!',
          'Your existing TripTrack Pro subscription has been linked to this account.',
          [{ text: 'Awesome!', onPress: () => router.back() }]
        );
        return;
      }

      // ── Normal purchase flow
      console.log('💳 Purchasing package:', {
        identifier: selectedPackage.identifier,
        price: selectedPackage.product.priceString,
      });
      
      await purchasePackage(selectedPackage);
      
      // Refresh profile to get updated plan
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['revenuecat-entitlement'] });
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        '🎉 Welcome to Pro!',
        'Your subscription is now active. Enjoy unlimited trips, AI concierge, and all premium features!',
        [{ text: 'Awesome!', onPress: () => router.back() }]
      );
    } catch (error: any) {
      if (!error.userCancelled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        console.error('❌ Purchase failed:', error);
        Alert.alert('Purchase Failed', error.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestorePurchases = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);

    try {
      await restorePurchases();
      
      // Refresh profile
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('✅ Purchases Restored', 'Your subscription has been restored successfully!');
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Restore Failed', error.message || 'No purchases found to restore.');
    } finally {
      setIsLoading(false);
    }
  };

  // Update plan prices from RevenueCat
  const getProPrice = () => {
    if (billingPeriod === 'monthly' && monthlyPackage) {
      return monthlyPackage.product.priceString;
    }
    if (billingPeriod === 'annual' && annualPackage) {
      return annualPackage.product.priceString;
    }
    return billingPeriod === 'monthly' ? '$11.99' : '$99.99';
  };

  const getProPeriod = () => {
    return billingPeriod === 'monthly' ? '/month' : '/year';
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
            Subscription
          </Text>
          <Pressable
            onPress={handleRestorePurchases}
            disabled={isLoading}
            className="ml-auto bg-slate-800/80 p-2.5 rounded-full border border-slate-700/50"
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#94A3B8" />
            ) : (
              <RefreshCw size={20} color="#94A3B8" />
            )}
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
          {/* Current Plan Banner */}
          <Animated.View entering={FadeInDown.duration(500)} className="mb-6">
            <LinearGradient
              colors={['#8B5CF6', '#6D28D9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 16, padding: 20 }}
            >
              <View className="flex-row items-center">
                <Crown size={24} color="#FFFFFF" />
                <View className="ml-3">
                  <Text className="text-white/70 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                    Current Plan
                  </Text>
                  <Text className="text-white text-xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                    {plans.find(p => p.id === currentPlanId)?.name ?? 'Pro'} Plan
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Billing Toggle for Pro */}
          {currentPlanId === 'free' && (
            <Animated.View entering={FadeInDown.duration(500).delay(100)} className="mb-6">
              <View className="bg-slate-800/50 rounded-xl p-1 flex-row border border-slate-700/50">
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setBillingPeriod('monthly');
                  }}
                  className={`flex-1 py-3 rounded-lg ${
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
                    className={`text-center text-sm mt-0.5 ${
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
                  className={`flex-1 py-3 rounded-lg ${
                    billingPeriod === 'annual' ? 'bg-purple-500' : ''
                  }`}
                >
                  <View className="flex-row items-center justify-center mb-0.5">
                    <Text
                      className={`text-center font-semibold ${
                        billingPeriod === 'annual' ? 'text-white' : 'text-slate-400'
                      }`}
                      style={{ fontFamily: 'DMSans_700Bold' }}
                    >
                      Annual
                    </Text>
                    {billingPeriod === 'annual' && (
                      <View className="bg-emerald-500 px-1.5 py-0.5 rounded ml-1.5">
                        <Text className="text-white text-xs font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                          SAVE 30%
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    className={`text-center text-sm ${
                      billingPeriod === 'annual' ? 'text-white/80' : 'text-slate-500'
                    }`}
                    style={{ fontFamily: 'DMSans_400Regular' }}
                  >
                    $99.99/yr
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          )}

          {/* Plans */}
          <Animated.View entering={FadeInDown.duration(500).delay(150)}>
            <Text className="text-slate-300 text-sm font-semibold uppercase tracking-wider mb-4" style={{ fontFamily: 'SpaceMono_400Regular' }}>
              Available Plans
            </Text>
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isCurrentPlan={plan.id === currentPlanId}
                onSelect={() => handleSelectPlan(plan.id)}
                isPurchasing={isPurchasing}
                displayPrice={plan.id === 'pro' ? getProPrice() : undefined}
                displayPeriod={plan.id === 'pro' ? getProPeriod() : undefined}
              />
            ))}
          </Animated.View>

          {/* Annual Savings Note */}
          {billingPeriod === 'annual' && currentPlanId === 'free' && (
            <Animated.View entering={FadeInDown.duration(500).delay(200)} className="mt-4">
              <View className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/20">
                <Text className="text-emerald-400 text-sm text-center" style={{ fontFamily: 'DMSans_500Medium' }}>
                  💰 Save $44 per year with annual billing
                </Text>
              </View>
            </Animated.View>
          )}

          {/* Legal Footer */}
          <Animated.View entering={FadeInDown.duration(500).delay(250)} className="mt-6 px-2">
            <Text className="text-slate-500 text-xs text-center leading-5 mb-3" style={{ fontFamily: 'DMSans_400Regular' }}>
              Subscription automatically renews unless cancelled at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period. You can manage and cancel your subscriptions in your App Store account settings.
            </Text>
            <View className="flex-row items-center justify-center gap-4">
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  Linking.openURL('https://triptrack.ai/terms');
                }}
              >
                <Text className="text-slate-400 text-xs underline" style={{ fontFamily: 'DMSans_400Regular' }}>
                  Terms of Service
                </Text>
              </Pressable>
              <Text className="text-slate-600 text-xs">•</Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  Linking.openURL('https://triptrack.ai/privacy');
                }}
              >
                <Text className="text-slate-400 text-xs underline" style={{ fontFamily: 'DMSans_400Regular' }}>
                  Privacy Policy
                </Text>
              </Pressable>
            </View>
          </Animated.View>

          <View className="h-8" />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

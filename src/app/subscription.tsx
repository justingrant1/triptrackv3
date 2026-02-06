import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
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
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTripStore } from '@/lib/store';

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
    period: '/month',
    description: 'Perfect for occasional travelers',
    icon: <Zap size={24} color="#64748B" />,
    color: '#64748B',
    features: [
      { text: 'Up to 3 trips', included: true },
      { text: 'Basic itinerary parsing', included: true },
      { text: 'Email forwarding', included: true },
      { text: 'AI assistant', included: false },
      { text: 'Expense tracking', included: false },
      { text: 'Priority support', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$15',
    period: '/month',
    description: 'For frequent business travelers',
    icon: <Sparkles size={24} color="#8B5CF6" />,
    color: '#8B5CF6',
    popular: true,
    features: [
      { text: 'Unlimited trips', included: true },
      { text: 'Advanced AI parsing', included: true },
      { text: 'Email forwarding', included: true },
      { text: 'AI assistant', included: true },
      { text: 'Expense tracking & export', included: true },
      { text: 'Priority support', included: true },
    ],
  },
  {
    id: 'team',
    name: 'Team',
    price: '$49',
    period: '/month',
    description: 'For teams and organizations',
    icon: <Users size={24} color="#3B82F6" />,
    color: '#3B82F6',
    features: [
      { text: 'Everything in Pro', included: true },
      { text: 'Up to 10 team members', included: true },
      { text: 'Shared trip visibility', included: true },
      { text: 'Team expense reports', included: true },
      { text: 'Admin dashboard', included: true },
      { text: 'Dedicated support', included: true },
    ],
  },
];

function PlanCard({ plan, isCurrentPlan, onSelect }: { plan: Plan; isCurrentPlan: boolean; onSelect: () => void }) {
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
            {plan.price}
          </Text>
          <Text className="text-slate-400 text-sm ml-1" style={{ fontFamily: 'DMSans_400Regular' }}>
            {plan.period}
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

        {!isCurrentPlan && (
          <Pressable
            onPress={onSelect}
            className={`mt-4 py-3 rounded-xl items-center ${
              plan.popular ? 'bg-purple-500' : 'bg-slate-700'
            }`}
          >
            <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
              {plan.id === 'free' ? 'Downgrade' : 'Upgrade'}
            </Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const user = useTripStore((s) => s.user);
  const currentPlanId = user?.plan ?? 'free';

  const handleSelectPlan = (planId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // In a real app, this would open payment flow
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

          {/* Plans */}
          <Animated.View entering={FadeInDown.duration(500).delay(100)}>
            <Text className="text-slate-300 text-sm font-semibold uppercase tracking-wider mb-4" style={{ fontFamily: 'SpaceMono_400Regular' }}>
              Available Plans
            </Text>
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isCurrentPlan={plan.id === currentPlanId}
                onSelect={() => handleSelectPlan(plan.id)}
              />
            ))}
          </Animated.View>

          <View className="h-8" />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

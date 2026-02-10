/**
 * Subscription hook for feature gating and usage tracking
 * Implements the pricing strategy from PRICING_STRATEGY.md
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProfile } from './useProfile';
import { useTrips } from './useTrips';
import { useAllReceipts } from './useReceipts';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkProEntitlement } from '@/lib/revenuecat';
import { useAuthStore } from '@/lib/state/auth-store';

export type Plan = 'free' | 'pro' | 'team';

export interface SubscriptionLimits {
  trips: number | null; // null = unlimited
  receiptsPerMonth: number | null;
  aiMessagesPerDay: number | null;
  emailParsing: boolean;
  receiptOCR: boolean;
  csvExport: boolean;
  gmailConnect: boolean;
}

export interface UsageStats {
  activeTrips: number;
  receiptsThisMonth: number;
  aiMessagesToday: number;
}

const PLAN_LIMITS: Record<Plan, SubscriptionLimits> = {
  free: {
    trips: 3,
    receiptsPerMonth: 10,
    aiMessagesPerDay: 3,
    emailParsing: false,
    receiptOCR: false,
    csvExport: false,
    gmailConnect: false,
  },
  pro: {
    trips: null, // unlimited
    receiptsPerMonth: null,
    aiMessagesPerDay: null,
    emailParsing: true,
    receiptOCR: true,
    csvExport: true,
    gmailConnect: true,
  },
  team: {
    trips: null,
    receiptsPerMonth: null,
    aiMessagesPerDay: null,
    emailParsing: true,
    receiptOCR: true,
    csvExport: true,
    gmailConnect: true,
  },
};

/**
 * Get AI message count for today from AsyncStorage
 */
async function getAIMessageCount(): Promise<number> {
  try {
    const today = new Date().toDateString();
    const stored = await AsyncStorage.getItem('ai_messages');
    
    if (!stored) return 0;
    
    const data = JSON.parse(stored);
    
    // Reset if it's a new day
    if (data.date !== today) {
      await AsyncStorage.setItem('ai_messages', JSON.stringify({ date: today, count: 0 }));
      return 0;
    }
    
    return data.count || 0;
  } catch (error) {
    console.error('Error reading AI message count:', error);
    return 0;
  }
}

/**
 * Increment AI message count for today
 */
export async function incrementAIMessageCount(): Promise<void> {
  try {
    const today = new Date().toDateString();
    const stored = await AsyncStorage.getItem('ai_messages');
    
    let count = 0;
    if (stored) {
      const data = JSON.parse(stored);
      if (data.date === today) {
        count = data.count || 0;
      }
    }
    
    await AsyncStorage.setItem('ai_messages', JSON.stringify({ date: today, count: count + 1 }));
  } catch (error) {
    console.error('Error incrementing AI message count:', error);
  }
}

/**
 * Main subscription hook
 */
export function useSubscription() {
  const { user } = useAuthStore();
  const { data: profile } = useProfile();
  const { data: trips = [] } = useTrips();
  const { data: allReceipts = [] } = useAllReceipts();

  const plan: Plan = profile?.plan || 'free';
  const limits = PLAN_LIMITS[plan];

  // Query AI message count — no aggressive polling needed.
  // The count is updated reactively via queryClient.setQueryData in modal.tsx
  const { data: aiMessagesToday = 0 } = useQuery({
    queryKey: ['ai-messages-today'],
    queryFn: getAIMessageCount,
    staleTime: 60 * 1000, // Consider fresh for 1 minute
  });

  // Calculate usage stats
  const usage: UsageStats = useMemo(() => {
    // Count active trips (upcoming or active status)
    const activeTrips = trips.filter(
      (t) => t.status === 'upcoming' || t.status === 'active'
    ).length;

    // Count receipts created this month
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const receiptsThisMonth = allReceipts.filter((r) => {
      const receiptDate = new Date(r.date);
      return receiptDate >= firstDayOfMonth;
    }).length;

    return {
      activeTrips,
      receiptsThisMonth,
      aiMessagesToday,
    };
  }, [trips, allReceipts, aiMessagesToday]);

  // Feature gating functions
  const canCreateTrip = useMemo(() => {
    if (limits.trips === null) return true; // unlimited
    return usage.activeTrips < limits.trips;
  }, [limits.trips, usage.activeTrips]);

  const canUseAI = useMemo(() => {
    if (limits.aiMessagesPerDay === null) return true; // unlimited
    return usage.aiMessagesToday < limits.aiMessagesPerDay;
  }, [limits.aiMessagesPerDay, usage.aiMessagesToday]);

  const canCreateReceipt = useMemo(() => {
    if (limits.receiptsPerMonth === null) return true; // unlimited
    return usage.receiptsThisMonth < limits.receiptsPerMonth;
  }, [limits.receiptsPerMonth, usage.receiptsThisMonth]);

  const canScanReceipt = limits.receiptOCR;
  const canExportCSV = limits.csvExport;
  const canUseEmailParsing = limits.emailParsing;
  const canConnectGmail = limits.gmailConnect;

  // Check RevenueCat entitlement as fallback (in case Supabase is out of sync)
  // Query key includes user ID so it's scoped per-user and doesn't leak across accounts
  const { data: hasProEntitlement } = useQuery({
    queryKey: ['revenuecat-entitlement', user?.id],
    queryFn: checkProEntitlement,
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: plan === 'free' && !!user?.id, // Only check if Supabase says free AND user is logged in
  });

  // Determine if user has Pro (check both Supabase and RevenueCat)
  const isPro = plan === 'pro' || plan === 'team' || hasProEntitlement === true;

  return {
    plan,
    limits,
    usage,
    isPro,
    isFree: plan === 'free' && !hasProEntitlement,
    // Feature gates
    canCreateTrip,
    canUseAI,
    canCreateReceipt,
    canScanReceipt,
    canExportCSV,
    canUseEmailParsing,
    canConnectGmail,
  };
}

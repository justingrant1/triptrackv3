import React, { useEffect } from 'react';
import { View, DimensionValue } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  className?: string;
}

/**
 * Base skeleton component with shimmer animation
 */
export function Skeleton({ width = '100%', height = 20, borderRadius = 8, className = '' }: SkeletonProps) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, {
        duration: 1500,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + shimmer.value * 0.3,
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: '#334155', // slate-700
        },
        animatedStyle,
      ]}
      className={className}
    />
  );
}

/**
 * Skeleton for profile header
 */
export function ProfileHeaderSkeleton() {
  return (
    <View className="px-5 pt-4 pb-6">
      <Skeleton width={120} height={28} className="mb-2" />
      <Skeleton width={180} height={16} />
    </View>
  );
}

/**
 * Skeleton for menu item
 */
export function MenuItemSkeleton({ isLast = false }: { isLast?: boolean }) {
  return (
    <View className={`flex-row items-center p-4 ${!isLast ? 'border-b border-slate-700/30' : ''}`}>
      <Skeleton width={40} height={40} borderRadius={10} />
      <View className="flex-1 ml-3">
        <Skeleton width="60%" height={16} className="mb-2" />
        <Skeleton width="40%" height={12} />
      </View>
      <Skeleton width={18} height={18} borderRadius={9} />
    </View>
  );
}

/**
 * Skeleton for menu section
 */
export function MenuSectionSkeleton({ itemCount = 3 }: { itemCount?: number }) {
  return (
    <View className="mb-6">
      <Skeleton width={100} height={12} className="mb-2 px-1" />
      <View className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
        {Array.from({ length: itemCount }).map((_, index) => (
          <MenuItemSkeleton key={index} isLast={index === itemCount - 1} />
        ))}
      </View>
    </View>
  );
}

/**
 * Skeleton for receipt card
 */
export function ReceiptCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <View className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 mb-3">
      <View className="flex-row items-start">
        <Skeleton width={48} height={48} borderRadius={12} />
        <View className="flex-1 ml-3">
          <Skeleton width="70%" height={18} className="mb-2" />
          <Skeleton width="50%" height={14} className="mb-2" />
          <Skeleton width="40%" height={12} />
        </View>
        <Skeleton width={60} height={24} borderRadius={12} />
      </View>
    </View>
  );
}

/**
 * Skeleton for stat card
 */
export function StatCardSkeleton() {
  return (
    <View className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
      <Skeleton width={40} height={40} borderRadius={12} className="mb-3" />
      <Skeleton width="60%" height={24} className="mb-2" />
      <Skeleton width="40%" height={14} />
    </View>
  );
}

/**
 * Skeleton for notification item
 */
export function NotificationSkeleton({ isLast = false }: { isLast?: boolean }) {
  return (
    <View className={`p-4 ${!isLast ? 'border-b border-slate-700/30' : ''}`}>
      <View className="flex-row items-start">
        <Skeleton width={40} height={40} borderRadius={20} />
        <View className="flex-1 ml-3">
          <Skeleton width="80%" height={16} className="mb-2" />
          <Skeleton width="60%" height={14} className="mb-2" />
          <Skeleton width="30%" height={12} />
        </View>
      </View>
    </View>
  );
}

/**
 * Skeleton for list header
 */
export function ListHeaderSkeleton() {
  return (
    <View className="px-5 pt-4 pb-4">
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-1">
          <Skeleton width={150} height={28} className="mb-2" />
          <Skeleton width={200} height={14} />
        </View>
        <Skeleton width={40} height={40} borderRadius={20} />
      </View>
    </View>
  );
}

/**
 * Skeleton for empty state
 */
export function EmptyStateSkeleton() {
  return (
    <View className="items-center py-12 px-8">
      <Skeleton width={80} height={80} borderRadius={40} className="mb-4" />
      <Skeleton width="70%" height={20} className="mb-2" />
      <Skeleton width="90%" height={16} className="mb-4" />
      <Skeleton width={120} height={40} borderRadius={20} />
    </View>
  );
}

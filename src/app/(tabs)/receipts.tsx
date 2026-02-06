import React from 'react';
import { View, Text, ScrollView, Pressable, Share, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  Receipt as ReceiptIcon,
  Plane,
  Building2,
  Utensils,
  Package,
  Plus,
  Download,
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Camera,
  FileText,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeInRight,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTripStore, Receipt, Trip } from '@/lib/store';
import { formatCurrency, formatDate } from '@/lib/utils';

const getCategoryIcon = (category: Receipt['category'], size: number = 18, color: string = '#FFFFFF') => {
  const icons: Record<Receipt['category'], React.ReactNode> = {
    transport: <Plane size={size} color={color} />,
    lodging: <Building2 size={size} color={color} />,
    meals: <Utensils size={size} color={color} />,
    other: <Package size={size} color={color} />,
  };
  return icons[category];
};

const getCategoryColor = (category: Receipt['category']): string => {
  const colors: Record<Receipt['category'], string> = {
    transport: '#3B82F6',
    lodging: '#8B5CF6',
    meals: '#F59E0B',
    other: '#64748B',
  };
  return colors[category];
};

const getStatusInfo = (status: Receipt['status']): { color: string; icon: React.ReactNode; label: string } => {
  const info: Record<Receipt['status'], { color: string; icon: React.ReactNode; label: string }> = {
    pending: { color: '#F59E0B', icon: <Clock size={12} color="#F59E0B" />, label: 'Pending' },
    submitted: { color: '#3B82F6', icon: <AlertCircle size={12} color="#3B82F6" />, label: 'Submitted' },
    approved: { color: '#10B981', icon: <CheckCircle size={12} color="#10B981" />, label: 'Approved' },
  };
  return info[status];
};

function SummaryCard({ title, amount, subtitle, color, icon }: {
  title: string;
  amount: string;
  subtitle: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <View className="flex-1 bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
      <View className="flex-row items-center justify-between mb-2">
        <View style={{ backgroundColor: color + '20', padding: 8, borderRadius: 10 }}>
          {icon}
        </View>
      </View>
      <Text className="text-white text-xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
        {amount}
      </Text>
      <Text className="text-slate-400 text-xs mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
        {title}
      </Text>
      <Text className="text-slate-500 text-xs" style={{ fontFamily: 'SpaceMono_400Regular' }}>
        {subtitle}
      </Text>
    </View>
  );
}

function ReceiptItem({ receipt, trip, index }: { receipt: Receipt; trip: Trip; index: number }) {
  const router = useRouter();
  const categoryColor = getCategoryColor(receipt.category);
  const statusInfo = getStatusInfo(receipt.status);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/trip/${trip.id}`);
  };

  return (
    <Animated.View entering={FadeInRight.duration(400).delay(index * 60)}>
      <Pressable
        onPress={handlePress}
        className="bg-slate-800/50 rounded-2xl p-4 flex-row items-center border border-slate-700/50 mb-3"
      >
        <View style={{ backgroundColor: categoryColor + '20', padding: 10, borderRadius: 12 }}>
          {getCategoryIcon(receipt.category, 20, categoryColor)}
        </View>
        <View className="flex-1 ml-3">
          <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
            {receipt.merchant}
          </Text>
          <Text className="text-slate-400 text-sm mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
            {trip.name}
          </Text>
          <View className="flex-row items-center mt-1">
            {statusInfo.icon}
            <Text
              className="text-xs ml-1"
              style={{ color: statusInfo.color, fontFamily: 'DMSans_500Medium' }}
            >
              {statusInfo.label}
            </Text>
          </View>
        </View>
        <View className="items-end">
          <Text className="text-white font-bold" style={{ fontFamily: 'SpaceMono_700Bold' }}>
            {formatCurrency(receipt.amount, receipt.currency)}
          </Text>
          <Text className="text-slate-500 text-xs mt-1" style={{ fontFamily: 'DMSans_400Regular' }}>
            {formatDate(receipt.date)}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function TripReceiptsGroup({ trip, index }: { trip: Trip; index: number }) {
  const totalAmount = trip.receipts.reduce((sum, r) => sum + r.amount, 0);

  if (trip.receipts.length === 0) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(500).delay(index * 100)}
      className="mb-6"
    >
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-slate-300 text-sm font-semibold uppercase tracking-wider" style={{ fontFamily: 'SpaceMono_400Regular' }}>
          {trip.name}
        </Text>
        <Text className="text-slate-400 text-sm" style={{ fontFamily: 'SpaceMono_700Bold' }}>
          {formatCurrency(totalAmount)}
        </Text>
      </View>
      {trip.receipts.map((receipt, receiptIndex) => (
        <ReceiptItem
          key={receipt.id}
          receipt={receipt}
          trip={trip}
          index={index * 10 + receiptIndex}
        />
      ))}
    </Animated.View>
  );
}

export default function ReceiptsScreen() {
  const router = useRouter();
  const trips = useTripStore((s) => s.trips);
  const getMissingReceipts = useTripStore((s) => s.getMissingReceipts);

  const allReceipts = trips.flatMap((trip) =>
    trip.receipts.map((r) => ({ ...r, tripName: trip.name }))
  );

  const totalExpenses = allReceipts.reduce((sum, r) => sum + r.amount, 0);
  const pendingCount = allReceipts.filter((r) => r.status === 'pending').length;
  const approvedAmount = allReceipts
    .filter((r) => r.status === 'approved')
    .reduce((sum, r) => sum + r.amount, 0);

  const tripsWithReceipts = trips.filter((t) => t.receipts.length > 0);
  const missingReceipts = getMissingReceipts();

  const handleExport = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Generate expense report text
    let report = 'TripTrack Expense Report\n';
    report += '========================\n\n';
    report += `Total Expenses: ${formatCurrency(totalExpenses)}\n`;
    report += `Approved: ${formatCurrency(approvedAmount)}\n`;
    report += `Pending: ${pendingCount} receipts\n\n`;

    tripsWithReceipts.forEach((trip) => {
      const tripTotal = trip.receipts.reduce((sum, r) => sum + r.amount, 0);
      report += `${trip.name} - ${formatCurrency(tripTotal)}\n`;
      trip.receipts.forEach((r) => {
        report += `  - ${r.merchant}: ${formatCurrency(r.amount, r.currency)} (${r.status})\n`;
      });
      report += '\n';
    });

    try {
      await Share.share({
        message: report,
        title: 'TripTrack Expense Report',
      });
    } catch (error) {
      // User cancelled
    }
  };

  const handleAddReceipt = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/add-receipt');
  };

  const handleScanReceipt = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/add-receipt');
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
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-white text-2xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                  Receipts
                </Text>
                <Text className="text-slate-400 text-sm mt-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                  Track and export expenses
                </Text>
              </View>
              <View className="flex-row">
                <Pressable
                  onPress={handleExport}
                  className="bg-slate-800/80 p-3 rounded-full border border-slate-700/50 mr-2"
                >
                  <Download size={20} color="#94A3B8" />
                </Pressable>
                <Pressable
                  onPress={handleAddReceipt}
                  className="bg-blue-500 p-3 rounded-full"
                >
                  <Plus size={20} color="#FFFFFF" />
                </Pressable>
              </View>
            </View>
          </Animated.View>

          {/* Summary Cards */}
          <Animated.View
            entering={FadeInDown.duration(500).delay(100)}
            className="flex-row px-5 mb-6"
          >
            <SummaryCard
              title="Total Expenses"
              amount={formatCurrency(totalExpenses)}
              subtitle={`${allReceipts.length} receipts`}
              color="#3B82F6"
              icon={<ReceiptIcon size={18} color="#3B82F6" />}
            />
            <View className="w-3" />
            <SummaryCard
              title="Approved"
              amount={formatCurrency(approvedAmount)}
              subtitle={`${pendingCount} pending`}
              color="#10B981"
              icon={<CheckCircle size={18} color="#10B981" />}
            />
          </Animated.View>

          {/* Missing Receipts Alert */}
          {missingReceipts.length > 0 && (
            <Animated.View
              entering={FadeInDown.duration(500).delay(150)}
              className="px-5 mb-4"
            >
              <Pressable
                onPress={handleAddReceipt}
                className="bg-amber-500/10 rounded-2xl p-4 flex-row items-center border border-amber-500/20"
              >
                <View className="bg-amber-500/20 p-2.5 rounded-xl">
                  <AlertCircle size={20} color="#F59E0B" />
                </View>
                <View className="flex-1 ml-3">
                  <Text className="text-amber-400 font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                    {missingReceipts.length} missing receipt{missingReceipts.length > 1 ? 's' : ''}
                  </Text>
                  <Text className="text-amber-400/70 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                    Add receipts for completed bookings
                  </Text>
                </View>
                <ChevronRight size={18} color="#F59E0B" />
              </Pressable>
            </Animated.View>
          )}

          {/* Quick Actions */}
          <Animated.View
            entering={FadeInDown.duration(500).delay(200)}
            className="px-5 mb-6"
          >
            <Pressable
              onPress={handleScanReceipt}
              className="bg-slate-800/50 rounded-2xl p-4 flex-row items-center border border-slate-700/50"
            >
              <View className="bg-blue-500/20 p-3 rounded-xl">
                <Camera size={24} color="#3B82F6" />
              </View>
              <View className="flex-1 ml-3">
                <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                  Scan Receipt
                </Text>
                <Text className="text-slate-400 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                  Use camera to capture and auto-extract
                </Text>
              </View>
              <ChevronRight size={20} color="#64748B" />
            </Pressable>
          </Animated.View>

          {/* Receipts by Trip */}
          {tripsWithReceipts.length > 0 ? (
            <View className="px-5 pb-4">
              {tripsWithReceipts.map((trip, index) => (
                <TripReceiptsGroup key={trip.id} trip={trip} index={index} />
              ))}

              {/* Export CTA */}
              <Animated.View
                entering={FadeInDown.duration(500).delay(300)}
                className="mt-2"
              >
                <Pressable
                  onPress={handleExport}
                  className="bg-emerald-500/10 rounded-2xl p-4 flex-row items-center justify-center border border-emerald-500/20"
                >
                  <FileText size={18} color="#10B981" />
                  <Text className="text-emerald-400 font-semibold ml-2" style={{ fontFamily: 'DMSans_700Bold' }}>
                    Export Report
                  </Text>
                </Pressable>
              </Animated.View>
            </View>
          ) : (
            <Animated.View
              entering={FadeInDown.duration(600)}
              className="mx-5 bg-slate-800/30 rounded-3xl p-8 items-center border border-slate-700/30"
            >
              <View className="bg-slate-700/30 p-4 rounded-full mb-4">
                <ReceiptIcon size={32} color="#64748B" />
              </View>
              <Text className="text-slate-300 text-lg font-semibold text-center" style={{ fontFamily: 'DMSans_700Bold' }}>
                No receipts yet
              </Text>
              <Text className="text-slate-500 text-sm text-center mt-2 px-4" style={{ fontFamily: 'DMSans_400Regular' }}>
                Add receipts from your trips or scan new ones
              </Text>
              <Pressable
                onPress={handleAddReceipt}
                className="mt-4 bg-blue-500 px-5 py-2.5 rounded-full flex-row items-center"
              >
                <Plus size={16} color="#FFFFFF" />
                <Text className="text-white font-semibold ml-2" style={{ fontFamily: 'DMSans_700Bold' }}>
                  Add Receipt
                </Text>
              </Pressable>
            </Animated.View>
          )}

          <View className="h-8" />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

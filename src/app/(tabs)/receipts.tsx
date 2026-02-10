import React from 'react';
import { View, Text, ScrollView, Pressable, Alert, RefreshControl, ActivityIndicator, TextInput } from 'react-native';
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
  Edit3,
  Trash2,
  Search,
  X,
  Mail,
  Crown,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeInRight,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useTrips } from '@/lib/hooks/useTrips';
import { useAllReceipts, useDeleteReceipt } from '@/lib/hooks/useReceipts';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { useConnectedAccounts, useScanEmailReceipts } from '@/lib/hooks/useConnectedAccounts';
import { UpgradeModal } from '@/components/UpgradeModal';
import type { Receipt, Trip } from '@/lib/types/database';
import { formatCurrency, formatDate } from '@/lib/utils';
import { exportReceiptsAsCSV, exportReceiptsAsText } from '@/lib/export';

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
  const deleteReceipt = useDeleteReceipt();
  const [expanded, setExpanded] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const translateX = useSharedValue(0);
  const categoryColor = getCategoryColor(receipt.category);
  const statusInfo = getStatusInfo(receipt.status);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const actionButtonsStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < -20 ? 1 : 0,
  }));

  const handlePress = () => {
    if (translateX.value < -10) {
      translateX.value = withSpring(0);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded(!expanded);
  };

  const handleEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    translateX.value = withSpring(0);
    setExpanded(false);
    router.push(`/edit-receipt?id=${receipt.id}`);
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    translateX.value = withSpring(0);
    
    Alert.alert(
      'Delete Receipt',
      `Are you sure you want to delete the receipt from "${receipt.merchant}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeleting(true);
              await deleteReceipt.mutateAsync({ id: receipt.id, tripId: trip.id });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error: any) {
              setIsDeleting(false);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Error', error.message || 'Failed to delete receipt');
            }
          },
        },
      ]
    );
  };

  const handleViewTrip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/trip/${trip.id}`);
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      if (event.translationX < 0) {
        translateX.value = Math.max(event.translationX, -140);
      }
    })
    .onEnd(() => {
      if (translateX.value < -70) {
        translateX.value = withSpring(-140);
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
      } else {
        translateX.value = withSpring(0);
      }
    });

  if (isDeleting) {
    return (
      <Animated.View 
        exiting={FadeOut.duration(300)}
        className="bg-slate-800/50 rounded-2xl border border-slate-700/50 mb-3 p-4 items-center justify-center"
        style={{ height: 86 }}
      >
        <ActivityIndicator size="small" color="#EF4444" />
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInRight.duration(400).delay(index * 60)} className="mb-3">
      {/* Action Buttons Background */}
      <Animated.View 
        style={[actionButtonsStyle]}
        className="absolute right-0 top-0 bottom-0 flex-row items-center gap-2 pr-5"
      >
        <Pressable
          onPress={handleEdit}
          className="bg-blue-500 w-12 h-12 rounded-xl items-center justify-center"
        >
          <Edit3 size={18} color="#FFFFFF" />
        </Pressable>
        <Pressable
          onPress={handleDelete}
          className="bg-red-500 w-12 h-12 rounded-xl items-center justify-center"
        >
          <Trash2 size={18} color="#FFFFFF" />
        </Pressable>
      </Animated.View>

      {/* Swipeable Card */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={animatedStyle}>
          <Pressable
            onPress={handlePress}
            className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden"
          >
        <View className="p-4 flex-row items-center">
          <View style={{ backgroundColor: categoryColor + '20', padding: 10, borderRadius: 12 }}>
            {getCategoryIcon(receipt.category, 20, categoryColor)}
          </View>
          <View className="flex-1 ml-3">
            <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
              {receipt.merchant}
            </Text>
            <Pressable onPress={handleViewTrip}>
              <Text className="text-slate-400 text-sm mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                {trip.name}
              </Text>
            </Pressable>
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
              {formatDate(new Date(receipt.date))}
            </Text>
          </View>
        </View>

          </Pressable>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}


export default function ReceiptsScreen() {
  const router = useRouter();
  
  const { data: trips = [], isLoading: tripsLoading, refetch: refetchTrips } = useTrips();
  const { data: allReceipts = [], isLoading: receiptsLoading, refetch: refetchReceipts } = useAllReceipts();
  
  const [refreshing, setRefreshing] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [showSearch, setShowSearch] = React.useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = React.useState(false);
  const [upgradeReason, setUpgradeReason] = React.useState<'csv-export' | 'email-receipts'>('csv-export');
  const [isScanning, setIsScanning] = React.useState(false);
  const [scanResult, setScanResult] = React.useState<{ receiptsFound: number; totalAmount: number } | null>(null);

  const { canExportCSV, isPro } = useSubscription();
  const { data: connectedAccounts = [] } = useConnectedAccounts();
  const scanEmailReceipts = useScanEmailReceipts();
  const isLoading = tripsLoading || receiptsLoading;

  const queryClient = useQueryClient();

  // Refetch receipts when screen gains focus (e.g. returning from add/edit)
  useFocusEffect(
    React.useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
    }, [queryClient])
  );

  // Find Gmail account
  const gmailAccount = connectedAccounts.find((a: any) => a.provider === 'gmail' || a.provider === 'google');

  // Filter receipts based on search query
  const filteredReceipts = React.useMemo(() => {
    if (!searchQuery.trim()) return allReceipts;
    
    const query = searchQuery.toLowerCase();
    return allReceipts.filter(receipt => {
      const trip = trips.find((t: Trip) => t.id === receipt.trip_id);
      return (
        receipt.merchant.toLowerCase().includes(query) ||
        trip?.name.toLowerCase().includes(query) ||
        trip?.destination.toLowerCase().includes(query)
      );
    });
  }, [allReceipts, trips, searchQuery]);

  // Calculate totals from filtered receipts
  const totalExpenses = filteredReceipts.reduce((sum: number, r: Receipt) => sum + r.amount, 0);
  const pendingCount = filteredReceipts.filter((r: Receipt) => r.status === 'pending').length;
  const approvedAmount = filteredReceipts
    .filter((r: Receipt) => r.status === 'approved')
    .reduce((sum: number, r: Receipt) => sum + r.amount, 0);

  // Group receipts by trip
  const receiptsWithTrips = filteredReceipts.map((receipt: Receipt) => {
    const trip = trips.find((t: Trip) => t.id === receipt.trip_id);
    return { receipt, trip };
  }).filter(item => item.trip);

  const tripsWithReceipts = trips.filter((t: Trip) => 
    allReceipts.some((r: Receipt) => r.trip_id === t.id)
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchTrips(), refetchReceipts()]);
    setRefreshing(false);
  };

  const handleExport = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Check if user can export CSV (Pro feature)
    if (!canExportCSV) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setUpgradeReason('csv-export');
      setShowUpgradeModal(true);
      return;
    }

    // Show export options
    Alert.alert(
      'Export Receipts',
      'Choose export format',
      [
        {
          text: 'CSV (Spreadsheet)',
          onPress: async () => {
            try {
              await exportReceiptsAsCSV(filteredReceipts);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Export Failed', error.message || 'Failed to export receipts');
            }
          },
        },
        {
          text: 'Text Report',
          onPress: async () => {
            try {
              await exportReceiptsAsText(filteredReceipts);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Export Failed', error.message || 'Failed to export receipts');
            }
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const handleAddReceipt = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/add-receipt');
  };

  const handleScanReceipt = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!isPro) {
      setUpgradeReason('receipt-ocr' as any);
      setShowUpgradeModal(true);
      return;
    }
    router.push('/add-receipt');
  };

  const handleScanEmailReceipts = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Premium gate
    if (!isPro) {
      setUpgradeReason('email-receipts');
      setShowUpgradeModal(true);
      return;
    }

    // Check if Gmail is connected
    if (!gmailAccount) {
      Alert.alert(
        'Connect Gmail',
        'Connect your Gmail account to scan for travel receipts.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Connect Gmail',
            onPress: () => router.push('/connected-accounts'),
          },
        ]
      );
      return;
    }

    // Start scanning
    setIsScanning(true);
    setScanResult(null);

    try {
      const result = await scanEmailReceipts.mutateAsync(gmailAccount.id);
      const summary = result?.summary;

      if (summary) {
        setScanResult({
          receiptsFound: summary.receiptsCreated || 0,
          totalAmount: summary.totalAmount || 0,
        });

        if (summary.receiptsCreated > 0) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          // Refresh receipts list
          await refetchReceipts();
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }

      // Auto-dismiss result after 5 seconds
      setTimeout(() => setScanResult(null), 5000);
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Scan Failed', error.message || 'Failed to scan email for receipts');
    } finally {
      setIsScanning(false);
    }
  };

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
          keyboardDismissMode="on-drag"
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
            className="px-5 pt-4 pb-4"
          >
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-1">
                <Text className="text-white text-2xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                  Receipts
                </Text>
                <Text className="text-slate-400 text-sm mt-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                  Track and export expenses
                </Text>
              </View>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowSearch(!showSearch);
                    if (showSearch) setSearchQuery('');
                  }}
                  className="bg-slate-800/80 p-3 rounded-full border border-slate-700/50"
                >
                  {showSearch ? (
                    <X size={20} color="#94A3B8" />
                  ) : (
                    <Search size={20} color="#94A3B8" />
                  )}
                </Pressable>
                <Pressable
                  onPress={handleExport}
                  className="bg-slate-800/80 p-3 rounded-full border border-slate-700/50"
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

            {/* Search Bar */}
            {showSearch && (
              <Animated.View entering={FadeInDown.duration(300)}>
                <View className="bg-slate-800/80 rounded-xl px-4 py-3 flex-row items-center border border-slate-700/50">
                  <Search size={18} color="#64748B" />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search receipts..."
                    placeholderTextColor="#64748B"
                    className="flex-1 text-white ml-2"
                    style={{ fontFamily: 'DMSans_400Regular', fontSize: 16 }}
                    autoFocus
                  />
                  {searchQuery.length > 0 && (
                    <Pressable
                      onPress={() => setSearchQuery('')}
                      className="p-1"
                    >
                      <X size={16} color="#64748B" />
                    </Pressable>
                  )}
                </View>
              </Animated.View>
            )}
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
                <View className="flex-row items-center">
                  <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                    Scan Receipt
                  </Text>
                  {!isPro && (
                    <View className="bg-blue-500/20 px-2 py-0.5 rounded-full ml-2">
                      <Text className="text-blue-400 text-xs font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                        PRO
                      </Text>
                    </View>
                  )}
                </View>
                <Text className="text-slate-400 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                  Use camera to capture and auto-extract
                </Text>
              </View>
              {isPro ? (
                <ChevronRight size={20} color="#64748B" />
              ) : (
                <Crown size={20} color="#3B82F6" />
              )}
            </Pressable>

            {/* Scan Email for Receipts — Premium Feature */}
            <Pressable
              onPress={handleScanEmailReceipts}
              disabled={isScanning}
              className="bg-slate-800/50 rounded-2xl p-4 flex-row items-center border border-purple-500/30 mt-3"
              style={{ opacity: isScanning ? 0.7 : 1 }}
            >
              <View className="bg-purple-500/20 p-3 rounded-xl">
                {isScanning ? (
                  <ActivityIndicator size={24} color="#A855F7" />
                ) : (
                  <Mail size={24} color="#A855F7" />
                )}
              </View>
              <View className="flex-1 ml-3">
                <View className="flex-row items-center">
                  <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                    {isScanning ? 'Scanning your Gmail...' : 'Scan Email for Receipts'}
                  </Text>
                  {!isPro && (
                    <View className="bg-purple-500/20 px-2 py-0.5 rounded-full ml-2">
                      <Text className="text-purple-400 text-xs font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                        PRO
                      </Text>
                    </View>
                  )}
                </View>
                <Text className="text-slate-400 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                  {isScanning
                    ? 'Finding hotel invoices, flight charges, rental receipts...'
                    : 'Finds travel receipts from your email'}
                </Text>
              </View>
              {!isScanning && (
                isPro ? (
                  <ChevronRight size={20} color="#A855F7" />
                ) : (
                  <Crown size={20} color="#A855F7" />
                )
              )}
            </Pressable>

            {/* Scan Result Banner */}
            {scanResult && (
              <Animated.View
                entering={FadeInDown.duration(400)}
                className="mt-3 rounded-2xl p-4 border"
                style={{
                  backgroundColor: scanResult.receiptsFound > 0 ? '#10B98115' : '#64748B15',
                  borderColor: scanResult.receiptsFound > 0 ? '#10B98130' : '#64748B30',
                }}
              >
                <View className="flex-row items-center">
                  {scanResult.receiptsFound > 0 ? (
                    <CheckCircle size={20} color="#10B981" />
                  ) : (
                    <Mail size={20} color="#64748B" />
                  )}
                  <View className="ml-3 flex-1">
                    <Text
                      className="font-bold"
                      style={{
                        fontFamily: 'DMSans_700Bold',
                        color: scanResult.receiptsFound > 0 ? '#10B981' : '#94A3B8',
                      }}
                    >
                      {scanResult.receiptsFound > 0
                        ? `Found ${scanResult.receiptsFound} receipt${scanResult.receiptsFound === 1 ? '' : 's'}${scanResult.totalAmount > 0 ? ` totaling ${formatCurrency(scanResult.totalAmount)}` : ''}`
                        : 'No new travel receipts found'}
                    </Text>
                    <Text className="text-slate-500 text-xs mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                      {scanResult.receiptsFound > 0
                        ? 'Receipts have been added to matching trips'
                        : 'All travel receipts are already imported'}
                    </Text>
                  </View>
                </View>
              </Animated.View>
            )}
          </Animated.View>

          {/* Receipts List */}
          {receiptsWithTrips.length > 0 ? (
            <View className="px-5 pb-4">
              {receiptsWithTrips.map(({ receipt, trip }, index) => 
                trip ? (
                  <ReceiptItem
                    key={receipt.id}
                    receipt={receipt}
                    trip={trip}
                    index={index}
                  />
                ) : null
              )}

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
                {searchQuery ? <Search size={32} color="#64748B" /> : <ReceiptIcon size={32} color="#64748B" />}
              </View>
              <Text className="text-slate-300 text-lg font-semibold text-center" style={{ fontFamily: 'DMSans_700Bold' }}>
                {searchQuery ? 'No receipts found' : 'No receipts yet'}
              </Text>
              <Text className="text-slate-500 text-sm text-center mt-2 px-4" style={{ fontFamily: 'DMSans_400Regular' }}>
                {searchQuery 
                  ? `No receipts match "${searchQuery}"`
                  : 'Add receipts from your trips or scan new ones'
                }
              </Text>
              {!searchQuery && (
                <Pressable
                  onPress={handleAddReceipt}
                  className="mt-4 bg-blue-500 px-5 py-2.5 rounded-full flex-row items-center"
                >
                  <Plus size={16} color="#FFFFFF" />
                  <Text className="text-white font-semibold ml-2" style={{ fontFamily: 'DMSans_700Bold' }}>
                    Add Receipt
                  </Text>
                </Pressable>
              )}
            </Animated.View>
          )}

          <View className="h-8" />
        </ScrollView>
      </SafeAreaView>

      {/* Upgrade Modal */}
      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason={upgradeReason}
      />
    </View>
  );
}

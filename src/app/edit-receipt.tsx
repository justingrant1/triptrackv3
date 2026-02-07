import React from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, DollarSign } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useReceipt, useUpdateReceipt } from '@/lib/hooks/useReceipts';
import { useTrips } from '@/lib/hooks/useTrips';
import type { Receipt } from '@/lib/types/database';

type ReceiptCategory = Receipt['category'];

const CATEGORIES: { value: ReceiptCategory; label: string; emoji: string; color: string }[] = [
  { value: 'transport', label: 'Transport', emoji: '🛫', color: '#3B82F6' },
  { value: 'lodging', label: 'Lodging', emoji: '🏨', color: '#8B5CF6' },
  { value: 'meals', label: 'Meals', emoji: '🍽️', color: '#F59E0B' },
  { value: 'other', label: 'Other', emoji: '📦', color: '#64748B' },
];

export default function EditReceiptScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: receipt, isLoading } = useReceipt(id);
  const { data: trips = [] } = useTrips();
  const updateReceipt = useUpdateReceipt();

  const [merchant, setMerchant] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [category, setCategory] = React.useState<ReceiptCategory>('transport');
  const [tripId, setTripId] = React.useState<string>('');

  // Initialize form with receipt data
  React.useEffect(() => {
    if (receipt) {
      setMerchant(receipt.merchant);
      setAmount(receipt.amount.toString());
      setCategory(receipt.category);
      setTripId(receipt.trip_id);
    }
  }, [receipt]);

  const handleSave = async () => {
    if (!merchant.trim()) {
      Alert.alert('Missing Information', 'Please enter a merchant name');
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount');
      return;
    }

    if (!tripId) {
      Alert.alert('Missing Information', 'Please select a trip');
      return;
    }

    try {
      await updateReceipt.mutateAsync({
        id,
        updates: {
          merchant: merchant.trim(),
          amount: parsedAmount,
          category,
          trip_id: tripId,
        },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message || 'Failed to update receipt');
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-slate-950 items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (!receipt) {
    return (
      <View className="flex-1 bg-slate-950 items-center justify-center">
        <Text className="text-white">Receipt not found</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-950">
      <LinearGradient
        colors={['#0F172A', '#020617']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 py-4">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            className="bg-slate-800/80 p-2.5 rounded-full border border-slate-700/50"
          >
            <ChevronLeft size={22} color="#FFFFFF" />
          </Pressable>
          <Text className="text-white text-lg font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
            Edit Receipt
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={updateReceipt.isPending}
            className="bg-blue-500 px-4 py-2 rounded-full"
          >
            {updateReceipt.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                Save
              </Text>
            )}
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(500)} className="gap-4 py-4">
            {/* Merchant Name */}
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                Merchant Name *
              </Text>
              <TextInput
                value={merchant}
                onChangeText={setMerchant}
                placeholder="e.g., Starbucks"
                placeholderTextColor="#64748B"
                className="bg-slate-800/80 rounded-xl px-4 py-4 text-white border border-slate-700/50"
                style={{ fontFamily: 'DMSans_400Regular', fontSize: 16 }}
              />
            </View>

            {/* Amount */}
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                Amount *
              </Text>
              <View className="bg-slate-800/80 rounded-xl px-4 py-4 border border-slate-700/50 flex-row items-center">
                <DollarSign size={20} color="#64748B" />
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor="#64748B"
                  keyboardType="decimal-pad"
                  className="flex-1 text-white ml-2"
                  style={{ fontFamily: 'DMSans_400Regular', fontSize: 16 }}
                />
              </View>
            </View>

            {/* Category */}
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                Category *
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat.value}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setCategory(cat.value);
                    }}
                    className={`px-4 py-3 rounded-xl border ${
                      category === cat.value
                        ? 'border-2'
                        : 'bg-slate-800/50 border-slate-700/50'
                    }`}
                    style={{
                      backgroundColor: category === cat.value ? cat.color + '20' : undefined,
                      borderColor: category === cat.value ? cat.color : undefined,
                    }}
                  >
                    <Text
                      className={`font-medium ${
                        category === cat.value ? 'text-white' : 'text-slate-400'
                      }`}
                      style={{ fontFamily: 'DMSans_500Medium' }}
                    >
                      {cat.emoji} {cat.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Trip Selection */}
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                Trip *
              </Text>
              <View className="gap-2">
                {trips.map((trip) => (
                  <Pressable
                    key={trip.id}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setTripId(trip.id);
                    }}
                    className={`bg-slate-800/80 rounded-xl px-4 py-4 border ${
                      tripId === trip.id
                        ? 'border-blue-500'
                        : 'border-slate-700/50'
                    }`}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1">
                        <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                          {trip.name}
                        </Text>
                        <Text className="text-slate-400 text-sm mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                          {trip.destination}
                        </Text>
                      </View>
                      {tripId === trip.id && (
                        <View className="w-5 h-5 rounded-full bg-blue-500 items-center justify-center">
                          <Text className="text-white text-xs">✓</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          </Animated.View>

          <View className="h-8" />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

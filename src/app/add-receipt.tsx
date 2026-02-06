import React from 'react';
import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  X,
  Camera,
  Plane,
  Building2,
  Car,
  Utensils,
  Package,
  ChevronDown,
  Check,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTripStore, Trip } from '@/lib/store';

type Category = 'transport' | 'lodging' | 'meals' | 'other';

const categories: { id: Category; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'transport', label: 'Transport', icon: <Plane size={18} color="#3B82F6" />, color: '#3B82F6' },
  { id: 'lodging', label: 'Lodging', icon: <Building2 size={18} color="#8B5CF6" />, color: '#8B5CF6' },
  { id: 'meals', label: 'Meals', icon: <Utensils size={18} color="#F59E0B" />, color: '#F59E0B' },
  { id: 'other', label: 'Other', icon: <Package size={18} color="#64748B" />, color: '#64748B' },
];

export default function AddReceiptScreen() {
  const router = useRouter();
  const trips = useTripStore((s) => s.trips);
  const activeTrips = trips.filter(t => t.status === 'active' || t.status === 'upcoming');

  const [merchant, setMerchant] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<Category>('transport');
  const [selectedTrip, setSelectedTrip] = React.useState<Trip | null>(activeTrips[0] ?? null);
  const [showTripPicker, setShowTripPicker] = React.useState(false);

  const handleSave = () => {
    if (!merchant.trim() || !amount.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const handleScanReceipt = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // TODO: Implement camera scan
  };

  return (
    <View className="flex-1 bg-slate-950">
      <LinearGradient
        colors={['#0F172A', '#020617']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 py-4">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            className="bg-slate-800/80 p-2.5 rounded-full border border-slate-700/50"
          >
            <X size={20} color="#94A3B8" />
          </Pressable>
          <Text className="text-white text-lg font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
            Add Receipt
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={!merchant.trim() || !amount.trim()}
            className={`px-4 py-2 rounded-full ${
              merchant.trim() && amount.trim() ? 'bg-blue-500' : 'bg-slate-700'
            }`}
          >
            <Text
              className={`font-semibold ${
                merchant.trim() && amount.trim() ? 'text-white' : 'text-slate-500'
              }`}
              style={{ fontFamily: 'DMSans_700Bold' }}
            >
              Save
            </Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
          {/* Scan Receipt Button */}
          <Animated.View entering={FadeInDown.duration(500)}>
            <Pressable
              onPress={handleScanReceipt}
              className="bg-blue-500/10 rounded-2xl p-6 items-center border border-blue-500/30 mb-6"
            >
              <View className="bg-blue-500/20 p-4 rounded-full mb-3">
                <Camera size={28} color="#3B82F6" />
              </View>
              <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                Scan Receipt
              </Text>
              <Text className="text-slate-400 text-sm mt-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                Use camera to auto-fill details
              </Text>
            </Pressable>
          </Animated.View>

          {/* Divider */}
          <View className="flex-row items-center mb-6">
            <View className="flex-1 h-px bg-slate-700/50" />
            <Text className="text-slate-500 text-xs mx-4" style={{ fontFamily: 'DMSans_400Regular' }}>
              Or enter manually
            </Text>
            <View className="flex-1 h-px bg-slate-700/50" />
          </View>

          {/* Form Fields */}
          <Animated.View entering={FadeInUp.duration(500).delay(100)} className="gap-4">
            {/* Merchant */}
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                Merchant
              </Text>
              <TextInput
                value={merchant}
                onChangeText={setMerchant}
                placeholder="e.g., Uber, Marriott, Delta"
                placeholderTextColor="#64748B"
                className="bg-slate-800/80 rounded-xl px-4 py-4 text-white border border-slate-700/50"
                style={{ fontFamily: 'DMSans_400Regular', fontSize: 16 }}
              />
            </View>

            {/* Amount */}
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                Amount
              </Text>
              <View className="flex-row items-center bg-slate-800/80 rounded-xl border border-slate-700/50">
                <Text className="text-slate-400 text-lg pl-4" style={{ fontFamily: 'DMSans_500Medium' }}>
                  $
                </Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor="#64748B"
                  keyboardType="decimal-pad"
                  className="flex-1 px-2 py-4 text-white"
                  style={{ fontFamily: 'SpaceMono_700Bold', fontSize: 18 }}
                />
              </View>
            </View>

            {/* Category */}
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                Category
              </Text>
              <View className="flex-row gap-2">
                {categories.map((cat) => (
                  <Pressable
                    key={cat.id}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedCategory(cat.id);
                    }}
                    className={`flex-1 items-center py-3 rounded-xl border ${
                      selectedCategory === cat.id
                        ? 'bg-slate-700/50 border-slate-600'
                        : 'bg-slate-800/50 border-slate-700/30'
                    }`}
                  >
                    <View style={{ backgroundColor: cat.color + '20', padding: 8, borderRadius: 10, marginBottom: 4 }}>
                      {cat.icon}
                    </View>
                    <Text
                      className={`text-xs ${selectedCategory === cat.id ? 'text-white' : 'text-slate-400'}`}
                      style={{ fontFamily: 'DMSans_500Medium' }}
                    >
                      {cat.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Trip Selection */}
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                Trip
              </Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowTripPicker(!showTripPicker);
                }}
                className="bg-slate-800/80 rounded-xl px-4 py-4 flex-row items-center justify-between border border-slate-700/50"
              >
                <Text className="text-white" style={{ fontFamily: 'DMSans_400Regular' }}>
                  {selectedTrip?.name ?? 'Select a trip'}
                </Text>
                <ChevronDown size={18} color="#64748B" />
              </Pressable>

              {showTripPicker && (
                <View className="mt-2 bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden">
                  {activeTrips.map((trip) => (
                    <Pressable
                      key={trip.id}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedTrip(trip);
                        setShowTripPicker(false);
                      }}
                      className="px-4 py-3 flex-row items-center justify-between border-b border-slate-700/30"
                    >
                      <View>
                        <Text className="text-white" style={{ fontFamily: 'DMSans_500Medium' }}>
                          {trip.name}
                        </Text>
                        <Text className="text-slate-400 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                          {trip.destination}
                        </Text>
                      </View>
                      {selectedTrip?.id === trip.id && (
                        <Check size={18} color="#3B82F6" />
                      )}
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </Animated.View>

          <View className="h-8" />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

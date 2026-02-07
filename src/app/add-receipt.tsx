import React from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard, Platform } from 'react-native';
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
import * as ImagePicker from 'expo-image-picker';
import { useTrips } from '@/lib/hooks/useTrips';
import { useCreateReceipt } from '@/lib/hooks/useReceipts';
import { supabase } from '@/lib/supabase';
import { extractReceiptData } from '@/lib/openai';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { UpgradeModal, UpgradeReason } from '@/components/UpgradeModal';
import type { Trip, Receipt } from '@/lib/types/database';

type Category = Receipt['category'];

const categories: { id: Category; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'transport', label: 'Transport', icon: <Plane size={18} color="#3B82F6" />, color: '#3B82F6' },
  { id: 'lodging', label: 'Lodging', icon: <Building2 size={18} color="#8B5CF6" />, color: '#8B5CF6' },
  { id: 'meals', label: 'Meals', icon: <Utensils size={18} color="#F59E0B" />, color: '#F59E0B' },
  { id: 'other', label: 'Other', icon: <Package size={18} color="#64748B" />, color: '#64748B' },
];

export default function AddReceiptScreen() {
  const router = useRouter();
  
  const { data: trips = [], isLoading } = useTrips();
  const createReceipt = useCreateReceipt();
  
  const activeTrips = trips.filter((t: Trip) => t.status === 'active' || t.status === 'upcoming');

  const [merchant, setMerchant] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<Category>('transport');
  const [selectedTrip, setSelectedTrip] = React.useState<Trip | null>(null);
  const [showTripPicker, setShowTripPicker] = React.useState(false);
  const [isScanning, setIsScanning] = React.useState(false);
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = React.useState(false);
  const [upgradeReason, setUpgradeReason] = React.useState<UpgradeReason>('receipt-ocr');

  const { canScanReceipt, canCreateReceipt } = useSubscription();
  const isSaving = createReceipt.isPending;
  const isValid = merchant.trim() && amount.trim() && selectedTrip;

  // Set default trip when trips load
  React.useEffect(() => {
    if (activeTrips.length > 0 && !selectedTrip) {
      setSelectedTrip(activeTrips[0]);
    }
  }, [activeTrips.length]);

  const handleSave = async () => {
    if (!isValid || !selectedTrip) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Invalid Amount', 'Please enter a valid amount');
      return;
    }

    // Check receipt limit
    if (!canCreateReceipt) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setUpgradeReason('receipt-limit');
      setShowUpgradeModal(true);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await createReceipt.mutateAsync({
        trip_id: selectedTrip.id,
        reservation_id: null,
        merchant: merchant.trim(),
        amount: parsedAmount,
        currency: 'USD',
        date: new Date().toISOString(),
        category: selectedCategory,
        image_url: imageUrl,
        status: 'pending',
        ocr_data: imageUrl ? { scanned: true } : null,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message || 'Failed to create receipt');
    }
  };

  const handleScanReceipt = async () => {
    // Check if user can scan receipts (Pro feature)
    if (!canScanReceipt) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setUpgradeReason('receipt-ocr');
      setShowUpgradeModal(true);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is needed to scan receipts.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await processReceiptImage(result.assets[0].uri);
    }
  };

  const processReceiptImage = async (uri: string) => {
    setIsScanning(true);

    try {
      const fileName = `receipt-${Date.now()}.jpg`;
      const response = await fetch(uri);
      const blob = await response.blob();
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('receipts')
        .getPublicUrl(fileName);

      setImageUrl(publicUrl);

      const receiptData = await extractReceiptData(publicUrl);

      setMerchant(receiptData.merchant);
      setAmount(receiptData.amount.toString());
      if (receiptData.category) {
        setSelectedCategory(receiptData.category);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Receipt Scanned! ✨', 'Details extracted. Please review and adjust if needed.');
    } catch (error: any) {
      console.error('Receipt scan error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Scan Failed', error.message || 'Failed to scan receipt.');
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

      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View className="flex-1">
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
            disabled={!isValid || isSaving}
            className={`px-4 py-2 rounded-full ${
              isValid && !isSaving ? 'bg-blue-500' : 'bg-slate-700'
            }`}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text
                className={`font-semibold ${
                  isValid ? 'text-white' : 'text-slate-500'
                }`}
                style={{ fontFamily: 'DMSans_700Bold' }}
              >
                Save
              </Text>
            )}
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
          {/* Scan Receipt Button */}
          <Animated.View entering={FadeInDown.duration(500)}>
            <Pressable
              onPress={handleScanReceipt}
              disabled={isScanning}
              className="bg-blue-500/10 rounded-2xl p-6 items-center border border-blue-500/30 mb-6"
            >
              <View className="bg-blue-500/20 p-4 rounded-full mb-3">
                <Camera size={28} color="#3B82F6" />
              </View>
              <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                {isScanning ? 'Scanning...' : 'Scan Receipt'}
              </Text>
              <Text className="text-slate-400 text-sm mt-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                {isScanning ? 'AI is extracting details ✨' : 'Use camera to auto-fill details'}
              </Text>
              {isScanning && (
                <ActivityIndicator size="small" color="#3B82F6" style={{ marginTop: 8 }} />
              )}
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
          </View>
        </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
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

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  Modal,
  Platform,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  MapPin,
  Calendar,
  Image as ImageIcon,
  Check,
  ChevronRight,
  X,
  Mail,
  Sparkles,
  Link2,
  Lock,
  CheckCircle2,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useCreateTrip } from '@/lib/hooks/useTrips';
import { useAuthStore } from '@/lib/state/auth-store';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { useForwardingAddress } from '@/lib/hooks/useProfile';
import { useConnectedAccounts } from '@/lib/hooks/useConnectedAccounts';
import { UpgradeModal } from '@/components/UpgradeModal';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Clipboard from 'expo-clipboard';

const COVER_IMAGES = [
  'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800', // NYC
  'https://images.unsplash.com/photo-1534430480872-3498386e7856?w=800', // LA
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800', // Mountains
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800', // Beach
  'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800', // Paris
  'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800', // London
];

const formatDisplayDate = (date: Date | null): string => {
  if (!date) return 'Select date';
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export default function AddTripScreen() {
  const router = useRouter();
  const createTrip = useCreateTrip();
  const { user } = useAuthStore();
  const { canCreateTrip, isPro } = useSubscription();
  const { data: forwardingAddress, isLoading: loadingAddress } = useForwardingAddress();
  const { data: connectedAccounts = [] } = useConnectedAccounts();

  // Check if Gmail is already connected
  const hasGmailConnected = connectedAccounts.some(a => a.provider === 'gmail');

  const [tripName, setTripName] = React.useState('');
  const [destination, setDestination] = React.useState('');
  const [startDate, setStartDate] = React.useState<Date | null>(null);
  const [endDate, setEndDate] = React.useState<Date | null>(null);
  const [selectedCover, setSelectedCover] = React.useState(COVER_IMAGES[0]);
  const [showUpgradeModal, setShowUpgradeModal] = React.useState(false);

  // Date picker state
  const [showStartPicker, setShowStartPicker] = React.useState(false);
  const [showEndPicker, setShowEndPicker] = React.useState(false);
  const [tempDate, setTempDate] = React.useState(new Date());

  const isValid = tripName.trim() && destination.trim() && startDate && endDate;
  const isSaving = createTrip.isPending;

  const handleStartDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowStartPicker(false);
      if (event.type === 'set' && selectedDate) {
        setStartDate(selectedDate);
        // Auto-adjust end date if needed
        if (endDate && selectedDate > endDate) {
          setEndDate(selectedDate);
        }
      }
    } else if (selectedDate) {
      setTempDate(selectedDate);
    }
  };

  const handleEndDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndPicker(false);
      if (event.type === 'set' && selectedDate) {
        setEndDate(selectedDate);
      }
    } else if (selectedDate) {
      setTempDate(selectedDate);
    }
  };

  const confirmStartDate = () => {
    setStartDate(tempDate);
    if (endDate && tempDate > endDate) {
      setEndDate(tempDate);
    }
    setShowStartPicker(false);
  };

  const confirmEndDate = () => {
    setEndDate(tempDate);
    setShowEndPicker(false);
  };

  const openStartPicker = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTempDate(startDate ?? new Date());
    setShowStartPicker(true);
  };

  const openEndPicker = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTempDate(endDate ?? startDate ?? new Date());
    setShowEndPicker(true);
  };

  const handleSave = async () => {
    if (!isValid || !startDate || !endDate || !user) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    // Check if user can create more trips
    if (!canCreateTrip) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setShowUpgradeModal(true);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await createTrip.mutateAsync({
        user_id: user.id,
        name: tripName.trim(),
        destination: destination.trim(),
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        cover_image: selectedCover,
        status: 'upcoming',
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message || 'Failed to create trip');
    }
  };

  // iOS Modal Date Picker
  const renderIOSDatePicker = (
    isStart: boolean,
    visible: boolean,
    onClose: () => void,
    onConfirm: () => void,
    onChange: (event: DateTimePickerEvent, date?: Date) => void,
  ) => (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 bg-black/60 justify-end"
        onPress={onClose}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <Animated.View
            entering={FadeIn.duration(200)}
            className="bg-slate-900 rounded-t-3xl"
          >
            {/* Header */}
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-slate-800">
              <Pressable onPress={onClose}>
                <X size={24} color="#94A3B8" />
              </Pressable>
              <Text className="text-white text-lg font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                {isStart ? 'Start Date' : 'End Date'}
              </Text>
              <Pressable onPress={onConfirm}>
                <Text className="text-blue-500 font-semibold text-base" style={{ fontFamily: 'DMSans_700Bold' }}>
                  Done
                </Text>
              </Pressable>
            </View>

            {/* Date Picker */}
            <View className="px-4 pb-8">
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="spinner"
                onChange={onChange}
                minimumDate={isStart ? new Date() : (startDate ?? new Date())}
                textColor="#FFFFFF"
                themeVariant="dark"
                style={{ height: 200 }}
              />
            </View>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  return (
    <View className="flex-1 bg-slate-950">
      <LinearGradient
        colors={['#0F172A', '#020617']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView className="flex-1" edges={['top']}>
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
            <ChevronLeft size={22} color="#94A3B8" />
          </Pressable>
          <Text
            className="text-white text-lg font-bold"
            style={{ fontFamily: 'DMSans_700Bold' }}
          >
            New Trip
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={!isValid || isSaving}
            className={`p-2.5 rounded-full ${isValid && !isSaving ? 'bg-blue-500' : 'bg-slate-700'}`}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Check size={22} color={isValid ? '#FFFFFF' : '#64748B'} />
            )}
          </Pressable>
        </View>

        <ScrollView className="flex-1" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View className="px-5 pb-8">
            {/* Trip Name */}
            <Animated.View entering={FadeInDown.duration(400).delay(0)}>
              <Text
                className="text-slate-400 text-sm font-medium mb-2 mt-4"
                style={{ fontFamily: 'DMSans_500Medium' }}
              >
                Trip Name
              </Text>
              <View className="bg-slate-800/60 rounded-2xl border border-slate-700/50 px-4 py-3">
                <TextInput
                  value={tripName}
                  onChangeText={setTripName}
                  placeholder="e.g., NYC Business Trip"
                  placeholderTextColor="#64748B"
                  className="text-white text-base"
                  style={{ fontFamily: 'DMSans_400Regular' }}
                />
              </View>
            </Animated.View>

            {/* Destination */}
            <Animated.View entering={FadeInDown.duration(400).delay(50)}>
              <Text
                className="text-slate-400 text-sm font-medium mb-2 mt-5"
                style={{ fontFamily: 'DMSans_500Medium' }}
              >
                Destination
              </Text>
              <View className="bg-slate-800/60 rounded-2xl border border-slate-700/50 px-4 py-3 flex-row items-center">
                <MapPin size={18} color="#64748B" />
                <TextInput
                  value={destination}
                  onChangeText={setDestination}
                  placeholder="e.g., New York City"
                  placeholderTextColor="#64748B"
                  className="text-white text-base flex-1 ml-3"
                  style={{ fontFamily: 'DMSans_400Regular' }}
                />
              </View>
            </Animated.View>

            {/* Dates - Tappable */}
            <Animated.View entering={FadeInDown.duration(400).delay(100)}>
              <Text
                className="text-slate-400 text-sm font-medium mb-2 mt-5"
                style={{ fontFamily: 'DMSans_500Medium' }}
              >
                Travel Dates
              </Text>
              <View className="flex-row gap-3">
                {/* Start Date */}
                <Pressable
                  onPress={openStartPicker}
                  className="flex-1 bg-slate-800/60 rounded-2xl border border-slate-700/50 px-4 py-4"
                >
                  <Text className="text-slate-500 text-xs mb-1" style={{ fontFamily: 'DMSans_500Medium' }}>
                    From
                  </Text>
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1">
                      <Calendar size={18} color={startDate ? '#3B82F6' : '#64748B'} />
                      <Text
                        className={`ml-2 text-sm ${startDate ? 'text-white' : 'text-slate-500'}`}
                        style={{ fontFamily: startDate ? 'DMSans_500Medium' : 'DMSans_400Regular' }}
                        numberOfLines={1}
                      >
                        {formatDisplayDate(startDate)}
                      </Text>
                    </View>
                    <ChevronRight size={16} color="#64748B" />
                  </View>
                </Pressable>

                {/* End Date */}
                <Pressable
                  onPress={openEndPicker}
                  className="flex-1 bg-slate-800/60 rounded-2xl border border-slate-700/50 px-4 py-4"
                >
                  <Text className="text-slate-500 text-xs mb-1" style={{ fontFamily: 'DMSans_500Medium' }}>
                    To
                  </Text>
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1">
                      <Calendar size={18} color={endDate ? '#3B82F6' : '#64748B'} />
                      <Text
                        className={`ml-2 text-sm ${endDate ? 'text-white' : 'text-slate-500'}`}
                        style={{ fontFamily: endDate ? 'DMSans_500Medium' : 'DMSans_400Regular' }}
                        numberOfLines={1}
                      >
                        {formatDisplayDate(endDate)}
                      </Text>
                    </View>
                    <ChevronRight size={16} color="#64748B" />
                  </View>
                </Pressable>
              </View>
            </Animated.View>

            {/* Cover Image */}
            <Animated.View entering={FadeInDown.duration(400).delay(150)}>
              <Text
                className="text-slate-400 text-sm font-medium mb-3 mt-6"
                style={{ fontFamily: 'DMSans_500Medium' }}
              >
                Cover Image
              </Text>
              <View className="flex-row flex-wrap gap-3">
                {COVER_IMAGES.map((image, index) => (
                  <Pressable
                    key={index}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedCover(image);
                    }}
                    className="relative"
                  >
                    <Image
                      source={{ uri: image }}
                      className="w-24 h-24 rounded-xl"
                      resizeMode="cover"
                    />
                    {selectedCover === image && (
                      <View className="absolute inset-0 bg-blue-500/30 rounded-xl items-center justify-center border-2 border-blue-500">
                        <View className="bg-blue-500 p-1 rounded-full">
                          <Check size={16} color="#FFFFFF" />
                        </View>
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>
              <Text
                className="text-slate-500 text-xs mt-3"
                style={{ fontFamily: 'DMSans_400Regular' }}
              >
                You can also upload your own image from the IMAGES tab
              </Text>
            </Animated.View>

            {/* ─── Auto-Import Section ─────────────────────────────── */}
            <Animated.View entering={FadeInDown.duration(400).delay(200)}>
              <View className="mt-6 mb-2">
                <Text
                  className="text-slate-300 text-sm font-semibold uppercase tracking-wider mb-3"
                  style={{ fontFamily: 'SpaceMono_400Regular' }}
                >
                  Or auto-import trips
                </Text>

                {/* Option 1: AI Email Parser */}
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push('/parse-email');
                  }}
                  className="bg-purple-500/10 rounded-2xl p-4 border border-purple-500/20 mb-3"
                >
                  <View className="flex-row items-center">
                    <View className="bg-purple-500/20 p-2.5 rounded-xl">
                      <Sparkles size={20} color="#A855F7" />
                    </View>
                    <View className="flex-1 ml-3">
                      <Text
                        className="text-purple-400 font-semibold text-base"
                        style={{ fontFamily: 'DMSans_700Bold' }}
                      >
                        AI Email Parser
                      </Text>
                      <Text
                        className="text-slate-400 text-sm mt-0.5"
                        style={{ fontFamily: 'DMSans_400Regular' }}
                      >
                        Paste a confirmation email and we'll extract the trip
                      </Text>
                    </View>
                    <ChevronRight size={18} color="#A855F7" />
                  </View>
                </Pressable>

                {/* Option 2: Connect Gmail — conditional */}
                {!hasGmailConnected && (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (user && isPro) {
                        router.push('/connected-accounts');
                      } else if (user) {
                        setShowUpgradeModal(true);
                      } else {
                        router.push('/login');
                      }
                    }}
                    className="bg-blue-500/10 rounded-2xl p-4 border border-blue-500/20 mb-3"
                  >
                    <View className="flex-row items-center">
                      <View className="bg-blue-500/20 p-2.5 rounded-xl">
                        <Mail size={20} color="#3B82F6" />
                      </View>
                      <View className="flex-1 ml-3">
                        <Text
                          className="text-blue-400 font-semibold text-base"
                          style={{ fontFamily: 'DMSans_700Bold' }}
                        >
                          Connect Gmail
                        </Text>
                        <Text
                          className="text-slate-400 text-sm mt-0.5"
                          style={{ fontFamily: 'DMSans_400Regular' }}
                        >
                          {!user
                            ? 'Sign in to auto-scan your travel emails'
                            : !isPro
                              ? 'Upgrade to Pro to auto-scan your inbox'
                              : 'Auto-scan your inbox for travel bookings'}
                        </Text>
                      </View>
                      {!user || !isPro ? (
                        <Lock size={16} color="#64748B" />
                      ) : (
                        <ChevronRight size={18} color="#3B82F6" />
                      )}
                    </View>
                  </Pressable>
                )}

                {/* Gmail connected — show success state */}
                {hasGmailConnected && (
                  <View className="bg-emerald-500/10 rounded-2xl p-4 border border-emerald-500/20 mb-3">
                    <View className="flex-row items-center">
                      <View className="bg-emerald-500/20 p-2.5 rounded-xl">
                        <CheckCircle2 size={20} color="#10B981" />
                      </View>
                      <View className="flex-1 ml-3">
                        <Text
                          className="text-emerald-400 font-semibold text-base"
                          style={{ fontFamily: 'DMSans_700Bold' }}
                        >
                          Gmail Connected
                        </Text>
                        <Text
                          className="text-slate-400 text-sm mt-0.5"
                          style={{ fontFamily: 'DMSans_400Regular' }}
                        >
                          Your travel emails are being auto-scanned
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* Option 3: Email Forwarding */}
                <View className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/30">
                  <View className="flex-row items-start">
                    <View className="bg-slate-700/40 p-2.5 rounded-xl">
                      <Mail size={18} color="#94A3B8" />
                    </View>
                    <View className="flex-1 ml-3">
                      <Text
                        className="text-slate-300 font-semibold text-sm"
                        style={{ fontFamily: 'DMSans_700Bold' }}
                      >
                        Forward Emails
                      </Text>
                      <Text
                        className="text-slate-500 text-xs mt-0.5"
                        style={{ fontFamily: 'DMSans_400Regular' }}
                      >
                        Forward travel confirmations to:
                      </Text>
                      {loadingAddress ? (
                        <View className="bg-slate-800/60 rounded-lg px-3 py-1.5 mt-2">
                          <ActivityIndicator size="small" color="#3B82F6" />
                        </View>
                      ) : forwardingAddress ? (
                        <Pressable
                          onPress={async () => {
                            await Clipboard.setStringAsync(forwardingAddress);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            Alert.alert('Copied!', 'Forwarding address copied to clipboard');
                          }}
                          className="bg-slate-800/60 rounded-lg px-3 py-1.5 mt-2 flex-row items-center justify-between"
                        >
                          <Text
                            className="text-blue-400 text-xs flex-1"
                            style={{ fontFamily: 'SpaceMono_400Regular' }}
                            numberOfLines={1}
                          >
                            {forwardingAddress}
                          </Text>
                          <Text className="text-slate-600 text-xs ml-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                            Copy
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>
            </Animated.View>
          </View>
        </ScrollView>
          </View>
        </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* iOS Date Pickers */}
      {Platform.OS === 'ios' && (
        <>
          {renderIOSDatePicker(
            true,
            showStartPicker,
            () => setShowStartPicker(false),
            confirmStartDate,
            handleStartDateChange
          )}
          {renderIOSDatePicker(
            false,
            showEndPicker,
            () => setShowEndPicker(false),
            confirmEndDate,
            handleEndDateChange
          )}
        </>
      )}

      {/* Android Date Pickers */}
      {Platform.OS === 'android' && showStartPicker && (
        <DateTimePicker
          value={tempDate}
          mode="date"
          display="default"
          onChange={handleStartDateChange}
          minimumDate={new Date()}
        />
      )}
      {Platform.OS === 'android' && showEndPicker && (
        <DateTimePicker
          value={tempDate}
          mode="date"
          display="default"
          onChange={handleEndDateChange}
          minimumDate={startDate ?? new Date()}
        />
      )}

      {/* Upgrade Modal */}
      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason="trips"
      />
    </View>
  );
}

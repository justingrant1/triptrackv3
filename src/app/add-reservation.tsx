import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Platform,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ChevronLeft,
  Plane,
  Building2,
  Car,
  Train,
  Users,
  Ticket,
  Calendar,
  Clock,
  MapPin,
  Hash,
  Check,
  X,
  ChevronRight,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useQueryClient } from '@tanstack/react-query';
import { useTrip } from '@/lib/hooks/useTrips';
import { useCreateReservation } from '@/lib/hooks/useReservations';
import { checkFlightStatusForTrip, extractFlightNumber } from '@/lib/flight-status';
import type { Reservation } from '@/lib/types/database';
import { parseDateOnly } from '@/lib/utils';

type ReservationType = Reservation['type'];

const RESERVATION_TYPES: { type: ReservationType; label: string; icon: React.ReactNode; color: string }[] = [
  { type: 'flight', label: 'Flight', icon: <Plane size={20} color="#3B82F6" />, color: '#3B82F6' },
  { type: 'hotel', label: 'Hotel', icon: <Building2 size={20} color="#8B5CF6" />, color: '#8B5CF6' },
  { type: 'car', label: 'Car Rental', icon: <Car size={20} color="#10B981" />, color: '#10B981' },
  { type: 'train', label: 'Train', icon: <Train size={20} color="#F59E0B" />, color: '#F59E0B' },
  { type: 'meeting', label: 'Meeting', icon: <Users size={20} color="#EC4899" />, color: '#EC4899' },
  { type: 'event', label: 'Event', icon: <Ticket size={20} color="#06B6D4" />, color: '#06B6D4' },
];

const formatDisplayDate = (date: Date | null): string => {
  if (!date) return 'Select date';
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

const formatDisplayTime = (date: Date | null): string => {
  if (!date) return 'Select time';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export default function AddReservationScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  
  const queryClient = useQueryClient();
  const { data: trip, isLoading: tripLoading } = useTrip(tripId);
  const createReservation = useCreateReservation();

  const [selectedType, setSelectedType] = React.useState<ReservationType>('flight');
  const [title, setTitle] = React.useState('');
  const [subtitle, setSubtitle] = React.useState('');
  const [startDateTime, setStartDateTime] = React.useState<Date | null>(null);
  const [endDateTime, setEndDateTime] = React.useState<Date | null>(null);
  const [address, setAddress] = React.useState('');
  const [confirmationNumber, setConfirmationNumber] = React.useState('');

  // Date/Time picker state
  const [pickerMode, setPickerMode] = React.useState<'date' | 'time'>('date');
  const [pickerTarget, setPickerTarget] = React.useState<'start' | 'end'>('start');
  const [showPicker, setShowPicker] = React.useState(false);
  const [tempDate, setTempDate] = React.useState(new Date());

  const selectedTypeInfo = RESERVATION_TYPES.find((t) => t.type === selectedType);
  const isValid = title.trim() && startDateTime;
  const isSaving = createReservation.isPending;

  const getPlaceholders = () => {
    switch (selectedType) {
      case 'flight':
        return { title: 'e.g., AA 182', subtitle: 'e.g., SFO → JFK' };
      case 'hotel':
        return { title: 'e.g., The William Vale', subtitle: 'e.g., 2 nights' };
      case 'car':
        return { title: 'e.g., Tesla Model 3', subtitle: 'e.g., Enterprise' };
      case 'train':
        return { title: 'e.g., Amtrak 123', subtitle: 'e.g., NYC → Boston' };
      case 'meeting':
        return { title: 'e.g., Client Meeting', subtitle: 'e.g., Acme Corp' };
      case 'event':
        return { title: 'e.g., Tech Summit', subtitle: 'e.g., VIP Pass' };
      default:
        return { title: 'Title', subtitle: 'Details' };
    }
  };

  const placeholders = getPlaceholders();

  const openPicker = (target: 'start' | 'end', mode: 'date' | 'time') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPickerTarget(target);
    setPickerMode(mode);
    const currentDate = target === 'start' ? startDateTime : endDateTime;
    setTempDate(currentDate ?? (trip ? parseDateOnly(trip.start_date) : new Date()));
    setShowPicker(true);
  };

  const handlePickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
      if (event.type === 'set' && selectedDate) {
        applyDateChange(selectedDate);
      }
    } else if (selectedDate) {
      setTempDate(selectedDate);
    }
  };

  const applyDateChange = (date: Date) => {
    if (pickerTarget === 'start') {
      if (pickerMode === 'date') {
        const newDate = new Date(date);
        if (startDateTime) {
          newDate.setHours(startDateTime.getHours(), startDateTime.getMinutes());
        }
        setStartDateTime(newDate);
      } else {
        const newDate = startDateTime ? new Date(startDateTime) : new Date();
        newDate.setHours(date.getHours(), date.getMinutes());
        setStartDateTime(newDate);
      }
    } else {
      if (pickerMode === 'date') {
        const newDate = new Date(date);
        if (endDateTime) {
          newDate.setHours(endDateTime.getHours(), endDateTime.getMinutes());
        }
        setEndDateTime(newDate);
      } else {
        const newDate = endDateTime ? new Date(endDateTime) : (startDateTime ? new Date(startDateTime) : new Date());
        newDate.setHours(date.getHours(), date.getMinutes());
        setEndDateTime(newDate);
      }
    }
  };

  const confirmPicker = () => {
    applyDateChange(tempDate);
    setShowPicker(false);
  };

  const handleSave = async () => {
    if (!isValid || !startDateTime || !tripId) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Build details object — for flights, include the flight number so the
      // edge function can look it up via AirLabs
      const details: Record<string, any> = {};
      // For flights, normalize the title: "Aa 205" → "AA205"
      const normalizedTitle = selectedType === 'flight'
        ? (extractFlightNumber(title.trim()) || title.trim().toUpperCase())
        : title.trim();

      if (selectedType === 'flight' && normalizedTitle) {
        details['Flight Number'] = normalizedTitle;
        if (subtitle.trim()) {
          // Parse route like "SFO → JFK" or "SFO - JFK"
          const routeMatch = subtitle.trim().match(/([A-Z]{3})\s*[→\-–>to]+\s*([A-Z]{3})/i);
          if (routeMatch) {
            details['Departure Airport'] = routeMatch[1].toUpperCase();
            details['Arrival Airport'] = routeMatch[2].toUpperCase();
          }
        }
      }

      await createReservation.mutateAsync({
        trip_id: tripId,
        type: selectedType,
        title: normalizedTitle,
        subtitle: subtitle.trim() || null,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime ? endDateTime.toISOString() : null,
        location: null,
        address: address.trim() || null,
        confirmation_number: confirmationNumber.trim() || null,
        details,
        status: 'confirmed',
        alert_message: null,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // For flights, automatically fetch live status in the background
      // so the trip detail screen shows gate/terminal/status immediately
      if (selectedType === 'flight' && tripId) {
        // Fire and forget — don't block navigation
        checkFlightStatusForTrip(tripId)
          .then(() => {
            // Invalidate cache so trip detail screen picks up the new data
            queryClient.invalidateQueries({ queryKey: ['reservations', tripId] });
          })
          .catch((err) => {
            console.warn('[AddReservation] Background flight status fetch failed:', err);
          });
      }

      router.back();
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message || 'Failed to create reservation');
    }
  };

  if (!trip) {
    return (
      <View className="flex-1 bg-slate-950 items-center justify-center">
        <Text className="text-white">Trip not found</Text>
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
            <ChevronLeft size={22} color="#94A3B8" />
          </Pressable>
          <Text
            className="text-white text-lg font-bold"
            style={{ fontFamily: 'DMSans_700Bold' }}
          >
            Add Details
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

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View className="px-5 pb-8">
            {/* Type Selection */}
            <Animated.View entering={FadeInDown.duration(400).delay(0)}>
              <Text
                className="text-slate-400 text-sm font-medium mb-3 mt-2"
                style={{ fontFamily: 'DMSans_500Medium' }}
              >
                Type
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -20, paddingHorizontal: 20 }}
                contentContainerStyle={{ gap: 10 }}
              >
                {RESERVATION_TYPES.map((item) => (
                  <Pressable
                    key={item.type}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedType(item.type);
                    }}
                    className={`px-4 py-3 rounded-2xl flex-row items-center border ${
                      selectedType === item.type
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-700/50 bg-slate-800/40'
                    }`}
                  >
                    <View
                      style={{
                        backgroundColor: item.color + '20',
                        padding: 8,
                        borderRadius: 10,
                      }}
                    >
                      {item.icon}
                    </View>
                    <Text
                      className={`ml-2 font-medium ${
                        selectedType === item.type ? 'text-white' : 'text-slate-400'
                      }`}
                      style={{ fontFamily: 'DMSans_500Medium' }}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Animated.View>

            {/* Title */}
            <Animated.View entering={FadeInDown.duration(400).delay(50)}>
              <Text
                className="text-slate-400 text-sm font-medium mb-2 mt-5"
                style={{ fontFamily: 'DMSans_500Medium' }}
              >
                {selectedType === 'flight' ? 'Flight Number' : selectedType === 'hotel' ? 'Hotel Name' : 'Title'}
              </Text>
              <View className="bg-slate-800/60 rounded-2xl border border-slate-700/50 px-4 py-3 flex-row items-center">
                <View style={{ backgroundColor: selectedTypeInfo?.color + '20', padding: 8, borderRadius: 10 }}>
                  {selectedTypeInfo?.icon}
                </View>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder={placeholders.title}
                  placeholderTextColor="#64748B"
                  className="text-white text-base flex-1 ml-3"
                  style={{ fontFamily: 'DMSans_400Regular' }}
                  autoCapitalize={selectedType === 'flight' ? 'characters' : 'sentences'}
                />
              </View>
            </Animated.View>

            {/* Subtitle */}
            <Animated.View entering={FadeInDown.duration(400).delay(100)}>
              <Text
                className="text-slate-400 text-sm font-medium mb-2 mt-4"
                style={{ fontFamily: 'DMSans_500Medium' }}
              >
                {selectedType === 'flight' ? 'Route' : 'Details'} (optional)
              </Text>
              <View className="bg-slate-800/60 rounded-2xl border border-slate-700/50 px-4 py-3">
                <TextInput
                  value={subtitle}
                  onChangeText={setSubtitle}
                  placeholder={placeholders.subtitle}
                  placeholderTextColor="#64748B"
                  className="text-white text-base"
                  style={{ fontFamily: 'DMSans_400Regular' }}
                />
              </View>
            </Animated.View>

            {/* Date & Time */}
            <Animated.View entering={FadeInDown.duration(400).delay(150)}>
              <Text
                className="text-slate-400 text-sm font-medium mb-2 mt-5"
                style={{ fontFamily: 'DMSans_500Medium' }}
              >
                {selectedType === 'hotel' ? 'Check-in' : 'Start'}
              </Text>
              <View className="flex-row gap-3">
                <Pressable
                  onPress={() => openPicker('start', 'date')}
                  className="flex-1 bg-slate-800/60 rounded-2xl border border-slate-700/50 px-4 py-3 flex-row items-center"
                >
                  <Calendar size={18} color={startDateTime ? '#3B82F6' : '#64748B'} />
                  <Text
                    className={`ml-2 text-sm flex-1 ${startDateTime ? 'text-white' : 'text-slate-500'}`}
                    style={{ fontFamily: startDateTime ? 'DMSans_500Medium' : 'DMSans_400Regular' }}
                  >
                    {formatDisplayDate(startDateTime)}
                  </Text>
                  <ChevronRight size={16} color="#64748B" />
                </Pressable>
                <Pressable
                  onPress={() => openPicker('start', 'time')}
                  className="flex-1 bg-slate-800/60 rounded-2xl border border-slate-700/50 px-4 py-3 flex-row items-center"
                >
                  <Clock size={18} color={startDateTime ? '#3B82F6' : '#64748B'} />
                  <Text
                    className={`ml-2 text-sm flex-1 ${startDateTime ? 'text-white' : 'text-slate-500'}`}
                    style={{ fontFamily: startDateTime ? 'DMSans_500Medium' : 'DMSans_400Regular' }}
                  >
                    {formatDisplayTime(startDateTime)}
                  </Text>
                  <ChevronRight size={16} color="#64748B" />
                </Pressable>
              </View>
            </Animated.View>

            {/* End Date & Time (optional) */}
            <Animated.View entering={FadeInDown.duration(400).delay(200)}>
              <Text
                className="text-slate-400 text-sm font-medium mb-2 mt-4"
                style={{ fontFamily: 'DMSans_500Medium' }}
              >
                {selectedType === 'hotel' ? 'Check-out' : 'End'} (optional)
              </Text>
              <View className="flex-row gap-3">
                <Pressable
                  onPress={() => openPicker('end', 'date')}
                  className="flex-1 bg-slate-800/60 rounded-2xl border border-slate-700/50 px-4 py-3 flex-row items-center"
                >
                  <Calendar size={18} color={endDateTime ? '#3B82F6' : '#64748B'} />
                  <Text
                    className={`ml-2 text-sm flex-1 ${endDateTime ? 'text-white' : 'text-slate-500'}`}
                    style={{ fontFamily: endDateTime ? 'DMSans_500Medium' : 'DMSans_400Regular' }}
                  >
                    {formatDisplayDate(endDateTime)}
                  </Text>
                  <ChevronRight size={16} color="#64748B" />
                </Pressable>
                <Pressable
                  onPress={() => openPicker('end', 'time')}
                  className="flex-1 bg-slate-800/60 rounded-2xl border border-slate-700/50 px-4 py-3 flex-row items-center"
                >
                  <Clock size={18} color={endDateTime ? '#3B82F6' : '#64748B'} />
                  <Text
                    className={`ml-2 text-sm flex-1 ${endDateTime ? 'text-white' : 'text-slate-500'}`}
                    style={{ fontFamily: endDateTime ? 'DMSans_500Medium' : 'DMSans_400Regular' }}
                  >
                    {formatDisplayTime(endDateTime)}
                  </Text>
                  <ChevronRight size={16} color="#64748B" />
                </Pressable>
              </View>
            </Animated.View>

            {/* Address */}
            <Animated.View entering={FadeInDown.duration(400).delay(250)}>
              <Text
                className="text-slate-400 text-sm font-medium mb-2 mt-5"
                style={{ fontFamily: 'DMSans_500Medium' }}
              >
                Location (optional)
              </Text>
              <View className="bg-slate-800/60 rounded-2xl border border-slate-700/50 px-4 py-3 flex-row items-center">
                <MapPin size={18} color="#64748B" />
                <TextInput
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Address or location"
                  placeholderTextColor="#64748B"
                  className="text-white text-base flex-1 ml-3"
                  style={{ fontFamily: 'DMSans_400Regular' }}
                />
              </View>
            </Animated.View>

            {/* Confirmation Number */}
            <Animated.View entering={FadeInDown.duration(400).delay(300)}>
              <Text
                className="text-slate-400 text-sm font-medium mb-2 mt-4"
                style={{ fontFamily: 'DMSans_500Medium' }}
              >
                Confirmation # (optional)
              </Text>
              <View className="bg-slate-800/60 rounded-2xl border border-slate-700/50 px-4 py-3 flex-row items-center">
                <Hash size={18} color="#64748B" />
                <TextInput
                  value={confirmationNumber}
                  onChangeText={setConfirmationNumber}
                  placeholder="Booking reference"
                  placeholderTextColor="#64748B"
                  className="text-white text-base flex-1 ml-3"
                  style={{ fontFamily: 'SpaceMono_400Regular' }}
                  autoCapitalize="characters"
                />
              </View>
            </Animated.View>
          </View>
        </ScrollView>
        </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* iOS Date/Time Picker Modal */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={showPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPicker(false)}
        >
          <Pressable
            className="flex-1 bg-black/60 justify-end"
            onPress={() => setShowPicker(false)}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <Animated.View
                entering={FadeIn.duration(200)}
                className="bg-slate-900 rounded-t-3xl"
              >
                <View className="flex-row items-center justify-between px-5 py-4 border-b border-slate-800">
                  <Pressable onPress={() => setShowPicker(false)}>
                    <X size={24} color="#94A3B8" />
                  </Pressable>
                  <Text className="text-white text-lg font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                    {pickerMode === 'date' ? 'Select Date' : 'Select Time'}
                  </Text>
                  <Pressable onPress={confirmPicker}>
                    <Text className="text-blue-500 font-semibold text-base" style={{ fontFamily: 'DMSans_700Bold' }}>
                      Done
                    </Text>
                  </Pressable>
                </View>
                <View className="px-4 pb-8">
                  <DateTimePicker
                    value={tempDate}
                    mode={pickerMode}
                    display="spinner"
                    onChange={handlePickerChange}
                    textColor="#FFFFFF"
                    themeVariant="dark"
                    style={{ height: 200 }}
                  />
                </View>
              </Animated.View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Android Date/Time Picker */}
      {Platform.OS === 'android' && showPicker && (
        <DateTimePicker
          value={tempDate}
          mode={pickerMode}
          display="default"
          onChange={handlePickerChange}
        />
      )}
    </View>
  );
}

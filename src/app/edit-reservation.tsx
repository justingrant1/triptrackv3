import React from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Calendar, Clock } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';
import { useReservation, useUpdateReservation } from '@/lib/hooks/useReservations';
import type { Reservation } from '@/lib/types/database';

type ReservationType = Reservation['type'];

const RESERVATION_TYPES: { value: ReservationType; label: string; emoji: string }[] = [
  { value: 'flight', label: 'Flight', emoji: '✈️' },
  { value: 'hotel', label: 'Hotel', emoji: '🏨' },
  { value: 'car', label: 'Car Rental', emoji: '🚗' },
  { value: 'train', label: 'Train', emoji: '🚂' },
  { value: 'meeting', label: 'Meeting', emoji: '👥' },
  { value: 'event', label: 'Event', emoji: '🎫' },
];

export default function EditReservationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: reservation, isLoading } = useReservation(id);
  const updateReservation = useUpdateReservation();

  const [type, setType] = React.useState<ReservationType>('flight');
  const [title, setTitle] = React.useState('');
  const [subtitle, setSubtitle] = React.useState('');
  const [startTime, setStartTime] = React.useState(new Date());
  const [endTime, setEndTime] = React.useState<Date | null>(null);
  const [location, setLocation] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [confirmationNumber, setConfirmationNumber] = React.useState('');

  const [showStartDatePicker, setShowStartDatePicker] = React.useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = React.useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = React.useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = React.useState(false);

  // Initialize form with reservation data
  React.useEffect(() => {
    if (reservation) {
      setType(reservation.type);
      setTitle(reservation.title);
      setSubtitle(reservation.subtitle || '');
      setStartTime(new Date(reservation.start_time));
      setEndTime(reservation.end_time ? new Date(reservation.end_time) : null);
      setLocation(reservation.location || '');
      setAddress(reservation.address || '');
      setConfirmationNumber(reservation.confirmation_number || '');
    }
  }, [reservation]);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Missing Information', 'Please enter a title');
      return;
    }

    try {
      await updateReservation.mutateAsync({
        id,
        updates: {
          type,
          title: title.trim(),
          subtitle: subtitle.trim() || null,
          start_time: startTime.toISOString(),
          end_time: endTime?.toISOString() || null,
          location: location.trim() || null,
          address: address.trim() || null,
          confirmation_number: confirmationNumber.trim() || null,
        },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message || 'Failed to update reservation');
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-slate-950 items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (!reservation) {
    return (
      <View className="flex-1 bg-slate-950 items-center justify-center">
        <Text className="text-white">Reservation not found</Text>
      </View>
    );
  }

  const getPlaceholder = (field: 'title' | 'subtitle') => {
    const placeholders: Record<ReservationType, { title: string; subtitle: string }> = {
      flight: { title: 'e.g., AA 182', subtitle: 'e.g., JFK → LAX' },
      hotel: { title: 'e.g., Marriott Downtown', subtitle: 'e.g., Deluxe King Room' },
      car: { title: 'e.g., Enterprise Rental', subtitle: 'e.g., Toyota Camry' },
      train: { title: 'e.g., Amtrak Northeast Regional', subtitle: 'e.g., NYC → Boston' },
      meeting: { title: 'e.g., Client Meeting', subtitle: 'e.g., Conference Room A' },
      event: { title: 'e.g., Tech Conference 2026', subtitle: 'e.g., Keynote Session' },
    };
    return placeholders[type][field];
  };

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
            Edit Reservation
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={updateReservation.isPending}
            className="bg-blue-500 px-4 py-2 rounded-full"
          >
            {updateReservation.isPending ? (
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
            {/* Type Selection */}
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                Type *
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {RESERVATION_TYPES.map((t) => (
                  <Pressable
                    key={t.value}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setType(t.value);
                    }}
                    className={`px-4 py-3 rounded-xl border ${
                      type === t.value
                        ? 'bg-blue-500 border-blue-500'
                        : 'bg-slate-800/50 border-slate-700/50'
                    }`}
                  >
                    <Text
                      className={`font-medium ${
                        type === t.value ? 'text-white' : 'text-slate-400'
                      }`}
                      style={{ fontFamily: 'DMSans_500Medium' }}
                    >
                      {t.emoji} {t.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Title */}
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                {type === 'flight' ? 'Flight Number' : type === 'hotel' ? 'Hotel Name' : 'Title'} *
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={getPlaceholder('title')}
                placeholderTextColor="#64748B"
                className="bg-slate-800/80 rounded-xl px-4 py-4 text-white border border-slate-700/50"
                style={{ fontFamily: 'DMSans_400Regular', fontSize: 16 }}
              />
            </View>

            {/* Subtitle */}
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                {type === 'flight' ? 'Route' : type === 'hotel' ? 'Room Type' : 'Details'} (Optional)
              </Text>
              <TextInput
                value={subtitle}
                onChangeText={setSubtitle}
                placeholder={getPlaceholder('subtitle')}
                placeholderTextColor="#64748B"
                className="bg-slate-800/80 rounded-xl px-4 py-4 text-white border border-slate-700/50"
                style={{ fontFamily: 'DMSans_400Regular', fontSize: 16 }}
              />
            </View>

            {/* Start Date & Time */}
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                {type === 'hotel' ? 'Check-in' : 'Start Date & Time'} *
              </Text>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => setShowStartDatePicker(true)}
                  className="flex-1 bg-slate-800/80 rounded-xl px-4 py-4 border border-slate-700/50 flex-row items-center justify-between"
                >
                  <Text className="text-white text-base" style={{ fontFamily: 'DMSans_400Regular' }}>
                    {startTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                  <Calendar size={18} color="#64748B" />
                </Pressable>
                <Pressable
                  onPress={() => setShowStartTimePicker(true)}
                  className="flex-1 bg-slate-800/80 rounded-xl px-4 py-4 border border-slate-700/50 flex-row items-center justify-between"
                >
                  <Text className="text-white text-base" style={{ fontFamily: 'DMSans_400Regular' }}>
                    {startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                  <Clock size={18} color="#64748B" />
                </Pressable>
              </View>
            </View>

            {/* End Date & Time */}
            {type !== 'meeting' && type !== 'event' && (
              <View>
                <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                  {type === 'hotel' ? 'Check-out' : 'End Date & Time'} (Optional)
                </Text>
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => setShowEndDatePicker(true)}
                    className="flex-1 bg-slate-800/80 rounded-xl px-4 py-4 border border-slate-700/50 flex-row items-center justify-between"
                  >
                    <Text className="text-white text-base" style={{ fontFamily: 'DMSans_400Regular' }}>
                      {endTime ? endTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Select date'}
                    </Text>
                    <Calendar size={18} color="#64748B" />
                  </Pressable>
                  <Pressable
                    onPress={() => setShowEndTimePicker(true)}
                    className="flex-1 bg-slate-800/80 rounded-xl px-4 py-4 border border-slate-700/50 flex-row items-center justify-between"
                  >
                    <Text className="text-white text-base" style={{ fontFamily: 'DMSans_400Regular' }}>
                      {endTime ? endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'Select time'}
                    </Text>
                    <Clock size={18} color="#64748B" />
                  </Pressable>
                </View>
              </View>
            )}

            {/* Location */}
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                Location (Optional)
              </Text>
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="e.g., Terminal 4, Gate B12"
                placeholderTextColor="#64748B"
                className="bg-slate-800/80 rounded-xl px-4 py-4 text-white border border-slate-700/50"
                style={{ fontFamily: 'DMSans_400Regular', fontSize: 16 }}
              />
            </View>

            {/* Address */}
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                Address (Optional)
              </Text>
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="e.g., 123 Main St, New York, NY"
                placeholderTextColor="#64748B"
                className="bg-slate-800/80 rounded-xl px-4 py-4 text-white border border-slate-700/50"
                style={{ fontFamily: 'DMSans_400Regular', fontSize: 16 }}
              />
            </View>

            {/* Confirmation Number */}
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                Confirmation Number (Optional)
              </Text>
              <TextInput
                value={confirmationNumber}
                onChangeText={setConfirmationNumber}
                placeholder="e.g., ABC123"
                placeholderTextColor="#64748B"
                autoCapitalize="characters"
                className="bg-slate-800/80 rounded-xl px-4 py-4 text-white border border-slate-700/50"
                style={{ fontFamily: 'DMSans_400Regular', fontSize: 16 }}
              />
            </View>
          </Animated.View>

          <View className="h-8" />
        </ScrollView>
      </SafeAreaView>

      {/* Date/Time Pickers */}
      {showStartDatePicker && (
        <DateTimePicker
          value={startTime}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selectedDate) => {
            setShowStartDatePicker(Platform.OS === 'ios');
            if (selectedDate) {
              setStartTime(selectedDate);
            }
          }}
        />
      )}

      {showStartTimePicker && (
        <DateTimePicker
          value={startTime}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selectedDate) => {
            setShowStartTimePicker(Platform.OS === 'ios');
            if (selectedDate) {
              setStartTime(selectedDate);
            }
          }}
        />
      )}

      {showEndDatePicker && (
        <DateTimePicker
          value={endTime || startTime}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={startTime}
          onChange={(event, selectedDate) => {
            setShowEndDatePicker(Platform.OS === 'ios');
            if (selectedDate) {
              setEndTime(selectedDate);
            }
          }}
        />
      )}

      {showEndTimePicker && (
        <DateTimePicker
          value={endTime || startTime}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selectedDate) => {
            setShowEndTimePicker(Platform.OS === 'ios');
            if (selectedDate) {
              setEndTime(selectedDate);
            }
          }}
        />
      )}
    </View>
  );
}

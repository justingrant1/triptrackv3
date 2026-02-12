import React from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Calendar } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTrip, useUpdateTrip } from '@/lib/hooks/useTrips';
import { parseDateOnly } from '@/lib/utils';

export default function EditTripScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: trip, isLoading } = useTrip(id);
  const updateTrip = useUpdateTrip();

  const [name, setName] = React.useState('');
  const [destination, setDestination] = React.useState('');
  const [startDate, setStartDate] = React.useState(new Date());
  const [endDate, setEndDate] = React.useState(new Date());
  const [coverImage, setCoverImage] = React.useState('');
  const [status, setStatus] = React.useState<'upcoming' | 'active' | 'completed'>('upcoming');

  const [showStartPicker, setShowStartPicker] = React.useState(false);
  const [showEndPicker, setShowEndPicker] = React.useState(false);

  // Initialize form with trip data
  React.useEffect(() => {
    if (trip) {
      setName(trip.name);
      setDestination(trip.destination);
      setStartDate(parseDateOnly(trip.start_date));
      setEndDate(parseDateOnly(trip.end_date));
      setCoverImage(trip.cover_image || '');
      setStatus(trip.status);
    }
  }, [trip]);

  const handleSave = async () => {
    if (!name.trim() || !destination.trim()) {
      Alert.alert('Missing Information', 'Please fill in all required fields');
      return;
    }

    if (endDate < startDate) {
      Alert.alert('Invalid Dates', 'End date must be after start date');
      return;
    }

    try {
      await updateTrip.mutateAsync({
        id,
        updates: {
          name: name.trim(),
          destination: destination.trim(),
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          cover_image: coverImage.trim() || null,
          status,
        },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message || 'Failed to update trip');
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-slate-950 items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

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
            <ChevronLeft size={22} color="#FFFFFF" />
          </Pressable>
          <Text className="text-white text-lg font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
            Edit Trip
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={updateTrip.isPending}
            className="bg-blue-500 px-4 py-2 rounded-full"
          >
            {updateTrip.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                Save
              </Text>
            )}
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.duration(500)} className="gap-4 py-4">
            {/* Trip Name */}
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                Trip Name *
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g., Summer Vacation"
                placeholderTextColor="#64748B"
                className="bg-slate-800/80 rounded-xl px-4 py-4 text-white border border-slate-700/50"
                style={{ fontFamily: 'DMSans_400Regular', fontSize: 16 }}
              />
            </View>

            {/* Destination */}
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                Destination *
              </Text>
              <TextInput
                value={destination}
                onChangeText={setDestination}
                placeholder="e.g., Paris, France"
                placeholderTextColor="#64748B"
                className="bg-slate-800/80 rounded-xl px-4 py-4 text-white border border-slate-700/50"
                style={{ fontFamily: 'DMSans_400Regular', fontSize: 16 }}
              />
            </View>

            {/* Start Date */}
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                Start Date *
              </Text>
              <Pressable
                onPress={() => setShowStartPicker(true)}
                className="bg-slate-800/80 rounded-xl px-4 py-4 border border-slate-700/50 flex-row items-center justify-between"
              >
                <Text className="text-white text-base" style={{ fontFamily: 'DMSans_400Regular' }}>
                  {startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
                <Calendar size={20} color="#64748B" />
              </Pressable>
            </View>

            {/* End Date */}
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                End Date *
              </Text>
              <Pressable
                onPress={() => setShowEndPicker(true)}
                className="bg-slate-800/80 rounded-xl px-4 py-4 border border-slate-700/50 flex-row items-center justify-between"
              >
                <Text className="text-white text-base" style={{ fontFamily: 'DMSans_400Regular' }}>
                  {endDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
                <Calendar size={20} color="#64748B" />
              </Pressable>
            </View>

            {/* Cover Image URL */}
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                Cover Image URL (Optional)
              </Text>
              <TextInput
                value={coverImage}
                onChangeText={setCoverImage}
                placeholder="https://images.unsplash.com/..."
                placeholderTextColor="#64748B"
                keyboardType="url"
                autoCapitalize="none"
                className="bg-slate-800/80 rounded-xl px-4 py-4 text-white border border-slate-700/50"
                style={{ fontFamily: 'DMSans_400Regular', fontSize: 16 }}
              />
            </View>

            {/* Status */}
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                Status
              </Text>
              <View className="flex-row gap-2">
                {(['upcoming', 'active', 'completed'] as const).map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setStatus(s);
                    }}
                    className={`flex-1 py-3 rounded-xl border ${
                      status === s
                        ? 'bg-blue-500 border-blue-500'
                        : 'bg-slate-800/50 border-slate-700/50'
                    }`}
                  >
                    <Text
                      className={`text-center font-medium capitalize ${
                        status === s ? 'text-white' : 'text-slate-400'
                      }`}
                      style={{ fontFamily: 'DMSans_500Medium' }}
                    >
                      {s}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </Animated.View>

          <View className="h-8" />
        </ScrollView>
        </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Date Pickers */}
      {showStartPicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selectedDate) => {
            setShowStartPicker(Platform.OS === 'ios');
            if (selectedDate) {
              setStartDate(selectedDate);
            }
          }}
        />
      )}

      {showEndPicker && (
        <DateTimePicker
          value={endDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={startDate}
          onChange={(event, selectedDate) => {
            setShowEndPicker(Platform.OS === 'ios');
            if (selectedDate) {
              setEndDate(selectedDate);
            }
          }}
        />
      )}
    </View>
  );
}

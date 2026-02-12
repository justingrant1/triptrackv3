import React from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { X, Sparkles, Mail, CheckCircle } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { parseEmailToReservation } from '@/lib/openai';
import { useCreateTrip } from '@/lib/hooks/useTrips';
import { useCreateReservation } from '@/lib/hooks/useReservations';
import { useAuthStore } from '@/lib/state/auth-store';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { UpgradeModal } from '@/components/UpgradeModal';
import { parseDateOnly } from '@/lib/utils';

export default function ParseEmailScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [emailText, setEmailText] = React.useState('');
  const [isParsing, setIsParsing] = React.useState(false);
  const [parsedData, setParsedData] = React.useState<any>(null);
  const [showUpgradeModal, setShowUpgradeModal] = React.useState(false);
  
  const createTrip = useCreateTrip();
  const createReservation = useCreateReservation();
  const { canUseEmailParsing } = useSubscription();

  const handleParse = async () => {
    if (!emailText.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Empty Email', 'Please paste your travel confirmation email');
      return;
    }

    // Check if user can use email parsing (Pro feature)
    if (!canUseEmailParsing) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setShowUpgradeModal(true);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsParsing(true);

    try {
      const parsed = await parseEmailToReservation(emailText);
      setParsedData(parsed);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Parsing Failed', error.message || 'Could not extract trip details from email. Please try again or add manually.');
      console.error('Email parsing error:', error);
    } finally {
      setIsParsing(false);
    }
  };

  const handleSave = async () => {
    if (!parsedData || !user) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsParsing(true);

    try {
      // Create the trip
      const trip = await createTrip.mutateAsync({
        user_id: user.id,
        name: parsedData.trip_name,
        destination: parsedData.destination,
        start_date: parsedData.start_date,
        end_date: parsedData.end_date,
        cover_image: null,
        status: 'upcoming',
      });

      // Create all reservations
      for (const res of parsedData.reservations) {
        await createReservation.mutateAsync({
          trip_id: trip.id,
          type: res.type,
          title: res.title,
          subtitle: res.subtitle || null,
          start_time: res.start_time,
          end_time: res.end_time || null,
          location: res.location || null,
          address: res.address || null,
          confirmation_number: res.confirmation_number || null,
          details: res.details || {},
          status: 'confirmed',
          alert_message: null,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Trip Created! ✨',
        `${parsedData.trip_name} has been added with ${parsedData.reservations.length} reservation(s).`,
        [
          {
            text: 'View Trip',
            onPress: () => router.replace(`/trip/${trip.id}`),
          },
        ]
      );
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message || 'Failed to create trip');
      console.error('Save error:', error);
    } finally {
      setIsParsing(false);
    }
  };

  const handleReset = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setParsedData(null);
    setEmailText('');
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
            <View className="flex-row items-center">
              <Sparkles size={18} color="#8B5CF6" />
              <Text className="text-white font-bold ml-2" style={{ fontFamily: 'DMSans_700Bold' }}>
                Parse Email
              </Text>
            </View>
            <View className="w-10" />
          </View>

          <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
            {!parsedData ? (
              /* Input State */
              <>
                <Animated.View entering={FadeInDown.duration(500)} className="mb-6">
                  <LinearGradient
                    colors={['#8B5CF6', '#6D28D9']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ borderRadius: 20, padding: 20 }}
                  >
                    <View className="flex-row items-center">
                      <Mail size={24} color="#FFFFFF" />
                      <View className="ml-3 flex-1">
                        <Text className="text-white font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                          AI Email Parser
                        </Text>
                        <Text className="text-white/80 text-sm mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                          Paste your travel confirmation email below
                        </Text>
                      </View>
                    </View>
                  </LinearGradient>
                </Animated.View>

                <Animated.View entering={FadeInUp.duration(500).delay(100)}>
                  <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                    Email Content
                  </Text>
                  <TextInput
                    value={emailText}
                    onChangeText={setEmailText}
                    placeholder="Paste your flight, hotel, or car rental confirmation email here..."
                    placeholderTextColor="#64748B"
                    multiline
                    numberOfLines={12}
                    textAlignVertical="top"
                    className="bg-slate-800/80 rounded-xl px-4 py-4 text-white border border-slate-700/50 min-h-[300px]"
                    style={{ fontFamily: 'DMSans_400Regular', fontSize: 15, lineHeight: 22 }}
                    editable={!isParsing}
                  />

                  <View className="mt-4 bg-blue-500/10 rounded-xl p-4 border border-blue-500/20">
                    <Text className="text-slate-300 text-sm font-medium mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                      💡 Tips for best results:
                    </Text>
                    <Text className="text-slate-400 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                      • Include the entire email (headers, body, footer){'\n'}
                      • Works with flights, hotels, car rentals, trains{'\n'}
                      • AI will extract dates, times, confirmation numbers{'\n'}
                      • Multiple reservations in one email? No problem!
                    </Text>
                  </View>

                  <Pressable
                    onPress={handleParse}
                    disabled={!emailText.trim() || isParsing}
                    className={`mt-6 rounded-2xl py-4 items-center ${
                      emailText.trim() && !isParsing ? 'bg-purple-500' : 'bg-slate-700'
                    }`}
                  >
                    {isParsing ? (
                      <View className="flex-row items-center">
                        <ActivityIndicator size="small" color="#FFFFFF" />
                        <Text className="text-white font-semibold ml-2" style={{ fontFamily: 'DMSans_700Bold' }}>
                          Parsing with AI...
                        </Text>
                      </View>
                    ) : (
                      <View className="flex-row items-center">
                        <Sparkles size={18} color="#FFFFFF" />
                        <Text className="text-white font-semibold ml-2" style={{ fontFamily: 'DMSans_700Bold' }}>
                          Parse Email
                        </Text>
                      </View>
                    )}
                  </Pressable>
                </Animated.View>
              </>
            ) : (
              /* Results State */
              <>
                <Animated.View entering={FadeInDown.duration(500)} className="mb-6">
                  <View className="bg-emerald-500/10 rounded-2xl p-5 border border-emerald-500/30">
                    <View className="flex-row items-center mb-3">
                      <CheckCircle size={24} color="#10B981" />
                      <Text className="text-white font-bold ml-2" style={{ fontFamily: 'DMSans_700Bold' }}>
                        Email Parsed Successfully!
                      </Text>
                    </View>
                    <Text className="text-slate-300 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                      Review the details below and tap Save to add to your trips.
                    </Text>
                  </View>
                </Animated.View>

                <Animated.View entering={FadeInUp.duration(500).delay(100)}>
                  {/* Trip Info */}
                  <View className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50 mb-4">
                    <Text className="text-slate-400 text-xs uppercase tracking-wider mb-3" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                      Trip Details
                    </Text>
                    <Text className="text-white text-xl font-bold mb-2" style={{ fontFamily: 'DMSans_700Bold' }}>
                      {parsedData.trip_name}
                    </Text>
                    <Text className="text-slate-300 text-base mb-3" style={{ fontFamily: 'DMSans_500Medium' }}>
                      📍 {parsedData.destination}
                    </Text>
                    <View className="flex-row items-center">
                      <Text className="text-slate-400 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                        {parseDateOnly(parsedData.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {' → '}
                        {parseDateOnly(parsedData.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                    </View>
                  </View>

                  {/* Reservations */}
                  <Text className="text-slate-400 text-xs uppercase tracking-wider mb-3" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                    {parsedData.reservations.length} Reservation(s)
                  </Text>
                  {parsedData.reservations.map((res: any, index: number) => (
                    <View key={index} className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 mb-3">
                      <View className="flex-row items-center mb-2">
                        <Text className="text-white font-semibold flex-1" style={{ fontFamily: 'DMSans_700Bold' }}>
                          {res.title}
                        </Text>
                        <View className="bg-blue-500/20 px-2 py-1 rounded-full">
                          <Text className="text-blue-400 text-xs" style={{ fontFamily: 'DMSans_500Medium' }}>
                            {res.type}
                          </Text>
                        </View>
                      </View>
                      {res.subtitle && (
                        <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_400Regular' }}>
                          {res.subtitle}
                        </Text>
                      )}
                      <Text className="text-slate-500 text-sm" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                        {new Date(res.start_time).toLocaleString('en-US', { 
                          month: 'short', 
                          day: 'numeric', 
                          hour: 'numeric', 
                          minute: '2-digit' 
                        })}
                      </Text>
                      {res.confirmation_number && (
                        <Text className="text-slate-500 text-xs mt-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                          Confirmation: {res.confirmation_number}
                        </Text>
                      )}
                    </View>
                  ))}

                  {/* Actions */}
                  <View className="flex-row gap-3 mt-4">
                    <Pressable
                      onPress={handleReset}
                      disabled={isParsing}
                      className="flex-1 bg-slate-700 rounded-2xl py-4 items-center"
                    >
                      <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                        Try Another
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleSave}
                      disabled={isParsing}
                      className="flex-1 bg-emerald-500 rounded-2xl py-4 items-center"
                    >
                      {isParsing ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
                          Save Trip
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </Animated.View>
              </>
            )}

          <View className="h-8" />
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Upgrade Modal */}
      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason="email-parsing"
      />
    </View>
  );
}

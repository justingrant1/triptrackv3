import React from 'react';
import { View, Text, ScrollView, Pressable, Image, Dimensions, SectionList, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Plane,
  Building2,
  Car,
  Users,
  Ticket,
  Train,
  ChevronLeft,
  Clock,
  MapPin,
  Copy,
  AlertCircle,
  CheckCircle,
  Share2,
  Sparkles,
  Plus,
  Edit3,
  MoreVertical,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  interpolate,
  useAnimatedScrollHandler,
  Extrapolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useTrip, useDeleteTrip } from '@/lib/hooks/useTrips';
import { useReservations, useDeleteReservation } from '@/lib/hooks/useReservations';
import type { Reservation } from '@/lib/types/database';
import { formatTime, formatDate, formatDateLong, isToday, isTomorrow, getLiveStatus, LiveStatus } from '@/lib/utils';
import { getWeatherIcon } from '@/lib/weather';
import { useWeather } from '@/lib/hooks/useWeather';
import { shareTripNative } from '@/lib/sharing';

type ReservationType = Reservation['type'];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HEADER_HEIGHT = 280;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedSectionList = Animated.createAnimatedComponent(SectionList<Reservation>);

const ReservationIcon = ({ type, size = 20, color = '#FFFFFF' }: { type: ReservationType; size?: number; color?: string }) => {
  const icons: Record<ReservationType, React.ReactNode> = {
    flight: <Plane size={size} color={color} />,
    hotel: <Building2 size={size} color={color} />,
    car: <Car size={size} color={color} />,
    train: <Train size={size} color={color} />,
    meeting: <Users size={size} color={color} />,
    event: <Ticket size={size} color={color} />,
  };
  return icons[type] ?? <Plane size={size} color={color} />;
};

const getTypeColor = (type: ReservationType): string => {
  const colors: Record<ReservationType, string> = {
    flight: '#3B82F6',
    hotel: '#8B5CF6',
    car: '#10B981',
    train: '#F59E0B',
    meeting: '#EC4899',
    event: '#06B6D4',
  };
  return colors[type] ?? '#6B7280';
};

const getStatusColor = (status: Reservation['status']): string => {
  const colors: Record<Reservation['status'], string> = {
    confirmed: '#10B981',
    delayed: '#F59E0B',
    cancelled: '#EF4444',
    completed: '#64748B',
  };
  return colors[status];
};

// Live status chip component
function LiveStatusChip({ status }: { status: LiveStatus }) {
  const colorMap = {
    green: { bg: '#10B98120', text: '#10B981', dot: '#10B981' },
    amber: { bg: '#F59E0B20', text: '#F59E0B', dot: '#F59E0B' },
    blue: { bg: '#3B82F620', text: '#3B82F6', dot: '#3B82F6' },
    slate: { bg: '#64748B20', text: '#64748B', dot: '#64748B' },
    red: { bg: '#EF444420', text: '#EF4444', dot: '#EF4444' },
  };

  const colors = colorMap[status.color];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: colors.bg }}>
      {status.pulse && (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.dot, marginRight: 6 }} />
      )}
      <Text style={{ fontSize: 11, fontFamily: 'DMSans_500Medium', color: colors.text }}>
        {status.label}
      </Text>
    </View>
  );
}

function ReservationCard({ reservation, index, isFirst, isLast, tripId }: {
  reservation: Reservation;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  tripId: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState(false);
  const deleteReservation = useDeleteReservation();
  const typeColor = getTypeColor(reservation.type);
  const statusColor = getStatusColor(reservation.status);
  const liveStatus = getLiveStatus(reservation.type, new Date(reservation.start_time), reservation.end_time ? new Date(reservation.end_time) : undefined, reservation.status);

  const handleCopyConfirmation = async () => {
    if (reservation.confirmation_number) {
      await Clipboard.setStringAsync(reservation.confirmation_number);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded(!expanded);
  };

  const handleEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/edit-reservation?id=${reservation.id}`);
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    Alert.alert(
      'Delete Reservation',
      `Are you sure you want to delete "${reservation.title}"?`,
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
              await deleteReservation.mutateAsync({ id: reservation.id, tripId });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Error', error.message || 'Failed to delete reservation');
            }
          },
        },
      ]
    );
  };

  // Extract gate and seat for flights to show inline
  const gateInfo = reservation.type === 'flight' && reservation.address ? reservation.address.split(',')[0] : null;
  const seatInfo = reservation.type === 'flight' ? reservation.details?.['Seat']?.split(' ')[0] : null;

  return (
    <Animated.View
      entering={FadeInRight.duration(400).delay(index * 80)}
      className="flex-row"
    >
      {/* Timeline */}
      <View className="w-12 items-center">
        <View
          className={`w-0.5 flex-1 ${isFirst ? 'bg-transparent' : 'bg-slate-700'}`}
          style={{ marginBottom: -12 }}
        />
        <View
          style={{ backgroundColor: typeColor, width: 12, height: 12, borderRadius: 6 }}
        />
        <View
          className={`w-0.5 flex-1 ${isLast ? 'bg-transparent' : 'bg-slate-700'}`}
          style={{ marginTop: -12 }}
        />
      </View>

      {/* Card Content */}
      <AnimatedPressable
        onPress={handlePress}
        onLongPress={handleDelete}
        className="flex-1 mb-4"
      >
        <View className="bg-slate-800/60 rounded-2xl border border-slate-700/50 overflow-hidden">
          {/* Main Row */}
          <View className="p-4">
            <View className="flex-row items-start">
              <View
                style={{ backgroundColor: typeColor + '20', padding: 10, borderRadius: 12 }}
              >
                <ReservationIcon type={reservation.type} size={20} color={typeColor} />
              </View>
              <View className="flex-1 ml-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-white font-bold text-base flex-1" style={{ fontFamily: 'DMSans_700Bold' }}>
                    {reservation.title}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    {liveStatus ? (
                      <LiveStatusChip status={liveStatus} />
                    ) : (
                      <View
                        className="px-2 py-0.5 rounded-full flex-row items-center"
                        style={{ backgroundColor: statusColor + '20' }}
                      >
                        {reservation.status === 'confirmed' && <CheckCircle size={10} color={statusColor} />}
                        {reservation.status === 'delayed' && <AlertCircle size={10} color={statusColor} />}
                        <Text
                          className="text-xs ml-1 capitalize"
                          style={{ color: statusColor, fontFamily: 'DMSans_500Medium' }}
                        >
                          {reservation.status}
                        </Text>
                      </View>
                    )}
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        Alert.alert(
                          reservation.title,
                          'Choose an action',
                          [
                            {
                              text: 'Edit',
                              onPress: handleEdit,
                            },
                            {
                              text: 'Delete',
                              onPress: handleDelete,
                              style: 'destructive',
                            },
                            {
                              text: 'Cancel',
                              style: 'cancel',
                            },
                          ]
                        );
                      }}
                      className="p-1"
                    >
                      <MoreVertical size={16} color="#64748B" />
                    </Pressable>
                  </View>
                </View>
                {reservation.subtitle && (
                  <Text className="text-slate-400 text-sm mt-0.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                    {reservation.subtitle}
                    {reservation.type === 'flight' && (gateInfo || seatInfo) && (
                      <Text className="text-slate-500" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                        {gateInfo ? ` · ${gateInfo}` : ''}
                        {seatInfo ? ` · ${seatInfo}` : ''}
                      </Text>
                    )}
                  </Text>
                )}
                <View className="flex-row items-center mt-2">
                  <Clock size={12} color="#64748B" />
                  <Text className="text-slate-500 text-xs ml-1" style={{ fontFamily: 'SpaceMono_400Regular' }}>
                    {formatTime(new Date(reservation.start_time))}
                    {reservation.end_time && ` - ${formatTime(new Date(reservation.end_time))}`}
                  </Text>
                </View>
              </View>
            </View>

            {/* Alert */}
            {reservation.alert_message && (
              <View className="mt-3 bg-amber-500/10 rounded-xl p-3 flex-row items-center">
                <AlertCircle size={14} color="#F59E0B" />
                <Text className="text-amber-400 text-xs ml-2 flex-1" style={{ fontFamily: 'DMSans_500Medium' }}>
                  {reservation.alert_message}
                </Text>
              </View>
            )}
          </View>

          {/* Expanded Details */}
          {expanded && (
            <Animated.View
              entering={FadeInDown.duration(300)}
              className="border-t border-slate-700/50 px-4 py-3"
            >
              {reservation.address && (
                <View className="flex-row items-start mb-3">
                  <MapPin size={14} color="#64748B" />
                  <Text className="text-slate-400 text-sm ml-2 flex-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                    {reservation.address}
                  </Text>
                </View>
              )}

              {reservation.confirmation_number && (
                <Pressable
                  onPress={handleCopyConfirmation}
                  className="flex-row items-center justify-between bg-slate-700/30 rounded-xl p-3 mb-3"
                >
                  <View>
                    <Text className="text-slate-500 text-xs" style={{ fontFamily: 'DMSans_400Regular' }}>
                      Confirmation
                    </Text>
                    <Text className="text-white text-sm mt-0.5" style={{ fontFamily: 'SpaceMono_700Bold' }}>
                      {reservation.confirmation_number}
                    </Text>
                  </View>
                  <Copy size={16} color="#64748B" />
                </Pressable>
              )}

              {Object.entries(reservation.details).length > 0 && (
                <View className="space-y-2">
                  {Object.entries(reservation.details).map(([key, value]) => (
                    <View key={key} className="flex-row justify-between">
                      <Text className="text-slate-500 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                        {key}
                      </Text>
                      <Text className="text-slate-300 text-sm" style={{ fontFamily: 'DMSans_500Medium' }}>
                        {value}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </Animated.View>
          )}
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  
  const { data: trip, isLoading: tripLoading } = useTrip(id);
  const { data: reservations = [], isLoading: reservationsLoading } = useReservations(id);
  const { data: weather } = useWeather(trip?.destination);
  const deleteTrip = useDeleteTrip();
  
  const scrollY = useSharedValue(0);
  const isLoading = tripLoading || reservationsLoading;

  const handleDeleteTrip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    Alert.alert(
      'Delete Trip',
      `Are you sure you want to delete "${trip?.name}"? This will also delete all reservations and receipts.`,
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
              await deleteTrip.mutateAsync(id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch (error: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Error', error.message || 'Failed to delete trip');
            }
          },
        },
      ]
    );
  };

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 150], [1, 0], Extrapolate.CLAMP),
    transform: [
      { scale: interpolate(scrollY.value, [-100, 0], [1.2, 1], Extrapolate.CLAMP) },
    ],
  }));

  const titleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [100, 180], [0, 1], Extrapolate.CLAMP),
  }));

  if (isLoading) {
    return (
      <View className="flex-1 bg-slate-950 items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="text-slate-400 mt-4" style={{ fontFamily: 'DMSans_400Regular' }}>
          Loading trip...
        </Text>
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

  // Group reservations by date
  const reservationsByDate = reservations.reduce((acc: Record<string, Reservation[]>, res: Reservation) => {
    const dateKey = formatDateLong(new Date(res.start_time));
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(res);
    return acc;
  }, {});

  const sortedDates = Object.keys(reservationsByDate).sort(
    (a, b) => new Date(reservationsByDate[a][0].start_time).getTime() - new Date(reservationsByDate[b][0].start_time).getTime()
  );

  // Create sections for SectionList with sticky headers
  const sections = sortedDates.map((dateKey) => {
    const dateReservations = reservationsByDate[dateKey];
    const firstRes = dateReservations[0];
    const dateLabel = isToday(new Date(firstRes.start_time))
      ? 'Today'
      : isTomorrow(new Date(firstRes.start_time))
      ? 'Tomorrow'
      : dateKey;

    return {
      title: dateLabel,
      data: dateReservations,
    };
  });

  return (
    <View className="flex-1 bg-slate-950">
      {/* Header Image */}
      <Animated.View
        style={[headerAnimatedStyle, { position: 'absolute', top: 0, left: 0, right: 0, height: HEADER_HEIGHT }]}
      >
        <Image
          source={{ uri: trip.cover_image ?? 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800' }}
          style={{ width: SCREEN_WIDTH, height: HEADER_HEIGHT }}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(2,6,23,0.3)', 'rgba(2,6,23,0.9)', '#020617']}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
      </Animated.View>

      {/* Fixed Header Bar */}
      <SafeAreaView edges={['top']} className="absolute top-0 left-0 right-0 z-10">
        <View className="flex-row items-center justify-between px-4 py-2">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            className="bg-black/30 p-2.5 rounded-full"
          >
            <ChevronLeft size={22} color="#FFFFFF" />
          </Pressable>

          <Animated.Text
            style={[titleAnimatedStyle, { fontFamily: 'DMSans_700Bold' }]}
            className="text-white text-lg font-bold"
          >
            {trip.name}
          </Animated.Text>

          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/edit-trip?id=${trip.id}`);
              }}
              className="bg-black/30 p-2.5 rounded-full"
            >
              <Edit3 size={20} color="#FFFFFF" />
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/add-reservation?tripId=${trip.id}`);
              }}
              className="bg-black/30 p-2.5 rounded-full"
            >
              <Plus size={20} color="#FFFFFF" />
            </Pressable>
            <Pressable
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (trip) {
                  const success = await shareTripNative(trip);
                  if (success) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }
                }
              }}
              className="bg-black/30 p-2.5 rounded-full"
            >
              <Share2 size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {/* Scrollable Content */}
      <AnimatedSectionList
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: HEADER_HEIGHT - 40, paddingBottom: 100 }}
        stickySectionHeadersEnabled={true}
        sections={sections}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={() => (
          <View className="px-5 pb-6">
            <Pressable onLongPress={handleDeleteTrip}>
              <Text className="text-white text-3xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                {trip.name}
              </Text>
            </Pressable>
            <View className="flex-row items-center mt-2">
              <MapPin size={16} color="#94A3B8" />
              <Text className="text-slate-400 text-base ml-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                {trip.destination}
              </Text>
              {trip.status !== 'completed' && (
                <Text className="text-slate-500 text-base ml-1.5" style={{ fontFamily: 'DMSans_400Regular' }}>
                  · {weather?.temperature ?? '--'}° {weather && getWeatherIcon(weather.condition)}
                </Text>
              )}
            </View>
            <Text className="text-slate-500 text-sm mt-1" style={{ fontFamily: 'SpaceMono_400Regular' }}>
              {formatDateLong(new Date(trip.start_date))} - {formatDateLong(new Date(trip.end_date))}
            </Text>
          </View>
        )}
        renderSectionHeader={({ section }) => (
          <View className="px-5 pt-2 pb-4 bg-slate-950">
            <Text
              className="text-slate-300 text-sm font-semibold uppercase tracking-wider"
              style={{ fontFamily: 'SpaceMono_400Regular' }}
            >
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <View className="px-5">
            <ReservationCard
              reservation={item}
              index={index}
              isFirst={index === 0}
              isLast={index === section.data.length - 1}
              tripId={id}
            />
          </View>
        )}
      />

      {/* Floating Ask AI Button */}
      <Animated.View
        entering={FadeInDown.duration(500).delay(300)}
        style={{
          position: 'absolute',
          bottom: 30,
          right: 20,
        }}
      >
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push('/modal');
          }}
          style={{
            shadowColor: '#A855F7',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          <LinearGradient
            colors={['#A855F7', '#7C3AED']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Sparkles size={24} color="#FFFFFF" />
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </View>
  );
}

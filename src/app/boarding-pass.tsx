import React from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  X,
  ImagePlus,
  QrCode,
  Plane,
  RefreshCw,
  Trash2,
  Eye,
  AlertCircle,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useQueryClient } from '@tanstack/react-query';
import { useReservation } from '@/lib/hooks/useReservations';
import { queryKeys } from '@/lib/query-keys';
import {
  extractBoardingPassQR,
  generateQRCodeDataUrl,
  uploadBoardingPassImage,
  saveBoardingPassToReservation,
  getBoardingPassFromReservation,
  deleteBoardingPassFromReservation,
} from '@/lib/boarding-pass';
import type { BoardingPassData } from '@/lib/boarding-pass';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const QR_SIZE = SCREEN_WIDTH - 80;

type ScreenState = 'loading' | 'upload' | 'processing' | 'viewer' | 'error';

export default function BoardingPassScreen() {
  const { reservationId } = useLocalSearchParams<{ reservationId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: reservation, isLoading } = useReservation(reservationId);

  const [screenState, setScreenState] = React.useState<ScreenState>('loading');
  const [boardingPass, setBoardingPass] = React.useState<BoardingPassData | null>(null);
  const [qrImageUrl, setQrImageUrl] = React.useState<string | null>(null);
  const [localImageUri, setLocalImageUri] = React.useState<string | null>(null);
  const [showOriginal, setShowOriginal] = React.useState(false);
  const [processingStep, setProcessingStep] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState('');

  // Check for existing boarding pass when reservation loads
  React.useEffect(() => {
    if (isLoading) {
      setScreenState('loading');
      return;
    }
    if (!reservation) {
      setScreenState('error');
      setErrorMessage('Reservation not found');
      return;
    }

    const existing = getBoardingPassFromReservation(reservation.details);
    if (existing) {
      setBoardingPass(existing);
      // Generate QR if we have data
      if (existing.qrData && existing.qrType === 'qr') {
        generateQRCodeDataUrl(existing.qrData, QR_SIZE * 2).then(setQrImageUrl).catch(() => {});
      }
      setScreenState('viewer');
    } else {
      setScreenState('upload');
    }
  }, [reservation, isLoading]);

  // ─── Pick Image ────────────────────────────────────────────────────────────

  const handlePickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Photo library access is needed to select your boarding pass.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: false,
      quality: 0.9,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    await processImage(result.assets[0].uri);
  };

  // ─── Process Image ─────────────────────────────────────────────────────────

  const processImage = async (uri: string) => {
    if (!reservationId) return;

    setScreenState('processing');
    setProcessingStep('Reading image...');

    // Always keep the local URI so we can display the image even if upload fails
    setLocalImageUri(uri);

    try {
      // Step 1: Read image as base64
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      if (!base64) throw new Error('Failed to read image');

      const base64DataUri = `data:image/jpeg;base64,${base64}`;

      // Step 2: Upload to storage
      setProcessingStep('Uploading image...');
      let remoteImageUrl: string | null = null;
      try {
        remoteImageUrl = await uploadBoardingPassImage(reservationId, uri);
      } catch (uploadErr: any) {
        console.warn('[BoardingPass] Upload failed:', uploadErr.message);
        // Upload failed — we'll use the local URI for display
      }

      // Step 3: Extract boarding pass info via AI (passenger name, flight info, QR location)
      setProcessingStep('Analyzing boarding pass...');
      let extraction;
      try {
        extraction = await extractBoardingPassQR(base64DataUri);
      } catch (extractErr: any) {
        console.warn('[BoardingPass] AI extraction failed:', extractErr.message);
        extraction = {
          qrData: null,
          qrType: 'unknown' as const,
          boundingBox: null,
          passengerName: null,
          flightInfo: null,
          confidence: 'none' as const,
        };
      }

      // Step 4: Build boarding pass data
      const bpData: BoardingPassData = {
        originalImageUrl: remoteImageUrl,
        qrData: extraction.qrData,
        qrType: extraction.qrType,
        boundingBox: extraction.boundingBox,
        passengerName: extraction.passengerName,
        flightInfo: extraction.flightInfo,
        confidence: extraction.confidence,
      };

      // Step 5: Generate clean QR if we decoded the data (rare — GPT-4o usually can't decode QR binary)
      if (extraction.qrData && extraction.qrType === 'qr') {
        setProcessingStep('Generating clean QR code...');
        try {
          const qrUrl = await generateQRCodeDataUrl(extraction.qrData, QR_SIZE * 2);
          setQrImageUrl(qrUrl);
        } catch {
          // QR generation failed — will fall back to original image
        }
      }

      // Step 6: Save to reservation
      setProcessingStep('Saving...');
      try {
        await saveBoardingPassToReservation(reservationId, bpData);
        // Invalidate queries so other screens see the update
        if (reservation?.trip_id) {
          queryClient.invalidateQueries({ queryKey: queryKeys.reservations.byTrip(reservation.trip_id) });
        }
        queryClient.invalidateQueries({ queryKey: ['reservations', 'single', reservationId] });
        queryClient.invalidateQueries({ queryKey: queryKeys.reservations.upcoming });
      } catch (saveErr: any) {
        console.warn('[BoardingPass] Save failed:', saveErr.message);
      }

      setBoardingPass(bpData);
      setScreenState('viewer');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error('[BoardingPass] Processing error:', err);
      setErrorMessage(err.message || 'Failed to process boarding pass');
      setScreenState('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  // ─── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = () => {
    Alert.alert(
      'Remove Boarding Pass',
      'Are you sure you want to remove this boarding pass?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!reservationId) return;
            try {
              await deleteBoardingPassFromReservation(reservationId);
              if (reservation?.trip_id) {
                queryClient.invalidateQueries({ queryKey: queryKeys.reservations.byTrip(reservation.trip_id) });
              }
              queryClient.invalidateQueries({ queryKey: ['reservations', 'single', reservationId] });
              queryClient.invalidateQueries({ queryKey: queryKeys.reservations.upcoming });
              setBoardingPass(null);
              setQrImageUrl(null);
              setScreenState('upload');
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to remove boarding pass');
            }
          },
        },
      ]
    );
  };

  // ─── Replace ───────────────────────────────────────────────────────────────

  const handleReplace = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    handlePickImage();
  };

  // ─── Flight Info ───────────────────────────────────────────────────────────

  const flightTitle = reservation?.title || '';
  const flightSubtitle = reservation?.subtitle || '';
  const gate = reservation?.details?.['Gate'] || reservation?.details?._flight_status?.dep_gate || null;
  const seat = reservation?.details?.['Seat'] || null;
  const flightNumber = reservation?.details?.['Flight Number'] || reservation?.details?.['Flight'] || '';

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <StatusBar barStyle="light-content" hidden={screenState === 'viewer' && !showOriginal} />

      {/* ── Loading State ── */}
      {screenState === 'loading' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      )}

      {/* ── Upload State ── */}
      {screenState === 'upload' && (
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={{ flex: 1 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 }}>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
                style={{ backgroundColor: 'rgba(51,65,85,0.5)', padding: 10, borderRadius: 20 }}
              >
                <X size={20} color="#94A3B8" />
              </Pressable>
              <Text style={{ color: '#FFFFFF', fontSize: 18, fontFamily: 'DMSans_700Bold' }}>
                Boarding Pass
              </Text>
              <View style={{ width: 40 }} />
            </View>

            {/* Content */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
              <Animated.View entering={FadeInDown.duration(500)} style={{ alignItems: 'center' }}>
                {/* Flight context */}
                {flightTitle ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 32 }}>
                    <View style={{ backgroundColor: 'rgba(59,130,246,0.2)', padding: 10, borderRadius: 14 }}>
                      <Plane size={22} color="#3B82F6" />
                    </View>
                    <View style={{ marginLeft: 12 }}>
                      <Text style={{ color: '#FFFFFF', fontSize: 16, fontFamily: 'DMSans_700Bold' }}>
                        {flightTitle}
                      </Text>
                      {flightSubtitle ? (
                        <Text style={{ color: '#94A3B8', fontSize: 14, fontFamily: 'DMSans_400Regular', marginTop: 2 }}>
                          {flightSubtitle}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}

                {/* QR Icon */}
                <View style={{ backgroundColor: 'rgba(59,130,246,0.1)', padding: 28, borderRadius: 32, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)' }}>
                  <QrCode size={56} color="#3B82F6" />
                </View>

                <Text style={{ color: '#FFFFFF', fontSize: 22, fontFamily: 'DMSans_700Bold', textAlign: 'center', marginBottom: 8 }}>
                  Add Boarding Pass
                </Text>
                <Text style={{ color: '#64748B', fontSize: 15, fontFamily: 'DMSans_400Regular', textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
                  Upload a screenshot of your boarding pass.{'\n'}We'll extract the QR code so you can{'\n'}quickly show it at the gate.
                </Text>

                {/* Pick Image Button */}
                <Pressable
                  onPress={handlePickImage}
                  style={{ width: '100%' }}
                >
                  <LinearGradient
                    colors={['#3B82F6', '#2563EB']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ paddingVertical: 16, paddingHorizontal: 32, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <ImagePlus size={20} color="#FFFFFF" />
                    <Text style={{ color: '#FFFFFF', fontSize: 16, fontFamily: 'DMSans_700Bold', marginLeft: 10 }}>
                      Choose from Photos
                    </Text>
                  </LinearGradient>
                </Pressable>

                <Text style={{ color: '#475569', fontSize: 12, fontFamily: 'DMSans_400Regular', textAlign: 'center', marginTop: 16 }}>
                  Tip: If your boarding pass is a PDF,{'\n'}take a screenshot of it first
                </Text>
              </Animated.View>
            </View>
          </View>
        </SafeAreaView>
      )}

      {/* ── Processing State ── */}
      {screenState === 'processing' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Animated.View entering={FadeIn.duration(300)} style={{ alignItems: 'center' }}>
            <View style={{ backgroundColor: 'rgba(59,130,246,0.15)', padding: 24, borderRadius: 28, marginBottom: 24 }}>
              <ActivityIndicator size="large" color="#3B82F6" />
            </View>
            <Text style={{ color: '#FFFFFF', fontSize: 18, fontFamily: 'DMSans_700Bold', marginBottom: 8 }}>
              Processing Boarding Pass
            </Text>
            <Text style={{ color: '#64748B', fontSize: 14, fontFamily: 'DMSans_400Regular', textAlign: 'center' }}>
              {processingStep}
            </Text>
          </Animated.View>
        </View>
      )}

      {/* ── Viewer State ── */}
      {screenState === 'viewer' && boardingPass && (
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={{ flex: 1 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }}>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
                style={{ backgroundColor: 'rgba(51,65,85,0.5)', padding: 10, borderRadius: 20 }}
              >
                <X size={20} color="#94A3B8" />
              </Pressable>
              <Pressable
                onPress={handleReplace}
                style={{ backgroundColor: 'rgba(51,65,85,0.5)', padding: 10, borderRadius: 20 }}
              >
                <RefreshCw size={20} color="#94A3B8" />
              </Pressable>
            </View>

            {/* Flight Info */}
            <View style={{ alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Plane size={16} color="#3B82F6" />
                <Text style={{ color: '#FFFFFF', fontSize: 18, fontFamily: 'DMSans_700Bold', marginLeft: 8 }}>
                  {flightTitle}
                </Text>
              </View>
              {(gate || seat) ? (
                <Text style={{ color: '#94A3B8', fontSize: 14, fontFamily: 'SpaceMono_400Regular' }}>
                  {gate ? `Gate ${gate}` : ''}{gate && seat ? ' · ' : ''}{seat ? `Seat ${seat}` : ''}
                </Text>
              ) : null}
              {flightSubtitle ? (
                <Text style={{ color: '#64748B', fontSize: 13, fontFamily: 'DMSans_400Regular', marginTop: 2 }}>
                  {flightSubtitle}
                </Text>
              ) : null}
            </View>

            {/* QR Code Display */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
              <Animated.View entering={FadeInDown.duration(400)}>
                {/* Show regenerated QR code, or fall back to original boarding pass image */}
                {(() => {
                  // Best case: we decoded the QR data and regenerated a clean QR
                  const displayImageUrl = boardingPass.originalImageUrl || localImageUri;

                  if (!showOriginal && qrImageUrl) {
                    return (
                      <View style={{ backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, alignItems: 'center', shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 24, elevation: 16 }}>
                        <Image
                          source={{ uri: qrImageUrl }}
                          style={{ width: QR_SIZE, height: QR_SIZE }}
                          resizeMode="contain"
                        />
                        {(boardingPass.passengerName || flightNumber) ? (
                          <View style={{ marginTop: 16, alignItems: 'center' }}>
                            {boardingPass.passengerName ? (
                              <Text style={{ color: '#1E293B', fontSize: 16, fontFamily: 'DMSans_700Bold', letterSpacing: 1 }}>
                                {boardingPass.passengerName}
                              </Text>
                            ) : null}
                            {flightNumber ? (
                              <Text style={{ color: '#64748B', fontSize: 13, fontFamily: 'SpaceMono_400Regular', marginTop: 4 }}>
                                {flightNumber}
                              </Text>
                            ) : null}
                          </View>
                        ) : null}
                        {boardingPass.confidence === 'low' ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, backgroundColor: '#FEF3C7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                            <AlertCircle size={14} color="#D97706" />
                            <Text style={{ color: '#92400E', fontSize: 11, fontFamily: 'DMSans_500Medium', marginLeft: 6 }}>
                              QR may not be accurate — verify with original
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  }

                  // Common case: show the original boarding pass screenshot
                  if (displayImageUrl) {
                    return (
                      <View style={{ alignItems: 'center' }}>
                        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 12, shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 12 }}>
                          <Image
                            source={{ uri: displayImageUrl }}
                            style={{ width: SCREEN_WIDTH - 64, height: SCREEN_WIDTH * 1.2 }}
                            resizeMode="contain"
                          />
                        </View>
                        {/* Show extracted info below the image */}
                        {(boardingPass.passengerName || boardingPass.flightInfo) ? (
                          <View style={{ marginTop: 16, alignItems: 'center' }}>
                            {boardingPass.passengerName ? (
                              <Text style={{ color: '#FFFFFF', fontSize: 15, fontFamily: 'DMSans_700Bold', letterSpacing: 0.5 }}>
                                {boardingPass.passengerName}
                              </Text>
                            ) : null}
                            {boardingPass.flightInfo ? (
                              <Text style={{ color: '#94A3B8', fontSize: 13, fontFamily: 'SpaceMono_400Regular', marginTop: 4 }}>
                                {boardingPass.flightInfo}
                              </Text>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    );
                  }

                  // Fallback: no image available
                  return (
                    <View style={{ backgroundColor: 'rgba(51,65,85,0.3)', borderRadius: 16, padding: 40, alignItems: 'center' }}>
                      <AlertCircle size={32} color="#64748B" />
                      <Text style={{ color: '#94A3B8', fontSize: 14, fontFamily: 'DMSans_500Medium', marginTop: 12, textAlign: 'center' }}>
                        Boarding pass image not available.{'\n'}Tap replace to upload again.
                      </Text>
                    </View>
                  );
                })()}
              </Animated.View>
            </View>

            {/* Bottom Actions */}
            <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
              {/* Toggle original/QR */}
              {qrImageUrl && boardingPass.originalImageUrl ? (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowOriginal(!showOriginal);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginBottom: 8 }}
                >
                  <Eye size={16} color="#64748B" />
                  <Text style={{ color: '#64748B', fontSize: 14, fontFamily: 'DMSans_500Medium', marginLeft: 8 }}>
                    {showOriginal ? 'Show Clean QR' : 'Show Original Image'}
                  </Text>
                </Pressable>
              ) : null}

              {/* Delete */}
              <Pressable
                onPress={handleDelete}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}
              >
                <Trash2 size={16} color="#EF4444" />
                <Text style={{ color: '#EF4444', fontSize: 14, fontFamily: 'DMSans_500Medium', marginLeft: 8 }}>
                  Remove Boarding Pass
                </Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      )}

      {/* ── Error State ── */}
      {screenState === 'error' && (
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 }}>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
                style={{ backgroundColor: 'rgba(51,65,85,0.5)', padding: 10, borderRadius: 20 }}
              >
                <X size={20} color="#94A3B8" />
              </Pressable>
              <Text style={{ color: '#FFFFFF', fontSize: 18, fontFamily: 'DMSans_700Bold' }}>
                Boarding Pass
              </Text>
              <View style={{ width: 40 }} />
            </View>

            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
              <View style={{ backgroundColor: 'rgba(239,68,68,0.15)', padding: 20, borderRadius: 24, marginBottom: 20 }}>
                <AlertCircle size={40} color="#EF4444" />
              </View>
              <Text style={{ color: '#FFFFFF', fontSize: 18, fontFamily: 'DMSans_700Bold', marginBottom: 8, textAlign: 'center' }}>
                Something went wrong
              </Text>
              <Text style={{ color: '#64748B', fontSize: 14, fontFamily: 'DMSans_400Regular', textAlign: 'center', marginBottom: 24 }}>
                {errorMessage || 'Failed to process boarding pass'}
              </Text>
              <Pressable
                onPress={() => { setScreenState('upload'); setErrorMessage(''); }}
                style={{ backgroundColor: 'rgba(59,130,246,0.2)', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 }}
              >
                <Text style={{ color: '#3B82F6', fontSize: 15, fontFamily: 'DMSans_700Bold' }}>
                  Try Again
                </Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}

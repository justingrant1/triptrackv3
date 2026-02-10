/**
 * Reusable confirmation modal — replaces Alert.alert() throughout the app.
 * Matches the dark theme with blur background and smooth animations.
 */

import React from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { haptics } from '@/lib/haptics';

export interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Optional loading state for async confirm actions */
  loading?: boolean;
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmModalProps) {
  const handleConfirm = () => {
    if (loading) return;
    if (destructive) {
      haptics.warning();
    } else {
      haptics.press();
    }
    onConfirm();
  };

  const handleCancel = () => {
    haptics.tap();
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
      >
        {/* Backdrop */}
        <Pressable
          onPress={handleCancel}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }}
        />

        {/* Modal Card */}
        <Animated.View
          entering={SlideInDown.duration(300).springify().damping(18)}
          exiting={SlideOutDown.duration(200)}
          style={{
            width: '85%',
            maxWidth: 360,
            backgroundColor: '#1E293B',
            borderRadius: 24,
            borderWidth: 1,
            borderColor: 'rgba(51,65,85,0.5)',
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 20 },
            shadowOpacity: 0.5,
            shadowRadius: 30,
            elevation: 20,
          }}
        >
          {/* Content */}
          <View style={{ padding: 24 }}>
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 20,
                fontFamily: 'DMSans_700Bold',
                textAlign: 'center',
                marginBottom: 8,
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                color: '#94A3B8',
                fontSize: 15,
                fontFamily: 'DMSans_400Regular',
                textAlign: 'center',
                lineHeight: 22,
              }}
            >
              {message}
            </Text>
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: 'rgba(51,65,85,0.5)' }} />

          {/* Buttons */}
          <View style={{ flexDirection: 'row' }}>
            {/* Cancel */}
            <Pressable
              onPress={handleCancel}
              style={{
                flex: 1,
                paddingVertical: 16,
                alignItems: 'center',
                justifyContent: 'center',
                borderRightWidth: 1,
                borderRightColor: 'rgba(51,65,85,0.5)',
              }}
            >
              <Text
                style={{
                  color: '#94A3B8',
                  fontSize: 16,
                  fontFamily: 'DMSans_500Medium',
                }}
              >
                {cancelText}
              </Text>
            </Pressable>

            {/* Confirm */}
            <Pressable
              onPress={handleConfirm}
              disabled={loading}
              style={{
                flex: 1,
                paddingVertical: 16,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: loading ? 0.5 : 1,
              }}
            >
              <Text
                style={{
                  color: destructive ? '#EF4444' : '#3B82F6',
                  fontSize: 16,
                  fontFamily: 'DMSans_700Bold',
                }}
              >
                {loading ? 'Loading...' : confirmText}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

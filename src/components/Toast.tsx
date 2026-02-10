/**
 * Slide-in toast notification — replaces Alert.alert() for success/error feedback.
 * Auto-dismisses after a configurable duration.
 * 
 * Usage:
 *   const [toast, setToast] = useState<ToastConfig | null>(null);
 *   <Toast config={toast} onDismiss={() => setToast(null)} />
 *   setToast({ type: 'success', message: 'Trip saved!' });
 */

import React, { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { SlideInUp, SlideOutUp, FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react-native';

export interface ToastConfig {
  type: 'success' | 'error' | 'info';
  message: string;
  /** Optional action button (e.g. "Undo") */
  action?: {
    label: string;
    onPress: () => void;
  };
  /** Auto-dismiss duration in ms. Default: 3000. Set to 0 to disable. */
  duration?: number;
}

interface ToastProps {
  config: ToastConfig | null;
  onDismiss: () => void;
}

const TOAST_STYLES = {
  success: {
    bg: 'rgba(16,185,129,0.15)',
    border: 'rgba(16,185,129,0.3)',
    color: '#10B981',
    icon: CheckCircle,
  },
  error: {
    bg: 'rgba(239,68,68,0.15)',
    border: 'rgba(239,68,68,0.3)',
    color: '#EF4444',
    icon: AlertCircle,
  },
  info: {
    bg: 'rgba(59,130,246,0.15)',
    border: 'rgba(59,130,246,0.3)',
    color: '#3B82F6',
    icon: Info,
  },
} as const;

export function Toast({ config, onDismiss }: ToastProps) {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!config) return;
    const duration = config.duration ?? 3000;
    if (duration === 0) return;

    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [config, onDismiss]);

  if (!config) return null;

  const style = TOAST_STYLES[config.type];
  const Icon = style.icon;

  return (
    <Animated.View
      entering={SlideInUp.duration(300).springify().damping(18)}
      exiting={SlideOutUp.duration(200)}
      style={{
        position: 'absolute',
        top: insets.top + 8,
        left: 16,
        right: 16,
        zIndex: 9999,
      }}
    >
      <View
        style={{
          backgroundColor: style.bg,
          borderWidth: 1,
          borderColor: style.border,
          borderRadius: 16,
          paddingHorizontal: 16,
          paddingVertical: 14,
          flexDirection: 'row',
          alignItems: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 10,
        }}
      >
        <Icon size={20} color={style.color} />
        <Text
          style={{
            flex: 1,
            color: '#E2E8F0',
            fontSize: 14,
            fontFamily: 'DMSans_500Medium',
            marginLeft: 10,
          }}
          numberOfLines={2}
        >
          {config.message}
        </Text>

        {config.action && (
          <Pressable
            onPress={() => {
              config.action?.onPress();
              onDismiss();
            }}
            style={{
              backgroundColor: `${style.color}25`,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 8,
              marginLeft: 8,
            }}
          >
            <Text
              style={{
                color: style.color,
                fontSize: 13,
                fontFamily: 'DMSans_700Bold',
              }}
            >
              {config.action.label}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          style={{ marginLeft: 8, padding: 2 }}
        >
          <X size={16} color="#64748B" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Mail } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleResetPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    try {
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'triptrack://reset-password',
      });

      if (error) throw error;

      setEmailSent(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error('Reset password error:', error);
      Alert.alert('Error', error.message || 'Failed to send reset email');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-slate-950">
      <LinearGradient
        colors={['#0F172A', '#1E293B', '#334155']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="absolute inset-0"
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        {/* Header */}
        <View className="pt-16 px-6">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            className="w-10 h-10 items-center justify-center rounded-full bg-slate-800/50 mb-8"
          >
            <ArrowLeft size={20} color="#FFFFFF" />
          </Pressable>

          <Text
            className="text-white text-4xl font-bold mb-3"
            style={{ fontFamily: 'DMSans_700Bold' }}
          >
            Reset Password
          </Text>
          <Text
            className="text-slate-400 text-base"
            style={{ fontFamily: 'DMSans_400Regular' }}
          >
            {emailSent
              ? 'Check your email for a password reset link'
              : 'Enter your email address and we will send you a link to reset your password'}
          </Text>
        </View>

        {/* Form */}
        {!emailSent ? (
          <View className="flex-1 px-6 pt-12">
            <BlurView intensity={20} tint="dark" className="rounded-2xl overflow-hidden mb-6">
              <View className="bg-slate-800/50 p-4 flex-row items-center">
                <Mail size={20} color="#64748B" />
                <TextInput
                  className="flex-1 ml-3 text-white text-base"
                  style={{ fontFamily: 'DMSans_400Regular' }}
                  placeholder="Email address"
                  placeholderTextColor="#64748B"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
              </View>
            </BlurView>

            <Pressable
              onPress={handleResetPassword}
              disabled={loading}
              className="rounded-2xl overflow-hidden"
            >
              <LinearGradient
                colors={loading ? ['#475569', '#475569'] : ['#3B82F6', '#2563EB']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                className="py-4 items-center"
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text
                    className="text-white text-base font-bold"
                    style={{ fontFamily: 'DMSans_700Bold' }}
                  >
                    Send Reset Link
                  </Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        ) : (
          <View className="flex-1 px-6 pt-12 items-center">
            <View className="w-20 h-20 rounded-full bg-green-500/20 items-center justify-center mb-6">
              <Mail size={32} color="#10B981" />
            </View>
            <Text
              className="text-white text-xl font-bold mb-3 text-center"
              style={{ fontFamily: 'DMSans_700Bold' }}
            >
              Email Sent!
            </Text>
            <Text
              className="text-slate-400 text-base text-center mb-8"
              style={{ fontFamily: 'DMSans_400Regular' }}
            >
              We've sent a password reset link to{'\n'}
              <Text className="text-white font-medium">{email}</Text>
            </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              className="rounded-2xl overflow-hidden"
            >
              <LinearGradient
                colors={['#3B82F6', '#2563EB']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                className="py-4 px-8 items-center"
              >
                <Text
                  className="text-white text-base font-bold"
                  style={{ fontFamily: 'DMSans_700Bold' }}
                >
                  Back to Login
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

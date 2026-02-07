import { useState, useCallback, useEffect } from 'react';
import { View, Text, Pressable, TextInput, KeyboardAvoidingView, Platform, useWindowDimensions, Alert, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { Mail, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/lib/state/auth-store';

// Apple Logo component
function AppleLogo() {
  return (
    <Svg width={20} height={24} viewBox="0 0 384 512" fill="#000">
      <Path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </Svg>
  );
}

export default function LoginScreen() {
  const { width, height } = useWindowDimensions();
  const [isLogin, setIsLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  // Auth store
  const { login, register, isLoading, error, clearError } = useAuthStore();

  // Animation values
  const buttonScale = useSharedValue(1);
  const appleButtonScale = useSharedValue(1);
  const toggleWidth = (width - 64 - 8) / 2;
  const toggleLeft = useSharedValue(toggleWidth + 4); // Start on Sign Up tab

  // Clear error when switching between login/signup
  useEffect(() => {
    clearError();
  }, [isLogin, clearError]);

  const handleEmailFocus = useCallback((focused: boolean) => {
    setIsEmailFocused(focused);
    if (focused) Haptics.selectionAsync();
  }, []);

  const handlePasswordFocus = useCallback((focused: boolean) => {
    setIsPasswordFocused(focused);
    if (focused) Haptics.selectionAsync();
  }, []);

  const handleToggle = useCallback((toLogin: boolean) => {
    if (toLogin === isLogin) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsLogin(toLogin);
    const toggleWidth = (width - 64 - 8) / 2;
    toggleLeft.value = withSpring(toLogin ? 4 : toggleWidth + 4, { damping: 15, stiffness: 150 });
  }, [isLogin, toggleLeft, width]);

  const handleContinue = useCallback(async () => {
    // Validate inputs
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    // Validate password length
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    buttonScale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withSpring(1, { damping: 10 })
    );

    try {
      let result;
      if (isLogin) {
        result = await login(email.trim(), password);
      } else {
        result = await register(email.trim(), password);
      }

      if (result.success) {
        // Check if it's a signup that requires email confirmation
        if (result.error) {
          Alert.alert('Success', result.error);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          // For new signups, go to onboarding; for login, go to main app
          if (isLogin) {
            router.replace('/(tabs)');
          } else {
            router.replace('/onboarding');
          }
        }
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Error', result.error || 'Authentication failed');
      }
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message || 'An unexpected error occurred');
    }
  }, [email, password, isLogin, login, register, buttonScale]);

  const handleAppleSignIn = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    appleButtonScale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withSpring(1, { damping: 10 })
    );
    // Navigate to main app
    router.replace('/(tabs)');
  }, [appleButtonScale]);

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const appleButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: appleButtonScale.value }],
  }));

  const toggleIndicatorStyle = useAnimatedStyle(() => ({
    left: toggleLeft.value,
  }));

  return (
    <View className="flex-1 bg-black">
      {/* Background gradient layers */}
      <LinearGradient
        colors={['#0a0a0a', '#1a1a2e', '#0f0f1a']}
        locations={[0, 0.5, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Decorative orbs */}
      <View
        style={{
          position: 'absolute',
          top: height * 0.08,
          left: -width * 0.3,
          width: width * 0.8,
          height: width * 0.8,
          borderRadius: width * 0.4,
          backgroundColor: '#3b82f6',
          opacity: 0.15,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: height * 0.2,
          right: -width * 0.4,
          width: width * 0.9,
          height: width * 0.9,
          borderRadius: width * 0.45,
          backgroundColor: '#8b5cf6',
          opacity: 0.12,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: height * 0.1,
          left: -width * 0.2,
          width: width * 0.6,
          height: width * 0.6,
          borderRadius: width * 0.3,
          backgroundColor: '#06b6d4',
          opacity: 0.1,
        }}
      />

      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <View className="flex-1 px-6 pt-8 justify-between">
            {/* Header Section */}
            <Animated.View
              entering={FadeInDown.duration(800).delay(100)}
              className="items-center mt-8"
            >
              {/* Logo / Brand */}
              <View className="w-20 h-20 rounded-3xl bg-white/10 items-center justify-center mb-6 overflow-hidden">
                <BlurView intensity={40} tint="dark" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
                <Image 
                  source={require('@/assets/icon.png')} 
                  style={{ width: 64, height: 64 }}
                  resizeMode="contain"
                />
              </View>

              <Text className="text-white text-3xl font-bold tracking-tight mb-2">
                {isLogin ? 'Welcome back' : 'Create account'}
              </Text>
              <Text className="text-white/50 text-base text-center max-w-[280px]">
                {isLogin
                  ? 'Sign in to continue your journey'
                  : 'Start managing your trips effortlessly'
                }
              </Text>
            </Animated.View>

            {/* Form Section */}
            <Animated.View
              entering={FadeInUp.duration(800).delay(300)}
              className="mt-8"
            >
              {/* Toggle */}
              <View className="bg-white/5 rounded-2xl p-1 flex-row mb-8 mx-4">
                <Animated.View
                  style={[
                    {
                      position: 'absolute',
                      top: 4,
                      width: toggleWidth,
                      height: 44,
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      borderRadius: 14,
                    },
                    toggleIndicatorStyle,
                  ]}
                />
                <Pressable
                  onPress={() => handleToggle(true)}
                  className="flex-1 py-3 items-center rounded-xl"
                >
                  <Text className={cn(
                    "text-base font-semibold",
                    isLogin ? "text-white" : "text-white/40"
                  )}>
                    Sign In
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleToggle(false)}
                  className="flex-1 py-3 items-center rounded-xl"
                >
                  <Text className={cn(
                    "text-base font-semibold",
                    !isLogin ? "text-white" : "text-white/40"
                  )}>
                    Sign Up
                  </Text>
                </Pressable>
              </View>

              {/* Email Input */}
              <View className="mb-4">
                <View className={cn(
                  "flex-row items-center rounded-2xl overflow-hidden",
                  isEmailFocused ? "border border-blue-500/50" : "border border-white/10"
                )}>
                  <BlurView
                    intensity={30}
                    tint="dark"
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                  />
                  <View className="pl-4 pr-2">
                    <Mail size={20} color={isEmailFocused ? '#3b82f6' : 'rgba(255,255,255,0.4)'} />
                  </View>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Email address"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => handleEmailFocus(true)}
                    onBlur={() => handleEmailFocus(false)}
                    className="flex-1 py-4 pr-4 text-white text-base"
                  />
                </View>
              </View>

              {/* Password Input */}
              <View className="mb-6">
                <View className={cn(
                  "flex-row items-center rounded-2xl overflow-hidden",
                  isPasswordFocused ? "border border-blue-500/50" : "border border-white/10"
                )}>
                  <BlurView
                    intensity={30}
                    tint="dark"
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                  />
                  <View className="pl-4 pr-2">
                    <Lock size={20} color={isPasswordFocused ? '#3b82f6' : 'rgba(255,255,255,0.4)'} />
                  </View>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => handlePasswordFocus(true)}
                    onBlur={() => handlePasswordFocus(false)}
                    className="flex-1 py-4 text-white text-base"
                  />
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setShowPassword(!showPassword);
                    }}
                    className="pr-4 pl-2"
                  >
                    {showPassword ? (
                      <EyeOff size={20} color="rgba(255,255,255,0.4)" />
                    ) : (
                      <Eye size={20} color="rgba(255,255,255,0.4)" />
                    )}
                  </Pressable>
                </View>
              </View>

              {/* Forgot Password */}
              {isLogin && (
                <Pressable 
                  className="self-end mb-6 -mt-2"
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push('/forgot-password');
                  }}
                >
                  <Text className="text-blue-400 text-sm font-medium">
                    Forgot password?
                  </Text>
                </Pressable>
              )}

              {/* Continue Button */}
              <Animated.View style={buttonAnimatedStyle}>
                <Pressable onPress={handleContinue} disabled={isLoading}>
                  <LinearGradient
                    colors={isLoading ? ['#6b7280', '#4b5563', '#374151'] : ['#3b82f6', '#2563eb', '#1d4ed8']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      borderRadius: 16,
                      padding: 18,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <>
                        <Text className="text-white text-base font-semibold mr-2">
                          {isLogin ? 'Sign In' : 'Create Account'}
                        </Text>
                        <ArrowRight size={20} color="white" />
                      </>
                    )}
                  </LinearGradient>
                </Pressable>
              </Animated.View>

              {/* Divider */}
              <View className="flex-row items-center my-6">
                <View className="flex-1 h-px bg-white/10" />
                <Text className="text-white/30 text-sm mx-4">or continue with</Text>
                <View className="flex-1 h-px bg-white/10" />
              </View>

              {/* Apple Sign In */}
              <Animated.View style={appleButtonAnimatedStyle}>
                <Pressable onPress={handleAppleSignIn}>
                  <View className="bg-white rounded-2xl p-4 flex-row items-center justify-center">
                    <View className="mr-3">
                      <AppleLogo />
                    </View>
                    <Text className="text-black text-base font-semibold">
                      Continue with Apple
                    </Text>
                  </View>
                </Pressable>
              </Animated.View>
            </Animated.View>

            {/* Footer */}
            <Animated.View
              entering={FadeInUp.duration(800).delay(500)}
              className="items-center pb-6 mt-8"
            >
              <Text className="text-white/30 text-xs text-center leading-5 max-w-[280px]">
                By continuing, you agree to our{' '}
                <Text className="text-white/50">Terms of Service</Text>
                {' '}and{' '}
                <Text className="text-white/50">Privacy Policy</Text>
              </Text>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

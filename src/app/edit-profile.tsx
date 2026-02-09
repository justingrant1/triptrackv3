import React from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronLeft, Camera } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useProfile, useUpdateProfile, uploadAvatar } from '@/lib/hooks/useProfile';
import { useAuthStore } from '@/lib/state/auth-store';

export default function EditProfileScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();

  const [name, setName] = React.useState('');
  const [uploading, setUploading] = React.useState(false);

  // Initialize form with profile data
  React.useEffect(() => {
    if (profile) {
      setName(profile.name || '');
    }
  }, [profile]);

  const handleSave = async () => {
    try {
      await updateProfile.mutateAsync({ name });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message || 'Failed to update profile');
    }
  };

  const handlePickImage = async () => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant photo library access to change your avatar');
        return;
      }

      // Pick image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0] && user?.id) {
        setUploading(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        // Upload to Supabase Storage
        const avatarUrl = await uploadAvatar(user.id, result.assets[0].uri);

        // Update profile with new avatar URL
        await updateProfile.mutateAsync({ avatar_url: avatarUrl });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message || 'Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-slate-950 items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
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
            Edit Profile
          </Text>
          <Pressable
            onPress={handleSave}
            className="bg-blue-500 px-4 py-2 rounded-full"
          >
            <Text className="text-white font-semibold" style={{ fontFamily: 'DMSans_700Bold' }}>
              Save
            </Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Avatar */}
          <Animated.View entering={FadeInDown.duration(500)} className="items-center py-8">
            <Pressable
              onPress={handlePickImage}
              disabled={uploading}
              className="relative"
            >
              {profile?.avatar_url ? (
                <View className="w-24 h-24 rounded-full overflow-hidden bg-slate-800">
                  <Animated.Image
                    source={{ uri: profile.avatar_url }}
                    style={{ width: 96, height: 96 }}
                    resizeMode="cover"
                  />
                </View>
              ) : (
                <View className="w-24 h-24 rounded-full bg-blue-500 items-center justify-center">
                  <Text className="text-white text-4xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                    {name.charAt(0) || user?.email?.charAt(0).toUpperCase() || 'A'}
                  </Text>
                </View>
              )}
              <View className="absolute bottom-0 right-0 bg-slate-700 p-2 rounded-full border-2 border-slate-950">
                {uploading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Camera size={16} color="#FFFFFF" />
                )}
              </View>
            </Pressable>
            <Text className="text-slate-400 text-sm mt-3" style={{ fontFamily: 'DMSans_400Regular' }}>
              {uploading ? 'Uploading...' : 'Tap to change photo'}
            </Text>
          </Animated.View>

          {/* Form Fields */}
          <Animated.View entering={FadeInDown.duration(500).delay(100)} className="gap-4">
            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                Full Name
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Enter your name"
                placeholderTextColor="#64748B"
                className="bg-slate-800/80 rounded-xl px-4 py-4 text-white border border-slate-700/50"
                style={{ fontFamily: 'DMSans_400Regular', fontSize: 16 }}
              />
            </View>

            <View>
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                Email
              </Text>
              <View className="bg-slate-800/40 rounded-xl px-4 py-4 border border-slate-700/30">
                <Text className="text-slate-500 text-base" style={{ fontFamily: 'DMSans_400Regular' }}>
                  {profile?.email || user?.email || 'No email'}
                </Text>
              </View>
              <Text className="text-slate-500 text-xs mt-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                Email cannot be changed
              </Text>
            </View>
          </Animated.View>

          <View className="h-8" />
        </ScrollView>
        </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

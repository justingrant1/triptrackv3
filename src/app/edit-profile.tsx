import React from 'react';
import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronLeft, Camera } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTripStore } from '@/lib/store';

export default function EditProfileScreen() {
  const router = useRouter();
  const user = useTripStore((s) => s.user);

  const [name, setName] = React.useState(user?.name ?? '');
  const [email, setEmail] = React.useState(user?.email ?? '');

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
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

        <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
          {/* Avatar */}
          <Animated.View entering={FadeInDown.duration(500)} className="items-center py-8">
            <Pressable
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
              className="relative"
            >
              <View className="w-24 h-24 rounded-full bg-blue-500 items-center justify-center">
                <Text className="text-white text-4xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
                  {name.charAt(0) || 'A'}
                </Text>
              </View>
              <View className="absolute bottom-0 right-0 bg-slate-700 p-2 rounded-full border-2 border-slate-950">
                <Camera size={16} color="#FFFFFF" />
              </View>
            </Pressable>
            <Text className="text-slate-400 text-sm mt-3" style={{ fontFamily: 'DMSans_400Regular' }}>
              Tap to change photo
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
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                placeholderTextColor="#64748B"
                keyboardType="email-address"
                autoCapitalize="none"
                className="bg-slate-800/80 rounded-xl px-4 py-4 text-white border border-slate-700/50"
                style={{ fontFamily: 'DMSans_400Regular', fontSize: 16 }}
              />
            </View>
          </Animated.View>

          <View className="h-8" />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

import React from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  Mail,
  Plus,
  Trash2,
  Check,
  AlertCircle,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

interface TrustedEmail {
  id: string;
  email: string;
  verified: boolean;
  addedAt: Date;
}

export default function TrustedEmailsScreen() {
  const router = useRouter();
  const [emails, setEmails] = React.useState<TrustedEmail[]>([
    { id: '1', email: 'alex@startup.io', verified: true, addedAt: new Date() },
    { id: '2', email: 'alex.chen@gmail.com', verified: true, addedAt: new Date() },
  ]);
  const [newEmail, setNewEmail] = React.useState('');
  const [showAddForm, setShowAddForm] = React.useState(false);

  const handleAddEmail = () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const newTrustedEmail: TrustedEmail = {
      id: Date.now().toString(),
      email: newEmail.trim().toLowerCase(),
      verified: false,
      addedAt: new Date(),
    };

    setEmails([...emails, newTrustedEmail]);
    setNewEmail('');
    setShowAddForm(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleRemoveEmail = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEmails(emails.filter(e => e.id !== id));
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
          <View className="flex-row items-center">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              className="bg-slate-800/80 p-2.5 rounded-full border border-slate-700/50 mr-4"
            >
              <ChevronLeft size={22} color="#FFFFFF" />
            </Pressable>
            <Text className="text-white text-xl font-bold" style={{ fontFamily: 'DMSans_700Bold' }}>
              Trusted Emails
            </Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowAddForm(true);
            }}
            className="bg-blue-500 p-2.5 rounded-full"
          >
            <Plus size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Info Card */}
          <Animated.View
            entering={FadeInDown.duration(500)}
            className="bg-blue-500/10 rounded-2xl p-4 border border-blue-500/20 mb-6"
          >
            <View className="flex-row items-start">
              <Mail size={20} color="#3B82F6" />
              <View className="flex-1 ml-3">
                <Text className="text-slate-300 text-sm font-medium" style={{ fontFamily: 'DMSans_500Medium' }}>
                  What are trusted emails?
                </Text>
                <Text className="text-slate-500 text-sm mt-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                  TripTrack will only process emails forwarded from these addresses. This keeps your trips secure and prevents spam.
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* Add Email Form */}
          {showAddForm && (
            <Animated.View
              entering={FadeInDown.duration(300)}
              className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 mb-4"
            >
              <Text className="text-slate-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                Add Email Address
              </Text>
              <View className="flex-row items-center">
                <TextInput
                  value={newEmail}
                  onChangeText={setNewEmail}
                  placeholder="email@example.com"
                  placeholderTextColor="#64748B"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoFocus
                  className="flex-1 bg-slate-700/50 rounded-xl px-4 py-3 text-white border border-slate-600/50"
                  style={{ fontFamily: 'DMSans_400Regular', fontSize: 16 }}
                />
                <Pressable
                  onPress={handleAddEmail}
                  className="bg-blue-500 p-3 rounded-xl ml-2"
                >
                  <Check size={20} color="#FFFFFF" />
                </Pressable>
              </View>
              <Pressable
                onPress={() => {
                  setShowAddForm(false);
                  setNewEmail('');
                }}
                className="mt-2"
              >
                <Text className="text-slate-500 text-sm text-center" style={{ fontFamily: 'DMSans_400Regular' }}>
                  Cancel
                </Text>
              </Pressable>
            </Animated.View>
          )}

          {/* Email List */}
          <Animated.View entering={FadeInDown.duration(500).delay(100)}>
            <Text className="text-slate-300 text-sm font-semibold uppercase tracking-wider mb-3" style={{ fontFamily: 'SpaceMono_400Regular' }}>
              Your Trusted Emails
            </Text>

            <View className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
              {emails.map((email, index) => (
                <Animated.View
                  key={email.id}
                  entering={FadeInRight.duration(400).delay(index * 50)}
                  className={`flex-row items-center p-4 ${
                    index < emails.length - 1 ? 'border-b border-slate-700/30' : ''
                  }`}
                >
                  <View className="bg-blue-500/20 p-2.5 rounded-xl">
                    <Mail size={18} color="#3B82F6" />
                  </View>
                  <View className="flex-1 ml-3">
                    <Text className="text-white font-medium" style={{ fontFamily: 'DMSans_500Medium' }}>
                      {email.email}
                    </Text>
                    <View className="flex-row items-center mt-1">
                      {email.verified ? (
                        <>
                          <Check size={12} color="#10B981" />
                          <Text className="text-emerald-400 text-xs ml-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                            Verified
                          </Text>
                        </>
                      ) : (
                        <>
                          <AlertCircle size={12} color="#F59E0B" />
                          <Text className="text-amber-400 text-xs ml-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                            Pending verification
                          </Text>
                        </>
                      )}
                    </View>
                  </View>
                  <Pressable
                    onPress={() => handleRemoveEmail(email.id)}
                    className="p-2"
                  >
                    <Trash2 size={18} color="#EF4444" />
                  </Pressable>
                </Animated.View>
              ))}
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

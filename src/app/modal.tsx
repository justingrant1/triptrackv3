import React from 'react';
import { View, Text, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { X, Sparkles, Send, Plane, Building2, MapPin } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SUGGESTIONS = [
  { icon: <Plane size={16} color="#3B82F6" />, text: "What's my flight confirmation?", color: '#3B82F6' },
  { icon: <Building2 size={16} color="#8B5CF6" />, text: "Hotel address in NYC?", color: '#8B5CF6' },
  { icon: <MapPin size={16} color="#10B981" />, text: "When should I leave for the airport?", color: '#10B981' },
];

export default function ConciergeModal() {
  const router = useRouter();
  const [query, setQuery] = React.useState('');

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleSend = () => {
    if (query.trim()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // TODO: Integrate with AI
    }
  };

  const handleSuggestion = (text: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuery(text);
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
              onPress={handleClose}
              className="bg-slate-800/80 p-2.5 rounded-full border border-slate-700/50"
            >
              <X size={20} color="#94A3B8" />
            </Pressable>
            <View className="flex-row items-center">
              <Sparkles size={18} color="#8B5CF6" />
              <Text className="text-white font-bold ml-2" style={{ fontFamily: 'DMSans_700Bold' }}>
                Concierge
              </Text>
            </View>
            <View className="w-10" />
          </View>

          {/* Content */}
          <View className="flex-1 px-5 justify-center">
            <Animated.View
              entering={FadeInDown.duration(600)}
              className="items-center mb-8"
            >
              <View className="bg-purple-500/20 p-6 rounded-full mb-4">
                <Sparkles size={40} color="#A855F7" />
              </View>
              <Text className="text-white text-xl font-bold text-center" style={{ fontFamily: 'DMSans_700Bold' }}>
                How can I help?
              </Text>
              <Text className="text-slate-400 text-sm text-center mt-2 px-8" style={{ fontFamily: 'DMSans_400Regular' }}>
                Your personal travel concierge for trips, bookings, and plans
              </Text>
            </Animated.View>

            {/* Suggestions */}
            <View className="space-y-3">
              {SUGGESTIONS.map((suggestion, index) => (
                <AnimatedPressable
                  key={index}
                  entering={FadeInUp.duration(400).delay(index * 100 + 200)}
                  onPress={() => handleSuggestion(suggestion.text)}
                  className="bg-slate-800/50 rounded-2xl p-4 flex-row items-center border border-slate-700/50"
                >
                  <View style={{ backgroundColor: suggestion.color + '20', padding: 8, borderRadius: 10 }}>
                    {suggestion.icon}
                  </View>
                  <Text className="text-slate-300 flex-1 ml-3" style={{ fontFamily: 'DMSans_400Regular' }}>
                    {suggestion.text}
                  </Text>
                </AnimatedPressable>
              ))}
            </View>
          </View>

          {/* Input */}
          <Animated.View
            entering={FadeInUp.duration(500).delay(400)}
            className="px-5 pb-4"
          >
            <View className="bg-slate-800/80 rounded-2xl flex-row items-center border border-slate-700/50 px-4">
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Ask anything about your trip..."
                placeholderTextColor="#64748B"
                className="flex-1 py-4 text-white"
                style={{ fontFamily: 'DMSans_400Regular', fontSize: 16 }}
                multiline
              />
              <Pressable
                onPress={handleSend}
                disabled={!query.trim()}
                className={`p-2.5 rounded-full ${query.trim() ? 'bg-purple-500' : 'bg-slate-700'}`}
              >
                <Send size={18} color={query.trim() ? '#FFFFFF' : '#64748B'} />
              </Pressable>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

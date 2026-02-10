import React from 'react';
import { View, Text, Pressable, TextInput, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { X, Sparkles, Send, Plane, Building2, MapPin, Trash2 } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp, FadeInRight } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useChat } from '@/lib/hooks/useChat';
import { useSubscription, incrementAIMessageCount } from '@/lib/hooks/useSubscription';
import { UpgradeModal } from '@/components/UpgradeModal';
import { useQueryClient } from '@tanstack/react-query';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SUGGESTIONS = [
  { icon: <Plane size={16} color="#3B82F6" />, text: "What's my next flight?", color: '#3B82F6' },
  { icon: <Building2 size={16} color="#8B5CF6" />, text: "Where am I staying?", color: '#8B5CF6' },
  { icon: <MapPin size={16} color="#10B981" />, text: "What's on my itinerary?", color: '#10B981' },
];

function MessageBubble({ message, index }: { message: any; index: number }) {
  const isUser = message.role === 'user';

  return (
    <Animated.View
      entering={FadeInRight.duration(300).delay(index * 50)}
      className={`mb-3 ${isUser ? 'items-end' : 'items-start'}`}
    >
      <View
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-blue-500'
            : 'bg-slate-800/80 border border-slate-700/50'
        }`}
      >
        <Text
          className={`${isUser ? 'text-white' : 'text-slate-200'}`}
          style={{ fontFamily: 'DMSans_400Regular', fontSize: 15, lineHeight: 22 }}
        >
          {message.content}
        </Text>
      </View>
      <Text className="text-slate-600 text-xs mt-1 px-1" style={{ fontFamily: 'DMSans_400Regular' }}>
        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </Animated.View>
  );
}

export default function ConciergeModal() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [query, setQuery] = React.useState('');
  const scrollViewRef = React.useRef<ScrollView>(null);
  const [showUpgradeModal, setShowUpgradeModal] = React.useState(false);
  
  const { messages, isLoading, error, sendMessageStreaming, clearMessages } = useChat();
  const { canUseAI } = useSubscription();

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleSend = async () => {
    if (query.trim() && !isLoading) {
      // Check AI message limit
      if (!canUseAI) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setShowUpgradeModal(true);
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const message = query;
      setQuery('');
      
      // Increment AI message count and reactively update the query cache
      await incrementAIMessageCount();
      queryClient.setQueryData(['ai-messages-today'], (old: number | undefined) => (old ?? 0) + 1);
      
      await sendMessageStreaming(message);
      
      // Scroll to bottom after sending
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  const handleSuggestion = async (text: string) => {
    // Check AI message limit
    if (!canUseAI) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setShowUpgradeModal(true);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuery(text);
    
    // Increment AI message count and reactively update the query cache
    await incrementAIMessageCount();
    queryClient.setQueryData(['ai-messages-today'], (old: number | undefined) => (old ?? 0) + 1);
    
    await sendMessageStreaming(text);
    setQuery('');
    
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleClear = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    clearMessages();
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
          <View className="flex-1">
            {messages.length === 0 ? (
              /* Empty State */
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
                      disabled={isLoading}
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
            ) : (
              /* Chat Messages */
              <ScrollView
                ref={scrollViewRef}
                className="flex-1 px-5"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingTop: 20, paddingBottom: 20 }}
              >
                {messages.map((message, index) => (
                  <MessageBubble key={message.id} message={message} index={index} />
                ))}
                
                {isLoading && messages[messages.length - 1]?.role === 'user' && (
                  <View className="items-start mb-3">
                    <View className="bg-slate-800/80 border border-slate-700/50 rounded-2xl px-4 py-3">
                      <ActivityIndicator size="small" color="#A855F7" />
                    </View>
                  </View>
                )}

                {error && (
                  <Animated.View
                    entering={FadeInUp.duration(300)}
                    className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-3"
                  >
                    <Text className="text-red-400 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                      {error}
                    </Text>
                  </Animated.View>
                )}
              </ScrollView>
            )}
          </View>

          {/* Input */}
          <Animated.View
            entering={FadeInUp.duration(500).delay(400)}
            className="px-5 pb-4"
          >
            {messages.length > 0 && (
              <Pressable
                onPress={handleClear}
                className="mb-2 self-center"
              >
                <View className="flex-row items-center bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700/50">
                  <Trash2 size={12} color="#64748B" />
                  <Text className="text-slate-400 text-xs ml-1.5" style={{ fontFamily: 'DMSans_500Medium' }}>
                    Clear Chat
                  </Text>
                </View>
              </Pressable>
            )}
            
            <View className="bg-slate-800/80 rounded-2xl flex-row items-center border border-slate-700/50 px-4">
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Ask anything about your trip..."
                placeholderTextColor="#64748B"
                className="flex-1 py-4 text-white"
                style={{ fontFamily: 'DMSans_400Regular', fontSize: 16 }}
                multiline
                maxLength={500}
                editable={!isLoading}
                onSubmitEditing={handleSend}
              />
              <Pressable
                onPress={handleSend}
                disabled={!query.trim() || isLoading}
                className={`p-2.5 rounded-full ${query.trim() && !isLoading ? 'bg-purple-500' : 'bg-slate-700'}`}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#64748B" />
                ) : (
                  <Send size={18} color={query.trim() ? '#FFFFFF' : '#64748B'} />
                )}
              </Pressable>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Upgrade Modal */}
      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason="ai"
      />
    </View>
  );
}

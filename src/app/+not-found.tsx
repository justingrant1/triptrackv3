import { View, Text, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, Home } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-slate-950">
        <LinearGradient
          colors={['#0F172A', '#020617']}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />

        <SafeAreaView className="flex-1 items-center justify-center px-8">
          {/* Icon */}
          <View
            className="w-20 h-20 rounded-full items-center justify-center mb-6"
            style={{ backgroundColor: 'rgba(59,130,246,0.15)' }}
          >
            <MapPin size={36} color="#3B82F6" />
          </View>

          {/* Title */}
          <Text
            className="text-white text-2xl font-bold text-center"
            style={{ fontFamily: 'DMSans_700Bold' }}
          >
            Page Not Found
          </Text>

          {/* Subtitle */}
          <Text
            className="text-slate-400 text-base text-center mt-3 leading-6"
            style={{ fontFamily: 'DMSans_400Regular' }}
          >
            Looks like this destination doesn't exist.{'\n'}
            Let's get you back on track.
          </Text>

          {/* Go Home Button */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.replace('/(tabs)');
            }}
            className="mt-8 bg-blue-500 px-8 py-4 rounded-2xl flex-row items-center"
            style={{
              shadowColor: '#3B82F6',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 6,
            }}
          >
            <Home size={20} color="#FFFFFF" />
            <Text
              className="text-white font-bold text-base ml-2"
              style={{ fontFamily: 'DMSans_700Bold' }}
            >
              Go Home
            </Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </>
  );
}

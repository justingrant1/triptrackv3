import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertCircle, RefreshCw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console (in production, you'd send to error tracking service)
    console.error('Error Boundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    // Haptic feedback to alert user
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }

  handleReset = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      const { fallbackTitle, fallbackMessage } = this.props;
      const { error, errorInfo } = this.state;

      return (
        <View className="flex-1 bg-slate-950">
          <LinearGradient
            colors={['#0F172A', '#020617']}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
          />

          <ScrollView
            className="flex-1"
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}
          >
            <View className="items-center">
              {/* Error Icon */}
              <View className="w-20 h-20 rounded-full bg-red-500/20 items-center justify-center mb-6">
                <AlertCircle size={40} color="#EF4444" />
              </View>

              {/* Title */}
              <Text
                className="text-white text-2xl font-bold text-center mb-3"
                style={{ fontFamily: 'DMSans_700Bold' }}
              >
                {fallbackTitle || 'Something went wrong'}
              </Text>

              {/* Message */}
              <Text
                className="text-slate-400 text-base text-center mb-8 px-4"
                style={{ fontFamily: 'DMSans_400Regular' }}
              >
                {fallbackMessage || 'An unexpected error occurred. Please try again.'}
              </Text>

              {/* Error Details (only in development) */}
              {__DEV__ && error && (
                <View className="bg-slate-800/50 rounded-2xl p-4 mb-6 w-full border border-slate-700/50">
                  <Text
                    className="text-red-400 text-sm font-semibold mb-2"
                    style={{ fontFamily: 'SpaceMono_700Bold' }}
                  >
                    Error Details (Dev Only):
                  </Text>
                  <Text
                    className="text-slate-300 text-xs mb-2"
                    style={{ fontFamily: 'SpaceMono_400Regular' }}
                  >
                    {error.toString()}
                  </Text>
                  {errorInfo && (
                    <Text
                      className="text-slate-500 text-xs"
                      style={{ fontFamily: 'SpaceMono_400Regular' }}
                      numberOfLines={10}
                    >
                      {errorInfo.componentStack}
                    </Text>
                  )}
                </View>
              )}

              {/* Retry Button */}
              <Pressable
                onPress={this.handleReset}
                className="rounded-2xl overflow-hidden"
              >
                <LinearGradient
                  colors={['#3B82F6', '#2563EB']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  className="py-4 px-8 flex-row items-center"
                >
                  <RefreshCw size={20} color="#FFFFFF" />
                  <Text
                    className="text-white text-base font-bold ml-2"
                    style={{ fontFamily: 'DMSans_700Bold' }}
                  >
                    Try Again
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

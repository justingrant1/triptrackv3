import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking } from 'react-native';

const AI_CONSENT_KEY = 'ai_data_consent';
const AI_CONSENT_DATE_KEY = 'ai_data_consent_date';

/**
 * Hook to manage AI data sharing consent.
 * 
 * Apple Guidelines 5.1.1(i) & 5.1.2(i) require:
 * 1. Disclose what data is sent
 * 2. Identify who data is sent to (OpenAI)
 * 3. Obtain explicit user permission BEFORE sharing data
 * 
 * This hook provides:
 * - `hasConsent`: whether the user has previously consented
 * - `isLoading`: whether consent status is still being loaded
 * - `requestConsent`: shows an alert asking for explicit consent
 * - `checkAndRequestConsent`: checks consent, prompts if needed, returns boolean
 */
export function useAIConsent() {
  const [hasConsent, setHasConsent] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadConsent();
  }, []);

  const loadConsent = async () => {
    try {
      const consent = await AsyncStorage.getItem(AI_CONSENT_KEY);
      setHasConsent(consent === 'true');
    } catch {
      setHasConsent(false);
    } finally {
      setIsLoading(false);
    }
  };

  const grantConsent = useCallback(async () => {
    try {
      await AsyncStorage.setItem(AI_CONSENT_KEY, 'true');
      await AsyncStorage.setItem(AI_CONSENT_DATE_KEY, new Date().toISOString());
      setHasConsent(true);
    } catch (e) {
      console.warn('Failed to save AI consent:', e);
    }
  }, []);

  const revokeConsent = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(AI_CONSENT_KEY);
      await AsyncStorage.removeItem(AI_CONSENT_DATE_KEY);
      setHasConsent(false);
    } catch (e) {
      console.warn('Failed to revoke AI consent:', e);
    }
  }, []);

  /**
   * Show an explicit consent alert. Returns a Promise that resolves to
   * true if the user taps "I Agree", false if they decline.
   */
  const requestConsent = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      Alert.alert(
        'AI Data Sharing',
        'This feature uses OpenAI to process your data. The following may be sent:\n\n' +
        '• Chat messages & trip details\n' +
        '• Travel confirmation emails\n' +
        '• Receipt & boarding pass images\n\n' +
        'Your data is processed securely and never sold. ' +
        'By tapping "I Agree", you consent to sharing this data with OpenAI.\n\n' +
        'See our Privacy Policy for details.',
        [
          {
            text: 'Privacy Policy',
            onPress: () => {
              Linking.openURL('https://triptrack.ai/privacy');
              // Don't resolve — let them come back and choose
              // Re-show the alert after a delay
              setTimeout(() => {
                requestConsent().then(resolve);
              }, 1000);
            },
          },
          {
            text: 'Not Now',
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: 'I Agree',
            style: 'default',
            onPress: async () => {
              await grantConsent();
              resolve(true);
            },
          },
        ],
        { cancelable: false }
      );
    });
  }, [grantConsent]);

  /**
   * Check if consent exists. If not, prompt the user.
   * Returns true if consent is granted (either previously or just now).
   * Use this as a gate before any AI feature.
   */
  const checkAndRequestConsent = useCallback(async (): Promise<boolean> => {
    // Re-check from storage in case it was set elsewhere
    try {
      const consent = await AsyncStorage.getItem(AI_CONSENT_KEY);
      if (consent === 'true') {
        setHasConsent(true);
        return true;
      }
    } catch {
      // Fall through to request
    }

    return requestConsent();
  }, [requestConsent]);

  return {
    hasConsent,
    isLoading,
    grantConsent,
    revokeConsent,
    requestConsent,
    checkAndRequestConsent,
  };
}

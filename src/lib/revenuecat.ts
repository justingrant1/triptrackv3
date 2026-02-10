// RevenueCat service layer for subscription management

import Purchases, {
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
  LOG_LEVEL,
} from 'react-native-purchases';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const REVENUECAT_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY!;

// Track whether SDK has been configured (configure should only be called once)
let isConfigured = false;

/**
 * Initialize RevenueCat SDK
 * Call this once on app startup after user is authenticated.
 * Uses configure() on first call, then logIn() for subsequent user switches.
 */
export async function initializeRevenueCat(userId: string) {
  try {
    // Validate API key exists
    if (!REVENUECAT_API_KEY || REVENUECAT_API_KEY === 'undefined') {
      throw new Error('EXPO_PUBLIC_REVENUECAT_API_KEY is not configured. Please add it to your EAS environment variables.');
    }
    
    if (!isConfigured) {
      // First time: configure the SDK
      Purchases.setLogLevel(LOG_LEVEL.DEBUG); // Change to INFO in production
      
      if (Platform.OS === 'ios') {
        await Purchases.configure({ apiKey: REVENUECAT_API_KEY, appUserID: userId });
      } else if (Platform.OS === 'android') {
        await Purchases.configure({ apiKey: REVENUECAT_API_KEY, appUserID: userId });
      }
      
      isConfigured = true;
      console.log('✅ RevenueCat configured for user:', userId);
    } else {
      // SDK already configured — switch to the new user via logIn()
      // This properly associates the RevenueCat user with the app account
      // and does NOT transfer the device's Apple receipt to the new user
      const { customerInfo } = await Purchases.logIn(userId);
      console.log('✅ RevenueCat switched to user:', userId);
      console.log('   Entitlements:', Object.keys(customerInfo.entitlements.active));
    }
  } catch (error) {
    console.error('❌ RevenueCat initialization failed:', error);
    throw error;
  }
}

/**
 * Log out the current RevenueCat user
 * Call this when the app user signs out to prevent entitlement leaking
 * between accounts on the same device.
 */
export async function logOutRevenueCat(): Promise<void> {
  try {
    if (!isConfigured) return;
    
    await Purchases.logOut();
    console.log('✅ RevenueCat user logged out (reset to anonymous)');
  } catch (error) {
    // Don't throw — logout should be best-effort
    console.warn('⚠️ RevenueCat logOut failed:', error);
  }
}

/**
 * Get available subscription offerings
 * Returns packages for monthly and annual subscriptions
 */
export async function getOfferings(): Promise<PurchasesOfferings | null> {
  try {
    const offerings = await Purchases.getOfferings();
    
    if (offerings.current !== null) {
      console.log('📦 Available offerings:', offerings.current.availablePackages.length);
      console.log('📦 Package details:', offerings.current.availablePackages.map(pkg => ({
        identifier: pkg.identifier,
        packageType: pkg.packageType,
        price: pkg.product.priceString,
      })));
      return offerings;
    }
    
    console.warn('⚠️ No offerings available');
    return null;
  } catch (error) {
    console.error('❌ Failed to get offerings:', error);
    return null;
  }
}

/**
 * Purchase a subscription package
 * @param pkg - The package to purchase (monthly or annual)
 * @returns CustomerInfo with updated entitlements
 */
export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  try {
    console.log('💳 Purchasing package:', pkg.identifier);
    
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    
    console.log('✅ Purchase successful!');
    console.log('Entitlements:', Object.keys(customerInfo.entitlements.active));
    
    // Sync subscription status to Supabase
    await syncSubscriptionStatus(customerInfo);
    
    return customerInfo;
  } catch (error: any) {
    if (error.userCancelled) {
      console.log('🚫 User cancelled purchase');
    } else {
      console.error('❌ Purchase failed:', error);
    }
    throw error;
  }
}

/**
 * Restore previous purchases
 * Useful when user reinstalls app or signs in on new device
 */
export async function restorePurchases(): Promise<CustomerInfo> {
  try {
    console.log('🔄 Restoring purchases...');
    
    const customerInfo = await Purchases.restorePurchases();
    
    console.log('✅ Purchases restored');
    console.log('Active entitlements:', Object.keys(customerInfo.entitlements.active));
    
    // Sync subscription status to Supabase
    await syncSubscriptionStatus(customerInfo);
    
    return customerInfo;
  } catch (error) {
    console.error('❌ Failed to restore purchases:', error);
    throw error;
  }
}

/**
 * Check if user has Pro entitlement
 * @returns true if user has active "TripTrack Pro" entitlement
 */
export async function checkProEntitlement(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const hasProEntitlement = customerInfo.entitlements.active['TripTrack Pro'] !== undefined;
    
    console.log('🔍 TripTrack Pro entitlement:', hasProEntitlement);
    
    return hasProEntitlement;
  } catch (error) {
    console.error('❌ Failed to check entitlement:', error);
    return false;
  }
}

/**
 * Get current customer info
 * Includes entitlements, subscription status, etc.
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo;
  } catch (error) {
    console.error('❌ Failed to get customer info:', error);
    return null;
  }
}

/**
 * Sync subscription status from RevenueCat to Supabase
 * Updates the user's plan in the profiles table
 */
async function syncSubscriptionStatus(customerInfo: CustomerInfo): Promise<void> {
  try {
    const hasProEntitlement = customerInfo.entitlements.active['TripTrack Pro'] !== undefined;
    const plan = hasProEntitlement ? 'pro' : 'free';
    
    console.log('🔄 Syncing subscription status to Supabase:', plan);
    
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('❌ No authenticated user to sync subscription');
      return;
    }
    
    const { error } = await supabase
      .from('profiles')
      .update({ plan })
      .eq('id', user.id);
    
    if (error) {
      console.error('❌ Failed to sync subscription to Supabase:', error);
    } else {
      console.log('✅ Subscription synced to Supabase');
    }
  } catch (error) {
    console.error('❌ Failed to sync subscription:', error);
  }
}

/**
 * Get subscription details (price, period, etc.)
 */
export function getPackageDetails(pkg: PurchasesPackage) {
  return {
    identifier: pkg.identifier,
    price: pkg.product.priceString,
    period: pkg.packageType,
    product: pkg.product,
  };
}

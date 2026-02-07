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

/**
 * Initialize RevenueCat SDK
 * Call this once on app startup after user is authenticated
 */
export async function initializeRevenueCat(userId: string) {
  try {
    // Validate API key exists
    if (!REVENUECAT_API_KEY || REVENUECAT_API_KEY === 'undefined') {
      throw new Error('EXPO_PUBLIC_REVENUECAT_API_KEY is not configured. Please add it to your EAS environment variables.');
    }
    
    // Configure SDK
    Purchases.setLogLevel(LOG_LEVEL.DEBUG); // Change to INFO in production
    
    // Initialize with API key
    if (Platform.OS === 'ios') {
      await Purchases.configure({ apiKey: REVENUECAT_API_KEY, appUserID: userId });
    } else if (Platform.OS === 'android') {
      // For Android, you'll need a separate API key from RevenueCat
      await Purchases.configure({ apiKey: REVENUECAT_API_KEY, appUserID: userId });
    }

    console.log('✅ RevenueCat initialized for user:', userId);
  } catch (error) {
    console.error('❌ RevenueCat initialization failed:', error);
    throw error;
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

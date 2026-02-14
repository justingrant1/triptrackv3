import { useMemo } from 'react';
import { Dimensions, Platform } from 'react-native';

/**
 * Responsive design hook for iPad optimization.
 * Returns adaptive values based on screen size.
 */
export function useResponsive() {
  const { width, height } = Dimensions.get('window');

  return useMemo(() => {
    // iPad detection: width > 768px (iPad Mini and up)
    const isTablet = width >= 768;
    
    // Larger tablets (iPad Pro 11" and up)
    const isLargeTablet = width >= 1024;

    return {
      // Device type
      isTablet,
      isLargeTablet,
      isPhone: !isTablet,
      
      // Screen dimensions
      screenWidth: width,
      screenHeight: height,
      
      // Content width constraints
      maxContentWidth: isTablet ? 680 : width,
      maxFormWidth: isTablet ? 560 : width,
      maxCardWidth: isTablet ? 480 : width - 40,
      
      // Grid columns
      columns: isTablet ? 2 : 1,
      statsColumns: isLargeTablet ? 4 : isTablet ? 2 : 2,
      
      // Spacing
      containerPadding: isTablet ? 40 : 20,
      cardGap: isTablet ? 24 : 16,
      sectionGap: isTablet ? 32 : 24,
      
      // Typography scale
      heroTextSize: isTablet ? 32 : 24,
      titleTextSize: isTablet ? 24 : 20,
      bodyTextSize: isTablet ? 18 : 16,
      
      // Component sizes
      iconSize: isTablet ? 24 : 20,
      buttonHeight: isTablet ? 52 : 48,
      inputHeight: isTablet ? 52 : 48,
      
      // Tab bar
      tabBarHeight: isTablet ? 72 : 88,
      tabIconSize: isTablet ? 28 : 24,
    };
  }, [width, height]);
}

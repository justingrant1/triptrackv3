import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useResponsive } from '@/lib/hooks/useResponsive';

interface ResponsiveContainerProps {
  children: React.ReactNode;
  maxWidth?: 'content' | 'form' | 'card' | number;
  style?: ViewStyle;
  className?: string;
}

/**
 * Container that auto-centers content with max-width on iPad.
 * On phone, content fills the screen width.
 */
export function ResponsiveContainer({ 
  children, 
  maxWidth = 'content',
  style,
  className = '',
}: ResponsiveContainerProps) {
  const responsive = useResponsive();

  const getMaxWidth = () => {
    if (typeof maxWidth === 'number') return maxWidth;
    
    switch (maxWidth) {
      case 'form':
        return responsive.maxFormWidth;
      case 'card':
        return responsive.maxCardWidth;
      case 'content':
      default:
        return responsive.maxContentWidth;
    }
  };

  const containerStyle: ViewStyle = {
    width: '100%',
    maxWidth: responsive.isTablet ? getMaxWidth() : undefined,
    marginHorizontal: responsive.isTablet ? 'auto' : 0,
    alignSelf: 'center',
    ...style,
  };

  return (
    <View style={containerStyle} className={className}>
      {children}
    </View>
  );
}

interface ResponsiveGridProps {
  children: React.ReactNode;
  columns?: number;
  gap?: number;
  style?: ViewStyle;
  className?: string;
}

/**
 * Grid layout that adapts to screen size.
 * 2 columns on iPad, 1 column on phone (or custom columns).
 */
export function ResponsiveGrid({
  children,
  columns,
  gap,
  style,
  className = '',
}: ResponsiveGridProps) {
  const responsive = useResponsive();
  
  const gridColumns = columns ?? responsive.columns;
  const gridGap = gap ?? responsive.cardGap;

  const gridStyle: ViewStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -gridGap / 2,
    ...style,
  };

  const childArray = React.Children.toArray(children);

  return (
    <View style={gridStyle} className={className}>
      {childArray.map((child, index) => (
        <View
          key={index}
          style={{
            width: `${100 / gridColumns}%`,
            paddingHorizontal: gridGap / 2,
            marginBottom: gridGap,
          }}
        >
          {child}
        </View>
      ))}
    </View>
  );
}

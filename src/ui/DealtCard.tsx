import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';

// slides a freshly dealt card in from the shoe corner and settles it; runs once on mount
export function DealtCard({ index = 0, style, children }: { index?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      delay: Math.min(index, 8) * 70,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, index]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [90, 0] }) },
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) },
            { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['8deg', '0deg'] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

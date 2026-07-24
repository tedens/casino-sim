import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';

// ms between the two opening cards dealt to the same position
const CARD_STEP = 90;
// ms between positions, so one person is fully dealt before the next (> 2 * CARD_STEP)
const SEAT_STEP = 210;

// shared table-deal timing: opening cards cascade one position at a time; later
// cards (hits, draws, third cards) land quickly since they arrive one at a time
export function dealDelay(order: number, cardIndex: number): number {
  if (cardIndex >= 2) return CARD_STEP;
  return order * SEAT_STEP + cardIndex * CARD_STEP;
}

// slides a freshly dealt card in from the shoe corner and settles it; runs once on mount
export function DealtCard({ order = 0, index = 0, style, children }: { order?: number; index?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      delay: dealDelay(order, index),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, order, index]);

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

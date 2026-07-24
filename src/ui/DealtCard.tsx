import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, View, ViewStyle } from 'react-native';

// ms between consecutive cards in the deal sequence
const CARD_STEP = 80;
// ms between positions when a whole hand is dealt together (baccarat pp bb)
const GROUP_STEP = 200;

// casino rotation: one card to each position in order, then around again.
// order = position rank, positions = number of positions in the rotation.
export function rotationDelay(order: number, cardIndex: number, positions: number): number {
  if (cardIndex >= 2) return CARD_STEP;
  return (cardIndex * positions + order) * CARD_STEP;
}

// grouped: a position's opening cards land together, then the next position
export function groupDelay(order: number, cardIndex: number): number {
  if (cardIndex >= 2) return CARD_STEP;
  return order * GROUP_STEP + cardIndex * CARD_STEP;
}

// slides a freshly dealt card in from the shoe corner and settles it; runs once on mount.
// instant skips the animation entirely (cards appear immediately, still in deal order).
export function DealtCard({ delayMs = 0, instant = false, style, children }: { delayMs?: number; instant?: boolean; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const progress = useRef(new Animated.Value(instant ? 1 : 0)).current;

  useEffect(() => {
    if (instant) { progress.setValue(1); return; }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      delay: delayMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, delayMs, instant]);

  if (instant) return <View style={style}>{children}</View>;

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

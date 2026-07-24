import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Circle, RoundedRect } from '@shopify/react-native-skia';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { DieFace } from '../domain/types';

const DOTS: Record<DieFace, Array<[number, number]>> = {
  1: [[32, 32]],
  2: [[20, 20], [44, 44]],
  3: [[20, 20], [32, 32], [44, 44]],
  4: [[20, 20], [44, 20], [20, 44], [44, 44]],
  5: [[20, 20], [44, 20], [32, 32], [20, 44], [44, 44]],
  6: [[20, 18], [44, 18], [20, 32], [44, 32], [20, 46], [44, 46]],
};

function Die({ face }: { face: DieFace }) {
  return (
    <Canvas style={styles.canvas}>
      <RoundedRect x={2} y={3} width={60} height={58} r={10} color="#f7efe0" />
      <RoundedRect x={4} y={5} width={56} height={54} r={9} color="#fffdf4" />
      {DOTS[face].map(([cx, cy], index) => <Circle key={index} cx={cx} cy={cy} r={4.8} color="#171b19" />)}
    </Canvas>
  );
}

interface Landing {
  first: { x: number; y: number };
  second: { x: number; y: number };
  wallX: number;
}

export function DiceThrow({ faces, rolling, returning = false, duration = 900, width, height, landing }: {
  faces: [DieFace, DieFace];
  rolling: boolean;
  returning?: boolean;
  duration?: number;
  width: number;
  height: number;
  landing: Landing;
}) {
  const x1 = useSharedValue(landing.first.x * width);
  const y1 = useSharedValue(landing.first.y * height);
  const x2 = useSharedValue(landing.second.x * width);
  const y2 = useSharedValue(landing.second.y * height);
  const spin1 = useSharedValue(0);
  const spin2 = useSharedValue(0);

  useEffect(() => {
    if (returning) {
      x1.value = withTiming(width * 0.46, { duration: 560, easing: Easing.in(Easing.cubic) });
      y1.value = withTiming(height + 78, { duration: 620, easing: Easing.in(Easing.cubic) });
      x2.value = withDelay(45, withTiming(width * 0.57, { duration: 540, easing: Easing.in(Easing.cubic) }));
      y2.value = withDelay(45, withTiming(height + 78, { duration: 560, easing: Easing.in(Easing.cubic) }));
      spin1.value = withTiming(spin1.value + 185, { duration: 620 });
      spin2.value = withTiming(spin2.value - 155, { duration: 605 });
      return;
    }
    if (!rolling) {
      x1.value = landing.first.x * width;
      y1.value = landing.first.y * height;
      x2.value = landing.second.x * width;
      y2.value = landing.second.y * height;
      return;
    }
    x1.value = -72;
    y1.value = height * 0.72;
    x2.value = -126;
    y2.value = height * 0.58;
    spin1.value = 0;
    spin2.value = 0;
    // one continuous throw: accelerate toward the wall, decelerate to the spot (velocity matches at the seam)
    const fly = duration * 0.55;
    const settle = duration * 0.45;
    const rest1x = landing.first.x * width;
    const rest1y = landing.first.y * height;
    const rest2x = landing.second.x * width;
    const rest2y = landing.second.y * height;
    x1.value = withSequence(
      withTiming(landing.wallX * width, { duration: fly, easing: Easing.in(Easing.quad) }),
      withTiming(rest1x, { duration: settle, easing: Easing.out(Easing.cubic) }),
    );
    // parabola up to the apex, then a single soft overshoot-and-settle drop (no hard bounce)
    y1.value = withSequence(
      withTiming(24, { duration: fly, easing: Easing.out(Easing.quad) }),
      withTiming(rest1y + 10, { duration: settle * 0.7, easing: Easing.in(Easing.quad) }),
      withTiming(rest1y, { duration: settle * 0.3, easing: Easing.out(Easing.quad) }),
    );
    x2.value = withDelay(35, withSequence(
      withTiming((landing.wallX - 0.05) * width, { duration: fly, easing: Easing.in(Easing.quad) }),
      withTiming(rest2x, { duration: settle, easing: Easing.out(Easing.cubic) }),
    ));
    y2.value = withDelay(35, withSequence(
      withTiming(34, { duration: fly, easing: Easing.out(Easing.quad) }),
      withTiming(rest2y + 10, { duration: settle * 0.7, easing: Easing.in(Easing.quad) }),
      withTiming(rest2y, { duration: settle * 0.3, easing: Easing.out(Easing.quad) }),
    ));
    // spin decelerates in lockstep with the travel so rotation and motion stop together
    spin1.value = withTiming(720, { duration, easing: Easing.out(Easing.cubic) });
    spin2.value = withDelay(25, withTiming(-660, { duration: duration - 25, easing: Easing.out(Easing.cubic) }));
  }, [duration, height, landing, returning, rolling, spin1, spin2, width, x1, x2, y1, y2]);

  const firstStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x1.value },
      { translateY: y1.value },
      { rotate: `${spin1.value}deg` },
    ],
  }));
  const secondStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x2.value },
      { translateY: y2.value },
      { rotate: `${spin2.value}deg` },
    ],
  }));

  return (
    <View style={styles.track} pointerEvents="none">
      <Animated.View style={[styles.die, firstStyle]}><Die face={faces[0]} /></Animated.View>
      <Animated.View style={[styles.die, secondStyle]}><Die face={faces[1]} /></Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden', zIndex: 40 },
  die: { position: 'absolute', width: 64, height: 64, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 5, shadowOffset: { width: 2, height: 4 } },
  canvas: { width: 64, height: 64 },
});

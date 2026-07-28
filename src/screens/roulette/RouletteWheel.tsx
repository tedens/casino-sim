import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { rouColors } from '../../roulette/theme';
import { SpinTrace, WheelKind } from '../../roulette/types';
import { POCKET_ORDER, pocketColor } from '../../roulette/wheel';

const COLORS = { red: rouColors.pocketRed, black: rouColors.pocketBlack, green: rouColors.pocketGreen };

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, rOuter, a0);
  const [x1, y1] = polar(cx, cy, rOuter, a1);
  const [x2, y2] = polar(cx, cy, rInner, a1);
  const [x3, y3] = polar(cx, cy, rInner, a0);
  return `M ${x0} ${y0} A ${rOuter} ${rOuter} 0 0 1 ${x1} ${y1} L ${x2} ${y2} A ${rInner} ${rInner} 0 0 0 ${x3} ${y3} Z`;
}

// top-down wheel: the rotor (SVG) turns counter-clockwise while the ball orbits
// clockwise and spirals inward, ending seated over the winning pocket
export function RouletteWheel({ wheel, trace, spinning, speed, size }: {
  wheel: WheelKind;
  trace: SpinTrace | null;
  spinning: boolean;
  speed: number;
  size: number;
}) {
  const order = POCKET_ORDER[wheel];
  const step = 360 / order.length;
  const progress = useRef(new Animated.Value(0)).current;
  const [angles, setAngles] = useState({ wheelEnd: 0, ballEnd: 0 });

  useEffect(() => {
    if (!trace || !spinning) return;
    const wheelEnd = -(trace.wheelRevs * 360);
    const pocketCenter = trace.pocketIndex * step;
    // ball's final screen angle must equal the pocket's rotated screen angle
    const target = ((pocketCenter + wheelEnd) % 360 + 360) % 360;
    const raw = trace.ballRevs * 360;
    const ballEnd = Math.round((raw - target) / 360) * 360 + target;
    setAngles({ wheelEnd, ballEnd });
    progress.setValue(0);
    const duration = Math.min(9000, Math.max(1200, trace.durationMs / speed));
    Animated.timing(progress, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [trace, spinning, speed, progress, step]);

  const half = size / 2;
  const rOuter = half - 4;
  const rInner = half * 0.62;
  const ballTrackOuter = half - 14;
  const ballTrackInner = rInner + 8;

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={{ width: size, height: size, transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${angles.wheelEnd}deg`] }) }] }}>
        <Svg width={size} height={size}>
          <Circle cx={half} cy={half} r={half} fill="#20112f" />
          {order.map((pocket, index) => {
            const a0 = index * step - step / 2;
            const a1 = a0 + step;
            const [tx, ty] = polar(half, half, (rOuter + rInner) / 2, index * step);
            return (
              <G key={pocket}>
                <Path d={arcPath(half, half, rOuter, rInner, a0, a1)} fill={COLORS[pocketColor(pocket)]} stroke="#100a18" strokeWidth={0.6} />
                <SvgText x={tx} y={ty + 3} fill="#f2ecdc" fontSize={size * 0.037} fontWeight="bold" textAnchor="middle" transform={`rotate(${index * step}, ${tx}, ${ty})`}>{pocket}</SvgText>
              </G>
            );
          })}
          <Circle cx={half} cy={half} r={rInner - 4} fill="#31204a" stroke="#553786" strokeWidth={2} />
          <Circle cx={half} cy={half} r={size * 0.06} fill="#d5ae53" />
        </Svg>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.ballOrbit, { width: size, height: size, transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${angles.ballEnd}deg`] }) }] }]}
      >
        <Animated.View style={[styles.ball, {
          left: half - 5,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [half - ballTrackOuter, half - ballTrackOuter + 6, half - ballTrackInner] }) }],
        }]} />
      </Animated.View>
    </View>
  );
}

export function PocketBadge({ pocket, size = 44 }: { pocket: string; size?: number }) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS[pocketColor(pocket)] }]}>
      <Text style={[styles.badgeText, { fontSize: size * 0.4 }]}>{pocket}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ballOrbit: { position: 'absolute', top: 0, left: 0 },
  ball: { position: 'absolute', top: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: '#f4f1e8', shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 2 },
  badge: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(244,241,232,0.5)' },
  badgeText: { color: '#f4f1e8', fontWeight: '900' },
});

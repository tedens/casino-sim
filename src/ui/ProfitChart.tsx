import React, { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Polygon, Polyline } from 'react-native-svg';
import { formatMoney } from './components';

const HEIGHT = 90;
const MAX_POINTS = 400;

export interface ChartPalette {
  background: string;
  border: string;
  accent: string;
  ink: string;
  muted: string;
  success: string;
  danger: string;
}

export function ProfitChart({ series, title, pointLabel, palette }: {
  series: number[];
  title: string;
  /** singular noun for a data point, e.g. "Round" or "Roll" */
  pointLabel: string;
  palette: ChartPalette;
}) {
  const [width, setWidth] = useState(0);
  const [cursorX, setCursorX] = useState<number | null>(null);
  if (series.length === 0) return null;

  let peak = 0;
  let trough = 0;
  for (const value of series) {
    if (value > peak) peak = value;
    if (value < trough) trough = value;
  }
  const range = Math.max(peak - trough, 1);
  // downsample long sessions, keeping the first and last points
  const stride = Math.max(1, Math.ceil(series.length / MAX_POINTS));
  const points: Array<{ n: number; value: number }> = [];
  for (let i = 0; i < series.length; i += stride) points.push({ n: i + 1, value: series[i] });
  if (points[points.length - 1].n !== series.length) points.push({ n: series.length, value: series[series.length - 1] });

  const latest = series[series.length - 1];
  const yFor = (value: number) => ((peak - value) / range) * HEIGHT;
  const xFor = (index: number) => (points.length === 1 ? 0 : (index / (points.length - 1)) * width);
  const line = points.map((point, index) => `${xFor(index).toFixed(1)},${yFor(point.value).toFixed(1)}`).join(' ');
  const cursorIndex = cursorX !== null && width > 0
    ? Math.min(points.length - 1, Math.max(0, Math.round((cursorX / width) * (points.length - 1))))
    : null;
  const cursor = cursorIndex !== null ? points[cursorIndex] : null;

  const chart = (
    <View
      style={styles.chart}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onResponderMove={(event) => setCursorX(event.nativeEvent.locationX)}
      onResponderRelease={() => setCursorX(null)}
    >
      {width > 0 ? (
        <Svg width={width} height={HEIGHT}>
          <Polygon points={`0,${yFor(0).toFixed(1)} ${line} ${width.toFixed(1)},${yFor(0).toFixed(1)}`} fill={`${palette.accent}1a`} />
          <Polyline points={line} fill="none" stroke={palette.accent} strokeWidth={1.5} />
        </Svg>
      ) : null}
      <View style={[styles.zeroLine, { top: yFor(0) }]} />
      {cursor && cursorIndex !== null ? (
        <>
          <View pointerEvents="none" style={[styles.crosshairV, { left: xFor(cursorIndex) }]} />
          <View pointerEvents="none" style={[styles.crosshairH, { top: yFor(cursor.value) }]} />
          <View pointerEvents="none" style={[styles.dot, { backgroundColor: palette.accent, borderColor: palette.background, left: xFor(cursorIndex) - 3, top: yFor(cursor.value) - 3 }]} />
          <View
            pointerEvents="none"
            style={[
              styles.tooltip,
              { borderColor: palette.accent },
              xFor(cursorIndex) < width / 2 ? { left: xFor(cursorIndex) + 10 } : { right: width - xFor(cursorIndex) + 10 },
              { top: Math.min(Math.max(yFor(cursor.value) - 26, 0), HEIGHT - 24) },
            ]}
          >
            <Text style={[styles.tooltipText, { color: palette.ink }]}>{pointLabel} {cursor.n} · {formatMoney(cursor.value, true)}</Text>
          </View>
        </>
      ) : null}
    </View>
  );

  // mouse hover on web; native uses the responder drag above
  const body = Platform.OS === 'web'
    ? React.createElement('div', {
      style: { position: 'relative', width: '100%' },
      onMouseMove: (event: { currentTarget: { getBoundingClientRect: () => { left: number } }; clientX: number }) => {
        setCursorX(event.clientX - event.currentTarget.getBoundingClientRect().left);
      },
      onMouseLeave: () => setCursorX(null),
    }, chart)
    : chart;

  return (
    <View style={[styles.wrap, { backgroundColor: palette.background, borderColor: palette.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: palette.muted }]}>{title} · {series.length} {pointLabel.toUpperCase()}{series.length === 1 ? '' : 'S'}</Text>
        <Text style={[styles.value, { color: latest >= 0 ? palette.success : palette.danger }]}>{formatMoney(latest, true)}</Text>
      </View>
      {body}
      <View style={styles.header}>
        <Text style={[styles.bound, { color: palette.muted }]}>LO {formatMoney(trough, true)}</Text>
        <Text style={[styles.bound, { color: palette.muted }]}>HI {formatMoney(peak, true)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 10, borderRadius: 10, borderWidth: 1, gap: 5 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  value: { fontWeight: '900', fontSize: 13, fontVariant: ['tabular-nums'] },
  chart: { height: HEIGHT, position: 'relative' },
  zeroLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(160,170,185,0.6)' },
  crosshairV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(240,240,245,0.45)' },
  crosshairH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(240,240,245,0.25)' },
  dot: { position: 'absolute', width: 6, height: 6, borderRadius: 3, borderWidth: 1 },
  tooltip: { position: 'absolute', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, backgroundColor: '#06090f', borderWidth: 1, zIndex: 10 },
  tooltipText: { fontSize: 10, fontWeight: '900', fontVariant: ['tabular-nums'] },
  bound: { fontSize: 8, fontWeight: '800', fontVariant: ['tabular-nums'] },
});

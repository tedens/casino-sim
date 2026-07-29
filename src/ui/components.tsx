import React, { useState } from 'react';
import { Platform, Pressable, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { DieFace } from '../domain/types';
import { chipColors, colors } from './theme';

export function formatMoney(value: number, signed = false) {
  const rounded = Math.round(value);
  const prefix = signed && rounded > 0 ? '+' : '';
  return `${prefix}$${rounded.toLocaleString()}`;
}

export function Money({ value, signed = false, style }: { value: number; signed?: boolean; style?: object }) {
  return <Text style={[styles.money, style]}>{formatMoney(value, signed)}</Text>;
}

export function Chip({ value, selected, onPress, small = false }: { value: number; selected?: boolean; onPress?: () => void; small?: boolean }) {
  const palette = chipColors[value] ?? chipColors[1];
  // $10 and $50 are shorthand for a pair of $5s / $25s, drawn as a two-chip stack
  const doubled = value === 10 || value === 50;
  return (
    <Pressable onPress={onPress} style={[
      styles.chip,
      small && styles.smallChip,
      doubled && styles.doubledChip,
      { backgroundColor: palette.fill, borderColor: selected ? colors.gold : palette.rim },
      selected && styles.selectedChip,
    ]}>
      {doubled ? <View style={[styles.chipUnder, small && styles.smallChipUnder, { backgroundColor: palette.fill, borderColor: palette.rim }]} /> : null}
      <View style={[styles.chipInset, { borderColor: palette.text, backgroundColor: doubled ? palette.fill : 'transparent' }]}>
        <Text style={[styles.chipText, small && styles.smallChipText, { color: palette.text }]}>{formatMoney(value)}</Text>
      </View>
    </Pressable>
  );
}

const STACK_DENOMINATIONS = [500, 100, 25, 5, 1];

function stackChips(amount: number): number[] {
  let remaining = amount;
  const chips: number[] = [];
  for (const denomination of STACK_DENOMINATIONS) {
    while (remaining >= denomination && chips.length < 8) {
      chips.push(denomination);
      remaining -= denomination;
    }
  }
  if (remaining > 0 && chips.length === 8) {
    const smallest = STACK_DENOMINATIONS.find((value) => remaining >= value);
    if (smallest) chips[0] = smallest;
  }
  return chips.reverse();
}

type ChipStackSize = 'table' | 'compact';

const STACK_SIZE: Record<ChipStackSize, { hitbox: number; chip: number; inset: number; offset: number; border: number; label: number; bodyPad: number }> = {
  table: { hitbox: 78, chip: 67, inset: 42, offset: 5, border: 4, label: 8, bodyPad: 8 },
  compact: { hitbox: 58, chip: 49, inset: 30, offset: 4, border: 3, label: 7, bodyPad: 6 },
};

export function ChipStack({ amount, label, size = 'table' }: { amount: number; label?: string; size?: ChipStackSize }) {
  const [hovered, setHovered] = useState(false);
  if (amount <= 0) return null;
  const chips = stackChips(amount);
  const amountText = formatMoney(amount);
  const tooltip = `${label ? `${label} · ` : ''}${amountText}`;
  const metrics = STACK_SIZE[size];
  const bodyHeight = metrics.chip + (chips.length - 1) * metrics.offset;
  const bodyWidth = metrics.chip + metrics.bodyPad;
  const contents = (
    <>
      {label ? <Text style={[styles.stackLabel, { fontSize: metrics.label, lineHeight: metrics.label + 2 }]}>{label}</Text> : null}
      <View style={[styles.stackBody, { width: bodyWidth, height: bodyHeight, minHeight: metrics.chip }]}>
        {chips.map((value, index) => {
          const palette = chipColors[value] ?? chipColors[1];
          const isTopChip = index === chips.length - 1;
          return (
            <View key={`${value}-${index}`} style={[styles.stackChip, {
              bottom: index * metrics.offset,
              left: metrics.bodyPad / 2,
              width: metrics.chip,
              height: metrics.chip,
              borderRadius: metrics.chip / 2,
              borderWidth: metrics.border,
              backgroundColor: palette.fill,
              borderColor: palette.rim,
            }]}>
              <View style={[styles.stackInset, { width: metrics.inset, height: metrics.inset, borderRadius: metrics.inset / 2, borderColor: palette.text }]}>
                {isTopChip ? <Text style={[styles.stackAmount, { color: palette.text, fontSize: size === 'compact' ? 8 : 10 }]}>{formatMoney(amount)}</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
      {hovered ? <View style={styles.stackTooltip} pointerEvents="none"><Text style={styles.stackTooltipText}>{label ? `${label} · ` : ''}${amountText}</Text></View> : null}
    </>
  );
  if (Platform.OS === 'web') {
    return React.createElement('div', {
      'aria-label': `${label ? `${label}, ` : ''}${amountText}`,
      title: tooltip,
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      style: { minWidth: metrics.hitbox, minHeight: metrics.hitbox, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', position: 'relative', zIndex: 6 },
    }, contents);
  }
  return (
    <Pressable accessibilityLabel={tooltip} style={[styles.stackHitbox, { minWidth: metrics.hitbox, minHeight: metrics.hitbox }]}>
      {contents}
    </Pressable>
  );
}

const MINI_PIPS: Record<DieFace, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

function MiniDie({ face }: { face: DieFace }) {
  return <View style={styles.miniDie}>{Array.from({ length: 9 }, (_, index) => <View key={index} style={styles.miniPipCell}>{MINI_PIPS[face].includes(index) ? <View style={styles.miniPip} /> : null}</View>)}</View>;
}

export function DiceResult({ faces }: { faces: [DieFace, DieFace] }) {
  return <View style={styles.diceResult} accessibilityLabel={`Dice ${faces[0]} and ${faces[1]}`}><MiniDie face={faces[0]} /><MiniDie face={faces[1]} /></View>;
}

export function Button({ label, onPress, variant = 'primary', disabled, style }: { label: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [
      styles.button,
      styles[`${variant}Button`],
      disabled && styles.disabled,
      pressed && !disabled && styles.pressed,
      style,
    ]}>
      <Text style={[styles.buttonText, variant !== 'primary' && styles.lightButtonText]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, keyboardType = 'default', multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; keyboardType?: 'default' | 'numeric'; multiline?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} multiline={multiline} style={[styles.input, multiline && styles.multiline]} placeholderTextColor={colors.muted} />
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

const styles = StyleSheet.create({
  money: { color: colors.ink, fontWeight: '800', fontVariant: ['tabular-nums'] },
  chip: { width: 66, height: 66, borderRadius: 33, borderWidth: 5, alignItems: 'center', justifyContent: 'center', marginHorizontal: 3 },
  smallChip: { width: 37, height: 37, borderRadius: 19, borderWidth: 3, marginHorizontal: 0 },
  doubledChip: { marginBottom: 4 },
  chipUnder: { position: 'absolute', top: 4, left: 0, width: 66, height: 66, borderRadius: 33, borderWidth: 5, opacity: 0.85 },
  smallChipUnder: { width: 37, height: 37, borderRadius: 19, borderWidth: 3, top: 3, left: 0 },
  selectedChip: { transform: [{ translateY: -5 }], shadowColor: colors.gold, shadowOpacity: 0.8, shadowRadius: 7 },
  chipInset: { width: '72%', height: '72%', borderRadius: 999, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 14, fontWeight: '900' },
  smallChipText: { fontSize: 9 },
  stackHitbox: { minWidth: 38, minHeight: 38, alignItems: 'center', justifyContent: 'flex-end', zIndex: 6 },
  stackBody: { position: 'relative' },
  stackChip: { position: 'absolute', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 2, shadowOffset: { width: 1, height: 2 } },
  stackInset: { borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  stackAmount: { fontWeight: '900', fontVariant: ['tabular-nums'], textAlign: 'center' },
  stackLabel: { color: colors.line, fontWeight: '900', letterSpacing: 0.2 },
  stackTooltip: { position: 'absolute', bottom: '100%', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5, backgroundColor: '#06130f', borderWidth: 1, borderColor: colors.gold, minWidth: 54, alignItems: 'center', zIndex: 50 },
  stackTooltipText: { color: colors.ink, fontSize: 10, fontWeight: '900' },
  diceResult: { width: 106, height: 58, borderRadius: 10, borderWidth: 1, borderColor: '#3a443e', backgroundColor: '#080d0b', flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  miniDie: { width: 40, height: 40, borderRadius: 7, padding: 5, backgroundColor: '#f4efe3', flexDirection: 'row', flexWrap: 'wrap', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 3, shadowOffset: { width: 1, height: 2 } },
  miniPipCell: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  miniPip: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#171b19' },
  button: { minHeight: 40, paddingHorizontal: 15, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { backgroundColor: colors.gold },
  secondaryButton: { backgroundColor: colors.panelLight, borderWidth: 1, borderColor: '#3c6657' },
  dangerButton: { backgroundColor: colors.danger },
  ghostButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#42695a' },
  buttonText: { color: '#142018', fontWeight: '900', fontSize: 13 },
  lightButtonText: { color: colors.ink },
  disabled: { opacity: 0.38 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  field: { gap: 5, minWidth: 120, flex: 1 },
  label: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  input: { minHeight: 41, borderRadius: 8, borderWidth: 1, borderColor: '#375c4f', backgroundColor: colors.background, color: colors.ink, paddingHorizontal: 11, paddingVertical: 8 },
  multiline: { minHeight: 130, textAlignVertical: 'top', fontFamily: 'monospace' },
  sectionTitle: { color: colors.ink, fontWeight: '900', fontSize: 18, letterSpacing: 0.2 },
});

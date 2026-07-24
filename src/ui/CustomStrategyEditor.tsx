import React, { useState } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { CustomBettingStrategy, STEP_ACTIONS, StepAction, parseSequence } from '../casino/customStrategies';
import { Button, Field } from './components';

export function CustomStrategyEditor({ customs, onChange, muted, ghostStyle }: {
  customs: CustomBettingStrategy[];
  onChange: (next: CustomBettingStrategy[]) => void;
  muted: string;
  ghostStyle?: StyleProp<ViewStyle>;
}) {
  const [name, setName] = useState('');
  const [sequence, setSequence] = useState('1, 2, 3, 5');
  const [onWin, setOnWin] = useState<StepAction>('advance');
  const [onLoss, setOnLoss] = useState<StepAction>('reset');
  const [loop, setLoop] = useState(false);
  const [error, setError] = useState('');

  const add = () => {
    const parsed = parseSequence(sequence);
    if (!parsed) { setError('Ladder must be 1–32 whole-number unit sizes, e.g. 1, 2, 3, 5.'); return; }
    const trimmed = name.trim();
    if (!trimmed) { setError('Give the strategy a name.'); return; }
    setError('');
    onChange([...customs, { id: `custom-${Math.random().toString(36).slice(2, 10)}`, name: trimmed, sequence: parsed, onWin, onLoss, loop }]);
    setName('');
  };

  const actionRow = (label: string, value: StepAction, setValue: (action: StepAction) => void) => (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: muted }]}>{label}</Text>
      {STEP_ACTIONS.map((action) => (
        <Button key={action.id} label={action.label} variant={value === action.id ? 'primary' : 'ghost'} onPress={() => setValue(action.id)} style={[styles.actionButton, value !== action.id && ghostStyle]} />
      ))}
    </View>
  );

  return (
    <View style={styles.wrap}>
      {customs.map((item) => (
        <View key={item.id} style={styles.row}>
          <Text style={[styles.customName, { color: muted }]} numberOfLines={1}>
            {item.name} · {item.sequence.join('-')} · W:{item.onWin} L:{item.onLoss}{item.loop ? ' · loops' : ''}
          </Text>
          <Button label="DELETE" variant="danger" onPress={() => onChange(customs.filter((existing) => existing.id !== item.id))} style={styles.deleteButton} />
        </View>
      ))}
      <View style={styles.fields}>
        <Field label="Strategy name" value={name} onChangeText={setName} />
        <Field label="Unit ladder (comma separated)" value={sequence} onChangeText={setSequence} />
      </View>
      {actionRow('ON WIN', onWin, setOnWin)}
      {actionRow('ON LOSS', onLoss, setOnLoss)}
      <View style={styles.row}>
        <Button label={loop ? '✓ Loop ladder at the end' : 'Loop ladder: OFF'} variant={loop ? 'primary' : 'ghost'} onPress={() => setLoop((value) => !value)} style={!loop && ghostStyle} />
        <Button label="Add strategy" variant="secondary" onPress={add} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={[styles.note, { color: muted }]}>Each round moves along the ladder by the win/loss action; the bet is the current rung × table minimum, capped by max units. Push always holds. Examples: D'Alembert = ladder 1–8, win STEP BACK, loss ADVANCE. Reverse ladder = win ADVANCE with loop.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 9 },
  fields: { flexDirection: 'row', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  rowLabel: { fontWeight: '800', fontSize: 10, letterSpacing: 1.2, width: 62 },
  actionButton: { minHeight: 29, paddingHorizontal: 8 },
  customName: { flex: 1, fontSize: 12 },
  deleteButton: { minHeight: 27, paddingHorizontal: 8 },
  error: { color: '#ef6b64', fontSize: 12, fontWeight: '700' },
  note: { fontSize: 12, lineHeight: 18 },
});

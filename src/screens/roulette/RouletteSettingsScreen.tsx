import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BETTING_STRATEGIES } from '../../blackjack/betting';
import { CustomBettingStrategy, STEP_ACTIONS, loadCustomStrategies } from '../../casino/customStrategies';
import { totalStake } from '../../roulette/engine';
import { RouletteSettings, loadRouletteStrategies, saveRouletteStrategies } from '../../roulette/storage';
import { rouColors } from '../../roulette/theme';
import { MAX_STRATEGY_STEPS, SavedRouletteStrategy, WheelKind } from '../../roulette/types';
import { Button, Field, SectionTitle } from '../../ui/components';

const WHEELS: Array<{ id: WheelKind; label: string }> = [
  { id: 'european', label: 'EUROPEAN (0)' },
  { id: 'american', label: 'AMERICAN (0 + 00)' },
];

export function RouletteSettingsScreen({ settings, onSave }: { settings: RouletteSettings; onSave: (settings: RouletteSettings) => void }) {
  const [bankroll, setBankroll] = useState(String(settings.startingBankroll));
  const [minimum, setMinimum] = useState(String(settings.tableMinimum));
  const [maximum, setMaximum] = useState(String(settings.tableMaximum));
  const [wheel, setWheel] = useState<WheelKind>(settings.wheel);
  const [maxUnits, setMaxUnits] = useState(String(settings.progressionMaxUnits));
  const [strategies, setStrategies] = useState<SavedRouletteStrategy[]>([]);
  const [customs, setCustoms] = useState<CustomBettingStrategy[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadRouletteStrategies().then(setStrategies).catch(() => undefined);
    loadCustomStrategies().then(setCustoms).catch(() => undefined);
  }, []);

  useEffect(() => {
    setBankroll(String(settings.startingBankroll));
    setMinimum(String(settings.tableMinimum));
    setMaximum(String(settings.tableMaximum));
    setWheel(settings.wheel);
    setMaxUnits(String(settings.progressionMaxUnits));
  }, [settings]);

  const changeStrategies = (next: SavedRouletteStrategy[]) => {
    setStrategies(next);
    saveRouletteStrategies(next).catch(() => undefined);
  };

  const save = () => {
    const nextMinimum = Math.max(1, Number(minimum) || 5);
    onSave({
      startingBankroll: Math.max(1, Number(bankroll) || 1000),
      tableMinimum: nextMinimum,
      tableMaximum: Math.max(nextMinimum, Number(maximum) || 5000),
      wheel,
      progressionMaxUnits: Math.max(1, Math.round(Number(maxUnits) || 8)),
    });
    setMessage('Saved. Table changes apply when starting a new session.');
  };

  const progressionOptions = [...BETTING_STRATEGIES.map((item) => ({ id: item.id, name: item.name })), ...customs.map((item) => ({ id: item.id, name: item.name }))];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Roulette settings</Text>
      <View style={styles.card}>
        <SectionTitle>Table preset</SectionTitle>
        <View style={styles.fields}>
          <Field label="Starting bankroll" value={bankroll} onChangeText={setBankroll} keyboardType="numeric" />
          <Field label="Table minimum" value={minimum} onChangeText={setMinimum} keyboardType="numeric" />
          <Field label="Table maximum" value={maximum} onChangeText={setMaximum} keyboardType="numeric" />
        </View>
        <Text style={styles.label}>WHEEL</Text>
        <View style={styles.choices}>{WHEELS.map((item) => <Button key={item.id} label={item.label} variant={wheel === item.id ? 'primary' : 'ghost'} onPress={() => setWheel(item.id)} style={wheel !== item.id && styles.violetGhost} />)}</View>
        <Text style={styles.note}>European pays the same but the single zero halves the house edge (2.7% vs 5.26%). The wheel and ball are physically simulated from the session seed. COMP on the table tracks cumulative theoretical loss — what a casino would rate the play at.</Text>
        <View style={styles.fields}>
          <Field label="Max units (runner progressions)" value={maxUnits} onChangeText={setMaxUnits} keyboardType="numeric" />
        </View>
      </View>
      <View style={styles.card}>
        <SectionTitle>Saved strategies</SectionTitle>
        <Text style={styles.note}>Build a layout on the felt and save it from the table. Enabled strategies bet their layout on every spin with their own bankroll — running several at once races them against identical wheel results. A single-layout strategy can use a progression to scale its stake; a multi-step strategy (up to {MAX_STRATEGY_STEPS} layouts, added from the table) walks its own step ladder on wins and losses instead.</Text>
        {strategies.length === 0 ? <Text style={styles.note}>Nothing saved yet.</Text> : strategies.map((strategy) => {
          const multiStep = strategy.steps.length > 1;
          const updateStrategy = (patch: Partial<SavedRouletteStrategy>) =>
            changeStrategies(strategies.map((item) => item.id === strategy.id ? { ...item, ...patch } : item));
          const removeStep = (index: number) => {
            const steps = strategy.steps.filter((_, i) => i !== index);
            if (steps.length === 0) return;
            updateStrategy({ steps, bets: steps[0] });
          };
          return (
          <View key={strategy.id} style={styles.strategyBlock}>
            <View style={styles.strategyHeader}>
              <Text style={styles.strategyName}>{strategy.name} · {multiStep ? `${strategy.steps.length}/${MAX_STRATEGY_STEPS} steps` : `$${totalStake(strategy.bets)}/spin · ${Object.keys(strategy.bets).length} spots`}</Text>
              <View style={styles.strategyButtons}>
                <Button label={strategy.enabled ? '✓ RUNNING' : 'OFF'} variant={strategy.enabled ? 'primary' : 'ghost'} onPress={() => updateStrategy({ enabled: !strategy.enabled })} style={[styles.smallButton, !strategy.enabled && styles.violetGhost]} />
                <Button label="DELETE" variant="danger" onPress={() => changeStrategies(strategies.filter((item) => item.id !== strategy.id))} style={styles.smallButton} />
              </View>
            </View>
            {multiStep ? (
              <>
                <Text style={styles.label}>STEP LADDER · build steps on the felt (SAVE, then “add as next step”)</Text>
                <View style={styles.choicesWrap}>
                  {strategy.steps.map((step, index) => (
                    <Button key={index} label={`S${index + 1} · $${totalStake(step)}${strategy.steps.length > 1 ? '  ✕' : ''}`} variant="ghost" onPress={() => removeStep(index)} style={[styles.smallButton, styles.violetGhost]} />
                  ))}
                </View>
                <View style={styles.actionRow}>
                  <Text style={styles.label}>ON WIN</Text>
                  {STEP_ACTIONS.map((action) => <Button key={action.id} label={action.label} variant={strategy.onWin === action.id ? 'primary' : 'ghost'} onPress={() => updateStrategy({ onWin: action.id })} style={[styles.smallButton, strategy.onWin !== action.id && styles.violetGhost]} />)}
                </View>
                <View style={styles.actionRow}>
                  <Text style={styles.label}>ON LOSS</Text>
                  {STEP_ACTIONS.map((action) => <Button key={action.id} label={action.label} variant={strategy.onLoss === action.id ? 'primary' : 'ghost'} onPress={() => updateStrategy({ onLoss: action.id })} style={[styles.smallButton, strategy.onLoss !== action.id && styles.violetGhost]} />)}
                  <Button label={strategy.loop ? '✓ LOOP' : 'LOOP OFF'} variant={strategy.loop ? 'primary' : 'ghost'} onPress={() => updateStrategy({ loop: !strategy.loop })} style={[styles.smallButton, !strategy.loop && styles.violetGhost]} />
                </View>
                <Text style={styles.note}>Tap a step to remove it. Pushes hold in place; without LOOP an advance past the last step stays on it.</Text>
              </>
            ) : (
              <>
                <Text style={styles.label}>PROGRESSION</Text>
                <View style={styles.choicesWrap}>
                  {progressionOptions.map((option) => (
                    <Button key={option.id} label={option.name.toUpperCase()} variant={strategy.progression === option.id ? 'primary' : 'ghost'} onPress={() => updateStrategy({ progression: option.id })} style={[styles.smallButton, strategy.progression !== option.id && styles.violetGhost]} />
                  ))}
                </View>
              </>
            )}
          </View>
          );
        })}
      </View>
      <Button label="Save settings" onPress={save} style={styles.save} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Text style={styles.note}>Educational simulator only. No real-money wagering, deposits, or payouts.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: rouColors.background },
  content: { padding: 28, gap: 16, maxWidth: 900, width: '100%', alignSelf: 'center' },
  title: { color: rouColors.ink, fontSize: 29, fontWeight: '900' },
  card: { backgroundColor: rouColors.panel, padding: 17, borderRadius: 12, borderWidth: 1, borderColor: rouColors.border, gap: 13 },
  fields: { flexDirection: 'row', gap: 12 },
  choices: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  choicesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  label: { color: rouColors.muted, fontWeight: '800', fontSize: 10, letterSpacing: 1.2 },
  violetGhost: { borderColor: rouColors.borderLight },
  strategyBlock: { gap: 8, padding: 10, borderRadius: 10, backgroundColor: rouColors.background, borderWidth: 1, borderColor: '#2c1a45' },
  strategyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  strategyName: { color: rouColors.ink, fontWeight: '800', fontSize: 12, flexShrink: 1 },
  strategyButtons: { flexDirection: 'row', gap: 6 },
  smallButton: { minHeight: 27, paddingHorizontal: 8 },
  note: { color: rouColors.muted, lineHeight: 20, fontSize: 12 },
  save: { alignSelf: 'flex-start', minWidth: 180 },
  message: { color: rouColors.success, fontWeight: '800' },
});

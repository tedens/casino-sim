import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BaccaratSettings } from '../../baccarat/storage';
import { bacColors } from '../../baccarat/theme';
import { BaccaratBetKind } from '../../baccarat/types';
import { BETTING_STRATEGIES } from '../../blackjack/betting';
import { CustomBettingStrategy, loadCustomStrategies, saveCustomStrategies } from '../../casino/customStrategies';
import { CustomStrategyEditor } from '../../ui/CustomStrategyEditor';
import { Button, Field, SectionTitle } from '../../ui/components';

const DECK_CHOICES = [6, 8];
const SIDES: Array<{ id: BaccaratBetKind; label: string }> = [
  { id: 'player', label: 'PLAYER' },
  { id: 'banker', label: 'BANKER' },
  { id: 'tie', label: 'TIE' },
];

function Toggle({ label, value, onToggle, note }: { label: string; value: boolean; onToggle: () => void; note?: string }) {
  return (
    <View style={styles.toggle}>
      <Button label={value ? `✓ ${label}` : `${label}: OFF`} variant={value ? 'primary' : 'ghost'} onPress={onToggle} style={!value && styles.wineGhost} />
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

export function BaccaratSettingsScreen({ settings, onSave }: { settings: BaccaratSettings; onSave: (settings: BaccaratSettings) => void }) {
  const [bankroll, setBankroll] = useState(String(settings.startingBankroll));
  const [minimum, setMinimum] = useState(String(settings.tableMinimum));
  const [maximum, setMaximum] = useState(String(settings.tableMaximum));
  const [decks, setDecks] = useState(settings.decks);
  const [progression, setProgression] = useState(settings.progressionEnabled);
  const [maxUnits, setMaxUnits] = useState(String(settings.progressionMaxUnits));
  const [bettingStrategy, setBettingStrategy] = useState<string>(settings.bettingStrategy);
  const [customs, setCustoms] = useState<CustomBettingStrategy[]>([]);
  const [betSide, setBetSide] = useState<BaccaratBetKind>(settings.betSide);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadCustomStrategies().then(setCustoms).catch(() => undefined);
  }, []);

  const changeCustoms = (next: CustomBettingStrategy[]) => {
    setCustoms(next);
    saveCustomStrategies(next).catch(() => undefined);
    if (!next.some((item) => item.id === bettingStrategy) && bettingStrategy.startsWith('custom-')) setBettingStrategy('winPress');
  };

  useEffect(() => {
    setBankroll(String(settings.startingBankroll));
    setMinimum(String(settings.tableMinimum));
    setMaximum(String(settings.tableMaximum));
    setDecks(settings.decks);
    setProgression(settings.progressionEnabled);
    setMaxUnits(String(settings.progressionMaxUnits));
    setBettingStrategy(settings.bettingStrategy);
    setBetSide(settings.betSide);
  }, [settings]);

  const save = () => {
    const nextMinimum = Math.max(1, Number(minimum) || 5);
    onSave({
      startingBankroll: Math.max(1, Number(bankroll) || 1000),
      tableMinimum: nextMinimum,
      tableMaximum: Math.max(nextMinimum, Number(maximum) || 5000),
      decks,
      progressionEnabled: progression,
      progressionMaxUnits: Math.max(1, Math.round(Number(maxUnits) || 8)),
      bettingStrategy,
      betSide,
    });
    setMessage('Saved. Table changes apply when starting a new session.');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Baccarat settings</Text>
      <View style={styles.card}>
        <SectionTitle>Table preset</SectionTitle>
        <View style={styles.fields}>
          <Field label="Starting bankroll" value={bankroll} onChangeText={setBankroll} keyboardType="numeric" />
          <Field label="Table minimum" value={minimum} onChangeText={setMinimum} keyboardType="numeric" />
          <Field label="Table maximum" value={maximum} onChangeText={setMaximum} keyboardType="numeric" />
        </View>
        <Text style={styles.label}>DECKS IN SHOE</Text>
        <View style={styles.choices}>{DECK_CHOICES.map((count) => <Button key={count} label={String(count)} variant={decks === count ? 'primary' : 'ghost'} onPress={() => setDecks(count)} style={decks !== count && styles.wineGhost} />)}</View>
        <Text style={styles.note}>Punto banco pays banker 19:20 (5% commission), tie 8:1, pairs 11:1. The tableau is fixed — there are no play decisions, which makes this the cleanest lab for testing betting strategies.</Text>
      </View>
      <View style={styles.card}>
        <SectionTitle>Betting strategy</SectionTitle>
        <Toggle label="Auto bet sizing" value={progression} onToggle={() => setProgression((value) => !value)} note="1 unit = table minimum. The deal button auto-sizes the next bet from the selected strategy; stacking chips manually overrides it for that coup." />
        <Text style={styles.label}>STRATEGY</Text>
        <View style={styles.choicesWrap}>{[...BETTING_STRATEGIES, ...customs].map((item) => <Button key={item.id} label={item.name.toUpperCase()} variant={bettingStrategy === item.id ? 'primary' : 'ghost'} onPress={() => setBettingStrategy(item.id)} style={bettingStrategy !== item.id && styles.wineGhost} />)}</View>
        <Text style={styles.note}>{BETTING_STRATEGIES.find((item) => item.id === bettingStrategy)?.description ?? 'Custom strategy — see its ladder below.'} Push always holds the bet.</Text>
        <Text style={styles.label}>CUSTOM STRATEGIES</Text>
        <CustomStrategyEditor customs={customs} onChange={changeCustoms} muted={bacColors.muted} ghostStyle={styles.wineGhost} />
        <Text style={styles.label}>AUTO BET SIDE</Text>
        <View style={styles.choices}>{SIDES.map((side) => <Button key={side.id} label={side.label} variant={betSide === side.id ? 'primary' : 'ghost'} onPress={() => setBetSide(side.id)} style={betSide !== side.id && styles.wineGhost} />)}</View>
        <View style={styles.fields}>
          <Field label="Max units" value={maxUnits} onChangeText={setMaxUnits} keyboardType="numeric" />
        </View>
      </View>
      <Button label="Save settings" onPress={save} style={styles.save} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Text style={styles.note}>Educational simulator only. No real-money wagering, deposits, or payouts.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: bacColors.background },
  content: { padding: 28, gap: 16, maxWidth: 900, width: '100%', alignSelf: 'center' },
  title: { color: bacColors.ink, fontSize: 29, fontWeight: '900' },
  card: { backgroundColor: bacColors.panel, padding: 17, borderRadius: 12, borderWidth: 1, borderColor: bacColors.border, gap: 13 },
  fields: { flexDirection: 'row', gap: 12 },
  choices: { flexDirection: 'row', gap: 8 },
  choicesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  label: { color: bacColors.muted, fontWeight: '800', fontSize: 10, letterSpacing: 1.2 },
  toggle: { gap: 6, alignItems: 'flex-start' },
  wineGhost: { borderColor: bacColors.borderLight },
  note: { color: bacColors.muted, lineHeight: 20, fontSize: 12 },
  save: { alignSelf: 'flex-start', minWidth: 180 },
  message: { color: bacColors.success, fontWeight: '800' },
});

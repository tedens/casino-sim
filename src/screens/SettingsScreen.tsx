import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppSettings } from '../storage/storage';
import { Button, Field, SectionTitle } from '../ui/components';
import { colors } from '../ui/theme';

export function SettingsScreen({ settings, onSave }: { settings: AppSettings; onSave: (settings: AppSettings) => void }) {
  const [bankroll, setBankroll] = useState(String(settings.startingBankroll));
  const [minimum, setMinimum] = useState(String(settings.tableMinimum));
  const [maximum, setMaximum] = useState(String(settings.tableMaximum));
  const [speed, setSpeed] = useState(settings.animationSpeed);
  const [showWinnings, setShowWinnings] = useState(settings.showWinnings);
  const [keepBetsUp, setKeepBetsUp] = useState(settings.keepBetsUp);
  const [message, setMessage] = useState('');

  useEffect(() => { setBankroll(String(settings.startingBankroll)); setMinimum(String(settings.tableMinimum)); setMaximum(String(settings.tableMaximum)); setSpeed(settings.animationSpeed); setShowWinnings(settings.showWinnings); setKeepBetsUp(settings.keepBetsUp); }, [settings]);

  const save = () => {
    const next: AppSettings = {
      startingBankroll: Math.max(1, Number(bankroll) || 5000),
      tableMinimum: Math.max(1, Number(minimum) || 5),
      tableMaximum: Math.max(Number(minimum) || 5, Number(maximum) || 5000),
      animationSpeed: speed,
      showWinnings,
      selectedChip: settings.selectedChip,
      keepBetsUp,
    };
    onSave(next);
    setMessage('Saved. New table settings apply when starting a new session.');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>
      <View style={styles.card}>
        <SectionTitle>Table preset</SectionTitle>
        <View style={styles.fields}><Field label="Starting bankroll" value={bankroll} onChangeText={setBankroll} keyboardType="numeric" /><Field label="Table minimum" value={minimum} onChangeText={setMinimum} keyboardType="numeric" /><Field label="Table maximum" value={maximum} onChangeText={setMaximum} keyboardType="numeric" /></View>
        <Button label={keepBetsUp ? '✓ Winning bets stay up' : 'Winning bets stay up: OFF'} variant={keepBetsUp ? 'primary' : 'ghost'} onPress={() => setKeepBetsUp((value) => !value)} />
        <Text style={styles.note}>When on, winning Field, Come (on its number), and prop bets collect their winnings and stay locked in for the next roll instead of coming down. Take a bet down any time from the Active Wagers panel — repeat mode also unlocks Come contracts. Applies to new sessions.</Text>
      </View>
      <View style={styles.card}>
        <SectionTitle>Dice animation</SectionTitle>
        <View style={styles.choices}>{(['slow', 'normal', 'fast'] as const).map((item) => <Button key={item} label={item.toUpperCase()} variant={speed === item ? 'primary' : 'ghost'} onPress={() => setSpeed(item)} />)}</View>
        <Text style={styles.note}>Animation uses a separate random stream. Speed and visual motion never alter dice outcomes.</Text>
        <Button label={showWinnings ? '✓ Show manual winnings' : 'Show manual winnings: OFF'} variant={showWinnings ? 'primary' : 'ghost'} onPress={() => setShowWinnings((value) => !value)} />
        <Text style={styles.note}>Winning amounts count up briefly in gold during manual play. Strategy Watch never shows the flash.</Text>
      </View>
      <Button label="Save settings" onPress={save} style={styles.save} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Text style={styles.note}>Data stays on this device/browser through AsyncStorage. Strategies can be copied as JSON. Recent batch runs retain the latest 20 reports.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 28, gap: 16, maxWidth: 900, width: '100%', alignSelf: 'center' },
  title: { color: colors.ink, fontSize: 29, fontWeight: '900' },
  card: { backgroundColor: colors.panel, padding: 17, borderRadius: 12, borderWidth: 1, borderColor: '#315247', gap: 13 },
  fields: { flexDirection: 'row', gap: 12 },
  choices: { flexDirection: 'row', gap: 8 },
  note: { color: colors.muted, lineHeight: 20 },
  save: { alignSelf: 'flex-start', minWidth: 180 },
  message: { color: colors.success, fontWeight: '800' },
});

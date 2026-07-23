import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BETTING_STRATEGIES, BettingStrategyId } from '../../blackjack/betting';
import { BlackjackSettings } from '../../blackjack/storage';
import { bjColors } from '../../blackjack/theme';
import { Button, Field, SectionTitle } from '../../ui/components';

const DECK_CHOICES = [1, 2, 4, 6, 8];
const AI_CHOICES = [0, 1, 2, 3, 4, 5];

function Toggle({ label, value, onToggle, note }: { label: string; value: boolean; onToggle: () => void; note?: string }) {
  return (
    <View style={styles.toggle}>
      <Button label={value ? `✓ ${label}` : `${label}: OFF`} variant={value ? 'primary' : 'ghost'} onPress={onToggle} style={!value && styles.blueGhost} />
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

export function BlackjackSettingsScreen({ settings, onSave }: { settings: BlackjackSettings; onSave: (settings: BlackjackSettings) => void }) {
  const [bankroll, setBankroll] = useState(String(settings.startingBankroll));
  const [minimum, setMinimum] = useState(String(settings.tableMinimum));
  const [maximum, setMaximum] = useState(String(settings.tableMaximum));
  const [decks, setDecks] = useState(settings.decks);
  const [hitSoft17, setHitSoft17] = useState(settings.dealerHitsSoft17);
  const [payout, setPayout] = useState<1.5 | 1.2>(settings.blackjackPayout);
  const [surrender, setSurrender] = useState(settings.surrenderAllowed);
  const [das, setDas] = useState(settings.doubleAfterSplit);
  const [showHints, setShowHints] = useState(settings.showHints);
  const [progression, setProgression] = useState(settings.progressionEnabled);
  const [maxUnits, setMaxUnits] = useState(String(settings.progressionMaxUnits));
  const [bettingStrategy, setBettingStrategy] = useState<BettingStrategyId>(settings.bettingStrategy);
  const [aiPlayers, setAiPlayers] = useState(settings.aiPlayers);
  const [insureTwenty, setInsureTwenty] = useState(settings.insureTwentyVsAce);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setBankroll(String(settings.startingBankroll));
    setMinimum(String(settings.tableMinimum));
    setMaximum(String(settings.tableMaximum));
    setDecks(settings.decks);
    setHitSoft17(settings.dealerHitsSoft17);
    setPayout(settings.blackjackPayout);
    setSurrender(settings.surrenderAllowed);
    setDas(settings.doubleAfterSplit);
    setShowHints(settings.showHints);
    setProgression(settings.progressionEnabled);
    setMaxUnits(String(settings.progressionMaxUnits));
    setBettingStrategy(settings.bettingStrategy);
    setAiPlayers(settings.aiPlayers);
    setInsureTwenty(settings.insureTwentyVsAce);
  }, [settings]);

  const save = () => {
    const nextMinimum = Math.max(1, Number(minimum) || 5);
    onSave({
      startingBankroll: Math.max(1, Number(bankroll) || 1000),
      tableMinimum: nextMinimum,
      tableMaximum: Math.max(nextMinimum, Number(maximum) || 5000),
      decks,
      dealerHitsSoft17: hitSoft17,
      blackjackPayout: payout,
      surrenderAllowed: surrender,
      doubleAfterSplit: das,
      showHints,
      progressionEnabled: progression,
      progressionMaxUnits: Math.max(1, Math.round(Number(maxUnits) || 8)),
      bettingStrategy,
      aiPlayers,
      insureTwentyVsAce: insureTwenty,
    });
    setMessage('Saved. Rule changes apply when starting a new session.');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Blackjack settings</Text>
      <View style={styles.card}>
        <SectionTitle>Table preset</SectionTitle>
        <View style={styles.fields}>
          <Field label="Starting bankroll" value={bankroll} onChangeText={setBankroll} keyboardType="numeric" />
          <Field label="Table minimum" value={minimum} onChangeText={setMinimum} keyboardType="numeric" />
          <Field label="Table maximum" value={maximum} onChangeText={setMaximum} keyboardType="numeric" />
        </View>
      </View>
      <View style={styles.card}>
        <SectionTitle>House rules</SectionTitle>
        <Text style={styles.label}>DECKS IN SHOE</Text>
        <View style={styles.choices}>{DECK_CHOICES.map((count) => <Button key={count} label={String(count)} variant={decks === count ? 'primary' : 'ghost'} onPress={() => setDecks(count)} style={decks !== count && styles.blueGhost} />)}</View>
        <Text style={styles.label}>BLACKJACK PAYOUT</Text>
        <View style={styles.choices}>
          <Button label="3 : 2" variant={payout === 1.5 ? 'primary' : 'ghost'} onPress={() => setPayout(1.5)} style={payout !== 1.5 && styles.blueGhost} />
          <Button label="6 : 5" variant={payout === 1.2 ? 'primary' : 'ghost'} onPress={() => setPayout(1.2)} style={payout !== 1.2 && styles.blueGhost} />
        </View>
        <Text style={styles.label}>OTHER PLAYERS</Text>
        <View style={styles.choices}>{AI_CHOICES.map((count) => <Button key={count} label={count === 0 ? 'NONE' : String(count)} variant={aiPlayers === count ? 'primary' : 'ghost'} onPress={() => setAiPlayers(count)} style={aiPlayers !== count && styles.blueGhost} />)}</View>
        <Text style={styles.note}>AI seats play the same basic-strategy book from the same shoe and act before you — you sit at third base. Their cards and results show on the felt; they don’t touch your bankroll. Table seats 6 max including you.</Text>
        <Toggle label="Surrender available" value={surrender} onToggle={() => setSurrender((value) => !value)} note="Late surrender: give up half the bet on your first two cards, after the dealer checks for blackjack. Hints and the strategy chart adjust automatically." />
        <Toggle label="Dealer hits soft 17" value={hitSoft17} onToggle={() => setHitSoft17((value) => !value)} note="H17 raises the house edge slightly and changes several book plays." />
        <Toggle label="Double after split" value={das} onToggle={() => setDas((value) => !value)} note="Allows doubling on hands created by a split. Affects which pairs the book splits." />
        <Toggle label="Insure 20 vs ace (pays 3:2)" value={insureTwenty} onToggle={() => setInsureTwenty((value) => !value)} note="When the dealer shows an ace and your first two cards total 20, half your bet automatically goes on insurance. It settles at the peek: dealer blackjack pays 3:2 on the stake, otherwise the stake is lost and the hand plays on. Note: real casinos pay insurance 2:1 — this table pays 3:2 as configured. Applies on the next new session." />
      </View>
      <View style={styles.card}>
        <SectionTitle>Betting strategy</SectionTitle>
        <Toggle label="Auto bet sizing" value={progression} onToggle={() => setProgression((value) => !value)} note="1 unit = table minimum. The deal button auto-sizes the next bet from the selected strategy; stacking chips manually overrides it for that round. Also toggleable from the table." />
        <Text style={styles.label}>STRATEGY</Text>
        <View style={styles.choicesWrap}>{BETTING_STRATEGIES.map((item) => <Button key={item.id} label={item.name.toUpperCase()} variant={bettingStrategy === item.id ? 'primary' : 'ghost'} onPress={() => setBettingStrategy(item.id)} style={bettingStrategy !== item.id && styles.blueGhost} />)}</View>
        <Text style={styles.note}>{BETTING_STRATEGIES.find((item) => item.id === bettingStrategy)?.description} Push always holds the bet.</Text>
        <View style={styles.fields}>
          <Field label="Max units" value={maxUnits} onChangeText={setMaxUnits} keyboardType="numeric" />
        </View>
      </View>
      <View style={styles.card}>
        <SectionTitle>Coaching</SectionTitle>
        <Toggle label="Show hints" value={showHints} onToggle={() => setShowHints((value) => !value)} note="Displays the basic-strategy book play on the felt and highlights the matching action button. Also toggleable from the table top bar." />
      </View>
      <Button label="Save settings" onPress={save} style={styles.save} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Text style={styles.note}>Educational simulator only. No real-money wagering, deposits, or payouts.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: bjColors.background },
  content: { padding: 28, gap: 16, maxWidth: 900, width: '100%', alignSelf: 'center' },
  title: { color: bjColors.ink, fontSize: 29, fontWeight: '900' },
  card: { backgroundColor: bjColors.panel, padding: 17, borderRadius: 12, borderWidth: 1, borderColor: bjColors.border, gap: 13 },
  fields: { flexDirection: 'row', gap: 12 },
  choices: { flexDirection: 'row', gap: 8 },
  choicesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  label: { color: bjColors.muted, fontWeight: '800', fontSize: 10, letterSpacing: 1.2 },
  toggle: { gap: 6, alignItems: 'flex-start' },
  blueGhost: { borderColor: bjColors.borderLight },
  note: { color: bjColors.muted, lineHeight: 20, fontSize: 12 },
  save: { alignSelf: 'flex-start', minWidth: 180 },
  message: { color: bjColors.success, fontWeight: '800' },
});

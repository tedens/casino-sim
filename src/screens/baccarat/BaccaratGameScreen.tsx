import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BET_KINDS, baccaratTotal, betLabel, createBaccaratState, playRound, sessionProfit } from '../../baccarat/engine';
import { BaccaratSettings } from '../../baccarat/storage';
import { bacColors } from '../../baccarat/theme';
import { BaccaratBetKind, BaccaratOutcome, BaccaratState } from '../../baccarat/types';
import { progressionBet, resolveStrategy } from '../../blackjack/betting';
import { CustomBettingStrategy, loadCustomStrategies } from '../../casino/customStrategies';
import { Card } from '../../blackjack/types';
import { createManualSeed } from '../../domain/rng';
import { Button, Chip, ChipStack, Money, formatMoney } from '../../ui/components';
import { ChartPalette, ProfitChart } from '../../ui/ProfitChart';
import { DealtCard } from '../../ui/DealtCard';

const CHIP_VALUES = [1, 5, 25, 100, 500];
const WATCH_SPEEDS = [250, 750, 1500, 3000];
const MAIN_SIDES: BaccaratBetKind[] = ['player', 'banker', 'tie'];

const CHART_PALETTE: ChartPalette = {
  background: bacColors.background,
  border: '#3d1822',
  accent: bacColors.gold,
  ink: bacColors.ink,
  muted: bacColors.muted,
  success: bacColors.success,
  danger: bacColors.danger,
};

const OUTCOME_COLORS: Record<BaccaratOutcome, string> = {
  player: bacColors.playerBlue,
  banker: bacColors.bankerRed,
  tie: bacColors.tieGreen,
};

const ZONE_META: Record<BaccaratBetKind, { title: string; pays: string }> = {
  playerPair: { title: 'P PAIR', pays: '11:1' },
  player: { title: 'PLAYER', pays: '1:1' },
  tie: { title: 'TIE', pays: '8:1' },
  banker: { title: 'BANKER', pays: '19:20' },
  bankerPair: { title: 'B PAIR', pays: '11:1' },
};

function CardFace({ card }: { card: Card }) {
  const red = card.suit === '♥' || card.suit === '♦';
  const color = red ? bacColors.cardRed : bacColors.cardBlack;
  return (
    <View style={styles.card}>
      <Text style={[styles.cardRank, { color }]}>{card.rank}</Text>
      <Text style={[styles.cardSuit, { color }]}>{card.suit}</Text>
    </View>
  );
}

function BeadRoad({ road, shoeNumber }: { road: BaccaratOutcome[]; shoeNumber: number }) {
  if (road.length === 0) return null;
  const columns: BaccaratOutcome[][] = [];
  for (let i = 0; i < road.length; i += 6) columns.push(road.slice(i, i + 6));
  const tally = road.reduce((counts, outcome) => ({ ...counts, [outcome]: (counts[outcome] ?? 0) + 1 }), {} as Partial<Record<BaccaratOutcome, number>>);
  return (
    <View style={styles.beadWrap}>
      <Text style={styles.beadTitle}>SHOE #{shoeNumber} BEAD ROAD · P {tally.player ?? 0} · B {tally.banker ?? 0} · T {tally.tie ?? 0}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.beadGrid}>
          {columns.map((column, c) => (
            <View key={c} style={styles.beadColumn}>
              {column.map((outcome, r) => (
                <View key={r} style={[styles.bead, { backgroundColor: OUTCOME_COLORS[outcome] }]}>
                  <Text style={styles.beadText}>{outcome === 'player' ? 'P' : outcome === 'banker' ? 'B' : 'T'}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export function BaccaratGameScreen({ settings, onChangeSettings }: {
  settings: BaccaratSettings;
  onChangeSettings: (settings: BaccaratSettings) => void;
}) {
  const makeState = () => createBaccaratState({
    seed: createManualSeed(),
    startingBankroll: settings.startingBankroll,
    rules: { decks: settings.decks, tableMinimum: settings.tableMinimum, tableMaximum: settings.tableMaximum },
  });
  const [game, setGame] = useState<BaccaratState>(makeState);
  const [pendingBets, setPendingBets] = useState<Partial<Record<BaccaratBetKind, number>>>({});
  const [chip, setChip] = useState(5);
  const [step, setStep] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [watching, setWatching] = useState(false);
  const [watchDelay, setWatchDelay] = useState(750);
  const [message, setMessage] = useState('Stack chips on a spot, then deal.');
  // the auto-play timer chain reads refs; plain state would go stale in the closures
  const watchingRef = useRef(false);
  const watchDelayRef = useRef(750);
  const watchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stepRef = useRef(0);
  const [customs, setCustoms] = useState<CustomBettingStrategy[]>([]);
  const customsRef = useRef<CustomBettingStrategy[]>([]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    loadCustomStrategies().then((loaded) => { customsRef.current = loaded; setCustoms(loaded); }).catch(() => undefined);
  }, []);

  const applyStep = (value: number) => {
    stepRef.current = value;
    setStep(value);
  };

  useEffect(() => () => {
    if (watchTimer.current) clearTimeout(watchTimer.current);
  }, []);

  // step counter means different things per strategy, so restart on change
  useEffect(() => {
    applyStep(0);
  }, [settings.bettingStrategy]);

  const strategy = resolveStrategy(settings.bettingStrategy, customs);
  const units = strategy.unitsForStep(step, settings.progressionMaxUnits);
  const autoBet = settings.progressionEnabled ? progressionBet(units, game.rules, game.bankroll) : 0;
  const pendingTotal = Object.values(pendingBets).reduce((sum, amount) => sum + (amount ?? 0), 0);
  const profit = sessionProfit(game);

  // advance the betting strategy on settle and return a note for the message line
  const settleProgression = (state: BaccaratState): string => {
    const current = settingsRef.current;
    if (!current.progressionEnabled) return '';
    const roundProfit = state.history[state.history.length - 1]?.profit ?? 0;
    const resolved = resolveStrategy(current.bettingStrategy, customsRef.current);
    const next = resolved.nextStep(stepRef.current, roundProfit);
    applyStep(next);
    const nextUnits = resolved.unitsForStep(next, current.progressionMaxUnits);
    const nextBet = progressionBet(nextUnits, state.rules, state.bankroll);
    if (roundProfit === 0) return `Push — next bet unchanged ($${nextBet}).`;
    return `${roundProfit > 0 ? 'Win' : 'Loss'} — next bet $${nextBet} (${nextUnits}u).`;
  };

  const reset = () => {
    watchingRef.current = false;
    setWatching(false);
    if (watchTimer.current) clearTimeout(watchTimer.current);
    setGame(makeState());
    setPendingBets({});
    applyStep(0);
    setMessage('New shoe ready. Stack chips on a spot, then deal.');
  };

  const addChip = (kind: BaccaratBetKind) => {
    if (watchingRef.current) return;
    setPendingBets((bets) => ({ ...bets, [kind]: Math.min((bets[kind] ?? 0) + chip, game.rules.tableMaximum) }));
  };

  const dealBets = (): Partial<Record<BaccaratBetKind, number>> => {
    if (pendingTotal > 0) return pendingBets;
    if (settings.progressionEnabled && autoBet >= game.rules.tableMinimum) return { [settings.betSide]: autoBet };
    return game.lastBets;
  };

  const deal = () => {
    if (watchingRef.current) return;
    const bets = dealBets();
    const result = playRound(game, bets);
    if (result.error) { setMessage(result.error); return; }
    setGame(result.state);
    setPendingBets({});
    const note = settleProgression(result.state);
    setMessage([...result.state.events.slice(-3), note].filter(Boolean).join(' · '));
  };

  const stopWatching = (text = 'Auto-play stopped.') => {
    watchingRef.current = false;
    setWatching(false);
    if (watchTimer.current) clearTimeout(watchTimer.current);
    setMessage(text);
  };

  // one auto-play tick: bet the strategy amount on the chosen side and deal the coup
  const autoStep = (state: BaccaratState) => {
    if (!watchingRef.current) return;
    const current = settingsRef.current;
    const amount = current.progressionEnabled
      ? progressionBet(resolveStrategy(current.bettingStrategy, customsRef.current).unitsForStep(stepRef.current, current.progressionMaxUnits), state.rules, state.bankroll)
      : Math.min(Object.values(state.lastBets).reduce((sum, value) => sum + (value ?? 0), 0) || state.rules.tableMinimum, state.bankroll);
    if (amount < state.rules.tableMinimum) { stopWatching('Auto-play stopped: bankroll below table minimum.'); return; }
    const result = playRound(state, { [current.betSide]: amount });
    if (result.error) { stopWatching(`Auto-play stopped: ${result.error}`); return; }
    setGame(result.state);
    const note = settleProgression(result.state);
    setMessage([`Auto: ${betLabel(current.betSide)} $${amount}`, ...result.state.events.slice(-2), note].filter(Boolean).join(' · '));
    watchTimer.current = setTimeout(() => autoStep(result.state), watchDelayRef.current);
  };

  const startWatching = () => {
    watchingRef.current = true;
    setWatching(true);
    setPendingBets({});
    setMessage('Auto-playing.');
    autoStep(game);
  };

  const chooseSide = (side: BaccaratBetKind) => {
    if (watchingRef.current) return;
    onChangeSettings({ ...settings, betSide: side });
  };

  const toggleProgression = () => {
    if (watchingRef.current) return;
    applyStep(0);
    onChangeSettings({ ...settings, progressionEnabled: !settings.progressionEnabled });
  };

  const dealDisabled = watching || (pendingTotal === 0 && autoBet < game.rules.tableMinimum && Object.keys(game.lastBets).length === 0);
  const dealPreview = pendingTotal > 0 ? pendingTotal : settings.progressionEnabled && autoBet >= game.rules.tableMinimum ? autoBet : Object.values(game.lastBets).reduce((sum, value) => sum + (value ?? 0), 0);
  const rulesLine = `BANKER PAYS 19:20 · TIE PAYS ${game.rules.tiePayout}:1 · PAIRS PAY ${game.rules.pairPayout}:1 · ${game.rules.decks} DECKS`;
  const recentRounds = game.history.slice(-10).reverse();
  const showHands = game.playerCards.length > 0 && pendingTotal === 0;

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <View><Text style={styles.eyebrow}>BANKROLL</Text><Money value={game.bankroll} style={styles.bigMoney} /></View>
        <View><Text style={styles.eyebrow}>ON TABLE</Text><Money value={pendingTotal} /></View>
        <View><Text style={styles.eyebrow}>SESSION</Text><Money value={profit} signed style={{ color: profit >= 0 ? bacColors.success : bacColors.danger }} /></View>
        <View><Text style={styles.eyebrow}>SHOE #{game.shoeNumber}</Text><Text style={styles.shoeCount}>{game.shoe.length} cards</Text></View>
        <View style={styles.topbarSpace} />
        <Button label={showPanel ? '✓ HISTORY' : 'HISTORY'} variant={showPanel ? 'secondary' : 'ghost'} onPress={() => setShowPanel((value) => !value)} style={showPanel ? styles.wineSecondary : styles.wineGhost} />
        <Button label="New session" variant="secondary" onPress={reset} style={styles.wineSecondary} />
      </View>

      <View style={styles.body}>
        <View style={styles.tableColumn}>
          <View style={styles.tableRail}>
            <View style={styles.felt}>
              <Text style={styles.rulesArc}>{rulesLine}</Text>
              <View style={styles.handsRow}>
                <View style={styles.handBox}>
                  <Text style={[styles.handLabel, { color: bacColors.playerBlue }]}>PLAYER{showHands ? ` · ${baccaratTotal(game.playerCards)}` : ''}</Text>
                  <View style={styles.handCards}>
                    {showHands
                      ? game.playerCards.map((item, index) => <DealtCard key={index} index={index} style={[styles.cardSlot, { marginLeft: index === 0 ? 0 : -26 }]}><CardFace card={item} /></DealtCard>)
                      : <Text style={styles.placeholder}>—</Text>}
                  </View>
                  {showHands && game.outcome === 'player' ? <Text style={[styles.winBadge, { color: bacColors.playerBlue, borderColor: bacColors.playerBlue }]}>WINS</Text> : null}
                </View>
                <Text style={styles.versus}>VS</Text>
                <View style={styles.handBox}>
                  <Text style={[styles.handLabel, { color: bacColors.bankerRed }]}>BANKER{showHands ? ` · ${baccaratTotal(game.bankerCards)}` : ''}</Text>
                  <View style={styles.handCards}>
                    {showHands
                      ? game.bankerCards.map((item, index) => <DealtCard key={index} index={index + 1} style={[styles.cardSlot, { marginLeft: index === 0 ? 0 : -26 }]}><CardFace card={item} /></DealtCard>)
                      : <Text style={styles.placeholder}>—</Text>}
                  </View>
                  {showHands && game.outcome === 'banker' ? <Text style={[styles.winBadge, { color: bacColors.bankerRed, borderColor: bacColors.bankerRed }]}>WINS</Text> : null}
                </View>
              </View>
              {showHands && game.outcome === 'tie' ? <Text style={[styles.tieBadge, { color: bacColors.tieGreen, borderColor: bacColors.tieGreen }]}>TIE</Text> : null}

              <View style={styles.zoneRow}>
                {BET_KINDS.map((kind) => {
                  const main = MAIN_SIDES.includes(kind);
                  const accent = kind === 'player' || kind === 'playerPair' ? bacColors.playerBlue : kind === 'tie' ? bacColors.tieGreen : bacColors.bankerRed;
                  return (
                    <Pressable key={kind} onPress={() => addChip(kind)} style={({ pressed }) => [styles.zone, main && styles.mainZone, { borderColor: accent }, pressed && styles.pressedZone]}>
                      <Text style={[styles.zoneTitle, { color: accent }]}>{ZONE_META[kind].title}</Text>
                      <Text style={styles.zonePays}>{ZONE_META[kind].pays}</Text>
                      <View style={styles.zoneStack}>{(pendingBets[kind] ?? 0) > 0 ? <ChipStack amount={pendingBets[kind]!} size="compact" /> : null}</View>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.feltBrand}>◆  BACCARAT STRATEGY LAB  ◆</Text>
            </View>
          </View>

          <View style={styles.controls}>
            <View style={styles.controlMain}>
              <View style={styles.chipTray}>{CHIP_VALUES.map((value) => <Chip key={value} value={value} selected={chip === value} onPress={() => setChip(value)} />)}</View>
              <View style={styles.rollArea}>
                <Text style={styles.message} numberOfLines={2}>{message}</Text>
                <Button
                  label={settings.progressionEnabled ? `${strategy.short} · ${units}/${settings.progressionMaxUnits}U` : 'STRATEGY OFF'}
                  variant={settings.progressionEnabled ? 'secondary' : 'ghost'}
                  onPress={toggleProgression}
                  style={settings.progressionEnabled ? styles.wineSecondary : styles.wineGhost}
                />
                <Button label="CLEAR" variant="ghost" onPress={() => setPendingBets({})} disabled={pendingTotal === 0 || watching} style={styles.wineGhost} />
                <Button
                  label={dealPreview >= game.rules.tableMinimum ? `DEAL $${dealPreview}${pendingTotal === 0 && settings.progressionEnabled ? ` · ${ZONE_META[settings.betSide].title}` : ''}` : 'DEAL'}
                  onPress={deal}
                  disabled={dealDisabled || dealPreview < game.rules.tableMinimum}
                  style={styles.dealButton}
                />
              </View>
            </View>
            <View style={styles.automationBar}>
              <Text style={styles.watchLabel}>AUTO SIDE</Text>
              {MAIN_SIDES.map((side) => <Button key={side} label={ZONE_META[side].title} variant={settings.betSide === side ? 'primary' : 'ghost'} onPress={() => chooseSide(side)} style={[styles.sideButton, settings.betSide !== side && styles.wineGhost]} />)}
              <Text style={styles.watchLabel}>SPEED</Text>
              {WATCH_SPEEDS.map((delay) => <Button key={delay} label={`${delay / 1000}s`} variant={watchDelay === delay ? 'primary' : 'ghost'} onPress={() => { setWatchDelay(delay); watchDelayRef.current = delay; }} style={[styles.speedButton, watchDelay !== delay && styles.wineGhost]} />)}
              <Button
                label={watching ? 'STOP AUTO' : 'AUTO PLAY'}
                variant={watching ? 'danger' : 'secondary'}
                onPress={() => (watching ? stopWatching() : startWatching())}
                style={[styles.watchButton, !watching && styles.wineSecondary]}
              />
            </View>
          </View>
        </View>

        {showPanel ? <ScrollView style={styles.sidePanel} contentContainerStyle={styles.sideContent}>
          <ProfitChart series={game.profitSeries} title="SESSION P/L" pointLabel="Coup" palette={CHART_PALETTE} />
          <BeadRoad road={game.beadRoad} shoeNumber={game.shoeNumber} />
          <Text style={styles.panelSubtitle}>Coup history</Text>
          {recentRounds.length === 0 ? <Text style={styles.empty}>No coups yet.</Text> : recentRounds.map((round) => (
            <View key={round.index} style={styles.historyRow}>
              <Text style={styles.historyIndex}>#{round.index}</Text>
              <Text style={[styles.historyOutcome, { color: OUTCOME_COLORS[round.outcome] }]}>{round.outcome === 'tie' ? 'TIE' : round.outcome.toUpperCase()}</Text>
              <Text style={styles.historyTotals}>P {round.playerTotal} · B {round.bankerTotal}{round.playerPair ? ' · PP' : ''}{round.bankerPair ? ' · BP' : ''}</Text>
              <Text style={[styles.historyNet, { color: round.profit > 0 ? bacColors.success : round.profit < 0 ? bacColors.danger : bacColors.muted }]}>{round.profit === 0 ? '—' : formatMoney(round.profit, true)}</Text>
            </View>
          ))}
          <Text style={styles.panelSubtitle}>Table rules</Text>
          <Text style={styles.note}>{rulesLine.toLowerCase()}</Text>
          <Text style={styles.note}>Punto banco tableau: player draws on 0–5 and stands on 6–7; the banker's third card follows the standard tableau against the player's third. Naturals (8 or 9) freeze both hands. The shoe reshuffles with a fresh seed and a new cut, exactly like the blackjack lab.</Text>
          <Text style={styles.seed} selectable>Session seed: {game.seed}</Text>
          <Text style={styles.seed} selectable>Shoe #{game.shoeNumber} seed: {game.shoeSeed}{game.shoeNumber > 1 ? ' (rotated at shuffle)' : ''}</Text>
        </ScrollView> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: bacColors.background },
  topbar: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 22, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#33161d', backgroundColor: '#160a0d' },
  eyebrow: { color: bacColors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginBottom: 2 },
  bigMoney: { fontSize: 22 },
  shoeCount: { color: bacColors.gold, fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  topbarSpace: { flex: 1 },
  body: { flex: 1, minHeight: 0, flexDirection: 'row' },
  tableColumn: { flex: 1.75, minWidth: 560, minHeight: 0 },
  tableRail: { flex: 1, minHeight: 400, margin: 7, padding: 9, borderRadius: 40, backgroundColor: '#241016', borderWidth: 2, borderColor: '#54262f', shadowColor: '#000', shadowOpacity: 0.8, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  felt: { flex: 1, minHeight: 380, backgroundColor: bacColors.felt, borderWidth: 2, borderColor: '#8a4152', borderRadius: 30, paddingHorizontal: 18, paddingVertical: 14, overflow: 'hidden' },
  rulesArc: { color: 'rgba(230,200,205,0.6)', fontWeight: '900', fontSize: 9, letterSpacing: 2, textAlign: 'center', marginBottom: 10 },
  handsRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 26 },
  handBox: { alignItems: 'center', gap: 8, minWidth: 170 },
  handLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 1.6 },
  handCards: { flexDirection: 'row', alignItems: 'center', minHeight: 86 },
  cardSlot: { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 4, shadowOffset: { width: 2, height: 3 } },
  placeholder: { color: 'rgba(230,200,205,0.4)', fontSize: 22 },
  versus: { color: 'rgba(230,200,205,0.5)', fontWeight: '900', fontSize: 11, letterSpacing: 2 },
  winBadge: { fontWeight: '900', fontSize: 11, letterSpacing: 1.2, borderWidth: 1, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 3 },
  tieBadge: { alignSelf: 'center', fontWeight: '900', fontSize: 11, letterSpacing: 1.2, borderWidth: 1, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 3, marginBottom: 6 },
  zoneRow: { flexDirection: 'row', gap: 8, minHeight: 110 },
  zone: { flex: 1, borderWidth: 1.5, borderRadius: 12, alignItems: 'center', paddingTop: 8, backgroundColor: 'rgba(10,3,5,0.25)' },
  mainZone: { flex: 1.6 },
  pressedZone: { opacity: 0.7 },
  zoneTitle: { fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  zonePays: { color: 'rgba(230,200,205,0.65)', fontSize: 9, fontWeight: '800', marginTop: 2 },
  zoneStack: { flex: 1, justifyContent: 'flex-end', paddingBottom: 6 },
  feltBrand: { color: 'rgba(230,200,205,0.5)', fontWeight: '900', fontSize: 8, letterSpacing: 2, textAlign: 'center', marginTop: 8 },
  card: { width: 58, height: 82, borderRadius: 8, backgroundColor: '#f6f2e6', borderWidth: 1, borderColor: '#c8c2b0', paddingHorizontal: 7, paddingVertical: 5, justifyContent: 'space-between' },
  cardRank: { fontSize: 18, fontWeight: '900' },
  cardSuit: { fontSize: 20, alignSelf: 'flex-end' },
  controls: { minHeight: 150, paddingHorizontal: 10, paddingVertical: 8, gap: 4, borderTopWidth: 1, borderTopColor: '#33161d', backgroundColor: bacColors.panel },
  controlMain: { flex: 1, width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10 },
  chipTray: { flexDirection: 'row', alignItems: 'center' },
  rollArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  message: { flex: 1, color: bacColors.muted, fontSize: 11 },
  dealButton: { minWidth: 132, minHeight: 58 },
  automationBar: { minHeight: 34, width: '100%', flexDirection: 'row', alignItems: 'center', gap: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#3d1822', paddingTop: 4 },
  watchLabel: { color: bacColors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1, marginLeft: 5 },
  sideButton: { minHeight: 29, minWidth: 62, paddingHorizontal: 6 },
  speedButton: { minHeight: 29, minWidth: 43, paddingHorizontal: 6 },
  watchButton: { minHeight: 31, minWidth: 118, marginLeft: 'auto' },
  wineSecondary: { borderColor: bacColors.borderLight, backgroundColor: bacColors.panelLight },
  wineGhost: { borderColor: bacColors.border },
  sidePanel: { flex: 1, minWidth: 320, minHeight: 0, maxWidth: 480, borderLeftWidth: 1, borderLeftColor: '#33161d', backgroundColor: bacColors.panel },
  sideContent: { padding: 14, gap: 9 },
  panelSubtitle: { color: bacColors.ink, fontWeight: '900', fontSize: 14, marginTop: 7 },
  empty: { color: bacColors.muted, fontStyle: 'italic' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#3d1822' },
  historyIndex: { color: bacColors.muted, width: 34, fontSize: 11 },
  historyOutcome: { width: 62, fontWeight: '900', fontSize: 11, letterSpacing: 0.5 },
  historyTotals: { flex: 1, color: bacColors.ink, fontSize: 11 },
  historyNet: { fontWeight: '900', fontVariant: ['tabular-nums'], fontSize: 12 },
  note: { color: bacColors.muted, lineHeight: 19, fontSize: 12 },
  seed: { color: '#8a6f74', fontSize: 9, marginTop: 8 },
  beadWrap: { padding: 10, borderRadius: 10, backgroundColor: bacColors.background, borderWidth: 1, borderColor: '#3d1822', gap: 6 },
  beadTitle: { color: bacColors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  beadGrid: { flexDirection: 'row', gap: 3 },
  beadColumn: { gap: 3 },
  bead: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  beadText: { color: '#10060a', fontSize: 8, fontWeight: '900' },
});

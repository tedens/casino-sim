import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { progressionBet, resolveStrategy } from '../../blackjack/betting';
import { CustomBettingStrategy, loadCustomStrategies } from '../../casino/customStrategies';
import { StrategyOverrides, loadStrategyOverrides } from '../../blackjack/strategyOverrides';
import { availableActions, cardText, cardValue, createBlackjackState, handLabel, handValue, isBust, playerAction, sessionProfit, startRound } from '../../blackjack/engine';
import { BlackjackSettings } from '../../blackjack/storage';
import { hintFor } from '../../blackjack/strategy';
import { bjColors } from '../../blackjack/theme';
import { BlackjackHand, BlackjackState, Card, PlayerAction } from '../../blackjack/types';
import { createManualSeed } from '../../domain/rng';
import { Button, Chip, ChipStack, Money, formatMoney } from '../../ui/components';
import { ChartPalette, ProfitChart } from '../../ui/ProfitChart';
import { DealtCard, rotationDelay } from '../../ui/DealtCard';

const CHART_PALETTE: ChartPalette = {
  background: bjColors.background,
  border: '#233150',
  accent: bjColors.gold,
  ink: bjColors.ink,
  muted: bjColors.muted,
  success: bjColors.success,
  danger: bjColors.danger,
};

const CHIP_VALUES = [1, 5, 10, 25, 50, 100, 500];
const WATCH_SPEEDS = [250, 750, 1500, 3000];

// verdict on a round where the edited card diverged from the book, judged against
// a same-shoe replay of the round played strictly by the book (risk-adjusted):
// success = the tweak won more or lost less than the book would have
interface DeviationTag {
  tag: 'success' | 'fail' | 'push';
  /** actual net minus the book-replay net; null when no clean replay was possible */
  delta: number | null;
}

const ACTION_LABELS: Record<PlayerAction, string> = {
  hit: 'HIT',
  stand: 'STAND',
  double: 'DOUBLE',
  split: 'SPLIT',
  surrender: 'SURRENDER',
};

const OUTCOME_STYLE: Record<string, { text: string; color: string }> = {
  blackjack: { text: 'BLACKJACK', color: bjColors.gold },
  win: { text: 'WIN', color: bjColors.success },
  push: { text: 'PUSH', color: bjColors.muted },
  lose: { text: 'LOSE', color: bjColors.danger },
  surrender: { text: 'SURRENDER', color: bjColors.muted },
};

function PlayingCard({ card, faceDown, compact }: { card?: Card; faceDown?: boolean; compact?: boolean }) {
  if (faceDown || !card) {
    return <View style={[styles.card, compact && styles.compactCard, styles.cardBack]}><View style={styles.cardBackInner}><Text style={styles.cardBackMark}>◆</Text></View></View>;
  }
  const red = card.suit === '♥' || card.suit === '♦';
  const color = red ? bjColors.cardRed : bjColors.cardBlack;
  return (
    <View style={[styles.card, compact && styles.compactCard]} accessibilityLabel={cardText(card)}>
      <Text style={[styles.cardRank, compact && styles.compactCardRank, { color }]}>{card.rank}</Text>
      <Text style={[styles.cardSuit, compact && styles.compactCardSuit, { color }]}>{card.suit}</Text>
    </View>
  );
}

function AiHandView({ hand, order, positions, instant }: { hand: BlackjackHand; order: number; positions: number; instant: boolean }) {
  const outcome = hand.outcome ? OUTCOME_STYLE[hand.outcome] : undefined;
  const status = hand.surrendered ? 'SURR' : isBust(hand.cards) ? 'BUST' : hand.doubled ? `${handValue(hand.cards).total} ×2` : String(handValue(hand.cards).total);
  return (
    <View style={styles.aiHand}>
      <View style={styles.handCards}>{hand.cards.map((card, index) => <DealtCard key={index} delayMs={rotationDelay(order, index, positions)} instant={instant} style={{ marginLeft: index === 0 ? 0 : -22 }}><PlayingCard card={card} compact /></DealtCard>)}</View>
      <Text style={[styles.aiTotal, outcome && { color: outcome.color }]}>{outcome ? `${status} · ${outcome.text}` : status}</Text>
    </View>
  );
}

function HandView({ hand, active, showTotal, order, positions, instant }: { hand: BlackjackHand; active: boolean; showTotal: boolean; order: number; positions: number; instant: boolean }) {
  const outcome = hand.outcome ? OUTCOME_STYLE[hand.outcome] : undefined;
  return (
    <View style={[styles.handBox, active && styles.activeHandBox]}>
      <View style={styles.handCards}>{hand.cards.map((card, index) => <DealtCard key={index} delayMs={rotationDelay(order, index, positions)} instant={instant} style={[styles.handCardSlot, { marginLeft: index === 0 ? 0 : -30 }]}><PlayingCard card={card} /></DealtCard>)}</View>
      {showTotal ? <Text style={[styles.handTotal, isBust(hand.cards) && styles.bustTotal]}>{handLabel(hand.cards)}{hand.doubled ? ' · DOUBLED' : ''}{hand.surrendered ? ' · SURRENDERED' : ''}</Text> : null}
      <View style={styles.handMeta}>
        <ChipStack amount={hand.bet} size="compact" />
        {outcome ? <Text style={[styles.outcomeBadge, { color: outcome.color, borderColor: outcome.color }]}>{outcome.text}{hand.profit ? ` ${formatMoney(hand.profit, true)}` : ''}</Text> : null}
      </View>
    </View>
  );
}

export function BlackjackGameScreen({ settings, onChangeSettings }: {
  settings: BlackjackSettings;
  onChangeSettings: (settings: BlackjackSettings) => void;
}) {
  const makeState = () => createBlackjackState({
    seed: createManualSeed(),
    startingBankroll: settings.startingBankroll,
    rules: {
      decks: settings.decks,
      dealerHitsSoft17: settings.dealerHitsSoft17,
      blackjackPayout: settings.blackjackPayout,
      surrenderAllowed: settings.surrenderAllowed,
      doubleAfterSplit: settings.doubleAfterSplit,
      tableMinimum: settings.tableMinimum,
      tableMaximum: settings.tableMaximum,
      aiPlayers: settings.aiPlayers,
      insureTwentyVsAce: settings.insureTwentyVsAce,
    },
  });
  const [game, setGame] = useState<BlackjackState>(makeState);
  const [pendingBet, setPendingBet] = useState(0);
  const [step, setStep] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [watching, setWatching] = useState(false);
  const [watchDelay, setWatchDelay] = useState(750);
  const [message, setMessage] = useState('Build a bet, then deal.');
  // the auto-play timer chain reads refs; plain state would go stale in the closures
  const watchingRef = useRef(false);
  const watchDelayRef = useRef(750);
  const watchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stepRef = useRef(0);
  const [customs, setCustoms] = useState<CustomBettingStrategy[]>([]);
  const customsRef = useRef<CustomBettingStrategy[]>([]);
  const [overrides, setOverrides] = useState<StrategyOverrides>({});
  const overridesRef = useRef<StrategyOverrides>({});
  // auto-play deviation tracking: rounds where the edited card diverged from the book, tagged by outcome
  const [deviationTags, setDeviationTags] = useState<Record<number, DeviationTag>>({});
  const deviationTagsRef = useRef<Record<number, DeviationTag>>({});
  const roundDeviatedRef = useRef(false);
  // snapshot of the state fed into startRound, so a settled round can be replayed by the book
  const preRoundRef = useRef<{ state: BlackjackState; bet: number } | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    loadCustomStrategies().then((loaded) => { customsRef.current = loaded; setCustoms(loaded); }).catch(() => undefined);
    loadStrategyOverrides().then((loaded) => { overridesRef.current = loaded; setOverrides(loaded); }).catch(() => undefined);
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

  const actions = availableActions(game);
  const hint = useMemo(() => (settings.showHints ? hintFor(game, overrides) : null), [game, settings.showHints, overrides]);
  const betting = game.phase !== 'player';
  const activeHand = game.phase === 'player' ? game.hands[game.activeHand] : undefined;
  const dealerValue = game.dealer.length > 0 && game.holeRevealed ? handLabel(game.dealer) : game.dealer.length > 0 ? `showing ${cardValue(game.dealer[0])}` : '';
  const onTable = game.phase === 'player' ? game.hands.reduce((sum, hand) => sum + hand.bet, 0) : pendingBet;
  const profit = sessionProfit(game);
  // once chips go down after a settled round, clear the old cards off the felt
  const freshBetting = betting && (game.hands.length === 0 || pendingBet > 0);
  const strategy = resolveStrategy(settings.bettingStrategy, customs);
  const units = strategy.unitsForStep(step, settings.progressionMaxUnits);
  const autoBet = settings.progressionEnabled ? progressionBet(units, game.rules, game.bankroll) : 0;
  const dealAmount = pendingBet > 0 ? pendingBet : autoBet;

  // advance the betting strategy on settle and return a note for the message line
  const settleProgression = (state: BlackjackState): string => {
    const current = settingsRef.current;
    if (state.phase !== 'settled' || !current.progressionEnabled) return '';
    const roundProfit = state.history[state.history.length - 1]?.profit ?? 0;
    const resolved = resolveStrategy(current.bettingStrategy, customsRef.current);
    const next = resolved.nextStep(stepRef.current, roundProfit);
    applyStep(next);
    const nextUnits = resolved.unitsForStep(next, current.progressionMaxUnits);
    const nextBet = progressionBet(nextUnits, state.rules, state.bankroll);
    if (roundProfit === 0) return `Push — next bet unchanged ($${nextBet}).`;
    return `${roundProfit > 0 ? 'Win' : 'Loss'} — next bet $${nextBet} (${nextUnits}u).`;
  };

  const stopWatching = (text = 'Auto-play stopped.') => {
    watchingRef.current = false;
    setWatching(false);
    if (watchTimer.current) clearTimeout(watchTimer.current);
    setMessage(text);
  };

  // replay the round from the same pre-deal shoe with pure book plays; the identical
  // card order makes this the true "what if I had followed the book" counterfactual
  const bookReplayNet = (): number | null => {
    const pre = preRoundRef.current;
    if (!pre) return null;
    // a reshuffle rotates to fresh random entropy, so a replay would see different cards
    if (pre.state.shoe.length <= pre.state.reshuffleAt) return null;
    const dealt = startRound(pre.state, pre.bet);
    if (dealt.error) return null;
    let replay = dealt.state;
    let guard = 0;
    while (replay.phase === 'player' && guard < 32) {
      const play = hintFor(replay);
      replay = playerAction(replay, play?.action ?? 'stand').state;
      guard += 1;
    }
    if (replay.phase !== 'settled') return null;
    return replay.history[replay.history.length - 1]?.profit ?? null;
  };

  // on settle, judge a diverging round against the book counterfactual: winning less
  // than the book would have still backfired; losing less than the book still worked
  const recordDeviationOutcome = (settled: BlackjackState) => {
    if (!roundDeviatedRef.current) return;
    roundDeviatedRef.current = false;
    const record = settled.history[settled.history.length - 1];
    if (!record) return;
    const bookNet = bookReplayNet();
    const delta = bookNet === null ? null : record.profit - bookNet;
    const tag: DeviationTag['tag'] = delta === null
      ? record.profit > 0 ? 'success' : record.profit < 0 ? 'fail' : 'push'
      : delta > 0 ? 'success' : delta < 0 ? 'fail' : 'push';
    const nextTags = { ...deviationTagsRef.current, [record.index]: { tag, delta } };
    deviationTagsRef.current = nextTags;
    setDeviationTags(nextTags);
  };

  // one auto-play tick: deal between rounds, otherwise play the active hand off the edited card
  const autoStep = (state: BlackjackState) => {
    if (!watchingRef.current) return;
    let next = state;
    let note = '';
    if (state.phase === 'player') {
      // compare the edited card against the book so we can flag rounds the tweak changed
      const bookPlay = hintFor(state);
      const play = hintFor(state, overridesRef.current);
      if (bookPlay && play && bookPlay.action !== play.action) roundDeviatedRef.current = true;
      const result = playerAction(state, play?.action ?? 'stand');
      if (result.error) { stopWatching(`Auto-play stopped: ${result.error}`); return; }
      next = result.state;
      note = [`Auto: ${ACTION_LABELS[play?.action ?? 'stand']}`, ...next.events.slice(-2), settleProgression(next)].filter(Boolean).join(' · ');
    } else {
      const current = settingsRef.current;
      const bet = current.progressionEnabled
        ? progressionBet(resolveStrategy(current.bettingStrategy, customsRef.current).unitsForStep(stepRef.current, current.progressionMaxUnits), state.rules, state.bankroll)
        : Math.min(state.lastBet || state.rules.tableMinimum, state.bankroll);
      if (bet < state.rules.tableMinimum) { stopWatching('Auto-play stopped: bankroll below table minimum.'); return; }
      roundDeviatedRef.current = false;
      preRoundRef.current = { state, bet };
      const result = startRound(state, bet, overridesRef.current);
      if (result.error) { stopWatching(`Auto-play stopped: ${result.error}`); return; }
      next = result.state;
      note = [`Auto: DEAL $${bet}`, ...next.events, settleProgression(next)].filter(Boolean).join(' · ');
    }
    if (next.phase === 'settled') recordDeviationOutcome(next);
    setGame(next);
    setMessage(note);
    watchTimer.current = setTimeout(() => autoStep(next), watchDelayRef.current);
  };

  const startWatching = () => {
    watchingRef.current = true;
    setWatching(true);
    setPendingBet(0);
    setMessage('Auto-playing book strategy.');
    autoStep(game);
  };

  const reset = () => {
    watchingRef.current = false;
    setWatching(false);
    if (watchTimer.current) clearTimeout(watchTimer.current);
    setGame(makeState());
    setPendingBet(0);
    applyStep(0);
    roundDeviatedRef.current = false;
    preRoundRef.current = null;
    deviationTagsRef.current = {};
    setDeviationTags({});
    setMessage('New shoe ready. Build a bet, then deal.');
  };

  const addChip = (value: number) => {
    if (!betting || watchingRef.current) return;
    const next = Math.min(pendingBet + value, Math.min(game.rules.tableMaximum, game.bankroll));
    setPendingBet(next);
    if (next !== pendingBet + value) setMessage('Bet capped at table maximum or bankroll.');
  };

  const deal = (amount: number) => {
    if (watchingRef.current) return;
    const result = startRound(game, amount, overridesRef.current);
    if (result.error) { setMessage(result.error); return; }
    setGame(result.state);
    setPendingBet(0);
    const note = settleProgression(result.state);
    setMessage([...result.state.events, note].filter(Boolean).join(' · ') || 'Your action.');
  };

  const act = (action: PlayerAction) => {
    if (watchingRef.current) return;
    const result = playerAction(game, action);
    if (result.error) { setMessage(result.error); return; }
    setGame(result.state);
    const note = settleProgression(result.state);
    const events = [...result.state.events.slice(-3), note].filter(Boolean);
    setMessage(events.length ? events.join(' · ') : result.state.phase === 'player' ? 'Your action.' : 'Round settled.');
  };

  const toggleProgression = () => {
    if (watchingRef.current) return;
    applyStep(0);
    onChangeSettings({ ...settings, progressionEnabled: !settings.progressionEnabled });
  };

  const toggleHints = () => onChangeSettings({ ...settings, showHints: !settings.showHints });

  const rulesLine = `BLACKJACK PAYS ${game.rules.blackjackPayout === 1.5 ? '3 TO 2' : '6 TO 5'} · DEALER ${game.rules.dealerHitsSoft17 ? 'HITS' : 'STANDS ON'} SOFT 17 · ${game.rules.surrenderAllowed ? 'LATE SURRENDER' : 'NO SURRENDER'}${game.rules.insureTwentyVsAce ? ' · INSURES 20 VS ACE' : ''} · ${game.rules.decks} DECKS`;
  const recentRounds = game.history.slice(-10).reverse();
  const tagValues = Object.values(deviationTags);
  const tweakWins = tagValues.filter((item) => item.tag === 'success').length;
  const tweakLosses = tagValues.filter((item) => item.tag === 'fail').length;
  const tweakPushes = tagValues.filter((item) => item.tag === 'push').length;
  const tweakDelta = tagValues.reduce((sum, item) => sum + (item.delta ?? 0), 0);

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // phone held sideways: keep the two-column table+panel layout but shrink all chrome to fit the short height
  const shortLandscape = windowWidth > windowHeight && windowHeight < 520 && windowWidth < 1200;
  const narrow = windowWidth < 900 && !shortLandscape;
  const phone = windowWidth < 500;
  const compact = phone || shortLandscape;
  const BodyWrap = (narrow ? ScrollView : View) as typeof View;
  const SideWrap = (narrow ? View : ScrollView) as typeof ScrollView;
  const RailWrap = (shortLandscape ? ScrollView : View) as typeof View;

  const TopBar = ({ children }: { children: React.ReactNode }) => compact
    ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.topbarScroller} contentContainerStyle={styles.topbarRow}>{children}</ScrollView>
    : <View style={styles.topbar}>{children}</View>;


  return (
    <View style={styles.screen}>
      <TopBar>
        <View><Text style={styles.eyebrow}>BANKROLL</Text><Money value={game.bankroll} style={styles.bigMoney} /></View>
        <View><Text style={styles.eyebrow}>ON TABLE</Text><Money value={onTable} /></View>
        <View><Text style={styles.eyebrow}>SESSION</Text><Money value={profit} signed style={{ color: profit >= 0 ? bjColors.success : bjColors.danger }} /></View>
        <View><Text style={styles.eyebrow}>SHOE #{game.shoeNumber}</Text><Text style={styles.shoeCount}>{game.shoe.length} cards</Text></View>
        <View style={styles.topbarSpace} />
        <Button label={settings.showHints ? '✓ HINTS ON' : 'HINTS OFF'} variant={settings.showHints ? 'primary' : 'ghost'} onPress={toggleHints} style={styles.hintToggle} />
        <Button label={showPanel ? '✓ HISTORY' : 'HISTORY'} variant={showPanel ? 'secondary' : 'ghost'} onPress={() => setShowPanel((value) => !value)} style={showPanel ? styles.blueSecondary : styles.blueGhost} />
        <Button label="New session" variant="secondary" onPress={reset} style={styles.blueSecondary} />
      </TopBar>

      <BodyWrap style={[styles.body, narrow && styles.bodyNarrow]}>
        {!narrow || !showPanel ? <View style={[styles.tableColumn, narrow && styles.tableColumnNarrow]}>
          <RailWrap style={[styles.tableRail, phone && styles.tableRailPhone, shortLandscape && styles.tableRailLow]}>
            <View style={[styles.felt, phone && styles.feltPhone, shortLandscape && styles.feltLow]}>
              <View style={styles.feltGlowOne} /><View style={styles.feltGlowTwo} />
              <View style={styles.dealerArea}>
                <Text style={styles.areaLabel}>DEALER{dealerValue && !freshBetting ? ` · ${dealerValue}` : ''}</Text>
                <View style={styles.dealerCards}>
                  {game.dealer.length === 0 || freshBetting
                    ? <Text style={styles.placeholder}>Waiting on a bet…</Text>
                    : game.dealer.map((card, index) => <DealtCard key={index} delayMs={rotationDelay(game.aiPlayers.length + 1, index, game.aiPlayers.length + 2)} instant={settings.instantDeal} style={[styles.handCardSlot, { marginLeft: index === 0 ? 0 : -30 }]}><PlayingCard card={card} faceDown={index === 1 && !game.holeRevealed} /></DealtCard>)}
                </View>
              </View>
              <Text style={styles.rulesArc}>{rulesLine}</Text>
              {(game.aiPlayers?.length ?? 0) > 0 && game.hands.length > 0 && !freshBetting ? (
                <View style={styles.aiRow}>
                  {game.aiPlayers.map((player, index) => {
                    const seat = game.botRoster[index];
                    return (
                      <View key={player.id} style={styles.aiPlayer}>
                        <Text style={styles.aiName}>
                          {player.name}
                          {seat ? ` · ${formatMoney(seat.bankroll)}` : ''}
                          {seat && seat.friends > 0 ? ` · F×${seat.friends}` : ''}
                        </Text>
                        <View style={styles.aiHands}>{player.hands.map((hand) => <AiHandView key={hand.id} hand={hand} order={index} positions={game.aiPlayers.length + 2} instant={settings.instantDeal} />)}</View>
                      </View>
                    );
                  })}
                </View>
              ) : null}
              {hint && activeHand ? (
                <View style={styles.hintBanner}>
                  <Text style={styles.hintAction}>BOOK PLAY · {ACTION_LABELS[hint.action]}</Text>
                  <Text style={styles.hintReason}>{hint.reason}</Text>
                </View>
              ) : null}
              <View style={styles.playerArea}>
                <Text style={styles.areaLabel}>{!freshBetting && game.hands.length > 1 ? `YOUR HANDS · ${game.hands.length}` : 'YOUR HAND'}</Text>
                <View style={styles.handsRow}>
                  {game.hands.length === 0 || freshBetting
                    ? <View style={styles.betSpot}><Text style={styles.betSpotText}>BET</Text>{pendingBet > 0 ? <ChipStack amount={pendingBet} /> : autoBet >= game.rules.tableMinimum ? <ChipStack amount={autoBet} /> : null}</View>
                    : game.hands.map((hand, index) => <HandView key={hand.id} hand={hand} active={game.phase === 'player' && index === game.activeHand} showTotal order={game.aiPlayers.length} positions={game.aiPlayers.length + 2} instant={settings.instantDeal} />)}
                </View>
              </View>
              <Text style={styles.feltBrand}>◆  BLACKJACK STRATEGY LAB  ◆</Text>
            </View>
          </RailWrap>

          <View style={[styles.controls, compact && styles.controlsPhone]}>
            <View style={styles.controlMain}>
              {betting ? (
                <>
                  <View style={[styles.chipTray, phone && styles.chipTrayPhone]}>{CHIP_VALUES.map((value) => <Chip key={value} value={value} small={compact} onPress={() => addChip(value)} />)}</View>
                  <View style={styles.rollArea}>
                    <Text style={styles.message} numberOfLines={2}>{message}</Text>
                    <Button
                      label={settings.progressionEnabled ? `${strategy.short} · ${units}/${settings.progressionMaxUnits}U` : 'STRATEGY OFF'}
                      variant={settings.progressionEnabled ? 'secondary' : 'ghost'}
                      onPress={toggleProgression}
                      style={settings.progressionEnabled ? styles.blueSecondary : styles.blueGhost}
                    />
                    <Button label="CLEAR" variant="ghost" onPress={() => setPendingBet(0)} disabled={pendingBet === 0 || watching} style={styles.blueGhost} />
                    {!settings.progressionEnabled && game.lastBet > 0 && pendingBet === 0 ? <Button label={`REBET $${game.lastBet}`} variant="secondary" onPress={() => deal(Math.min(game.lastBet, game.bankroll))} disabled={game.bankroll < game.rules.tableMinimum || watching} style={styles.blueSecondary} /> : null}
                    <Button
                      label={dealAmount >= game.rules.tableMinimum ? `DEAL $${dealAmount}${pendingBet === 0 && autoBet > 0 ? ` · ${units}U` : ''}` : 'DEAL'}
                      onPress={() => deal(dealAmount)}
                      disabled={dealAmount < game.rules.tableMinimum || watching}
                      style={styles.dealButton}
                    />
                  </View>
                </>
              ) : (
                <View style={styles.actionRow}>
                  <Text style={styles.message} numberOfLines={2}>{message}</Text>
                  {(['hit', 'stand', 'double', 'split', 'surrender'] as PlayerAction[]).map((action) => {
                    const enabled = actions.includes(action);
                    const recommended = hint?.action === action;
                    return (
                      <Button
                        key={action}
                        label={ACTION_LABELS[action]}
                        variant={recommended ? 'primary' : 'secondary'}
                        onPress={() => act(action)}
                        disabled={!enabled || watching}
                        style={[styles.actionButton, !recommended && styles.blueSecondary, recommended && styles.recommendedButton]}
                      />
                    );
                  })}
                </View>
              )}
            </View>
            <View style={styles.automationBar}>
              <Text style={styles.watchLabel}>WATCH SPEED</Text>
              {WATCH_SPEEDS.map((delay) => <Button key={delay} label={`${delay / 1000}s`} variant={watchDelay === delay ? 'primary' : 'ghost'} onPress={() => { setWatchDelay(delay); watchDelayRef.current = delay; }} style={[styles.speedButton, watchDelay !== delay && styles.blueGhost]} />)}
              <Button
                label={watching ? 'STOP AUTO' : 'AUTO PLAY'}
                variant={watching ? 'danger' : 'secondary'}
                onPress={() => (watching ? stopWatching() : startWatching())}
                style={[styles.watchButton, !watching && styles.blueSecondary]}
              />
            </View>
          </View>
        </View> : null}

        {showPanel ? <SideWrap style={[styles.sidePanel, narrow && styles.sidePanelNarrow, narrow && styles.sideContent, shortLandscape && styles.sidePanelLow]} contentContainerStyle={styles.sideContent}>
          <ProfitChart series={game.profitSeries} title="SESSION P/L" pointLabel="Round" palette={CHART_PALETTE} />
          {game.botRoster.length > 0 ? (
            <>
              <Text style={styles.panelSubtitle}>Table mates</Text>
              {game.botRoster.map((seat) => (
                <View key={seat.name} style={styles.seatRow}>
                  <Text style={styles.seatName}>{seat.name}</Text>
                  <Text style={[styles.seatProfit, { color: seat.bankroll + seat.friends * game.startingBankroll - game.startingBankroll >= 0 ? bjColors.success : bjColors.danger }]}>
                    {formatMoney(seat.bankroll + seat.friends * game.startingBankroll - game.startingBankroll, true)}
                  </Text>
                  <Text style={styles.seatFriends}>{seat.friends > 0 ? `${seat.friends} friend${seat.friends > 1 ? 's' : ''}` : 'solvent'}</Text>
                </View>
              ))}
            </>
          ) : null}
          <Text style={styles.panelSubtitle}>Round history</Text>
          {tagValues.length > 0 ? (
            <View style={styles.tweakSummary}>
              <Text style={styles.tweakTitle}>CARD TWEAKS · AUTO-PLAY · VS BOOK</Text>
              <Text style={styles.tweakLine}>
                <Text style={{ color: bjColors.success }}>{tweakWins} worked</Text>
                <Text style={styles.tweakDim}>  ·  </Text>
                <Text style={{ color: bjColors.danger }}>{tweakLosses} backfired</Text>
                {tweakPushes > 0 ? <Text style={styles.tweakDim}>  ·  {tweakPushes} even</Text> : null}
                <Text style={styles.tweakDim}>  ·  net </Text>
                <Text style={{ color: tweakDelta >= 0 ? bjColors.success : bjColors.danger }}>{formatMoney(tweakDelta, true)}</Text>
              </Text>
              <Text style={styles.tweakNote}>Each diverging round is replayed from the same shoe with pure book plays and judged against that: gold means your edit beat the book (won more or lost less, including smaller stakes), red means the book would have done better. The net is your total edge over the book.</Text>
            </View>
          ) : null}
          {recentRounds.length === 0 ? <Text style={styles.empty}>No rounds yet.</Text> : recentRounds.map((round) => {
            const tag = deviationTags[round.index];
            return (
              <View key={round.index} style={[styles.historyRow, tag?.tag === 'success' && styles.tweakWinRow, tag?.tag === 'fail' && styles.tweakLossRow]}>
                <Text style={styles.historyIndex}>#{round.index}{tag ? ' ✎' : ''}</Text>
                <View style={styles.historyBody}>
                  <Text style={styles.historyCards} numberOfLines={1}>You: {round.playerSummary}</Text>
                  <Text style={styles.historyCards} numberOfLines={1}>Dealer: {round.dealerSummary}</Text>
                  {tag && tag.delta !== null ? <Text style={[styles.tweakVsBook, { color: tag.delta > 0 ? bjColors.success : tag.delta < 0 ? bjColors.danger : bjColors.muted }]}>{formatMoney(tag.delta, true)} vs book</Text> : null}
                </View>
                <Text style={[styles.historyProfit, { color: round.profit > 0 ? bjColors.success : round.profit < 0 ? bjColors.danger : bjColors.muted }]}>{formatMoney(round.profit, true)}</Text>
              </View>
            );
          })}
          <Text style={styles.panelSubtitle}>Table rules</Text>
          <Text style={styles.note}>{rulesLine.toLowerCase()}</Text>
          <Text style={styles.note}>Dealer peeks for blackjack on a ten or ace up. Split up to {game.rules.maxHands} hands; split aces receive one card. Insurance is never offered — it is always a losing bet.</Text>
          <Text style={styles.seed} selectable>Session seed: {game.seed}</Text>
          <Text style={styles.seed} selectable>Shoe #{game.shoeNumber} seed: {game.shoeSeed}{game.shoeNumber > 1 ? ' (rotated at shuffle)' : ''}</Text>
        </SideWrap> : null}
      </BodyWrap>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: bjColors.background },
  topbar: { minHeight: 72, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#232c3d', backgroundColor: '#080c15' },
  topbarScroller: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: '#232c3d', backgroundColor: '#080c15' },
  topbarRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 7 },
  eyebrow: { color: bjColors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginBottom: 2 },
  bigMoney: { fontSize: 22 },
  shoeCount: { color: bjColors.gold, fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  topbarSpace: { flex: 1 },
  hintToggle: { minWidth: 118 },
  body: { flex: 1, minHeight: 0, flexDirection: 'row' },
  bodyNarrow: { flexDirection: 'column' },
  tableColumn: { flex: 1.75, minWidth: 560, minHeight: 0 },
  tableColumnNarrow: { flex: undefined, minWidth: 0 },
  tableRailPhone: { minHeight: 340, margin: 4, padding: 6, borderRadius: 22 },
  tableRailLow: { minHeight: 250, margin: 3, padding: 4, borderRadius: 16 },
  feltLow: { minHeight: 240, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12 },
  sidePanelLow: { minWidth: 260 },
  feltPhone: { minHeight: 324, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 16 },
  controlsPhone: { minHeight: 0, paddingVertical: 4 },
  tableRail: { flex: 1, minHeight: 430, margin: 7, padding: 9, borderRadius: 40, backgroundColor: '#191426', borderWidth: 2, borderColor: '#3d3a5c', shadowColor: '#000', shadowOpacity: 0.8, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  felt: { flex: 1, minHeight: 410, backgroundColor: bjColors.felt, borderWidth: 2, borderColor: '#4a6ea3', borderRadius: 30, paddingHorizontal: 18, paddingVertical: 14, overflow: 'hidden' },
  feltGlowOne: { position: 'absolute', width: 340, height: 340, borderRadius: 170, left: '12%', top: '10%', backgroundColor: 'rgba(255,255,255,0.015)' },
  feltGlowTwo: { position: 'absolute', width: 280, height: 280, borderRadius: 140, right: '6%', bottom: '-16%', backgroundColor: 'rgba(0,0,0,0.05)' },
  dealerArea: { alignItems: 'center', gap: 8, minHeight: 130 },
  areaLabel: { color: '#a9bcd9', fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  dealerCards: { flexDirection: 'row', alignItems: 'center', minHeight: 86 },
  placeholder: { color: 'rgba(190,205,230,0.45)', fontStyle: 'italic' },
  rulesArc: { color: 'rgba(190,205,230,0.6)', fontWeight: '900', fontSize: 9, letterSpacing: 2, textAlign: 'center', marginVertical: 10 },
  aiRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  aiPlayer: { alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(4,9,18,0.4)', borderWidth: 1, borderColor: 'rgba(74,110,163,0.35)' },
  aiName: { color: '#8fa5c6', fontSize: 8, fontWeight: '900', letterSpacing: 1.4 },
  aiHands: { flexDirection: 'row', gap: 8 },
  aiHand: { alignItems: 'center', gap: 2 },
  aiTotal: { color: bjColors.ink, fontSize: 9, fontWeight: '800' },
  hintBanner: { alignSelf: 'center', maxWidth: 480, alignItems: 'center', gap: 3, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 11, backgroundColor: 'rgba(5,10,20,0.62)', borderWidth: 1, borderColor: bjColors.gold },
  hintAction: { color: bjColors.gold, fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  hintReason: { color: bjColors.ink, fontSize: 11, textAlign: 'center' },
  playerArea: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingTop: 8 },
  handsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, alignItems: 'flex-end' },
  betSpot: { width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(201,178,119,0.65)', alignItems: 'center', justifyContent: 'center', gap: 4 },
  betSpotText: { color: 'rgba(201,178,119,0.8)', fontWeight: '900', fontSize: 11, letterSpacing: 2 },
  handBox: { alignItems: 'center', gap: 6, padding: 10, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  activeHandBox: { borderColor: bjColors.gold, backgroundColor: 'rgba(213,174,83,0.08)' },
  handCards: { flexDirection: 'row', alignItems: 'center' },
  handCardSlot: { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 4, shadowOffset: { width: 2, height: 3 } },
  handTotal: { color: bjColors.ink, fontWeight: '900', fontSize: 13 },
  bustTotal: { color: bjColors.danger },
  handMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  outcomeBadge: { fontWeight: '900', fontSize: 11, letterSpacing: 1, borderWidth: 1, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  feltBrand: { color: 'rgba(170,190,225,0.5)', fontWeight: '900', fontSize: 8, letterSpacing: 2, textAlign: 'center', marginTop: 8 },
  card: { width: 58, height: 82, borderRadius: 8, backgroundColor: '#f6f2e6', borderWidth: 1, borderColor: '#c8c2b0', paddingHorizontal: 7, paddingVertical: 5, justifyContent: 'space-between' },
  compactCard: { width: 40, height: 56 },
  cardRank: { fontSize: 18, fontWeight: '900' },
  compactCardRank: { fontSize: 13 },
  cardSuit: { fontSize: 20, alignSelf: 'flex-end' },
  compactCardSuit: { fontSize: 14 },
  cardBack: { backgroundColor: '#16325e', borderColor: '#0d2141', padding: 4 },
  cardBackInner: { flex: 1, borderRadius: 5, borderWidth: 1.5, borderColor: 'rgba(220,228,245,0.5)', alignItems: 'center', justifyContent: 'center' },
  cardBackMark: { color: 'rgba(220,228,245,0.7)', fontSize: 18 },
  controls: { minHeight: 150, paddingHorizontal: 10, paddingVertical: 8, gap: 4, borderTopWidth: 1, borderTopColor: '#242b3a', backgroundColor: bjColors.panel },
  automationBar: { minHeight: 34, width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2b3450', paddingTop: 4 },
  watchLabel: { color: bjColors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1, marginLeft: 5 },
  speedButton: { minHeight: 29, minWidth: 43, paddingHorizontal: 6 },
  watchButton: { minHeight: 31, minWidth: 128, marginLeft: 'auto' },
  controlMain: { flex: 1, width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  chipTray: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  chipTrayPhone: { width: '100%', justifyContent: 'center', gap: 4 },
  rollArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  message: { flex: 1, minWidth: 0, color: bjColors.muted, fontSize: 11 },
  dealButton: { minWidth: 122, minHeight: 58 },
  actionRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  actionButton: { minHeight: 52, minWidth: 96 },
  recommendedButton: { shadowColor: bjColors.gold, shadowOpacity: 0.7, shadowRadius: 9 },
  blueSecondary: { borderColor: bjColors.borderLight, backgroundColor: bjColors.panelLight },
  blueGhost: { borderColor: bjColors.border },
  sidePanel: { flex: 1, minWidth: 320, minHeight: 0, maxWidth: 480, borderLeftWidth: 1, borderLeftColor: '#242b3a', backgroundColor: bjColors.panel },
  sidePanelNarrow: { flex: undefined, width: '100%', minWidth: 0, maxWidth: undefined, borderLeftWidth: 0 },
  sideContent: { padding: 14, gap: 9 },
  panelSubtitle: { color: bjColors.ink, fontWeight: '900', fontSize: 14, marginTop: 7 },
  empty: { color: bjColors.muted, fontStyle: 'italic' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2b3450' },
  tweakWinRow: { backgroundColor: 'rgba(213,174,83,0.16)', borderLeftWidth: 3, borderLeftColor: bjColors.gold, paddingLeft: 6, borderRadius: 4 },
  tweakLossRow: { backgroundColor: 'rgba(239,107,100,0.16)', borderLeftWidth: 3, borderLeftColor: bjColors.danger, paddingLeft: 6, borderRadius: 4 },
  tweakSummary: { padding: 10, borderRadius: 10, backgroundColor: bjColors.background, borderWidth: 1, borderColor: '#3d5c8a', gap: 4 },
  tweakTitle: { color: bjColors.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  tweakLine: { fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  tweakDim: { color: bjColors.muted },
  tweakNote: { color: bjColors.muted, fontSize: 11, lineHeight: 15 },
  tweakVsBook: { fontSize: 10, fontWeight: '900', fontVariant: ['tabular-nums'] },
  historyIndex: { color: bjColors.muted, width: 34, fontSize: 11 },
  historyBody: { flex: 1, gap: 1 },
  historyCards: { color: bjColors.ink, fontSize: 11 },
  historyProfit: { fontWeight: '900', fontVariant: ['tabular-nums'], fontSize: 12 },
  seatRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2b3450' },
  seatName: { color: bjColors.ink, width: 34, fontWeight: '900', fontSize: 12 },
  seatProfit: { fontWeight: '900', fontVariant: ['tabular-nums'], fontSize: 12, width: 70 },
  seatFriends: { color: bjColors.muted, fontSize: 11, flex: 1, textAlign: 'right' },
  note: { color: bjColors.muted, lineHeight: 19, fontSize: 12 },
  seed: { color: '#6e7f94', fontSize: 9, marginTop: 8 },
});

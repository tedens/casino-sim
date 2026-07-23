import React, { Suspense, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BELLAGIO_RULESET } from '../domain/ruleset';
import { createGameState, invalidWagerForRoll, moveWagerTarget, placeWager, removeWager, resizeWager, sessionProfit, setWagerWorking, settleRoll, wagerLabel } from '../domain/engine';
import { createManualSeed, SeededRng } from '../domain/rng';
import { BetRequest, GameState, PointNumber, RollRecord, Wager, WagerKind, WagerTarget } from '../domain/types';
import { requiredUnit, validateBet } from '../domain/validation';
import { applyProposal, evaluateStrategy } from '../strategy/engine';
import { StrategyContext, StrategyDefinition, StrategyProposal } from '../strategy/types';
import { AppSettings } from '../storage/storage';
import { Button, Chip, ChipStack, DiceResult, Money, formatMoney } from '../ui/components';
import { colors } from '../ui/theme';

const DiceThrow = React.lazy(async () => {
  if (Platform.OS === 'web') {
    const { LoadSkiaWeb } = await import('@shopify/react-native-skia/lib/module/web');
    await LoadSkiaWeb();
  }
  const module = await import('../ui/DiceThrow');
  return { default: module.DiceThrow };
});

const CHIP_VALUES = [1, 5, 25, 100, 500];
const POINTS: PointNumber[] = [4, 5, 6, 8, 9, 10];
const HOPS: WagerTarget[] = Array.from({ length: 6 }, (_, a) => Array.from({ length: 6 - a }, (_, offset) => `${a + 1}-${a + 1 + offset}` as WagerTarget)).flat();
const WATCH_SPEEDS = [250, 750, 1500, 3000];
const DICE_HOLD_MS = 1700;
const DICE_DOCK_MS = 650;

interface Suggestion {
  proposal: StrategyProposal;
  context: StrategyContext;
}

interface PointConflict {
  point: PointNumber;
  wagerId: string;
}

interface ZoneProps {
  label: string;
  sublabel?: string;
  amount?: number;
  stacks?: Array<{ key: string; amount: number; label?: string }>;
  onPress: () => void;
  active?: boolean;
  compact?: boolean;
  tone?: 'red' | 'gold';
}

function BetZone({ label, sublabel, amount = 0, stacks, onPress, active, compact, tone }: ZoneProps) {
  const visibleStacks = stacks ?? [{ key: 'base', amount }];
  const numberZone = ['4', '5', '6', '8', '9', '10'].includes(label);
  return (
    <View style={[styles.zoneWrap, compact && styles.compactZoneWrap]}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.zone, compact && styles.compactZone, tone === 'red' && styles.redZone, tone === 'gold' && styles.goldZone, active && styles.activeZone, pressed && styles.pressedZone]}>
        <Text style={[styles.zoneLabel, numberZone && styles.numberZoneLabel, active && styles.activeZoneText]}>{label}</Text>
        {sublabel ? <Text style={[styles.zoneOdds, active && styles.activeZoneText]}>{sublabel}</Text> : null}
        <View style={styles.zoneStacks}>{visibleStacks.filter((stack) => stack.amount > 0).map((stack) => <ChipStack key={stack.key} amount={stack.amount} label={stack.label} size={compact ? 'compact' : 'table'} />)}</View>
      </Pressable>
    </View>
  );
}

function FieldZone({ amount, onPress }: { amount: number; onPress: () => void }) {
  return (
    <View style={styles.zoneWrap}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.fieldZone, pressed && styles.pressedZone]}>
        <Text style={styles.fieldTitle}>FIELD</Text>
        <View style={styles.fieldNumbers}>
          <View style={styles.fieldDouble}><Text style={styles.fieldBigNumber}>2</Text><Text style={styles.fieldPay}>PAYS 2×</Text></View>
          <Text style={styles.fieldRun}>3     4      9     10     11</Text>
          <View style={styles.fieldDouble}><Text style={styles.fieldBigNumber}>12</Text><Text style={styles.fieldPay}>PAYS 3×</Text></View>
        </View>
        <View style={styles.fieldChip}>{amount > 0 ? <ChipStack amount={amount} size="table" /> : null}</View>
      </Pressable>
    </View>
  );
}

function amountOn(state: GameState, kind: WagerKind, target?: WagerTarget): number {
  return state.wagers.filter((wager) => wager.kind === kind && (target === undefined || wager.target === target)).reduce((sum, wager) => sum + wager.amount, 0);
}

function amountWhere(state: GameState, predicate: (wager: Wager) => boolean): number {
  return state.wagers.filter(predicate).reduce((sum, wager) => sum + wager.amount, 0);
}

function strategyContexts(record: RollRecord): StrategyContext[] {
  const contexts: StrategyContext[] = [{ trigger: 'rollSettled', record, eventType: 'rollSettled' }];
  for (const event of record.events) {
    if (['pointEstablished', 'betWon', 'betLost', 'sevenOut'].includes(event.type)) {
      contexts.push({ trigger: event.type as StrategyContext['trigger'], record, eventType: event.type, eventWagerId: event.wagerId });
    }
  }
  if (record.pointAfter === null) contexts.push({ trigger: 'comeOutStart', record });
  return contexts;
}

export function GameScreen({ strategies, selectedStrategyId, onSelectStrategy, settings, onChangeSettings }: {
  strategies: StrategyDefinition[];
  selectedStrategyId: string;
  onSelectStrategy: (id: string) => void;
  settings: AppSettings;
  onChangeSettings: (settings: AppSettings) => void;
}) {
  const makeState = () => createGameState({
    seed: createManualSeed(),
    startingBankroll: settings.startingBankroll,
    ruleset: { ...BELLAGIO_RULESET, tableMinimum: settings.tableMinimum, tableMaximum: settings.tableMaximum, startingBankroll: settings.startingBankroll },
  });
  const [game, setGame] = useState<GameState>(makeState);
  const [chip, setChip] = useState(CHIP_VALUES.includes(settings.selectedChip) ? settings.selectedChip : 5);
  const [numberMode, setNumberMode] = useState<'place' | 'buy' | 'lay'>('place');
  const [selectedWager, setSelectedWager] = useState<string>();
  const [rolling, setRolling] = useState(false);
  const [dice, setDice] = useState<[1, 1] | [number, number]>([1, 1]);
  const [diceLocation, setDiceLocation] = useState<'table' | 'returning' | 'tray'>('tray');
  const [message, setMessage] = useState('Place bets, then roll.');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [betHistory, setBetHistory] = useState<GameState[]>([]);
  const [betFuture, setBetFuture] = useState<GameState[]>([]);
  const [watching, setWatching] = useState(false);
  const [watchDelay, setWatchDelay] = useState(750);
  const [winFlash, setWinFlash] = useState<number | null>(null);
  const [pointConflict, setPointConflict] = useState<PointConflict | null>(null);
  const [feltSize, setFeltSize] = useState({ width: 800, height: 430 });
  const [landing, setLanding] = useState({ first: { x: 0.44, y: 0.45 }, second: { x: 0.63, y: 0.58 }, wallX: 0.84 });
  const rng = useRef(new SeededRng(game.seed, 'outcome'));
  const visualRng = useRef(new SeededRng(game.seed, 'animation'));
  const diceReturnTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const diceDockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const watchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const watchingRef = useRef(false);
  const watchDelayRef = useRef(750);
  const winCountTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const winHideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const strategy = strategies.find((item) => item.id === selectedStrategyId);
  const animationMs = settings.animationSpeed === 'slow' ? 1400 : settings.animationSpeed === 'fast' ? 500 : 900;

  const reset = () => {
    if (diceReturnTimer.current) clearTimeout(diceReturnTimer.current);
    if (diceDockTimer.current) clearTimeout(diceDockTimer.current);
    if (watchTimer.current) clearTimeout(watchTimer.current);
    if (winCountTimer.current) clearInterval(winCountTimer.current);
    if (winHideTimer.current) clearTimeout(winHideTimer.current);
    watchingRef.current = false;
    setWatching(false);
    setWinFlash(null);
    const next = makeState();
    rng.current = new SeededRng(next.seed, 'outcome');
    visualRng.current = new SeededRng(next.seed, 'animation');
    setGame(next);
    setRolling(false);
    setDice([1, 1]);
    setDiceLocation('tray');
    setSelectedWager(undefined);
    setBetHistory([]);
    setBetFuture([]);
    setPointConflict(null);
    setMessage('New session ready.');
    if (strategy) {
      const context: StrategyContext = { trigger: 'sessionStart' };
      setSuggestions(evaluateStrategy(strategy, next, context).map((proposal) => ({ proposal, context })));
    } else setSuggestions([]);
  };

  useEffect(() => {
    if (!strategy) { setSuggestions([]); return; }
    const context: StrategyContext = { trigger: game.rollIndex === 0 ? 'sessionStart' : game.phase === 'comeOut' ? 'comeOutStart' : 'rollSettled', record: game.history.at(-1) };
    setSuggestions(evaluateStrategy(strategy, game, context).map((proposal) => ({ proposal, context })));
    // Intentionally refresh only when selected strategy changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStrategyId]);

  useEffect(() => () => {
    if (diceReturnTimer.current) clearTimeout(diceReturnTimer.current);
    if (diceDockTimer.current) clearTimeout(diceDockTimer.current);
    if (watchTimer.current) clearTimeout(watchTimer.current);
    if (winCountTimer.current) clearInterval(winCountTimer.current);
    if (winHideTimer.current) clearTimeout(winHideTimer.current);
  }, []);

  const flashWinnings = (amount: number) => {
    if (winCountTimer.current) clearInterval(winCountTimer.current);
    if (winHideTimer.current) clearTimeout(winHideTimer.current);
    const started = Date.now();
    setWinFlash(0);
    winCountTimer.current = setInterval(() => {
      const progress = Math.min(1, (Date.now() - started) / 700);
      setWinFlash(Math.round(amount * progress));
      if (progress >= 1 && winCountTimer.current) {
        clearInterval(winCountTimer.current);
        winCountTimer.current = undefined;
      }
    }, 30);
    winHideTimer.current = setTimeout(() => setWinFlash(null), 1600);
  };

  const recordBetChange = (next: GameState) => {
    setBetHistory((items) => [...items, game].slice(-40));
    setBetFuture([]);
    setGame(next);
  };

  const undoBet = () => {
    if (rolling || watching || betHistory.length === 0) return;
    const previous = betHistory[betHistory.length - 1];
    setBetHistory((items) => items.slice(0, -1));
    setBetFuture((items) => [game, ...items].slice(0, 40));
    setGame(previous);
    setSelectedWager(undefined);
    setMessage('Last wager edit undone.');
  };

  const redoBet = () => {
    if (rolling || watching || betFuture.length === 0) return;
    const next = betFuture[0];
    setBetHistory((items) => [...items, game].slice(-40));
    setBetFuture((items) => items.slice(1));
    setGame(next);
    setSelectedWager(undefined);
    setMessage('Wager edit restored.');
  };

  const addBet = (request: Omit<BetRequest, 'amount'> & { amount?: number }) => {
    if (rolling || watchingRef.current) return;
    setPointConflict(null);
    const existing = game.wagers.find((wager) =>
      wager.kind === request.kind
      && wager.target === request.target
      && (request.kind === 'come' || request.kind === 'dontCome' ? !wager.contract : true)
      && !['field', 'horn', 'ce', 'any7', 'anyCraps', 'number2', 'number3', 'number11', 'number12', 'hop'].includes(wager.kind),
    );
    const desired = (existing?.amount ?? 0) + (request.amount ?? chip);
    if (existing) {
      const result = resizeWager(game, existing.id, desired, { allowInvalidAmounts: true });
      if (result.error) setMessage(result.error); else { recordBetChange(result.state); setMessage(`${wagerLabel(existing)} now ${formatMoney(desired)}.`); }
      return;
    }
    const result = placeWager(game, { ...request, amount: request.amount ?? chip }, { allowInvalidAmounts: true });
    if (result.error) setMessage(result.error); else { recordBetChange(result.state); setMessage(`${wagerLabel(result.wager!)} placed.`); }
  };

  const stopWatching = (text = 'Strategy watch stopped.') => {
    watchingRef.current = false;
    setWatching(false);
    if (watchTimer.current) clearTimeout(watchTimer.current);
    setMessage(text);
  };

  const rollSuggestions = (record: RollRecord, state: GameState): Suggestion[] => {
    if (!strategy) return [];
    const nextSuggestions = strategyContexts(record).flatMap((context) =>
      evaluateStrategy(strategy, state, context).map((proposal) => ({ proposal, context })),
    );
    const unique = new Map(nextSuggestions.map((suggestion) => [suggestion.proposal.id + suggestion.context.trigger, suggestion]));
    return [...unique.values()];
  };

  const executeRoll: (state: GameState, automatic: boolean) => void = (state, automatic) => {
    if (state.stopped) return;
    if (state.wagers.length === 0) {
      setMessage('Place at least one bet before rolling.');
      if (automatic) stopWatching('Strategy stopped: no active wager.');
      return;
    }
    if (diceReturnTimer.current) clearTimeout(diceReturnTimer.current);
    if (diceDockTimer.current) clearTimeout(diceDockTimer.current);
    const faces = rng.current.dice();
    setLanding({
      first: { x: 0.39 + visualRng.current.nextFloat() * 0.11, y: 0.36 + visualRng.current.nextFloat() * 0.18 },
      second: { x: 0.61 + visualRng.current.nextFloat() * 0.11, y: 0.45 + visualRng.current.nextFloat() * 0.18 },
      wallX: 0.78 + visualRng.current.nextFloat() * 0.12,
    });
    setDice(faces);
    setDiceLocation('table');
    setRolling(true);
    setSuggestions([]);
    setBetHistory([]);
    setBetFuture([]);
    setMessage('No more bets.');
    setTimeout(() => {
      const result = settleRoll(state, faces[0], faces[1], state.seed);
      const nextSuggestions = rollSuggestions(result.record, result.state);
      let nextState = result.state;
      if (automatic && watchingRef.current) {
        for (const suggestion of nextSuggestions.filter((item) => item.proposal.valid)) {
          nextState = applyProposal(nextState, suggestion.proposal, suggestion.context).state;
        }
      }
      setGame(nextState);
      const pointEstablished = result.record.events.find((event) => event.type === 'pointEstablished')?.point;
      if (!automatic && pointEstablished !== undefined) {
        const conflict = nextState.wagers.find((wager) => ['place', 'buy', 'lay'].includes(wager.kind) && wager.target === pointEstablished);
        setPointConflict(conflict ? { point: pointEstablished, wagerId: conflict.id } : null);
      } else {
        setPointConflict(null);
      }
      setRolling(false);
      diceReturnTimer.current = setTimeout(() => {
        setDiceLocation('returning');
        diceDockTimer.current = setTimeout(() => setDiceLocation('tray'), DICE_DOCK_MS);
      }, DICE_HOLD_MS);
      setMessage(result.record.events.map((event) => event.message).slice(0, 2).join(' · '));
      if (!automatic && settings.showWinnings) {
        const winnings = result.record.settlements.filter((item) => item.status === 'won').reduce((sum, item) => sum + item.profit, 0);
        if (winnings > 0) flashWinnings(winnings);
      }
      if (automatic && watchingRef.current) {
        setSuggestions([]);
        if (nextState.stopped || nextState.wagers.length === 0) {
          stopWatching(nextState.stopped ? 'Strategy session complete.' : 'Strategy stopped: no active wager.');
        } else {
          watchTimer.current = setTimeout(() => executeRoll(nextState, true), DICE_HOLD_MS + DICE_DOCK_MS + watchDelayRef.current);
        }
      } else {
        setSuggestions(nextSuggestions);
      }
    }, animationMs);
  };

  const doRoll = () => {
    if (rolling || watching || game.stopped) return;
    if (invalidWager) {
      setMessage(`${wagerLabel(invalidWager)} is not a valid betting amount yet.`);
      return;
    }
    executeRoll(game, false);
  };

  const startWatching = () => {
    if (!strategy) {
      setMessage('Select a strategy before watching.');
      return;
    }
    let next = game;
    let initialSuggestions = suggestions;
    if (initialSuggestions.length === 0) {
      const context: StrategyContext = { trigger: game.rollIndex === 0 ? 'sessionStart' : game.phase === 'comeOut' ? 'comeOutStart' : 'rollSettled', record: game.history.at(-1) };
      initialSuggestions = evaluateStrategy(strategy, game, context).map((proposal) => ({ proposal, context }));
    }
    for (const suggestion of initialSuggestions.filter((item) => item.proposal.valid)) next = applyProposal(next, suggestion.proposal, suggestion.context).state;
    if (next.wagers.length === 0) {
      setMessage('Strategy has no valid opening wager.');
      return;
    }
    watchingRef.current = true;
    setWatching(true);
    setGame(next);
    setSuggestions([]);
    setBetHistory([]);
    setBetFuture([]);
    setPointConflict(null);
    setMessage(`Watching ${strategy.name}.`);
    watchTimer.current = setTimeout(() => executeRoll(next, true), watchDelayRef.current);
  };

  const applySuggestion = (suggestion: Suggestion) => {
    const result = applyProposal(game, suggestion.proposal, suggestion.context);
    if (!result.error) recordBetChange(result.state);
    setPointConflict(null);
    setMessage(result.error ?? suggestion.proposal.explanation);
    setSuggestions((items) => items.filter((item) => item !== suggestion));
  };

  const applyAll = () => {
    let next = game;
    for (const suggestion of suggestions.filter((item) => item.proposal.valid)) next = applyProposal(next, suggestion.proposal, suggestion.context).state;
    recordBetChange(next);
    setSuggestions([]);
    setPointConflict(null);
    setMessage('Strategy suggestions applied.');
  };

  const pointConflictWager = pointConflict ? game.wagers.find((wager) => wager.id === pointConflict.wagerId) : undefined;
  const pointConflictMoves = pointConflictWager
    ? POINTS.filter((point) => point !== pointConflict?.point && validateBet({ ...game, bankroll: game.bankroll + pointConflictWager.amount, wagers: game.wagers.filter((wager) => wager.id !== pointConflictWager.id) }, {
      kind: pointConflictWager.kind,
      amount: pointConflictWager.amount,
      target: point,
      working: pointConflictWager.working,
    }).valid)
    : [];

  const moveConflictingBet = (target: PointNumber) => {
    if (!pointConflictWager) return;
    const result = moveWagerTarget(game, pointConflictWager.id, target);
    if (!result.error) recordBetChange(result.state);
    setPointConflict(null);
    setMessage(result.error ?? `${wagerLabel(pointConflictWager)} moved to ${target}.`);
  };

  const removeConflictingBet = () => {
    if (!pointConflictWager) return;
    const result = removeWager(game, pointConflictWager.id);
    if (!result.error) recordBetChange(result.state);
    setPointConflict(null);
    setMessage(result.error ?? `${wagerLabel(pointConflictWager)} taken down.`);
  };

  const inspect = game.wagers.find((wager) => wager.id === selectedWager);
  const latest = game.history.at(-1);
  const lastRolls = game.history.slice(-8).reverse();
  const numberOdds: Record<PointNumber, string> = { 4: '9:5', 5: '7:5', 6: '7:6', 8: '7:6', 9: '7:5', 10: '9:5' };
  const handleFeltLayout = (event: LayoutChangeEvent) => setFeltSize(event.nativeEvent.layout);
  const invalidWager = invalidWagerForRoll(game);
  const canRoll = game.wagers.length > 0 && !rolling && !watching && !game.stopped && !pointConflictWager && !invalidWager;
  const chooseStrategy = (id: string) => {
    if (watchingRef.current) stopWatching('Strategy watch stopped.');
    onSelectStrategy(id);
  };
  const selectChip = (value: number) => {
    setChip(value);
    onChangeSettings({ ...settings, selectedChip: value });
  };

  return (
    <View style={styles.screen}>
      {winFlash !== null ? <View pointerEvents="none" style={styles.winFlash}><Text style={styles.winFlashText}>{formatMoney(winFlash, true)}</Text><Text style={styles.winFlashLabel}>WIN</Text></View> : null}
      <View style={styles.topbar}>
        <View><Text style={styles.eyebrow}>BANKROLL</Text><Money value={game.bankroll} style={styles.bigMoney} /></View>
        <View><Text style={styles.eyebrow}>ON TABLE</Text><Money value={game.wagers.reduce((sum, wager) => sum + wager.amount, 0)} /></View>
        <View><Text style={styles.eyebrow}>SESSION</Text><Money value={sessionProfit(game)} signed style={{ color: sessionProfit(game) >= 0 ? colors.success : colors.danger }} /></View>
        <View><Text style={styles.eyebrow}>SHOOTER</Text><Text style={styles.shooterNumber}>#{game.shooterCount}</Text></View>
        <View style={styles.puck}><Text style={styles.puckSmall}>{game.point ? 'ON' : 'OFF'}</Text><Text style={styles.puckNumber}>{game.point ?? '—'}</Text></View>
        <View style={styles.strategyPicker}>
          <Text style={styles.eyebrow}>MANUAL STRATEGY</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Button label="None" variant={!selectedStrategyId ? 'primary' : 'ghost'} onPress={() => chooseStrategy('')} style={styles.strategyButton} />
            {strategies.map((item) => <Button key={item.id} label={item.name} variant={item.id === selectedStrategyId ? 'primary' : 'ghost'} onPress={() => chooseStrategy(item.id)} style={styles.strategyButton} />)}
          </ScrollView>
        </View>
        <Button label="New session" variant="secondary" onPress={reset} />
      </View>

      <View style={styles.body}>
        <View style={styles.tableColumn}>
          <View style={styles.tableRail}>
          <View style={styles.felt} onLayout={handleFeltLayout}>
            <View style={styles.feltWearOne} /><View style={styles.feltWearTwo} />
            <View style={styles.wallLabel}>
              <View style={styles.pyramidRail}>{Array.from({ length: 34 }, (_, index) => <View key={index} style={[styles.railPyramid, index % 2 === 0 && styles.railPyramidDim]} />)}</View>
              <Text style={styles.wallText}>HIT THE BACK WALL</Text>
            </View>
            <View style={styles.numberMode}>
              {(['place', 'buy', 'lay'] as const).map((mode) => <Button key={mode} label={mode.toUpperCase()} variant={numberMode === mode ? 'primary' : 'ghost'} onPress={() => setNumberMode(mode)} style={styles.modeButton} />)}
            </View>
            <View style={styles.numberRow}>
              {POINTS.map((point) => <BetZone
                key={point}
                label={String(point)}
                sublabel={numberMode === 'place' ? numberOdds[point] : numberMode === 'buy' ? 'TRUE −5%' : '7 FIRST'}
                stacks={[
                  { key: numberMode, amount: amountOn(game, numberMode, point), label: numberMode.toUpperCase() },
                  { key: 'come', amount: amountWhere(game, (wager) => wager.kind === 'come' && wager.comePoint === point), label: 'COME' },
                  { key: 'dontCome', amount: amountWhere(game, (wager) => wager.kind === 'dontCome' && wager.comePoint === point), label: 'DC' },
                  { key: 'comeOdds', amount: amountWhere(game, (wager) => wager.kind === 'comeOdds' && wager.target === point), label: 'ODDS' },
                  { key: 'dontComeOdds', amount: amountWhere(game, (wager) => wager.kind === 'dontComeOdds' && wager.target === point), label: 'LAY' },
                ]}
                onPress={() => addBet({ kind: numberMode, target: point })}
                active={game.point === point}
              />)}
            </View>
            <View style={styles.dontComeRow}>
              <BetZone label="DON’T COME" sublabel="BAR 12 · FLAT BET" amount={amountWhere(game, (wager) => wager.kind === 'dontCome' && !wager.contract)} onPress={() => addBet({ kind: 'dontCome' })} />
            </View>
            <View style={styles.casinoActionRows}>
              <BetZone label="BIG 6" sublabel="EVEN" amount={amountOn(game, 'big6')} onPress={() => addBet({ kind: 'big6' })} compact />
              <View style={styles.centerFeltRows}>
                <BetZone label="COME" sublabel="PAYS 1 TO 1" amount={amountWhere(game, (wager) => wager.kind === 'come' && !wager.contract)} onPress={() => addBet({ kind: 'come' })} />
                <FieldZone amount={amountOn(game, 'field')} onPress={() => addBet({ kind: 'field' })} />
              </View>
              <BetZone label="BIG 8" sublabel="EVEN" amount={amountOn(game, 'big8')} onPress={() => addBet({ kind: 'big8' })} compact />
            </View>
            <View style={styles.lineRows}>
              <BetZone label="DON’T PASS" sublabel="BAR 12" amount={amountOn(game, 'dontPass')} onPress={() => addBet({ kind: 'dontPass' })} />
              <BetZone label="PASS LINE" sublabel="PAYS 1 TO 1" amount={amountOn(game, 'pass')} onPress={() => addBet({ kind: 'pass' })} />
            </View>
            <Text style={styles.feltBrand}>◆  CRAPS STRATEGY LAB  ◆  3–4–5× ODDS  ◆</Text>
            <View pointerEvents="none" style={styles.leftLineArm}><Text style={styles.lineArmText}>PASS LINE</Text></View>
            <View pointerEvents="none" style={styles.rightLineArm}><Text style={styles.lineArmText}>PASS LINE</Text></View>
            {diceLocation !== 'tray' ? <Suspense fallback={null}>
              <DiceThrow
                faces={dice as [1 | 2 | 3 | 4 | 5 | 6, 1 | 2 | 3 | 4 | 5 | 6]}
                rolling={rolling}
                duration={animationMs}
                width={feltSize.width}
                height={feltSize.height}
                landing={landing}
                returning={diceLocation === 'returning'}
              />
            </Suspense> : null}
          </View>
          </View>

          <View style={styles.controls}>
            <View style={styles.controlMain}>
            <View style={styles.chipTray}>{CHIP_VALUES.map((value) => <Chip key={value} value={value} selected={chip === value} onPress={() => selectChip(value)} />)}</View>
            {diceLocation === 'tray' ? <DiceResult faces={dice as [1 | 2 | 3 | 4 | 5 | 6, 1 | 2 | 3 | 4 | 5 | 6]} /> : <View style={styles.diceResultPlaceholder} />}
            <View style={styles.rollArea}>
              <Text style={styles.message} numberOfLines={2}>{message}</Text>
              <Button label={rolling ? 'ROLLING…' : 'ROLL DICE'} onPress={doRoll} disabled={!canRoll} style={styles.rollButton} />
            </View>
            </View>
            <View style={styles.automationBar}>
              <Button label="UNDO BET" variant="ghost" onPress={undoBet} disabled={betHistory.length === 0 || rolling || watching} style={styles.toolButton} />
              <Button label="REDO" variant="ghost" onPress={redoBet} disabled={betFuture.length === 0 || rolling || watching} style={styles.toolButton} />
              <Text style={styles.watchLabel}>WATCH SPEED</Text>
              {WATCH_SPEEDS.map((delay) => <Button key={delay} label={`${delay / 1000}s`} variant={watchDelay === delay ? 'primary' : 'ghost'} onPress={() => { setWatchDelay(delay); watchDelayRef.current = delay; }} style={styles.speedButton} />)}
              <Button label={watching ? 'STOP WATCH' : 'WATCH STRATEGY'} variant={watching ? 'danger' : 'secondary'} onPress={() => watching ? stopWatching() : startWatching()} disabled={rolling && !watching} style={styles.watchButton} />
            </View>
          </View>
        </View>

        <ScrollView style={styles.sidePanel} contentContainerStyle={styles.sideContent}>
          <View style={styles.propFelt}>
          <Text style={styles.propOverline}>STICKMAN · CENTER ACTION</Text>
          <Text style={styles.panelTitle}>HARDWAYS</Text>
          <View style={styles.propGrid}>
            {([4, 6, 8, 10] as PointNumber[]).map((point) => <BetZone key={`hard-${point}`} label={`HARD ${point}`} sublabel={point === 4 || point === 10 ? '7:1' : '9:1'} amount={amountOn(game, 'hardway', point)} onPress={() => addBet({ kind: 'hardway', target: point })} compact />)}
          </View>
          <Text style={styles.propSectionLabel}>ONE ROLL</Text>
          <View style={styles.propGrid}>
            <BetZone label="ACES" sublabel="30:1 · 1–1" amount={amountOn(game, 'number2')} onPress={() => addBet({ kind: 'number2' })} compact tone="red" />
            <BetZone label="ACE–DEUCE" sublabel="15:1 · 1–2" amount={amountOn(game, 'number3')} onPress={() => addBet({ kind: 'number3' })} compact tone="red" />
            <BetZone label="YO ELEVEN" sublabel="15:1 · 5–6" amount={amountOn(game, 'number11')} onPress={() => addBet({ kind: 'number11' })} compact tone="red" />
            <BetZone label="BOXCARS" sublabel="30:1 · 6–6" amount={amountOn(game, 'number12')} onPress={() => addBet({ kind: 'number12' })} compact tone="red" />
            <BetZone label="ANY 7" sublabel="4:1" amount={amountOn(game, 'any7')} onPress={() => addBet({ kind: 'any7' })} compact tone="gold" />
            <BetZone label="ANY CRAPS" sublabel="7:1" amount={amountOn(game, 'anyCraps')} onPress={() => addBet({ kind: 'anyCraps' })} compact tone="red" />
            <BetZone label="HORN" sublabel="2 · 3 · 11 · 12" amount={amountOn(game, 'horn')} onPress={() => addBet({ kind: 'horn' })} compact tone="red" />
            <BetZone label="C & E" sublabel="CRAPS · ELEVEN" amount={amountOn(game, 'ce')} onPress={() => addBet({ kind: 'ce' })} compact tone="red" />
          </View>

          <Text style={styles.propSectionLabel}>HOP BETS · HARD 30:1 · EASY 15:1</Text>
          <View style={styles.hopGrid}>{HOPS.map((hop) => <Button key={String(hop)} label={`${hop} ${String(hop)[0] === String(hop)[2] ? '30:1' : '15:1'}`} variant="ghost" onPress={() => addBet({ kind: 'hop', target: hop })} style={styles.hopButton} />)}</View>
          </View>

          <Text style={styles.panelSubtitle}>Active wagers</Text>
          {game.wagers.length === 0 ? <Text style={styles.empty}>No action yet.</Text> : game.wagers.map((wager) => (
            <Button key={wager.id} label={`${wagerLabel(wager)} · ${formatMoney(wager.amount)}${wager.working ? '' : ' · OFF'}`} variant={selectedWager === wager.id ? 'primary' : 'ghost'} onPress={() => setSelectedWager(wager.id)} style={styles.wagerButton} />
          ))}
          {inspect ? <WagerInspector wager={inspect} state={game} onChange={(next, text) => { if (next !== game) recordBetChange(next); setMessage(text); }} /> : null}

          {pointConflictWager ? (
            <View style={styles.pointConflict}>
              <Text style={styles.pointConflictTitle}>{`Point ${pointConflict?.point} has your ${wagerLabel(pointConflictWager)} up.`}</Text>
              <Text style={styles.pointConflictText}>Move it or take it down before the next roll.</Text>
              <View style={styles.pointConflictActions}>
                {pointConflictMoves.map((point) => <Button key={point} label={`Move ${point}`} variant="secondary" onPress={() => moveConflictingBet(point)} style={styles.conflictButton} />)}
                <Button label="Take down" variant="danger" onPress={removeConflictingBet} style={styles.conflictButton} />
                <Button label="Leave" variant="ghost" onPress={() => { setPointConflict(null); setMessage(`${wagerLabel(pointConflictWager)} left on the point.`); }} style={styles.conflictButton} />
              </View>
            </View>
          ) : null}

          {suggestions.length ? (
            <View style={styles.suggestions}>
              <View style={styles.suggestionHeader}><Text style={styles.panelSubtitle}>Strategy suggestions</Text><Button label="Apply all" onPress={applyAll} /></View>
              {suggestions.map((suggestion) => (
                <View key={`${suggestion.proposal.id}-${suggestion.context.trigger}`} style={styles.suggestion}>
                  <View style={{ flex: 1 }}><Text style={styles.suggestionRule}>{suggestion.proposal.ruleName}</Text><Text style={styles.suggestionText}>{suggestion.proposal.explanation}</Text>{suggestion.proposal.reason ? <Text style={styles.invalid}>{suggestion.proposal.reason}</Text> : null}</View>
                  <Button label="Apply" onPress={() => applySuggestion(suggestion)} disabled={!suggestion.proposal.valid} variant="secondary" />
                </View>
              ))}
            </View>
          ) : null}

          <Text style={styles.panelSubtitle}>Roll history</Text>
          {lastRolls.map((roll) => <View key={roll.index} style={styles.historyRow}><Text style={styles.historyIndex}>#{roll.index}</Text><Text style={styles.historyShooter}>S{roll.shooterNumber ?? '?'}</Text><Text style={styles.historyDice}>{roll.die1} + {roll.die2}</Text><Text style={styles.historyTotal}>{roll.total}</Text><Text style={styles.historyPoint}>{roll.pointAfter ? `Point ${roll.pointAfter}` : 'Come out'}</Text></View>)}
          {latest ? <Text style={styles.seed} selectable>Seed: {game.seed}</Text> : null}
        </ScrollView>
      </View>
    </View>
  );
}

function WagerInspector({ wager, state, onChange }: { wager: Wager; state: GameState; onChange: (state: GameState, message: string) => void }) {
  const eligibleOdds = wager.contract && ['pass', 'dontPass', 'come', 'dontCome'].includes(wager.kind) && !state.wagers.some((item) => item.parentId === wager.id);
  const takeOdds = () => {
    const point = (wager.kind === 'pass' || wager.kind === 'dontPass' ? wager.target : wager.comePoint) as PointNumber;
    const dark = wager.kind === 'dontPass' || wager.kind === 'dontCome';
    const kind = dark ? (wager.kind === 'dontPass' ? 'dontOdds' : 'dontComeOdds') : (wager.kind === 'pass' ? 'passOdds' : 'comeOdds');
    const requested = dark ? wager.amount * state.ruleset.dontOddsMultiple : wager.amount * state.ruleset.passOddsMultiples[point];
    const unit = requiredUnit({ kind, amount: requested, target: point, parentId: wager.id }, state);
    const amount = Math.floor(Math.min(requested, state.bankroll) / unit) * unit;
    const result = placeWager(state, { kind, amount, target: point, parentId: wager.id });
    onChange(result.state, result.error ?? `Added ${formatMoney(amount)} odds.`);
  };
  return (
    <View style={styles.inspector}>
      <Text style={styles.inspectorTitle}>{`${wagerLabel(wager)} · ${formatMoney(wager.amount)}`}</Text>
      <View style={styles.inspectorButtons}>
        <Button label="Remove" variant="danger" onPress={() => { const result = removeWager(state, wager.id); onChange(result.state, result.error ?? 'Wager removed.'); }} />
        {!['pass', 'dontPass', 'come', 'dontCome', 'field', 'horn', 'ce', 'any7', 'anyCraps', 'number2', 'number3', 'number11', 'number12', 'hop'].includes(wager.kind) ? <Button label={wager.working ? 'Turn off' : 'Working'} variant="secondary" onPress={() => { const result = setWagerWorking(state, wager.id, !wager.working); onChange(result.state, result.error ?? 'Working state updated.'); }} /> : null}
        {eligibleOdds ? <Button label="Max odds" onPress={takeOdds} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: colors.background },
  winFlash: { position: 'absolute', top: 105, left: '30%', minWidth: 180, alignItems: 'center', zIndex: 100, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 18, backgroundColor: 'rgba(7,13,10,0.78)', borderWidth: 1, borderColor: '#e1bd58', shadowColor: '#f0c65a', shadowOpacity: 0.85, shadowRadius: 18 },
  winFlashText: { color: '#f4cc62', fontSize: 48, lineHeight: 52, fontWeight: '900', fontVariant: ['tabular-nums'], textShadowColor: '#7c5512', textShadowRadius: 8 },
  winFlashLabel: { color: '#d6b55e', fontSize: 8, fontWeight: '900', letterSpacing: 3 },
  topbar: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 22, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#2f352f', backgroundColor: '#080d0b' },
  eyebrow: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginBottom: 2 },
  bigMoney: { fontSize: 22 },
  shooterNumber: { color: colors.gold, fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  puck: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#f5eee0', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.gold },
  puckSmall: { fontSize: 9, color: '#111', fontWeight: '900' },
  puckNumber: { fontSize: 20, lineHeight: 21, color: '#111', fontWeight: '900' },
  strategyPicker: { flex: 1, minWidth: 190 },
  strategyButton: { marginRight: 6, minHeight: 32 },
  body: { flex: 1, minHeight: 0, flexDirection: 'row' },
  tableColumn: { flex: 1.75, minWidth: 600, minHeight: 0 },
  tableRail: { flex: 1, minHeight: 430, margin: 7, padding: 9, borderRadius: 40, backgroundColor: '#24170f', borderWidth: 2, borderColor: '#5a3e29', shadowColor: '#000', shadowOpacity: 0.8, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  felt: { flex: 1, minHeight: 410, backgroundColor: colors.felt, borderWidth: 2, borderColor: '#8f7543', borderRadius: 30, paddingHorizontal: 14, paddingBottom: 9, paddingTop: 38, overflow: 'hidden' },
  feltWearOne: { position: 'absolute', width: 310, height: 310, borderRadius: 155, left: '15%', top: '18%', backgroundColor: 'rgba(255,255,255,0.012)' },
  feltWearTwo: { position: 'absolute', width: 260, height: 260, borderRadius: 130, right: '8%', bottom: '-18%', backgroundColor: 'rgba(0,0,0,0.035)' },
  wallLabel: { position: 'absolute', top: 0, left: 0, right: 0, height: 30, backgroundColor: '#090d0b', borderBottomWidth: 1, borderBottomColor: '#75623b', alignItems: 'center', justifyContent: 'center' },
  pyramidRail: { position: 'absolute', left: 8, right: 8, top: 4, height: 22, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', opacity: 0.7 },
  railPyramid: { width: 9, height: 9, backgroundColor: '#b09d71', transform: [{ rotate: '45deg' }] },
  railPyramidDim: { opacity: 0.35 },
  wallText: { color: '#e2d5ae', backgroundColor: '#090d0b', paddingHorizontal: 13, fontSize: 8, fontWeight: '900', letterSpacing: 2.4 },
  numberMode: { flexDirection: 'row', alignSelf: 'center', gap: 5, marginBottom: 5 },
  modeButton: { minHeight: 27, minWidth: 68 },
  numberRow: { flex: 1.15, flexDirection: 'row', gap: 3 },
  dontComeRow: { flex: 0.48, flexDirection: 'row', marginTop: 3 },
  casinoActionRows: { flex: 1.35, flexDirection: 'row', gap: 3, marginTop: 3 },
  centerFeltRows: { flex: 4, gap: 3 },
  lineRows: { flex: 0.62, flexDirection: 'row', gap: 3, marginTop: 3, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, overflow: 'hidden' },
  zoneWrap: { flex: 1, alignItems: 'stretch', minWidth: 66 },
  compactZoneWrap: { minWidth: 80 },
  zone: { flex: 1, minHeight: 38, borderRadius: 2, borderWidth: 1, borderColor: colors.line, backgroundColor: 'rgba(2,14,11,0.18)', alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 4, paddingTop: 4 },
  compactZone: { minHeight: 38, paddingHorizontal: 5 },
  activeZone: { backgroundColor: colors.gold },
  redZone: { backgroundColor: 'rgba(92,18,27,0.72)', borderColor: '#c98682' },
  goldZone: { backgroundColor: 'rgba(118,84,19,0.62)', borderColor: '#ddbd6c' },
  pressedZone: { opacity: 0.7 },
  zoneLabel: { color: '#eee8d3', fontSize: 12, fontWeight: '900', textAlign: 'center', letterSpacing: 0.35 },
  numberZoneLabel: { fontSize: 21, lineHeight: 22, letterSpacing: 0.5 },
  activeZoneText: { color: '#142018' },
  zoneOdds: { color: '#cbb87d', fontSize: 7, textAlign: 'center', fontWeight: '900', marginTop: 1, letterSpacing: 0.55 },
  zoneStacks: { flex: 1, minHeight: 28, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 1, paddingTop: 1, flexWrap: 'wrap', alignContent: 'flex-end' },
  fieldZone: { flex: 1, minHeight: 58, borderRadius: 2, borderWidth: 1, borderColor: colors.line, backgroundColor: 'rgba(2,14,11,0.18)', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'visible' },
  fieldTitle: { position: 'absolute', top: 3, color: '#eee8d3', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  fieldNumbers: { marginTop: 14, width: '82%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldDouble: { width: 47, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#c9b277', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(126,21,30,0.55)' },
  fieldBigNumber: { color: '#f2e9d2', fontSize: 16, lineHeight: 16, fontWeight: '900' },
  fieldPay: { color: '#e5cf91', fontSize: 5, lineHeight: 6, fontWeight: '900' },
  fieldRun: { flex: 1, color: '#eee8d3', fontSize: 11, fontWeight: '900', textAlign: 'center', letterSpacing: 1 },
  fieldChip: { position: 'absolute', right: 7, bottom: 3 },
  feltBrand: { color: 'rgba(225,207,153,0.64)', fontWeight: '900', fontSize: 8, letterSpacing: 2, textAlign: 'center', marginTop: 4 },
  leftLineArm: { position: 'absolute', left: 2, top: 176, bottom: 35, width: 12, borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#c9b277', alignItems: 'center', justifyContent: 'center' },
  rightLineArm: { position: 'absolute', right: 2, top: 176, bottom: 35, width: 12, borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#c9b277', alignItems: 'center', justifyContent: 'center' },
  lineArmText: { width: 100, color: 'rgba(231,216,172,0.55)', fontSize: 6, fontWeight: '900', letterSpacing: 1.3, textAlign: 'center', transform: [{ rotate: '-90deg' }] },
  controls: { minHeight: 154, paddingHorizontal: 10, paddingVertical: 5, gap: 4, borderTopWidth: 1, borderTopColor: '#292f2b', backgroundColor: colors.panel },
  controlMain: { flex: 1, width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10 },
  chipTray: { flexDirection: 'row', alignItems: 'center' },
  diceResultPlaceholder: { width: 106, height: 58 },
  rollArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  message: { flex: 1, color: colors.muted, fontSize: 11 },
  rollButton: { minWidth: 122, minHeight: 58 },
  automationBar: { minHeight: 34, width: '100%', flexDirection: 'row', alignItems: 'center', gap: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#303832', paddingTop: 4 },
  toolButton: { minHeight: 29, paddingHorizontal: 9 },
  watchLabel: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1, marginLeft: 5 },
  speedButton: { minHeight: 29, minWidth: 43, paddingHorizontal: 6 },
  watchButton: { minHeight: 31, minWidth: 128, marginLeft: 'auto' },
  sidePanel: { flex: 1, minWidth: 340, minHeight: 0, maxWidth: 520, borderLeftWidth: 1, borderLeftColor: '#343b36', backgroundColor: colors.panel },
  sideContent: { padding: 14, gap: 9 },
  panelTitle: { color: colors.ink, fontWeight: '900', fontSize: 20 },
  panelSubtitle: { color: colors.ink, fontWeight: '900', fontSize: 14, marginTop: 7 },
  propFelt: { padding: 9, gap: 6, borderRadius: 13, borderWidth: 2, borderColor: '#5c4329', backgroundColor: '#071f18', shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 7 },
  propOverline: { color: '#a98f58', fontSize: 7, fontWeight: '900', letterSpacing: 2.1, textAlign: 'center' },
  propSectionLabel: { color: '#d6bf80', fontSize: 9, fontWeight: '900', letterSpacing: 1.4, textAlign: 'center', marginTop: 2 },
  propGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  hopGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  hopButton: { minHeight: 30, minWidth: 74, paddingHorizontal: 5 },
  wagerButton: { minHeight: 34, alignItems: 'flex-start', marginBottom: 3 },
  empty: { color: colors.muted, fontStyle: 'italic' },
  inspector: { backgroundColor: colors.background, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#345f50', gap: 8 },
  inspectorTitle: { color: colors.ink, fontWeight: '900' },
  inspectorButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pointConflict: { backgroundColor: '#15150d', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.gold, gap: 7 },
  pointConflictTitle: { color: colors.gold, fontWeight: '900', fontSize: 12 },
  pointConflictText: { color: colors.ink, fontSize: 11 },
  pointConflictActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  conflictButton: { minHeight: 31, paddingHorizontal: 9 },
  suggestions: { borderTopWidth: 1, borderTopColor: '#31594b', paddingTop: 7, gap: 6 },
  suggestionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  suggestion: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.panelLight, padding: 9, borderRadius: 9 },
  suggestionRule: { color: colors.gold, fontSize: 11, fontWeight: '900' },
  suggestionText: { color: colors.ink, fontSize: 12 },
  invalid: { color: colors.danger, fontSize: 10 },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#315448' },
  historyIndex: { color: colors.muted, width: 38, fontSize: 11 },
  historyShooter: { color: '#c8ae6d', width: 28, fontSize: 10, fontWeight: '900' },
  historyDice: { color: colors.ink, width: 56, fontWeight: '700' },
  historyTotal: { color: colors.gold, fontWeight: '900', fontSize: 17, width: 32 },
  historyPoint: { color: colors.muted, fontSize: 11 },
  seed: { color: '#6e9487', fontSize: 9, marginTop: 8 },
});

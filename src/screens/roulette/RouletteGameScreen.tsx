import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { resolveStrategy } from '../../blackjack/betting';
import { CustomBettingStrategy, loadCustomStrategies } from '../../casino/customStrategies';
import { createManualSeed } from '../../domain/rng';
import { OUTSIDE_BETS, bestHit, coveredPockets, createRouletteState, houseEdge, nextStrategyStep, sessionProfit, spin, strategyStepBets, syncRunners, totalStake } from '../../roulette/engine';
import { RouletteSettings, loadRouletteStrategies, saveRouletteStrategies } from '../../roulette/storage';
import { rouColors } from '../../roulette/theme';
import { MAX_STRATEGY_STEPS, RouletteBetId, RouletteState, SavedRouletteStrategy } from '../../roulette/types';
import { POCKET_ORDER, pocketColor } from '../../roulette/wheel';
import { Button, Chip, Field, Money, formatMoney } from '../../ui/components';
import { ChartPalette, ProfitChart } from '../../ui/ProfitChart';
import { PocketBadge, RouletteWheel } from './RouletteWheel';

const CHIP_VALUES = [1, 5, 10, 25, 50, 100, 500];
const SPEEDS = [1, 4, 10, 30];

const CHART_PALETTE: ChartPalette = {
  background: rouColors.background,
  border: '#2c1a45',
  accent: rouColors.gold,
  ink: rouColors.ink,
  muted: rouColors.muted,
  success: rouColors.success,
  danger: rouColors.danger,
};

const POCKET_STYLE = { red: rouColors.pocketRed, black: rouColors.pocketBlack, green: rouColors.pocketGreen };

function NumberCell({ pocket, amount, onPress, wide }: { pocket: string; amount: number; onPress: () => void; wide?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.numberCell, wide && styles.zeroCell, { backgroundColor: POCKET_STYLE[pocketColor(pocket)] }, pressed && styles.pressedCell]}>
      <Text style={styles.numberText}>{pocket}</Text>
      {amount > 0 ? <View style={styles.amountBadge}><Text style={styles.amountText}>{amount}</Text></View> : null}
    </Pressable>
  );
}

function OutsideCell({ label, amount, onPress, flex = 1 }: { label: string; amount: number; onPress: () => void; flex?: number }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.outsideCell, { flex }, pressed && styles.pressedCell]}>
      <Text style={styles.outsideText}>{label}</Text>
      {amount > 0 ? <View style={styles.amountBadge}><Text style={styles.amountText}>{amount}</Text></View> : null}
    </Pressable>
  );
}

export function RouletteGameScreen({ settings }: { settings: RouletteSettings }) {
  const makeState = () => createRouletteState({
    seed: createManualSeed(),
    startingBankroll: settings.startingBankroll,
    rules: { wheel: settings.wheel, tableMinimum: settings.tableMinimum, tableMaximum: settings.tableMaximum },
  });
  const [game, setGame] = useState<RouletteState>(makeState);
  const [pendingBets, setPendingBets] = useState<Record<RouletteBetId, number>>({});
  const [chip, setChip] = useState(5);
  const [spinning, setSpinning] = useState(false);
  const [autoOn, setAutoOn] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [strategies, setStrategies] = useState<SavedRouletteStrategy[]>([]);
  const [saveName, setSaveName] = useState('');
  const [message, setMessage] = useState('Place chips, then spin. After the first spin the wheel keeps going on its own.');

  // the spin/auto timer chain reads refs; plain state would go stale in the closures
  const gameRef = useRef(game);
  const betsRef = useRef(pendingBets);
  const spinningRef = useRef(false);
  const autoRef = useRef(false);
  const speedRef = useRef(1);
  const strategiesRef = useRef<SavedRouletteStrategy[]>([]);
  const stepsRef = useRef<Record<string, number>>({});
  const customsRef = useRef<CustomBettingStrategy[]>([]);
  const settingsRef = useRef(settings);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const nextTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tickTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  gameRef.current = game;
  betsRef.current = pendingBets;
  settingsRef.current = settings;

  useEffect(() => {
    loadCustomStrategies().then((loaded) => { customsRef.current = loaded; }).catch(() => undefined);
    loadRouletteStrategies().then((loaded) => {
      strategiesRef.current = loaded;
      setStrategies(loaded);
      setGame((state) => syncRunners(state, loaded));
    }).catch(() => undefined);
    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      if (nextTimer.current) clearTimeout(nextTimer.current);
      if (tickTimer.current) clearInterval(tickTimer.current);
    };
  }, []);

  const clearTimers = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    if (nextTimer.current) clearTimeout(nextTimer.current);
    if (tickTimer.current) clearInterval(tickTimer.current);
    setCountdown(null);
  };

  const stopAuto = (text = 'Auto-spin stopped.') => {
    autoRef.current = false;
    setAutoOn(false);
    clearTimers();
    if (!spinningRef.current) setMessage(text);
  };

  const scheduleNext = () => {
    if (!autoRef.current) return;
    // a real table spins every 30-60 seconds; the speed setting compresses the wait
    const delaySeconds = (30 + Math.random() * 30) / speedRef.current;
    let remaining = Math.max(1, Math.round(delaySeconds));
    setCountdown(remaining);
    if (tickTimer.current) clearInterval(tickTimer.current);
    tickTimer.current = setInterval(() => {
      remaining -= 1;
      setCountdown(Math.max(0, remaining));
    }, 1000);
    if (nextTimer.current) clearTimeout(nextTimer.current);
    nextTimer.current = setTimeout(() => {
      if (tickTimer.current) clearInterval(tickTimer.current);
      setCountdown(null);
      doSpin();
    }, delaySeconds * 1000);
  };

  // stakes for every enabled saved strategy: multi-step ladders bet their current step's
  // layout as-is; single-layout strategies scale by their progression
  const runnerStakes = () => {
    const maxUnits = settingsRef.current.progressionMaxUnits;
    return strategiesRef.current.filter((item) => item.enabled).map((item) => {
      const step = stepsRef.current[item.id] ?? 0;
      if (item.steps.length > 1) return { strategyId: item.id, bets: { ...strategyStepBets(item, step) } };
      const resolved = resolveStrategy(item.progression, customsRef.current);
      const scale = resolved.unitsForStep(step, maxUnits);
      const bets: Record<string, number> = {};
      for (const [id, amount] of Object.entries(item.bets)) bets[id] = amount * scale;
      return { strategyId: item.id, bets };
    });
  };

  const doSpin = () => {
    if (spinningRef.current) return;
    const result = spin(gameRef.current, betsRef.current, runnerStakes());
    if (result.error) { setMessage(result.error); stopAuto(result.error); return; }
    spinningRef.current = true;
    setSpinning(true);
    setMessage('No more bets — wheel is spinning.');
    const next = result.state;
    setGame(next);
    // advance each runner from its net: step ladders walk their steps, single layouts walk their progression
    for (const [strategyId, net] of Object.entries(result.record!.runnerNets)) {
      const strategy = strategiesRef.current.find((item) => item.id === strategyId);
      if (!strategy) continue;
      if (strategy.steps.length > 1) {
        stepsRef.current[strategyId] = nextStrategyStep(strategy, stepsRef.current[strategyId] ?? 0, net);
      } else {
        const resolved = resolveStrategy(strategy.progression, customsRef.current);
        stepsRef.current[strategyId] = resolved.nextStep(stepsRef.current[strategyId] ?? 0, net);
      }
    }
    const animMs = Math.min(9000, Math.max(1200, (next.lastTrace?.durationMs ?? 4000) / speedRef.current));
    settleTimer.current = setTimeout(() => {
      spinningRef.current = false;
      setSpinning(false);
      setMessage(next.events.join(' · '));
      if (autoRef.current) scheduleNext();
    }, animMs);
  };

  const startSpin = () => {
    if (spinningRef.current) return;
    autoRef.current = true;
    setAutoOn(true);
    doSpin();
  };

  const addChip = (id: RouletteBetId) => {
    if (spinningRef.current) return;
    setPendingBets((bets) => ({ ...bets, [id]: Math.min((bets[id] ?? 0) + chip, gameRef.current.rules.tableMaximum) }));
  };

  const saveStrategy = () => {
    const name = saveName.trim();
    if (!name) { setMessage('Name the strategy before saving.'); return; }
    if (totalStake(pendingBets) === 0) { setMessage('Stack some chips first — the current layout becomes the strategy.'); return; }
    const strategy: SavedRouletteStrategy = {
      id: `layout-${Math.random().toString(36).slice(2, 10)}`,
      name,
      bets: { ...pendingBets },
      steps: [{ ...pendingBets }],
      onWin: 'reset',
      onLoss: 'advance',
      loop: false,
      progression: 'flat',
      enabled: true,
    };
    const next = [...strategiesRef.current, strategy];
    strategiesRef.current = next;
    setStrategies(next);
    saveRouletteStrategies(next).catch(() => undefined);
    setGame((state) => syncRunners(state, next));
    setSaveName('');
    setMessage(`Saved "${name}" — it now bets this layout on every spin. Add steps below or tune it in Settings.`);
  };

  // append the felt layout as the next step of an existing strategy (multi-step systems, max 6)
  const addStepTo = (id: string) => {
    if (totalStake(pendingBets) === 0) { setMessage('Stack chips first — the current layout becomes the next step.'); return; }
    const target = strategiesRef.current.find((item) => item.id === id);
    if (!target || target.steps.length >= MAX_STRATEGY_STEPS) return;
    const next = strategiesRef.current.map((item) => item.id === id ? { ...item, steps: [...item.steps, { ...pendingBets }] } : item);
    strategiesRef.current = next;
    setStrategies(next);
    saveRouletteStrategies(next).catch(() => undefined);
    setMessage(`"${target.name}" step ${target.steps.length + 1} saved: ${formatMoney(totalStake(pendingBets))} layout. Wins ${target.onWin} · losses ${target.onLoss}.`);
  };

  const reset = () => {
    stopAuto();
    spinningRef.current = false;
    setSpinning(false);
    stepsRef.current = {};
    const fresh = syncRunners(makeState(), strategiesRef.current);
    setGame(fresh);
    setPendingBets({});
    setMessage('New session ready. Place chips, then spin.');
  };

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // phone held sideways: keep the two-column table+panel layout but shrink all chrome to fit the short height
  const shortLandscape = windowWidth > windowHeight && windowHeight < 520 && windowWidth < 1200;
  const narrow = windowWidth < 900 && !shortLandscape;
  const phone = windowWidth < 500;
  const compact = phone || shortLandscape;
  const TopBar = ({ children }: { children: React.ReactNode }) => compact
    ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.topbarScroller} contentContainerStyle={styles.topbarRow}>{children}</ScrollView>
    : <View style={styles.topbar}>{children}</View>;

  const total = totalStake(pendingBets);
  const covered = coveredPockets(pendingBets, game.rules.wheel);
  const pocketCount = POCKET_ORDER[game.rules.wheel].length;
  const profit = sessionProfit(game);
  const recentSpins = game.history.slice(-12).reverse();
  const wheelLabel = game.rules.wheel === 'european' ? 'EUROPEAN · SINGLE ZERO' : 'AMERICAN · DOUBLE ZERO';

  // felt grid data: columns of three, top row divisible by three
  const columns = Array.from({ length: 12 }, (_, c) => [String(3 * (c + 1)), String(3 * (c + 1) - 1), String(3 * (c + 1) - 2)]);
  const zeros = game.rules.wheel === 'american' ? ['0', '00'] : ['0'];

  return (
    <View style={styles.screen}>
      <TopBar>
        <View><Text style={styles.eyebrow}>BANKROLL</Text><Money value={game.bankroll} style={styles.bigMoney} /></View>
        <View><Text style={styles.eyebrow}>ON TABLE</Text><Money value={total} /></View>
        <View><Text style={styles.eyebrow}>SESSION</Text><Money value={profit} signed style={{ color: profit >= 0 ? rouColors.success : rouColors.danger }} /></View>
        <View><Text style={styles.eyebrow}>SPIN #{game.spinIndex}</Text><Text style={styles.theo}>COMP {formatMoney(game.theoTotal)}</Text></View>
        <View style={styles.topbarSpace} />
        <Button label={showPanel ? '✓ HISTORY' : 'HISTORY'} variant={showPanel ? 'secondary' : 'ghost'} onPress={() => setShowPanel((value) => !value)} style={showPanel ? styles.violetSecondary : styles.violetGhost} />
        <Button label="New session" variant="secondary" onPress={reset} style={styles.violetSecondary} />
      </TopBar>

      <View style={[styles.body, narrow && styles.bodyNarrow]}>
        {!narrow || !showPanel ? <ScrollView style={[styles.tableColumn, narrow && styles.tableColumnNarrow]} contentContainerStyle={styles.tableContent}>
          <View style={styles.wheelRow}>
            <RouletteWheel wheel={game.rules.wheel} trace={game.lastTrace} spinning={spinning} speed={speed} size={compact ? 168 : 210} />
            <View style={styles.wheelSide}>
              <Text style={styles.wheelKind}>{wheelLabel}</Text>
              {game.lastPocket && !spinning ? <PocketBadge pocket={game.lastPocket} size={56} /> : null}
              {spinning ? <Text style={styles.noMoreBets}>NO MORE BETS</Text> : null}
              {countdown !== null && !spinning ? <Text style={styles.countdown}>NEXT SPIN {countdown}s</Text> : null}
              <View style={styles.lastPockets}>
                {game.history.slice(-8).reverse().map((record) => (
                  <View key={record.index} style={[styles.miniPocket, { backgroundColor: POCKET_STYLE[record.color] }]}><Text style={styles.miniPocketText}>{record.pocket}</Text></View>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}><Text style={styles.statLabel}>TOTAL BET</Text><Text style={styles.statValue}>{formatMoney(total)}</Text></View>
            <View style={styles.stat}><Text style={styles.statLabel}>COVERAGE</Text><Text style={styles.statValue}>{covered.size}/{pocketCount} · {Math.round((covered.size / pocketCount) * 100)}%</Text></View>
            <View style={styles.stat}><Text style={styles.statLabel}>BEST HIT</Text><Text style={[styles.statValue, { color: rouColors.success }]}>{formatMoney(total > 0 ? bestHit(pendingBets, game.rules.wheel) : 0, true)}</Text></View>
            <View style={styles.stat}><Text style={styles.statLabel}>THEO / SPIN</Text><Text style={[styles.statValue, { color: rouColors.danger }]}>−{formatMoney(total * houseEdge(game.rules.wheel))}</Text></View>
          </View>

          <ScrollView horizontal={narrow} showsHorizontalScrollIndicator={narrow} contentContainerStyle={narrow ? styles.feltScroll : styles.feltFull}>
          <View style={styles.felt}>
            <View style={styles.gridRow}>
              <View style={styles.zeroColumn}>
                {zeros.map((zero) => <NumberCell key={zero} pocket={zero} amount={pendingBets[`n${zero}`] ?? 0} onPress={() => addChip(`n${zero}`)} wide />)}
              </View>
              <View style={styles.numbersBlock}>
                {[0, 1, 2].map((row) => (
                  <View key={row} style={styles.numbersRow}>
                    {columns.map((column) => {
                      const pocket = column[row];
                      return <NumberCell key={pocket} pocket={pocket} amount={pendingBets[`n${pocket}`] ?? 0} onPress={() => addChip(`n${pocket}`)} />;
                    })}
                  </View>
                ))}
              </View>
              <View style={styles.colColumn}>
                {(['col3', 'col2', 'col1'] as const).map((id) => <OutsideCell key={id} label="2:1" amount={pendingBets[id] ?? 0} onPress={() => addChip(id)} />)}
              </View>
            </View>
            <View style={styles.outsideRow}>
              {OUTSIDE_BETS.slice(0, 3).map((bet) => <OutsideCell key={bet.id} label={bet.label} amount={pendingBets[bet.id] ?? 0} onPress={() => addChip(bet.id)} />)}
            </View>
            <View style={styles.outsideRow}>
              {OUTSIDE_BETS.slice(3, 9).map((bet) => <OutsideCell key={bet.id} label={bet.label} amount={pendingBets[bet.id] ?? 0} onPress={() => addChip(bet.id)} />)}
            </View>
          </View>
          </ScrollView>

          <View style={styles.saveRow}>
            <Field label="Save layout as strategy" value={saveName} onChangeText={setSaveName} />
            <Button label="SAVE" variant="secondary" onPress={saveStrategy} style={styles.violetSecondary} />
          </View>

          {strategies.length > 0 ? (
            <View style={styles.stepRow}>
              <Text style={styles.stepLabel}>MULTI-STEP SYSTEMS · ADD THIS LAYOUT AS THE NEXT STEP OF:</Text>
              <View style={styles.stepButtons}>
                {strategies.map((item) => (
                  <Button
                    key={item.id}
                    label={`${item.name} · ${item.steps.length}/${MAX_STRATEGY_STEPS}`}
                    variant="ghost"
                    disabled={item.steps.length >= MAX_STRATEGY_STEPS || total === 0}
                    onPress={() => addStepTo(item.id)}
                    style={styles.violetGhost}
                  />
                ))}
              </View>
              <Text style={styles.stepHint}>A ladder bets step 1, then walks its steps on wins and losses (defaults: win resets, loss advances — tune per strategy in Settings).</Text>
            </View>
          ) : null}
        </ScrollView> : null}

        {showPanel ? <ScrollView style={[styles.sidePanel, narrow && styles.sidePanelNarrow, shortLandscape && styles.sidePanelLow]} contentContainerStyle={styles.sideContent}>
          <ProfitChart series={game.profitSeries} title="SESSION P/L" pointLabel="Spin" palette={CHART_PALETTE} />
          {game.runners.length > 0 ? <Text style={styles.panelSubtitle}>Strategy runners</Text> : null}
          {game.runners.map((runner) => {
            const cumulative = runner.profitSeries[runner.profitSeries.length - 1] ?? 0;
            const runnerStrategy = strategies.find((item) => item.id === runner.strategyId);
            const stepCount = runnerStrategy?.steps.length ?? 1;
            const stepNow = Math.min(stepsRef.current[runner.strategyId] ?? 0, stepCount - 1) + 1;
            return (
              <View key={runner.strategyId} style={styles.runnerBlock}>
                <View style={styles.runnerHeader}>
                  <Text style={styles.runnerName}>{runner.name}{runner.friends > 0 ? ` · F×${runner.friends}` : ''}</Text>
                  <Text style={[styles.runnerNet, { color: cumulative >= 0 ? rouColors.success : rouColors.danger }]}>{formatMoney(cumulative, true)}</Text>
                </View>
                <Text style={styles.runnerMeta}>bank {formatMoney(runner.bankroll)} · last {formatMoney(runner.lastNet, true)}{stepCount > 1 ? ` · step ${stepNow}/${stepCount} (${formatMoney(totalStake(strategyStepBets(runnerStrategy!, stepNow - 1)))}/spin)` : ''}</Text>
                {runner.profitSeries.length > 1 ? <ProfitChart series={runner.profitSeries} title={runner.name.toUpperCase()} pointLabel="Spin" palette={CHART_PALETTE} /> : null}
              </View>
            );
          })}
          <Text style={styles.panelSubtitle}>Spin history</Text>
          {recentSpins.length === 0 ? <Text style={styles.empty}>No spins yet.</Text> : recentSpins.map((record) => (
            <View key={record.index} style={styles.historyRow}>
              <Text style={styles.historyIndex}>#{record.index}</Text>
              <View style={[styles.miniPocket, { backgroundColor: POCKET_STYLE[record.color] }]}><Text style={styles.miniPocketText}>{record.pocket}</Text></View>
              <Text style={styles.historyStake}>{record.playerStake > 0 ? formatMoney(record.playerStake) : '—'}</Text>
              <Text style={[styles.historyNet, { color: record.playerNet > 0 ? rouColors.success : record.playerNet < 0 ? rouColors.danger : rouColors.muted }]}>{record.playerStake > 0 ? formatMoney(record.playerNet, true) : '—'}</Text>
            </View>
          ))}
          <Text style={styles.panelSubtitle}>Table rules</Text>
          <Text style={styles.note}>{wheelLabel.toLowerCase()} · straight 35:1 · dozens and columns 2:1 · even money 1:1 · zeros beat every outside bet. House edge {game.rules.wheel === 'european' ? '2.7%' : '5.26%'}; COMP tracks cumulative theoretical loss (what a casino would rate you on). The wheel and ball are physically simulated from the session seed: rotor speed, ball decay, deflector strike, and bounce all come from the seeded stream.</Text>
          <Text style={styles.seed} selectable>Session seed: {game.seed}</Text>
        </ScrollView> : null}
      </View>

      <View style={[styles.controls, compact && styles.controlsPhone]}>
        <View style={styles.controlMain}>
          <View style={[styles.chipTray, phone && styles.chipTrayPhone]}>{CHIP_VALUES.map((value) => <Chip key={value} value={value} small={compact} selected={chip === value} onPress={() => setChip(value)} />)}</View>
          <View style={styles.rollArea}>
            <Text style={styles.message} numberOfLines={2}>{message}</Text>
            <Button label="CLEAR" variant="ghost" onPress={() => setPendingBets({})} disabled={total === 0 || spinning} style={styles.violetGhost} />
            <Button
              label={spinning ? 'SPINNING…' : autoOn ? `SPIN NOW${countdown !== null ? ` (${countdown}s)` : ''}` : 'SPIN'}
              onPress={() => (autoOn ? doSpin() : startSpin())}
              disabled={spinning}
              style={[styles.spinButton, phone && styles.spinButtonPhone]}
            />
          </View>
        </View>
        <View style={styles.automationBar}>
          <Text style={styles.watchLabel}>SPEED</Text>
          {SPEEDS.map((value) => <Button key={value} label={`${value}×`} variant={speed === value ? 'primary' : 'ghost'} onPress={() => { setSpeed(value); speedRef.current = value; }} style={[styles.speedButton, speed !== value && styles.violetGhost]} />)}
          <Text style={styles.watchLabel}>{autoOn ? 'WHEEL RUNNING · SPINS EVERY 30–60s ÷ SPEED' : 'FIRST SPIN STARTS THE WHEEL'}</Text>
          <Button
            label={autoOn ? 'STOP WHEEL' : 'START WHEEL'}
            variant={autoOn ? 'danger' : 'secondary'}
            onPress={() => (autoOn ? stopAuto() : startSpin())}
            disabled={spinning && !autoOn}
            style={[styles.watchButton, !autoOn && styles.violetSecondary]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: rouColors.background },
  topbar: { minHeight: 72, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#241536', backgroundColor: '#100a18' },
  topbarScroller: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: '#241536', backgroundColor: '#100a18' },
  topbarRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 7 },
  eyebrow: { color: rouColors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginBottom: 2 },
  bigMoney: { fontSize: 22 },
  theo: { color: rouColors.gold, fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
  topbarSpace: { flex: 1 },
  body: { flex: 1, minHeight: 0, flexDirection: 'row' },
  bodyNarrow: { flexDirection: 'column' },
  tableColumn: { flex: 1.75, minWidth: 560, minHeight: 0 },
  tableColumnNarrow: { flex: 1, minWidth: 0 },
  // cap the playfield so wide monitors don't stretch the felt into a ribbon
  tableContent: { padding: 12, gap: 10, width: '100%', maxWidth: 1100, alignSelf: 'center' },
  wheelRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18, justifyContent: 'center' },
  wheelSide: { gap: 8, alignItems: 'flex-start', minWidth: 170 },
  wheelKind: { color: rouColors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  noMoreBets: { color: rouColors.danger, fontSize: 13, fontWeight: '900', letterSpacing: 1.4 },
  countdown: { color: rouColors.gold, fontSize: 13, fontWeight: '900', letterSpacing: 1, fontVariant: ['tabular-nums'] },
  lastPockets: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', maxWidth: 190 },
  miniPocket: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  miniPocketText: { color: '#f4f1e8', fontSize: 9, fontWeight: '900' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flex: 1, minWidth: 130, padding: 8, borderRadius: 9, backgroundColor: rouColors.panel, borderWidth: 1, borderColor: rouColors.border, alignItems: 'center', gap: 2 },
  statLabel: { color: rouColors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  statValue: { color: rouColors.ink, fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
  felt: { backgroundColor: rouColors.felt, borderWidth: 2, borderColor: '#6a4499', borderRadius: 18, padding: 10, gap: 6, flexGrow: 1 },
  feltFull: { width: '100%' },
  feltScroll: { minWidth: 700 },
  gridRow: { flexDirection: 'row', gap: 4 },
  zeroColumn: { width: 40, gap: 4 },
  numbersBlock: { flex: 1, gap: 4 },
  numbersRow: { flexDirection: 'row', gap: 4 },
  colColumn: { width: 46, gap: 4 },
  numberCell: { flex: 1, minHeight: 38, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(244,241,232,0.25)' },
  zeroCell: { flex: 1 },
  numberText: { color: '#f4f1e8', fontWeight: '900', fontSize: 13 },
  outsideCell: { minHeight: 34, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(244,241,232,0.3)', backgroundColor: 'rgba(10,4,18,0.35)' },
  outsideText: { color: '#e8dfc8', fontWeight: '900', fontSize: 11, letterSpacing: 0.5 },
  outsideRow: { flexDirection: 'row', gap: 4 },
  amountBadge: { position: 'absolute', top: 2, right: 2, minWidth: 16, paddingHorizontal: 3, height: 14, borderRadius: 7, backgroundColor: rouColors.gold, alignItems: 'center', justifyContent: 'center' },
  amountText: { color: '#241536', fontSize: 8, fontWeight: '900' },
  pressedCell: { opacity: 0.7 },
  saveRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  stepRow: { gap: 6, padding: 10, borderRadius: 10, backgroundColor: rouColors.panel, borderWidth: 1, borderColor: rouColors.border },
  stepLabel: { color: rouColors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  stepButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stepHint: { color: rouColors.muted, fontSize: 10, lineHeight: 15 },
  controls: { minHeight: 150, paddingHorizontal: 10, paddingVertical: 8, gap: 4, borderTopWidth: 1, borderTopColor: '#241536', backgroundColor: rouColors.panel },
  controlsPhone: { minHeight: 0, paddingVertical: 4 },
  spinButtonPhone: { minWidth: 96, minHeight: 46 },
  controlMain: { flex: 1, width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  chipTray: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  chipTrayPhone: { width: '100%', justifyContent: 'center', gap: 4 },
  rollArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  message: { flex: 1, minWidth: 0, color: rouColors.muted, fontSize: 11 },
  spinButton: { minWidth: 132, minHeight: 58 },
  automationBar: { minHeight: 34, width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2c1a45', paddingTop: 4 },
  watchLabel: { color: rouColors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1, marginLeft: 5 },
  speedButton: { minHeight: 29, minWidth: 43, paddingHorizontal: 6 },
  watchButton: { minHeight: 31, minWidth: 128, marginLeft: 'auto' },
  violetSecondary: { borderColor: rouColors.borderLight, backgroundColor: rouColors.panelLight },
  violetGhost: { borderColor: rouColors.border },
  sidePanel: { flex: 1, minWidth: 320, minHeight: 0, maxWidth: 480, borderLeftWidth: 1, borderLeftColor: '#241536', backgroundColor: rouColors.panel },
  sidePanelNarrow: { minWidth: 0, maxWidth: undefined, borderLeftWidth: 0 },
  sidePanelLow: { minWidth: 260 },
  sideContent: { padding: 14, gap: 9 },
  panelSubtitle: { color: rouColors.ink, fontWeight: '900', fontSize: 14, marginTop: 7 },
  empty: { color: rouColors.muted, fontStyle: 'italic' },
  runnerBlock: { gap: 4, padding: 9, borderRadius: 10, backgroundColor: rouColors.background, borderWidth: 1, borderColor: '#2c1a45' },
  runnerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  runnerName: { color: rouColors.ink, fontWeight: '900', fontSize: 12 },
  runnerNet: { fontWeight: '900', fontSize: 13, fontVariant: ['tabular-nums'] },
  runnerMeta: { color: rouColors.muted, fontSize: 10 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2c1a45' },
  historyIndex: { color: rouColors.muted, width: 34, fontSize: 11 },
  historyStake: { flex: 1, color: rouColors.ink, fontSize: 11, fontVariant: ['tabular-nums'] },
  historyNet: { fontWeight: '900', fontVariant: ['tabular-nums'], fontSize: 12 },
  note: { color: rouColors.muted, lineHeight: 19, fontSize: 12 },
  seed: { color: '#8a7a9e', fontSize: 9, marginTop: 8 },
});

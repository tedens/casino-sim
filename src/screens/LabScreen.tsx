import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import { compareStrategies, simulationToCsv } from '../simulation/runner';
import { ComparisonResult, SimulationResult } from '../simulation/types';
import { StrategyDefinition } from '../strategy/types';
import { AppSettings, LabDefaults, loadLabDefaults, saveLabDefaults } from '../storage/storage';
import { Button, Field, Money, SectionTitle, formatMoney } from '../ui/components';
import { colors } from '../ui/theme';

function BankrollChart({ result }: { result: SimulationResult }) {
  const curves = result.sessions.slice(0, 40).map((session) => session.bankrollCurve);
  const maxLength = Math.max(2, ...curves.map((curve) => curve.length));
  const values = curves.flat();
  const low = Math.min(...values, result.config.startingBankroll);
  const high = Math.max(...values, result.config.startingBankroll);
  const range = Math.max(1, high - low);
  const path = (curve: number[]) => curve.map((value, index) => {
    const x = 45 + (index / (maxLength - 1)) * 700;
    const y = 190 - ((value - low) / range) * 160;
    return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <Svg viewBox="0 0 780 220" style={styles.chart}>
      <Line x1="45" y1="30" x2="45" y2="190" stroke="#45675b" />
      <Line x1="45" y1="190" x2="745" y2="190" stroke="#45675b" />
      <Line x1="45" y1={190 - ((result.config.startingBankroll - low) / range) * 160} x2="745" y2={190 - ((result.config.startingBankroll - low) / range) * 160} stroke={colors.gold} strokeDasharray="5 6" opacity={0.7} />
      {curves.map((curve, index) => <Path key={index} d={path(curve)} stroke={index === 0 ? colors.success : '#69a990'} strokeWidth={index === 0 ? 2.5 : 1} opacity={index === 0 ? 1 : 0.16} fill="none" />)}
      <SvgText x="5" y="36" fill={colors.muted} fontSize="10">{formatMoney(high)}</SvgText>
      <SvgText x="5" y="190" fill={colors.muted} fontSize="10">{formatMoney(low)}</SvgText>
      <SvgText x="650" y="210" fill={colors.muted} fontSize="10">Rolls</SvgText>
    </Svg>
  );
}

export function LabScreen({ strategies, recentRuns, onSaveRun, settings }: { strategies: StrategyDefinition[]; recentRuns: SimulationResult[]; onSaveRun: (result: SimulationResult) => void | Promise<void>; settings: AppSettings }) {
  const [selected, setSelected] = useState<string[]>(strategies.slice(0, 2).map((item) => item.id));
  const [sessions, setSessions] = useState('1000');
  const [rolls, setRolls] = useState('200');
  const [bankroll, setBankroll] = useState('5000');
  const [tableMinimum, setTableMinimum] = useState(String(settings.tableMinimum));
  const [tableMaximum, setTableMaximum] = useState(String(settings.tableMaximum));
  const [profitTarget, setProfitTarget] = useState('');
  const [lossLimit, setLossLimit] = useState('');
  const [seed, setSeed] = useState('strategy-lab-2026');
  const [completeShooter, setCompleteShooter] = useState(true);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [comparison, setComparison] = useState<ComparisonResult>();
  const [exportText, setExportText] = useState('');
  const [defaultsMessage, setDefaultsMessage] = useState('');
  const chosen = useMemo(() => strategies.filter((strategy) => selected.includes(strategy.id)), [selected, strategies]);

  useEffect(() => {
    const fallback: LabDefaults = {
      strategyIds: strategies.slice(0, 2).map((item) => item.id), sessions: 1000, maxRollsPerSession: 200,
      startingBankroll: settings.startingBankroll, tableMinimum: settings.tableMinimum, tableMaximum: settings.tableMaximum,
      seed: 'strategy-lab-2026', completeShooter: true,
    };
    loadLabDefaults(fallback).then((defaults) => {
      const validIds = defaults.strategyIds.filter((id) => strategies.some((strategy) => strategy.id === id));
      setSelected(validIds.length ? validIds : fallback.strategyIds);
      setSessions(String(defaults.sessions)); setRolls(String(defaults.maxRollsPerSession)); setBankroll(String(defaults.startingBankroll));
      setTableMinimum(String(defaults.tableMinimum)); setTableMaximum(String(defaults.tableMaximum));
      setProfitTarget(defaults.profitTarget === undefined ? '' : String(defaults.profitTarget));
      setLossLimit(defaults.lossLimit === undefined ? '' : String(defaults.lossLimit));
      setSeed(defaults.seed); setCompleteShooter(defaults.completeShooter);
    }).catch(() => undefined);
  }, [settings, strategies]);

  const saveDefaults = async () => {
    const minimum = Math.max(1, Number(tableMinimum) || settings.tableMinimum);
    await saveLabDefaults({
      strategyIds: selected,
      sessions: Math.min(100000, Math.max(1, Number(sessions) || 1)),
      maxRollsPerSession: Math.min(10000, Math.max(1, Number(rolls) || 1)),
      startingBankroll: Math.max(minimum, Number(bankroll) || settings.startingBankroll),
      tableMinimum: minimum,
      tableMaximum: Math.max(minimum, Number(tableMaximum) || settings.tableMaximum),
      profitTarget: profitTarget ? Number(profitTarget) : undefined,
      lossLimit: lossLimit ? Number(lossLimit) : undefined,
      seed,
      completeShooter,
    });
    setDefaultsMessage('Lab defaults saved on this device.');
  };

  const run = async () => {
    if (!chosen.length || running) return;
    setRunning(true); setProgress(0); setComparison(undefined);
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    const minimum = Math.max(1, Number(tableMinimum) || settings.tableMinimum);
    const maximum = Math.max(minimum, Number(tableMaximum) || settings.tableMaximum);
    const result = await compareStrategies(chosen, {
      sessions: Math.min(100000, Math.max(1, Number(sessions) || 1)),
      maxRollsPerSession: Math.min(10000, Math.max(1, Number(rolls) || 1)),
      startingBankroll: Math.max(minimum, Number(bankroll) || settings.startingBankroll),
      tableMinimum: minimum,
      tableMaximum: maximum,
      profitTarget: profitTarget ? Number(profitTarget) : undefined,
      lossLimit: lossLimit ? Number(lossLimit) : undefined,
      completeShooter,
      seed,
    }, setProgress);
    setComparison(result);
    for (const runResult of result.results) await onSaveRun(runResult);
    setRunning(false);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.heading}><View style={{ flex: 1 }}><Text style={styles.title}>Batch strategy lab</Text><Text style={styles.subtitle}>Common dice streams make comparisons reproducible and fair.</Text></View><Button label={running ? `${Math.round(progress * 100)}%` : 'Run comparison'} disabled={running || !chosen.length} onPress={run} style={styles.runButton} /></View>

      <View style={styles.panel}>
        <SectionTitle>Strategies</SectionTitle>
        <View style={styles.choices}>{strategies.map((strategy) => <Button key={strategy.id} label={strategy.name} variant={selected.includes(strategy.id) ? 'primary' : 'ghost'} onPress={() => setSelected((items) => items.includes(strategy.id) ? items.filter((id) => id !== strategy.id) : [...items, strategy.id])} />)}</View>
        <View style={styles.fields}><Field label="Sessions" value={sessions} onChangeText={setSessions} keyboardType="numeric" /><Field label="Max rolls / session" value={rolls} onChangeText={setRolls} keyboardType="numeric" /><Field label="Starting bankroll" value={bankroll} onChangeText={setBankroll} keyboardType="numeric" /></View>
        <View style={styles.fields}><Field label="Table minimum" value={tableMinimum} onChangeText={setTableMinimum} keyboardType="numeric" /><Field label="Table maximum" value={tableMaximum} onChangeText={setTableMaximum} keyboardType="numeric" /><View style={{ flex: 1 }} /></View>
        <View style={styles.fields}><Field label="Profit target (optional)" value={profitTarget} onChangeText={setProfitTarget} keyboardType="numeric" /><Field label="Loss limit (optional)" value={lossLimit} onChangeText={setLossLimit} keyboardType="numeric" /><Field label="Seed" value={seed} onChangeText={setSeed} /></View>
        <View style={styles.choices}><Button label={completeShooter ? '✓ Complete shooter after limit' : 'Stop immediately at limit'} variant="secondary" onPress={() => setCompleteShooter((value) => !value)} /><Button label="Save lab defaults" variant="ghost" onPress={saveDefaults} /></View>
        {defaultsMessage ? <Text style={styles.savedDefaults}>{defaultsMessage}</Text> : null}
        {running ? <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View> : null}
      </View>

      {comparison ? <>
        <SectionTitle>Comparison report</SectionTitle>
        <View style={styles.resultGrid}>{comparison.results.map((result, index) => {
          const best = Math.max(...comparison.results.map((item) => item.metrics.meanProfit));
          return (
            <View key={result.strategyId} style={[styles.resultCard, result.metrics.meanProfit === best && styles.bestCard]}>
              <Text style={styles.resultTitle}>{result.strategyName}</Text>
              <View style={styles.metricRow}><Metric label="Mean profit" value={<Money value={result.metrics.meanProfit} signed style={{ color: result.metrics.meanProfit >= 0 ? colors.success : colors.danger }} />} /><Metric label="ROI" value={<Text style={styles.metricValue}>{(result.metrics.roi * 100).toFixed(2)}%</Text>} /><Metric label="Ruin rate" value={<Text style={styles.metricValue}>{(result.metrics.ruinRate * 100).toFixed(1)}%</Text>} /></View>
              <View style={styles.metricRow}><Metric label="Max drawdown" value={<Money value={result.metrics.maxDrawdown} />} /><Metric label="House edge" value={<Text style={styles.metricValue}>{(result.metrics.realizedHouseEdge * 100).toFixed(2)}%</Text>} /><Metric label="Total rolls" value={<Text style={styles.metricValue}>{result.metrics.totalRolls.toLocaleString()}</Text>} /></View>
              <Text style={styles.confidence}>{`95% CI: ${formatMoney(result.metrics.confidence95[0])} to ${formatMoney(result.metrics.confidence95[1])} · Ending bankroll P10/P50/P90: ${formatMoney(result.metrics.bankrollPercentiles.p10)} / ${formatMoney(result.metrics.bankrollPercentiles.p50)} / ${formatMoney(result.metrics.bankrollPercentiles.p90)}`}</Text>
              <BankrollChart result={result} />
              <View style={styles.choices}><Button label="Export JSON" variant="secondary" onPress={() => setExportText(JSON.stringify(result, null, 2))} /><Button label="Export CSV" variant="secondary" onPress={() => setExportText(simulationToCsv(result))} /></View>
            </View>
          );
        })}</View>
        {exportText ? <View style={styles.panel}><Field label="Export data" value={exportText} onChangeText={setExportText} multiline /><Button label="Close export" variant="ghost" onPress={() => setExportText('')} /></View> : null}
      </> : null}

      {recentRuns.length ? <View style={styles.panel}>
        <SectionTitle>Recent saved runs</SectionTitle>
        {recentRuns.slice(0, 8).map((run) => <View key={run.id} style={styles.savedRow}>
          <Text style={styles.savedName}>{run.strategyName}</Text>
          <Text style={styles.savedMeta}>{run.metrics.sessions.toLocaleString()} sessions · {run.metrics.totalRolls.toLocaleString()} rolls</Text>
          <Money value={run.metrics.meanProfit} signed style={{ color: run.metrics.meanProfit >= 0 ? colors.success : colors.danger }} />
          <Button label="JSON" variant="ghost" onPress={() => setExportText(JSON.stringify(run, null, 2))} />
        </View>)}
      </View> : null}
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text>{value}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 18, maxWidth: 1400, width: '100%', alignSelf: 'center' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: colors.ink, fontSize: 27, fontWeight: '900' },
  subtitle: { color: colors.muted, marginTop: 4 },
  runButton: { minWidth: 160, minHeight: 52 },
  panel: { backgroundColor: colors.panel, borderWidth: 1, borderColor: '#315247', borderRadius: 12, padding: 16, gap: 13 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  fields: { flexDirection: 'row', gap: 12 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#06140f' },
  progressFill: { height: '100%', backgroundColor: colors.gold },
  savedDefaults: { color: colors.success, fontSize: 12, fontWeight: '800' },
  resultGrid: { gap: 14 },
  resultCard: { backgroundColor: colors.panel, borderRadius: 13, padding: 16, borderWidth: 1, borderColor: '#315247', gap: 11 },
  bestCard: { borderColor: colors.gold, borderWidth: 2 },
  resultTitle: { color: colors.ink, fontWeight: '900', fontSize: 20 },
  metricRow: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1, backgroundColor: colors.background, padding: 10, borderRadius: 8 },
  metricLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.7 },
  metricValue: { color: colors.ink, fontWeight: '900', fontVariant: ['tabular-nums'] },
  confidence: { color: colors.muted, fontSize: 11 },
  chart: { width: '100%', height: 220, backgroundColor: '#0a1e17', borderRadius: 8 },
  savedRow: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#38564c' },
  savedName: { color: colors.ink, fontWeight: '900', flex: 1 },
  savedMeta: { color: colors.muted, fontSize: 11 },
});

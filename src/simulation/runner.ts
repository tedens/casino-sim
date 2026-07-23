import { createGameState, sessionProfit, settleRoll, totalAssets } from '../domain/engine';
import { deriveSeed, SeededRng } from '../domain/rng';
import { GameState } from '../domain/types';
import { BELLAGIO_RULESET } from '../domain/ruleset';
import { applyStrategy } from '../strategy/engine';
import { StrategyContext, StrategyDefinition, StrategyTrigger } from '../strategy/types';
import { ComparisonResult, SessionResult, SimulationConfig, SimulationMetrics, SimulationResult } from './types';

function applyTrigger(strategy: StrategyDefinition, state: GameState, context: StrategyContext): GameState {
  return applyStrategy(strategy, state, context).state;
}

function applyPostRoll(strategy: StrategyDefinition, state: GameState): GameState {
  const record = state.history[state.history.length - 1];
  let next = applyTrigger(strategy, state, { trigger: 'rollSettled', record, eventType: 'rollSettled' });
  for (const event of record.events) {
    const trigger = event.type as StrategyTrigger;
    if (!['pointEstablished', 'betWon', 'betLost', 'sevenOut'].includes(trigger)) continue;
    next = applyTrigger(strategy, next, { trigger, record, eventType: event.type, eventWagerId: event.wagerId });
  }
  if (record.pointAfter === null) {
    next = applyTrigger(strategy, next, { trigger: 'comeOutStart', record });
  }
  return next;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

function metrics(sessions: SessionResult[], startingBankroll: number): SimulationMetrics {
  const profits = sessions.map((session) => session.profit);
  const endings = sessions.map((session) => session.endingBankroll);
  const n = Math.max(1, sessions.length);
  const meanProfit = profits.reduce((sum, value) => sum + value, 0) / n;
  const variance = profits.reduce((sum, value) => sum + ((value - meanProfit) ** 2), 0) / Math.max(1, n - 1);
  const margin = 1.96 * Math.sqrt(variance / n);
  const totalWagered = sessions.reduce((sum, session) => sum + session.totalWagered, 0);
  return {
    sessions: sessions.length,
    totalRolls: sessions.reduce((sum, session) => sum + session.rolls, 0),
    meanEndingBankroll: endings.reduce((sum, value) => sum + value, 0) / n,
    medianEndingBankroll: percentile(endings, 0.5),
    meanProfit,
    roi: meanProfit / startingBankroll,
    ruinRate: sessions.filter((session) => session.ruined).length / n,
    maxDrawdown: Math.max(0, ...sessions.map((session) => session.maxDrawdown)),
    totalWagered,
    realizedHouseEdge: totalWagered ? -profits.reduce((sum, value) => sum + value, 0) / totalWagered : 0,
    confidence95: [meanProfit - margin, meanProfit + margin],
    bankrollPercentiles: { p10: percentile(endings, 0.1), p50: percentile(endings, 0.5), p90: percentile(endings, 0.9) },
  };
}

export function runSimulation(config: SimulationConfig): SimulationResult {
  const sessions: SessionResult[] = [];
  for (let index = 0; index < config.sessions; index += 1) {
    const sessionSeed = deriveSeed(config.seed, 'session', index);
    const rng = new SeededRng(sessionSeed, 'outcome');
    let state = createGameState({
      seed: sessionSeed,
      startingBankroll: config.startingBankroll,
      ruleset: {
        ...BELLAGIO_RULESET,
        startingBankroll: config.startingBankroll,
        tableMinimum: config.tableMinimum,
        tableMaximum: config.tableMaximum,
      },
    });
    state = applyTrigger(config.strategy, state, { trigger: 'sessionStart' });
    state = applyTrigger(config.strategy, state, { trigger: 'comeOutStart' });
    let peak = totalAssets(state);
    let maxDrawdown = 0;
    const curve = [peak];

    while (!state.stopped && state.rollIndex < config.maxRollsPerSession && totalAssets(state) > 0) {
      const [die1, die2] = rng.dice();
      state = settleRoll(state, die1, die2, sessionSeed).state;
      state = applyPostRoll(config.strategy, state);
      const assets = totalAssets(state);
      peak = Math.max(peak, assets);
      maxDrawdown = Math.max(maxDrawdown, peak - assets);
      curve.push(assets);
      const profit = sessionProfit(state);
      const targetHit = config.profitTarget !== undefined && profit >= config.profitTarget;
      const lossHit = config.lossLimit !== undefined && profit <= -Math.abs(config.lossLimit);
      if ((targetHit || lossHit) && (!config.completeShooter || state.phase === 'comeOut')) break;
      if (state.bankroll < state.ruleset.tableMinimum && state.wagers.length === 0) break;
    }
    sessions.push({
      index,
      endingBankroll: totalAssets(state),
      profit: sessionProfit(state),
      rolls: state.rollIndex,
      shooters: state.shooterCount,
      totalWagered: state.totalWagered,
      maxDrawdown,
      ruined: totalAssets(state) < state.ruleset.tableMinimum,
      bankrollCurve: curve,
    });
  }
  return {
    id: `run-${Date.now().toString(36)}-${config.strategy.id}`,
    strategyId: config.strategy.id,
    strategyName: config.strategy.name,
    seed: config.seed,
    config: {
      sessions: config.sessions,
      maxRollsPerSession: config.maxRollsPerSession,
      startingBankroll: config.startingBankroll,
      tableMinimum: config.tableMinimum,
      tableMaximum: config.tableMaximum,
      profitTarget: config.profitTarget,
      lossLimit: config.lossLimit,
      completeShooter: config.completeShooter,
      seed: config.seed,
    },
    sessions,
    metrics: metrics(sessions, config.startingBankroll),
    createdAt: new Date().toISOString(),
  };
}

export async function runSimulationChunked(config: SimulationConfig, chunkSize = 50, onProgress?: (value: number) => void): Promise<SimulationResult> {
  const results: SessionResult[] = [];
  for (let start = 0; start < config.sessions; start += chunkSize) {
    const count = Math.min(chunkSize, config.sessions - start);
    const partial = runSimulation({ ...config, sessions: count, seed: deriveSeed(config.seed, 'chunk', start) });
    results.push(...partial.sessions.map((session, offset) => ({ ...session, index: start + offset })));
    onProgress?.(Math.min(1, (start + count) / config.sessions));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const base = runSimulation({ ...config, sessions: 0 });
  return { ...base, sessions: results, metrics: metrics(results, config.startingBankroll) };
}

export async function compareStrategies(strategies: StrategyDefinition[], config: Omit<SimulationConfig, 'strategy'>, onProgress?: (value: number) => void): Promise<ComparisonResult> {
  const results: SimulationResult[] = [];
  for (let index = 0; index < strategies.length; index += 1) {
    results.push(await runSimulationChunked({ ...config, strategy: strategies[index] }, 50));
    onProgress?.((index + 1) / strategies.length);
  }
  return { seed: config.seed, results };
}

export function simulationToCsv(result: SimulationResult): string {
  const header = 'session,endingBankroll,profit,rolls,shooters,totalWagered,maxDrawdown,ruined';
  const rows = result.sessions.map((session) => [
    session.index, session.endingBankroll, session.profit, session.rolls, session.shooters,
    session.totalWagered, session.maxDrawdown, session.ruined,
  ].join(','));
  return [header, ...rows].join('\n');
}

import { applyAction } from '../blackjack/betting';
import { deriveSeed } from '../domain/rng';
import { POCKET_ORDER, pocketColor, simulateSpin } from './wheel';
import { RouletteBetId, RouletteRules, RouletteState, RunnerState, SavedRouletteStrategy, SpinRecord, WheelKind } from './types';

export const DEFAULT_ROULETTE_RULES: RouletteRules = {
  wheel: 'european',
  tableMinimum: 5,
  tableMaximum: 5000,
};

export const OUTSIDE_BETS: Array<{ id: RouletteBetId; label: string; payout: number }> = [
  { id: 'dozen1', label: '1st 12', payout: 2 },
  { id: 'dozen2', label: '2nd 12', payout: 2 },
  { id: 'dozen3', label: '3rd 12', payout: 2 },
  { id: 'low', label: '1–18', payout: 1 },
  { id: 'even', label: 'EVEN', payout: 1 },
  { id: 'red', label: 'RED', payout: 1 },
  { id: 'black', label: 'BLACK', payout: 1 },
  { id: 'odd', label: 'ODD', payout: 1 },
  { id: 'high', label: '19–36', payout: 1 },
  { id: 'col1', label: '2:1 ·1', payout: 2 },
  { id: 'col2', label: '2:1 ·2', payout: 2 },
  { id: 'col3', label: '2:1 ·3', payout: 2 },
];

export function betPayout(id: RouletteBetId): number {
  if (id.startsWith('n')) return 35;
  return OUTSIDE_BETS.find((bet) => bet.id === id)?.payout ?? 0;
}

export function betCovers(id: RouletteBetId, pocket: string): boolean {
  if (id.startsWith('n')) return id === `n${pocket}`;
  if (pocket === '0' || pocket === '00') return false; // zeros beat every outside bet
  const value = Number(pocket);
  switch (id) {
    case 'red': return pocketColor(pocket) === 'red';
    case 'black': return pocketColor(pocket) === 'black';
    case 'odd': return value % 2 === 1;
    case 'even': return value % 2 === 0;
    case 'low': return value <= 18;
    case 'high': return value >= 19;
    case 'dozen1': return value <= 12;
    case 'dozen2': return value >= 13 && value <= 24;
    case 'dozen3': return value >= 25;
    case 'col1': return value % 3 === 1;
    case 'col2': return value % 3 === 2;
    case 'col3': return value % 3 === 0;
    default: return false;
  }
}

export function coveredPockets(bets: Record<RouletteBetId, number>, wheel: WheelKind): Set<string> {
  const covered = new Set<string>();
  for (const pocket of POCKET_ORDER[wheel]) {
    for (const [id, amount] of Object.entries(bets)) {
      if ((amount ?? 0) > 0 && betCovers(id, pocket)) { covered.add(pocket); break; }
    }
  }
  return covered;
}

export function houseEdge(wheel: WheelKind): number {
  return wheel === 'european' ? 1 / 37 : 2 / 38;
}

export function totalStake(bets: Record<RouletteBetId, number>): number {
  return Object.values(bets).reduce((sum, amount) => sum + (amount ?? 0), 0);
}

// winnings for one layout against one pocket: returned money and net
export function settleBets(bets: Record<RouletteBetId, number>, pocket: string): { returned: number; net: number } {
  let returned = 0;
  const staked = totalStake(bets);
  for (const [id, amount] of Object.entries(bets)) {
    if ((amount ?? 0) > 0 && betCovers(id, pocket)) returned += amount * (betPayout(id) + 1);
  }
  return { returned, net: returned - staked };
}

// the biggest single-spin win the current layout can produce
export function bestHit(bets: Record<RouletteBetId, number>, wheel: WheelKind): number {
  let best = 0;
  for (const pocket of POCKET_ORDER[wheel]) {
    best = Math.max(best, settleBets(bets, pocket).net);
  }
  return best;
}

// current-step layout for a strategy; single-step ladders just return their base layout
export function strategyStepBets(strategy: SavedRouletteStrategy, step: number): Record<RouletteBetId, number> {
  const steps = strategy.steps?.length ? strategy.steps : [strategy.bets];
  return steps[Math.min(Math.max(step, 0), steps.length - 1)];
}

// walk the step ladder from a spin's net; pushes hold in place
export function nextStrategyStep(strategy: SavedRouletteStrategy, step: number, net: number): number {
  const length = strategy.steps?.length ? strategy.steps.length : 1;
  const clamped = Math.min(Math.max(step, 0), length - 1);
  if (length <= 1 || net === 0) return clamped;
  return applyAction(net > 0 ? strategy.onWin : strategy.onLoss, clamped, length, strategy.loop);
}

export function createRouletteState(options: { seed: string; startingBankroll?: number; rules?: Partial<RouletteRules> }): RouletteState {
  const rules = { ...DEFAULT_ROULETTE_RULES, ...options.rules };
  const bankroll = options.startingBankroll ?? 1000;
  return {
    seed: options.seed,
    rules,
    bankroll,
    startingBankroll: bankroll,
    spinIndex: 0,
    lastPocket: null,
    lastTrace: null,
    history: [],
    profitSeries: [],
    runners: [],
    theoTotal: 0,
    events: [],
  };
}

export function sessionProfit(state: RouletteState): number {
  return state.bankroll - state.startingBankroll;
}

// keep the runner roster aligned with the enabled strategies without losing standing bankrolls
export function syncRunners(state: RouletteState, strategies: SavedRouletteStrategy[]): RouletteState {
  const enabled = strategies.filter((item) => item.enabled);
  const runners: RunnerState[] = enabled.map((strategy) => {
    const existing = state.runners.find((runner) => runner.strategyId === strategy.id);
    return existing ? { ...existing, name: strategy.name } : {
      strategyId: strategy.id,
      name: strategy.name,
      bankroll: state.startingBankroll,
      friends: 0,
      profitSeries: [],
      lastNet: 0,
    };
  });
  return { ...state, runners };
}

export interface RunnerStake {
  strategyId: string;
  bets: Record<RouletteBetId, number>;
}

/** One spin: locks in the player layout plus every runner layout, spins the physical wheel, settles everyone. */
export function spin(state: RouletteState, playerBets: Record<RouletteBetId, number>, runnerStakes: RunnerStake[]): { state: RouletteState; record?: SpinRecord; error?: string } {
  const playerTotal = totalStake(playerBets);
  const anyRunnerStake = runnerStakes.some((stake) => totalStake(stake.bets) > 0);
  if (playerTotal === 0 && !anyRunnerStake) return { state, error: 'Place at least one bet before spinning.' };
  if (playerTotal > 0 && playerTotal < state.rules.tableMinimum) return { state, error: `Table minimum is $${state.rules.tableMinimum}.` };
  if (Object.values(playerBets).some((amount) => (amount ?? 0) > state.rules.tableMaximum)) return { state, error: `Maximum per spot is $${state.rules.tableMaximum}.` };
  if (playerTotal > state.bankroll) return { state, error: 'Bets exceed bankroll.' };

  const index = state.spinIndex + 1;
  const result = simulateSpin(deriveSeed(state.seed, 'spin', index), state.rules.wheel);
  const color = pocketColor(result.pocket);
  const events: string[] = [`Ball lands on ${result.pocket} (${color}).`];

  // player settle
  const playerSettle = settleBets(playerBets, result.pocket);
  let bankroll = state.bankroll - playerTotal + playerSettle.returned;
  if (playerTotal > 0) {
    events.push(playerSettle.net > 0 ? `You win +$${playerSettle.net}.` : playerSettle.net < 0 ? `You lose −$${Math.abs(playerSettle.net)}.` : 'You break even.');
  }

  // runner settle, borrowing a fresh stake when broke
  const runnerNets: Record<string, number> = {};
  let theo = totalStake(playerBets);
  const runners = state.runners.map((runner) => {
    const stake = runnerStakes.find((item) => item.strategyId === runner.strategyId);
    if (!stake || totalStake(stake.bets) === 0) return { ...runner, lastNet: 0, profitSeries: [...runner.profitSeries, runner.profitSeries[runner.profitSeries.length - 1] ?? 0] };
    const cost = totalStake(stake.bets);
    theo += cost;
    let seat = runner;
    if (seat.bankroll < cost) {
      seat = { ...seat, bankroll: state.startingBankroll, friends: seat.friends + 1 };
      events.push(`${seat.name} is broke — borrows another $${state.startingBankroll} from a friend (+1).`);
    }
    const settle = settleBets(stake.bets, result.pocket);
    runnerNets[runner.strategyId] = settle.net;
    const bank = seat.bankroll + settle.net;
    const lastCum = seat.profitSeries[seat.profitSeries.length - 1] ?? 0;
    return { ...seat, bankroll: bank, lastNet: settle.net, profitSeries: [...seat.profitSeries, lastCum + settle.net] };
  });

  const record: SpinRecord = {
    index,
    pocket: result.pocket,
    color,
    playerStake: playerTotal,
    playerNet: playerSettle.net,
    cumulative: bankroll - state.startingBankroll,
    runnerNets,
  };

  return {
    state: {
      ...state,
      bankroll,
      spinIndex: index,
      lastPocket: result.pocket,
      lastTrace: result.trace,
      history: [...state.history, record].slice(-100),
      profitSeries: [...state.profitSeries, record.cumulative],
      runners,
      theoTotal: state.theoTotal + theo * houseEdge(state.rules.wheel),
      events,
    },
    record,
  };
}

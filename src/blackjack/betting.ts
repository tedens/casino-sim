import { CustomBettingStrategy, StepAction } from '../casino/customStrategies';
import { BlackjackRules } from './types';

export type BettingStrategyId = 'winPress' | 'flat' | 'paroli' | 'oneThreeTwoSix' | 'martingale';

export interface BettingStrategy {
  id: BettingStrategyId;
  name: string;
  /** label for the on-table chip */
  short: string;
  description: string;
}

export const BETTING_STRATEGIES: BettingStrategy[] = [
  { id: 'winPress', name: 'Win press +1', short: '+1 PRESS', description: 'Start at 1 unit. Every win adds a unit up to the cap; any loss resets to 1. Push holds.' },
  { id: 'flat', name: 'Flat bet', short: 'FLAT', description: 'Always 1 unit regardless of results. The baseline to compare progressions against.' },
  { id: 'paroli', name: 'Paroli', short: 'PAROLI', description: 'Double after each win (1-2-4); bank the run after three straight wins and restart at 1. Any loss restarts.' },
  { id: 'oneThreeTwoSix', name: '1-3-2-6', short: '1-3-2-6', description: 'Walk the 1-3-2-6 unit sequence on wins; finishing the sequence or any loss restarts at 1. Push holds.' },
  { id: 'martingale', name: 'Martingale', short: 'MARTIN', description: 'Double after each loss so one win recovers the run; a win resets to 1 unit. Capped at max units — the cap is what saves the bankroll.' },
];

const SEQUENCE_1326 = [1, 3, 2, 6];
// 2^20 already exceeds any sane unit cap
const MAX_STEP = 20;

// units for the current step, clamped to the cap
export function unitsForStep(strategy: BettingStrategyId, step: number, maxUnits: number): number {
  const cap = Math.max(1, maxUnits);
  switch (strategy) {
    case 'flat': return 1;
    case 'winPress': return Math.min(1 + step, cap);
    case 'paroli': return Math.min(2 ** Math.min(step, MAX_STEP), cap);
    case 'oneThreeTwoSix': return Math.min(SEQUENCE_1326[step % SEQUENCE_1326.length], cap);
    case 'martingale': return Math.min(2 ** Math.min(step, MAX_STEP), cap);
  }
}

// advance the step from a settled round's net profit; push holds
export function nextStep(strategy: BettingStrategyId, step: number, roundProfit: number): number {
  if (roundProfit === 0) return step;
  const won = roundProfit > 0;
  switch (strategy) {
    case 'flat': return 0;
    case 'winPress': return won ? Math.min(step + 1, MAX_STEP) : 0;
    case 'paroli': return won ? (step >= 2 ? 0 : step + 1) : 0;
    case 'oneThreeTwoSix': return won ? (step >= SEQUENCE_1326.length - 1 ? 0 : step + 1) : 0;
    case 'martingale': return won ? 0 : Math.min(step + 1, MAX_STEP);
  }
}

// clamp to table max and bankroll; a result below table minimum means don't deal
export function progressionBet(units: number, rules: Pick<BlackjackRules, 'tableMinimum' | 'tableMaximum'>, bankroll: number): number {
  return Math.max(0, Math.min(units * rules.tableMinimum, rules.tableMaximum, bankroll));
}

export interface ResolvedStrategy {
  id: string;
  name: string;
  short: string;
  description: string;
  unitsForStep(step: number, maxUnits: number): number;
  nextStep(step: number, roundProfit: number): number;
}

function applyAction(action: StepAction, step: number, length: number, loop: boolean): number {
  switch (action) {
    case 'reset': return 0;
    case 'hold': return step;
    case 'stepBack': return Math.max(0, step - 1);
    case 'advance': return loop ? (step + 1) % length : Math.min(step + 1, length - 1);
  }
}

// presets and user-defined ladders behind one interface; unknown ids fall back to win press
export function resolveStrategy(id: string, customs: CustomBettingStrategy[]): ResolvedStrategy {
  const custom = customs.find((item) => item.id === id);
  if (custom) {
    const length = custom.sequence.length;
    return {
      id: custom.id,
      name: custom.name,
      short: custom.name.toUpperCase().slice(0, 10),
      description: `Custom ladder ${custom.sequence.join('-')} · win: ${custom.onWin} · loss: ${custom.onLoss}${custom.loop ? ' · loops' : ''}. Push holds.`,
      unitsForStep: (step, maxUnits) => Math.min(custom.sequence[Math.min(Math.max(step, 0), length - 1)], Math.max(1, maxUnits)),
      nextStep: (step, roundProfit) => roundProfit === 0 ? step : applyAction(roundProfit > 0 ? custom.onWin : custom.onLoss, Math.min(step, length - 1), length, custom.loop),
    };
  }
  const preset = BETTING_STRATEGIES.find((item) => item.id === id) ?? BETTING_STRATEGIES[0];
  return {
    ...preset,
    unitsForStep: (step, maxUnits) => unitsForStep(preset.id, step, maxUnits),
    nextStep: (step, roundProfit) => nextStep(preset.id, step, roundProfit),
  };
}

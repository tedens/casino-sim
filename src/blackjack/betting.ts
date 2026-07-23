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

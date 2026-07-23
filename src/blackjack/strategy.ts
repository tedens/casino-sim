import { Allowed, Hint, decide } from './basicStrategy';
import { availableActions } from './engine';
import { BlackjackRules, BlackjackState, Card, Rank } from './types';

export { decide };
export type { Allowed, Hint };

export function hintFor(state: BlackjackState): Hint | null {
  if (state.phase !== 'player') return null;
  const hand = state.hands[state.activeHand];
  const actions = availableActions(state);
  if (!hand || actions.length === 0 || state.dealer.length === 0) return null;
  const result = decide(hand.cards, state.dealer[0], state.rules, {
    hit: actions.includes('hit'),
    double: actions.includes('double'),
    split: actions.includes('split'),
    surrender: actions.includes('surrender'),
  });
  return actions.includes(result.action) ? result : { action: actions[0], reason: result.reason };
}

export type ChartCode = 'H' | 'S' | 'D' | 'Ds' | 'P' | 'Rh' | 'Rs' | 'Rp';

export const CHART_LEGEND: Record<ChartCode, string> = {
  H: 'Hit',
  S: 'Stand',
  D: 'Double, else hit',
  Ds: 'Double, else stand',
  P: 'Split',
  Rh: 'Surrender, else hit',
  Rs: 'Surrender, else stand',
  Rp: 'Surrender, else split',
};

export interface ChartRow {
  label: string;
  cells: ChartCode[];
}

export interface ChartSection {
  title: string;
  rows: ChartRow[];
}

const UP_CARDS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];
export const CHART_UP_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];

function chartCell(cards: Card[], up: Rank, rules: BlackjackRules): ChartCode {
  const dealer: Card = { rank: up, suit: '♠' };
  const full = decide(cards, dealer, rules, { hit: true, double: true, split: true, surrender: rules.surrenderAllowed });
  if (full.action === 'surrender') {
    const without = decide(cards, dealer, rules, { hit: true, double: true, split: true, surrender: false });
    return without.action === 'stand' ? 'Rs' : without.action === 'split' ? 'Rp' : 'Rh';
  }
  if (full.action === 'split') return 'P';
  if (full.action === 'double') {
    const without = decide(cards, dealer, rules, { hit: true, double: false, split: true, surrender: false });
    return without.action === 'stand' ? 'Ds' : 'D';
  }
  return full.action === 'stand' ? 'S' : 'H';
}

function row(label: string, cards: Card[], rules: BlackjackRules): ChartRow {
  return { label, cells: UP_CARDS.map((up) => chartCell(cards, up, rules)) };
}

const card = (rank: Rank): Card => ({ rank, suit: '♠' });

export function strategyChart(rules: BlackjackRules): ChartSection[] {
  const hardShape: Array<[string, Rank, Rank]> = [
    ['5–7', '4', '3'], ['8', '5', '3'], ['9', '5', '4'], ['10', '6', '4'], ['11', '6', '5'],
    ['12', '10', '2'], ['13', '10', '3'], ['14', '10', '4'], ['15', '10', '5'], ['16', '10', '6'], ['17', '10', '7'], ['18+', '10', '8'],
  ];
  const softShape: Array<[string, Rank]> = [
    ['A,2', '2'], ['A,3', '3'], ['A,4', '4'], ['A,5', '5'], ['A,6', '6'], ['A,7', '7'], ['A,8', '8'], ['A,9', '9'],
  ];
  const pairShape: Rank[] = ['A', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
  return [
    { title: 'Hard totals', rows: hardShape.map(([label, a, b]) => row(label, [card(a), card(b)], rules)) },
    { title: 'Soft totals', rows: softShape.map(([label, kicker]) => row(label, [card('A'), card(kicker)], rules)) },
    { title: 'Pairs', rows: pairShape.map((rank) => ({ label: `${rank},${rank}`, cells: UP_CARDS.map((up) => chartCell([card(rank), card(rank)], up, rules)) })) },
  ];
}

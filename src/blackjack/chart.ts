import { cardValue, handValue } from './cards';
import { Card, PlayerAction, Rank } from './types';

export interface Hint {
  action: PlayerAction;
  reason: string;
}

export interface Allowed {
  hit: boolean;
  double: boolean;
  split: boolean;
  surrender: boolean;
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

export type ChartSectionId = 'hard' | 'soft' | 'pair';

// dealer up-cards, left to right
export const CHART_UP_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];
const UP_RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];

const card = (rank: Rank): Card => ({ rank, suit: '♠' });

export interface ChartRowDef {
  section: ChartSectionId;
  label: string;
  /** two-card hand that represents this row, used to compute the book cell */
  representative: Card[];
}

// canonical rows, shared by the chart generator and the live-hand mapper so
// the card the user edits is exactly the card the engine plays
export const CHART_ROWS: ChartRowDef[] = [
  ...([['5–7', '4', '3'], ['8', '5', '3'], ['9', '5', '4'], ['10', '6', '4'], ['11', '6', '5'],
    ['12', '10', '2'], ['13', '10', '3'], ['14', '10', '4'], ['15', '10', '5'], ['16', '10', '6'], ['17', '10', '7'], ['18+', '10', '8']] as Array<[string, Rank, Rank]>)
    .map(([label, a, b]) => ({ section: 'hard' as const, label, representative: [card(a), card(b)] })),
  ...(['2', '3', '4', '5', '6', '7', '8', '9'] as Rank[])
    .map((kicker) => ({ section: 'soft' as const, label: `A,${kicker}`, representative: [card('A'), card(kicker)] })),
  ...(['A', '10', '9', '8', '7', '6', '5', '4', '3', '2'] as Rank[])
    .map((rank) => ({ section: 'pair' as const, label: `${rank},${rank}`, representative: [card(rank), card(rank)] })),
];

export function cellKey(section: ChartSectionId, label: string, upLabel: string): string {
  return `${section}:${label}:${upLabel}`;
}

export function upLabelFor(dealerUp: Card): string {
  return dealerUp.rank === 'A' ? 'A' : String(cardValue(dealerUp) === 10 ? 10 : cardValue(dealerUp));
}

// map a live hand to its chart cell, or null when no row applies (e.g. a busted or 21 total)
export function handCell(cards: Card[], dealerUp: Card): { section: ChartSectionId; label: string; upLabel: string } | null {
  const upLabel = upLabelFor(dealerUp);
  const { total, soft } = handValue(cards);
  const isPair = cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1]);
  if (isPair) {
    const label = cardValue(cards[0]) === 10 ? '10,10' : `${cards[0].rank},${cards[0].rank}`;
    return { section: 'pair', label, upLabel };
  }
  if (soft && total >= 13 && total <= 20) return { section: 'soft', label: `A,${total - 11}`, upLabel };
  if (!soft) {
    if (total >= 5 && total <= 7) return { section: 'hard', label: '5–7', upLabel };
    if (total >= 8 && total <= 17) return { section: 'hard', label: String(total), upLabel };
    if (total >= 18) return { section: 'hard', label: '18+', upLabel };
  }
  return null;
}

// resolve an override code to a concrete play given what the table currently allows;
// null means the code can't apply here, so the caller should fall back to the book
export function codeToHint(code: ChartCode, allowed: Allowed): Hint | null {
  const reason = 'Playing your custom card.';
  switch (code) {
    case 'H': return allowed.hit ? { action: 'hit', reason } : { action: 'stand', reason };
    case 'S': return { action: 'stand', reason };
    case 'D': return allowed.double ? { action: 'double', reason } : allowed.hit ? { action: 'hit', reason } : { action: 'stand', reason };
    case 'Ds': return allowed.double ? { action: 'double', reason } : { action: 'stand', reason };
    case 'P': return allowed.split ? { action: 'split', reason } : null;
    case 'Rh': return allowed.surrender ? { action: 'surrender', reason } : allowed.hit ? { action: 'hit', reason } : { action: 'stand', reason };
    case 'Rs': return allowed.surrender ? { action: 'surrender', reason } : { action: 'stand', reason };
    case 'Rp': return allowed.surrender ? { action: 'surrender', reason } : allowed.split ? { action: 'split', reason } : null;
  }
}

export const UP_RANK_BY_LABEL: Record<string, Rank> = Object.fromEntries(CHART_UP_LABELS.map((label, i) => [label, UP_RANKS[i]]));

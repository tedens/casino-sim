import { decideBook } from './basicStrategy';
import { CHART_ROWS, CHART_UP_LABELS, ChartCode, ChartSectionId, Hint, UP_RANK_BY_LABEL, cellKey } from './chart';
import { availableActions } from './engine';
import { StrategyOverrides } from './strategyOverrides';
import { BlackjackRules, BlackjackState, Card } from './types';

export { decide } from './basicStrategy';
export type { Allowed, Hint } from './chart';
export { CHART_LEGEND, CHART_UP_LABELS } from './chart';
export type { ChartCode } from './chart';

export function hintFor(state: BlackjackState, overrides?: StrategyOverrides): Hint | null {
  if (state.phase !== 'player') return null;
  const hand = state.hands[state.activeHand];
  const actions = availableActions(state);
  if (!hand || actions.length === 0 || state.dealer.length === 0) return null;
  const allowed = {
    hit: actions.includes('hit'),
    double: actions.includes('double'),
    split: actions.includes('split'),
    surrender: actions.includes('surrender'),
  };
  const result = decideEffective(hand.cards, state.dealer[0], state.rules, allowed, overrides);
  return actions.includes(result.action) ? result : { action: actions[0], reason: result.reason };
}

// re-exported decide already layers overrides; local alias keeps intent clear
import { decide as decideEffective } from './basicStrategy';

export interface ChartRow {
  section: ChartSectionId;
  label: string;
  cells: ChartCode[];
}

export interface ChartSection {
  title: string;
  section: ChartSectionId;
  rows: ChartRow[];
}

const SECTION_TITLES: Record<ChartSectionId, string> = { hard: 'Hard totals', soft: 'Soft totals', pair: 'Pairs' };

// the book code for one cell, before any user override
export function bookCode(cards: Card[], upLabel: string, rules: BlackjackRules): ChartCode {
  const dealer: Card = { rank: UP_RANK_BY_LABEL[upLabel], suit: '♠' };
  const full = decideBook(cards, dealer, rules, { hit: true, double: true, split: true, surrender: rules.surrenderAllowed });
  if (full.action === 'surrender') {
    const without = decideBook(cards, dealer, rules, { hit: true, double: true, split: true, surrender: false });
    return without.action === 'stand' ? 'Rs' : without.action === 'split' ? 'Rp' : 'Rh';
  }
  if (full.action === 'split') return 'P';
  if (full.action === 'double') {
    const without = decideBook(cards, dealer, rules, { hit: true, double: false, split: true, surrender: false });
    return without.action === 'stand' ? 'Ds' : 'D';
  }
  return full.action === 'stand' ? 'S' : 'H';
}

// the effective chart: book codes with any user overrides applied, grouped by section
export function strategyChart(rules: BlackjackRules, overrides: StrategyOverrides = {}): ChartSection[] {
  const sections: ChartSectionId[] = ['hard', 'soft', 'pair'];
  return sections.map((section) => ({
    title: SECTION_TITLES[section],
    section,
    rows: CHART_ROWS.filter((row) => row.section === section).map((row) => ({
      section,
      label: row.label,
      cells: CHART_UP_LABELS.map((upLabel) => overrides[cellKey(section, row.label, upLabel)] ?? bookCode(row.representative, upLabel, rules)),
    })),
  }));
}

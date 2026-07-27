import { cardValue, handValue } from './cards';
import { Allowed, Hint, cellKey, codeToHint, handCell } from './chart';
import { StrategyOverrides } from './strategyOverrides';
import { BlackjackRules, Card } from './types';

export type { Allowed, Hint } from './chart';

const hint = (action: Hint['action'], reason: string): Hint => ({ action, reason });

// entry point: a user card override wins when it applies here, otherwise the book plays
export function decide(cards: Card[], dealerUp: Card, rules: BlackjackRules, allowed: Allowed, overrides?: StrategyOverrides): Hint {
  if (overrides) {
    const cell = handCell(cards, dealerUp);
    if (cell) {
      const code = overrides[cellKey(cell.section, cell.label, cell.upLabel)];
      if (code) {
        const resolved = codeToHint(code, allowed);
        if (resolved) return resolved;
      }
    }
  }
  return decideBook(cards, dealerUp, rules, allowed);
}

// multi-deck basic strategy with dealer peek; respects h17/s17, das and surrender rules.
// `allowed` reflects what the table currently permits, so the result is always playable.
export function decideBook(cards: Card[], dealerUp: Card, rules: BlackjackRules, allowed: Allowed): Hint {
  const up = cardValue(dealerUp);
  const h17 = rules.dealerHitsSoft17;
  const { total, soft } = handValue(cards);
  if (!allowed.hit) return hint('stand', 'No further cards allowed on this hand.');

  const pair = cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1]);
  if (pair && allowed.split) {
    const rank = cards[0].rank;
    const value = cardValue(cards[0]);
    if (rank === 'A') return hint('split', 'Always split aces — two chances to start from 11.');
    if (value === 10) return hint('stand', '20 wins far too often to break up.');
    if (rank === '9') {
      if (up === 7) return hint('stand', '18 beats a dealer 17 from the 7 — stand.');
      if (up <= 9) return hint('split', 'Split 9s against 2–6, 8, 9 for two strong 18-plus chances.');
      return hint('stand', '18 holds against a strong dealer card.');
    }
    if (rank === '8') {
      if (up === 11 && h17 && rules.surrenderAllowed && allowed.surrender) return hint('surrender', '8-8 vs ace under H17: surrender loses less than splitting.');
      return hint('split', '16 is the worst total — splitting 8s always beats playing it.');
    }
    if (rank === '7') return up <= 7 ? hint('split', 'Split 7s against 2–7 — 14 is weak, two 7s are workable.') : hint('hit', '14 vs a strong card: hit rather than split.');
    if (rank === '6') {
      const low = rules.doubleAfterSplit ? 2 : 3;
      return up >= low && up <= 6 ? hint('split', 'Split 6s while the dealer shows a bust card.') : hint('hit', '12 vs a strong card: hit rather than split.');
    }
    if (rank === '4') {
      if (rules.doubleAfterSplit && (up === 5 || up === 6)) return hint('split', 'With double-after-split, 4s split against 5 and 6.');
      // no split: falls through, plays as hard 8
    } else if (rank === '2' || rank === '3') {
      const low = rules.doubleAfterSplit ? 2 : 4;
      return up >= low && up <= 7 ? hint('split', `Split ${rank}s against a weak dealer card.`) : hint('hit', 'Weak pair vs strong card — just hit.');
    }
    // 5-5 and unsplit 4-4 play as hard totals
  }

  if (soft && total >= 13) {
    if (total >= 20) return hint('stand', 'Soft 20 stands — never risk it.');
    if (total === 19) {
      if (h17 && up === 6 && allowed.double) return hint('double', 'Soft 19 vs 6 under H17 is a profitable double.');
      return hint('stand', 'Soft 19 is a winning total — stand.');
    }
    if (total === 18) {
      const doubleLow = h17 ? 2 : 3;
      if (up >= doubleLow && up <= 6 && allowed.double) return hint('double', 'Soft 18 vs a bust card: double to press the edge.');
      if (up <= 8) return hint('stand', 'Soft 18 holds against 2–8.');
      return hint('hit', 'Soft 18 loses to 9, 10, ace — hit to improve.');
    }
    const doubleLow = total === 17 ? 3 : total >= 15 ? 4 : 5;
    if (up >= doubleLow && up <= 6 && allowed.double) return hint('double', `Soft ${total} vs ${up}: double while the dealer is weak.`);
    return hint('hit', `Soft ${total} can’t bust — always draw.`);
  }

  if (allowed.surrender && rules.surrenderAllowed) {
    if (total === 16 && up >= 9) return hint('surrender', '16 vs 9, 10, or ace loses more than half — surrender.');
    if (total === 15 && (up === 10 || (h17 && up === 11))) return hint('surrender', `15 vs ${up === 10 ? '10' : 'ace'} is a money-saver surrender.`);
    if (total === 17 && h17 && up === 11) return hint('surrender', 'Hard 17 vs ace under H17: surrender loses least.');
  }

  if (total >= 17) return hint('stand', `Hard ${total} stands — the dealer must draw to 17.`);
  if (total >= 13) return up <= 6 ? hint('stand', `Hard ${total} vs ${up}: let the dealer bust.`) : hint('hit', `Hard ${total} vs ${up}: the dealer likely makes a hand — hit.`);
  if (total === 12) return up >= 4 && up <= 6 ? hint('stand', '12 stands only against 4–6 bust cards.') : hint('hit', '12 vs 2, 3, or a strong card: hit.');
  if (total === 11) {
    if (allowed.double && (up <= 10 || h17)) return hint('double', '11 is the best doubling hand.');
    return hint('hit', '11 always takes a card.');
  }
  if (total === 10) return up <= 9 && allowed.double ? hint('double', '10 vs 2–9: double while you have the edge.') : hint('hit', '10 draws against a 10 or ace.');
  if (total === 9) return up >= 3 && up <= 6 && allowed.double ? hint('double', '9 vs 3–6: double into the dealer’s bust range.') : hint('hit', '9 takes a card.');
  return hint('hit', `Hard ${total} can’t stand — always draw.`);
}

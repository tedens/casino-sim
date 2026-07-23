import { Card } from './types';

export function cardValue(card: Card): number {
  if (card.rank === 'A') return 11;
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return 10;
  return Number(card.rank);
}

export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += cardValue(card);
    if (card.rank === 'A') aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 };
}

export function isBust(cards: Card[]): boolean {
  return handValue(cards).total > 21;
}

export function handLabel(cards: Card[]): string {
  const { total, soft } = handValue(cards);
  if (total > 21) return `${total} · BUST`;
  return soft ? `soft ${total}` : String(total);
}

export function cardText(card: Card): string {
  return `${card.rank}${card.suit}`;
}

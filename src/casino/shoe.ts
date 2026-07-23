import { SeededRng, createManualSeed, deriveSeed } from '../domain/rng';
import { Card, Rank, Suit } from '../blackjack/types';

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export interface Shoe {
  cards: Card[];
  shoeSeed: string;
  shoeNumber: number;
  /** remaining-card count that triggers a reshuffle */
  reshuffleAt: number;
}

export function buildShoe(shoeSeed: string, decks: number): Card[] {
  const cards: Card[] = [];
  for (let deck = 0; deck < decks; deck += 1) {
    for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit });
  }
  const rng = new SeededRng(deriveSeed(shoeSeed, 'shoe'));
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = rng.nextUint32() % (i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

// cut card lands at the configured penetration +/- 4%, derived from the shoe seed
export function cutReshuffleAt(shoeSeed: string, decks: number, penetration: number): number {
  const rng = new SeededRng(deriveSeed(shoeSeed, 'cut'));
  const jitter = (rng.nextFloat() - 0.5) * 0.08;
  const cut = Math.min(0.9, Math.max(0.5, penetration + jitter));
  return Math.floor(decks * 52 * (1 - cut));
}

export function freshShoe(shoeSeed: string, shoeNumber: number, decks: number, penetration: number): Shoe {
  return { cards: buildShoe(shoeSeed, decks), shoeSeed, shoeNumber, reshuffleAt: cutReshuffleAt(shoeSeed, decks, penetration) };
}

// real shuffle: new random seed + new cut, so sessions aren't replayable across shoes
export function rotatedShoe(previousShoeNumber: number, decks: number, penetration: number): Shoe {
  return freshShoe(createManualSeed(), previousShoeNumber + 1, decks, penetration);
}

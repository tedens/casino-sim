export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type HandOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'surrender';

export interface BlackjackHand {
  id: string;
  cards: Card[];
  bet: number;
  doubled: boolean;
  surrendered: boolean;
  fromSplit: boolean;
  splitAces: boolean;
  stood: boolean;
  outcome?: HandOutcome;
  profit?: number;
}

export interface BlackjackRules {
  decks: number;
  dealerHitsSoft17: boolean;
  blackjackPayout: number;
  surrenderAllowed: boolean;
  doubleAfterSplit: boolean;
  maxHands: number;
  hitSplitAces: boolean;
  resplitAces: boolean;
  /** fraction of the shoe dealt before the cut card */
  penetration: number;
  tableMinimum: number;
  tableMaximum: number;
  /** bot seats (0-5) playing basic strategy from the same shoe */
  aiPlayers: number;
  /** auto insurance (3:2) on a two-card 20 vs dealer ace */
  insureTwentyVsAce: boolean;
}

export interface AiPlayer {
  id: string;
  name: string;
  hands: BlackjackHand[];
}

export interface BotSeat {
  name: string;
  bankroll: number;
  /** fresh stakes borrowed after going broke */
  friends: number;
}

export type BlackjackPhase = 'betting' | 'player' | 'settled';

export interface RoundRecord {
  index: number;
  playerSummary: string;
  dealerSummary: string;
  outcomes: HandOutcome[];
  profit: number;
  /** session profit after this round */
  cumulative: number;
}

export interface BlackjackState {
  seed: string;
  rules: BlackjackRules;
  shoe: Card[];
  shoeNumber: number;
  /** seed the current shoe was shuffled with; rotates on every reshuffle */
  shoeSeed: string;
  /** remaining-card count that triggers a reshuffle */
  reshuffleAt: number;
  bankroll: number;
  startingBankroll: number;
  hands: BlackjackHand[];
  activeHand: number;
  aiPlayers: AiPlayer[];
  /** persistent bot bankrolls, parallel to the ai seats */
  botRoster: BotSeat[];
  /** insurance side bet, resolved at the dealer peek */
  insurance: { stake: number; result?: 'won' | 'lost' } | null;
  dealer: Card[];
  holeRevealed: boolean;
  phase: BlackjackPhase;
  roundIndex: number;
  lastBet: number;
  history: RoundRecord[];
  /** cumulative profit per settled round, uncapped (feeds the session graph) */
  profitSeries: number[];
  events: string[];
}

export type PlayerAction = 'hit' | 'stand' | 'double' | 'split' | 'surrender';

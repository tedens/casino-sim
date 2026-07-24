import { Card } from '../blackjack/types';

export type BaccaratBetKind = 'player' | 'banker' | 'tie' | 'playerPair' | 'bankerPair';

export type BaccaratOutcome = 'player' | 'banker' | 'tie';

export interface BaccaratRules {
  decks: number;
  /** fraction of the shoe dealt before the cut card */
  penetration: number;
  tableMinimum: number;
  tableMaximum: number;
  /** banker wins pay 1:1 minus this commission */
  bankerCommission: number;
  tiePayout: number;
  pairPayout: number;
}

export interface BaccaratRoundRecord {
  index: number;
  playerCards: Card[];
  bankerCards: Card[];
  playerTotal: number;
  bankerTotal: number;
  outcome: BaccaratOutcome;
  playerPair: boolean;
  bankerPair: boolean;
  /** what was staked on each spot this round */
  bets: Partial<Record<BaccaratBetKind, number>>;
  profit: number;
  /** session profit after this round */
  cumulative: number;
}

export interface BaccaratState {
  seed: string;
  rules: BaccaratRules;
  shoe: Card[];
  shoeNumber: number;
  /** seed the current shoe was shuffled with; rotates on every reshuffle */
  shoeSeed: string;
  /** remaining-card count that triggers a reshuffle */
  reshuffleAt: number;
  bankroll: number;
  startingBankroll: number;
  /** last settled round's hands, kept for the felt display */
  playerCards: Card[];
  bankerCards: Card[];
  outcome: BaccaratOutcome | null;
  roundIndex: number;
  lastBets: Partial<Record<BaccaratBetKind, number>>;
  history: BaccaratRoundRecord[];
  /** cumulative profit per settled round, uncapped (feeds the session graph) */
  profitSeries: number[];
  /** outcome sequence for the current shoe's bead road; resets on every reshuffle */
  beadRoad: BaccaratOutcome[];
  events: string[];
}

import { freshShoe, rotatedShoe } from '../casino/shoe';
import { Card } from '../blackjack/types';
import { BaccaratBetKind, BaccaratOutcome, BaccaratRoundRecord, BaccaratRules, BaccaratState } from './types';

export const DEFAULT_BACCARAT_RULES: BaccaratRules = {
  decks: 8,
  penetration: 0.85,
  tableMinimum: 5,
  tableMaximum: 5000,
  bankerCommission: 0.05,
  tiePayout: 8,
  pairPayout: 11,
};

export const BET_KINDS: BaccaratBetKind[] = ['playerPair', 'player', 'tie', 'banker', 'bankerPair'];

// baccarat card values: ace 1, faces and tens 0, everything else pip value
export function baccaratValue(card: Card): number {
  if (card.rank === 'A') return 1;
  if (card.rank === '10' || card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return 0;
  return Number(card.rank);
}

export function baccaratTotal(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + baccaratValue(card), 0) % 10;
}

export function createBaccaratState(options: { seed: string; startingBankroll?: number; rules?: Partial<BaccaratRules> }): BaccaratState {
  const rules = { ...DEFAULT_BACCARAT_RULES, ...options.rules };
  const bankroll = options.startingBankroll ?? 1000;
  const first = freshShoe(options.seed, 1, rules.decks, rules.penetration);
  return {
    seed: options.seed,
    rules,
    shoe: first.cards,
    shoeNumber: first.shoeNumber,
    shoeSeed: first.shoeSeed,
    reshuffleAt: first.reshuffleAt,
    bankroll,
    startingBankroll: bankroll,
    playerCards: [],
    bankerCards: [],
    outcome: null,
    roundIndex: 0,
    lastBets: {},
    history: [],
    profitSeries: [],
    beadRoad: [],
    events: [],
  };
}

export function sessionProfit(state: BaccaratState): number {
  return state.bankroll - state.startingBankroll;
}

// punto banco third-card tableau: banker's draw depends on the player's third card
function bankerDraws(bankerTotal: number, playerThird: Card | undefined): boolean {
  if (playerThird === undefined) return bankerTotal <= 5;
  const third = baccaratValue(playerThird);
  if (bankerTotal <= 2) return true;
  if (bankerTotal === 3) return third !== 8;
  if (bankerTotal === 4) return third >= 2 && third <= 7;
  if (bankerTotal === 5) return third >= 4 && third <= 7;
  if (bankerTotal === 6) return third >= 6 && third <= 7;
  return false;
}

/** Plays one complete coup: deal, tableau, settle every staked spot. Baccarat has no player decisions. */
export function playRound(state: BaccaratState, bets: Partial<Record<BaccaratBetKind, number>>): { state: BaccaratState; error?: string } {
  const staked = Object.entries(bets).filter(([, amount]) => (amount ?? 0) > 0) as Array<[BaccaratBetKind, number]>;
  const total = staked.reduce((sum, [, amount]) => sum + amount, 0);
  if (total < state.rules.tableMinimum) return { state, error: `Table minimum is $${state.rules.tableMinimum}.` };
  if (staked.some(([, amount]) => amount > state.rules.tableMaximum)) return { state, error: `Maximum per spot is $${state.rules.tableMaximum}.` };
  if (total > state.bankroll) return { state, error: 'Bets exceed bankroll.' };

  let next: BaccaratState = { ...state, events: [] };
  if (next.shoe.length <= next.reshuffleAt) {
    const rotated = rotatedShoe(next.shoeNumber, next.rules.decks, next.rules.penetration);
    next = { ...next, shoe: rotated.cards, shoeSeed: rotated.shoeSeed, shoeNumber: rotated.shoeNumber, reshuffleAt: rotated.reshuffleAt, events: ['Cut card out · fresh shuffle & cut.'] };
  }

  let shoe = [...next.shoe];
  let shoeNumber = next.shoeNumber;
  let shoeSeed = next.shoeSeed;
  let reshuffleAt = next.reshuffleAt;
  const events = [...next.events];
  const draw = (): Card => {
    if (shoe.length === 0) {
      const rotated = rotatedShoe(shoeNumber, next.rules.decks, next.rules.penetration);
      shoe = [...rotated.cards];
      shoeSeed = rotated.shoeSeed;
      shoeNumber = rotated.shoeNumber;
      reshuffleAt = rotated.reshuffleAt;
      events.push('Shoe exhausted mid-coup · fresh shuffle & cut.');
    }
    return shoe.shift()!;
  };

  // deal order: player, banker, player, banker
  const playerCards = [draw()];
  const bankerCards = [draw()];
  playerCards.push(draw());
  bankerCards.push(draw());

  const playerTwo = baccaratTotal(playerCards);
  const bankerTwo = baccaratTotal(bankerCards);
  const natural = playerTwo >= 8 || bankerTwo >= 8;

  let playerThird: Card | undefined;
  if (!natural) {
    if (playerTwo <= 5) {
      playerThird = draw();
      playerCards.push(playerThird);
    }
    if (bankerDraws(bankerTwo, playerThird)) {
      bankerCards.push(draw());
    }
  }

  const playerTotal = baccaratTotal(playerCards);
  const bankerTotal = baccaratTotal(bankerCards);
  const outcome: BaccaratOutcome = playerTotal > bankerTotal ? 'player' : bankerTotal > playerTotal ? 'banker' : 'tie';
  const playerPair = playerCards[0].rank === playerCards[1].rank;
  const bankerPair = bankerCards[0].rank === bankerCards[1].rank;

  if (natural) events.push(`Natural ${Math.max(playerTwo, bankerTwo)}.`);
  events.push(`Player ${playerTotal} · Banker ${bankerTotal} — ${outcome === 'tie' ? 'TIE' : `${outcome.toUpperCase()} wins`}.`);

  let bankroll = next.bankroll - total;
  let profit = 0;
  for (const [kind, amount] of staked) {
    let returned = 0;
    switch (kind) {
      case 'player':
        returned = outcome === 'player' ? amount * 2 : outcome === 'tie' ? amount : 0;
        break;
      case 'banker':
        returned = outcome === 'banker' ? amount + amount * (1 - next.rules.bankerCommission) : outcome === 'tie' ? amount : 0;
        break;
      case 'tie':
        returned = outcome === 'tie' ? amount * (1 + next.rules.tiePayout) : 0;
        break;
      case 'playerPair':
        returned = playerPair ? amount * (1 + next.rules.pairPayout) : 0;
        break;
      case 'bankerPair':
        returned = bankerPair ? amount * (1 + next.rules.pairPayout) : 0;
        break;
    }
    bankroll += returned;
    const net = returned - amount;
    profit += net;
    if (net !== 0) events.push(`${betLabel(kind)} ${net > 0 ? 'wins' : 'loses'} ${net > 0 ? '+' : '−'}$${Math.abs(Math.round(net * 100) / 100)}.`);
    else events.push(`${betLabel(kind)} pushes.`);
  }

  const record: BaccaratRoundRecord = {
    index: next.roundIndex + 1,
    playerCards,
    bankerCards,
    playerTotal,
    bankerTotal,
    outcome,
    playerPair,
    bankerPair,
    bets: Object.fromEntries(staked),
    profit,
    cumulative: bankroll - next.startingBankroll,
  };

  return {
    state: {
      ...next,
      shoe,
      shoeNumber,
      shoeSeed,
      reshuffleAt,
      bankroll,
      playerCards,
      bankerCards,
      outcome,
      roundIndex: record.index,
      lastBets: Object.fromEntries(staked),
      history: [...next.history, record].slice(-60),
      profitSeries: [...next.profitSeries, record.cumulative],
      // a reshuffle (cut card or exhaustion) starts a fresh road for the new shoe
      beadRoad: shoeNumber !== state.shoeNumber ? [outcome] : [...next.beadRoad, outcome],
      events,
    },
  };
}

export function betLabel(kind: BaccaratBetKind): string {
  const labels: Record<BaccaratBetKind, string> = {
    player: 'Player',
    banker: 'Banker',
    tie: 'Tie',
    playerPair: 'Player Pair',
    bankerPair: 'Banker Pair',
  };
  return labels[kind];
}

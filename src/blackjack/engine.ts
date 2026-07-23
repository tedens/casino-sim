import { decide } from './basicStrategy';
import { cardValue, handValue, isBust } from './cards';
import { SeededRng, createManualSeed, deriveSeed } from '../domain/rng';
import { AiPlayer, BlackjackHand, BlackjackRules, BlackjackState, Card, HandOutcome, PlayerAction, Rank, Suit } from './types';

export { cardText, cardValue, handLabel, handValue, isBust } from './cards';

export const DEFAULT_BLACKJACK_RULES: BlackjackRules = {
  decks: 6,
  dealerHitsSoft17: true,
  blackjackPayout: 1.5,
  surrenderAllowed: true,
  doubleAfterSplit: true,
  maxHands: 4,
  hitSplitAces: false,
  resplitAces: false,
  penetration: 0.75,
  tableMinimum: 5,
  tableMaximum: 5000,
  aiPlayers: 0,
  insureTwentyVsAce: false,
};

// insurance pays 3:2 here; house standard is 2:1
export const INSURANCE_PAYOUT = 1.5;

export const MAX_AI_PLAYERS = 5;

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function isBlackjack(hand: BlackjackHand): boolean {
  return !hand.fromSplit && hand.cards.length === 2 && handValue(hand.cards).total === 21;
}

function buildShoe(shoeSeed: string, decks: number): Card[] {
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
function cutReshuffleAt(shoeSeed: string, rules: BlackjackRules): number {
  const rng = new SeededRng(deriveSeed(shoeSeed, 'cut'));
  const jitter = (rng.nextFloat() - 0.5) * 0.08;
  const penetration = Math.min(0.9, Math.max(0.5, rules.penetration + jitter));
  return Math.floor(rules.decks * 52 * (1 - penetration));
}

// real shuffle: new random seed + new cut, so sessions aren't replayable across shoes
function rotateShoe(state: BlackjackState, reason: string): BlackjackState {
  const shoeSeed = createManualSeed();
  return {
    ...state,
    shoe: buildShoe(shoeSeed, state.rules.decks),
    shoeSeed,
    shoeNumber: state.shoeNumber + 1,
    reshuffleAt: cutReshuffleAt(shoeSeed, state.rules),
    events: [...state.events, reason],
  };
}

export function createBlackjackState(options: { seed: string; startingBankroll?: number; rules?: Partial<BlackjackRules> }): BlackjackState {
  const rules = { ...DEFAULT_BLACKJACK_RULES, ...options.rules };
  rules.aiPlayers = Math.max(0, Math.min(MAX_AI_PLAYERS, Math.round(rules.aiPlayers)));
  const bankroll = options.startingBankroll ?? 1000;
  const shoe = buildShoe(options.seed, rules.decks);
  return {
    seed: options.seed,
    rules,
    shoe,
    shoeNumber: 1,
    shoeSeed: options.seed,
    reshuffleAt: cutReshuffleAt(options.seed, rules),
    bankroll,
    startingBankroll: bankroll,
    hands: [],
    activeHand: 0,
    aiPlayers: [],
    insurance: null,
    dealer: [],
    holeRevealed: false,
    phase: 'betting',
    roundIndex: 0,
    lastBet: 0,
    history: [],
    profitSeries: [],
    events: [],
  };
}

export function sessionProfit(state: BlackjackState): number {
  const onTable = state.phase === 'player' ? state.hands.reduce((sum, hand) => sum + hand.bet, 0) : 0;
  return state.bankroll + onTable - state.startingBankroll;
}

interface DrawResult {
  state: BlackjackState;
  card: Card;
}

function draw(state: BlackjackState): DrawResult {
  let next = state;
  if (next.shoe.length === 0) {
    next = rotateShoe(next, 'Shoe exhausted mid-round · fresh shuffle & cut.');
  }
  const [card, ...rest] = next.shoe;
  return { state: { ...next, shoe: rest }, card };
}

function newHand(id: string, bet: number, cards: Card[], fromSplit = false, splitAces = false): BlackjackHand {
  return { id, cards, bet, doubled: false, surrendered: false, fromSplit, splitAces, stood: false };
}

// play every bot seat to completion, drawing in seat order
function playAiHands(state: BlackjackState): BlackjackState {
  if (state.aiPlayers.length === 0) return state;
  let shoe = [...state.shoe];
  let shoeNumber = state.shoeNumber;
  let shoeSeed = state.shoeSeed;
  let reshuffleAt = state.reshuffleAt;
  const events = [...state.events];
  const drawLocal = (): Card => {
    if (shoe.length === 0) {
      shoeSeed = createManualSeed();
      shoeNumber += 1;
      shoe = buildShoe(shoeSeed, state.rules.decks);
      reshuffleAt = cutReshuffleAt(shoeSeed, state.rules);
      events.push('Shoe exhausted mid-round · fresh shuffle & cut.');
    }
    return shoe.shift()!;
  };
  const dealerUp = state.dealer[0];
  const rules = state.rules;
  const players = state.aiPlayers.map((player) => ({ ...player, hands: player.hands.map((hand) => ({ ...hand, cards: [...hand.cards] })) }));

  for (const player of players) {
    let index = 0;
    while (index < player.hands.length) {
      const hand = player.hands[index];
      for (;;) {
        if (hand.cards.length === 1) hand.cards.push(drawLocal());
        const { total } = handValue(hand.cards);
        if (total >= 21) { hand.stood = true; break; }
        const lockedAces = hand.splitAces && !rules.hitSplitAces && hand.cards.length >= 2;
        if (lockedAces) { hand.stood = true; break; }
        const firstTwo = hand.cards.length === 2;
        const play = decide(hand.cards, dealerUp, rules, {
          hit: true,
          double: firstTwo && (!hand.fromSplit || rules.doubleAfterSplit),
          split: firstTwo && cardValue(hand.cards[0]) === cardValue(hand.cards[1]) && player.hands.length < rules.maxHands && (!hand.splitAces || rules.resplitAces),
          surrender: rules.surrenderAllowed && firstTwo && !hand.fromSplit && player.hands.length === 1,
        });
        if (play.action === 'stand') { hand.stood = true; break; }
        if (play.action === 'surrender') { hand.surrendered = true; hand.stood = true; break; }
        if (play.action === 'double') { hand.cards.push(drawLocal()); hand.doubled = true; hand.stood = true; break; }
        if (play.action === 'split') {
          const splitAces = hand.cards[0].rank === 'A';
          const second = newHand(`${hand.id}s${player.hands.length}`, hand.bet, [hand.cards[1]], true, splitAces);
          hand.cards = [hand.cards[0]];
          hand.fromSplit = true;
          hand.splitAces = splitAces;
          player.hands.splice(index + 1, 0, second);
          continue;
        }
        hand.cards.push(drawLocal());
      }
      index += 1;
    }
  }
  return { ...state, shoe, shoeNumber, shoeSeed, reshuffleAt, events, aiPlayers: players };
}

export function startRound(state: BlackjackState, bet: number): { state: BlackjackState; error?: string } {
  if (state.phase === 'player') return { state, error: 'Round already in progress.' };
  if (bet < state.rules.tableMinimum) return { state, error: `Table minimum is $${state.rules.tableMinimum}.` };
  if (bet > state.rules.tableMaximum) return { state, error: `Table maximum is $${state.rules.tableMaximum}.` };
  if (bet > state.bankroll) return { state, error: 'Bet exceeds bankroll.' };

  let next: BlackjackState = { ...state, events: [] };
  if (next.shoe.length <= next.reshuffleAt) {
    next = rotateShoe(next, 'Cut card out · fresh shuffle & cut.');
  }

  const roundIndex = next.roundIndex + 1;
  const take = (): Card => {
    const result = draw(next);
    next = result.state;
    return result.card;
  };

  // deal order: seats, then player, then dealer, twice around
  const aiCount = Math.max(0, Math.min(MAX_AI_PLAYERS, next.rules.aiPlayers));
  const aiPlayers: AiPlayer[] = Array.from({ length: aiCount }, (_, i) => ({
    id: `r${roundIndex}-p${i + 1}`,
    name: `P${i + 1}`,
    hands: [newHand(`r${roundIndex}-p${i + 1}-h1`, next.rules.tableMinimum, [take()])],
  }));
  const playerFirst = take();
  const dealerUp = take();
  for (const player of aiPlayers) player.hands[0].cards.push(take());
  const playerSecond = take();
  const dealerHole = take();

  const hand = newHand(`r${roundIndex}-h1`, bet, [playerFirst, playerSecond]);
  next = {
    ...next,
    bankroll: next.bankroll - bet,
    hands: [hand],
    activeHand: 0,
    aiPlayers,
    insurance: null,
    dealer: [dealerUp, dealerHole],
    holeRevealed: false,
    phase: 'player',
    roundIndex,
    lastBet: bet,
  };

  if (next.rules.insureTwentyVsAce && dealerUp.rank === 'A' && handValue(hand.cards).total === 20 && next.bankroll >= bet / 2) {
    const stake = bet / 2;
    next = { ...next, bankroll: next.bankroll - stake, insurance: { stake }, events: [...next.events, `Insurance taken on 20 vs ace — $${stake} pays 3:2.`] };
  }

  const dealerPeeks = cardValue(dealerUp) >= 10;
  const dealerHasBlackjack = handValue(next.dealer).total === 21;
  if (dealerPeeks && dealerHasBlackjack) {
    if (next.insurance) {
      const winnings = next.insurance.stake * INSURANCE_PAYOUT;
      next = { ...next, bankroll: next.bankroll + next.insurance.stake + winnings, insurance: { ...next.insurance, result: 'won' }, events: [...next.events, `Insurance wins $${winnings}.`] };
    }
    return { state: settleRound({ ...next, holeRevealed: true, events: [...next.events, 'Dealer shows blackjack.'] }) };
  }
  if (next.insurance) {
    next = { ...next, insurance: { ...next.insurance, result: 'lost' }, events: [...next.events, 'Insurance loses — dealer has no blackjack.'] };
  }
  next = playAiHands(next);
  if (isBlackjack(hand)) {
    return { state: settleRound({ ...next, holeRevealed: true, events: [...next.events, 'Blackjack!'] }) };
  }
  return { state: next };
}

export function availableActions(state: BlackjackState): PlayerAction[] {
  if (state.phase !== 'player') return [];
  const hand = state.hands[state.activeHand];
  if (!hand || hand.stood || hand.surrendered || isBust(hand.cards)) return [];
  const actions: PlayerAction[] = ['stand'];
  const firstDecision = hand.cards.length === 2;
  const lockedSplitAces = hand.splitAces && !state.rules.hitSplitAces;
  if (!lockedSplitAces) actions.unshift('hit');
  if (firstDecision && !lockedSplitAces && state.bankroll >= hand.bet && (!hand.fromSplit || state.rules.doubleAfterSplit)) actions.push('double');
  if (
    firstDecision
    && cardValue(hand.cards[0]) === cardValue(hand.cards[1])
    && state.hands.length < state.rules.maxHands
    && state.bankroll >= hand.bet
    && (!hand.splitAces || state.rules.resplitAces)
  ) actions.push('split');
  if (firstDecision && !hand.fromSplit && state.hands.length === 1 && !hand.doubled && state.rules.surrenderAllowed) actions.push('surrender');
  return actions;
}

// draws post-split cards, auto-stands 21s and locked split aces, settles when all hands resolve
function advance(state: BlackjackState): BlackjackState {
  let next = state;
  while (next.activeHand < next.hands.length) {
    let hand = next.hands[next.activeHand];
    if (hand.stood || hand.surrendered || isBust(hand.cards)) {
      next = { ...next, activeHand: next.activeHand + 1 };
      continue;
    }
    if (hand.cards.length === 1) {
      const result = draw(next);
      hand = { ...hand, cards: [...hand.cards, result.card] };
      next = { ...result.state, hands: next.hands.map((item, index) => (index === next.activeHand ? hand : item)) };
    }
    const { total } = handValue(hand.cards);
    const lockedSplitAces = hand.splitAces && !next.rules.hitSplitAces && hand.cards.length >= 2;
    if (total === 21 || lockedSplitAces) {
      next = {
        ...next,
        hands: next.hands.map((item, index) => (index === next.activeHand ? { ...item, stood: true } : item)),
        activeHand: next.activeHand + 1,
      };
      continue;
    }
    return next;
  }
  return settleRound(next);
}

export function playerAction(state: BlackjackState, action: PlayerAction): { state: BlackjackState; error?: string } {
  if (!availableActions(state).includes(action)) return { state, error: 'That play is not available.' };
  const index = state.activeHand;
  const hand = state.hands[index];
  const replace = (next: BlackjackState, updated: BlackjackHand): BlackjackState =>
    ({ ...next, hands: next.hands.map((item, i) => (i === index ? updated : item)) });

  if (action === 'hit') {
    const result = draw(state);
    const updated = { ...hand, cards: [...hand.cards, result.card] };
    let next = replace(result.state, updated);
    if (isBust(updated.cards)) {
      next = { ...next, events: [...next.events, `Hand busts with ${handValue(updated.cards).total}.`], activeHand: index + 1 };
    }
    return { state: advance(next) };
  }
  if (action === 'stand') {
    return { state: advance({ ...replace(state, { ...hand, stood: true }), activeHand: index + 1 }) };
  }
  if (action === 'double') {
    const result = draw(state);
    const updated = { ...hand, cards: [...hand.cards, result.card], bet: hand.bet * 2, doubled: true, stood: true };
    const next = { ...replace(result.state, updated), bankroll: result.state.bankroll - hand.bet, activeHand: index + 1 };
    return { state: advance(next) };
  }
  if (action === 'split') {
    const splitAces = hand.cards[0].rank === 'A';
    const first = { ...hand, id: `${hand.id}a`, cards: [hand.cards[0]], fromSplit: true, splitAces };
    const second = newHand(`${hand.id}b`, hand.bet, [hand.cards[1]], true, splitAces);
    const hands = [...state.hands.slice(0, index), first, second, ...state.hands.slice(index + 1)];
    return { state: advance({ ...state, hands, bankroll: state.bankroll - hand.bet }) };
  }
  const updated = { ...hand, surrendered: true, stood: true };
  return { state: advance({ ...replace(state, updated), activeHand: index + 1, events: [...state.events, 'Hand surrendered · half the bet returns.'] }) };
}

function dealerShouldDraw(state: BlackjackState): boolean {
  const { total, soft } = handValue(state.dealer);
  if (total < 17) return true;
  return total === 17 && soft && state.rules.dealerHitsSoft17;
}

function handOutcome(hand: BlackjackHand, dealerTotal: number, dealerBust: boolean, dealerBlackjack: boolean): HandOutcome {
  const value = handValue(hand.cards).total;
  if (hand.surrendered) return 'surrender';
  if (value > 21) return 'lose';
  if (isBlackjack(hand)) return dealerBlackjack ? 'push' : 'blackjack';
  if (dealerBlackjack) return 'lose';
  if (dealerBust || value > dealerTotal) return 'win';
  if (value === dealerTotal) return 'push';
  return 'lose';
}

function settleRound(state: BlackjackState): BlackjackState {
  let next: BlackjackState = { ...state, holeRevealed: true };
  const alive = (hand: BlackjackHand) => !hand.surrendered && !isBust(hand.cards) && !isBlackjack(hand);
  const needsDealerPlay = next.hands.some(alive) || next.aiPlayers.some((player) => player.hands.some(alive));
  const dealerBlackjack = handValue(next.dealer).total === 21 && next.dealer.length === 2;
  if (needsDealerPlay && !dealerBlackjack) {
    while (dealerShouldDraw(next)) {
      const result = draw(next);
      next = { ...result.state, dealer: [...next.dealer, result.card] };
    }
  }
  const dealerValue = handValue(next.dealer);
  const dealerBust = dealerValue.total > 21;

  let bankroll = next.bankroll;
  const events = [...next.events];
  const settled = next.hands.map((hand) => {
    const value = handValue(hand.cards).total;
    const outcome = handOutcome(hand, dealerValue.total, dealerBust, dealerBlackjack);
    const returned = outcome === 'blackjack' ? hand.bet * (1 + next.rules.blackjackPayout)
      : outcome === 'win' ? hand.bet * 2
      : outcome === 'push' ? hand.bet
      : outcome === 'surrender' ? hand.bet / 2
      : 0;
    bankroll += returned;
    const profit = returned - hand.bet;
    events.push(`${outcome === 'blackjack' ? 'Blackjack' : outcome === 'surrender' ? 'Surrender' : `${value > 21 ? 'Bust' : value} vs dealer ${dealerBust ? 'bust' : dealerValue.total}`} · ${outcome.toUpperCase()} ${profit === 0 ? '' : `${profit > 0 ? '+' : '−'}$${Math.abs(profit)}`}`.trim());
    return { ...hand, stood: true, outcome, profit };
  });
  const settledAi = next.aiPlayers.map((player) => ({
    ...player,
    hands: player.hands.map((hand) => ({ ...hand, stood: true, outcome: handOutcome(hand, dealerValue.total, dealerBust, dealerBlackjack) })),
  }));

  const insuranceNet = next.insurance?.result === 'won' ? next.insurance.stake * INSURANCE_PAYOUT
    : next.insurance?.result === 'lost' ? -next.insurance.stake
    : 0;
  const record = {
    index: next.roundIndex,
    playerSummary: `${settled.map((hand) => `${hand.cards.map((card) => `${card.rank}${card.suit}`).join(' ')}${hand.doubled ? ' ×2' : ''}`).join(' | ')}${next.insurance ? ` · INS ${next.insurance.result === 'won' ? '✓' : '✗'}` : ''}`,
    dealerSummary: `${next.dealer.map((card) => `${card.rank}${card.suit}`).join(' ')} (${dealerBust ? 'bust' : dealerValue.total})`,
    outcomes: settled.map((hand) => hand.outcome!),
    profit: settled.reduce((sum, hand) => sum + (hand.profit ?? 0), 0) + insuranceNet,
    cumulative: bankroll - next.startingBankroll,
  };
  return {
    ...next,
    bankroll,
    hands: settled,
    aiPlayers: settledAi,
    phase: 'settled',
    events,
    history: [...next.history, record].slice(-60),
    profitSeries: [...next.profitSeries, bankroll - next.startingBankroll],
  };
}

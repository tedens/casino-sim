import { nextStep, progressionBet, resolveStrategy, unitsForStep } from '../blackjack/betting';
import { CustomBettingStrategy } from '../casino/customStrategies';
import { availableActions, createBlackjackState, handValue, isBlackjack, playerAction, sessionProfit, startRound } from '../blackjack/engine';
import { decide, hintFor, strategyChart } from '../blackjack/strategy';
import { cellKey, handCell } from '../blackjack/chart';
import { BlackjackState, Card, Rank } from '../blackjack/types';

const card = (rank: Rank): Card => ({ rank, suit: '♠' });

// stack known cards on top of the shoe: player, dealer up, player, dealer hole, then draws
function rig(state: BlackjackState, cards: Rank[]): BlackjackState {
  return { ...state, shoe: [...cards.map(card), ...state.shoe] };
}

function freshState(rules: Partial<Parameters<typeof createBlackjackState>[0]['rules']> = {}) {
  return createBlackjackState({ seed: 'test', startingBankroll: 1000, rules });
}

describe('blackjack hand values', () => {
  test('aces devalue as needed', () => {
    expect(handValue([card('A'), card('9')])).toEqual({ total: 20, soft: true });
    expect(handValue([card('A'), card('9'), card('5')])).toEqual({ total: 15, soft: false });
    expect(handValue([card('A'), card('A'), card('9')])).toEqual({ total: 21, soft: true });
    expect(handValue([card('K'), card('Q'), card('2')])).toEqual({ total: 22, soft: false });
  });
});

describe('blackjack engine', () => {
  test('player blackjack pays 3:2 immediately', () => {
    const state = rig(freshState(), ['A', '5', 'K', '9']);
    const result = startRound(state, 100).state;
    expect(result.phase).toBe('settled');
    expect(result.hands[0].outcome).toBe('blackjack');
    expect(result.bankroll).toBe(1150);
  });

  test('6:5 payout applies when configured', () => {
    const state = rig(freshState({ blackjackPayout: 1.2 }), ['A', '5', 'K', '9']);
    const result = startRound(state, 100).state;
    expect(result.bankroll).toBe(1120);
  });

  test('dealer blackjack ends the round; player blackjack pushes', () => {
    const lose = startRound(rig(freshState(), ['9', 'A', '9', 'K']), 100).state;
    expect(lose.phase).toBe('settled');
    expect(lose.hands[0].outcome).toBe('lose');
    expect(lose.bankroll).toBe(900);

    const push = startRound(rig(freshState(), ['A', 'A', 'K', 'K']), 100).state;
    expect(push.hands[0].outcome).toBe('push');
    expect(push.bankroll).toBe(1000);
  });

  test('surrender returns half the bet and only appears when allowed', () => {
    const state = startRound(rig(freshState(), ['10', '9', '6', '7']), 100).state;
    expect(availableActions(state)).toContain('surrender');
    const done = playerAction(state, 'surrender').state;
    expect(done.phase).toBe('settled');
    expect(done.hands[0].outcome).toBe('surrender');
    expect(done.bankroll).toBe(950);

    const blocked = startRound(rig(freshState({ surrenderAllowed: false }), ['10', '9', '6', '7']), 100).state;
    expect(availableActions(blocked)).not.toContain('surrender');
  });

  test('double takes one card and doubles the stake', () => {
    const state = startRound(rig(freshState(), ['6', '5', '5', 'K', '9', '9']), 100).state;
    const done = playerAction(state, 'double').state;
    expect(done.phase).toBe('settled');
    expect(done.hands[0].doubled).toBe(true);
    expect(done.hands[0].cards).toHaveLength(3);
    // player 6+5+9=20 vs dealer 5+K+9 bust, +200 on a $200 stake
    expect(sessionProfit(done)).toBe(200);
  });

  test('split plays two hands and split blackjack counts as 21, not blackjack', () => {
    const state = startRound(rig(freshState(), ['8', '6', '8', 'K', 'A', 'A', '9']), 100).state;
    expect(availableActions(state)).toContain('split');
    const split = playerAction(state, 'split').state;
    expect(split.hands).toHaveLength(2);
    expect(split.hands[0].cards).toHaveLength(2);
    expect(isBlackjack(split.hands[0])).toBe(false);
  });

  test('split aces receive one card each and stand automatically', () => {
    const state = startRound(rig(freshState(), ['A', '6', 'A', 'K', '9', '9']), 100).state;
    const split = playerAction(state, 'split').state;
    expect(split.phase).toBe('settled');
    expect(split.hands.every((hand) => hand.cards.length === 2)).toBe(true);
  });

  test('dealer hits soft 17 under H17 and stands under S17', () => {
    // dealer A+6 is soft 17, player stands on 20
    const h17 = startRound(rig(freshState({ dealerHitsSoft17: true }), ['K', 'A', 'Q', '6']), 100).state;
    const h17Done = playerAction(h17, 'stand').state;
    expect(h17Done.dealer.length).toBeGreaterThan(2);

    const s17 = startRound(rig(freshState({ dealerHitsSoft17: false }), ['K', 'A', 'Q', '6']), 100).state;
    const s17Done = playerAction(s17, 'stand').state;
    expect(s17Done.dealer).toHaveLength(2);
    expect(s17Done.hands[0].outcome).toBe('win');
  });

  test('cut card rotates to a fresh shoe seed and re-places the cut', () => {
    let state = createBlackjackState({ seed: 'rotate', startingBankroll: 1000 });
    const firstShoeSeed = state.shoeSeed;
    expect(firstShoeSeed).toBe('rotate');
    // shrink the shoe to the cut card so the next deal forces a shuffle
    state = { ...state, shoe: state.shoe.slice(0, state.reshuffleAt) };
    const result = startRound(state, 25).state;
    expect(result.shoeNumber).toBe(2);
    expect(result.shoeSeed).not.toBe(firstShoeSeed);
    expect(result.events[0]).toContain('fresh shuffle & cut');
    // fresh 6-deck shoe minus this round's cards
    expect(result.shoe.length).toBeGreaterThan(6 * 52 - 30);
    // cut card sits within the jittered penetration window (50%–90%)
    expect(result.reshuffleAt).toBeGreaterThanOrEqual(Math.floor(6 * 52 * 0.1));
    expect(result.reshuffleAt).toBeLessThanOrEqual(Math.ceil(6 * 52 * 0.5));
  });

  test('same seed replays identically', () => {
    const play = () => {
      let state = startRound(createBlackjackState({ seed: 'replay', startingBankroll: 500 }), 25).state;
      while (state.phase === 'player') state = playerAction(state, availableActions(state).includes('hit') ? 'hit' : 'stand').state;
      return state;
    };
    const first = play();
    const second = play();
    expect(second.hands).toEqual(first.hands);
    expect(second.bankroll).toBe(first.bankroll);
  });
});

describe('insurance on 20 vs ace', () => {
  test('auto-takes half the bet and pays 3:2 on dealer blackjack', () => {
    // player K+Q = 20, dealer A up + K hole = blackjack
    const result = startRound(rig(freshState({ insureTwentyVsAce: true }), ['K', 'A', 'Q', 'K']), 100).state;
    expect(result.phase).toBe('settled');
    expect(result.insurance).toMatchObject({ stake: 50, result: 'won' });
    // 1000 - 100 bet - 50 stake + 125 insurance return, 20 loses to the blackjack
    expect(result.bankroll).toBe(975);
    expect(result.history[result.history.length - 1].profit).toBe(-25);
  });

  test('loses the stake at the peek when the dealer misses', () => {
    const result = startRound(rig(freshState({ insureTwentyVsAce: true }), ['K', 'A', 'Q', '5']), 100).state;
    expect(result.phase).toBe('player');
    expect(result.insurance).toMatchObject({ stake: 50, result: 'lost' });
    expect(result.bankroll).toBe(850);
  });

  test('never taken without exactly 20, without an ace up, or when disabled', () => {
    expect(startRound(rig(freshState({ insureTwentyVsAce: true }), ['K', 'A', '5', '5']), 100).state.insurance).toBeNull();
    expect(startRound(rig(freshState({ insureTwentyVsAce: true }), ['K', '9', 'Q', '5']), 100).state.insurance).toBeNull();
    expect(startRound(rig(freshState(), ['K', 'A', 'Q', '5']), 100).state.insurance).toBeNull();
  });

  test('soft 20 (A,9) also qualifies', () => {
    const result = startRound(rig(freshState({ insureTwentyVsAce: true }), ['A', 'A', '9', '5']), 100).state;
    expect(result.insurance).toMatchObject({ stake: 50, result: 'lost' });
  });
});

describe('ai table players', () => {
  test('cards deal seats first, then the user, then the dealer — twice around', () => {
    // rig order: P1, P2, user, dealer up, P1, P2, user, dealer hole
    const state = rig(freshState({ aiPlayers: 2 }), ['2', '3', '4', '5', '6', '7', '8', '9']);
    const result = startRound(state, 25).state;
    expect(result.aiPlayers[0].hands[0].cards.slice(0, 2).map((card) => card.rank)).toEqual(['2', '6']);
    expect(result.aiPlayers[1].hands[0].cards.slice(0, 2).map((card) => card.rank)).toEqual(['3', '7']);
    expect(result.hands[0].cards.map((card) => card.rank)).toEqual(['4', '8']);
    expect(result.dealer.map((card) => card.rank)).toEqual(['5', '9']);
  });

  test('history records cumulative session profit for the chart', () => {
    const result = startRound(rig(freshState(), ['A', '5', 'K', '9']), 100).state;
    expect(result.history[result.history.length - 1].cumulative).toBe(150);
  });

  test('ai seats deal two-plus cards and resolve before the user acts', () => {
    const result = startRound(createBlackjackState({ seed: 'table', startingBankroll: 1000, rules: { aiPlayers: 3 } }), 25).state;
    expect(result.aiPlayers).toHaveLength(3);
    for (const player of result.aiPlayers) {
      expect(player.hands.length).toBeGreaterThanOrEqual(1);
      for (const hand of player.hands) {
        expect(hand.cards.length).toBeGreaterThanOrEqual(2);
        expect(hand.stood || hand.surrendered).toBe(true);
      }
    }
  });

  test('ai hands settle with outcomes once the round ends', () => {
    let state = startRound(createBlackjackState({ seed: 'table-settle', rules: { aiPlayers: 2 } }), 25).state;
    while (state.phase === 'player') state = playerAction(state, 'stand').state;
    expect(state.phase).toBe('settled');
    for (const player of state.aiPlayers) for (const hand of player.hands) expect(hand.outcome).toBeDefined();
  });

  test('seat count clamps to five ai players', () => {
    expect(createBlackjackState({ seed: 'clamp', rules: { aiPlayers: 12 } }).rules.aiPlayers).toBe(5);
  });

  test('bot bankrolls persist across rounds and track losses', () => {
    // dealer blackjack ends the round instantly; every seat loses its minimum bet
    const state = rig(freshState({ aiPlayers: 1 }), ['5', '9', 'A', '7', 'K', 'K']);
    const result = startRound(state, 25).state;
    expect(result.phase).toBe('settled');
    expect(result.botRoster[0]).toMatchObject({ name: 'P1', bankroll: 995, friends: 0 });
  });

  test('a broke bot borrows a fresh stake from a friend', () => {
    let state = rig(freshState({ aiPlayers: 1 }), ['5', '9', 'A', '7', 'K', 'K']);
    state = { ...state, botRoster: [{ name: 'P1', bankroll: 4, friends: 0 }] };
    const result = startRound(state, 25).state;
    expect(result.botRoster[0]).toMatchObject({ bankroll: 1000, friends: 1 });
    expect(result.events.some((event) => event.includes('borrows'))).toBe(true);
  });

  test('same seed deals identical ai hands', () => {
    const first = startRound(createBlackjackState({ seed: 'det', rules: { aiPlayers: 4 } }), 25).state;
    const second = startRound(createBlackjackState({ seed: 'det', rules: { aiPlayers: 4 } }), 25).state;
    expect(second.aiPlayers).toEqual(first.aiPlayers);
    expect(second.hands).toEqual(first.hands);
  });
});

describe('betting strategies', () => {
  test('win press: +1 unit per win to cap, reset on loss, hold on push', () => {
    expect(unitsForStep('winPress', 0, 8)).toBe(1);
    expect(nextStep('winPress', 0, 25)).toBe(1);
    expect(unitsForStep('winPress', 7, 8)).toBe(8);
    expect(unitsForStep('winPress', 12, 8)).toBe(8);
    expect(nextStep('winPress', 5, -25)).toBe(0);
    // surrender loses half the bet, still counts as a loss
    expect(nextStep('winPress', 3, -12.5)).toBe(0);
    expect(nextStep('winPress', 4, 0)).toBe(4);
  });

  test('paroli: 1-2-4 on wins, then bank and restart; loss restarts', () => {
    expect([0, 1, 2].map((step) => unitsForStep('paroli', step, 8))).toEqual([1, 2, 4]);
    expect(nextStep('paroli', 1, 25)).toBe(2);
    expect(nextStep('paroli', 2, 25)).toBe(0);
    expect(nextStep('paroli', 1, -25)).toBe(0);
  });

  test('1-3-2-6 walks the sequence on wins', () => {
    expect([0, 1, 2, 3].map((step) => unitsForStep('oneThreeTwoSix', step, 8))).toEqual([1, 3, 2, 6]);
    expect(nextStep('oneThreeTwoSix', 2, 25)).toBe(3);
    expect(nextStep('oneThreeTwoSix', 3, 25)).toBe(0);
    expect(nextStep('oneThreeTwoSix', 2, -25)).toBe(0);
  });

  test('martingale doubles on loss, resets on win, capped by max units', () => {
    expect(nextStep('martingale', 0, -25)).toBe(1);
    expect([1, 2, 3].map((step) => unitsForStep('martingale', step, 64))).toEqual([2, 4, 8]);
    expect(unitsForStep('martingale', 6, 8)).toBe(8);
    expect(nextStep('martingale', 4, 25)).toBe(0);
    expect(nextStep('martingale', 4, 0)).toBe(4);
  });

  test('flat stays at one unit', () => {
    expect(unitsForStep('flat', 0, 8)).toBe(1);
    expect(unitsForStep('flat', 5, 8)).toBe(1);
    expect(nextStep('flat', 3, 25)).toBe(0);
  });

  test('custom ladders resolve with win/loss actions and loop control', () => {
    const ladder: CustomBettingStrategy = { id: 'custom-a', name: 'My ladder', sequence: [1, 3, 7], onWin: 'advance', onLoss: 'reset', loop: false };
    const resolved = resolveStrategy('custom-a', [ladder]);
    expect([0, 1, 2, 5].map((step) => resolved.unitsForStep(step, 8))).toEqual([1, 3, 7, 7]);
    expect(resolved.unitsForStep(2, 5)).toBe(5); // max-units cap still applies
    expect(resolved.nextStep(0, 25)).toBe(1);
    expect(resolved.nextStep(2, 25)).toBe(2); // holds at the end without loop
    expect(resolved.nextStep(1, -25)).toBe(0);
    expect(resolved.nextStep(1, 0)).toBe(1); // push holds

    const looping = resolveStrategy('custom-b', [{ ...ladder, id: 'custom-b', sequence: [1, 2], loop: true }]);
    expect(looping.nextStep(1, 25)).toBe(0);

    const dalembert = resolveStrategy('custom-c', [{ ...ladder, id: 'custom-c', sequence: [1, 2, 3, 4], onWin: 'stepBack', onLoss: 'advance' }]);
    expect(dalembert.nextStep(2, -25)).toBe(3);
    expect(dalembert.nextStep(2, 25)).toBe(1);
    expect(dalembert.nextStep(0, 25)).toBe(0);
  });

  test('unknown strategy ids fall back to win press', () => {
    const resolved = resolveStrategy('custom-deleted', []);
    expect(resolved.id).toBe('winPress');
    expect(resolved.nextStep(0, 25)).toBe(1);
  });

  test('bet is units × table minimum, clamped to table max and bankroll', () => {
    const rules = { tableMinimum: 5, tableMaximum: 5000 };
    expect(progressionBet(1, rules, 1000)).toBe(5);
    expect(progressionBet(8, rules, 1000)).toBe(40);
    expect(progressionBet(8, rules, 12)).toBe(12);
    expect(progressionBet(8, { tableMinimum: 1000, tableMaximum: 5000 }, 99999)).toBe(5000);
  });
});

describe('basic strategy hints', () => {
  const rules = { ...freshState().rules };
  const allowAll = { hit: true, double: true, split: true, surrender: true };

  test('book plays match the H17 multi-deck chart', () => {
    expect(decide([card('10'), card('6')], card('10'), rules, allowAll).action).toBe('surrender');
    expect(decide([card('10'), card('6')], card('10'), rules, { ...allowAll, surrender: false }).action).toBe('hit');
    expect(decide([card('10'), card('5')], card('10'), rules, allowAll).action).toBe('surrender');
    expect(decide([card('8'), card('8')], card('6'), rules, allowAll).action).toBe('split');
    expect(decide([card('8'), card('8')], card('A'), rules, allowAll).action).toBe('surrender');
    expect(decide([card('5'), card('5')], card('6'), rules, allowAll).action).toBe('double');
    expect(decide([card('A'), card('7')], card('2'), rules, allowAll).action).toBe('double');
    expect(decide([card('A'), card('7')], card('9'), rules, allowAll).action).toBe('hit');
    expect(decide([card('A'), card('8')], card('6'), rules, allowAll).action).toBe('double');
    expect(decide([card('6'), card('5')], card('A'), rules, allowAll).action).toBe('double');
    expect(decide([card('10'), card('2')], card('4'), rules, allowAll).action).toBe('stand');
    expect(decide([card('10'), card('2')], card('2'), rules, allowAll).action).toBe('hit');
  });

  test('S17 flips the known deviations', () => {
    const s17 = { ...rules, dealerHitsSoft17: false };
    expect(decide([card('6'), card('5')], card('A'), s17, allowAll).action).toBe('hit');
    expect(decide([card('A'), card('8')], card('6'), s17, allowAll).action).toBe('stand');
    expect(decide([card('10'), card('7')], card('A'), s17, allowAll).action).toBe('stand');
    expect(decide([card('10'), card('7')], card('A'), rules, allowAll).action).toBe('surrender');
  });

  test('no double-after-split tightens pair splits', () => {
    const noDas = { ...rules, doubleAfterSplit: false };
    expect(decide([card('2'), card('2')], card('2'), rules, allowAll).action).toBe('split');
    expect(decide([card('2'), card('2')], card('2'), noDas, allowAll).action).toBe('hit');
    expect(decide([card('4'), card('4')], card('5'), rules, allowAll).action).toBe('split');
    expect(decide([card('4'), card('4')], card('5'), noDas, allowAll).action).toBe('hit');
  });

  test('hintFor only recommends available actions', () => {
    const state = startRound(rig(freshState(), ['10', '9', '6', '7']), 100).state;
    const hit = playerAction(state, 'hit');
    if (hit.state.phase === 'player') {
      const hint = hintFor(hit.state);
      expect(hint).not.toBeNull();
      expect(availableActions(hit.state)).toContain(hint!.action);
    }
  });

  test('live hands map to the right chart cell', () => {
    expect(handCell([card('10'), card('6')], card('9'))).toEqual({ section: 'hard', label: '16', upLabel: '9' });
    expect(handCell([card('A'), card('7')], card('3'))).toEqual({ section: 'soft', label: 'A,7', upLabel: '3' });
    expect(handCell([card('8'), card('8')], card('K'))).toEqual({ section: 'pair', label: '8,8', upLabel: '10' });
    expect(handCell([card('K'), card('Q')], card('5'))).toEqual({ section: 'pair', label: '10,10', upLabel: '5' });
    expect(handCell([card('5'), card('2')], card('A'))).toEqual({ section: 'hard', label: '5–7', upLabel: 'A' });
  });

  test('a user override replaces the book play for its cell only', () => {
    const allowed = { hit: true, double: true, split: true, surrender: true };
    // book doubles 11 vs 10; override it to hit
    expect(decide([card('6'), card('5')], card('10'), rules, allowed).action).toBe('double');
    const overrides = { [cellKey('hard', '11', '10')]: 'H' as const };
    expect(decide([card('6'), card('5')], card('10'), rules, allowed, overrides).action).toBe('hit');
    // a different 11 (vs 6) is untouched
    expect(decide([card('6'), card('5')], card('6'), rules, allowed, overrides).action).toBe('double');
  });

  test('override falls back to the book when the code can not apply', () => {
    // force split on 16 (not a pair) → codeToHint returns null → book hits/stands
    const overrides = { [cellKey('hard', '16', '9')]: 'P' as const };
    const result = decide([card('10'), card('6')], card('9'), rules, { hit: true, double: false, split: false, surrender: false }, overrides);
    expect(['hit', 'stand']).toContain(result.action);
  });

  test('strategyChart reflects overrides in the displayed cell', () => {
    const overrides = { [cellKey('hard', '16', '10')]: 'S' as const };
    const chart = strategyChart(rules, overrides);
    const sixteen = chart.find((s) => s.section === 'hard')!.rows.find((r) => r.label === '16')!;
    expect(sixteen.cells[8]).toBe('S'); // dealer 10 column
  });

  test('chart honours the surrender setting', () => {
    const withSurrender = strategyChart(rules);
    const hardRows = withSurrender.find((section) => section.title === 'Hard totals')!.rows;
    const sixteen = hardRows.find((row) => row.label === '16')!;
    expect(sixteen.cells[8]).toBe('Rh');

    const without = strategyChart({ ...rules, surrenderAllowed: false });
    const sixteenNo = without.find((section) => section.title === 'Hard totals')!.rows.find((row) => row.label === '16')!;
    expect(sixteenNo.cells[8]).toBe('H');
  });
});

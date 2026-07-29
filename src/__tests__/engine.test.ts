import fc from 'fast-check';
import { createGameState, invalidWagerForRoll, moveWagerTarget, placeWager, removeWager, sessionProfit, settleRoll, totalAssets, wagerLabel } from '../domain/engine';
import { SeededRng } from '../domain/rng';
import { DieFace } from '../domain/types';

function bet(state: ReturnType<typeof createGameState>, request: Parameters<typeof placeWager>[1]) {
  const result = placeWager(state, request);
  if (result.error) throw new Error(result.error);
  return result.state;
}

describe('Bellagio rules engine', () => {
  test('Pass establishes and makes a point', () => {
    let state = bet(createGameState({ seed: 'pass' }), { kind: 'pass', amount: 5 });
    state = settleRoll(state, 3, 3).state;
    expect(state.point).toBe(6);
    expect(state.wagers[0]).toMatchObject({ kind: 'pass', contract: true, target: 6 });
    state = settleRoll(state, 2, 4).state;
    expect(state.point).toBeNull();
    expect(state.wagers).toHaveLength(1);
    expect(state.wagers[0]).toMatchObject({ kind: 'pass', amount: 5, contract: false, target: undefined });
    expect(sessionProfit(state)).toBe(5);
  });

  test('line bets collect come-out wins without coming down', () => {
    let pass = bet(createGameState(), { kind: 'pass', amount: 5 });
    pass = settleRoll(pass, 3, 4).state;
    expect(pass.wagers).toHaveLength(1);
    expect(pass.wagers[0]).toMatchObject({ kind: 'pass', amount: 5, contract: false });
    expect(sessionProfit(pass)).toBe(5);

    let dark = bet(createGameState(), { kind: 'dontPass', amount: 5 });
    dark = settleRoll(dark, 1, 2).state;
    expect(dark.wagers).toHaveLength(1);
    expect(dark.wagers[0]).toMatchObject({ kind: 'dontPass', amount: 5, contract: false });
    expect(sessionProfit(dark)).toBe(5);
  });

  test('Don’t Pass pushes on bar 12', () => {
    let state = bet(createGameState(), { kind: 'dontPass', amount: 5 });
    state = settleRoll(state, 6, 6).state;
    expect(state.bankroll).toBe(5000);
    expect(state.wagers).toHaveLength(0);
    expect(state.history[0].settlements[0].status).toBe('push');
  });

  test('Field pays triple on 12 and returns stake', () => {
    let state = bet(createGameState(), { kind: 'field', amount: 5 });
    state = settleRoll(state, 6, 6).state;
    expect(state.bankroll).toBe(5015);
    expect(sessionProfit(state)).toBe(15);
  });

  test('Place 6 pays 7:6 and remains up', () => {
    let state = settleRoll(createGameState(), 3, 3).state;
    state = bet(state, { kind: 'place', target: 6, amount: 6 });
    state = settleRoll(state, 1, 5).state;
    expect(state.wagers[0]).toMatchObject({ kind: 'place', target: 6, amount: 6, hits: 1 });
    expect(sessionProfit(state)).toBe(7);
  });

  test('Buy 4 deducts 5% commission only on a win', () => {
    let state = settleRoll(createGameState(), 2, 2).state;
    state = bet(state, { kind: 'buy', target: 4, amount: 20 });
    state = settleRoll(state, 1, 3).state;
    const settlement = state.history.at(-1)!.settlements[0];
    expect(settlement).toMatchObject({ status: 'won', profit: 38, commission: 2 });
    expect(sessionProfit(state)).toBe(38);
  });

  test('Hardway loses to easy combination', () => {
    let state = settleRoll(createGameState(), 3, 3).state;
    state = bet(state, { kind: 'hardway', target: 6, amount: 5 });
    state = settleRoll(state, 1, 5).state;
    expect(state.wagers).toHaveLength(0);
    expect(sessionProfit(state)).toBe(-5);
  });

  test('Pass contract cannot be removed; Don’t contract can be removed', () => {
    let pass = bet(createGameState(), { kind: 'pass', amount: 5 });
    pass = settleRoll(pass, 2, 3).state;
    expect(removeWager(pass, pass.wagers[0].id).error).toContain('contract');

    let dark = bet(createGameState(), { kind: 'dontPass', amount: 5 });
    dark = settleRoll(dark, 2, 3).state;
    const removed = removeWager(dark, dark.wagers[0].id);
    expect(removed.error).toBeUndefined();
    expect(totalAssets(removed.state)).toBe(5000);
  });

  test('Come odds are returned when off on a come-out winner', () => {
    let state = settleRoll(createGameState(), 2, 3).state; // table point 5
    state = bet(state, { kind: 'come', amount: 5 });
    state = settleRoll(state, 3, 3).state; // Come travels to 6
    const come = state.wagers.find((wager) => wager.kind === 'come')!;
    state = bet(state, { kind: 'comeOdds', amount: 25, target: 6, parentId: come.id });
    state = settleRoll(state, 2, 3).state; // table point 5 made
    state = settleRoll(state, 3, 3).state; // Come 6 wins; odds are off
    expect(state.wagers).toHaveLength(0);
    expect(state.history.at(-1)!.settlements.some((item) => item.message.includes('Inactive odds returned'))).toBe(true);
    expect(sessionProfit(state)).toBe(5);
  });

  test('traveled Come labels include their number', () => {
    let state = settleRoll(createGameState(), 2, 3).state;
    state = bet(state, { kind: 'come', amount: 5 });
    state = settleRoll(state, 3, 3).state;
    expect(wagerLabel(state.wagers.find((wager) => wager.kind === 'come')!)).toBe('Come 6');
  });

  test('new Come can be placed while another Come is traveled and stays up on duplicate number', () => {
    let state = settleRoll(createGameState(), 2, 3).state;
    state = bet(state, { kind: 'come', amount: 5 });
    state = settleRoll(state, 3, 3).state;
    state = bet(state, { kind: 'come', amount: 5 });
    expect(state.wagers.filter((wager) => wager.kind === 'come')).toHaveLength(2);
    state = settleRoll(state, 2, 4).state;
    expect(state.wagers.filter((wager) => wager.kind === 'come' && !wager.contract)).toHaveLength(1);
    expect(state.wagers.some((wager) => wager.kind === 'come' && wager.comePoint === 6)).toBe(false);
    expect(state.history.at(-1)?.settlements.some((item) => item.message.includes('Come stays up'))).toBe(true);
    expect(sessionProfit(state)).toBe(5);
  });

  test('box-number bets can move only when the amount fits the new payout unit', () => {
    let state = settleRoll(createGameState(), 3, 3).state;
    state = bet(state, { kind: 'place', target: 6, amount: 6 });
    const placeSix = state.wagers[0];
    expect(moveWagerTarget(state, placeSix.id, 5).error).toContain('betting unit');
    const moved = moveWagerTarget(state, placeSix.id, 8);
    expect(moved.error).toBeUndefined();
    expect(moved.state.wagers[0]).toMatchObject({ kind: 'place', target: 8, amount: 6 });
  });

  test('manual wagers can sit below table minimum but block the roll until valid', () => {
    const ruleset = { ...createGameState().ruleset, tableMinimum: 15 };
    const state = createGameState({ ruleset });
    const placed = placeWager(state, { kind: 'place', target: 6, amount: 5 }, { allowInvalidAmounts: true });
    expect(placed.error).toBeUndefined();
    expect(placed.state.wagers[0]).toMatchObject({ kind: 'place', target: 6, amount: 5 });
    expect(invalidWagerForRoll(placed.state)?.id).toBe(placed.state.wagers[0].id);
  });

  test('seven-out advances the shooter number and records ownership', () => {
    let state = settleRoll(createGameState(), 2, 3).state;
    state = settleRoll(state, 3, 4).state;
    expect(state.history.at(-1)?.shooterNumber).toBe(1);
    expect(state.shooterCount).toBe(2);
    state = settleRoll(state, 2, 2).state;
    expect(state.history.at(-1)?.shooterNumber).toBe(2);
  });

  test('all ordered dice pairs settle safely from come-out and point phases', () => {
    for (let die1 = 1; die1 <= 6; die1 += 1) {
      for (let die2 = 1; die2 <= 6; die2 += 1) {
        expect(() => settleRoll(createGameState(), die1 as DieFace, die2 as DieFace)).not.toThrow();
        const pointState = settleRoll(createGameState(), 2, 2).state;
        expect(() => settleRoll(pointState, die1 as DieFace, die2 as DieFace)).not.toThrow();
      }
    }
  });

  test('total assets remain unchanged when no wagers exist', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 6 }), fc.integer({ min: 1, max: 6 }), (a, b) => {
      const state = settleRoll(createGameState(), a as DieFace, b as DieFace).state;
      return totalAssets(state) === 5000;
    }));
  });
});

describe('dice generator', () => {
  test('same seed produces identical independent faces', () => {
    const left = new SeededRng('replay');
    const right = new SeededRng('replay');
    expect(Array.from({ length: 1000 }, () => left.dice())).toEqual(Array.from({ length: 1000 }, () => right.dice()));
  });

  test('large sample is close to uniform for every face', () => {
    const rng = new SeededRng('distribution');
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 120000; i += 1) counts[rng.die() - 1] += 1;
    counts.forEach((count) => expect(Math.abs(count - 20000)).toBeLessThan(700));
  });
});

describe('repeat mode keeps winning bets up', () => {
  const repeatState = () => createGameState({ repeatBets: true });

  test('field win collects profit and stays on the felt', () => {
    let state = bet(repeatState(), { kind: 'field', amount: 5 });
    state = settleRoll(state, 2, 2).state;
    expect(state.wagers).toHaveLength(1);
    expect(state.wagers[0]).toMatchObject({ kind: 'field', amount: 5 });
    expect(state.bankroll).toBe(5000); // -5 stake +5 profit, stake re-locked
    expect(sessionProfit(state)).toBe(5);
    // triple field 12 pays 3x and still rides
    state = settleRoll(state, 6, 6).state;
    expect(state.wagers).toHaveLength(1);
    expect(sessionProfit(state)).toBe(20);
  });

  test('come bet stays on its number after the point repeats', () => {
    let state = bet(repeatState(), { kind: 'pass', amount: 5 });
    state = settleRoll(state, 3, 3).state; // point 6
    state = bet(state, { kind: 'come', amount: 5 });
    state = settleRoll(state, 4, 4).state; // come travels to 8
    expect(state.wagers.find((wager) => wager.kind === 'come')).toMatchObject({ contract: true, comePoint: 8 });
    const before = sessionProfit(state);
    state = settleRoll(state, 5, 3).state; // 8 repeats: pay even money, bet rides
    const come = state.wagers.find((wager) => wager.kind === 'come');
    expect(come).toMatchObject({ contract: true, comePoint: 8, amount: 5 });
    expect(sessionProfit(state)).toBe(before + 5);
  });

  test('losses still take repeated bets down', () => {
    let state = bet(repeatState(), { kind: 'field', amount: 5 });
    state = settleRoll(state, 3, 4).state; // 7 loses the field
    expect(state.wagers.filter((wager) => wager.kind === 'field')).toHaveLength(0);
  });

  test('repeat mode unlocks come contracts for take-down', () => {
    let state = bet(repeatState(), { kind: 'pass', amount: 5 });
    state = settleRoll(state, 3, 3).state;
    state = bet(state, { kind: 'come', amount: 5 });
    state = settleRoll(state, 4, 4).state;
    const come = state.wagers.find((wager) => wager.kind === 'come')!;
    const removed = removeWager(state, come.id);
    expect(removed.error).toBeUndefined();
    expect(removed.state.wagers.find((wager) => wager.kind === 'come')).toBeUndefined();
  });

  test('default mode still settles the classic way', () => {
    let state = bet(createGameState(), { kind: 'field', amount: 5 });
    state = settleRoll(state, 2, 2).state;
    expect(state.wagers).toHaveLength(0);
    expect(state.bankroll).toBe(5005);
  });
});

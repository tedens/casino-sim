import { betCovers, bestHit, coveredPockets, createRouletteState, houseEdge, settleBets, spin, syncRunners } from '../roulette/engine';
import { POCKET_ORDER, pocketColor, simulateSpin } from '../roulette/wheel';

describe('roulette pockets', () => {
  test('colors follow the standard layout', () => {
    expect(pocketColor('0')).toBe('green');
    expect(pocketColor('00')).toBe('green');
    expect(pocketColor('1')).toBe('red');
    expect(pocketColor('2')).toBe('black');
    expect(pocketColor('18')).toBe('red');
    expect(pocketColor('19')).toBe('red');
    expect(pocketColor('28')).toBe('black');
  });

  test('wheels carry the right pocket counts', () => {
    expect(POCKET_ORDER.european).toHaveLength(37);
    expect(POCKET_ORDER.american).toHaveLength(38);
    expect(new Set(POCKET_ORDER.european).size).toBe(37);
    expect(new Set(POCKET_ORDER.american).size).toBe(38);
  });
});

describe('roulette bets', () => {
  test('outside bets cover their ranges and lose to zeros', () => {
    expect(betCovers('red', '32')).toBe(true);
    expect(betCovers('black', '32')).toBe(false);
    expect(betCovers('odd', '17')).toBe(true);
    expect(betCovers('even', '17')).toBe(false);
    expect(betCovers('low', '18')).toBe(true);
    expect(betCovers('high', '18')).toBe(false);
    expect(betCovers('dozen2', '13')).toBe(true);
    expect(betCovers('col1', '4')).toBe(true); // 4 % 3 === 1
    expect(betCovers('col3', '36')).toBe(true);
    for (const id of ['red', 'black', 'odd', 'even', 'low', 'high', 'dozen1', 'col1']) {
      expect(betCovers(id, '0')).toBe(false);
      expect(betCovers(id, '00')).toBe(false);
    }
  });

  test('settle math: straight pays 35:1, even money 1:1', () => {
    expect(settleBets({ n17: 10 }, '17')).toEqual({ returned: 360, net: 350 });
    expect(settleBets({ n17: 10 }, '18')).toEqual({ returned: 0, net: -10 });
    expect(settleBets({ red: 20, black: 20 }, '32')).toEqual({ returned: 40, net: 0 });
    expect(settleBets({ red: 20, black: 20 }, '0')).toEqual({ returned: 0, net: -40 });
    expect(settleBets({ dozen1: 30 }, '12')).toEqual({ returned: 90, net: 60 });
  });

  test('coverage counts distinct pockets', () => {
    expect(coveredPockets({ red: 5 }, 'european').size).toBe(18);
    expect(coveredPockets({ red: 5, black: 5 }, 'european').size).toBe(36);
    expect(coveredPockets({ red: 5, black: 5, n0: 5 }, 'european').size).toBe(37);
    expect(coveredPockets({ low: 5, high: 5 }, 'american').size).toBe(36);
  });

  test('best hit finds the layout maximum', () => {
    expect(bestHit({ n7: 10, red: 10 }, 'european')).toBe(360); // 7 hits both: 350 + 10 net
    expect(houseEdge('european')).toBeCloseTo(0.027, 2);
    expect(houseEdge('american')).toBeCloseTo(0.0526, 2);
  });
});

describe('roulette wheel physics', () => {
  test('same seed lands the same pocket with the same trace', () => {
    const first = simulateSpin('spin-seed', 'european');
    const second = simulateSpin('spin-seed', 'european');
    expect(second.pocket).toBe(first.pocket);
    expect(second.trace).toEqual(first.trace);
  });

  test('every pocket is reachable and roughly uniform', () => {
    const counts: Record<string, number> = {};
    const spins = 37 * 150;
    for (let i = 0; i < spins; i += 1) {
      const { pocket } = simulateSpin(`u-${i}`, 'european');
      counts[pocket] = (counts[pocket] ?? 0) + 1;
    }
    expect(Object.keys(counts)).toHaveLength(37);
    for (const pocket of POCKET_ORDER.european) {
      expect(counts[pocket]).toBeGreaterThan(70);   // mean 150, generous bounds
      expect(counts[pocket]).toBeLessThan(260);
    }
  });

  test('double zero shows up on the american wheel', () => {
    let seen = false;
    for (let i = 0; i < 600 && !seen; i += 1) {
      if (simulateSpin(`a-${i}`, 'american').pocket === '00') seen = true;
    }
    expect(seen).toBe(true);
  });
});

describe('roulette session', () => {
  const fresh = () => createRouletteState({ seed: 'table', startingBankroll: 1000 });

  test('a spin settles the player and accumulates theo', () => {
    const result = spin(fresh(), { red: 50 }, []);
    expect(result.error).toBeUndefined();
    const state = result.state;
    expect(state.spinIndex).toBe(1);
    expect(state.bankroll).toBe(result.record!.playerNet + 1000);
    expect(state.theoTotal).toBeCloseTo(50 * houseEdge('european'), 5);
    expect(state.history).toHaveLength(1);
  });

  test('spins replay identically by session seed', () => {
    const first = spin(fresh(), { red: 50 }, []).state;
    const second = spin(fresh(), { red: 50 }, []).state;
    expect(second.lastPocket).toBe(first.lastPocket);
  });

  test('requires a stake and respects the bankroll', () => {
    expect(spin(fresh(), {}, []).error).toContain('at least one bet');
    expect(spin(fresh(), { red: 5000 }, []).error).toContain('bankroll');
  });

  test('runners settle their own bankrolls and borrow when broke', () => {
    let state = syncRunners(fresh(), [
      { id: 's1', name: 'Reds', bets: { red: 100 }, progression: 'flat', enabled: true },
    ]);
    expect(state.runners).toHaveLength(1);
    state = { ...state, runners: [{ ...state.runners[0], bankroll: 40 }] };
    const result = spin(state, { black: 10 }, [{ strategyId: 's1', bets: { red: 100 } }]);
    const runner = result.state.runners[0];
    // couldn't cover the $100 stake: borrowed a fresh $1,000 first
    expect(runner.friends).toBe(1);
    expect(runner.bankroll).toBe(1000 + result.record!.runnerNets.s1);
    expect(runner.profitSeries).toHaveLength(1);
  });

  test('disabling a strategy drops its runner; re-enabling keeps others intact', () => {
    let state = syncRunners(fresh(), [
      { id: 's1', name: 'A', bets: { red: 10 }, progression: 'flat', enabled: true },
      { id: 's2', name: 'B', bets: { black: 10 }, progression: 'flat', enabled: true },
    ]);
    state = { ...state, runners: state.runners.map((runner) => ({ ...runner, bankroll: 777 })) };
    state = syncRunners(state, [
      { id: 's1', name: 'A', bets: { red: 10 }, progression: 'flat', enabled: false },
      { id: 's2', name: 'B', bets: { black: 10 }, progression: 'flat', enabled: true },
    ]);
    expect(state.runners).toHaveLength(1);
    expect(state.runners[0].strategyId).toBe('s2');
    expect(state.runners[0].bankroll).toBe(777);
  });
});

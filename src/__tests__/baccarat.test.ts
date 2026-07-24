import { baccaratTotal, baccaratValue, createBaccaratState, playRound } from '../baccarat/engine';
import { BaccaratState } from '../baccarat/types';
import { Card, Rank } from '../blackjack/types';

const card = (rank: Rank): Card => ({ rank, suit: '♠' });

// stack known cards on top of the shoe: player, banker, player, banker, then thirds
function rig(state: BaccaratState, ranks: Rank[]): BaccaratState {
  return { ...state, shoe: [...ranks.map(card), ...state.shoe] };
}

const fresh = () => createBaccaratState({ seed: 'test', startingBankroll: 1000 });

describe('baccarat card math', () => {
  test('aces are one, tens and faces are zero, totals wrap at ten', () => {
    expect(baccaratValue(card('A'))).toBe(1);
    expect(baccaratValue(card('K'))).toBe(0);
    expect(baccaratValue(card('10'))).toBe(0);
    expect(baccaratValue(card('9'))).toBe(9);
    expect(baccaratTotal([card('7'), card('7')])).toBe(4);
    expect(baccaratTotal([card('9'), card('K')])).toBe(9);
  });
});

describe('baccarat tableau', () => {
  test('naturals freeze both hands', () => {
    const result = playRound(rig(fresh(), ['5', '3', '4', '5']), { player: 25 }).state;
    expect(result.playerCards).toHaveLength(2);
    expect(result.bankerCards).toHaveLength(2);
    expect(result.outcome).toBe('player'); // 9 over 8
  });

  test('player stands on 6-7; banker draws to 5 or less against a standing player', () => {
    const result = playRound(rig(fresh(), ['2', '2', '4', '2', '5']), { banker: 25 }).state;
    expect(result.playerCards).toHaveLength(2); // 6 stands
    expect(result.bankerCards).toHaveLength(3); // 4 draws
    expect(result.history[0].bankerTotal).toBe(9);
    expect(result.outcome).toBe('banker');
  });

  test('banker 3 stands when the player third card is an 8', () => {
    const result = playRound(rig(fresh(), ['2', 'A', '3', '2', '8']), { player: 25 }).state;
    expect(result.playerCards).toHaveLength(3);
    expect(result.bankerCards).toHaveLength(2);
    expect(result.outcome).toBe('tie'); // 3 vs 3
  });

  test('banker 4 stands against a player third outside 2-7', () => {
    // P 2+3=5 draws an ace (value 1); B 2+2=4 must stand against it
    const result = playRound(rig(fresh(), ['2', '2', '3', '2', 'A']), { player: 25 }).state;
    expect(result.playerCards).toHaveLength(3);
    expect(result.bankerCards).toHaveLength(2);
  });

  test('banker 5 draws on player third 4-7 and stands otherwise', () => {
    // P 2+3=5 draws a 3; B A+4=5 stands against a 3
    const stands = playRound(rig(fresh(), ['2', 'A', '3', '4', '3']), { player: 25 }).state;
    expect(stands.bankerCards).toHaveLength(2);
    // P 2+3=5 draws a 4; B A+4=5 draws against a 4
    const draws = playRound(rig(fresh(), ['2', 'A', '3', '4', '4', '9']), { player: 25 }).state;
    expect(draws.bankerCards).toHaveLength(3);
  });

  test('banker 7 always stands even when the player drew', () => {
    const result = playRound(rig(fresh(), ['2', '3', '3', '4', '9']), { player: 25 }).state;
    expect(result.playerCards).toHaveLength(3); // 5 draws
    expect(result.bankerCards).toHaveLength(2); // 7 stands
  });

  test('banker natural freezes the player even on a drawable total', () => {
    // P 2+3=5 would draw, but B 4+5=9 is a natural
    const result = playRound(rig(fresh(), ['2', '4', '3', '5']), { player: 25 }).state;
    expect(result.playerCards).toHaveLength(2);
    expect(result.bankerCards).toHaveLength(2);
    expect(result.outcome).toBe('banker');
  });

  test('banker 6 draws only against a player third of 6 or 7', () => {
    const result = playRound(rig(fresh(), ['2', 'K', '2', '6', '6', '2']), { banker: 25 }).state;
    expect(result.playerCards).toHaveLength(3); // 4 draws a 6 to 0
    expect(result.bankerCards).toHaveLength(3); // 6 draws against the 6
    expect(result.history[0].bankerTotal).toBe(8);
  });
});

describe('baccarat settlement', () => {
  test('banker win pays 1:1 less the 5% commission', () => {
    const result = playRound(rig(fresh(), ['3', '5', '4', '4']), { banker: 100 }).state;
    expect(result.outcome).toBe('banker'); // natural 9 over 7
    expect(result.bankroll).toBe(1095);
    expect(result.history[0].profit).toBe(95);
  });

  test('tie pushes the mains and pays the tie bet 8:1', () => {
    const result = playRound(rig(fresh(), ['6', '2', 'K', '4']), { player: 50, banker: 50, tie: 10 }).state;
    expect(result.outcome).toBe('tie'); // 6 vs 6, both stand
    expect(result.bankroll).toBe(1080);
    expect(result.history[0].profit).toBe(80);
  });

  test('pairs settle on the first two cards at 11:1', () => {
    const result = playRound(rig(fresh(), ['7', '9', '7', '2', '5', '3']), { playerPair: 10, bankerPair: 10 }).state;
    expect(result.history[0].playerPair).toBe(true);
    expect(result.history[0].bankerPair).toBe(false);
    // +110 on the player pair, −10 on the banker pair
    expect(result.history[0].profit).toBe(100);
  });

  test('rejects bets under the minimum or over the bankroll', () => {
    expect(playRound(fresh(), { player: 1 }).error).toContain('minimum');
    expect(playRound(fresh(), { player: 5000 }).error).toContain('bankroll');
  });
});

describe('baccarat shoe', () => {
  test('same seed deals the same coup', () => {
    const first = playRound(createBaccaratState({ seed: 'coup' }), { player: 25 }).state;
    const second = playRound(createBaccaratState({ seed: 'coup' }), { player: 25 }).state;
    expect(second.history[0]).toEqual(first.history[0]);
  });

  test('bead road covers the whole shoe and resets on rotation', () => {
    let state = playRound(createBaccaratState({ seed: 'road' }), { player: 25 }).state;
    state = playRound(state, { player: 25 }).state;
    expect(state.beadRoad).toHaveLength(2);
    state = { ...state, shoe: state.shoe.slice(0, state.reshuffleAt) };
    state = playRound(state, { player: 25 }).state;
    expect(state.shoeNumber).toBe(2);
    expect(state.beadRoad).toHaveLength(1); // new shoe, fresh road
  });

  test('cut card rotates to a fresh shoe seed like blackjack', () => {
    let state = createBaccaratState({ seed: 'rotate' });
    expect(state.shoeSeed).toBe('rotate');
    state = { ...state, shoe: state.shoe.slice(0, state.reshuffleAt) };
    const result = playRound(state, { player: 25 }).state;
    expect(result.shoeNumber).toBe(2);
    expect(result.shoeSeed).not.toBe('rotate');
    expect(result.events[0]).toContain('fresh shuffle & cut');
    expect(result.shoe.length).toBeGreaterThan(8 * 52 - 10);
  });
});

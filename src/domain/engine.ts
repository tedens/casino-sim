import {
  BetRequest, DieFace, GameEvent, GameState, PointNumber, RollRecord, RollResult,
  Settlement, Wager, WagerKind, isPointNumber,
} from './types';
import { BELLAGIO_RULESET, HARDWAY_ODDS, LAY_ODDS, PLACE_ODDS, TRUE_ODDS } from './ruleset';
import { canRemoveWager, validateBet, validateWagerForRoll } from './validation';

let wagerSequence = 0;

function wagerId(): string {
  wagerSequence += 1;
  return `w-${Date.now().toString(36)}-${wagerSequence.toString(36)}`;
}

function cloneState(state: GameState): GameState {
  return { ...state, wagers: state.wagers.map((wager) => ({ ...wager })), history: [...state.history] };
}

export function createGameState(options: Partial<Pick<GameState, 'seed' | 'startingBankroll'>> & {
  ruleset?: GameState['ruleset'];
} = {}): GameState {
  const ruleset = options.ruleset ?? BELLAGIO_RULESET;
  const startingBankroll = options.startingBankroll ?? ruleset.startingBankroll;
  return {
    ruleset,
    startingBankroll,
    bankroll: startingBankroll,
    phase: 'comeOut',
    point: null,
    wagers: [],
    history: [],
    rollIndex: 0,
    seed: options.seed ?? 'manual',
    locked: false,
    stopped: false,
    totalWagered: 0,
    shooterRolls: 0,
    shooterCount: 1,
  };
}

export function activeExposure(state: GameState): number {
  return state.wagers.reduce((total, wager) => total + wager.amount, 0);
}

export function totalAssets(state: GameState): number {
  return state.bankroll + activeExposure(state);
}

export function sessionProfit(state: GameState): number {
  return totalAssets(state) - state.startingBankroll;
}

export function placeWager(state: GameState, request: BetRequest, options: { allowInvalidAmounts?: boolean } = {}): { state: GameState; wager?: Wager; error?: string } {
  const validation = validateBet(state, request, options);
  if (!validation.valid) return { state, error: validation.message };
  const next = cloneState(state);
  const defaultOffOnComeOut = ['place', 'buy', 'hardway', 'comeOdds'].includes(request.kind);
  const wager: Wager = {
    id: wagerId(),
    kind: request.kind,
    amount: request.amount,
    target: request.target,
    parentId: request.parentId,
    working: request.working ?? !defaultOffOnComeOut,
    contract: false,
    createdRoll: state.rollIndex,
    hits: 0,
  };
  next.bankroll -= wager.amount;
  next.totalWagered += wager.amount;
  next.wagers.push(wager);
  return { state: next, wager };
}

export function removeWager(state: GameState, id: string): { state: GameState; error?: string } {
  const wager = state.wagers.find((candidate) => candidate.id === id);
  if (!wager) return { state, error: 'Wager not found.' };
  const validation = canRemoveWager(state, wager);
  if (!validation.valid) return { state, error: validation.message };
  const next = cloneState(state);
  next.wagers = next.wagers.filter((candidate) => candidate.id !== id && candidate.parentId !== id);
  const refunded = state.wagers
    .filter((candidate) => candidate.id === id || candidate.parentId === id)
    .reduce((sum, candidate) => sum + candidate.amount, 0);
  next.bankroll += refunded;
  return { state: next };
}

export function setWagerWorking(state: GameState, id: string, working: boolean): { state: GameState; error?: string } {
  if (state.locked) return { state, error: 'Bets are locked.' };
  const next = cloneState(state);
  const wager = next.wagers.find((candidate) => candidate.id === id);
  if (!wager) return { state, error: 'Wager not found.' };
  if (['pass', 'dontPass', 'come', 'dontCome'].includes(wager.kind)) {
    return { state, error: 'Contract wager working state cannot be changed.' };
  }
  wager.working = working;
  return { state: next };
}

export function resizeWager(state: GameState, id: string, amount: number, options: { allowInvalidAmounts?: boolean } = {}): { state: GameState; error?: string } {
  const current = state.wagers.find((candidate) => candidate.id === id);
  if (!current) return { state, error: 'Wager not found.' };
  if (amount === 0) return removeWager(state, id);
  if (state.locked) return { state, error: 'Bets are locked.' };
  if (current.contract && ['pass', 'come'].includes(current.kind)) return { state, error: 'Contract wager cannot be resized.' };
  if (current.contract && ['dontPass', 'dontCome'].includes(current.kind) && amount > current.amount) {
    return { state, error: 'Don’t contract wagers may be reduced, never increased.' };
  }
  if (current.contract && ['dontPass', 'dontCome'].includes(current.kind) && amount < current.amount) {
    if (!Number.isInteger(amount) || amount < state.ruleset.tableMinimum) return { state, error: `Minimum is $${state.ruleset.tableMinimum}.` };
    const next = cloneState(state);
    const wager = next.wagers.find((candidate) => candidate.id === id)!;
    next.bankroll += wager.amount - amount;
    wager.amount = amount;
    return { state: next };
  }
  const delta = amount - current.amount;
  if (delta > state.bankroll) return { state, error: 'Insufficient bankroll.' };
  const without = { ...state, bankroll: state.bankroll + current.amount, wagers: state.wagers.filter((wager) => wager.id !== id) };
  const validation = validateBet(without, { ...current, amount }, options);
  if (!validation.valid) return { state, error: validation.message };
  const next = cloneState(state);
  const wager = next.wagers.find((candidate) => candidate.id === id)!;
  wager.amount = amount;
  next.bankroll -= delta;
  if (delta > 0) next.totalWagered += delta;
  return { state: next };
}

export function moveWagerTarget(state: GameState, id: string, target: PointNumber): { state: GameState; error?: string } {
  if (state.locked) return { state, error: 'Bets are locked.' };
  const current = state.wagers.find((candidate) => candidate.id === id);
  if (!current) return { state, error: 'Wager not found.' };
  if (!['place', 'buy', 'lay'].includes(current.kind)) return { state, error: 'Only box-number bets can be moved.' };
  if (current.target === target) return { state };
  const without = { ...state, bankroll: state.bankroll + current.amount, wagers: state.wagers.filter((wager) => wager.id !== id) };
  const validation = validateBet(without, { kind: current.kind, amount: current.amount, target, working: current.working });
  if (!validation.valid) return { state, error: validation.message };
  const next = cloneState(state);
  const wager = next.wagers.find((candidate) => candidate.id === id)!;
  wager.target = target;
  return { state: next };
}

function ratio(amount: number, odds: [number, number]): number {
  return Math.floor((amount * odds[0]) / odds[1]);
}

function commission(profit: number, state: GameState): number {
  return Math.ceil(profit * state.ruleset.commissionRate);
}

function settlement(wager: Wager, status: Settlement['status'], profit: number, returned: number, message: string, vig = 0): Settlement {
  return { wagerId: wager.id, kind: wager.kind, status, stake: wager.amount, profit, returned, commission: vig, message };
}

export function invalidWagerForRoll(state: GameState): Wager | undefined {
  return state.wagers.find((wager) => !validateWagerForRoll(state, wager).valid);
}

interface Decision {
  keep: boolean;
  settlement?: Settlement;
  patch?: Partial<Wager>;
}

function isWorking(wager: Wager, state: GameState): boolean {
  if (state.phase === 'point') return true;
  if (['pass', 'dontPass', 'come', 'dontCome', 'lay', 'dontOdds', 'dontComeOdds'].includes(wager.kind)) return true;
  return wager.working;
}

function hasTraveledContract(state: GameState, kind: 'come' | 'dontCome', point: number): boolean {
  return isPointNumber(point) && state.wagers.some((wager) => wager.kind === kind && wager.contract && wager.comePoint === point);
}

function settleHorn(wager: Wager, total: number): Decision {
  const part = wager.amount / 4;
  const payout = total === 2 || total === 12 ? 30 : total === 3 || total === 11 ? 15 : 0;
  if (!payout) return { keep: false, settlement: settlement(wager, 'lost', 0, 0, 'Horn lost.') };
  const profit = part * payout;
  return { keep: false, settlement: settlement(wager, 'won', profit, part, `Horn hit ${total}.`) };
}

function settleCe(wager: Wager, total: number): Decision {
  const part = wager.amount / 2;
  if (total === 11) return { keep: false, settlement: settlement(wager, 'won', part * 15, part, 'Yo eleven hit.') };
  if ([2, 3, 12].includes(total)) return { keep: false, settlement: settlement(wager, 'won', part * 7, part, 'Any Craps hit.') };
  return { keep: false, settlement: settlement(wager, 'lost', 0, 0, 'C & E lost.') };
}

function decideWager(wager: Wager, state: GameState, die1: DieFace, die2: DieFace): Decision {
  const total = die1 + die2;
  const comeOut = state.phase === 'comeOut';
  const point = state.point;
  const target = typeof wager.target === 'number' ? wager.target as PointNumber : undefined;

  if (!isWorking(wager, state)) return { keep: true, settlement: settlement(wager, 'inactive', 0, 0, 'Off on the come-out roll.') };

  switch (wager.kind) {
    case 'pass':
      if (!wager.contract && comeOut) {
        if (total === 7 || total === 11) return { keep: true, settlement: settlement(wager, 'won', wager.amount, 0, 'Pass line winner.') };
        if ([2, 3, 12].includes(total)) return { keep: false, settlement: settlement(wager, 'lost', 0, 0, 'Pass line craps.') };
        return { keep: true, patch: { contract: true, target: total as PointNumber }, settlement: settlement(wager, 'moved', 0, 0, `Pass point ${total}.`) };
      }
      if (wager.contract && total === wager.target) return { keep: true, patch: { contract: false, target: undefined }, settlement: settlement(wager, 'won', wager.amount, 0, 'Pass point made.') };
      if (wager.contract && total === 7) return { keep: false, settlement: settlement(wager, 'lost', 0, 0, 'Pass seven-out.') };
      return { keep: true };

    case 'dontPass':
      if (!wager.contract && comeOut) {
        if (total === 7 || total === 11) return { keep: false, settlement: settlement(wager, 'lost', 0, 0, 'Don’t Pass lost.') };
        if (total === 2 || total === 3) return { keep: true, settlement: settlement(wager, 'won', wager.amount, 0, 'Don’t Pass winner.') };
        if (total === 12) return { keep: false, settlement: settlement(wager, 'push', 0, wager.amount, 'Bar 12 push.') };
        return { keep: true, patch: { contract: true, target: total as PointNumber }, settlement: settlement(wager, 'moved', 0, 0, `Don’t Pass point ${total}.`) };
      }
      if (wager.contract && total === wager.target) return { keep: false, settlement: settlement(wager, 'lost', 0, 0, 'Don’t Pass point made.') };
      if (wager.contract && total === 7) return { keep: true, patch: { contract: false, target: undefined }, settlement: settlement(wager, 'won', wager.amount, 0, 'Don’t Pass winner.') };
      return { keep: true };

    case 'come':
      if (!wager.contract) {
        if (total === 7 || total === 11) return { keep: false, settlement: settlement(wager, 'won', wager.amount, wager.amount, 'Come winner.') };
        if ([2, 3, 12].includes(total)) return { keep: false, settlement: settlement(wager, 'lost', 0, 0, 'Come craps.') };
        if (hasTraveledContract(state, 'come', total)) return { keep: true, settlement: settlement(wager, 'moved', 0, 0, `Come stays up; ${total} already has a Come bet.`) };
        return { keep: true, patch: { contract: true, comePoint: total as PointNumber }, settlement: settlement(wager, 'moved', 0, 0, `Come moved to ${total}.`) };
      }
      if (total === wager.comePoint) return { keep: false, settlement: settlement(wager, 'won', wager.amount, wager.amount, 'Come point made.') };
      if (total === 7) return { keep: false, settlement: settlement(wager, 'lost', 0, 0, 'Come seven loss.') };
      return { keep: true };

    case 'dontCome':
      if (!wager.contract) {
        if (total === 7 || total === 11) return { keep: false, settlement: settlement(wager, 'lost', 0, 0, 'Don’t Come lost.') };
        if (total === 2 || total === 3) return { keep: false, settlement: settlement(wager, 'won', wager.amount, wager.amount, 'Don’t Come winner.') };
        if (total === 12) return { keep: false, settlement: settlement(wager, 'push', 0, wager.amount, 'Don’t Come bar 12 push.') };
        if (hasTraveledContract(state, 'dontCome', total)) return { keep: true, settlement: settlement(wager, 'moved', 0, 0, `Don’t Come stays up; ${total} already has a Don’t Come bet.`) };
        return { keep: true, patch: { contract: true, comePoint: total as PointNumber }, settlement: settlement(wager, 'moved', 0, 0, `Don’t Come moved to ${total}.`) };
      }
      if (total === wager.comePoint) return { keep: false, settlement: settlement(wager, 'lost', 0, 0, 'Don’t Come point lost.') };
      if (total === 7) return { keep: false, settlement: settlement(wager, 'won', wager.amount, wager.amount, 'Don’t Come winner.') };
      return { keep: true };

    case 'passOdds':
    case 'comeOdds':
      if (total === target) return { keep: false, settlement: settlement(wager, 'won', ratio(wager.amount, TRUE_ODDS[target!]), wager.amount, 'Odds won.') };
      if (total === 7) return { keep: false, settlement: settlement(wager, 'lost', 0, 0, 'Odds lost.') };
      return { keep: true };

    case 'dontOdds':
    case 'dontComeOdds':
      if (total === target) return { keep: false, settlement: settlement(wager, 'lost', 0, 0, 'Lay odds lost.') };
      if (total === 7) return { keep: false, settlement: settlement(wager, 'won', ratio(wager.amount, LAY_ODDS[target!]), wager.amount, 'Lay odds won.') };
      return { keep: true };

    case 'place':
      if (total === 7) return { keep: false, settlement: settlement(wager, 'lost', 0, 0, `Place ${target} lost.`) };
      if (total === target) return { keep: true, patch: { hits: wager.hits + 1 }, settlement: settlement(wager, 'won', ratio(wager.amount, PLACE_ODDS[target!]), 0, `Place ${target} hit.`) };
      return { keep: true };

    case 'buy': {
      if (total === 7) return { keep: false, settlement: settlement(wager, 'lost', 0, 0, `Buy ${target} lost.`) };
      if (total !== target) return { keep: true };
      const gross = ratio(wager.amount, TRUE_ODDS[target!]);
      const vig = commission(gross, state);
      return { keep: true, patch: { hits: wager.hits + 1 }, settlement: settlement(wager, 'won', gross - vig, 0, `Buy ${target} hit.`, vig) };
    }

    case 'lay': {
      if (total === target) return { keep: false, settlement: settlement(wager, 'lost', 0, 0, `Lay ${target} lost.`) };
      if (total !== 7) return { keep: true };
      const gross = ratio(wager.amount, LAY_ODDS[target!]);
      const vig = commission(gross, state);
      return { keep: true, patch: { hits: wager.hits + 1 }, settlement: settlement(wager, 'won', gross - vig, 0, `Lay ${target} won.`, vig) };
    }

    case 'big6':
    case 'big8': {
      const number = wager.kind === 'big6' ? 6 : 8;
      if (total === 7) return { keep: false, settlement: settlement(wager, 'lost', 0, 0, `Big ${number} lost.`) };
      if (total === number) return { keep: true, patch: { hits: wager.hits + 1 }, settlement: settlement(wager, 'won', wager.amount, 0, `Big ${number} hit.`) };
      return { keep: true };
    }

    case 'field': {
      if (![2, 3, 4, 9, 10, 11, 12].includes(total)) return { keep: false, settlement: settlement(wager, 'lost', 0, 0, 'Field lost.') };
      const multiplier = total === 2 ? state.ruleset.fieldTwo : total === 12 ? state.ruleset.fieldTwelve : 1;
      return { keep: false, settlement: settlement(wager, 'won', wager.amount * multiplier, wager.amount, `Field ${total} won.`) };
    }

    case 'hardway':
      if (total === 7 || (total === target && die1 !== die2)) return { keep: false, settlement: settlement(wager, 'lost', 0, 0, `Hard ${target} lost.`) };
      if (total === target && die1 === die2) return { keep: true, patch: { hits: wager.hits + 1 }, settlement: settlement(wager, 'won', wager.amount * HARDWAY_ODDS[target!]!, 0, `Hard ${target} hit.`) };
      return { keep: true };

    case 'horn': return settleHorn(wager, total);
    case 'ce': return settleCe(wager, total);
    case 'any7':
      return total === 7
        ? { keep: false, settlement: settlement(wager, 'won', wager.amount * 4, wager.amount, 'Any 7 hit.') }
        : { keep: false, settlement: settlement(wager, 'lost', 0, 0, 'Any 7 lost.') };
    case 'anyCraps':
      return [2, 3, 12].includes(total)
        ? { keep: false, settlement: settlement(wager, 'won', wager.amount * 7, wager.amount, 'Any Craps hit.') }
        : { keep: false, settlement: settlement(wager, 'lost', 0, 0, 'Any Craps lost.') };
    case 'number2':
    case 'number3':
    case 'number11':
    case 'number12': {
      const number = Number(wager.kind.replace('number', ''));
      const payout = number === 2 || number === 12 ? 30 : 15;
      return total === number
        ? { keep: false, settlement: settlement(wager, 'won', wager.amount * payout, wager.amount, `${number} hit.`) }
        : { keep: false, settlement: settlement(wager, 'lost', 0, 0, `${number} lost.`) };
    }
    case 'hop': {
      const actual = [die1, die2].sort((a, b) => a - b).join('-');
      const targetHop = String(wager.target);
      const hard = targetHop[0] === targetHop[2];
      const payout = hard ? 30 : 15;
      return actual === targetHop
        ? { keep: false, settlement: settlement(wager, 'won', wager.amount * payout, wager.amount, `Hop ${targetHop} hit.`) }
        : { keep: false, settlement: settlement(wager, 'lost', 0, 0, `Hop ${targetHop} lost.`) };
    }
  }
}

export function settleRoll(state: GameState, die1: DieFace, die2: DieFace, seed = state.seed): RollResult {
  if (state.locked) throw new Error('Cannot settle while game is locked.');
  if (state.stopped) throw new Error('Cannot roll a stopped session.');
  const next = cloneState(state);
  next.locked = true;
  const total = die1 + die2;
  const settlements: Settlement[] = [];
  const events: GameEvent[] = [];
  const kept: Wager[] = [];

  for (const original of state.wagers) {
    const wager = { ...original };
    const decision = decideWager(wager, state, die1, die2);
    if (decision.patch) Object.assign(wager, decision.patch);
    if (decision.settlement) {
      settlements.push(decision.settlement);
      next.bankroll += decision.settlement.profit + decision.settlement.returned;
      if (decision.settlement.status === 'won') events.push({ type: 'betWon', wagerId: wager.id, message: decision.settlement.message });
      if (decision.settlement.status === 'lost') events.push({ type: 'betLost', wagerId: wager.id, message: decision.settlement.message });
    }
    if (decision.keep) kept.push(wager);
  }

  const pointBefore = state.point;
  if (state.phase === 'comeOut' && isPointNumber(total)) {
    next.phase = 'point';
    next.point = total;
    events.push({ type: 'pointEstablished', point: total, message: `Point is ${total}.` });
  } else if (state.phase === 'point' && total === state.point) {
    next.phase = 'comeOut';
    next.point = null;
    events.push({ type: 'pointMade', point: state.point!, message: `${total} made the point.` });
  } else if (state.phase === 'point' && total === 7) {
    next.phase = 'comeOut';
    next.point = null;
    next.shooterCount += 1;
    next.shooterRolls = 0;
    events.push({ type: 'sevenOut', point: state.point!, message: 'Seven out. New shooter.' });
  }
  events.unshift({ type: 'rollSettled', message: `${die1} + ${die2} = ${total}` });

  const survivingIds = new Set(kept.map((wager) => wager.id));
  const orphaned = kept.filter((wager) => wager.parentId && !survivingIds.has(wager.parentId));
  for (const wager of orphaned) {
    next.bankroll += wager.amount;
    settlements.push(settlement(wager, 'push', 0, wager.amount, 'Inactive odds returned when contract resolved.'));
  }
  next.wagers = kept.filter((wager) => !wager.parentId || survivingIds.has(wager.parentId));
  next.rollIndex += 1;
  next.shooterRolls = events.some((event) => event.type === 'sevenOut') ? 0 : state.shooterRolls + 1;
  next.locked = false;
  const record: RollRecord = {
    index: next.rollIndex,
    shooterNumber: state.shooterCount,
    die1,
    die2,
    total,
    phaseBefore: state.phase,
    pointBefore,
    pointAfter: next.point,
    seed,
    settlements,
    events,
    timestamp: next.rollIndex,
  };
  next.history = [...state.history, record];
  return { state: next, record };
}

export function stopGame(state: GameState): GameState {
  return { ...state, stopped: true };
}

export function wagerLabel(wager: Pick<Wager, 'kind' | 'target' | 'comePoint'>): string {
  const labels: Partial<Record<WagerKind, string>> = {
    pass: 'Pass Line', dontPass: 'Don’t Pass', come: 'Come', dontCome: 'Don’t Come',
    passOdds: 'Pass Odds', dontOdds: 'Don’t Odds', comeOdds: 'Come Odds', dontComeOdds: 'Don’t Come Odds',
    any7: 'Any 7', anyCraps: 'Any Craps', big6: 'Big 6', big8: 'Big 8',
    number2: 'Aces', number3: 'Ace-Deuce', number11: 'Yo', number12: 'Boxcars',
    ce: 'C & E', horn: 'Horn', field: 'Field', hop: 'Hop', hardway: 'Hardway',
    place: 'Place', buy: 'Buy', lay: 'Lay',
  };
  const target = (wager.kind === 'come' || wager.kind === 'dontCome') ? wager.comePoint : wager.target;
  return `${labels[wager.kind] ?? wager.kind}${target ? ` ${target}` : ''}`;
}

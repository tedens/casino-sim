import { BetRequest, GameState, PointNumber, ValidationResult, Wager, WagerKind, isPointNumber } from './types';
import { LAY_ODDS, TRUE_ODDS } from './ruleset';

export interface BetValidationOptions {
  allowInvalidAmounts?: boolean;
}

const PROP_KINDS: WagerKind[] = [
  'field', 'hardway', 'horn', 'ce', 'any7', 'anyCraps',
  'number2', 'number3', 'number11', 'number12', 'hop',
];

function nearestMultiple(value: number, multiple: number, minimum: number): number {
  return Math.max(minimum, Math.ceil(value / multiple) * multiple);
}

export function requiredUnit(request: BetRequest, state: GameState): number {
  const target = typeof request.target === 'number' ? request.target : undefined;
  switch (request.kind) {
    case 'place':
      if (target === 6 || target === 8) return 6;
      return 5;
    case 'buy':
    case 'passOdds':
    case 'comeOdds':
      if (target && isPointNumber(target)) return TRUE_ODDS[target][1];
      return 1;
    case 'lay':
    case 'dontOdds':
    case 'dontComeOdds':
      if (target && isPointNumber(target)) return LAY_ODDS[target][1];
      return 1;
    case 'horn': return 4;
    case 'ce': return 2;
    default: return 1;
  }
}

function assignedPoint(parent: Wager): PointNumber | undefined {
  if (parent.kind === 'pass' || parent.kind === 'dontPass') return parent.target as PointNumber | undefined;
  return parent.comePoint;
}

export function validateBet(state: GameState, request: BetRequest, options: BetValidationOptions = {}): ValidationResult {
  if (state.locked) return { valid: false, message: 'Bets are locked while dice are moving.' };
  if (state.stopped) return { valid: false, message: 'Session is stopped.' };
  if (!Number.isInteger(request.amount) || request.amount <= 0) {
    return { valid: false, message: 'Bet must be a positive whole-dollar amount.' };
  }
  if (request.amount > state.bankroll) return { valid: false, message: 'Insufficient bankroll.' };

  if (!options.allowInvalidAmounts) {
    const isProp = PROP_KINDS.includes(request.kind);
    const minimum = isProp ? 1 : state.ruleset.tableMinimum;
    if (request.amount < minimum) {
      return { valid: false, message: `Minimum is $${minimum}.`, nearestValidAmount: minimum };
    }
  }
  if (request.amount > state.ruleset.tableMaximum) {
    return { valid: false, message: `Maximum is $${state.ruleset.tableMaximum}.` };
  }

  if ((request.kind === 'pass' || request.kind === 'dontPass') && state.phase !== 'comeOut') {
    return { valid: false, message: 'Line bets may only be placed on the come-out roll.' };
  }
  if ((request.kind === 'come' || request.kind === 'dontCome') && state.phase !== 'point') {
    return { valid: false, message: 'Come bets require an established table point.' };
  }
  if (['place', 'buy', 'lay', 'hardway'].includes(request.kind)) {
    if (typeof request.target !== 'number' || !isPointNumber(request.target)) {
      return { valid: false, message: 'This wager requires a box number.' };
    }
    if (request.kind === 'hardway' && ![4, 6, 8, 10].includes(request.target)) {
      return { valid: false, message: 'Hardways are available only on 4, 6, 8, and 10.' };
    }
  }
  if (request.kind === 'hop' && typeof request.target !== 'string') {
    return { valid: false, message: 'Hop bet requires a dice combination.' };
  }

  if (request.parentId) {
    const parent = state.wagers.find((wager) => wager.id === request.parentId);
    if (!parent || !parent.contract) return { valid: false, message: 'Odds require an assigned contract bet.' };
    const point = assignedPoint(parent);
    if (!point) return { valid: false, message: 'Odds require an assigned point.' };
    if (request.target !== point) return { valid: false, message: 'Odds target must match its contract point.' };
    const max = request.kind === 'dontOdds' || request.kind === 'dontComeOdds'
      ? parent.amount * state.ruleset.dontOddsMultiple
      : parent.amount * state.ruleset.passOddsMultiples[point];
    if (request.amount > max) return { valid: false, message: `Maximum odds are $${max}.` };
  }

  if ((request.kind === 'pass' || request.kind === 'dontPass') && state.wagers.some((wager) => wager.kind === request.kind)) {
    return { valid: false, message: 'Only one active wager of this line type is allowed.' };
  }

  if (!options.allowInvalidAmounts) {
    const unit = requiredUnit(request, state);
    if (request.amount % unit !== 0) {
      return {
        valid: false,
        message: `Use a $${unit} betting unit for an exact payout.`,
        nearestValidAmount: nearestMultiple(request.amount, unit, state.ruleset.tableMinimum),
      };
    }
  }
  return { valid: true };
}

export function validateWagerForRoll(state: GameState, wager: Wager): ValidationResult {
  if (!Number.isInteger(wager.amount) || wager.amount <= 0) {
    return { valid: false, message: 'Bet must be a positive whole-dollar amount.' };
  }
  if (wager.amount > state.ruleset.tableMaximum) {
    return { valid: false, message: `Maximum is $${state.ruleset.tableMaximum}.` };
  }
  const unit = requiredUnit(wager, state);
  if (wager.amount % unit !== 0) {
    return { valid: false, message: `Use a $${unit} betting unit for an exact payout.` };
  }
  if (wager.parentId) {
    const parent = state.wagers.find((candidate) => candidate.id === wager.parentId);
    if (!parent || !parent.contract) return { valid: false, message: 'Odds require an assigned contract bet.' };
    const point = assignedPoint(parent);
    if (!point) return { valid: false, message: 'Odds require an assigned point.' };
    if (wager.target !== point) return { valid: false, message: 'Odds target must match its contract point.' };
    const max = wager.kind === 'dontOdds' || wager.kind === 'dontComeOdds'
      ? parent.amount * state.ruleset.dontOddsMultiple
      : parent.amount * state.ruleset.passOddsMultiples[point];
    if (wager.amount > max) return { valid: false, message: `Maximum odds are $${max}.` };
  }
  return { valid: true };
}

export function canRemoveWager(state: GameState, wager: Wager): ValidationResult {
  if (state.locked) return { valid: false, message: 'Bets are locked.' };
  if ((wager.kind === 'pass' || wager.kind === 'come') && wager.contract) {
    return { valid: false, message: 'This is a locked contract bet.' };
  }
  return { valid: true };
}

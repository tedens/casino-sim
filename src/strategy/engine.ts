import { GameState, PointNumber, Wager } from '../domain/types';
import { placeWager, removeWager, resizeWager, sessionProfit, setWagerWorking, stopGame } from '../domain/engine';
import { requiredUnit, validateBet } from '../domain/validation';
import { BetSelector, StrategyAction, StrategyCondition, StrategyContext, StrategyDefinition, StrategyProposal } from './types';

function matches(wager: Wager, selector: BetSelector): boolean {
  return wager.kind === selector.kind && (selector.target === undefined || wager.target === selector.target);
}

function selectedWager(state: GameState, selector?: BetSelector): Wager | undefined {
  return selector ? state.wagers.find((wager) => matches(wager, selector)) : undefined;
}

function compare(actual: unknown, operator: StrategyCondition['operator'], expected: unknown): boolean {
  switch (operator) {
    case 'eq': return actual === expected;
    case 'neq': return actual !== expected;
    case 'gt': return Number(actual) > Number(expected);
    case 'gte': return Number(actual) >= Number(expected);
    case 'lt': return Number(actual) < Number(expected);
    case 'lte': return Number(actual) <= Number(expected);
    case 'exists': return actual !== undefined && actual !== null;
    case 'notExists': return actual === undefined || actual === null;
  }
}

function conditionValue(condition: StrategyCondition, state: GameState, context: StrategyContext): unknown {
  const wager = selectedWager(state, condition.selector);
  switch (condition.fact) {
    case 'phase': return state.phase;
    case 'point': return state.point;
    case 'bankroll': return state.bankroll;
    case 'profit': return sessionProfit(state);
    case 'lastTotal': return context.record?.total;
    case 'rollCount': return state.rollIndex;
    case 'shooterRolls': return state.shooterRolls;
    case 'hasBet': return Boolean(wager);
    case 'betCount': return condition.selector ? state.wagers.filter((candidate) => matches(candidate, condition.selector!)).length : 0;
    case 'betAmount': return wager?.amount;
    case 'betHits': return wager?.hits;
  }
}

function actionKey(action: StrategyAction): string {
  if (action.type === 'stop') return 'session';
  if (action.type === 'place') return `${action.kind}:${action.target ?? ''}`;
  return `${action.selector.kind}:${action.selector.target ?? ''}`;
}

function actionText(action: StrategyAction): string {
  if (action.type === 'place') return `Place $${action.amount} on ${action.kind}${action.target ? ` ${action.target}` : ''}.`;
  if (action.type === 'takeMaxOdds') return `Take maximum odds on ${action.selector.kind}.`;
  if (action.type === 'remove') return `Remove ${action.selector.kind}.`;
  if (action.type === 'press') return `Press ${action.selector.kind}${action.selector.target ? ` ${action.selector.target}` : ''}.`;
  if (action.type === 'regress') return `Regress ${action.selector.kind} to $${action.amount}.`;
  if (action.type === 'collect') return `Collect ${action.selector.kind} win.`;
  if (action.type === 'setWorking') return `Turn ${action.selector.kind} ${action.working ? 'on' : 'off'}.`;
  return action.reason;
}

function resolvePresetAction(action: StrategyAction, state: GameState): StrategyAction {
  if (action.type !== 'place') return action;
  const requested = Math.max(action.amount, state.ruleset.tableMinimum);
  const unit = requiredUnit({ kind: action.kind, amount: requested, target: action.target, working: action.working }, state);
  return { ...action, amount: Math.ceil(requested / unit) * unit };
}

function validateAction(action: StrategyAction, state: GameState, context: StrategyContext): string | undefined {
  if (action.type === 'place') {
    const allowsMultiple = ['come', 'dontCome', 'field', 'horn', 'ce', 'any7', 'anyCraps', 'number2', 'number3', 'number11', 'number12', 'hop'].includes(action.kind);
    if (!allowsMultiple && state.wagers.some((wager) => matches(wager, { kind: action.kind, target: action.target }))) return 'Matching wager already exists.';
    const validation = validateBet(state, action);
    if (!validation.valid) return validation.message;
  } else if (action.type !== 'stop') {
    const wager = action.type === 'takeMaxOdds'
      ? state.wagers.find((candidate) => matches(candidate, action.selector) && candidate.contract && !state.wagers.some((odds) => odds.parentId === candidate.id))
      : selectedWager(state, action.selector);
    if (!wager) return 'Target wager does not exist.';
    if (action.type === 'press') {
      const win = context.record?.settlements.find((item) => item.wagerId === wager.id)?.profit ?? 0;
      const amount = action.useLastWin ? win : action.amount ?? 0;
      if (amount <= 0) return 'No eligible win or press amount.';
      if (amount > state.bankroll) return 'Insufficient bankroll to press.';
    }
  }
  return undefined;
}

export function evaluateStrategy(strategy: StrategyDefinition, state: GameState, context: StrategyContext): StrategyProposal[] {
  const proposals: StrategyProposal[] = [];
  const claimed = new Set<string>();
  const rules = strategy.rules.filter((rule) => rule.enabled && rule.trigger === context.trigger).sort((a, b) => a.priority - b.priority);
  for (const rule of rules) {
    if (!rule.conditions.every((condition) => compare(conditionValue(condition, state, context), condition.operator, condition.value))) continue;
    for (let index = 0; index < rule.actions.length; index += 1) {
      const action = strategy.builtIn ? resolvePresetAction(rule.actions[index], state) : rule.actions[index];
      const targetKey = actionKey(action);
      const conflict = claimed.has(targetKey);
      const reason = conflict ? 'Higher-priority rule already controls this target.' : validateAction(action, state, context);
      if (!reason) claimed.add(targetKey);
      proposals.push({
        id: `${rule.id}:${index}:${state.rollIndex}`,
        ruleId: rule.id,
        ruleName: rule.name,
        action,
        targetKey,
        valid: !reason,
        explanation: actionText(action),
        reason,
      });
    }
  }
  return proposals;
}

export function applyProposal(state: GameState, proposal: StrategyProposal, context: StrategyContext): { state: GameState; error?: string } {
  if (!proposal.valid) return { state, error: proposal.reason ?? 'Invalid proposal.' };
  const action = proposal.action;
  if (action.type === 'place') return placeWager(state, action);
  if (action.type === 'stop') return { state: stopGame(state) };
  const wager = action.type === 'takeMaxOdds'
    ? state.wagers.find((candidate) => matches(candidate, action.selector) && candidate.contract && !state.wagers.some((odds) => odds.parentId === candidate.id))
    : selectedWager(state, action.selector);
  if (!wager) return { state, error: 'Target wager no longer exists.' };
  if (action.type === 'remove') return removeWager(state, wager.id);
  if (action.type === 'setWorking') return setWagerWorking(state, wager.id, action.working);
  if (action.type === 'regress') return resizeWager(state, wager.id, action.amount);
  if (action.type === 'press') {
    const lastWin = context.record?.settlements.find((item) => item.wagerId === wager.id)?.profit ?? 0;
    const requested = wager.amount + (action.useLastWin ? lastWin : action.amount ?? 0);
    const unit = requiredUnit({ kind: wager.kind, amount: requested, target: wager.target, parentId: wager.parentId }, state);
    const exactAmount = Math.floor(requested / unit) * unit;
    return resizeWager(state, wager.id, exactAmount);
  }
  if (action.type === 'collect') return { state };
  if (action.type === 'takeMaxOdds') {
    const point = (wager.kind === 'pass' || wager.kind === 'dontPass' ? wager.target : wager.comePoint) as PointNumber | undefined;
    if (!point) return { state, error: 'Contract point not assigned.' };
    const dark = wager.kind === 'dontPass' || wager.kind === 'dontCome';
    const kind = dark ? (wager.kind === 'dontPass' ? 'dontOdds' : 'dontComeOdds') : (wager.kind === 'pass' ? 'passOdds' : 'comeOdds');
    const requested = dark ? wager.amount * state.ruleset.dontOddsMultiple : wager.amount * state.ruleset.passOddsMultiples[point];
    const unit = requiredUnit({ kind, amount: requested, target: point, parentId: wager.id }, state);
    const amount = Math.floor(Math.min(requested, state.bankroll) / unit) * unit;
    if (amount <= 0) return { state, error: 'Insufficient bankroll for odds.' };
    return placeWager(state, { kind, amount, target: point, parentId: wager.id });
  }
  return { state };
}

export function applyStrategy(strategy: StrategyDefinition, state: GameState, context: StrategyContext): { state: GameState; proposals: StrategyProposal[] } {
  const proposals = evaluateStrategy(strategy, state, context);
  let next = state;
  for (const proposal of proposals) {
    if (!proposal.valid) continue;
    next = applyProposal(next, proposal, context).state;
  }
  return { state: next, proposals };
}

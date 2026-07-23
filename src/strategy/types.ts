import { GameEventType, Phase, PointNumber, RollRecord, WagerKind, WagerTarget } from '../domain/types';

export type StrategyTrigger = 'sessionStart' | 'comeOutStart' | 'pointEstablished' | 'rollSettled' | 'betWon' | 'betLost' | 'sevenOut' | 'bankrollThreshold';
export type ConditionOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'notExists';
export type ConditionFact = 'phase' | 'point' | 'bankroll' | 'profit' | 'lastTotal' | 'rollCount' | 'shooterRolls' | 'hasBet' | 'betCount' | 'betAmount' | 'betHits';

export interface BetSelector {
  kind: WagerKind;
  target?: WagerTarget;
}

export interface StrategyCondition {
  fact: ConditionFact;
  operator: ConditionOperator;
  value?: string | number | boolean | null;
  selector?: BetSelector;
}

export type StrategyAction =
  | { type: 'place'; kind: WagerKind; amount: number; target?: WagerTarget; working?: boolean }
  | { type: 'takeMaxOdds'; selector: BetSelector }
  | { type: 'remove'; selector: BetSelector }
  | { type: 'press'; selector: BetSelector; amount?: number; useLastWin?: boolean }
  | { type: 'regress'; selector: BetSelector; amount: number }
  | { type: 'collect'; selector: BetSelector }
  | { type: 'setWorking'; selector: BetSelector; working: boolean }
  | { type: 'stop'; reason: string };

export interface StrategyRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  trigger: StrategyTrigger;
  conditions: StrategyCondition[];
  actions: StrategyAction[];
}

export interface StrategyDefinition {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  rulesetId: string;
  builtIn?: boolean;
  rules: StrategyRule[];
  createdAt: string;
  updatedAt: string;
}

export interface StrategyContext {
  trigger: StrategyTrigger;
  record?: RollRecord;
  eventType?: GameEventType;
  eventWagerId?: string;
}

export interface StrategyProposal {
  id: string;
  ruleId: string;
  ruleName: string;
  action: StrategyAction;
  targetKey: string;
  valid: boolean;
  explanation: string;
  reason?: string;
}

export interface StrategyDraftRule {
  name: string;
  trigger: StrategyTrigger;
  phase?: Phase | 'any';
  point?: PointNumber | 'any';
  action: StrategyAction;
}

export type DieFace = 1 | 2 | 3 | 4 | 5 | 6;
export type PointNumber = 4 | 5 | 6 | 8 | 9 | 10;
export type Phase = 'comeOut' | 'point';

export type WagerKind =
  | 'pass'
  | 'dontPass'
  | 'come'
  | 'dontCome'
  | 'passOdds'
  | 'dontOdds'
  | 'comeOdds'
  | 'dontComeOdds'
  | 'place'
  | 'buy'
  | 'lay'
  | 'big6'
  | 'big8'
  | 'field'
  | 'hardway'
  | 'horn'
  | 'ce'
  | 'any7'
  | 'anyCraps'
  | 'number2'
  | 'number3'
  | 'number11'
  | 'number12'
  | 'hop';

export type WagerTarget = PointNumber | `${DieFace}-${DieFace}`;

export interface Wager {
  id: string;
  kind: WagerKind;
  amount: number;
  target?: WagerTarget;
  parentId?: string;
  working: boolean;
  contract: boolean;
  comePoint?: PointNumber;
  createdRoll: number;
  hits: number;
}

export interface Ruleset {
  id: string;
  name: string;
  tableMinimum: number;
  tableMaximum: number;
  startingBankroll: number;
  passOddsMultiples: Record<PointNumber, number>;
  dontOddsMultiple: number;
  fieldTwo: number;
  fieldTwelve: number;
  commissionRate: number;
  commissionOnWinOnly: boolean;
}

export type SettlementStatus = 'won' | 'lost' | 'push' | 'moved' | 'inactive';

export interface Settlement {
  wagerId: string;
  kind: WagerKind;
  status: SettlementStatus;
  stake: number;
  profit: number;
  returned: number;
  commission: number;
  message: string;
}

export type GameEventType =
  | 'rollSettled'
  | 'pointEstablished'
  | 'pointMade'
  | 'sevenOut'
  | 'betWon'
  | 'betLost';

export interface GameEvent {
  type: GameEventType;
  message: string;
  wagerId?: string;
  point?: PointNumber;
}

export interface RollRecord {
  index: number;
  shooterNumber: number;
  die1: DieFace;
  die2: DieFace;
  total: number;
  phaseBefore: Phase;
  pointBefore: PointNumber | null;
  pointAfter: PointNumber | null;
  seed: string;
  settlements: Settlement[];
  events: GameEvent[];
  timestamp: number;
}

export interface GameState {
  ruleset: Ruleset;
  startingBankroll: number;
  bankroll: number;
  phase: Phase;
  point: PointNumber | null;
  wagers: Wager[];
  history: RollRecord[];
  rollIndex: number;
  seed: string;
  locked: boolean;
  stopped: boolean;
  totalWagered: number;
  shooterRolls: number;
  shooterCount: number;
}

export interface BetRequest {
  kind: WagerKind;
  amount: number;
  target?: WagerTarget;
  parentId?: string;
  working?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
  nearestValidAmount?: number;
}

export interface RollResult {
  state: GameState;
  record: RollRecord;
}

export const POINT_NUMBERS: PointNumber[] = [4, 5, 6, 8, 9, 10];

export function isPointNumber(value: number): value is PointNumber {
  return POINT_NUMBERS.includes(value as PointNumber);
}

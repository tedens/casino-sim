export type WheelKind = 'european' | 'american';

export type PocketColor = 'red' | 'black' | 'green';

/** 'n0', 'n00', 'n1'..'n36' for straights, plus the outside bets */
export type RouletteBetId = string;

export interface SpinTrace {
  /** unscaled real-time duration of the spin, ms */
  durationMs: number;
  /** total rotor revolutions over the spin (counter-clockwise on screen) */
  wheelRevs: number;
  /** total ball revolutions (clockwise on screen) */
  ballRevs: number;
  /** winning pocket index into the wheel order */
  pocketIndex: number;
  /** pocket count for this wheel */
  pockets: number;
}

export interface SpinResult {
  pocket: string;
  trace: SpinTrace;
}

export interface SpinRecord {
  index: number;
  pocket: string;
  color: PocketColor;
  playerStake: number;
  playerNet: number;
  /** player session profit after this spin */
  cumulative: number;
  runnerNets: Record<string, number>;
}

export interface SavedRouletteStrategy {
  id: string;
  name: string;
  /** dollar amount per bet spot, captured from the felt */
  bets: Record<RouletteBetId, number>;
  /** betting progression id (preset or custom) scaling the whole layout */
  progression: string;
  enabled: boolean;
}

export interface RunnerState {
  strategyId: string;
  name: string;
  bankroll: number;
  /** fresh stakes borrowed after going broke */
  friends: number;
  profitSeries: number[];
  lastNet: number;
}

export interface RouletteRules {
  wheel: WheelKind;
  tableMinimum: number;
  tableMaximum: number;
}

export interface RouletteState {
  seed: string;
  rules: RouletteRules;
  bankroll: number;
  startingBankroll: number;
  spinIndex: number;
  lastPocket: string | null;
  lastTrace: SpinTrace | null;
  history: SpinRecord[];
  /** player cumulative profit per spin, uncapped (feeds the session graph) */
  profitSeries: number[];
  runners: RunnerState[];
  /** cumulative theoretical loss (total staked × house edge) — the comp meter */
  theoTotal: number;
  events: string[];
}

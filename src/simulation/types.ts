import { StrategyDefinition } from '../strategy/types';

export interface SimulationConfig {
  strategy: StrategyDefinition;
  sessions: number;
  maxRollsPerSession: number;
  startingBankroll: number;
  tableMinimum: number;
  tableMaximum: number;
  profitTarget?: number;
  lossLimit?: number;
  completeShooter?: boolean;
  seed: string;
}

export interface SessionResult {
  index: number;
  endingBankroll: number;
  profit: number;
  rolls: number;
  shooters: number;
  totalWagered: number;
  maxDrawdown: number;
  ruined: boolean;
  bankrollCurve: number[];
}

export interface SimulationMetrics {
  sessions: number;
  totalRolls: number;
  meanEndingBankroll: number;
  medianEndingBankroll: number;
  meanProfit: number;
  roi: number;
  ruinRate: number;
  maxDrawdown: number;
  totalWagered: number;
  realizedHouseEdge: number;
  confidence95: [number, number];
  bankrollPercentiles: { p10: number; p50: number; p90: number };
}

export interface SimulationResult {
  id: string;
  strategyId: string;
  strategyName: string;
  seed: string;
  config: Omit<SimulationConfig, 'strategy'>;
  sessions: SessionResult[];
  metrics: SimulationMetrics;
  createdAt: string;
}

export interface ComparisonResult {
  seed: string;
  results: SimulationResult[];
}

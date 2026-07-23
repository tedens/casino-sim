import AsyncStorage from '@react-native-async-storage/async-storage';
import { SimulationResult } from '../simulation/types';
import { StrategyDefinition } from '../strategy/types';
import { BUILT_IN_STRATEGIES } from '../strategy/presets';

const STRATEGIES_KEY = '@craps-lab/strategies/v1';
const RUNS_KEY = '@craps-lab/runs/v1';
const SETTINGS_KEY = '@craps-lab/settings/v1';
const LAB_DEFAULTS_KEY = '@craps-lab/lab-defaults/v1';
const SELECTED_LAB_KEY = '@lab/selected/v1';

export type LabId = 'craps' | 'blackjack';

export async function loadSelectedLab(): Promise<LabId> {
  const raw = await AsyncStorage.getItem(SELECTED_LAB_KEY);
  return raw === 'blackjack' ? 'blackjack' : 'craps';
}

export async function saveSelectedLab(lab: LabId): Promise<void> {
  await AsyncStorage.setItem(SELECTED_LAB_KEY, lab);
}

export interface AppSettings {
  startingBankroll: number;
  tableMinimum: number;
  tableMaximum: number;
  animationSpeed: 'slow' | 'normal' | 'fast';
  showWinnings: boolean;
  selectedChip: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  startingBankroll: 5000,
  tableMinimum: 5,
  tableMaximum: 5000,
  animationSpeed: 'normal',
  showWinnings: true,
  selectedChip: 5,
};

export interface LabDefaults {
  strategyIds: string[];
  sessions: number;
  maxRollsPerSession: number;
  startingBankroll: number;
  tableMinimum: number;
  tableMaximum: number;
  profitTarget?: number;
  lossLimit?: number;
  seed: string;
  completeShooter: boolean;
}

function isStrategy(value: unknown): value is StrategyDefinition {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StrategyDefinition>;
  return candidate.schemaVersion === 1 && typeof candidate.id === 'string' && typeof candidate.name === 'string' && Array.isArray(candidate.rules);
}

export async function loadStrategies(): Promise<StrategyDefinition[]> {
  const raw = await AsyncStorage.getItem(STRATEGIES_KEY);
  if (!raw) return BUILT_IN_STRATEGIES;
  try {
    const custom = (JSON.parse(raw) as unknown[]).filter(isStrategy);
    return [...BUILT_IN_STRATEGIES, ...custom.filter((strategy) => !strategy.builtIn)];
  } catch {
    return BUILT_IN_STRATEGIES;
  }
}

export async function saveStrategies(strategies: StrategyDefinition[]): Promise<void> {
  await AsyncStorage.setItem(STRATEGIES_KEY, JSON.stringify(strategies.filter((strategy) => !strategy.builtIn)));
}

export function exportStrategy(strategy: StrategyDefinition): string {
  return JSON.stringify(strategy, null, 2);
}

export function importStrategy(raw: string): StrategyDefinition {
  const value: unknown = JSON.parse(raw);
  if (!isStrategy(value)) throw new Error('Unsupported strategy JSON. Expected schemaVersion 1.');
  return { ...value, builtIn: false, id: `${value.id}-import-${Date.now().toString(36)}`, updatedAt: new Date().toISOString() };
}

export async function loadRuns(): Promise<SimulationResult[]> {
  const raw = await AsyncStorage.getItem(RUNS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as SimulationResult[]; } catch { return []; }
}

export async function saveRun(result: SimulationResult): Promise<void> {
  const runs = await loadRuns();
  await AsyncStorage.setItem(RUNS_KEY, JSON.stringify([result, ...runs].slice(0, 20)));
}

export async function loadSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }; } catch { return DEFAULT_SETTINGS; }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function loadLabDefaults(fallback: LabDefaults): Promise<LabDefaults> {
  const raw = await AsyncStorage.getItem(LAB_DEFAULTS_KEY);
  if (!raw) return fallback;
  try { return { ...fallback, ...JSON.parse(raw) }; } catch { return fallback; }
}

export async function saveLabDefaults(defaults: LabDefaults): Promise<void> {
  await AsyncStorage.setItem(LAB_DEFAULTS_KEY, JSON.stringify(defaults));
}

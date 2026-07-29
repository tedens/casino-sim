import AsyncStorage from '@react-native-async-storage/async-storage';
import { SavedRouletteStrategy, WheelKind } from './types';

const SETTINGS_KEY = '@roulette-lab/settings/v1';
const STRATEGIES_KEY = '@roulette-lab/strategies/v1';

export interface RouletteSettings {
  startingBankroll: number;
  tableMinimum: number;
  tableMaximum: number;
  wheel: WheelKind;
  /** cap for progression scaling on strategy runners */
  progressionMaxUnits: number;
}

export const DEFAULT_ROULETTE_SETTINGS: RouletteSettings = {
  startingBankroll: 1000,
  tableMinimum: 5,
  tableMaximum: 5000,
  wheel: 'european',
  progressionMaxUnits: 8,
};

export async function loadRouletteSettings(): Promise<RouletteSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return DEFAULT_ROULETTE_SETTINGS;
  try { return { ...DEFAULT_ROULETTE_SETTINGS, ...JSON.parse(raw) }; } catch { return DEFAULT_ROULETTE_SETTINGS; }
}

export async function saveRouletteSettings(settings: RouletteSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// older saves predate step ladders — fold their single layout into a one-step ladder
function normalizeStrategy(raw: unknown): SavedRouletteStrategy {
  const item = raw as SavedRouletteStrategy;
  const steps = Array.isArray(item.steps) && item.steps.length > 0 ? item.steps : [item.bets];
  return {
    id: item.id,
    name: item.name,
    steps,
    bets: steps[0],
    onWin: item.onWin ?? 'reset',
    onLoss: item.onLoss ?? 'advance',
    loop: item.loop ?? false,
    progression: item.progression ?? 'flat',
    enabled: !!item.enabled,
  };
}

export async function loadRouletteStrategies(): Promise<SavedRouletteStrategy[]> {
  const raw = await AsyncStorage.getItem(STRATEGIES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && item.bets && typeof item.bets === 'object').map(normalizeStrategy)
      : [];
  } catch {
    return [];
  }
}

export async function saveRouletteStrategies(strategies: SavedRouletteStrategy[]): Promise<void> {
  await AsyncStorage.setItem(STRATEGIES_KEY, JSON.stringify(strategies));
}

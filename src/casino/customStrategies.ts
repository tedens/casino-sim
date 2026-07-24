import AsyncStorage from '@react-native-async-storage/async-storage';

export type StepAction = 'reset' | 'advance' | 'stepBack' | 'hold';

export interface CustomBettingStrategy {
  id: string;
  name: string;
  /** unit ladder walked by step, e.g. [1, 2, 4, 8] */
  sequence: number[];
  onWin: StepAction;
  onLoss: StepAction;
  /** advancing past the end loops to the start; otherwise holds on the last rung */
  loop: boolean;
}

const KEY = '@casino/custom-strategies/v1';

export const STEP_ACTIONS: Array<{ id: StepAction; label: string }> = [
  { id: 'reset', label: 'RESET' },
  { id: 'advance', label: 'ADVANCE' },
  { id: 'stepBack', label: 'STEP BACK' },
  { id: 'hold', label: 'HOLD' },
];

export function parseSequence(text: string): number[] | null {
  const parts = text.split(/[,\s]+/).filter(Boolean).map(Number);
  if (parts.length === 0 || parts.length > 32) return null;
  if (parts.some((value) => !Number.isInteger(value) || value < 1 || value > 10000)) return null;
  return parts;
}

export async function loadCustomStrategies(): Promise<CustomBettingStrategy[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item && Array.isArray(item.sequence) && item.sequence.length > 0) : [];
  } catch {
    return [];
  }
}

export async function saveCustomStrategies(items: CustomBettingStrategy[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

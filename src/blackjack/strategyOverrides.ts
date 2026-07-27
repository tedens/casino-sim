import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChartCode } from './chart';

// per-cell edits layered over book strategy, keyed by cellKey(section,label,up)
export type StrategyOverrides = Record<string, ChartCode>;

const KEY = '@blackjack-lab/strategy-overrides/v1';

export async function loadStrategyOverrides(): Promise<StrategyOverrides> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveStrategyOverrides(overrides: StrategyOverrides): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(overrides));
}

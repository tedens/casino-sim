import AsyncStorage from '@react-native-async-storage/async-storage';
import { BettingStrategyId } from '../blackjack/betting';
import { BaccaratBetKind } from './types';

const SETTINGS_KEY = '@baccarat-lab/settings/v1';

export interface BaccaratSettings {
  startingBankroll: number;
  tableMinimum: number;
  tableMaximum: number;
  decks: number;
  progressionEnabled: boolean;
  progressionMaxUnits: number;
  bettingStrategy: BettingStrategyId;
  /** the spot the auto bet rides on */
  betSide: BaccaratBetKind;
}

export const DEFAULT_BACCARAT_SETTINGS: BaccaratSettings = {
  startingBankroll: 1000,
  tableMinimum: 5,
  tableMaximum: 5000,
  decks: 8,
  progressionEnabled: true,
  progressionMaxUnits: 8,
  bettingStrategy: 'winPress',
  betSide: 'banker',
};

export async function loadBaccaratSettings(): Promise<BaccaratSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return DEFAULT_BACCARAT_SETTINGS;
  try { return { ...DEFAULT_BACCARAT_SETTINGS, ...JSON.parse(raw) }; } catch { return DEFAULT_BACCARAT_SETTINGS; }
}

export async function saveBaccaratSettings(settings: BaccaratSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = '@blackjack-lab/settings/v1';

export interface BlackjackSettings {
  startingBankroll: number;
  tableMinimum: number;
  tableMaximum: number;
  decks: number;
  dealerHitsSoft17: boolean;
  blackjackPayout: 1.5 | 1.2;
  surrenderAllowed: boolean;
  doubleAfterSplit: boolean;
  showHints: boolean;
  progressionEnabled: boolean;
  progressionMaxUnits: number;
  /** preset id or a custom strategy id */
  bettingStrategy: string;
  aiPlayers: number;
  insureTwentyVsAce: boolean;
}

export const DEFAULT_BLACKJACK_SETTINGS: BlackjackSettings = {
  startingBankroll: 1000,
  tableMinimum: 5,
  tableMaximum: 5000,
  decks: 6,
  dealerHitsSoft17: true,
  blackjackPayout: 1.5,
  surrenderAllowed: true,
  doubleAfterSplit: true,
  showHints: true,
  progressionEnabled: true,
  progressionMaxUnits: 8,
  bettingStrategy: 'winPress',
  aiPlayers: 0,
  insureTwentyVsAce: false,
};

export async function loadBlackjackSettings(): Promise<BlackjackSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return DEFAULT_BLACKJACK_SETTINGS;
  try { return { ...DEFAULT_BLACKJACK_SETTINGS, ...JSON.parse(raw) }; } catch { return DEFAULT_BLACKJACK_SETTINGS; }
}

export async function saveBlackjackSettings(settings: BlackjackSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

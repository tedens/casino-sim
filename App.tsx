import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { BaccaratSettings, DEFAULT_BACCARAT_SETTINGS, loadBaccaratSettings, saveBaccaratSettings } from './src/baccarat/storage';
import { bacColors } from './src/baccarat/theme';
import { BlackjackSettings, DEFAULT_BLACKJACK_SETTINGS, loadBlackjackSettings, saveBlackjackSettings } from './src/blackjack/storage';
import { bjColors } from './src/blackjack/theme';
import { BaccaratGameScreen } from './src/screens/baccarat/BaccaratGameScreen';
import { BaccaratSettingsScreen } from './src/screens/baccarat/BaccaratSettingsScreen';
import { BlackjackChartScreen } from './src/screens/blackjack/BlackjackChartScreen';
import { BlackjackGameScreen } from './src/screens/blackjack/BlackjackGameScreen';
import { BlackjackSettingsScreen } from './src/screens/blackjack/BlackjackSettingsScreen';
import { GameScreen } from './src/screens/GameScreen';
import { LabScreen } from './src/screens/LabScreen';
import { RulesScreen } from './src/screens/RulesScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { StrategyScreen } from './src/screens/StrategyScreen';
import { SimulationResult } from './src/simulation/types';
import { DEFAULT_SETTINGS, AppSettings, LabId, loadRuns, loadSelectedLab, loadSettings, loadStrategies, saveRun, saveSelectedLab, saveSettings, saveStrategies } from './src/storage/storage';
import { BUILT_IN_STRATEGIES } from './src/strategy/presets';
import { StrategyDefinition } from './src/strategy/types';
import { colors } from './src/ui/theme';

type CrapsScreen = 'table' | 'strategies' | 'lab' | 'rules' | 'settings';
type BlackjackScreen = 'bj-table' | 'bj-chart' | 'bj-settings';
type BaccaratScreen = 'bac-table' | 'bac-settings';

const CRAPS_NAV: Array<{ id: CrapsScreen; label: string; short: string }> = [
  { id: 'table', label: 'Table', short: 'TABLE' },
  { id: 'strategies', label: 'Strategies', short: 'RULES' },
  { id: 'lab', label: 'Batch Lab', short: 'LAB' },
  { id: 'rules', label: 'Payouts', short: 'PAYS' },
  { id: 'settings', label: 'Settings', short: 'SET' },
];

const BLACKJACK_NAV: Array<{ id: BlackjackScreen; label: string; short: string }> = [
  { id: 'bj-table', label: 'Table', short: 'TABLE' },
  { id: 'bj-chart', label: 'Strategy', short: 'CHART' },
  { id: 'bj-settings', label: 'Settings', short: 'SET' },
];

const BACCARAT_NAV: Array<{ id: BaccaratScreen; label: string; short: string }> = [
  { id: 'bac-table', label: 'Table', short: 'TABLE' },
  { id: 'bac-settings', label: 'Settings', short: 'SET' },
];

const LABS: Array<{ id: LabId; title: string; subtitle: string }> = [
  { id: 'craps', title: 'CRAPS', subtitle: 'Dice · green felt' },
  { id: 'blackjack', title: 'BLACK\nJACK', subtitle: '21 · blue felt' },
  { id: 'baccarat', title: 'BACCA\nRAT', subtitle: 'Punto banco · red felt' },
];

export default function App() {
  const [lab, setLab] = useState<LabId>('craps');
  const [labMenuOpen, setLabMenuOpen] = useState(false);
  const [crapsScreen, setCrapsScreen] = useState<CrapsScreen>('table');
  const [blackjackScreen, setBlackjackScreen] = useState<BlackjackScreen>('bj-table');
  const [baccaratScreen, setBaccaratScreen] = useState<BaccaratScreen>('bac-table');
  const [strategies, setStrategies] = useState<StrategyDefinition[]>(BUILT_IN_STRATEGIES);
  const [selectedStrategyId, setSelectedStrategyId] = useState('');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [blackjackSettings, setBlackjackSettings] = useState<BlackjackSettings>(DEFAULT_BLACKJACK_SETTINGS);
  const [baccaratSettings, setBaccaratSettings] = useState<BaccaratSettings>(DEFAULT_BACCARAT_SETTINGS);
  const [recentRuns, setRecentRuns] = useState<SimulationResult[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([loadStrategies(), loadSettings(), loadRuns(), loadBlackjackSettings(), loadBaccaratSettings(), loadSelectedLab()])
      .then(([loadedStrategies, loadedSettings, loadedRuns, loadedBlackjackSettings, loadedBaccaratSettings, loadedLab]) => {
        setStrategies(loadedStrategies);
        setSettings(loadedSettings);
        setRecentRuns(loadedRuns);
        setBlackjackSettings(loadedBlackjackSettings);
        setBaccaratSettings(loadedBaccaratSettings);
        setLab(loadedLab);
        setReady(true);
      }).catch(() => setReady(true));
  }, []);

  const changeStrategies = (next: StrategyDefinition[]) => {
    setStrategies(next);
    saveStrategies(next).catch(() => undefined);
  };

  const changeSettings = (next: AppSettings) => {
    setSettings(next);
    saveSettings(next).catch(() => undefined);
  };

  const changeBlackjackSettings = (next: BlackjackSettings) => {
    setBlackjackSettings(next);
    saveBlackjackSettings(next).catch(() => undefined);
  };

  const changeBaccaratSettings = (next: BaccaratSettings) => {
    setBaccaratSettings(next);
    saveBaccaratSettings(next).catch(() => undefined);
  };

  const persistRun = (run: SimulationResult) => {
    setRecentRuns((items) => [run, ...items.filter((item) => item.id !== run.id)].slice(0, 20));
    return saveRun(run).catch(() => undefined);
  };

  const switchLab = (next: LabId) => {
    setLab(next);
    setLabMenuOpen(false);
    saveSelectedLab(next).catch(() => undefined);
  };

  if (!ready) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.gold} /><Text style={styles.loadingText}>Loading table…</Text></View>;

  const blue = lab === 'blackjack';
  const wine = lab === 'baccarat';
  const green = lab === 'craps';
  const activeLab = LABS.find((item) => item.id === lab)!;
  const nav: Array<{ id: string; label: string; short: string }> = blue ? BLACKJACK_NAV : wine ? BACCARAT_NAV : CRAPS_NAV;
  const activeScreen = blue ? blackjackScreen : wine ? baccaratScreen : crapsScreen;

  return (
    <SafeAreaView style={[styles.safe, blue && styles.safeBlue, wine && styles.safeWine]}>
      <StatusBar style="light" />
      <View style={styles.app}>
        <View style={[styles.nav, blue && styles.navBlue, wine && styles.navWine]}>
          <Pressable onPress={() => setLabMenuOpen((open) => !open)} style={[styles.brand, labMenuOpen && styles.brandOpen]} accessibilityLabel="Switch lab simulator">
            <Text style={styles.diamond}>◆</Text>
            <View>
              <Text style={styles.brandText}>{activeLab.title}</Text>
              <Text style={[styles.brandCaret, blue && styles.brandCaretBlue]}>{labMenuOpen ? 'CLOSE ▴' : 'SWITCH ▾'}</Text>
            </View>
          </Pressable>
          {nav.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => (blue ? setBlackjackScreen(item.id as BlackjackScreen) : wine ? setBaccaratScreen(item.id as BaccaratScreen) : setCrapsScreen(item.id as CrapsScreen))}
              style={[styles.navItem, activeScreen === item.id && (blue ? styles.navItemActiveBlue : wine ? styles.navItemActiveWine : styles.navItemActive)]}
            >
              <Text style={[styles.navShort, blue && styles.navShortBlue, wine && styles.navShortWine, activeScreen === item.id && styles.navTextActive]}>{item.short}</Text>
              <Text style={[styles.navLabel, blue && styles.navLabelBlue, wine && styles.navLabelWine, activeScreen === item.id && styles.navTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
          <View style={styles.offline}><View style={styles.offlineDot} /><Text style={styles.offlineText}>OFFLINE</Text></View>
        </View>
        <View style={styles.main}>
          {green && crapsScreen === 'table' ? <GameScreen strategies={strategies} selectedStrategyId={selectedStrategyId} onSelectStrategy={setSelectedStrategyId} settings={settings} onChangeSettings={changeSettings} /> : null}
          {green && crapsScreen === 'strategies' ? <StrategyScreen strategies={strategies} onChange={changeStrategies} onSelect={setSelectedStrategyId} selectedId={selectedStrategyId} /> : null}
          {green && crapsScreen === 'lab' ? <LabScreen strategies={strategies} recentRuns={recentRuns} onSaveRun={persistRun} settings={settings} /> : null}
          {green && crapsScreen === 'rules' ? <RulesScreen /> : null}
          {green && crapsScreen === 'settings' ? <SettingsScreen settings={settings} onSave={changeSettings} /> : null}
          {blue && blackjackScreen === 'bj-table' ? <BlackjackGameScreen settings={blackjackSettings} onChangeSettings={changeBlackjackSettings} /> : null}
          {blue && blackjackScreen === 'bj-chart' ? <BlackjackChartScreen settings={blackjackSettings} /> : null}
          {blue && blackjackScreen === 'bj-settings' ? <BlackjackSettingsScreen settings={blackjackSettings} onSave={changeBlackjackSettings} /> : null}
          {wine && baccaratScreen === 'bac-table' ? <BaccaratGameScreen settings={baccaratSettings} onChangeSettings={changeBaccaratSettings} /> : null}
          {wine && baccaratScreen === 'bac-settings' ? <BaccaratSettingsScreen settings={baccaratSettings} onSave={changeBaccaratSettings} /> : null}
        </View>
        {labMenuOpen ? (
          <>
            <Pressable style={styles.menuBackdrop} onPress={() => setLabMenuOpen(false)} accessibilityLabel="Close lab menu" />
            <View style={styles.labMenu}>
              <Text style={styles.labMenuTitle}>LAB SIMULATORS</Text>
              {LABS.map((item) => (
                <Pressable key={item.id} onPress={() => switchLab(item.id)} style={[styles.labOption, item.id === 'blackjack' ? styles.labOptionBlue : item.id === 'baccarat' ? styles.labOptionWine : styles.labOptionGreen, lab === item.id && styles.labOptionActive]}>
                  <Text style={styles.labOptionTitle}>{item.title.replace('\n', '')}</Text>
                  <Text style={styles.labOptionSubtitle}>{item.subtitle}</Text>
                  {lab === item.id ? <Text style={styles.labOptionCurrent}>ACTIVE</Text> : null}
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#07140f' },
  safeBlue: { backgroundColor: '#070c17' },
  safeWine: { backgroundColor: '#160a0d' },
  app: { flex: 1, flexDirection: 'row' },
  nav: { width: 82, backgroundColor: '#07140f', borderRightWidth: 1, borderRightColor: '#29483d', paddingVertical: 9, alignItems: 'stretch' },
  navBlue: { backgroundColor: '#070c17', borderRightColor: '#2b3a56' },
  navWine: { backgroundColor: '#160a0d', borderRightColor: '#4a222c' },
  brand: { height: 62, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, borderRadius: 9, marginHorizontal: 5 },
  brandOpen: { backgroundColor: 'rgba(213,174,83,0.12)' },
  diamond: { color: colors.gold, fontSize: 19 },
  brandText: { color: colors.ink, fontSize: 10, fontWeight: '900', lineHeight: 10, letterSpacing: 1 },
  brandCaret: { color: '#6f9284', fontSize: 7, fontWeight: '900', letterSpacing: 0.8, marginTop: 3 },
  brandCaretBlue: { color: '#7286a5' },
  navItem: { marginHorizontal: 7, marginVertical: 3, minHeight: 57, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  navItemActive: { backgroundColor: colors.panelLight, borderColor: '#426959' },
  navItemActiveBlue: { backgroundColor: bjColors.panelLight, borderColor: '#42598a' },
  navItemActiveWine: { backgroundColor: bacColors.panelLight, borderColor: '#7c3345' },
  navShort: { color: '#6f9284', fontWeight: '900', fontSize: 9, letterSpacing: 1 },
  navShortBlue: { color: '#7286a5' },
  navShortWine: { color: '#a5727e' },
  navLabel: { color: '#819f94', fontSize: 9, marginTop: 3 },
  navLabelBlue: { color: '#8496b3' },
  navLabelWine: { color: '#b38490' },
  navTextActive: { color: colors.gold },
  offline: { marginTop: 'auto', alignItems: 'center', gap: 4 },
  offlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  offlineText: { color: '#6f9284', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  main: { flex: 1 },
  menuBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 40 },
  labMenu: { position: 'absolute', top: 12, left: 90, width: 250, borderRadius: 14, padding: 12, gap: 8, backgroundColor: '#0c1310', borderWidth: 1, borderColor: colors.gold, shadowColor: '#000', shadowOpacity: 0.7, shadowRadius: 16, zIndex: 50 },
  labMenuTitle: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.6 },
  labOption: { borderRadius: 10, padding: 12, gap: 2, borderWidth: 1 },
  labOptionGreen: { backgroundColor: '#0a2b21', borderColor: '#2c5a4a' },
  labOptionBlue: { backgroundColor: '#0c2547', borderColor: '#38598e' },
  labOptionWine: { backgroundColor: '#43101c', borderColor: '#8a4152' },
  labOptionActive: { borderColor: colors.gold },
  labOptionTitle: { color: '#eee9dc', fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  labOptionSubtitle: { color: 'rgba(238,233,220,0.6)', fontSize: 10 },
  labOptionCurrent: { color: colors.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1.4, marginTop: 3 },
  loading: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: colors.muted, fontWeight: '700' },
});

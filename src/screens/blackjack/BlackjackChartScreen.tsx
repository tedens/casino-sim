import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { cellKey, ChartSectionId } from '../../blackjack/chart';
import { DEFAULT_BLACKJACK_RULES } from '../../blackjack/engine';
import { BlackjackSettings } from '../../blackjack/storage';
import { CHART_LEGEND, CHART_UP_LABELS, ChartCode, strategyChart } from '../../blackjack/strategy';
import { StrategyOverrides, loadStrategyOverrides, saveStrategyOverrides } from '../../blackjack/strategyOverrides';
import { bjColors } from '../../blackjack/theme';
import { Button, SectionTitle } from '../../ui/components';

const CODE_COLORS: Record<ChartCode, { background: string; text: string }> = {
  H: { background: '#1c3d63', text: '#cfe0f5' },
  S: { background: '#7c5d1c', text: '#fbe8bb' },
  D: { background: '#1d6141', text: '#c9f2dc' },
  Ds: { background: '#2a7a54', text: '#d9f7e8' },
  P: { background: '#5c2f7a', text: '#ecd9fa' },
  Rh: { background: '#7a2c33', text: '#fadadb' },
  Rs: { background: '#7a2c33', text: '#fadadb' },
  Rp: { background: '#7a2c33', text: '#fadadb' },
};

// codes offered when cycling a cell, per section (splits only make sense on pairs)
const CYCLE: Record<ChartSectionId, ChartCode[]> = {
  hard: ['H', 'S', 'D', 'Ds', 'Rh', 'Rs'],
  soft: ['H', 'S', 'D', 'Ds'],
  pair: ['P', 'H', 'S', 'D', 'Ds', 'Rp'],
};

export function BlackjackChartScreen({ settings }: { settings: BlackjackSettings }) {
  const [overrides, setOverrides] = useState<StrategyOverrides>({});
  const [editing, setEditing] = useState(false);

  useEffect(() => { loadStrategyOverrides().then(setOverrides).catch(() => undefined); }, []);

  const rules = useMemo(() => ({
    ...DEFAULT_BLACKJACK_RULES,
    decks: settings.decks,
    dealerHitsSoft17: settings.dealerHitsSoft17,
    blackjackPayout: settings.blackjackPayout,
    surrenderAllowed: settings.surrenderAllowed,
    doubleAfterSplit: settings.doubleAfterSplit,
  }), [settings]);

  // effective chart (with overrides) and the pure book, so overridden cells can be flagged
  const sections = useMemo(() => strategyChart(rules, overrides), [rules, overrides]);
  const bookSections = useMemo(() => strategyChart(rules, {}), [rules]);
  const overrideCount = Object.keys(overrides).length;

  const persist = (next: StrategyOverrides) => {
    setOverrides(next);
    saveStrategyOverrides(next).catch(() => undefined);
  };

  const cycleCell = (section: ChartSectionId, label: string, upLabel: string, current: ChartCode, book: ChartCode) => {
    const options = CYCLE[section];
    const from = options.indexOf(current);
    const nextCode = options[(from + 1) % options.length];
    const key = cellKey(section, label, upLabel);
    const next = { ...overrides };
    if (nextCode === book) delete next[key];
    else next[key] = nextCode;
    persist(next);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Strategy card</Text>
        <View style={styles.headerButtons}>
          <Button label={editing ? '✓ EDITING' : 'EDIT CARD'} variant={editing ? 'primary' : 'ghost'} onPress={() => setEditing((value) => !value)} style={!editing && styles.blueGhost} />
          {overrideCount > 0 ? <Button label={`RESET (${overrideCount})`} variant="danger" onPress={() => persist({})} /> : null}
        </View>
      </View>
      <Text style={styles.lead}>
        Book plays for the current table rules: {settings.decks} decks, dealer {settings.dealerHitsSoft17 ? 'hits' : 'stands on'} soft 17,
        {settings.surrenderAllowed ? ' late surrender,' : ' no surrender,'} double after split {settings.doubleAfterSplit ? 'allowed' : 'not allowed'}.
        {editing ? ' Tap any cell to cycle its play — edits are gold-ringed and drive the on-table hints and the bots. Change rules in Settings to re-derive the book underneath.' : ' Tap Edit card to override any cell; your edits drive the hints and bot play. Gold-ringed cells differ from the book.'}
      </Text>
      <View style={styles.legend}>
        {(Object.keys(CHART_LEGEND) as ChartCode[]).map((code) => (
          <View key={code} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: CODE_COLORS[code].background }]}><Text style={[styles.cellText, { color: CODE_COLORS[code].text }]}>{code}</Text></View>
            <Text style={styles.legendText}>{CHART_LEGEND[code]}</Text>
          </View>
        ))}
      </View>
      {sections.map((section, s) => (
        <View key={section.section} style={styles.card}>
          <SectionTitle>{section.title}</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={styles.row}>
                <View style={styles.labelCell}><Text style={styles.headText}>vs</Text></View>
                {CHART_UP_LABELS.map((up) => <View key={up} style={styles.cell}><Text style={styles.headText}>{up}</Text></View>)}
              </View>
              {section.rows.map((chartRow, r) => (
                <View key={chartRow.label} style={styles.row}>
                  <View style={styles.labelCell}><Text style={styles.rowLabel}>{chartRow.label}</Text></View>
                  {chartRow.cells.map((code, index) => {
                    const book = bookSections[s].rows[r].cells[index];
                    const changed = code !== book;
                    const upLabel = CHART_UP_LABELS[index];
                    const content = (
                      <>
                        <Text style={[styles.cellText, { color: CODE_COLORS[code].text }]}>{code}</Text>
                        {changed ? <View style={styles.overrideDot} /> : null}
                      </>
                    );
                    const cellStyle = [styles.cell, { backgroundColor: CODE_COLORS[code].background }, changed && styles.overrideCell];
                    return editing
                      ? <Pressable key={index} onPress={() => cycleCell(section.section, chartRow.label, upLabel, code, book)} style={({ pressed }) => [cellStyle, pressed && styles.pressedCell]}>{content}</Pressable>
                      : <View key={index} style={cellStyle}>{content}</View>;
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      ))}
      <Text style={styles.note}>Multi-deck basic strategy with dealer peek. Overrides are saved on this device and apply to the hints, the strategy the bots follow, and a fresh look each time you open this card. Never take insurance or even money.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: bjColors.background },
  content: { padding: 28, gap: 16, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  headerButtons: { flexDirection: 'row', gap: 8 },
  title: { color: bjColors.ink, fontWeight: '900', fontSize: 29 },
  lead: { color: bjColors.muted, fontSize: 14, lineHeight: 21 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 30, height: 24, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  legendText: { color: bjColors.muted, fontSize: 12 },
  blueGhost: { borderColor: '#3d5c8a' },
  card: { backgroundColor: bjColors.panel, borderWidth: 1, borderColor: bjColors.border, borderRadius: 12, padding: 17, gap: 11 },
  row: { flexDirection: 'row' },
  labelCell: { width: 62, height: 34, alignItems: 'center', justifyContent: 'center' },
  cell: { width: 44, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(5,8,16,0.7)' },
  overrideCell: { borderWidth: 2, borderColor: bjColors.gold },
  pressedCell: { opacity: 0.7 },
  overrideDot: { position: 'absolute', top: 2, right: 2, width: 4, height: 4, borderRadius: 2, backgroundColor: bjColors.gold },
  headText: { color: bjColors.gold, fontWeight: '900', fontSize: 12 },
  rowLabel: { color: bjColors.ink, fontWeight: '800', fontSize: 12 },
  cellText: { fontWeight: '900', fontSize: 12 },
  note: { color: bjColors.muted, fontSize: 12 },
});

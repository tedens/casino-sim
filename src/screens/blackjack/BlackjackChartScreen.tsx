import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { DEFAULT_BLACKJACK_RULES } from '../../blackjack/engine';
import { BlackjackSettings } from '../../blackjack/storage';
import { CHART_LEGEND, CHART_UP_LABELS, ChartCode, strategyChart } from '../../blackjack/strategy';
import { bjColors } from '../../blackjack/theme';
import { SectionTitle } from '../../ui/components';

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

export function BlackjackChartScreen({ settings }: { settings: BlackjackSettings }) {
  const sections = useMemo(() => strategyChart({
    ...DEFAULT_BLACKJACK_RULES,
    decks: settings.decks,
    dealerHitsSoft17: settings.dealerHitsSoft17,
    blackjackPayout: settings.blackjackPayout,
    surrenderAllowed: settings.surrenderAllowed,
    doubleAfterSplit: settings.doubleAfterSplit,
  }), [settings]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Basic strategy chart</Text>
      <Text style={styles.lead}>
        Book plays for the current table rules: {settings.decks} decks, dealer {settings.dealerHitsSoft17 ? 'hits' : 'stands on'} soft 17,
        {settings.surrenderAllowed ? ' late surrender,' : ' no surrender,'} double after split {settings.doubleAfterSplit ? 'allowed' : 'not allowed'}.
        Change rules in Settings and this chart — and the on-table hints — update to match.
      </Text>
      <View style={styles.legend}>
        {(Object.keys(CHART_LEGEND) as ChartCode[]).map((code) => (
          <View key={code} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: CODE_COLORS[code].background }]}><Text style={[styles.cellText, { color: CODE_COLORS[code].text }]}>{code}</Text></View>
            <Text style={styles.legendText}>{CHART_LEGEND[code]}</Text>
          </View>
        ))}
      </View>
      {sections.map((section) => (
        <View key={section.title} style={styles.card}>
          <SectionTitle>{section.title}</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={styles.row}>
                <View style={styles.labelCell}><Text style={styles.headText}>vs</Text></View>
                {CHART_UP_LABELS.map((up) => <View key={up} style={styles.cell}><Text style={styles.headText}>{up}</Text></View>)}
              </View>
              {section.rows.map((chartRow) => (
                <View key={chartRow.label} style={styles.row}>
                  <View style={styles.labelCell}><Text style={styles.rowLabel}>{chartRow.label}</Text></View>
                  {chartRow.cells.map((code, index) => (
                    <View key={index} style={[styles.cell, { backgroundColor: CODE_COLORS[code].background }]}>
                      <Text style={[styles.cellText, { color: CODE_COLORS[code].text }]}>{code}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      ))}
      <Text style={styles.note}>Multi-deck basic strategy with dealer peek. Never take insurance or even money.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: bjColors.background },
  content: { padding: 28, gap: 16, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  title: { color: bjColors.ink, fontWeight: '900', fontSize: 29 },
  lead: { color: bjColors.muted, fontSize: 14, lineHeight: 21 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 30, height: 24, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  legendText: { color: bjColors.muted, fontSize: 12 },
  card: { backgroundColor: bjColors.panel, borderWidth: 1, borderColor: bjColors.border, borderRadius: 12, padding: 17, gap: 11 },
  row: { flexDirection: 'row' },
  labelCell: { width: 62, height: 34, alignItems: 'center', justifyContent: 'center' },
  cell: { width: 44, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(5,8,16,0.7)' },
  headText: { color: bjColors.gold, fontWeight: '900', fontSize: 12 },
  rowLabel: { color: bjColors.ink, fontWeight: '800', fontSize: 12 },
  cellText: { fontWeight: '900', fontSize: 12 },
  note: { color: bjColors.muted, fontSize: 12 },
});

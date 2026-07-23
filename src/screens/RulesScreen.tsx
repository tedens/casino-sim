import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SectionTitle, Button } from '../ui/components';
import { colors } from '../ui/theme';

const PAYOUTS = [
  ['Pass / Come', '1:1'], ['Don’t Pass / Don’t Come', '1:1; bar 12'],
  ['Odds 4/10', '2:1'], ['Odds 5/9', '3:2'], ['Odds 6/8', '6:5'],
  ['Place 4/10', '9:5'], ['Place 5/9', '7:5'], ['Place 6/8', '7:6'],
  ['Field', '3/4/9/10/11 even; 2 pays 2:1; 12 pays 3:1'],
  ['Hard 4/10', '7:1'], ['Hard 6/8', '9:1'], ['Any 7', '4:1'], ['Any Craps', '7:1'],
  ['2 or 12 / hard hops', '30:1'], ['3 or 11 / easy hops', '15:1'],
  ['Buy / Lay', 'True odds less 5% commission on wins'],
];

export function RulesScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Bellagio-style craps rules</Text>
      <Text style={styles.lead}>Standard casino craps with 3–4–5× Pass/Come odds, up to 6× lay odds, and triple 12 in the field.</Text>
      <View style={styles.columns}>
        <View style={styles.card}>
          <SectionTitle>Round flow</SectionTitle>
          <Text style={styles.body}>Come-out 7 or 11 wins Pass. 2, 3, or 12 loses Pass. Don’t Pass wins 2 or 3, pushes 12, and loses 7 or 11.</Text>
          <Text style={styles.body}>A 4, 5, 6, 8, 9, or 10 establishes the point. Pass wins if point repeats before 7. Don’t Pass wins when 7 arrives first.</Text>
          <Text style={styles.body}>Come and Don’t Come follow the same sequence while a table point is active, then travel to their own box number.</Text>
        </View>
        <View style={styles.card}>
          <SectionTitle>Working and locked bets</SectionTitle>
          <Text style={styles.body}>All betting closes from Roll until settlement finishes. Pass and Come become irrevocable contract bets after receiving a point.</Text>
          <Text style={styles.body}>Don’t contracts may be reduced or removed, never increased. Place, Buy, Hardway, and Come odds default off during a come-out roll. Use Working to override eligible bets.</Text>
          <Text style={styles.body}>One-roll propositions settle immediately. Place, Buy, Lay, Big 6/8, and Hardway wagers remain after wins until removed or defeated.</Text>
        </View>
      </View>
      <View style={styles.card}>
        <SectionTitle>Payout reference</SectionTitle>
        <View style={styles.payouts}>{PAYOUTS.map(([name, payout]) => <View key={name} style={styles.payoutRow}><Text style={styles.payoutName}>{name}</Text><Text style={styles.payout}>{payout}</Text></View>)}</View>
      </View>
      <View style={styles.card}>
        <SectionTitle>Exact payout units</SectionTitle>
        <Text style={styles.body}>Simulator rejects or snaps wagers that would create fractional chip payouts: Place 6/8 use $6 units; Place 5/9 and 4/10 use $5 units; Horn uses $4 units; C & E uses $2 units. Odds use the denominator required by true odds.</Text>
      </View>
      <View style={styles.sources}>
        <Button label="Bellagio Gaming Guide" variant="secondary" onPress={() => Linking.openURL('https://bellagio.mgmresorts.com/content/dam/MGM/bellagio/casino/bellagio-casino-gaming-guide.pdf')} />
        <Button label="MGM GameSense Craps Guide" variant="secondary" onPress={() => Linking.openURL('https://www.mgmresorts.com/en/gamesense/guide-to-craps.html')} />
      </View>
      <Text style={styles.disclaimer}>Educational simulator only. No real-money wagering, deposits, or payouts.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 28, gap: 17, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  title: { color: colors.ink, fontWeight: '900', fontSize: 29 },
  lead: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  columns: { flexDirection: 'row', gap: 14 },
  card: { flex: 1, backgroundColor: colors.panel, borderWidth: 1, borderColor: '#315247', borderRadius: 12, padding: 17, gap: 11 },
  body: { color: colors.muted, lineHeight: 21 },
  payouts: { flexDirection: 'row', flexWrap: 'wrap' },
  payoutRow: { width: '50%', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, paddingRight: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#38564c' },
  payoutName: { color: colors.ink, fontWeight: '700' },
  payout: { color: colors.gold, fontWeight: '900' },
  sources: { flexDirection: 'row', gap: 9 },
  disclaimer: { color: '#759387', fontSize: 11 },
});

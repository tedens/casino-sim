import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { WagerKind, WagerTarget } from '../domain/types';
import { exportStrategy, importStrategy } from '../storage/storage';
import { freshStrategy } from '../strategy/presets';
import { StrategyAction, StrategyCondition, StrategyDefinition, StrategyRule, StrategyTrigger } from '../strategy/types';
import { Button, Field, SectionTitle } from '../ui/components';
import { colors } from '../ui/theme';

const TRIGGERS: StrategyTrigger[] = ['sessionStart', 'comeOutStart', 'pointEstablished', 'rollSettled', 'betWon', 'betLost', 'sevenOut', 'bankrollThreshold'];
const ACTIONS: StrategyAction['type'][] = ['place', 'takeMaxOdds', 'press', 'collect', 'regress', 'remove', 'setWorking', 'stop'];
const KINDS: WagerKind[] = ['pass', 'dontPass', 'come', 'dontCome', 'place', 'buy', 'lay', 'field', 'hardway', 'horn', 'ce', 'any7', 'anyCraps'];
const EXCLUSIVE_SIDES: Array<{ label: string; value: 'none' | 'opposite' }> = [
  { label: 'None', value: 'none' },
  { label: 'No opposite side', value: 'opposite' },
];

function oppositeSide(kind: WagerKind): WagerKind | undefined {
  if (kind === 'come') return 'dontCome';
  if (kind === 'dontCome') return 'come';
  if (kind === 'pass') return 'dontPass';
  if (kind === 'dontPass') return 'pass';
  return undefined;
}

export function StrategyScreen({ strategies, onChange, onSelect, selectedId }: {
  strategies: StrategyDefinition[];
  onChange: (strategies: StrategyDefinition[]) => void;
  onSelect: (id: string) => void;
  selectedId: string;
}) {
  const [editingId, setEditingId] = useState<string>(strategies[0]?.id ?? '');
  const [trigger, setTrigger] = useState<StrategyTrigger>('rollSettled');
  const [actionType, setActionType] = useState<StrategyAction['type']>('place');
  const [kind, setKind] = useState<WagerKind>('pass');
  const [target, setTarget] = useState('');
  const [amount, setAmount] = useState('5');
  const [phase, setPhase] = useState<'any' | 'comeOut' | 'point'>('any');
  const [exclusive, setExclusive] = useState<'none' | 'opposite'>('none');
  const [json, setJson] = useState('');
  const [message, setMessage] = useState('');
  const strategy = strategies.find((item) => item.id === editingId) ?? strategies[0];

  const editable = useMemo(() => strategy && !strategy.builtIn, [strategy]);

  const create = () => {
    const next = freshStrategy(`Custom Strategy ${strategies.filter((item) => !item.builtIn).length + 1}`);
    onChange([...strategies, next]);
    setEditingId(next.id);
    onSelect(next.id);
  };

  const duplicate = () => {
    if (!strategy) return;
    const timestamp = new Date().toISOString();
    const copy: StrategyDefinition = { ...strategy, id: `strategy-${Date.now().toString(36)}`, name: `${strategy.name} Copy`, builtIn: false, createdAt: timestamp, updatedAt: timestamp, rules: strategy.rules.map((rule, index) => ({ ...rule, id: `rule-${Date.now().toString(36)}-${index}` })) };
    onChange([...strategies, copy]);
    setEditingId(copy.id);
  };

  const update = (patch: Partial<StrategyDefinition>) => {
    if (!strategy || strategy.builtIn) return;
    onChange(strategies.map((item) => item.id === strategy.id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item));
  };

  const makeAction = (): StrategyAction => {
    const parsedTarget = target ? (/^\d+$/.test(target) ? Number(target) : target) as WagerTarget : undefined;
    const selector = { kind, target: parsedTarget };
    const numeric = Math.max(1, Number(amount) || 1);
    switch (actionType) {
      case 'place': return { type: 'place', kind, amount: numeric, target: selector.target };
      case 'takeMaxOdds': return { type: 'takeMaxOdds', selector };
      case 'press': return { type: 'press', selector, useLastWin: true };
      case 'collect': return { type: 'collect', selector };
      case 'regress': return { type: 'regress', selector, amount: numeric };
      case 'remove': return { type: 'remove', selector };
      case 'setWorking': return { type: 'setWorking', selector, working: true };
      case 'stop': return { type: 'stop', reason: 'Strategy stop rule matched.' };
    }
  };

  const addRule = () => {
    if (!strategy || strategy.builtIn) return;
    const conditions: StrategyCondition[] = phase === 'any' ? [] : [{ fact: 'phase', operator: 'eq', value: phase }];
    if (exclusive === 'opposite') {
      const opposite = actionType === 'place' ? oppositeSide(kind) : undefined;
      if (opposite) conditions.push({ fact: 'betCount', operator: 'eq', value: 0, selector: { kind: opposite } });
    }
    const next: StrategyRule = {
      id: `rule-${Date.now().toString(36)}`,
      name: `${trigger}: ${actionType}`,
      enabled: true,
      priority: (strategy.rules.at(-1)?.priority ?? 0) + 10,
      trigger,
      conditions,
      actions: [makeAction()],
    };
    update({ rules: [...strategy.rules, next] });
    setMessage('Rule added. Rules run in ascending priority order.');
  };

  const applyJson = () => {
    try {
      const imported = importStrategy(json);
      onChange([...strategies, imported]);
      setEditingId(imported.id);
      setMessage('Strategy imported and assigned a new ID.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Invalid JSON.'); }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.sidebar}>
        <View style={styles.sidebarHeader}><SectionTitle>Strategies</SectionTitle><Button label="New" onPress={create} /></View>
        <ScrollView contentContainerStyle={styles.list}>
          {strategies.map((item) => (
            <View key={item.id} style={styles.strategyRow}>
              <Button label={`${item.name}${item.builtIn ? ' · PRESET' : ''}`} variant={item.id === strategy?.id ? 'primary' : 'ghost'} onPress={() => setEditingId(item.id)} style={styles.strategyName} />
              <Button label={item.id === selectedId ? 'Selected' : 'Use'} variant="secondary" onPress={() => onSelect(item.id)} />
            </View>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.editor} contentContainerStyle={styles.editorContent}>
        {!strategy ? <Text style={styles.empty}>Create a strategy to begin.</Text> : <>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}><Text style={styles.title}>{strategy.name}</Text><Text style={styles.description}>{strategy.description}</Text></View>
            <Button label="Duplicate" variant="secondary" onPress={duplicate} />
            {!strategy.builtIn ? <Button label="Delete" variant="danger" onPress={() => {
              const remaining = strategies.filter((item) => item.id !== strategy.id);
              onChange(remaining); setEditingId(remaining[0]?.id ?? '');
            }} /> : null}
          </View>

          {editable ? <View style={styles.nameFields}>
            <Field label="Name" value={strategy.name} onChangeText={(name) => update({ name })} />
            <Field label="Description" value={strategy.description} onChangeText={(description) => update({ description })} />
          </View> : <Text style={styles.presetNote}>Built-in preset is read-only. Duplicate it to customize.</Text>}

          <SectionTitle>Ordered rules</SectionTitle>
          {strategy.rules.length === 0 ? <Text style={styles.empty}>No rules yet.</Text> : [...strategy.rules].sort((a, b) => a.priority - b.priority).map((rule) => (
            <View key={rule.id} style={styles.ruleCard}>
              <View style={{ flex: 1 }}><Text style={styles.ruleName}>{rule.priority}. {rule.name}</Text><Text style={styles.ruleMeta}>{rule.trigger} · {rule.conditions.length} conditions · {rule.actions.length} actions</Text><Text style={styles.ruleCode}>{JSON.stringify(rule.actions[0])}</Text></View>
              {editable ? <Button label={rule.enabled ? 'Enabled' : 'Disabled'} variant={rule.enabled ? 'secondary' : 'ghost'} onPress={() => update({ rules: strategy.rules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item) })} /> : null}
              {editable ? <Button label="×" variant="danger" onPress={() => update({ rules: strategy.rules.filter((item) => item.id !== rule.id) })} /> : null}
            </View>
          ))}

          {editable ? <View style={styles.builder}>
            <SectionTitle>Add visual rule</SectionTitle>
            <Text style={styles.label}>Trigger</Text><ScrollView horizontal>{TRIGGERS.map((item) => <Button key={item} label={item} variant={trigger === item ? 'primary' : 'ghost'} onPress={() => setTrigger(item)} style={styles.choice} />)}</ScrollView>
            <Text style={styles.label}>Phase condition</Text><View style={styles.choices}>{(['any', 'comeOut', 'point'] as const).map((item) => <Button key={item} label={item} variant={phase === item ? 'primary' : 'ghost'} onPress={() => setPhase(item)} />)}</View>
            <Text style={styles.label}>Hedge guard</Text><View style={styles.choices}>{EXCLUSIVE_SIDES.map((item) => <Button key={item.value} label={item.label} variant={exclusive === item.value ? 'primary' : 'ghost'} onPress={() => setExclusive(item.value)} />)}</View>
            <Text style={styles.label}>Action</Text><ScrollView horizontal>{ACTIONS.map((item) => <Button key={item} label={item} variant={actionType === item ? 'primary' : 'ghost'} onPress={() => setActionType(item)} style={styles.choice} />)}</ScrollView>
            <Text style={styles.label}>Bet type</Text><ScrollView horizontal>{KINDS.map((item) => <Button key={item} label={item} variant={kind === item ? 'primary' : 'ghost'} onPress={() => setKind(item)} style={styles.choice} />)}</ScrollView>
            <View style={styles.nameFields}><Field label="Target (optional: 4, 6, 1-2…)" value={target} onChangeText={setTarget} /><Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" /></View>
            <Button label="Add rule" onPress={addRule} />
          </View> : null}

          <View style={styles.jsonPanel}>
            <SectionTitle>JSON import / export</SectionTitle>
            <Text style={styles.description}>Versioned portable format. Export loads current strategy; Import creates a copy.</Text>
            <Field label="Strategy JSON" value={json} onChangeText={setJson} multiline />
            <View style={styles.choices}><Button label="Load export" variant="secondary" onPress={() => setJson(exportStrategy(strategy))} /><Button label="Import JSON" onPress={applyJson} /></View>
          </View>
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', backgroundColor: colors.background },
  sidebar: { width: 330, borderRightWidth: 1, borderRightColor: '#315247', backgroundColor: colors.panel },
  sidebarHeader: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  list: { padding: 10, gap: 7 },
  strategyRow: { flexDirection: 'row', gap: 6 },
  strategyName: { flex: 1, alignItems: 'flex-start' },
  editor: { flex: 1 },
  editorContent: { padding: 24, gap: 16, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  titleRow: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  title: { color: colors.ink, fontWeight: '900', fontSize: 26 },
  description: { color: colors.muted, lineHeight: 19 },
  presetNote: { color: colors.gold, backgroundColor: colors.panel, padding: 12, borderRadius: 8 },
  nameFields: { flexDirection: 'row', gap: 12 },
  ruleCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.panel, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#315247' },
  ruleName: { color: colors.ink, fontWeight: '900' },
  ruleMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  ruleCode: { color: '#84bda8', fontFamily: 'monospace', fontSize: 10, marginTop: 5 },
  builder: { backgroundColor: colors.panel, borderRadius: 12, padding: 16, gap: 11 },
  label: { color: colors.muted, fontWeight: '800', fontSize: 11, marginBottom: -5 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { marginRight: 5 },
  jsonPanel: { gap: 10, marginTop: 10 },
  message: { color: colors.success, fontWeight: '700' },
  empty: { color: colors.muted, fontStyle: 'italic', padding: 14 },
});

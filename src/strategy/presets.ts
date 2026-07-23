import { StrategyDefinition, StrategyRule } from './types';

const now = '2026-07-21T00:00:00.000Z';
let ruleNumber = 0;

function rule(name: string, trigger: StrategyRule['trigger'], actions: StrategyRule['actions'], conditions: StrategyRule['conditions'] = []): StrategyRule {
  ruleNumber += 1;
  return { id: `preset-rule-${ruleNumber}`, name, enabled: true, priority: ruleNumber * 10, trigger, conditions, actions };
}

function preset(id: string, name: string, description: string, rules: StrategyRule[]): StrategyDefinition {
  return { schemaVersion: 1, id, name, description, rulesetId: 'bellagio-standard-345', builtIn: true, rules, createdAt: now, updatedAt: now };
}

export const BUILT_IN_STRATEGIES: StrategyDefinition[] = [
  preset('pass-max-odds', 'Pass + Max Odds', 'Minimum Pass Line with maximum 3-4-5× odds.', [
    rule('Open Pass Line', 'sessionStart', [{ type: 'place', kind: 'pass', amount: 5 }]),
    rule('Replace Pass Line', 'comeOutStart', [{ type: 'place', kind: 'pass', amount: 5 }], [{ fact: 'hasBet', operator: 'eq', value: false, selector: { kind: 'pass' } }]),
    rule('Take Pass Odds', 'pointEstablished', [{ type: 'takeMaxOdds', selector: { kind: 'pass' } }]),
  ]),
  preset('three-point-molly', '3-Point Molly', 'Pass plus up to two Come bets, all with maximum odds.', [
    rule('Molly Pass', 'sessionStart', [{ type: 'place', kind: 'pass', amount: 5 }]),
    rule('Molly New Pass', 'comeOutStart', [{ type: 'place', kind: 'pass', amount: 5 }], [{ fact: 'hasBet', operator: 'eq', value: false, selector: { kind: 'pass' } }]),
    rule('Molly Pass Odds', 'pointEstablished', [{ type: 'takeMaxOdds', selector: { kind: 'pass' } }]),
    rule('Molly Come', 'rollSettled', [{ type: 'place', kind: 'come', amount: 5 }], [
      { fact: 'phase', operator: 'eq', value: 'point' },
      { fact: 'betCount', operator: 'lt', value: 2, selector: { kind: 'come' } },
    ]),
    rule('Molly Come Odds', 'rollSettled', [{ type: 'takeMaxOdds', selector: { kind: 'come' } }], [
      { fact: 'hasBet', operator: 'eq', value: true, selector: { kind: 'come' } },
    ]),
  ]),
  preset('iron-cross', 'Iron Cross', 'Field plus Place 5, 6, and 8 while point is on.', [
    rule('Iron Field', 'pointEstablished', [{ type: 'place', kind: 'field', amount: 5 }]),
    rule('Iron Numbers', 'pointEstablished', [
      { type: 'place', kind: 'place', target: 5, amount: 5 },
      { type: 'place', kind: 'place', target: 6, amount: 6 },
      { type: 'place', kind: 'place', target: 8, amount: 6 },
    ]),
    rule('Replace Field', 'rollSettled', [{ type: 'place', kind: 'field', amount: 5 }], [
      { fact: 'phase', operator: 'eq', value: 'point' },
      { fact: 'hasBet', operator: 'eq', value: false, selector: { kind: 'field' } },
    ]),
  ]),
  preset('six-eight-press', '6/8 Press–Collect', 'Place 6 and 8; press each first hit, collect next.', [
    rule('Place 6 and 8', 'pointEstablished', [
      { type: 'place', kind: 'place', target: 6, amount: 12 },
      { type: 'place', kind: 'place', target: 8, amount: 12 },
    ]),
    rule('Press 6', 'betWon', [{ type: 'press', selector: { kind: 'place', target: 6 }, useLastWin: true }], [
      { fact: 'betHits', operator: 'eq', value: 1, selector: { kind: 'place', target: 6 } },
    ]),
    rule('Press 8', 'betWon', [{ type: 'press', selector: { kind: 'place', target: 8 }, useLastWin: true }], [
      { fact: 'betHits', operator: 'eq', value: 1, selector: { kind: 'place', target: 8 } },
    ]),
  ]),
  preset('dont-pass-max-odds', 'Don’t Pass + Max Odds', 'Minimum Don’t Pass with maximum lay odds.', [
    rule('Open Don’t Pass', 'sessionStart', [{ type: 'place', kind: 'dontPass', amount: 5 }]),
    rule('Replace Don’t Pass', 'comeOutStart', [{ type: 'place', kind: 'dontPass', amount: 5 }], [{ fact: 'hasBet', operator: 'eq', value: false, selector: { kind: 'dontPass' } }]),
    rule('Lay Maximum Odds', 'pointEstablished', [{ type: 'takeMaxOdds', selector: { kind: 'dontPass' } }]),
  ]),
];

export function freshStrategy(name = 'Custom Strategy'): StrategyDefinition {
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: `strategy-${Date.now().toString(36)}`,
    name,
    description: 'Custom visual rules strategy.',
    rulesetId: 'bellagio-standard-345',
    rules: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

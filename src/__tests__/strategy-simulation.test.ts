import { runSimulation } from '../simulation/runner';
import { importStrategy, exportStrategy } from '../storage/storage';
import { BUILT_IN_STRATEGIES, freshStrategy } from '../strategy/presets';
import { createGameState, placeWager, settleRoll } from '../domain/engine';
import { BELLAGIO_RULESET } from '../domain/ruleset';
import { evaluateStrategy } from '../strategy/engine';
import { StrategyDefinition } from '../strategy/types';

describe('strategy and batch simulation', () => {
  test('strategy JSON round-trips through schema validation', () => {
    const strategy = freshStrategy('Round trip');
    const imported = importStrategy(exportStrategy(strategy));
    expect(imported.schemaVersion).toBe(1);
    expect(imported.name).toBe('Round trip');
    expect(imported.id).not.toBe(strategy.id);
  });

  test('same seed yields identical reports', () => {
    const config = {
      strategy: BUILT_IN_STRATEGIES[0],
      sessions: 25,
      maxRollsPerSession: 100,
      startingBankroll: 5000,
      tableMinimum: 5,
      tableMaximum: 5000,
      seed: 'comparison-seed',
    };
    const first = runSimulation(config);
    const second = runSimulation(config);
    expect(second.sessions).toEqual(first.sessions);
    expect(second.metrics).toEqual(first.metrics);
  });

  test('batch runner reports core risk and return metrics', () => {
    const result = runSimulation({
      strategy: BUILT_IN_STRATEGIES[4],
      sessions: 20,
      maxRollsPerSession: 50,
      startingBankroll: 500,
      tableMinimum: 5,
      tableMaximum: 5000,
      lossLimit: 200,
      seed: 'metrics-seed',
    });
    expect(result.sessions).toHaveLength(20);
    expect(result.metrics.totalRolls).toBeGreaterThan(0);
    expect(Number.isFinite(result.metrics.roi)).toBe(true);
    expect(result.metrics.confidence95).toHaveLength(2);
  });

  test('built-in presets adapt to table minimum and payout units', () => {
    const ruleset = { ...BELLAGIO_RULESET, tableMinimum: 15, tableMaximum: 5000 };
    const pointState = settleRoll(createGameState({ ruleset }), 2, 3).state;
    const ironCross = BUILT_IN_STRATEGIES.find((strategy) => strategy.id === 'iron-cross')!;
    const amounts = evaluateStrategy(ironCross, pointState, { trigger: 'pointEstablished' })
      .filter((proposal) => proposal.action.type === 'place')
      .map((proposal) => proposal.action.type === 'place' ? [proposal.action.kind, proposal.action.target, proposal.action.amount] : []);
    expect(amounts).toEqual([
      ['field', undefined, 15],
      ['place', 5, 15],
      ['place', 6, 18],
      ['place', 8, 18],
    ]);

    const pass = BUILT_IN_STRATEGIES.find((strategy) => strategy.id === 'pass-max-odds')!;
    const passProposal = evaluateStrategy(pass, createGameState({ ruleset: { ...ruleset, tableMinimum: 25 } }), { trigger: 'sessionStart' })[0];
    expect(passProposal.action.type === 'place' ? passProposal.action.amount : 0).toBe(25);

    const tenDollarPoint = settleRoll(createGameState({ ruleset: { ...ruleset, tableMinimum: 10 } }), 2, 3).state;
    const press68 = BUILT_IN_STRATEGIES.find((strategy) => strategy.id === 'six-eight-press')!;
    const pressAmounts = evaluateStrategy(press68, tenDollarPoint, { trigger: 'pointEstablished' })
      .flatMap((proposal) => proposal.action.type === 'place' ? [proposal.action.amount] : []);
    expect(pressAmounts).toEqual([12, 12]);
  });

  test('notExists conditions can keep Come and Don’t Come from overlapping', () => {
    const strategy: StrategyDefinition = {
      schemaVersion: 1,
      id: 'hedge-guard',
      name: 'Hedge Guard',
      description: 'Keeps opposite-side bets from stacking.',
      rulesetId: 'bellagio-standard-345',
      rules: [{
        id: 'rule-1',
        name: 'Come only when no Don’t Come exists',
        enabled: true,
        priority: 10,
        trigger: 'rollSettled',
        conditions: [
          { fact: 'phase', operator: 'eq', value: 'point' },
          { fact: 'betCount', operator: 'eq', value: 0, selector: { kind: 'dontCome' } },
        ],
        actions: [{ type: 'place', kind: 'come', amount: 5 }],
      }],
      createdAt: '2026-07-22T00:00:00.000Z',
      updatedAt: '2026-07-22T00:00:00.000Z',
    };

    const state = { ...createGameState(), phase: 'point' as const, point: 5 as const };
    const proposals = evaluateStrategy(strategy, state, { trigger: 'rollSettled' });
    expect(proposals.some((proposal) => proposal.valid)).toBe(true);
    const darkState = placeWager(state, { kind: 'dontCome', amount: 5 }).state;
    const blocked = evaluateStrategy(strategy, darkState, { trigger: 'rollSettled' });
    expect(blocked.some((proposal) => proposal.valid)).toBe(false);
  });
});

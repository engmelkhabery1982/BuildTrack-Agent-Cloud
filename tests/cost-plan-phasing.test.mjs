import test from 'node:test';
import assert from 'node:assert/strict';

const { generateCostPlanPeriods } = await import('../src/utils/costPlanPhasing.ts');

test('monthly cost plan uses true calendar boundaries and reconciles exactly', () => {
  const periods = generateCostPlanPeriods({
    deliveryCostBac: 100,
    startDate: '2026-01-15',
    endDate: '2026-03-10',
    frequency: 'monthly',
    curveType: 'Linear',
    dataDate: '2026-02-28',
    versionId: 'cp-1',
  });
  assert.deepEqual(periods.map(({ period_start, period_end }) => [period_start, period_end]), [
    ['2026-01-15', '2026-01-31'],
    ['2026-02-01', '2026-02-28'],
    ['2026-03-01', '2026-03-10'],
  ]);
  assert.deepEqual(periods.map(period => period.is_closed_period), [true, true, false]);
  assert.equal(periods.reduce((sum, period) => sum + period.planned_cost, 0), 100);
  assert.equal(periods.at(-1).cumulative_cost, 100);
});

test('weekly and quarterly cost plans are contiguous without date drift', () => {
  const weekly = generateCostPlanPeriods({
    deliveryCostBac: 30, startDate: '2026-01-29', endDate: '2026-02-12',
    frequency: 'weekly', curveType: 'Linear', dataDate: '2026-01-31', versionId: 'w',
  });
  assert.deepEqual(weekly.map(period => [period.period_start, period.period_end]), [
    ['2026-01-29', '2026-02-04'], ['2026-02-05', '2026-02-11'], ['2026-02-12', '2026-02-12'],
  ]);

  const quarterly = generateCostPlanPeriods({
    deliveryCostBac: 20, startDate: '2026-02-15', endDate: '2026-07-10',
    frequency: 'quarterly', curveType: 'Linear', dataDate: '2026-03-31', versionId: 'q',
  });
  assert.deepEqual(quarterly.map(period => [period.period_start, period.period_end]), [
    ['2026-02-15', '2026-03-31'], ['2026-04-01', '2026-06-30'], ['2026-07-01', '2026-07-10'],
  ]);
});

test('manual cost plan rejects a period-count mismatch instead of shifting values', () => {
  assert.throws(() => generateCostPlanPeriods({
    deliveryCostBac: 100, startDate: '2026-01-01', endDate: '2026-03-31',
    periodsCount: 2, frequency: 'monthly', curveType: 'Manual', manualPeriodCosts: [50, 50],
    dataDate: '2026-01-31', versionId: 'bad',
  }), /does not match monthly calendar periods/);
});

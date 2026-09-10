import { test } from "node:test";
import assert from "node:assert";
import {
  applyCashAssumptionsToPeriods,
  getCashFlowStatus,
  compareCashForecastVersions,
  DEFAULT_CASH_ASSUMPTIONS,
} from "../src/utils/cashFlowForecast.ts";

test("F5 Versioned Cash Forecast - applies payment lag and advance recovery to inflows/outflows", () => {
  const rawPeriods = [
    { period: "2026-01", grossInflow: 100000, grossOutflow: 60000 },
    { period: "2026-02", grossInflow: 120000, grossOutflow: 70000 },
    { period: "2026-03", grossInflow: 150000, grossOutflow: 80000 },
  ];

  // 60-day client payment lag shifts inflows by 2 period slots
  // 30-day sub payment lag shifts outflows by 1 period slot
  const assumptions = {
    ...DEFAULT_CASH_ASSUMPTIONS,
    clientPaymentLagDays: 60,
    subcontractorPaymentLagDays: 30,
    advanceRecoveryRatePercent: 10, // Inflows reduced by 10% advance recovery
  };

  const calculated = applyCashAssumptionsToPeriods(rawPeriods, assumptions);

  assert.strictEqual(calculated.length, 3);
  // Period 1 (Jan): Inflow = 0 (due to 60-day lag), Outflow = 0 (due to 30-day lag shift)
  assert.strictEqual(calculated[0].plannedInflow, 0);
  assert.strictEqual(calculated[0].plannedOutflow, 0);

  // Period 2 (Feb): Inflow = 0, Outflow = 60000 (from Jan)
  assert.strictEqual(calculated[1].plannedInflow, 0);
  assert.strictEqual(calculated[1].plannedOutflow, 60000);

  // Period 3 (Mar): Inflows from Jan, Feb, Mar accumulate in the final period slot when clamped: 90k + 108k + 135k = 333,000
  assert.strictEqual(calculated[2].plannedInflow, 333000);
});

test("F5 Versioned Cash Forecast - calculates Peak Working Capital Deficit and version comparison delta", () => {
  const basePeriods = [
    { period: "2026-01", plannedInflow: 10000, actualInflow: 10000, plannedOutflow: 30000, actualOutflow: 30000 },
    { period: "2026-02", plannedInflow: 40000, actualInflow: 40000, plannedOutflow: 20000, actualOutflow: 20000 },
  ];

  const scenarioPeriods = [
    { period: "2026-01", plannedInflow: 5000, actualInflow: 5000, plannedOutflow: 35000, actualOutflow: 35000 },
    { period: "2026-02", plannedInflow: 40000, actualInflow: 40000, plannedOutflow: 20000, actualOutflow: 20000 },
  ];

  const statusBase = getCashFlowStatus([
    { period: "2026-01", plannedInflow: 10000, actualInflow: 10000, plannedOutflow: 30000, actualOutflow: 30000, netPlanned: -20000, netActual: -20000, cumulativeCash: -20000 },
    { period: "2026-02", plannedInflow: 40000, actualInflow: 40000, plannedOutflow: 20000, actualOutflow: 20000, netPlanned: 20000, netActual: 20000, cumulativeCash: 0 },
  ]);

  const statusScenario = getCashFlowStatus([
    { period: "2026-01", plannedInflow: 5000, actualInflow: 5000, plannedOutflow: 35000, actualOutflow: 35000, netPlanned: -30000, netActual: -30000, cumulativeCash: -30000 },
    { period: "2026-02", plannedInflow: 40000, actualInflow: 40000, plannedOutflow: 20000, actualOutflow: 20000, netPlanned: 20000, netActual: 20000, cumulativeCash: -10000 },
  ]);

  assert.strictEqual(statusBase.peakWorkingCapitalDeficit, 20000);
  assert.strictEqual(statusScenario.peakWorkingCapitalDeficit, 30000);

  const comparison = compareCashForecastVersions(
    [
      { period: "2026-01", plannedInflow: 10000, actualInflow: 10000, plannedOutflow: 30000, actualOutflow: 30000, netPlanned: -20000, netActual: -20000, cumulativeCash: -20000 },
      { period: "2026-02", plannedInflow: 40000, actualInflow: 40000, plannedOutflow: 20000, actualOutflow: 20000, netPlanned: 20000, netActual: 20000, cumulativeCash: 0 },
    ],
    [
      { period: "2026-01", plannedInflow: 5000, actualInflow: 5000, plannedOutflow: 35000, actualOutflow: 35000, netPlanned: -30000, netActual: -30000, cumulativeCash: -30000 },
      { period: "2026-02", plannedInflow: 40000, actualInflow: 40000, plannedOutflow: 20000, actualOutflow: 20000, netPlanned: 20000, netActual: 20000, cumulativeCash: -10000 },
    ]
  );

  assert.strictEqual(comparison.workingCapitalImpact, 10000); // 30000 - 20000 = 10000 deficit increase
  assert.strictEqual(comparison.finalCashDifference, -10000);
});

test('W05 approved partials keep actual and remaining forecast separated', async () => {
  const { buildVersionedCashForecast } = await import('../src/utils/cashForecast.ts');
  const rows = buildVersionedCashForecast([
    { sourceId: 'pc1', sourceKind: 'ApprovedCertificate', date: '2026-01-10', amount: 1000, direction: 'Inflow', status: 'Partially Paid', paidAmount: 400 },
    { sourceId: 'ap1', sourceKind: 'PostedAP', date: '2026-01-15', amount: 300, direction: 'Outflow', status: 'Paid', paidAmount: 300 },
    { sourceId: 'draft', sourceKind: 'ApprovedCertificate', date: '2026-01-20', amount: 50, direction: 'Inflow', status: 'Committed', paidAmount: 0 },
  ], '2026-01-31');
  assert.equal(rows[0].actualInflow, 400); assert.equal(rows[0].forecastInflow, 600); assert.equal(rows[0].actualOutflow, 300); assert.equal(rows[0].forecastOutflow, 0); assert.deepEqual(rows[0].sourceIds, ['pc1', 'ap1']);
});

test('W05 version requires Data Date and immutable maker-checker approval', async () => {
  const { createCashForecastVersion, approveCashForecastVersion, buildVersionedCashForecast } = await import('../src/utils/cashForecast.ts');
  assert.throws(() => buildVersionedCashForecast([], ''), /Data Date/);
  const draft = createCashForecastVersion({ versionId: 'v1', scenario: 'Base', dataDate: '2026-01-31', assumptions: {}, buckets: [{ period: '2026-02', actualInflow: 0, actualOutflow: 0, forecastInflow: 1, forecastOutflow: 0, closingCash: 1, sourceIds: ['pc1'], actualSourceIds: [], forecastSourceIds: ['pc1'] }] });
  assert.throws(() => approveCashForecastVersion(draft, ''), /identified actor/); assert.equal(approveCashForecastVersion(draft, 'finance').status, 'Approved');
});

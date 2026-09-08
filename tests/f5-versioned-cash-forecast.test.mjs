import { test } from "node:test";
import assert from "node:assert";
import {
  generateGovernedCashForecastMatrix,
  compareCashForecastVersions,
  validateCashForecastAssumptions,
  DEFAULT_CASH_ASSUMPTIONS,
  shiftDateByDays,
  getMonthPeriod,
} from "../src/utils/cashFlowForecast.ts";

test("F5 - Data Date separation: settled payments count as actuals, unpaid balances as forecasts", () => {
  const projectId = "proj_001";
  const dataDate = "2026-06-30";

  const paymentCertificates = [
    // Client Cert 1: Fully Paid on 2026-05-15 (Actual Inflow)
    {
      id: "cert_c1",
      project_id: projectId,
      certificate_type: "Client",
      certificate_number: "IPC-01",
      issue_date: "2026-05-01",
      payment_date: "2026-05-15",
      net_certified_value: 100000,
      paid_amount: 100000,
      status: "Paid",
    },
    // Client Cert 2: Approved, Unpaid issued 2026-06-15 (Forecast Inflow: 60 days lag -> 2026-08-14)
    {
      id: "cert_c2",
      project_id: projectId,
      certificate_type: "Client",
      certificate_number: "IPC-02",
      issue_date: "2026-06-15",
      net_certified_value: 150000,
      paid_amount: 0,
      status: "Approved",
    },
    // Subcontract Cert 1: Paid 40,000, 20,000 balance due (Partial payment)
    {
      id: "cert_s1",
      project_id: projectId,
      certificate_type: "Subcontract",
      certificate_number: "SUB-01",
      issue_date: "2026-06-01",
      payment_date: "2026-06-20",
      net_certified_value: 60000,
      paid_amount: 40000,
      status: "Partially Paid",
    },
  ];

  const result = generateGovernedCashForecastMatrix({
    projectId,
    dataDate,
    assumptions: {
      ...DEFAULT_CASH_ASSUMPTIONS,
      clientPaymentLagDays: 60,
      subcontractorPaymentLagDays: 30,
    },
    paymentCertificates,
    openingBalance: 50000,
  });

  // Check summaries
  assert.strictEqual(result.summary.openingBalance, 50000);
  assert.strictEqual(result.summary.totalActualInflow, 100000);
  assert.strictEqual(result.summary.totalActualOutflow, 40000);
  assert.strictEqual(result.summary.netActualCash, 60000);

  assert.strictEqual(result.summary.totalForecastInflow, 150000);
  assert.strictEqual(result.summary.totalForecastOutflow, 20000);
  assert.strictEqual(result.summary.netForecastCash, 130000);

  // Closing projected balance: 50000 opening + 60000 actual + 130000 forecast = 240000
  assert.strictEqual(result.summary.closingProjectedBalance, 240000);
});

test("F5 - Overdue detection: unsettled receivables/payables with past expected dates", () => {
  const projectId = "proj_001";
  const dataDate = "2026-07-01";

  const paymentCertificates = [
    // Approved Client Cert issued 2026-03-01 with 60-day lag -> expected 2026-04-30 (Overdue relative to 2026-07-01)
    {
      id: "cert_overdue",
      project_id: projectId,
      certificate_type: "Client",
      certificate_number: "IPC-OLD",
      issue_date: "2026-03-01",
      net_certified_value: 75000,
      paid_amount: 0,
      status: "Approved",
    },
  ];

  const result = generateGovernedCashForecastMatrix({
    projectId,
    dataDate,
    assumptions: {
      ...DEFAULT_CASH_ASSUMPTIONS,
      clientPaymentLagDays: 60,
    },
    paymentCertificates,
  });

  assert.strictEqual(result.summary.overdueInflows, 75000);
  assert.strictEqual(result.summary.overdueOutflows, 0);
});

test("F5 - Line-level overrides: custom probability and date override with reason", () => {
  const projectId = "proj_001";
  const dataDate = "2026-06-01";

  const paymentCertificates = [
    {
      id: "cert_risk",
      project_id: projectId,
      certificate_type: "Client",
      certificate_number: "IPC-RISK",
      issue_date: "2026-06-10",
      net_certified_value: 200000,
      paid_amount: 0,
      status: "Approved",
    },
  ];

  const lineOverrides = {
    cert_risk: {
      probabilityPercent: 75, // 75% of 200,000 = 150,000
      dateOverride: "2026-09-30",
      overrideReason: "Client audit delay anticipated",
    },
  };

  const result = generateGovernedCashForecastMatrix({
    projectId,
    dataDate,
    assumptions: DEFAULT_CASH_ASSUMPTIONS,
    paymentCertificates,
    lineOverrides,
  });

  assert.strictEqual(result.summary.totalForecastInflow, 150000);
  const item = result.sourceItems.find((s) => s.sourceId === "cert_risk");
  assert.ok(item);
  assert.strictEqual(item.expectedDate, "2026-09-30");
  assert.strictEqual(item.overrideReason, "Client audit delay anticipated");
});

test("F5 - Open Procurement Orders forecast unreceived commitments", () => {
  const projectId = "proj_001";
  const dataDate = "2026-06-01";

  const procurementOrders = [
    {
      id: "po_101",
      project_id: projectId,
      po_number: "PO-STEEL-01",
      item: "Reinforcement Steel",
      quantity: 100,
      unit_rate: 800, // Total = 80,000
      received_amount: 30000, // Open commitment = 50,000
      required_date: "2026-07-15",
      status: "Ordered",
    },
  ];

  const result = generateGovernedCashForecastMatrix({
    projectId,
    dataDate,
    assumptions: {
      ...DEFAULT_CASH_ASSUMPTIONS,
      subcontractorPaymentLagDays: 30,
    },
    procurementOrders,
  });

  assert.strictEqual(result.summary.totalForecastOutflow, 50000);
  const poItem = result.sourceItems.find((s) => s.sourceId === "po_101");
  assert.ok(poItem);
  assert.strictEqual(poItem.expectedDate, "2026-08-14"); // 2026-07-15 + 30 days
});

test("F5 - Assumptions validation rejects invalid percentages or negative lags", () => {
  const valid = validateCashForecastAssumptions(DEFAULT_CASH_ASSUMPTIONS);
  assert.strictEqual(valid.valid, true);
  assert.strictEqual(valid.errors.length, 0);

  const invalid = validateCashForecastAssumptions({
    ...DEFAULT_CASH_ASSUMPTIONS,
    clientPaymentLagDays: -10,
    advanceRecoveryRatePercent: 120,
  });
  assert.strictEqual(invalid.valid, false);
  assert.strictEqual(invalid.errors.length, 2);
});

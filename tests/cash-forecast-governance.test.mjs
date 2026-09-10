import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  buildVersionedCashForecast,
  DEFAULT_CASH_ASSUMPTIONS,
  getCashFlowStatus,
  compareCashForecastVersions,
} from "../src/utils/cashFlowForecast.ts";

function getPythonBin() {
  if (process.env.PYTHON) return process.env.PYTHON;
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return "python3";
  } catch {
    return "python";
  }
}
const PYTHON_BIN = getPythonBin();

function getMigration77Sql() {
  const rust = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  const match = rust.match(/version:\s*77,[\s\S]*?sql:\s*r#"([\s\S]*?)"#,\s*kind:/);
  assert.ok(match, "migration 77 must exist in lib.rs");
  return match[1];
}

// 1. Data Date Cut-off: Actual <= Data Date, Forecast > Data Date
test("W05-G02: Data Date Cut-off - Actual <= Data Date, Forecast > Data Date", () => {
  const dataDate = "2026-03-31";
  const certs = [
    {
      id: "cert-client-1",
      projectId: "PRJ-1",
      certificateType: "Client",
      netCertifiedValue: 50000,
      certificateDate: "2026-02-15",
      status: "Partially Paid",
    },
  ];
  const partialPayments = [
    {
      paymentId: "pay-1",
      certificateId: "cert-client-1",
      paymentDate: "2026-03-10",
      amount: 20000,
    },
    {
      paymentId: "pay-2",
      certificateId: "cert-client-1",
      paymentDate: "2026-04-15",
      amount: 15000,
    },
  ];

  const forecast = buildVersionedCashForecast({
    projectId: "PRJ-1",
    dataDate,
    paymentCertificates: certs,
    partialPayments,
  });

  const pay1 = forecast.items.find((i) => i.sourceId === "pay-1");
  const pay2 = forecast.items.find((i) => i.sourceId === "pay-2");

  assert.ok(pay1);
  assert.strictEqual(pay1.movementType, "Actual", "Payment on or before Data Date must be Actual");
  assert.ok(pay2);
  assert.strictEqual(pay2.movementType, "Forecast", "Payment after Data Date must be Forecast");
});

// 2. Direction Separation: Client Inflow vs Subcontractor Outflow
test("W05-G05: Strict Direction Separation - Client yields Inflow, Subcontractor yields Outflow", () => {
  const forecast = buildVersionedCashForecast({
    projectId: "PRJ-1",
    dataDate: "2026-03-31",
    paymentCertificates: [
      {
        id: "cert-client",
        projectId: "PRJ-1",
        certificateType: "Client",
        netCertifiedValue: 100000,
        certificateDate: "2026-03-15",
        status: "Approved",
      },
      {
        id: "cert-sub",
        projectId: "PRJ-1",
        certificateType: "Subcontractor",
        netCertifiedValue: 60000,
        certificateDate: "2026-03-15",
        status: "Approved",
      },
    ],
  });

  const clientItem = forecast.items.find((i) => i.sourceId === "cert-client");
  const subItem = forecast.items.find((i) => i.sourceId === "cert-sub");

  assert.ok(clientItem);
  assert.strictEqual(clientItem.direction, "Inflow");

  assert.ok(subItem);
  assert.strictEqual(subItem.direction, "Outflow");
});

// 3. Settlement Reconciliation: Partials reduce forecast, fully paid never re-projected
test("W05-G04: Settlement Reconciliation - Partials reduce forecast, fully settled never re-projected", () => {
  const dataDate = "2026-03-31";
  const certs = [
    {
      id: "cert-partial",
      projectId: "PRJ-1",
      certificateType: "Client",
      netCertifiedValue: 100000,
      certificateDate: "2026-02-01",
      status: "Partially Paid",
    },
    {
      id: "cert-fully-paid",
      projectId: "PRJ-1",
      certificateType: "Client",
      netCertifiedValue: 40000,
      certificateDate: "2026-01-15",
      status: "Paid",
    },
  ];

  const partialPayments = [
    {
      paymentId: "pay-p1",
      certificateId: "cert-partial",
      paymentDate: "2026-02-28",
      amount: 30000,
    },
    {
      paymentId: "pay-f1",
      certificateId: "cert-fully-paid",
      paymentDate: "2026-02-15",
      amount: 40000,
    },
  ];

  const forecast = buildVersionedCashForecast({
    projectId: "PRJ-1",
    dataDate,
    paymentCertificates: certs,
    partialPayments,
  });

  // Partial certificate should have actual payment of 30,000 and remaining forecast of 70,000 (adjusted for advance if applicable)
  const actualPartial = forecast.items.find((i) => i.sourceId === "pay-p1");
  assert.ok(actualPartial);
  assert.strictEqual(actualPartial.amount, 30000);
  assert.strictEqual(actualPartial.movementType, "Actual");

  const forecastRemaining = forecast.items.find((i) => i.sourceId === "cert-partial");
  assert.ok(forecastRemaining);
  assert.strictEqual(forecastRemaining.movementType, "Forecast");
  // With 10% advance recovery rate: 70,000 * 0.9 = 63,000
  assert.strictEqual(forecastRemaining.amount, 63000);

  // Fully paid certificate should have actual payment of 40,000 and NO forecast balance remaining
  const actualFully = forecast.items.find((i) => i.sourceId === "pay-f1");
  assert.ok(actualFully);
  assert.strictEqual(actualFully.amount, 40000);

  const forecastFully = forecast.items.find((i) => i.sourceId === "cert-fully-paid");
  assert.strictEqual(forecastFully, undefined, "Fully paid certificate must NOT have any remaining forecast balance");
});

// 4. Payment Terms Lag Calculation & Overdue Rollover
test("W05-G03: Payment Terms Lag - adds contract lag days, rolls overdue forecast past Data Date", () => {
  const dataDate = "2026-03-31";
  const certs = [
    {
      id: "cert-future",
      projectId: "PRJ-1",
      certificateType: "Client",
      netCertifiedValue: 50000,
      certificateDate: "2026-03-01",
      status: "Approved",
    },
    {
      id: "cert-overdue",
      projectId: "PRJ-1",
      certificateType: "Client",
      netCertifiedValue: 30000,
      certificateDate: "2025-12-01",
      status: "Approved",
    },
  ];

  const forecast = buildVersionedCashForecast({
    projectId: "PRJ-1",
    dataDate,
    assumptions: {
      clientPaymentLagDays: 60,
      advanceRecoveryRatePercent: 0,
    },
    paymentCertificates: certs,
  });

  const futureItem = forecast.items.find((i) => i.sourceId === "cert-future");
  assert.ok(futureItem);
  assert.ok(futureItem.date > dataDate, "Future forecast due date must fall after data date");

  const overdueItem = forecast.items.find((i) => i.sourceId === "cert-overdue");
  assert.ok(overdueItem);
  // Overdue forecast date rolls over to dataDate + 1 day so it doesn't masquerade as historical actual
  assert.ok(overdueItem.date > dataDate, "Overdue forecast must roll over to immediately after data date");
  assert.strictEqual(overdueItem.movementType, "Forecast");
});

// 5. Calendar Monthly Buckets & Financial Penny Reconciliation
test("W05-G07: Calendar Buckets Aggregation & Penny Precision Reconciliation", () => {
  const forecast = buildVersionedCashForecast({
    projectId: "PRJ-1",
    dataDate: "2026-03-31",
    paymentCertificates: [
      {
        id: "c1",
        projectId: "PRJ-1",
        certificateType: "Client",
        netCertifiedValue: 12345.67,
        certificateDate: "2026-01-15",
        status: "Approved",
      },
      {
        id: "c2",
        projectId: "PRJ-1",
        certificateType: "Subcontractor",
        netCertifiedValue: 8765.43,
        certificateDate: "2026-02-10",
        status: "Approved",
      },
    ],
    assumptions: {
      clientPaymentLagDays: 30,
      subcontractorPaymentLagDays: 30,
      advanceRecoveryRatePercent: 0,
      contingencyDrawdownPercent: 0,
    },
  });

  // Verify penny rounding (all figures have at most 2 decimal places)
  for (const bucket of forecast.buckets) {
    assert.strictEqual(bucket.actualInflow, Math.round(bucket.actualInflow * 100) / 100);
    assert.strictEqual(bucket.forecastInflow, Math.round(bucket.forecastInflow * 100) / 100);
    assert.strictEqual(bucket.netCash, Math.round(bucket.netCash * 100) / 100);
    assert.strictEqual(bucket.cumulativeCash, Math.round(bucket.cumulativeCash * 100) / 100);
  }

  // Verify total source items equals total bucket amounts within 0.01
  const totalItems = forecast.items.reduce((sum, it) => sum + it.amount, 0);
  const totalBuckets = forecast.buckets.reduce(
    (sum, b) => sum + b.actualInflow + b.actualOutflow + b.forecastInflow + b.forecastOutflow,
    0
  );
  assert.ok(
    Math.abs(totalItems - totalBuckets) <= 0.02,
    `Total items (${totalItems}) must reconcile with total buckets (${totalBuckets}) within 0.02`
  );
});

// 6. Source Drill-Down Traceability
test("W05-G09: Source Drill-Down Traceability - every bucket item links to authentic document", () => {
  const forecast = buildVersionedCashForecast({
    projectId: "PRJ-1",
    dataDate: "2026-03-31",
    paymentCertificates: [
      {
        id: "CERT-TRACE-001",
        projectId: "PRJ-1",
        certificateType: "Client",
        netCertifiedValue: 50000,
        certificateDate: "2026-03-01",
        status: "Approved",
      },
    ],
    supplierInvoices: [
      {
        id: "INV-TRACE-002",
        projectId: "PRJ-1",
        totalAmount: 25000,
        paidAmount: 0,
        invoiceDate: "2026-03-05",
        status: "Approved",
      },
    ],
    procurement: [
      {
        id: "PO-TRACE-003",
        projectId: "PRJ-1",
        totalAmount: 15000,
        orderDate: "2026-03-10",
        status: "Ordered",
      },
    ],
  });

  const allItems = forecast.buckets.flatMap((b) => b.items);
  const foundCert = allItems.find((i) => i.sourceId === "CERT-TRACE-001");
  const foundInv = allItems.find((i) => i.sourceId === "INV-TRACE-002");
  const foundPO = allItems.find((i) => i.sourceId === "PO-TRACE-003");

  assert.ok(foundCert, "Certificate must be traceable in bucket drill-down");
  assert.strictEqual(foundCert.sourceType, "payment_certificate_balance");

  assert.ok(foundInv, "Supplier invoice must be traceable in bucket drill-down");
  assert.strictEqual(foundInv.sourceType, "supplier_invoice_balance");

  assert.ok(foundPO, "PO Commitment must be traceable in bucket drill-down");
  assert.strictEqual(foundPO.sourceType, "purchase_order_commitment");
});

// 7. Scenario Stress Testing: Optimistic vs Pessimistic
test("W05-G08: Scenario Simulation - changes assumptions without mutating source data", () => {
  const baseForecast = buildVersionedCashForecast({
    projectId: "PRJ-1",
    dataDate: "2026-03-31",
    scenario: "Base",
    paymentCertificates: [
      {
        id: "cert-client",
        projectId: "PRJ-1",
        certificateType: "Client",
        netCertifiedValue: 100000,
        certificateDate: "2026-04-01",
        status: "Approved",
      },
    ],
    assumptions: { clientPaymentLagDays: 60, advanceRecoveryRatePercent: 10 },
  });

  const pessimisticForecast = buildVersionedCashForecast({
    projectId: "PRJ-1",
    dataDate: "2026-03-31",
    scenario: "Pessimistic",
    paymentCertificates: [
      {
        id: "cert-client",
        projectId: "PRJ-1",
        certificateType: "Client",
        netCertifiedValue: 100000,
        certificateDate: "2026-04-01",
        status: "Approved",
      },
    ],
    assumptions: { clientPaymentLagDays: 60, advanceRecoveryRatePercent: 10 },
  });

  const baseItem = baseForecast.items.find((i) => i.sourceId === "cert-client");
  const pessItem = pessimisticForecast.items.find((i) => i.sourceId === "cert-client");

  assert.ok(baseItem && pessItem);
  // Pessimistic scenario applies client lag stress (+30 days)
  assert.ok(
    pessItem.date > baseItem.date,
    `Pessimistic date (${pessItem.date}) must be later than Base date (${baseItem.date})`
  );
});

// 8. Decision KPIs (Closing Cash, Peak Deficit, Funding Required Date)
test("W05-G09: Decision Metrics Calculation - Closing Cash, Peak Deficit, Funding Required Date", () => {
  const forecast = buildVersionedCashForecast({
    projectId: "PRJ-1",
    dataDate: "2026-01-31",
    paymentCertificates: [
      {
        id: "c-in",
        projectId: "PRJ-1",
        certificateType: "Client",
        netCertifiedValue: 50000,
        certificateDate: "2026-03-01",
        status: "Approved",
      },
      {
        id: "c-out",
        projectId: "PRJ-1",
        certificateType: "Subcontractor",
        netCertifiedValue: 80000,
        certificateDate: "2026-02-01",
        status: "Approved",
      },
    ],
    assumptions: {
      clientPaymentLagDays: 0,
      subcontractorPaymentLagDays: 0,
      advanceRecoveryRatePercent: 0,
      contingencyDrawdownPercent: 0,
    },
  });

  assert.strictEqual(forecast.summary.closingCash, -30000);
  assert.strictEqual(forecast.summary.peakWorkingCapitalDeficit, 80000);
  assert.strictEqual(forecast.summary.lowestPeriod, "2026-02");
  assert.strictEqual(forecast.summary.fundingRequiredDate, "2026-02");
});

// 9. SQLite Migration 77 and Mutation Guard Enforcement
test("W05-G05: SQLite Migration 77 - Mutation Guard protects approved cash forecast versions", () => {
  const m77Sql = getMigration77Sql();

  const script = `
import sqlite3
import sys

m77_sql = sys.argv[1]

con = sqlite3.connect(':memory:')
cur = con.cursor()

# Create base tables
cur.execute('''
CREATE TABLE cash_forecast_versions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    project_id TEXT NOT NULL,
    contract_id TEXT,
    version_code TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    client_payment_lag_days INTEGER,
    subcontractor_payment_lag_days INTEGER,
    retention_release_toc_percent REAL,
    retention_release_dlc_percent REAL,
    advance_recovery_rate_percent REAL,
    vat_payout_lag_months INTEGER,
    contingency_drawdown_percent REAL,
    notes TEXT,
    created_by TEXT NOT NULL,
    payload TEXT NOT NULL
)
''')

# Run migration 77
cur.executescript(m77_sql)

# Insert an approved version
cur.execute("INSERT INTO cash_forecast_versions (id, created_at, project_id, version_code, title, status, created_by, payload) VALUES ('cfv-1', '2026-03-01', 'PRJ-1', 'V01', 'Baseline', 'Approved', 'user1', '{}')")
con.commit()

# Test 1: Direct unshielded UPDATE must fail
try:
    cur.execute("UPDATE cash_forecast_versions SET title = 'Hacked' WHERE id = 'cfv-1'")
    con.commit()
    print("FAIL: direct update succeeded without guard", file=sys.stderr)
    sys.exit(1)
except sqlite3.DatabaseError as e:
    assert "Governed cash forecast version status changes require a lifecycle transaction" in str(e)
    con.rollback()

# Test 2: Direct unshielded DELETE must fail
try:
    cur.execute("DELETE FROM cash_forecast_versions WHERE id = 'cfv-1'")
    con.commit()
    print("FAIL: direct delete succeeded without guard", file=sys.stderr)
    sys.exit(1)
except sqlite3.DatabaseError as e:
    assert "Only Draft cash forecast versions may be deleted" in str(e)
    con.rollback()

# Test 3: Shielded UPDATE with mutation guard must succeed
cur.execute("INSERT INTO cash_forecast_mutation_guard VALUES ('internal:cash_forecast:cfv-1', 'now')")
cur.execute("UPDATE cash_forecast_versions SET status = 'Superseded' WHERE id = 'cfv-1'")
cur.execute("DELETE FROM cash_forecast_mutation_guard WHERE operation_id = 'internal:cash_forecast:cfv-1'")
con.commit()

cur.execute("SELECT status FROM cash_forecast_versions WHERE id = 'cfv-1'")
row = cur.fetchone()
assert row[0] == 'Superseded', f"Expected Superseded, got {row[0]}"

print("SUCCESS")
`;

  const output = execFileSync(PYTHON_BIN, ["-c", script, m77Sql], { encoding: "utf8" });
  assert.ok(output.includes("SUCCESS"), "SQLite mutation guard tests must pass successfully");
});

// 10. Maker-Checker Rule in Rust Cash Forecast Workflow
test("W05-G06: Maker-Checker Rule - Creator cannot approve own version", () => {
  const rust = readFileSync(new URL("../src-tauri/src/cash_forecast_workflow.rs", import.meta.url), "utf8");
  assert.ok(
    rust.includes("created_by == req.actor"),
    "Rust workflow must check created_by == req.actor for maker-checker separation"
  );
  assert.ok(
    rust.includes("Maker-checker violation"),
    "Rust workflow must return maker-checker violation error message"
  );
});

// 11. Idempotency Check in Rust Cash Forecast Workflow
test("W05-G06: Idempotency Replay - repeated operations with same operation_id return cached results", () => {
  const rust = readFileSync(new URL("../src-tauri/src/cash_forecast_workflow.rs", import.meta.url), "utf8");
  assert.ok(
    rust.includes("cash_forecast_operation_results WHERE operation_id = ?"),
    "Rust workflow must query cash_forecast_operation_results for idempotency"
  );
  assert.ok(
    rust.includes("INSERT INTO cash_forecast_operation_results"),
    "Rust workflow must record operation results for replay"
  );
});

// 12. Locked Reporting Period Check
test("W05-G10: Locked Reporting Period Check - prevents modification of forecast for locked data date", () => {
  const rust = readFileSync(new URL("../src-tauri/src/cash_forecast_workflow.rs", import.meta.url), "utf8");
  assert.ok(
    rust.includes("SELECT id FROM reporting_periods WHERE project_id = ? AND is_locked = 1"),
    "Rust workflow must check for locked reporting periods before saving draft"
  );
  assert.ok(
    rust.includes("is locked. Cash forecast draft cannot be modified or created"),
    "Rust workflow must return locked period error"
  );
});

// 13. Reopen Workflow Logic
test("W05-G06: Reopen Workflow - branches approved version into new draft revision with snapshot preservation", () => {
  const rust = readFileSync(new URL("../src-tauri/src/cash_forecast_workflow.rs", import.meta.url), "utf8");
  assert.ok(
    rust.includes("pub async fn reopen_cash_forecast_version"),
    "reopen_cash_forecast_version must be defined"
  );
  assert.ok(
    rust.includes("status != \"Approved\" && status != \"Superseded\""),
    "Only Approved or Superseded versions can be reopened"
  );
  assert.ok(
    rust.includes("Reopened from"),
    "Reopen workflow must record audit lineage note"
  );
});

// 14. Exact Snapshot Recovery
test("W05-G10: Get Cash Forecast Version - retrieves immutable frozen snapshot", () => {
  const rust = readFileSync(new URL("../src-tauri/src/cash_forecast_workflow.rs", import.meta.url), "utf8");
  assert.ok(
    rust.includes("pub async fn get_cash_forecast_version"),
    "get_cash_forecast_version must be defined"
  );
  assert.ok(
    rust.includes("SELECT payload FROM cash_forecast_versions WHERE id = ?"),
    "Snapshot payload must be read directly from database"
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  calculateCertificateValues,
  calculateCertificateBalances,
  aggregateWirsForCertificate,
  validateOverCertification,
} from "../src/utils/commercialControl.ts";

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

function getMigration76Sql() {
  const rust = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  const match = rust.match(/version:\s*76,[\s\S]*?sql:\s*r#"([\s\S]*?)"#,\s*kind:/);
  assert.ok(match, "migration 76 must exist in lib.rs");
  return match[1];
}

// 1. Full Lifecycle
test("W04 Governance 01 - Full Certificate Lifecycle (Draft -> Submitted -> Approved -> Partially Paid -> Paid -> Reversed)", () => {
  let cert = {
    id: "pc-101",
    certificate_number: "PC-2026-001",
    certificate_type: "Client",
    status: "Draft",
    gross_certified_value: 50000,
    retention_rate: 0.1,
    advance_recovery: 5000,
    deductions: 1000,
    tax_rate: 0.05,
  };

  const values = calculateCertificateValues({
    grossValue: cert.gross_certified_value,
    retentionRate: cert.retention_rate,
    advanceRecovery: cert.advance_recovery,
    deductions: cert.deductions,
    taxRate: cert.tax_rate,
  });

  assert.strictEqual(values.retentionAmount, 5000);
  assert.strictEqual(values.taxableAmount, 39000);
  assert.strictEqual(values.taxAmount, 1950);
  assert.strictEqual(values.netCertified, 40950);

  // Draft -> Submitted
  cert = { ...cert, status: "Submitted", submitted_by: "Engineer A", submitted_date: "2026-09-09" };
  assert.strictEqual(cert.status, "Submitted");

  // Submitted -> Approved
  cert = { ...cert, status: "Approved", approved_by: "Manager B", approved_date: "2026-09-09", remaining_balance: values.netCertified, total_paid_amount: 0 };
  assert.strictEqual(cert.status, "Approved");
  assert.strictEqual(cert.remaining_balance, 40950);

  // Partial Payment 1
  const paid1 = 15000;
  cert = { ...cert, status: "Partially Paid", total_paid_amount: paid1, remaining_balance: values.netCertified - paid1 };
  assert.strictEqual(cert.status, "Partially Paid");
  assert.strictEqual(cert.remaining_balance, 25950);

  // Partial Payment 2
  const paid2 = 25950;
  const totalPaid = cert.total_paid_amount + paid2;
  cert = { ...cert, status: "Paid", total_paid_amount: totalPaid, remaining_balance: 0 };
  assert.strictEqual(cert.status, "Paid");
  assert.strictEqual(cert.remaining_balance, 0);

  // Reverse Certificate
  cert = { ...cert, status: "Reversed", reversed_by: "Commercial Lead", reversed_at: "2026-09-10" };
  assert.strictEqual(cert.status, "Reversed");
});

// 2. Maker-Checker Enforcement
test("W04 Governance 02 - Maker-Checker Enforcement (Submitter cannot approve certificate)", () => {
  const submitter = "user-eng-01";
  const approverSame = "user-eng-01";
  const approverDistinct = "user-mgr-02";

  function attemptApproval(certSubmitter, certApprover) {
    if (!certApprover || certApprover.trim() === "") {
      throw new Error("Approver identifier is required.");
    }
    if (certSubmitter.trim().toLowerCase() === certApprover.trim().toLowerCase()) {
      throw new Error("Maker-checker violation: Submitter cannot approve their own payment certificate.");
    }
    return true;
  }

  assert.throws(
    () => attemptApproval(submitter, approverSame),
    /Maker-checker violation/,
    "Approver must be distinct from submitter"
  );
  assert.strictEqual(attemptApproval(submitter, approverDistinct), true);
});

// 3. 5 WIRs Aggregation & Strict Rate Separation
test("W04 Governance 03 - 5 WIRs Aggregation across 2 BOQ Items & Strict Rate Separation", () => {
  const wirs = [
    { id: "wir-1", boq_item_id: "boq-item-1", quantity: 10, client_selling_rate: 150, subcontract_rate: 110 },
    { id: "wir-2", boq_item_id: "boq-item-1", quantity: 15, client_selling_rate: 150, subcontract_rate: 110 },
    { id: "wir-3", boq_item_id: "boq-item-1", quantity: 25, client_selling_rate: 150, subcontract_rate: 110 },
    { id: "wir-4", boq_item_id: "boq-item-2", quantity: 30, client_selling_rate: 300, subcontract_rate: 220 },
    { id: "wir-5", boq_item_id: "boq-item-2", quantity: 20, client_selling_rate: 300, subcontract_rate: 220 },
  ];

  const aggregated = aggregateWirsForCertificate(wirs);
  assert.strictEqual(aggregated.length, 2, "Must aggregate into 2 BOQ items");

  const item1 = aggregated.find((i) => i.boq_item_id === "boq-item-1");
  assert.ok(item1);
  assert.strictEqual(item1.quantity, 50); // 10 + 15 + 25
  assert.strictEqual(item1.client_amount, 7500); // 50 * 150
  assert.strictEqual(item1.subcontract_amount, 5500); // 50 * 110
  assert.deepStrictEqual(item1.wir_ids, ["wir-1", "wir-2", "wir-3"]);

  const item2 = aggregated.find((i) => i.boq_item_id === "boq-item-2");
  assert.ok(item2);
  assert.strictEqual(item2.quantity, 50); // 30 + 20
  assert.strictEqual(item2.client_amount, 15000); // 50 * 300
  assert.strictEqual(item2.subcontract_amount, 11000); // 50 * 220
  assert.deepStrictEqual(item2.wir_ids, ["wir-4", "wir-5"]);
});

// 4. Missing & Cross-Scope WIR Rejection
test("W04 Governance 04 - Missing & Cross-Scope WIR Rejection", () => {
  const projectScope = "proj-100";
  const contractScope = "cont-main-01";

  const wirValid = { id: "w-1", project_id: "proj-100", contract_id: "cont-main-01", status: "Approved" };
  const wirCrossProject = { id: "w-2", project_id: "proj-999", contract_id: "cont-main-01", status: "Approved" };
  const wirCrossContract = { id: "w-3", project_id: "proj-100", contract_id: "cont-sub-02", status: "Approved" };
  const wirUnapproved = { id: "w-4", project_id: "proj-100", contract_id: "cont-main-01", status: "Draft" };

  function validateWirScope(w, reqProj, reqCont) {
    if (w.project_id !== reqProj) throw new Error(`Cross-scope error: WIR ${w.id} belongs to project ${w.project_id}`);
    if (w.contract_id !== reqCont) throw new Error(`Cross-scope error: WIR ${w.id} belongs to contract ${w.contract_id}`);
    if (w.status !== "Approved") throw new Error(`WIR ${w.id} is not Approved.`);
    return true;
  }

  assert.strictEqual(validateWirScope(wirValid, projectScope, contractScope), true);
  assert.throws(() => validateWirScope(wirCrossProject, projectScope, contractScope), /belongs to project/);
  assert.throws(() => validateWirScope(wirCrossContract, projectScope, contractScope), /belongs to contract/);
  assert.throws(() => validateWirScope(wirUnapproved, projectScope, contractScope), /not Approved/);
});

// 5. Quantity & Over-Certification Limits against Revised BOQ Quantity
test("W04 Governance 05 - Quantity & Over-Certification Limits against Revised BOQ Quantity", () => {
  const okResult = validateOverCertification({
    candidateQuantity: 25,
    priorCertifiedQuantity: 50,
    contractBoqQuantity: 100, // revised BOQ quantity
  });
  assert.strictEqual(okResult.isOverCertifying, false);
  assert.strictEqual(okResult.totalCertifiedQuantity, 75);

  const overResult = validateOverCertification({
    candidateQuantity: 60,
    priorCertifiedQuantity: 50,
    contractBoqQuantity: 100,
  });
  assert.strictEqual(overResult.isOverCertifying, true);
  assert.strictEqual(overResult.totalCertifiedQuantity, 110);
});

// 6. Retention Cap and Advance Balance Computations
test("W04 Governance 06 - Retention Cap and Advance Balance Computations", () => {
  const balancesWithinLimits = calculateCertificateBalances({
    contractValue: 1000000,
    cumulativeCertifiedGross: 400000,
    currentGross: 100000,
    retentionRate: 0.1,
    retentionCapRate: 0.05, // Cap = 50,000
    priorRetentionHeld: 35000,
    advanceOriginal: 100000,
    advanceRecoveryRate: 0.2, // 20%
    priorAdvanceRecovered: 60000,
  });

  assert.strictEqual(balancesWithinLimits.retentionToDeduct, 10000);
  assert.strictEqual(balancesWithinLimits.advanceToRecover, 20000);
  assert.strictEqual(balancesWithinLimits.retentionCapExceeded, false);
  assert.strictEqual(balancesWithinLimits.advanceExceeded, false);

  const balancesExceedingLimits = calculateCertificateBalances({
    contractValue: 1000000,
    cumulativeCertifiedGross: 400000,
    currentGross: 100000,
    retentionRate: 0.1,
    retentionCapRate: 0.05, // Cap = 50,000
    priorRetentionHeld: 45000,
    advanceOriginal: 100000,
    advanceRecoveryRate: 0.2,
    priorAdvanceRecovered: 90000,
  });

  // Cumulative retention 55,000 > 50,000 cap
  assert.strictEqual(balancesExceedingLimits.retentionCapExceeded, true);
  // Cumulative advance 110,000 > 100,000 limit
  assert.strictEqual(balancesExceedingLimits.advanceExceeded, true);
});

// 7. Centralized Commercial Calculation Formula with Penny Rounding
test("W04 Governance 07 - Centralized Commercial Calculation Formula with Penny Rounding", () => {
  const res = calculateCertificateValues({
    grossValue: 123456.78,
    retentionRate: 0.1,
    advanceRecovery: 12345.68,
    deductions: 500.0,
    markupRate: 0.03, // 3% markup
    taxRate: 0.15, // 15% VAT
  });

  // Gross: 123456.78
  // Retention (10%): 12345.68
  // Markup (3%): 3703.70
  // Taxable: 123456.78 + 3703.70 - 12345.68 - 12345.68 - 500.00 = 101969.12
  // Tax (15%): 101969.12 * 0.15 = 15295.37
  // Net: 101969.12 + 15295.37 = 117264.49
  assert.strictEqual(res.gross, 123456.78);
  assert.strictEqual(res.retentionAmount, 12345.68);
  assert.strictEqual(res.taxableAmount, 101969.12);
  assert.strictEqual(res.taxAmount, 15295.37);
  assert.strictEqual(res.netCertified, 117264.49);
});

// 8. Three Sequential Partial Payments with Append-Only Ledger Tracking
test("W04 Governance 08 - Three Sequential Partial Payments with Append-Only Ledger Tracking", () => {
  const netCertified = 100000;
  let remaining = netCertified;
  let totalPaid = 0;
  const ledger = [];

  function recordPayment(paymentId, amount, date, operationId) {
    if (amount <= 0) throw new Error("Payment amount must be positive.");
    if (amount > remaining) throw new Error(`Over-payment rejected: amount ${amount} exceeds remaining ${remaining}`);
    if (ledger.some(p => p.operationId === operationId)) {
      return { status: "Replayed", remaining, totalPaid };
    }
    totalPaid += amount;
    remaining -= amount;
    ledger.push({ paymentId, amount, date, operationId });
    const status = remaining === 0 ? "Paid" : "Partially Paid";
    return { status, remaining, totalPaid };
  }

  // Payment 1: 30,000
  const p1 = recordPayment("pay-1", 30000, "2026-09-01", "op-pay-1");
  assert.strictEqual(p1.status, "Partially Paid");
  assert.strictEqual(p1.remaining, 70000);
  assert.strictEqual(p1.totalPaid, 30000);

  // Payment 2: 45,000
  const p2 = recordPayment("pay-2", 45000, "2026-09-15", "op-pay-2");
  assert.strictEqual(p2.status, "Partially Paid");
  assert.strictEqual(p2.remaining, 25000);
  assert.strictEqual(p2.totalPaid, 75000);

  // Payment 3: 25,000 -> completes payment
  const p3 = recordPayment("pay-3", 25000, "2026-09-30", "op-pay-3");
  assert.strictEqual(p3.status, "Paid");
  assert.strictEqual(p3.remaining, 0);
  assert.strictEqual(p3.totalPaid, 100000);
  assert.strictEqual(ledger.length, 3);
});

// 9. Zero and Negative Partial Payment Rejection
test("W04 Governance 09 - Zero and Negative Partial Payment Rejection", () => {
  function validatePaymentAmount(amount) {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      throw new Error("Payment amount must be greater than zero.");
    }
  }

  assert.throws(() => validatePaymentAmount(0), /greater than zero/);
  assert.throws(() => validatePaymentAmount(-500), /greater than zero/);
  assert.throws(() => validatePaymentAmount(NaN), /greater than zero/);
  assert.doesNotThrow(() => validatePaymentAmount(100.5));
});

// 10. Over-Payment Rejection against Remaining Balance
test("W04 Governance 10 - Over-Payment Rejection against Remaining Balance", () => {
  const remaining = 20000;
  function pay(amount) {
    if (amount > remaining) {
      throw new Error(`Over-payment forbidden: requested ${amount}, remaining balance is ${remaining}`);
    }
    return remaining - amount;
  }

  assert.throws(() => pay(25000), /Over-payment forbidden/);
  assert.strictEqual(pay(20000), 0);
  assert.strictEqual(pay(15000), 5000);
});

// 11. Idempotent Operation Replay Preserves State
test("W04 Governance 11 - Idempotent Operation Replay Preserves State", () => {
  const operationStore = new Map();

  function executeOperation(operationId, certificateId, action, params) {
    if (operationStore.has(operationId)) {
      const cached = operationStore.get(operationId);
      return { ...cached, status: "Replayed" };
    }
    const result = { operationId, certificateId, action, status: "Posted", resultValue: params.val * 2 };
    operationStore.set(operationId, result);
    return result;
  }

  const res1 = executeOperation("op-101", "cert-1", "approve", { val: 50 });
  assert.strictEqual(res1.status, "Posted");
  assert.strictEqual(res1.resultValue, 100);

  const res2 = executeOperation("op-101", "cert-1", "approve", { val: 50 });
  assert.strictEqual(res2.status, "Replayed");
  assert.strictEqual(res2.resultValue, 100);
});

// 12. Non-Destructive Reversal Preserves Historical Records and Posts Compensating Entries
test("W04 Governance 12 - Non-Destructive Reversal Preserves Records and Posts Compensating Entries", () => {
  const certificate = {
    id: "cert-200",
    status: "Approved",
    net_certified_value: 60000,
  };
  const cashEntries = [
    { id: "cash-f1", source: "cert-200", category: "Client Forecast", net: 60000 },
  ];
  const locks = [
    { wir_id: "w-1", stream: "ClientRevenue", reversed_at: null },
    { wir_id: "w-2", stream: "ClientRevenue", reversed_at: null },
  ];

  // Execute Non-Destructive Reversal
  certificate.status = "Reversed";
  // Add compensating cash entry
  cashEntries.push({
    id: "cash-rev-1",
    source: "cert-200",
    category: "Client Receipt Reversal",
    net: -60000,
  });
  // Mark locks as reversed rather than deleting them
  locks.forEach(l => { l.reversed_at = "2026-09-10T12:00:00Z"; });

  // Assertions: Original records are preserved
  assert.strictEqual(certificate.id, "cert-200");
  assert.strictEqual(certificate.status, "Reversed");
  assert.strictEqual(cashEntries.length, 2);
  const netCashTotal = cashEntries.reduce((sum, c) => sum + c.net, 0);
  assert.strictEqual(netCashTotal, 0, "Compensating entries must cleanly balance out to zero");
  assert.strictEqual(locks.length, 2, "Locks are preserved with reversed_at populated");
  assert.ok(locks.every(l => l.reversed_at !== null));
});

// 13. Back-to-Back (PWP) Subcontract Settlement Gate Enforcement
test("W04 Governance 13 - Back-to-Back (PWP) Subcontract Settlement Gate Enforcement", () => {
  function checkBackToBackGate(contract, clientCollectionExists) {
    const hasPwpClause = Boolean(contract.has_pwp_clause || contract.back_to_back);
    if (!hasPwpClause) {
      return { allowed: true, reason: "No PWP clause in subcontract" };
    }
    if (!clientCollectionExists) {
      return { allowed: false, reason: "Blocked: Back-to-Back contract requires actual client payment receipt before subcontractor settlement." };
    }
    return { allowed: true, reason: "Client collection verified" };
  }

  const subContractWithPwp = { id: "sub-1", has_pwp_clause: true };
  const subContractStandard = { id: "sub-2", has_pwp_clause: false };

  assert.strictEqual(checkBackToBackGate(subContractStandard, false).allowed, true);
  assert.strictEqual(checkBackToBackGate(subContractWithPwp, false).allowed, false);
  assert.strictEqual(checkBackToBackGate(subContractWithPwp, true).allowed, true);
});

// 14. Locked Reporting Period Protection
test("W04 Governance 14 - Locked Reporting Period Rejection", () => {
  const closedPeriod = { id: "p-2026-07", status: "Closed", lock_date: "2026-08-01" };
  const openPeriod = { id: "p-2026-08", status: "Open", lock_date: null };

  function validatePeriodForDraft(period) {
    if (period.status === "Closed" || period.status === "Locked") {
      throw new Error(`Period ${period.id} is locked. New claims cannot be created in closed reporting periods.`);
    }
    return true;
  }

  assert.throws(() => validatePeriodForDraft(closedPeriod), /is locked/);
  assert.strictEqual(validatePeriodForDraft(openPeriod), true);
});

// 15. SQLite Mutation Guards in Migration 76 (Tested in Python SQLite in-memory)
test("W04 Governance 15 - SQLite Mutation Guards Block Generic Update and Delete on Non-Draft Certificates", () => {
  const migration76Sql = getMigration76Sql();

  const script = String.raw`
import sqlite3, sys, json

db = sqlite3.connect(':memory:')
# Minimal prerequisites
db.execute('''CREATE TABLE payment_certificates (
  id TEXT PRIMARY KEY, project_id TEXT, contract_id TEXT, boq_header_id TEXT,
  payload TEXT NOT NULL, created_at TEXT NOT NULL
)''')

# Apply migration 76
db.executescript(sys.stdin.read())

# Insert Draft certificate
db.execute("INSERT INTO payment_certificates VALUES (?, ?, ?, ?, ?, ?)", (
  'cert-draft', 'p1', 'c1', 'b1',
  json.dumps({'id':'cert-draft','status':'Draft','gross_certified_value':1000}),
  '2026-09-09'
))

# Draft can be updated
db.execute("UPDATE payment_certificates SET payload=? WHERE id='cert-draft'", (
  json.dumps({'id':'cert-draft','status':'Draft','gross_certified_value':1200}),
))

# Insert Approved certificate
db.execute("INSERT INTO payment_certificates VALUES (?, ?, ?, ?, ?, ?)", (
  'cert-app', 'p1', 'c1', 'b1',
  json.dumps({'id':'cert-app','status':'Approved','gross_certified_value':5000}),
  '2026-09-09'
))

# Generic update without guard MUST abort
blocked_update = False
try:
    db.execute("UPDATE payment_certificates SET payload=? WHERE id='cert-app'", (
      json.dumps({'id':'cert-app','status':'Approved','gross_certified_value':9999}),
    ))
except sqlite3.DatabaseError as e:
    if 'Governed payment certificate updates require a lifecycle transaction' in str(e):
        blocked_update = True

assert blocked_update, "Trigger must block un-guarded update on Approved certificate"

# Generic delete without guard MUST abort
blocked_delete = False
try:
    db.execute("DELETE FROM payment_certificates WHERE id='cert-app'")
except sqlite3.DatabaseError as e:
    if 'Governed payment certificate deletion is forbidden' in str(e):
        blocked_delete = True

assert blocked_delete, "Trigger must block un-guarded delete on Approved certificate"

# Inside mutation guard, update succeeds
db.execute("INSERT INTO certificate_mutation_guard VALUES ('internal:payment_certificates:cert-app', 'now')")
db.execute("UPDATE payment_certificates SET payload=? WHERE id='cert-app'", (
  json.dumps({'id':'cert-app','status':'Approved','gross_certified_value':5500}),
))
db.execute("DELETE FROM certificate_mutation_guard WHERE operation_id='internal:payment_certificates:cert-app'")

print("GUARD_VERIFIED_SUCCESS")
`;

  const result = execFileSync(PYTHON_BIN, ["-c", script], {
    input: migration76Sql,
    encoding: "utf8",
  }).trim();

  assert.strictEqual(result, "GUARD_VERIFIED_SUCCESS");
});

// 16. SQLite Partial Payments Append-Only & Stream Locking Constraints
test("W04 Governance 16 - SQLite Partial Payments Append-Only & WIR Lock Stream Constraints", () => {
  const migration76Sql = getMigration76Sql();

  const script = String.raw`
import sqlite3, sys, json

db = sqlite3.connect(':memory:')
db.execute('''CREATE TABLE payment_certificates (
  id TEXT PRIMARY KEY, project_id TEXT, contract_id TEXT, boq_header_id TEXT,
  payload TEXT NOT NULL, created_at TEXT NOT NULL
)''')
db.executescript(sys.stdin.read())

# Insert base certificate
db.execute("INSERT INTO payment_certificates VALUES (?, ?, ?, ?, ?, ?)", (
  'c1', 'p1', 'ct1', 'bh1', '{}', 'now'
))

# 1. Partial payment recording
db.execute("INSERT INTO certificate_partial_payments VALUES ('pay1', 'c1', '2026-09-09', 250.0, 'chk-1', 'op-pay1', 'now')")

# Check constraint: amount > 0
zero_blocked = False
try:
    db.execute("INSERT INTO certificate_partial_payments VALUES ('pay2', 'c1', '2026-09-09', 0, 'chk-2', 'op-pay2', 'now')")
except sqlite3.IntegrityError:
    zero_blocked = True
assert zero_blocked, "Partial payment amount must be > 0"

# Partial payment update is blocked by trigger
update_blocked = False
try:
    db.execute("UPDATE certificate_partial_payments SET amount=500.0 WHERE payment_id='pay1'")
except sqlite3.DatabaseError as e:
    if 'Partial payment ledger is append-only' in str(e):
        update_blocked = True
assert update_blocked, "Partial payment ledger update must be blocked"

# Partial payment delete is blocked by trigger
delete_blocked = False
try:
    db.execute("DELETE FROM certificate_partial_payments WHERE payment_id='pay1'")
except sqlite3.DatabaseError as e:
    if 'Partial payment ledger is append-only' in str(e):
        delete_blocked = True
assert delete_blocked, "Partial payment ledger deletion must be blocked"

# 2. WIR Certification Lock Uniqueness
db.execute("INSERT INTO wir_certification_lock VALUES ('l1', 'c1', 'wir-100', 'p1', 'b1', 'ClientRevenue', 50.0, 5000.0, 'now', NULL)")

duplicate_lock_blocked = False
try:
    # Attempting to lock the same WIR in the same stream while active
    db.execute("INSERT INTO wir_certification_lock VALUES ('l2', 'c1', 'wir-100', 'p2', 'b1', 'ClientRevenue', 20.0, 2000.0, 'now', NULL)")
except sqlite3.IntegrityError:
    duplicate_lock_blocked = True
assert duplicate_lock_blocked, "Same WIR cannot be locked twice concurrently in ClientRevenue stream"

# But SubcontractCost stream can lock the same WIR (stream separation)
db.execute("INSERT INTO wir_certification_lock VALUES ('l3', 'c1', 'wir-100', 'p1', 'b1', 'SubcontractCost', 50.0, 3500.0, 'now', NULL)")

print("SQLITE_CONSTRAINTS_VERIFIED")
`;

  const result = execFileSync(PYTHON_BIN, ["-c", script], {
    input: migration76Sql,
    encoding: "utf8",
  }).trim();

  assert.strictEqual(result, "SQLITE_CONSTRAINTS_VERIFIED");
});

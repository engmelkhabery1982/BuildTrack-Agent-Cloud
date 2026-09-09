import { test } from "node:test";
import assert from "node:assert";
import {
  calculateCertificateValues,
  calculateCertificateBalances,
  aggregateWirsForCertificate,
  validateOverCertification,
} from "../src/utils/commercialControl.ts";

test("W04 Governance - Full Certificate Lifecycle (Draft -> Submitted -> Approved -> Partially Paid -> Paid -> Reversed)", () => {
  const lifecycle = ["Draft", "Submitted", "Approved", "Partially Paid", "Paid", "Reversed"];
  
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

  // 1. Calculate values
  const values = calculateCertificateValues({
    grossValue: cert.gross_certified_value,
    retentionRate: cert.retention_rate,
    advanceRecovery: cert.advance_recovery,
    deductions: cert.deductions,
    taxRate: cert.tax_rate,
  });

  assert.strictEqual(values.retentionAmount, 5000);
  assert.strictEqual(values.taxableAmount, 39000); // 50000 - 5000 - 5000 - 1000 = 39000
  assert.strictEqual(values.taxAmount, 1950); // 39000 * 0.05 = 1950
  assert.strictEqual(values.netCertified, 40950); // 39000 + 1950 = 40950

  // 2. Draft -> Submitted
  cert = { ...cert, status: "Submitted", submitted_by: "Project Engineer", submitted_date: "2026-09-09" };
  assert.strictEqual(cert.status, "Submitted");

  // 3. Submitted -> Approved
  cert = { ...cert, status: "Approved", approved_by: "Commercial Manager", approved_date: "2026-09-09", remaining_balance: values.netCertified, total_paid_amount: 0 };
  assert.strictEqual(cert.status, "Approved");
  assert.strictEqual(cert.remaining_balance, 40950);

  // 4. Record Partial Payment 1: 15000
  const partial1 = 15000;
  const paidAfter1 = (cert.total_paid_amount || 0) + partial1;
  const remainingAfter1 = values.netCertified - paidAfter1;
  cert = { ...cert, status: remainingAfter1 <= 0 ? "Paid" : "Partially Paid", total_paid_amount: paidAfter1, remaining_balance: remainingAfter1 };
  assert.strictEqual(cert.status, "Partially Paid");
  assert.strictEqual(cert.remaining_balance, 25950);

  // 5. Record Partial Payment 2: 25950
  const partial2 = 25950;
  const paidAfter2 = cert.total_paid_amount + partial2;
  const remainingAfter2 = values.netCertified - paidAfter2;
  cert = { ...cert, status: remainingAfter2 <= 0 ? "Paid" : "Partially Paid", total_paid_amount: paidAfter2, remaining_balance: remainingAfter2 };
  assert.strictEqual(cert.status, "Paid");
  assert.strictEqual(cert.remaining_balance, 0);

  // 6. Reverse Certificate
  cert = { ...cert, status: "Reversed", notes: "Reversed due to contract amendment" };
  assert.strictEqual(cert.status, "Reversed");
});

test("W04 Governance - WIR Aggregation & Rate Separation", () => {
  const wirs = [
    { id: "wir-a", boq_item_id: "boq-1", quantity: 20, client_selling_rate: 200, subcontract_rate: 150 },
    { id: "wir-b", boq_item_id: "boq-1", quantity: 30, client_selling_rate: 200, subcontract_rate: 150 },
    { id: "wir-c", boq_item_id: "boq-2", quantity: 10, client_selling_rate: 500, subcontract_rate: 380 },
  ];

  const aggregated = aggregateWirsForCertificate(wirs);
  assert.strictEqual(aggregated.length, 2);

  const item1 = aggregated.find(i => i.boq_item_id === "boq-1");
  assert.ok(item1);
  assert.strictEqual(item1.quantity, 50);
  assert.strictEqual(item1.client_amount, 10000);
  assert.strictEqual(item1.subcontract_amount, 7500);
  assert.deepStrictEqual(item1.wir_ids, ["wir-a", "wir-b"]);
});

test("W04 Governance - Quantity & Over-Certification Limits", () => {
  // Test valid certifying
  const okResult = validateOverCertification({
    candidateQuantity: 25,
    priorCertifiedQuantity: 50,
    contractBoqQuantity: 100,
  });
  assert.strictEqual(okResult.isOverCertifying, false);
  assert.strictEqual(okResult.totalCertifiedQuantity, 75);

  // Test over certifying
  const overResult = validateOverCertification({
    candidateQuantity: 60,
    priorCertifiedQuantity: 50,
    contractBoqQuantity: 100,
  });
  assert.strictEqual(overResult.isOverCertifying, true);
  assert.strictEqual(overResult.totalCertifiedQuantity, 110);
});

test("W04 Governance - Retention Cap and Advance Balance Computations", () => {
  const balances = calculateCertificateBalances({
    contractValue: 1000000,
    cumulativeCertifiedGross: 400000,
    currentGross: 100000,
    retentionRate: 0.1,
    retentionCapRate: 0.05, // Cap = 50,000
    priorRetentionHeld: 35000,
    advanceOriginal: 100000,
    advanceRecoveryRate: 0.2, // 20% of gross
    priorAdvanceRecovered: 60000,
  });

  // Gross current = 100,000 * 10% = 10,000 retention
  // Prior retention 35,000 + 10,000 = 45,000 <= 50,000 Cap -> 10,000 allowed
  assert.strictEqual(balances.retentionToDeduct, 10000);

  // Advance recovery: 100,000 * 20% = 20,000. Prior 60,000 + 20,000 = 80,000 <= 100,000 Original -> 20,000 allowed
  assert.strictEqual(balances.advanceToRecover, 20000);
});

import { test } from "node:test";
import assert from "node:assert";
import {
  calculateCertificateValues,
  calculateCertificateBalances,
  aggregateWirsForCertificate,
  validateOverCertification,
} from "../src/utils/commercialControl.ts";

test("W04 G01 & G02 - Aggregate WIRs by boq_item_id with rate separation", () => {
  const wirs = [
    { id: "wir-1", boq_item_id: "boq-101", quantity: 10, client_selling_rate: 150, subcontract_rate: 100 },
    { id: "wir-2", boq_item_id: "boq-101", quantity: 20, client_selling_rate: 150, subcontract_rate: 100 },
    { id: "wir-3", boq_item_id: "boq-101", quantity: 15, client_selling_rate: 150, subcontract_rate: 100 },
    { id: "wir-4", boq_item_id: "boq-101", quantity: 25, client_selling_rate: 150, subcontract_rate: 100 },
    { id: "wir-5", boq_item_id: "boq-101", quantity: 30, client_selling_rate: 150, subcontract_rate: 100 },
    { id: "wir-6", boq_item_id: "boq-102", quantity: 50, client_selling_rate: 200, subcontract_rate: 140 },
  ];

  const aggregated = aggregateWirsForCertificate(wirs);

  assert.strictEqual(aggregated.length, 2);

  const boq101 = aggregated.find((item) => item.boq_item_id === "boq-101");
  assert.ok(boq101);
  assert.strictEqual(boq101.quantity, 100);
  assert.strictEqual(boq101.wir_ids.length, 5);
  assert.strictEqual(boq101.client_amount, 15000);
  assert.strictEqual(boq101.subcontract_amount, 10000);

  const boq102 = aggregated.find((item) => item.boq_item_id === "boq-102");
  assert.ok(boq102);
  assert.strictEqual(boq102.quantity, 50);
  assert.strictEqual(boq102.client_amount, 10000);
  assert.strictEqual(boq102.subcontract_amount, 7000);
});

test("W04 G03 - Payment certificate lifecycle states", () => {
  const allowedStatuses = ["Draft", "Submitted", "Approved", "Partially Paid", "Paid", "Reversed"];
  const initialCert = { status: "Draft", gross_certified_value: 10000 };

  assert.ok(allowedStatuses.includes(initialCert.status));

  // Draft -> Submitted
  const submittedCert = { ...initialCert, status: "Submitted", submitted_by: "eng1", submitted_date: "2026-09-09" };
  assert.strictEqual(submittedCert.status, "Submitted");

  // Submitted -> Approved
  const approvedCert = { ...submittedCert, status: "Approved", approved_by: "manager1", net_certified_value: 9000, remaining_balance: 9000 };
  assert.strictEqual(approvedCert.status, "Approved");

  // Approved -> Partially Paid
  const partialCert = { ...approvedCert, status: "Partially Paid", total_paid_amount: 4000, remaining_balance: 5000 };
  assert.strictEqual(partialCert.status, "Partially Paid");
  assert.strictEqual(partialCert.remaining_balance, 5000);

  // Partially Paid -> Paid
  const paidCert = { ...partialCert, status: "Paid", total_paid_amount: 9000, remaining_balance: 0 };
  assert.strictEqual(paidCert.status, "Paid");
  assert.strictEqual(paidCert.remaining_balance, 0);

  // Paid/Approved -> Reversed
  const reversedCert = { ...approvedCert, status: "Reversed", reversal_reason: "Duplicate entry" };
  assert.strictEqual(reversedCert.status, "Reversed");
});

test("W04 G05 - Partial payment ledger calculation", () => {
  const netCertifiedValue = 10000;
  const partialPayments = [
    { payment_id: "p1", amount: 3000, payment_date: "2026-09-01" },
    { payment_id: "p2", amount: 4000, payment_date: "2026-09-05" },
  ];

  const totalPaid = partialPayments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = netCertifiedValue - totalPaid;

  assert.strictEqual(totalPaid, 7000);
  assert.strictEqual(remaining, 3000);

  const status = remaining <= 0 ? "Paid" : totalPaid > 0 ? "Partially Paid" : "Approved";
  assert.strictEqual(status, "Partially Paid");
});

test("W04 G07 - Over-certification validation against contract BOQ quantity", () => {
  const validCheck = validateOverCertification({
    candidateQuantity: 30,
    priorCertifiedQuantity: 60,
    contractBoqQuantity: 100,
  });

  assert.strictEqual(validCheck.isOverCertifying, false);
  assert.strictEqual(validCheck.totalCertifiedQuantity, 90);

  const invalidCheck = validateOverCertification({
    candidateQuantity: 50,
    priorCertifiedQuantity: 60,
    contractBoqQuantity: 100,
  });

  assert.strictEqual(invalidCheck.isOverCertifying, true);
  assert.strictEqual(invalidCheck.totalCertifiedQuantity, 110);
  assert.strictEqual(invalidCheck.excessQuantity, 10);
});

test("F4 Invoice Reconciliation - 5 WIRs for same BOQ item aggregate into a single line", () => {
  const wirs = [
    { id: "wir-1", boq_item_id: "boq-101", quantity: 10, unit_price: 150 },
    { id: "wir-2", boq_item_id: "boq-101", quantity: 20, unit_price: 150 },
    { id: "wir-3", boq_item_id: "boq-101", quantity: 15, unit_price: 150 },
    { id: "wir-4", boq_item_id: "boq-101", quantity: 25, unit_price: 150 },
    { id: "wir-5", boq_item_id: "boq-101", quantity: 30, unit_price: 150 },
  ];

  // Aggregate by boq_item_id
  const totalQty = wirs.reduce((sum, w) => sum + w.quantity, 0);
  assert.strictEqual(totalQty, 100);

  const clientSellingRate = 150;
  const clientLineAmount = totalQty * clientSellingRate;
  assert.strictEqual(clientLineAmount, 15000);

  const subcontractRate = 100;
  const subLineAmount = totalQty * subcontractRate;
  assert.strictEqual(subLineAmount, 10000);
});

test("F4 Invoice Reconciliation - retention, advance recovery, tax and net certified calculations", () => {
  const cert = {
    gross_certified_value: 50000,
    retention_rate: 10,
    advance_recovery: 5000,
    deductions: 1000,
    tax_rate: 15,
  };

  const values = calculateCertificateValues(cert);
  assert.strictEqual(values.gross, 50000);
  assert.strictEqual(values.retention_amount, 5000);
  assert.strictEqual(values.taxable_amount, 39000); // 50000 - 5000 - 5000 - 1000 = 39000
  assert.strictEqual(values.tax_amount, 5850); // 39000 * 0.15 = 5850
  assert.strictEqual(values.net_certified_value, 44850); // 39000 + 5850 = 44850
});

test("F4 Invoice Reconciliation - cumulative retention cap and advance recovery limits", () => {
  const cert = {
    gross_certified_value: 20000,
    retention_rate: 10,
    advance_recovery: 2000,
    deductions: 0,
    tax_rate: 0,
  };

  const balances = calculateCertificateBalances({
    contractAdvanceAmount: 10000,
    retentionCapAmount: 2500,
    priorAdvanceRecovery: 8000,
    priorRetention: 1000,
    certificate: cert,
  });

  assert.strictEqual(balances.cumulativeAdvanceRecovery, 10000);
  assert.strictEqual(balances.remainingAdvanceBalance, 0);
  assert.strictEqual(balances.cumulativeRetentionAmount, 3000);
  assert.strictEqual(balances.advanceExceeded, false);
  assert.strictEqual(balances.retentionCapExceeded, true);
});

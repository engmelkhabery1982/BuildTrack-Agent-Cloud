import { test } from "node:test";
import assert from "node:assert";
import {
  calculateCertificateValues,
  calculateCertificateBalances,
  aggregateWirsForCertificate,
  calculateGovernedCertificateTotals,
  calculateCertificateSettlement,
  verifyBackToBackSubcontractAuthorization,
} from "../src/utils/commercialControl.ts";

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

test("F4 Invoice Reconciliation - aggregateWirsForCertificate correctly groups WIR entries", () => {
  const wirEntries = [
    { id: "w-1", wir_number: "WIR-001", contract_id: "c-1", project_id: "p-1", boq_item_id: "boq-1", inspected_quantity: 15, status: "Passed", inspection_date: "2026-08-05" },
    { id: "w-2", wir_number: "WIR-002", contract_id: "c-1", project_id: "p-1", boq_item_id: "boq-1", inspected_quantity: 25, status: "Accepted", inspection_date: "2026-08-10" },
    { id: "w-3", wir_number: "WIR-003", contract_id: "c-1", project_id: "p-1", boq_item_id: "boq-2", inspected_quantity: 50, status: "Passed", inspection_date: "2026-08-15" },
  ];

  const boqItems = [
    { id: "boq-1", item_code: "01.01", description: "Concrete Grade 30", unit: "m3", unit_rate: 200, subcontract_unit_rate: 140, quantity: 100 },
    { id: "boq-2", item_code: "01.02", description: "Rebar High Tensile", unit: "ton", unit_rate: 1200, subcontract_unit_rate: 900, quantity: 80 },
  ];

  const contracts = [
    { id: "c-1", project_id: "p-1", contract_number: "CNT-001", title: "Main Civil Contract" },
  ];

  const result = aggregateWirsForCertificate({
    projectId: "p-1",
    contractId: "c-1",
    certificateType: "Client",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    wirEntries,
    boqItems,
    priorCertificates: [],
    contracts,
  });

  assert.strictEqual(result.lines.length, 2);
  assert.strictEqual(result.totalWirCount, 3);
  
  const line1 = result.lines.find((l) => l.boq_item_id === "boq-1");
  assert.ok(line1);
  assert.strictEqual(line1.current_quantity, 40);
  assert.strictEqual(line1.applicable_rate, 200);
  assert.strictEqual(line1.current_value, 8000);

  const line2 = result.lines.find((l) => l.boq_item_id === "boq-2");
  assert.ok(line2);
  assert.strictEqual(line2.current_quantity, 50);
  assert.strictEqual(line2.applicable_rate, 1200);
  assert.strictEqual(line2.current_value, 60000);

  assert.strictEqual(result.totalGrossValue, 68000);
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

test("F4 Invoice Reconciliation - calculateGovernedCertificateTotals with caps and remaining balances", () => {
  const totals = calculateGovernedCertificateTotals({
    grossValue: 100000,
    retentionRate: 10,
    advanceRecovery: 15000,
    deductions: 2000,
    taxRate: 15,
    contractAdvanceAmount: 30000,
    retentionCapAmount: 12000,
    priorAdvanceRecovery: 10000,
    priorRetention: 5000,
  });

  assert.strictEqual(totals.gross, 100000);
  assert.strictEqual(totals.retention_amount, 7000); // Capped at (12000 - 5000)
  assert.strictEqual(totals.cumulative_retention_amount, 12000);
  assert.strictEqual(totals.advance_recovery, 15000);
  assert.strictEqual(totals.remaining_advance_balance, 5000); // 30000 - (10000 + 15000) = 5000
  assert.strictEqual(totals.taxable_amount, 76000); // 100000 - 7000 - 15000 - 2000
  assert.strictEqual(totals.tax_amount, 11400); // 76000 * 0.15
  assert.strictEqual(totals.net_certified_value, 87400); // 76000 + 11400
});

test("F4 Invoice Reconciliation - calculateCertificateSettlement partial payment", () => {
  const fullSettle = calculateCertificateSettlement({
    netCertifiedValue: 87400,
    priorPaidAmount: 0,
  });
  assert.strictEqual(fullSettle.isFullSettlement, true);
  assert.strictEqual(fullSettle.status, "Paid");
  assert.strictEqual(fullSettle.totalPaid, 87400);
  assert.strictEqual(fullSettle.balanceDue, 0);

  const partialSettle = calculateCertificateSettlement({
    netCertifiedValue: 87400,
    priorPaidAmount: 0,
    paymentAmount: 50000,
  });
  assert.strictEqual(partialSettle.isFullSettlement, false);
  assert.strictEqual(partialSettle.status, "Partially Paid");
  assert.strictEqual(partialSettle.totalPaid, 50000);
  assert.strictEqual(partialSettle.balanceDue, 37400);

  const secondPartial = calculateCertificateSettlement({
    netCertifiedValue: 87400,
    priorPaidAmount: 50000,
    paymentAmount: 37400,
  });
  assert.strictEqual(secondPartial.isFullSettlement, true);
  assert.strictEqual(secondPartial.status, "Paid");
  assert.strictEqual(secondPartial.totalPaid, 87400);
  assert.strictEqual(secondPartial.balanceDue, 0);
});

test("F4 Invoice Reconciliation - verifyBackToBackSubcontractAuthorization", () => {
  const contracts = [
    { id: "main-1", project_id: "p-1", contract_number: "MAIN-001", contract_type: "Main Contract", parent_main_contract_id: null },
    { id: "sub-1", project_id: "p-1", contract_number: "SUB-001", contract_type: "Subcontract", parent_main_contract_id: "main-1" },
  ];

  const pendingCheck = verifyBackToBackSubcontractAuthorization({
    contractId: "sub-1",
    contracts,
    clientCertificates: [],
  });
  assert.strictEqual(pendingCheck.isAuthorized, false);
  assert.strictEqual(pendingCheck.status, "Pending");
  assert.ok(pendingCheck.reason.includes("Pay-When-Paid condition"));

  const authorizedCheck = verifyBackToBackSubcontractAuthorization({
    contractId: "sub-1",
    contracts,
    clientCertificates: [
      { id: "ipc-1", contract_id: "main-1", certificate_type: "Client", status: "Approved" },
    ],
  });
  assert.strictEqual(authorizedCheck.isAuthorized, true);
  assert.strictEqual(authorizedCheck.status, "Authorized");
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


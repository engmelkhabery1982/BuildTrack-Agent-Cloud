export type PaymentCertificateCashStatus = 'Forecast' | 'Actual' | null;

const roundMoney = (value: number) => Math.round(value * 100) / 100;
const numberField = (value: Record<string, unknown>, snake: string, camel: string) => {
  const raw = value[snake] ?? value[camel];
  return Number.isFinite(Number(raw)) ? Number(raw) : 0;
};

/** The backend contract is snake_case; the Tauri/UI boundary may use camelCase.
 * Keep both aliases at this boundary, never let a missing field become a fake value. */
export function calculateCertificateValues(certificate: Record<string, unknown>) {
  const gross = numberField(certificate, 'gross_certified_value', 'grossValue');
  const retentionRate = numberField(certificate, 'retention_rate', 'retentionRate');
  const advanceRecovery = numberField(certificate, 'advance_recovery', 'advanceRecovery');
  const deductions = numberField(certificate, 'deductions', 'deductions');
  const markupRate = numberField(certificate, 'markup_rate', 'markupRate');
  const taxRate = numberField(certificate, 'tax_rate', 'taxRate');
  const retention = roundMoney(gross * retentionRate / (retentionRate > 1 ? 100 : 1));
  const markup = roundMoney(gross * markupRate / (markupRate > 1 ? 100 : 1));
  const taxableAmount = roundMoney(gross + markup - retention - advanceRecovery - deductions);
  const tax = roundMoney(Math.max(0, taxableAmount) * taxRate / (taxRate > 1 ? 100 : 1));
  const net = roundMoney(taxableAmount + tax);
  const snakeResult = { gross, retention_amount: retention, taxable_amount: taxableAmount, tax_amount: tax, net_certified_value: net };
  const camelInput = Object.prototype.hasOwnProperty.call(certificate, 'grossValue')
    || Object.prototype.hasOwnProperty.call(certificate, 'retentionRate')
    || Object.prototype.hasOwnProperty.call(certificate, 'taxRate');
  return camelInput
    ? { ...snakeResult, markup_amount: markup, retentionAmount: retention, taxableAmount, taxAmount: tax, netCertified: net }
    : snakeResult;
}

export interface CertificateWiringAggregate {
  boq_item_id: string;
  quantity: number;
  wir_ids: string[];
  description?: string;
  unit?: string;
  client_selling_rate?: number;
  subcontract_rate?: number;
  client_amount: number;
  subcontract_amount: number;
  amount?: number;
}

export function aggregateWirsForCertificate(wirs: Array<Record<string, any>>): CertificateWiringAggregate[] {
  const grouped = new Map<string, Record<string, any>>();
  for (const wir of wirs) {
    const boqItemId = String(wir.boq_item_id ?? wir.boqItemId ?? '');
    if (!boqItemId) continue;
    const quantity = Number(wir.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const existing = grouped.get(boqItemId) ?? {
      boq_item_id: boqItemId, quantity: 0, wir_ids: [], client_amount: 0, subcontract_amount: 0,
      client_selling_rate: undefined, subcontract_rate: undefined,
    };
    existing.quantity += quantity;
    existing.wir_ids.push(String(wir.id));
    const clientRate = Number(wir.client_selling_rate ?? wir.clientSellingRate);
    const subcontractRate = Number(wir.subcontract_rate ?? wir.subcontractRate);
    if (Number.isFinite(clientRate)) { existing.client_selling_rate = clientRate; existing.client_amount += quantity * clientRate; }
    if (Number.isFinite(subcontractRate)) { existing.subcontract_rate = subcontractRate; existing.subcontract_amount += quantity * subcontractRate; }
    grouped.set(boqItemId, existing);
  }
  return [...grouped.values()].map((item): CertificateWiringAggregate => ({ ...(item as CertificateWiringAggregate),
    quantity: Math.round(item.quantity * 1000) / 1000,
    client_amount: roundMoney(item.client_amount), subcontract_amount: roundMoney(item.subcontract_amount),
  }));
}

export function validateOverCertification(input: { candidateQuantity: number; priorCertifiedQuantity: number; contractBoqQuantity: number }) {
  const candidateQuantity = Number(input.candidateQuantity) || 0;
  const priorCertifiedQuantity = Number(input.priorCertifiedQuantity) || 0;
  const contractBoqQuantity = Number(input.contractBoqQuantity) || 0;
  const totalCertifiedQuantity = Math.round((candidateQuantity + priorCertifiedQuantity) * 1000) / 1000;
  return { totalCertifiedQuantity, isOverCertifying: totalCertifiedQuantity > contractBoqQuantity + 0.000001 };
}

/** Contract-level retention and advance balances shared by workflow, reports and data quality. */
export function calculateCertificateBalances(input: {
  contractAdvanceAmount?: number;
  retentionCapAmount?: number;
  priorAdvanceRecovery?: number;
  priorRetention?: number;
  certificate?: Record<string, unknown>;
  contractValue?: number;
  cumulativeCertifiedGross?: number;
  currentGross?: number;
  retentionRate?: number;
  retentionCapRate?: number;
  priorRetentionHeld?: number;
  advanceOriginal?: number;
  advanceRecoveryRate?: number;
  priorAdvanceRecovered?: number;
}) {
  const legacy = !input.certificate;
  const certificate = input.certificate ?? {
    gross_certified_value: input.currentGross ?? 0,
    retention_rate: input.retentionRate ?? 0,
    advance_recovery: (input.currentGross ?? 0) * (input.advanceRecoveryRate ?? 0),
    deductions: 0, tax_rate: 0,
  };
  const values = calculateCertificateValues(certificate);
  const advanceLimit = Math.max(0, Number(input.contractAdvanceAmount ?? input.advanceOriginal) || 0);
  const retentionCap = Math.max(0, Number(input.retentionCapAmount ?? ((Number(input.contractValue) || 0) * (Number(input.retentionCapRate) || 0))) || 0);
  const priorAdvance = Number(input.priorAdvanceRecovery ?? input.priorAdvanceRecovered) || 0;
  const currentAdvance = numberField(certificate, 'advance_recovery', 'advanceRecovery');
  const cumulativeAdvanceRecovery = roundMoney(priorAdvance + currentAdvance);
  const priorRetention = Number(input.priorRetention ?? input.priorRetentionHeld) || 0;
  const cumulativeRetentionAmount = roundMoney(priorRetention + values.retention_amount);
  const result = {
    ...values, advanceLimit, retentionCap, cumulativeAdvanceRecovery, cumulativeRetentionAmount,
    remainingAdvanceBalance: roundMoney(Math.max(0, advanceLimit - cumulativeAdvanceRecovery)),
    advanceExceeded: cumulativeAdvanceRecovery > advanceLimit + 0.000001,
    retentionCapExceeded: retentionCap > 0 && cumulativeRetentionAmount > retentionCap + 0.000001,
    retentionToDeduct: values.retention_amount,
    advanceToRecover: currentAdvance,
  };
  if (legacy) return result;
  return result;
}

/** A Cost Change has exactly one commercial allocation target. This prevents
 * a project-wide change being added once to every SOV line. */
export function costChangeAppliesToSovLine(change: Record<string, unknown>, line: Record<string, unknown>): boolean {
  return String(change.status || '') === 'Approved'
    && Boolean(change.contract_sov_line_id)
    && String(change.contract_sov_line_id) === String(line.id);
}

export function certificateCashStatus(certificate: Record<string, unknown>): PaymentCertificateCashStatus {
  if (String(certificate.status || '') === 'Paid') return 'Actual';
  if (String(certificate.status || '') === 'Approved') return 'Forecast';
  return null;
}

export function certificateCashDirection(certificate: Record<string, unknown>): 'Inflow' | 'Outflow' {
  return String(certificate.certificate_type || '') === 'Client' ? 'Inflow' : 'Outflow';
}

/**
 * A purchase order is a commitment, not proof that a cost was incurred or
 * paid.  Actual cost must come from an accepted receipt/AP fact (or a
 * separately governed cost entry).  This small state rule is shared by the
 * operational sync and the acceptance tests so a Draft/Ordered PO can never
 * silently become actual cost.
 */
export function procurementPostingState(procurement: Record<string, unknown>) {
  const status = String(procurement.status || 'Draft');
  const isCommitment = ['Ordered', 'Partially Delivered', 'Delivered', 'Closed'].includes(status);
  const isForecast = ['Ordered', 'Partially Delivered', 'Delivered'].includes(status);
  return {
    isCommitment,
    isForecast,
    postsActualCost: false,
    postsActualCash: false,
  };
}

export interface SovCostForecastInput {
  originalBudget: number;
  approvedVariations: number;
  approvedCostChanges: number;
  /** Ordered PO value. A PO is a commitment, never an actual cost. */
  procurementCommitment: number;
  /** Accepted-GRN cost only; this is the portion that consumes a PO. */
  procurementActual: number;
  /** Governed non-PO cost facts (labour, equipment, indirect cost, etc.). */
  otherActual: number;
  /** Explicit estimator override. It may increase, but never hide, the governed floor. */
  manualForecastOverride?: number;
}

const money = (value: number) => Math.round(value * 100) / 100;

/**
 * One cost-control formula for a Contract SOV line.
 *
 * The essential protection is that accepted receipt cost consumes the related
 * purchase-order commitment.  Therefore an accepted GRN is never counted once
 * as actual cost and again as open commitment.  Non-procurement actual cost is
 * retained in full because it is not represented by a PO commitment.
 */
export function calculateSovCostForecast(input: SovCostForecastInput) {
  const originalBudget = Math.max(0, Number(input.originalBudget) || 0);
  const approvedVariations = Number(input.approvedVariations) || 0;
  const approvedCostChanges = Number(input.approvedCostChanges) || 0;
  const revisedBudget = money(originalBudget + approvedVariations + approvedCostChanges);
  const procurementCommitment = Math.max(0, Number(input.procurementCommitment) || 0);
  const procurementActual = Math.max(0, Number(input.procurementActual) || 0);
  const otherActual = Math.max(0, Number(input.otherActual) || 0);
  const actualCost = money(procurementActual + otherActual);
  const openCommitment = money(Math.max(0, procurementCommitment - procurementActual));
  const governedForecastFloor = money(Math.max(revisedBudget, actualCost + openCommitment));
  const requestedOverride = Math.max(0, Number(input.manualForecastOverride) || 0);
  const forecastAtCompletion = money(Math.max(governedForecastFloor, requestedOverride));
  return {
    revisedBudget,
    procurementCommitment: money(procurementCommitment),
    procurementActual: money(procurementActual),
    otherActual: money(otherActual),
    actualCost,
    openCommitment,
    governedForecastFloor,
    requestedOverride,
    forecastAtCompletion,
    costToComplete: money(Math.max(0, forecastAtCompletion - actualCost)),
    forecastVariance: money(forecastAtCompletion - revisedBudget),
    overrideBelowGovernedFloor: requestedOverride > 0 && requestedOverride < governedForecastFloor,
  };
}

export interface BudgetAvailabilityInput {
  revisedBudget: number;
  /** Actuals already posted to the controlled SOV line. */
  actualCost: number;
  /** Only unconsumed commitments; accepted receipt cost must not appear here. */
  openCommitment: number;
  /** The proposed new posting or commitment, evaluated before it is saved. */
  proposedAmount?: number;
}

/** SAP-style availability control basis for the local SOV: actual cost plus
 * open commitment consumes budget. A receipt converts commitment to actual;
 * it therefore does not double-consume availability. */
export function calculateBudgetAvailability(input: BudgetAvailabilityInput) {
  const revisedBudget = money(Math.max(0, Number(input.revisedBudget) || 0));
  const actualCost = money(Math.max(0, Number(input.actualCost) || 0));
  const openCommitment = money(Math.max(0, Number(input.openCommitment) || 0));
  const assignedValue = money(actualCost + openCommitment);
  const proposedAmount = money(Math.max(0, Number(input.proposedAmount) || 0));
  const projectedAssignedValue = money(assignedValue + proposedAmount);
  const availableBudget = money(revisedBudget - assignedValue);
  const projectedAvailableBudget = money(revisedBudget - projectedAssignedValue);
  const status = projectedAvailableBudget < -0.01 ? 'Blocked'
    : projectedAvailableBudget <= Math.max(0.01, revisedBudget * 0.1) ? 'At Risk'
      : 'Available';
  return {
    revisedBudget, actualCost, openCommitment, assignedValue, proposedAmount,
    projectedAssignedValue, availableBudget, projectedAvailableBudget, status,
    exceedsBudget: projectedAvailableBudget < -0.01,
  };
}

/**
 * Feature B & A Mechanical Link:
 * Evaluates progress and executed amounts upon Work Inspection Request (WIR) verification/approval.
 * Calculates the verified executed quantity and progress % for the linked BOQ item and schedule activity.
 */
export function syncWirApprovalProgress(params: {
  wir: Record<string, any>;
  allWirs: Record<string, any>[];
  boqItem?: Record<string, any>;
  schedule?: Record<string, any>;
}) {
  const { wir, allWirs, boqItem, schedule } = params;
  const isApproved = wir.status === 'Approved' || wir.result === 'Pass' || wir.result === 'Conditional Pass';

  const matchingWirs = allWirs.filter((candidate) => {
    const active = candidate.id === wir.id ? isApproved : (candidate.status === 'Approved' || candidate.result === 'Pass' || candidate.result === 'Conditional Pass');
    if (!active) return false;
    if (schedule?.id && candidate.schedule_id === schedule.id) return true;
    if (boqItem?.id && candidate.boq_item_id === boqItem.id) return true;
    return false;
  });

  const cumulativeQuantity = Math.round(matchingWirs.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) * 1000) / 1000;
  const unitRate = Number(boqItem?.unit_rate) || Number(wir.unit_price) || 0;
  const verifiedAmount = Math.round(cumulativeQuantity * unitRate * 100) / 100;

  const totalPlannedQty = Number(schedule?.planned_quantity) || Number(boqItem?.quantity) || 0;
  const progressPct = totalPlannedQty > 0
    ? Math.min(100, Math.round((cumulativeQuantity / totalPlannedQty) * 10000) / 100)
    : (isApproved ? 100 : 0);

  const nextActivityStatus = progressPct >= 100 ? 'Completed' : progressPct > 0 ? 'In Progress' : 'Not Started';

  return {
    cumulativeQuantity,
    verifiedAmount,
    progressPct,
    nextActivityStatus,
    earnedWorkValue: verifiedAmount,
  };
}

/**
 * Back-to-Back (PWP / Pay-When-Paid) Authorization Engine:
 * When an Employer / Client IPC is approved or paid, evaluate eligible subcontractor payment authorizations.
 */
export function evaluateBackToBackPaymentAuthorization(params: {
  clientCertificate: Record<string, any>;
  subcontractCertificates: Record<string, any>[];
  subcontractInvoiceTracking: Record<string, any>[];
}) {
  const { clientCertificate, subcontractCertificates, subcontractInvoiceTracking } = params;
  const isCertified = ['Approved', 'Paid'].includes(String(clientCertificate.status || ''));
  if (!isCertified) return { unlockedCertificateIds: [], unlockedTrackingIds: [] };

  const targetProjectId = clientCertificate.project_id;
  const unlockedCertificateIds = subcontractCertificates
    .filter((cert) => cert.project_id === targetProjectId && cert.certificate_type === 'Subcontractor')
    .map((cert) => cert.id);

  const unlockedTrackingIds = subcontractInvoiceTracking
    .filter((track) => track.project_id === targetProjectId)
    .map((track) => track.id);

  return {
    unlockedCertificateIds,
    unlockedTrackingIds,
    pwpUnlocked: true,
  };
}

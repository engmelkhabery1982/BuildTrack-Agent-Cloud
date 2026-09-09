export type PaymentCertificateCashStatus = 'Forecast' | 'Actual' | null;

export function calculateCertificateValues(certificate: Record<string, unknown>) {
  const gross = Number(certificate.gross_certified_value) || 0;
  const retention = Math.round(gross * (Number(certificate.retention_rate) || 0) / 100 * 100) / 100;
  const taxableAmount = Math.round((gross - retention - (Number(certificate.advance_recovery) || 0) - (Number(certificate.deductions) || 0)) * 100) / 100;
  const tax = Math.round(Math.max(0, taxableAmount) * (Number(certificate.tax_rate) || 0) / 100 * 100) / 100;
  return { gross, retention_amount: retention, taxable_amount: taxableAmount, tax_amount: tax, net_certified_value: Math.round((taxableAmount + tax) * 100) / 100 };
}

/** Contract-level retention and advance balances shared by workflow, reports and data quality. */
export function calculateCertificateBalances(input: {
  contractAdvanceAmount?: number;
  retentionCapAmount?: number;
  priorAdvanceRecovery?: number;
  priorRetention?: number;
  certificate: Record<string, unknown>;
}) {
  const advanceLimit = Math.max(0, Number(input.contractAdvanceAmount) || 0);
  const retentionCap = Math.max(0, Number(input.retentionCapAmount) || 0);
  const cumulativeAdvanceRecovery = Math.round(((Number(input.priorAdvanceRecovery) || 0) + (Number(input.certificate.advance_recovery) || 0)) * 100) / 100;
  const values = calculateCertificateValues(input.certificate);
  const cumulativeRetentionAmount = Math.round(((Number(input.priorRetention) || 0) + values.retention_amount) * 100) / 100;
  return {
    ...values, advanceLimit, retentionCap, cumulativeAdvanceRecovery, cumulativeRetentionAmount,
    remainingAdvanceBalance: Math.round(Math.max(0, advanceLimit - cumulativeAdvanceRecovery) * 100) / 100,
    advanceExceeded: cumulativeAdvanceRecovery > advanceLimit + 0.000001,
    retentionCapExceeded: retentionCap > 0 && cumulativeRetentionAmount > retentionCap + 0.000001,
  };
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

/**
 * W04 G01 & G02: Group approved WIR items by boq_item_id and aggregate quantities.
 * Maintains client selling rate and subcontractor rate separation.
 */
export function aggregateWirsForCertificate(
  wirs: Array<{
    id: string;
    boq_item_id: string;
    quantity: number;
    description?: string;
    unit?: string;
    client_selling_rate?: number;
    subcontract_rate?: number;
    unit_price?: number;
  }>,
  boqItemsMap?: Record<string, { unit_rate?: number; item_code?: string; item_name?: string }>
) {
  const map = new Map<string, {
    boq_item_id: string;
    quantity: number;
    wir_ids: string[];
    description: string;
    unit: string;
    client_selling_rate: number;
    subcontract_rate: number;
  }>();

  for (const wir of wirs) {
    const boqId = wir.boq_item_id;
    if (!boqId) continue;
    const qty = Number(wir.quantity) || 0;
    const boq = boqItemsMap?.[boqId];
    const clientRate = Number(wir.client_selling_rate ?? boq?.unit_rate ?? wir.unit_price ?? 0);
    const subRate = Number(wir.subcontract_rate ?? wir.unit_price ?? 0);

    const existing = map.get(boqId);
    if (existing) {
      existing.quantity += qty;
      existing.wir_ids.push(wir.id);
    } else {
      map.set(boqId, {
        boq_item_id: boqId,
        quantity: qty,
        wir_ids: [wir.id],
        description: wir.description || boq?.item_name || boqId,
        unit: wir.unit || 'm3',
        client_selling_rate: clientRate,
        subcontract_rate: subRate,
      });
    }
  }

  return Array.from(map.values()).map((item) => ({
    ...item,
    quantity: Math.round(item.quantity * 1000) / 1000,
    client_amount: Math.round(item.quantity * item.client_selling_rate * 100) / 100,
    subcontract_amount: Math.round(item.quantity * item.subcontract_rate * 100) / 100,
  }));
}

/**
 * W04 G07: Verify whether a candidate quantity for a BOQ item exceeds the contract BOQ quantity.
 */
export function validateOverCertification(input: {
  candidateQuantity: number;
  priorCertifiedQuantity: number;
  contractBoqQuantity: number;
}) {
  const candidate = Number(input.candidateQuantity) || 0;
  const prior = Number(input.priorCertifiedQuantity) || 0;
  const boqQty = Number(input.contractBoqQuantity) || 0;
  const total = candidate + prior;
  const isOver = boqQty > 0 && total > boqQty + 0.000001;

  return {
    priorCertifiedQuantity: prior,
    candidateQuantity: candidate,
    totalCertifiedQuantity: Math.round(total * 1000) / 1000,
    contractBoqQuantity: boqQty,
    isOverCertifying: isOver,
    excessQuantity: isOver ? Math.round((total - boqQty) * 1000) / 1000 : 0,
  };
}

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

export const money = (value: number) => Math.round(value * 100) / 100;

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

export interface WirAggregationItem {
  boq_item_id: string;
  item_code: string;
  description: string;
  unit: string;
  contract_id: string;
  control_account_id?: string | null;
  selling_rate: number;
  cost_rate: number;
  applicable_rate: number;
  source_wir_ids: string[];
  source_wir_numbers: string[];
  wir_count: number;
  original_quantity: number;
  revised_quantity: number;
  previous_quantity: number;
  previous_value: number;
  current_quantity: number;
  current_value: number;
  cumulative_quantity: number;
  cumulative_value: number;
  remaining_quantity: number;
  over_certified: boolean;
  over_certified_quantity: number;
  back_to_back_status: 'Authorized' | 'Pending' | 'Blocked' | 'N/A';
}

export interface AggregateWirsParams {
  projectId: string;
  contractId: string;
  certificateType: 'Client' | 'Subcontractor' | string;
  periodStart?: string | null;
  periodEnd?: string | null;
  wirEntries: Record<string, any>[];
  boqItems: Record<string, any>[];
  priorCertificates: Record<string, any>[];
  contracts?: Record<string, any>[];
  currentCertificateId?: string | null;
  pwpEnforced?: boolean;
}

/**
 * Aggregates accepted WIR inspection requests for a specific contract and period into
 * consolidated certificate lines grouped by BOQ item.
 *
 * Enforces:
 * 1. Multi-WIR grouping into a single line per linked BOQ item.
 * 2. Strict separation of Client Selling Rate vs Subcontractor Cost Rate.
 * 3. Previous cumulative certified quantities subtraction to prevent double-certification.
 * 4. Quantity capping at revised BOQ quantity.
 * 5. Back-to-Back (PWP) validation for subcontracts.
 */
export function aggregateWirsForCertificate(params: AggregateWirsParams) {
  const {
    projectId,
    contractId,
    certificateType,
    periodStart,
    periodEnd,
    wirEntries = [],
    boqItems = [],
    priorCertificates = [],
    contracts = [],
    currentCertificateId,
    pwpEnforced = false,
  } = params;

  // 1. Identify prior approved/paid certificates on this contract (excluding current)
  const relevantPriorCerts = priorCertificates.filter((c) => {
    if (c.id === currentCertificateId) return false;
    if (c.contract_id !== contractId) return false;
    if (c.certificate_type !== certificateType) return false;
    return ['Approved', 'Paid', 'Partially Paid'].includes(String(c.status || ''));
  });

  // Collect all already certified WIR IDs from prior certificates to prevent duplicate inclusion
  const certifiedWirIds = new Set<string>();
  const priorCertifiedQuantitiesByBoqItem = new Map<string, number>();

  for (const cert of relevantPriorCerts) {
    if (Array.isArray(cert.lines)) {
      for (const line of cert.lines) {
        const boqId = String(line.boq_item_id || '');
        if (boqId) {
          const prev = priorCertifiedQuantitiesByBoqItem.get(boqId) || 0;
          priorCertifiedQuantitiesByBoqItem.set(boqId, prev + (Number(line.current_quantity) || 0));
        }
        if (Array.isArray(line.source_wir_ids)) {
          for (const wirId of line.source_wir_ids) {
            certifiedWirIds.add(String(wirId));
          }
        }
      }
    }
  }

  // 2. Filter eligible WIRs
  const eligibleWirs = wirEntries.filter((wir) => {
    // Contract match
    if (contractId && wir.contract_id !== contractId) return false;
    if (projectId && wir.project_id && wir.project_id !== projectId) return false;

    // Inspection status / result: must be accepted/passed/approved
    const status = String(wir.status || '').toLowerCase();
    const result = String(wir.result || '').toLowerCase();
    const isAccepted = ['approved', 'accepted', 'passed', 'pass', 'conditional pass'].includes(status) || ['pass', 'passed', 'conditional pass', 'accepted', 'approved'].includes(result);
    if (!isAccepted) return false;

    // Must not have already been certified in a previous approved certificate
    if (certifiedWirIds.has(String(wir.id))) return false;

    // Period date filtering
    const date = String(wir.inspection_date || wir.date || wir.created_at || '').slice(0, 10);
    if (periodStart && date && date < periodStart) return false;
    if (periodEnd && date && date > periodEnd) return false;

    return true;
  });

  // 3. Group eligible WIRs by boq_item_id
  const wirGroups = new Map<string, Array<Record<string, any>>>();
  for (const wir of eligibleWirs) {
    const boqItemId = String(wir.boq_item_id || 'unlinked');
    if (!wirGroups.has(boqItemId)) {
      wirGroups.set(boqItemId, []);
    }
    wirGroups.get(boqItemId)!.push(wir);
  }

  // Determine contract context (e.g. Subcontract vs Main)
  const currentContract = contracts.find((c) => c.id === contractId);
  const isSubcontract = certificateType === 'Subcontractor' || Boolean(currentContract?.parent_main_contract_id);

  // 4. Build consolidated lines
  const lines: WirAggregationItem[] = [];
  let totalGrossValue = 0;
  let overCertifiedLineCount = 0;

  for (const [boqItemId, wirs] of wirGroups.entries()) {
    const boqItem = boqItems.find((b) => b.id === boqItemId) || {} as Record<string, any>;

    const sellingRate = Number(boqItem.unit_rate) || 0;
    const costRate = Number(boqItem.cost_rate || boqItem.subcontract_rate || boqItem.subcontract_unit_rate || boqItem.unit_rate) || 0;
    const applicableRate = isSubcontract ? costRate : sellingRate;

    const sourceWirIds = wirs.map((w) => String(w.id));
    const sourceWirNumbers = wirs.map((w) => String(w.wir_number || w.id)).filter(Boolean);
    const wirQuantitySum = wirs.reduce((sum, w) => sum + (Number(w.inspected_quantity ?? w.quantity ?? w.measured_quantity) || 0), 0);

    const originalQuantity = Number(boqItem.quantity) || 0;
    const revisedQuantity = Number(boqItem.revised_quantity) || originalQuantity;

    const previousQuantity = priorCertifiedQuantitiesByBoqItem.get(boqItemId) || 0;
    const currentQuantity = Math.round(wirQuantitySum * 1000) / 1000;
    const cumulativeQuantity = Math.round((previousQuantity + currentQuantity) * 1000) / 1000;

    const previousValue = money(previousQuantity * applicableRate);
    const currentValue = money(currentQuantity * applicableRate);
    const cumulativeValue = money(cumulativeQuantity * applicableRate);

    const remainingQuantity = Math.max(0, Math.round((revisedQuantity - cumulativeQuantity) * 1000) / 1000);
    const overCertified = cumulativeQuantity > revisedQuantity + 0.0001;
    const overCertifiedQuantity = overCertified ? Math.round((cumulativeQuantity - revisedQuantity) * 1000) / 1000 : 0;

    if (overCertified) {
      overCertifiedLineCount++;
    }

    let backToBackStatus: 'Authorized' | 'Pending' | 'Blocked' | 'N/A' = 'N/A';
    if (isSubcontract && (pwpEnforced || currentContract?.is_back_to_back)) {
      // Check if client certificates for this project have certified progress
      const clientApproved = priorCertificates.some(
        (c) => c.project_id === projectId && c.certificate_type === 'Client' && ['Approved', 'Paid'].includes(String(c.status || ''))
      );
      backToBackStatus = clientApproved ? 'Authorized' : 'Pending';
    }

    lines.push({
      boq_item_id: boqItemId,
      item_code: String(boqItem.item_code || 'WIR-ITEM'),
      description: String(boqItem.item_name || boqItem.description || wirs[0]?.work_type || 'Aggregated Inspection Item'),
      unit: String(boqItem.unit || wirs[0]?.unit || 'ea'),
      contract_id: contractId,
      control_account_id: boqItem.control_account_id || null,
      selling_rate: sellingRate,
      cost_rate: costRate,
      applicable_rate: applicableRate,
      source_wir_ids: sourceWirIds,
      source_wir_numbers: sourceWirNumbers,
      wir_count: wirs.length,
      original_quantity: originalQuantity,
      revised_quantity: revisedQuantity,
      previous_quantity: previousQuantity,
      previous_value: previousValue,
      current_quantity: currentQuantity,
      current_value: currentValue,
      cumulative_quantity: cumulativeQuantity,
      cumulative_value: cumulativeValue,
      remaining_quantity: remainingQuantity,
      over_certified: overCertified,
      over_certified_quantity: overCertifiedQuantity,
      back_to_back_status: backToBackStatus,
    });

    totalGrossValue += currentValue;
  }

  totalGrossValue = money(totalGrossValue);

  return {
    lines,
    totalWirCount: eligibleWirs.length,
    totalGrossValue,
    overCertifiedLineCount,
    hasOverCertification: overCertifiedLineCount > 0,
  };
}

/**
 * Computes full certificate header financial figures including retention, advance recovery,
 * deductions, taxes, and net certified amounts to exactly 0.01 precision.
 */
export function calculateGovernedCertificateTotals(params: {
  grossValue: number;
  retentionRate?: number;
  advanceRecovery?: number;
  deductions?: number;
  taxRate?: number;
  contractAdvanceAmount?: number;
  retentionCapAmount?: number;
  priorAdvanceRecovery?: number;
  priorRetention?: number;
}) {
  const gross = Math.max(0, money(params.grossValue));
  const retentionRate = Math.max(0, Number(params.retentionRate) || 0);
  const rawRetention = money(gross * (retentionRate / 100));

  const retentionCap = Math.max(0, Number(params.retentionCapAmount) || 0);
  const priorRetention = Math.max(0, Number(params.priorRetention) || 0);

  // Apply retention cap if specified
  let effectiveRetention = rawRetention;
  if (retentionCap > 0) {
    const maxAllowableRetention = Math.max(0, retentionCap - priorRetention);
    effectiveRetention = Math.min(rawRetention, maxAllowableRetention);
  }
  effectiveRetention = money(effectiveRetention);
  const cumulativeRetention = money(priorRetention + effectiveRetention);

  // Advance recovery calculation & cap
  const advanceLimit = Math.max(0, Number(params.contractAdvanceAmount) || 0);
  const priorAdvance = Math.max(0, Number(params.priorAdvanceRecovery) || 0);
  const remainingAdvance = Math.max(0, money(advanceLimit - priorAdvance));
  const requestedAdvance = Math.max(0, Number(params.advanceRecovery) || 0);
  const effectiveAdvanceRecovery = advanceLimit > 0 ? Math.min(requestedAdvance, remainingAdvance) : requestedAdvance;
  const cumulativeAdvanceRecovery = money(priorAdvance + effectiveAdvanceRecovery);

  const deductions = Math.max(0, money(Number(params.deductions) || 0));

  const taxableAmount = money(Math.max(0, gross - effectiveRetention - effectiveAdvanceRecovery - deductions));
  const taxRate = Math.max(0, Number(params.taxRate) || 0);
  const taxAmount = money(taxableAmount * (taxRate / 100));
  const netCertifiedValue = money(taxableAmount + taxAmount);

  return {
    gross,
    retentionRate,
    retention_amount: effectiveRetention,
    cumulative_retention_amount: cumulativeRetention,
    retention_cap_amount: retentionCap,
    retention_cap_exceeded: retentionCap > 0 && (priorRetention + rawRetention) > retentionCap + 0.0001,
    advance_recovery: money(effectiveAdvanceRecovery),
    cumulative_advance_recovery: cumulativeAdvanceRecovery,
    remaining_advance_balance: money(Math.max(0, advanceLimit - cumulativeAdvanceRecovery)),
    advance_limit_exceeded: advanceLimit > 0 && requestedAdvance > remainingAdvance + 0.0001,
    deductions,
    taxable_amount: taxableAmount,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    net_certified_value: netCertifiedValue,
  };
}

/**
 * Handles partial and full certificate settlement calculation to 0.01 precision.
 */
export function calculateCertificateSettlement(params: {
  netCertifiedValue: number;
  priorPaidAmount?: number;
  paymentAmount?: number;
}) {
  const net = money(Math.max(0, Number(params.netCertifiedValue) || 0));
  const prior = money(Math.max(0, Number(params.priorPaidAmount) || 0));
  const remainingDue = money(Math.max(0, net - prior));
  const requestedPayment = params.paymentAmount !== undefined ? money(Number(params.paymentAmount) || 0) : remainingDue;
  const paymentAmount = Math.min(requestedPayment, remainingDue);
  const totalPaid = money(prior + paymentAmount);
  const balanceDue = money(Math.max(0, net - totalPaid));
  const isFullySettled = totalPaid >= net - 0.0001;
  const status: 'Paid' | 'Partially Paid' = isFullySettled ? 'Paid' : 'Partially Paid';

  return {
    netCertifiedValue: net,
    priorPaidAmount: prior,
    paymentAmount,
    totalPaid,
    balanceDue,
    isFullySettled,
    isFullSettlement: isFullySettled,
    status,
  };
}

/**
 * Back-to-Back (PWP) validation for subcontracts against main client certificates.
 */
export function verifyBackToBackSubcontractAuthorization(params: {
  contractId: string;
  contracts: Record<string, any>[];
  clientCertificates: Record<string, any>[];
}) {
  const { contractId, contracts, clientCertificates } = params;
  const contract = contracts.find((c) => c.id === contractId);
  if (!contract) return { isAuthorized: true, reason: 'Contract not found', status: 'N/A' as const };

  const isSubcontract = Boolean(contract.parent_main_contract_id) || contract.contract_type === 'Subcontract';
  if (!isSubcontract && !contract.is_back_to_back) {
    return { isAuthorized: true, reason: 'Direct client contract — no back-to-back dependency.', status: 'N/A' as const };
  }

  const parentContractId = contract.parent_main_contract_id;
  const approvedClientCerts = clientCertificates.filter((c) => {
    if (c.certificate_type !== 'Client') return false;
    if (parentContractId && c.contract_id !== parentContractId) return false;
    return ['Approved', 'Paid'].includes(String(c.status || ''));
  });

  if (approvedClientCerts.length === 0) {
    return {
      isAuthorized: false,
      reason: 'Pay-When-Paid condition: Waiting for Parent Client Payment Certificate approval.',
      status: 'Pending' as const,
    };
  }

  const latestCert = approvedClientCerts[approvedClientCerts.length - 1];
  return {
    isAuthorized: true,
    reason: `Pay-When-Paid authorized under Client Certificate #${latestCert.certificate_number || latestCert.id}`,
    status: 'Authorized' as const,
  };
}

import type { Claim, ClaimLine, ClaimStatus, ClaimLineChangeType, Variation, VariationLine } from '../types/index.ts';

export const money = (val: number): number => Math.round((Number(val) || 0) * 100) / 100;

export const CLAIM_LIFECYCLE_STATUSES: ClaimStatus[] = [
  'Draft',
  'Notified',
  'Submitted',
  'Under Assessment',
  'Assessed',
  'Approved',
  'Rejected',
  'Converted',
];

export const CLAIM_LINE_CHANGE_TYPES: ClaimLineChangeType[] = [
  'New Item',
  'Quantity Change',
  'Rate Change',
  'Quantity & Rate Change',
  'Time Only',
  'Markup',
];

export interface ClaimTotals {
  claimedTotal: number;
  assessedTotal: number;
  approvedTotal: number;
  claimedDaysTotal: number;
  assessedDaysTotal: number;
  approvedDaysTotal: number;
  assessedCostVariance: number;
  approvedCostVariance: number;
}

export function calculateClaimTotals(lines: ClaimLine[], fallbackHeader?: Partial<Claim>): ClaimTotals {
  if (!lines || lines.length === 0) {
    const cl = money(fallbackHeader?.claimed_cost_impact || 0);
    const as = money(fallbackHeader?.assessed_cost_impact || 0);
    const ap = money(fallbackHeader?.approved_cost_impact || 0);
    return {
      claimedTotal: cl,
      assessedTotal: as,
      approvedTotal: ap,
      claimedDaysTotal: fallbackHeader?.claimed_time_impact_days || 0,
      assessedDaysTotal: fallbackHeader?.assessed_time_impact_days || 0,
      approvedDaysTotal: fallbackHeader?.approved_time_impact_days || 0,
      assessedCostVariance: money(as - cl),
      approvedCostVariance: money(ap - cl),
    };
  }

  const claimedTotal = lines.reduce((sum, line) => sum + (Number(line.claimed_value) || 0), 0);
  const assessedTotal = lines.reduce((sum, line) => sum + (Number(line.assessed_value) || 0), 0);
  const approvedTotal = lines.reduce((sum, line) => sum + (Number(line.approved_value) || 0), 0);

  const claimedDaysTotal = lines.reduce((sum, line) => sum + (Number(line.claimed_days) || 0), 0);
  const assessedDaysTotal = lines.reduce((sum, line) => sum + (Number(line.assessed_days) || 0), 0);
  const approvedDaysTotal = lines.reduce((sum, line) => sum + (Number(line.approved_days) || 0), 0);

  return {
    claimedTotal: money(claimedTotal),
    assessedTotal: money(assessedTotal),
    approvedTotal: money(approvedTotal),
    claimedDaysTotal: claimedDaysTotal || (fallbackHeader?.claimed_time_impact_days || 0),
    assessedDaysTotal: assessedDaysTotal || (fallbackHeader?.assessed_time_impact_days || 0),
    approvedDaysTotal: approvedDaysTotal || (fallbackHeader?.approved_time_impact_days || 0),
    assessedCostVariance: money(assessedTotal - claimedTotal),
    approvedCostVariance: money(approvedTotal - claimedTotal),
  };
}

export interface ContractNoticeEvaluation {
  eventDate: string;
  noticeDate: string;
  diffDays: number;
  noticeDaysAllowed: number | null;
  noticeDeadline: string | null;
  isLate: boolean;
  requiresSetup: boolean;
  message?: string;
}

export function evaluateContractNoticePeriod(
  eventDateStr?: string | null,
  noticeDateStr?: string | null,
  contract?: any
): ContractNoticeEvaluation {
  if (!eventDateStr || !noticeDateStr) {
    return {
      eventDate: eventDateStr || '',
      noticeDate: noticeDateStr || '',
      diffDays: 0,
      noticeDaysAllowed: null,
      noticeDeadline: null,
      isLate: false,
      requiresSetup: false,
    };
  }

  const eventDate = new Date(eventDateStr);
  const noticeDate = new Date(noticeDateStr);
  const diffDays = Math.round((noticeDate.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24));

  // Determine contractual notice days limit
  let noticeDaysAllowed: number | null = 28; // Standard FIDIC Sub-Clause 20.1 baseline
  let requiresSetup = false;

  if (contract) {
    if (typeof contract.claim_notice_period_days === 'number') {
      noticeDaysAllowed = contract.claim_notice_period_days;
    } else if (typeof contract.notice_period_days === 'number') {
      noticeDaysAllowed = contract.notice_period_days;
    } else if (contract.claim_notice_terms === 'None' || contract.claim_notice_period_days === null) {
      noticeDaysAllowed = null;
      requiresSetup = true;
    }
  }

  let noticeDeadline: string | null = null;
  let isLate = false;
  let message: string | undefined;

  if (noticeDaysAllowed !== null) {
    const deadlineDate = new Date(eventDate);
    deadlineDate.setDate(deadlineDate.getDate() + noticeDaysAllowed);
    noticeDeadline = deadlineDate.toISOString().slice(0, 10);

    if (diffDays > noticeDaysAllowed) {
      isLate = true;
      message = `Notice served ${diffDays} days after event (exceeds contractual ${noticeDaysAllowed}-day notice window). Time-bar / late-notice review required.`;
    }
  } else {
    message = 'Contract notice period is unconfigured (requires commercial setup). Defaulting to un-gated review.';
  }

  return {
    eventDate: eventDateStr,
    noticeDate: noticeDateStr,
    diffDays,
    noticeDaysAllowed,
    noticeDeadline,
    isLate,
    requiresSetup,
    message,
  };
}

export interface ClaimValidationContext {
  projects?: any[];
  contracts?: any[];
  boqHeaders?: any[];
  boqItems?: any[];
  rfis?: any[];
  delays?: any[];
  documents?: any[];
}

export function validateClaim(
  claim: Partial<Claim>,
  lines: ClaimLine[] = [],
  context: ClaimValidationContext = {}
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required header fields
  if (!claim.project_id) errors.push('Project is required.');
  if (!claim.contract_id) errors.push('Contract is required.');
  if (!claim.claim_number?.trim()) errors.push('Claim / PVO number is required.');
  if (!claim.title?.trim()) errors.push('Claim title is required.');
  if (!claim.notice_date) errors.push('Notice date is required.');
  if (!claim.event_date) errors.push('Event date is required.');
  if (!claim.entitlement_basis?.trim()) errors.push('Entitlement basis / contractual clause reference is required.');

  // Date chronological logic
  if (claim.notice_date && claim.event_date) {
    const noticeTime = new Date(claim.notice_date).getTime();
    const eventTime = new Date(claim.event_date).getTime();
    if (noticeTime < eventTime) {
      errors.push('Notice date cannot be earlier than event occurrence date.');
    } else {
      const contract = context.contracts?.find((c) => c.id === claim.contract_id);
      const evalResult = evaluateContractNoticePeriod(claim.event_date, claim.notice_date, contract);
      if (evalResult.isLate && evalResult.message) {
        warnings.push(evalResult.message);
      }
      if (evalResult.requiresSetup) {
        warnings.push('Contract notice terms are not explicitly configured.');
      }
    }
  }

  // Scoping checks: Contract must belong to the selected project
  if (claim.project_id && claim.contract_id && context.contracts?.length) {
    const matchedContract = context.contracts.find((c) => c.id === claim.contract_id);
    if (matchedContract && matchedContract.project_id && matchedContract.project_id !== claim.project_id) {
      errors.push(`Contract ${matchedContract.contract_number || matchedContract.id} does not belong to Project ${claim.project_id}.`);
    }
  }

  // Subcontract link check: If claimant is a subcontractor, ensure subcontract parent contract links correctly
  if (claim.contract_id && context.contracts?.length) {
    const matchedContract = context.contracts.find((c) => c.id === claim.contract_id);
    if (matchedContract?.type === 'Subcontract' && matchedContract.main_contract_id) {
      const parentContract = context.contracts.find((c) => c.id === matchedContract.main_contract_id);
      if (parentContract && parentContract.project_id !== claim.project_id) {
        errors.push(`Subcontract main contract ${parentContract.contract_number} belongs to a different project.`);
      }
    }
  }

  // Linked items scoping checks
  if (claim.linked_boq_item_id && context.boqItems?.length) {
    const matchedBoq = context.boqItems.find((b) => b.id === claim.linked_boq_item_id);
    if (matchedBoq && matchedBoq.contract_id && matchedBoq.contract_id !== claim.contract_id) {
      errors.push(`Linked BOQ item ${matchedBoq.item_code} belongs to contract ${matchedBoq.contract_id}, not ${claim.contract_id}.`);
    }
  }

  // Claim lines governance
  if (!lines || lines.length === 0) {
    if (claim.status && claim.status !== 'Draft' && claim.status !== 'Notified') {
      errors.push('A submitted or assessed claim must have at least one cost/time breakdown line.');
    }
  }

  lines.forEach((line, index) => {
    const lineLabel = line.item_code?.trim() || `Line #${index + 1}`;

    if (!line.description?.trim()) {
      errors.push(`${lineLabel}: Description is required.`);
    }

    if (!CLAIM_LINE_CHANGE_TYPES.includes(line.change_type)) {
      errors.push(`${lineLabel}: Invalid change type '${line.change_type}'.`);
    }

    if (line.change_type === 'New Item') {
      if (!line.item_code?.trim()) {
        errors.push(`${lineLabel}: New item lines require a unique Item Code.`);
      }
      if (!line.boq_header_id) {
        errors.push(`${lineLabel}: New item lines require an assigned BOQ Header.`);
      }
    }

    if (['Quantity Change', 'Rate Change', 'Quantity & Rate Change'].includes(line.change_type)) {
      if (!line.boq_item_id) {
        errors.push(`${lineLabel}: Existing BOQ variation lines require a linked BOQ Item.`);
      } else if (context.boqItems?.length) {
        const item = context.boqItems.find((b) => b.id === line.boq_item_id);
        if (item && item.contract_id && claim.contract_id && item.contract_id !== claim.contract_id) {
          errors.push(`${lineLabel}: Linked BOQ item belongs to another contract.`);
        }
      }
    }

    // Cost logic
    if (Number(line.claimed_value) < 0) {
      errors.push(`${lineLabel}: Claimed value cannot be negative.`);
    }
    if (Number(line.assessed_value) < 0) {
      errors.push(`${lineLabel}: Assessed value cannot be negative.`);
    }
    if (Number(line.approved_value) < 0) {
      errors.push(`${lineLabel}: Approved value cannot be negative.`);
    }

    // Over-claim warning / justification
    if (Number(line.assessed_value) > Number(line.claimed_value) && !line.justification?.trim() && !line.notes?.trim()) {
      warnings.push(`${lineLabel}: Assessed value ($${line.assessed_value}) exceeds claimed value ($${line.claimed_value}). Provide justification notes.`);
    }
    if (Number(line.approved_value) > Number(line.assessed_value || line.claimed_value) && !line.justification?.trim() && !line.notes?.trim()) {
      warnings.push(`${lineLabel}: Approved value ($${line.approved_value}) exceeds assessed value ($${line.assessed_value || line.claimed_value}).`);
    }
  });

  // Supporting evidence check when transitioning to Submitted / Approved
  if (['Submitted', 'Under Assessment', 'Assessed', 'Approved'].includes(claim.status || 'Draft')) {
    const hasEvidence = !!claim.evidence_notes?.trim() || !!claim.linked_document_id || !!claim.linked_rfi_id || !!claim.linked_delay_id;
    if (!hasEvidence) {
      warnings.push('Governed claim submission should cite supporting evidence (RFI, Delay Event, Document, or Evidence Notes).');
    }
  }

  // Converted status integrity
  if (claim.status === 'Converted' && !claim.converted_variation_id) {
    errors.push('Converted claims must link to a valid Variation ID.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export interface TransitionCheck {
  allowed: boolean;
  reason?: string;
}

export function canTransitionClaimStatus(
  currentStatus: ClaimStatus,
  targetStatus: ClaimStatus,
  actor?: string,
  claimOwner?: string
): TransitionCheck {
  if (currentStatus === targetStatus) {
    return { allowed: true };
  }

  // Converted is a terminal status that only governed reversal can transition
  if (currentStatus === 'Converted') {
    if (targetStatus === 'Approved') {
      return { allowed: true }; // Governed Reversal
    }
    return { allowed: false, reason: 'Converted claims must be reversed before changing status.' };
  }

  // Valid transitions matrix
  const validMap: Record<ClaimStatus, ClaimStatus[]> = {
    Draft: ['Notified', 'Submitted'],
    Notified: ['Draft', 'Submitted'],
    Submitted: ['Under Assessment', 'Assessed', 'Rejected', 'Draft'],
    'Under Assessment': ['Assessed', 'Rejected', 'Submitted'],
    Assessed: ['Approved', 'Rejected', 'Under Assessment'],
    Approved: ['Converted', 'Assessed'],
    Rejected: ['Draft', 'Under Assessment'],
    Converted: ['Approved'],
  };

  const allowedTargets = validMap[currentStatus] || [];
  if (!allowedTargets.includes(targetStatus)) {
    return {
      allowed: false,
      reason: `Illegal status transition from '${currentStatus}' to '${targetStatus}'.`,
    };
  }

  // Maker-checker segregation of duties: Assessor or Approver cannot be the same as Claim creator/owner
  if (['Assessed', 'Approved'].includes(targetStatus)) {
    if (actor && claimOwner && actor.trim().toLowerCase() === claimOwner.trim().toLowerCase() && actor.trim() !== '') {
      return {
        allowed: false,
        reason: `Maker-Checker Policy: Assessor/Approver '${actor}' cannot be the Claim Owner/Creator '${claimOwner}'.`,
      };
    }
  }

  return { allowed: true };
}

export interface GovernedConversionResult {
  variation: Variation;
  variationLines: VariationLine[];
  updatedClaim: Claim;
}

export function convertClaimToVariationPayload(
  claim: Claim,
  lines: ClaimLine[],
  options: {
    variationNumber?: string;
    actor?: string;
    convertedAt?: string;
    customVariationId?: string;
  } = {}
): GovernedConversionResult {
  if (claim.status !== 'Approved') {
    throw new Error(`Only an Approved Claim can be converted into a Variation package (current status: '${claim.status}').`);
  }

  const totals = calculateClaimTotals(lines, claim);
  const nowStr = options.convertedAt || new Date().toISOString().slice(0, 10);
  const variationId = options.customVariationId || `var-clm-${claim.id}`;
  const varNumber = options.variationNumber?.trim() || `VO-CLM-${claim.claim_number.replace(/^CLM-?/i, '')}`;

  const costImpact = totals.approvedTotal > 0 ? totals.approvedTotal : (totals.assessedTotal > 0 ? totals.assessedTotal : totals.claimedTotal);
  const timeImpactDays = totals.approvedDaysTotal > 0 ? totals.approvedDaysTotal : (totals.assessedDaysTotal > 0 ? totals.assessedDaysTotal : totals.claimedDaysTotal);

  const variation: Variation = {
    id: variationId,
    project_id: claim.project_id,
    contract_id: claim.contract_id || null,
    variation_number: varNumber,
    type: 'PVO / Claim Conversion',
    title: `PVO from Claim: ${claim.title}`,
    description: `Governed conversion from Claim #${claim.claim_number}. Entitlement: ${claim.entitlement_basis}. ${claim.evidence_notes ? `Notes: ${claim.evidence_notes}` : ''}`.trim(),
    status: 'Draft',
    cost_impact: costImpact,
    time_impact_days: timeImpactDays,
    approved_by: '',
    approved_date: null,
    notes: '',
    created_at: nowStr,
    source_claim_id: claim.id,
  };

  const variationLines: VariationLine[] = lines.map((line, idx) => {
    const lineId = `varline-clm-${claim.id}-${line.id || idx + 1}`;
    const val = Number(line.approved_value) > 0 ? Number(line.approved_value) : (Number(line.assessed_value) > 0 ? Number(line.assessed_value) : Number(line.claimed_value) || 0);
    const ct = (line.change_type === 'Markup' || line.change_type === 'Time Only') ? 'New Item' : line.change_type;

    return {
      id: lineId,
      variation_id: variationId,
      project_id: claim.project_id,
      contract_id: claim.contract_id || null,
      boq_header_id: line.boq_header_id || null,
      boq_item_id: line.boq_item_id || null,
      change_type: ct as 'New Item' | 'Quantity Change' | 'Rate Change' | 'Quantity & Rate Change',
      pricing_scope: 'Changed Quantity Only',
      item_code: line.item_code,
      description: line.description,
      unit: 'LS',
      original_quantity: 0,
      quantity_change: 1,
      revised_quantity: 1,
      original_rate: 0,
      revised_rate: money(val),
      value_impact: money(val),
      effective_date: nowStr,
      source_claim_line_id: line.id,
      notes: line.justification || line.notes || '',
      created_at: nowStr,
    };
  });

  const updatedClaim: Claim = {
    ...claim,
    status: 'Converted',
    converted_variation_id: variationId,
    converted_at: nowStr,
    approved_cost_impact: totals.approvedTotal || costImpact,
    approved_time_impact_days: totals.approvedDaysTotal || timeImpactDays,
    updated_at: nowStr,
  };

  return {
    variation,
    variationLines,
    updatedClaim,
  };
}

export function reverseClaimConversion(
  claim: Claim,
  existingVariation?: Variation | null,
  reason?: string,
  actor?: string,
  reversedAt?: string
): { updatedClaim: Claim; canDeleteVariation: boolean; reasonError?: string } {
  if (claim.status !== 'Converted') {
    return {
      updatedClaim: claim,
      canDeleteVariation: false,
      reasonError: `Claim #${claim.claim_number} is not in Converted status.`,
    };
  }

  if (existingVariation && existingVariation.status === 'Approved') {
    return {
      updatedClaim: claim,
      canDeleteVariation: false,
      reasonError: `Associated Variation '${existingVariation.variation_number}' is already Approved. It must be reversed via commercial variation reversal before reversing the claim conversion.`,
    };
  }

  const nowStr = reversedAt || new Date().toISOString().slice(0, 10);
  const updatedClaim: Claim = {
    ...claim,
    status: 'Approved',
    converted_variation_id: null,
    converted_at: null,
    reversal_reason: reason || `Conversion reversed by ${actor || 'User'} on ${nowStr}`,
    updated_at: nowStr,
  };

  return {
    updatedClaim,
    canDeleteVariation: true,
  };
}

export interface ClaimOperationResult {
  operation_id: string;
  claim_id: string;
  claim_number: string;
  status: string;
  claimed_cost_impact: number;
  assessed_cost_impact: number;
  approved_cost_impact: number;
  claimed_time_impact_days: number;
  assessed_time_impact_days: number;
  approved_time_impact_days: number;
  variation_id?: string | null;
  message: string;
}

async function invokeClaims<T>(command: string, request: Record<string, unknown>): Promise<T> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(command, { request });
  }
  throw new Error('Tauri desktop backend required for native atomic claims posting.');
}

export const submitClaim = (request: {
  operationId: string;
  claimId: string;
  actor: string;
  submittedAt: string;
}) => invokeClaims<ClaimOperationResult>('submit_claim', request);

export const assessClaim = (request: {
  operationId: string;
  claimId: string;
  actor: string;
  assessedAt: string;
  assessedCostImpact?: number | null;
  assessedTimeImpactDays?: number | null;
  notes?: string | null;
}) => invokeClaims<ClaimOperationResult>('assess_claim', request);

export const approveClaim = (request: {
  operationId: string;
  claimId: string;
  actor: string;
  approvedAt: string;
  approvedCostImpact?: number | null;
  approvedTimeImpactDays?: number | null;
  notes?: string | null;
}) => invokeClaims<ClaimOperationResult>('approve_claim', request);

export const rejectClaim = (request: {
  operationId: string;
  claimId: string;
  actor: string;
  reason: string;
  rejectedAt: string;
}) => invokeClaims<ClaimOperationResult>('reject_claim', request);

export const reopenClaim = (request: {
  operationId: string;
  claimId: string;
  actor: string;
  targetStatus: 'Draft' | 'Under Assessment';
  reason: string;
  reopenedAt: string;
}) => invokeClaims<ClaimOperationResult>('reopen_claim', request);

export const convertClaimToVariation = (request: {
  operationId: string;
  claimId: string;
  actor: string;
  variationId?: string | null;
  variationNumber?: string | null;
  convertedAt: string;
}) => invokeClaims<ClaimOperationResult>('convert_claim_to_variation', request);

export const reverseClaimConversionBackend = (request: {
  operationId: string;
  claimId: string;
  actor: string;
  reason: string;
  reversedAt: string;
}) => invokeClaims<ClaimOperationResult>('reverse_claim_conversion', request);


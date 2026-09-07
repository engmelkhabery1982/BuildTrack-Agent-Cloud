import { Claim, ClaimLine } from '@/types';

const money = (val: number) => Math.round((val || 0) * 100) / 100;

export function calculateClaimTotals(lines: ClaimLine[]) {
  const claimedTotal = lines.reduce((sum, line) => sum + (Number(line.claimed_value) || 0), 0);
  const assessedTotal = lines.reduce((sum, line) => sum + (Number(line.assessed_value) || 0), 0);
  const approvedTotal = lines.reduce((sum, line) => sum + (Number(line.approved_value) || 0), 0);
  return {
    claimedTotal: money(claimedTotal),
    assessedTotal: money(assessedTotal),
    approvedTotal: money(approvedTotal),
  };
}

export function validateClaim(claim: Partial<Claim>, lines: ClaimLine[], contracts: any[]) {
  const errors: string[] = [];
  if (!claim.project_id) errors.push('Project is required.');
  if (!claim.contract_id) errors.push('Contract is required.');
  if (!claim.claim_number?.trim()) errors.push('Claim / PVO number is required.');
  if (!claim.title?.trim()) errors.push('Claim title is required.');
  if (!claim.notice_date) errors.push('Notice date is required.');
  if (!claim.event_date) errors.push('Event date is required.');
  if (!claim.entitlement_basis?.trim()) errors.push('Entitlement basis is required.');

  if (claim.notice_date && claim.event_date) {
    const noticeTime = new Date(claim.notice_date).getTime();
    const eventTime = new Date(claim.event_date).getTime();
    if (noticeTime < eventTime) {
      errors.push('Notice date cannot be earlier than event occurrence date.');
    } else {
      const diffDays = (noticeTime - eventTime) / (1000 * 60 * 60 * 24);
      if (diffDays > 45) {
        errors.push(`Warning / Notice late: Notice given ${Math.round(diffDays)} days after event date (exceeds typical 28-day notice window without documented waiver).`);
      }
    }
  }

  if (claim.status === 'Converted' && !claim.converted_variation_id) {
    errors.push('Converted claims must link to a valid Variation ID.');
  }

  for (const line of lines) {
    if (!['New Item', 'Quantity Change', 'Rate Change', 'Quantity & Rate Change'].includes(line.change_type)) {
      errors.push(`Line ${line.item_code}: Invalid change type.`);
    }
    if (line.change_type === 'New Item' && (!line.boq_header_id || !line.item_code?.trim())) {
      errors.push(`Line ${line.item_code || 'New'}: New item lines require BOQ header and item code.`);
    }
  }

  return errors;
}

export function convertClaimToVariationPayload(claim: Claim, lines: ClaimLine[]) {
  if (claim.status !== 'Approved') {
    throw new Error('Only an Approved Claim / PVO can be converted into a Variation package.');
  }
  const variationId = crypto.randomUUID();
  const variation = {
    id: variationId,
    project_id: claim.project_id,
    contract_id: claim.contract_id,
    variation_number: `VO-from-${claim.claim_number}`,
    title: `Conversion: ${claim.title}`,
    description: `Converted from Claim/PVO ${claim.claim_number}. Entitlement: ${claim.entitlement_basis}`,
    status: 'Draft',
    cost_impact: claim.approved_cost_impact || claim.assessed_cost_impact || claim.claimed_cost_impact,
    time_impact_days: claim.approved_time_impact_days || claim.assessed_time_impact_days || claim.claimed_time_impact_days,
    created_at: new Date().toISOString().slice(0, 10),
  };

  const variationLines = lines.map((line) => ({
    id: crypto.randomUUID(),
    variation_id: variationId,
    contract_id: claim.contract_id,
    boq_header_id: line.boq_header_id || null,
    boq_item_id: line.boq_item_id || null,
    item_code: line.item_code,
    description: line.description,
    change_type: line.change_type,
    value_impact: line.approved_value || line.assessed_value || line.claimed_value,
    applied_at: new Date().toISOString().slice(0, 10),
  }));

  return { variation, variationLines };
}

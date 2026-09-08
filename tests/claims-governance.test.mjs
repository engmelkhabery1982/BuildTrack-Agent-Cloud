import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateClaimTotals,
  evaluateContractNoticePeriod,
  validateClaim,
  canTransitionClaimStatus,
  convertClaimToVariationPayload,
  reverseClaimConversion,
} from '../src/data/claims.ts';

test('W03 Claims: calculateClaimTotals computes correct sums and variances', () => {
  const lines = [
    {
      id: 'l1',
      claim_id: 'c1',
      contract_id: 'cnt-1',
      item_code: 'ITM-01',
      description: 'Ground obstruction excavation',
      change_type: 'Quantity Change',
      claimed_value: 50000,
      assessed_value: 40000,
      approved_value: 38000,
      claimed_days: 14,
      assessed_days: 10,
      approved_days: 10,
    },
    {
      id: 'l2',
      claim_id: 'c1',
      contract_id: 'cnt-1',
      item_code: 'ITM-02',
      description: 'Dewatering pump standby',
      change_type: 'New Item',
      claimed_value: 25000,
      assessed_value: 20000,
      approved_value: 20000,
      claimed_days: 7,
      assessed_days: 5,
      approved_days: 5,
    },
  ];

  const totals = calculateClaimTotals(lines);
  assert.equal(totals.claimedTotal, 75000);
  assert.equal(totals.assessedTotal, 60000);
  assert.equal(totals.approvedTotal, 58000);
  assert.equal(totals.claimedDaysTotal, 21);
  assert.equal(totals.assessedDaysTotal, 15);
  assert.equal(totals.approvedDaysTotal, 15);
  assert.equal(totals.assessedCostVariance, -15000);
  assert.equal(totals.approvedCostVariance, -17000);
});

test('W03 Claims: evaluateContractNoticePeriod detects contractual time-bar breaches', () => {
  const contract = {
    id: 'cnt-1',
    claim_notice_period_days: 28,
  };

  // Timely notice (10 days after event)
  const timely = evaluateContractNoticePeriod('2026-03-01', '2026-03-11', contract);
  assert.equal(timely.isLate, false);
  assert.equal(timely.diffDays, 10);
  assert.equal(timely.noticeDeadline, '2026-03-29');

  // Late notice (35 days after event)
  const late = evaluateContractNoticePeriod('2026-03-01', '2026-04-05', contract);
  assert.equal(late.isLate, true);
  assert.equal(late.diffDays, 35);
  assert.match(late.message || '', /served 35 days after/i);
});

test('W03 Claims: canTransitionClaimStatus enforces maker-checker segregation', () => {
  // Author cannot assess own claim
  const selfAssess = canTransitionClaimStatus('Submitted', 'Assessed', 'John Doe', 'John Doe');
  assert.equal(selfAssess.allowed, false);
  assert.match(selfAssess.reason || '', /Maker-Checker Policy/i);

  // Different user can assess
  const validAssess = canTransitionClaimStatus('Submitted', 'Assessed', 'Jane Smith', 'John Doe');
  assert.equal(validAssess.allowed, true);

  // Author cannot approve own claim
  const selfApprove = canTransitionClaimStatus('Assessed', 'Approved', 'John Doe', 'John Doe');
  assert.equal(selfApprove.allowed, false);

  // Invalid transition from Draft directly to Approved
  const invalidJump = canTransitionClaimStatus('Draft', 'Approved', 'Jane Smith', 'John Doe');
  assert.equal(invalidJump.allowed, false);
});

test('W03 Claims: validateClaim checks project scoping and mandatory entitlement', () => {
  const claim = {
    id: 'c1',
    claim_number: 'CLM-01',
    project_id: 'p1',
    contract_id: 'cnt-1',
    title: 'Rock excavation claim',
    notice_date: '2026-03-10',
    event_date: '2026-03-01',
    entitlement_basis: '', // empty entitlement
    status: 'Draft',
    claimed_cost_impact: 10000,
    claimed_time_impact_days: 5,
  };

  const lines = [
    {
      id: 'l1',
      claim_id: 'c1',
      contract_id: 'cnt-1',
      item_code: 'ITM-01',
      description: 'Rock breaking',
      change_type: 'New Item',
      claimed_value: 10000,
      claimed_days: 5,
    },
  ];

  const validation = validateClaim(claim, lines);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes('Entitlement basis')));
});

test('W03 Claims: convertClaimToVariationPayload generates PVO with line items', () => {
  const claim = {
    id: 'clm-100',
    claim_number: 'CLM-100',
    project_id: 'p1',
    contract_id: 'cnt-1',
    title: 'Additional piling depth',
    notice_date: '2026-03-10',
    event_date: '2026-03-01',
    entitlement_basis: 'Clause 4.12 unforeseen obstructions',
    status: 'Approved',
    approved_cost_impact: 85000,
    approved_time_impact_days: 12,
  };

  const lines = [
    {
      id: 'l1',
      claim_id: 'clm-100',
      contract_id: 'cnt-1',
      item_code: 'PIL-01',
      description: 'Extra pile boring 5m depth',
      change_type: 'Quantity Change',
      claimed_value: 95000,
      assessed_value: 85000,
      approved_value: 85000,
      claimed_days: 15,
      assessed_days: 12,
      approved_days: 12,
      boq_item_id: 'boq-itm-1',
    },
  ];

  const conversion = convertClaimToVariationPayload(claim, lines, {
    actor: 'Lead Engineer',
    convertedAt: '2026-03-15',
  });

  assert.equal(conversion.variation.source_claim_id, 'clm-100');
  assert.equal(conversion.variation.contract_id, 'cnt-1');
  assert.equal(conversion.variation.cost_impact, 85000);
  assert.equal(conversion.variation.time_impact_days, 12);
  assert.equal(conversion.variation.status, 'Draft');
  assert.equal(conversion.variationLines.length, 1);
  assert.equal(conversion.variationLines[0].source_claim_line_id, 'l1');
  assert.equal(conversion.variationLines[0].value_impact, 85000);
  assert.equal(conversion.updatedClaim.status, 'Converted');
  assert.equal(conversion.updatedClaim.converted_variation_id, conversion.variation.id);
});

test('W03 Claims: reverseClaimConversion safely reverts converted claim back to Approved', () => {
  const convertedClaim = {
    id: 'clm-100',
    claim_number: 'CLM-100',
    contract_id: 'cnt-1',
    status: 'Converted',
    converted_variation_id: 'var-100',
    converted_at: '2026-03-15',
  };

  // If variation is Draft, conversion can be reversed
  const draftVariation = {
    id: 'var-100',
    variation_number: 'VAR-100',
    status: 'Draft',
  };

  const result = reverseClaimConversion(convertedClaim, draftVariation, 'PVO package restructured', 'Director');
  assert.equal(result.canDeleteVariation, true);
  assert.equal(result.updatedClaim.status, 'Approved');
  assert.equal(result.updatedClaim.converted_variation_id, null);
  assert.match(result.updatedClaim.reversal_reason || '', /PVO package restructured/);

  // If variation is already Approved, cannot reverse without reversing variation first
  const approvedVariation = {
    id: 'var-100',
    variation_number: 'VAR-100',
    status: 'Approved',
  };
  const blockedResult = reverseClaimConversion(convertedClaim, approvedVariation, 'Reason', 'Director');
  assert.equal(blockedResult.canDeleteVariation, false);
  assert.match(blockedResult.reasonError || '', /already Approved/i);
});

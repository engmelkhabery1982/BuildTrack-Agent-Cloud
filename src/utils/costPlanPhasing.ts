import type {
  CostPlanVersion,
  CostPlanPeriod,
  DeliveryCostCurveType,
  CostPlanComparisonResult,
  CostPlanRollupSummary,
  CostPlanRollupGroup,
  CostPlanRollupPeriod,
} from '../types';

export interface GenerateCostPlanParams {
  deliveryCostBac: number;
  startDate: string;
  endDate: string;
  periodsCount?: number;
  frequency?: 'monthly' | 'weekly' | 'quarterly';
  curveType: DeliveryCostCurveType;
  manualWeights?: number[];
  manualPeriodCosts?: number[];
  dataDate: string;
  versionId?: string;
}

/**
 * Generate time-phased cost plan periods with penny-perfect reconciliation.
 * Strictly calculates delivery cost plan (never confuses revenue with cost).
 */
export function generateCostPlanPeriods(
  paramsOrBac: GenerateCostPlanParams | number,
  argStartDate?: string,
  argEndDate?: string,
  argCurveType?: DeliveryCostCurveType,
  argDataDate?: string,
  argVersionId?: string
): CostPlanPeriod[] {
  let params: GenerateCostPlanParams;
  if (typeof paramsOrBac === 'number') {
    params = {
      deliveryCostBac: paramsOrBac,
      startDate: argStartDate || new Date().toISOString().slice(0, 10),
      endDate: argEndDate || new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      curveType: argCurveType || 'Linear',
      dataDate: argDataDate || new Date().toISOString().slice(0, 10),
      versionId: argVersionId || 'draft-version',
    };
  } else {
    params = paramsOrBac;
  }

  const deliveryCostBac = params.deliveryCostBac;
  const startDate = params.startDate || new Date().toISOString().slice(0, 10);
  const endDate = params.endDate || new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const curveType: DeliveryCostCurveType = params.curveType || 'Linear';
  const manualWeights = params.manualWeights;
  const manualPeriodCosts = params.manualPeriodCosts;
  const dataDate = params.dataDate || new Date().toISOString().slice(0, 10);
  const versionId = params.versionId || 'draft-version';

  if (typeof deliveryCostBac !== 'number' || isNaN(deliveryCostBac) || deliveryCostBac <= 0) {
    throw new Error('Delivery Cost BAC must be a valid positive number. Revenue BAC cannot be used as cost plan.');
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
    throw new Error('Invalid cost plan date range: start date must be strictly before end date.');
  }

  // Determine period boundaries
  let periodsCount = params.periodsCount || 0;
  if (!periodsCount || periodsCount <= 0) {
    const diffMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    periodsCount = Math.max(1, diffMonths);
  }

  // Generate period dates
  const periodRanges: Array<{ start: string; end: string }> = [];
  const totalDurationMs = end.getTime() - start.getTime();
  const stepMs = totalDurationMs / periodsCount;

  for (let i = 0; i < periodsCount; i++) {
    const pStart = new Date(start.getTime() + i * stepMs);
    const pEnd = i === periodsCount - 1 ? end : new Date(start.getTime() + (i + 1) * stepMs - 86400000);
    periodRanges.push({
      start: pStart.toISOString().slice(0, 10),
      end: pEnd.toISOString().slice(0, 10),
    });
  }

  // Calculate raw weights or use manual costs
  let plannedCosts: number[] = [];

  if (curveType === 'Manual' && manualPeriodCosts && manualPeriodCosts.length === periodsCount) {
    // Manual cost overrides
    plannedCosts = manualPeriodCosts.map(c => Math.round((Number(c) || 0) * 100) / 100);
  } else {
    const rawWeights: number[] = [];
    if (curveType === 'Manual' && manualWeights && manualWeights.length === periodsCount) {
      rawWeights.push(...manualWeights.map(w => Math.max(0, Number(w) || 0)));
    } else {
      switch (curveType) {
        case 'Linear':
          for (let i = 0; i < periodsCount; i++) rawWeights.push(1.0);
          break;

        case 'Bell': {
          const mean = (periodsCount - 1) / 2;
          const stdDev = Math.max(0.5, periodsCount / 6);
          for (let i = 0; i < periodsCount; i++) {
            const exponent = -Math.pow(i - mean, 2) / (2 * Math.pow(stdDev, 2));
            rawWeights.push(Math.exp(exponent));
          }
          break;
        }

        case 'Front-loaded':
          for (let i = 0; i < periodsCount; i++) {
            rawWeights.push(Math.exp((-2 * i) / periodsCount));
          }
          break;

        case 'Back-loaded':
          for (let i = 0; i < periodsCount; i++) {
            rawWeights.push(Math.exp((2 * i) / periodsCount) - 0.5);
          }
          break;

        case 'S-Curve':
          for (let i = 0; i < periodsCount; i++) {
            const t = periodsCount > 1 ? i / (periodsCount - 1) : 0.5;
            const k = 10;
            const x = k * (t - 0.5);
            const sigmoid = 1 / (1 + Math.exp(-x));
            rawWeights.push(Math.max(0.01, sigmoid * (1 - sigmoid) * k));
          }
          break;

        default:
          for (let i = 0; i < periodsCount; i++) rawWeights.push(1.0);
      }
    }

    const totalWeight = rawWeights.reduce((s, w) => s + w, 0);
    const normalizedWeights = totalWeight > 0 ? rawWeights.map(w => w / totalWeight) : rawWeights.map(() => 1 / periodsCount);

    let allocatedTotal = 0;
    for (let i = 0; i < periodsCount; i++) {
      if (i === periodsCount - 1) {
        // Penny-perfect reconciliation: allocate remaining balance to the last period
        const remainder = Math.round((deliveryCostBac - allocatedTotal) * 100) / 100;
        plannedCosts.push(remainder);
      } else {
        const cost = Math.round(normalizedWeights[i] * deliveryCostBac * 100) / 100;
        plannedCosts.push(cost);
        allocatedTotal += cost;
      }
    }
  }

  // Enforce penny-perfect reconciliation on final sum
  const initialSum = plannedCosts.reduce((s, c) => s + c, 0);
  const drift = Math.round((deliveryCostBac - initialSum) * 100) / 100;
  if (Math.abs(drift) > 0 && periodsCount > 0) {
    // Find the last open period to absorb the penny adjustment
    let targetIdx = periodsCount - 1;
    for (let i = periodsCount - 1; i >= 0; i--) {
      if (periodRanges[i].end > dataDate) {
        targetIdx = i;
        break;
      }
    }
    plannedCosts[targetIdx] = Math.round((plannedCosts[targetIdx] + drift) * 100) / 100;
  }

  // Construct periods with cumulative progression
  const periods: CostPlanPeriod[] = [];
  let cumulative = 0;

  for (let i = 0; i < periodsCount; i++) {
    const pCost = plannedCosts[i];
    cumulative = Math.round((cumulative + pCost) * 100) / 100;
    const isClosed = periodRanges[i].end <= dataDate;
    const weightPct = deliveryCostBac > 0 ? Math.round((pCost / deliveryCostBac) * 10000) / 100 : 0;

    periods.push({
      id: `${versionId}-period-${i + 1}`,
      version_id: versionId,
      period_index: i,
      period_start: periodRanges[i].start,
      period_end: periodRanges[i].end,
      planned_cost: pCost,
      cumulative_cost: cumulative,
      weight_pct: weightPct,
      distribution_source: curveType,
      is_closed_period: isClosed,
    });
  }

  return periods;
}

/**
 * Validates a Cost Plan Version against governance rules:
 * - Proper project, main contract, and control account scope
 * - Genuine Delivery Cost BAC > 0 (strictly separated from Revenue BAC)
 * - Valid Data Date
 * - Complete penny reconciliation
 * - Immuntability of approved/superseded versions
 */
export function validateCostPlanVersion(
  version: Partial<CostPlanVersion>,
  existingVersions: CostPlanVersion[] | CostPlanVersion = []
): { valid: boolean; isValid: boolean; errors: string[] } {
  const existingList = Array.isArray(existingVersions)
    ? existingVersions
    : (existingVersions ? [existingVersions] : []);
  const errors: string[] = [];

  if (!version.project_id) errors.push('Project scope (project_id) is required.');
  if (!version.contract_id) errors.push('Main Contract scope (contract_id) is required.');
  if (!version.control_account_id) errors.push('Control Account scope (control_account_id) is required.');

  if (!version.version_code || !version.version_code.trim()) {
    errors.push('Version code is required.');
  }

  if (typeof version.delivery_cost_bac !== 'number' || isNaN(version.delivery_cost_bac) || version.delivery_cost_bac <= 0) {
    errors.push('Delivery Cost BAC must be a positive number. Revenue BAC cannot be substituted as cost.');
  }

  if (!version.data_date || !/^\d{4}-\d{2}-\d{2}$/.test(version.data_date)) {
    errors.push('A valid ISO Data Date (YYYY-MM-DD) is required.');
  }

  if (!version.periods || version.periods.length === 0) {
    errors.push('Cost plan must have at least one period.');
  } else {
    const sum = version.periods.reduce((s, p) => s + (Number(p.planned_cost) || 0), 0);
    const expectedBac = Number(version.delivery_cost_bac) || 0;
    if (Math.abs(sum - expectedBac) > 0.01) {
      errors.push(
        `Periods sum (${sum.toFixed(2)}) must equal Delivery Cost BAC (${expectedBac.toFixed(2)}) within 0.01.`
      );
    }
  }

  if (version.status === 'Approved') {
    if (!version.owner || !version.owner.trim()) {
      errors.push('Approved cost plan version requires an owner.');
    }
    if (!version.reason || !version.reason.trim()) {
      errors.push('Approved cost plan version requires a justification reason.');
    }
  }

  // Check immutability if updating an existing version
  if (version.id) {
    const existing = existingList.find(v => v.id === version.id);
    if (existing && (existing.status === 'Approved' || existing.status === 'Superseded')) {
      if (version.status === existing.status) {
        errors.push(`Approved or Superseded version (${existing.version_code}) is immutable and cannot be updated.`);
      } else if (existing.status === 'Approved' && version.status !== 'Superseded') {
        errors.push('Approved version may only transition to Superseded.');
      } else if (existing.status === 'Superseded') {
        errors.push('Superseded version is permanently locked and cannot change status.');
      }
    }
  }

  const isValid = errors.length === 0;
  return {
    valid: isValid,
    isValid,
    errors,
  };
}

/**
 * Compares two Cost Plan versions (base vs comparison) period-by-period.
 */
export function compareCostPlanVersions(
  baseVersion: CostPlanVersion,
  comparisonVersion: CostPlanVersion
): CostPlanComparisonResult {
  const totalBacDelta = Math.round((comparisonVersion.delivery_cost_bac - baseVersion.delivery_cost_bac) * 100) / 100;
  const deltaBacPct = baseVersion.delivery_cost_bac > 0 ? Math.round((totalBacDelta / baseVersion.delivery_cost_bac) * 10000) / 100 : 0;

  const maxPeriods = Math.max(baseVersion.periods.length, comparisonVersion.periods.length);
  const periodsDelta: CostPlanComparisonResult['periodsDelta'] = [];
  const period_comparisons: CostPlanComparisonResult['period_comparisons'] = [];
  let peakPeriodDelta = { periodIndex: 0, deltaCost: 0 };

  let firstHalfDelta = 0;
  let secondHalfDelta = 0;
  const halfPoint = Math.floor(maxPeriods / 2);

  for (let i = 0; i < maxPeriods; i++) {
    const baseP = baseVersion.periods[i];
    const compP = comparisonVersion.periods[i];

    const basePlanned = baseP ? baseP.planned_cost : 0;
    const compPlanned = compP ? compP.planned_cost : 0;
    const delta = Math.round((compPlanned - basePlanned) * 100) / 100;

    const baseCum = baseP ? baseP.cumulative_cost : baseVersion.delivery_cost_bac;
    const compCum = compP ? compP.cumulative_cost : comparisonVersion.delivery_cost_bac;
    const cumDelta = Math.round((compCum - baseCum) * 100) / 100;

    const pStart = compP?.period_start || baseP?.period_start || '';
    const pEnd = compP?.period_end || baseP?.period_end || '';

    periodsDelta.push({
      periodIndex: i,
      periodStart: pStart,
      periodEnd: pEnd,
      basePlannedCost: basePlanned,
      comparisonPlannedCost: compPlanned,
      deltaCost: delta,
      baseCumulativeCost: baseCum,
      comparisonCumulativeCost: compCum,
      cumulativeDelta: cumDelta,
    });

    period_comparisons.push({
      period_start: pStart,
      period_end: pEnd,
      v1_planned: basePlanned,
      v2_planned: compPlanned,
      delta_planned: delta,
      v1_cumulative: baseCum,
      v2_cumulative: compCum,
      delta_cumulative: cumDelta,
    });

    if (Math.abs(delta) > Math.abs(peakPeriodDelta.deltaCost)) {
      peakPeriodDelta = { periodIndex: i, deltaCost: delta };
    }

    if (i < halfPoint) {
      firstHalfDelta += delta;
    } else {
      secondHalfDelta += delta;
    }
  }

  // Calculate cumulative delta at data date
  const targetDataDate = comparisonVersion.data_date || baseVersion.data_date || '';
  let deltaCumAtDataDate = 0;
  for (let i = periodsDelta.length - 1; i >= 0; i--) {
    if (!targetDataDate || periodsDelta[i].periodStart <= targetDataDate) {
      deltaCumAtDataDate = periodsDelta[i].cumulativeDelta;
      break;
    }
  }

  const shiftDirection = firstHalfDelta > secondHalfDelta + 0.01
    ? 'front-loaded'
    : secondHalfDelta > firstHalfDelta + 0.01
    ? 'back-loaded'
    : 'neutral';

  return {
    baseVersion,
    comparisonVersion,
    totalBacDelta,
    delta_bac: totalBacDelta,
    delta_bac_pct: deltaBacPct,
    delta_cumulative_at_data_date: deltaCumAtDataDate,
    max_period_delta: Math.abs(peakPeriodDelta.deltaCost),
    shift_direction: shiftDirection,
    period_comparisons,
    periodsDelta,
    peakPeriodDelta,
  };
}

/**
 * Rolls up time-phased cost plans from Control Accounts to WBS, CBS/Cost Code, and Project.
 */
export function rollupCostPlans(
  versions: CostPlanVersion[],
  levelOrDataDate?: 'project' | 'wbs' | 'cost_code' | string,
  options?: {
    wbsNodes?: Array<{ id: string; wbs_code?: string; wbs_name?: string }>;
    costCodes?: Array<{ id: string; code?: string; title?: string }>;
    projectId?: string;
  }
): CostPlanRollupSummary {
  const rollupLevel =
    levelOrDataDate === 'project' || levelOrDataDate === 'cost_code' || levelOrDataDate === 'wbs'
      ? levelOrDataDate
      : 'wbs';
  const dataDate =
    levelOrDataDate && /^\d{4}-\d{2}-\d{2}$/.test(levelOrDataDate)
      ? levelOrDataDate
      : new Date().toISOString().slice(0, 10);

  const wbsMap = new Map<string, { code: string; name: string }>();
  (options?.wbsNodes || []).forEach(w => {
    wbsMap.set(w.id, { code: w.wbs_code || w.id, name: w.wbs_name || w.wbs_code || w.id });
  });

  const costCodeMap = new Map<string, { code: string; title: string }>();
  (options?.costCodes || []).forEach(c => {
    costCodeMap.set(c.id, { code: c.code || c.id, title: c.title || c.code || c.id });
  });

  // Group approved versions by rollup level
  const groupsMap = new Map<string, { totalBac: number; periodsMap: Map<string, { start: string; end: string; planned: number }> }>();

  versions.forEach(v => {
    let groupId: string;
    if (rollupLevel === 'project') {
      groupId = v.project_id || 'Project';
    } else if (rollupLevel === 'cost_code') {
      groupId = v.cost_code_id || 'unassigned_cbs';
    } else {
      groupId = v.wbs_id || 'unassigned_wbs';
    }

    if (!groupsMap.has(groupId)) {
      groupsMap.set(groupId, { totalBac: 0, periodsMap: new Map() });
    }
    const grp = groupsMap.get(groupId)!;
    grp.totalBac = Math.round((grp.totalBac + v.delivery_cost_bac) * 100) / 100;

    v.periods.forEach(p => {
      const pKey = `${p.period_start}_${p.period_end}`;
      const existing = grp.periodsMap.get(pKey);
      if (existing) {
        existing.planned = Math.round((existing.planned + p.planned_cost) * 100) / 100;
      } else {
        grp.periodsMap.set(pKey, { start: p.period_start, end: p.period_end, planned: p.planned_cost });
      }
    });
  });

  const rollupGroups: CostPlanRollupGroup[] = Array.from(groupsMap.entries()).map(([groupId, grp]) => {
    const sortedPeriods = Array.from(grp.periodsMap.values()).sort((a, b) => a.start.localeCompare(b.start));
    let cum = 0;
    const periods: CostPlanRollupPeriod[] = sortedPeriods.map(p => {
      cum = Math.round((cum + p.planned) * 100) / 100;
      return {
        period_start: p.start,
        period_end: p.end,
        planned_cost: p.planned,
        cumulative_cost: cum,
      };
    });

    return {
      group_id: groupId,
      total_bac: grp.totalBac,
      periods,
    };
  });

  const byWbs: Record<string, { wbsId: string; wbsCode: string; wbsName: string; totalCost: number; periods: Record<string, number> }> = {};
  const byCostCode: Record<string, { costCodeId: string; code: string; title: string; totalCost: number; periods: Record<string, number> }> = {};
  const timelineMap = new Map<string, { start: string; end: string; planned: number }>();

  versions.forEach(v => {
    const wId = v.wbs_id || 'unassigned_wbs';
    const wInfo = wbsMap.get(wId) || { code: wId, name: 'General Work' };
    if (!byWbs[wId]) {
      byWbs[wId] = { wbsId: wId, wbsCode: wInfo.code, wbsName: wInfo.name, totalCost: 0, periods: {} };
    }
    byWbs[wId].totalCost = Math.round((byWbs[wId].totalCost + v.delivery_cost_bac) * 100) / 100;

    const cId = v.cost_code_id || 'unassigned_cbs';
    const cInfo = costCodeMap.get(cId) || { code: cId, title: 'General Delivery Cost' };
    if (!byCostCode[cId]) {
      byCostCode[cId] = { costCodeId: cId, code: cInfo.code, title: cInfo.title, totalCost: 0, periods: {} };
    }
    byCostCode[cId].totalCost = Math.round((byCostCode[cId].totalCost + v.delivery_cost_bac) * 100) / 100;

    v.periods.forEach(p => {
      const periodKey = `${p.period_start}_${p.period_end}`;
      byWbs[wId].periods[periodKey] = Math.round(((byWbs[wId].periods[periodKey] || 0) + p.planned_cost) * 100) / 100;
      byCostCode[cId].periods[periodKey] = Math.round(((byCostCode[cId].periods[periodKey] || 0) + p.planned_cost) * 100) / 100;

      const existing = timelineMap.get(periodKey);
      if (existing) {
        existing.planned = Math.round((existing.planned + p.planned_cost) * 100) / 100;
      } else {
        timelineMap.set(periodKey, { start: p.period_start, end: p.period_end, planned: p.planned_cost });
      }
    });
  });

  const timelineSorted = Array.from(timelineMap.values()).sort((a, b) => a.start.localeCompare(b.start));
  let cumulative = 0;
  const timeline = timelineSorted.map(t => {
    cumulative = Math.round((cumulative + t.planned) * 100) / 100;
    return {
      periodStart: t.start,
      periodEnd: t.end,
      plannedCost: t.planned,
      cumulativeCost: cumulative,
    };
  });

  const result = rollupGroups as CostPlanRollupSummary;
  result.projectId = options?.projectId || versions[0]?.project_id || '';
  result.contractId = versions[0]?.contract_id;
  result.dataDate = dataDate;
  result.totalDeliveryCostBac = Math.round(versions.reduce((sum, v) => sum + v.delivery_cost_bac, 0) * 100) / 100;
  result.controlAccountCount = versions.length;
  result.byWbs = byWbs;
  result.byCostCode = byCostCode;
  result.timeline = timeline;

  return result;
}

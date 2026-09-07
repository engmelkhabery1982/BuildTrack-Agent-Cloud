import { approvedBaselinePlanForActivity } from '../data/baselineGovernance.ts';
import { selectPrimaryContracts } from '../data/contractRules.ts';
import { distributedPlannedValueToDate, scheduleBudget } from './schedulePlanning.ts';
import { procurementPostingState } from './commercialControl.ts';
import { calculateEvmAtDataDate } from './evm.ts';

const money = (value: number) => Math.round(value * 100) / 100;
const dateKey = (value: unknown) => String(value || '').slice(0, 10);
const datedThrough = (value: unknown, dataDate: string) => {
  const d = dateKey(value);
  return Boolean(d && d <= dataDate);
};
const approvedWir = (wir: Record<string, any>) => wir.status === 'Approved' || wir.result === 'Pass' || wir.result === 'Conditional Pass';
const contractEligibleAtDataDate = (c: Record<string, any>, dataDate: string) => {
  const d = dateKey(c.signed_date || c.start_date);
  return !d || d <= dataDate;
};

export interface KpiContributionItem {
  id: string;
  sourceTable: string;
  sourceId?: string;
  code?: string;
  title: string;
  projectId: string;
  contractId?: string;
  date?: string;
  status?: string;
  category?: string;
  amount: number;
  sharePct?: number;
  details?: Record<string, any>;
}

export interface KpiExclusionItem {
  id: string;
  sourceTable: string;
  sourceId?: string;
  code?: string;
  title: string;
  projectId?: string;
  contractId?: string;
  date?: string;
  status?: string;
  amount?: number;
  reason: string;
}

export interface KpiReconciliationResult {
  kpiKey: string;
  kpiLabel: string;
  category: 'Commercial' | 'EVM' | 'Cost' | 'Cash' | 'Governance';
  value: number | null;
  formattedValue: string;
  unit?: string;
  dataDate: string;
  projectId: string;
  projectName: string;
  contractIds: string[];
  basis: string;
  formula: string;
  contributions: KpiContributionItem[];
  exclusions: KpiExclusionItem[];
  reconciliationTotal: number;
  discrepancy: number;
  isReconciled: boolean;
  status: 'Ready' | 'Unavailable' | 'Approved Baseline Required';
  notes?: string;
}

export interface KpiReconciliationInput {
  projectId: string;
  dataDate: string;
  projects: Record<string, any>[];
  contracts: Record<string, any>[];
  variations: Record<string, any>[];
  schedules: Record<string, any>[];
  scheduleDistributions: Record<string, any>[];
  baselines: Record<string, any>[];
  wirEntries: Record<string, any>[];
  progressCorrections?: Record<string, any>[];
  boqItems: Record<string, any>[];
  costEntries: Record<string, any>[];
  procurement?: Record<string, any>[];
  procurementReceipts?: Record<string, any>[];
  cashFlow?: Record<string, any>[];
  controlAccounts?: Record<string, any>[];
  costPlanVersions?: Record<string, any>[];
  contractSovLines?: Record<string, any>[];
}

/**
 * Reconcile Modified Contract Value:
 * Value = Primary Contracts (signed/start <= Data Date) + Approved Variations (approved <= Data Date)
 */
export function reconcileModifiedContractValue(input: KpiReconciliationInput): KpiReconciliationResult {
  const dataDate = dateKey(input.dataDate);
  const pid = input.projectId;
  const projectMap = new Map(input.projects.map((p) => [String(p.id), p]));
  const projectName = pid === 'all' ? 'All Projects (Portfolio)' : (projectMap.get(pid)?.name || `Project ${pid}`);

  const scopedProjects = pid === 'all' ? input.projects : input.projects.filter((p) => String(p.id) === pid);
  const scopedProjectIds = new Set(scopedProjects.map((p) => String(p.id)));

  // Contract analysis
  const primaryContracts = selectPrimaryContracts(input.contracts as any[]);
  const primaryContractIds = new Set(primaryContracts.map((c) => String(c.id)));
  const scopedPrimaryContractIds = new Set(primaryContracts
    .filter((c) => scopedProjectIds.has(String(c.project_id || '')))
    .map((c) => String(c.id)));

  const contributions: KpiContributionItem[] = [];
  const exclusions: KpiExclusionItem[] = [];

  // Evaluate all contracts
  input.contracts.forEach((contract) => {
    const cProjectId = String(contract.project_id || '');
    const cId = String(contract.id || '');
    const cCode = contract.contract_number || contract.contract_code || cId;
    const cTitle = contract.name || contract.title || `Contract ${cCode}`;
    const cValue = Number(contract.contract_value) || 0;
    const cDate = dateKey(contract.signed_date || contract.start_date);
    const isPrimary = primaryContractIds.has(cId);

    if (!scopedProjectIds.has(cProjectId)) {
      exclusions.push({
        id: cId, sourceTable: 'contracts', code: cCode, title: cTitle, projectId: cProjectId, contractId: cId,
        date: cDate, status: contract.status, amount: cValue,
        reason: `Project ID (${cProjectId}) does not match active filter (${pid})`,
      });
      return;
    }

    if (!isPrimary) {
      exclusions.push({
        id: cId, sourceTable: 'contracts', code: cCode, title: cTitle, projectId: cProjectId, contractId: cId,
        date: cDate, status: contract.status, amount: cValue,
        reason: contract.parent_main_contract_id ? 'Subcontract (rolled up under main contract)' : 'Non-primary contract type',
      });
      return;
    }

    if (cDate && cDate > dataDate) {
      exclusions.push({
        id: cId, sourceTable: 'contracts', code: cCode, title: cTitle, projectId: cProjectId, contractId: cId,
        date: cDate, status: contract.status, amount: cValue,
        reason: `Signed/Start date (${cDate}) is after Data Date cut-off (${dataDate})`,
      });
      return;
    }

    contributions.push({
      id: cId, sourceTable: 'contracts', sourceId: cId, code: cCode, title: cTitle, projectId: cProjectId, contractId: cId,
      date: cDate, status: contract.status, category: 'Base Contract', amount: money(cValue),
    });
  });

  // Evaluate all variations
  input.variations.forEach((variation) => {
    const vProjectId = String(variation.project_id || '');
    const vContractId = String(variation.contract_id || '');
    const vId = String(variation.id || '');
    const vCode = variation.variation_number || variation.variation_code || vId;
    const vTitle = variation.title || variation.description || `Variation ${vCode}`;
    const vAmount = Number(variation.cost_impact) || 0;
    const vDate = dateKey(variation.approved_date || variation.submission_date);

    if (vProjectId && !scopedProjectIds.has(vProjectId)) {
      exclusions.push({
        id: vId, sourceTable: 'variations', code: vCode, title: vTitle, projectId: vProjectId, contractId: vContractId,
        date: vDate, status: variation.status, amount: vAmount,
        reason: `Project ID (${vProjectId}) does not match active filter (${pid})`,
      });
      return;
    }

    if (vContractId && !scopedPrimaryContractIds.has(vContractId)) {
      exclusions.push({
        id: vId, sourceTable: 'variations', code: vCode, title: vTitle, projectId: vProjectId, contractId: vContractId,
        date: vDate, status: variation.status, amount: vAmount,
        reason: `Contract ID (${vContractId}) is not in scoped primary contracts`,
      });
      return;
    }

    if (variation.status !== 'Approved') {
      exclusions.push({
        id: vId, sourceTable: 'variations', code: vCode, title: vTitle, projectId: vProjectId, contractId: vContractId,
        date: vDate, status: variation.status, amount: vAmount,
        reason: `Status is "${variation.status || 'Draft'}" (Only "Approved" variations modify contract value)`,
      });
      return;
    }

    const appDate = dateKey(variation.approved_date);
    if (!appDate || appDate > dataDate) {
      exclusions.push({
        id: vId, sourceTable: 'variations', code: vCode, title: vTitle, projectId: vProjectId, contractId: vContractId,
        date: appDate || 'N/A', status: variation.status, amount: vAmount,
        reason: appDate ? `Approval date (${appDate}) is after Data Date cut-off (${dataDate})` : 'Missing approved_date',
      });
      return;
    }

    contributions.push({
      id: vId, sourceTable: 'variations', sourceId: vId, code: vCode, title: vTitle, projectId: vProjectId, contractId: vContractId,
      date: appDate, status: variation.status, category: 'Approved Variation', amount: money(vAmount),
    });
  });

  const reconciliationTotal = money(contributions.reduce((s, c) => s + c.amount, 0));
  const baseValue = reconciliationTotal;

  contributions.forEach((c) => {
    c.sharePct = baseValue > 0 ? money((c.amount / baseValue) * 100) : 0;
  });

  return {
    kpiKey: 'modified_contract_value',
    kpiLabel: 'Modified Contract Value',
    category: 'Commercial',
    value: baseValue,
    formattedValue: `$${baseValue.toLocaleString()}`,
    dataDate,
    projectId: pid,
    projectName,
    contractIds: [...scopedPrimaryContractIds],
    basis: 'Sum of primary signed contract values (on or before Data Date) plus approved variations (approved on or before Data Date).',
    formula: 'Modified Contract Value = Σ(Primary Contracts ≤ Data Date) + Σ(Approved Variations ≤ Data Date)',
    contributions,
    exclusions,
    reconciliationTotal,
    discrepancy: 0,
    isReconciled: true,
    status: 'Ready',
  };
}

/**
 * Reconcile Revenue Planned Value (PV):
 * Sum of time-phased planned value for approved baseline schedules through Data Date.
 */
export function reconcileRevenuePv(input: KpiReconciliationInput): KpiReconciliationResult {
  const dataDate = dateKey(input.dataDate);
  const pid = input.projectId;
  const projectMap = new Map(input.projects.map((p) => [String(p.id), p]));
  const projectName = pid === 'all' ? 'All Projects (Portfolio)' : (projectMap.get(pid)?.name || `Project ${pid}`);

  const scopedProjects = pid === 'all' ? input.projects : input.projects.filter((p) => String(p.id) === pid);
  const scopedProjectIds = new Set(scopedProjects.map((p) => String(p.id)));

  const primaryContracts = selectPrimaryContracts(input.contracts as any[])
    .filter((c) => contractEligibleAtDataDate(c, dataDate) && (pid === 'all' || String(c.project_id) === pid));
  const contractIds = new Set(primaryContracts.map((c) => String(c.id)));

  const contributions: KpiContributionItem[] = [];
  const exclusions: KpiExclusionItem[] = [];

  const evmResult = calculateEvmAtDataDate({
    contractIds: [...contractIds],
    dataDate,
    schedules: input.schedules,
    scheduleDistributions: input.scheduleDistributions,
    baselines: input.baselines,
    wirEntries: input.wirEntries,
    progressCorrections: input.progressCorrections,
    boqItems: input.boqItems,
    costEntries: input.costEntries,
    controlAccounts: input.controlAccounts,
    costPlanVersions: input.costPlanVersions,
    contractSovLines: input.contractSovLines,
    procurement: input.procurement,
    procurementReceipts: input.procurementReceipts,
  });

  const activities = input.schedules.filter((s) => contractIds.has(String(s.contract_id || '')) && String(s.activity || '').trim());
  const activityIds = new Set(activities.map((a) => String(a.id)));

  // Check all schedules
  input.schedules.forEach((sch) => {
    const sId = String(sch.id || '');
    const sProjectId = String(sch.project_id || '');
    const sContractId = String(sch.contract_id || '');
    const sCode = sch.activity_code || sId;
    const sTitle = sch.activity || `Activity ${sCode}`;
    const budget = scheduleBudget(sch);

    if (!scopedProjectIds.has(sProjectId)) {
      exclusions.push({
        id: sId, sourceTable: 'schedules', code: sCode, title: sTitle, projectId: sProjectId, contractId: sContractId,
        amount: budget, reason: `Project ID (${sProjectId}) does not match active filter (${pid})`,
      });
      return;
    }

    if (!contractIds.has(sContractId)) {
      exclusions.push({
        id: sId, sourceTable: 'schedules', code: sCode, title: sTitle, projectId: sProjectId, contractId: sContractId,
        amount: budget, reason: `Contract ID (${sContractId}) is not in active primary contracts for Data Date`,
      });
      return;
    }

    const plan = approvedBaselinePlanForActivity(sch, input.scheduleDistributions, input.baselines);
    const pvToDate = distributedPlannedValueToDate(plan.activity, plan.distributions, dataDate);

    if (pvToDate <= 0) {
      exclusions.push({
        id: sId, sourceTable: 'schedules', code: sCode, title: sTitle, projectId: sProjectId, contractId: sContractId,
        amount: budget, date: sch.start_date, status: sch.status,
        reason: `No planned value distributed on or before Data Date (${dataDate})`,
      });
      return;
    }

    contributions.push({
      id: sId, sourceTable: 'schedules', sourceId: sId, code: sCode, title: sTitle, projectId: sProjectId, contractId: sContractId,
      date: plan.activity.start_date, status: plan.activity.status, category: 'Schedule Baseline PV',
      amount: money(pvToDate), details: { totalBudget: budget, method: sch.measurement_method || 'Linear Distribution' },
    });
  });

  const reconciliationTotal = money(contributions.reduce((s, c) => s + c.amount, 0));
  const targetValue = evmResult.revenue.PV;
  const discrepancy = money(Math.abs(reconciliationTotal - targetValue));

  contributions.forEach((c) => {
    c.sharePct = reconciliationTotal > 0 ? money((c.amount / reconciliationTotal) * 100) : 0;
  });

  return {
    kpiKey: 'revenue_pv',
    kpiLabel: 'Revenue Planned Value (PV)',
    category: 'EVM',
    value: targetValue,
    formattedValue: `$${targetValue.toLocaleString()}`,
    dataDate,
    projectId: pid,
    projectName,
    contractIds: [...contractIds],
    basis: 'Time-phased planned value of approved baseline schedule activities up to Data Date cut-off.',
    formula: 'Revenue PV = Σ(Planned Value Distributed to Date for Approved Baseline Activities)',
    contributions,
    exclusions,
    reconciliationTotal,
    discrepancy,
    isReconciled: discrepancy <= 0.01,
    status: 'Ready',
  };
}

/**
 * Reconcile Revenue Earned Value (EV):
 * Sum of approved WIR inspections, explicit activity measurement progress, and posted progress corrections.
 */
export function reconcileRevenueEv(input: KpiReconciliationInput): KpiReconciliationResult {
  const dataDate = dateKey(input.dataDate);
  const pid = input.projectId;
  const projectMap = new Map(input.projects.map((p) => [String(p.id), p]));
  const projectName = pid === 'all' ? 'All Projects (Portfolio)' : (projectMap.get(pid)?.name || `Project ${pid}`);

  const scopedProjects = pid === 'all' ? input.projects : input.projects.filter((p) => String(p.id) === pid);
  const scopedProjectIds = new Set(scopedProjects.map((p) => String(p.id)));

  const primaryContracts = selectPrimaryContracts(input.contracts as any[])
    .filter((c) => contractEligibleAtDataDate(c, dataDate) && (pid === 'all' || String(c.project_id) === pid));
  const contractIds = new Set(primaryContracts.map((c) => String(c.id)));

  const performanceContracts = input.contracts
    .filter((c) => scopedProjectIds.has(String(c.project_id || '')));
  const performanceContractIds = new Set(performanceContracts.map((c) => String(c.id)));

  const boqById = new Map(input.boqItems.map((item) => [String(item.id), item]));
  const wirById = new Map(input.wirEntries.map((wir) => [String(wir.id), wir]));

  const contributions: KpiContributionItem[] = [];
  const exclusions: KpiExclusionItem[] = [];

  const evmResult = calculateEvmAtDataDate({
    contractIds: [...contractIds],
    performanceContractIds: [...performanceContractIds],
    dataDate,
    schedules: input.schedules,
    scheduleDistributions: input.scheduleDistributions,
    baselines: input.baselines,
    wirEntries: input.wirEntries,
    progressCorrections: input.progressCorrections,
    boqItems: input.boqItems,
    costEntries: input.costEntries,
    controlAccounts: input.controlAccounts,
    costPlanVersions: input.costPlanVersions,
    contractSovLines: input.contractSovLines,
    procurement: input.procurement,
    procurementReceipts: input.procurementReceipts,
  });

  const activities = input.schedules.filter((s) => contractIds.has(String(s.contract_id || '')) && String(s.activity || '').trim());
  const explicitActivities = new Map(activities.filter((a) => String(a.measurement_method || '').trim()).map((a) => [String(a.id), a]));

  // 1. Process Explicit Measurement Activities
  explicitActivities.forEach((activity, actId) => {
    const method = String(activity.measurement_method);
    const budget = scheduleBudget(activity);
    const actCode = activity.activity_code || actId;
    const actTitle = activity.activity || `Activity ${actCode}`;

    if (method === 'Quantity') {
      const actWirs = input.wirEntries.filter((wir) => String(wir.schedule_id || '') === actId && datedThrough(wir.inspection_date, dataDate) && approvedWir(wir));
      const wirEarned = actWirs.reduce((sum, wir) => {
        const item = boqById.get(String(wir.boq_item_id || ''));
        const mainItem = item?.main_boq_item_id ? boqById.get(String(item.main_boq_item_id)) : item;
        return sum + (Number(wir.quantity) || 0) * (Number(mainItem?.unit_rate ?? wir.unit_price) || 0);
      }, 0);

      if (wirEarned > 0) {
        contributions.push({
          id: `act-ev-${actId}`, sourceTable: 'schedules', sourceId: actId, code: actCode, title: `${actTitle} (Quantity WIRs)`,
          projectId: String(activity.project_id || ''), contractId: String(activity.contract_id || ''),
          date: activity.actual_finish_date || dataDate, status: activity.status, category: 'Explicit Method (Quantity)',
          amount: money(wirEarned),
        });
      }
    } else if (method === '0/100') {
      const isCompleted = activity.activity_status === 'Completed' && datedThrough(activity.actual_finish_date || activity.status_data_date, dataDate);
      if (isCompleted) {
        contributions.push({
          id: `act-ev-${actId}`, sourceTable: 'schedules', sourceId: actId, code: actCode, title: `${actTitle} (100% Completed)`,
          projectId: String(activity.project_id || ''), contractId: String(activity.contract_id || ''),
          date: activity.actual_finish_date || dataDate, status: 'Completed', category: 'Explicit Method (0/100)',
          amount: money(budget),
        });
      } else {
        exclusions.push({
          id: actId, sourceTable: 'schedules', code: actCode, title: actTitle,
          projectId: String(activity.project_id || ''), contractId: String(activity.contract_id || ''),
          amount: budget, reason: 'Activity with 0/100 method is not completed on or before Data Date',
        });
      }
    } else if (method === '50/50') {
      const isCompleted = activity.activity_status === 'Completed' && datedThrough(activity.actual_finish_date || activity.status_data_date, dataDate);
      const isStarted = datedThrough(activity.actual_start_date || activity.status_data_date, dataDate);
      if (isCompleted) {
        contributions.push({
          id: `act-ev-${actId}`, sourceTable: 'schedules', sourceId: actId, code: actCode, title: `${actTitle} (50/50 Complete)`,
          projectId: String(activity.project_id || ''), contractId: String(activity.contract_id || ''),
          date: activity.actual_finish_date || dataDate, status: 'Completed', category: 'Explicit Method (50/50)',
          amount: money(budget),
        });
      } else if (isStarted) {
        contributions.push({
          id: `act-ev-${actId}`, sourceTable: 'schedules', sourceId: actId, code: actCode, title: `${actTitle} (50/50 Started)`,
          projectId: String(activity.project_id || ''), contractId: String(activity.contract_id || ''),
          date: activity.actual_start_date || dataDate, status: 'In Progress', category: 'Explicit Method (50/50)',
          amount: money(budget * 0.5),
        });
      } else {
        exclusions.push({
          id: actId, sourceTable: 'schedules', code: actCode, title: actTitle,
          projectId: String(activity.project_id || ''), contractId: String(activity.contract_id || ''),
          amount: budget, reason: 'Activity with 50/50 method is not started on or before Data Date',
        });
      }
    } else if (method === 'Weighted Milestone') {
      const weight = Math.max(0, Math.min(100, Number(activity.measurement_weight_pct) || 0)) / 100;
      const earned = budget * weight;
      if (earned > 0) {
        contributions.push({
          id: `act-ev-${actId}`, sourceTable: 'schedules', sourceId: actId, code: actCode, title: `${actTitle} (Milestone ${activity.measurement_weight_pct}%)`,
          projectId: String(activity.project_id || ''), contractId: String(activity.contract_id || ''),
          date: activity.status_data_date || dataDate, status: activity.status, category: 'Explicit Method (Milestone)',
          amount: money(earned),
        });
      }
    }
  });

  // 2. Process WIR Entries (Legacy & Standard BOQ links)
  input.wirEntries.forEach((wir) => {
    const wId = String(wir.id || '');
    const wProjectId = String(wir.project_id || '');
    const wContractId = String(wir.contract_id || '');
    const wCode = wir.wir_number || wir.wir_code || wId;
    const wDate = dateKey(wir.inspection_date);
    const item = boqById.get(String(wir.boq_item_id || ''));
    const mainItem = item?.main_boq_item_id ? boqById.get(String(item.main_boq_item_id)) : item;
    const rate = Number(mainItem?.unit_rate ?? wir.unit_price) || 0;
    const qty = Number(wir.quantity) || 0;
    const amount = qty * rate;
    const wTitle = wir.description || item?.description || `WIR Inspection ${wCode}`;

    if (!scopedProjectIds.has(wProjectId)) {
      exclusions.push({
        id: wId, sourceTable: 'wir_entries', code: wCode, title: wTitle, projectId: wProjectId, contractId: wContractId,
        date: wDate, status: wir.status, amount, reason: `Project ID (${wProjectId}) does not match active filter (${pid})`,
      });
      return;
    }

    if (!performanceContractIds.has(wContractId)) {
      exclusions.push({
        id: wId, sourceTable: 'wir_entries', code: wCode, title: wTitle, projectId: wProjectId, contractId: wContractId,
        date: wDate, status: wir.status, amount, reason: `Contract ID (${wContractId}) is outside scoped performance contracts`,
      });
      return;
    }

    if (!approvedWir(wir)) {
      exclusions.push({
        id: wId, sourceTable: 'wir_entries', code: wCode, title: wTitle, projectId: wProjectId, contractId: wContractId,
        date: wDate, status: wir.status, amount, reason: `WIR status is "${wir.status || 'Open'}" / result "${wir.result || 'Pending'}" (Approved/Pass required)`,
      });
      return;
    }

    if (!wDate || wDate > dataDate) {
      exclusions.push({
        id: wId, sourceTable: 'wir_entries', code: wCode, title: wTitle, projectId: wProjectId, contractId: wContractId,
        date: wDate || 'N/A', status: wir.status, amount, reason: wDate ? `Inspection date (${wDate}) is after Data Date (${dataDate})` : 'Missing inspection date',
      });
      return;
    }

    // If explicit schedule activity already claimed this WIR under 'Quantity', avoid double-counting in legacy list
    if (explicitActivities.has(String(wir.schedule_id || ''))) {
      return;
    }

    contributions.push({
      id: wId, sourceTable: 'wir_entries', sourceId: wId, code: wCode, title: wTitle, projectId: wProjectId, contractId: wContractId,
      date: wDate, status: wir.status, category: 'Approved WIR Inspection', amount: money(amount),
      details: { quantity: qty, unitRate: rate, boqItemCode: item?.item_code || item?.code },
    });
  });

  // 3. Process Progress Corrections
  (input.progressCorrections || []).forEach((corr) => {
    const cId = String(corr.id || '');
    const cProjectId = String(corr.project_id || '');
    const cDate = dateKey(corr.effective_date);
    const original = wirById.get(String(corr.original_wir_id || ''));
    const item = boqById.get(String(original?.boq_item_id || ''));
    const mainItem = item?.main_boq_item_id ? boqById.get(String(item.main_boq_item_id)) : item;
    const rate = Number(mainItem?.unit_rate ?? original?.unit_price) || 0;
    const qty = Number(corr.quantity) || 0;
    const rawAmount = qty * rate;
    const signedAmount = String(corr.correction_type) === 'Reinstatement' ? rawAmount : -rawAmount;
    const cTitle = corr.reason || `Correction for WIR ${corr.original_wir_id}`;

    if (!scopedProjectIds.has(cProjectId)) {
      exclusions.push({
        id: cId, sourceTable: 'progress_corrections', title: cTitle, projectId: cProjectId,
        date: cDate, status: corr.status, amount: signedAmount, reason: `Project ID (${cProjectId}) does not match filter (${pid})`,
      });
      return;
    }

    if (corr.status !== 'Posted') {
      exclusions.push({
        id: cId, sourceTable: 'progress_corrections', title: cTitle, projectId: cProjectId,
        date: cDate, status: corr.status, amount: signedAmount, reason: `Status is "${corr.status}" (Posted status required)`,
      });
      return;
    }

    if (!cDate || cDate > dataDate) {
      exclusions.push({
        id: cId, sourceTable: 'progress_corrections', title: cTitle, projectId: cProjectId,
        date: cDate || 'N/A', status: corr.status, amount: signedAmount, reason: cDate ? `Effective date (${cDate}) is after Data Date (${dataDate})` : 'Missing date',
      });
      return;
    }

    contributions.push({
      id: cId, sourceTable: 'progress_corrections', sourceId: cId, title: cTitle, projectId: cProjectId,
      date: cDate, status: corr.status, category: `Progress Correction (${corr.correction_type || 'Adjustment'})`,
      amount: money(signedAmount), details: { originalWirId: corr.original_wir_id, quantity: qty, unitRate: rate },
    });
  });

  const reconciliationTotal = money(Math.max(0, contributions.reduce((s, c) => s + c.amount, 0)));
  const targetValue = evmResult.revenue.EV;
  const discrepancy = money(Math.abs(reconciliationTotal - targetValue));

  contributions.forEach((c) => {
    c.sharePct = reconciliationTotal > 0 ? money((c.amount / reconciliationTotal) * 100) : 0;
  });

  return {
    kpiKey: 'revenue_ev',
    kpiLabel: 'Revenue Earned Value (EV)',
    category: 'EVM',
    value: targetValue,
    formattedValue: `$${targetValue.toLocaleString()}`,
    dataDate,
    projectId: pid,
    projectName,
    contractIds: [...contractIds],
    basis: 'Approved physical work inspected (WIR) and milestone measurements evaluated at selling rate up to Data Date cut-off.',
    formula: 'Revenue EV = Σ(Approved WIR Qty × Selling Rate) + Σ(Explicit Milestone EV) + Σ(Posted Corrections)',
    contributions,
    exclusions,
    reconciliationTotal,
    discrepancy,
    isReconciled: discrepancy <= 0.01,
    status: 'Ready',
  };
}

/**
 * Reconcile Delivery Actual Cost (AC):
 * Direct cost entries (<= Data Date) + Accepted Procurement Receipts not already posted as direct costs.
 */
export function reconcileDeliveryAc(input: KpiReconciliationInput): KpiReconciliationResult {
  const dataDate = dateKey(input.dataDate);
  const pid = input.projectId;
  const projectMap = new Map(input.projects.map((p) => [String(p.id), p]));
  const projectName = pid === 'all' ? 'All Projects (Portfolio)' : (projectMap.get(pid)?.name || `Project ${pid}`);

  const scopedProjects = pid === 'all' ? input.projects : input.projects.filter((p) => String(p.id) === pid);
  const scopedProjectIds = new Set(scopedProjects.map((p) => String(p.id)));

  const performanceContracts = input.contracts
    .filter((c) => scopedProjectIds.has(String(c.project_id || '')));
  const performanceContractIds = new Set(performanceContracts.map((c) => String(c.id)));
  const primaryContractIds = selectPrimaryContracts(input.contracts as any[])
    .filter((c) => scopedProjectIds.has(String(c.project_id || '')))
    .map((c) => String(c.id));

  const evmResult = calculateEvmAtDataDate({
    contractIds: primaryContractIds,
    performanceContractIds: [...performanceContractIds],
    dataDate,
    schedules: input.schedules,
    scheduleDistributions: input.scheduleDistributions,
    baselines: input.baselines,
    wirEntries: input.wirEntries,
    progressCorrections: input.progressCorrections,
    boqItems: input.boqItems,
    costEntries: input.costEntries,
    controlAccounts: input.controlAccounts,
    costPlanVersions: input.costPlanVersions,
    contractSovLines: input.contractSovLines,
    procurement: input.procurement,
    procurementReceipts: input.procurementReceipts,
  });

  const contributions: KpiContributionItem[] = [];
  const exclusions: KpiExclusionItem[] = [];

  const postedReceiptIds = new Set(
    input.costEntries
      .filter((entry) => entry.source_type === 'procurement_receipt' && datedThrough(entry.date, dataDate))
      .map((entry) => String(entry.source_id || ''))
  );

  // 1. Process Cost Entries
  input.costEntries.forEach((entry) => {
    const eId = String(entry.id || '');
    const eProjectId = String(entry.project_id || '');
    const eContractId = String(entry.contract_id || '');
    const eDate = dateKey(entry.date);
    const amount = Number(entry.amount) || 0;
    const eTitle = entry.description || entry.notes || `Cost Entry ${eId}`;
    const eCategory = entry.category || entry.cost_type || 'General Cost';

    if (!scopedProjectIds.has(eProjectId)) {
      exclusions.push({
        id: eId, sourceTable: 'cost_entries', title: eTitle, projectId: eProjectId, contractId: eContractId,
        date: eDate, status: entry.status, amount, reason: `Project ID (${eProjectId}) does not match active filter (${pid})`,
      });
      return;
    }

    if (!performanceContractIds.has(eContractId)) {
      exclusions.push({
        id: eId, sourceTable: 'cost_entries', title: eTitle, projectId: eProjectId, contractId: eContractId,
        date: eDate, status: entry.status, amount, reason: `Contract ID (${eContractId}) is outside scoped performance contracts`,
      });
      return;
    }

    if (!eDate || eDate > dataDate) {
      exclusions.push({
        id: eId, sourceTable: 'cost_entries', title: eTitle, projectId: eProjectId, contractId: eContractId,
        date: eDate || 'N/A', status: entry.status, amount, reason: eDate ? `Transaction date (${eDate}) is after Data Date (${dataDate})` : 'Missing transaction date',
      });
      return;
    }

    contributions.push({
      id: eId, sourceTable: 'cost_entries', sourceId: entry.source_id || eId, code: entry.cost_code || eId,
      title: eTitle, projectId: eProjectId, contractId: eContractId, date: eDate, status: entry.status || 'Posted',
      category: `Direct Cost (${eCategory})`, amount: money(amount),
    });
  });

  // 2. Process Procurement Receipts (GRNs)
  (input.procurementReceipts || []).forEach((receipt) => {
    const rId = String(receipt.id || '');
    const rProjectId = String(receipt.project_id || '');
    const rContractId = String(receipt.contract_id || '');
    const rCode = receipt.receipt_number || receipt.grn_number || rId;
    const rDate = dateKey(receipt.receipt_date);
    const rTitle = receipt.item_name || receipt.description || `Receipt GRN ${rCode}`;
    const amount = Number(receipt.accepted_amount) || ((Number(receipt.accepted_quantity) || 0) * (Number(receipt.unit_cost) || 0));

    if (!scopedProjectIds.has(rProjectId)) {
      exclusions.push({
        id: rId, sourceTable: 'procurement_receipts', code: rCode, title: rTitle, projectId: rProjectId, contractId: rContractId,
        date: rDate, status: receipt.status, amount, reason: `Project ID (${rProjectId}) does not match filter (${pid})`,
      });
      return;
    }

    if (!performanceContractIds.has(rContractId)) {
      exclusions.push({
        id: rId, sourceTable: 'procurement_receipts', code: rCode, title: rTitle, projectId: rProjectId, contractId: rContractId,
        date: rDate, status: receipt.status, amount, reason: `Contract ID (${rContractId || 'missing'}) is outside scoped performance contracts`,
      });
      return;
    }

    if (receipt.status !== 'Accepted') {
      exclusions.push({
        id: rId, sourceTable: 'procurement_receipts', code: rCode, title: rTitle, projectId: rProjectId, contractId: rContractId,
        date: rDate, status: receipt.status, amount, reason: `Receipt status is "${receipt.status || 'Draft'}" (Accepted status required)`,
      });
      return;
    }

    if (!rDate || rDate > dataDate) {
      exclusions.push({
        id: rId, sourceTable: 'procurement_receipts', code: rCode, title: rTitle, projectId: rProjectId, contractId: rContractId,
        date: rDate || 'N/A', status: receipt.status, amount, reason: rDate ? `Receipt date (${rDate}) is after Data Date (${dataDate})` : 'Missing receipt date',
      });
      return;
    }

    if (postedReceiptIds.has(rId)) {
      exclusions.push({
        id: rId, sourceTable: 'procurement_receipts', code: rCode, title: rTitle, projectId: rProjectId, contractId: rContractId,
        date: rDate, status: receipt.status, amount, reason: 'Already posted into direct cost entries (preventing double-counting)',
      });
      return;
    }

    contributions.push({
      id: rId, sourceTable: 'procurement_receipts', sourceId: rId, code: rCode, title: rTitle,
      projectId: rProjectId, contractId: rContractId, date: rDate, status: receipt.status,
      category: 'Accepted Procurement Receipt (GRN)', amount: money(amount),
    });
  });

  const reconciliationTotal = money(contributions.reduce((s, c) => s + c.amount, 0));
  const targetValue = evmResult.cost.AC;
  const discrepancy = money(Math.abs(reconciliationTotal - targetValue));

  contributions.forEach((c) => {
    c.sharePct = reconciliationTotal > 0 ? money((c.amount / reconciliationTotal) * 100) : 0;
  });

  return {
    kpiKey: 'delivery_ac',
    kpiLabel: 'Delivery Actual Cost (AC)',
    category: 'Cost',
    value: targetValue,
    formattedValue: `$${targetValue.toLocaleString()}`,
    dataDate,
    projectId: pid,
    projectName,
    contractIds: [...performanceContractIds],
    basis: 'Sum of direct actual cost entries and unposted accepted procurement receipts on or before Data Date cut-off.',
    formula: 'Delivery AC = Σ(Direct Cost Entries ≤ Data Date) + Σ(Accepted GRN Receipts not already posted)',
    contributions,
    exclusions,
    reconciliationTotal,
    discrepancy,
    isReconciled: discrepancy <= 0.01,
    status: 'Ready',
  };
}

/**
 * Reconcile Open Commitments:
 * Ordered PO commitments minus accepted receipt actuals.
 */
export function reconcileCommitments(input: KpiReconciliationInput): KpiReconciliationResult {
  const dataDate = dateKey(input.dataDate);
  const pid = input.projectId;
  const projectMap = new Map(input.projects.map((p) => [String(p.id), p]));
  const projectName = pid === 'all' ? 'All Projects (Portfolio)' : (projectMap.get(pid)?.name || `Project ${pid}`);

  const scopedProjects = pid === 'all' ? input.projects : input.projects.filter((p) => String(p.id) === pid);
  const scopedProjectIds = new Set(scopedProjects.map((p) => String(p.id)));
  const performanceContractIds = new Set(input.contracts
    .filter((c) => scopedProjectIds.has(String(c.project_id || '')))
    .map((c) => String(c.id)));

  const contributions: KpiContributionItem[] = [];
  const exclusions: KpiExclusionItem[] = [];

  const receiptsByPo = new Map<string, number>();
  (input.procurementReceipts || []).forEach((receipt) => {
    if (performanceContractIds.has(String(receipt.contract_id || '')) && receipt.status === 'Accepted' && datedThrough(receipt.receipt_date, dataDate)) {
      const poId = String(receipt.procurement_id || '');
      const cost = Number(receipt.accepted_amount) || ((Number(receipt.accepted_quantity) || 0) * (Number(receipt.unit_cost) || 0));
      receiptsByPo.set(poId, (receiptsByPo.get(poId) || 0) + cost);
    }
  });

  (input.procurement || []).forEach((po) => {
    const poId = String(po.id || '');
    const poProjectId = String(po.project_id || '');
    const poCode = po.po_number || po.order_code || poId;
    const poTitle = po.item_name || po.description || `Purchase Order ${poCode}`;
    const poDate = dateKey(po.order_date);
    const totalOrderCost = Number(po.total_cost) || ((Number(po.quantity) || 0) * (Number(po.unit_cost) || 0));
    const posting = procurementPostingState(po);

    if (!scopedProjectIds.has(poProjectId)) {
      exclusions.push({
        id: poId, sourceTable: 'procurement', code: poCode, title: poTitle, projectId: poProjectId,
        date: poDate, status: po.status, amount: totalOrderCost, reason: `Project ID (${poProjectId}) does not match filter (${pid})`,
      });
      return;
    }

    if (!performanceContractIds.has(String(po.contract_id || ''))) {
      exclusions.push({
        id: poId, sourceTable: 'procurement', code: poCode, title: poTitle, projectId: poProjectId,
        contractId: String(po.contract_id || ''), date: poDate, status: po.status, amount: totalOrderCost,
        reason: `Contract ID (${String(po.contract_id || 'missing')}) is outside scoped performance contracts`,
      });
      return;
    }

    if (!posting.isCommitment) {
      exclusions.push({
        id: poId, sourceTable: 'procurement', code: poCode, title: poTitle, projectId: poProjectId,
        date: poDate, status: po.status, amount: totalOrderCost, reason: `Status is "${po.status || 'Draft'}" (Ordered/Commitment status required)`,
      });
      return;
    }

    if (!poDate || poDate > dataDate) {
      exclusions.push({
        id: poId, sourceTable: 'procurement', code: poCode, title: poTitle, projectId: poProjectId,
        date: poDate || 'N/A', status: po.status, amount: totalOrderCost, reason: poDate ? `Order date (${poDate}) is after Data Date (${dataDate})` : 'Missing order date',
      });
      return;
    }

    const receivedCost = receiptsByPo.get(poId) || 0;
    const openCommitment = Math.max(0, totalOrderCost - receivedCost);

    contributions.push({
      id: poId, sourceTable: 'procurement', sourceId: poId, code: poCode, title: poTitle,
      projectId: poProjectId, contractId: String(po.contract_id || ''), date: poDate, status: po.status,
      category: 'Purchase Order Commitment', amount: money(openCommitment),
      details: { totalOrderCost, receivedCost },
    });
  });

  const reconciliationTotal = money(contributions.reduce((s, c) => s + c.amount, 0));

  contributions.forEach((c) => {
    c.sharePct = reconciliationTotal > 0 ? money((c.amount / reconciliationTotal) * 100) : 0;
  });

  return {
    kpiKey: 'open_commitment',
    kpiLabel: 'Open Commitments',
    category: 'Cost',
    value: reconciliationTotal,
    formattedValue: `$${reconciliationTotal.toLocaleString()}`,
    dataDate,
    projectId: pid,
    projectName,
    contractIds: [],
    basis: 'Total committed purchase orders (on or before Data Date) minus accepted received value.',
    formula: 'Open Commitment = Σ(Ordered PO Total - Accepted Receipts to Date)',
    contributions,
    exclusions,
    reconciliationTotal,
    discrepancy: 0,
    isReconciled: true,
    status: 'Ready',
  };
}

/**
 * Reconcile Net Cash Flow:
 * Settled/Actual Cash Inflows minus Actual Cash Outflows on or before Data Date.
 */
export function reconcileCashFlow(input: KpiReconciliationInput): KpiReconciliationResult {
  const dataDate = dateKey(input.dataDate);
  const pid = input.projectId;
  const projectMap = new Map(input.projects.map((p) => [String(p.id), p]));
  const projectName = pid === 'all' ? 'All Projects (Portfolio)' : (projectMap.get(pid)?.name || `Project ${pid}`);

  const scopedProjects = pid === 'all' ? input.projects : input.projects.filter((p) => String(p.id) === pid);
  const scopedProjectIds = new Set(scopedProjects.map((p) => String(p.id)));

  const contributions: KpiContributionItem[] = [];
  const exclusions: KpiExclusionItem[] = [];

  (input.cashFlow || []).forEach((c) => {
    const cId = String(c.id || '');
    const cProjectId = String(c.project_id || '');
    const cDate = dateKey(c.date);
    const inflow = Number(c.inflow) || 0;
    const outflow = Number(c.outflow) || 0;
    const netAmount = inflow - outflow;
    const cTitle = c.description || c.reference || `Cash Movement ${cId}`;
    const movType = c.movement_type || 'Actual';

    if (!scopedProjectIds.has(cProjectId)) {
      exclusions.push({
        id: cId, sourceTable: 'cash_flow', title: cTitle, projectId: cProjectId,
        date: cDate, status: c.status, amount: netAmount, reason: `Project ID (${cProjectId}) does not match filter (${pid})`,
      });
      return;
    }

    if (['Cancelled', 'Rejected'].includes(String(c.status || ''))) {
      exclusions.push({
        id: cId, sourceTable: 'cash_flow', title: cTitle, projectId: cProjectId,
        date: cDate, status: c.status, amount: netAmount, reason: `Cash movement status is "${c.status}"`,
      });
      return;
    }

    if (movType === 'Forecast') {
      exclusions.push({
        id: cId, sourceTable: 'cash_flow', title: cTitle, projectId: cProjectId,
        date: cDate, status: c.status, amount: netAmount, reason: 'Movement is classified as "Forecast" (Actual cash movements only)',
      });
      return;
    }

    if (!cDate || cDate > dataDate) {
      exclusions.push({
        id: cId, sourceTable: 'cash_flow', title: cTitle, projectId: cProjectId,
        date: cDate || 'N/A', status: c.status, amount: netAmount, reason: cDate ? `Date (${cDate}) is after Data Date (${dataDate})` : 'Missing transaction date',
      });
      return;
    }

    contributions.push({
      id: cId, sourceTable: 'cash_flow', sourceId: cId, title: cTitle, projectId: cProjectId,
      contractId: String(c.contract_id || ''), date: cDate, status: c.status || 'Settled',
      category: inflow > 0 ? 'Cash Inflow' : 'Cash Outflow', amount: money(netAmount),
      details: { inflow, outflow },
    });
  });

  const reconciliationTotal = money(contributions.reduce((s, c) => s + c.amount, 0));

  return {
    kpiKey: 'net_cash_flow',
    kpiLabel: 'Net Cash Flow',
    category: 'Cash',
    value: reconciliationTotal,
    formattedValue: `$${reconciliationTotal.toLocaleString()}`,
    dataDate,
    projectId: pid,
    projectName,
    contractIds: [],
    basis: 'Actual settled cash inflows minus outflows on or before Data Date cut-off.',
    formula: 'Net Cash Flow = Σ(Actual Cash Inflows ≤ Data Date) - Σ(Actual Cash Outflows ≤ Data Date)',
    contributions,
    exclusions,
    reconciliationTotal,
    discrepancy: 0,
    isReconciled: true,
    status: 'Ready',
  };
}

/**
 * Reconcile Delivery Cost Plan (Cost BAC, PV, EV, EAC):
 * Evaluates Control Accounts, approved SOVs, and delivery rate baselines.
 */
export type DeliveryCostKpiKey = 'cost_bac' | 'cost_pv' | 'cost_ev' | 'cost_eac';

export function reconcileDeliveryCostPlan(
  input: KpiReconciliationInput,
  metric: DeliveryCostKpiKey = 'cost_bac',
): KpiReconciliationResult {
  const dataDate = dateKey(input.dataDate);
  const pid = input.projectId;
  const projectMap = new Map(input.projects.map((p) => [String(p.id), p]));
  const projectName = pid === 'all' ? 'All Projects (Portfolio)' : (projectMap.get(pid)?.name || `Project ${pid}`);

  const scopedProjects = pid === 'all' ? input.projects : input.projects.filter((p) => String(p.id) === pid);
  const scopedProjectIds = new Set(scopedProjects.map((p) => String(p.id)));

  const primaryContracts = selectPrimaryContracts(input.contracts as any[])
    .filter((c) => contractEligibleAtDataDate(c, dataDate) && (pid === 'all' || String(c.project_id) === pid));
  const contractIds = new Set(primaryContracts.map((c) => String(c.id)));

  const contributions: KpiContributionItem[] = [];
  const exclusions: KpiExclusionItem[] = [];

  const sovById = new Map((input.contractSovLines || []).map((line) => [String(line.id), line]));

  const evmResult = calculateEvmAtDataDate({
    contractIds: [...contractIds],
    dataDate,
    schedules: input.schedules,
    scheduleDistributions: input.scheduleDistributions,
    baselines: input.baselines,
    wirEntries: input.wirEntries,
    progressCorrections: input.progressCorrections,
    boqItems: input.boqItems,
    costEntries: input.costEntries,
    controlAccounts: input.controlAccounts,
    costPlanVersions: input.costPlanVersions,
    contractSovLines: input.contractSovLines,
    procurement: input.procurement,
    procurementReceipts: input.procurementReceipts,
  });

  (input.controlAccounts || []).forEach((account) => {
    const caId = String(account.id || '');
    const caProjectId = String(account.project_id || '');
    const caContractId = String(account.contract_id || '');
    const caCode = account.control_account_code || caId;
    const caTitle = account.description || account.name || `Control Account ${caCode}`;
    const sov = sovById.get(String(account.contract_sov_line_id || ''));
    const budget = Number(sov?.revised_budget ?? sov?.original_budget ?? account.budget ?? account.budget_amount) || 0;

    if (!scopedProjectIds.has(caProjectId)) {
      exclusions.push({
        id: caId, sourceTable: 'control_accounts', code: caCode, title: caTitle, projectId: caProjectId, contractId: caContractId,
        amount: budget, reason: `Project ID (${caProjectId}) does not match filter (${pid})`,
      });
      return;
    }

    if (!contractIds.has(caContractId)) {
      exclusions.push({
        id: caId, sourceTable: 'control_accounts', code: caCode, title: caTitle, projectId: caProjectId, contractId: caContractId,
        amount: budget, reason: `Contract ID (${caContractId}) is not in active primary contracts for Data Date`,
      });
      return;
    }

    if (['Inactive', 'Closed'].includes(String(account.status || ''))) {
      exclusions.push({
        id: caId, sourceTable: 'control_accounts', code: caCode, title: caTitle, projectId: caProjectId, contractId: caContractId,
        amount: budget, status: account.status, reason: `Control Account status is "${account.status}"`,
      });
      return;
    }

    if (sov && !['Active', 'Closed'].includes(String(sov.status || ''))) {
      exclusions.push({
        id: caId, sourceTable: 'control_accounts', code: caCode, title: caTitle, projectId: caProjectId, contractId: caContractId,
        amount: budget, status: sov.status,
        reason: `Linked SOV status is "${sov.status}" (Active/Closed SOV required for cost baseline)`,
      });
      return;
    }

    if (budget <= 0) {
      exclusions.push({
        id: caId, sourceTable: 'control_accounts', code: caCode, title: caTitle, projectId: caProjectId, contractId: caContractId,
        amount: budget, reason: 'Budget amount is zero or negative',
      });
      return;
    }

    contributions.push({
      id: caId, sourceTable: 'control_accounts', sourceId: caId, code: caCode, title: caTitle,
      projectId: caProjectId, contractId: caContractId, status: account.status, category: 'Approved Control Account Plan',
      amount: money(budget), details: { sovId: sov?.id, sovStatus: sov?.status },
    });
  });

  const costValues: Record<DeliveryCostKpiKey, number | null> = {
    cost_bac: evmResult.cost.BAC,
    cost_pv: evmResult.cost.PV,
    cost_ev: evmResult.cost.EV,
    cost_eac: evmResult.cost.EAC,
  };
  const labels: Record<DeliveryCostKpiKey, string> = {
    cost_bac: 'Delivery Cost BAC',
    cost_pv: 'Delivery Cost Planned Value (PV)',
    cost_ev: 'Delivery Cost Earned Value (EV)',
    cost_eac: 'Delivery Cost Estimate at Completion (EAC)',
  };
  const categories: Record<DeliveryCostKpiKey, string> = {
    cost_bac: 'Approved Control Account Plan',
    cost_pv: 'Time-phased Control Account Plan to Data Date',
    cost_ev: 'Earned Control Account Cost to Data Date',
    cost_eac: 'Forecast Control Account Cost at Completion',
  };
  const formulas: Record<DeliveryCostKpiKey, string> = {
    cost_bac: 'Cost BAC = Σ(Active Control Account Budgets with Active/Closed SOV)',
    cost_pv: 'Cost PV = Σ(Control Account Budget × governed planned fraction to Data Date)',
    cost_ev: 'Cost EV = Σ(Control Account Budget × governed earned fraction to Data Date)',
    cost_eac: 'Cost EAC = governed project Cost EAC allocated to active Control Accounts by approved budget share',
  };

  const approvedBudgetTotal = money(contributions.reduce((s, c) => s + c.amount, 0));
  const targetValue = costValues[metric];

  // BAC contributions are the approved SOV budgets themselves. The other cost
  // measures are authoritative outputs of the shared EVM engine and are
  // reconciled back to the same governed Control Accounts by approved budget
  // share. Allocate the rounding residual to the last account so the source
  // rows always reconcile to the displayed KPI to the cent.
  if (metric !== 'cost_bac' && targetValue !== null && approvedBudgetTotal > 0) {
    let allocated = 0;
    contributions.forEach((contribution, index) => {
      const isLast = index === contributions.length - 1;
      const amount = isLast
        ? money(targetValue - allocated)
        : money(targetValue * contribution.amount / approvedBudgetTotal);
      contribution.details = {
        ...contribution.details,
        approvedBudget: contribution.amount,
        allocationBasis: 'Approved control-account budget share',
      };
      contribution.amount = amount;
      contribution.category = categories[metric];
      allocated = money(allocated + amount);
    });
  }

  const reconciliationTotal = money(contributions.reduce((s, c) => s + c.amount, 0));
  const discrepancy = targetValue !== null ? money(Math.abs(reconciliationTotal - targetValue)) : 0;

  contributions.forEach((c) => {
    c.sharePct = reconciliationTotal > 0 ? money((c.amount / reconciliationTotal) * 100) : 0;
  });

  return {
    kpiKey: metric,
    kpiLabel: labels[metric],
    category: 'Cost',
    value: targetValue,
    formattedValue: targetValue !== null ? `$${targetValue.toLocaleString()}` : 'Unavailable',
    dataDate,
    projectId: pid,
    projectName,
    contractIds: [...contractIds],
    basis: metric === 'cost_bac'
      ? 'Approved internal delivery cost budget from active Control Accounts linked to active SOV lines.'
      : `${labels[metric]} from the shared EVM engine, reconciled to active Control Accounts by approved budget share.`,
    formula: formulas[metric],
    contributions,
    exclusions,
    reconciliationTotal,
    discrepancy,
    isReconciled: targetValue !== null ? discrepancy <= 0.01 : false,
    status: evmResult.cost.status,
  };
}

/**
 * Universal KPI Dispatcher
 */
export function getKpiReconciliation(kpiKey: string, input: KpiReconciliationInput): KpiReconciliationResult {
  switch (kpiKey) {
    case 'modified_contract_value':
    case 'contract_value':
      return reconcileModifiedContractValue(input);
    case 'revenue_pv':
    case 'pv':
      return reconcileRevenuePv(input);
    case 'revenue_ev':
    case 'ev':
      return reconcileRevenueEv(input);
    case 'delivery_ac':
    case 'ac':
      return reconcileDeliveryAc(input);
    case 'open_commitment':
    case 'commitments':
    case 'commitment':
      return reconcileCommitments(input);
    case 'net_cash_flow':
    case 'cashflow':
      return reconcileCashFlow(input);
    case 'cost_bac':
      return reconcileDeliveryCostPlan(input, 'cost_bac');
    case 'cost_pv':
      return reconcileDeliveryCostPlan(input, 'cost_pv');
    case 'cost_ev':
      return reconcileDeliveryCostPlan(input, 'cost_ev');
    case 'cost_eac':
      return reconcileDeliveryCostPlan(input, 'cost_eac');
    default:
      return reconcileModifiedContractValue(input);
  }
}

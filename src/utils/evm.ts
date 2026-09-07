import { approvedBaselinePlanForActivity } from '../data/baselineGovernance.ts';
import { distributedPlannedValueToDate, scheduleBudget } from './schedulePlanning.ts';
import { procurementPostingState } from './commercialControl.ts';

const money = (value: number) => Math.round(value * 100) / 100;
const datedThrough = (value: unknown, dataDate: string) => Boolean(String(value || '').slice(0, 10) && String(value || '').slice(0, 10) <= dataDate);
const approvedWir = (wir: Record<string, any>) => wir.status === 'Approved' || wir.result === 'Pass' || wir.result === 'Conditional Pass';

export interface EvmRevenueResult {
  BAC: number;
  PV: number;
  EV: number;
  SV: number;
  SPI: number;
}

export interface EvmDeliveryCostResult {
  hasCostPlan: boolean;
  status: 'Ready' | 'Unavailable' | 'Approved Baseline Required';
  BAC: number | null;
  PV: number | null;
  EV: number | null;
  AC: number;
  openCommitment: number;
  CV: number | null;
  SV: number | null;
  CPI: number | null;
  SPI: number | null;
  EAC: number | null;
  ETC: number | null;
  VAC: number | null;
  TCPI: number | null;
}

export interface EvmMarginResult {
  grossMarginBAC: number | null;
  grossMarginBACPct: number | null;
  projectedMarginEAC: number | null;
  projectedMarginEACPct: number | null;
  progressMargin: number;
  progressMarginPct: number | null;
}

export interface EvmCalculationResult {
  revenue: EvmRevenueResult;
  cost: EvmDeliveryCostResult;
  margin: EvmMarginResult;
  // Direct named properties for clarity
  revenueBAC: number;
  revenuePV: number;
  revenueEV: number;
  revenueSV: number;
  revenueSPI: number;
  costBAC: number | null;
  costPV: number | null;
  costEV: number | null;
  costAC: number;
  costCV: number | null;
  costSV: number | null;
  costCPI: number | null;
  costSPI: number | null;
  costEAC: number | null;
  costETC: number | null;
  costVAC: number | null;
  costTCPI: number | null;
  costStatus: 'Ready' | 'Unavailable' | 'Approved Baseline Required';
  // Standard EVM backwards-compatible accessors
  BAC: number;
  PV: number;
  EV: number;
  AC: number;
  CV: number;
  SV: number;
  CPI: number;
  SPI: number;
  EAC: number;
  ETC: number;
  VAC: number;
  TCPI: number;
}

/**
 * EVM calculation engine enforcing strict separation between Revenue/Progress Value
 * and Delivery Cost.
 * 
 * - Revenue BAC/PV/EV are client-value/selling-rate facts from the main contract and BOQ/SOV.
 * - Delivery Cost BAC/PV/EV/CPI/EAC are internal cost-control facts from approved Control Accounts,
 *   Cost Plans or subcontract rate facts.
 * - When NO approved cost plan exists, cost efficiency indicators return null/'Unavailable'
 *   and NEVER fabricate an EAC from Revenue BAC.
 */
export function calculateEvmAtDataDate(input: {
  contractIds: string[];
  /** Child/subcontract facts that roll up to the selected main contract(s). */
  performanceContractIds?: string[];
  dataDate: string;
  schedules: Record<string, any>[];
  scheduleDistributions: Record<string, any>[];
  baselines: Record<string, any>[];
  wirEntries: Record<string, any>[];
  /** Posted corrections are signed movements against their original WIR. */
  progressCorrections?: Record<string, any>[];
  boqItems: Record<string, any>[];
  costEntries: Record<string, any>[];
  /** Optional Control Account and Cost Plan facts for delivery cost separation */
  controlAccounts?: Record<string, any>[];
  /** Approved D1 time-phased Delivery Cost plans, scoped by Control Account. */
  costPlanVersions?: Record<string, any>[];
  contractSovLines?: Record<string, any>[];
  procurement?: Record<string, any>[];
  procurementReceipts?: Record<string, any>[];
}): EvmCalculationResult {
  const contractIds = new Set(input.contractIds.filter(Boolean));
  const performanceContractIds = new Set((input.performanceContractIds || input.contractIds).filter(Boolean));
  const dataDate = String(input.dataDate || '').slice(0, 10);
  const activities = input.schedules.filter((row) => contractIds.has(String(row.contract_id || '')) && String(row.activity || '').trim());
  const plans = activities.map((activity) => approvedBaselinePlanForActivity(activity, input.scheduleDistributions, input.baselines));
  
  // 1. REVENUE (Client-side / Selling rate basis)
  const revenueBac = money(plans.reduce((sum, plan) => sum + scheduleBudget(plan.activity), 0));
  const revenuePv = money(plans.reduce((sum, plan) => sum + distributedPlannedValueToDate(plan.activity, plan.distributions, dataDate), 0));
  const boqById = new Map(input.boqItems.map((item) => [String(item.id), item]));
  const wirById = new Map(input.wirEntries.map((wir) => [String(wir.id), wir]));

  const correctionValue = (correction: Record<string, any>) => {
    if (correction.status !== 'Posted' || !datedThrough(correction.effective_date, dataDate)) return 0;
    const original = wirById.get(String(correction.original_wir_id || ''));
    if (!original || !performanceContractIds.has(String(original.contract_id || ''))) return 0;
    const item = boqById.get(String(original.boq_item_id || ''));
    const mainItem = item?.main_boq_item_id ? boqById.get(String(item.main_boq_item_id)) : item;
    const amount = (Number(correction.quantity) || 0) * (Number(mainItem?.unit_rate ?? original.unit_price) || 0);
    return String(correction.correction_type) === 'Reinstatement' ? amount : -amount;
  };

  const explicitActivities = new Map(activities.filter((activity) => String(activity.measurement_method || '').trim()).map((activity) => [String(activity.id), activity]));
  const explicitEv = [...explicitActivities.values()].reduce((sum, activity) => {
    const method = String(activity.measurement_method);
    const budget = scheduleBudget(activity);
    if (method === 'Quantity') {
      return sum + input.wirEntries.filter((wir) => String(wir.schedule_id || '') === String(activity.id) && datedThrough(wir.inspection_date, dataDate) && approvedWir(wir)).reduce((activitySum, wir) => {
        const item = boqById.get(String(wir.boq_item_id || ''));
        const mainItem = item?.main_boq_item_id ? boqById.get(String(item.main_boq_item_id)) : item;
        return activitySum + (Number(wir.quantity) || 0) * (Number(mainItem?.unit_rate ?? wir.unit_price) || 0);
      }, 0);
    }
    if (method === '0/100') return sum + (activity.activity_status === 'Completed' && datedThrough(activity.actual_finish_date || activity.status_data_date, dataDate) ? budget : 0);
    if (method === '50/50') {
      if (activity.activity_status === 'Completed' && datedThrough(activity.actual_finish_date || activity.status_data_date, dataDate)) return sum + budget;
      return sum + (datedThrough(activity.actual_start_date || activity.status_data_date, dataDate) ? budget * 0.5 : 0);
    }
    if (method === 'Weighted Milestone') return sum + (budget * Math.max(0, Math.min(100, Number(activity.measurement_weight_pct) || 0)) / 100);
    return sum;
  }, 0);

  const legacyEv = input.wirEntries
    .filter((wir) => performanceContractIds.has(String(wir.contract_id || '')) && datedThrough(wir.inspection_date, dataDate) && approvedWir(wir) && !explicitActivities.has(String(wir.schedule_id || '')))
    .reduce((sum, wir) => {
      const item = boqById.get(String(wir.boq_item_id || ''));
      const mainItem = item?.main_boq_item_id ? boqById.get(String(item.main_boq_item_id)) : item;
      return sum + (Number(wir.quantity) || 0) * (Number(mainItem?.unit_rate ?? wir.unit_price) || 0);
    }, 0);

  const correctionEv = (input.progressCorrections || []).reduce((sum, correction) => sum + correctionValue(correction), 0);
  const revenueEv = money(Math.max(0, explicitEv + legacyEv + correctionEv));
  const revenueSpi = revenuePv > 0 ? revenueEv / revenuePv : 0;
  const revenueSv = money(revenueEv - revenuePv);

  // 2. ACTUAL COST (AC) & OPEN COMMITMENTS
  const directAc = input.costEntries
    .filter((entry) => performanceContractIds.has(String(entry.contract_id || '')) && datedThrough(entry.date, dataDate))
    .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

  const postedReceiptIds = new Set(
    input.costEntries
      .filter((entry) => entry.source_type === 'procurement_receipt' && datedThrough(entry.date, dataDate))
      .map((entry) => String(entry.source_id || ''))
  );

  const receipts = (input.procurementReceipts || [])
    .filter((receipt) => performanceContractIds.has(String(receipt.contract_id || '')) && receipt.status === 'Accepted' && datedThrough(receipt.receipt_date, dataDate));
  
  const receiptAc = receipts
    .filter((receipt) => !postedReceiptIds.has(String(receipt.id || '')))
    .reduce((sum, receipt) => sum + (Number(receipt.accepted_amount) || ((Number(receipt.accepted_quantity) || 0) * (Number(receipt.unit_cost) || 0))), 0);

  const ac = money(directAc + receiptAc);

  const procurementOrders = (input.procurement || [])
    .filter((order) => performanceContractIds.has(String(order.contract_id || ''))
      && datedThrough(order.order_date, dataDate)
      && procurementPostingState(order).isCommitment);
  const receiptCostByOrder = receipts.reduce((map, receipt) => {
    const orderId = String(receipt.procurement_id || '');
    const receiptCost = Number(receipt.accepted_amount)
      || ((Number(receipt.accepted_quantity) || 0) * (Number(receipt.unit_cost) || 0));
    map.set(orderId, (map.get(orderId) || 0) + receiptCost);
    return map;
  }, new Map<string, number>());
  // Reconcile commitment at PO level. A surplus receipt against one PO must not
  // conceal the remaining commitment on another PO.
  const openCommitment = money(procurementOrders.reduce((sum, order) => {
    const orderValue = Number(order.total_cost)
      || ((Number(order.quantity) || 0) * (Number(order.unit_cost) || 0));
    const receivedValue = receiptCostByOrder.get(String(order.id || '')) || 0;
    return sum + Math.max(0, orderValue - receivedValue);
  }, 0));

  // 3. DELIVERY COST PLAN (Internal Control Account / Cost Budget basis)
  const scopedControlAccounts = (input.controlAccounts || []).filter((account) => contractIds.has(String(account.contract_id || ''))
    && !['Inactive', 'Closed'].includes(String(account.status || '')));
  const sovById = new Map((input.contractSovLines || []).map((line) => [String(line.id), line]));
  const approvedCostPlanByAccount = new Map(
    (input.costPlanVersions || [])
      .filter((plan) => plan.status === 'Approved')
      .map((plan) => [String(plan.control_account_id || ''), plan]),
  );
  const mainBoqId = (item: Record<string, any> | undefined) => String(item?.main_boq_item_id || item?.id || '');
  const mainBoqForWir = (wir: Record<string, any>) => {
    const item = boqById.get(String(wir.boq_item_id || ''));
    return item?.main_boq_item_id ? boqById.get(String(item.main_boq_item_id)) : item;
  };
  const signedCorrectionRevenue = (correction: Record<string, any>, accountId?: string, boqItemId?: string) => {
    if (correction.status !== 'Posted' || !datedThrough(correction.effective_date, dataDate)) return 0;
    const original = wirById.get(String(correction.original_wir_id || ''));
    if (!original || !performanceContractIds.has(String(original.contract_id || ''))) return 0;
    const mainItem = mainBoqForWir(original);
    if (accountId && String(original.control_account_id || '') !== accountId && mainBoqId(mainItem) !== boqItemId) return 0;
    const value = (Number(correction.quantity) || 0) * (Number(mainItem?.unit_rate ?? original.unit_price) || 0);
    return String(correction.correction_type) === 'Reinstatement' ? value : -value;
  };
  const activityRevenueEarned = (activity: Record<string, any>) => {
    const budget = scheduleBudget(activity);
    const method = String(activity.measurement_method || '');
    if (method === '0/100') return activity.activity_status === 'Completed' && datedThrough(activity.actual_finish_date || activity.status_data_date, dataDate) ? budget : 0;
    if (method === '50/50') {
      if (activity.activity_status === 'Completed' && datedThrough(activity.actual_finish_date || activity.status_data_date, dataDate)) return budget;
      return datedThrough(activity.actual_start_date || activity.status_data_date, dataDate) ? budget * 0.5 : 0;
    }
    if (method === 'Weighted Milestone') return budget * Math.max(0, Math.min(100, Number(activity.measurement_weight_pct) || 0)) / 100;
    return input.wirEntries
      .filter((wir) => String(wir.schedule_id || '') === String(activity.id) && datedThrough(wir.inspection_date, dataDate) && approvedWir(wir))
      .reduce((sum, wir) => sum + (Number(wir.quantity) || 0) * (Number(mainBoqForWir(wir)?.unit_rate ?? wir.unit_price) || 0), 0);
  };
  const accountPlans = scopedControlAccounts.map((account) => {
    const sov = sovById.get(String(account.contract_sov_line_id || ''));
    const approvedCostPlan = approvedCostPlanByAccount.get(String(account.id || ''));
    if (!approvedCostPlan && (!sov || !['Active', 'Closed'].includes(String(sov.status || '')))) return null;
    const budget = approvedCostPlan
      ? Number(approvedCostPlan.delivery_cost_bac)
      : Number(sov?.revised_budget ?? sov?.original_budget);
    if (!Number.isFinite(budget) || budget <= 0) return null;
    const accountId = String(account.id || '');
    const boqItemId = String(account.boq_item_id || sov?.boq_item_id || '');
    const linkedPlans = plans.filter(({ activity }) => String(activity.control_account_id || '') === accountId
      || (!activity.control_account_id && boqItemId && mainBoqId(boqById.get(String(activity.boq_item_id || ''))) === boqItemId)
      || (scopedControlAccounts.length === 1 && !activity.control_account_id && !activity.boq_item_id));
    const plannedRevenueBac = linkedPlans.reduce((sum, plan) => sum + scheduleBudget(plan.activity), 0);
    const plannedRevenueToDate = linkedPlans.reduce((sum, plan) => sum + distributedPlannedValueToDate(plan.activity, plan.distributions, dataDate), 0);
    const boq = boqById.get(boqItemId);
    const boqRevenueBac = (Number(boq?.quantity) || 0) * (Number(boq?.unit_rate) || 0);
    const earnedFromActivities = linkedPlans.reduce((sum, plan) => sum + activityRevenueEarned(plan.activity), 0);
    const hasExplicitMeasurement = linkedPlans.some(({ activity }) => String(activity.measurement_method || '').trim());
    const earnedFromAccountWirs = input.wirEntries
      .filter((wir) => performanceContractIds.has(String(wir.contract_id || ''))
        && datedThrough(wir.inspection_date, dataDate)
        && approvedWir(wir)
        && (String(wir.control_account_id || '') === accountId
          || (!wir.control_account_id && boqItemId && mainBoqId(mainBoqForWir(wir)) === boqItemId)
          || (scopedControlAccounts.length === 1 && !wir.control_account_id && !boqItemId)))
      .reduce((sum, wir) => sum + (Number(wir.quantity) || 0) * (Number(mainBoqForWir(wir)?.unit_rate ?? wir.unit_price) || 0), 0);
    const corrections = (input.progressCorrections || []).reduce((sum, row) => sum + signedCorrectionRevenue(row, accountId, boqItemId), 0);
    const earnedRevenue = Math.max(0, (hasExplicitMeasurement ? earnedFromActivities : earnedFromAccountWirs) + corrections);
    const progressBasis = boqRevenueBac || plannedRevenueBac;
    const plannedFraction = plannedRevenueBac > 0 ? Math.max(0, Math.min(1, plannedRevenueToDate / plannedRevenueBac)) : 0;
    const earnedFraction = progressBasis > 0 ? Math.max(0, Math.min(1, earnedRevenue / progressBasis)) : 0;
    const governedCostPv = approvedCostPlan
      ? (approvedCostPlan.periods || [])
          .filter((period: Record<string, any>) => datedThrough(period.period_end, dataDate))
          .reduce((sum: number, period: Record<string, any>) => sum + (Number(period.planned_cost) || 0), 0)
      : budget * plannedFraction;
    return { budget, pv: Math.min(budget, Math.max(0, governedCostPv)), ev: budget * earnedFraction };
  }).filter((row): row is { budget: number; pv: number; ev: number } => Boolean(row));

  const selectedCostPlans = accountPlans;
  const hasCostPlan = selectedCostPlans.length > 0;
  const costBac = hasCostPlan ? money(selectedCostPlans.reduce((sum, row) => sum + row.budget, 0)) : null;
  const costPv = hasCostPlan ? money(selectedCostPlans.reduce((sum, row) => sum + row.pv, 0)) : null;
  const costEv = hasCostPlan ? money(selectedCostPlans.reduce((sum, row) => sum + row.ev, 0)) : null;

  const costCpi = hasCostPlan && costEv !== null ? (ac > 0 ? costEv / ac : (costEv === 0 ? 1 : 0)) : null;
  const costSpi = hasCostPlan && costEv !== null && costPv !== null ? (costPv > 0 ? costEv / costPv : 0) : null;
  const costCv = hasCostPlan && costEv !== null ? money(costEv - ac) : null;
  const costSv = hasCostPlan && costEv !== null && costPv !== null ? money(costEv - costPv) : null;
  
  // Strict rule: Cost EAC MUST NOT use Revenue BAC. If no cost plan, EAC is null (Unavailable).
  const costEac = hasCostPlan && costBac !== null
    ? money(costCpi && costCpi > 0 ? costBac / costCpi : costBac)
    : null;
  const costEtc = costEac !== null ? money(Math.max(0, costEac - ac)) : null;
  const costVac = costBac !== null && costEac !== null ? money(costBac - costEac) : null;
  const costTcpi = costBac !== null && costEv !== null && costBac > costEv && costBac > ac
    ? (costBac - costEv) / (costBac - ac)
    : (hasCostPlan ? 0 : null);
  const costStatus: 'Ready' | 'Unavailable' | 'Approved Baseline Required' = hasCostPlan
    ? 'Ready'
    : scopedControlAccounts.length > 0 ? 'Approved Baseline Required' : 'Unavailable';

  // 4. COMMERCIAL / MARGIN
  const grossMarginBac = costBac !== null ? money(revenueBac - costBac) : null;
  const grossMarginBACPct = costBac !== null && revenueBac > 0 ? money(((revenueBac - costBac) / revenueBac) * 100) : null;
  const projectedMarginEac = costEac !== null ? money(revenueBac - costEac) : null;
  const projectedMarginEACPct = costEac !== null && revenueBac > 0 ? money(((revenueBac - costEac) / revenueBac) * 100) : null;
  const progressMargin = money(revenueEv - ac);
  const progressMarginPct = revenueEv > 0 ? money(((revenueEv - ac) / revenueEv) * 100) : null;

  return {
    revenue: {
      BAC: revenueBac,
      PV: revenuePv,
      EV: revenueEv,
      SV: revenueSv,
      SPI: revenueSpi,
    },
    cost: {
      hasCostPlan,
      status: costStatus,
      BAC: costBac,
      PV: costPv,
      EV: costEv,
      AC: ac,
      openCommitment,
      CV: costCv,
      SV: costSv,
      CPI: costCpi,
      SPI: costSpi,
      EAC: costEac,
      ETC: costEtc,
      VAC: costVac,
      TCPI: costTcpi,
    },
    margin: {
      grossMarginBAC: grossMarginBac,
      grossMarginBACPct: grossMarginBACPct,
      projectedMarginEAC: projectedMarginEac,
      projectedMarginEACPct: projectedMarginEACPct,
      progressMargin,
      progressMarginPct,
    },
    // Direct properties
    revenueBAC: revenueBac,
    revenuePV: revenuePv,
    revenueEV: revenueEv,
    revenueSV: revenueSv,
    revenueSPI: revenueSpi,
    costBAC: costBac,
    costPV: costPv,
    costEV: costEv,
    costAC: ac,
    costCV: costCv,
    costSV: costSv,
    costCPI: costCpi,
    costSPI: costSpi,
    costEAC: costEac,
    costETC: costEtc,
    costVAC: costVac,
    costTCPI: costTcpi,
    costStatus,
    // Generic legacy accessors
    BAC: revenueBac,
    PV: revenuePv,
    EV: revenueEv,
    AC: ac,
    CV: costCv ?? 0,
    SV: revenueSv,
    CPI: costCpi ?? 0,
    SPI: revenueSpi,
    EAC: costEac ?? 0,
    ETC: costEtc ?? 0,
    VAC: costVac ?? 0,
    TCPI: costTcpi ?? 0,
  };
}


import { useMemo, useState, useEffect, useRef } from 'react';
import { useProjectDataDate } from '@/context/ProjectDataDateContext';
import { generateWarnings } from '@/utils/earlyWarningSystem';
import { useVarianceActions } from '@/hooks/useVarianceActions';
import type { Warning } from '@/utils/varianceActionRegister';
import { VarianceActionTable } from '@/components/VarianceActionTable';
import { CashFlowForecastBoard } from '@/components/CashFlowForecastBoard';
import { TrendingUp, TrendingDown, DollarSign, FolderKanban, CircleCheck as CheckCircle2, TriangleAlert as AlertTriangle, Clock, Package, ShieldAlert, Users, CalendarClock, Signature as FileSignature, ClipboardList, Banknote, Receipt, FileText, GitBranch, FolderOpen, Target, Gauge, Activity, CircleAlert as AlertCircle, CircleArrowRight as ArrowRightCircle, Lightbulb, ChevronDown, Building2, Layers, Zap, ArrowUpRight, ArrowDownRight, Wallet, ChartBar as BarChart3, LayoutDashboard, Search, PackageCheck, Truck, FileCheck as FileCheck2, HeartPulse, CircleDollarSign, ListChecks, Hash, Printer, X } from 'lucide-react';
import { SCurveChart } from './SCurveChart';
import { ThreeWayGanttOverlay } from './ThreeWayGanttOverlay';
import { XerReconciliationBoard } from './XerReconciliationBoard';
import { KpiDrilldownModal } from './KpiDrilldownModal';
import { getKpiReconciliation, type KpiReconciliationInput } from '@/utils/kpiReconciliation';
import { approvedBaselinePlanForActivity, selectPrimaryContracts } from '@/data';
import { addCalendarDays, distributedPlannedValueToDate, scheduleBudget } from '@/utils/schedulePlanning';
import { cashForecastAt } from '@/utils/cashForecast';
import { deriveForecastHorizon } from '@/utils/forecastHorizon';
import { plannedResourceCostAt, timePhasedPlannedResourceCost } from '@/utils/resourceLoading';
import { calculateEvmAtDataDate } from '@/utils/evm';
import { calculateControlAccountSummary } from '@/utils/controlAccountSummary';
import { buildBoqWasteLedger, buildOperationalScopeReport, calculateEarnedScheduleFromSeries } from '@/utils/projectControlAnalytics';
import type {
  Project, Task, Cost, CostEntry, Procurement, Safety, ProgressEntry, ProjectWithStats, ViewKey,
  Schedule, Contract, BOQHeader, BOQItem, ContractSOVLine, ControlAccount, ProcurementReceipt, CashFlowEntry, SubcontractorInvoice, ClientInvoice,
  Variation, DocumentEntry, WIREntry, ProgressCorrection, ProjectBaseline, ReportingPeriod, GovernanceRegisterEntry, RFIEntry, SubmittalEntry, QualityEntry, CostPlanVersion,
} from '@/types';

interface DashboardProps {
  projects: Project[];
  tasks: Task[];
  costs: Cost[];
  costEntries: CostEntry[];
  procurement: Procurement[];
  procurementReceipts: ProcurementReceipt[];
  safety: Safety[];
  progress: ProgressEntry[];
  schedules: Schedule[];
  contracts: Contract[];
  boqHeaders: BOQHeader[];
  boqItems: BOQItem[];
  contractSovLines: ContractSOVLine[];
  controlAccounts: ControlAccount[];
  costPlanVersions: CostPlanVersion[];
  cashFlow: CashFlowEntry[];
  subInvoices: SubcontractorInvoice[];
  clientInvoices: ClientInvoice[];
  variations: Variation[];
  documents: DocumentEntry[];
  wirEntries: WIREntry[];
  progressCorrections: ProgressCorrection[];
  baselines: ProjectBaseline[];
  reportingPeriods: ReportingPeriod[];
  governanceRegister: GovernanceRegisterEntry[];
  scheduleDistributions: Record<string, any>[];
  rfis: RFIEntry[];
  submittals: SubmittalEntry[];
  quality: QualityEntry[];
  resourceMasters: Record<string, any>[];
  scheduleResourceAssignments: Record<string, any>[];
  workCalendars: Record<string, any>[];
  onNavigate: (view: ViewKey) => void;
  onDataReload?: () => Promise<void>;
}

function statusColor(status: string): string {
  switch (status) {
    case 'Completed': return 'bg-success-100 text-success-700 border-success-200';
    case 'In Progress': return 'bg-primary-100 text-primary-700 border-primary-200';
    case 'Planning': return 'bg-secondary-100 text-secondary-700 border-secondary-200';
    case 'On Hold': return 'bg-warning-100 text-warning-700 border-warning-200';
    case 'Delayed': return 'bg-error-100 text-error-700 border-error-200';
    case 'Not Started': return 'bg-neutral-100 text-neutral-600 border-neutral-200';
    default: return 'bg-neutral-100 text-neutral-600 border-neutral-200';
  }
}

function fmtMoney(n: number): string {
  const v = Math.abs(n);
  if (v >= 1_000_000) return `${n < 0 ? '-' : ''}$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${n < 0 ? '-' : ''}$${(v / 1_000).toFixed(1)}K`;
  return `${n < 0 ? '-' : ''}$${v.toFixed(0)}`;
}

function fmtAvailableMoney(n: number | null): string {
  return n === null ? 'Unavailable' : fmtMoney(n);
}

function useAnimatedNumber(target: number, duration = 800): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);
  return value;
}

type DashboardTab = 'overview' | 'report' | 'financials' | 'schedule' | 'safety' | 'procurement' | 'documents' | 'action';

export function Dashboard({
  projects, tasks, costs, costEntries, procurement, procurementReceipts, safety, progress, schedules, contracts,
  boqHeaders, boqItems, contractSovLines, controlAccounts, costPlanVersions, cashFlow, subInvoices, clientInvoices, variations, documents, wirEntries, progressCorrections, baselines, reportingPeriods, governanceRegister, scheduleDistributions, rfis, submittals, quality, resourceMasters, scheduleResourceAssignments, workCalendars, onNavigate, onDataReload,
}: DashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { dataDate: asOfDate, projectId: selectedProjectId, setProjectId: setSelectedProjectId } = useProjectDataDate();

  const { varianceActionItems, handleCreateAction, handleUpdateActionStatus } = useVarianceActions();
  const [selectedWarningForAction, setSelectedWarningForAction] = useState<Warning | null>(null);
  const [actionAssignedTo, setActionAssignedTo] = useState('');
  const [actionDueDate, setActionDueDate] = useState('');
  const [drilldownKpiKey, setDrilldownKpiKey] = useState<string | null>(null);

  const pid = selectedProjectId;
  const reportDate = asOfDate;
  const datedThroughToday = (value: unknown) => {
    const date = String(value || '').slice(0, 10);
    return Boolean(date && date <= reportDate);
  };

  const reconciliationInput: KpiReconciliationInput = useMemo(() => ({
    projectId: selectedProjectId,
    dataDate: reportDate,
    projects: projects as Record<string, any>[],
    contracts: contracts as Record<string, any>[],
    variations: variations as Record<string, any>[],
    schedules: schedules as Record<string, any>[],
    scheduleDistributions: scheduleDistributions as Record<string, any>[],
    baselines: baselines as Record<string, any>[],
    wirEntries: wirEntries as Record<string, any>[],
    progressCorrections: progressCorrections as Record<string, any>[],
    boqItems: boqItems as Record<string, any>[],
    costEntries: costEntries as Record<string, any>[],
    procurement: procurement as Record<string, any>[],
    procurementReceipts: procurementReceipts as Record<string, any>[],
    cashFlow: cashFlow as Record<string, any>[],
    controlAccounts: controlAccounts as Record<string, any>[],
    costPlanVersions: costPlanVersions as Record<string, any>[],
    contractSovLines: contractSovLines as Record<string, any>[],
  }), [selectedProjectId, reportDate, projects, contracts, variations, schedules, scheduleDistributions, baselines, wirEntries, progressCorrections, boqItems, costEntries, procurement, procurementReceipts, cashFlow, controlAccounts, costPlanVersions, contractSovLines]);
  const reconciledKpis = useMemo(() => ({
    modifiedContractValue: getKpiReconciliation('modified_contract_value', reconciliationInput),
    revenuePv: getKpiReconciliation('revenue_pv', reconciliationInput),
    revenueEv: getKpiReconciliation('revenue_ev', reconciliationInput),
    deliveryAc: getKpiReconciliation('delivery_ac', reconciliationInput),
    openCommitment: getKpiReconciliation('open_commitment', reconciliationInput),
    netCashFlow: getKpiReconciliation('net_cash_flow', reconciliationInput),
    costBac: getKpiReconciliation('cost_bac', reconciliationInput),
    costPv: getKpiReconciliation('cost_pv', reconciliationInput),
    costEv: getKpiReconciliation('cost_ev', reconciliationInput),
    costEac: getKpiReconciliation('cost_eac', reconciliationInput),
  }), [reconciliationInput]);
  const effectiveProjects = useMemo(() => projects.map((project) => {
    const mainContractIds = new Set(contracts
      .filter((contract) => contract.project_id === project.id && !contract.parent_main_contract_id)
      .map((contract) => contract.id));
    const approvedExtensionDays = variations
      .filter((variation) => variation.status === 'Approved' && variation.contract_id && mainContractIds.has(variation.contract_id))
      .reduce((sum, variation) => sum + (Number(variation.time_impact_days) || 0), 0);
    return { ...project, end_date: addCalendarDays(project.end_date, approvedExtensionDays) || project.end_date };
  }), [projects, contracts, variations]);
  const fProjects = pid === 'all' ? effectiveProjects : effectiveProjects.filter((p) => p.id === pid);
  const fResourceAssignments = pid === 'all' ? scheduleResourceAssignments : scheduleResourceAssignments.filter((assignment) => assignment.project_id === pid);
  const resourceForecast = useMemo(() => timePhasedPlannedResourceCost(resourceMasters, fResourceAssignments, schedules, workCalendars), [resourceMasters, fResourceAssignments, schedules, workCalendars]);
  const fTasks = pid === 'all' ? tasks : tasks.filter((t) => t.project_id === pid);
  const fCosts = pid === 'all' ? costs : costs.filter((c) => c.project_id === pid);
  const fCostEntries = pid === 'all' ? costEntries : costEntries.filter((entry) => entry.project_id === pid);
  const fProcurement = pid === 'all' ? procurement : procurement.filter((p) => p.project_id === pid);
  const fProcurementReceipts = pid === 'all' ? procurementReceipts : procurementReceipts.filter((r) => r.project_id === pid);
  const fSafety = pid === 'all' ? safety : safety.filter((s) => s.project_id === pid);
  const fProgress = pid === 'all' ? progress : progress.filter((p) => p.project_id === pid);
  const fSchedules = pid === 'all' ? schedules : schedules.filter((s) => s.project_id === pid);
  const fContracts = pid === 'all' ? contracts : contracts.filter((c) => c.project_id === pid);
  const primaryContracts = selectPrimaryContracts(fContracts).filter((contract) => datedThroughToday(contract.signed_date || contract.start_date));
  const fBOQ = pid === 'all' ? boqItems : boqItems.filter((b) => b.project_id === pid);
  const fContractSovLines = pid === 'all' ? contractSovLines : contractSovLines.filter((line) => line.project_id === pid);
  const fControlAccounts = pid === 'all' ? controlAccounts : controlAccounts.filter((account) => account.project_id === pid);
  const fCashFlow = pid === 'all' ? cashFlow : cashFlow.filter((c) => c.project_id === pid);
  const fSubInv = pid === 'all' ? subInvoices : subInvoices.filter((s) => s.project_id === pid);
  const fClientInv = pid === 'all' ? clientInvoices : clientInvoices.filter((c) => c.project_id === pid);
  const fVariations = pid === 'all' ? variations : variations.filter((v) => v.project_id === pid);
  const fDocuments = pid === 'all' ? documents : documents.filter((d) => d.project_id === pid);
  const fWirs = pid === 'all' ? wirEntries : wirEntries.filter((wir) => wir.project_id === pid);
  const fProgressCorrections = pid === 'all' ? progressCorrections : progressCorrections.filter((row) => row.project_id === pid);
  const fBaselines = pid === 'all' ? baselines : baselines.filter((baseline) => baseline.project_id === pid);
  const fReportingPeriods = pid === 'all' ? reportingPeriods : reportingPeriods.filter((period) => period.project_id === pid);
  const fGovernance = pid === 'all' ? governanceRegister : governanceRegister.filter((entry) => entry.project_id === pid);
  const fRfis = pid === 'all' ? rfis : rfis.filter((entry) => entry.project_id === pid);
  const fSubmittals = pid === 'all' ? submittals : submittals.filter((entry) => entry.project_id === pid);
  const fQuality = pid === 'all' ? quality : quality.filter((entry) => entry.project_id === pid);

  const selectedProject = pid !== 'all' ? projects.find((p) => p.id === pid) : null;
  const evmPerformanceContractIds = fContracts
    .filter((contract) => primaryContracts.some((mainContract) => contract.id === mainContract.id || contract.parent_main_contract_id === mainContract.id))
    .map((contract) => contract.id);
  const evm = useMemo(() => calculateEvmAtDataDate({
    contractIds: primaryContracts.map((contract) => contract.id),
    performanceContractIds: evmPerformanceContractIds,
    dataDate: reportDate,
    schedules: fSchedules as Record<string, any>[],
    scheduleDistributions,
    baselines: fBaselines as Record<string, any>[],
    wirEntries: fWirs as Record<string, any>[],
    progressCorrections: fProgressCorrections as Record<string, any>[],
    boqItems: fBOQ as Record<string, any>[],
    costEntries: fCostEntries as Record<string, any>[],
    controlAccounts: fControlAccounts as Record<string, any>[],
    contractSovLines: fContractSovLines as Record<string, any>[],
    procurement: fProcurement as Record<string, any>[],
    procurementReceipts: fProcurementReceipts as Record<string, any>[],
  }), [primaryContracts, evmPerformanceContractIds, reportDate, fSchedules, scheduleDistributions, fBaselines, fWirs, fProgressCorrections, fBOQ, fCostEntries, fControlAccounts, fContractSovLines, fProcurement, fProcurementReceipts]);

  const controlAccountVariances = useMemo(() => {
    let usageVariance = 0;
    let rateVariance = 0;
    let mixVariance = 0;
    let productivityVariance = 0;
    let efficiencyVariance = 0;

    fControlAccounts.forEach((account) => {
      const summary = calculateControlAccountSummary({
        account: {
          id: account.id,
          boq_item_id: account.boq_item_id,
          contract_id: account.contract_id,
          contract_sov_line_id: account.contract_sov_line_id || account.id,
          data_date: reportDate,
        },
        boqItems: fBOQ as Record<string, any>[],
        sovLines: fContractSovLines as Record<string, any>[],
        schedules: fSchedules as Record<string, any>[],
        scheduleDistributions,
        baselines: fBaselines as Record<string, any>[],
        wirEntries: fWirs as Record<string, any>[],
        costEntries: fCostEntries as Record<string, any>[],
        procurement: fProcurement as Record<string, any>[],
        procurementReceipts: fProcurementReceipts as Record<string, any>[],
      });

      usageVariance += summary.usageVariance || 0;
      rateVariance += summary.rateVariance || 0;
      mixVariance += summary.mixVariance || 0;
      productivityVariance += summary.productivityVariance || 0;
      efficiencyVariance += summary.efficiencyVariance || 0;
    });

    return {
      usageVariance: Math.round(usageVariance * 100) / 100,
      rateVariance: Math.round(rateVariance * 100) / 100,
      mixVariance: Math.round(mixVariance * 100) / 100,
      productivityVariance: Math.round(productivityVariance * 100) / 100,
      efficiencyVariance: Math.round(efficiencyVariance * 100) / 100,
    };
  }, [fControlAccounts, reportDate, fBOQ, fContractSovLines, fSchedules, scheduleDistributions, fBaselines, fWirs, fCostEntries, fProcurement, fProcurementReceipts]);

  const stats = useMemo(() => {
    const totalBudget = fProjects.reduce((s, p) => s + (p.budget || 0), 0);
    const totalSpent = fCostEntries.filter((entry) => datedThroughToday(entry.date)).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
    const activeProjects = fProjects.filter((p) => p.status === 'In Progress').length;
    const completedProjects = fProjects.filter((p) => p.status === 'Completed').length;
    const planningProjects = fProjects.filter((p) => p.status === 'Planning').length;
    const onHoldProjects = fProjects.filter((p) => p.status === 'On Hold').length;
    const delayedTasks = fTasks.filter((t) => t.status === 'Delayed').length;
    const completedTasks = fTasks.filter((t) => t.status === 'Completed').length;
    const inProgressTasks = fTasks.filter((t) => t.status === 'In Progress').length;
    const notStartedTasks = fTasks.filter((t) => t.status === 'Not Started').length;
    const avgProgress = fProjects.length
      ? Math.round(fProjects.reduce((s, p) => s + (p.progress || 0), 0) / fProjects.length)
      : 0;
    const budgetUtilization = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

    const byStatus: Record<string, number> = {};
    fProjects.forEach((p) => { byStatus[p.status] = (byStatus[p.status] || 0) + 1; });

    const byCategory: Record<string, { budget: number; spent: number; count: number }> = {};
    fProjects.forEach((p) => {
      const cat = p.category || 'Uncategorized';
      if (!byCategory[cat]) byCategory[cat] = { budget: 0, spent: 0, count: 0 };
      byCategory[cat].budget += p.budget || 0;
      byCategory[cat].spent += p.spent || 0;
      byCategory[cat].count += 1;
    });

    const taskStatusCounts: Record<string, number> = {};
    fTasks.forEach((t) => { taskStatusCounts[t.status] = (taskStatusCounts[t.status] || 0) + 1; });

    const taskPriorityCounts: Record<string, number> = {};
    fTasks.forEach((t) => { taskPriorityCounts[t.priority] = (taskPriorityCounts[t.priority] || 0) + 1; });

    const totalPlannedCosts = fCosts.reduce((s, c) => s + (c.planned || 0), 0);
    const totalActualCosts = evm.cost.AC;
    const totalCommittedCosts = fCosts.reduce((s, c) => s + (c.committed || 0), 0);
    const totalPlannedWork = evm.revenue.PV;
    const totalEarnedWork = evm.revenue.EV;
    const costVariance = evm.cost.CV ?? 0;

    const openSafety = fSafety.filter((s) => s.status === 'Open').length;
    const closedSafety = fSafety.filter((s) => s.status === 'Closed').length;
    const investigatingSafety = fSafety.filter((s) => s.status === 'Investigating').length;
    const highSeverity = fSafety.filter((s) => s.severity === 'High' || s.severity === 'Critical').length;
    const safetyByType: Record<string, number> = {};
    fSafety.forEach((s) => { safetyByType[s.type] = (safetyByType[s.type] || 0) + 1; });

    const deliveredProcurement = fProcurement.filter((p) => p.status === 'Delivered').length;
    const pendingProcurement = fProcurement.filter((p) => p.status !== 'Delivered').length;
    const orderedProcurement = fProcurement.filter((p) => p.status === 'Ordered').length;
    const partialProcurement = fProcurement.filter((p) => p.status === 'Partially Delivered').length;
    const requestedProcurement = fProcurement.filter((p) => p.status === 'Requested').length;
    const totalProcurementValue = fProcurement.reduce((s, p) => s + (p.total_cost || 0), 0);

    const totalWorkers = fProgress.reduce((s, p) => s + (p.workers || 0), 0);
    const avgPercentComplete = fProgress.length
      ? Math.round(fProgress.reduce((s, p) => s + (p.percent_complete || 0), 0) / fProgress.length)
      : 0;

    const criticalPathCount = fSchedules.filter((s) => s.critical_path).length;
    const delayedSchedules = fSchedules.filter((s) => s.status === 'Delayed').length;
    const completedSchedules = fSchedules.filter((s) => s.status === 'Completed').length;
    const totalContractValue = primaryContracts.reduce((s, c) => s + (Number(c.contract_value) || 0), 0);
    const activeContracts = primaryContracts.filter((c) => c.status === 'Active').length;
    const totalBOQAmount = fBOQ.reduce((s, b) => s + (b.amount || 0), 0);
    const actualCashFlow = fCashFlow.filter((c: any) => (!c.movement_type || c.movement_type === 'Actual' || c.movement_type === 'Manual') && datedThroughToday(c.date));
    const forecastCashFlow = fCashFlow.filter((c: any) => c.movement_type === 'Forecast');
    const totalInflow = actualCashFlow.reduce((s, c) => s + (c.inflow || 0), 0);
    const totalOutflow = actualCashFlow.reduce((s, c) => s + (c.outflow || 0), 0);
    const netCashFlow = totalInflow - totalOutflow;
    const forecastNetCashFlow = forecastCashFlow.reduce((s, c) => s + (c.inflow || 0) - (c.outflow || 0), 0);
    const cutOffDate = new Date(`${reportDate}T00:00:00`);
    const forecastAt = (days: number) => forecastCashFlow
      .filter((c: any) => {
        const date = c.date ? new Date(`${c.date}T00:00:00`) : null;
        return date && date >= cutOffDate && date <= new Date(cutOffDate.getTime() + days * 86400000);
      })
      .reduce((s, c) => s + (c.inflow || 0) - (c.outflow || 0), 0);
    const forecast30 = forecastAt(30);
    const forecast60 = forecastAt(60);
    const forecast90 = forecastAt(90);
    const subInvoiceTotal = fSubInv.reduce((s, i) => s + (i.amount || 0), 0);
    const subInvoicePaid = fSubInv.reduce((s, i) => s + (i.paid_amount || 0), 0);
    const subOutstanding = subInvoiceTotal - subInvoicePaid;
    const clientInvoiceTotal = fClientInv.reduce((s, i) => s + (i.amount || 0), 0);
    const clientInvoicePaid = fClientInv.reduce((s, i) => s + (i.paid_amount || 0), 0);
    const clientOutstanding = clientInvoiceTotal - clientInvoicePaid;
    const mainContractIds = new Set(primaryContracts.map((contract) => contract.id));
    const mainVariations = fVariations.filter((variation) => !variation.contract_id || mainContractIds.has(variation.contract_id));
    const variationCostImpact = mainVariations.reduce((s, v) => s + (Number(v.cost_impact) || 0), 0);
    const approvedVariationCostImpact = mainVariations
      .filter((variation) => variation.status === 'Approved' && datedThroughToday(variation.approved_date))
      .reduce((s, variation) => s + (Number(variation.cost_impact) || 0), 0);
    const modifiedContractValue = totalContractValue + approvedVariationCostImpact;
    const pendingVariations = mainVariations.filter((v) => v.status === 'Pending' || v.status === 'Submitted').length;
    const approvedVariations = mainVariations.filter((v) => v.status === 'Approved' && datedThroughToday(v.approved_date)).length;
    const approvedBaselines = fBaselines.filter((baseline) => baseline.status === 'Approved').length;
    const openReportingPeriods = fReportingPeriods.filter((period) => period.status === 'Open').length;
    const openGovernanceItems = fGovernance.filter((entry) => entry.status !== 'Closed').length;
    const criticalGovernanceItems = fGovernance.filter((entry) => entry.status !== 'Closed' && (entry.impact === 'Critical' || entry.probability === 'Critical')).length;
    const openRfis = fRfis.filter((entry) => entry.status !== 'Closed').length;
    const pendingSubmittals = fSubmittals.filter((entry) => !['Approved', 'Approved as Noted', 'Rejected'].includes(entry.status)).length;
    const openQualityItems = fQuality.filter((entry) => entry.status !== 'Closed').length;
    const currentDocs = fDocuments.filter((d) => d.status === 'Current').length;
    const underReviewDocs = fDocuments.filter((d) => d.status === 'Under Review').length;
    const approvedDocs = fDocuments.filter((d) => d.status === 'Approved').length;
    const docsByType: Record<string, number> = {};
    fDocuments.forEach((d) => { docsByType[d.document_type] = (docsByType[d.document_type] || 0) + 1; });

    return {
      totalBudget, totalSpent, activeProjects, completedProjects, planningProjects, onHoldProjects,
      delayedTasks, completedTasks, inProgressTasks, notStartedTasks,
      avgProgress, budgetUtilization,
      byStatus, byCategory, taskStatusCounts, taskPriorityCounts,
      totalPlannedCosts, totalActualCosts, totalCommittedCosts, totalPlannedWork, totalEarnedWork, costVariance,
      openSafety, closedSafety, investigatingSafety, highSeverity, safetyByType,
      deliveredProcurement, pendingProcurement, orderedProcurement, partialProcurement, requestedProcurement, totalProcurementValue,
      totalWorkers, avgPercentComplete,
      criticalPathCount, delayedSchedules, completedSchedules, totalContractValue, modifiedContractValue, activeContracts,
      totalBOQAmount, totalInflow, totalOutflow, netCashFlow, forecastNetCashFlow, forecast30, forecast60, forecast90,
      subInvoiceTotal, subInvoicePaid, subOutstanding,
      clientInvoiceTotal, clientInvoicePaid, clientOutstanding,
      variationCostImpact, approvedVariationCostImpact, totalVariations: mainVariations.length, pendingVariations, approvedVariations,
      approvedBaselines, openReportingPeriods, openGovernanceItems, criticalGovernanceItems,
      openRfis, pendingSubmittals, openQualityItems,
      currentDocs, underReviewDocs, approvedDocs, docsByType,
    };
  }, [fProjects, fTasks, fCosts, fCostEntries, fProcurement, fSafety, fProgress, fSchedules, fWirs, primaryContracts, fBOQ, fCashFlow, fSubInv, fClientInv, fVariations, fDocuments, fBaselines, fReportingPeriods, fGovernance, fRfis, fSubmittals, fQuality, reportDate, evm]);

  const [healthScore, healthBreakdown] = useMemo(() => {
    let score = 100;
    const breakdown: string[] = [];

    const addPenalty = (value: number, max: number, message: string) => {
      const penalty = Math.min(value, max);
      if (penalty > 0) {
        score -= penalty;
        breakdown.push(`${message}: -${penalty}`);
      }
      return penalty;
    };

    addPenalty(stats.delayedTasks * 5, 25, `${stats.delayedTasks} delayed tasks`);
    addPenalty(stats.highSeverity * 8, 20, `${stats.highSeverity} high/critical safety issues`);
    addPenalty(stats.openSafety * 3, 10, `${stats.openSafety} open safety issues`);
    addPenalty(stats.criticalGovernanceItems * 8, 20, `${stats.criticalGovernanceItems} critical governance items`);
    addPenalty(stats.openQualityItems * 2, 10, `${stats.openQualityItems} open quality items`);
    addPenalty(stats.openRfis, 5, `${stats.openRfis} open RFIs`);
    
    if (evm.CPI > 0 && evm.CPI < 0.9) {
      const penalty = 15;
      score -= penalty;
      breakdown.push(`CPI ${evm.CPI.toFixed(2)} (below 0.9): -${penalty}`);
    }
    
    if (evm.SPI > 0 && evm.SPI < 0.9) {
      const penalty = 10;
      score -= penalty;
      breakdown.push(`SPI ${evm.SPI.toFixed(2)} (below 0.9): -${penalty}`);
    }

    if (stats.budgetUtilization > 90) {
      const penalty = 10;
      score -= penalty;
      breakdown.push(`Budget utilization ${stats.budgetUtilization}%: -${penalty}`);
    }

    if (stats.netCashFlow < 0) {
      const penalty = 5;
      score -= penalty;
      breakdown.push(`Negative cash flow: -${penalty}`);
    }

    addPenalty(stats.pendingVariations * 2, 5, `${stats.pendingVariations} pending variations`);

    return [Math.max(0, Math.round(score)), breakdown] as const;
  }, [stats, evm]);

  const warnings = useMemo(() => generateWarnings(
    evm.CPI,
    evm.SPI,
    stats.delayedTasks,
    stats.highSeverity,
    stats.criticalGovernanceItems
  ), [evm.CPI, evm.SPI, stats.delayedTasks, stats.highSeverity, stats.criticalGovernanceItems]);

  const warningBanner = warnings.length > 0 && (
    <div className="mb-5">
      {warnings.map((warning, index) => (
        <div
          key={index}
          className={`p-3 mb-2 rounded-lg border-l-4 ${warning.severity === 'critical' 
            ? 'bg-red-50 border-red-500 text-red-700' 
            : 'bg-yellow-50 border-yellow-500 text-yellow-700'}`}
        >
          <div className="flex items-center gap-2">
            {warning.severity === 'critical' ? (
              <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
            ) : (
              <AlertTriangle size={16} className="text-yellow-500 flex-shrink-0" />
            )}
            <span className="font-medium">{warning.message}</span>
            <span className="ml-auto font-semibold mr-3">{warning.value.toFixed(2)}</span>
            <button
              type="button"
              onClick={() => {
                setSelectedWarningForAction(warning);
                setActionAssignedTo('');
                setActionDueDate('');
              }}
              className="text-xs font-medium px-2.5 py-1 rounded bg-white border border-neutral-300 hover:bg-neutral-50 shadow-sm transition-colors cursor-pointer text-neutral-800 shrink-0"
            >
              Create Action
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  const healthLabel = healthScore >= 80 ? 'Healthy' : healthScore >= 60 ? 'At Risk' : 'Critical';
  const healthColor = healthScore >= 80 ? 'var(--color-success-500)' : healthScore >= 60 ? 'var(--color-warning-500)' : 'var(--color-error-500)';

  const actionItems = useMemo(() => {
    const items: { severity: 'high' | 'medium' | 'low'; icon: typeof AlertCircle; text: string; view: ViewKey }[] = [];
    if (stats.highSeverity > 0)
      items.push({ severity: 'high', icon: AlertCircle, text: `${stats.highSeverity} high/critical safety issue${stats.highSeverity > 1 ? 's' : ''} require immediate attention`, view: 'safety' });
    if (stats.delayedTasks > 0)
      items.push({ severity: 'high', icon: AlertCircle, text: `${stats.delayedTasks} task${stats.delayedTasks > 1 ? 's' : ''} delayed — review schedule and assign resources`, view: 'tasks' });
    if (stats.delayedSchedules > 0)
      items.push({ severity: 'high', icon: AlertCircle, text: `${stats.delayedSchedules} schedule activit${stats.delayedSchedules > 1 ? 'ies' : 'y'} delayed — impact on critical path likely`, view: 'schedule' });
    if (evm.CPI < 0.9 && evm.CPI > 0)
      items.push({ severity: 'high', icon: TrendingDown, text: `Cost Performance Index at ${evm.CPI.toFixed(2)} — project is over budget. EAC: ${fmtMoney(evm.EAC)}`, view: 'costs' });
    if (evm.SPI < 0.9 && evm.SPI > 0)
      items.push({ severity: 'high', icon: TrendingDown, text: `Schedule Performance Index at ${evm.SPI.toFixed(2)} — project is behind schedule`, view: 'schedule' });
    if (stats.budgetUtilization > 90)
      items.push({ severity: 'high', icon: AlertTriangle, text: `Budget utilization at ${stats.budgetUtilization}% — approaching budget limit`, view: 'costs' });
    if (stats.openSafety > 0)
      items.push({ severity: 'medium', icon: ShieldAlert, text: `${stats.openSafety} open safety issue${stats.openSafety > 1 ? 's' : ''} need${stats.openSafety > 1 ? '' : 's'} resolution`, view: 'safety' });
    if (stats.pendingVariations > 0)
      items.push({ severity: 'medium', icon: GitBranch, text: `${stats.pendingVariations} variation${stats.pendingVariations > 1 ? 's' : ''} pending approval — cost impact: ${fmtMoney(stats.variationCostImpact)}`, view: 'variations' });
    if (stats.openRfis > 0)
      items.push({ severity: 'medium', icon: FileText, text: `${stats.openRfis} open RFI${stats.openRfis > 1 ? 's' : ''} may affect field progress`, view: 'rfi' });
    if (stats.pendingSubmittals > 0)
      items.push({ severity: 'medium', icon: ClipboardList, text: `${stats.pendingSubmittals} submittal${stats.pendingSubmittals > 1 ? 's' : ''} awaiting review or resubmission`, view: 'submittals' });
    if (stats.openQualityItems > 0)
      items.push({ severity: 'medium', icon: CheckCircle2, text: `${stats.openQualityItems} open NCR / punch item${stats.openQualityItems > 1 ? 's' : ''} require closure`, view: 'quality' });
    if (stats.subOutstanding > 0)
      items.push({ severity: 'medium', icon: Receipt, text: `${fmtMoney(stats.subOutstanding)} outstanding subcontractor invoice payments`, view: 'subinvoices' });
    if (stats.clientOutstanding > 0)
      items.push({ severity: 'medium', icon: FileText, text: `${fmtMoney(stats.clientOutstanding)} outstanding client invoice collections`, view: 'clientinvoices' });
    if (stats.pendingProcurement > 0)
      items.push({ severity: 'medium', icon: Package, text: `${stats.pendingProcurement} procurement item${stats.pendingProcurement > 1 ? 's' : ''} pending delivery`, view: 'procurement' });
    if (stats.netCashFlow < 0)
      items.push({ severity: 'medium', icon: Banknote, text: `Negative net cash flow of ${fmtMoney(stats.netCashFlow)} — review inflows vs outflows`, view: 'cashflow' });
    if (stats.criticalPathCount > 0)
      items.push({ severity: 'low', icon: CalendarClock, text: `${stats.criticalPathCount} activit${stats.criticalPathCount > 1 ? 'ies' : 'y'} on critical path — monitor closely`, view: 'schedule' });
    if (evm.VAC < 0)
      items.push({ severity: 'low', icon: DollarSign, text: `Projected to exceed budget by ${fmtMoney(Math.abs(evm.VAC))} at completion`, view: 'costs' });
    return items;
  }, [stats, evm]);

  const cashFlowTrend = useMemo(() => {
    const sorted = fCashFlow.filter((c: any) => !c.movement_type || c.movement_type === 'Actual' || c.movement_type === 'Manual').sort((a, b) => {
      const da = a.date || a.created_at || '';
      const db = b.date || b.created_at || '';
      return da.localeCompare(db);
    });
    let cumulative = 0;
    return sorted.map((c) => {
      cumulative += (c.net || ((c.inflow || 0) - (c.outflow || 0)));
      return { label: c.date || c.description || '', cumulative, inflow: c.inflow || 0, outflow: c.outflow || 0 };
    });
  }, [fCashFlow]);

  const costByCategory = useMemo(() => {
    const map: Record<string, { planned: number; actual: number }> = {};
    fCosts.forEach((c) => {
      const cat = c.category || 'Uncategorized';
      if (!map[cat]) map[cat] = { planned: 0, actual: 0 };
      map[cat].planned += c.planned || 0;
      map[cat].actual += c.actual || 0;
    });
    return map;
  }, [fCosts]);

  const scheduleProgress = useMemo(() => {
    return fSchedules.slice(0, 8).map((s) => ({
      activity: s.activity || 'Unnamed',
      progress: s.progress || 0,
      critical: s.critical_path,
      status: s.status,
    }));
  }, [fSchedules]);

  const sCurve = useMemo(() => {
    if (fSchedules.length === 0) return [];
    const evmContractIds = primaryContracts.map((contract) => contract.id);
    const evmContractIdSet = new Set(evmContractIds);
    const performanceContractIdSet = new Set(evmPerformanceContractIds);
    const evmSchedules = fSchedules.filter((schedule: any) => evmContractIdSet.has(String(schedule.contract_id || '')));
    const activityRows = evmSchedules.filter((schedule: any) => String(schedule.activity || '').trim());
    const datedSchedules = activityRows.length > 0 ? activityRows : fSchedules;
    const dates = [
      ...datedSchedules.flatMap((schedule) => [schedule.forecast_start_date || schedule.start_date, schedule.forecast_end_date || schedule.end_date]),
      ...fWirs.filter((wir) => performanceContractIdSet.has(String(wir.contract_id || ''))).map((wir) => wir.inspection_date),
      ...fCostEntries.filter((entry) => performanceContractIdSet.has(String(entry.contract_id || ''))).map((entry) => entry.date),
      ...fCashFlow.map((entry) => entry.date),
      ...resourceForecast.map((point) => point.date),
      reportDate,
    ].filter((date): date is string => Boolean(date)).sort();
    if (dates.length === 0) return [];
    const horizon = deriveForecastHorizon({ schedules: datedSchedules as Record<string, any>[], cashFlow: fCashFlow as Record<string, any>[], resourceForecast, reportDate });
    const projectStart = horizon.startDate || dates[0];
    const projectEnd = horizon.endDate || dates[dates.length - 1];

    const startMs = new Date(projectStart).getTime();
    const endMs = new Date(projectEnd).getTime();
    const totalDays = Math.max(Math.ceil((endMs - startMs) / 86400000), 1);
    const dataDateEvm = calculateEvmAtDataDate({
      contractIds: evmContractIds, performanceContractIds: evmPerformanceContractIds, dataDate: reportDate,
      schedules: fSchedules as Record<string, any>[], scheduleDistributions, baselines: fBaselines as Record<string, any>[],
      wirEntries: fWirs as Record<string, any>[], progressCorrections: fProgressCorrections as Record<string, any>[], boqItems: fBOQ as Record<string, any>[], costEntries: fCostEntries as Record<string, any>[],
      controlAccounts: fControlAccounts as Record<string, any>[], contractSovLines: fContractSovLines as Record<string, any>[],
      procurement: fProcurement as Record<string, any>[], procurementReceipts: fProcurementReceipts as Record<string, any>[],
    });
    const points: { label: string; planned: number; earned: number; actual: number; forecast: number; cash: number; estimate: number; resourceForecast: number; date: string }[] = [];
    const numPoints = Math.min(totalDays, 30);
    for (let i = 0; i <= numPoints; i++) {
      const dayOffset = (i / numPoints) * totalDays;
      const currentDate = new Date(startMs + dayOffset * 86400000);
      const dateStr = currentDate.toISOString().slice(0, 10);
      const pointEvm = calculateEvmAtDataDate({
        contractIds: evmContractIds, performanceContractIds: evmPerformanceContractIds, dataDate: dateStr,
        schedules: fSchedules as Record<string, any>[], scheduleDistributions, baselines: fBaselines as Record<string, any>[],
        wirEntries: fWirs as Record<string, any>[], progressCorrections: fProgressCorrections as Record<string, any>[], boqItems: fBOQ as Record<string, any>[], costEntries: fCostEntries as Record<string, any>[],
        controlAccounts: fControlAccounts as Record<string, any>[], contractSovLines: fContractSovLines as Record<string, any>[],
        procurement: fProcurement as Record<string, any>[], procurementReceipts: fProcurementReceipts as Record<string, any>[],
      });
      const planned = pointEvm.revenue.PV;
      const earned = pointEvm.revenue.EV;
      const actual = pointEvm.cost.AC;
      const cashPosition = cashForecastAt(fCashFlow as Record<string, any>[], dateStr);
      const dateEstimate = dateStr <= reportDate
        ? actual
        : (() => {
          const forecastDays = Math.max(1, Math.ceil((endMs - new Date(`${reportDate}T00:00:00`).getTime()) / 86400000));
          const elapsedForecastDays = Math.max(0, Math.ceil((new Date(`${dateStr}T00:00:00`).getTime() - new Date(`${reportDate}T00:00:00`).getTime()) / 86400000));
          const costEac = dataDateEvm.cost.EAC;
          if (costEac === null) return dataDateEvm.cost.AC;
          return Math.min(costEac, dataDateEvm.cost.AC + Math.max(0, costEac - dataDateEvm.cost.AC) * Math.min(1, elapsedForecastDays / forecastDays));
        })();
      points.push({ label: dateStr, planned, earned, actual, forecast: cashPosition.forecastNet, cash: cashPosition.actualNet, estimate: dateEstimate, resourceForecast: plannedResourceCostAt(resourceForecast, dateStr), date: dateStr });
    }
    return points;
  }, [fSchedules, fWirs, fProgressCorrections, fCostEntries, fBOQ, fControlAccounts, fContractSovLines, fProcurement, fProcurementReceipts, primaryContracts, evmPerformanceContractIds, scheduleDistributions, fCashFlow, fBaselines, reportDate, resourceForecast]);

  const operationalScope = useMemo(() => buildOperationalScopeReport({
    boqItems: fBOQ as Record<string, any>[], variations: fVariations as Record<string, any>[],
    schedules: fSchedules as Record<string, any>[], wirEntries: fWirs as Record<string, any>[],
    costEntries: fCostEntries as Record<string, any>[], procurementReceipts: fProcurementReceipts as Record<string, any>[], dataDate: reportDate,
  }), [fBOQ, fVariations, fSchedules, fWirs, fCostEntries, fProcurementReceipts, reportDate]);

  const wasteLedger = useMemo(() => buildBoqWasteLedger({
    boqItems: fBOQ as Record<string, any>[], procurementReceipts: fProcurementReceipts as Record<string, any>[],
    wirEntries: fWirs as Record<string, any>[], progressCorrections: fProgressCorrections as Record<string, any>[], dataDate: reportDate,
  }), [fBOQ, fProcurementReceipts, fWirs, fProgressCorrections, reportDate]);

  const earnedSchedule = useMemo(() => calculateEarnedScheduleFromSeries(sCurve, reportDate), [sCurve, reportDate]);

  const ganttActivities = useMemo(() => fSchedules.map((schedule: any) => {
    const baseline = approvedBaselinePlanForActivity(schedule, scheduleDistributions, fBaselines as Record<string, any>[]).activity;
    const currentStart = String(schedule.start_date || schedule.forecast_start_date || '');
    const currentFinish = String(schedule.end_date || schedule.forecast_end_date || currentStart);
    return {
      id: String(schedule.activity_code || schedule.id), name: String(schedule.activity || schedule.activity_code || 'Unnamed activity'),
      wbs: String(schedule.wbs_code || ''), baselineStart: String(baseline.start_date || currentStart), baselineFinish: String(baseline.end_date || currentFinish),
      currentStart, currentFinish, forecastStart: String(schedule.forecast_start_date || currentStart),
      forecastFinish: String(schedule.forecast_end_date || currentFinish), progress: Number(schedule.progress) || 0,
      isCritical: Boolean(schedule.critical_path), totalFloat: Number(schedule.total_float_days ?? schedule.total_float ?? 0),
    };
  }).filter((activity) => activity.currentStart && activity.currentFinish), [fSchedules, scheduleDistributions, fBaselines]);

  const projectCurrency = (selectedProject as any)?.currency || '$';

  const cashFlowData = useMemo(() => {
    // 1. Check if we have valid dated cash flow entries
    const validEntries = fCashFlow.filter((c) => Boolean(c.date) && !['Cancelled', 'Rejected'].includes(c.status || ''));

    if (validEntries.length > 0) {
      const monthMap = new Map<string, { plannedInflow: number; actualInflow: number; plannedOutflow: number; actualOutflow: number; hasActual: boolean }>();

      validEntries.forEach((c) => {
        const period = (c.date || '').slice(0, 7);
        if (!period) return;
        if (!monthMap.has(period)) {
          monthMap.set(period, { plannedInflow: 0, actualInflow: 0, plannedOutflow: 0, actualOutflow: 0, hasActual: false });
        }
        const data = monthMap.get(period)!;
        const inf = Number(c.inflow) || 0;
        const outf = Number(c.outflow) || 0;
        const isForecast = c.movement_type === 'Forecast' || (c.date || '') > reportDate;

        if (isForecast) {
          data.plannedInflow += inf;
          data.plannedOutflow += outf;
        } else {
          data.actualInflow += inf;
          data.actualOutflow += outf;
          data.hasActual = true;
          data.plannedInflow += inf;
          data.plannedOutflow += outf;
        }
      });

      const sortedPeriods = Array.from(monthMap.keys()).sort();
      if (sortedPeriods.length > 0) {
        return sortedPeriods.map((period) => {
          const item = monthMap.get(period)!;
          return {
            period,
            plannedInflow: Math.round(item.plannedInflow),
            actualInflow: item.hasActual ? Math.round(item.actualInflow) : undefined,
            plannedOutflow: Math.round(item.plannedOutflow),
            actualOutflow: item.hasActual ? Math.round(item.actualOutflow) : undefined,
          };
        });
      }
    }

    // Never manufacture a forecast when the governed source data is absent.
    return [];
  }, [fCashFlow, reportDate]);

  const projectsWithStats: ProjectWithStats[] = useMemo(() => {
    return fProjects.map((p) => {
      const pTasks = fTasks.filter((t) => t.project_id === p.id);
      return { ...p, task_count: pTasks.length, completed_tasks: pTasks.filter((t) => t.status === 'Completed').length };
    });
  }, [fProjects, fTasks]);

  const filteredProjectStats = useMemo(() => {
    let items = projectsWithStats;
    if (statusFilter !== 'all') items = items.filter((p) => p.status === statusFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.client || '').toLowerCase().includes(q) ||
        (p.location || '').toLowerCase().includes(q) ||
        (p.project_manager || '').toLowerCase().includes(q)
      );
    }
    return items;
  }, [projectsWithStats, statusFilter, searchQuery]);

  const statusColors: Record<string, string> = {
    'Planning': 'var(--color-secondary-500)',
    'In Progress': 'var(--color-primary-500)',
    'On Hold': 'var(--color-warning-500)',
    'Completed': 'var(--color-success-500)',
  };

  const maxCategoryBudget = Math.max(...Object.values(stats.byCategory).map((c) => c.budget), 1);
  const maxCostCategory = Math.max(...Object.values(costByCategory).map((c) => Math.max(c.planned, c.actual)), 1);
  const animatedHealth = useAnimatedNumber(healthScore);

  const kpis = [
    {
      label: pid === 'all' ? 'Portfolio Status' : 'Project Status',
      value: pid === 'all' ? `${stats.activeProjects}/${projects.length}` : (selectedProject?.status || '—'),
      sub: pid === 'all' ? `${stats.activeProjects} active · ${stats.completedProjects} done` : `${selectedProject?.client || ''}`,
      icon: FolderKanban,
      color: 'from-primary-500 to-primary-600',
      trend: 'up' as const,
      view: 'portfolio' as ViewKey,
    },
    {
      label: 'Modified Contract Value',
      value: fmtMoney(reconciledKpis.modifiedContractValue.value ?? 0),
      sub: `${fmtMoney(stats.totalSpent)} spent (${stats.budgetUtilization}%)`,
      icon: FileSignature,
      color: 'from-secondary-500 to-secondary-600',
      trend: 'up' as const,
      view: 'contracts' as ViewKey,
      reconciliationKey: 'modified_contract_value',
    },
    {
      label: 'Revenue Planned Value (PV)',
      value: fmtMoney(reconciledKpis.revenuePv.value ?? 0),
      sub: `As of ${reportDate} · Revenue BAC ${fmtMoney(evm.revenue.BAC)}`,
      icon: CheckCircle2,
      color: 'from-primary-500 to-primary-600',
      trend: evm.SPI >= 1 ? ('up' as const) : ('down' as const),
      view: 'schedule' as ViewKey,
      reconciliationKey: 'revenue_pv',
    },
    {
      label: 'Revenue Earned Value (EV)',
      value: fmtMoney(reconciledKpis.revenueEv.value ?? 0),
      sub: `SPI ${evm.SPI > 0 ? evm.SPI.toFixed(2) : '—'} · ${evm.SPI >= 1 ? 'on/ahead of plan' : 'behind plan'}`,
      icon: TrendingUp,
      color: evm.SPI >= 1 ? 'from-success-500 to-success-600' : 'from-warning-500 to-warning-600',
      trend: evm.SPI >= 1 ? ('up' as const) : ('down' as const),
      view: 'progress' as ViewKey,
      reconciliationKey: 'revenue_ev',
    },
    {
      label: 'Delivery Actual Cost (AC)',
      value: fmtMoney(reconciledKpis.deliveryAc.value ?? 0),
      sub: `Cost CPI ${evm.cost.CPI !== null ? evm.cost.CPI.toFixed(2) : 'Unavailable'} · ${evm.cost.CPI !== null && evm.cost.CPI >= 1 ? 'cost efficient' : evm.cost.CPI === null ? 'approved cost plan required' : 'cost exposure'}`,
      icon: DollarSign,
      color: evm.cost.CPI !== null && evm.cost.CPI >= 1 ? 'from-success-500 to-success-600' : evm.cost.CPI === null ? 'from-neutral-400 to-neutral-500' : 'from-error-500 to-error-600',
      trend: evm.cost.CPI !== null && evm.cost.CPI >= 1 ? ('up' as const) : ('down' as const),
      view: 'costs' as ViewKey,
      reconciliationKey: 'delivery_ac',
    },
    {
      label: 'Net Cash Flow',
      value: fmtMoney(reconciledKpis.netCashFlow.value ?? 0),
      sub: `Actual: In ${fmtMoney(stats.totalInflow)} · Out ${fmtMoney(stats.totalOutflow)} | F30 ${fmtMoney(stats.forecast30)} · F60 ${fmtMoney(stats.forecast60)} · F90 ${fmtMoney(stats.forecast90)}`,
      icon: CircleDollarSign,
      color: stats.netCashFlow >= 0 ? 'from-success-500 to-success-600' : 'from-error-500 to-error-600',
      trend: stats.netCashFlow >= 0 ? ('up' as const) : ('down' as const),
      view: 'cashflow' as ViewKey,
      reconciliationKey: 'net_cash_flow',
    },
    {
      label: 'PMO Actions',
      value: actionItems.length.toString(),
      sub: `${stats.delayedTasks} delayed tasks · ${stats.highSeverity} high HSE issue(s)`,
      icon: Zap,
      color: actionItems.length > 0 ? 'from-warning-500 to-warning-600' : 'from-success-500 to-success-600',
      trend: actionItems.length > 0 ? ('down' as const) : ('up' as const),
      view: 'tasks' as ViewKey,
    },
    {
      label: 'PMO Health',
      value: `${healthScore}/100`,
      sub: healthLabel,
      icon: HeartPulse,
      color: healthScore >= 80 ? 'from-success-500 to-success-600' : healthScore >= 60 ? 'from-warning-500 to-warning-600' : 'from-error-500 to-error-600',
      trend: healthScore >= 60 ? ('up' as const) : ('down' as const),
      view: 'dashboard' as ViewKey,
    },
  ];

  const evmCards = [
    { label: 'Revenue BAC', desc: 'Approved selling baseline', value: fmtMoney(evm.revenue.BAC), icon: Target, color: 'text-neutral-700 bg-neutral-100' },
    { label: 'Revenue PV', desc: 'Selling value planned to date', value: fmtMoney(reconciledKpis.revenuePv.value ?? 0), icon: Clock, color: 'text-secondary-600 bg-secondary-50', reconciliationKey: 'revenue_pv' },
    { label: 'Revenue EV', desc: 'Approved work at selling rate', value: fmtMoney(reconciledKpis.revenueEv.value ?? 0), icon: CheckCircle2, color: 'text-primary-600 bg-primary-50', reconciliationKey: 'revenue_ev' },
    { label: 'Revenue SPI', desc: 'Revenue EV / Revenue PV', value: evm.revenue.SPI > 0 ? evm.revenue.SPI.toFixed(2) : '—', icon: Gauge, color: evm.revenue.SPI >= 1 ? 'text-success-600 bg-success-50' : 'text-error-600 bg-error-50', sub: evm.revenue.SPI >= 1 ? 'On/ahead of plan' : 'Behind plan' },
    { label: 'Cost BAC', desc: 'Approved delivery-cost plan', value: fmtAvailableMoney(reconciledKpis.costBac.value), icon: Target, color: 'text-neutral-700 bg-neutral-100', reconciliationKey: 'cost_bac' },
    { label: 'Cost PV', desc: 'Delivery cost planned to date', value: fmtAvailableMoney(reconciledKpis.costPv.value), icon: Clock, color: 'text-secondary-600 bg-secondary-50', reconciliationKey: 'cost_pv' },
    { label: 'Cost EV', desc: 'Earned work at delivery-cost rate', value: fmtAvailableMoney(reconciledKpis.costEv.value), icon: CheckCircle2, color: 'text-primary-600 bg-primary-50', reconciliationKey: 'cost_ev' },
    { label: 'AC', desc: 'Delivery actual cost', value: fmtMoney(reconciledKpis.deliveryAc.value ?? 0), icon: DollarSign, color: 'text-accent-600 bg-accent-50', reconciliationKey: 'delivery_ac' },
    { label: 'Open Commitment', desc: 'Ordered value not yet received', value: fmtMoney(reconciledKpis.openCommitment.value ?? 0), icon: PackageCheck, color: 'text-warning-700 bg-warning-50', reconciliationKey: 'open_commitment' },
    { label: 'Cost CV', desc: 'Cost EV - AC', value: fmtAvailableMoney(evm.cost.CV), icon: (evm.cost.CV ?? 0) >= 0 ? TrendingUp : TrendingDown, color: evm.cost.CV === null ? 'text-neutral-600 bg-neutral-100' : evm.cost.CV >= 0 ? 'text-success-600 bg-success-50' : 'text-error-600 bg-error-50', sub: evm.cost.CV === null ? 'Approved cost plan required' : evm.cost.CV >= 0 ? 'Under budget' : 'Over budget' },
    { label: 'Cost CPI', desc: 'Cost EV / AC', value: evm.cost.CPI !== null && evm.cost.CPI > 0 ? evm.cost.CPI.toFixed(2) : 'Unavailable', icon: Gauge, color: evm.cost.CPI === null ? 'text-neutral-600 bg-neutral-100' : evm.cost.CPI >= 1 ? 'text-success-600 bg-success-50' : 'text-error-600 bg-error-50', sub: evm.cost.CPI === null ? 'Approved cost plan required' : evm.cost.CPI >= 1 ? 'Cost efficient' : 'Cost overrun' },
    { label: 'Cost EAC', desc: 'Delivery estimate at completion', value: fmtAvailableMoney(reconciledKpis.costEac.value), icon: Activity, color: evm.cost.VAC === null ? 'text-neutral-600 bg-neutral-100' : evm.cost.VAC >= 0 ? 'text-success-600 bg-success-50' : 'text-error-600 bg-error-50', reconciliationKey: 'cost_eac' },
    { label: 'Margin BAC', desc: 'Revenue BAC - Cost BAC', value: fmtAvailableMoney(evm.margin.grossMarginBAC), icon: Wallet, color: 'text-primary-600 bg-primary-50' },
  ];

  const severityStyles = {
    high: 'border-error-200 bg-error-50',
    medium: 'border-warning-200 bg-warning-50',
    low: 'border-primary-200 bg-primary-50',
  };
  const severityIconColors = { high: 'text-error-600', medium: 'text-warning-600', low: 'text-primary-600' };

  const tabs: { key: DashboardTab; label: string; icon: typeof LayoutDashboard }[] = [
    { key: 'overview', label: 'Executive Overview', icon: LayoutDashboard },
    { key: 'report', label: 'PMO Report Pack', icon: Printer },
    { key: 'financials', label: 'Commercial & EVM', icon: BarChart3 },
    { key: 'schedule', label: 'Time Controls', icon: CalendarClock },
    { key: 'action', label: `PMO Actions${actionItems.length > 0 ? ` (${actionItems.length})` : ''}`, icon: Zap },
    { key: 'procurement', label: 'Resources', icon: Truck },
    { key: 'safety', label: 'HSE & Quality', icon: ShieldAlert },
    { key: 'documents', label: 'Records', icon: FileCheck2 },
  ];

  const procurementStatuses = [
    { label: 'Requested', count: stats.requestedProcurement, color: 'var(--color-secondary-400)' },
    { label: 'Ordered', count: stats.orderedProcurement, color: 'var(--color-primary-400)' },
    { label: 'Partially Delivered', count: stats.partialProcurement, color: 'var(--color-warning-400)' },
    { label: 'Delivered', count: stats.deliveredProcurement, color: 'var(--color-success-400)' },
  ];

  return (
    <div className="flex-1 overflow-auto scrollbar-thin bg-neutral-50">
      <div className="p-6 max-w-7xl mx-auto animate-fade-in">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">PMO Command Center</h2>
            <p className="text-sm text-neutral-500 mt-1">
              {pid === 'all'
                ? 'Portfolio decisions first: value, delivery performance, cost exposure and actions requiring management attention.'
                : `Management control view for ${selectedProject?.name || 'project'}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => window.print()} className="no-print flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-neutral-600 border border-neutral-200 rounded-xl bg-white shadow-sm hover:border-primary-300 transition-colors">
              <Printer size={15} /> Print
            </button>
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm font-medium text-neutral-600 shadow-sm" title="Controlled by the application Data Date selector; this reporting cut-off does not modify records">
              <CalendarClock size={15} className="text-neutral-400" />
              <span>As of {asOfDate}</span>
            </div>
            <div className="relative">
              <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="appearance-none pl-9 pr-10 py-2.5 text-sm font-medium border border-neutral-200 rounded-xl bg-white shadow-sm hover:border-primary-300 focus:outline-none focus:border-primary-400 transition-colors min-w-56"
              >
                <option value="all">All Projects</option>
                {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Warning Banner */}
        {warningBanner}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {kpis.map((kpi, i) => {
            const Icon = kpi.icon;
            const TrendIcon = kpi.trend === 'up' ? ArrowUpRight : ArrowDownRight;
            const hasDrilldown = 'reconciliationKey' in kpi && Boolean(kpi.reconciliationKey);
            return (
              <button
                key={i}
                onClick={() => kpi.view !== 'dashboard' && onNavigate(kpi.view)}
                className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm hover:shadow-md transition-all text-left hover:border-primary-300 group relative overflow-hidden"
              >
                <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full bg-gradient-to-br ${kpi.color} opacity-5 group-hover:opacity-10 transition-opacity`} />
                <div className="flex items-start justify-between mb-3 relative">
                  <div className={`w-11 h-11 rounded-lg bg-gradient-to-br ${kpi.color} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform`}>
                    <Icon size={20} className="text-white" />
                  </div>
                  <div className="flex items-center gap-2">
                    {hasDrilldown && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setDrilldownKpiKey((kpi as any).reconciliationKey);
                        }}
                        title="Open source drill-down & reconciliation audit"
                        className="px-1.5 py-0.5 rounded bg-neutral-100 hover:bg-primary-50 text-neutral-500 hover:text-primary-700 border border-neutral-200 text-[10px] font-semibold flex items-center gap-1 transition-colors z-10"
                      >
                        <Layers size={11} />
                        Audit
                      </span>
                    )}
                    <div className={`flex items-center gap-1 text-xs font-medium ${kpi.trend === 'up' ? 'text-success-600' : 'text-error-600'}`}>
                      <TrendIcon size={14} />
                    </div>
                  </div>
                </div>
                <p className="text-2xl font-bold text-neutral-900 relative">{kpi.value}</p>
                <p className="text-sm text-neutral-500 mt-0.5 relative">{kpi.label}</p>
                <p className="text-xs text-neutral-400 mt-1 relative">{kpi.sub}</p>
              </button>
            );
          })}
        </div>

        {/* Tab bar */}
        <div className="mb-5 flex items-center gap-1 bg-white rounded-xl border border-neutral-200 shadow-sm p-1 overflow-x-auto scrollbar-thin">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  isActive ? 'bg-primary-600 text-white shadow-sm' : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ============ OVERVIEW TAB ============ */}
        {activeTab === 'overview' && (
          <div className="space-y-5 animate-fade-in">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <button onClick={() => onNavigate('baselines')} className="rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-sm hover:border-primary-300"><p className="text-xs font-medium text-neutral-500">Approved Baselines</p><p className="mt-1 text-2xl font-bold text-neutral-900">{stats.approvedBaselines}</p><p className="mt-1 text-xs text-neutral-500">Approved control points</p></button>
              <button onClick={() => onNavigate('reportingPeriods')} className="rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-sm hover:border-primary-300"><p className="text-xs font-medium text-neutral-500">Open Reporting Periods</p><p className="mt-1 text-2xl font-bold text-neutral-900">{stats.openReportingPeriods}</p><p className="mt-1 text-xs text-neutral-500">Data-date governance</p></button>
              <button onClick={() => onNavigate('governance')} className="rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-sm hover:border-primary-300"><p className="text-xs font-medium text-neutral-500">Open Risks / Issues</p><p className="mt-1 text-2xl font-bold text-neutral-900">{stats.openGovernanceItems}</p><p className="mt-1 text-xs text-neutral-500">Require ownership and action</p></button>
              <button onClick={() => onNavigate('governance')} className={`rounded-xl border p-4 text-left shadow-sm hover:border-primary-300 ${stats.criticalGovernanceItems > 0 ? 'border-error-200 bg-error-50' : 'border-neutral-200 bg-white'}`}><p className="text-xs font-medium text-neutral-500">Critical Governance Items</p><p className="mt-1 text-2xl font-bold text-neutral-900">{stats.criticalGovernanceItems}</p><p className="mt-1 text-xs text-neutral-500">Critical likelihood or impact</p></button>
            </div>
            {/* Health Score + Charts row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Health Score Gauge */}
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <HeartPulse size={16} className="text-primary-600" />
                  <h3 className="text-sm font-semibold text-neutral-700">Project Health Score</h3>
                </div>
                <div className="flex items-center justify-center">
                  <div className="relative w-40 h-40">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-neutral-100)" strokeWidth="8" />
                      <circle
                        cx="50" cy="50" r="42" fill="none"
                        stroke={healthColor}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${(animatedHealth / 100) * 264} 264`}
                        className="transition-all duration-700"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-bold text-neutral-900">{Math.round(animatedHealth)}</span>
                      <span className="text-xs font-medium mt-1" style={{ color: healthColor }}>{healthLabel}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <details className="text-xs text-neutral-500">
                    <summary className="cursor-pointer hover:text-primary-600">
                      Health score breakdown ({healthBreakdown.length} factors)
                    </summary>
                    <ul className="mt-2 space-y-1 pl-4">
                      {healthBreakdown.map((item, i) => {
                        let view: ViewKey | null = null;
                        if (item.includes('CPI') || item.includes('Budget')) {
                          view = 'costs';
                        } else if (item.includes('SPI') || item.includes('delayed tasks')) {
                          view = 'schedule';
                        } else if (item.includes('safety') || item.includes('HSE')) {
                          view = 'safety';
                        } else if (item.includes('variation')) {
                          view = 'variations';
                        } else if (item.includes('governance') || item.includes('RFI') || item.includes('quality')) {
                          view = 'governance';
                        }

                        return (
                          <li key={i} className="list-disc">
                            {view ? (
                              <button 
                                onClick={() => onNavigate(view as ViewKey)}
                                className="text-left hover:text-primary-600 hover:underline"
                              >
                                {item}
                              </button>
                            ) : (
                              <span>{item}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-success-50 py-2">
                    <p className="text-xs text-neutral-500">Delayed</p>
                    <p className="text-sm font-bold text-neutral-800">{stats.delayedTasks}</p>
                  </div>
                  <div className="rounded-lg bg-error-50 py-2">
                    <p className="text-xs text-neutral-500">Safety</p>
                    <p className="text-sm font-bold text-neutral-800">{stats.openSafety}</p>
                  </div>
                  <div className="rounded-lg bg-warning-50 py-2">
                    <p className="text-xs text-neutral-500">Variations</p>
                    <p className="text-sm font-bold text-neutral-800">{stats.pendingVariations}</p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-error-50 py-2"><p className="text-xs text-neutral-500">Critical Risks</p><p className="text-sm font-bold text-neutral-800">{stats.criticalGovernanceItems}</p></div>
                  <div className="rounded-lg bg-warning-50 py-2"><p className="text-xs text-neutral-500">Open Quality</p><p className="text-sm font-bold text-neutral-800">{stats.openQualityItems}</p></div>
                  <div className="rounded-lg bg-primary-50 py-2"><p className="text-xs text-neutral-500">Open RFIs</p><p className="text-sm font-bold text-neutral-800">{stats.openRfis}</p></div>
                </div>
              </div>

              {/* Project Status Distribution */}
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm lg:col-span-2">
                <div className="flex items-center gap-2 mb-4">
                  <Layers size={16} className="text-primary-600" />
                  <h3 className="text-sm font-semibold text-neutral-700">Project Status Distribution</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(stats.byStatus).map(([status, count]) => {
                    const pct = fProjects.length > 0 ? (count / fProjects.length) * 100 : 0;
                    return (
                      <div key={status}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-neutral-600">{status}</span>
                          <span className="text-xs text-neutral-400">{count} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: statusColors[status] || 'var(--color-neutral-400)' }} />
                        </div>
                      </div>
                    );
                  })}
                  {fProjects.length === 0 && <p className="text-sm text-neutral-400 text-center py-4">No projects yet</p>}
                </div>
                {/* Category breakdown */}
                <div className="mt-4 pt-4 border-t border-neutral-100">
                  <p className="text-xs font-semibold text-neutral-500 mb-3">Budget by Category</p>
                  <div className="space-y-2">
                    {Object.entries(stats.byCategory).map(([cat, data]) => {
                      const pct = (data.budget / maxCategoryBudget) * 100;
                      return (
                        <div key={cat} className="flex items-center gap-3">
                          <span className="text-xs font-medium text-neutral-600 w-24 truncate">{cat}</span>
                          <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-primary-400 transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-neutral-400 w-16 text-right">{fmtMoney(data.budget)}</span>
                        </div>
                      );
                    })}
                    {Object.keys(stats.byCategory).length === 0 && <p className="text-xs text-neutral-400">No data</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* Cost Breakdown + Budget donut + Task status */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign size={16} className="text-success-600" />
                  <h3 className="text-sm font-semibold text-neutral-700">Cost — Planned vs Actual</h3>
                </div>
                <div className="space-y-3">
                  {Object.entries(costByCategory).map(([cat, data]) => {
                    const plannedPct = (data.planned / maxCostCategory) * 100;
                    const actualPct = (data.actual / maxCostCategory) * 100;
                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-neutral-600">{cat}</span>
                          <span className="text-xs text-neutral-400">{fmtMoney(data.actual)} / {fmtMoney(data.planned)}</span>
                        </div>
                        <div className="h-2.5 bg-neutral-100 rounded-full overflow-hidden relative">
                          <div className="h-full rounded-full bg-primary-300 transition-all duration-500" style={{ width: `${plannedPct}%` }} />
                          <div className="absolute top-0 h-full rounded-full bg-primary-600 transition-all duration-500" style={{ width: `${actualPct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(costByCategory).length === 0 && <p className="text-sm text-neutral-400 text-center py-4">No cost data yet</p>}
                </div>
                <div className="flex items-center gap-4 mt-3 text-[10px] text-neutral-400">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-primary-300" /> Planned</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-primary-600" /> Actual</span>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-neutral-700 mb-4">Budget Utilization</h3>
                <div className="flex items-center justify-center">
                  <div className="relative w-32 h-32">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-neutral-100)" strokeWidth="10" />
                      <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-primary-500)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(stats.budgetUtilization / 100) * 264} 264`} className="transition-all duration-700" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-neutral-900">{stats.budgetUtilization}%</span>
                      <span className="text-xs text-neutral-400">utilized</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <div><span className="text-neutral-400">Spent</span><p className="font-semibold text-neutral-700">{fmtMoney(stats.totalSpent)}</p></div>
                  <div className="text-right"><span className="text-neutral-400">Budget</span><p className="font-semibold text-neutral-700">{fmtMoney(stats.totalBudget)}</p></div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-neutral-700 mb-4">Task Status Breakdown</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Completed', icon: CheckCircle2, color: 'text-success-600 bg-success-50', count: stats.completedTasks },
                    { label: 'In Progress', icon: Clock, color: 'text-primary-600 bg-primary-50', count: stats.inProgressTasks },
                    { label: 'Not Started', icon: Clock, color: 'text-neutral-500 bg-neutral-100', count: stats.notStartedTasks },
                    { label: 'Delayed', icon: AlertTriangle, color: 'text-error-600 bg-error-50', count: stats.delayedTasks },
                  ].map((s) => {
                    const pct = fTasks.length > 0 ? (s.count / fTasks.length) * 100 : 0;
                    const Icon = s.icon;
                    return (
                      <div key={s.label} className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.color}`}><Icon size={16} /></div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-neutral-600">{s.label}</span>
                            <span className="text-xs text-neutral-400">{s.count}</span>
                          </div>
                          <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden mt-1">
                            <div className="h-full bg-current rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {fTasks.length === 0 && <p className="text-sm text-neutral-400 text-center py-4">No tasks yet</p>}
                </div>
              </div>
            </div>

            {/* Module summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <button onClick={() => onNavigate('schedule')} className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm hover:shadow-md transition-all text-left hover:border-primary-300 group">
                <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center group-hover:scale-110 transition-transform mb-2"><CalendarClock size={17} className="text-primary-600" /></div>
                <p className="text-lg font-bold text-neutral-900">{fSchedules.length}</p>
                <p className="text-xs text-neutral-400">Schedule</p>
              </button>
              <button onClick={() => onNavigate('contracts')} className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm hover:shadow-md transition-all text-left hover:border-primary-300 group">
                <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center group-hover:scale-110 transition-transform mb-2"><FileSignature size={17} className="text-primary-600" /></div>
                <p className="text-lg font-bold text-neutral-900">{fmtMoney(stats.modifiedContractValue)}</p>
                <p className="text-xs text-neutral-400">Modified Contracts</p>
              </button>
              <button onClick={() => onNavigate('boq')} className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm hover:shadow-md transition-all text-left hover:border-primary-300 group">
                <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center group-hover:scale-110 transition-transform mb-2"><ClipboardList size={17} className="text-primary-600" /></div>
                <p className="text-lg font-bold text-neutral-900">{fmtMoney(stats.totalContractValue)}</p>
                <p className="text-xs text-neutral-400">Original Contract Value</p>
              </button>
              <button onClick={() => onNavigate('cashflow')} className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm hover:shadow-md transition-all text-left hover:border-primary-300 group">
                <div className="w-9 h-9 rounded-lg bg-success-50 flex items-center justify-center group-hover:scale-110 transition-transform mb-2"><Banknote size={17} className="text-success-600" /></div>
                <p className={`text-lg font-bold ${stats.netCashFlow >= 0 ? 'text-success-600' : 'text-error-600'}`}>{fmtMoney(stats.netCashFlow)}</p>
                <p className="text-xs text-neutral-400">Cash Flow</p>
              </button>
              <button onClick={() => onNavigate('variations')} className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm hover:shadow-md transition-all text-left hover:border-primary-300 group">
                <div className="w-9 h-9 rounded-lg bg-accent-50 flex items-center justify-center group-hover:scale-110 transition-transform mb-2"><GitBranch size={17} className="text-accent-600" /></div>
                <p className="text-lg font-bold text-neutral-900">{stats.totalVariations}</p>
                <p className="text-xs text-neutral-400">Variations · {stats.approvedVariations} approved</p>
              </button>
              <button onClick={() => onNavigate('documents')} className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm hover:shadow-md transition-all text-left hover:border-primary-300 group">
                <div className="w-9 h-9 rounded-lg bg-secondary-50 flex items-center justify-center group-hover:scale-110 transition-transform mb-2"><FolderOpen size={17} className="text-secondary-600" /></div>
                <p className="text-lg font-bold text-neutral-900">{stats.currentDocs}</p>
                <p className="text-xs text-neutral-400">Documents</p>
              </button>
            </div>

            {/* Active projects table with search and filter */}
            {pid === 'all' && (
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between flex-wrap gap-3">
                  <h3 className="text-sm font-semibold text-neutral-700">Active Projects</h3>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                      <input type="text" placeholder="Search projects..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="text-sm pl-9 pr-3 py-1.5 border border-neutral-200 rounded-lg w-48 focus:outline-none focus:border-primary-400" />
                    </div>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-sm px-3 py-1.5 border border-neutral-200 rounded-lg bg-white focus:outline-none focus:border-primary-400">
                      <option value="all">All Statuses</option>
                      <option value="Planning">Planning</option>
                      <option value="In Progress">In Progress</option>
                      <option value="On Hold">On Hold</option>
                      <option value="Completed">Completed</option>
                    </select>
                    <button onClick={() => onNavigate('projects')} className="text-xs text-primary-600 hover:text-primary-700 font-medium">View all →</button>
                  </div>
                </div>
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-neutral-50 border-b border-neutral-200">
                        <th className="text-left text-xs font-semibold text-neutral-500 px-5 py-2.5">Project</th>
                        <th className="text-left text-xs font-semibold text-neutral-500 px-3 py-2.5">Client</th>
                        <th className="text-left text-xs font-semibold text-neutral-500 px-3 py-2.5">Status</th>
                        <th className="text-right text-xs font-semibold text-neutral-500 px-3 py-2.5">Budget</th>
                        <th className="text-left text-xs font-semibold text-neutral-500 px-5 py-2.5">Progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProjectStats.slice(0, 8).map((p) => (
                        <tr key={p.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors cursor-pointer" onClick={() => setSelectedProjectId(p.id)}>
                          <td className="px-5 py-3">
                            <p className="text-sm font-medium text-neutral-800">{p.name}</p>
                            <p className="text-xs text-neutral-400">{p.location}</p>
                          </td>
                          <td className="px-3 py-3 text-sm text-neutral-600">{p.client}</td>
                          <td className="px-3 py-3">
                            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${statusColor(p.status)}`}>{p.status}</span>
                          </td>
                          <td className="px-3 py-3 text-sm text-neutral-600 text-right">{fmtMoney(p.budget)}</td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden min-w-16">
                                <div className="h-full bg-primary-500 rounded-full transition-all duration-500" style={{ width: `${p.progress}%` }} />
                              </div>
                              <span className="text-xs text-neutral-500 w-8">{p.progress}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredProjectStats.length === 0 && (
                        <tr><td colSpan={5} className="text-center text-sm text-neutral-400 py-8">No projects match your filters.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============ FINANCIALS TAB ============ */}
        {activeTab === 'financials' && (
          <div className="space-y-5 animate-fade-in">
            {/* EVM Section */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
              <div className="px-5 py-4 border-b border-neutral-200 flex items-center gap-2">
                <Activity size={18} className="text-primary-600" />
                <h3 className="text-sm font-semibold text-neutral-700">Earned Value Management (EVM)</h3>
                <span className="text-xs text-neutral-400 ml-auto">Project performance & forecasting</span>
              </div>
              <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                {evmCards.map((card, i) => {
                  const Icon = card.icon;
                  const hasDrilldown = 'reconciliationKey' in card && Boolean(card.reconciliationKey);
                  return (
                    <div
                      key={i}
                      onClick={() => hasDrilldown && setDrilldownKpiKey((card as any).reconciliationKey)}
                      className={`rounded-lg border border-neutral-100 p-3 hover:border-neutral-200 hover:shadow-sm transition-all relative ${hasDrilldown ? 'cursor-pointer hover:border-primary-300 hover:bg-neutral-50/50' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-md flex items-center justify-center ${card.color}`}><Icon size={14} /></div>
                          <div>
                            <p className="text-xs font-bold text-neutral-700">{card.label}</p>
                            <p className="text-[10px] text-neutral-400 leading-tight">{card.desc}</p>
                          </div>
                        </div>
                        {hasDrilldown && (
                          <span title="Click to drill-down and audit source records" className="text-neutral-400 hover:text-primary-600 p-0.5">
                            <Layers size={12} />
                          </span>
                        )}
                      </div>
                      <p className="text-base font-bold text-neutral-900">{card.value}</p>
                      {'sub' in card && card.sub && (<p className={`text-[10px] mt-0.5 font-medium ${card.color.split(' ')[0]}`}>{card.sub}</p>)}
                    </div>
                  );
                })}
              </div>
              <div className="px-5 pb-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-neutral-600">Cost Performance (CPI)</span>
                      <span className={`text-sm font-bold ${evm.cost.CPI === null ? 'text-neutral-500' : evm.cost.CPI >= 1 ? 'text-success-600' : 'text-error-600'}`}>{evm.cost.CPI !== null && evm.cost.CPI > 0 ? evm.cost.CPI.toFixed(2) : 'Unavailable'}</span>
                    </div>
                    <div className="relative h-2.5 bg-neutral-200 rounded-full overflow-hidden">
                      <div className="absolute inset-0 flex"><div className="w-1/2 bg-error-300" /><div className="w-1/2 bg-success-300" /></div>
                      {evm.cost.CPI !== null && evm.cost.CPI > 0 && (<div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-primary-500 shadow-sm transition-all duration-500" style={{ left: `calc(${Math.min(evm.cost.CPI / 2, 1) * 100}% - 6px)` }} />)}
                    </div>
                    <div className="flex justify-between mt-1.5 text-[10px] text-neutral-400"><span>Over Budget</span><span>1.0</span><span>Under Budget</span></div>
                  </div>
                  <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-neutral-600">Schedule Performance (SPI)</span>
                      <span className={`text-sm font-bold ${evm.revenue.SPI >= 1 ? 'text-success-600' : 'text-error-600'}`}>{evm.revenue.SPI > 0 ? evm.revenue.SPI.toFixed(2) : '—'}</span>
                    </div>
                    <div className="relative h-2.5 bg-neutral-200 rounded-full overflow-hidden">
                      <div className="absolute inset-0 flex"><div className="w-1/2 bg-error-300" /><div className="w-1/2 bg-success-300" /></div>
                      {evm.revenue.SPI > 0 && (<div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-secondary-500 shadow-sm transition-all duration-500" style={{ left: `calc(${Math.min(evm.revenue.SPI / 2, 1) * 100}% - 6px)` }} />)}
                    </div>
                    <div className="flex justify-between mt-1.5 text-[10px] text-neutral-400"><span>Behind</span><span>1.0</span><span>Ahead</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* EVM Variance chart */}
            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-neutral-700 mb-4">EVM Variance Analysis</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-neutral-600">Cost Variance (CV = EV - AC)</span>
                    <span className={`text-sm font-bold ${evm.cost.CV === null ? 'text-neutral-500' : evm.cost.CV >= 0 ? 'text-success-600' : 'text-error-600'}`}>{fmtAvailableMoney(evm.cost.CV)}</span>
                  </div>
                  <div className="relative h-6 bg-neutral-100 rounded-lg overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-center"><div className="w-px h-full bg-neutral-300" /></div>
                    {evm.cost.CV !== null && evm.cost.CV !== 0 && (<div className={`absolute top-0 h-full ${evm.cost.CV >= 0 ? 'bg-success-400' : 'bg-error-400'} transition-all duration-700`} style={{ left: evm.cost.CV >= 0 ? '50%' : `${50 - Math.min(Math.abs(evm.cost.CV) / Math.max(Math.abs(evm.cost.EV ?? 0), 1) * 50, 50)}%`, width: `${Math.min(Math.abs(evm.cost.CV) / Math.max(Math.abs(evm.cost.EV ?? 0), 1) * 50, 50)}%` }} />)}
                  </div>
                  <div className="flex justify-between mt-1 text-[10px] text-neutral-400"><span>Over Budget</span><span>0</span><span>Under Budget</span></div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-neutral-600">Schedule Variance (SV = EV - PV)</span>
                    <span className={`text-sm font-bold ${evm.revenue.SV >= 0 ? 'text-success-600' : 'text-error-600'}`}>{fmtMoney(evm.revenue.SV)}</span>
                  </div>
                  <div className="relative h-6 bg-neutral-100 rounded-lg overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-center"><div className="w-px h-full bg-neutral-300" /></div>
                    {evm.revenue.SV !== 0 && (<div className={`absolute top-0 h-full ${evm.revenue.SV >= 0 ? 'bg-success-400' : 'bg-error-400'} transition-all duration-700`} style={{ left: evm.revenue.SV >= 0 ? '50%' : `${50 - Math.min(Math.abs(evm.revenue.SV) / Math.max(Math.abs(evm.revenue.EV), 1) * 50, 50)}%`, width: `${Math.min(Math.abs(evm.revenue.SV) / Math.max(Math.abs(evm.revenue.EV), 1) * 50, 50)}%` }} />)}
                  </div>
                  <div className="flex justify-between mt-1 text-[10px] text-neutral-400"><span>Behind</span><span>0</span><span>Ahead</span></div>
                </div>
              </div>
            </div>

            {/* Cost Variance Breakdown Card */}
            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 size={18} className="text-primary-600" />
                <h3 className="text-sm font-semibold text-neutral-700">Cost Variance Breakdown</h3>
                <span className="text-xs text-neutral-400 ml-auto">Control account variance components</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="rounded-lg border border-neutral-100 p-3 hover:border-neutral-200 hover:shadow-sm transition-all">
                  <p className="text-xs font-bold text-neutral-700">Usage Variance</p>
                  <p className="text-xs text-neutral-400 leading-tight mb-1">(Planned Qty - Actual Qty) × Rate</p>
                  <p className={`text-base font-bold ${controlAccountVariances.usageVariance >= 0 ? 'text-success-600' : 'text-error-600'}`}>{fmtMoney(controlAccountVariances.usageVariance)}</p>
                </div>
                <div className="rounded-lg border border-neutral-100 p-3 hover:border-neutral-200 hover:shadow-sm transition-all">
                  <p className="text-xs font-bold text-neutral-700">Rate Variance</p>
                  <p className="text-xs text-neutral-400 leading-tight mb-1">(Planned Rate - Actual Rate) × Qty</p>
                  <p className={`text-base font-bold ${controlAccountVariances.rateVariance >= 0 ? 'text-success-600' : 'text-error-600'}`}>{fmtMoney(controlAccountVariances.rateVariance)}</p>
                </div>
                <div className="rounded-lg border border-neutral-100 p-3 hover:border-neutral-200 hover:shadow-sm transition-all">
                  <p className="text-xs font-bold text-neutral-700">Mix Variance</p>
                  <p className="text-xs text-neutral-400 leading-tight mb-1">(Planned - Actual Ratio) × Qty × Rate</p>
                  <p className={`text-base font-bold ${controlAccountVariances.mixVariance >= 0 ? 'text-success-600' : 'text-error-600'}`}>{fmtMoney(controlAccountVariances.mixVariance)}</p>
                </div>
                <div className="rounded-lg border border-neutral-100 p-3 hover:border-neutral-200 hover:shadow-sm transition-all">
                  <p className="text-xs font-bold text-neutral-700">Productivity Variance</p>
                  <p className="text-xs text-neutral-400 leading-tight mb-1">(Actual - Planned Output) × Rate</p>
                  <p className={`text-base font-bold ${controlAccountVariances.productivityVariance >= 0 ? 'text-success-600' : 'text-error-600'}`}>{fmtMoney(controlAccountVariances.productivityVariance)}</p>
                </div>
                <div className="rounded-lg border border-neutral-100 p-3 hover:border-neutral-200 hover:shadow-sm transition-all">
                  <p className="text-xs font-bold text-neutral-700">Efficiency Variance</p>
                  <p className="text-xs text-neutral-400 leading-tight mb-1">Standard Qty Variance × Rate</p>
                  <p className={`text-base font-bold ${controlAccountVariances.efficiencyVariance >= 0 ? 'text-success-600' : 'text-error-600'}`}>{fmtMoney(controlAccountVariances.efficiencyVariance)}</p>
                </div>
              </div>
            </div>

            {/* Cash flow trend */}
            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Banknote size={16} className="text-success-600" />
                <h3 className="text-sm font-semibold text-neutral-700">Cash Flow Trend (Cumulative)</h3>
              </div>
              {cashFlowTrend.length > 0 ? (
                <div className="relative h-48">
                  <svg viewBox="0 0 400 180" className="w-full h-full" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="cfGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-success-400)" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="var(--color-success-400)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {(() => {
                      const values = cashFlowTrend.map((d) => d.cumulative);
                      const min = Math.min(...values, 0);
                      const max = Math.max(...values, 1);
                      const range = max - min || 1;
                      const points = cashFlowTrend.map((d, i) => {
                        const x = (i / Math.max(cashFlowTrend.length - 1, 1)) * 380 + 10;
                        const y = 170 - ((d.cumulative - min) / range) * 150;
                        return `${x},${y}`;
                      });
                      const areaPoints = `10,170 ${points.join(' ')} 390,170`;
                      return (
                        <>
                          <polygon points={areaPoints} fill="url(#cfGrad)" />
                          <polyline points={points.join(' ')} fill="none" stroke="var(--color-success-500)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                          {min < 0 && (<line x1="0" y1={170 - ((0 - min) / range) * 150} x2="400" y2={170 - ((0 - min) / range) * 150} stroke="var(--color-neutral-300)" strokeWidth="1" strokeDasharray="4,4" />)}
                        </>
                      );
                    })()}
                  </svg>
                  <div className="flex items-center justify-between mt-2 text-xs">
                    <span className="text-neutral-400">Start: {fmtMoney(cashFlowTrend[0]?.cumulative || 0)}</span>
                    <span className={`font-semibold ${cashFlowTrend[cashFlowTrend.length - 1]?.cumulative >= 0 ? 'text-success-600' : 'text-error-600'}`}>Current: {fmtMoney(cashFlowTrend[cashFlowTrend.length - 1]?.cumulative || 0)}</span>
                  </div>
                </div>
              ) : (<p className="text-sm text-neutral-400 text-center py-12">No cash flow data yet</p>)}
            </div>

            {/* Cash Flow Forecast Board (COM-05) */}
            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Banknote size={18} className="text-primary-600" />
                <div>
                  <h3 className="text-sm font-semibold text-neutral-700">Cash Flow Forecasting (COM-05)</h3>
                  <p className="text-xs text-neutral-400">Monthly time-phased liquidity projection, planned vs. actual cash positions</p>
                </div>
              </div>
              <CashFlowForecastBoard data={cashFlowData} currency={projectCurrency || '$'} />
            </div>

            {/* Invoices + Variations */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <button onClick={() => onNavigate('subinvoices')} className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm hover:shadow-md transition-all text-left hover:border-primary-300 group">
                <div className="flex items-center gap-2 mb-4"><div className="w-9 h-9 rounded-lg bg-accent-50 flex items-center justify-center group-hover:scale-110 transition-transform"><Receipt size={17} className="text-accent-600" /></div><h3 className="text-sm font-semibold text-neutral-700">Subcontractor Invoices</h3></div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between"><span className="text-xs text-neutral-500">Total Invoiced</span><span className="text-sm font-semibold text-neutral-800">{fmtMoney(stats.subInvoiceTotal)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-xs text-neutral-500">Paid</span><span className="text-sm font-semibold text-success-600">{fmtMoney(stats.subInvoicePaid)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-xs text-neutral-500">Outstanding</span><span className="text-sm font-semibold text-error-600">{fmtMoney(stats.subOutstanding)}</span></div>
                </div>
              </button>
              <button onClick={() => onNavigate('clientinvoices')} className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm hover:shadow-md transition-all text-left hover:border-primary-300 group">
                <div className="flex items-center gap-2 mb-4"><div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center group-hover:scale-110 transition-transform"><FileText size={17} className="text-primary-600" /></div><h3 className="text-sm font-semibold text-neutral-700">Client Invoices</h3></div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between"><span className="text-xs text-neutral-500">Total Invoiced</span><span className="text-sm font-semibold text-neutral-800">{fmtMoney(stats.clientInvoiceTotal)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-xs text-neutral-500">Received</span><span className="text-sm font-semibold text-success-600">{fmtMoney(stats.clientInvoicePaid)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-xs text-neutral-500">Outstanding</span><span className="text-sm font-semibold text-error-600">{fmtMoney(stats.clientOutstanding)}</span></div>
                </div>
              </button>
              <button onClick={() => onNavigate('variations')} className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm hover:shadow-md transition-all text-left hover:border-primary-300 group">
                <div className="flex items-center gap-2 mb-4"><div className="w-9 h-9 rounded-lg bg-accent-50 flex items-center justify-center group-hover:scale-110 transition-transform"><GitBranch size={17} className="text-accent-600" /></div><h3 className="text-sm font-semibold text-neutral-700">Variations</h3></div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between"><span className="text-xs text-neutral-500">All Change Orders</span><span className="text-sm font-semibold text-neutral-800">{fmtMoney(stats.variationCostImpact)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-xs text-neutral-500">Approved Impact</span><span className="text-sm font-semibold text-success-600">{fmtMoney(stats.approvedVariationCostImpact)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-xs text-neutral-500">Modified Contract Value</span><span className="text-sm font-semibold text-primary-700">{fmtMoney(stats.modifiedContractValue)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-xs text-neutral-500">Pending</span><span className="text-sm font-semibold text-warning-600">{stats.pendingVariations}</span></div>
                  <div className="flex items-center justify-between"><span className="text-xs text-neutral-500">Approved</span><span className="text-sm font-semibold text-success-600">{stats.approvedVariations}</span></div>
                </div>
              </button>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div><h3 className="text-sm font-semibold text-neutral-700">Governed scope &amp; material controls</h3><p className="text-xs text-neutral-400">Calculated from BOQ, approved changes, schedule, WIR and accepted receipts at the selected data date.</p></div>
                <button onClick={() => onNavigate('dataQuality')} className="text-xs font-semibold text-primary-600">Open evidence →</button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className={`rounded-lg border p-3 ${operationalScope.unmappedTasks.length ? 'border-error-200 bg-error-50' : 'border-success-200 bg-success-50'}`}><p className="text-xs text-neutral-500">Unmapped operational records</p><p className="mt-1 text-xl font-bold">{operationalScope.unmappedTasks.length}</p><p className="text-xs text-neutral-500">Exposure {fmtMoney(operationalScope.creepCostEstimate)}</p></div>
                <div className={`rounded-lg border p-3 ${wasteLedger.some((row) => row.isExcessiveWaste) ? 'border-warning-200 bg-warning-50' : 'border-neutral-200 bg-neutral-50'}`}><p className="text-xs text-neutral-500">BOQ items over waste allowance</p><p className="mt-1 text-xl font-bold">{wasteLedger.filter((row) => row.isExcessiveWaste).length}</p><p className="text-xs text-neutral-500">Only assessed where allowance exists</p></div>
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Earned Schedule SPI(t)</p><p className="mt-1 text-xl font-bold">{earnedSchedule ? earnedSchedule.timeSchedulePerformanceIndex.toFixed(2) : 'Unavailable'}</p><p className="text-xs text-neutral-500">{earnedSchedule ? `${earnedSchedule.timeScheduleVariance.toFixed(2)} reporting periods variance` : 'Needs time-phased PV and EV'}</p></div>
              </div>
            </div>
          </div>
        )}

        {/* ============ SCHEDULE TAB ============ */}
        {activeTab === 'schedule' && (
          <div className="space-y-5 animate-fade-in">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2"><CalendarClock size={16} className="text-primary-600" /><h3 className="text-sm font-semibold text-neutral-700">Activities</h3></div>
                <p className="text-3xl font-bold text-neutral-900">{fSchedules.length}</p>
                <p className="text-xs text-neutral-400 mt-1">{stats.completedSchedules} completed</p>
              </div>
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2"><AlertTriangle size={16} className="text-error-600" /><h3 className="text-sm font-semibold text-neutral-700">Critical Path</h3></div>
                <p className="text-3xl font-bold text-error-600">{stats.criticalPathCount}</p>
                <p className="text-xs text-neutral-400 mt-1">activities</p>
              </div>
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2"><Clock size={16} className="text-warning-600" /><h3 className="text-sm font-semibold text-neutral-700">Delayed</h3></div>
                <p className="text-3xl font-bold text-warning-600">{stats.delayedSchedules}</p>
                <p className="text-xs text-neutral-400 mt-1">activities</p>
              </div>
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2"><CheckCircle2 size={16} className="text-success-600" /><h3 className="text-sm font-semibold text-neutral-700">Completed</h3></div>
                <p className="text-3xl font-bold text-success-600">{stats.completedSchedules}</p>
                <p className="text-xs text-neutral-400 mt-1">activities</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-neutral-700 mb-4">Schedule Progress by Activity</h3>
              <div className="space-y-2.5">
                {scheduleProgress.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className={`text-xs font-medium w-32 truncate ${s.critical ? 'text-error-600' : 'text-neutral-600'}`}>{s.activity}</span>
                    {s.critical && <AlertTriangle size={12} className="text-error-500 flex-shrink-0" />}
                    <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${s.status === 'Delayed' ? 'bg-error-500' : s.status === 'Completed' ? 'bg-success-500' : 'bg-primary-500'}`} style={{ width: `${s.progress}%` }} />
                    </div>
                    <span className="text-xs text-neutral-400 w-8 text-right">{s.progress}%</span>
                  </div>
                ))}
                {scheduleProgress.length === 0 && <p className="text-sm text-neutral-400 text-center py-4">No schedule data yet</p>}
              </div>
              <button onClick={() => onNavigate('schedule')} className="w-full mt-4 text-xs text-primary-600 hover:text-primary-700 font-medium">View full schedule →</button>
            </div>

            {/* S-Curve Chart */}
            {sCurve.length > 0 && (
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={16} className="text-primary-600" />
                    <h3 className="text-sm font-semibold text-neutral-700">Project S-Curve — Revenue PV/EV, Delivery AC/EAC, Cash &amp; Resource Forecast</h3>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-primary-500" /><span className="text-neutral-600">PV</span></span>
                    <span className="flex items-center gap-1.5"><span className="h-0 w-3 border-t-2 border-dashed border-violet-500" /><span className="text-neutral-600">EV</span></span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-success-500" /><span className="text-neutral-600">AC</span></span>
                    <span className="flex items-center gap-1.5"><span className="h-0 w-3 border-t-2 border-dashed border-red-600" /><span className="text-neutral-600">EAC Forecast</span></span>
                    <span className="flex items-center gap-1.5"><span className="h-0 w-3 border-t-2 border-dashed border-orange-500" /><span className="text-neutral-600">Cash Forecast</span></span>
                    <span className="flex items-center gap-1.5"><span className="h-0 w-3 border-t-2 border-dashed border-teal-500" /><span className="text-neutral-600">Actual Cash</span></span>
                    <span className="flex items-center gap-1.5"><span className="h-0 w-3 border-t-2 border-dashed border-amber-700" /><span className="text-neutral-600">Planned Resource Cost</span></span>
                  </div>
                </div>
                <SCurveChart data={sCurve} />
              </div>
            )}

            <div className="mt-6 bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
              <ThreeWayGanttOverlay activities={ganttActivities} dataDate={reportDate} />
            </div>

            <div className="mt-6 bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
              <XerReconciliationBoard
                projectId={selectedProjectId || ''}
                contractId={contracts.find((contract) => contract.project_id === selectedProjectId && !contract.parent_main_contract_id)?.id || ''}
                projects={projects.map((project) => ({ id: project.id, name: project.name, code: project.project_code }))}
                contracts={contracts.filter((contract) => !contract.parent_main_contract_id).map((contract) => ({ id: contract.id, project_id: contract.project_id, title: contract.title, code: contract.contract_number }))}
                localActivities={fSchedules as Record<string, any>[]}
                dataDate={reportDate}
                onCommitSuccess={async () => { await onDataReload?.(); }}
              />
            </div>
          </div>
        )}

        {/* ============ SAFETY TAB ============ */}
        {activeTab === 'safety' && (
          <div className="space-y-5 animate-fade-in">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2"><ShieldAlert size={16} className="text-error-600" /><h3 className="text-sm font-semibold text-neutral-700">Open</h3></div>
                <p className={`text-3xl font-bold ${stats.openSafety > 0 ? 'text-error-600' : 'text-success-600'}`}>{stats.openSafety}</p>
              </div>
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2"><AlertTriangle size={16} className="text-accent-600" /><h3 className="text-sm font-semibold text-neutral-700">High/Critical</h3></div>
                <p className={`text-3xl font-bold ${stats.highSeverity > 0 ? 'text-accent-600' : 'text-success-600'}`}>{stats.highSeverity}</p>
              </div>
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2"><Activity size={16} className="text-warning-600" /><h3 className="text-sm font-semibold text-neutral-700">Investigating</h3></div>
                <p className="text-3xl font-bold text-warning-600">{stats.investigatingSafety}</p>
              </div>
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2"><CheckCircle2 size={16} className="text-success-600" /><h3 className="text-sm font-semibold text-neutral-700">Closed</h3></div>
                <p className="text-3xl font-bold text-success-600">{stats.closedSafety}</p>
              </div>
            </div>
            {Object.keys(stats.safetyByType).length > 0 && (
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-neutral-700 mb-4">Safety Records by Type</h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {Object.entries(stats.safetyByType).map(([type, count]) => (
                    <div key={type} className="rounded-lg bg-neutral-50 border border-neutral-100 p-3 text-center">
                      <p className="text-2xl font-bold text-neutral-800">{count}</p>
                      <p className="text-xs text-neutral-400 mt-1">{type}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-neutral-700 mb-4">Recent Safety Records</h3>
              <div className="space-y-2">
                {fSafety.slice(0, 8).map((s) => (
                  <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border border-neutral-100 hover:border-neutral-200 transition-colors">
                    <div className={`w-2 h-10 rounded-full ${s.severity === 'Critical' ? 'bg-error-500' : s.severity === 'High' ? 'bg-accent-500' : s.severity === 'Medium' ? 'bg-warning-500' : 'bg-success-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-700 truncate">{s.description || s.type}</p>
                      <p className="text-xs text-neutral-400">{s.type} · {s.location || 'No location'} · {s.date || 'No date'}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${s.status === 'Open' ? 'bg-error-50 text-error-600 border-error-200' : s.status === 'Investigating' ? 'bg-warning-50 text-warning-600 border-warning-200' : 'bg-success-50 text-success-600 border-success-200'}`}>{s.status}</span>
                  </div>
                ))}
                {fSafety.length === 0 && <p className="text-sm text-neutral-400 text-center py-4">No safety records yet</p>}
              </div>
              <button onClick={() => onNavigate('safety')} className="w-full mt-4 text-xs text-primary-600 hover:text-primary-700 font-medium">View all safety records →</button>
            </div>
          </div>
        )}

        {/* ============ PROCUREMENT TAB ============ */}
        {activeTab === 'procurement' && (
          <div className="space-y-5 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2"><PackageCheck size={16} className="text-success-600" /><h3 className="text-sm font-semibold text-neutral-700">Delivered</h3></div>
                <p className="text-3xl font-bold text-success-600">{stats.deliveredProcurement}</p>
                <p className="text-xs text-neutral-400 mt-1">of {fProcurement.length} items</p>
              </div>
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2"><Truck size={16} className="text-warning-600" /><h3 className="text-sm font-semibold text-neutral-700">Pending</h3></div>
                <p className="text-3xl font-bold text-warning-600">{stats.pendingProcurement}</p>
                <p className="text-xs text-neutral-400 mt-1">items in transit</p>
              </div>
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2"><DollarSign size={16} className="text-primary-600" /><h3 className="text-sm font-semibold text-neutral-700">Total Value</h3></div>
                <p className="text-3xl font-bold text-neutral-900">{fmtMoney(stats.totalProcurementValue)}</p>
                <p className="text-xs text-neutral-400 mt-1">all procurement</p>
              </div>
            </div>

            {/* Procurement status pipeline */}
            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-neutral-700 mb-4">Procurement Pipeline</h3>
              <div className="flex items-center gap-2">
                {procurementStatuses.map((ps, i) => (
                  <div key={ps.label} className="flex items-center flex-1">
                    <div className="flex-1 text-center">
                      <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: ps.color }}>
                        <span className="text-white font-bold text-lg">{ps.count}</span>
                      </div>
                      <p className="text-xs font-medium text-neutral-600">{ps.label}</p>
                    </div>
                    {i < procurementStatuses.length - 1 && (
                      <div className="h-px flex-1 bg-neutral-200 mx-1" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Recent procurement items */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-neutral-700">Recent Procurement</h3>
                <button onClick={() => onNavigate('procurement')} className="text-xs text-primary-600 hover:text-primary-700 font-medium">View all →</button>
              </div>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-200">
                      <th className="text-left text-xs font-semibold text-neutral-500 px-5 py-2.5">Item</th>
                      <th className="text-left text-xs font-semibold text-neutral-500 px-3 py-2.5">Supplier</th>
                      <th className="text-right text-xs font-semibold text-neutral-500 px-3 py-2.5">Qty</th>
                      <th className="text-right text-xs font-semibold text-neutral-500 px-3 py-2.5">Total</th>
                      <th className="text-left text-xs font-semibold text-neutral-500 px-5 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fProcurement.slice(0, 8).map((p) => (
                      <tr key={p.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                        <td className="px-5 py-3 text-sm font-medium text-neutral-800">{p.item || '—'}</td>
                        <td className="px-3 py-3 text-sm text-neutral-600">{p.supplier || '—'}</td>
                        <td className="px-3 py-3 text-sm text-neutral-600 text-right">{p.quantity} {p.unit}</td>
                        <td className="px-3 py-3 text-sm text-neutral-600 text-right">{fmtMoney(p.total_cost)}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${p.status === 'Delivered' ? 'bg-success-50 text-success-600 border-success-200' : p.status === 'Ordered' ? 'bg-primary-50 text-primary-600 border-primary-200' : p.status === 'Partially Delivered' ? 'bg-warning-50 text-warning-600 border-warning-200' : 'bg-neutral-50 text-neutral-600 border-neutral-200'}`}>{p.status}</span>
                        </td>
                      </tr>
                    ))}
                    {fProcurement.length === 0 && (
                      <tr><td colSpan={5} className="text-center text-sm text-neutral-400 py-8">No procurement items yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============ DOCUMENTS TAB ============ */}
        {activeTab === 'documents' && (
          <div className="space-y-5 animate-fade-in">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2"><FileCheck2 size={16} className="text-success-600" /><h3 className="text-sm font-semibold text-neutral-700">Current</h3></div>
                <p className="text-3xl font-bold text-success-600">{stats.currentDocs}</p>
              </div>
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2"><Clock size={16} className="text-warning-600" /><h3 className="text-sm font-semibold text-neutral-700">Under Review</h3></div>
                <p className="text-3xl font-bold text-warning-600">{stats.underReviewDocs}</p>
              </div>
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-primary-600" /><h3 className="text-sm font-semibold text-neutral-700">Approved</h3></div>
                <p className="text-3xl font-bold text-primary-600">{stats.approvedDocs}</p>
              </div>
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2"><FolderOpen size={16} className="text-neutral-600" /><h3 className="text-sm font-semibold text-neutral-700">Total</h3></div>
                <p className="text-3xl font-bold text-neutral-900">{fDocuments.length}</p>
              </div>
            </div>

            {Object.keys(stats.docsByType).length > 0 && (
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-neutral-700 mb-4">Documents by Type</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                  {Object.entries(stats.docsByType).map(([type, count]) => (
                    <div key={type} className="rounded-lg bg-neutral-50 border border-neutral-100 p-3 text-center">
                      <p className="text-2xl font-bold text-neutral-800">{count}</p>
                      <p className="text-xs text-neutral-400 mt-1">{type}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-neutral-700">Recent Documents</h3>
                <button onClick={() => onNavigate('documents')} className="text-xs text-primary-600 hover:text-primary-700 font-medium">View all →</button>
              </div>
              <div className="divide-y divide-neutral-100">
                {fDocuments.slice(0, 8).map((d) => (
                  <div key={d.id} className="flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 transition-colors">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${d.status === 'Current' ? 'bg-success-50' : d.status === 'Under Review' ? 'bg-warning-50' : d.status === 'Approved' ? 'bg-primary-50' : 'bg-neutral-100'}`}>
                      <FileText size={16} className={d.status === 'Current' ? 'text-success-600' : d.status === 'Under Review' ? 'text-warning-600' : d.status === 'Approved' ? 'text-primary-600' : 'text-neutral-500'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-800 truncate">{d.document_name || 'Unnamed'}</p>
                      <p className="text-xs text-neutral-400">{d.document_type} · v{d.version} · {d.responsible || 'Unassigned'}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${d.status === 'Current' ? 'bg-success-50 text-success-600 border-success-200' : d.status === 'Under Review' ? 'bg-warning-50 text-warning-600 border-warning-200' : d.status === 'Approved' ? 'bg-primary-50 text-primary-600 border-primary-200' : 'bg-neutral-50 text-neutral-600 border-neutral-200'}`}>{d.status}</span>
                  </div>
                ))}
                {fDocuments.length === 0 && <p className="text-sm text-neutral-400 text-center py-8">No documents yet</p>}
              </div>
            </div>
          </div>
        )}

        {/* ============ PMO REPORT PACK TAB ============ */}
        {activeTab === 'report' && (
          <div className="space-y-5 animate-fade-in">
            <div className="rounded-xl border border-primary-200 bg-gradient-to-r from-primary-700 to-primary-600 p-6 text-white shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary-100">PMO Periodic Report</p>
              <h3 className="mt-2 text-2xl font-bold">{selectedProject?.name || 'Portfolio Executive Report'}</h3>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-primary-100">
                <span>Reporting date: {reportDate}</span>
                <span>{pid === 'all' ? `${fProjects.length} projects in scope` : 'Project control summary'}</span>
                <span>Health: <strong className="text-white">{healthLabel} ({healthScore}/100)</strong></span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Modified Contract Value', value: fmtMoney(stats.modifiedContractValue), sub: `${stats.approvedVariations} approved variation(s)` },
                { label: 'Revenue PV to Date', value: fmtMoney(evm.revenue.PV), sub: `Revenue BAC ${fmtMoney(evm.revenue.BAC)}` },
                { label: 'Revenue Earned Value', value: fmtMoney(evm.revenue.EV), sub: `Revenue SPI ${evm.revenue.SPI > 0 ? evm.revenue.SPI.toFixed(2) : '—'}` },
                { label: 'Delivery Actual Cost', value: fmtMoney(evm.cost.AC), sub: `Cost CPI ${evm.cost.CPI !== null ? evm.cost.CPI.toFixed(2) : 'Unavailable'}` },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{item.label}</p>
                  <p className="mt-2 text-2xl font-bold text-neutral-900">{item.value}</p>
                  <p className="mt-1 text-xs text-neutral-500">{item.sub}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
                <div className="border-b border-neutral-200 px-5 py-4"><h4 className="text-sm font-semibold text-neutral-800">Commercial & Forecast</h4></div>
                <div className="space-y-3 p-5 text-sm">
                  {[
                    ['Original contract value', fmtMoney(stats.totalContractValue)],
                    ['Approved variation impact', fmtMoney(stats.approvedVariationCostImpact)],
                    ['Delivery Cost EAC', fmtAvailableMoney(evm.cost.EAC)],
                    ['Delivery Cost VAC', fmtAvailableMoney(evm.cost.VAC)],
                    ['Net cash flow', fmtMoney(stats.netCashFlow)],
                    ['Outstanding client invoices', fmtMoney(stats.clientOutstanding)],
                    ['Outstanding subcontractor invoices', fmtMoney(stats.subOutstanding)],
                  ].map(([label, value]) => <div key={label} className="flex justify-between gap-4"><span className="text-neutral-500">{label}</span><strong className="text-neutral-800">{value}</strong></div>)}
                </div>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
                <div className="border-b border-neutral-200 px-5 py-4"><h4 className="text-sm font-semibold text-neutral-800">Delivery & Governance</h4></div>
                <div className="grid grid-cols-2 gap-px bg-neutral-100">
                  {[
                    ['Delayed activities', stats.delayedSchedules], ['Critical-path activities', stats.criticalPathCount],
                    ['Open RFIs', stats.openRfis], ['Pending submittals', stats.pendingSubmittals],
                    ['Open quality items', stats.openQualityItems], ['Open governance items', stats.openGovernanceItems],
                    ['Open reporting periods', stats.openReportingPeriods], ['Current documents', stats.currentDocs],
                  ].map(([label, value]) => <div key={String(label)} className="bg-white p-4"><p className="text-2xl font-bold text-neutral-900">{value}</p><p className="mt-1 text-xs text-neutral-500">{label}</p></div>)}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
                <h4 className="text-sm font-semibold text-neutral-800">Management Actions</h4>
                <span className="text-xs text-neutral-500">{actionItems.length} action(s) identified</span>
              </div>
              {actionItems.length ? <div className="divide-y divide-neutral-100">{actionItems.map((item, index) => {
                const Icon = item.icon;
                return <button key={`${item.text}-${index}`} onClick={() => onNavigate(item.view)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-neutral-50"><Icon size={16} className={severityIconColors[item.severity]} /><span className="flex-1 text-sm text-neutral-700">{item.text}</span><span className="text-xs font-medium text-primary-600">Open →</span></button>;
              })}</div> : <p className="p-5 text-sm text-success-600">No management action is currently overdue or critical.</p>}
            </div>
            <p className="text-center text-xs text-neutral-400">Use Print above to print this report or save it as PDF.</p>
          </div>
        )}

        {/* ============ ACTION ITEMS TAB ============ */}
        {activeTab === 'action' && (
          <div className="space-y-5 animate-fade-in">
            <div className="grid grid-cols-3 gap-4">
              <div className={`rounded-xl border p-4 ${severityStyles.high}`}>
                <div className="flex items-center gap-2 mb-1"><AlertCircle size={16} className={severityIconColors.high} /><span className="text-xs font-semibold text-neutral-700">High Priority</span></div>
                <p className="text-2xl font-bold text-neutral-900">{actionItems.filter((a) => a.severity === 'high').length}</p>
              </div>
              <div className={`rounded-xl border p-4 ${severityStyles.medium}`}>
                <div className="flex items-center gap-2 mb-1"><AlertTriangle size={16} className={severityIconColors.medium} /><span className="text-xs font-semibold text-neutral-700">Medium Priority</span></div>
                <p className="text-2xl font-bold text-neutral-900">{actionItems.filter((a) => a.severity === 'medium').length}</p>
              </div>
              <div className={`rounded-xl border p-4 ${severityStyles.low}`}>
                <div className="flex items-center gap-2 mb-1"><Lightbulb size={16} className={severityIconColors.low} /><span className="text-xs font-semibold text-neutral-700">Low Priority</span></div>
                <p className="text-2xl font-bold text-neutral-900">{actionItems.filter((a) => a.severity === 'low').length}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
              <div className="px-5 py-4 border-b border-neutral-200 flex items-center gap-2">
                <Lightbulb size={18} className="text-warning-600" />
                <h3 className="text-sm font-semibold text-neutral-700">Decision Support — Action Required</h3>
                <span className="text-xs text-neutral-400 ml-auto">{actionItems.length} item{actionItems.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="p-4">
                {actionItems.length > 0 ? (
                  <div className="space-y-2">
                    {actionItems.map((item, i) => {
                      const Icon = item.icon;
                      return (
                        <button key={i} onClick={() => onNavigate(item.view)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border ${severityStyles[item.severity]} hover:shadow-sm transition-all text-left group`}>
                          <Icon size={18} className={`${severityIconColors[item.severity]} flex-shrink-0`} />
                          <span className="text-sm text-neutral-700 flex-1">{item.text}</span>
                          <span className={`text-xs font-medium ${severityIconColors[item.severity]} opacity-0 group-hover:opacity-100 transition-opacity`}>View →</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 py-6 text-sm text-success-600">
                    <CheckCircle2 size={18} /><span>All clear — no critical actions required at this time.</span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-lg font-semibold text-neutral-900 mb-3">Variance Actions Register</h3>
              <VarianceActionTable
                actions={varianceActionItems}
                onUpdateStatus={handleUpdateActionStatus}
              />
            </div>
          </div>
        )}

        {/* Action Creation Modal */}
        {selectedWarningForAction && (
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 animate-fade-in p-4"
            onClick={() => {
              setSelectedWarningForAction(null);
              setActionAssignedTo('');
              setActionDueDate('');
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="action-modal-title"
          >
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
                <div>
                  <h3 id="action-modal-title" className="text-base font-semibold text-neutral-900">Create Action Item</h3>
                  <p className="text-xs text-neutral-500">Assign and track a corrective action from early warning</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedWarningForAction(null);
                    setActionAssignedTo('');
                    setActionDueDate('');
                  }}
                  className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
                  aria-label="Close dialog"
                >
                  <X size={18} />
                </button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!selectedWarningForAction) return;
                  if (!selectedProjectId || selectedProjectId === 'all') {
                    window.alert('Select one project before creating a governed action.');
                    return;
                  }
                  try {
                    await handleCreateAction(selectedWarningForAction, actionAssignedTo, actionDueDate, selectedProjectId);
                    setActionAssignedTo('');
                    setActionDueDate('');
                    setSelectedWarningForAction(null);
                  } catch (error: any) {
                    window.alert(error?.message || 'Failed to create the governed action.');
                  }
                }}
                className="p-5 space-y-4"
              >
                <div className={`p-3 rounded-lg border text-sm ${
                  selectedWarningForAction.severity === 'critical'
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-yellow-50 border-yellow-200 text-yellow-800'
                }`}>
                  <div className="flex items-center justify-between text-xs font-semibold mb-1">
                    <span className="uppercase tracking-wider">Category: {selectedWarningForAction.category}</span>
                    <span className="capitalize px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/80 border border-current">
                      {selectedWarningForAction.severity}
                    </span>
                  </div>
                  <p className="font-medium text-xs mt-1">{selectedWarningForAction.message}</p>
                </div>

                <div>
                  <label htmlFor="action-assigned-to" className="block text-xs font-medium text-neutral-700 mb-1">
                    Assigned To
                  </label>
                  <input
                    id="action-assigned-to"
                    type="text"
                    value={actionAssignedTo}
                    onChange={(e) => setActionAssignedTo(e.target.value)}
                    placeholder="e.g. Project Manager, Lead Engineer"
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="action-due-date" className="block text-xs font-medium text-neutral-700 mb-1">
                    Due Date
                  </label>
                  <input
                    id="action-due-date"
                    type="date"
                    value={actionDueDate}
                    onChange={(e) => setActionDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedWarningForAction(null);
                      setActionAssignedTo('');
                      setActionDueDate('');
                    }}
                    className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
                  >
                    Save Action
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* KPI Reconciliation Drill-down Modal */}
        {drilldownKpiKey && (
          <KpiDrilldownModal
            isOpen={Boolean(drilldownKpiKey)}
            onClose={() => setDrilldownKpiKey(null)}
            kpiKey={drilldownKpiKey}
            onSelectKpiKey={(key) => setDrilldownKpiKey(key)}
            inputData={reconciliationInput}
            currency={(selectedProject as any)?.currency || 'USD'}
          />
        )}
      </div>
    </div>
  );
}

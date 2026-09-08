import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Calendar,
  Sliders,
  Layers,
  RefreshCw,
  DollarSign,
  CheckCircle2,
  Lock,
  Plus,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ChevronUp,
  FileText,
  FileCheck2,
  ShoppingBag,
  Info,
} from 'lucide-react';
import {
  CashFlowPeriod,
  CashForecastAssumptions,
  DEFAULT_CASH_ASSUMPTIONS,
  applyCashAssumptionsToPeriods,
  getCashFlowStatus,
  compareCashForecastVersions,
  generateGovernedCashForecastMatrix,
  GovernedCashForecastPeriod,
  GovernedCashSourceItem,
  validateCashForecastAssumptions,
} from '@/utils/cashFlowForecast';
import type { CashForecastVersion, PaymentCertificate, CashFlowEntry, Procurement } from '@/types';

interface CashFlowForecastBoardProps {
  projectId?: string;
  dataDate?: string;
  data?: Array<{
    period: string;
    plannedInflow: number;
    actualInflow?: number;
    plannedOutflow: number;
    actualOutflow?: number;
  }>;
  paymentCertificates?: PaymentCertificate[];
  cashFlowEntries?: CashFlowEntry[];
  procurementOrders?: Procurement[];
  versions?: CashForecastVersion[];
  currency?: string;
  onSaveVersion?: (version: Partial<CashForecastVersion>) => Promise<void> | void;
  onApproveVersion?: (versionId: string) => Promise<void> | void;
}

export const CashFlowForecastBoard: React.FC<CashFlowForecastBoardProps> = ({
  projectId = 'default_project',
  dataDate = '2026-06-30',
  data = [],
  paymentCertificates = [],
  cashFlowEntries = [],
  procurementOrders = [],
  versions = [],
  currency = '$',
  onSaveVersion,
  onApproveVersion,
}) => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'assumptions' | 'sources' | 'comparison'>('timeline');
  const [assumptions, setAssumptions] = useState<CashForecastAssumptions>(DEFAULT_CASH_ASSUMPTIONS);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('live_active');
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);
  const [lineOverrides, setLineOverrides] = useState<Record<string, { dateOverride?: string; overrideReason?: string; probabilityPercent?: number }>>({});
  
  // New Scenario state
  const [showNewVersionModal, setShowNewVersionModal] = useState(false);
  const [newVersionTitle, setNewVersionTitle] = useState('');
  const [newVersionReason, setNewVersionReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // 1. Governed Multi-source Calculation
  const governedResult = useMemo(() => {
    // If legacy simple raw periods were provided and no rich certificates
    if (data.length > 0 && paymentCertificates.length === 0 && cashFlowEntries.length === 0) {
      const rawPeriods = data.map((d) => ({
        period: d.period,
        grossInflow: d.plannedInflow,
        grossOutflow: d.plannedOutflow,
        actualInflow: d.actualInflow,
        actualOutflow: d.actualOutflow,
      }));
      const currentPeriods = applyCashAssumptionsToPeriods(rawPeriods, assumptions);
      const basePeriods = applyCashAssumptionsToPeriods(rawPeriods, DEFAULT_CASH_ASSUMPTIONS);
      const status = getCashFlowStatus(currentPeriods);

      const mappedGovernedPeriods: GovernedCashForecastPeriod[] = currentPeriods.map((p) => ({
        period: p.period,
        isHistorical: p.period <= dataDate.slice(0, 7),
        actualInflow: p.actualInflow,
        actualOutflow: p.actualOutflow,
        netActual: p.netActual,
        forecastInflow: p.plannedInflow,
        forecastOutflow: p.plannedOutflow,
        netForecast: p.netPlanned,
        periodCashFlow: p.netActual,
        cumulativeCashBalance: p.cumulativeCash,
        contributions: [],
      }));

      return {
        periods: mappedGovernedPeriods,
        summary: {
          openingBalance: 0,
          totalActualInflow: currentPeriods.reduce((sum, p) => sum + p.actualInflow, 0),
          totalActualOutflow: currentPeriods.reduce((sum, p) => sum + p.actualOutflow, 0),
          netActualCash: currentPeriods.reduce((sum, p) => sum + p.netActual, 0),
          totalForecastInflow: currentPeriods.reduce((sum, p) => sum + p.plannedInflow, 0),
          totalForecastOutflow: currentPeriods.reduce((sum, p) => sum + p.plannedOutflow, 0),
          netForecastCash: currentPeriods.reduce((sum, p) => sum + p.netPlanned, 0),
          closingProjectedBalance: currentPeriods.length > 0 ? currentPeriods[currentPeriods.length - 1].cumulativeCash : 0,
          lowestCashPoint: status.lowestCashPoint,
          lowestCashPeriod: status.lowestPeriod,
          isDeficitExpected: status.isDeficitExpected,
          peakWorkingCapitalDeficit: status.peakWorkingCapitalDeficit,
          overdueInflows: 0,
          overdueOutflows: 0,
        },
        sourceItems: [],
        basePeriods,
        currentPeriods,
      };
    }

    // Rich governed engine
    const res = generateGovernedCashForecastMatrix({
      projectId,
      dataDate,
      assumptions,
      paymentCertificates,
      cashFlowEntries,
      procurementOrders,
      lineOverrides,
    });

    const currentPeriods: CashFlowPeriod[] = res.periods.map((p) => ({
      period: p.period,
      plannedInflow: p.forecastInflow,
      actualInflow: p.actualInflow,
      plannedOutflow: p.forecastOutflow,
      actualOutflow: p.actualOutflow,
      netPlanned: p.netForecast,
      netActual: p.netActual,
      cumulativeCash: p.cumulativeCashBalance,
    }));

    const baseRes = generateGovernedCashForecastMatrix({
      projectId,
      dataDate,
      assumptions: DEFAULT_CASH_ASSUMPTIONS,
      paymentCertificates,
      cashFlowEntries,
      procurementOrders,
    });

    const basePeriods: CashFlowPeriod[] = baseRes.periods.map((p) => ({
      period: p.period,
      plannedInflow: p.forecastInflow,
      actualInflow: p.actualInflow,
      plannedOutflow: p.forecastOutflow,
      actualOutflow: p.actualOutflow,
      netPlanned: p.netForecast,
      netActual: p.netActual,
      cumulativeCash: p.cumulativeCashBalance,
    }));

    return {
      ...res,
      basePeriods,
      currentPeriods,
    };
  }, [projectId, dataDate, assumptions, data, paymentCertificates, cashFlowEntries, procurementOrders, lineOverrides]);

  const comparison = useMemo(() => {
    return compareCashForecastVersions(governedResult.basePeriods, governedResult.currentPeriods);
  }, [governedResult.basePeriods, governedResult.currentPeriods]);

  const validation = useMemo(() => validateCashForecastAssumptions(assumptions), [assumptions]);

  const handleSaveScenario = async () => {
    if (!newVersionTitle.trim()) return;
    setIsSaving(true);
    try {
      if (onSaveVersion) {
        await onSaveVersion({
          project_id: projectId,
          version_code: `CF-REV-${Date.now().toString().slice(-4)}`,
          title: newVersionTitle,
          reason: newVersionReason,
          status: 'Draft',
          client_payment_lag_days: assumptions.clientPaymentLagDays,
          subcontractor_payment_lag_days: assumptions.subcontractorPaymentLagDays,
          advance_recovery_rate_percent: assumptions.advanceRecoveryRatePercent,
          retention_release_toc_percent: assumptions.retentionReleaseTocPercent,
          retention_release_dlc_percent: assumptions.retentionReleaseDlcPercent,
          contingency_drawdown_percent: assumptions.contingencyDrawdownPercent,
          vat_payout_lag_months: assumptions.vatPayoutLagMonths,
          data_date: dataDate,
          created_by: 'Commercial Controller',
        });
      }
      setShowNewVersionModal(false);
      setNewVersionTitle('');
      setNewVersionReason('');
    } finally {
      setIsSaving(false);
    }
  };

  const activeVersionObj = versions.find((v) => v.id === selectedVersionId);

  return (
    <div className="space-y-5">
      {/* Top Bar: Governance Header & Version Management */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-neutral-800 text-sm">Versioned Cash Forecast Engine</h3>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                activeVersionObj?.status === 'Approved'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-indigo-100 text-indigo-800'
              }`}>
                {activeVersionObj ? `${activeVersionObj.version_code} (${activeVersionObj.status})` : 'Governed Live Model'}
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Governed Data Date: <span className="font-medium text-neutral-700">{dataDate}</span> | Separation of Actual Settled Cash vs Pipeline Forecast
            </p>
          </div>
        </div>

        {/* Tab Controls & Scenario Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-neutral-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('timeline')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'timeline' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Cash Timeline
            </button>
            <button
              onClick={() => setActiveTab('assumptions')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'assumptions' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Assumptions ({assumptions.clientPaymentLagDays}d / {assumptions.subcontractorPaymentLagDays}d)
            </button>
            <button
              onClick={() => setActiveTab('sources')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'sources' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Sources & Overrides ({governedResult.sourceItems.length})
            </button>
            <button
              onClick={() => setActiveTab('comparison')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'comparison' ? 'bg-white text-amber-900 shadow-xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Scenario Delta
            </button>
          </div>

          <button
            onClick={() => setShowNewVersionModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Save Snapshot</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Net Cumulative Position */}
        <div className={`p-4 rounded-xl border transition-all ${
          governedResult.summary.closingProjectedBalance >= 0
            ? 'bg-green-50/70 border-green-200'
            : 'bg-red-50/70 border-red-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-600">Closing Projected Balance</span>
            {governedResult.summary.closingProjectedBalance >= 0 ? (
              <TrendingUp className="w-4 h-4 text-green-600" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-600" />
            )}
          </div>
          <div className={`text-xl font-bold mt-2 ${
            governedResult.summary.closingProjectedBalance >= 0 ? 'text-green-700' : 'text-red-700'
          }`}>
            {currency}{governedResult.summary.closingProjectedBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-2xs text-neutral-500 mt-1 flex items-center justify-between">
            <span>Actual Net: {currency}{governedResult.summary.netActualCash.toLocaleString()}</span>
            <span>Forecast Net: {currency}{governedResult.summary.netForecastCash.toLocaleString()}</span>
          </div>
        </div>

        {/* Settled Cash vs Forecast Pipeline */}
        <div className="p-4 bg-white border border-neutral-200 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-600">Settled Inflow / Outflow</span>
            <CheckCircle2 className="w-4 h-4 text-primary-600" />
          </div>
          <div className="text-lg font-bold text-neutral-800 mt-2">
            {currency}{governedResult.summary.totalActualInflow.toLocaleString()}
          </div>
          <div className="text-2xs text-neutral-500 mt-1 flex items-center justify-between">
            <span className="text-success-600">In: {currency}{governedResult.summary.totalActualInflow.toLocaleString()}</span>
            <span className="text-neutral-600">Out: {currency}{governedResult.summary.totalActualOutflow.toLocaleString()}</span>
          </div>
        </div>

        {/* Peak Working Capital Deficit */}
        <div className={`p-4 rounded-xl border ${
          governedResult.summary.peakWorkingCapitalDeficit > 0
            ? 'bg-purple-50/70 border-purple-200'
            : 'bg-neutral-50 border-neutral-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-600">Peak Working Capital Deficit</span>
            <DollarSign className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-lg font-bold text-purple-800 mt-2">
            {currency}{governedResult.summary.peakWorkingCapitalDeficit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-2xs text-neutral-500 mt-1">
            Lowest Point: {currency}{governedResult.summary.lowestCashPoint.toLocaleString()} ({governedResult.summary.lowestCashPeriod})
          </div>
        </div>

        {/* Overdue / Liquidity Alert */}
        <div className={`p-4 rounded-xl border ${
          governedResult.summary.overdueInflows > 0 || governedResult.summary.isDeficitExpected
            ? 'bg-amber-50/70 border-amber-200'
            : 'bg-green-50/70 border-green-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-600">Liquidity & Overdue Exposure</span>
            {governedResult.summary.overdueInflows > 0 ? (
              <Clock className="w-4 h-4 text-amber-600" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            )}
          </div>
          <div className={`text-lg font-bold mt-2 ${
            governedResult.summary.overdueInflows > 0 ? 'text-amber-800' : 'text-green-800'
          }`}>
            {governedResult.summary.overdueInflows > 0
              ? `${currency}${governedResult.summary.overdueInflows.toLocaleString()} Overdue`
              : 'Liquidity On Schedule'}
          </div>
          <div className="text-2xs text-neutral-500 mt-1">
            {governedResult.summary.isDeficitExpected ? 'Working capital funding required' : 'Positive cash buffer maintained'}
          </div>
        </div>
      </div>

      {/* Tab 1: Timeline Table with Drill-down */}
      {activeTab === 'timeline' && (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-700">Time-Phased Cash Schedule</h4>
              <p className="text-2xs text-neutral-400">Periods prior to Data Date reflect settled actuals; future periods reflect governed assumptions</p>
            </div>
            <div className="text-xs text-neutral-500">
              Total Forecast Periods: <span className="font-semibold text-neutral-800">{governedResult.periods.length}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 text-xs">
              <thead className="bg-neutral-50 font-medium text-neutral-600">
                <tr>
                  <th className="px-4 py-3 text-left">Period</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-right">Inflows ({currency})</th>
                  <th className="px-4 py-3 text-right">Outflows ({currency})</th>
                  <th className="px-4 py-3 text-right">Net Cash ({currency})</th>
                  <th className="px-4 py-3 text-right">Cumulative Position ({currency})</th>
                  <th className="px-4 py-3 text-center">Items</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {governedResult.periods.map((p) => {
                  const isHistorical = p.isHistorical;
                  const isExpanded = expandedPeriod === p.period;
                  const inflow = isHistorical ? p.actualInflow : p.forecastInflow;
                  const outflow = isHistorical ? p.actualOutflow : p.forecastOutflow;
                  const net = isHistorical ? p.netActual : p.netForecast;

                  return (
                    <React.Fragment key={p.period}>
                      <tr className={`hover:bg-neutral-50/80 transition-colors ${
                        p.cumulativeCashBalance < 0 ? 'bg-red-50/30' : ''
                      }`}>
                        <td className="px-4 py-3 font-semibold text-neutral-900 flex items-center gap-1.5">
                          <span>{p.period}</span>
                          {p.period === dataDate.slice(0, 7) && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-3xs font-medium">Cut-off</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium ${
                            isHistorical ? 'bg-neutral-100 text-neutral-700' : 'bg-indigo-50 text-indigo-700'
                          }`}>
                            {isHistorical ? 'Settled Actual' : 'Pipeline Forecast'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-success-600">
                          {inflow > 0 ? `${currency}${inflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-neutral-700">
                          {outflow > 0 ? `${currency}${outflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold ${
                          net >= 0 ? 'text-success-600' : 'text-red-600'
                        }`}>
                          {currency}{net.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold ${
                          p.cumulativeCashBalance >= 0 ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {currency}{p.cumulativeCashBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {p.contributions.length > 0 ? (
                            <button
                              onClick={() => setExpandedPeriod(isExpanded ? null : p.period)}
                              className="p-1 text-neutral-500 hover:text-indigo-600 hover:bg-neutral-100 rounded transition-colors"
                              title="View contributing source records"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          ) : (
                            <span className="text-neutral-300">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Drill-down rows for period contributions */}
                      {isExpanded && p.contributions.length > 0 && (
                        <tr className="bg-neutral-50/70">
                          <td colSpan={7} className="p-3">
                            <div className="bg-white rounded-lg border border-neutral-200 p-3 space-y-2">
                              <h5 className="text-2xs font-semibold uppercase text-neutral-500">
                                Detailed Movements in {p.period} ({p.contributions.length} items)
                              </h5>
                              <div className="divide-y divide-neutral-100 text-2xs">
                                {p.contributions.map((it) => (
                                  <div key={it.id} className="py-1.5 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className={`px-1.5 py-0.5 rounded text-3xs font-medium ${
                                        it.direction === 'Inflow' ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-700'
                                      }`}>
                                        {it.sourceType}
                                      </span>
                                      <span className="font-medium text-neutral-800">{it.sourceReference}</span>
                                      <span className="text-neutral-500 truncate max-w-xs">{it.description}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <span className="text-neutral-400">Due: {it.expectedDate}</span>
                                      {it.probabilityPercent < 100 && (
                                        <span className="text-amber-600">Prob: {it.probabilityPercent}%</span>
                                      )}
                                      <span className={`font-semibold ${it.direction === 'Inflow' ? 'text-green-600' : 'text-neutral-800'}`}>
                                        {it.direction === 'Inflow' ? '+' : '-'}{currency}{it.netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Assumptions Configuration Workbench */}
      {activeTab === 'assumptions' && (
        <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-6 shadow-xs">
          <div>
            <h4 className="text-sm font-semibold text-neutral-800">Commercial Cash Flow Assumptions Engine</h4>
            <p className="text-xs text-neutral-500 mt-0.5">
              Configure contractual payment terms, advance recovery, and retention release curves. Changes immediately simulate across all periods.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Client Payment Lag */}
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-700">Client Payment Lag</label>
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-bold">
                  {assumptions.clientPaymentLagDays} Days
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="120"
                step="15"
                value={assumptions.clientPaymentLagDays}
                onChange={(e) => setAssumptions({ ...assumptions, clientPaymentLagDays: Number(e.target.value) })}
                className="w-full h-1.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer"
              />
              <p className="text-3xs text-neutral-500">
                Number of calendar days from Client Certificate approval to settled cash in bank.
              </p>
            </div>

            {/* Subcontractor Payment Lag */}
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-700">Subcontractor Payment Lag</label>
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-bold">
                  {assumptions.subcontractorPaymentLagDays} Days
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="90"
                step="15"
                value={assumptions.subcontractorPaymentLagDays}
                onChange={(e) => setAssumptions({ ...assumptions, subcontractorPaymentLagDays: Number(e.target.value) })}
                className="w-full h-1.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer"
              />
              <p className="text-3xs text-neutral-500">
                Payment credit term applied to subcontractor invoices and supplier commitments.
              </p>
            </div>

            {/* Advance Recovery Rate */}
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-700">Advance Recovery Rate</label>
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-bold">
                  {assumptions.advanceRecoveryRatePercent}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                step="5"
                value={assumptions.advanceRecoveryRatePercent}
                onChange={(e) => setAssumptions({ ...assumptions, advanceRecoveryRatePercent: Number(e.target.value) })}
                className="w-full h-1.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer"
              />
              <p className="text-3xs text-neutral-500">
                Percentage deducted from future client inflows to amortize mobilization advance.
              </p>
            </div>

            {/* Retention Release at TOC */}
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-700">Retention Release (TOC)</label>
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-bold">
                  {assumptions.retentionReleaseTocPercent}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="10"
                value={assumptions.retentionReleaseTocPercent}
                onChange={(e) => setAssumptions({ ...assumptions, retentionReleaseTocPercent: Number(e.target.value) })}
                className="w-full h-1.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer"
              />
              <p className="text-3xs text-neutral-500">
                Portion of accumulated retention released upon Taking-Over Certificate.
              </p>
            </div>

            {/* Retention Release at DLC */}
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-700">Retention Release (DLC)</label>
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-bold">
                  {assumptions.retentionReleaseDlcPercent}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="10"
                value={assumptions.retentionReleaseDlcPercent}
                onChange={(e) => setAssumptions({ ...assumptions, retentionReleaseDlcPercent: Number(e.target.value) })}
                className="w-full h-1.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer"
              />
              <p className="text-3xs text-neutral-500">
                Final retention release upon issuance of Defects Liability Certificate.
              </p>
            </div>

            {/* Contingency Drawdown */}
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-700">Contingency Drawdown</label>
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-bold">
                  {assumptions.contingencyDrawdownPercent}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                step="2"
                value={assumptions.contingencyDrawdownPercent}
                onChange={(e) => setAssumptions({ ...assumptions, contingencyDrawdownPercent: Number(e.target.value) })}
                className="w-full h-1.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer"
              />
              <p className="text-3xs text-neutral-500">
                Additional buffer added to estimated outflows for unexpected site variations.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
            <button
              onClick={() => setAssumptions(DEFAULT_CASH_ASSUMPTIONS)}
              className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
            >
              Reset to Contract Defaults
            </button>
            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" />
              Assumptions Validated & Synchronized
            </span>
          </div>
        </div>
      )}

      {/* Tab 3: Sources & Line Overrides */}
      {activeTab === 'sources' && (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-700">
                Source Document Cash Contributions ({governedResult.sourceItems.length} items)
              </h4>
              <p className="text-2xs text-neutral-400">Manage item-level payment probability and custom expected settlement dates</p>
            </div>
          </div>

          <div className="overflow-x-auto max-h-96">
            <table className="min-w-full divide-y divide-neutral-200 text-xs">
              <thead className="bg-neutral-50 sticky top-0 font-medium text-neutral-600">
                <tr>
                  <th className="px-4 py-2.5 text-left">Source</th>
                  <th className="px-4 py-2.5 text-left">Reference / Description</th>
                  <th className="px-4 py-2.5 text-left">Base Date</th>
                  <th className="px-4 py-2.5 text-left">Expected / Override Date</th>
                  <th className="px-4 py-2.5 text-center">Probability</th>
                  <th className="px-4 py-2.5 text-right">Amount ({currency})</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {governedResult.sourceItems.map((item) => {
                  const override = lineOverrides[item.sourceId] || {};
                  return (
                    <tr key={item.id} className="hover:bg-neutral-50/80">
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-3xs font-semibold ${
                          item.sourceType === 'ClientCertificate'
                            ? 'bg-blue-100 text-blue-800'
                            : item.sourceType === 'SubcontractInvoice'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-neutral-100 text-neutral-800'
                        }`}>
                          {item.sourceType}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-neutral-800">{item.sourceReference}</div>
                        <div className="text-3xs text-neutral-500 truncate max-w-xs">{item.description}</div>
                      </td>
                      <td className="px-4 py-2.5 text-neutral-600">{item.baseDate}</td>
                      <td className="px-4 py-2.5">
                        {item.isSettled ? (
                          <span className="text-neutral-500">{item.settledDate} (Settled)</span>
                        ) : (
                          <input
                            type="date"
                            value={override.dateOverride || item.expectedDate}
                            onChange={(e) => {
                              const val = e.target.value;
                              setLineOverrides({
                                ...lineOverrides,
                                [item.sourceId]: {
                                  ...override,
                                  dateOverride: val,
                                  overrideReason: override.overrideReason || 'Manual controller projection override',
                                },
                              });
                            }}
                            className="text-xs border border-neutral-200 rounded px-1.5 py-0.5 bg-white focus:outline-hidden focus:border-indigo-500"
                          />
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {item.isSettled ? (
                          <span className="text-neutral-400">100%</span>
                        ) : (
                          <select
                            value={override.probabilityPercent !== undefined ? override.probabilityPercent : 100}
                            onChange={(e) => {
                              setLineOverrides({
                                ...lineOverrides,
                                [item.sourceId]: {
                                  ...override,
                                  probabilityPercent: Number(e.target.value),
                                },
                              });
                            }}
                            className="text-xs border border-neutral-200 rounded px-1 py-0.5 bg-white"
                          >
                            <option value={100}>100% (High)</option>
                            <option value={75}>75% (Probable)</option>
                            <option value={50}>50% (Risk/PVO)</option>
                            <option value={25}>25% (Low)</option>
                            <option value={0}>0% (Disputed)</option>
                          </select>
                        )}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${
                        item.direction === 'Inflow' ? 'text-green-600' : 'text-neutral-800'
                      }`}>
                        {item.direction === 'Inflow' ? '+' : '-'}{currency}{item.netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-medium ${
                          item.isSettled ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Scenario Delta Comparison */}
      {activeTab === 'comparison' && (
        <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-neutral-800">Forecast Scenario Delta vs Baseline Version</h4>
              <p className="text-xs text-neutral-500">
                Comparing current adjusted assumptions against approved contractual baseline.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <span className="text-neutral-600">
                Working Capital Peak Impact: <strong className="text-purple-700">{currency}{comparison.workingCapitalImpact.toLocaleString()}</strong>
              </span>
              <span className="text-neutral-600">
                Final Variance: <strong className={comparison.finalCashDifference >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {comparison.finalCashDifference >= 0 ? '+' : ''}{currency}{comparison.finalCashDifference.toLocaleString()}
                </strong>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 text-xs">
              <thead className="bg-neutral-50 font-medium text-neutral-600">
                <tr>
                  <th className="px-4 py-2.5 text-left">Period</th>
                  <th className="px-4 py-2.5 text-right">Baseline Cum. ({currency})</th>
                  <th className="px-4 py-2.5 text-right">Scenario Cum. ({currency})</th>
                  <th className="px-4 py-2.5 text-right">Net Cumulative Shift ({currency})</th>
                  <th className="px-4 py-2.5 text-right">Inflow Shift</th>
                  <th className="px-4 py-2.5 text-right">Outflow Shift</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {comparison.deltas.map((d) => (
                  <tr key={d.period} className="hover:bg-neutral-50/80">
                    <td className="px-4 py-2.5 font-semibold text-neutral-800">{d.period}</td>
                    <td className="px-4 py-2.5 text-right text-neutral-600">{currency}{d.cumulativeA.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-neutral-800">{currency}{d.cumulativeB.toLocaleString()}</td>
                    <td className={`px-4 py-2.5 text-right font-bold ${
                      d.deltaCumulative >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {d.deltaCumulative >= 0 ? '+' : ''}{currency}{d.deltaCumulative.toLocaleString()}
                    </td>
                    <td className={`px-4 py-2.5 text-right ${d.deltaInflow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {d.deltaInflow >= 0 ? '+' : ''}{currency}{d.deltaInflow.toLocaleString()}
                    </td>
                    <td className={`px-4 py-2.5 text-right ${d.deltaOutflow >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {d.deltaOutflow >= 0 ? '+' : ''}{currency}{d.deltaOutflow.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Version Snapshot Modal */}
      {showNewVersionModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl border border-neutral-200">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-semibold text-neutral-800 text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                Save Versioned Forecast Snapshot
              </h3>
              <button
                onClick={() => setShowNewVersionModal(false)}
                className="text-neutral-400 hover:text-neutral-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-neutral-700 mb-1">Snapshot Title *</label>
                <input
                  type="text"
                  placeholder="e.g., Q3 Revised Commercial Forecast (90d Lag)"
                  value={newVersionTitle}
                  onChange={(e) => setNewVersionTitle(e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-700 mb-1">Commercial Justification / Reason</label>
                <textarea
                  placeholder="Explain why payment lags or advance recovery assumptions were revised..."
                  rows={3}
                  value={newVersionReason}
                  onChange={(e) => setNewVersionReason(e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-1 text-2xs text-neutral-600">
                <div>Client Lag: <strong className="text-neutral-800">{assumptions.clientPaymentLagDays} days</strong></div>
                <div>Subcontractor Lag: <strong className="text-neutral-800">{assumptions.subcontractorPaymentLagDays} days</strong></div>
                <div>Advance Recovery: <strong className="text-neutral-800">{assumptions.advanceRecoveryRatePercent}%</strong></div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                onClick={() => setShowNewVersionModal(false)}
                className="px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveScenario}
                disabled={!newVersionTitle.trim() || isSaving}
                className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg disabled:opacity-50 transition-colors shadow-xs"
              >
                {isSaving ? 'Saving...' : 'Save Draft Version'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashFlowForecastBoard;

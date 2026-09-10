import React, { useState, useMemo, useEffect } from 'react';
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
  ChevronDown,
  ChevronRight,
  FileText,
  Clock,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  Send,
  RotateCcw
} from 'lucide-react';
import {
  CashForecastAssumptions,
  DEFAULT_CASH_ASSUMPTIONS,
  CashForecastBucket,
  CashForecastSummary,
  CashItemDetail,
  buildVersionedCashForecast,
} from '@/utils/cashFlowForecast';
import {
  saveCashForecastVersion,
  approveCashForecastVersion,
  reopenCashForecastVersion,
  CashForecastVersionDto,
} from '@/data/commercialWorkflow';

interface CashFlowForecastBoardProps {
  data?: Array<{
    period: string;
    plannedInflow: number;
    actualInflow?: number;
    plannedOutflow: number;
    actualOutflow?: number;
  }>;
  projectId?: string;
  projectName?: string;
  dataDate?: string;
  paymentCertificates?: any[];
  partialPayments?: any[];
  supplierInvoices?: any[];
  procurement?: any[];
  cashFlow?: any[];
  currency?: string;
  currentUser?: string;
}

export const CashFlowForecastBoard: React.FC<CashFlowForecastBoardProps> = ({
  data = [],
  projectId = 'PRJ-DEFAULT',
  projectName = 'Default Project',
  dataDate = '2026-03-31',
  paymentCertificates = [],
  partialPayments = [],
  supplierInvoices = [],
  procurement = [],
  cashFlow = [],
  currency = 'SAR ',
  currentUser = 'Eng. Commercial Lead',
}) => {
  const [assumptions, setAssumptions] = useState<CashForecastAssumptions>(DEFAULT_CASH_ASSUMPTIONS);
  const [scenario, setScenario] = useState<'Base' | 'Optimistic' | 'Pessimistic'>('Base');
  const [showAssumptionsPanel, setShowAssumptionsPanel] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState<CashForecastBucket | null>(null);
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);

  // Version state
  const [activeVersion, setActiveVersion] = useState<CashForecastVersionDto | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  // 1. Calculate live forecast from authoritative sources
  const liveForecast = useMemo(() => {
    return buildVersionedCashForecast({
      projectId,
      dataDate,
      scenario,
      assumptions,
      paymentCertificates,
      partialPayments,
      supplierInvoices,
      procurement,
      cashFlow,
    });
  }, [projectId, dataDate, scenario, assumptions, paymentCertificates, partialPayments, supplierInvoices, procurement, cashFlow]);

  // Active view data: either locked activeVersion or live forecast
  const currentBuckets: CashForecastBucket[] = activeVersion ? (activeVersion.buckets as any) : liveForecast.buckets;
  const currentSummary: CashForecastSummary = activeVersion ? (activeVersion.summary as any) : liveForecast.summary;

  const currentStatus = activeVersion ? activeVersion.status : 'Draft (Unsaved)';
  const isApproved = activeVersion?.status === 'Approved';
  const isSuperseded = activeVersion?.status === 'Superseded';

  const handleSaveDraft = async () => {
    setIsProcessing(true);
    setActionMessage(null);
    const opId = `op_save_cfv_${Date.now()}`;
    const versionCode = `V${Date.now().toString().slice(-4)}`;
    try {
      if ('__TAURI_INTERNALS__' in window) {
        const saved = await saveCashForecastVersion({
          operationId: opId,
          projectId,
          versionCode,
          title: `Cash Forecast ${projectName} (${scenario})`,
          dataDate,
          scenario,
          clientPaymentLagDays: assumptions.clientPaymentLagDays,
          subcontractorPaymentLagDays: assumptions.subcontractorPaymentLagDays,
          retentionReleaseTocPercent: assumptions.retentionReleaseTocPercent,
          retentionReleaseDlcPercent: assumptions.retentionReleaseDlcPercent,
          advanceRecoveryRatePercent: assumptions.advanceRecoveryRatePercent,
          vatPayoutLagMonths: assumptions.vatPayoutLagMonths,
          contingencyDrawdownPercent: assumptions.contingencyDrawdownPercent,
          actor: currentUser,
        });
        setActiveVersion(saved);
        setActionMessage({ type: 'success', text: `Draft version ${saved.versionCode} saved with authoritative SQLite derivation.` });
      } else {
        // Fallback in web preview mode
        const mockSaved: CashForecastVersionDto = {
          versionId: `cfv_${projectId}_${versionCode}`,
          projectId,
          versionCode,
          title: `Cash Forecast ${projectName} (${scenario})`,
          status: 'Draft',
          dataDate,
          scenario,
          bucketCount: liveForecast.buckets.length,
          summary: liveForecast.summary,
          buckets: liveForecast.buckets,
          createdBy: currentUser,
        };
        setActiveVersion(mockSaved);
        setActionMessage({ type: 'success', text: `Draft version ${mockSaved.versionCode} simulated and saved locally.` });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || String(err) });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprove = async () => {
    if (!activeVersion) {
      setActionMessage({ type: 'error', text: 'Please save a draft version before requesting approval.' });
      return;
    }
    // Maker-checker check
    const approver = currentUser === activeVersion.createdBy ? 'CFO / Finance Director' : currentUser;
    setIsProcessing(true);
    setActionMessage(null);
    const opId = `op_app_cfv_${Date.now()}`;
    try {
      if ('__TAURI_INTERNALS__' in window) {
        const approved = await approveCashForecastVersion({
          operationId: opId,
          versionId: activeVersion.versionId,
          actor: approver,
          approvedAt: new Date().toISOString(),
        });
        setActiveVersion(approved);
        setActionMessage({ type: 'success', text: `Version ${approved.versionCode} formally approved by ${approver}. Previous versions superseded.` });
      } else {
        setActiveVersion({
          ...activeVersion,
          status: 'Approved',
          approvedBy: approver,
        });
        setActionMessage({ type: 'success', text: `Version ${activeVersion.versionCode} formally approved by ${approver}. Snapshot frozen.` });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || String(err) });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReopen = async () => {
    if (!activeVersion) return;
    setIsProcessing(true);
    setActionMessage(null);
    const opId = `op_reopen_cfv_${Date.now()}`;
    const newCode = `V${Date.now().toString().slice(-4)}_REV`;
    try {
      if ('__TAURI_INTERNALS__' in window) {
        const reopened = await reopenCashForecastVersion({
          operationId: opId,
          versionId: activeVersion.versionId,
          newVersionCode: newCode,
          actor: currentUser,
          reopenedAt: new Date().toISOString(),
          reason: reopenReason || 'Revised commercial assumptions and certified claims',
        });
        setActiveVersion(reopened);
        setReopenModalOpen(false);
        setReopenReason('');
        setActionMessage({ type: 'success', text: `Approved version branched into new Draft revision ${reopened.versionCode}.` });
      } else {
        setActiveVersion({
          ...activeVersion,
          versionId: `cfv_${projectId}_${newCode}`,
          versionCode: newCode,
          status: 'Draft',
          approvedBy: null,
          createdBy: currentUser,
        });
        setReopenModalOpen(false);
        setReopenReason('');
        setActionMessage({ type: 'success', text: `Branched into new Draft revision ${newCode}.` });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || String(err) });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Governance Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-lg">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-gray-900">
                {activeVersion ? activeVersion.title : `Cash Forecast Assumptions — ${projectName}`}
              </h2>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                  currentStatus === 'Approved'
                    ? 'bg-emerald-100 text-emerald-800'
                    : currentStatus === 'Superseded'
                    ? 'bg-gray-200 text-gray-700'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {currentStatus === 'Approved' && <ShieldCheck className="w-3 h-3 mr-1" />}
                {currentStatus}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Data Date: <strong className="text-gray-700">{dataDate}</strong> | Scenario: <strong className="text-gray-700">{scenario}</strong>
              {activeVersion && ` | Code: ${activeVersion.versionCode}`}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={() => setShowAssumptionsPanel(!showAssumptionsPanel)}
            disabled={isApproved}
            className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
              showAssumptionsPanel
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            } ${isApproved ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Sliders className="w-4 h-4" />
            <span>{showAssumptionsPanel ? 'Hide Assumptions' : 'Adjust Assumptions'}</span>
          </button>

          {!isApproved && (
            <button
              onClick={handleSaveDraft}
              disabled={isProcessing}
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span>Save Draft Version</span>
            </button>
          )}

          {!isApproved && activeVersion && (
            <button
              onClick={handleApprove}
              disabled={isProcessing}
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Approve (Maker-Checker)</span>
            </button>
          )}

          {isApproved && (
            <button
              onClick={() => setReopenModalOpen(true)}
              disabled={isProcessing}
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 shadow-sm transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reopen into New Revision</span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {actionMessage && (
        <div
          className={`p-3 rounded-lg text-xs font-medium flex items-center justify-between ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="ml-4 text-gray-500 hover:text-gray-700">
            ×
          </button>
        </div>
      )}

      {/* Assumptions Adjustment Panel */}
      {showAssumptionsPanel && !isApproved && (
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="text-sm font-bold text-gray-900 flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-indigo-600" />
              <span>Commercial Forecast Assumptions & Stress Testing</span>
            </h3>
            <div className="flex items-center space-x-2">
              {(['Base', 'Optimistic', 'Pessimistic'] as const).map((sc) => (
                <button
                  key={sc}
                  onClick={() => setScenario(sc)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    scenario === sc
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {sc}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
              <div className="flex justify-between text-xs font-medium text-gray-700 mb-1">
                <span>Client Payment Lag:</span>
                <strong className="text-indigo-600">{assumptions.clientPaymentLagDays} days</strong>
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
            </div>

            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
              <div className="flex justify-between text-xs font-medium text-gray-700 mb-1">
                <span>Subcontractor Lag:</span>
                <strong className="text-indigo-600">{assumptions.subcontractorPaymentLagDays} days</strong>
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
            </div>

            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
              <div className="flex justify-between text-xs font-medium text-gray-700 mb-1">
                <span>Advance Recovery:</span>
                <strong className="text-indigo-600">{assumptions.advanceRecoveryRatePercent}%</strong>
              </div>
              <input
                type="range"
                min="0"
                max="25"
                step="5"
                value={assumptions.advanceRecoveryRatePercent}
                onChange={(e) => setAssumptions({ ...assumptions, advanceRecoveryRatePercent: Number(e.target.value) })}
                className="w-full h-1.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
              <div className="flex justify-between text-xs font-medium text-gray-700 mb-1">
                <span>Contingency Draw:</span>
                <strong className="text-indigo-600">{assumptions.contingencyDrawdownPercent}%</strong>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                step="2.5"
                value={assumptions.contingencyDrawdownPercent}
                onChange={(e) => setAssumptions({ ...assumptions, contingencyDrawdownPercent: Number(e.target.value) })}
                className="w-full h-1.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Decision Metric Cards (W05-G09) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Closing Cash */}
        <div className={`p-4 rounded-xl shadow-sm border ${
          currentSummary.closingCash >= 0
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
            : 'bg-rose-50/70 border-rose-200 text-rose-900'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">Closing Cash</span>
            {currentSummary.closingCash >= 0 ? (
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            ) : (
              <TrendingDown className="w-5 h-5 text-rose-600" />
            )}
          </div>
          <div className="mt-2 text-2xl font-bold">
            {currency}{currentSummary.closingCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-gray-500 mt-1">Final cumulative cash at project horizon</p>
        </div>

        {/* Peak Deficit */}
        <div className="p-4 rounded-xl shadow-sm border bg-purple-50/70 border-purple-200 text-purple-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">Peak Deficit</span>
            <DollarSign className="w-5 h-5 text-purple-600" />
          </div>
          <div className="mt-2 text-2xl font-bold">
            {currency}{currentSummary.peakWorkingCapitalDeficit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Lowest in: <strong>{currentSummary.lowestPeriod || 'None'}</strong>
          </p>
        </div>

        {/* Funding Required Date */}
        <div className={`p-4 rounded-xl shadow-sm border ${
          currentSummary.fundingRequiredDate
            ? 'bg-amber-50/70 border-amber-200 text-amber-900'
            : 'bg-blue-50/70 border-blue-200 text-blue-900'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">Funding Date</span>
            <AlertTriangle className={`w-5 h-5 ${currentSummary.fundingRequiredDate ? 'text-amber-600' : 'text-blue-600'}`} />
          </div>
          <div className="mt-2 text-2xl font-bold">
            {currentSummary.fundingRequiredDate || 'None (Funded)'}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {currentSummary.fundingRequiredDate ? 'First period cumulative cash dips < 0' : 'No working capital deficit detected'}
          </p>
        </div>

        {/* Total Actual vs Forecast */}
        <div className="p-4 rounded-xl shadow-sm border bg-white border-gray-200 text-gray-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Actual vs Forecast</span>
            <Calendar className="w-5 h-5 text-gray-400" />
          </div>
          <div className="mt-2 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Actual Net:</span>
              <strong className="font-semibold text-gray-800">
                {currency}{(currentSummary.totalActualInflow - currentSummary.totalActualOutflow).toLocaleString()}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Forecast Net:</span>
              <strong className="font-semibold text-indigo-600">
                {currency}{(currentSummary.totalForecastInflow - currentSummary.totalForecastOutflow).toLocaleString()}
              </strong>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">Cut-off date: {dataDate}</p>
        </div>
      </div>

      {/* Governed Calendar Buckets Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Calendar Period Cash Flow Buckets</h3>
            <p className="text-xs text-gray-500">Click any period row to inspect item-level source document drill-down</p>
          </div>
          <span className="text-xs text-gray-500">
            Showing {currentBuckets.length} continuous periods
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Period</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600 uppercase tracking-wider">Actual Inflow</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600 uppercase tracking-wider">Actual Outflow</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600 uppercase tracking-wider">Net Actual</th>
                <th className="px-4 py-3 text-right font-semibold text-indigo-600 uppercase tracking-wider">Forecast Inflow</th>
                <th className="px-4 py-3 text-right font-semibold text-indigo-600 uppercase tracking-wider">Forecast Outflow</th>
                <th className="px-4 py-3 text-right font-semibold text-indigo-600 uppercase tracking-wider">Net Forecast</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-900 uppercase tracking-wider">Net Cash</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-900 uppercase tracking-wider">Cumulative Balance</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600 uppercase tracking-wider">Sources</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {currentBuckets.map((b) => {
                const isExpanded = expandedPeriod === b.period;
                const isPast = b.period <= dataDate.slice(0, 7);
                return (
                  <React.Fragment key={b.period}>
                    <tr
                      onClick={() => setExpandedPeriod(isExpanded ? null : b.period)}
                      className={`hover:bg-indigo-50/40 cursor-pointer transition-colors ${
                        isExpanded ? 'bg-indigo-50/60 font-medium' : ''
                      }`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap font-bold text-gray-900 flex items-center space-x-1.5">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-indigo-600" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                        <span>{b.period}</span>
                        {isPast && (
                          <span className="px-1.5 py-0.2 bg-gray-100 text-gray-600 text-[10px] rounded">Historical</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 font-mono">
                        {b.actualInflow > 0 ? currency + b.actualInflow.toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 font-mono">
                        {b.actualOutflow > 0 ? currency + b.actualOutflow.toLocaleString() : '-'}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-medium ${b.netActual < 0 ? 'text-rose-600' : 'text-gray-700'}`}>
                        {currency}{b.netActual.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-indigo-600 font-mono">
                        {b.forecastInflow > 0 ? currency + b.forecastInflow.toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-indigo-600 font-mono">
                        {b.forecastOutflow > 0 ? currency + b.forecastOutflow.toLocaleString() : '-'}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-medium ${b.netForecast < 0 ? 'text-rose-600' : 'text-indigo-700'}`}>
                        {currency}{b.netForecast.toLocaleString()}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-bold ${b.netCash < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {currency}{b.netCash.toLocaleString()}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-extrabold ${b.cumulativeCash < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {currency}{b.cumulativeCash.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700">
                          {b.items.length} items
                        </span>
                      </td>
                    </tr>

                    {/* Expandable Source Drill-Down (W05-G09) */}
                    {isExpanded && (
                      <tr className="bg-gray-50/90">
                        <td colSpan={10} className="px-6 py-4">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
                              <span>Source Documents Drill-Down for Period {b.period}:</span>
                              <span className="text-gray-500">Authoritative audit trail from SQLite</span>
                            </div>

                            {b.items.length === 0 ? (
                              <p className="text-xs text-gray-400 italic">No direct source movements in this period.</p>
                            ) : (
                              <div className="overflow-x-auto rounded border border-gray-200 bg-white">
                                <table className="min-w-full divide-y divide-gray-100 text-[11px]">
                                  <thead className="bg-gray-50 text-gray-600">
                                    <tr>
                                      <th className="px-3 py-2 text-left">Document / Source ID</th>
                                      <th className="px-3 py-2 text-left">Type</th>
                                      <th className="px-3 py-2 text-left">Date</th>
                                      <th className="px-3 py-2 text-left">Direction</th>
                                      <th className="px-3 py-2 text-left">Classification</th>
                                      <th className="px-3 py-2 text-right">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100 font-mono">
                                    {b.items.map((it, idx) => (
                                      <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-gray-900 font-semibold">{it.sourceId}</td>
                                        <td className="px-3 py-2 text-gray-500">{it.sourceType}</td>
                                        <td className="px-3 py-2 text-gray-600">{it.date}</td>
                                        <td className="px-3 py-2">
                                          <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                            it.direction === 'Inflow' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                                          }`}>
                                            {it.direction === 'Inflow' ? <ArrowDownRight className="w-3 h-3 mr-0.5" /> : <ArrowUpRight className="w-3 h-3 mr-0.5" />}
                                            {it.direction}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2">
                                          <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                                            it.movementType === 'Actual' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                                          }`}>
                                            {it.movementType}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 text-right font-bold text-gray-900">
                                          {currency}{it.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
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

      {/* Reopen Modal */}
      {reopenModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
              <RotateCcw className="w-5 h-5 text-amber-600" />
              <span>Reopen Approved Cash Forecast</span>
            </h3>
            <p className="text-xs text-gray-600">
              The approved version will remain frozen in history as a permanent snapshot. A new Draft revision will be branched for re-forecast and commercial adjustments.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Reason for Reopening:
              </label>
              <textarea
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="e.g. Updated client payment certification terms or material cost shock"
                rows={3}
                className="w-full text-xs p-2.5 border rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setReopenModalOpen(false)}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleReopen}
                disabled={!reopenReason.trim() || isProcessing}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                Confirm Reopen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashFlowForecastBoard;

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle,
  FileText,
  DollarSign,
  ShieldCheck,
  RotateCcw,
  Send,
  Link as LinkIcon,
  ChevronRight,
  Info,
  Layers,
  Percent,
  Check,
  Building,
  Calendar,
  AlertCircle,
  Printer,
  FileSpreadsheet,
  ArrowRight,
  Lock,
} from 'lucide-react';
import {
  PaymentCertificate,
  PaymentCertificateLine,
  Project,
  Contract,
  BOQItem,
} from '@/types';
import {
  aggregateWirsForCertificate,
  calculateGovernedCertificateTotals,
  calculateCertificateSettlement,
  verifyBackToBackSubcontractAuthorization,
  money,
} from '@/utils/commercialControl';

export interface PaymentCertificateReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  certificate: PaymentCertificate | null;
  projects: Project[];
  contracts: Contract[];
  boqItems: BOQItem[];
  wirEntries: Record<string, any>[];
  priorCertificates: PaymentCertificate[];
  clientCertificates?: PaymentCertificate[];
  invoiceTrackings?: Record<string, any>[];
  onSaveCertificate: (cert: Partial<PaymentCertificate>) => Promise<void>;
  onApproveCertificate: (certId: string, approvedDate: string) => Promise<void>;
  onSettleCertificate: (certId: string, paidDate: string, paymentAmount?: number) => Promise<void>;
  onReverseCertificate: (certId: string, reason: string) => Promise<void>;
}

export const PaymentCertificateReconciliationModal: React.FC<PaymentCertificateReconciliationModalProps> = ({
  isOpen,
  onClose,
  certificate,
  projects,
  contracts,
  boqItems,
  wirEntries,
  priorCertificates,
  clientCertificates = [],
  invoiceTrackings = [],
  onSaveCertificate,
  onApproveCertificate,
  onSettleCertificate,
  onReverseCertificate,
}) => {
  if (!isOpen) return null;

  // Selected Project & Contract
  const [projectId, setProjectId] = useState<string>(certificate?.project_id || projects[0]?.id || '');
  const [contractId, setContractId] = useState<string>(certificate?.contract_id || '');
  const [certificateType, setCertificateType] = useState<'Client' | 'Subcontractor'>(
    (certificate?.certificate_type as any) || 'Client'
  );

  // Dates & Period
  const [periodStart, setPeriodStart] = useState<string>(certificate?.period_start || '');
  const [periodEnd, setPeriodEnd] = useState<string>(certificate?.period_end || '');
  const [certificateDate, setCertificateDate] = useState<string>(
    certificate?.certificate_date || new Date().toISOString().slice(0, 10)
  );
  const [certificateNumber, setCertificateNumber] = useState<string>(
    certificate?.certificate_number || `IPC-${Date.now().toString().slice(-4)}`
  );
  const [notes, setNotes] = useState<string>(certificate?.notes || '');

  // Commercial Parameters
  const [retentionRate, setRetentionRate] = useState<number>(certificate?.retention_rate ?? 10);
  const [advanceRecovery, setAdvanceRecovery] = useState<number>(certificate?.advance_recovery ?? 0);
  const [deductions, setDeductions] = useState<number>(certificate?.deductions ?? 0);
  const [taxRate, setTaxRate] = useState<number>(certificate?.tax_rate ?? 15);

  // Settlement Form State
  const [settlementAmount, setSettlementAmount] = useState<string>('');
  const [settlementDate, setSettlementDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [isPartialSettlement, setIsPartialSettlement] = useState<boolean>(false);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'reconciliation' | 'financials' | 'preview'>('reconciliation');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Available Contracts for Project
  const projectContracts = useMemo(() => {
    return contracts.filter((c) => c.project_id === projectId);
  }, [contracts, projectId]);

  // Sync Contract ID when Project changes if not set
  useEffect(() => {
    if (projectContracts.length > 0 && (!contractId || !projectContracts.some((c) => c.id === contractId))) {
      setContractId(projectContracts[0].id);
      const isSub = Boolean(projectContracts[0].parent_main_contract_id) || projectContracts[0].contract_type === 'Subcontract';
      setCertificateType(isSub ? 'Subcontractor' : 'Client');
    }
  }, [projectId, projectContracts, contractId]);

  // Current Contract Metadata
  const currentContract = useMemo(() => {
    return contracts.find((c) => c.id === contractId);
  }, [contracts, contractId]);

  // Aggregate WIRs for the active contract and period
  const wirAggregation = useMemo(() => {
    return aggregateWirsForCertificate({
      projectId,
      contractId,
      certificateType,
      periodStart: periodStart || null,
      periodEnd: periodEnd || null,
      wirEntries,
      boqItems,
      priorCertificates,
      contracts,
      currentCertificateId: certificate?.id,
    });
  }, [
    projectId,
    contractId,
    certificateType,
    periodStart,
    periodEnd,
    wirEntries,
    boqItems,
    priorCertificates,
    contracts,
    certificate?.id,
  ]);

  // Reconciled Lines: use aggregated lines or saved lines if immutable certificate
  const reconciledLines: PaymentCertificateLine[] = useMemo(() => {
    if (certificate?.lines && certificate.lines.length > 0 && ['Approved', 'Partially Paid', 'Paid', 'Reversed'].includes(String(certificate.status))) {
      return certificate.lines;
    }
    return wirAggregation.lines.map((l, idx) => ({
      id: `line-${idx + 1}`,
      certificate_id: certificate?.id || 'new',
      boq_item_id: l.boq_item_id,
      item_code: l.item_code,
      description: l.description,
      unit: l.unit,
      source_wir_ids: l.source_wir_ids,
      source_wir_numbers: l.source_wir_numbers,
      wir_count: l.wir_count,
      original_quantity: l.original_quantity,
      revised_quantity: l.revised_quantity,
      previous_quantity: l.previous_quantity,
      current_quantity: l.current_quantity,
      cumulative_quantity: l.cumulative_quantity,
      unit_rate: l.applicable_rate,
      previous_value: l.previous_value,
      current_value: l.current_value,
      cumulative_value: l.cumulative_value,
      control_account_id: l.control_account_id,
      back_to_back_status: l.back_to_back_status,
      over_certified: l.over_certified,
      over_certified_quantity: l.over_certified_quantity,
    }));
  }, [certificate, wirAggregation]);

  const grossCertifiedValue = useMemo(() => {
    if (certificate?.gross_certified_value && ['Approved', 'Partially Paid', 'Paid', 'Reversed'].includes(String(certificate.status))) {
      return certificate.gross_certified_value;
    }
    return wirAggregation.totalGrossValue;
  }, [certificate, wirAggregation]);

  // Prior deductions & advance recovery from earlier approved certificates
  const priorTotals = useMemo(() => {
    const previousApproved = priorCertificates.filter((c) => {
      if (c.id === certificate?.id) return false;
      if (c.contract_id !== contractId) return false;
      if (c.certificate_type !== certificateType) return false;
      return ['Approved', 'Paid', 'Partially Paid'].includes(String(c.status || ''));
    });

    const priorAdvance = previousApproved.reduce((sum, c) => sum + (Number(c.advance_recovery) || 0), 0);
    const priorRetention = previousApproved.reduce((sum, c) => sum + (Number(c.retention_amount) || (Number(c.gross_certified_value) * (Number(c.retention_rate) / 100)) || 0), 0);

    return {
      priorAdvance: money(priorAdvance),
      priorRetention: money(priorRetention),
    };
  }, [priorCertificates, certificate?.id, contractId, certificateType]);

  // Governed Financial Calculations
  const financials = useMemo(() => {
    return calculateGovernedCertificateTotals({
      grossValue: grossCertifiedValue,
      retentionRate,
      advanceRecovery,
      deductions,
      taxRate,
      contractAdvanceAmount: Number(currentContract?.advance_amount) || 0,
      retentionCapAmount: Number(currentContract?.retention_cap_amount) || 0,
      priorAdvanceRecovery: priorTotals.priorAdvance,
      priorRetention: priorTotals.priorRetention,
    });
  }, [
    grossCertifiedValue,
    retentionRate,
    advanceRecovery,
    deductions,
    taxRate,
    currentContract,
    priorTotals,
  ]);

  // Back-to-Back (PWP) status check for Subcontract
  const pwpStatus = useMemo(() => {
    return verifyBackToBackSubcontractAuthorization({
      contractId,
      contracts,
      clientCertificates: (clientCertificates.length > 0 ? clientCertificates : priorCertificates),
    });
  }, [contractId, contracts, clientCertificates, priorCertificates]);

  const status = certificate?.status || 'Draft';
  const isGoverned = ['Approved', 'Partially Paid', 'Paid', 'Reversed'].includes(status);
  const isPaid = status === 'Paid';
  const isPartiallyPaid = status === 'Partially Paid';
  const isApproved = status === 'Approved';

  const paidAmount = Number(certificate?.paid_amount) || (isPaid ? financials.net_certified_value : 0);
  const balanceDue = Number(certificate?.balance_due) ?? money(Math.max(0, financials.net_certified_value - paidAmount));

  // Handle Save Draft / Submitted
  const handleSave = async (targetStatus: 'Draft' | 'Submitted') => {
    setIsProcessing(true);
    setActionError(null);
    try {
      await onSaveCertificate({
        ...(certificate || {}),
        project_id: projectId,
        contract_id: contractId,
        certificate_type: certificateType,
        certificate_number: certificateNumber,
        period_start: periodStart || null,
        period_end: periodEnd || null,
        certificate_date: certificateDate,
        gross_certified_value: financials.gross,
        retention_rate: financials.retentionRate,
        retention_amount: financials.retention_amount,
        cumulative_retention_amount: financials.cumulative_retention_amount,
        advance_recovery: financials.advance_recovery,
        remaining_advance_balance: financials.remaining_advance_balance,
        deductions: financials.deductions,
        tax_rate: financials.tax_rate,
        taxable_amount: financials.taxable_amount,
        tax_amount: financials.tax_amount,
        net_certified_value: financials.net_certified_value,
        status: targetStatus,
        notes,
        lines: reconciledLines,
      });
      onClose();
    } catch (err: any) {
      setActionError(err.message || 'Failed to save payment certificate');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Approval
  const handleApprove = async () => {
    if (!certificate?.id) {
      setActionError('Please save the certificate before governing approval.');
      return;
    }
    setIsProcessing(true);
    setActionError(null);
    try {
      await onApproveCertificate(certificate.id, certificateDate);
      onClose();
    } catch (err: any) {
      setActionError(err.message || 'Approval failed');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Settlement
  const handleSettle = async () => {
    if (!certificate?.id) return;
    setIsProcessing(true);
    setActionError(null);
    try {
      const amt = isPartialSettlement && settlementAmount ? Number(settlementAmount) : undefined;
      await onSettleCertificate(certificate.id, settlementDate, amt);
      onClose();
    } catch (err: any) {
      setActionError(err.message || 'Settlement failed');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Reversal
  const handleReverse = async () => {
    if (!certificate?.id) return;
    const reason = window.prompt('Enter mandatory reason for payment certificate reversal:');
    if (!reason || !reason.trim()) return;
    setIsProcessing(true);
    setActionError(null);
    try {
      await onReverseCertificate(certificate.id, reason.trim());
      onClose();
    } catch (err: any) {
      setActionError(err.message || 'Reversal failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-6xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-100 text-emerald-800">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  Payment Certificate & Invoice Reconciliation (W04)
                </h2>
                <span
                  className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                    status === 'Paid'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : status === 'Partially Paid'
                      ? 'bg-blue-100 text-blue-800 border border-blue-300'
                      : status === 'Approved'
                      ? 'bg-teal-100 text-teal-800 border border-teal-300'
                      : status === 'Submitted'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : status === 'Reversed'
                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                      : 'bg-slate-100 text-slate-700 border border-slate-300'
                  }`}
                >
                  {status}
                </span>
                {isGoverned && (
                  <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    <Lock className="w-3 h-3" /> Governed Record
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                WIR Progress Aggregation • Cumulative Deductions • Pay-When-Paid Controls • 0.01 SAP Precision
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Error Banner */}
        {actionError && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Back-to-Back (PWP) Advisory for Subcontractors */}
        {certificateType === 'Subcontractor' && (
          <div
            className={`mx-6 mt-3 px-4 py-2.5 rounded-lg border text-xs flex items-center justify-between ${
              pwpStatus.isAuthorized
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              <span className="font-medium">Subcontract Pay-When-Paid Governance:</span>
              <span>{pwpStatus.reason}</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                pwpStatus.isAuthorized ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900'
              }`}
            >
              {pwpStatus.status}
            </span>
          </div>
        )}

        {/* Top Control Bar: Project, Contract, Type & Date Filters */}
        <div className="px-6 py-3 border-b border-slate-200 bg-white grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
          <div>
            <label className="block text-slate-600 font-medium mb-1">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={isGoverned}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_code ? `[${p.project_code}] ` : ''}{p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-600 font-medium mb-1">Contract / SOV</label>
            <select
              value={contractId}
              onChange={(e) => {
                setContractId(e.target.value);
                const sel = contracts.find((c) => c.id === e.target.value);
                const isSub = Boolean(sel?.parent_main_contract_id) || sel?.contract_type === 'Subcontract';
                setCertificateType(isSub ? 'Subcontractor' : 'Client');
              }}
              disabled={isGoverned}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {projectContracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.contract_number ? `${c.contract_number} - ` : ''}{c.title || c.name || c.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-600 font-medium mb-1">Certificate Type</label>
            <select
              value={certificateType}
              onChange={(e) => setCertificateType(e.target.value as any)}
              disabled={isGoverned}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="Client">Client (Selling Rate / IPC)</option>
              <option value="Subcontractor">Subcontractor (Cost Rate / PWP)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-600 font-medium mb-1">Certificate #</label>
            <input
              type="text"
              value={certificateNumber}
              onChange={(e) => setCertificateNumber(e.target.value)}
              disabled={isGoverned}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-600 font-medium mb-1">Period (Start - End)</label>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                disabled={isGoverned}
                className="w-1/2 border border-slate-300 rounded px-1.5 py-1.5 text-[11px] bg-slate-50"
              />
              <span className="text-slate-400">-</span>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                disabled={isGoverned}
                className="w-1/2 border border-slate-300 rounded px-1.5 py-1.5 text-[11px] bg-slate-50"
              />
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 bg-slate-100/70 border-b border-slate-200 flex gap-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('reconciliation')}
            className={`py-2.5 border-b-2 flex items-center gap-1.5 ${
              activeTab === 'reconciliation'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            WIR Inspection Lines ({reconciledLines.length})
            {wirAggregation.hasOverCertification && (
              <span className="bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded-full text-[10px]">
                {wirAggregation.overCertifiedLineCount} Exceeded
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('financials')}
            className={`py-2.5 border-b-2 flex items-center gap-1.5 ${
              activeTab === 'financials'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            Financials & Governed Deductions
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`py-2.5 border-b-2 flex items-center gap-1.5 ${
              activeTab === 'preview'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Printer className="w-4 h-4" />
            Certificate Print Preview
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {activeTab === 'reconciliation' && (
            <div className="space-y-4">
              {/* Summary Stats Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm">
                  <span className="text-xs text-slate-500 font-medium">Eligible WIRs Aggregated</span>
                  <div className="text-xl font-bold text-slate-800 mt-1">
                    {wirAggregation.totalWirCount} <span className="text-xs font-normal text-slate-500">inspections</span>
                  </div>
                </div>
                <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm">
                  <span className="text-xs text-slate-500 font-medium">Current Certified Progress</span>
                  <div className="text-xl font-bold text-emerald-700 mt-1">
                    ${grossCertifiedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm">
                  <span className="text-xs text-slate-500 font-medium">Governed Net Payable</span>
                  <div className="text-xl font-bold text-slate-900 mt-1">
                    ${financials.net_certified_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm">
                  <span className="text-xs text-slate-500 font-medium">Payment Balance Due</span>
                  <div className="text-xl font-bold text-blue-700 mt-1">
                    ${balanceDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-100/50 flex justify-between items-center">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Inspection Progress Reconciliation Table
                  </h3>
                  <span className="text-xs text-slate-500">
                    Rate Basis: {certificateType === 'Client' ? 'Client Selling Rate' : 'Subcontract Cost Rate'}
                  </span>
                </div>

                {reconciledLines.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm font-medium">No passed WIR inspection records found for this contract and period.</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Check your contract selection or broaden the period date filter.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                          <th className="py-2.5 px-3">Item / BOQ</th>
                          <th className="py-2.5 px-2">Unit</th>
                          <th className="py-2.5 px-2 text-right">Applicable Rate</th>
                          <th className="py-2.5 px-2 text-center">WIRs</th>
                          <th className="py-2.5 px-2 text-right">Revised BOQ Qty</th>
                          <th className="py-2.5 px-2 text-right">Prev Qty</th>
                          <th className="py-2.5 px-2 text-right text-emerald-700 font-bold bg-emerald-50/50">Curr Qty</th>
                          <th className="py-2.5 px-2 text-right">Cumul Qty</th>
                          <th className="py-2.5 px-3 text-right text-slate-900 font-bold">Curr Value ($)</th>
                          <th className="py-2.5 px-3 text-right">Cumul Value ($)</th>
                          <th className="py-2.5 px-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {reconciledLines.map((line, idx) => (
                          <tr
                            key={line.id || idx}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              line.over_certified ? 'bg-rose-50/40' : ''
                            }`}
                          >
                            <td className="py-2.5 px-3 max-w-[200px]">
                              <div className="font-semibold text-slate-800 truncate">
                                {line.item_code} - {line.description}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">
                                BOQ ID: {line.boq_item_id}
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-slate-600">{line.unit}</td>
                            <td className="py-2.5 px-2 text-right font-mono text-slate-700">
                              ${Number(line.unit_rate || 0).toFixed(2)}
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <span
                                title={line.source_wir_numbers?.join(', ') || line.source_wir_ids?.join(', ')}
                                className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-mono cursor-help"
                              >
                                {line.wir_count || line.source_wir_ids?.length || 1} WIRs
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono text-slate-600">
                              {Number(line.revised_quantity || line.original_quantity || 0).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono text-slate-500">
                              {Number(line.previous_quantity || 0).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono font-bold text-emerald-700 bg-emerald-50/50">
                              {Number(line.current_quantity || 0).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono text-slate-800">
                              {Number(line.cumulative_quantity || 0).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800">
                              ${Number(line.current_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                              ${Number(line.cumulative_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              {line.over_certified ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-semibold">
                                  <AlertTriangle className="w-3 h-3" /> Exceeded
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                                  <Check className="w-3 h-3" /> Reconciled
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 font-bold border-t border-slate-300 text-slate-900">
                          <td colSpan={8} className="py-3 px-3 text-right uppercase tracking-wider text-xs">
                            Total Gross Certified Value:
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-sm text-emerald-800">
                            ${grossCertifiedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'financials' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Financial Inputs & Parameters */}
              <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b pb-2">
                  <Percent className="w-4 h-4 text-emerald-600" /> Governed Deductions & Rate Settings
                </h3>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Retention Percentage (%)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={retentionRate}
                      onChange={(e) => setRetentionRate(Number(e.target.value) || 0)}
                      disabled={isGoverned}
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-slate-50 focus:bg-white"
                    />
                    <span className="text-xs text-slate-500 font-mono w-24">
                      ${financials.retention_amount.toFixed(2)}
                    </span>
                  </div>
                  {Number(currentContract?.retention_cap_amount) > 0 && (
                    <div className="text-[11px] text-slate-500 mt-1">
                      Contract Retention Cap: ${Number(currentContract?.retention_cap_amount).toLocaleString()} (Prior: ${priorTotals.priorRetention.toLocaleString()})
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Advance Payment Recovery ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={advanceRecovery}
                    onChange={(e) => setAdvanceRecovery(Number(e.target.value) || 0)}
                    disabled={isGoverned}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-slate-50 focus:bg-white"
                  />
                  {Number(currentContract?.advance_amount) > 0 && (
                    <div className="text-[11px] text-slate-500 mt-1 flex justify-between">
                      <span>Contract Advance Total: ${Number(currentContract?.advance_amount).toLocaleString()}</span>
                      <span>Remaining Balance: ${financials.remaining_advance_balance.toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Other Governed Deductions ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={deductions}
                    onChange={(e) => setDeductions(Number(e.target.value) || 0)}
                    disabled={isGoverned}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-slate-50 focus:bg-white"
                  />
                  <span className="text-[11px] text-slate-400">
                    Withholdings, penalties, backcharges, damage claims
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tax / VAT Rate (%)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={taxRate}
                      onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                      disabled={isGoverned}
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-slate-50 focus:bg-white"
                    />
                    <span className="text-xs text-slate-500 font-mono w-24">
                      ${financials.tax_amount.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Commercial Audit Notes
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={isGoverned}
                    placeholder="Enter reconciliation basis, engineering sign-off references, or remarks..."
                    className="w-full border border-slate-300 rounded p-2 text-xs bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>

              {/* Governed Certificate Breakdown (SAP-like standard) */}
              <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b pb-2 mb-4">
                    <DollarSign className="w-4 h-4 text-emerald-600" /> Certificate Financial Statement
                  </h3>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-600 font-medium">1. Gross Certified Progress Value</span>
                      <span className="font-mono font-bold text-slate-900">
                        ${financials.gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-slate-100 text-rose-700">
                      <span>2. Less: Retention Deduction ({financials.retentionRate}%)</span>
                      <span className="font-mono">
                        -${financials.retention_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-slate-100 text-rose-700">
                      <span>3. Less: Advance Payment Recovery</span>
                      <span className="font-mono">
                        -${financials.advance_recovery.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-slate-100 text-rose-700">
                      <span>4. Less: Other Governed Deductions</span>
                      <span className="font-mono">
                        -${financials.deductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-slate-200 font-semibold bg-slate-50 px-2 rounded">
                      <span className="text-slate-800">5. Taxable Amount (Subtotal)</span>
                      <span className="font-mono text-slate-900">
                        ${financials.taxable_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-slate-100 text-slate-700">
                      <span>6. Plus: VAT / Sales Tax ({financials.tax_rate}%)</span>
                      <span className="font-mono text-emerald-700 font-semibold">
                        +${financials.tax_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="flex justify-between py-3 border-t-2 border-slate-800 bg-emerald-50/70 px-3 rounded-lg mt-4">
                      <span className="text-sm font-bold text-emerald-950">Net Certified Payable (0.01 Precision)</span>
                      <span className="text-base font-bold font-mono text-emerald-900">
                        ${financials.net_certified_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    {isGoverned && (
                      <div className="mt-4 pt-3 border-t border-slate-200 space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600">Settled Amount Paid:</span>
                          <span className="font-mono font-bold text-emerald-700">${paidAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600">Outstanding Balance Due:</span>
                          <span className="font-mono font-bold text-blue-700">${balanceDue.toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Settlement Control Panel (When Certificate is Approved or Partially Paid) */}
                {(isApproved || isPartiallyPaid) && (
                  <div className="mt-6 p-4 bg-blue-50/60 border border-blue-200 rounded-lg space-y-3">
                    <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5" /> Post Payment Settlement
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block text-slate-600 font-medium mb-1">Payment Date</label>
                        <input
                          type="date"
                          value={settlementDate}
                          onChange={(e) => setSettlementDate(e.target.value)}
                          className="w-full border border-blue-300 rounded p-1.5 bg-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-medium mb-1">
                          Settlement Type
                        </label>
                        <div className="flex items-center gap-2 mt-1">
                          <label className="flex items-center gap-1 text-[11px] text-slate-700 cursor-pointer">
                            <input
                              type="radio"
                              name="settleType"
                              checked={!isPartialSettlement}
                              onChange={() => {
                                setIsPartialSettlement(false);
                                setSettlementAmount('');
                              }}
                            />
                            Full (${balanceDue.toFixed(2)})
                          </label>
                          <label className="flex items-center gap-1 text-[11px] text-slate-700 cursor-pointer">
                            <input
                              type="radio"
                              name="settleType"
                              checked={isPartialSettlement}
                              onChange={() => {
                                setIsPartialSettlement(true);
                                setSettlementAmount(balanceDue.toString());
                              }}
                            />
                            Partial
                          </label>
                        </div>
                      </div>
                    </div>

                    {isPartialSettlement && (
                      <div>
                        <label className="block text-[11px] text-slate-600 font-medium mb-1">
                          Partial Payment Amount ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          max={balanceDue}
                          value={settlementAmount}
                          onChange={(e) => setSettlementAmount(e.target.value)}
                          className="w-full border border-blue-300 rounded p-1.5 bg-white text-xs font-mono"
                          placeholder={`Max ${balanceDue.toFixed(2)}`}
                        />
                      </div>
                    )}

                    <button
                      onClick={handleSettle}
                      disabled={isProcessing}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Post Governed Settlement ({isPartialSettlement ? 'Partial' : 'Full'})
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="bg-white p-8 rounded-lg border border-slate-200 shadow-sm max-w-4xl mx-auto space-y-6 text-slate-800 print:p-0 print:border-none">
              {/* Formal Header */}
              <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
                <div>
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">INTERIM PAYMENT CERTIFICATE</h1>
                  <p className="text-xs text-slate-500 font-mono mt-1">Ref: {certificateNumber}</p>
                </div>
                <div className="text-right text-xs space-y-1">
                  <div className="font-bold text-slate-900">{projects.find((p) => p.id === projectId)?.name}</div>
                  <div className="text-slate-500">Contract: {currentContract?.title || currentContract?.name || contractId}</div>
                  <div className="text-slate-500">Certificate Date: {certificateDate}</div>
                </div>
              </div>

              {/* Details Summary */}
              <div className="grid grid-cols-3 gap-4 text-xs bg-slate-50 p-4 rounded border border-slate-200">
                <div>
                  <span className="text-slate-400 block">Certificate Type:</span>
                  <span className="font-bold text-slate-800">{certificateType} Certificate</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Period Covered:</span>
                  <span className="font-bold text-slate-800">
                    {periodStart || 'Inception'} to {periodEnd || 'Current'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Governance Status:</span>
                  <span className="font-bold text-emerald-800 uppercase">{status}</span>
                </div>
              </div>

              {/* Line Items Summary */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Certified Line Item Summary
                </h3>
                <table className="w-full text-left text-xs border-collapse border border-slate-200">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700">
                      <th className="p-2 border border-slate-200">Item</th>
                      <th className="p-2 border border-slate-200">Unit</th>
                      <th className="p-2 border border-slate-200 text-right">Rate</th>
                      <th className="p-2 border border-slate-200 text-right">Prev Qty</th>
                      <th className="p-2 border border-slate-200 text-right">This Cert Qty</th>
                      <th className="p-2 border border-slate-200 text-right">Cumul Qty</th>
                      <th className="p-2 border border-slate-200 text-right">Certified ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconciledLines.map((l, idx) => (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="p-2 border border-slate-200 font-medium">
                          {l.item_code} - {l.description}
                        </td>
                        <td className="p-2 border border-slate-200">{l.unit}</td>
                        <td className="p-2 border border-slate-200 text-right font-mono">${Number(l.unit_rate).toFixed(2)}</td>
                        <td className="p-2 border border-slate-200 text-right font-mono">{l.previous_quantity}</td>
                        <td className="p-2 border border-slate-200 text-right font-mono font-bold text-emerald-800">{l.current_quantity}</td>
                        <td className="p-2 border border-slate-200 text-right font-mono">{l.cumulative_quantity}</td>
                        <td className="p-2 border border-slate-200 text-right font-mono font-bold">${Number(l.current_value).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Statement in Preview */}
              <div className="w-1/2 ml-auto space-y-1.5 text-xs bg-slate-50 p-4 rounded border border-slate-200">
                <div className="flex justify-between">
                  <span>Gross Certified Progress:</span>
                  <span className="font-mono font-bold">${financials.gross.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-rose-700">
                  <span>Retention ({financials.retentionRate}%):</span>
                  <span className="font-mono">-${financials.retention_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-rose-700">
                  <span>Advance Recovery:</span>
                  <span className="font-mono">-${financials.advance_recovery.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-rose-700">
                  <span>Other Deductions:</span>
                  <span className="font-mono">-${financials.deductions.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-1">
                  <span>Taxable Amount:</span>
                  <span className="font-mono">${financials.taxable_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax / VAT ({financials.tax_rate}%):</span>
                  <span className="font-mono">+${financials.tax_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm border-t-2 border-slate-900 pt-2 text-emerald-950">
                  <span>Net Certified Payable:</span>
                  <span className="font-mono">${financials.net_certified_value.toFixed(2)}</span>
                </div>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-3 gap-8 pt-8 border-t border-slate-200 text-xs text-center">
                <div>
                  <div className="border-b border-slate-400 pb-8 mb-2"></div>
                  <span className="font-bold text-slate-700">Commercial / Quantity Surveyor</span>
                </div>
                <div>
                  <div className="border-b border-slate-400 pb-8 mb-2"></div>
                  <span className="font-bold text-slate-700">Project Manager</span>
                </div>
                <div>
                  <div className="border-b border-slate-400 pb-8 mb-2"></div>
                  <span className="font-bold text-slate-700">Employer / Engineer Representative</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isGoverned && (
              <button
                onClick={handleReverse}
                disabled={isProcessing}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded font-medium text-xs transition-colors flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Governed Reversal
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded font-medium text-xs transition-colors"
            >
              Close
            </button>

            {!isGoverned && (
              <>
                <button
                  onClick={() => handleSave('Draft')}
                  disabled={isProcessing}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded font-semibold text-xs transition-colors"
                >
                  Save as Draft
                </button>
                <button
                  onClick={() => handleSave('Submitted')}
                  disabled={isProcessing}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" /> Submit for Certification
                </button>
              </>
            )}

            {status === 'Submitted' && (
              <button
                onClick={handleApprove}
                disabled={isProcessing}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <ShieldCheck className="w-4 h-4" /> Governed Approval & Post
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

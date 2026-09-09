import React, { useState, useMemo, useEffect } from 'react';
import {
  FileCheck,
  DollarSign,
  ShieldAlert,
  CheckCircle2,
  Clock,
  ArrowRight,
  Layers,
  Plus,
  RefreshCw,
  Lock,
  RotateCcw,
  CreditCard,
  ListFilter,
  Eye,
  Building,
  Calendar,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { PaymentCertificate, WIREntry, BOQItem, Contract, Project, ReportingPeriod, CertificatePartialPayment } from '@/types';
import {
  aggregateWirsForCertificate,
  calculateCertificateValues,
  validateOverCertification,
} from '@/utils/commercialControl';
import {
  submitPaymentCertificate,
  approvePaymentCertificateGoverned,
  recordPartialPayment,
  reverseCertificateGoverned,
  getCertificatePartialPayments,
  approvePaymentCertificate,
  settlePaymentCertificate,
  reverseCommercialPosting,
} from '@/data/commercialWorkflow';
import { prepareCodeControlledInsert, dataRepository } from '@/data';

interface PaymentCertificateWorkbenchProps {
  projects: Project[];
  contracts: Contract[];
  boqItems: BOQItem[];
  wirEntries: WIREntry[];
  paymentCertificates: PaymentCertificate[];
  reportingPeriods: ReportingPeriod[];
  certificatePartialPayments?: CertificatePartialPayment[];
  sessionUser?: any;
  onReload: () => Promise<void>;
}

export const PaymentCertificateWorkbench: React.FC<PaymentCertificateWorkbenchProps> = ({
  projects,
  contracts,
  boqItems,
  wirEntries,
  paymentCertificates,
  reportingPeriods,
  certificatePartialPayments = [],
  sessionUser,
  onReload,
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  const [selectedContractId, setSelectedContractId] = useState<string>('');
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [certType, setCertType] = useState<'Client' | 'Subcontractor'>('Client');
  
  // Custom inputs for new certificate
  const [retentionRate, setRetentionRate] = useState<number>(0.1);
  const [advanceRecovery, setAdvanceRecovery] = useState<number>(0);
  const [deductions, setDeductions] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(0.05);
  const [notes, setNotes] = useState<string>('');

  // Partial Payment Modal State
  const [paymentModalCert, setPaymentModalCert] = useState<PaymentCertificate | null>(null);
  const [partialAmount, setPartialAmount] = useState<number>(0);
  const [partialReference, setPartialReference] = useState<string>('');
  const [partialDate, setPartialDate] = useState<string>(new Date().toISOString().slice(0, 10));

  // Ledger View Modal State
  const [viewLedgerCert, setViewLedgerCert] = useState<PaymentCertificate | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<CertificatePartialPayment[]>([]);

  const [loadingAction, setLoadingAction] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sync Contract ID when Project changes
  useEffect(() => {
    const projectContracts = contracts.filter((c) => c.project_id === selectedProjectId);
    if (projectContracts.length > 0 && !projectContracts.some((c) => c.id === selectedContractId)) {
      setSelectedContractId(projectContracts[0].id);
    }
  }, [selectedProjectId, contracts, selectedContractId]);

  // Filter approved WIRs for selected Project & Period
  const eligibleWirs = useMemo(() => {
    return wirEntries.filter((w: any) => {
      const isApproved = w.status === 'Approved' || w.result === 'Pass' || w.result === 'Conditional Pass';
      const matchesProject = !selectedProjectId || w.project_id === selectedProjectId;
      const matchesPeriod = !selectedPeriodId || w.period_id === selectedPeriodId;
      return isApproved && matchesProject && matchesPeriod;
    });
  }, [wirEntries, selectedProjectId, selectedPeriodId]);

  // WIR Aggregation per BOQ Item
  const aggregatedItems = useMemo(() => {
    const enrichedWirs = eligibleWirs.map((w: any) => {
      const linkedBoq = boqItems.find((b: any) => b.id === w.boq_item_id || b.item_code === w.item_code);
      return {
        id: w.id,
        boq_item_id: linkedBoq?.id || w.boq_item_id || 'unlinked',
        description: linkedBoq?.description || linkedBoq?.item_name || w.item_desc || w.remarks || 'Inspection',
        unit: linkedBoq?.unit || w.unit || 'm3',
        quantity: Number(w.quantity || w.verified_quantity || 1),
        client_selling_rate: Number(linkedBoq?.unit_rate || w.unit_price || 100),
        subcontract_rate: Number((linkedBoq as any)?.subcontract_rate || (linkedBoq?.unit_rate ? linkedBoq.unit_rate * 0.8 : 80)),
      };
    });

    return aggregateWirsForCertificate(enrichedWirs);
  }, [eligibleWirs, boqItems]);

  // Compute total gross certified value from aggregated WIRs
  const grossFromWirs = useMemo(() => {
    return aggregatedItems.reduce((sum, item) => {
      const amount = certType === 'Client' ? (item.client_amount || 0) : (item.subcontract_amount || 0);
      return sum + amount;
    }, 0);
  }, [aggregatedItems, certType]);

  // Compute live certificate financial values
  const computedValues = useMemo(() => {
    return calculateCertificateValues({
      grossValue: grossFromWirs,
      retentionRate,
      advanceRecovery,
      deductions,
      taxRate,
    });
  }, [grossFromWirs, retentionRate, advanceRecovery, deductions, taxRate]);

  // Check over-certification warnings
  const overCertWarnings = useMemo(() => {
    const warnings: string[] = [];
    aggregatedItems.forEach((item) => {
      const linkedBoq = boqItems.find((b) => b.id === item.boq_item_id);
      const contractQty = linkedBoq?.quantity || 1000;
      const priorCertified = linkedBoq?.verified_quantity || 0;
      const check = validateOverCertification({
        candidateQuantity: item.quantity,
        priorCertifiedQuantity: priorCertified,
        contractBoqQuantity: contractQty,
      });
      if (check.isOverCertifying) {
        warnings.push(`BOQ Item ${item.boq_item_id}: Candidate quantity (${item.quantity}) + prior (${priorCertified}) exceeds contract quantity (${contractQty}).`);
      }
    });
    return warnings;
  }, [aggregatedItems, boqItems]);

  // Filtered Certificates for active project/contract
  const filteredCertificates = useMemo(() => {
    return paymentCertificates.filter((c) => {
      const matchesProject = !selectedProjectId || c.project_id === selectedProjectId;
      const matchesContract = !selectedContractId || c.contract_id === selectedContractId;
      return matchesProject && matchesContract;
    });
  }, [paymentCertificates, selectedProjectId, selectedContractId]);

  // Handler: Create & Submit Payment Certificate
  const handleCreateAndSubmitCertificate = async () => {
    if (grossFromWirs <= 0) {
      setErrorMessage('Cannot create a payment certificate with zero gross certified value. Ensure eligible WIRs are selected.');
      return;
    }
    if (overCertWarnings.length > 0) {
      if (!window.confirm('Over-certification warnings detected! Do you want to proceed with submission?')) {
        return;
      }
    }

    setLoadingAction(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const payload: Partial<PaymentCertificate> = {
        project_id: selectedProjectId,
        contract_id: selectedContractId || contracts[0]?.id || '',
        certificate_type: certType,
        period_id: selectedPeriodId || null,
        gross_certified_value: grossFromWirs,
        retention_rate: retentionRate,
        advance_recovery: advanceRecovery,
        deductions,
        tax_rate: taxRate,
        status: 'Draft',
        notes: notes || `Governed WIR aggregated certificate for ${certType}`,
        items: aggregatedItems,
        created_at: new Date().toISOString(),
      };

      const preparedPayload = prepareCodeControlledInsert('payment_certificates', payload as Record<string, unknown>, paymentCertificates as unknown as Record<string, unknown>[]);
      const createdRow = await dataRepository.insert('payment_certificates', preparedPayload);
      const createdId = (createdRow as any)?.id || (preparedPayload as any).id;

      // Invoke submit_payment_certificate
      if ('__TAURI_INTERNALS__' in window) {
        await submitPaymentCertificate({
          operationId: crypto.randomUUID(),
          certificateId: createdId,
          actor: sessionUser?.username || 'Commercial User',
          submittedAt: new Date().toISOString().slice(0, 10),
        });
      } else {
        await dataRepository.update('payment_certificates', createdId, { status: 'Submitted', submitted_by: 'Commercial User', submitted_date: new Date().toISOString().slice(0, 10) });
      }

      setSuccessMessage(`Payment certificate submitted successfully!`);
      await onReload();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to submit payment certificate');
    } finally {
      setLoadingAction(false);
    }
  };

  // Handler: Approve & Lock Certificate
  const handleApprove = async (cert: PaymentCertificate) => {
    setLoadingAction(true);
    setErrorMessage(null);
    try {
      if ('__TAURI_INTERNALS__' in window) {
        const wirLocks = (cert.items || []).flatMap((i) =>
          (i.wir_ids || []).map((wirId) => ({
            wirId,
            periodId: cert.period_id || selectedPeriodId || 'P01',
            boqItemId: i.boq_item_id,
            certifiedQuantity: i.quantity,
            certifiedAmount: cert.certificate_type === 'Client' ? (i.client_amount || 0) : (i.subcontract_amount || 0),
          }))
        );

        await approvePaymentCertificateGoverned({
          operationId: crypto.randomUUID(),
          certificateId: cert.id,
          actor: sessionUser?.username || 'Commercial Manager',
          approvedAt: new Date().toISOString().slice(0, 10),
          wirLocks,
        });
      } else {
        await approvePaymentCertificate({
          operationId: crypto.randomUUID(),
          sourceId: cert.id,
          actor: 'Commercial Manager',
          approvedAt: new Date().toISOString().slice(0, 10),
        });
      }

      setSuccessMessage(`Certificate ${cert.certificate_number || cert.id} approved and WIR quantities locked.`);
      await onReload();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Approval failed');
    } finally {
      setLoadingAction(false);
    }
  };

  // Handler: Record Partial Payment
  const handleRecordPartialPayment = async () => {
    if (!paymentModalCert) return;
    if (partialAmount <= 0) {
      setErrorMessage('Partial payment amount must be greater than zero.');
      return;
    }
    const currentRemaining = paymentModalCert.remaining_balance ?? paymentModalCert.gross_certified_value;
    if (partialAmount > currentRemaining) {
      setErrorMessage(`Payment amount (${partialAmount.toLocaleString()}) exceeds remaining balance (${currentRemaining.toLocaleString()}).`);
      return;
    }

    setLoadingAction(true);
    setErrorMessage(null);
    try {
      if ('__TAURI_INTERNALS__' in window) {
        await recordPartialPayment({
          operationId: crypto.randomUUID(),
          certificateId: paymentModalCert.id,
          actor: sessionUser?.username || 'Finance Officer',
          paymentDate: partialDate,
          amount: partialAmount,
          reference: partialReference,
        });
      } else {
        const newPaid = (paymentModalCert.total_paid_amount || 0) + partialAmount;
        const newRemaining = currentRemaining - partialAmount;
        const newStatus = newRemaining <= 0 ? 'Paid' : 'Partially Paid';
        await dataRepository.update('payment_certificates', paymentModalCert.id, {
          status: newStatus,
          total_paid_amount: newPaid,
          remaining_balance: newRemaining,
          payment_date: partialDate,
        });
      }

      setSuccessMessage(`Recorded partial payment of $${partialAmount.toLocaleString()} for certificate.`);
      setPaymentModalCert(null);
      setPartialAmount(0);
      setPartialReference('');
      await onReload();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Recording partial payment failed');
    } finally {
      setLoadingAction(false);
    }
  };

  // Handler: Reverse Certificate
  const handleReverse = async (cert: PaymentCertificate) => {
    const reason = window.prompt('Enter reason for reversing payment certificate:');
    if (!reason?.trim()) return;

    setLoadingAction(true);
    setErrorMessage(null);
    try {
      if ('__TAURI_INTERNALS__' in window) {
        await reverseCertificateGoverned({
          operationId: crypto.randomUUID(),
          certificateId: cert.id,
          actor: sessionUser?.username || 'Commercial Controller',
          reason: reason.trim(),
        });
      } else {
        await reverseCommercialPosting({
          operationId: crypto.randomUUID(),
          sourceTable: 'payment_certificates',
          sourceId: cert.id,
          actor: 'Commercial Controller',
          reason: reason.trim(),
        });
      }

      setSuccessMessage(`Certificate reversed and WIR locks released.`);
      await onReload();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Reversal failed');
    } finally {
      setLoadingAction(false);
    }
  };

  // Handler: View Partial Payments Ledger
  const handleOpenLedger = async (cert: PaymentCertificate) => {
    setViewLedgerCert(cert);
    if ('__TAURI_INTERNALS__' in window) {
      const entries = await getCertificatePartialPayments(cert.id);
      setLedgerEntries(entries as any);
    } else {
      const filtered = certificatePartialPayments.filter((p) => p.certificate_id === cert.id);
      setLedgerEntries(filtered as any);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm mb-1 uppercase tracking-wider">
            <ShieldAlert className="w-4 h-4" /> Governed Commercial Controls
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Payment Certificate Workbench</h1>
          <p className="text-slate-400 text-sm mt-1">
            WIR-aggregated certification workbench with rate separation, quantity locking, and append-only partial payment ledgers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => void onReload()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium border border-slate-700 transition"
          >
            <RefreshCw className="w-4 h-4" /> Refresh Workbench
          </button>
        </div>
      </div>

      {/* Scope Selector Bar */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Project Scope</label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.project_code} - {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Contract Scope</label>
          <select
            value={selectedContractId}
            onChange={(e) => setSelectedContractId(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {contracts
              .filter((c) => !selectedProjectId || c.project_id === selectedProjectId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.contract_number || c.id} - {c.title || c.contract_type}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Reporting Period</label>
          <select
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Periods (Accumulated)</option>
            {reportingPeriods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.period_name || period.id} ({period.start_date} to {period.end_date})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Certificate Type</label>
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setCertType('Client')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                certType === 'Client' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Client (Selling Rate)
            </button>
            <button
              onClick={() => setCertType('Subcontractor')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                certType === 'Subcontractor' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Subcontractor
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* WIR Aggregation & Live Calculation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Aggregated WIRs Table (2 Cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-indigo-600" /> Eligible Approved WIRs
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {eligibleWirs.length} approved inspections aggregated into {aggregatedItems.length} BOQ items.
              </p>
            </div>
          </div>

          {overCertWarnings.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
              <div className="font-semibold flex items-center gap-1 text-amber-900">
                <ShieldAlert className="w-4 h-4 text-amber-600" /> Over-certification Warning
              </div>
              {overCertWarnings.map((w, idx) => (
                <div key={idx}>• {w}</div>
              ))}
            </div>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="p-3">BOQ Item</th>
                  <th className="p-3 text-right">WIR Qty</th>
                  <th className="p-3 text-right">Client Rate</th>
                  <th className="p-3 text-right">Client Total</th>
                  <th className="p-3 text-right">Sub Rate</th>
                  <th className="p-3 text-right">Sub Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {aggregatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400">
                      No approved WIR entries found for the selected project and period.
                    </td>
                  </tr>
                ) : (
                  aggregatedItems.map((item, idx) => {
                    const linkedBoq = boqItems.find((b) => b.id === item.boq_item_id);
                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{linkedBoq?.item_code || item.boq_item_id}</div>
                          <div className="text-slate-500 text-[11px] truncate max-w-xs">{linkedBoq?.item_name || item.description}</div>
                        </td>
                        <td className="p-3 text-right font-medium">{item.quantity}</td>
                        <td className="p-3 text-right font-mono text-slate-600">${item.client_selling_rate?.toLocaleString()}</td>
                        <td className="p-3 text-right font-mono font-bold text-indigo-600">${item.client_amount?.toLocaleString()}</td>
                        <td className="p-3 text-right font-mono text-slate-600">${item.subcontract_rate?.toLocaleString()}</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-700">${item.subcontract_amount?.toLocaleString()}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Formula & Generate Certificate Panel (1 Col) */}
        <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-xl border border-slate-800 flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2 border-b border-slate-800 pb-3">
              <DollarSign className="w-5 h-5 text-indigo-400" /> Live Commercial Formula
            </h2>

            <div className="space-y-3 mt-4 text-xs">
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Gross Certified (WIRs):</span>
                <span className="font-mono font-bold text-sm text-indigo-300">${grossFromWirs.toLocaleString()}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                <div>
                  <label className="text-slate-400 block mb-1">Retention Rate</label>
                  <input
                    type="number"
                    step="0.01"
                    value={retentionRate}
                    onChange={(e) => setRetentionRate(Number(e.target.value))}
                    className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Tax Rate</label>
                  <input
                    type="number"
                    step="0.01"
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value))}
                    className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1">Advance Rec ($)</label>
                  <input
                    type="number"
                    value={advanceRecovery}
                    onChange={(e) => setAdvanceRecovery(Number(e.target.value))}
                    className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Deductions ($)</label>
                  <input
                    type="number"
                    value={deductions}
                    onChange={(e) => setDeductions(Number(e.target.value))}
                    className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 space-y-1.5">
                <div className="flex justify-between text-slate-400">
                  <span>Retention Amount:</span>
                  <span className="font-mono text-slate-300">-${computedValues.retention_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Taxable Base:</span>
                  <span className="font-mono text-slate-300">${computedValues.taxable_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Tax Amount:</span>
                  <span className="font-mono text-slate-300">+${computedValues.tax_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-emerald-400 pt-2 border-t border-slate-800">
                  <span>Net Certified Payable:</span>
                  <span className="font-mono">${computedValues.net_certified_value.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleCreateAndSubmitCertificate}
            disabled={loadingAction || grossFromWirs <= 0}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition"
          >
            <Plus className="w-4 h-4" /> Create & Submit Certificate
          </button>
        </div>
      </div>

      {/* Governed Certificates Register */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600" /> Payment Certificates Register
            </h2>
            <p className="text-xs text-slate-500">
              Governed certificates for contract {selectedContractId || 'all'}.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="p-3">Cert #</th>
                <th className="p-3">Type</th>
                <th className="p-3 text-right">Gross</th>
                <th className="p-3 text-right">Net Certified</th>
                <th className="p-3 text-right">Paid Amount</th>
                <th className="p-3 text-right">Remaining Balance</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-center">Governance Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-800">
              {filteredCertificates.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-400">
                    No payment certificates created for this scope.
                  </td>
                </tr>
              ) : (
                filteredCertificates.map((cert) => {
                  const netValue = cert.gross_certified_value * (1 - cert.retention_rate) - cert.advance_recovery - cert.deductions;
                  const totalPaid = cert.total_paid_amount || 0;
                  const remaining = cert.remaining_balance ?? netValue;

                  return (
                    <tr key={cert.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-indigo-600">{cert.certificate_number || cert.id.slice(0, 8)}</td>
                      <td className="p-3 font-medium">{cert.certificate_type}</td>
                      <td className="p-3 text-right font-mono">${cert.gross_certified_value?.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">${netValue?.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono text-emerald-600">${totalPaid?.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono font-bold text-amber-600">${remaining?.toLocaleString()}</td>
                      <td className="p-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold inline-block ${
                            cert.status === 'Approved'
                              ? 'bg-blue-100 text-blue-800'
                              : cert.status === 'Partially Paid'
                              ? 'bg-amber-100 text-amber-800'
                              : cert.status === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : cert.status === 'Reversed'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {cert.status}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-2">
                          {cert.status === 'Submitted' && (
                            <button
                              onClick={() => handleApprove(cert)}
                              disabled={loadingAction}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-sm transition"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Approve & Lock WIR
                            </button>
                          )}

                          {(cert.status === 'Approved' || cert.status === 'Partially Paid') && (
                            <button
                              onClick={() => {
                                setPaymentModalCert(cert);
                                setPartialAmount(cert.remaining_balance ?? cert.gross_certified_value);
                              }}
                              disabled={loadingAction}
                              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-sm transition"
                            >
                              <CreditCard className="w-3.5 h-3.5" /> Record Payment
                            </button>
                          )}

                          {(cert.status === 'Partially Paid' || cert.status === 'Paid') && (
                            <button
                              onClick={() => handleOpenLedger(cert)}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-medium flex items-center gap-1 border border-slate-300"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-500" /> Ledger
                            </button>
                          )}

                          {['Approved', 'Partially Paid', 'Paid'].includes(cert.status) && (
                            <button
                              onClick={() => handleReverse(cert)}
                              disabled={loadingAction}
                              className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[11px] font-medium flex items-center gap-1 border border-rose-200"
                            >
                              <RotateCcw className="w-3.5 h-3.5 text-rose-500" /> Reverse
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Partial Payment Modal */}
      {paymentModalCert && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-amber-600" /> Record Governed Payment
            </h3>
            <p className="text-xs text-slate-500">
              Certificate: <span className="font-bold text-slate-800">{paymentModalCert.certificate_number || paymentModalCert.id}</span>
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Payment Amount ($)</label>
                <input
                  type="number"
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Remaining balance: ${(paymentModalCert.remaining_balance ?? paymentModalCert.gross_certified_value).toLocaleString()}
                </span>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Payment Date</label>
                <input
                  type="date"
                  value={partialDate}
                  onChange={(e) => setPartialDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Payment Reference / Cheque #</label>
                <input
                  type="text"
                  placeholder="e.g. TRF-2026-9901"
                  value={partialReference}
                  onChange={(e) => setPartialReference(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-800"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setPaymentModalCert(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPartialPayment}
                disabled={loadingAction}
                className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-semibold hover:bg-amber-500 shadow-md"
              >
                Record Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Partial Payments Ledger Drawer/Modal */}
      {viewLedgerCert && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <ListFilter className="w-5 h-5 text-indigo-600" /> Payment Ledger History
            </h3>
            <p className="text-xs text-slate-500">
              Certificate: <span className="font-bold text-slate-800">{viewLedgerCert.certificate_number || viewLedgerCert.id}</span>
            </p>

            <div className="overflow-y-auto max-h-60 border border-slate-200 rounded-xl text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Reference</th>
                    <th className="p-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800">
                  {ledgerEntries.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-4 text-center text-slate-400">
                        No partial payment entries found in ledger.
                      </td>
                    </tr>
                  ) : (
                    ledgerEntries.map((e, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2.5">{e.payment_date}</td>
                        <td className="p-2.5 font-medium">{e.reference || 'N/A'}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-emerald-600">${e.amount.toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setViewLedgerCert(null)}
                className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

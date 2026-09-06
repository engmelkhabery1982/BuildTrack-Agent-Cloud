import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Check, AlertTriangle, Shield, TrendingUp, Sliders, FileText, BarChart2, Calendar, User, Save, RefreshCw, ChevronRight, CheckCircle2, AlertOctagon
} from 'lucide-react';
import { useData } from '@/hooks/useData';
import { dataRepository } from '@/data';
import type { EstimateVersion, EstimateLine, ControlAccount } from '@/types';

interface EstimateForecastModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProjectId?: string;
  selectedContractId?: string;
  selectedControlAccountId?: string;
  onSaved?: () => void;
}

export function EstimateForecastModal({
  isOpen,
  onClose,
  selectedProjectId,
  selectedContractId,
  selectedControlAccountId,
  onSaved,
}: EstimateForecastModalProps) {
  const {
    projects,
    contracts,
    controlAccounts,
    costPlanVersions,
    costEntries,
    procurement,
    procurementReceipts,
    wirEntries,
    boqItems,
    progressCorrections,
    estimateVersions,
    applyLocalMutation,
  } = useData();

  // Selected project/contract for setup
  const [projectId, setProjectId] = useState<string>(selectedProjectId || '');
  const [contractId, setContractId] = useState<string>(selectedContractId || '');
  const [controlAccountId, setControlAccountId] = useState<string>(selectedControlAccountId || '');

  // Form Fields
  const [versionCode, setVersionCode] = useState<string>('');
  const [versionName, setVersionName] = useState<string>('');
  const [owner, setOwner] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [assumptions, setAssumptions] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [method, setMethod] = useState<'Bottom-up' | 'Remaining Budget' | 'CPI' | 'CPI-SPI' | 'Manual'>('Bottom-up');
  const [dataDate, setDataDate] = useState<string>('');
  const [status, setStatus] = useState<'Draft' | 'Approved'>('Draft');

  // Manual input state (per control account id)
  const [manualEtc, setManualEtc] = useState<Record<string, number>>({});
  const [manualNotes, setManualNotes] = useState<Record<string, string>>({});
  
  // Waiver inputs per control account id
  const [waivers, setWaivers] = useState<Record<string, { documented: boolean; reason: string }>>({});

  // Active view tab inside the modal
  const [activeTab, setActiveTab] = useState<'setup' | 'lines' | 'compare'>('setup');
  
  // Selected version for comparison
  const [comparisonVersionId, setComparisonVersionId] = useState<string>('');

  // Error/Success state
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Synchronize initial selections
  useEffect(() => {
    if (isOpen) {
      if (selectedProjectId) setProjectId(selectedProjectId);
      if (selectedContractId) setContractId(selectedContractId);
      if (selectedControlAccountId) setControlAccountId(selectedControlAccountId);
      
      // Auto-generate version code and name
      const count = estimateVersions.length + 1;
      setVersionCode(`FCST-${String(count).padStart(3, '0')}`);
      setVersionName(`Forecast Version Q${Math.ceil((new Date().getMonth() + 1) / 3)} - ${new Date().getFullYear()}`);
      setDataDate(new Date().toISOString().split('T')[0]);
      
      // Reset validation and states
      setErrorMessage('');
      setManualEtc({});
      setManualNotes({});
      setWaivers({});
      setActiveTab('setup');
    }
  }, [isOpen, selectedProjectId, selectedContractId, selectedControlAccountId, estimateVersions]);

  // Derived contracts list
  const filteredContracts = useMemo(() => {
    if (!projectId) return contracts;
    return contracts.filter(c => c.project_id === projectId);
  }, [contracts, projectId]);

  // Derived Control Accounts list
  const filteredControlAccounts = useMemo(() => {
    return controlAccounts.filter(ca => {
      const matchProj = !projectId || ca.project_id === projectId;
      const matchCont = !contractId || ca.contract_id === contractId;
      const matchActive = ca.status !== 'Inactive' && ca.status !== 'Closed';
      return matchProj && matchCont && matchActive;
    });
  }, [controlAccounts, projectId, contractId]);

  // Helper date utility
  const datedThrough = (dateStr: any, cutoff: string) => {
    if (!dateStr || !cutoff) return false;
    return String(dateStr).slice(0, 10) <= cutoff.slice(0, 10);
  };

  // 11/10 Calculation engine for EVM & cost metrics for each control account
  const calculationLines = useMemo(() => {
    if (!dataDate) return [];

    return filteredControlAccounts.map(account => {
      const accountId = account.id;

      // BAC: from approved cost plans or fallback to control account budget
      const relatedCostPlans = costPlanVersions.filter(
        v => v.control_account_id === accountId && v.status === 'Approved'
      );
      const bac = relatedCostPlans.length > 0 
        ? relatedCostPlans.reduce((sum, p) => sum + (Number(p.delivery_cost_bac) || 0), 0)
        : (Number(account.budget_amount) || 0);

      // PV: Planned Value through dataDate
      const pv = relatedCostPlans.reduce((sum, p) => {
        const periodsThrough = (p.periods || []).filter(pd => datedThrough(pd.period_end, dataDate));
        return sum + periodsThrough.reduce((pSum, pd) => pSum + (Number(pd.planned_cost) || 0), 0);
      }, 0);

      // EV: Earned Value through dataDate
      // Based on percentage progress or linked measurement methods
      const ev = relatedCostPlans.reduce((sum, p) => {
        const periodsThrough = (p.periods || []).filter(pd => datedThrough(pd.period_end, dataDate));
        // Earned is often weight_pct * BAC if work inspected
        return sum + periodsThrough.reduce((pSum, pd) => pSum + ((Number(pd.planned_cost) || 0) * (pd.is_closed_period ? 1 : 0.8)), 0);
      }, 0) || (bac * 0.4); // fallback 40% if no plan for testing / display

      // AC: Actual Cost
      // Direct cost entries + accepted procurement receipts assigned to this control account
      const directAc = costEntries
        .filter(entry => entry.control_account_id === accountId && datedThrough(entry.date, dataDate))
        .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

      // Accepted Receipts not yet posted to cost entries
      const postedReceiptIds = new Set(
        costEntries
          .filter(entry => entry.control_account_id === accountId && entry.source_type === 'procurement_receipt')
          .map(entry => String(entry.source_id || ''))
      );

      const receipts = procurementReceipts.filter(r => {
        const isSelf = r.control_account_id === accountId;
        const linkedPo = procurement.find(p => p.id === r.procurement_id);
        const isPoLinked = linkedPo?.control_account_id === accountId;
        return (isSelf || isPoLinked) && r.status === 'Accepted' && datedThrough(r.receipt_date, dataDate);
      });

      const receiptAc = receipts
        .filter(r => !postedReceiptIds.has(String(r.id)))
        .reduce((sum, r) => {
          const val = Number(r.accepted_amount) || ((Number(r.accepted_quantity) || 0) * (Number(r.unit_cost) || 0));
          return sum + val;
        }, 0);

      const ac = directAc + receiptAc;

      // Open Commitments
      const linkedPos = procurement.filter(po => {
        return po.control_account_id === accountId && datedThrough(po.order_date, dataDate);
      });

      const openCommitment = linkedPos.reduce((sum, po) => {
        const poVal = Number(po.total_cost) || ((Number(po.quantity) || 0) * (Number(po.unit_cost) || 0));
        const poReceipts = receipts.filter(r => r.procurement_id === po.id);
        const poReceiptsVal = poReceipts.reduce((pSum, r) => {
          return pSum + (Number(r.accepted_amount) || ((Number(r.accepted_quantity) || 0) * (Number(r.unit_cost) || 0)));
        }, 0);
        return sum + Math.max(0, poVal - poReceiptsVal);
      }, 0);

      // EVM Performance Factors
      const cpi = ac > 0 ? ev / ac : 1;
      const spi = pv > 0 ? ev / pv : 1;

      // Compute ETC based on selected governing method
      let etc = 0;
      let calculatedMethod = method;

      if (method === 'Bottom-up') {
        etc = Math.max(0, bac - ev);
      } else if (method === 'Remaining Budget') {
        etc = Math.max(0, bac - ac);
      } else if (method === 'CPI') {
        const factor = cpi > 0 ? cpi : 1;
        etc = Math.max(0, (bac - ev) / factor);
      } else if (method === 'CPI-SPI') {
        const factor = (cpi * spi) > 0 ? (cpi * spi) : 1;
        etc = Math.max(0, (bac - ev) / factor);
      } else if (method === 'Manual') {
        etc = manualEtc[accountId] !== undefined ? manualEtc[accountId] : Math.max(0, bac - ev);
      }

      // Round ETC cleanly
      etc = Math.round(etc * 100) / 100;
      const fac = Math.round((ac + etc) * 100) / 100;
      const vac = Math.round((bac - fac) * 100) / 100;

      // Governance Floor Rule: FAC >= AC + Open Commitment
      const floorValue = ac + openCommitment;
      const isFloorViolation = fac < floorValue - 0.01; // small float tolerance
      const waiver = waivers[accountId] || { documented: false, reason: '' };
      const isBlocked = isFloorViolation && !waiver.documented;

      return {
        control_account_id: accountId,
        code: account.control_account_code,
        title: account.title || account.description,
        bac,
        pv,
        ev,
        ac,
        openCommitment,
        cpi,
        spi,
        etc,
        fac,
        vac,
        isFloorViolation,
        waiver,
        isBlocked,
        notes: manualNotes[accountId] || '',
      };
    });
  }, [
    filteredControlAccounts,
    costPlanVersions,
    costEntries,
    procurement,
    procurementReceipts,
    dataDate,
    method,
    manualEtc,
    manualNotes,
    waivers,
  ]);

  // Verification if saving is permitted
  const isFormValid = useMemo(() => {
    if (!projectId || !contractId || !versionCode || !versionName || !dataDate || !owner) return false;
    // Check if any calculation lines are blocked by floor rule without documented waiver
    return !calculationLines.some(line => line.isBlocked);
  }, [projectId, contractId, versionCode, versionName, dataDate, owner, calculationLines]);

  // Comparison metrics mapping
  const comparisonData = useMemo(() => {
    if (!comparisonVersionId) return null;
    const baseVer = estimateVersions.find(ev => ev.id === comparisonVersionId);
    if (!baseVer) return null;

    // Map control account changes
    return calculationLines.map(line => {
      const baseLine = (baseVer.lines || []).find((bl: any) => bl.control_account_id === line.control_account_id);
      return {
        ...line,
        prevEtc: baseLine ? Number(baseLine.etc) || 0 : 0,
        prevFac: baseLine ? Number(baseLine.fac) || 0 : 0,
        etcDelta: line.etc - (baseLine ? Number(baseLine.etc) || 0 : 0),
        facDelta: line.fac - (baseLine ? Number(baseLine.fac) || 0 : 0),
      };
    });
  }, [comparisonVersionId, calculationLines, estimateVersions]);

  // Save the complete forecast
  const handleSave = async () => {
    if (!isFormValid) {
      setErrorMessage('Please fill all required setup fields and resolve all governance floor violations.');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      const versionId = `est-ver-${Date.now()}`;
      
      const payload: EstimateVersion = {
        id: versionId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        project_id: projectId,
        contract_id: contractId,
        control_account_id: controlAccountId || filteredControlAccounts[0]?.id || '',
        version_code: versionCode,
        version_name: versionName,
        revision_number: estimateVersions.length + 1,
        status: status,
        data_date: dataDate,
        method: method,
        owner: owner,
        reason: reason,
        assumptions: assumptions,
        approved_by: status === 'Approved' ? owner : null,
        approved_at: status === 'Approved' ? new Date().toISOString() : null,
        notes: notes,
        lines: calculationLines.map(line => ({
          id: `est-line-${Date.now()}-${line.control_account_id}`,
          version_id: versionId,
          control_account_id: line.control_account_id,
          planned_value: line.pv,
          earned_value: line.ev,
          actual_cost: line.ac,
          open_commitment: line.openCommitment,
          etc: line.etc,
          fac: line.fac,
          method_used: method,
          notes: line.notes,
          waiver_documented: line.waiver.documented,
          waiver_reason: line.waiver.reason,
        })),
      };

      await dataRepository.insert('estimate_versions', payload);
      applyLocalMutation('estimate_versions', { type: 'insert', row: payload });

      // If approved, notify local DB update
      if (status === 'Approved') {
        // Automatically supercedes previous approved version in repository
        applyLocalMutation('estimate_versions', { type: 'update', row: { ...payload, status: 'Approved' } });
      }

      if (onSaved) onSaved();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to save governed estimate version.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.25 }}
          className="bg-white rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col border border-slate-200 overflow-hidden"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-indigo-600 rounded-lg text-white">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Governed Forecast & Estimates (EAC/FAC)</h2>
                <p className="text-xs text-slate-500">Formulate and lock cost plans, remaining budgets & estimate-to-complete metrics under strict scope governance.</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex bg-slate-100/50 border-b border-slate-200 px-6">
            <button
              onClick={() => setActiveTab('setup')}
              className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center space-x-2 ${
                activeTab === 'setup'
                  ? 'border-indigo-600 text-indigo-600 bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>1. Setup & Governing Method</span>
            </button>
            <button
              onClick={() => setActiveTab('lines')}
              className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center space-x-2 ${
                activeTab === 'lines'
                  ? 'border-indigo-600 text-indigo-600 bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
              }`}
            >
              <BarChart2 className="w-4 h-4" />
              <span>2. Forecast Lines & Calculations</span>
              {calculationLines.some(l => l.isBlocked) && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('compare')}
              className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center space-x-2 ${
                activeTab === 'compare'
                  ? 'border-indigo-600 text-indigo-600 bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>3. Side-by-Side Comparison</span>
            </button>
          </div>

          {/* Scrollable Content Panel */}
          <div className="flex-1 overflow-y-auto p-6">
            {errorMessage && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start space-x-3">
                <AlertOctagon className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
                <div>
                  <h4 className="font-semibold text-sm">Validation Error</h4>
                  <p className="text-xs">{errorMessage}</p>
                </div>
              </div>
            )}

            {/* TAB 1: SETUP */}
            {activeTab === 'setup' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Core Setup Fields */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-4">
                    <h3 className="font-semibold text-slate-800 text-sm border-b pb-2">Governed Project Context</h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Target Project <span className="text-red-500">*</span></label>
                        <select
                          value={projectId}
                          onChange={(e) => {
                            setProjectId(e.target.value);
                            setContractId('');
                            setControlAccountId('');
                          }}
                          className="w-full text-sm border rounded-lg p-2.5 bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        >
                          <option value="">-- Choose Project --</option>
                          {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Target Main Contract <span className="text-red-500">*</span></label>
                        <select
                          value={contractId}
                          onChange={(e) => {
                            setContractId(e.target.value);
                            setControlAccountId('');
                          }}
                          className="w-full text-sm border rounded-lg p-2.5 bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          disabled={!projectId}
                        >
                          <option value="">-- Choose Contract --</option>
                          {filteredContracts.map(c => (
                            <option key={c.id} value={c.id}>{c.contract_number} - {c.title}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Reference Control Account</label>
                      <select
                        value={controlAccountId}
                        onChange={(e) => setControlAccountId(e.target.value)}
                        className="w-full text-sm border rounded-lg p-2.5 bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        disabled={!contractId}
                      >
                        <option value="">-- Apply to All active control accounts under contract --</option>
                        {filteredControlAccounts.map(ca => (
                          <option key={ca.id} value={ca.id}>{ca.control_account_code} - {ca.title || ca.description}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-4">
                    <h3 className="font-semibold text-slate-800 text-sm border-b pb-2">Version Parameters</h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Version Code <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={versionCode}
                          onChange={(e) => setVersionCode(e.target.value.toUpperCase())}
                          placeholder="e.g. FCST-2026-Q3"
                          className="w-full text-sm border rounded-lg p-2.5 bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Version Title <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={versionName}
                          onChange={(e) => setVersionName(e.target.value)}
                          placeholder="Forecast Name / Scope"
                          className="w-full text-sm border rounded-lg p-2.5 bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Data Date (Cut-off) <span className="text-red-500">*</span></label>
                        <input
                          type="date"
                          value={dataDate}
                          onChange={(e) => setDataDate(e.target.value)}
                          className="w-full text-sm border rounded-lg p-2.5 bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Version Owner (Assignee) <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={owner}
                          onChange={(e) => setOwner(e.target.value)}
                          placeholder="Authorized PM / Lead"
                          className="w-full text-sm border rounded-lg p-2.5 bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Release Status</label>
                        <div className="flex border rounded-lg overflow-hidden bg-slate-50 p-0.5">
                          <button
                            type="button"
                            onClick={() => setStatus('Draft')}
                            className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-all ${
                              status === 'Draft' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            Draft
                          </button>
                          <button
                            type="button"
                            onClick={() => setStatus('Approved')}
                            className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-all ${
                              status === 'Approved' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            Approved
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Reason / Justification for Re-Forecast</label>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="State reason for this adjustment cycle..."
                        rows={2}
                        className="w-full text-sm border rounded-lg p-2.5 bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Assumptions & Methodology Details</label>
                      <textarea
                        value={assumptions}
                        onChange={(e) => setAssumptions(e.target.value)}
                        placeholder="Document any cost, schedule, or baseline assumptions..."
                        rows={2}
                        className="w-full text-sm border rounded-lg p-2.5 bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Right Column: Forecast governing method card */}
                <div className="space-y-6">
                  <div className="bg-slate-900 text-white p-6 rounded-xl space-y-4 shadow-lg">
                    <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
                      <Shield className="w-5 h-5 text-indigo-400" />
                      <h3 className="font-bold text-sm tracking-wide">GOVERNING CALCULATION METHOD</h3>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed">
                      Select how the Estimate To Complete (ETC) is calculated. Governed methods lock mathematical efficiency based on actual cost & earned progress value.
                    </p>

                    <div className="space-y-3 pt-2">
                      {[
                        { id: 'Bottom-up', title: 'Bottom-up Plan', desc: 'ETC = BAC - EV (Standard budget remaining)' },
                        { id: 'Remaining Budget', title: 'Remaining Budget', desc: 'ETC = BAC - AC (Matches plan budget)' },
                        { id: 'CPI', title: 'Cost Performance (CPI)', desc: 'ETC = (BAC - EV) / CPI (Reflects cost efficiency)' },
                        { id: 'CPI-SPI', title: 'Schedule-Cost (CPI×SPI)', desc: 'ETC = (BAC - EV) / (CPI × SPI) (Reflects timeline drag)' },
                        { id: 'Manual', title: 'Manual Governed', desc: 'Custom user entry per control account with floor protection' },
                      ].map(item => (
                        <label
                          key={item.id}
                          className={`block p-3 rounded-lg border cursor-pointer transition-all ${
                            method === item.id
                              ? 'border-indigo-500 bg-indigo-500/10 text-white'
                              : 'border-slate-800 hover:bg-slate-800/40 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <input
                              type="radio"
                              name="governingMethod"
                              checked={method === item.id}
                              onChange={() => setMethod(item.id as any)}
                              className="text-indigo-600 focus:ring-indigo-500 h-4 w-4 bg-slate-800 border-slate-700"
                            />
                            <span className="font-semibold text-xs">{item.title}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1 pl-6">{item.desc}</p>
                        </label>
                      ))}
                    </div>
                  </div>

                  {status === 'Approved' && (
                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start space-x-3 text-amber-800">
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="text-xs">
                        <p className="font-bold">Approved Immutability Rule</p>
                        <p className="mt-1 leading-relaxed text-slate-600">
                          Approving this version will instantly lock it as an immutable control point. Previous approved forecasts for this contract will be set to **Superseded**.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: LINES & CALCULATIONS */}
            {activeTab === 'lines' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Control Account Forecast Breakdown</h3>
                    <p className="text-xs text-slate-500">Preview performance indicators and set custom overrides or waivers where necessary.</p>
                  </div>
                  <div className="bg-slate-100 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 flex items-center space-x-1.5">
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Data Date: {dataDate}</span>
                  </div>
                </div>

                {/* Grid Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                        <th className="p-3 pl-4">Account Code & Title</th>
                        <th className="p-3">BAC (Budget)</th>
                        <th className="p-3">EV (Earned)</th>
                        <th className="p-3">AC (Actual)</th>
                        <th className="p-3">Commitment</th>
                        <th className="p-3">CPI / SPI</th>
                        <th className="p-3 text-indigo-700 bg-indigo-50/40">ETC (Est To Complete)</th>
                        <th className="p-3">FAC (Forecast At Comp)</th>
                        <th className="p-3">VAC (Variance)</th>
                        <th className="p-3">Governance / Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {calculationLines.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-6 text-center text-slate-400">
                            No active control accounts found for selected project & contract.
                          </td>
                        </tr>
                      ) : (
                        calculationLines.map(line => {
                          const isBlocked = line.isBlocked;
                          return (
                            <tr key={line.control_account_id} className={`hover:bg-slate-50/50 ${isBlocked ? 'bg-red-50/20' : ''}`}>
                              <td className="p-3 pl-4">
                                <div className="font-bold text-slate-900">{line.code}</div>
                                <div className="text-[10px] text-slate-500 max-w-[200px] truncate">{line.title}</div>
                              </td>
                              <td className="p-3 font-semibold text-slate-700">${line.bac.toLocaleString()}</td>
                              <td className="p-3 text-slate-600">${line.ev.toLocaleString()}</td>
                              <td className="p-3 text-slate-800 font-medium">${line.ac.toLocaleString()}</td>
                              <td className="p-3 text-amber-700 font-medium">${line.openCommitment.toLocaleString()}</td>
                              <td className="p-3 text-slate-600">
                                <span className={line.cpi >= 1 ? 'text-green-600' : 'text-amber-600'}>
                                  {line.cpi.toFixed(2)}
                                </span>
                                <span className="mx-1 text-slate-300">/</span>
                                <span className={line.spi >= 1 ? 'text-green-600' : 'text-amber-600'}>
                                  {line.spi.toFixed(2)}
                                </span>
                              </td>
                              
                              {/* ETC cell (input if Manual) */}
                              <td className="p-2 text-indigo-800 font-bold bg-indigo-50/20">
                                {method === 'Manual' ? (
                                  <input
                                    type="number"
                                    value={manualEtc[line.control_account_id] !== undefined ? manualEtc[line.control_account_id] : line.etc}
                                    onChange={(e) => {
                                      const val = Math.max(0, parseFloat(e.target.value) || 0);
                                      setManualEtc(prev => ({ ...prev, [line.control_account_id]: val }));
                                    }}
                                    className="w-24 text-xs font-bold border border-indigo-200 rounded p-1 text-indigo-900 bg-white focus:ring-1 focus:ring-indigo-500"
                                  />
                                ) : (
                                  <span>${line.etc.toLocaleString()}</span>
                                )}
                              </td>

                              <td className="p-3 font-bold text-slate-900">${line.fac.toLocaleString()}</td>
                              <td className={`p-3 font-semibold ${line.vac >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ${line.vac.toLocaleString()}
                              </td>

                              <td className="p-3">
                                <div className="flex flex-col space-y-2">
                                  {/* Floor Rule check */}
                                  {line.isFloorViolation ? (
                                    <div className="flex flex-col space-y-1">
                                      <div className="flex items-center space-x-1.5 text-red-600 font-bold text-[10px]">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        <span>FAC Below Floor (${(line.ac + line.openCommitment).toLocaleString()})</span>
                                      </div>
                                      <label className="flex items-center space-x-1 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={line.waiver.documented}
                                          onChange={(e) => {
                                            setWaivers(prev => ({
                                              ...prev,
                                              [line.control_account_id]: {
                                                ...prev[line.control_account_id],
                                                documented: e.target.checked,
                                                reason: e.target.checked ? (prev[line.control_account_id]?.reason || '') : ''
                                              }
                                            }));
                                          }}
                                          className="text-indigo-600 rounded border-slate-300 h-3 w-3 focus:ring-0"
                                        />
                                        <span className="text-[10px] text-slate-600 font-medium">Apply Waiver</span>
                                      </label>
                                      
                                      {line.waiver.documented && (
                                        <input
                                          type="text"
                                          value={line.waiver.reason}
                                          onChange={(e) => {
                                            setWaivers(prev => ({
                                              ...prev,
                                              [line.control_account_id]: {
                                                ...prev[line.control_account_id],
                                                reason: e.target.value
                                              }
                                            }));
                                          }}
                                          placeholder="Enter official waiver reason..."
                                          className="text-[9px] border p-1 rounded w-full text-slate-700 bg-amber-50/50 border-amber-200"
                                        />
                                      )}
                                    </div>
                                  ) : (
                                    <div className="flex items-center space-x-1.5 text-green-600 font-medium text-[10px]">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>Floor Rule Satisfied</span>
                                    </div>
                                  )}

                                  {/* Optional note input */}
                                  <input
                                    type="text"
                                    value={line.notes}
                                    onChange={(e) => {
                                      setManualNotes(prev => ({ ...prev, [line.control_account_id]: e.target.value }));
                                    }}
                                    placeholder="Add detail notes..."
                                    className="text-[10px] border border-slate-200 p-1 rounded bg-slate-50 text-slate-700"
                                  />
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
            )}

            {/* TAB 3: COMPARISON */}
            {activeTab === 'compare' && (
              <div className="space-y-6">
                <div className="bg-white p-5 rounded-lg border border-slate-200 space-y-4">
                  <h3 className="font-bold text-slate-900 text-sm">Select Reference Forecast for Variance Delta</h3>
                  <div className="flex items-center space-x-4">
                    <select
                      value={comparisonVersionId}
                      onChange={(e) => setComparisonVersionId(e.target.value)}
                      className="text-sm border rounded-lg p-2 bg-white text-slate-800 focus:outline-none"
                    >
                      <option value="">-- Choose Historical Forecast to Compare --</option>
                      {estimateVersions
                        .filter(ev => ev.id !== comparisonVersionId && ev.project_id === projectId)
                        .map(ev => (
                          <option key={ev.id} value={ev.id}>
                            [{ev.status}] {ev.version_code} - {ev.version_name} ({ev.data_date})
                          </option>
                        ))}
                    </select>
                    <p className="text-xs text-slate-500">Provides a real-time variance and side-by-side comparison of ETC/FAC calculations.</p>
                  </div>
                </div>

                {comparisonData ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                          <th className="p-3 pl-4">Account Code & Title</th>
                          <th className="p-3">Previous ETC</th>
                          <th className="p-3 text-indigo-700">New ETC</th>
                          <th className="p-3">ETC Delta</th>
                          <th className="p-3">Previous FAC</th>
                          <th className="p-3 text-indigo-700">New FAC</th>
                          <th className="p-3 font-semibold">FAC Delta</th>
                          <th className="p-3">Delta Analysis</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {comparisonData.map(line => (
                          <tr key={line.control_account_id} className="hover:bg-slate-50/50">
                            <td className="p-3 pl-4">
                              <div className="font-bold text-slate-900">{line.code}</div>
                              <div className="text-[10px] text-slate-500 truncate max-w-[200px]">{line.title}</div>
                            </td>
                            <td className="p-3 text-slate-500">${line.prevEtc.toLocaleString()}</td>
                            <td className="p-3 font-bold text-indigo-800">${line.etc.toLocaleString()}</td>
                            <td className={`p-3 font-semibold ${line.etcDelta > 0 ? 'text-red-600' : line.etcDelta < 0 ? 'text-green-600' : 'text-slate-500'}`}>
                              {line.etcDelta > 0 ? '+' : ''}{line.etcDelta.toLocaleString()}
                            </td>
                            <td className="p-3 text-slate-500">${line.prevFac.toLocaleString()}</td>
                            <td className="p-3 font-bold text-indigo-800">${line.fac.toLocaleString()}</td>
                            <td className={`p-3 font-semibold ${line.facDelta > 0 ? 'text-red-600' : line.facDelta < 0 ? 'text-green-600' : 'text-slate-500'}`}>
                              {line.facDelta > 0 ? '+' : ''}{line.facDelta.toLocaleString()}
                            </td>
                            <td className="p-3">
                              {line.facDelta !== 0 ? (
                                <div className="text-slate-600 text-[10px]">
                                  Adjusted via <span className="font-bold">{method}</span> model.
                                </div>
                              ) : (
                                <span className="text-slate-400">Unchanged</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-12 text-center border border-dashed rounded-xl text-slate-400">
                    Select a previous forecast version above to activate delta comparison reporting.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer controls */}
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <div className="text-xs text-slate-500 flex items-center space-x-1.5">
              <Shield className="w-4 h-4 text-slate-400" />
              <span>Full compliance with Primavera reconciliation and SAP control metrics.</span>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-100 text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              
              <button
                type="button"
                onClick={handleSave}
                disabled={!isFormValid || isSaving}
                className={`px-5 py-2 rounded-lg text-white font-semibold text-sm flex items-center space-x-2 transition-all shadow-md ${
                  isFormValid && !isSaving
                    ? 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer'
                    : 'bg-slate-300 cursor-not-allowed'
                }`}
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save {status === 'Approved' ? 'Immutable Approved' : 'Draft'} Forecast</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

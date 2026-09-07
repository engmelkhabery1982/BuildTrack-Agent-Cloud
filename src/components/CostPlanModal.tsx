import React, { useState, useMemo, useEffect } from 'react';
import {
  GitCompare,
  History,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  Calendar,
  DollarSign,
  Layers,
  ShieldCheck,
  X,
  FileText,
  Search,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Lock,
  RefreshCw,
  BarChart3,
  Table as TableIcon,
} from 'lucide-react';
import type {
  ControlAccount,
  CostPlanVersion,
  CostPlanPeriod,
  CurveDistributionType,
  Project,
  Contract,
  WBSNode,
  CostCode,
} from '../types';
import {
  generateCostPlanPeriods,
  validateCostPlanVersion,
  compareCostPlanVersions,
  rollupCostPlans,
} from '../utils/costPlanPhasing';

interface CostPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  contractId?: string | null;
  controlAccountId?: string | null;
  projects?: Project[];
  contracts?: Contract[];
  controlAccounts?: ControlAccount[];
  wbsNodes?: WBSNode[];
  costCodes?: CostCode[];
  costPlanVersions: CostPlanVersion[];
  onSaveVersion: (version: CostPlanVersion) => Promise<void>;
  currencySymbol?: string;
  dataDate?: string;
}

export const CostPlanModal: React.FC<CostPlanModalProps> = ({
  isOpen,
  onClose,
  projectId,
  contractId,
  controlAccountId,
  projects = [],
  contracts = [],
  controlAccounts = [],
  wbsNodes = [],
  costCodes = [],
  costPlanVersions = [],
  onSaveVersion,
  currencySymbol = '$',
  dataDate: governedDataDate,
}) => {
  const [activeTab, setActiveTab] = useState<'register' | 'editor' | 'compare' | 'rollup'>('register');

  // Scope filters
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || '');
  const [selectedContractId, setSelectedContractId] = useState(contractId || '');
  const [selectedControlAccountId, setSelectedControlAccountId] = useState(controlAccountId || '');

  // Editor Form State
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [versionCode, setVersionCode] = useState(`CP-${new Date().toISOString().slice(0, 10)}`);
  const [versionName, setVersionName] = useState('Delivery Cost Phasing');
  const [revisionNumber, setRevisionNumber] = useState(1);
  const [status, setStatus] = useState<'Draft' | 'Approved' | 'Superseded'>('Draft');
  const [dataDate, setDataDate] = useState(governedDataDate || new Date().toISOString().slice(0, 10));
  const [deliveryCostBac, setDeliveryCostBac] = useState<number>(0);
  const [curveType, setCurveType] = useState<CurveDistributionType>('Linear');
  const [frequency, setFrequency] = useState<'monthly' | 'weekly' | 'quarterly'>('monthly');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  const [owner, setOwner] = useState('Cost Controller');
  const [reason, setReason] = useState('Initial Time-phased Delivery Cost Baseline');
  const [notes, setNotes] = useState('');
  const [periods, setPeriods] = useState<CostPlanPeriod[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Comparison State
  const [compareV1Id, setCompareV1Id] = useState<string>('');
  const [compareV2Id, setCompareV2Id] = useState<string>('');

  // Rollup Level
  const [rollupLevel, setRollupLevel] = useState<'project' | 'wbs' | 'cost_code'>('wbs');

  // Filtered lists
  const scopedContracts = useMemo(
    () => contracts.filter((c) => !selectedProjectId || c.project_id === selectedProjectId),
    [contracts, selectedProjectId],
  );

  const scopedControlAccounts = useMemo(() => {
    return controlAccounts.filter((ca) => {
      if (selectedProjectId && ca.project_id !== selectedProjectId) return false;
      if (selectedContractId && ca.contract_id !== selectedContractId) return false;
      return true;
    });
  }, [controlAccounts, selectedProjectId, selectedContractId]);

  const activeControlAccount = useMemo(() => {
    return controlAccounts.find((ca) => ca.id === selectedControlAccountId);
  }, [controlAccounts, selectedControlAccountId]);

  // Scoped versions
  const scopedVersions = useMemo(() => {
    return costPlanVersions.filter((v) => {
      if (selectedProjectId && v.project_id !== selectedProjectId) return false;
      if (selectedContractId && v.contract_id !== selectedContractId) return false;
      if (selectedControlAccountId && v.control_account_id !== selectedControlAccountId) return false;
      return true;
    });
  }, [costPlanVersions, selectedProjectId, selectedContractId, selectedControlAccountId]);

  // Synchronize initial selections
  useEffect(() => {
    if (!isOpen) return;
    const pId = projectId || selectedProjectId || projects[0]?.id || '';
    setSelectedProjectId(pId);
    if (contractId) setSelectedContractId(contractId);
    if (controlAccountId) setSelectedControlAccountId(controlAccountId);
    if (governedDataDate) setDataDate(governedDataDate);
  }, [isOpen, projectId, contractId, controlAccountId, projects, governedDataDate]);

  // When selected control account changes, load BAC and dates
  useEffect(() => {
    if (activeControlAccount) {
      const budget = Number(activeControlAccount.budget_amount) || Number(activeControlAccount.target_cost) || 100000;
      setDeliveryCostBac(budget);
      if (activeControlAccount.target_start_date) setStartDate(activeControlAccount.target_start_date);
      if (activeControlAccount.target_finish_date) setEndDate(activeControlAccount.target_finish_date);
    }
  }, [activeControlAccount]);

  // Helper to re-generate periods
  const handleRecalculatePeriods = (
    cType: CurveDistributionType = curveType,
    bac: number = deliveryCostBac,
    start: string = startDate,
    end: string = endDate,
    dDate: string = dataDate,
  ) => {
    if (bac <= 0 || !start || !end || new Date(start) >= new Date(end)) return;
    const generated = generateCostPlanPeriods({
      deliveryCostBac: bac,
      startDate: start,
      endDate: end,
      curveType: cType,
      frequency,
      dataDate: dDate,
      versionId: editingVersionId || 'draft-version',
    });
    setPeriods(generated);
  };

  // Switch to new plan editor
  const handleStartNewPlan = () => {
    setEditingVersionId(null);
    setVersionCode(`CP-${new Date().toISOString().slice(0, 10)}-${Math.floor(100 + Math.random() * 900)}`);
    setVersionName(activeControlAccount ? `${activeControlAccount.control_account_code} Phasing` : 'Delivery Cost Phasing');
    setRevisionNumber(1);
    setStatus('Draft');
    const budget = activeControlAccount ? (Number(activeControlAccount.budget_amount) || 100000) : 100000;
    setDeliveryCostBac(budget);
    setCurveType('Linear');
    setFrequency('monthly');
    handleRecalculatePeriods('Linear', budget, startDate, endDate, dataDate);
    setFormError(null);
    setActiveTab('editor');
  };

  // Load existing version into editor
  const handleEditVersion = (version: CostPlanVersion) => {
    setEditingVersionId(version.id);
    setSelectedProjectId(version.project_id);
    setSelectedContractId(version.contract_id);
    setSelectedControlAccountId(version.control_account_id);
    setVersionCode(version.version_code);
    setVersionName(version.version_name);
    setRevisionNumber(version.revision_number);
    setStatus(version.status);
    setDataDate(version.data_date);
    setDeliveryCostBac(version.delivery_cost_bac);
    setCurveType(version.curve_type);
    setFrequency(version.frequency || 'monthly');
    setStartDate(version.start_date);
    setEndDate(version.end_date);
    setOwner(version.owner || 'Cost Controller');
    setReason(version.reason || '');
    setNotes(version.notes || '');
    setPeriods(version.periods || []);
    setFormError(null);
    setActiveTab('editor');
  };

  // Handle manual edit of a single period's planned cost
  const handlePeriodCostChange = (index: number, newCost: number) => {
    const updated = [...periods];
    updated[index] = {
      ...updated[index],
      planned_cost: newCost,
      distribution_source: 'Manual',
    };
    // Recompute cumulative and weights
    let cum = 0;
    for (let i = 0; i < updated.length; i++) {
      cum += updated[i].planned_cost;
      updated[i].cumulative_cost = cum;
      updated[i].weight_pct = deliveryCostBac > 0 ? (updated[i].planned_cost / deliveryCostBac) * 100 : 0;
    }
    setPeriods(updated);
  };

  // Penny-perfect reconcile balance button
  const handleBalancePeriods = () => {
    const totalPlanned = periods.reduce((sum, p) => sum + p.planned_cost, 0);
    const diff = Math.round((deliveryCostBac - totalPlanned) * 100) / 100;
    if (Math.abs(diff) > 0.0001 && periods.length > 0) {
      const updated = [...periods];
      const lastIdx = updated.length - 1;
      updated[lastIdx].planned_cost = Math.round((updated[lastIdx].planned_cost + diff) * 100) / 100;
      let cum = 0;
      for (let i = 0; i < updated.length; i++) {
        cum += updated[i].planned_cost;
        updated[i].cumulative_cost = Math.round(cum * 100) / 100;
        updated[i].weight_pct = deliveryCostBac > 0 ? (updated[i].planned_cost / deliveryCostBac) * 100 : 0;
      }
      setPeriods(updated);
    }
  };

  // Save handler
  const handleSave = async (targetStatus: 'Draft' | 'Approved' = status as any) => {
    setFormError(null);
    if (!selectedProjectId) {
      setFormError('Please select a project.');
      return;
    }
    if (!selectedContractId) {
      setFormError('Please select a contract.');
      return;
    }
    if (!selectedControlAccountId) {
      setFormError('Please select a control account.');
      return;
    }
    if (deliveryCostBac <= 0) {
      setFormError('Delivery Cost BAC must be greater than zero.');
      return;
    }

    const totalPlanned = periods.reduce((sum, p) => sum + p.planned_cost, 0);
    if (Math.abs(totalPlanned - deliveryCostBac) > 0.05) {
      setFormError(
        `Total planned cost (${currencySymbol}${totalPlanned.toLocaleString()}) does not match BAC (${currencySymbol}${deliveryCostBac.toLocaleString()}). Use Reconcile Balance to balance to 0.00 drift.`,
      );
      return;
    }

    const existingApproved = scopedVersions.find(
      (v) => v.control_account_id === selectedControlAccountId && v.status === 'Approved' && v.id !== editingVersionId,
    );

    const versionData: CostPlanVersion = {
      id: editingVersionId || `cpv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      project_id: selectedProjectId,
      contract_id: selectedContractId,
      control_account_id: selectedControlAccountId,
      wbs_id: activeControlAccount?.wbs_id,
      cost_code_id: activeControlAccount?.cost_code_id,
      contract_sov_line_id: activeControlAccount?.contract_sov_line_id,
      boq_item_id: activeControlAccount?.boq_item_id,
      version_code: versionCode.trim(),
      version_name: versionName.trim() || versionCode.trim(),
      revision_number: revisionNumber,
      status: targetStatus,
      data_date: dataDate,
      delivery_cost_bac: deliveryCostBac,
      curve_type: curveType,
      frequency,
      start_date: startDate,
      end_date: endDate,
      periods_count: periods.length,
      owner,
      reason,
      notes,
      periods,
      approved_by: targetStatus === 'Approved' ? 'Project Director' : undefined,
      approved_at: targetStatus === 'Approved' ? new Date().toISOString() : undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const validation = validateCostPlanVersion(versionData, existingApproved);
    if (!validation.isValid) {
      setFormError(validation.errors.join(' '));
      return;
    }

    setIsSubmitting(true);
    try {
      await onSaveVersion(versionData);
      setActiveTab('register');
    } catch (err: any) {
      setFormError(err.message || 'Failed to save cost plan version.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Compare results
  const comparisonResult = useMemo(() => {
    if (!compareV1Id || !compareV2Id) return null;
    const v1 = costPlanVersions.find((v) => v.id === compareV1Id);
    const v2 = costPlanVersions.find((v) => v.id === compareV2Id);
    if (!v1 || !v2) return null;
    return compareCostPlanVersions(v1, v2);
  }, [compareV1Id, compareV2Id, costPlanVersions]);

  // Rollup results
  const rollupSummary = useMemo(() => {
    // Only roll up approved versions
    const approved = costPlanVersions.filter((v) => {
      if (v.status !== 'Approved') return false;
      if (selectedProjectId && v.project_id !== selectedProjectId) return false;
      if (selectedContractId && v.contract_id !== selectedContractId) return false;
      return true;
    });
    return rollupCostPlans(approved, rollupLevel);
  }, [costPlanVersions, selectedProjectId, selectedContractId, rollupLevel]);

  if (!isOpen) return null;

  return (
    <div
      id="cost-plan-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto"
    >
      <div
        id="cost-plan-modal-container"
        className="relative w-full max-w-6xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-8 flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div id="cost-plan-modal-header" className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-600 rounded-lg text-white">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-wide">Time-phased Delivery Cost Plan</h2>
              <p className="text-xs text-slate-400">
                Governance, Period Phasing & S-Curve Distribution by Control Account
              </p>
            </div>
          </div>
          <button
            id="cost-plan-close-btn"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Control Bar & Tabs */}
        <div id="cost-plan-tabs-bar" className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              id="cost-plan-tab-register"
              onClick={() => setActiveTab('register')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-2 ${
                activeTab === 'register'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <History className="w-4 h-4" />
              Version Register ({scopedVersions.length})
            </button>
            <button
              id="cost-plan-tab-editor"
              onClick={handleStartNewPlan}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-2 ${
                activeTab === 'editor'
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              {editingVersionId ? 'Edit Phasing' : 'New Cost Plan'}
            </button>
            <button
              id="cost-plan-tab-compare"
              onClick={() => setActiveTab('compare')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-2 ${
                activeTab === 'compare'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <GitCompare className="w-4 h-4" />
              Variance Comparison
            </button>
            <button
              id="cost-plan-tab-rollup"
              onClick={() => setActiveTab('rollup')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-2 ${
                activeTab === 'rollup'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Multi-Level Rollup
            </button>
          </div>

          {/* Scope Filters */}
          <div className="flex items-center gap-2 text-xs">
            <select
              id="cost-plan-project-filter"
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                setSelectedContractId('');
                setSelectedControlAccountId('');
              }}
              className="px-2.5 py-1.5 border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_code || p.name}
                </option>
              ))}
            </select>

            <select
              id="cost-plan-contract-filter"
              value={selectedContractId}
              onChange={(e) => {
                setSelectedContractId(e.target.value);
                setSelectedControlAccountId('');
              }}
              className="px-2.5 py-1.5 border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="">All Contracts</option>
              {scopedContracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.contract_number || c.title}
                </option>
              ))}
            </select>

            <select
              id="cost-plan-ca-filter"
              value={selectedControlAccountId}
              onChange={(e) => setSelectedControlAccountId(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="">All Control Accounts</option>
              {scopedControlAccounts.map((ca) => (
                <option key={ca.id} value={ca.id}>
                  {ca.control_account_code} - {ca.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: REGISTER */}
          {activeTab === 'register' && (
            <div id="cost-plan-register-tab" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Control Account Cost Plan Versions</h3>
                  <p className="text-xs text-slate-500">
                    Governed baselines and approved time-phased delivery curves. Approved versions are immutable control points.
                  </p>
                </div>
                <button
                  id="cost-plan-register-new-btn"
                  onClick={handleStartNewPlan}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Create New Phased Plan
                </button>
              </div>

              {scopedVersions.length === 0 ? (
                <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-lg">
                  <TrendingUp className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-600">No Cost Plan Versions Found</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Create the first time-phased cost plan for this control account with linear, bell, or S-curve distribution.
                  </p>
                  <button
                    onClick={handleStartNewPlan}
                    className="mt-4 px-3 py-1.5 bg-slate-900 text-white text-xs rounded-md font-semibold hover:bg-slate-800"
                  >
                    Create Baseline Cost Plan
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-3">Version Code</th>
                        <th className="p-3">Control Account</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Curve Type</th>
                        <th className="p-3 text-right">Delivery Cost BAC</th>
                        <th className="p-3 text-center">Periods</th>
                        <th className="p-3">Data Date</th>
                        <th className="p-3">Approved By</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {scopedVersions.map((v) => {
                        const ca = controlAccounts.find((c) => c.id === v.control_account_id);
                        return (
                          <tr key={v.id} className="hover:bg-slate-50/75 transition-colors">
                            <td className="p-3 font-medium text-slate-900">
                              <div>{v.version_code}</div>
                              <div className="text-[10px] text-slate-400">{v.version_name}</div>
                            </td>
                            <td className="p-3">
                              <span className="font-mono bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-[11px]">
                                {ca?.control_account_code || v.control_account_id}
                              </span>
                            </td>
                            <td className="p-3">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  v.status === 'Approved'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : v.status === 'Superseded'
                                    ? 'bg-slate-100 text-slate-500 border border-slate-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}
                              >
                                {v.status === 'Approved' && <ShieldCheck className="w-3 h-3" />}
                                {v.status === 'Superseded' && <Lock className="w-3 h-3" />}
                                {v.status}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className="font-medium text-slate-700">{v.curve_type}</span>
                            </td>
                            <td className="p-3 text-right font-semibold text-slate-900">
                              {currencySymbol}
                              {v.delivery_cost_bac.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-3 text-center">{v.periods_count}</td>
                            <td className="p-3">{v.data_date}</td>
                            <td className="p-3">
                              {v.approved_by ? (
                                <div>
                                  <div className="font-medium text-slate-800">{v.approved_by}</div>
                                  <div className="text-[10px] text-slate-400">
                                    {v.approved_at ? new Date(v.approved_at).toLocaleDateString() : ''}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">Unapproved</span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleEditVersion(v)}
                                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium"
                                >
                                  {v.status === 'Approved' ? 'Inspect' : 'Edit'}
                                </button>
                                {v.status === 'Draft' && (
                                  <button
                                    onClick={() => {
                                      handleEditVersion(v);
                                      void handleSave('Approved');
                                    }}
                                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-medium"
                                  >
                                    Approve
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: EDITOR */}
          {activeTab === 'editor' && (
            <div id="cost-plan-editor-tab" className="space-y-6">
              {formError && (
                <div
                  id="cost-plan-form-error"
                  className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>{formError}</div>
                </div>
              )}

              {/* Version Metadata Form */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Version Specifications
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        status === 'Approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : status === 'Superseded'
                          ? 'bg-slate-200 text-slate-700'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                  {activeControlAccount && (
                    <div className="text-xs text-slate-600 font-mono">
                      Control Account: <span className="font-semibold">{activeControlAccount.control_account_code}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Version Code</label>
                    <input
                      id="cost-plan-code-input"
                      type="text"
                      disabled={status === 'Approved' || status === 'Superseded'}
                      value={versionCode}
                      onChange={(e) => setVersionCode(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded-md bg-white text-slate-800 disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Version Name</label>
                    <input
                      id="cost-plan-name-input"
                      type="text"
                      disabled={status === 'Approved' || status === 'Superseded'}
                      value={versionName}
                      onChange={(e) => setVersionName(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded-md bg-white text-slate-800 disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Control Account *</label>
                    <select
                      id="cost-plan-ca-select"
                      disabled={status === 'Approved' || status === 'Superseded'}
                      value={selectedControlAccountId}
                      onChange={(e) => setSelectedControlAccountId(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded-md bg-white text-slate-800 disabled:bg-slate-100 font-mono"
                    >
                      <option value="">Select Control Account...</option>
                      {scopedControlAccounts.map((ca) => (
                        <option key={ca.id} value={ca.id}>
                          {ca.control_account_code} - {ca.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Delivery Cost BAC *</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-slate-400 font-semibold">{currencySymbol}</span>
                      <input
                        id="cost-plan-bac-input"
                        type="number"
                        disabled={status === 'Approved' || status === 'Superseded'}
                        value={deliveryCostBac}
                        onChange={(e) => {
                          const bac = Number(e.target.value) || 0;
                          setDeliveryCostBac(bac);
                          handleRecalculatePeriods(curveType, bac, startDate, endDate, dataDate);
                        }}
                        className="w-full pl-6 p-2 border border-slate-200 rounded-md bg-white text-slate-800 font-semibold disabled:bg-slate-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Distribution Curve</label>
                    <select
                      id="cost-plan-curve-select"
                      disabled={status === 'Approved' || status === 'Superseded'}
                      value={curveType}
                      onChange={(e) => {
                        const ct = e.target.value as CurveDistributionType;
                        setCurveType(ct);
                        handleRecalculatePeriods(ct, deliveryCostBac, startDate, endDate, dataDate);
                      }}
                      className="w-full p-2 border border-slate-200 rounded-md bg-white text-slate-800 disabled:bg-slate-100"
                    >
                      <option value="Linear">Linear (Equal Spread)</option>
                      <option value="Bell">Bell Curve (Standard Normal)</option>
                      <option value="S-Curve">S-Curve (Sigmoid Logistic)</option>
                      <option value="Front-loaded">Front-Loaded (Early Investment)</option>
                      <option value="Back-loaded">Back-Loaded (Heavy Commissioning)</option>
                      <option value="Manual">Manual (Custom Phasing)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Planning Period</label>
                    <select
                      id="cost-plan-frequency-select"
                      disabled={status === 'Approved' || status === 'Superseded'}
                      value={frequency}
                      onChange={(e) => {
                        const next = e.target.value as 'monthly' | 'weekly' | 'quarterly';
                        setFrequency(next);
                        const generated = generateCostPlanPeriods({
                          deliveryCostBac,
                          startDate,
                          endDate,
                          curveType,
                          frequency: next,
                          dataDate,
                          versionId: editingVersionId || 'draft-version',
                        });
                        setPeriods(generated);
                      }}
                      className="w-full p-2 border border-slate-200 rounded-md bg-white text-slate-800 disabled:bg-slate-100"
                    >
                      <option value="monthly">Monthly calendar periods</option>
                      <option value="weekly">Weekly periods</option>
                      <option value="quarterly">Quarterly calendar periods</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Start Date</label>
                    <input
                      id="cost-plan-start-input"
                      type="date"
                      disabled={status === 'Approved' || status === 'Superseded'}
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        handleRecalculatePeriods(curveType, deliveryCostBac, e.target.value, endDate, dataDate);
                      }}
                      className="w-full p-2 border border-slate-200 rounded-md bg-white text-slate-800 disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">End Date</label>
                    <input
                      id="cost-plan-end-input"
                      type="date"
                      disabled={status === 'Approved' || status === 'Superseded'}
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        handleRecalculatePeriods(curveType, deliveryCostBac, startDate, e.target.value, dataDate);
                      }}
                      className="w-full p-2 border border-slate-200 rounded-md bg-white text-slate-800 disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Governed Data Date</label>
                    <input
                      id="cost-plan-data-date-input"
                      type="date"
                      disabled={status === 'Approved' || status === 'Superseded'}
                      value={dataDate}
                      onChange={(e) => {
                        setDataDate(e.target.value);
                        handleRecalculatePeriods(curveType, deliveryCostBac, startDate, endDate, e.target.value);
                      }}
                      className="w-full p-2 border border-slate-200 rounded-md bg-white text-slate-800 disabled:bg-slate-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Cost Lead / Owner</label>
                    <input
                      type="text"
                      disabled={status === 'Approved' || status === 'Superseded'}
                      value={owner}
                      onChange={(e) => setOwner(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded-md bg-white text-slate-800 disabled:bg-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Revision Reason</label>
                    <input
                      type="text"
                      disabled={status === 'Approved' || status === 'Superseded'}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded-md bg-white text-slate-800 disabled:bg-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* Phased Periods Table & Balance Control */}
              <div className="border border-slate-200 rounded-lg overflow-hidden space-y-0">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <TableIcon className="w-4 h-4 text-slate-600" />
                    <span className="text-xs font-semibold text-slate-800">
                      Time-phased Monthly Allocations ({periods.length} Periods)
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    {(() => {
                      const totalPlanned = periods.reduce((sum, p) => sum + p.planned_cost, 0);
                      const drift = Math.round((deliveryCostBac - totalPlanned) * 100) / 100;
                      const isBalanced = Math.abs(drift) < 0.01;
                      return (
                        <>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-500">Total Planned:</span>
                            <span className="font-semibold text-slate-900">
                              {currencySymbol}
                              {totalPlanned.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>

                          <div
                            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                              isBalanced ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {isBalanced ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                            Variance: {currencySymbol}
                            {drift.toFixed(2)}
                          </div>

                          {!isBalanced && status !== 'Approved' && status !== 'Superseded' && (
                            <button
                              id="cost-plan-reconcile-btn"
                              onClick={handleBalancePeriods}
                              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium flex items-center gap-1 transition-colors"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Reconcile Drift
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="p-2.5 text-center">#</th>
                        <th className="p-2.5">Period Window</th>
                        <th className="p-2.5 text-center">Status</th>
                        <th className="p-2.5 text-right">Planned Cost</th>
                        <th className="p-2.5 text-right">Weight %</th>
                        <th className="p-2.5 text-right">Cumulative Cost</th>
                        <th className="p-2.5">Method</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {periods.map((p, idx) => (
                        <tr
                          key={p.period_index}
                          className={p.is_closed_period ? 'bg-slate-50/60 text-slate-400' : 'hover:bg-slate-50'}
                        >
                          <td className="p-2.5 text-center font-mono text-slate-500">{p.period_index}</td>
                          <td className="p-2.5 font-medium text-slate-800">
                            {p.period_start} <span className="text-slate-400">→</span> {p.period_end}
                          </td>
                          <td className="p-2.5 text-center">
                            {p.is_closed_period ? (
                              <span className="px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded text-[10px]">
                                Past (Closed)
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px]">
                                Open
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-right">
                            {status === 'Approved' || status === 'Superseded' || p.is_closed_period ? (
                              <span className="font-semibold text-slate-900">
                                {currencySymbol}
                                {p.planned_cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            ) : (
                              <input
                                type="number"
                                step="0.01"
                                value={p.planned_cost}
                                onChange={(e) => handlePeriodCostChange(idx, Number(e.target.value) || 0)}
                                className="w-28 text-right p-1 border border-slate-300 rounded font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                              />
                            )}
                          </td>
                          <td className="p-2.5 text-right font-mono">{p.weight_pct.toFixed(2)}%</td>
                          <td className="p-2.5 text-right font-semibold text-slate-900 font-mono">
                            {currencySymbol}
                            {p.cumulative_cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-2.5 text-slate-500 text-[11px]">{p.distribution_source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('register')}
                  className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-md text-xs font-semibold"
                >
                  Cancel
                </button>

                {status !== 'Approved' && status !== 'Superseded' && (
                  <div className="flex items-center gap-2">
                    <button
                      id="cost-plan-save-draft-btn"
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => void handleSave('Draft')}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md text-xs font-semibold transition-colors"
                    >
                      Save Draft
                    </button>
                    <button
                      id="cost-plan-approve-btn"
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => void handleSave('Approved')}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Approve & Lock Control Point
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: COMPARE */}
          {activeTab === 'compare' && (
            <div id="cost-plan-compare-tab" className="space-y-6">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center gap-4 text-xs">
                <div className="flex-1 min-w-[240px]">
                  <label className="block font-medium text-slate-700 mb-1">Reference Plan (V1)</label>
                  <select
                    id="cost-plan-compare-v1-select"
                    value={compareV1Id}
                    onChange={(e) => setCompareV1Id(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-md bg-white text-slate-800"
                  >
                    <option value="">Select Reference Version...</option>
                    {scopedVersions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.version_code} ({v.status}) - {currencySymbol}
                        {v.delivery_cost_bac.toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-center pt-5">
                  <ArrowRight className="w-5 h-5 text-slate-400" />
                </div>

                <div className="flex-1 min-w-[240px]">
                  <label className="block font-medium text-slate-700 mb-1">Target Plan (V2)</label>
                  <select
                    id="cost-plan-compare-v2-select"
                    value={compareV2Id}
                    onChange={(e) => setCompareV2Id(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-md bg-white text-slate-800"
                  >
                    <option value="">Select Target Version...</option>
                    {scopedVersions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.version_code} ({v.status}) - {currencySymbol}
                        {v.delivery_cost_bac.toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {comparisonResult ? (
                <div className="space-y-4">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
                      <div className="text-xs text-slate-500 mb-1">BAC Delta</div>
                      <div
                        className={`text-lg font-bold ${
                          comparisonResult.delta_bac > 0
                            ? 'text-rose-600'
                            : comparisonResult.delta_bac < 0
                            ? 'text-emerald-600'
                            : 'text-slate-800'
                        }`}
                      >
                        {comparisonResult.delta_bac >= 0 ? '+' : ''}
                        {currencySymbol}
                        {comparisonResult.delta_bac.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {comparisonResult.delta_bac_pct >= 0 ? '+' : ''}
                        {comparisonResult.delta_bac_pct.toFixed(2)}% variance
                      </div>
                    </div>

                    <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
                      <div className="text-xs text-slate-500 mb-1">Cumulative Delta at Data Date</div>
                      <div
                        className={`text-lg font-bold ${
                          comparisonResult.delta_cumulative_at_data_date > 0
                            ? 'text-blue-600'
                            : 'text-slate-800'
                        }`}
                      >
                        {comparisonResult.delta_cumulative_at_data_date >= 0 ? '+' : ''}
                        {currencySymbol}
                        {comparisonResult.delta_cumulative_at_data_date.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">Phasing difference to date</div>
                    </div>

                    <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
                      <div className="text-xs text-slate-500 mb-1">Max Period Shift</div>
                      <div className="text-lg font-bold text-slate-800">
                        {currencySymbol}
                        {comparisonResult.max_period_delta.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">Highest single monthly swing</div>
                    </div>

                    <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
                      <div className="text-xs text-slate-500 mb-1">Curve Shift Direction</div>
                      <div className="text-lg font-bold text-slate-800 capitalize">
                        {comparisonResult.shift_direction}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">Overall expenditure momentum</div>
                    </div>
                  </div>

                  {/* Period by period comparison table */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
                      Period-by-Period Cost Allocation Variance
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-600">
                        <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                          <tr>
                            <th className="p-2.5">Period Window</th>
                            <th className="p-2.5 text-right">V1 Planned</th>
                            <th className="p-2.5 text-right">V2 Planned</th>
                            <th className="p-2.5 text-right">Planned Delta</th>
                            <th className="p-2.5 text-right">V1 Cumulative</th>
                            <th className="p-2.5 text-right">V2 Cumulative</th>
                            <th className="p-2.5 text-right">Cumulative Delta</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {comparisonResult.period_comparisons.map((pc, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-2.5 font-medium text-slate-800">
                                {pc.period_start} → {pc.period_end}
                              </td>
                              <td className="p-2.5 text-right">
                                {currencySymbol}
                                {pc.v1_planned.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-2.5 text-right">
                                {currencySymbol}
                                {pc.v2_planned.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td
                                className={`p-2.5 text-right font-semibold ${
                                  pc.delta_planned > 0
                                    ? 'text-rose-600'
                                    : pc.delta_planned < 0
                                    ? 'text-emerald-600'
                                    : 'text-slate-500'
                                }`}
                              >
                                {pc.delta_planned >= 0 ? '+' : ''}
                                {currencySymbol}
                                {pc.delta_planned.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-2.5 text-right">
                                {currencySymbol}
                                {pc.v1_cumulative.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-2.5 text-right">
                                {currencySymbol}
                                {pc.v2_cumulative.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td
                                className={`p-2.5 text-right font-semibold ${
                                  pc.delta_cumulative > 0
                                    ? 'text-blue-600'
                                    : pc.delta_cumulative < 0
                                    ? 'text-purple-600'
                                    : 'text-slate-500'
                                }`}
                              >
                                {pc.delta_cumulative >= 0 ? '+' : ''}
                                {currencySymbol}
                                {pc.delta_cumulative.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center border border-dashed border-slate-200 rounded-lg text-slate-400 text-xs">
                  Please select both a reference version (V1) and a target version (V2) above to calculate delivery cost deltas.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ROLLUP */}
          {activeTab === 'rollup' && (
            <div id="cost-plan-rollup-tab" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Approved Cost Plan Multi-Level Rollup</h3>
                  <p className="text-xs text-slate-500">
                    Aggregated time-phased planned delivery costs across approved Control Accounts.
                  </p>
                </div>

                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
                  <button
                    onClick={() => setRollupLevel('project')}
                    className={`px-3 py-1 rounded font-medium transition-colors ${
                      rollupLevel === 'project' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Project Level
                  </button>
                  <button
                    onClick={() => setRollupLevel('wbs')}
                    className={`px-3 py-1 rounded font-medium transition-colors ${
                      rollupLevel === 'wbs' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    WBS Level
                  </button>
                  <button
                    onClick={() => setRollupLevel('cost_code')}
                    className={`px-3 py-1 rounded font-medium transition-colors ${
                      rollupLevel === 'cost_code' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Cost Code (CBS) Level
                  </button>
                </div>
              </div>

              {rollupSummary.length === 0 ? (
                <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-xs">
                  No approved cost plans available to roll up. Approve at least one Control Account cost plan to view aggregations.
                </div>
              ) : (
                <div className="space-y-6">
                  {rollupSummary.map((group) => {
                    let groupName = group.group_id;
                    if (rollupLevel === 'wbs') {
                      const wbs = wbsNodes.find((w) => w.id === group.group_id);
                      groupName = wbs ? `${wbs.wbs_code} - ${wbs.name}` : group.group_id;
                    } else if (rollupLevel === 'cost_code') {
                      const cc = costCodes.find((c) => c.id === group.group_id);
                      groupName = cc ? `${cc.cost_code} - ${cc.description}` : group.group_id;
                    }

                    return (
                      <div key={group.group_id} className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                        <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-emerald-400" />
                            <span className="text-xs font-semibold tracking-wide">{groupName}</span>
                          </div>
                          <div className="text-xs font-semibold text-emerald-400">
                            Total BAC: {currencySymbol}
                            {group.total_bac.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs text-slate-600">
                            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                              <tr>
                                <th className="p-2.5">Period Window</th>
                                <th className="p-2.5 text-right">Periodic Planned Cost</th>
                                <th className="p-2.5 text-right">Cumulative Planned Cost</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {group.periods.map((gp, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                  <td className="p-2.5 font-medium text-slate-800">
                                    {gp.period_start} → {gp.period_end}
                                  </td>
                                  <td className="p-2.5 text-right font-semibold text-slate-900">
                                    {currencySymbol}
                                    {gp.planned_cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="p-2.5 text-right font-semibold text-slate-900">
                                    {currencySymbol}
                                    {gp.cumulative_cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

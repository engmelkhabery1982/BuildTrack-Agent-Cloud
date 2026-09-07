import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Users,
  Clock,
  DollarSign,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Send,
  ShieldCheck,
  RotateCcw,
  Plus,
  Trash2,
  Calendar,
  FileText,
  Briefcase,
  History,
  Lock,
} from 'lucide-react';
import type {
  LaborTimesheet,
  LaborTimesheetLine,
  LaborTimesheetStatus,
  Project,
  Contract,
  ControlAccount,
  Schedule,
  ResourceMaster,
  ReportingPeriod,
  WorkCalendar,
  CostCode,
} from '../types';
import {
  calculateLaborLineTotal,
  calculateLaborTimesheetTotals,
  validateLaborTimesheet,
  submitLaborTimesheet,
  approveLaborTimesheet,
  postLaborTimesheet,
  reverseLaborTimesheet,
  type ValidationIssue,
} from '../data/laborTimesheet';

interface LaborTimesheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  timesheet: Partial<LaborTimesheet> | null;
  existingLines?: LaborTimesheetLine[];
  projects: Project[];
  contracts: Contract[];
  controlAccounts: ControlAccount[];
  schedules: Schedule[];
  resourceMasters: ResourceMaster[];
  reportingPeriods?: ReportingPeriod[];
  workCalendars?: WorkCalendar[];
  costCodes?: CostCode[];
  allTimesheets?: LaborTimesheet[];
  allTimesheetLines?: LaborTimesheetLine[];
  onSaveDraft: (timesheet: Partial<LaborTimesheet>, lines: LaborTimesheetLine[]) => Promise<void>;
  onRefresh: () => Promise<void>;
  currentUser?: string;
  currencySymbol?: string;
  dataDate?: string;
}

export const LaborTimesheetModal: React.FC<LaborTimesheetModalProps> = ({
  isOpen,
  onClose,
  timesheet,
  existingLines = [],
  projects = [],
  contracts = [],
  controlAccounts = [],
  schedules = [],
  resourceMasters = [],
  reportingPeriods = [],
  workCalendars = [],
  costCodes = [],
  allTimesheets = [],
  allTimesheetLines = [],
  onSaveDraft,
  onRefresh,
  currentUser = 'Site Engineer',
  currencySymbol = '$',
  dataDate,
}) => {
  const isExisting = Boolean(timesheet?.id);
  const currentStatus: LaborTimesheetStatus = (timesheet?.status as LaborTimesheetStatus) || 'Draft';
  const isEditable = currentStatus === 'Draft';

  // Form State
  const [projectId, setProjectId] = useState(timesheet?.project_id || (projects[0]?.id ?? ''));
  const [contractId, setContractId] = useState(timesheet?.contract_id || (contracts[0]?.id ?? ''));
  const [timesheetNumber, setTimesheetNumber] = useState(
    timesheet?.timesheet_number || `TS-${new Date().toISOString().slice(0, 10)}-001`
  );
  const [workDate, setWorkDate] = useState(
    timesheet?.work_date || (dataDate ? dataDate.slice(0, 10) : new Date().toISOString().slice(0, 10))
  );
  const [shift, setShift] = useState<'Day' | 'Night' | 'Shift 1' | 'Shift 2'>(
    (timesheet?.shift as any) || 'Day'
  );
  const [crewName, setCrewName] = useState(timesheet?.crew_name || '');
  const [contractor, setContractor] = useState(timesheet?.contractor || '');
  const [submitter, setSubmitter] = useState(timesheet?.submitter || currentUser);
  const [notes, setNotes] = useState(timesheet?.notes || '');

  // Lines State
  const [lines, setLines] = useState<LaborTimesheetLine[]>([]);

  // Reversal Prompt Modal
  const [showReversalPrompt, setShowReversalPrompt] = useState(false);
  const [reversalReason, setReversalReason] = useState('');

  // Processing / Error states
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Initialize lines on open
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setSuccessMessage(null);
      if (timesheet) {
        setProjectId(timesheet.project_id || (projects[0]?.id ?? ''));
        setContractId(timesheet.contract_id || (contracts[0]?.id ?? ''));
        setTimesheetNumber(timesheet.timesheet_number || `TS-${new Date().toISOString().slice(0, 10)}-001`);
        setWorkDate(timesheet.work_date || (dataDate ? dataDate.slice(0, 10) : new Date().toISOString().slice(0, 10)));
        setShift((timesheet.shift as any) || 'Day');
        setCrewName(timesheet.crew_name || '');
        setContractor(timesheet.contractor || '');
        setSubmitter(timesheet.submitter || currentUser);
        setNotes(timesheet.notes || '');

        const matchingLines = existingLines.filter((l) => l.timesheet_id === timesheet.id);
        if (matchingLines.length > 0) {
          setLines(matchingLines);
        } else if (timesheet.lines && timesheet.lines.length > 0) {
          setLines(timesheet.lines);
        } else {
          setLines([]);
        }
      } else {
        setProjectId(projects[0]?.id ?? '');
        setContractId(contracts[0]?.id ?? '');
        setTimesheetNumber(`TS-${new Date().toISOString().slice(0, 10)}-001`);
        setWorkDate(dataDate ? dataDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
        setShift('Day');
        setCrewName('');
        setContractor('');
        setSubmitter(currentUser);
        setNotes('');
        setLines([]);
      }
    }
  }, [isOpen, timesheet, existingLines, projects, contracts, currentUser, dataDate]);

  // Filtered scopes
  const filteredContracts = useMemo(
    () => contracts.filter((c) => !projectId || c.project_id === projectId),
    [contracts, projectId]
  );

  const filteredActivities = useMemo(
    () => schedules.filter((s) => (!projectId || s.project_id === projectId) && (!contractId || !s.contract_id || s.contract_id === contractId)),
    [schedules, projectId, contractId]
  );

  const filteredControlAccounts = useMemo(
    () => controlAccounts.filter((ca) => (!projectId || ca.project_id === projectId) && (!contractId || !ca.contract_id || ca.contract_id === contractId)),
    [controlAccounts, projectId, contractId]
  );

  const laborResources = useMemo(
    () => resourceMasters.filter((r) => r.resource_type === 'Labor'),
    [resourceMasters]
  );

  // Auto-calculated totals
  const totals = useMemo(() => calculateLaborTimesheetTotals(lines), [lines]);

  // Live validation
  const validationIssues: ValidationIssue[] = useMemo(() => {
    return validateLaborTimesheet(
      {
        id: timesheet?.id,
        project_id: projectId,
        contract_id: contractId,
        timesheet_number: timesheetNumber,
        work_date: workDate,
        shift,
        submitter,
      },
      lines,
      {
        resourceMasters,
        schedules,
        controlAccounts,
        reportingPeriods,
        workCalendars,
        existingTimesheets: allTimesheets,
        existingLines: allTimesheetLines,
        dataDate,
      }
    );
  }, [
    timesheet?.id,
    projectId,
    contractId,
    timesheetNumber,
    workDate,
    shift,
    submitter,
    lines,
    resourceMasters,
    schedules,
    controlAccounts,
    reportingPeriods,
    workCalendars,
    allTimesheets,
    allTimesheetLines,
    dataDate,
  ]);

  const hasErrors = validationIssues.some((i) => i.severity === 'error');

  // Handle line additions
  const handleAddLine = () => {
    const firstWorker = laborResources[0];
    const defaultActivity = filteredActivities[0];
    const defaultCa = filteredControlAccounts[0];

    const newLine: LaborTimesheetLine = {
      id: crypto.randomUUID(),
      timesheet_id: timesheet?.id || '',
      created_at: new Date().toISOString(),
      project_id: projectId,
      contract_id: contractId,
      resource_id: firstWorker?.id || '',
      schedule_activity_id: defaultActivity?.id || '',
      control_account_id: defaultCa?.id || '',
      cost_code_id: defaultCa?.cost_code_id || '',
      regular_hours: 8,
      overtime_hours: 0,
      regular_rate: (firstWorker as any)?.unit_cost || (firstWorker as any)?.standard_rate || 50,
      overtime_rate: ((firstWorker as any)?.unit_cost || (firstWorker as any)?.standard_rate || 50) * 1.5,
      total_hours: 8,
      calculated_amount: ((firstWorker as any)?.unit_cost || (firstWorker as any)?.standard_rate || 50) * 8,
      currency: 'USD',
      non_working_override_reason: '',
      notes: '',
    };

    setLines((prev) => [...prev, newLine]);
  };

  const handleUpdateLine = (index: number, patch: Partial<LaborTimesheetLine>) => {
    setLines((prev) => {
      const updated = [...prev];
      const current = { ...updated[index], ...patch };

      // If resource changed, update default rates if available
      if (patch.resource_id && patch.resource_id !== updated[index].resource_id) {
        const res = laborResources.find((r) => r.id === patch.resource_id);
        if (res) {
          const baseRate = (res as any).unit_cost || (res as any).standard_rate || 50;
          current.regular_rate = baseRate;
          current.overtime_rate = baseRate * 1.5;
        }
      }

      // Recompute totals
      const { total_hours, calculated_amount } = calculateLaborLineTotal(current);
      current.total_hours = total_hours;
      current.calculated_amount = calculated_amount;

      updated[index] = current;
      return updated;
    });
  };

  const handleDeleteLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  // Actions
  const handleSave = async () => {
    try {
      setIsProcessing(true);
      setErrorMessage(null);

      const headerData: Partial<LaborTimesheet> = {
        id: timesheet?.id || crypto.randomUUID(),
        project_id: projectId,
        contract_id: contractId,
        timesheet_number: timesheetNumber,
        work_date: workDate,
        shift,
        crew_name: crewName || null,
        contractor: contractor || null,
        submitter,
        status: currentStatus,
        total_regular_hours: totals.total_regular_hours,
        total_overtime_hours: totals.total_overtime_hours,
        total_amount: totals.total_amount,
        notes: notes || null,
      };

      await onSaveDraft(headerData, lines);
      setSuccessMessage('Timesheet saved successfully.');
      await onRefresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save timesheet.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = async () => {
    if (hasErrors) {
      setErrorMessage('Please correct all validation errors before submitting.');
      return;
    }
    try {
      setIsProcessing(true);
      setErrorMessage(null);

      // Save latest state first
      const tsId = timesheet?.id || crypto.randomUUID();
      const headerData: Partial<LaborTimesheet> = {
        id: tsId,
        project_id: projectId,
        contract_id: contractId,
        timesheet_number: timesheetNumber,
        work_date: workDate,
        shift,
        crew_name: crewName || null,
        contractor: contractor || null,
        submitter,
        status: 'Draft',
        total_regular_hours: totals.total_regular_hours,
        total_overtime_hours: totals.total_overtime_hours,
        total_amount: totals.total_amount,
        notes: notes || null,
      };
      await onSaveDraft(headerData, lines);

      if ("__TAURI_INTERNALS__" in window) {
        await submitLaborTimesheet({
          operationId: crypto.randomUUID(),
          timesheetId: tsId,
          actor: currentUser,
          submittedAt: new Date().toISOString().slice(0, 10),
        });
      }
      setSuccessMessage('Timesheet submitted for approval.');
      await onRefresh();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit timesheet.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprove = async () => {
    if (!timesheet?.id) return;
    try {
      setIsProcessing(true);
      setErrorMessage(null);

      if (!("__TAURI_INTERNALS__" in window)) {
        throw new Error('Timesheet approval requires the governed desktop environment.');
      }

      await approveLaborTimesheet({
        operationId: crypto.randomUUID(),
        timesheetId: timesheet.id,
        actor: currentUser,
        approvedAt: new Date().toISOString().slice(0, 10),
      });

      setSuccessMessage('Timesheet approved.');
      await onRefresh();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to approve timesheet.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePost = async () => {
    if (!timesheet?.id) return;
    try {
      setIsProcessing(true);
      setErrorMessage(null);

      if (!("__TAURI_INTERNALS__" in window)) {
        throw new Error('Cost posting requires the governed desktop environment.');
      }

      await postLaborTimesheet({
        operationId: crypto.randomUUID(),
        timesheetId: timesheet.id,
        actor: currentUser,
        postedAt: new Date().toISOString().slice(0, 10),
      });

      setSuccessMessage('Labor costs posted to Cost Entries successfully.');
      await onRefresh();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to post timesheet actuals.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmReversal = async () => {
    if (!timesheet?.id || !reversalReason.trim()) {
      setErrorMessage('Reversal reason is required.');
      return;
    }
    try {
      setIsProcessing(true);
      setErrorMessage(null);

      if (!("__TAURI_INTERNALS__" in window)) {
        throw new Error('Reversal requires the governed desktop environment.');
      }

      await reverseLaborTimesheet({
        operationId: crypto.randomUUID(),
        timesheetId: timesheet.id,
        actor: currentUser,
        reason: reversalReason.trim(),
        reversedAt: new Date().toISOString().slice(0, 10),
      });

      setShowReversalPrompt(false);
      setSuccessMessage('Timesheet reversed and offsetting cost entries posted.');
      await onRefresh();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reverse timesheet.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden border border-neutral-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 text-primary-700 rounded-lg">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-neutral-900">
                  {isExisting ? `Labor Timesheet #${timesheetNumber}` : 'New Labor Timesheet'}
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    currentStatus === 'Approved'
                      ? 'bg-emerald-100 text-emerald-800'
                      : currentStatus === 'Posted'
                      ? 'bg-blue-100 text-blue-800'
                      : currentStatus === 'Submitted'
                      ? 'bg-amber-100 text-amber-800'
                      : currentStatus === 'Reversed'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-neutral-100 text-neutral-700'
                  }`}
                >
                  {currentStatus}
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                Governed actual labor hours, rates, worker shifts, and ledger cost posting
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Messages */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-sm text-rose-800">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2 text-sm text-emerald-800">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Header Metadata Grid */}
          <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Project *</label>
              <select
                disabled={!isEditable}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-neutral-900 disabled:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Contract *</label>
              <select
                disabled={!isEditable}
                value={contractId}
                onChange={(e) => setContractId(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-neutral-900 disabled:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              >
                {filteredContracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contract_number ? `${c.contract_number} - ` : ''}
                    {c.title || c.id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Timesheet Number *</label>
              <input
                disabled={!isEditable}
                type="text"
                value={timesheetNumber}
                onChange={(e) => setTimesheetNumber(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-neutral-900 disabled:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Work Date *</label>
              <input
                disabled={!isEditable}
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-neutral-900 disabled:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Shift *</label>
              <select
                disabled={!isEditable}
                value={shift}
                onChange={(e) => setShift(e.target.value as any)}
                className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-neutral-900 disabled:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              >
                <option value="Day">Day</option>
                <option value="Night">Night</option>
                <option value="Shift 1">Shift 1</option>
                <option value="Shift 2">Shift 2</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Crew Name</label>
              <input
                disabled={!isEditable}
                type="text"
                placeholder="e.g. Masonry Crew Alpha"
                value={crewName}
                onChange={(e) => setCrewName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-neutral-900 disabled:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Submitter *</label>
              <input
                disabled={!isEditable}
                type="text"
                value={submitter}
                onChange={(e) => setSubmitter(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-neutral-900 disabled:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Notes / Description</label>
              <input
                disabled={!isEditable}
                type="text"
                placeholder="Notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-neutral-900 disabled:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>
          </div>

          {/* Metrics Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-3">
              <div className="text-xs text-primary-700 font-medium">Workers Logged</div>
              <div className="text-xl font-bold text-primary-900">{lines.length}</div>
            </div>
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3">
              <div className="text-xs text-neutral-600 font-medium">Regular Hours</div>
              <div className="text-xl font-bold text-neutral-900">{totals.total_regular_hours} hrs</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="text-xs text-amber-700 font-medium">Overtime Hours</div>
              <div className="text-xl font-bold text-amber-900">{totals.total_overtime_hours} hrs</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <div className="text-xs text-emerald-700 font-medium">Total Labor Cost</div>
              <div className="text-xl font-bold text-emerald-900">
                {currencySymbol}
                {totals.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Validation Warnings */}
          {validationIssues.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1.5 text-xs text-amber-900">
              <div className="font-semibold flex items-center gap-1.5 text-amber-900 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Validation Feedback ({validationIssues.length})</span>
              </div>
              {validationIssues.map((issue, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <span className="font-mono text-amber-700">•</span>
                  <span>{issue.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Lines Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                <span>Labor Hours & Activity Allocations</span>
                <span className="text-xs font-normal text-neutral-500">({lines.length} lines)</span>
              </h3>
              {isEditable && (
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-medium shadow-sm transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Worker Line</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto border border-neutral-200 rounded-xl bg-white">
              <table className="w-full text-xs text-left">
                <thead className="bg-neutral-100 text-neutral-700 font-semibold border-b border-neutral-200">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3 min-w-[160px]">Worker *</th>
                    <th className="py-2.5 px-3 min-w-[180px]">Schedule Activity *</th>
                    <th className="py-2.5 px-3 min-w-[160px]">Control Account *</th>
                    <th className="py-2.5 px-3 text-right">Reg Hrs</th>
                    <th className="py-2.5 px-3 text-right">Reg Rate</th>
                    <th className="py-2.5 px-3 text-right">OT Hrs</th>
                    <th className="py-2.5 px-3 text-right">OT Rate</th>
                    <th className="py-2.5 px-3 text-right">Total Amt</th>
                    <th className="py-2.5 px-3 min-w-[140px]">Non-Working Reason</th>
                    {isEditable && <th className="py-2.5 px-3 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-neutral-400">
                        No labor lines added yet. Click &quot;Add Worker Line&quot; to begin logging hours.
                      </td>
                    </tr>
                  ) : (
                    lines.map((line, idx) => (
                      <tr key={line.id || idx} className="hover:bg-neutral-50 transition-colors">
                        <td className="py-2 px-3 text-neutral-400 font-mono">{idx + 1}</td>
                        <td className="py-2 px-3">
                          <select
                            disabled={!isEditable}
                            value={line.resource_id}
                            onChange={(e) => handleUpdateLine(idx, { resource_id: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-neutral-300 bg-white text-neutral-900 disabled:bg-neutral-100 text-xs"
                          >
                            <option value="">-- Select Worker --</option>
                            {laborResources.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.resource_name || r.resource_code || r.id} {r.role_or_type ? `(${r.role_or_type})` : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <select
                            disabled={!isEditable}
                            value={line.schedule_activity_id}
                            onChange={(e) => handleUpdateLine(idx, { schedule_activity_id: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-neutral-300 bg-white text-neutral-900 disabled:bg-neutral-100 text-xs"
                          >
                            <option value="">-- Select Activity --</option>
                            {filteredActivities.map((act) => (
                              <option key={act.id} value={act.id}>
                                {act.activity_code ? `${act.activity_code} - ` : ''}
                                {act.activity || act.boq_item_name || act.id}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <select
                            disabled={!isEditable}
                            value={line.control_account_id}
                            onChange={(e) => handleUpdateLine(idx, { control_account_id: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-neutral-300 bg-white text-neutral-900 disabled:bg-neutral-100 text-xs"
                          >
                            <option value="">-- Select Control Account --</option>
                            {filteredControlAccounts.map((ca) => (
                              <option key={ca.id} value={ca.id}>
                                {ca.control_account_code ? `${ca.control_account_code} - ` : ''}
                                {ca.description || ca.title || ca.id}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            disabled={!isEditable}
                            type="number"
                            min="0"
                            max="24"
                            step="0.5"
                            value={line.regular_hours}
                            onChange={(e) => handleUpdateLine(idx, { regular_hours: parseFloat(e.target.value) || 0 })}
                            className="w-16 px-2 py-1 rounded border border-neutral-300 bg-white text-right disabled:bg-neutral-100 text-xs font-mono"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            disabled={!isEditable}
                            type="number"
                            min="0"
                            step="1"
                            value={line.regular_rate}
                            onChange={(e) => handleUpdateLine(idx, { regular_rate: parseFloat(e.target.value) || 0 })}
                            className="w-16 px-2 py-1 rounded border border-neutral-300 bg-white text-right disabled:bg-neutral-100 text-xs font-mono"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            disabled={!isEditable}
                            type="number"
                            min="0"
                            max="24"
                            step="0.5"
                            value={line.overtime_hours}
                            onChange={(e) => handleUpdateLine(idx, { overtime_hours: parseFloat(e.target.value) || 0 })}
                            className="w-16 px-2 py-1 rounded border border-neutral-300 bg-white text-right disabled:bg-neutral-100 text-xs font-mono"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            disabled={!isEditable}
                            type="number"
                            min="0"
                            step="1"
                            value={line.overtime_rate}
                            onChange={(e) => handleUpdateLine(idx, { overtime_rate: parseFloat(e.target.value) || 0 })}
                            className="w-16 px-2 py-1 rounded border border-neutral-300 bg-white text-right disabled:bg-neutral-100 text-xs font-mono"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold text-neutral-900">
                          {currencySymbol}
                          {line.calculated_amount.toFixed(2)}
                        </td>
                        <td className="py-2 px-3">
                          <input
                            disabled={!isEditable}
                            type="text"
                            placeholder="Override reason..."
                            value={line.non_working_override_reason || ''}
                            onChange={(e) => handleUpdateLine(idx, { non_working_override_reason: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-neutral-300 bg-white disabled:bg-neutral-100 text-xs"
                          />
                        </td>
                        {isEditable && (
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteLine(idx)}
                              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audit / Governance History */}
          {timesheet && (timesheet.approved_by || timesheet.posted_by || timesheet.reversed_by) && (
            <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 space-y-2 text-xs text-neutral-600">
              <div className="font-semibold text-neutral-800 flex items-center gap-1.5">
                <History className="w-4 h-4 text-neutral-500" />
                <span>Governance & Audit Trail</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {timesheet.approved_by && (
                  <div>
                    <span className="font-medium text-neutral-700">Approved by: </span>
                    <span>{timesheet.approved_by} ({timesheet.approved_at || 'Recorded'})</span>
                  </div>
                )}
                {timesheet.posted_by && (
                  <div>
                    <span className="font-medium text-neutral-700">Posted by: </span>
                    <span>{timesheet.posted_by} ({timesheet.posted_at || 'Recorded'})</span>
                  </div>
                )}
                {timesheet.reversed_by && (
                  <div>
                    <span className="font-medium text-rose-700">Reversed by: </span>
                    <span>
                      {timesheet.reversed_by} ({timesheet.reversed_at || 'Recorded'}) - &quot;{timesheet.reversal_reason}&quot;
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-neutral-700 hover:bg-neutral-200 rounded-lg text-xs font-semibold transition-colors"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            {isEditable && (
              <>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleSave}
                  className="px-4 py-2 bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-700 rounded-lg text-xs font-semibold shadow-sm transition-colors"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  disabled={isProcessing || hasErrors || lines.length === 0}
                  onClick={handleSubmit}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit for Approval</span>
                </button>
              </>
            )}

            {currentStatus === 'Submitted' && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleApprove}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Approve Timesheet</span>
              </button>
            )}

            {currentStatus === 'Approved' && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={handlePost}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Post Actuals to Cost Entries</span>
              </button>
            )}

            {currentStatus === 'Posted' && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setShowReversalPrompt(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reverse Timesheet</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Reversal Reason Modal */}
      {showReversalPrompt && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-rose-200">
            <div className="flex items-center gap-2 text-rose-700 font-bold">
              <RotateCcw className="w-5 h-5" />
              <h3 className="text-base">Reverse Labor Timesheet</h3>
            </div>
            <p className="text-xs text-neutral-600">
              Reversing will create negative offsetting cost entries in the ledger and permanently freeze this timesheet.
              Please provide a clear justification:
            </p>
            <textarea
              rows={3}
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              placeholder="e.g. Timesheet submitted for wrong crew shift..."
              className="w-full p-2.5 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReversalPrompt(false)}
                className="px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!reversalReason.trim() || isProcessing}
                onClick={handleConfirmReversal}
                className="px-3 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg disabled:opacity-50"
              >
                Confirm Reversal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

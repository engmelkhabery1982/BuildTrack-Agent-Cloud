import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Wrench,
  Clock,
  DollarSign,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Send,
  ShieldCheck,
  RotateCcw,
  Calendar,
  FileText,
  History,
  Lock,
  Fuel,
} from 'lucide-react';
import type {
  EquipmentLog,
  EquipmentLogStatus,
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
  calculateEquipmentLogTotals,
  validateEquipmentLog,
  approveEquipmentLog,
  postEquipmentLog,
  reverseEquipmentLog,
  type EquipmentLogValidationIssue,
} from '../data/equipmentLog';

interface EquipmentLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  log: Partial<EquipmentLog> | null;
  projects: Project[];
  contracts: Contract[];
  controlAccounts: ControlAccount[];
  schedules: Schedule[];
  resourceMasters: ResourceMaster[];
  reportingPeriods?: ReportingPeriod[];
  workCalendars?: WorkCalendar[];
  costCodes?: CostCode[];
  allLogs?: EquipmentLog[];
  onSaveDraft: (log: Partial<EquipmentLog>) => Promise<void>;
  onRefresh: () => Promise<void>;
  currentUser?: string;
  currencySymbol?: string;
  dataDate?: string;
}

export const EquipmentLogModal: React.FC<EquipmentLogModalProps> = ({
  isOpen,
  onClose,
  log,
  projects = [],
  contracts = [],
  controlAccounts = [],
  schedules = [],
  resourceMasters = [],
  reportingPeriods = [],
  workCalendars = [],
  costCodes = [],
  allLogs = [],
  onSaveDraft,
  onRefresh,
  currentUser = 'Site Engineer',
  currencySymbol = '$',
  dataDate,
}) => {
  const isExisting = Boolean(log?.id);
  const currentStatus: EquipmentLogStatus = (log?.status as EquipmentLogStatus) || 'Draft';
  const isEditable = currentStatus === 'Draft';

  // Form State
  const [projectId, setProjectId] = useState(log?.project_id || (projects[0]?.id ?? ''));
  const [contractId, setContractId] = useState(log?.contract_id || (contracts[0]?.id ?? ''));
  const [logNumber, setLogNumber] = useState(
    log?.log_number || `EQ-LOG-${new Date().toISOString().slice(0, 10)}-001`
  );
  const [logDate, setLogDate] = useState(
    log?.log_date || (dataDate ? dataDate.slice(0, 10) : new Date().toISOString().slice(0, 10))
  );
  const [shift, setShift] = useState(log?.shift || 'Day');
  const [resourceId, setResourceId] = useState(log?.resource_id || '');
  const [scheduleActivityId, setScheduleActivityId] = useState(log?.schedule_activity_id || '');
  const [controlAccountId, setControlAccountId] = useState(log?.control_account_id || '');
  const [costCodeId, setCostCodeId] = useState(log?.cost_code_id || '');
  const [operatorName, setOperatorName] = useState(log?.operator_name || currentUser);

  const [meterStart, setMeterStart] = useState<number>(Number(log?.meter_start) || 0);
  const [meterEnd, setMeterEnd] = useState<number>(Number(log?.meter_end) || 0);
  const [operatingHours, setOperatingHours] = useState<number>(Number(log?.operating_hours) || 8);
  const [idleHours, setIdleHours] = useState<number>(Number(log?.idle_hours) || 0);
  const [breakdownHours, setBreakdownHours] = useState<number>(Number(log?.breakdown_hours) || 0);
  const [hoursOverrideReason, setHoursOverrideReason] = useState(log?.hours_override_reason || '');
  const [hourlyRate, setHourlyRate] = useState<number>(Number(log?.hourly_rate) || 150);
  const [fuelQuantity, setFuelQuantity] = useState<number>(Number(log?.fuel_quantity) || 0);
  const [fuelRate, setFuelRate] = useState<number>(Number(log?.fuel_rate) || 4.2);
  const [notes, setNotes] = useState(log?.notes || '');

  // Workflow / Reversal state
  const [reversalReason, setReversalReason] = useState('');
  const [showReversePrompt, setShowReversePrompt] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (log) {
      setProjectId(log.project_id || (projects[0]?.id ?? ''));
      setContractId(log.contract_id || (contracts[0]?.id ?? ''));
      setLogNumber(log.log_number || `EQ-LOG-${new Date().toISOString().slice(0, 10)}-001`);
      setLogDate(log.log_date || (dataDate ? dataDate.slice(0, 10) : new Date().toISOString().slice(0, 10)));
      setShift(log.shift || 'Day');
      setResourceId(log.resource_id || '');
      setScheduleActivityId(log.schedule_activity_id || '');
      setControlAccountId(log.control_account_id || '');
      setCostCodeId(log.cost_code_id || '');
      setOperatorName(log.operator_name || currentUser);
      setMeterStart(Number(log.meter_start) || 0);
      setMeterEnd(Number(log.meter_end) || 0);
      setOperatingHours(Number(log.operating_hours) || 8);
      setIdleHours(Number(log.idle_hours) || 0);
      setBreakdownHours(Number(log.breakdown_hours) || 0);
      setHoursOverrideReason(log.hours_override_reason || '');
      setHourlyRate(Number(log.hourly_rate) || 150);
      setFuelQuantity(Number(log.fuel_quantity) || 0);
      setFuelRate(Number(log.fuel_rate) || 4.2);
      setNotes(log.notes || '');
    }
  }, [log, dataDate, currentUser, projects, contracts]);

  // Filtered equipment resource masters
  const equipmentResources = useMemo(() => {
    return resourceMasters.filter(
      (r) => r.resource_type === 'Equipment' && r.status !== 'Inactive' && r.status !== 'Decommissioned'
    );
  }, [resourceMasters]);

  // When equipment is selected, auto-fill hourly rate if available
  useEffect(() => {
    if (resourceId) {
      const eq = equipmentResources.find((r) => r.id === resourceId);
      if (eq && Number(eq.standard_rate) > 0) {
        setHourlyRate(Number(eq.standard_rate));
      }
    }
  }, [resourceId, equipmentResources]);

  // Filtered schedules & control accounts
  const filteredActivities = useMemo(() => {
    return schedules.filter((s) => {
      if (projectId && s.project_id && s.project_id !== projectId) return false;
      if (contractId && s.contract_id && s.contract_id !== contractId) return false;
      return true;
    });
  }, [schedules, projectId, contractId]);

  const filteredControlAccounts = useMemo(() => {
    return controlAccounts.filter((ca) => {
      if (projectId && ca.project_id && ca.project_id !== projectId) return false;
      if (contractId && ca.contract_id && ca.contract_id !== contractId) return false;
      return true;
    });
  }, [controlAccounts, projectId, contractId]);

  // Calculated totals
  const totals = useMemo(() => {
    return calculateEquipmentLogTotals({
      meter_start: meterStart,
      meter_end: meterEnd,
      operating_hours: operatingHours,
      idle_hours: idleHours,
      breakdown_hours: breakdownHours,
      hourly_rate: hourlyRate,
      fuel_quantity: fuelQuantity,
      fuel_rate: fuelRate,
    });
  }, [meterStart, meterEnd, operatingHours, idleHours, breakdownHours, hourlyRate, fuelQuantity, fuelRate]);

  // Validation issues
  const validationIssues = useMemo(() => {
    const currentLogState: Partial<EquipmentLog> = {
      id: log?.id,
      project_id: projectId,
      contract_id: contractId,
      log_number: logNumber,
      log_date: logDate,
      shift,
      resource_id: resourceId,
      schedule_activity_id: scheduleActivityId,
      control_account_id: controlAccountId,
      meter_start: meterStart,
      meter_end: meterEnd,
      operating_hours: operatingHours,
      idle_hours: idleHours,
      breakdown_hours: breakdownHours,
      hours_override_reason: hoursOverrideReason,
      hourly_rate: hourlyRate,
      fuel_quantity: fuelQuantity,
      fuel_rate: fuelRate,
      status: currentStatus,
    };

    return validateEquipmentLog(currentLogState, {
      resourceMasters,
      schedules,
      controlAccounts,
      reportingPeriods,
      existingLogs: allLogs,
      dataDate,
    });
  }, [
    log?.id,
    projectId,
    contractId,
    logNumber,
    logDate,
    shift,
    resourceId,
    scheduleActivityId,
    controlAccountId,
    meterStart,
    meterEnd,
    operatingHours,
    idleHours,
    breakdownHours,
    hoursOverrideReason,
    hourlyRate,
    fuelQuantity,
    fuelRate,
    currentStatus,
    resourceMasters,
    schedules,
    controlAccounts,
    reportingPeriods,
    allLogs,
    dataDate,
  ]);

  const hasErrors = validationIssues.some((i) => i.severity === 'error');

  const buildLogPayload = (statusOverride?: EquipmentLogStatus): Partial<EquipmentLog> => ({
    id: log?.id || `eq-log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    project_id: projectId,
    contract_id: contractId,
    log_number: logNumber,
    log_date: logDate,
    shift,
    resource_id: resourceId,
    schedule_activity_id: scheduleActivityId,
    control_account_id: controlAccountId,
    cost_code_id: costCodeId || null,
    operator_name: operatorName,
    meter_start: meterStart,
    meter_end: meterEnd,
    meter_hours: totals.meter_hours,
    operating_hours: operatingHours,
    idle_hours: idleHours,
    breakdown_hours: breakdownHours,
    total_hours: totals.total_hours,
    hours_override_reason: hoursOverrideReason || null,
    hourly_rate: hourlyRate,
    equipment_cost: totals.equipment_cost,
    fuel_quantity: fuelQuantity,
    fuel_rate: fuelRate,
    fuel_cost: totals.fuel_cost,
    total_cost: totals.total_cost,
    status: statusOverride || currentStatus,
    notes,
    created_at: log?.created_at || new Date().toISOString(),
  });

  const handleSaveAsDraft = async () => {
    if (hasErrors) {
      setErrorMessage('Please resolve validation errors before saving.');
      return;
    }
    try {
      setActionLoading(true);
      setErrorMessage(null);
      await onSaveDraft(buildLogPayload('Draft'));
      await onRefresh();
      setSuccessMessage('Equipment log draft saved successfully.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save draft.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTransition = async (targetStatus: 'Submitted' | 'Approved' | 'Posted') => {
    if (hasErrors) {
      setErrorMessage('Please resolve validation errors before proceeding.');
      return;
    }
    try {
      setActionLoading(true);
      setErrorMessage(null);
      const payload = buildLogPayload(targetStatus);
      await onSaveDraft(payload);

      const opId = `op-eq-${Date.now()}`;
      if (targetStatus === 'Approved') {
        await approveEquipmentLog({
          operationId: opId,
          logId: payload.id!,
          actor: currentUser,
          approvedAt: new Date().toISOString(),
        });
      } else if (targetStatus === 'Posted') {
        await postEquipmentLog({
          operationId: opId,
          logId: payload.id!,
          actor: currentUser,
          postedAt: new Date().toISOString(),
        });
      }

      await onRefresh();
      setSuccessMessage(`Equipment log successfully transitioned to ${targetStatus} and cost entries posted.`);
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || `Failed to transition equipment log to ${targetStatus}.`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReverse = async () => {
    if (!reversalReason.trim()) {
      setErrorMessage('A mandatory reversal reason is required.');
      return;
    }
    try {
      setActionLoading(true);
      setErrorMessage(null);
      const opId = `op-rev-eq-${Date.now()}`;
      await reverseEquipmentLog({
        operationId: opId,
        logId: log?.id!,
        actor: currentUser,
        reason: reversalReason.trim(),
        reversedAt: new Date().toISOString(),
      });
      await onRefresh();
      setSuccessMessage('Equipment log successfully reversed with negative offsetting cost entries.');
      setShowReversePrompt(false);
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reverse equipment log.');
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600/30 rounded-xl border border-blue-400/30">
              <Wrench className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Equipment Meter, Operating & Fuel Log</h2>
              <p className="text-xs text-slate-400">
                Governed Equipment Utilization, Meter Tracking & Cost Ledger Integration
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <span
              className={`px-3 py-1 text-xs font-semibold rounded-full border ${
                currentStatus === 'Approved'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : currentStatus === 'Posted'
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                  : currentStatus === 'Reversed'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  : currentStatus === 'Submitted'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-slate-700 text-slate-300 border-slate-600'
              }`}
            >
              Status: {currentStatus}
            </span>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notifications */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-3 text-rose-800 text-sm">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-3 text-emerald-800 text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50">
          {/* Header Metadata Grid */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Project</label>
              <select
                disabled={!isEditable}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Main Contract</label>
              <select
                disabled={!isEditable}
                value={contractId}
                onChange={(e) => setContractId(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
              >
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c as any).contract_title || c.contract_number || c.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Log / Ticket #</label>
              <input
                type="text"
                disabled={!isEditable}
                value={logNumber}
                onChange={(e) => setLogNumber(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Log Date</label>
              <input
                type="date"
                disabled={!isEditable}
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Shift</label>
              <select
                disabled={!isEditable}
                value={shift}
                onChange={(e) => setShift(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
              >
                <option value="Day">Day Shift</option>
                <option value="Night">Night Shift</option>
                <option value="Shift 1">Shift 1</option>
                <option value="Shift 2">Shift 2</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Equipment Resource</label>
              <select
                disabled={!isEditable}
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
              >
                <option value="">-- Select Equipment --</option>
                {equipmentResources.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.resource_name || eq.resource_code || eq.id} {eq.role_or_type ? `(${eq.role_or_type})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Schedule Activity</label>
              <select
                disabled={!isEditable}
                value={scheduleActivityId}
                onChange={(e) => setScheduleActivityId(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
              >
                <option value="">-- Select Activity --</option>
                {filteredActivities.map((act) => (
                  <option key={act.id} value={act.id}>
                    {act.activity_code ? `${act.activity_code} - ` : ''}
                    {act.activity || act.boq_item_name || act.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Control Account</label>
              <select
                disabled={!isEditable}
                value={controlAccountId}
                onChange={(e) => setControlAccountId(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
              >
                <option value="">-- Select Control Account --</option>
                {filteredControlAccounts.map((ca) => (
                  <option key={ca.id} value={ca.id}>
                    {ca.control_account_code ? `${ca.control_account_code} - ` : ''}
                    {ca.description || ca.title || ca.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Meter Readings & Hours Panel */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>Meter & Operating Hours Tracking</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Meter Start Reading</label>
                <input
                  type="number"
                  step="0.1"
                  disabled={!isEditable}
                  value={meterStart}
                  onChange={(e) => setMeterStart(Number(e.target.value))}
                  className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Meter End Reading</label>
                <input
                  type="number"
                  step="0.1"
                  disabled={!isEditable}
                  value={meterEnd}
                  onChange={(e) => setMeterEnd(Number(e.target.value))}
                  className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Derived Meter Hours</label>
                <div className="w-full text-sm bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 font-mono font-semibold text-slate-700">
                  {totals.meter_hours.toFixed(1)} hrs
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Hourly Equipment Rate ({currencySymbol})</label>
                <input
                  type="number"
                  step="0.01"
                  disabled={!isEditable}
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(Number(e.target.value))}
                  className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Operating Hours</label>
                <input
                  type="number"
                  step="0.1"
                  disabled={!isEditable}
                  value={operatingHours}
                  onChange={(e) => setOperatingHours(Number(e.target.value))}
                  className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Idle Hours</label>
                <input
                  type="number"
                  step="0.1"
                  disabled={!isEditable}
                  value={idleHours}
                  onChange={(e) => setIdleHours(Number(e.target.value))}
                  className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Breakdown Hours</label>
                <input
                  type="number"
                  step="0.1"
                  disabled={!isEditable}
                  value={breakdownHours}
                  onChange={(e) => setBreakdownHours(Number(e.target.value))}
                  className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Total Shift Hours</label>
                <div className="w-full text-sm bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 font-mono font-semibold text-slate-700">
                  {totals.total_hours.toFixed(1)} hrs
                </div>
              </div>
            </div>

            {Math.abs(operatingHours - totals.meter_hours) > 0.01 && meterEnd >= meterStart && (
              <div>
                <label className="block text-xs font-medium text-amber-700 mb-1">
                  Hours Override Reason (Operating Hours differ from Meter Delta) *
                </label>
                <input
                  type="text"
                  disabled={!isEditable}
                  placeholder="Explain why operating hours differ from meter delta..."
                  value={hoursOverrideReason}
                  onChange={(e) => setHoursOverrideReason(e.target.value)}
                  className="w-full text-sm border border-amber-300 bg-amber-50 rounded-xl px-3 py-2 focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
            )}
          </div>

          {/* Fuel Consumption Panel */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-2">
              <Fuel className="w-4 h-4 text-amber-600" />
              <span>Fuel Consumption & Cost Tracking</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Fuel Quantity (Litres)</label>
                <input
                  type="number"
                  step="0.1"
                  disabled={!isEditable}
                  value={fuelQuantity}
                  onChange={(e) => setFuelQuantity(Number(e.target.value))}
                  className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Fuel Unit Rate ({currencySymbol})</label>
                <input
                  type="number"
                  step="0.01"
                  disabled={!isEditable}
                  value={fuelRate}
                  onChange={(e) => setFuelRate(Number(e.target.value))}
                  className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Fuel Cost Total</label>
                <div className="w-full text-sm bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 font-mono font-semibold text-slate-700">
                  {currencySymbol} {totals.fuel_cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>

          {/* Cost Summary Banner */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-5 rounded-2xl flex flex-col md:flex-row items-center justify-between shadow-lg">
            <div className="flex items-center space-x-4 mb-4 md:mb-0">
              <div className="p-3 bg-blue-600/30 rounded-xl border border-blue-400/30">
                <DollarSign className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Equipment Cost Breakdown</p>
                <p className="text-2xl font-black font-mono">
                  {currencySymbol} {totals.total_cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-6 text-sm text-slate-300 font-mono">
              <div>
                <span className="text-slate-400 text-xs block">Equipment Usage Cost:</span>
                <span className="font-bold text-white">
                  {currencySymbol} {totals.equipment_cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-xs block">Fuel Cost:</span>
                <span className="font-bold text-white">
                  {currencySymbol} {totals.fuel_cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Validation Issues / Warnings */}
          {validationIssues.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl space-y-2">
              <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Governance & Validation Warnings ({validationIssues.length})</span>
              </h4>
              <ul className="list-disc list-inside text-xs text-amber-900 space-y-1">
                {validationIssues.map((issue, idx) => (
                  <li key={idx}>
                    <span className="font-semibold">{issue.field}:</span> {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Reversal Prompt Modal section if requested */}
          {showReversePrompt && (
            <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl space-y-3">
              <h4 className="text-sm font-bold text-rose-900 flex items-center space-x-2">
                <RotateCcw className="w-4 h-4 text-rose-600" />
                <span>Confirm Reversal & Negative Cost Ledger Offsets</span>
              </h4>
              <p className="text-xs text-rose-700">
                Reversing this approved/posted equipment log will generate matching negative offsetting cost entries in the ledger while preserving the original audit trail. Please provide a formal reversal reason:
              </p>
              <input
                type="text"
                placeholder="Enter mandatory reversal reason..."
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                className="w-full text-sm border border-rose-300 bg-white rounded-xl px-3 py-2 focus:ring-2 focus:ring-rose-500 outline-none"
              />
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  onClick={() => setShowReversePrompt(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  disabled={actionLoading || !reversalReason.trim()}
                  onClick={handleReverse}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-700 disabled:opacity-50 flex items-center space-x-2"
                >
                  <span>Execute Atomic Reversal</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {isEditable ? 'Draft mode: Editable before approval and posting.' : `Locked state (${currentStatus}): Read-only governed record.`}
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Close
            </button>
            {isEditable && (
              <button
                disabled={actionLoading || hasErrors}
                onClick={handleSaveAsDraft}
                className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl transition-colors shadow-sm disabled:opacity-50"
              >
                Save Draft
              </button>
            )}
            {currentStatus === 'Draft' && (
              <button
                disabled={actionLoading || hasErrors}
                onClick={() => handleTransition('Submitted')}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-md disabled:opacity-50 flex items-center space-x-2"
              >
                <Send className="w-4 h-4" />
                <span>Submit & Approve</span>
              </button>
            )}
            {(currentStatus === 'Submitted' || currentStatus === 'Approved') && (
              <button
                disabled={actionLoading || hasErrors}
                onClick={() => handleTransition('Posted')}
                className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-md disabled:opacity-50 flex items-center space-x-2"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Post Cost Entries</span>
              </button>
            )}
            {currentStatus === 'Posted' && !showReversePrompt && (
              <button
                onClick={() => setShowReversePrompt(true)}
                className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-md flex items-center space-x-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reverse Log</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

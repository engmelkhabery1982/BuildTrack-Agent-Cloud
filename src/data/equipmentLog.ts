import type { EquipmentLog, EquipmentLogStatus } from '../types';

export interface EquipmentLogOperationResult {
  operationId: string;
  logId: string;
  status: EquipmentLogStatus;
  message?: string;
}

export interface EquipmentLogValidationIssue {
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export function calculateEquipmentLogTotals(log: {
  meter_start?: number;
  meter_end?: number;
  operating_hours?: number;
  idle_hours?: number;
  breakdown_hours?: number;
  hourly_rate?: number;
  fuel_quantity?: number;
  fuel_rate?: number;
}): {
  meter_hours: number;
  total_hours: number;
  equipment_cost: number;
  fuel_cost: number;
  total_cost: number;
} {
  const meterStart = Number(log.meter_start) || 0;
  const meterEnd = Number(log.meter_end) || 0;
  const meter_hours = Math.round(Math.max(0, meterEnd - meterStart) * 100) / 100;

  const opHours = Number(log.operating_hours) || 0;
  const idleHours = Number(log.idle_hours) || 0;
  const bdHours = Number(log.breakdown_hours) || 0;
  const total_hours = Math.round((opHours + idleHours + bdHours) * 100) / 100;

  const hrRate = Number(log.hourly_rate) || 0;
  const fuelQty = Number(log.fuel_quantity) || 0;
  const fuelRt = Number(log.fuel_rate) || 0;

  const equipment_cost = Math.round((opHours * hrRate) * 100) / 100;
  const fuel_cost = Math.round((fuelQty * fuelRt) * 100) / 100;
  const total_cost = Math.round((equipment_cost + fuel_cost) * 100) / 100;

  return {
    meter_hours,
    total_hours,
    equipment_cost,
    fuel_cost,
    total_cost,
  };
}

export function validateEquipmentLog(
  log: Partial<EquipmentLog>,
  context: {
    resourceMasters: Record<string, any>[];
    schedules: Record<string, any>[];
    controlAccounts: Record<string, any>[];
    reportingPeriods?: Record<string, any>[];
    existingLogs?: Record<string, any>[];
    dataDate?: string;
  }
): EquipmentLogValidationIssue[] {
  const issues: EquipmentLogValidationIssue[] = [];

  if (!log.project_id) {
    issues.push({ field: 'project_id', message: 'Project is required.', severity: 'error' });
  }
  if (!log.contract_id) {
    issues.push({ field: 'contract_id', message: 'Main contract is required.', severity: 'error' });
  }
  if (!log.log_number?.trim()) {
    issues.push({ field: 'log_number', message: 'Log / Ticket number is required.', severity: 'error' });
  }
  if (!log.log_date) {
    issues.push({ field: 'log_date', message: 'Log date is required.', severity: 'error' });
  }
  if (!log.shift) {
    issues.push({ field: 'shift', message: 'Shift is required.', severity: 'error' });
  }

  if (context.dataDate && log.log_date && log.log_date > context.dataDate) {
    issues.push({
      field: 'log_date',
      message: `Log date (${log.log_date}) is after reporting Data Date (${context.dataDate}).`,
      severity: 'error',
    });
  }

  // Locked reporting period
  if (log.log_date && context.reportingPeriods?.length) {
    const lockedPeriod = context.reportingPeriods.find((p) => {
      if (p.project_id && p.project_id !== log.project_id) return false;
      const status = p.status || 'Open';
      if (status === 'Open') return false;
      const start = p.start_date || p.cutoff_date;
      const end = p.end_date || p.cutoff_date;
      return log.log_date! >= start && log.log_date! <= end;
    });
    if (lockedPeriod) {
      issues.push({
        field: 'log_date',
        message: `Log date falls in a ${lockedPeriod.status} reporting period (${lockedPeriod.period_name || lockedPeriod.period_code}).`,
        severity: 'error',
      });
    }
  }

  // Validate Resource Master (Equipment)
  if (!log.resource_id) {
    issues.push({ field: 'resource_id', message: 'Equipment resource is required.', severity: 'error' });
  } else {
    const resource = context.resourceMasters.find((r) => r.id === log.resource_id);
    if (!resource) {
      issues.push({ field: 'resource_id', message: 'Equipment resource was not found.', severity: 'error' });
    } else {
      if (resource.resource_type !== 'Equipment') {
        issues.push({ field: 'resource_id', message: `Resource "${resource.name || resource.resource_name}" is not of type 'Equipment'.`, severity: 'error' });
      }
      if (resource.status && (resource.status === 'Inactive' || resource.status === 'Decommissioned')) {
        issues.push({ field: 'resource_id', message: `Equipment "${resource.name || resource.resource_name}" is ${resource.status}.`, severity: 'error' });
      }
    }
  }

  // Validate Schedule Activity
  if (!log.schedule_activity_id) {
    issues.push({ field: 'schedule_activity_id', message: 'Schedule activity is required.', severity: 'error' });
  } else {
    const activity = context.schedules.find((s) => s.id === log.schedule_activity_id);
    if (!activity) {
      issues.push({ field: 'schedule_activity_id', message: 'Schedule activity not found.', severity: 'error' });
    } else {
      if (activity.project_id && log.project_id && activity.project_id !== log.project_id) {
        issues.push({ field: 'schedule_activity_id', message: 'Activity belongs to another project.', severity: 'error' });
      }
      if (activity.contract_id && log.contract_id && activity.contract_id !== log.contract_id) {
        issues.push({ field: 'schedule_activity_id', message: 'Activity belongs to another contract.', severity: 'error' });
      }
    }
  }

  // Validate Control Account
  if (!log.control_account_id) {
    issues.push({ field: 'control_account_id', message: 'Control account is required.', severity: 'error' });
  } else {
    const ca = context.controlAccounts.find((c) => c.id === log.control_account_id);
    if (!ca) {
      issues.push({ field: 'control_account_id', message: 'Control account not found.', severity: 'error' });
    } else if (ca.project_id && log.project_id && ca.project_id !== log.project_id) {
      issues.push({ field: 'control_account_id', message: 'Control account belongs to another project.', severity: 'error' });
    }
  }

  // Meter Readings & Rollback
  const meterStart = Number(log.meter_start) || 0;
  const meterEnd = Number(log.meter_end) || 0;
  if (meterEnd < meterStart) {
    issues.push({
      field: 'meter_end',
      message: `Meter rollback: End reading (${meterEnd}) cannot be less than start reading (${meterStart}).`,
      severity: 'error',
    });
  }

  const meterHours = Math.round((meterEnd - meterStart) * 100) / 100;
  const opHours = Number(log.operating_hours) || 0;
  if (meterEnd > meterStart && opHours !== meterHours && !log.hours_override_reason?.trim()) {
    issues.push({
      field: 'hours_override_reason',
      message: `Operating hours (${opHours}) differs from meter hours (${meterHours}); documented override reason is required.`,
      severity: 'error',
    });
  }

  // Non-negative checks
  const idleHours = Number(log.idle_hours) || 0;
  const bdHours = Number(log.breakdown_hours) || 0;
  if (opHours < 0 || idleHours < 0 || bdHours < 0) {
    issues.push({ field: 'operating_hours', message: 'Hours cannot be negative.', severity: 'error' });
  }

  const hrRate = Number(log.hourly_rate) || 0;
  const fuelQty = Number(log.fuel_quantity) || 0;
  const fuelRt = Number(log.fuel_rate) || 0;
  if (hrRate < 0 || fuelQty < 0 || fuelRt < 0) {
    issues.push({ field: 'hourly_rate', message: 'Rates and fuel quantity cannot be negative.', severity: 'error' });
  }

  const totalH = opHours + idleHours + bdHours;
  if (totalH <= 0 && fuelQty <= 0) {
    issues.push({ field: 'total_hours', message: 'Must record operational/standby hours or fuel consumption.', severity: 'error' });
  }
  if (totalH > 24) {
    issues.push({ field: 'total_hours', message: `Total hours (${totalH}) cannot exceed 24 in a single shift.`, severity: 'error' });
  }

  // Overlap Detection with other active logs
  if (context.existingLogs && log.resource_id && log.log_date && log.shift && meterEnd > meterStart) {
    const overlapping = context.existingLogs.find((other) => {
      if (other.id === log.id || other.resource_id !== log.resource_id) return false;
      if (other.log_date !== log.log_date || other.shift !== log.shift) return false;
      if (other.status === 'Reversed') return false;
      const otherStart = Number(other.meter_start) || 0;
      const otherEnd = Number(other.meter_end) || 0;
      return meterStart < otherEnd && meterEnd > otherStart;
    });

    if (overlapping) {
      issues.push({
        field: 'meter_start',
        message: `Meter readings (${meterStart} - ${meterEnd}) overlap with log #${overlapping.log_number} on ${log.log_date} (${log.shift}).`,
        severity: 'error',
      });
    }
  }

  return issues;
}

async function invokeEquipment<T>(command: string, request: Record<string, unknown>): Promise<T> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(command, { request });
  }
  throw new Error('Tauri desktop backend required for native atomic posting.');
}

export const approveEquipmentLog = (request: {
  operationId: string;
  logId: string;
  actor: string;
  approvedAt: string;
}) => invokeEquipment<EquipmentLogOperationResult>('approve_equipment_log', request);

export const postEquipmentLog = (request: {
  operationId: string;
  logId: string;
  actor: string;
  postedAt: string;
}) => invokeEquipment<EquipmentLogOperationResult>('post_equipment_log', request);

export const reverseEquipmentLog = (request: {
  operationId: string;
  logId: string;
  actor: string;
  reason: string;
  reversedAt: string;
}) => invokeEquipment<EquipmentLogOperationResult>('reverse_equipment_log', request);

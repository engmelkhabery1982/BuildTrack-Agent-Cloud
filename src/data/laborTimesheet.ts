import type { LaborTimesheet, LaborTimesheetLine, LaborTimesheetStatus } from '../types';

export interface LaborTimesheetOperationResult {
  operationId: string;
  timesheetId: string;
  status: LaborTimesheetStatus;
  postedCostEntriesCount?: number;
  message?: string;
}

export interface ValidationIssue {
  lineIndex?: number;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export function calculateLaborLineTotal(line: {
  regular_hours: number;
  regular_rate: number;
  overtime_hours: number;
  overtime_rate: number;
}): { total_hours: number; calculated_amount: number } {
  const regHours = Number(line.regular_hours) || 0;
  const regRate = Number(line.regular_rate) || 0;
  const otHours = Number(line.overtime_hours) || 0;
  const otRate = Number(line.overtime_rate) || 0;
  const total_hours = Math.round((regHours + otHours) * 100) / 100;
  const calculated_amount = Math.round((regHours * regRate + otHours * otRate) * 100) / 100;
  return { total_hours, calculated_amount };
}

export function calculateLaborTimesheetTotals(lines: LaborTimesheetLine[]): {
  total_regular_hours: number;
  total_overtime_hours: number;
  total_amount: number;
} {
  let total_regular_hours = 0;
  let total_overtime_hours = 0;
  let total_amount = 0;

  for (const line of lines) {
    const regHours = Number(line.regular_hours) || 0;
    const otHours = Number(line.overtime_hours) || 0;
    const regRate = Number(line.regular_rate) || 0;
    const otRate = Number(line.overtime_rate) || 0;
    total_regular_hours += regHours;
    total_overtime_hours += otHours;
    total_amount += (regHours * regRate) + (otHours * otRate);
  }

  return {
    total_regular_hours: Math.round(total_regular_hours * 100) / 100,
    total_overtime_hours: Math.round(total_overtime_hours * 100) / 100,
    total_amount: Math.round(total_amount * 100) / 100,
  };
}

export function validateLaborTimesheet(
  timesheet: Partial<LaborTimesheet>,
  lines: LaborTimesheetLine[],
  context: {
    resourceMasters: Record<string, any>[];
    schedules: Record<string, any>[];
    controlAccounts: Record<string, any>[];
    reportingPeriods?: Record<string, any>[];
    workCalendars?: Record<string, any>[];
    existingTimesheets?: Record<string, any>[];
    existingLines?: Record<string, any>[];
    dataDate?: string;
  }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!timesheet.project_id) {
    issues.push({ field: 'project_id', message: 'Project is required.', severity: 'error' });
  }
  if (!timesheet.contract_id) {
    issues.push({ field: 'contract_id', message: 'Main contract is required.', severity: 'error' });
  }
  if (!timesheet.work_date) {
    issues.push({ field: 'work_date', message: 'Work date is required.', severity: 'error' });
  }
  if (!timesheet.shift) {
    issues.push({ field: 'shift', message: 'Shift is required.', severity: 'error' });
  }
  if (!timesheet.submitter?.trim()) {
    issues.push({ field: 'submitter', message: 'Submitter name is required.', severity: 'error' });
  }

  if (context.dataDate && timesheet.work_date && timesheet.work_date > context.dataDate) {
    issues.push({
      field: 'work_date',
      message: `Work date (${timesheet.work_date}) is after reporting Data Date (${context.dataDate}).`,
      severity: 'error',
    });
  }

  // Check locked reporting period
  if (timesheet.work_date && context.reportingPeriods?.length) {
    const lockedPeriod = context.reportingPeriods.find((p) => {
      if (p.project_id && p.project_id !== timesheet.project_id) return false;
      const status = p.status || 'Open';
      if (status === 'Open') return false;
      const start = p.start_date || p.cutoff_date;
      const end = p.end_date || p.cutoff_date;
      return timesheet.work_date! >= start && timesheet.work_date! <= end;
    });
    if (lockedPeriod) {
      issues.push({
        field: 'work_date',
        message: `Work date falls in a ${lockedPeriod.status} reporting period (${lockedPeriod.period_name || lockedPeriod.period_code}).`,
        severity: 'error',
      });
    }
  }

  // Check work calendar
  let isNonWorkingDay = false;
  if (timesheet.work_date && context.workCalendars?.length) {
    const calendar = context.workCalendars.find((c) => !c.project_id || c.project_id === timesheet.project_id);
    if (calendar) {
      const dateObj = new Date(timesheet.work_date + 'T00:00:00');
      const dayOfWeek = dateObj.getDay(); // 0 = Sun, 5 = Fri, 6 = Sat
      const workingDays = Array.isArray(calendar.working_days) ? calendar.working_days : [0, 1, 2, 3, 4]; // default Sun-Thu
      const holidays = Array.isArray(calendar.holidays) ? calendar.holidays : [];
      if (!workingDays.includes(dayOfWeek) || holidays.includes(timesheet.work_date)) {
        isNonWorkingDay = true;
      }
    }
  }

  if (!lines || lines.length === 0) {
    issues.push({ message: 'Timesheet must contain at least one labor line.', severity: 'error' });
    return issues;
  }

  const seenWorkerInShift = new Set<string>();

  lines.forEach((line, index) => {
    if (!line.resource_id) {
      issues.push({ lineIndex: index, field: 'resource_id', message: `Line #${index + 1}: Worker is required.`, severity: 'error' });
    } else {
      const resource = context.resourceMasters.find((r) => r.id === line.resource_id);
      if (!resource) {
        issues.push({ lineIndex: index, field: 'resource_id', message: `Line #${index + 1}: Resource not found.`, severity: 'error' });
      } else {
        if (resource.resource_type !== 'Labor') {
          issues.push({ lineIndex: index, field: 'resource_id', message: `Line #${index + 1}: Resource "${resource.name}" is not of type 'Labor'.`, severity: 'error' });
        }
        if (resource.status && resource.status !== 'Active') {
          issues.push({ lineIndex: index, field: 'resource_id', message: `Line #${index + 1}: Worker "${resource.name}" is ${resource.status}.`, severity: 'error' });
        }
      }

      // Check duplicate within same timesheet
      if (seenWorkerInShift.has(line.resource_id)) {
        issues.push({ lineIndex: index, field: 'resource_id', message: `Line #${index + 1}: Duplicate entry for same worker in this shift.`, severity: 'error' });
      }
      seenWorkerInShift.add(line.resource_id);

      // Check duplicate in existing database timesheets on same work_date and shift
      if (context.existingTimesheets && context.existingLines && timesheet.work_date && timesheet.shift) {
        const matchingTsIds = new Set(
          context.existingTimesheets
            .filter((ts) => ts.id !== timesheet.id && ts.work_date === timesheet.work_date && ts.shift === timesheet.shift && ts.status !== 'Reversed')
            .map((ts) => ts.id)
        );
        const dupLine = context.existingLines.find((l) => matchingTsIds.has(l.timesheet_id) && l.resource_id === line.resource_id);
        if (dupLine) {
          issues.push({
            lineIndex: index,
            field: 'resource_id',
            message: `Line #${index + 1}: Worker already logged on ${timesheet.work_date} (${timesheet.shift}) in another active timesheet.`,
            severity: 'error',
          });
        }
      }
    }

    if (!line.schedule_activity_id) {
      issues.push({ lineIndex: index, field: 'schedule_activity_id', message: `Line #${index + 1}: Schedule activity is required.`, severity: 'error' });
    } else {
      const activity = context.schedules.find((s) => s.id === line.schedule_activity_id);
      if (!activity) {
        issues.push({ lineIndex: index, field: 'schedule_activity_id', message: `Line #${index + 1}: Activity not found.`, severity: 'error' });
      } else {
        if (activity.project_id && timesheet.project_id && activity.project_id !== timesheet.project_id) {
          issues.push({ lineIndex: index, field: 'schedule_activity_id', message: `Line #${index + 1}: Activity belongs to another project.`, severity: 'error' });
        }
        if (activity.contract_id && timesheet.contract_id && activity.contract_id !== timesheet.contract_id) {
          issues.push({ lineIndex: index, field: 'schedule_activity_id', message: `Line #${index + 1}: Activity belongs to another contract.`, severity: 'error' });
        }
      }
    }

    if (!line.control_account_id) {
      issues.push({ lineIndex: index, field: 'control_account_id', message: `Line #${index + 1}: Control Account is required.`, severity: 'error' });
    } else {
      const ca = context.controlAccounts.find((c) => c.id === line.control_account_id);
      if (!ca) {
        issues.push({ lineIndex: index, field: 'control_account_id', message: `Line #${index + 1}: Control account not found.`, severity: 'error' });
      } else if (ca.project_id && timesheet.project_id && ca.project_id !== timesheet.project_id) {
        issues.push({ lineIndex: index, field: 'control_account_id', message: `Line #${index + 1}: Control account belongs to another project.`, severity: 'error' });
      }
    }

    if (Number(line.regular_hours) < 0 || Number(line.overtime_hours) < 0) {
      issues.push({ lineIndex: index, field: 'regular_hours', message: `Line #${index + 1}: Hours cannot be negative.`, severity: 'error' });
    }
    if ((Number(line.regular_hours) || 0) + (Number(line.overtime_hours) || 0) <= 0) {
      issues.push({ lineIndex: index, field: 'regular_hours', message: `Line #${index + 1}: Total hours must be greater than zero.`, severity: 'error' });
    }
    if ((Number(line.regular_hours) || 0) > 24 || (Number(line.overtime_hours) || 0) > 24) {
      issues.push({ lineIndex: index, field: 'regular_hours', message: `Line #${index + 1}: Hours cannot exceed 24 in a single shift.`, severity: 'error' });
    }

    if (isNonWorkingDay && !line.non_working_override_reason?.trim()) {
      issues.push({
        lineIndex: index,
        field: 'non_working_override_reason',
        message: `Line #${index + 1}: Work date is a non-working calendar day. Documented override reason is required.`,
        severity: 'error',
      });
    }
  });

  return issues;
}

async function invokeLabor<T>(command: string, request: Record<string, unknown>): Promise<T> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(command, { request });
  }
  throw new Error('Tauri desktop backend required for native atomic posting.');
}

export const submitLaborTimesheet = (request: {
  operationId: string;
  timesheetId: string;
  actor: string;
  submittedAt: string;
}) => invokeLabor<LaborTimesheetOperationResult>('submit_labor_timesheet', request);

export const approveLaborTimesheet = (request: {
  operationId: string;
  timesheetId: string;
  actor: string;
  approvedAt: string;
}) => invokeLabor<LaborTimesheetOperationResult>('approve_labor_timesheet', request);

export const postLaborTimesheet = (request: {
  operationId: string;
  timesheetId: string;
  actor: string;
  postedAt: string;
}) => invokeLabor<LaborTimesheetOperationResult>('post_labor_timesheet', request);

export const reverseLaborTimesheet = (request: {
  operationId: string;
  timesheetId: string;
  actor: string;
  reason: string;
  reversedAt: string;
}) => invokeLabor<LaborTimesheetOperationResult>('reverse_labor_timesheet', request);

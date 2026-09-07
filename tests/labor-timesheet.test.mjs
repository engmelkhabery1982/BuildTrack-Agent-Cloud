import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calculateLaborLineTotal,
  calculateLaborTimesheetTotals,
  validateLaborTimesheet,
} from '../src/data/laborTimesheet.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('calculateLaborLineTotal accurately computes regular and overtime amounts', () => {
  const line = {
    regular_hours: 8,
    overtime_hours: 2,
    regular_rate: 50,
    overtime_rate: 75,
  };
  const { total_hours, calculated_amount } = calculateLaborLineTotal(line);
  assert.strictEqual(total_hours, 10);
  assert.strictEqual(calculated_amount, 550);
});

test('calculateLaborTimesheetTotals sums hours and amounts across lines', () => {
  const lines = [
    { regular_hours: 8, overtime_hours: 2, regular_rate: 50, overtime_rate: 75 },
    { regular_hours: 7.5, overtime_hours: 1, regular_rate: 40, overtime_rate: 60 },
  ];
  const totals = calculateLaborTimesheetTotals(lines);
  assert.strictEqual(totals.total_regular_hours, 15.5);
  assert.strictEqual(totals.total_overtime_hours, 3);
  // (8*50 + 2*75) + (7.5*40 + 1*60) = 550 + 360 = 910
  assert.strictEqual(totals.total_amount, 910);
});

test('validateLaborTimesheet enforces required fields and positive hours', () => {
  const issues1 = validateLaborTimesheet({}, [], {
    resourceMasters: [],
    schedules: [],
    controlAccounts: [],
  });
  assert.ok(issues1.length >= 4, 'Must report missing header fields and empty lines');

  const header = {
    project_id: 'PRJ-1',
    contract_id: 'CTR-1',
    timesheet_number: 'TS-2026-001',
    work_date: '2026-09-07',
    shift: 'Day',
    submitter: 'Engineer A',
  };

  const invalidLines = [
    {
      resource_id: '',
      schedule_activity_id: '',
      control_account_id: '',
      regular_hours: -5,
      overtime_hours: 0,
      regular_rate: 50,
      overtime_rate: 75,
    },
  ];

  const issues2 = validateLaborTimesheet(header, invalidLines, {
    resourceMasters: [],
    schedules: [],
    controlAccounts: [],
  });
  assert.ok(issues2.some((i) => i.message.includes('Worker is required')));
  assert.ok(issues2.some((i) => i.message.includes('negative')));
});

test('validateLaborTimesheet blocks inactive workers or non-labor resources', () => {
  const header = {
    project_id: 'PRJ-1',
    contract_id: 'CTR-1',
    timesheet_number: 'TS-2026-001',
    work_date: '2026-09-07',
    shift: 'Day',
    submitter: 'Engineer A',
  };

  const lines = [
    {
      resource_id: 'RES-MAT',
      schedule_activity_id: 'ACT-1',
      control_account_id: 'CA-1',
      regular_hours: 8,
      overtime_hours: 0,
      regular_rate: 50,
      overtime_rate: 75,
    },
  ];

  const resourceMasters = [
    { id: 'RES-MAT', name: 'Cement', resource_type: 'Material', status: 'Active' },
  ];
  const schedules = [{ id: 'ACT-1', project_id: 'PRJ-1', contract_id: 'CTR-1' }];
  const controlAccounts = [{ id: 'CA-1', project_id: 'PRJ-1', contract_id: 'CTR-1' }];

  const issues = validateLaborTimesheet(header, lines, {
    resourceMasters,
    schedules,
    controlAccounts,
  });
  assert.ok(issues.some((i) => i.message.includes("is not of type 'Labor'")));
});

test('validateLaborTimesheet blocks duplicate worker on same date and shift', () => {
  const header = {
    id: 'TS-NEW',
    project_id: 'PRJ-1',
    contract_id: 'CTR-1',
    timesheet_number: 'TS-2026-002',
    work_date: '2026-09-07',
    shift: 'Day',
    submitter: 'Engineer A',
  };

  const lines = [
    {
      resource_id: 'RES-101',
      schedule_activity_id: 'ACT-1',
      control_account_id: 'CA-1',
      regular_hours: 8,
      overtime_hours: 0,
      regular_rate: 50,
      overtime_rate: 75,
    },
  ];

  const resourceMasters = [{ id: 'RES-101', name: 'John Doe', resource_type: 'Labor', status: 'Active' }];
  const schedules = [{ id: 'ACT-1', project_id: 'PRJ-1', contract_id: 'CTR-1' }];
  const controlAccounts = [{ id: 'CA-1', project_id: 'PRJ-1', contract_id: 'CTR-1' }];

  const existingTimesheets = [
    {
      id: 'TS-OLD',
      work_date: '2026-09-07',
      shift: 'Day',
      status: 'Approved',
    },
  ];

  const existingLines = [
    {
      timesheet_id: 'TS-OLD',
      resource_id: 'RES-101',
    },
  ];

  const issues = validateLaborTimesheet(header, lines, {
    resourceMasters,
    schedules,
    controlAccounts,
    existingTimesheets,
    existingLines,
  });
  assert.ok(issues.some((i) => i.message.includes('Worker already logged on 2026-09-07 (Day)')));
});

test('validateLaborTimesheet prevents logging in locked reporting periods', () => {
  const header = {
    project_id: 'PRJ-1',
    contract_id: 'CTR-1',
    timesheet_number: 'TS-2026-001',
    work_date: '2026-08-15',
    shift: 'Day',
    submitter: 'Engineer A',
  };

  const lines = [
    {
      resource_id: 'RES-1',
      schedule_activity_id: 'ACT-1',
      control_account_id: 'CA-1',
      regular_hours: 8,
      overtime_hours: 0,
      regular_rate: 50,
      overtime_rate: 75,
    },
  ];

  const resourceMasters = [{ id: 'RES-1', name: 'Worker 1', resource_type: 'Labor', status: 'Active' }];
  const schedules = [{ id: 'ACT-1', project_id: 'PRJ-1', contract_id: 'CTR-1' }];
  const controlAccounts = [{ id: 'CA-1', project_id: 'PRJ-1', contract_id: 'CTR-1' }];
  const reportingPeriods = [
    {
      project_id: 'PRJ-1',
      start_date: '2026-08-01',
      end_date: '2026-08-31',
      status: 'Locked',
      period_code: 'RP-AUG',
    },
  ];

  const issues = validateLaborTimesheet(header, lines, {
    resourceMasters,
    schedules,
    controlAccounts,
    reportingPeriods,
  });
  assert.ok(issues.some((i) => i.message.includes('Locked reporting period')));
});

test('F1 Rust backend labor_timesheet module provides atomic approve, post, and reverse commands', () => {
  const rustModule = read('src-tauri/src/labor_timesheet.rs');
  assert.match(rustModule, /pub async fn approve_labor_timesheet/);
  assert.match(rustModule, /pub async fn post_labor_timesheet/);
  assert.match(rustModule, /pub async fn reverse_labor_timesheet/);
  assert.match(rustModule, /guard_on/);
  assert.match(rustModule, /guard_off/);
  assert.match(rustModule, /cost_entries/);
  assert.match(rustModule, /LaborTimesheet/);
  assert.match(rustModule, /tx\.commit\(\)/);
  assert.match(rustModule, /tx\.rollback\(\)/);
});

test('F1 SQLite migration 61 creates labor_timesheets, labor_timesheet_lines and immutability triggers', () => {
  const libSource = read('src-tauri/src/lib.rs');
  assert.match(libSource, /version:\s*61/);
  assert.match(libSource, /CREATE TABLE IF NOT EXISTS labor_timesheets/);
  assert.match(libSource, /CREATE TABLE IF NOT EXISTS labor_timesheet_lines/);
  assert.match(libSource, /labor_timesheet_locked_delete/);
  assert.match(libSource, /labor_timesheet_lines_locked_mutation/);
  assert.match(libSource, /labor_timesheet_lines_locked_delete/);
});

test('F1 Data Dictionary and SQLite Repository register labor timesheets', () => {
  const repoSource = read('src/data/sqliteRepository.ts');
  assert.match(repoSource, /"labor_timesheets"/);
  assert.match(repoSource, /"labor_timesheet_lines"/);

  const dictSource = read('src/data/dataDictionary.ts');
  assert.match(dictSource, /laborTimesheet:\s*\[/);
  assert.match(dictSource, /timesheet_number/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calculateEquipmentLogTotals,
  validateEquipmentLog,
} from '../src/data/equipmentLog.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('calculateEquipmentLogTotals accurately computes meter hours, total hours, equipment cost, fuel cost, and total cost', () => {
  const log = {
    meter_start: 1250.5,
    meter_end: 1258.5,
    operating_hours: 8,
    idle_hours: 1.5,
    breakdown_hours: 0.5,
    hourly_rate: 150,
    fuel_quantity: 45,
    fuel_rate: 4.2,
  };

  const totals = calculateEquipmentLogTotals(log);
  assert.strictEqual(totals.meter_hours, 8);
  assert.strictEqual(totals.total_hours, 10);
  assert.strictEqual(totals.equipment_cost, 1200); // 8 * 150
  assert.strictEqual(totals.fuel_cost, 189); // 45 * 4.2
  assert.strictEqual(totals.total_cost, 1389); // 1200 + 189
});

test('validateEquipmentLog enforces required fields, scope matching, and non-negative values', () => {
  const issues1 = validateEquipmentLog({}, {
    resourceMasters: [],
    schedules: [],
    controlAccounts: [],
  });
  assert.ok(issues1.length >= 4, 'Must report missing header fields');

  const header = {
    project_id: 'PRJ-1',
    contract_id: 'CTR-1',
    log_number: 'EQ-2026-001',
    log_date: '2026-09-07',
    shift: 'Day',
    resource_id: 'RES-EQ1',
    schedule_activity_id: 'ACT-1',
    control_account_id: 'CA-1',
    meter_start: 100,
    meter_end: 108,
    operating_hours: -2,
    hourly_rate: -50,
    fuel_quantity: -10,
  };

  const issues2 = validateEquipmentLog(header, {
    resourceMasters: [{ id: 'RES-EQ1', name: 'Excavator 01', resource_type: 'Equipment', status: 'Active' }],
    schedules: [{ id: 'ACT-1', project_id: 'PRJ-1', contract_id: 'CTR-1' }],
    controlAccounts: [{ id: 'CA-1', project_id: 'PRJ-1', contract_id: 'CTR-1' }],
  });

  assert.ok(issues2.some((i) => i.message.includes('Hours cannot be negative')));
  assert.ok(issues2.some((i) => i.message.includes('Rates and fuel quantity cannot be negative')));
});

test('validateEquipmentLog blocks meter rollback (meter_end < meter_start)', () => {
  const header = {
    project_id: 'PRJ-1',
    contract_id: 'CTR-1',
    log_number: 'EQ-2026-001',
    log_date: '2026-09-07',
    shift: 'Day',
    resource_id: 'RES-EQ1',
    schedule_activity_id: 'ACT-1',
    control_account_id: 'CA-1',
    meter_start: 500,
    meter_end: 480, // Rollback!
    operating_hours: 8,
    hourly_rate: 100,
  };

  const issues = validateEquipmentLog(header, {
    resourceMasters: [{ id: 'RES-EQ1', name: 'Excavator 01', resource_type: 'Equipment', status: 'Active' }],
    schedules: [{ id: 'ACT-1', project_id: 'PRJ-1', contract_id: 'CTR-1' }],
    controlAccounts: [{ id: 'CA-1', project_id: 'PRJ-1', contract_id: 'CTR-1' }],
  });

  assert.ok(issues.some((i) => i.message.includes('Meter rollback')));
});

test('validateEquipmentLog requires documented override reason if operating hours differ from meter delta', () => {
  const header = {
    project_id: 'PRJ-1',
    contract_id: 'CTR-1',
    log_number: 'EQ-2026-001',
    log_date: '2026-09-07',
    shift: 'Day',
    resource_id: 'RES-EQ1',
    schedule_activity_id: 'ACT-1',
    control_account_id: 'CA-1',
    meter_start: 100,
    meter_end: 110, // 10 meter hours
    operating_hours: 6, // Discrepancy without override reason
    hourly_rate: 100,
  };

  const issuesNoReason = validateEquipmentLog(header, {
    resourceMasters: [{ id: 'RES-EQ1', name: 'Excavator 01', resource_type: 'Equipment', status: 'Active' }],
    schedules: [{ id: 'ACT-1', project_id: 'PRJ-1', contract_id: 'CTR-1' }],
    controlAccounts: [{ id: 'CA-1', project_id: 'PRJ-1', contract_id: 'CTR-1' }],
  });
  assert.ok(issuesNoReason.some((i) => i.message.includes('documented override reason is required')));

  const headerWithReason = {
    ...header,
    hours_override_reason: 'Meter was running during standby maintenance check.',
  };
  const issuesWithReason = validateEquipmentLog(headerWithReason, {
    resourceMasters: [{ id: 'RES-EQ1', name: 'Excavator 01', resource_type: 'Equipment', status: 'Active' }],
    schedules: [{ id: 'ACT-1', project_id: 'PRJ-1', contract_id: 'CTR-1' }],
    controlAccounts: [{ id: 'CA-1', project_id: 'PRJ-1', contract_id: 'CTR-1' }],
  });
  assert.strictEqual(issuesWithReason.length, 0);
});

test('validateEquipmentLog prevents logging for inactive equipment or non-equipment resources', () => {
  const header = {
    project_id: 'PRJ-1',
    contract_id: 'CTR-1',
    log_number: 'EQ-2026-001',
    log_date: '2026-09-07',
    shift: 'Day',
    resource_id: 'RES-LABOR',
    schedule_activity_id: 'ACT-1',
    control_account_id: 'CA-1',
    meter_start: 100,
    meter_end: 108,
    operating_hours: 8,
    hourly_rate: 100,
  };

  const issues = validateEquipmentLog(header, {
    resourceMasters: [{ id: 'RES-LABOR', name: 'John Carpenter', resource_type: 'Labor', status: 'Active' }],
    schedules: [{ id: 'ACT-1', project_id: 'PRJ-1', contract_id: 'CTR-1' }],
    controlAccounts: [{ id: 'CA-1', project_id: 'PRJ-1', contract_id: 'CTR-1' }],
  });
  assert.ok(issues.some((i) => i.message.includes("is not of type 'Equipment'")));
});

test('validateEquipmentLog prevents meter overlaps for the same equipment on the same date and shift', () => {
  const header = {
    id: 'LOG-NEW',
    project_id: 'PRJ-1',
    contract_id: 'CTR-1',
    log_number: 'EQ-2026-002',
    log_date: '2026-09-07',
    shift: 'Day',
    resource_id: 'RES-EQ1',
    schedule_activity_id: 'ACT-1',
    control_account_id: 'CA-1',
    meter_start: 105,
    meter_end: 115,
    operating_hours: 10,
    hourly_rate: 120,
  };

  const existingLogs = [
    {
      id: 'LOG-EXISTING',
      log_number: 'EQ-2026-001',
      log_date: '2026-09-07',
      shift: 'Day',
      resource_id: 'RES-EQ1',
      meter_start: 100,
      meter_end: 110, // Overlaps with 105-115
      status: 'Approved',
    },
  ];

  const issues = validateEquipmentLog(header, {
    resourceMasters: [{ id: 'RES-EQ1', name: 'Crane 01', resource_type: 'Equipment', status: 'Active' }],
    schedules: [{ id: 'ACT-1', project_id: 'PRJ-1', contract_id: 'CTR-1' }],
    controlAccounts: [{ id: 'CA-1', project_id: 'PRJ-1', contract_id: 'CTR-1' }],
    existingLogs,
  });

  assert.ok(issues.some((i) => i.message.includes('overlap with log #EQ-2026-001')));
});

test('validateEquipmentLog prevents logging in locked reporting periods', () => {
  const header = {
    project_id: 'PRJ-1',
    contract_id: 'CTR-1',
    log_number: 'EQ-2026-001',
    log_date: '2026-08-20',
    shift: 'Day',
    resource_id: 'RES-EQ1',
    schedule_activity_id: 'ACT-1',
    control_account_id: 'CA-1',
    meter_start: 100,
    meter_end: 108,
    operating_hours: 8,
    hourly_rate: 100,
  };

  const reportingPeriods = [
    {
      project_id: 'PRJ-1',
      start_date: '2026-08-01',
      end_date: '2026-08-31',
      status: 'Locked',
      period_code: 'RP-AUG',
    },
  ];

  const issues = validateEquipmentLog(header, {
    resourceMasters: [{ id: 'RES-EQ1', name: 'Bulldozer 01', resource_type: 'Equipment', status: 'Active' }],
    schedules: [{ id: 'ACT-1', project_id: 'PRJ-1', contract_id: 'CTR-1' }],
    controlAccounts: [{ id: 'CA-1', project_id: 'PRJ-1', contract_id: 'CTR-1' }],
    reportingPeriods,
  });

  assert.ok(issues.some((i) => i.message.includes('Locked reporting period')));
});

test('F2 Rust backend equipment_log module provides atomic approve, post, and reverse commands', () => {
  const rustModule = read('src-tauri/src/equipment_log.rs');
  assert.match(rustModule, /pub async fn approve_equipment_log/);
  assert.match(rustModule, /pub async fn post_equipment_log/);
  assert.match(rustModule, /pub async fn reverse_equipment_log/);
  assert.match(rustModule, /guard_on/);
  assert.match(rustModule, /guard_off/);
  assert.match(rustModule, /cost_entries/);
  assert.match(rustModule, /EquipmentUsage/);
  assert.match(rustModule, /EquipmentFuel/);
  assert.match(rustModule, /EquipmentLogHeader/);
  assert.match(rustModule, /tx\.commit\(\)/);
  assert.match(rustModule, /tx\.rollback\(\)/);
});

test('F2 SQLite migration 62 creates equipment_logs and immutability trigger', () => {
  const libSource = read('src-tauri/src/lib.rs');
  assert.match(libSource, /version:\s*62/);
  assert.match(libSource, /CREATE TABLE IF NOT EXISTS equipment_logs/);
  assert.match(libSource, /equipment_log_locked_delete/);
  assert.match(libSource, /approve_equipment_log/);
  assert.match(libSource, /post_equipment_log/);
  assert.match(libSource, /reverse_equipment_log/);
});

test('F2 Data Dictionary and SQLite Repository register equipment logs', () => {
  const repoSource = read('src/data/sqliteRepository.ts');
  assert.match(repoSource, /"equipment_logs"/);

  const dictSource = read('src/data/dataDictionary.ts');
  assert.match(dictSource, /equipmentLog:\s*\[/);
  assert.match(dictSource, /log_number/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runDataQualityChecks } from '../src/data/dataQuality.ts';
import { calculateControlAccountSummary } from '../src/utils/controlAccountSummary.ts';
import { buildQuantityLedger } from '../src/utils/quantityLedger.ts';

test('Control Account migration enforces one scoped main-contract account', () => {
  const rust = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const match = rust.match(/version:\s*44,[\s\S]*?sql:\s*r#"([\s\S]*?)"#,\s*kind:/);
  assert.ok(match, 'migration 44 must exist');
  const sqliteAcceptance = String.raw`
import json, sqlite3, sys
db = sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys = ON')
db.execute('CREATE TABLE projects (id TEXT PRIMARY KEY)')
db.execute('CREATE TABLE contracts (id TEXT PRIMARY KEY, project_id TEXT, parent_main_contract_id TEXT)')
db.execute('CREATE TABLE wbs_nodes (id TEXT PRIMARY KEY, project_id TEXT, contract_id TEXT)')
db.execute('CREATE TABLE boq_headers (id TEXT PRIMARY KEY, contract_id TEXT)')
db.execute('CREATE TABLE boq_items (id TEXT PRIMARY KEY, project_id TEXT, boq_header_id TEXT)')
db.execute('CREATE TABLE cost_codes (id TEXT PRIMARY KEY, project_id TEXT)')
db.execute('CREATE TABLE contract_sov_lines (id TEXT PRIMARY KEY, project_id TEXT, contract_id TEXT, boq_item_id TEXT, payload TEXT NOT NULL)')
db.executescript(sys.stdin.read())
db.execute("INSERT INTO projects VALUES ('p1')")
db.executemany('INSERT INTO contracts VALUES (?,?,?)', [('main','p1',None),('sub','p1','main')])
db.execute("INSERT INTO wbs_nodes VALUES ('w1','p1','main')")
db.execute("INSERT INTO boq_headers VALUES ('h1','main')")
db.execute("INSERT INTO boq_items VALUES ('b1','p1','h1')")
db.execute("INSERT INTO cost_codes VALUES ('cc1','p1')")
db.execute("INSERT INTO contract_sov_lines VALUES ('s1','p1','main','b1',?)", (json.dumps({'control_account_code':'SOV-1','cost_code_id':'cc1'}),))
row = ('ca1','2026-09-01T00:00:00Z','p1','main','w1','b1','cc1','s1',json.dumps({'control_account_code':'CA-001'}))
db.execute('INSERT INTO control_accounts VALUES (?,?,?,?,?,?,?,?,?)', row)
assert db.execute('SELECT count(*) FROM control_accounts').fetchone()[0] == 1
try:
  db.execute('INSERT INTO control_accounts VALUES (?,?,?,?,?,?,?,?,?)', ('ca2','now','p1','main','w1','b1','cc1','s1',json.dumps({'control_account_code':'CA-002'})))
  raise AssertionError('duplicate scoped account must be rejected')
except sqlite3.IntegrityError: pass
try:
  db.execute('INSERT INTO control_accounts VALUES (?,?,?,?,?,?,?,?,?)', ('ca3','now','p1','sub','w1','b1','cc1','s1',json.dumps({'control_account_code':'CA-SUB'})))
  raise AssertionError('subcontract control account must be rejected')
except sqlite3.IntegrityError: pass
print('ok')
`;
  const result = execFileSync('python', ['-c', sqliteAcceptance], { input: match[1], encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  assert.equal(result, 'ok');
});

test('Control Account source assignment prevents cross-scope operational postings', () => {
  const rust = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const model = rust.match(/version:\s*44,[\s\S]*?sql:\s*r#"([\s\S]*?)"#,\s*kind:/);
  const sources = rust.match(/version:\s*45,[\s\S]*?sql:\s*r#"([\s\S]*?)"#,\s*kind:/);
  assert.ok(model && sources, 'migrations 44 and 45 must exist');
  const sqliteAcceptance = String.raw`
import json, sqlite3, sys
m44, m45 = sys.stdin.read().split('\n--MIGRATION--\n', 1)
db = sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys = ON')
db.execute('CREATE TABLE projects (id TEXT PRIMARY KEY)')
db.execute('CREATE TABLE contracts (id TEXT PRIMARY KEY, project_id TEXT, parent_main_contract_id TEXT)')
db.execute('CREATE TABLE wbs_nodes (id TEXT PRIMARY KEY, project_id TEXT, contract_id TEXT)')
db.execute('CREATE TABLE boq_headers (id TEXT PRIMARY KEY, contract_id TEXT)')
db.execute('CREATE TABLE boq_items (id TEXT PRIMARY KEY, project_id TEXT, boq_header_id TEXT, payload TEXT NOT NULL)')
db.execute('CREATE TABLE cost_codes (id TEXT PRIMARY KEY, project_id TEXT)')
db.execute('CREATE TABLE contract_sov_lines (id TEXT PRIMARY KEY, project_id TEXT, contract_id TEXT, boq_item_id TEXT, payload TEXT NOT NULL)')
for name in ('schedules','wir_entries','cost_entries','procurement','procurement_receipts'):
  db.execute(f'CREATE TABLE {name} (id TEXT PRIMARY KEY, created_at TEXT, project_id TEXT, contract_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, payload TEXT NOT NULL)')
db.executescript(m44)
db.executescript(m45)
db.execute("INSERT INTO projects VALUES ('p1')")
db.executemany('INSERT INTO contracts VALUES (?,?,?)', [('main','p1',None),('sub','p1','main')])
db.execute("INSERT INTO wbs_nodes VALUES ('w1','p1','main')")
db.executemany('INSERT INTO boq_headers VALUES (?,?)', [('hmain','main'),('hsub','sub')])
db.executemany('INSERT INTO boq_items VALUES (?,?,?,?)', [('bmain','p1','hmain','{}'),('bsub','p1','hsub',json.dumps({'main_boq_item_id':'bmain'}))])
db.execute("INSERT INTO cost_codes VALUES ('cc1','p1')")
db.execute("INSERT INTO contract_sov_lines VALUES ('s1','p1','main','bmain',?)", (json.dumps({'cost_code_id':'cc1'}),))
db.execute('INSERT INTO control_accounts VALUES (?,?,?,?,?,?,?,?,?)', ('ca1','now','p1','main','w1','bmain','cc1','s1',json.dumps({'control_account_code':'CA-1'})))
def source(table, identifier, contract='main', boq='bmain', payload=None):
  db.execute(f'INSERT INTO {table} (id,created_at,project_id,contract_id,boq_item_id,control_account_id,payload) VALUES (?,?,?,?,?,?,?)', (identifier,'now','p1',contract,boq,'ca1',json.dumps(payload or {})))
source('schedules','sch1',payload={'wbs_id':'w1'})
source('wir_entries','wir1','sub','bsub')
source('cost_entries','cost1',payload={'cost_code_id':'cc1'})
source('procurement','po1',payload={'cost_code_id':'cc1'})
source('procurement_receipts','grn1')
for table, payload in [('schedules',{'wbs_id':'wrong'}), ('cost_entries',{'cost_code_id':'wrong'}), ('procurement',{'cost_code_id':'wrong'})]:
  try:
    source(table, table + '-bad', payload=payload)
    raise AssertionError(f'{table} must reject a mismatched Control Account')
  except sqlite3.IntegrityError: pass
try:
  source('wir_entries','wir-bad','sub','bmain')
  raise AssertionError('subcontract source must use its mapped child BOQ item')
except sqlite3.IntegrityError: pass
print('ok')
`;
  const result = execFileSync('python', ['-c', sqliteAcceptance], {
    input: `${model[1]}\n--MIGRATION--\n${sources[1]}`,
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
  assert.equal(result, 'ok');
});

test('Data Quality exposes unassigned and invalid Control Account facts', () => {
  const base = {
    projects: [{ id: 'p1' }], contracts: [{ id: 'main', project_id: 'p1', parent_main_contract_id: null }],
    boqHeaders: [{ id: 'h1', project_id: 'p1', contract_id: 'main' }], boqItems: [{ id: 'b1', project_id: 'p1', boq_header_id: 'h1' }],
    schedules: [], wirEntries: [], costEntries: [{ id: 'cost1', project_id: 'p1', contract_id: 'main', boq_item_id: 'b1', cost_code_id: 'cc1' }],
    reportingPeriods: [], baselines: [], wbsNodes: [{ id: 'w1', project_id: 'p1', contract_id: 'main', status: 'Active' }],
    procurement: [], procurementReceipts: [], controlAccounts: [{ id: 'ca1', project_id: 'p1', contract_id: 'main', wbs_id: 'w1', boq_item_id: 'b1', cost_code_id: 'cc1' }],
  };
  const unassigned = runDataQualityChecks(base);
  assert.ok(unassigned.some((finding) => finding.title === 'Operational facts are unassigned to a Control Account'));
  const invalid = runDataQualityChecks({ ...base, costEntries: [{ ...base.costEntries[0], control_account_id: 'missing' }] });
  assert.ok(invalid.some((finding) => finding.title === 'Operational fact is outside its Control Account scope'));
});

test('Control Account total is traceable and does not double-count an accepted GRN', () => {
  const summary = calculateControlAccountSummary({
    account: { id: 'ca1', contract_id: 'main', boq_item_id: 'b1', contract_sov_line_id: 's1', data_date: '2026-06-30' },
    boqItems: [{ id: 'b1', quantity: 100, unit_rate: 10 }], sovLines: [{ id: 's1', revised_budget: 1000, status: 'Active' }],
    baselines: [{ id: 'bl1', contract_id: 'main', status: 'Approved' }],
    schedules: [{ id: 'sch1', control_account_id: 'ca1', activity: 'Controlled work', budget: 1000, start_date: '2026-06-01', end_date: '2026-12-31' }],
    scheduleDistributions: [{ schedule_id: 'sch1', period_start: '2026-06-01', period_end: '2026-06-30', planned_value: 400 }],
    wirEntries: [{ control_account_id: 'ca1', result: 'Pass', inspection_date: '2026-06-15', quantity: 20, unit_price: 10 }, { control_account_id: 'ca1', result: 'Pass', inspection_date: '2026-07-01', quantity: 10, unit_price: 10 }],
    procurement: [{ control_account_id: 'ca1', status: 'Ordered', order_date: '2026-06-01', total_cost: 700 }, { control_account_id: 'ca1', status: 'Ordered', order_date: '2026-07-01', total_cost: 500 }],
    procurementReceipts: [{ id: 'r1', control_account_id: 'ca1', status: 'Accepted', receipt_date: '2026-06-10', accepted_amount: 300 }, { id: 'r2', control_account_id: 'ca1', status: 'Accepted', receipt_date: '2026-07-01', accepted_amount: 100 }],
    costEntries: [{ control_account_id: 'ca1', source_type: 'procurement_receipt', source_id: 'r1', date: '2026-06-10', amount: 300 }, { control_account_id: 'ca1', date: '2026-06-20', amount: 50 }, { control_account_id: 'ca1', date: '2026-07-01', amount: 40 }],
  });
  assert.deepEqual(summary, {
    scope_quantity: 100,
    selling_rate: 10,
    revenue_budget: 1000,
    control_budget: 1000,
    cost_rate: 10,
    planned_value: 400,
    earned_value: 200,
    revenue_earned_value: 200,
    actual_cost: 350,
    open_commitment: 400,
    cost_to_complete: 650,
    forecast_at_completion: 1000,
    evm_eac: 1750,
    projected_margin: 0,
    progress_margin: -150,
    cpi: 200 / 350,
    source_count: 10,
    data_date: '2026-06-30',
    control_status: 'Ready',
    source_summary: 'Activities 1 · WIR 2 · Costs 3 · PO 2 · GRN 2',
    usageVariance: 800,
    rateVariance: -150,
    mixVariance: 0,
    productivityVariance: -800,
    efficiencyVariance: -800,
  });
});

test('Quantity ledger rolls subcontract work to its main BOQ once and applies approved variations only', () => {
  const rows = buildQuantityLedger({
    boqItems: [{ id: 'main-item', project_id: 'p1', quantity: 100, item_code: 'B-1' }, { id: 'sub-item', project_id: 'p1', main_boq_item_id: 'main-item', quantity: 70 }],
    variations: [{ id: 'approved', status: 'Approved' }, { id: 'draft', status: 'Draft' }],
    variationLines: [{ variation_id: 'approved', boq_item_id: 'main-item', quantity_change: 20 }, { variation_id: 'draft', boq_item_id: 'main-item', quantity_change: 100 }],
    schedules: [{ boq_item_id: 'main-item', activity: 'Main activity', planned_quantity: 60 }, { boq_item_id: 'sub-item', activity: 'Sub activity', planned_quantity: 40 }, { boq_item_id: 'main-item', activity: '', planned_quantity: 100 }],
    wirEntries: [{ boq_item_id: 'main-item', result: 'Pass', quantity: 30 }, { boq_item_id: 'sub-item', result: 'Conditional Pass', quantity: 25 }, { boq_item_id: 'sub-item', result: 'Fail', quantity: 10 }],
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { id: 'quantity-ledger:main-item', project_id: 'p1', contract_id: null, boq_item_id: 'main-item', item_code: 'B-1', item_name: '', unit: '', original_quantity: 100, approved_variation_quantity: 20, revised_quantity: 120, planned_quantity: 100, inspected_quantity: 65, corrected_quantity: 0, accepted_quantity: 55, remaining_quantity: 65, over_measured_quantity: 0, quantity_status: 'Within Scope' });
});

test('Data Quality escalates a Quantity Ledger over-plan against revised scope', () => {
  const findings = runDataQualityChecks({
    projects: [{ id: 'p1' }], contracts: [{ id: 'main', project_id: 'p1', parent_main_contract_id: null }],
    boqHeaders: [{ id: 'h1', project_id: 'p1', contract_id: 'main' }], boqItems: [{ id: 'b1', project_id: 'p1', boq_header_id: 'h1', quantity: 10 }],
    schedules: [{ id: 'a1', project_id: 'p1', contract_id: 'main', boq_item_id: 'b1', activity: 'Activity', planned_quantity: 11 }], wirEntries: [], costEntries: [], variations: [], variationLines: [],
    reportingPeriods: [], baselines: [], wbsNodes: [], procurement: [], procurementReceipts: [],
  });
  assert.ok(findings.some((finding) => finding.title === 'Planned quantities exceed revised BOQ scope' && finding.view === 'quantityLedger'));
});

test('Posted progress correction reverses accepted quantity and invalid corrections are surfaced', () => {
  const rows = buildQuantityLedger({
    boqItems: [{ id: 'b1', project_id: 'p1', quantity: 100 }], schedules: [], variations: [], variationLines: [],
    wirEntries: [{ id: 'wir1', project_id: 'p1', contract_id: 'c1', boq_item_id: 'b1', quantity: 60, status: 'Approved' }],
    progressCorrections: [{ id: 'pc1', original_wir_id: 'wir1', project_id: 'p1', contract_id: 'c1', boq_item_id: 'b1', correction_type: 'Reversal', quantity: 20, effective_date: '2026-02-01', reason: 'measurement correction', status: 'Posted' }],
  });
  assert.equal(rows[0].accepted_quantity, 40);
  assert.equal(rows[0].corrected_quantity, -20);
  const findings = runDataQualityChecks({
    projects: [{ id: 'p1' }], contracts: [{ id: 'c1', project_id: 'p1', parent_main_contract_id: null }], boqHeaders: [{ id: 'h1', project_id: 'p1', contract_id: 'c1' }], boqItems: [{ id: 'b1', project_id: 'p1', boq_header_id: 'h1', quantity: 100 }], schedules: [], wirEntries: [{ id: 'wir1', project_id: 'p1', contract_id: 'c1', boq_item_id: 'b1', quantity: 60, status: 'Approved' }], progressCorrections: [{ id: 'bad', original_wir_id: 'missing', project_id: 'p1', contract_id: 'c1', boq_item_id: 'b1', correction_type: 'Reversal', quantity: 0, effective_date: '', reason: '', status: 'Posted' }], costEntries: [], variations: [], variationLines: [], reportingPeriods: [], baselines: [], wbsNodes: [], procurement: [], procurementReceipts: [],
  });
  assert.ok(findings.some((finding) => finding.title === 'Invalid progress correction'));
});

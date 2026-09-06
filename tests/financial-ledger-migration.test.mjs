import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PYTHON_BIN = (() => {
  try {
    execFileSync('python3', ['--version'], { stdio: 'ignore' });
    return 'python3';
  } catch {
    return 'python';
  }
})();

test('financial-ledger migration executes and remains synchronized in SQLite', () => {
  const rust = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const match = rust.match(/version:\s*21,[\s\S]*?sql:\s*r#"([\s\S]*?)"#,\s*kind:/);
  assert.ok(match, 'migration 21 must exist');

  // Python's standard-library SQLite is used only as an isolated in-memory
  // engine. No application database or user data is opened by this test.
  const sqliteAcceptance = String.raw`
import json, sqlite3, sys

db = sqlite3.connect(':memory:')
for table in ('cost_entries', 'cash_flow', 'variations', 'payment_certificates'):
    db.execute(f'''CREATE TABLE {table} (
      id TEXT PRIMARY KEY, project_id TEXT, contract_id TEXT, boq_item_id TEXT,
      payload TEXT NOT NULL, created_at TEXT NOT NULL
    )''')
db.executescript(sys.stdin.read())

created = '2026-08-24T12:00:00Z'
db.execute("INSERT INTO cost_entries VALUES (?, ?, ?, ?, ?, ?)", ('cost-1', 'p-1', 'c-1', 'b-1', json.dumps({'date':'2026-08-10','amount':125.5,'cost_type':'Material'}), created))
db.execute("INSERT INTO cash_flow VALUES (?, ?, ?, ?, ?, ?)", ('cash-1', 'p-1', 'c-1', None, json.dumps({'date':'2026-08-11','inflow':0,'outflow':20,'status':'Paid'}), created))
db.execute("INSERT INTO variations VALUES (?, ?, ?, ?, ?, ?)", ('var-1', 'p-1', 'c-1', 'b-1', json.dumps({'approved_date':'2026-08-12','cost_impact':250,'status':'Approved'}), created))
db.execute("INSERT INTO payment_certificates VALUES (?, ?, ?, ?, ?, ?)", ('cert-1', 'p-1', 'c-1', None, json.dumps({'certificate_date':'2026-08-13','certificate_type':'Client','gross_certified_value':500,'status':'Approved'}), created))

assert db.execute("SELECT amount, direction, ledger_type FROM financial_ledger WHERE source_id='cost-1'").fetchone() == (125.5, 'Outflow', 'Actual Cost')
assert db.execute("SELECT amount, direction FROM financial_ledger WHERE source_id='cash-1'").fetchone() == (20.0, 'Outflow')
assert db.execute("SELECT amount, direction FROM financial_ledger WHERE source_id='var-1'").fetchone() == (250.0, 'Increase')
assert db.execute("SELECT amount, direction FROM financial_ledger WHERE source_id='cert-1'").fetchone() == (500.0, 'Inflow')

db.execute("UPDATE variations SET payload=? WHERE id='var-1'", (json.dumps({'approved_date':'2026-08-14','cost_impact':-90,'status':'Approved'}),))
db.execute("UPDATE payment_certificates SET payload=? WHERE id='cert-1'", (json.dumps({'certificate_date':'2026-08-14','certificate_type':'Subcontractor','gross_certified_value':210,'status':'Approved'}),))
assert db.execute("SELECT amount, direction, transaction_date FROM financial_ledger WHERE source_id='var-1'").fetchone() == (90.0, 'Decrease', '2026-08-14')
assert db.execute("SELECT amount, direction FROM financial_ledger WHERE source_id='cert-1'").fetchone() == (210.0, 'Outflow')
db.execute("DELETE FROM cash_flow WHERE id='cash-1'")
assert db.execute("SELECT count(*) FROM financial_ledger WHERE source_id='cash-1'").fetchone()[0] == 0
print('ok')
`;
  const result = execFileSync(PYTHON_BIN, ['-c', sqliteAcceptance], {
    input: match[1], encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
  assert.equal(result, 'ok');
});

test('commercial ledger migration allocates Cost Changes and commitments in SQLite', () => {
  const rust = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const match = rust.match(/version:\s*22,[\s\S]*?sql:\s*r#"([\s\S]*?)"#,\s*kind:/);
  assert.ok(match, 'migration 22 must exist');
  const sqliteAcceptance = String.raw`
import json, sqlite3, sys
db = sqlite3.connect(':memory:')
db.execute('''CREATE TABLE financial_ledger (
  id TEXT PRIMARY KEY, source_table TEXT NOT NULL, source_id TEXT NOT NULL,
  project_id TEXT, contract_id TEXT, boq_item_id TEXT, transaction_date TEXT,
  ledger_type TEXT NOT NULL, direction TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0,
  status TEXT, created_at TEXT NOT NULL, UNIQUE(source_table, source_id)
)''')
for table in ('cost_changes', 'procurement'):
    db.execute(f'''CREATE TABLE {table} (
      id TEXT PRIMARY KEY, project_id TEXT, contract_id TEXT, boq_item_id TEXT,
      payload TEXT NOT NULL, created_at TEXT NOT NULL
    )''')
db.executescript(sys.stdin.read())
created = '2026-08-24T12:00:00Z'
db.execute("INSERT INTO cost_changes (id, project_id, contract_id, boq_item_id, contract_sov_line_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", ('cc-1', 'p-1', 'c-1', 'b-1', 'sov-1', json.dumps({'effective_date':'2026-08-20','amount':-75,'status':'Approved'}), created))
db.execute("INSERT INTO procurement VALUES (?, ?, ?, ?, ?, ?)", ('po-1', 'p-1', 'c-1', 'b-1', json.dumps({'order_date':'2026-08-21','quantity':4,'unit_cost':30,'status':'Ordered'}), created))
assert db.execute("SELECT amount, direction, ledger_type FROM financial_ledger WHERE source_id='cc-1'").fetchone() == (75.0, 'Decrease', 'Cost Change')
assert db.execute("SELECT amount, direction, ledger_type FROM financial_ledger WHERE source_id='po-1'").fetchone() == (120.0, 'Commitment', 'Commitment')
db.execute("UPDATE procurement SET payload=? WHERE id='po-1'", (json.dumps({'order_date':'2026-08-22','total_cost':140,'status':'Ordered'}),))
assert db.execute("SELECT amount, transaction_date FROM financial_ledger WHERE source_id='po-1'").fetchone() == (140.0, '2026-08-22')
db.execute("DELETE FROM cost_changes WHERE id='cc-1'")
assert db.execute("SELECT count(*) FROM financial_ledger WHERE source_id='cc-1'").fetchone()[0] == 0
print('ok')
`;
  const result = execFileSync(PYTHON_BIN, ['-c', sqliteAcceptance], {
    input: match[1], encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
  assert.equal(result, 'ok');
});

test('schedule scope repair derives missing project IDs from the selected contract', () => {
  const rust = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const match = rust.match(/version:\s*23,[\s\S]*?sql:\s*r#"([\s\S]*?)"#,\s*kind:/);
  assert.ok(match, 'migration 23 must exist');
  const sqliteAcceptance = String.raw`
import json, sqlite3, sys
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE contracts (id TEXT PRIMARY KEY, project_id TEXT)')
db.execute('CREATE TABLE schedules (id TEXT PRIMARY KEY, project_id TEXT, contract_id TEXT, payload TEXT NOT NULL)')
db.execute("INSERT INTO contracts VALUES ('contract-1', 'project-1')")
db.execute("INSERT INTO schedules VALUES ('schedule-1', NULL, 'contract-1', ?)", (json.dumps({'activity_code':'EC1000','project_id':None}),))
db.executescript(sys.stdin.read())
project_id, payload = db.execute("SELECT project_id, payload FROM schedules WHERE id='schedule-1'").fetchone()
assert project_id == 'project-1'
assert json.loads(payload)['project_id'] == 'project-1'
print('ok')
`;
  const result = execFileSync(PYTHON_BIN, ['-c', sqliteAcceptance], { input: match[1], encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  assert.equal(result, 'ok');
});

test('work-calendar master migration creates a reusable local SQLite register', () => {
  const rust = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const match = rust.match(/version:\s*38,[\s\S]*?sql:\s*r#"([\s\S]*?)"#,\s*kind:/);
  assert.ok(match, 'migration 38 must exist');
  const sqliteAcceptance = String.raw`
import sqlite3, sys
db = sqlite3.connect(':memory:')
db.executescript(sys.stdin.read())
db.execute("INSERT INTO work_calendars VALUES ('cal-1','2026-08-31T00:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,'{\"calendar_code\":\"CAL-6D\"}')")
try:
    db.execute("INSERT INTO work_calendars VALUES ('cal-2','2026-08-31T00:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,'{\"calendar_code\":\"CAL-6D\"}')")
    raise AssertionError('calendar code uniqueness was not enforced')
except sqlite3.IntegrityError:
    pass
print('ok')
`;
  const result = execFileSync(PYTHON_BIN, ['-c', sqliteAcceptance], {
    input: match[1], encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
  assert.equal(result, 'ok');
});

test('resource master migration creates a reusable local resource register', () => {
  const rust = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const match = rust.match(/version:\s*39,[\s\S]*?sql:\s*r#"([\s\S]*?)"#,\s*kind:/);
  assert.ok(match, 'migration 39 must exist');
  const sqliteAcceptance = String.raw`
import sqlite3, sys
db = sqlite3.connect(':memory:')
db.executescript(sys.stdin.read())
db.execute("INSERT INTO resource_masters VALUES ('res-1','2026-08-31T00:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,'{\"resource_code\":\"LAB-001\"}')")
try:
    db.execute("INSERT INTO resource_masters VALUES ('res-2','2026-08-31T00:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,'{\"resource_code\":\"LAB-001\"}')")
    raise AssertionError('resource code uniqueness was not enforced')
except sqlite3.IntegrityError:
    pass
print('ok')
`;
  const result = execFileSync(PYTHON_BIN, ['-c', sqliteAcceptance], { input: match[1], encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  assert.equal(result, 'ok');
});

test('procurement receipt migration creates a controlled actual-cost source table', () => {
  const rust = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const match = rust.match(/version:\s*25,[\s\S]*?sql:\s*r#"([\s\S]*?)"#,\s*kind:/);
  assert.ok(match, 'migration 25 must exist');
  const sqliteAcceptance = String.raw`
import sqlite3, sys
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE projects (id TEXT PRIMARY KEY)')
db.execute('CREATE TABLE contracts (id TEXT PRIMARY KEY)')
db.execute('CREATE TABLE boq_items (id TEXT PRIMARY KEY)')
db.executescript(sys.stdin.read())
db.execute("INSERT INTO procurement_receipts VALUES ('r-1','2026-08-25','p-1','c-1',NULL,'b-1',NULL,NULL,?)", ('{"receipt_number":"GRN-001","procurement_id":"po-1","status":"Accepted"}',))
try:
    db.execute("INSERT INTO procurement_receipts VALUES ('r-2','2026-08-25','p-1','c-1',NULL,'b-1',NULL,NULL,?)", ('{"receipt_number":"grn-001","procurement_id":"po-1","status":"Accepted"}',))
    raise AssertionError('receipt number must be unique')
except sqlite3.IntegrityError:
    pass
print('ok')
`;
  const result = execFileSync(PYTHON_BIN, ['-c', sqliteAcceptance], { input: match[1], encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  assert.equal(result, 'ok');
});

test('supplier AP migration protects vendor invoice and payment references', () => {
  const rust = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const match = rust.match(/version:\s*26,[\s\S]*?sql:\s*r#"([\s\S]*?)"#,\s*kind:/);
  assert.ok(match, 'migration 26 must exist');
  const sqliteAcceptance = String.raw`
import sqlite3, sys
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE projects (id TEXT PRIMARY KEY)')
db.execute('CREATE TABLE contracts (id TEXT PRIMARY KEY)')
db.execute('CREATE TABLE boq_items (id TEXT PRIMARY KEY)')
db.executescript(sys.stdin.read())
db.execute("INSERT INTO supplier_invoices VALUES ('si1','2026-08-25','p1','c1',NULL,NULL,NULL,NULL,?)", ('{"supplier_party_id":"sup1","invoice_number":"SI-77"}',))
try:
  db.execute("INSERT INTO supplier_invoices VALUES ('si2','2026-08-25','p1','c1',NULL,NULL,NULL,NULL,?)", ('{"supplier_party_id":"sup1","invoice_number":"si-77"}',))
  raise AssertionError('supplier invoice must be unique per supplier')
except sqlite3.IntegrityError: pass
db.execute("INSERT INTO supplier_invoice_payments VALUES ('pay1','2026-08-25','p1','c1',NULL,NULL,NULL,NULL,?)", ('{"payment_number":"PAY-77"}',))
try:
  db.execute("INSERT INTO supplier_invoice_payments VALUES ('pay2','2026-08-25','p1','c1',NULL,NULL,NULL,NULL,?)", ('{"payment_number":"pay-77"}',))
  raise AssertionError('payment number must be unique')
except sqlite3.IntegrityError: pass
print('ok')
`;
  const result = execFileSync(PYTHON_BIN, ['-c', sqliteAcceptance], { input: match[1], encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  assert.equal(result, 'ok');
});

test('purchase-order governance migration blocks direct commitment and GRN acceptance', () => {
  const rust = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const match = rust.match(/version:\s*32,[\s\S]*?sql:\s*r#"([\s\S]*?)"#,\s*kind:/);
  assert.ok(match, 'migration 32 must exist');
  const sqliteAcceptance = String.raw`
import json, sqlite3, sys
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE supplier_ap_mutation_guard (operation_id TEXT PRIMARY KEY, created_at TEXT)')
for table in ('procurement', 'procurement_receipts'):
  db.execute(f'CREATE TABLE {table} (id TEXT PRIMARY KEY, project_id TEXT, contract_id TEXT, boq_item_id TEXT, payload TEXT NOT NULL)')
db.executescript(sys.stdin.read())
db.execute("INSERT INTO procurement VALUES ('po-1','p-1','c-1','b-1',?)", (json.dumps({'status':'Draft'}),))
try:
  db.execute("UPDATE procurement SET payload=? WHERE id='po-1'", (json.dumps({'status':'Ordered'}),))
  raise AssertionError('direct ordered status must be rejected')
except sqlite3.IntegrityError: pass
db.execute("INSERT INTO supplier_ap_mutation_guard VALUES ('op-1','now')")
db.execute("UPDATE procurement SET payload=? WHERE id='po-1'", (json.dumps({'status':'Ordered'}),))
db.execute("DELETE FROM supplier_ap_mutation_guard")
db.execute("INSERT INTO procurement_receipts VALUES ('grn-1','p-1','c-1','b-1',?)", (json.dumps({'status':'Received'}),))
try:
  db.execute("UPDATE procurement_receipts SET payload=? WHERE id='grn-1'", (json.dumps({'status':'Accepted'}),))
  raise AssertionError('direct accepted receipt must be rejected')
except sqlite3.IntegrityError: pass
print('ok')
`;
  const result = execFileSync(PYTHON_BIN, ['-c', sqliteAcceptance], { input: match[1], encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  assert.equal(result, 'ok');
});

test('purchase-order cancellation migration blocks direct cancellation', () => {
  const rust = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const match = rust.match(/version:\s*33,[\s\S]*?sql:\s*r#"([\s\S]*?)"#,\s*kind:/);
  assert.ok(match, 'migration 33 must exist');
  const sqliteAcceptance = String.raw`
import json, sqlite3, sys
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE supplier_ap_mutation_guard (operation_id TEXT PRIMARY KEY, created_at TEXT)')
db.execute('CREATE TABLE procurement (id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
db.executescript(sys.stdin.read())
db.execute("INSERT INTO procurement VALUES ('po-1',?)", (json.dumps({'status':'Ordered'}),))
try:
  db.execute("UPDATE procurement SET payload=? WHERE id='po-1'", (json.dumps({'status':'Cancelled'}),))
  raise AssertionError('direct PO cancellation must be rejected')
except sqlite3.IntegrityError: pass
db.execute("INSERT INTO supplier_ap_mutation_guard VALUES ('cancel-1','now')")
db.execute("UPDATE procurement SET payload=? WHERE id='po-1'", (json.dumps({'status':'Cancelled'}),))
db.execute('DELETE FROM supplier_ap_mutation_guard')
try:
  db.execute("UPDATE procurement SET payload=? WHERE id='po-1'", (json.dumps({'status':'Ordered'}),))
  raise AssertionError('governed cancellation must be immutable')
except sqlite3.IntegrityError: pass
print('ok')
`;
  const result = execFileSync(PYTHON_BIN, ['-c', sqliteAcceptance], { input: match[1], encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  assert.equal(result, 'ok');
});

test('certificate balance migration exposes governed financial columns', () => {
  const rust = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const match = rust.match(/version:\s*34,[\s\S]*?sql:\s*r#"([\s\S]*?)"#,\s*kind:/);
  assert.ok(match, 'migration 34 must exist');
  const sqliteAcceptance = String.raw`
import sqlite3, sys
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE payment_certificates (id TEXT PRIMARY KEY, contract_id TEXT, certificate_date_sql TEXT, status_sql TEXT, payload TEXT NOT NULL)')
db.executescript(sys.stdin.read())
db.execute("INSERT INTO payment_certificates (id,contract_id,certificate_date_sql,status_sql,payload) VALUES ('pc-1','c-1','2026-01-01','Approved','{\"retention_amount\":50,\"cumulative_retention_amount\":50,\"advance_recovery\":20,\"remaining_advance_balance\":80}')")
assert db.execute("SELECT retention_amount_sql,cumulative_retention_amount_sql,advance_recovery_sql,remaining_advance_balance_sql FROM payment_certificates WHERE id='pc-1'").fetchone() == (50.0,50.0,20.0,80.0)
print('ok')
`;
  const result = execFileSync(PYTHON_BIN, ['-c', sqliteAcceptance], { input: match[1], encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  assert.equal(result, 'ok');
});

test('governed cash timeline is time-phased and excludes cancelled movements', () => {
  const rust = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const match = rust.match(/version:\s*35,[\s\S]*?sql:\s*r#"([\s\S]*?)"#,\s*kind:/);
  assert.ok(match, 'migration 35 must exist');
  const sqliteAcceptance = String.raw`
import sqlite3, sys
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE cash_flow (id TEXT PRIMARY KEY, created_at TEXT, project_id TEXT, contract_id TEXT, boq_item_id TEXT, financial_date TEXT, movement_type_sql TEXT, financial_status TEXT, financial_inflow REAL, financial_outflow REAL)')
db.executescript(sys.stdin.read())
db.executemany('INSERT INTO cash_flow VALUES (?,?,?,?,?,?,?,?,?,?)', [
 ('a','2026-01-01T01:00','p','c',None,'2026-01-01','Forecast','Open',100,0),
 ('b','2026-01-02T01:00','p','c',None,'2026-01-02','Forecast','Open',0,30),
 ('c','2026-01-03T01:00','p','c',None,'2026-01-03','Forecast','Cancelled',0,99),
 ('d','2026-01-01T01:00','p','c',None,'2026-01-01','Actual','Settled',0,20),
])
rows = db.execute('SELECT id,net,cumulative_balance FROM governed_cash_flow_timeline ORDER BY movement_type,id').fetchall()
assert rows == [('d',-20.0,-20.0),('a',100.0,100.0),('b',-30.0,70.0),('c',-99.0,70.0)]
print('ok')
`;
  const result = execFileSync(PYTHON_BIN, ['-c', sqliteAcceptance], { input: match[1], encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  assert.equal(result, 'ok');
});

test('SOV availability migration blocks backend cost and commitment overruns without double-counting accepted GRNs', () => {
  const rust = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const match = rust.match(/version:\s*41,[\s\S]*?sql:\s*r#"([\s\S]*?)"#,\s*kind:/);
  assert.ok(match, 'migration 41 must exist');
  const sqliteAcceptance = String.raw`
import json, sqlite3, sys
db = sqlite3.connect(':memory:')
for table in ('contract_sov_lines', 'cost_entries', 'procurement', 'procurement_receipts'):
  db.execute(f'''CREATE TABLE {table} (
    id TEXT PRIMARY KEY, project_id TEXT, contract_id TEXT, boq_item_id TEXT, payload TEXT NOT NULL
  )''')
db.executescript(sys.stdin.read())
scope = ('p-1', 'c-1', 'b-1')
db.execute("INSERT INTO contract_sov_lines VALUES ('sov-1',?,?,?,?)", (*scope, json.dumps({'status':'Active','original_budget':100})))
db.execute("INSERT INTO procurement VALUES ('po-1',?,?,?,?)", (*scope, json.dumps({'status':'Draft','total_cost':80})))
db.execute("UPDATE procurement SET payload=? WHERE id='po-1'", (json.dumps({'status':'Ordered','total_cost':80}),))
try:
  db.execute("INSERT INTO cost_entries VALUES ('cost-1',?,?,?,?)", (*scope, json.dumps({'amount':25})))
  raise AssertionError('actual posting must be blocked when actual plus open PO exceeds budget')
except sqlite3.IntegrityError: pass
db.execute("INSERT INTO procurement_receipts VALUES ('grn-1',?,?,?,?)", (*scope, json.dumps({'procurement_id':'po-1','status':'Accepted','accepted_quantity':4,'unit_cost':20})))
db.execute("INSERT INTO cost_entries VALUES ('cost-accepted-grn',?,?,?,?)", (*scope, json.dumps({'amount':80,'source_type':'procurement_receipt'})))
assert db.execute("SELECT count(*) FROM cost_entries").fetchone()[0] == 1
try:
  db.execute("UPDATE procurement SET payload=? WHERE id='po-1'", (json.dumps({'status':'Ordered','total_cost':130}),))
  raise AssertionError('PO amendment must be blocked when it exceeds SOV availability')
except sqlite3.IntegrityError: pass
print('ok')
`;
  const result = execFileSync(PYTHON_BIN, ['-c', sqliteAcceptance], { input: match[1], encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  assert.equal(result, 'ok');
});

test('financial period lock migration blocks direct actual-cost and cash rewrites in SQLite', () => {
  const rust = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const match = rust.match(/version:\s*42,[\s\S]*?sql:\s*r#"([\s\S]*?)"#,\s*kind:/);
  assert.ok(match, 'migration 42 must exist');
  const sqliteAcceptance = String.raw`
import json, sqlite3, sys
db = sqlite3.connect(':memory:')
for table in ('reporting_periods', 'cost_entries', 'cash_flow'):
  db.execute(f'CREATE TABLE {table} (id TEXT PRIMARY KEY, project_id TEXT, payload TEXT NOT NULL)')
db.executescript(sys.stdin.read())
db.execute("INSERT INTO reporting_periods VALUES ('period-1','p-1',?)", (json.dumps({'status':'Locked','start_date':'2026-01-01','end_date':'2026-01-31'}),))
for table, payload in [('cost_entries', {'date':'2026-01-15','amount':100}), ('cash_flow', {'date':'2026-01-15','outflow':100})]:
  try:
    db.execute(f"INSERT INTO {table} VALUES (?, ?, ?)", (f'{table}-locked','p-1',json.dumps(payload)))
    raise AssertionError(f'{table} insert into a locked period must be rejected')
  except sqlite3.IntegrityError: pass
db.execute("INSERT INTO cost_entries VALUES ('cost-open','p-1',?)", (json.dumps({'date':'2026-02-01','amount':100}),))
try:
  db.execute("UPDATE cost_entries SET payload=? WHERE id='cost-open'", (json.dumps({'date':'2026-01-15','amount':100}),))
  raise AssertionError('moving a cost into a locked period must be rejected')
except sqlite3.IntegrityError: pass
db.execute("INSERT INTO cash_flow VALUES ('cash-open','p-1',?)", (json.dumps({'date':'2026-02-01','outflow':100}),))
try:
  db.execute("DELETE FROM cash_flow WHERE id='cash-open'")
except sqlite3.IntegrityError:
  raise AssertionError('a cash movement outside the locked period must remain mutable')
print('ok')
`;
  const result = execFileSync(PYTHON_BIN, ['-c', sqliteAcceptance], { input: match[1], encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  assert.equal(result, 'ok');
});

test('procurement period lock migration blocks backdated PO and GRN rewrites in SQLite', () => {
  const rust = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const match = rust.match(/version:\s*43,[\s\S]*?sql:\s*r#"([\s\S]*?)"#,\s*kind:/);
  assert.ok(match, 'migration 43 must exist');
  const sqliteAcceptance = String.raw`
import json, sqlite3, sys
db = sqlite3.connect(':memory:')
for table in ('reporting_periods', 'procurement', 'procurement_receipts'):
  db.execute(f'CREATE TABLE {table} (id TEXT PRIMARY KEY, project_id TEXT, payload TEXT NOT NULL)')
db.executescript(sys.stdin.read())
db.execute("INSERT INTO reporting_periods VALUES ('period-1','p-1',?)", (json.dumps({'status':'Closed','start_date':'2026-01-01','end_date':'2026-01-31'}),))
for table, payload in [('procurement', {'order_date':'2026-01-15'}), ('procurement_receipts', {'receipt_date':'2026-01-15'})]:
  try:
    db.execute(f"INSERT INTO {table} VALUES (?, ?, ?)", (f'{table}-locked','p-1',json.dumps(payload)))
    raise AssertionError(f'{table} insert into a closed period must be rejected')
  except sqlite3.IntegrityError: pass
db.execute("INSERT INTO procurement VALUES ('po-open','p-1',?)", (json.dumps({'order_date':'2026-02-01'}),))
try:
  db.execute("DELETE FROM procurement WHERE id='po-open'")
except sqlite3.IntegrityError:
  raise AssertionError('a PO outside the closed period must remain mutable')
print('ok')
`;
  const result = execFileSync(PYTHON_BIN, ['-c', sqliteAcceptance], { input: match[1], encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  assert.equal(result, 'ok');
});

test('progress correction migration protects locked WIR history and requires an approved scoped original', () => {
  const rust = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const match = rust.match(/version:\s*46,[\s\S]*?sql:\s*r#"([\s\S]*?)"#,\s*kind:/);
  assert.ok(match, 'migration 46 must exist');
  const sqliteAcceptance = String.raw`
import json, sqlite3, sys
db = sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
for table, ddl in {
 'projects':'id TEXT PRIMARY KEY', 'contracts':'id TEXT PRIMARY KEY', 'boq_items':'id TEXT PRIMARY KEY',
 'reporting_periods':'id TEXT PRIMARY KEY, project_id TEXT, payload TEXT NOT NULL',
 'wir_entries':'id TEXT PRIMARY KEY, created_at TEXT, project_id TEXT, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL'
}.items(): db.execute(f'CREATE TABLE {table} ({ddl})')
db.execute("INSERT INTO projects VALUES ('p1')"); db.execute("INSERT INTO contracts VALUES ('c1')"); db.execute("INSERT INTO boq_items VALUES ('b1')")
db.executescript(sys.stdin.read())
db.execute("INSERT INTO reporting_periods VALUES ('jan','p1',?)", (json.dumps({'status':'Locked','start_date':'2026-01-01','end_date':'2026-01-31'}),))
try:
 db.execute("INSERT INTO wir_entries VALUES ('locked','t','p1','c1',NULL,'b1',NULL,NULL,?)", (json.dumps({'inspection_date':'2026-01-15','status':'Approved'}),)); raise AssertionError('locked WIR must be rejected')
except sqlite3.IntegrityError: pass
db.execute("INSERT INTO wir_entries VALUES ('wir1','t','p1','c1',NULL,'b1',NULL,NULL,?)", (json.dumps({'inspection_date':'2026-02-01','status':'Approved','quantity':1}),))
try:
 db.execute("INSERT INTO progress_corrections VALUES ('bad','t','p1','c1',NULL,'b1','missing',?)", (json.dumps({'quantity':1,'effective_date':'2026-02-02','reason':'test','correction_type':'Reversal','status':'Posted'}),)); raise AssertionError('missing original must be rejected')
except sqlite3.IntegrityError: pass
db.execute("INSERT INTO progress_corrections VALUES ('ok','t','p1','c1',NULL,'b1','wir1',?)", (json.dumps({'quantity':1,'effective_date':'2026-02-02','reason':'test','correction_type':'Reversal','status':'Posted'}),))
try:
 db.execute("INSERT INTO progress_corrections VALUES ('over','t','p1','c1',NULL,'b1','wir1',?)", (json.dumps({'quantity':2,'effective_date':'2026-02-02','reason':'over-reversal','correction_type':'Reversal','status':'Posted'}),)); raise AssertionError('total correction cannot exceed original WIR quantity')
except sqlite3.IntegrityError: pass
try:
 db.execute("UPDATE progress_corrections SET payload=? WHERE id='ok'", (json.dumps({'quantity':2,'effective_date':'2026-02-02','reason':'rewrite','correction_type':'Reversal','status':'Posted'}),)); raise AssertionError('posted correction must be immutable')
except sqlite3.IntegrityError: pass
print('ok')
`;
  const result = execFileSync(PYTHON_BIN, ['-c', sqliteAcceptance], { input: match[1], encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  assert.equal(result, 'ok');
});

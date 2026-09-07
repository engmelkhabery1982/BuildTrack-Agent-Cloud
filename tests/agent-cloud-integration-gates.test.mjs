import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('D2 forecast consumes approved D1 cost plans and measured EVM without fabricated progress', () => {
  const source = read('src/components/EstimateForecastModal.tsx');
  assert.match(source, /v\.status === 'Approved'/);
  assert.match(source, /calculateEvmAtDataDate/);
  assert.match(source, /missingApprovedCostPlan/);
  assert.match(source, /missingMeasuredEv/);
  assert.doesNotMatch(source, /bac\s*\*\s*0\.4/);
  assert.doesNotMatch(source, /pd\.is_closed_period\s*\?\s*1\s*:\s*0\.8/);
  assert.match(source, /approveEstimateVersion/);
  assert.match(source, /!controlAccountId/);
  const command = read('src-tauri/src/estimate_versioning.rs');
  assert.match(command, /pool\.begin\(\)/);
  assert.match(command, /FAC cannot be below AC plus open commitment/);
});

test('D4 variance reasons persist in the governed register rather than browser localStorage', () => {
  const modal = read('src/components/CostVarianceDrillDownModal.tsx');
  assert.match(modal, /dataRepository\.(insert|update)<VarianceActionItem>\('variance_actions'/);
  assert.doesNotMatch(modal, /localStorage/);
  assert.match(modal, /version\.control_account_id === account\.id/);
  assert.match(modal, /approvedPlan\?\.delivery_cost_bac/);
  assert.match(modal, /belongsToAccount\(entry, account\.id/);
  assert.match(modal, /forecastComplete \? `\$\$\{formatVal\(node\.etc\)\}` : 'غير متاح'/);
  assert.doesNotMatch(modal, /Math\.max\(0, budget - actual\)/);
  assert.doesNotMatch(modal, /notes\.includes\('Period:'\)/);
});

test('E2 persistence errors are not hidden by a state-only success path', () => {
  const hook = read('src/hooks/useVarianceActions.ts');
  assert.doesNotMatch(hook, /state-only/);
  assert.match(hook, /Closed variance actions are immutable/);
  const migrations = read('src-tauri/src/lib.rs');
  assert.match(migrations, /variance_action_close_requires_evidence/);
  assert.match(migrations, /variance_action_closed_immutable/);
  assert.match(migrations, /variance_action_transition_guard/);
  assert.match(migrations, /variance_action_resolution_required/);
  assert.match(hook, /Invalid variance-action transition/);
});

test('E3 controlled report issuance is SHA-256, portfolio-safe, atomic, immutable and registered', () => {
  const report = read('src/components/ReportPack.tsx');
  assert.match(report, /`sha256:\$\{hex\}`/);
  assert.match(report, /projectId === 'all' \? null : projectId/);
  assert.doesNotMatch(report, /projects\[0\]\?\.id \|\| 'all'/);
  assert.match(report, /exportDisplayedSnapshotExcel/);
  assert.match(report, /displayReconciliation\?\.approvedVariations/);
  assert.match(report, /hash === selectedVersion\.snapshot_hash \? 'verified' : 'mismatch'/);
  assert.match(report, /Hash Mismatch — export blocked/);
  assert.match(report, /template: reportTemplates\.find/);
  assert.match(report, /template_id: templateId \|\| null/);

  const command = read('src-tauri/src/report_versioning.rs');
  assert.match(command, /pool\.begin\(\)/);
  assert.match(command, /tx\.commit\(\)/);
  assert.match(command, /tx\.rollback\(\)/);
  assert.match(command, /status='Superseded'/);
  assert.match(command, /INSERT INTO audit_log/);

  const migrations = read('src-tauri/src/lib.rs');
  assert.match(migrations, /issue_report_version/);
  assert.match(migrations, /idx_report_single_issued_pack/);
  assert.match(migrations, /report_version_issued_immutable/);
  assert.match(migrations, /report_version_locked_delete/);
});

test('E1 cockpit uses dated governed facts and never manufactures WIR or EVM values', () => {
  const cockpit = read('src/components/IntegratedProjectControlsCockpit.tsx');
  assert.match(cockpit, /calculateEvmAtDataDate/);
  assert.match(cockpit, /approvedWirs\.map/);
  assert.match(cockpit, /evm\.costCPI/);
  assert.doesNotMatch(cockpit, /status === 'In Progress' \? 50/);
  assert.doesNotMatch(cockpit, /WIR-2026-/);
  assert.doesNotMatch(cockpit, /Al-Gihaz Contracting Co\./);
  assert.doesNotMatch(cockpit, /2026-09-01/);
});

test('D1 approved cost plans use an atomic desktop transaction and audit trail', () => {
  const command = read('src-tauri/src/cost_plan_versioning.rs');
  assert.match(command, /pool\.begin\(\)/);
  assert.match(command, /tx\.commit\(\)/);
  assert.match(command, /tx\.rollback\(\)/);
  assert.match(command, /INSERT INTO audit_log/);
  const repository = read('src/data/sqliteRepository.ts');
  assert.match(repository, /Approved cost plans must use the governed atomic approval workflow/);
  const modal = read('src/components/CostPlanModal.tsx');
  assert.match(modal, /value="S-Curve"/);
  assert.match(modal, /value="Front-loaded"/);
  assert.match(modal, /value="Back-loaded"/);
  assert.match(modal, /cost-plan-frequency-select/);
  assert.doesNotMatch(modal, /value="SCurve"/);
});

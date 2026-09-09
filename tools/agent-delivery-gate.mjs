import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = Object.fromEntries(process.argv.slice(2).reduce((pairs, item, index, all) => {
  if (item.startsWith('--')) pairs.push([item.slice(2), all[index + 1]]); return pairs;
}, []));
const fail = (message) => { throw new Error(`DELIVERY FAIL: ${message}`); };
const execute = (command, args = []) => {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: process.platform === 'win32' });
  return { name: [command, ...args].join(' '), exit_code: result.status ?? 127,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim() };
};
const git = (...args) => { const result = execute('git', args); if (result.exit_code) fail(result.output); return result.output; };
const root = git('rev-parse', '--show-toplevel'); process.chdir(root);
const active = Object.fromEntries(readFileSync(resolve(root, 'docs/agent-work-orders/ACTIVE.md'), 'utf8').split(/\r?\n/)
  .map((line) => line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const feature = argv.feature; const startHead = argv['start-head'];
const allowMissingCargo = Object.hasOwn(argv, 'allow-missing-cargo');
if (!feature || !startHead) fail('use --start-head <commit> --feature <Wxx>.');
const featureNumber = Number(/^W(\d{2})$/.exec(feature)?.[1]);
const queueMode = active.EXECUTION_MODE === 'OPEN_SEQUENTIAL_CANDIDATE_QUEUE';
if (!queueMode && feature !== active.CURRENT_FEATURE) fail(`requested ${feature} but ACTIVE selects ${active.CURRENT_FEATURE}.`);
if (queueMode && (!Number.isInteger(featureNumber) || featureNumber < 4 || featureNumber > 90)) fail(`requested ${feature} is outside OPEN_FEATURE_RANGE W04-W90.`);
git('cat-file', '-e', `${startHead}^{commit}`);

const resultRelative = `docs/agent-results/${feature}_RESULT.md`;
const resultPath = resolve(root, resultRelative);
if (!existsSync(resultPath)) fail(`missing required ${feature}_RESULT.md.`);
const report = readFileSync(resultPath, 'utf8');
const readyForReview = /READY FOR CODEX REVIEW/.test(report);
const readyForLocalVerification = /READY FOR CODEX LOCAL VERIFICATION/.test(report);
if (!readyForReview && !readyForLocalVerification) fail('result must declare READY FOR CODEX REVIEW or READY FOR CODEX LOCAL VERIFICATION.');
if (/\bCLOSED\b|8\s*\/\s*10/i.test(report)) fail('agents cannot self-declare CLOSED or 8/10.');
const requiredGaps = feature === active.CURRENT_FEATURE
  ? (active.REQUIRED_GAPS || '').split('|').filter(Boolean)
  : Array.from({ length: 10 }, (_, index) => `${feature}-G${String(index + 1).padStart(2, '0')}`);
for (const gap of requiredGaps) {
  const pattern = new RegExp(`^\\s*${gap.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=PASS\\s*$`, 'mi');
  if (pattern.test(report)) continue;
  const pendingCargoAllowed = allowMissingCargo && readyForLocalVerification && [`${feature}-G10`, ...(feature === 'W04' ? ['W04-R12'] : [])].includes(gap)
    && new RegExp(`^\\s*${gap}=PENDING_LOCAL_CARGO\\s*$`, 'mi').test(report);
  if (!pendingCargoAllowed) fail(`result must contain '${gap}=PASS'${allowMissingCargo ? ' or the explicitly allowed local-Cargo status' : ''}.`);
}

const queueAreaFiles = (number) => {
  if (number === 5) return ['src/utils/cashForecast.ts','src/utils/cashFlowForecast.ts','src/components/CashFlowForecastBoard.tsx','src/utils/paymentTerms.ts','tests/cash-forecast-assumptions-engine.test.mjs','tests/project-forecast.test.mjs'];
  if (number === 6) return ['src/utils/governedHealthScore.ts','src/utils/earlyWarningSystem.ts','src/utils/projectControlAnalytics.ts','src/components/GovernedHealthScoreCard.tsx','src/components/IntegratedProjectControlsCockpit.tsx','src/components/Dashboard.tsx','src/components/ReportPack.tsx','src/components/PreferencesPanel.tsx','tests/governed-health-score.test.mjs','tests/early-warning-system.test.mjs'];
  if (number === 7) return ['src/utils/resourceLoading.ts','src/utils/resourceLevelingEngine.ts','src/utils/cpm.ts','src/utils/scheduleVersioning.ts','src/components/ResourceCapacityBoard.tsx','src/components/ResourceLevelingRegister.tsx','tests/resource-leveling.test.mjs'];
  if (number === 8) return ['src/components/ReportTemplateDesigner.tsx','src/components/ReportPack.tsx','src/data/reportVersioning.ts','src-tauri/src/report_versioning.rs','tests/agent-cloud-integration-gates.test.mjs','tests/tauri-command-registration.test.mjs'];
  if (number === 9) return ['src/components/AuditTrailExplorer.tsx','src/data/governanceRules.ts','tests/phase0-governance.test.mjs','tests/tauri-command-registration.test.mjs'];
  if (number === 10) return ['src/data/repository.ts','src/data/supabaseRepository.ts','src/components/SyncCenter.tsx','tests/phase0-governance.test.mjs'];
  if (number === 11) return ['src/data/governanceRules.ts','src/components/WorkQueue.tsx','tests/phase0-governance.test.mjs','tests/tauri-command-registration.test.mjs'];
  if (number === 12) return ['src/data/repository.ts','src/data/supabaseRepository.ts','src/data/contractScope.ts','src/utils/portalEngine.ts','src/components/ExternalPortalView.tsx','tests/g3-scoped-portal.test.mjs'];
  if (number === 13) return ['tests/fixtures/referenceProjectAcceptance.mjs','tests/reference-project-acceptance.test.mjs','tests/kpi-source-drilldown-reconciliation.test.mjs'];
  if (number <= 26) return ['src/data/codeControls.ts','src/data/hierarchyRules.ts','src/utils/scopeGovernance.ts','src/utils/scopeReconciliation.ts','src/data/contractScope.ts','src/data/contractRules.ts','tests/contract-schedule-wir-acceptance-20260825.test.mjs','tests/phase1-commercial.test.mjs','tests/control-account-migration.test.mjs'];
  if (number <= 39) return ['src/utils/cpm.ts','src/utils/schedulePlanning.ts','src/utils/scheduleVersioning.ts','src/data/baselineGovernance.ts','src/components/ScheduleVersionModal.tsx','src/components/ThreeWayGanttOverlay.tsx','tests/schedule-versioning.test.mjs','tests/baseline-current-forecast.test.mjs','tests/gantt-overlay-engine.test.mjs','tests/fragnet-tia-engine.test.mjs'];
  if (number <= 52) return ['src/utils/controlAccountSummary.ts','src/utils/costPlanPhasing.ts','src/utils/costVariance.ts','src/utils/overheadAllocation.ts','src/data/costPlanVersioning.ts','src/data/estimateVersioning.ts','src-tauri/src/cost_plan_versioning.rs','src-tauri/src/estimate_versioning.rs','tests/control-account-time-phasing-overhead.test.mjs','tests/cost-plan-phasing.test.mjs','tests/eac-multi-method.test.mjs','tests/financial-ledger-migration.test.mjs'];
  if (number <= 65) return ['src/utils/quantityLedger.ts','src/utils/evm.ts','src/utils/earnedSchedule.ts','src/utils/resourceProductivity.ts','src/utils/kpiReconciliation.ts','src/utils/varianceActionRegister.ts','tests/evm.test.mjs','tests/variance-action-register.test.mjs','tests/kpi-source-drilldown-reconciliation.test.mjs','tests/contract-schedule-wir-acceptance-20260825.test.mjs'];
  if (number <= 78) return ['src/data/governedImport.ts','src/data/primaveraImport.ts','src/utils/primaveraReconciliation.ts','src/utils/xerEngine.ts','src/components/XerReconciliationBoard.tsx','src-tauri/src/import_batch.rs','tests/primavera-reconciliation.test.mjs','tests/contract-schedule-wir-acceptance-20260825.test.mjs'];
  return ['src/data/governanceRules.ts','src/data/reportingPeriodGovernance.ts','src/data/dataQuality.ts','src/components/DataQualityChecks.tsx','src/components/AuditTrailExplorer.tsx','src/data/reportVersioning.ts','src-tauri/src/report_versioning.rs','tests/phase0-governance.test.mjs','tests/agent-cloud-integration-gates.test.mjs','tests/reference-project-acceptance.test.mjs','tests/tauri-command-registration.test.mjs'];
};
const sharedQueueFiles = ['src/types/index.ts','src/data/dataDictionary.ts','src/data/sqliteRepository.ts','src/hooks/useData.ts','src-tauri/src/lib.rs','src/App.tsx'];
const allowed = new Set(queueMode && feature !== active.CURRENT_FEATURE
  ? [...queueAreaFiles(featureNumber), ...sharedQueueFiles]
  : active.MODIFY_ALLOWLIST.split('|'));
allowed.add(`docs/agent-results/${feature}_RESULT.md`);
allowed.add(`docs/agent-results/${feature}_EVIDENCE.json`);
allowed.add('docs/agent-results/AGENT_QUEUE_CURSOR.md');
const conditional = new Set((active.CONDITIONAL_MODIFY || '').split('|').filter(Boolean));
for (const path of (argv['allow-conditional'] || '').split(',').filter(Boolean)) {
  if (!conditional.has(path)) fail(`conditional file is not declared: ${path}`); allowed.add(path);
}
const tracked = git('diff', '--name-status', startHead).split(/\r?\n/).filter(Boolean);
const untracked = git('ls-files', '--others', '--exclude-standard').split(/\r?\n/).filter(Boolean).map((p) => `A\t${p}`);
const changes = [...tracked, ...untracked];
for (const line of changes) {
  const parts = line.split('\t'); const status = parts[0]; const path = parts.at(-1).replaceAll('\\', '/');
  if (/^[DR]/.test(status)) fail(`delete/rename forbidden: ${line}`);
  if (!allowed.has(path)) fail(`outside MODIFY_ALLOWLIST: ${path}`);
  for (const forbidden of active.FORBIDDEN.split('|').filter(Boolean)) {
    const regex = new RegExp(`^${forbidden.split('**').map((part) => part.split('*').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*')}$`);
    if (regex.test(path)) fail(`protected path: ${path}`);
  }
  if (/(^|\/)(node_modules|dist|target)(\/|$)|\.(zip|db|sqlite|sqlite3)$/i.test(path)) fail(`artifact forbidden: ${path}`);
}

const commands = [execute('npm', ['test']), execute('npm', ['run', 'build']),
  execute('cargo', ['test', '--manifest-path', 'src-tauri/Cargo.toml']), execute('git', ['diff', '--check', startHead])];
const cargoCommand = commands[2];
const cargoUnavailable = cargoCommand.exit_code !== 0 && /ENOENT|not found|not recognized|cannot find/i.test(cargoCommand.output);
const availableCommandsPass = commands.every((item, index) => item.exit_code === 0 || (index === 2 && allowMissingCargo && cargoUnavailable));
const evidenceResult = availableCommandsPass ? (cargoUnavailable ? 'PENDING_LOCAL_CARGO' : 'PASS') : 'FAIL';
const hashes = changes.map((line) => line.split('\t').at(-1).replaceAll('\\', '/')).filter((path) => existsSync(resolve(root, path)))
  .map((path) => ({ path, sha256: createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex').toUpperCase() }));
const evidenceRelative = `docs/agent-results/${feature}_EVIDENCE.json`;
const evidence = { feature, result: evidenceResult, start_head: startHead,
  end_head: git('rev-parse', 'HEAD'), generated_utc: new Date().toISOString(), changes: [...changes, `A\t${evidenceRelative}`],
  file_hashes: hashes, commands };
writeFileSync(resolve(root, evidenceRelative), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(evidence, null, 2));
if (evidence.result === 'FAIL') process.exit(1);

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const run = (command, args = []) => execFileSync(command, args, { encoding: 'utf8' }).trim();
const fail = (message) => { throw new Error(`PREFLIGHT FAIL: ${message}`); };
const root = run('git', ['rev-parse', '--show-toplevel']);
process.chdir(root);

const activePath = resolve(root, 'docs/agent-work-orders/ACTIVE.md');
if (!existsSync(activePath)) fail('ACTIVE.md is missing.');
const active = Object.fromEntries(readFileSync(activePath, 'utf8').split(/\r?\n/)
  .map((line) => line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
  .map((match) => [match[1], match[2].trim()]));
const queueMode = active.EXECUTION_MODE === 'OPEN_SEQUENTIAL_CANDIDATE_QUEUE';

for (const key of ['ACCEPTED_HEAD', 'CLOUD_BASE_BRANCH', 'DELIVERY_BRANCH', 'CURRENT_FEATURE', 'MODIFY_ALLOWLIST', 'FORBIDDEN']) {
  if (!active[key]) fail(`ACTIVE.${key} is missing.`);
}
for (const key of ['CORRECTION_FILE', 'EXECUTION_PLAN_FILE']) {
  if (active[key] && !existsSync(resolve(root, active[key]))) fail(`ACTIVE.${key} points to missing file: ${active[key]}`);
}

const status = run('git', ['status', '--porcelain=v1', '--untracked-files=all']);
if (status) fail(`working tree is not clean.\n${status}`);
const head = run('git', ['rev-parse', 'HEAD']);
const branch = run('git', ['branch', '--show-current']);
const patternText = active.WORK_BRANCH_PATTERN || `^${active.DELIVERY_BRANCH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
let pattern;
try { pattern = new RegExp(patternText); } catch { fail(`invalid WORK_BRANCH_PATTERN: ${patternText}`); }
if (!pattern.test(branch) && !queueMode) fail(`current branch '${branch}' does not match WORK_BRANCH_PATTERN '${patternText}'.`);
let lineage_verification = 'ANCESTOR';
try {
  run('git', ['cat-file', '-e', `${active.ACCEPTED_HEAD}^{commit}`]);
  run('git', ['merge-base', '--is-ancestor', active.ACCEPTED_HEAD, head]);
} catch {
  if (active.ACCEPTED_LINEAGE_MODE !== 'ANCESTOR_OR_REMOTE_MAIN_ATTESTATION') {
    fail(`HEAD ${head} is not based on accepted ${active.ACCEPTED_HEAD}.`);
  }
  let remoteHead;
  try { remoteHead = run('git', ['rev-parse', `origin/${active.CLOUD_BASE_BRANCH}`]); }
  catch { fail(`accepted commit is absent and origin/${active.CLOUD_BASE_BRANCH} cannot be verified.`); }
  if (remoteHead !== head && !queueMode) fail(`accepted history is shallow and HEAD ${head} does not equal pulled origin/${active.CLOUD_BASE_BRANCH} ${remoteHead}.`);
  const attestationRelative = active.ACCEPTED_ATTESTATION_FILE;
  const expectedHash = active.ACCEPTED_ATTESTATION_SHA256;
  if (!attestationRelative || !expectedHash) fail('shallow verification requires ACCEPTED_ATTESTATION_FILE and SHA256.');
  const attestationPath = resolve(root, attestationRelative);
  if (!existsSync(attestationPath)) fail(`accepted attestation is missing: ${attestationRelative}`);
  const canonicalContent = readFileSync(attestationPath, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const actualHash = createHash('sha256').update(canonicalContent, 'utf8').digest('hex').toUpperCase();
  if (actualHash !== expectedHash.toUpperCase()) fail(`accepted attestation hash mismatch: ${attestationRelative}`);
  lineage_verification = 'REMOTE_MAIN_ATTESTATION';
}

for (const path of ['AGENTS.md', 'docs/agent-work-orders/AGENT_START_HERE_AR.md', 'docs/agent-work-orders/ACTIVE.md',
  'docs/agent-work-orders/NEXT_WEEK_90_FEATURES_EXECUTION_PLAN_AR.md', 'docs/agent-work-orders/FEATURE_READ_PACKS_AR.md',
  'docs/agent-work-orders/COMPACT_PROJECT_MODEL_AR.md', 'docs/agent-work-orders/OPEN_90_FEATURE_EXECUTION_SYSTEM_AR.md',
  'tools/agent-delivery-gate.mjs']) {
  if (!existsSync(resolve(root, path))) fail(`required file missing: ${path}`);
}

console.log(JSON.stringify({ result: 'PASS', repository: root, branch,
  required_base_branch: active.CLOUD_BASE_BRANCH, delivery_target: active.DELIVERY_BRANCH,
  head, accepted_ancestor: active.ACCEPTED_HEAD, lineage_verification, feature: active.CURRENT_FEATURE,
  execution_mode: active.EXECUTION_MODE || 'SINGLE_FEATURE', open_feature_range: active.OPEN_FEATURE_RANGE || null,
  correction_file: active.CORRECTION_FILE || null, execution_plan_file: active.EXECUTION_PLAN_FILE || null,
  modify_allowlist: active.MODIFY_ALLOWLIST.split('|'), conditional_modify: (active.CONDITIONAL_MODIFY || '').split('|').filter(Boolean) }, null, 2));

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('cloud continuation specification retains every ordered F1-H1 feature gate', () => {
  const specification = read('docs/agent-work-orders/NEXT_FEATURES_DETAILED_EXECUTION_AR.md');
  const ordered = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'G1', 'G2', 'G3', 'H1'];
  let previous = -1;
  for (const feature of ordered) {
    const position = specification.indexOf(`## ${feature} —`);
    assert.ok(position > previous, `${feature} must exist after the preceding feature`);
    previous = position;
  }
  assert.match(specification, /DELETE_ALLOWLIST: \[\]/);
  assert.match(specification, /READY FOR CODEX REVIEW/);
  assert.match(specification, /WIP\/BLOCKED/);
  assert.match(specification, /لا `CLOSED` ولا تقييم 8\/10 ذاتي/);
});

test('universal agent prompt enforces governed sources, atomic transitions and honest test evidence', () => {
  const prompt = read('docs/agent-work-orders/UNIVERSAL_CLOUD_AGENT_PROMPT_AR.md');
  assert.match(prompt, /checkpoint-c4-e3-accepted-2026-09-07/);
  assert.match(prompt, /NEXT_FEATURES_DETAILED_EXECUTION_AR\.md/);
  assert.match(prompt, /لا تختلق `EV\/PV\/ETC\/FAC\/progress`/);
  assert.match(prompt, /backend ذريًا يشمل validation \+ transition \+ postings \+ audit \+ rollback/);
  assert.match(prompt, /PASS\/FAIL\/NOT RUN/);
  assert.match(prompt, /IN PROGRESS — provisional cloud execution/);
  assert.match(prompt, /لا تمنح نفسك `CLOSED 8\/10`/);
});

test('active and master work orders point to F1 and the detailed authority', () => {
  const active = read('docs/agent-work-orders/ACTIVE.md');
  const master = read('docs/agent-work-orders/MASTER_CLOUD_DEVELOPMENT_WORK_ORDER_AR.md');
  assert.match(active, /## F1 — Labor Timesheet Approval & Actual-Cost Posting/);
  assert.match(active, /NEXT_FEATURES_DETAILED_EXECUTION_AR\.md/);
  assert.match(master, /NEXT_FEATURES_DETAILED_EXECUTION_AR\.md/);
  assert.match(master, /F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F9 → G1 → G2 → G3 → H1/);
  assert.match(master, /ممنوع اختيار `find\(\)` لأول version\/contract\/control account/);
});

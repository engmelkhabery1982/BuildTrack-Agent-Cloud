import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrimaveraReconciliation } from '../src/utils/primaveraReconciliation.ts';
import { parsePrimaveraXerTasks } from '../src/data/primaveraImport.ts';
import { readFileSync } from 'node:fs';

test('Primavera Reconciliation - enforces project_id and contract_id scope parameters', () => {
  assert.throws(() => {
    buildPrimaveraReconciliation({
      projectId: '',
      contractId: 'c-01',
      fileContent: '',
      fileName: 'test.xer',
      duplicatePolicy: 'update',
      localActivities: [],
    });
  }, /Project ID and Contract ID are required/);
});

test('Primavera Reconciliation - rejects empty or non-XER content instead of reporting success', () => {
  assert.throws(() => buildPrimaveraReconciliation({
    projectId: 'p-01', contractId: 'c-01', fileContent: 'not a primavera export', fileName: 'bad.xer',
    duplicatePolicy: 'update', localActivities: [],
  }), /no valid Primavera TASK records/i);
});

test('Primavera Reconciliation - parses XER content and identifies new activities vs local activities', () => {
  const xerContent = `%T\tTASK
%F\ttask_id\ttask_code\ttask_name\ttarget_start_date\ttarget_end_date\ttarget_drtn\tdriving_path_flag
%R\t10\tACT-01\tSite Clearance\t2026-06-01 08:00\t2026-06-05 17:00\t5\tY
%R\t11\tACT-02\tExcavation Work\t2026-06-06 08:00\t2026-06-12 17:00\t6\tN
`;

  const localActivities = [
    {
      id: 'act-1',
      project_id: 'p-01',
      contract_id: 'c-01',
      activity_code: 'ACT-01',
      activity: 'Site Clearance',
      start_date: '2026-06-01',
      end_date: '2026-06-05',
      duration_days: 5,
      actual_start_date: '2026-06-01',
      actual_quantity: 50,
      actual_cost: 1000
    }
  ];

  const result = buildPrimaveraReconciliation({
    projectId: 'p-01',
    contractId: 'c-01',
    fileContent: xerContent,
    fileName: 'schedule.xer',
    duplicatePolicy: 'update',
    localActivities,
  });

  assert.equal(result.stats.totalP6, 2);
  assert.equal(result.stats.synced, 1);
  assert.equal(result.stats.newInP6, 1);
  assert.equal(result.preparedInsertRows.length, 1);
  assert.equal(result.preparedInsertRows[0].activity_code, 'ACT-02');
});

test('Primavera Reconciliation - planning refresh updates dates/duration while preserving local actuals', () => {
  const xerContent = `%T\tTASK
%F\ttask_id\ttask_code\ttask_name\ttarget_start_date\ttarget_end_date\ttarget_drtn
%R\t10\tACT-01\tSite Clearance Revised\t2026-06-03 08:00\t2026-06-10 17:00\t7
`;

  const localActivities = [
    {
      id: 'act-1',
      project_id: 'p-01',
      contract_id: 'c-01',
      activity_code: 'ACT-01',
      activity: 'Site Clearance',
      start_date: '2026-06-01',
      end_date: '2026-06-05',
      duration_days: 5,
      actual_start_date: '2026-06-01',
      actual_quantity: 100,
      actual_cost: 2500
    }
  ];

  const result = buildPrimaveraReconciliation({
    projectId: 'p-01',
    contractId: 'c-01',
    fileContent: xerContent,
    fileName: 'update.xer',
    duplicatePolicy: 'update',
    localActivities,
  });

  assert.equal(result.stats.dateDrift, 1);
  assert.equal(result.stats.actualsPreservedCount, 1);
  assert.equal(result.preparedUpdatePatches.length, 1);

  const patch = result.preparedUpdatePatches[0].patch;
  assert.equal(patch.start_date, '2026-06-03');
  assert.equal(patch.end_date, '2026-06-10');
  assert.equal(patch.duration_days, 7);

  // Verify patch does NOT contain actuals fields, preserving local actuals
  assert.equal('actual_start_date' in patch, false);
  assert.equal('actual_quantity' in patch, false);
  assert.equal('actual_cost' in patch, false);
});

test('Primavera Reconciliation - duplicate policy "skip" ignores existing activities and inserts only new ones', () => {
  const xerContent = `%T\tTASK
%F\ttask_id\ttask_code\ttask_name\ttarget_start_date\ttarget_end_date\ttarget_drtn
%R\t10\tACT-01\tExisting Activity\t2026-06-01\t2026-06-05\t5
%R\t11\tACT-NEW\tBrand New Activity\t2026-06-06\t2026-06-10\t4
`;

  const localActivities = [
    {
      id: 'act-1',
      project_id: 'p-01',
      contract_id: 'c-01',
      activity_code: 'ACT-01',
      activity: 'Existing Activity',
      start_date: '2026-06-01',
      end_date: '2026-06-05',
      duration_days: 5
    }
  ];

  const result = buildPrimaveraReconciliation({
    projectId: 'p-01',
    contractId: 'c-01',
    fileContent: xerContent,
    fileName: 'schedule.xer',
    duplicatePolicy: 'skip',
    localActivities,
  });

  assert.equal(result.preparedUpdatePatches.length, 0);
  assert.equal(result.preparedInsertRows.length, 1);
  assert.equal(result.preparedInsertRows[0].activity_code, 'ACT-NEW');
});

test('Primavera Reconciliation - code matching is case-insensitive and never borrows unscoped local rows', () => {
  const xerContent = `%T\tTASK\n%F\ttask_id\ttask_code\ttask_name\ttarget_start_date\ttarget_end_date\ttarget_drtn\n%R\t10\tACT-01\tScoped Activity\t2026-06-01\t2026-06-05\t5\n`;
  const result = buildPrimaveraReconciliation({
    projectId: 'p-01', contractId: 'c-01', fileContent: xerContent, fileName: 'scope.xer', duplicatePolicy: 'update',
    localActivities: [
      { id: 'match', project_id: 'p-01', contract_id: 'c-01', activity_code: 'act-01', start_date: '2026-06-01', end_date: '2026-06-05', duration_days: 5 },
      { id: 'wrong-scope', project_id: 'p-02', contract_id: 'c-02', activity_code: 'ACT-01', start_date: '2026-01-01', end_date: '2026-01-02', duration_days: 1 },
    ],
  });
  assert.equal(result.stats.synced, 1);
  assert.equal(result.preparedUpdatePatches[0].id, 'match');
});

test('Primavera Reconciliation UI commits through the atomic desktop gateway', () => {
  const board = readFileSync(new URL('../src/components/XerReconciliationBoard.tsx', import.meta.url), 'utf8');
  const dashboard = readFileSync(new URL('../src/components/Dashboard.tsx', import.meta.url), 'utf8');
  assert.match(board, /await commitGovernedImport\(\{/);
  assert.match(board, /Update the UI projection only after the SQLite transaction commits/);
  assert.doesNotMatch(board, /p-01'\)/, 'The production board must not fabricate a project scope');
  assert.doesNotMatch(board, /c-01'\)/, 'The production board must not fabricate a contract scope');
  assert.match(dashboard, /onCommitSuccess=.*onDataReload/s);
});

test('Primavera Reconciliation - relationship comparison detects matched and mismatched links', () => {
  const xerContent = `%T\tTASK
%F\ttask_id\ttask_code\ttask_name\ttarget_start_date\ttarget_end_date\ttarget_drtn
%R\t1\tA\tFirst\t2026-06-01\t2026-06-05\t5
%R\t2\tB\tSecond\t2026-06-06\t2026-06-10\t4
%T\tTASKPRED
%F\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt
%R\t2\t1\tPR_FS\t16
`;

  const localActivities = [
    {
      id: 'A',
      project_id: 'p-01',
      contract_id: 'c-01',
      activity_code: 'A',
      activity: 'First',
      start_date: '2026-06-01',
      end_date: '2026-06-05',
      duration_days: 5
    },
    {
      id: 'B',
      project_id: 'p-01',
      contract_id: 'c-01',
      activity_code: 'B',
      activity: 'Second',
      start_date: '2026-06-06',
      end_date: '2026-06-10',
      duration_days: 4,
      predecessor_links: [
        { predecessor_code: 'A', relationship_type: 'FS', lag_days: 2 }
      ]
    }
  ];

  const result = buildPrimaveraReconciliation({
    projectId: 'p-01',
    contractId: 'c-01',
    fileContent: xerContent,
    fileName: 'relationships.xer',
    duplicatePolicy: 'update',
    localActivities,
  });

  assert.equal(result.relationshipDiffs.length, 1);
  assert.equal(result.relationshipDiffs[0].predCode, 'A');
  assert.equal(result.relationshipDiffs[0].succCode, 'B');
  assert.equal(result.relationshipDiffs[0].p6Type, 'FS');
  assert.equal(result.relationshipDiffs[0].p6Lag, 2); // 16 hrs / 8 hrs per day = 2 days
  assert.equal(result.relationshipDiffs[0].status, 'matched');
});

test('Primavera Reconciliation - generates auxiliary rows for WBS, Calendars, Resources, and Assignments', () => {
  const xerContent = `%T\tCALENDAR
%F\tclndr_id\tclndr_name\tclndr_type\tday_hr_cnt
%R\t1\tStandard 8h\tCA_Project\t8.0
%T\tPROJWBS
%F\twbs_id\tproj_id\tparent_wbs_id\twbs_short_name\twbs_name
%R\t100\t1\t\tWBS.1\tRoot Level WBS
%T\tRSRC
%F\trsrc_id\trsrc_short_name\trsrc_name\trsrc_type
%R\t200\tENG-01\tSenior Engineer\tRT_Labor
%T\tTASK
%F\ttask_id\twbs_id\tclndr_id\ttask_code\ttask_name\ttarget_start_date\ttarget_end_date\ttarget_drtn
%R\t10\t100\t1\tACT-AUX\tAuxiliary Test Task\t2026-07-01\t2026-07-10\t8
%T\tTASKRSRC
%F\ttaskrsrc_id\ttask_id\trsrc_id\ttarget_qty\ttarget_cost
%R\t300\t10\t200\t40.0\t4000.0
`;

  const result = buildPrimaveraReconciliation({
    projectId: 'p-01',
    contractId: 'c-01',
    fileContent: xerContent,
    fileName: 'full_masters.xer',
    duplicatePolicy: 'update',
    localActivities: []
  });

  // Check auxiliary rows
  assert.ok(result.auxiliaryRows, 'Auxiliary rows object must be defined');
  assert.equal(result.auxiliaryRows.wbs?.length, 1);
  assert.equal(result.auxiliaryRows.wbs[0].wbs_code, 'WBS.1');
  assert.equal(result.auxiliaryRows.wbs[0].wbs_name, 'Root Level WBS');

  assert.equal(result.auxiliaryRows.calendars?.length, 1);
  assert.equal(result.auxiliaryRows.calendars[0].calendar_name, 'Standard 8h');
  assert.equal(result.auxiliaryRows.calendars[0].hours_per_day, 8);

  assert.equal(result.auxiliaryRows.resources?.length, 1);
  assert.equal(result.auxiliaryRows.resources[0].resource_code, 'ENG-01');
  assert.equal(result.auxiliaryRows.resources[0].resource_name, 'Senior Engineer');

  assert.equal(result.auxiliaryRows.assignments?.length, 1);
  assert.equal(result.auxiliaryRows.assignments[0].task_code, 'ACT-AUX');
  assert.equal(result.auxiliaryRows.assignments[0].resource_code, 'ENG-01');
  assert.equal(result.auxiliaryRows.assignments[0].planned_hours, 40);
  assert.equal(result.auxiliaryRows.assignments[0].planned_cost, 4000);

  // Check diffs have action and reason
  assert.equal(result.wbsDiffs[0].action, 'insert');
  assert.ok(result.wbsDiffs[0].reason);
  assert.equal(result.calendarDiffs[0].action, 'insert');
  assert.ok(result.calendarDiffs[0].reason);
  assert.equal(result.resourceDiffs[0].action, 'insert');
  assert.ok(result.resourceDiffs[0].reason);
  assert.equal(result.assignmentDiffs[0].action, 'insert');
  assert.ok(result.assignmentDiffs[0].reason);
});

test('Primavera Reconciliation - resolves predecessor codes and detects cycles', () => {
  const xerCycleContent = `%T\tTASK
%F\ttask_id\ttask_code\ttask_name\ttarget_start_date\ttarget_end_date\ttarget_drtn
%R\t1\tTASK-A\tTask Alpha\t2026-06-01\t2026-06-05\t5
%R\t2\tTASK-B\tTask Beta\t2026-06-06\t2026-06-10\t5
%T\tTASKPRED
%F\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt
%R\t2\t1\tPR_FS\t0
%R\t1\t2\tPR_FS\t0
`;

  const result = buildPrimaveraReconciliation({
    projectId: 'p-01',
    contractId: 'c-01',
    fileContent: xerCycleContent,
    fileName: 'cycle.xer',
    duplicatePolicy: 'update',
    localActivities: []
  });

  assert.ok(result.cycleConflicts.length > 0, 'Cycle conflicts must be flagged');
  const conflictRel = result.relationshipDiffs.find(r => r.status === 'conflict');
  assert.ok(conflictRel, 'Circular relationship should have conflict status');
  assert.equal(conflictRel.action, 'conflict_flag');
  assert.match(conflictRel.reason, /Cycle detected/);
});

test('Primavera Reconciliation - round-trip XER generation preserves all P6 tables', async () => {
  const { generateCleanXer, parseXerFileContent } = await import('../src/utils/xerEngine.ts');

  const tasks = [
    {
      task_code: 'A100',
      task_name: 'Substructure Works',
      target_start_date: '2026-08-01',
      target_end_date: '2026-08-15',
      remain_drtn_hr_cnt: 80,
      phys_complete_pct: 0
    }
  ];

  const preds = [];

  const options = {
    wbsNodes: [
      { wbs_code: 'WBS-01', wbs_name: 'Substructure', parent_wbs_code: '' }
    ],
    calendars: [
      { calendar_code: 'CAL-6D', calendar_name: '6-Day Workweek', hours_per_day: 8 }
    ],
    resources: [
      { resource_code: 'LAB-01', resource_name: 'Civil Labour Crew', resource_type: 'Labor' }
    ],
    assignments: [
      { task_code: 'A100', resource_code: 'LAB-01', planned_hours: 80, planned_cost: 3200 }
    ]
  };

  const xerText = generateCleanXer(tasks, preds, options);
  assert.ok(xerText.includes('%T\tCALENDAR'), 'XER export must include CALENDAR table');
  assert.ok(xerText.includes('%T\tPROJWBS'), 'XER export must include PROJWBS table');
  assert.ok(xerText.includes('%T\tRSRC'), 'XER export must include RSRC table');
  assert.ok(xerText.includes('%T\tTASKRSRC'), 'XER export must include TASKRSRC table');

  // Parse it back to verify round-trip
  const parsed = parseXerFileContent(xerText);
  assert.equal(parsed.tasks.length, 1);
  assert.equal(parsed.tasks[0].task_code, 'A100');
  assert.equal(parsed.wbs.length, 1);
  assert.equal(parsed.wbs[0].wbs_short_name, 'WBS-01');
  assert.equal(parsed.calendars.length, 1);
  assert.equal(parsed.calendars[0].clndr_name, '6-Day Workweek');
  assert.equal(parsed.resources.length, 1);
  assert.equal(parsed.resources[0].rsrc_short_name, 'LAB-01');
  assert.equal(parsed.assignments.length, 1);
  assert.equal(parsed.assignments[0].target_qty, 80);
});

test('Primavera Reconciliation - validatePlanningRefreshPatch protects local actuals', async () => {
  const { validatePlanningRefreshPatch } = await import('../src/utils/primaveraReconciliation.ts');

  const localActivity = {
    id: 'local-1',
    activity_code: 'ACT-01',
    actual_start_date: '2026-05-01',
    actual_end_date: '2026-05-10',
    progress: 100,
    actual_quantity: 50,
    actual_cost: 25000,
    status: 'Completed'
  };

  // Attempt to overwrite actuals
  const dangerousPatch = {
    actual_start_date: '2026-06-01', // modified
    actual_cost: 10000 // modified
  };

  assert.throws(() => {
    validatePlanningRefreshPatch(dangerousPatch, localActivity);
  }, /cannot modify protected actuals/i);

  // Safe planning refresh patch (only modifying planned/forecast dates)
  const safePatch = {
    start_date: '2026-05-01',
    end_date: '2026-05-15',
    duration_days: 14,
    forecast_start_date: '2026-05-01',
    forecast_end_date: '2026-05-15'
  };

  const validated = validatePlanningRefreshPatch(safePatch, localActivity);
  assert.ok(validated);
  assert.equal(validated.start_date, '2026-05-01');
  assert.equal(validated.actual_start_date, '2026-05-01', 'Must freeze actual start date');
  assert.equal(validated.actual_cost, 25000, 'Must freeze actual cost');
});

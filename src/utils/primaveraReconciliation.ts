import { parsePrimaveraXerTasks } from '../data/primaveraImport.ts';

export type DuplicatePolicy = 'update' | 'skip' | 'conflict';

export interface PrimaveraReconciliationParams {
  projectId: string;
  contractId: string;
  fileContent: string;
  fileName: string;
  duplicatePolicy: DuplicatePolicy;
  localActivities: Record<string, any>[];
  localCalendars?: Record<string, any>[];
  localWbs?: Record<string, any>[];
  localResources?: Record<string, any>[];
  localAssignments?: Record<string, any>[];
}

export interface ActivityDiff {
  activityCode: string;
  sourceActivityCode: string;
  activityName: string;
  p6Start: string;
  p6Finish: string;
  p6Duration: number;
  localStart: string;
  localFinish: string;
  localDuration: number;
  localActualStart?: string;
  localActualFinish?: string;
  localActualQuantity?: number;
  localActualCost?: number;
  status: 'synced' | 'date_drift' | 'duration_discrepancy' | 'new_in_p6' | 'missing_in_p6';
  action: 'insert' | 'update_refresh' | 'skip' | 'conflict_flag';
  reason: string;
  preservedActuals?: boolean;
}

export interface RelationshipDiff {
  predCode: string;
  succCode: string;
  p6Type: string;
  p6Lag: number;
  localType?: string;
  localLag?: number;
  status: 'matched' | 'mismatched' | 'missing_in_p6' | 'missing_in_local' | 'conflict';
  action: 'matched' | 'insert' | 'conflict_flag' | 'skip';
  reason: string;
}

export interface WbsDiff {
  wbsCode: string;
  wbsName: string;
  parentCode?: string;
  status: 'matched' | 'new_in_p6' | 'synced';
  action: 'insert' | 'skip';
  reason: string;
}

export interface CalendarDiff {
  calendarCode: string;
  calendarName: string;
  pattern: string;
  hoursPerDay: number;
  status: 'matched' | 'new_in_p6' | 'synced';
  action: 'insert' | 'skip';
  reason: string;
}

export interface ResourceDiff {
  resourceCode: string;
  resourceName: string;
  resourceType: 'Labor' | 'Equipment' | 'Other';
  status: 'matched' | 'new_in_p6';
  action: 'insert' | 'skip';
  reason: string;
}

export interface AssignmentDiff {
  activityCode: string;
  resourceCode: string;
  resourceType: string;
  plannedHours: number;
  plannedCost: number;
  status: 'matched' | 'new_in_p6' | 'refresh';
  action: 'insert' | 'update_refresh' | 'skip';
  reason: string;
}

export interface PrimaveraReconciliationResult {
  projectId: string;
  contractId: string;
  fileName: string;
  duplicatePolicy: DuplicatePolicy;
  parsedCount: number;
  activityDiffs: ActivityDiff[];
  relationshipDiffs: RelationshipDiff[];
  wbsDiffs: WbsDiff[];
  calendarDiffs: CalendarDiff[];
  resourceDiffs: ResourceDiff[];
  assignmentDiffs: AssignmentDiff[];
  cycleConflicts: string[];
  missingPredecessors: string[];
  newAuxiliaryRows: Array<{
    table: 'wbs_nodes' | 'work_calendars' | 'resource_masters' | 'schedule_resource_assignments';
    row: Record<string, any>;
  }>;
  auxiliaryRows?: {
    wbs?: Record<string, any>[];
    calendars?: Record<string, any>[];
    resources?: Record<string, any>[];
    assignments?: Record<string, any>[];
  };
  preparedInsertRows: Record<string, any>[];
  preparedUpdatePatches: Array<{
    table: 'schedules' | 'schedule_resource_assignments';
    id: string;
    patch: Record<string, any>;
  }>;
  stats: {
    totalP6: number;
    synced: number;
    dateDrift: number;
    durationDiscrepancy: number;
    newInP6: number;
    missingInP6: number;
    relationshipsMatched: number;
    relationshipsMismatched: number;
    actualsPreservedCount: number;
  };
}

export function validatePlanningRefreshPatch<T extends Record<string, any>>(patch: T, localActivity?: Record<string, any>): T {
  const protectedActualKeys = [
    'actual_start_date',
    'actual_end_date',
    'actual_quantity',
    'actual_cost',
    'progress',
    'wir_number',
    'earned_value',
    'actual_cost_to_date'
  ];
  for (const key of protectedActualKeys) {
    if (key in patch && patch[key] !== undefined) {
      throw new Error(`Governed planning refresh violation: patch cannot modify protected actuals field "${key}".`);
    }
  }
  if (localActivity) {
    return {
      ...patch,
      actual_start_date: localActivity.actual_start_date,
      actual_end_date: localActivity.actual_end_date,
      actual_quantity: localActivity.actual_quantity,
      actual_cost: localActivity.actual_cost,
      progress: localActivity.progress
    };
  }
  return patch;
}

export function buildPrimaveraReconciliation(
  params: PrimaveraReconciliationParams
): PrimaveraReconciliationResult {
  const {
    projectId,
    contractId,
    fileContent,
    fileName,
    duplicatePolicy,
    localActivities = [],
    localCalendars = [],
    localWbs = [],
    localResources = [],
    localAssignments = []
  } = params;

  if (!projectId || !contractId) {
    throw new Error('Project ID and Contract ID are required for governed Primavera reconciliation.');
  }

  const parsedTasks = parsePrimaveraXerTasks(fileContent || '');
  if (!parsedTasks.length) {
    throw new Error('The selected file contains no valid Primavera TASK records. Nothing can be committed.');
  }

  // Scope filter local activities by project and contract
  const scopedLocal = localActivities.filter(
    a => a.project_id === projectId && a.contract_id === contractId
  );

  const localByCode = new Map<string, Record<string, any>>();
  scopedLocal.forEach(act => {
    const code = String(act.activity_code || act.id || '').trim().toLocaleLowerCase();
    if (code) localByCode.set(code, act);
  });

  // Reconcile WBS nodes
  const scopedWbs = (localWbs || []).filter(w => !w.project_id || w.project_id === projectId);
  const localWbsByCode = new Map<string, Record<string, any>>();
  scopedWbs.forEach(w => {
    const code = String(w.wbs_code || w.code || w.id || '').trim().toLowerCase();
    if (code) localWbsByCode.set(code, w);
  });

  const wbsDiffs: WbsDiff[] = [];
  const stagedWbsByCode = new Map<string, string>(); // code -> id

  // Reconcile Calendars
  const scopedCalendars = (localCalendars || []).filter(c => !c.project_id || c.project_id === projectId);
  const localCalByName = new Map<string, Record<string, any>>();
  scopedCalendars.forEach(c => {
    const name = String(c.calendar_name || c.calendar_code || c.name || c.id || '').trim().toLowerCase();
    if (name) localCalByName.set(name, c);
  });

  const calendarDiffs: CalendarDiff[] = [];
  const stagedCalByName = new Map<string, string>(); // name -> id

  // Reconcile Resources
  const scopedResources = (localResources || []).filter(r => !r.project_id || r.project_id === projectId);
  const localResourceByCode = new Map<string, Record<string, any>>();
  scopedResources.forEach(r => {
    const code = String(r.resource_code || r.code || r.id || '').trim().toLowerCase();
    if (code) localResourceByCode.set(code, r);
  });

  const resourceDiffs: ResourceDiff[] = [];
  const stagedResourceByCode = new Map<string, string>(); // code -> id

  // Reconcile Assignments
  const scopedAssignments = (localAssignments || []).filter(ra => !ra.project_id || ra.project_id === projectId);
  const assignmentDiffs: AssignmentDiff[] = [];

  const newAuxiliaryRows: Array<{
    table: 'wbs_nodes' | 'work_calendars' | 'resource_masters' | 'schedule_resource_assignments';
    row: Record<string, any>;
  }> = [];

  // 1. Process WBS & Calendars across all parsed tasks
  parsedTasks.forEach(p6Task => {
    const wbsCode = String(p6Task.WBS || '').trim();
    if (wbsCode) {
      const normalizedWbs = wbsCode.toLowerCase();
      const existing = localWbsByCode.get(normalizedWbs);
      if (existing) {
        if (!wbsDiffs.some(d => d.wbsCode.toLowerCase() === normalizedWbs)) {
          wbsDiffs.push({
            wbsCode,
            wbsName: existing.name || wbsCode,
            parentCode: existing.parent_wbs_code || p6Task['WBS Parent'],
            status: 'matched',
            action: 'skip',
            reason: 'Matches existing WBS node in project master'
          });
        }
      } else if (!stagedWbsByCode.has(normalizedWbs)) {
        const newWbsId = `wbs-${projectId}-${wbsCode.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        stagedWbsByCode.set(normalizedWbs, newWbsId);
        newAuxiliaryRows.push({
          table: 'wbs_nodes',
          row: {
            id: newWbsId,
            created_at: new Date().toISOString(),
            project_id: projectId,
            contract_id: contractId,
            wbs_code: wbsCode,
            wbs_name: p6Task['WBS Name'] || wbsCode,
            name: p6Task['WBS Name'] || wbsCode
          }
        });
        wbsDiffs.push({
          wbsCode,
          wbsName: p6Task['WBS Name'] || wbsCode,
          parentCode: p6Task['WBS Parent'],
          status: 'new_in_p6',
          action: 'insert',
          reason: 'New WBS hierarchy node imported from P6 schedule'
        });
      }
    }

    const calName = String(p6Task.Calendar || '').trim();
    if (calName) {
      const normalizedCal = calName.toLowerCase();
      const existing = localCalByName.get(normalizedCal);
      if (existing) {
        if (!calendarDiffs.some(d => d.calendarName.toLowerCase() === normalizedCal)) {
          calendarDiffs.push({
            calendarCode: existing.calendar_code || calName,
            calendarName: calName,
            pattern: existing.working_pattern || p6Task['Calendar Pattern'] || '6-Day Week',
            hoursPerDay: Number(existing.hours_per_day) || Number(p6Task['Calendar Hours Per Day']) || 8,
            status: 'matched',
            action: 'skip',
            reason: 'Matches existing calendar in project master'
          });
        }
      } else if (!stagedCalByName.has(normalizedCal)) {
        const newCalId = `cal-${projectId}-${calName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        stagedCalByName.set(normalizedCal, newCalId);
        newAuxiliaryRows.push({
          table: 'work_calendars',
          row: {
            id: newCalId,
            created_at: new Date().toISOString(),
            project_id: projectId,
            contract_id: contractId,
            calendar_code: calName,
            calendar_name: calName,
            working_pattern: p6Task['Calendar Pattern'] || '6-Day Week',
            calendar_working_days: p6Task['Calendar Working Days'] || '[]',
            calendar_exceptions: p6Task['Calendar Exceptions'] || '[]',
            hours_per_day: Number(p6Task['Calendar Hours Per Day']) || 8,
            status: 'Active'
          }
        });
        calendarDiffs.push({
          calendarCode: calName,
          calendarName: calName,
          pattern: p6Task['Calendar Pattern'] || '6-Day Week',
          hoursPerDay: Number(p6Task['Calendar Hours Per Day']) || 8,
          status: 'new_in_p6',
          action: 'insert',
          reason: 'New working calendar imported from P6 schedule'
        });
      }
    }
  });

  const p6Codes = new Set<string>();
  const activityDiffs: ActivityDiff[] = [];
  const preparedInsertRows: Record<string, any>[] = [];
  const preparedUpdatePatches: Array<{ table: 'schedules' | 'schedule_resource_assignments'; id: string; patch: Record<string, any> }> = [];

  let synced = 0;
  let dateDrift = 0;
  let durationDiscrepancy = 0;
  let newInP6 = 0;
  let missingInP6 = 0;
  let actualsPreservedCount = 0;

  parsedTasks.forEach(p6Task => {
    const code = String(p6Task['Activity ID'] || p6Task['Source Activity ID'] || '').trim();
    if (!code) return;
    const normalizedCode = code.toLocaleLowerCase();
    p6Codes.add(normalizedCode);

    const localMatch = localByCode.get(normalizedCode);
    const p6Start = String(p6Task.Start || '—').slice(0, 10);
    const p6Finish = String(p6Task.Finish || '—').slice(0, 10);
    const p6Duration = Math.max(0, Number(p6Task['Original Duration']) || 0);

    const localStart = localMatch ? String(localMatch.start_date || '—').slice(0, 10) : '—';
    const localFinish = localMatch ? String(localMatch.end_date || '—').slice(0, 10) : '—';
    const localDuration = localMatch ? Math.max(0, Number(localMatch.duration_days ?? localMatch.duration ?? 0)) : 0;

    let status: ActivityDiff['status'] = 'new_in_p6';
    let action: ActivityDiff['action'] = 'insert';
    let reason = 'New activity from P6 file';
    let preservedActuals = false;

    const wbsCodeNorm = String(p6Task.WBS || '').toLowerCase();
    const resolvedWbsId = stagedWbsByCode.get(wbsCodeNorm) || localWbsByCode.get(wbsCodeNorm)?.id || '';

    const calNameNorm = String(p6Task.Calendar || '').toLowerCase();
    const resolvedCalId = stagedCalByName.get(calNameNorm) || localCalByName.get(calNameNorm)?.id || '';

    let activityTargetId = '';

    if (localMatch) {
      activityTargetId = String(localMatch.id);
      const isDateDiff = localStart !== p6Start || localFinish !== p6Finish;
      const isDurDiff = localDuration !== p6Duration;

      if (isDateDiff) {
        status = 'date_drift';
        reason = 'Planning dates differ from local plan (local actuals protected)';
        dateDrift++;
      } else if (isDurDiff) {
        status = 'duration_discrepancy';
        reason = 'Planning duration differs from local plan (local actuals protected)';
        durationDiscrepancy++;
      } else {
        status = 'synced';
        reason = 'Dates, duration and logic match existing local schedule';
        synced++;
      }

      if (duplicatePolicy === 'update') {
        action = 'update_refresh';
        preservedActuals = true;
        actualsPreservedCount++;

        // Prepare refresh patch that ONLY updates planning/schedule fields
        // strictly preserving actual_start_date, actual_end_date, actual_quantity, actual_cost, progress
        const patch = {
          start_date: p6Start,
          end_date: p6Finish,
          duration_days: p6Duration,
          activity: p6Task['Activity Name'] || localMatch.activity,
          predecessors: String(p6Task.Predecessors || ''),
          predecessor_links: p6Task['Predecessor Links'] || '[]',
          relationship_type: p6Task.Relationship || 'FS',
          lag_days: Number(p6Task['Lag (days)']) || 0,
          wbs_id: resolvedWbsId || localMatch.wbs_id || '',
          calendar_id: resolvedCalId || localMatch.calendar_id || '',
          calendar_name: p6Task.Calendar || localMatch.calendar_name || '',
          calendar_working_days: p6Task['Calendar Working Days'] || localMatch.calendar_working_days || '[]',
          calendar_exceptions: p6Task['Calendar Exceptions'] || localMatch.calendar_exceptions || '[]',
          calendar_hours_per_day: Number(p6Task['Calendar Hours Per Day']) || Number(localMatch.calendar_hours_per_day) || 8,
          wbs_code: p6Task.WBS || localMatch.wbs_code || '',
          critical_path: Boolean(p6Task.Critical),
          notes: p6Task.Notes || localMatch.notes
        };

        validatePlanningRefreshPatch(patch);

        preparedUpdatePatches.push({
          table: 'schedules',
          id: String(localMatch.id),
          patch
        });
      } else if (duplicatePolicy === 'skip') {
        action = 'skip';
        reason = 'Duplicate activity skipped per policy';
      } else {
        action = 'conflict_flag';
        reason = 'Duplicate activity flagged as conflict per policy';
      }
    } else {
      newInP6++;
      action = 'insert';
      reason = 'New activity created from P6 import';

      const newId = `act-${code}-${crypto.randomUUID().slice(0, 8)}`;
      activityTargetId = newId;

      const newActivityRow = {
        id: newId,
        created_at: new Date().toISOString(),
        project_id: projectId,
        contract_id: contractId,
        activity_code: code,
        source_activity_code: String(p6Task['Source Activity ID'] || code),
        activity: p6Task['Activity Name'] || 'P6 Imported Task',
        start_date: p6Start,
        end_date: p6Finish,
        duration_days: p6Duration,
        planned_quantity: Number(p6Task['Planned Qty']) || 0,
        unit: '',
        unit_rate: 0,
        planned_cost: Number(p6Task['Planned Resource Cost']) || 0,
        planned_labor_hours: Number(p6Task['Planned Labor Hours']) || 0,
        planned_equipment_hours: Number(p6Task['Planned Equipment Hours']) || 0,
        predecessors: String(p6Task.Predecessors || ''),
        predecessor_links: p6Task['Predecessor Links'] || '[]',
        relationship_type: p6Task.Relationship || 'FS',
        lag_days: Number(p6Task['Lag (days)']) || 0,
        wbs_id: resolvedWbsId || '',
        calendar_id: resolvedCalId || '',
        calendar_name: p6Task.Calendar || '',
        calendar_working_days: p6Task['Calendar Working Days'] || '[]',
        calendar_exceptions: p6Task['Calendar Exceptions'] || '[]',
        calendar_hours_per_day: Number(p6Task['Calendar Hours Per Day']) || 8,
        wbs_code: p6Task.WBS || '',
        critical_path: Boolean(p6Task.Critical),
        is_non_boq_activity: true,
        status: 'Draft',
        notes: p6Task.Notes || ''
      };
      preparedInsertRows.push(newActivityRow);
    }

    activityDiffs.push({
      activityCode: code,
      sourceActivityCode: String(p6Task['Source Activity ID'] || code),
      activityName: String(p6Task['Activity Name'] || ''),
      p6Start,
      p6Finish,
      p6Duration,
      localStart,
      localFinish,
      localDuration,
      localActualStart: localMatch?.actual_start_date,
      localActualFinish: localMatch?.actual_end_date,
      localActualQuantity: localMatch?.actual_quantity,
      localActualCost: localMatch?.actual_cost,
      status,
      action,
      reason,
      preservedActuals
    });

    // Process Resource Assignments on this task
    let taskAssignments: Array<{
      resource_id?: string;
      resource_code: string;
      resource_name: string;
      resource_type: string;
      planned_hours: number;
      planned_cost: number;
    }> = [];

    try {
      if (p6Task['P6 Resource Assignments']) {
        taskAssignments = JSON.parse(p6Task['P6 Resource Assignments']);
      }
    } catch {
      /* ignore parse error */
    }

    taskAssignments.forEach(assign => {
      const resCode = String(assign.resource_code || assign.resource_id || '').trim();
      if (!resCode) return;
      const normalizedRes = resCode.toLowerCase();
      let resMasterId = '';

      const existingResource = localResourceByCode.get(normalizedRes);
      if (existingResource) {
        resMasterId = String(existingResource.id);
        if (!resourceDiffs.some(r => r.resourceCode.toLowerCase() === normalizedRes)) {
          resourceDiffs.push({
            resourceCode: resCode,
            resourceName: existingResource.resource_name || resCode,
            resourceType: (existingResource.resource_type === 'Equipment' ? 'Equipment' : 'Labor'),
            status: 'matched',
            action: 'skip',
            reason: 'Matches existing resource master in project master'
          });
        }
      } else if (!stagedResourceByCode.has(normalizedRes)) {
        resMasterId = `rsrc-${projectId}-${resCode.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        stagedResourceByCode.set(normalizedRes, resMasterId);
        newAuxiliaryRows.push({
          table: 'resource_masters',
          row: {
            id: resMasterId,
            created_at: new Date().toISOString(),
            project_id: projectId,
            contract_id: contractId,
            resource_code: resCode,
            resource_name: assign.resource_name || resCode,
            resource_type: assign.resource_type === 'Equipment' ? 'Equipment' : 'Labor',
            status: 'Active'
          }
        });
        resourceDiffs.push({
          resourceCode: resCode,
          resourceName: assign.resource_name || resCode,
          resourceType: assign.resource_type === 'Equipment' ? 'Equipment' : 'Labor',
          status: 'new_in_p6',
          action: 'insert',
          reason: 'New resource master imported from P6 assignment'
        });
      } else {
        resMasterId = stagedResourceByCode.get(normalizedRes) || '';
      }

      // Check existing assignment in local
      const existingAssignment = scopedAssignments.find(
        sa => sa.schedule_id === activityTargetId && (sa.resource_id === resMasterId || String(sa.resource_code || '').toLowerCase() === normalizedRes)
      );

      if (existingAssignment) {
        if (duplicatePolicy === 'update') {
          preparedUpdatePatches.push({
            table: 'schedule_resource_assignments',
            id: String(existingAssignment.id),
            patch: {
              resource_type: assign.resource_type === 'Equipment' ? 'Equipment' : 'Labor',
              planned_hours: Number(assign.planned_hours) || 0,
              planned_cost: Number(assign.planned_cost) || 0,
              notes: 'Refreshed from P6 schedule'
            }
          });
          assignmentDiffs.push({
            activityCode: code,
            resourceCode: resCode,
            resourceType: assign.resource_type,
            plannedHours: Number(assign.planned_hours) || 0,
            plannedCost: Number(assign.planned_cost) || 0,
            status: 'refresh',
            action: 'update_refresh',
            reason: 'Refreshed planned hours and cost from P6'
          });
        } else {
          assignmentDiffs.push({
            activityCode: code,
            resourceCode: resCode,
            resourceType: assign.resource_type,
            plannedHours: Number(assign.planned_hours) || 0,
            plannedCost: Number(assign.planned_cost) || 0,
            status: 'matched',
            action: 'skip',
            reason: 'Existing resource assignment preserved'
          });
        }
      } else {
        const newAssignId = `ra-${activityTargetId}-${resCode.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        newAuxiliaryRows.push({
          table: 'schedule_resource_assignments',
          row: {
            id: newAssignId,
            created_at: new Date().toISOString(),
            project_id: projectId,
            contract_id: contractId,
            schedule_id: activityTargetId,
            task_code: code,
            resource_id: resMasterId,
            resource_code: resCode,
            resource_type: assign.resource_type === 'Equipment' ? 'Equipment' : 'Labor',
            planned_hours: Number(assign.planned_hours) || 0,
            planned_cost: Number(assign.planned_cost) || 0
          }
        });
        assignmentDiffs.push({
          activityCode: code,
          resourceCode: resCode,
          resourceType: assign.resource_type,
          plannedHours: Number(assign.planned_hours) || 0,
          plannedCost: Number(assign.planned_cost) || 0,
          status: 'new_in_p6',
          action: 'insert',
          reason: 'New resource assignment staged for import'
        });
      }
    });
  });

  // Local activities missing in P6
  scopedLocal.forEach(localAct => {
    const code = String(localAct.activity_code || localAct.id || '').trim();
    if (code && !p6Codes.has(code.toLocaleLowerCase())) {
      missingInP6++;
      activityDiffs.push({
        activityCode: code,
        sourceActivityCode: String(localAct.source_activity_code || code),
        activityName: String(localAct.activity || code),
        p6Start: '—',
        p6Finish: '—',
        p6Duration: 0,
        localStart: String(localAct.start_date || '—').slice(0, 10),
        localFinish: String(localAct.end_date || '—').slice(0, 10),
        localDuration: Number(localAct.duration_days ?? localAct.duration ?? 0),
        localActualStart: localAct.actual_start_date,
        localActualFinish: localAct.actual_end_date,
        localActualQuantity: localAct.actual_quantity,
        localActualCost: localAct.actual_cost,
        status: 'missing_in_p6',
        action: 'skip',
        reason: 'Local activity not present in P6 import file'
      });
    }
  });

  // Compare relationships, validate network graph, and detect cycles
  const relationshipDiffs: RelationshipDiff[] = [];
  const missingPredecessors: string[] = [];
  const cycleConflicts: string[] = [];
  const graph = new Map<string, string[]>();

  let relationshipsMatched = 0;
  let relationshipsMismatched = 0;

  parsedTasks.forEach(p6Task => {
    const succCode = String(p6Task['Activity ID'] || '').trim();
    if (!succCode) return;

    let links: Array<{ predecessor_code: string; relationship_type: string; lag_days: number }> = [];
    try {
      if (p6Task['Predecessor Links']) {
        links = JSON.parse(p6Task['Predecessor Links']);
      }
    } catch {
      /* ignore parse error */
    }

    links.forEach(link => {
      const predCode = String(link.predecessor_code || '').trim();
      if (!predCode) return;

      const p6Type = String(link.relationship_type || 'FS').toUpperCase();
      const p6Lag = Number(link.lag_days || 0);

      // Build graph edge pred -> succ for cycle detection
      if (!graph.has(predCode)) graph.set(predCode, []);
      graph.get(predCode)!.push(succCode);

      // Check if predecessor exists anywhere in P6 tasks or scoped local activities
      const predExistsInP6 = p6Codes.has(predCode.toLowerCase());
      const predExistsInLocal = localByCode.has(predCode.toLowerCase());
      if (!predExistsInP6 && !predExistsInLocal) {
        missingPredecessors.push(`Predecessor activity "${predCode}" not found for successor "${succCode}"`);
      }

      const localSucc = localByCode.get(succCode.toLocaleLowerCase());
      let localLinkMatch: any = null;

      if (localSucc) {
        let localLinksArr: any[] = [];
        if (Array.isArray(localSucc.predecessor_links)) {
          localLinksArr = localSucc.predecessor_links;
        } else if (typeof localSucc.predecessor_links === 'string') {
          try { localLinksArr = JSON.parse(localSucc.predecessor_links); } catch { /* ignore */ }
        }
        localLinkMatch = localLinksArr.find(
          l => String(l.predecessor_code || l.predecessor_id || '').trim().toLowerCase() === predCode.toLowerCase()
        );
      }

      let relStatus: RelationshipDiff['status'] = 'missing_in_local';
      let relAction: RelationshipDiff['action'] = 'insert';
      let relReason = 'New relationship link from P6';

      if (localLinkMatch) {
        const localType = String(localLinkMatch.relationship_type || localLinkMatch.type || 'FS').toUpperCase();
        const localLag = Number(localLinkMatch.lag_days ?? localLinkMatch.lag ?? 0);

        if (localType === p6Type && Math.abs(localLag - p6Lag) < 0.01) {
          relStatus = 'matched';
          relAction = 'matched';
          relReason = 'Relationship and lag match existing local schedule';
          relationshipsMatched++;
        } else {
          relStatus = 'mismatched';
          relAction = duplicatePolicy === 'update' ? 'insert' : 'conflict_flag';
          relReason = `Type or lag mismatch (P6: ${p6Type} +${p6Lag}d, Local: ${localType} +${localLag}d)`;
          relationshipsMismatched++;
        }

        relationshipDiffs.push({
          predCode,
          succCode,
          p6Type,
          p6Lag,
          localType,
          localLag,
          status: relStatus,
          action: relAction,
          reason: relReason
        });
      } else {
        if (!predExistsInP6 && !predExistsInLocal) {
          relAction = 'conflict_flag';
          relReason = `Predecessor "${predCode}" is missing from both P6 and local schedules`;
        }
        relationshipDiffs.push({
          predCode,
          succCode,
          p6Type,
          p6Lag,
          status: 'missing_in_local',
          action: relAction,
          reason: relReason
        });
      }
    });
  });

  // Run DFS Cycle Detection
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function checkCycle(node: string, path: string[]): boolean {
    visited.add(node);
    recStack.add(node);
    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (checkCycle(neighbor, [...path, neighbor])) return true;
      } else if (recStack.has(neighbor)) {
        cycleConflicts.push(`Cycle: ${[...path, neighbor].join(' -> ')}`);
        return true;
      }
    }
    recStack.delete(node);
    return false;
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      checkCycle(node, [node]);
    }
  }

  if (cycleConflicts.length > 0) {
    relationshipDiffs.forEach(rel => {
      if (cycleConflicts.some(c => c.includes(rel.predCode) && c.includes(rel.succCode))) {
        rel.status = 'conflict';
        rel.action = 'conflict_flag';
        rel.reason = 'Cycle detected in relationship network';
      }
    });
  }

  return {
    projectId,
    contractId,
    fileName,
    duplicatePolicy,
    parsedCount: parsedTasks.length,
    activityDiffs,
    relationshipDiffs,
    wbsDiffs,
    calendarDiffs,
    resourceDiffs,
    assignmentDiffs,
    cycleConflicts,
    missingPredecessors,
    newAuxiliaryRows,
    auxiliaryRows: {
      wbs: newAuxiliaryRows.filter(r => r.table === 'wbs_nodes').map(r => r.row),
      calendars: newAuxiliaryRows.filter(r => r.table === 'work_calendars').map(r => r.row),
      resources: newAuxiliaryRows.filter(r => r.table === 'resource_masters').map(r => r.row),
      assignments: newAuxiliaryRows.filter(r => r.table === 'schedule_resource_assignments').map(r => r.row),
    },
    preparedInsertRows,
    preparedUpdatePatches,
    stats: {
      totalP6: parsedTasks.length,
      synced,
      dateDrift,
      durationDiscrepancy,
      newInP6,
      missingInP6,
      relationshipsMatched,
      relationshipsMismatched,
      actualsPreservedCount
    }
  };
}


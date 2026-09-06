export interface XerTask {
  task_code: string;
  task_name: string;
  target_start_date: string;
  target_end_date: string;
  remain_drtn_hr_cnt: number;
  phys_complete_pct: number;
  wbs_code?: string;
  calendar_code?: string;
}

export interface XerPred {
  pred_task_code: string;
  succ_task_code: string;
  pred_type: 'PR_FS' | 'PR_SS' | 'PR_FF' | 'PR_SF';
  lag_hr_cnt: number;
}

export interface XerWbs {
  wbs_id?: string;
  wbs_code?: string;
  wbs_short_name?: string;
  wbs_name: string;
  parent_wbs_id?: string;
  parent_wbs_code?: string;
}

export interface XerCalendar {
  clndr_id?: string;
  calendar_code?: string;
  calendar_name?: string;
  clndr_name?: string;
  clndr_type?: string;
  working_days?: number[];
  hours_per_day?: number;
  day_hr_cnt?: number;
  exceptions?: string[];
}

export interface XerResource {
  rsrc_id?: string;
  resource_code?: string;
  rsrc_short_name?: string;
  resource_name: string;
  rsrc_name?: string;
  resource_type?: 'Labor' | 'Equipment' | 'Other' | string;
  rsrc_type?: string;
}

export interface XerAssignment {
  task_id?: string;
  rsrc_id?: string;
  task_code: string;
  resource_code: string;
  planned_hours?: number;
  planned_cost?: number;
  target_qty?: number;
  target_cost?: number;
}

export interface XerExportOptions {
  wbsNodes?: XerWbs[];
  calendars?: XerCalendar[];
  resources?: XerResource[];
  assignments?: XerAssignment[];
}

export interface XerParseResult {
  success: boolean;
  version?: string;
  tasks: XerTask[];
  relationships: XerPred[];
  wbs: XerWbs[];
  calendars: XerCalendar[];
  resources: XerResource[];
  assignments: XerAssignment[];
  errors: string[];
}

export function parseXerFileContent(content: string): XerParseResult {
  const result: XerParseResult = {
    success: false,
    tasks: [],
    relationships: [],
    wbs: [],
    calendars: [],
    resources: [],
    assignments: [],
    errors: []
  };

  if (!content || !content.trim()) {
    result.errors.push('XER file is empty');
    return result;
  }

  const lines = content.split(/\r?\n/);
  let currentTable = '';
  let currentFields: string[] = [];
  const taskIdToCodeMap = new Map<string, string>();
  const rsrcIdToCodeMap = new Map<string, string>();
  const wbsIdToCodeMap = new Map<string, string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split('\t');
    const recordType = parts[0];

    if (recordType === 'ERMHDR') {
      result.version = parts[1] || 'Primavera P6 Standard';
    } else if (recordType === '%T') {
      currentTable = parts[1] || '';
      currentFields = [];
    } else if (recordType === '%F') {
      currentFields = parts.slice(1);
    } else if (recordType === '%R') {
      const values = parts.slice(1);
      const row: Record<string, string> = {};
      currentFields.forEach((field, idx) => {
        row[field] = values[idx] || '';
      });

      if (currentTable === 'PROJWBS') {
        const wbsId = row['wbs_id'] || '';
        const wbsCode = row['wbs_short_name'] || row['wbs_code'] || `WBS-${result.wbs.length + 1}`;
        if (wbsId) wbsIdToCodeMap.set(wbsId, wbsCode);
        result.wbs.push({
          wbs_id: wbsId,
          wbs_short_name: wbsCode,
          wbs_name: row['wbs_name'] || wbsCode,
          parent_wbs_id: row['parent_wbs_id'] || ''
        });
      } else if (currentTable === 'CALENDAR') {
        result.calendars.push({
          clndr_id: row['clndr_id'] || '',
          clndr_name: row['clndr_name'] || 'Standard Calendar',
          clndr_type: row['clndr_type'] || 'CA_Project',
          day_hr_cnt: parseFloat(row['day_hr_cnt'] || '8')
        });
      } else if (currentTable === 'RSRC') {
        const rsrcId = row['rsrc_id'] || '';
        const rsrcCode = row['rsrc_short_name'] || `R-${result.resources.length + 1}`;
        if (rsrcId) rsrcIdToCodeMap.set(rsrcId, rsrcCode);
        result.resources.push({
          rsrc_id: rsrcId,
          resource_code: rsrcCode,
          rsrc_short_name: rsrcCode,
          resource_name: row['rsrc_name'] || rsrcCode,
          rsrc_name: row['rsrc_name'] || rsrcCode,
          rsrc_type: row['rsrc_type'] || 'RT_Labor'
        });
      } else if (currentTable === 'TASK') {
        const taskId = row['task_id'] || '';
        const taskCode = row['task_code'] || `T-${result.tasks.length + 1}`;
        if (taskId) {
          taskIdToCodeMap.set(taskId, taskCode);
        }

        const durationHrs = parseFloat(row['remain_drtn_hr_cnt'] || row['target_drtn_hr_cnt'] || '64');
        const completePct = parseFloat(row['phys_complete_pct'] || '0');

        result.tasks.push({
          task_code: taskCode,
          task_name: row['task_name'] || 'Untitled Activity',
          target_start_date: row['target_start_date'] ? row['target_start_date'].split(' ')[0] : '2026-05-01',
          target_end_date: row['target_end_date'] ? row['target_end_date'].split(' ')[0] : '2026-05-15',
          remain_drtn_hr_cnt: isNaN(durationHrs) ? 64 : durationHrs,
          phys_complete_pct: isNaN(completePct) ? 0 : completePct
        });
      } else if (currentTable === 'TASKPRED') {
        const predId = row['pred_task_id'] || '';
        const succId = row['task_id'] || '';
        const predCode = taskIdToCodeMap.get(predId) || predId || 'P-01';
        const succCode = taskIdToCodeMap.get(succId) || succId || 'P-02';

        let predType: 'PR_FS' | 'PR_SS' | 'PR_FF' | 'PR_SF' = 'PR_FS';
        const rawType = row['pred_type'] || 'PR_FS';
        if (rawType === 'PR_SS' || rawType === 'PR_FF' || rawType === 'PR_SF') {
          predType = rawType;
        }

        const lagHrs = parseFloat(row['lag_hr_cnt'] || '0');

        result.relationships.push({
          pred_task_code: predCode,
          succ_task_code: succCode,
          pred_type: predType,
          lag_hr_cnt: isNaN(lagHrs) ? 0 : lagHrs
        });
      } else if (currentTable === 'TASKRSRC') {
        const taskId = row['task_id'] || '';
        const rsrcId = row['rsrc_id'] || '';
        const taskCode = taskIdToCodeMap.get(taskId) || taskId;
        const rsrcCode = rsrcIdToCodeMap.get(rsrcId) || rsrcId;
        const targetQty = parseFloat(row['target_qty'] || row['remain_qty'] || '0');
        const targetCost = parseFloat(row['target_cost'] || row['remain_cost'] || '0');
        result.assignments.push({
          task_id: taskId,
          task_code: taskCode,
          rsrc_id: rsrcId,
          resource_code: rsrcCode,
          target_qty: isNaN(targetQty) ? 0 : targetQty,
          target_cost: isNaN(targetCost) ? 0 : targetCost
        });
      }
    }
  }

  result.success = result.tasks.length > 0;
  return result;
}

export function generateCleanXer(
  tasks: XerTask[],
  preds: XerPred[],
  options?: XerExportOptions
): string {
  const lines: string[] = [];
  const now = new Date().toISOString().slice(0, 10);

  lines.push(`ERMHDR\t8.4\t${now}\tUSER\tBuildTrack P6 Round-Trip Suite\tUSD`);

  // PROJECT table
  lines.push('%T\tPROJECT');
  lines.push('%F\tproj_id\tproj_short_name\tproj_name');
  lines.push('%R\t1\tBT-2026\tBuildTrack Master Schedule');

  // WBS table
  const wbsList = options?.wbsNodes || [];
  const wbsCodeToId = new Map<string, string>();
  if (wbsList.length > 0) {
    lines.push('%T\tPROJWBS');
    lines.push('%F\twbs_id\tproj_id\twbs_short_name\twbs_name\tparent_wbs_id');
    wbsList.forEach((w, index) => {
      const wbsId = String(index + 100);
      const code = w.wbs_code || w.wbs_short_name || `WBS-${index + 1}`;
      wbsCodeToId.set(code, wbsId);
      const parentId = w.parent_wbs_code ? (wbsCodeToId.get(w.parent_wbs_code) || '') : '';
      lines.push(`%R\t${wbsId}\t1\t${code}\t${w.wbs_name}\t${parentId}`);
    });
  }

  // CALENDAR table
  const calList = options?.calendars || [];
  const calCodeToId = new Map<string, string>();
  lines.push('%T\tCALENDAR');
  lines.push('%F\tclndr_id\tclndr_name\tday_hr_cnt\tclndr_data');
  if (calList.length > 0) {
    calList.forEach((c, index) => {
      const calId = String(index + 1);
      const calCode = c.calendar_code || c.clndr_id || `CAL-${index + 1}`;
      const calName = c.calendar_name || c.clndr_name || calCode;
      calCodeToId.set(calCode, calId);
      calCodeToId.set(calName, calId);
      const dayHours = c.hours_per_day || c.day_hr_cnt || 8;
      // Synthesize standard P6 clndr_data pattern
      const workingDays = c.working_days || [1, 2, 3, 4, 5, 6];
      const clndrData = workingDays.map(d => `|${d}()((28800||`).join('');
      lines.push(`%R\t${calId}\t${calName}\t${dayHours}\t${clndrData}`);
    });
  } else {
    calCodeToId.set('default', '1');
    lines.push('%R\t1\tStandard 6-Day Site Calendar\t8\t|1()((28800|||2()((28800|||3()((28800|||4()((28800|||5()((28800|||6()((28800||');
  }

  // RSRC (Resource Masters) table
  const rsrcList = options?.resources || [];
  const rsrcCodeToId = new Map<string, string>();
  if (rsrcList.length > 0) {
    lines.push('%T\tRSRC');
    lines.push('%F\trsrc_id\trsrc_short_name\trsrc_name\trsrc_type');
    rsrcList.forEach((r, index) => {
      const rsrcId = String(index + 300);
      const resCode = r.resource_code || r.rsrc_short_name || `R-${index + 1}`;
      rsrcCodeToId.set(resCode, rsrcId);
      const p6Type = r.resource_type === 'Equipment' ? 'RT_Equip' : 'RT_Labor';
      lines.push(`%R\t${rsrcId}\t${resCode}\t${r.resource_name}\t${p6Type}`);
    });
  }

  // TASK table
  const taskCodeToId = new Map<string, string>();
  lines.push('%T\tTASK');
  lines.push('%F\ttask_id\tproj_id\twbs_id\tclndr_id\ttask_code\ttask_name\ttarget_start_date\ttarget_end_date\ttarget_drtn\tremain_drtn_hr_cnt\tphys_complete_pct');
  tasks.forEach((t, index) => {
    const taskId = String(index + 1001);
    taskCodeToId.set(t.task_code, taskId);
    const wbsId = t.wbs_code ? (wbsCodeToId.get(t.wbs_code) || '') : '';
    const calId = t.calendar_code ? (calCodeToId.get(t.calendar_code) || '1') : '1';
    const durationDays = Math.round((t.remain_drtn_hr_cnt || 64) / 8);
    lines.push(`%R\t${taskId}\t1\t${wbsId}\t${calId}\t${t.task_code}\t${t.task_name}\t${t.target_start_date} 08:00\t${t.target_end_date} 17:00\t${durationDays}\t${t.remain_drtn_hr_cnt}\t${t.phys_complete_pct}`);
  });

  // TASKPRED table
  lines.push('%T\tTASKPRED');
  lines.push('%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt');
  preds.forEach((p, index) => {
    const succTaskId = taskCodeToId.get(p.succ_task_code) || p.succ_task_code;
    const predTaskId = taskCodeToId.get(p.pred_task_code) || p.pred_task_code;
    lines.push(`%R\t${index + 5001}\t${succTaskId}\t${predTaskId}\t${p.pred_type}\t${p.lag_hr_cnt}`);
  });

  // TASKRSRC (Resource Assignments) table
  const assignList = options?.assignments || [];
  if (assignList.length > 0) {
    lines.push('%T\tTASKRSRC');
    lines.push('%F\ttask_rsrc_id\ttask_id\trsrc_id\ttarget_qty\ttarget_cost');
    assignList.forEach((a, index) => {
      const taskId = taskCodeToId.get(a.task_code) || a.task_code;
      const rsrcId = rsrcCodeToId.get(a.resource_code) || a.resource_code;
      const qty = a.planned_hours || 0;
      const cost = a.planned_cost || 0;
      lines.push(`%R\t${index + 7001}\t${taskId}\t${rsrcId}\t${qty}\t${cost}`);
    });
  }

  lines.push('%E');
  return lines.join('\r\n');
}
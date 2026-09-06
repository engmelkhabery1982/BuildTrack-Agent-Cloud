import type { DataRepository, DataRow, ListOptions } from "./repository";
import { assertRecordPeriodIsOpen, assertReportingPeriodDefinition, assertReportingPeriodMutation } from "./reportingPeriodGovernance";

const TABLES = new Set([
  "projects", "tasks", "costs", "cost_entries", "procurement", "safety",
  "progress_entries", "schedules", "contracts", "boq_headers", "boq_items",
  "schedule_distributions",
  "schedule_resource_assignments",
  "work_calendars",
  "project_baselines", "reporting_periods", "governance_register",
  "approval_requests", "audit_log",
  "rfi_register", "submittals", "quality_register",
  "site_daily_reports",
  "pmo_snapshots",
  "app_users",
  "cash_flow", "subcontractor_invoices", "client_invoices", "variations", "variation_lines",
  "documents", "wir_entries", "labor_duty", "equipment", "tracking_sheet",
  "resource_masters",
  "client_invoice_tracking", "subcontractor_invoice_tracking",
  "parties", "party_contacts", "rate_history",
  "report_templates",
  "cost_codes", "wbs_nodes", "contract_sov_lines", "control_accounts", "payment_certificates",
  "cost_changes", "procurement_receipts", "supplier_invoices", "supplier_invoice_lines", "supplier_invoice_payments",
  "progress_corrections", "schedule_versions", "delay_events",
  "cost_plan_versions", "cost_plan_periods",
  "estimate_versions", "estimate_lines",
  "variance_actions",
]);

const CONTROL_ACCOUNT_SOURCE_TABLES = new Set([
  "schedules", "wir_entries", "cost_entries", "procurement", "procurement_receipts",
]);

type StoredRow = {
  id: string;
  created_at: string;
  project_id: string | null;
  contract_id: string | null;
  parent_main_project_id: string | null;
  parent_main_contract_id: string | null;
  boq_header_id: string | null;
  boq_item_id: string | null;
  contract_sov_line_id?: string | null;
  control_account_id?: string | null;
  version_code?: string;
  version_name?: string;
  version_type?: string;
  status?: string;
  revision_number?: number;
  data_date?: string;
  owner?: string;
  reason?: string;
  activity_snapshot?: string;
  distribution_snapshot?: string;
  activity_count?: number;
  critical_activity_count?: number;
  wbs_id?: string | null;
  schedule_activity_id?: string | null;
  variation_id?: string | null;
  baseline_id?: string | null;
  analysis_date?: string | null;
  pre_impact_finish?: string | null;
  post_impact_finish?: string | null;
  delay_code?: string;
  event_name?: string;
  event_category?: string;
  discovery_date?: string;
  root_cause?: string;
  responsible_party?: string;
  entitlement_type?: string;
  requested_extension_days?: number;
  approved_extension_days?: number;
  mitigation_action?: string;
  cpm_impact_days?: number;
  time_impact_analysis?: string;
  notes?: string;
  updated_at?: string;
  payload: string;
};

function assertKnownTable(tableName: string): void {
  if (!TABLES.has(tableName)) throw new Error(`Unsupported SQLite table: ${tableName}`);
}

function nullableId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function createId(): string {
  return crypto.randomUUID();
}

export class SqliteRepository implements DataRepository {
  private databasePromise?: Promise<import("@tauri-apps/plugin-sql").default>;

  private async database() {
    if (!this.databasePromise) {
      this.databasePromise = import("@tauri-apps/plugin-sql")
        .then(async ({ default: Database }) => {
          const database = await Database.load("sqlite:buildtrack.db");
          // SQLite does not enforce declared foreign keys unless enabled for
          // every connection. This makes the schema constraints effective.
          await database.execute("PRAGMA foreign_keys = ON");
          return database;
        });
    }
    return this.databasePromise;
  }

  private unpack<T extends DataRow>(stored: StoredRow, tableName?: string): T {
    const payload = {
      ...JSON.parse(stored.payload),
      id: stored.id,
      created_at: stored.created_at,
    } as Record<string, any>;
    if (tableName === 'schedule_versions') {
      Object.assign(payload, {
        project_id: stored.project_id,
        contract_id: stored.contract_id,
        version_code: stored.version_code,
        version_name: stored.version_name,
        version_type: stored.version_type,
        status: stored.status,
        revision_number: stored.revision_number,
        data_date: stored.data_date,
        owner: stored.owner,
        reason: stored.reason,
        activity_snapshot: JSON.parse(stored.activity_snapshot || '[]'),
        distribution_snapshot: JSON.parse(stored.distribution_snapshot || '[]'),
        activity_count: stored.activity_count,
        critical_activity_count: stored.critical_activity_count,
        notes: stored.notes || '',
        updated_at: stored.updated_at,
      });
    } else if (tableName === 'delay_events') {
      Object.assign(payload, {
        project_id: stored.project_id,
        contract_id: stored.contract_id,
        wbs_id: stored.wbs_id,
        schedule_activity_id: stored.schedule_activity_id,
        variation_id: stored.variation_id,
        baseline_id: stored.baseline_id,
        analysis_date: stored.analysis_date,
        pre_impact_finish: stored.pre_impact_finish,
        post_impact_finish: stored.post_impact_finish,
        delay_code: stored.delay_code,
        event_name: stored.event_name,
        event_category: stored.event_category,
        discovery_date: stored.discovery_date,
        root_cause: stored.root_cause,
        responsible_party: stored.responsible_party,
        entitlement_type: stored.entitlement_type,
        requested_extension_days: stored.requested_extension_days,
        approved_extension_days: stored.approved_extension_days,
        mitigation_action: stored.mitigation_action || '',
        status: stored.status,
        cpm_impact_days: stored.cpm_impact_days || 0,
        time_impact_analysis: JSON.parse(stored.time_impact_analysis || '{}'),
        notes: stored.notes || '',
        updated_at: stored.updated_at,
      });
    } else if (tableName === 'cost_plan_versions') {
      Object.assign(payload, {
        project_id: stored.project_id,
        contract_id: stored.contract_id,
        control_account_id: (stored as any).control_account_id,
        wbs_id: (stored as any).wbs_id,
        cost_code_id: (stored as any).cost_code_id,
        contract_sov_line_id: (stored as any).contract_sov_line_id,
        boq_item_id: stored.boq_item_id,
        version_code: stored.version_code,
        version_name: stored.version_name,
        revision_number: (stored as any).revision_number,
        status: stored.status,
        data_date: (stored as any).data_date,
        delivery_cost_bac: (stored as any).delivery_cost_bac,
        curve_type: (stored as any).curve_type,
        start_date: (stored as any).start_date,
        end_date: (stored as any).end_date,
        periods_count: (stored as any).periods_count,
        owner: (stored as any).owner,
        reason: (stored as any).reason,
        approved_by: (stored as any).approved_by,
        approved_at: (stored as any).approved_at,
        notes: stored.notes || '',
        updated_at: (stored as any).updated_at,
        periods: payload.periods || [],
      });
    } else if (tableName === 'estimate_versions') {
      Object.assign(payload, {
        project_id: stored.project_id,
        contract_id: stored.contract_id,
        control_account_id: (stored as any).control_account_id,
        version_code: stored.version_code,
        version_name: stored.version_name,
        revision_number: (stored as any).revision_number,
        status: stored.status,
        data_date: (stored as any).data_date,
        method: (stored as any).method,
        owner: (stored as any).owner,
        reason: (stored as any).reason,
        assumptions: (stored as any).assumptions,
        approved_by: (stored as any).approved_by,
        approved_at: (stored as any).approved_at,
        notes: stored.notes || '',
        updated_at: (stored as any).updated_at,
        lines: payload.lines || [],
      });
    }
    return payload as T;
  }

  private async findStored(id: string, tableName: string): Promise<StoredRow> {
    const database = await this.database();
    const rows = await database.select<StoredRow[]>(
      `SELECT * FROM ${tableName} WHERE id = $1`, [id],
    );
    if (!rows[0]) throw new Error(`Record ${id} was not found in ${tableName}.`);
    return rows[0];
  }

  private async assertDelayEventScope(
    database: Awaited<ReturnType<SqliteRepository['database']>>,
    record: Record<string, any>,
  ): Promise<void> {
    const projectId = nullableId(record.project_id);
    const contractId = nullableId(record.contract_id);
    const activityId = nullableId(record.schedule_activity_id);
    if (!projectId || !contractId || !activityId) {
      throw new Error('Delay events require a project, main contract, and affected schedule activity.');
    }
    const contractRows = await database.select<StoredRow[]>('SELECT * FROM contracts WHERE id = $1', [contractId]);
    if (!contractRows[0]) throw new Error('The selected delay-event contract does not exist.');
    const contract = this.unpack<Record<string, any>>(contractRows[0], 'contracts');
    if (contract.project_id !== projectId || contract.parent_main_contract_id) {
      throw new Error('Delay events must reference a main contract in the selected project.');
    }
    const activityRows = await database.select<StoredRow[]>('SELECT * FROM schedules WHERE id = $1', [activityId]);
    if (!activityRows[0]) throw new Error('The selected delay-event activity does not exist.');
    const activity = this.unpack<Record<string, any>>(activityRows[0], 'schedules');
    if (activity.project_id !== projectId || activity.contract_id !== contractId) {
      throw new Error('The selected activity is outside the delay-event project/contract scope.');
    }
    for (const [field, table, label] of [
      ['wbs_id', 'wbs_nodes', 'WBS node'],
      ['variation_id', 'variations', 'variation'],
    ] as const) {
      const linkedId = nullableId(record[field]);
      if (!linkedId) continue;
      const rows = await database.select<StoredRow[]>(`SELECT * FROM ${table} WHERE id = $1`, [linkedId]);
      if (!rows[0]) throw new Error(`The selected ${label} does not exist.`);
      const linked = this.unpack<Record<string, any>>(rows[0], table);
      if (linked.project_id !== projectId || (linked.contract_id && linked.contract_id !== contractId)) {
        throw new Error(`The selected ${label} is outside the delay-event project/contract scope.`);
      }
    }
    const baselineId = nullableId(record.baseline_id);
    if (['Approved', 'Closed'].includes(String(record.status)) && !baselineId) {
      throw new Error('Approved delay events require an approved frozen baseline reference.');
    }
    if (baselineId) {
      const versionRows = await database.select<StoredRow[]>('SELECT * FROM schedule_versions WHERE id = $1', [baselineId]);
      const baselineRows = versionRows.length ? [] : await database.select<StoredRow[]>('SELECT * FROM project_baselines WHERE id = $1', [baselineId]);
      const stored = versionRows[0] || baselineRows[0];
      const table = versionRows[0] ? 'schedule_versions' : 'project_baselines';
      if (!stored) throw new Error('The selected frozen baseline does not exist.');
      const baseline = this.unpack<Record<string, any>>(stored, table);
      if (baseline.project_id !== projectId || baseline.contract_id !== contractId || baseline.status !== 'Approved') {
        throw new Error('The selected baseline is not approved for this delay-event scope.');
      }
    }
  }

  private async writeAudit(
    database: Awaited<ReturnType<SqliteRepository['database']>>,
    action: 'Insert' | 'Update' | 'Delete',
    entityType: string,
    record: Record<string, any>,
    before?: Record<string, any>,
  ): Promise<void> {
    if (entityType === 'audit_log') return;
    const now = new Date().toISOString();
    const audit = {
      id: createId(), created_at: now, project_id: record.project_id || null, contract_id: record.contract_id || null,
      entity_type: entityType, entity_id: record.id, action, actor: 'Local User',
      before: before || null, after: action === 'Delete' ? null : record,
      summary: `${action} ${entityType}`,
    };
    await database.execute(
      `INSERT INTO audit_log (id, created_at, project_id, contract_id, parent_main_project_id, parent_main_contract_id, boq_header_id, boq_item_id, payload)
       VALUES ($1, $2, $3, $4, NULL, NULL, $5, $6, $7)`,
      [audit.id, now, nullableId(audit.project_id), nullableId(audit.contract_id), nullableId(record.boq_header_id), nullableId(record.boq_item_id), JSON.stringify(audit)],
    );
  }

  private async assertReportingPeriodMutationAllowed(
    database: Awaited<ReturnType<SqliteRepository['database']>>,
    operation: 'insert' | 'update' | 'delete',
    tableName: string,
    next?: Record<string, any>,
    before?: Record<string, any>,
  ): Promise<void> {
    // Audit entries are generated after a permitted mutation and must remain
    // append-only evidence, not be blocked by the period they describe.
    if (tableName === 'audit_log') return;
    const storedPeriods = await database.select<StoredRow[]>("SELECT * FROM reporting_periods");
    const periods = storedPeriods.map((period) => this.unpack<Record<string, any>>(period));
    if (tableName === 'reporting_periods') {
      assertReportingPeriodMutation(operation, next, before);
      if (operation !== 'delete' && next) assertReportingPeriodDefinition(next, periods);
      return;
    }
    const governedNext = tableName === 'projects' && next ? { ...next, project_id: next.id } : next;
    const governedBefore = tableName === 'projects' && before ? { ...before, project_id: before.id } : before;
    assertRecordPeriodIsOpen(periods, governedNext, governedBefore);
  }

  async list<T extends DataRow>(tableName: string, options: ListOptions = {}): Promise<T[]> {
    assertKnownTable(tableName);
    const database = await this.database();
    const ascending = options.ascending ?? false;
    const rows = await database.select<StoredRow[]>(
      `SELECT * FROM ${tableName} ORDER BY created_at ${ascending ? "ASC" : "DESC"}`,
    );
    return rows.map((row) => this.unpack<T>(row, tableName));
  }

  async insert<T extends DataRow>(tableName: string, row: T): Promise<T> {
    assertKnownTable(tableName);
    const database = await this.database();
    const now = new Date().toISOString();
    const record = { ...row, id: (row as any).id || createId(), created_at: (row as any).created_at || now } as Record<string, any>;
    await this.assertReportingPeriodMutationAllowed(database, 'insert', tableName, record);
    // The first desktop release created compact schemas for Projects and
    // Contracts. Keep their write shape compatible with both that database
    // and the newer migration, while relationships remain in the payload.
    if (tableName === "projects") {
      await database.execute(
        "INSERT INTO projects (id, created_at, payload) VALUES ($1, $2, $3)",
        [record.id, record.created_at, JSON.stringify(record)],
      );
    } else if (tableName === "contracts") {
      await database.execute(
        `INSERT INTO contracts (id, created_at, project_id, parent_main_contract_id, payload)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          record.id, record.created_at, nullableId(record.project_id),
          nullableId(record.parent_main_contract_id), JSON.stringify(record),
        ],
      );
    } else if (tableName === "boq_headers") {
      await database.execute(
        `INSERT INTO boq_headers (id, created_at, project_id, contract_id, payload)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          record.id, record.created_at, nullableId(record.project_id),
          nullableId(record.contract_id), JSON.stringify(record),
        ],
      );
    } else if (tableName === "boq_items") {
      await database.execute(
        `INSERT INTO boq_items (id, created_at, project_id, boq_header_id, payload)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          record.id, record.created_at, nullableId(record.project_id),
          nullableId(record.boq_header_id), JSON.stringify(record),
        ],
      );
    } else if (tableName === "cost_changes") {
      await database.execute(
        `INSERT INTO cost_changes (id, created_at, project_id, contract_id, parent_main_project_id, parent_main_contract_id, boq_header_id, boq_item_id, contract_sov_line_id, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          record.id, record.created_at, nullableId(record.project_id), nullableId(record.contract_id),
          nullableId(record.parent_main_project_id), nullableId(record.parent_main_contract_id),
          nullableId(record.boq_header_id), nullableId(record.boq_item_id), nullableId(record.contract_sov_line_id), JSON.stringify(record),
        ],
      );
    } else if (tableName === "control_accounts") {
      await database.execute(
        `INSERT INTO control_accounts (id, created_at, project_id, contract_id, wbs_id, boq_item_id, cost_code_id, contract_sov_line_id, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          record.id, record.created_at, nullableId(record.project_id), nullableId(record.contract_id),
          nullableId(record.wbs_id), nullableId(record.boq_item_id), nullableId(record.cost_code_id),
          nullableId(record.contract_sov_line_id), JSON.stringify(record),
        ],
      );
    } else if (tableName === "schedule_versions") {
      await database.execute(
        `INSERT INTO schedule_versions (
          id, created_at, updated_at, project_id, contract_id, version_code, version_name, version_type,
          status, revision_number, data_date, owner, reason, activity_snapshot, distribution_snapshot,
          activity_count, critical_activity_count, notes, payload
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [
          record.id, record.created_at, record.updated_at || now, nullableId(record.project_id), nullableId(record.contract_id),
          record.version_code, record.version_name, record.version_type, record.status, Number(record.revision_number) || 1,
          record.data_date, record.owner, record.reason, JSON.stringify(record.activity_snapshot || []),
          JSON.stringify(record.distribution_snapshot || []), Number(record.activity_count) || 0,
          Number(record.critical_activity_count) || 0, record.notes || '', JSON.stringify(record),
        ],
      );
    } else if (tableName === "delay_events") {
      await this.assertDelayEventScope(database, record);
      await database.execute(
        `INSERT INTO delay_events (
          id, created_at, updated_at, project_id, contract_id, wbs_id, schedule_activity_id, variation_id,
          baseline_id, analysis_date, pre_impact_finish, post_impact_finish,
          delay_code, event_name, event_category, discovery_date, root_cause, responsible_party,
          entitlement_type, requested_extension_days, approved_extension_days, mitigation_action,
          status, cpm_impact_days, time_impact_analysis, notes, payload
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)`,
        [
          record.id, record.created_at, record.updated_at || now, nullableId(record.project_id), nullableId(record.contract_id),
          nullableId(record.wbs_id), nullableId(record.schedule_activity_id), nullableId(record.variation_id),
          nullableId(record.baseline_id), record.analysis_date || null, record.pre_impact_finish || null, record.post_impact_finish || null,
          record.delay_code, record.event_name, record.event_category, record.discovery_date, record.root_cause,
          record.responsible_party, record.entitlement_type, Number(record.requested_extension_days) || 0,
          Number(record.approved_extension_days) || 0, record.mitigation_action || '', record.status,
          Number(record.cpm_impact_days) || 0, JSON.stringify(record.time_impact_analysis || {}),
          record.notes || '', JSON.stringify(record),
        ],
      );
    } else if (tableName === "cost_plan_versions") {
      if (!record.project_id) throw new Error('Cost plan requires a valid project_id.');
      if (!record.contract_id) throw new Error('Cost plan requires a valid contract_id.');
      if (!record.control_account_id) throw new Error('Cost plan requires a valid control_account_id.');
      if (!record.delivery_cost_bac || Number(record.delivery_cost_bac) <= 0) {
        throw new Error('Cost plan requires a positive Delivery Cost BAC.');
      }
      if (record.status === 'Approved') {
        await database.execute(
          `UPDATE cost_plan_versions SET status = 'Superseded', updated_at = CURRENT_TIMESTAMP
           WHERE project_id = $1 AND contract_id = $2 AND control_account_id = $3 AND status = 'Approved'`,
          [record.project_id, record.contract_id, record.control_account_id]
        );
      }
      await database.execute(
        `INSERT INTO cost_plan_versions (
          id, created_at, updated_at, project_id, contract_id, control_account_id,
          wbs_id, cost_code_id, contract_sov_line_id, boq_item_id,
          version_code, version_name, revision_number, status, data_date,
          delivery_cost_bac, curve_type, start_date, end_date, periods_count,
          owner, reason, approved_by, approved_at, notes, payload
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`,
        [
          record.id, record.created_at, record.updated_at || now,
          record.project_id, record.contract_id, record.control_account_id,
          nullableId(record.wbs_id), nullableId(record.cost_code_id),
          nullableId(record.contract_sov_line_id), nullableId(record.boq_item_id),
          record.version_code, record.version_name || record.version_code,
          Number(record.revision_number) || 1, record.status || 'Draft',
          record.data_date, Number(record.delivery_cost_bac),
          record.curve_type || 'Linear', record.start_date, record.end_date,
          Number(record.periods_count) || (record.periods?.length || 1),
          record.owner || '', record.reason || '',
          record.approved_by || null, record.approved_at || null,
          record.notes || '', JSON.stringify(record),
        ]
      );
      if (Array.isArray(record.periods)) {
        for (const p of record.periods) {
          await database.execute(
            `INSERT OR REPLACE INTO cost_plan_periods (
              id, version_id, period_index, period_start, period_end,
              planned_cost, cumulative_cost, weight_pct, distribution_source,
              is_closed_period, actual_cost, notes, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
              p.id || `${record.id}-p-${p.period_index}`,
              record.id,
              Number(p.period_index),
              p.period_start,
              p.period_end,
              Number(p.planned_cost) || 0,
              Number(p.cumulative_cost) || 0,
              Number(p.weight_pct) || 0,
              p.distribution_source || record.curve_type || 'Linear',
              p.is_closed_period ? 1 : 0,
              Number(p.actual_cost) || 0,
              p.notes || '',
              p.created_at || now,
            ]
          );
        }
      }
    } else if (tableName === "estimate_versions") {
      if (!record.project_id) throw new Error('Estimate requires a valid project_id.');
      if (!record.contract_id) throw new Error('Estimate requires a valid contract_id.');
      if (!record.control_account_id) throw new Error('Estimate requires a valid control_account_id.');
      if (record.status === 'Approved') {
        await database.execute(
          `UPDATE estimate_versions SET status = 'Superseded', updated_at = CURRENT_TIMESTAMP
           WHERE project_id = $1 AND contract_id = $2 AND control_account_id = $3 AND status = 'Approved'`,
          [record.project_id, record.contract_id, record.control_account_id]
        );
      }
      await database.execute(
        `INSERT INTO estimate_versions (
          id, created_at, updated_at, project_id, contract_id, control_account_id,
          version_code, version_name, revision_number, status, data_date,
          method, owner, reason, assumptions, approved_by, approved_at, notes, payload
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [
          record.id, record.created_at, record.updated_at || now,
          record.project_id, record.contract_id, record.control_account_id,
          record.version_code, record.version_name || record.version_code,
          Number(record.revision_number) || 1, record.status || 'Draft',
          record.data_date, record.method || 'Bottom-up',
          record.owner || '', record.reason || '', record.assumptions || '',
          record.approved_by || null, record.approved_at || null,
          record.notes || '', JSON.stringify(record),
        ]
      );
      if (Array.isArray(record.lines)) {
        for (const l of record.lines) {
          await database.execute(
            `INSERT OR REPLACE INTO estimate_lines (
              id, version_id, control_account_id, planned_value, earned_value,
              actual_cost, open_commitment, etc, fac, method_used, notes,
              waiver_documented, waiver_reason
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
              l.id || `${record.id}-l-${l.control_account_id}`,
              record.id,
              l.control_account_id,
              Number(l.planned_value) || 0,
              Number(l.earned_value) || 0,
              Number(l.actual_cost) || 0,
              Number(l.open_commitment) || 0,
              Number(l.etc) || 0,
              Number(l.fac) || 0,
              l.method_used || record.method || 'Bottom-up',
              l.notes || '',
              l.waiver_documented ? 1 : 0,
              l.waiver_reason || '',
            ]
          );
        }
      }
    } else if (tableName === "progress_corrections") {
      await database.execute(
        `INSERT INTO progress_corrections (id, created_at, project_id, contract_id, boq_header_id, boq_item_id, original_wir_id, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          record.id, record.created_at, nullableId(record.project_id), nullableId(record.contract_id),
          nullableId(record.boq_header_id), nullableId(record.boq_item_id), nullableId(record.original_wir_id), JSON.stringify(record),
        ],
      );
    } else if (CONTROL_ACCOUNT_SOURCE_TABLES.has(tableName)) {
      await database.execute(
        `INSERT INTO ${tableName} (id, created_at, project_id, contract_id, parent_main_project_id, parent_main_contract_id, boq_header_id, boq_item_id, control_account_id, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          record.id, record.created_at, nullableId(record.project_id), nullableId(record.contract_id),
          nullableId(record.parent_main_project_id), nullableId(record.parent_main_contract_id),
          nullableId(record.boq_header_id), nullableId(record.boq_item_id), nullableId(record.control_account_id), JSON.stringify(record),
        ],
      );
    } else {
      await database.execute(
        `INSERT INTO ${tableName} (id, created_at, project_id, contract_id, parent_main_project_id, parent_main_contract_id, boq_header_id, boq_item_id, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          record.id, record.created_at, nullableId(record.project_id), nullableId(record.contract_id),
          nullableId(record.parent_main_project_id), nullableId(record.parent_main_contract_id),
          nullableId(record.boq_header_id), nullableId(record.boq_item_id), JSON.stringify(record),
        ],
      );
    }
    await this.writeAudit(database, 'Insert', tableName, record);
    return record as T;
  }

  async insertMany<T extends DataRow>(tableName: string, rows: T[]): Promise<T[]> {
    const inserted: T[] = [];
    for (const row of rows) inserted.push(await this.insert(tableName, row));
    return inserted;
  }

  async update<T extends DataRow>(tableName: string, id: string, patch: Partial<T>): Promise<T> {
    assertKnownTable(tableName);
    const existing = this.unpack<T>(await this.findStored(id, tableName), tableName);
    const record = { ...existing, ...patch, id } as Record<string, any>;
    const database = await this.database();
    await this.assertReportingPeriodMutationAllowed(database, 'update', tableName, record, existing as Record<string, any>);
    if (tableName === "projects") {
      await database.execute(
        "UPDATE projects SET payload = $1 WHERE id = $2",
        [JSON.stringify(record), id],
      );
    } else if (tableName === "contracts") {
      await database.execute(
        `UPDATE contracts
         SET project_id = $1, parent_main_contract_id = $2, payload = $3
         WHERE id = $4`,
        [
          nullableId(record.project_id), nullableId(record.parent_main_contract_id),
          JSON.stringify(record), id,
        ],
      );
    } else if (tableName === "boq_headers") {
      await database.execute(
        `UPDATE boq_headers
         SET project_id = $1, contract_id = $2, payload = $3
         WHERE id = $4`,
        [
          nullableId(record.project_id), nullableId(record.contract_id),
          JSON.stringify(record), id,
        ],
      );
    } else if (tableName === "boq_items") {
      await database.execute(
        `UPDATE boq_items
         SET project_id = $1, boq_header_id = $2, payload = $3
         WHERE id = $4`,
        [
          nullableId(record.project_id), nullableId(record.boq_header_id),
          JSON.stringify(record), id,
        ],
      );
    } else if (tableName === "cost_changes") {
      await database.execute(
        `UPDATE cost_changes
         SET project_id = $1, contract_id = $2, parent_main_project_id = $3, parent_main_contract_id = $4,
             boq_header_id = $5, boq_item_id = $6, contract_sov_line_id = $7, payload = $8
         WHERE id = $9`,
        [
          nullableId(record.project_id), nullableId(record.contract_id), nullableId(record.parent_main_project_id),
          nullableId(record.parent_main_contract_id), nullableId(record.boq_header_id), nullableId(record.boq_item_id),
          nullableId(record.contract_sov_line_id), JSON.stringify(record), id,
        ],
      );
    } else if (tableName === "control_accounts") {
      await database.execute(
        `UPDATE control_accounts
         SET project_id = $1, contract_id = $2, wbs_id = $3, boq_item_id = $4, cost_code_id = $5,
             contract_sov_line_id = $6, payload = $7
         WHERE id = $8`,
        [
          nullableId(record.project_id), nullableId(record.contract_id), nullableId(record.wbs_id),
          nullableId(record.boq_item_id), nullableId(record.cost_code_id), nullableId(record.contract_sov_line_id),
          JSON.stringify(record), id,
        ],
      );
    } else if (tableName === "schedule_versions") {
      record.updated_at = new Date().toISOString();
      await database.execute(
        `UPDATE schedule_versions SET
          project_id = $1, contract_id = $2, version_code = $3, version_name = $4, version_type = $5,
          status = $6, revision_number = $7, data_date = $8, owner = $9, reason = $10,
          activity_snapshot = $11, distribution_snapshot = $12, activity_count = $13,
          critical_activity_count = $14, notes = $15, updated_at = $16, payload = $17
         WHERE id = $18`,
        [
          nullableId(record.project_id), nullableId(record.contract_id), record.version_code, record.version_name,
          record.version_type, record.status, Number(record.revision_number) || 1, record.data_date, record.owner,
          record.reason, JSON.stringify(record.activity_snapshot || []), JSON.stringify(record.distribution_snapshot || []),
          Number(record.activity_count) || 0, Number(record.critical_activity_count) || 0, record.notes || '',
          record.updated_at, JSON.stringify(record), id,
        ],
      );
    } else if (tableName === "delay_events") {
      record.updated_at = new Date().toISOString();
      await this.assertDelayEventScope(database, record);
      await database.execute(
        `UPDATE delay_events SET
          project_id = $1, contract_id = $2, wbs_id = $3, schedule_activity_id = $4, variation_id = $5,
          baseline_id = $6, analysis_date = $7, pre_impact_finish = $8, post_impact_finish = $9,
          delay_code = $10, event_name = $11, event_category = $12, discovery_date = $13, root_cause = $14,
          responsible_party = $15, entitlement_type = $16, requested_extension_days = $17,
          approved_extension_days = $18, mitigation_action = $19, status = $20, cpm_impact_days = $21,
          time_impact_analysis = $22, notes = $23, updated_at = $24, payload = $25
         WHERE id = $26`,
        [
          nullableId(record.project_id), nullableId(record.contract_id), nullableId(record.wbs_id),
          nullableId(record.schedule_activity_id), nullableId(record.variation_id),
          nullableId(record.baseline_id), record.analysis_date || null, record.pre_impact_finish || null, record.post_impact_finish || null,
          record.delay_code, record.event_name, record.event_category, record.discovery_date, record.root_cause,
          record.responsible_party, record.entitlement_type, Number(record.requested_extension_days) || 0,
          Number(record.approved_extension_days) || 0, record.mitigation_action || '', record.status,
          Number(record.cpm_impact_days) || 0, JSON.stringify(record.time_impact_analysis || {}),
          record.notes || '', record.updated_at, JSON.stringify(record), id,
        ],
      );
    } else if (tableName === "cost_plan_versions") {
      record.updated_at = new Date().toISOString();
      const existingRows = await database.select<StoredRow[]>(
        `SELECT * FROM cost_plan_versions WHERE id = $1`, [id]
      );
      if (existingRows[0]) {
        if (existingRows[0].status === 'Superseded') {
          throw new Error('Superseded cost plan versions are permanently locked.');
        }
        if (existingRows[0].status === 'Approved' && record.status !== 'Superseded') {
          throw new Error('Approved cost plan versions are immutable control points and may only transition to Superseded.');
        }
      }
      if (record.status === 'Approved') {
        await database.execute(
          `UPDATE cost_plan_versions SET status = 'Superseded', updated_at = CURRENT_TIMESTAMP
           WHERE project_id = $1 AND contract_id = $2 AND control_account_id = $3 AND status = 'Approved' AND id <> $4`,
          [record.project_id, record.contract_id, record.control_account_id, id]
        );
      }
      await database.execute(
        `UPDATE cost_plan_versions SET
          project_id = $1, contract_id = $2, control_account_id = $3, wbs_id = $4,
          cost_code_id = $5, contract_sov_line_id = $6, boq_item_id = $7,
          version_code = $8, version_name = $9, revision_number = $10,
          status = $11, data_date = $12, delivery_cost_bac = $13, curve_type = $14,
          start_date = $15, end_date = $16, periods_count = $17,
          owner = $18, reason = $19, approved_by = $20, approved_at = $21,
          notes = $22, updated_at = $23, payload = $24
         WHERE id = $25`,
        [
          record.project_id, record.contract_id, record.control_account_id,
          nullableId(record.wbs_id), nullableId(record.cost_code_id),
          nullableId(record.contract_sov_line_id), nullableId(record.boq_item_id),
          record.version_code, record.version_name || record.version_code,
          Number(record.revision_number) || 1,
          record.status, record.data_date, Number(record.delivery_cost_bac),
          record.curve_type, record.start_date, record.end_date,
          Number(record.periods_count) || (record.periods?.length || 1),
          record.owner || '', record.reason || '',
          record.approved_by || null, record.approved_at || null,
          record.notes || '', record.updated_at, JSON.stringify(record), id,
        ]
      );
      if (Array.isArray(record.periods)) {
        await database.execute(`DELETE FROM cost_plan_periods WHERE version_id = $1`, [id]);
        for (const p of record.periods) {
          await database.execute(
            `INSERT INTO cost_plan_periods (
              id, version_id, period_index, period_start, period_end,
              planned_cost, cumulative_cost, weight_pct, distribution_source,
              is_closed_period, actual_cost, notes, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
              p.id || `${id}-p-${p.period_index}`,
              id,
              Number(p.period_index),
              p.period_start,
              p.period_end,
              Number(p.planned_cost) || 0,
              Number(p.cumulative_cost) || 0,
              Number(p.weight_pct) || 0,
              p.distribution_source || record.curve_type || 'Linear',
              p.is_closed_period ? 1 : 0,
              Number(p.actual_cost) || 0,
              p.notes || '',
              p.created_at || record.updated_at,
            ]
          );
        }
      }
    } else if (tableName === "estimate_versions") {
      record.updated_at = new Date().toISOString();
      const existingRows = await database.select<StoredRow[]>(
        `SELECT * FROM estimate_versions WHERE id = $1`, [id]
      );
      if (existingRows[0]) {
        if (existingRows[0].status === 'Superseded') {
          throw new Error('Superseded estimate versions are permanently locked.');
        }
        if (existingRows[0].status === 'Approved' && record.status !== 'Superseded') {
          throw new Error('Approved estimate versions are immutable control points and may only transition to Superseded.');
        }
      }
      if (record.status === 'Approved') {
        await database.execute(
          `UPDATE estimate_versions SET status = 'Superseded', updated_at = CURRENT_TIMESTAMP
           WHERE project_id = $1 AND contract_id = $2 AND control_account_id = $3 AND status = 'Approved' AND id <> $4`,
          [record.project_id, record.contract_id, record.control_account_id, id]
        );
      }
      await database.execute(
        `UPDATE estimate_versions SET
          project_id = $1, contract_id = $2, control_account_id = $3,
          version_code = $4, version_name = $5, revision_number = $6,
          status = $7, data_date = $8, method = $9, owner = $10, reason = $11,
          assumptions = $12, approved_by = $13, approved_at = $14,
          notes = $15, updated_at = $16, payload = $17
         WHERE id = $18`,
        [
          record.project_id, record.contract_id, record.control_account_id,
          record.version_code, record.version_name || record.version_code,
          Number(record.revision_number) || 1,
          record.status, record.data_date, record.method,
          record.owner || '', record.reason || '', record.assumptions || '',
          record.approved_by || null, record.approved_at || null,
          record.notes || '', record.updated_at, JSON.stringify(record), id,
        ]
      );
      if (Array.isArray(record.lines)) {
        await database.execute(`DELETE FROM estimate_lines WHERE version_id = $1`, [id]);
        for (const l of record.lines) {
          await database.execute(
            `INSERT INTO estimate_lines (
              id, version_id, control_account_id, planned_value, earned_value,
              actual_cost, open_commitment, etc, fac, method_used, notes,
              waiver_documented, waiver_reason
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
              l.id || `${id}-l-${l.control_account_id}`,
              id,
              l.control_account_id,
              Number(l.planned_value) || 0,
              Number(l.earned_value) || 0,
              Number(l.actual_cost) || 0,
              Number(l.open_commitment) || 0,
              Number(l.etc) || 0,
              Number(l.fac) || 0,
              l.method_used || record.method || 'Bottom-up',
              l.notes || '',
              l.waiver_documented ? 1 : 0,
              l.waiver_reason || '',
            ]
          );
        }
      }
    } else if (tableName === "progress_corrections") {
      await database.execute(
        `UPDATE progress_corrections
         SET project_id = $1, contract_id = $2, boq_header_id = $3, boq_item_id = $4, original_wir_id = $5, payload = $6
         WHERE id = $7`,
        [
          nullableId(record.project_id), nullableId(record.contract_id), nullableId(record.boq_header_id),
          nullableId(record.boq_item_id), nullableId(record.original_wir_id), JSON.stringify(record), id,
        ],
      );
    } else if (CONTROL_ACCOUNT_SOURCE_TABLES.has(tableName)) {
      await database.execute(
        `UPDATE ${tableName}
         SET project_id = $1, contract_id = $2, parent_main_project_id = $3, parent_main_contract_id = $4,
             boq_header_id = $5, boq_item_id = $6, control_account_id = $7, payload = $8
         WHERE id = $9`,
        [
          nullableId(record.project_id), nullableId(record.contract_id), nullableId(record.parent_main_project_id),
          nullableId(record.parent_main_contract_id), nullableId(record.boq_header_id), nullableId(record.boq_item_id),
          nullableId(record.control_account_id), JSON.stringify(record), id,
        ],
      );
    } else {
      await database.execute(
        `UPDATE ${tableName}
         SET project_id = $1, contract_id = $2, parent_main_project_id = $3, parent_main_contract_id = $4,
             boq_header_id = $5, boq_item_id = $6, payload = $7
         WHERE id = $8`,
        [
          nullableId(record.project_id), nullableId(record.contract_id), nullableId(record.parent_main_project_id),
          nullableId(record.parent_main_contract_id), nullableId(record.boq_header_id), nullableId(record.boq_item_id),
          JSON.stringify(record), id,
        ],
      );
    }
    await this.writeAudit(database, 'Update', tableName, record, existing as Record<string, any>);
    return record as T;
  }

  async delete(tableName: string, id: string): Promise<void> {
    assertKnownTable(tableName);
    const existing = this.unpack<Record<string, any>>(await this.findStored(id, tableName), tableName);
    if (tableName === 'cost_plan_versions' || tableName === 'estimate_versions') {
      if (['Approved', 'Superseded'].includes(existing.status)) {
        throw new Error(`Approved or Superseded ${tableName} cannot be deleted.`);
      }
    }
    const database = await this.database();
    await this.assertReportingPeriodMutationAllowed(database, 'delete', tableName, undefined, existing);
    await database.execute(`DELETE FROM ${tableName} WHERE id = $1`, [id]);
    await this.writeAudit(database, 'Delete', tableName, existing, existing);
  }
}

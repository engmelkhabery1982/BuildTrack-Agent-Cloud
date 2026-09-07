//! Atomic labor timesheet lifecycle.
//! Draft -> Submitted -> Approved -> Posted -> Reversed.
//! Approval validates schedule activities, control accounts, active labor resources,
//! non-negative hours, duplicate shifts, and locked reporting periods.
//! Posting creates immutable CostEntry rows atomically with source_type='LaborTimesheet'.
//! Reversal creates negative offset CostEntry rows without deleting the original audit trail.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{sqlite::SqliteConnectOptions, Row, Sqlite, SqlitePool, Transaction};
use std::collections::HashSet;
use std::path::Path;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveLaborTimesheetRequest {
    pub operation_id: String,
    pub timesheet_id: String,
    pub actor: String,
    pub approved_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostLaborTimesheetRequest {
    pub operation_id: String,
    pub timesheet_id: String,
    pub actor: String,
    pub posted_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReverseLaborTimesheetRequest {
    pub operation_id: String,
    pub timesheet_id: String,
    pub actor: String,
    pub reason: String,
    pub reversed_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaborTimesheetOperationResult {
    pub operation_id: String,
    pub timesheet_id: String,
    pub status: String,
}

fn stamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    format!("{}Z", SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis())
}

fn m(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

fn s(v: &Value, k: &str) -> String {
    v.get(k).and_then(Value::as_str).unwrap_or_default().to_string()
}

fn n(v: &Value, k: &str) -> f64 {
    v.get(k).and_then(Value::as_f64).unwrap_or(0.0)
}

async fn db(path: &Path) -> Result<SqlitePool, String> {
    SqlitePool::connect_with(
        SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .foreign_keys(true),
    )
    .await
    .map_err(|e| e.to_string())
}

async fn guard_on(tx: &mut Transaction<'_, Sqlite>, operation_id: &str) -> Result<(), String> {
    sqlx::query("INSERT OR IGNORE INTO supplier_ap_mutation_guard (operation_id, created_at) VALUES (?, ?)")
        .bind(operation_id)
        .bind(stamp())
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn guard_off(tx: &mut Transaction<'_, Sqlite>, operation_id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM supplier_ap_mutation_guard WHERE operation_id = ?")
        .bind(operation_id)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

struct TimesheetHeader {
    id: String,
    project_id: String,
    contract_id: String,
    timesheet_number: String,
    work_date: String,
    shift: String,
    status: String,
    payload: Value,
}

struct TimesheetLine {
    id: String,
    resource_id: String,
    schedule_activity_id: String,
    control_account_id: String,
    cost_code_id: Option<String>,
    regular_hours: f64,
    overtime_hours: f64,
    regular_rate: f64,
    overtime_rate: f64,
    calculated_amount: f64,
    non_working_override_reason: Option<String>,
    payload: Value,
}

async fn load_timesheet(tx: &mut Transaction<'_, Sqlite>, id: &str) -> Result<(TimesheetHeader, Vec<TimesheetLine>), String> {
    let r = sqlx::query("SELECT id, project_id, contract_id, timesheet_number, work_date, shift, status, payload FROM labor_timesheets WHERE id = ?")
        .bind(id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Labor timesheet {} was not found.", id))?;

    let payload_str: String = r.try_get("payload").map_err(|e| e.to_string())?;
    let payload: Value = serde_json::from_str(&payload_str).map_err(|e| e.to_string())?;

    let header = TimesheetHeader {
        id: r.try_get("id").map_err(|e| e.to_string())?,
        project_id: r.try_get("project_id").map_err(|e| e.to_string())?,
        contract_id: r.try_get("contract_id").map_err(|e| e.to_string())?,
        timesheet_number: r.try_get("timesheet_number").map_err(|e| e.to_string())?,
        work_date: r.try_get("work_date").map_err(|e| e.to_string())?,
        shift: r.try_get("shift").map_err(|e| e.to_string())?,
        status: r.try_get("status").map_err(|e| e.to_string())?,
        payload,
    };

    let line_rows = sqlx::query("SELECT id, resource_id, schedule_activity_id, control_account_id, cost_code_id, regular_hours, overtime_hours, regular_rate, overtime_rate, calculated_amount, non_working_override_reason, payload FROM labor_timesheet_lines WHERE timesheet_id = ? ORDER BY id ASC")
        .bind(id)
        .fetch_all(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

    let mut lines = Vec::new();
    for lr in line_rows {
        let l_payload_str: String = lr.try_get("payload").map_err(|e| e.to_string())?;
        let l_payload: Value = serde_json::from_str(&l_payload_str).map_err(|e| e.to_string())?;
        lines.push(TimesheetLine {
            id: lr.try_get("id").map_err(|e| e.to_string())?,
            resource_id: lr.try_get("resource_id").map_err(|e| e.to_string())?,
            schedule_activity_id: lr.try_get("schedule_activity_id").map_err(|e| e.to_string())?,
            control_account_id: lr.try_get("control_account_id").map_err(|e| e.to_string())?,
            cost_code_id: lr.try_get("cost_code_id").ok(),
            regular_hours: lr.try_get("regular_hours").unwrap_or(0.0),
            overtime_hours: lr.try_get("overtime_hours").unwrap_or(0.0),
            regular_rate: lr.try_get("regular_rate").unwrap_or(0.0),
            overtime_rate: lr.try_get("overtime_rate").unwrap_or(0.0),
            calculated_amount: lr.try_get("calculated_amount").unwrap_or(0.0),
            non_working_override_reason: lr.try_get("non_working_override_reason").ok(),
            payload: l_payload,
        });
    }

    Ok((header, lines))
}

async fn validate_timesheet_rules(
    tx: &mut Transaction<'_, Sqlite>,
    header: &TimesheetHeader,
    lines: &[TimesheetLine],
) -> Result<(), String> {
    if lines.is_empty() {
        return Err("Timesheet must contain at least one labor line.".into());
    }

    // Check project and contract scope
    let contract_valid: Option<String> = sqlx::query_scalar("SELECT id FROM contracts WHERE id = ? AND project_id = ?")
        .bind(&header.contract_id)
        .bind(&header.project_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

    if contract_valid.is_none() {
        return Err("Main contract does not belong to the selected project.".into());
    }

    // Check reporting period lock
    let locked_period_count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM reporting_periods WHERE status IN ('Locked', 'Closed') AND (project_id IS NULL OR project_id = ?) AND ? >= COALESCE(start_date, cutoff_date) AND ? <= COALESCE(end_date, cutoff_date)"
    )
    .bind(&header.project_id)
    .bind(&header.work_date)
    .bind(&header.work_date)
    .fetch_one(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    if locked_period_count > 0 {
        return Err(format!("Work date {} falls within a locked or closed reporting period.", header.work_date));
    }

    let mut seen_workers = HashSet::new();

    for (idx, line) in lines.iter().enumerate() {
        let line_num = idx + 1;

        if line.regular_hours < 0.0 || line.overtime_hours < 0.0 {
            return Err(format!("Line #{}: Labor hours cannot be negative.", line_num));
        }

        if line.regular_hours + line.overtime_hours <= 0.0 {
            return Err(format!("Line #{}: Total hours must be greater than zero.", line_num));
        }

        if line.regular_hours > 24.0 || line.overtime_hours > 24.0 {
            return Err(format!("Line #{}: Hours exceed 24 in a single shift.", line_num));
        }

        if !seen_workers.insert(&line.resource_id) {
            return Err(format!("Line #{}: Duplicate worker entry {} in this timesheet shift.", line_num, line.resource_id));
        }

        // Validate Resource Master (Labor type and Active status)
        let res_row = sqlx::query("SELECT payload FROM resource_masters WHERE id = ?")
            .bind(&line.resource_id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;

        let res_payload_str: String = match res_row {
            Some(r) => r.try_get("payload").map_err(|e| e.to_string())?,
            None => return Err(format!("Line #{}: Worker resource {} does not exist.", line_num, line.resource_id)),
        };

        let res_payload: Value = serde_json::from_str(&res_payload_str).map_err(|e| e.to_string())?;
        let res_type = s(&res_payload, "resource_type");
        if !res_type.is_empty() && res_type != "Labor" {
            return Err(format!("Line #{}: Resource is of type '{}', must be 'Labor'.", line_num, res_type));
        }
        let res_status = s(&res_payload, "status");
        if res_status == "Inactive" || res_status == "Terminated" {
            return Err(format!("Line #{}: Worker is {} and cannot log timesheet hours.", line_num, res_status));
        }

        // Validate Schedule Activity scope
        let act_row = sqlx::query("SELECT project_id, contract_id FROM schedules WHERE id = ?")
            .bind(&line.schedule_activity_id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;

        match act_row {
            Some(ar) => {
                let act_proj: String = ar.try_get("project_id").unwrap_or_default();
                let act_cont: String = ar.try_get("contract_id").unwrap_or_default();
                if !act_proj.is_empty() && act_proj != header.project_id {
                    return Err(format!("Line #{}: Activity {} belongs to another project.", line_num, line.schedule_activity_id));
                }
                if !act_cont.is_empty() && act_cont != header.contract_id {
                    return Err(format!("Line #{}: Activity {} belongs to another contract.", line_num, line.schedule_activity_id));
                }
            }
            None => return Err(format!("Line #{}: Schedule activity {} not found.", line_num, line.schedule_activity_id)),
        }

        // Validate Control Account scope
        let ca_row = sqlx::query("SELECT project_id, contract_id FROM control_accounts WHERE id = ?")
            .bind(&line.control_account_id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;

        match ca_row {
            Some(cr) => {
                let ca_proj: String = cr.try_get("project_id").unwrap_or_default();
                let ca_cont: String = cr.try_get("contract_id").unwrap_or_default();
                if !ca_proj.is_empty() && ca_proj != header.project_id {
                    return Err(format!("Line #{}: Control account {} belongs to another project.", line_num, line.control_account_id));
                }
                if !ca_cont.is_empty() && ca_cont != header.contract_id {
                    return Err(format!("Line #{}: Control account {} belongs to another contract.", line_num, line.control_account_id));
                }
            }
            None => return Err(format!("Line #{}: Control account {} not found.", line_num, line.control_account_id)),
        }

        // Check duplicate worker across other active timesheets on same work_date and shift
        let dup_count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM labor_timesheet_lines l JOIN labor_timesheets t ON l.timesheet_id = t.id WHERE l.timesheet_id <> ? AND t.work_date = ? AND t.shift = ? AND t.status <> 'Reversed' AND l.resource_id = ?"
        )
        .bind(&header.id)
        .bind(&header.work_date)
        .bind(&header.shift)
        .bind(&line.resource_id)
        .fetch_one(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

        if dup_count > 0 {
            return Err(format!(
                "Line #{}: Worker {} already has logged hours on {} ({}) in another active timesheet.",
                line_num, line.resource_id, header.work_date, header.shift
            ));
        }
    }

    Ok(())
}

pub async fn approve_labor_timesheet(
    path: &Path,
    request: ApproveLaborTimesheetRequest,
) -> Result<LaborTimesheetOperationResult, String> {
    if request.operation_id.trim().is_empty() || request.actor.trim().is_empty() || request.approved_at.trim().is_empty() {
        return Err("Timesheet approval requires operation ID, actor and date.".into());
    }

    let mut tx = db(path).await?.begin().await.map_err(|e| e.to_string())?;
    guard_on(&mut tx, &request.operation_id).await?;

    let result = async {
        let (header, lines) = load_timesheet(&mut tx, &request.timesheet_id).await?;

        if !matches!(header.status.as_str(), "Draft" | "Submitted") {
            return Err(format!("Timesheet {} in status '{}' cannot be approved.", header.timesheet_number, header.status));
        }

        validate_timesheet_rules(&mut tx, &header, &lines).await?;

        let mut total_reg = 0.0;
        let mut total_ot = 0.0;
        let mut total_amt = 0.0;

        for line in &lines {
            total_reg += line.regular_hours;
            total_ot += line.overtime_hours;
            total_amt += (line.regular_hours * line.regular_rate) + (line.overtime_hours * line.overtime_rate);
        }

        let mut payload = header.payload.clone();
        if let Some(obj) = payload.as_object_mut() {
            obj.insert("status".into(), json!("Approved"));
            obj.insert("approved_by".into(), json!(request.actor));
            obj.insert("approved_at".into(), json!(request.approved_at));
            obj.insert("total_regular_hours".into(), json!(m(total_reg)));
            obj.insert("total_overtime_hours".into(), json!(m(total_ot)));
            obj.insert("total_amount".into(), json!(m(total_amt)));
        }

        sqlx::query(
            "UPDATE labor_timesheets SET status = 'Approved', approved_by = ?, approved_at = ?, total_regular_hours = ?, total_overtime_hours = ?, total_amount = ?, payload = ? WHERE id = ?"
        )
        .bind(&request.actor)
        .bind(&request.approved_at)
        .bind(m(total_reg))
        .bind(m(total_ot))
        .bind(m(total_amt))
        .bind(payload.to_string())
        .bind(&request.timesheet_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        Ok(())
    }
    .await;

    match result {
        Ok(()) => {
            guard_off(&mut tx, &request.operation_id).await?;
            tx.commit().await.map_err(|e| e.to_string())?;
            Ok(LaborTimesheetOperationResult {
                operation_id: request.operation_id,
                timesheet_id: request.timesheet_id,
                status: "Approved".into(),
            })
        }
        Err(e) => {
            let _ = tx.rollback().await;
            Err(e)
        }
    }
}

pub async fn post_labor_timesheet(
    path: &Path,
    request: PostLaborTimesheetRequest,
) -> Result<LaborTimesheetOperationResult, String> {
    if request.operation_id.trim().is_empty() || request.actor.trim().is_empty() || request.posted_at.trim().is_empty() {
        return Err("Timesheet posting requires operation ID, actor and date.".into());
    }

    let mut tx = db(path).await?.begin().await.map_err(|e| e.to_string())?;
    guard_on(&mut tx, &request.operation_id).await?;

    let result = async {
        let (header, lines) = load_timesheet(&mut tx, &request.timesheet_id).await?;

        if header.status == "Posted" {
            // Idempotent: already posted
            return Ok(());
        }

        if header.status != "Approved" {
            // If Draft or Submitted, perform validation first
            if matches!(header.status.as_str(), "Draft" | "Submitted") {
                validate_timesheet_rules(&mut tx, &header, &lines).await?;
            } else {
                return Err(format!("Timesheet in status '{}' cannot be posted.", header.status));
            }
        }

        let mut total_reg = 0.0;
        let mut total_ot = 0.0;
        let mut total_amt = 0.0;

        for line in &lines {
            let line_amt = m((line.regular_hours * line.regular_rate) + (line.overtime_hours * line.overtime_rate));
            total_reg += line.regular_hours;
            total_ot += line.overtime_hours;
            total_amt += line_amt;

            let cost_entry_id = format!("labor-timesheet-cost:{}", line.id);
            let description = format!(
                "Labor Timesheet #{}: Worker {} (Reg: {}h, OT: {}h)",
                header.timesheet_number, line.resource_id, line.regular_hours, line.overtime_hours
            );

            let cost_payload = json!({
                "id": cost_entry_id,
                "project_id": header.project_id,
                "contract_id": header.contract_id,
                "control_account_id": line.control_account_id,
                "cost_code_id": line.cost_code_id,
                "schedule_activity_id": line.schedule_activity_id,
                "date": header.work_date,
                "cost_type": "Labor",
                "amount": line_amt,
                "source_type": "LaborTimesheet",
                "source_id": line.id,
                "invoice_number": header.timesheet_number,
                "description": description,
                "resource_id": line.resource_id,
                "created_at": stamp(),
            });

            // Idempotent replace
            sqlx::query(
                "INSERT INTO cost_entries (id, created_at, project_id, contract_id, parent_main_project_id, parent_main_contract_id, boq_header_id, boq_item_id, control_account_id, payload)
                 VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, control_account_id = excluded.control_account_id"
            )
            .bind(&cost_entry_id)
            .bind(stamp())
            .bind(&header.project_id)
            .bind(&header.contract_id)
            .bind(&line.control_account_id)
            .bind(cost_payload.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }

        let mut payload = header.payload.clone();
        if let Some(obj) = payload.as_object_mut() {
            obj.insert("status".into(), json!("Posted"));
            obj.insert("posted_by".into(), json!(request.actor));
            obj.insert("posted_at".into(), json!(request.posted_at));
            obj.insert("total_regular_hours".into(), json!(m(total_reg)));
            obj.insert("total_overtime_hours".into(), json!(m(total_ot)));
            obj.insert("total_amount".into(), json!(m(total_amt)));
        }

        sqlx::query(
            "UPDATE labor_timesheets SET status = 'Posted', posted_by = ?, posted_at = ?, total_regular_hours = ?, total_overtime_hours = ?, total_amount = ?, payload = ? WHERE id = ?"
        )
        .bind(&request.actor)
        .bind(&request.posted_at)
        .bind(m(total_reg))
        .bind(m(total_ot))
        .bind(m(total_amt))
        .bind(payload.to_string())
        .bind(&request.timesheet_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        Ok(())
    }
    .await;

    match result {
        Ok(()) => {
            guard_off(&mut tx, &request.operation_id).await?;
            tx.commit().await.map_err(|e| e.to_string())?;
            Ok(LaborTimesheetOperationResult {
                operation_id: request.operation_id,
                timesheet_id: request.timesheet_id,
                status: "Posted".into(),
            })
        }
        Err(e) => {
            let _ = tx.rollback().await;
            Err(e)
        }
    }
}

pub async fn reverse_labor_timesheet(
    path: &Path,
    request: ReverseLaborTimesheetRequest,
) -> Result<LaborTimesheetOperationResult, String> {
    if request.operation_id.trim().is_empty()
        || request.actor.trim().is_empty()
        || request.reason.trim().is_empty()
        || request.reversed_at.trim().is_empty()
    {
        return Err("Timesheet reversal requires operation ID, actor, reason and date.".into());
    }

    let mut tx = db(path).await?.begin().await.map_err(|e| e.to_string())?;
    guard_on(&mut tx, &request.operation_id).await?;

    let result = async {
        let (header, lines) = load_timesheet(&mut tx, &request.timesheet_id).await?;

        if header.status != "Posted" {
            return Err(format!("Only a Posted timesheet can be reversed (current status: '{}').", header.status));
        }

        // Post offsetting negative cost entries for each line
        for line in &lines {
            let line_amt = m((line.regular_hours * line.regular_rate) + (line.overtime_hours * line.overtime_rate));
            let reversal_cost_id = format!("labor-timesheet-reversal:{}", line.id);
            let description = format!(
                "Reversal of Labor Timesheet #{}: Worker {} - Reason: {}",
                header.timesheet_number, line.resource_id, request.reason
            );

            let reversal_payload = json!({
                "id": reversal_cost_id,
                "project_id": header.project_id,
                "contract_id": header.contract_id,
                "control_account_id": line.control_account_id,
                "cost_code_id": line.cost_code_id,
                "schedule_activity_id": line.schedule_activity_id,
                "date": header.work_date,
                "cost_type": "Labor",
                "amount": -line_amt,
                "source_type": "LaborTimesheet",
                "source_id": format!("reversal:{}", line.id),
                "original_cost_entry_id": format!("labor-timesheet-cost:{}", line.id),
                "invoice_number": header.timesheet_number,
                "description": description,
                "resource_id": line.resource_id,
                "reversal_reason": request.reason,
                "reversed_by": request.actor,
                "reversed_at": request.reversed_at,
                "created_at": stamp(),
            });

            sqlx::query(
                "INSERT INTO cost_entries (id, created_at, project_id, contract_id, parent_main_project_id, parent_main_contract_id, boq_header_id, boq_item_id, control_account_id, payload)
                 VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, control_account_id = excluded.control_account_id"
            )
            .bind(&reversal_cost_id)
            .bind(stamp())
            .bind(&header.project_id)
            .bind(&header.contract_id)
            .bind(&line.control_account_id)
            .bind(reversal_payload.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }

        let mut payload = header.payload.clone();
        if let Some(obj) = payload.as_object_mut() {
            obj.insert("status".into(), json!("Reversed"));
            obj.insert("reversed_by".into(), json!(request.actor));
            obj.insert("reversed_at".into(), json!(request.reversed_at));
            obj.insert("reversal_reason".into(), json!(request.reason));
        }

        sqlx::query(
            "UPDATE labor_timesheets SET status = 'Reversed', reversed_by = ?, reversed_at = ?, reversal_reason = ?, payload = ? WHERE id = ?"
        )
        .bind(&request.actor)
        .bind(&request.reversed_at)
        .bind(&request.reason)
        .bind(payload.to_string())
        .bind(&request.timesheet_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        Ok(())
    }
    .await;

    match result {
        Ok(()) => {
            guard_off(&mut tx, &request.operation_id).await?;
            tx.commit().await.map_err(|e| e.to_string())?;
            Ok(LaborTimesheetOperationResult {
                operation_id: request.operation_id,
                timesheet_id: request.timesheet_id,
                status: "Reversed".into(),
            })
        }
        Err(e) => {
            let _ = tx.rollback().await;
            Err(e)
        }
    }
}

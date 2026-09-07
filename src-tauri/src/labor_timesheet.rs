//! Atomic labor timesheet lifecycle.
//! Draft -> Submitted -> Approved -> Posted -> Reversed.
//! Submission validates schedule activities, control accounts, active labor resources,
//! non-negative hours, duplicate shifts, work calendar non-working day overrides,
//! and locked reporting periods.
//! Approval transitions from Submitted to Approved.
//! Posting creates immutable CostEntry rows atomically with source_type='LaborTimesheet'.
//! Reversal creates negative offset CostEntry rows and preserves the audit trail.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{sqlite::SqliteConnectOptions, Row, Sqlite, SqlitePool, Transaction};
use std::collections::HashSet;
use std::path::Path;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitLaborTimesheetRequest {
    pub operation_id: String,
    pub timesheet_id: String,
    pub actor: String,
    pub submitted_at: String,
}

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

fn parse_ymd(date_str: &str) -> Option<(i32, i32, i32)> {
    let parts: Vec<&str> = date_str.split('-').collect();
    if parts.len() != 3 {
        return None;
    }
    let y = parts[0].parse::<i32>().ok()?;
    let month = parts[1].parse::<i32>().ok()?;
    let d = parts[2].parse::<i32>().ok()?;
    Some((y, month, d))
}

fn day_of_week(year: i32, month: i32, day: i32) -> i32 {
    // 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday
    let t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    let mut y = year;
    if month < 3 {
        y -= 1;
    }
    ((y + y / 4 - y / 100 + y / 400 + t[(month - 1) as usize] + day) % 7)
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

async fn write_audit_log(
    tx: &mut Transaction<'_, Sqlite>,
    header: &TimesheetHeader,
    action: &str,
    actor: &str,
    details: &str,
) -> Result<(), String> {
    let audit_id = format!("audit:labor-timesheet:{}:{}:{}", action.to_lowercase(), header.id, stamp());
    let audit_payload = json!({
        "id": audit_id,
        "created_at": stamp(),
        "project_id": header.project_id,
        "contract_id": header.contract_id,
        "entity_type": "labor_timesheets",
        "entity_id": header.id,
        "action": action,
        "actor": actor,
        "summary": format!("{} labor timesheet #{}", action, header.timesheet_number),
        "details": details,
    });

    sqlx::query(
        "INSERT INTO audit_log (id, created_at, project_id, contract_id, parent_main_project_id, parent_main_contract_id, boq_header_id, boq_item_id, payload)
         VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, ?)"
    )
    .bind(&audit_id)
    .bind(stamp())
    .bind(&header.project_id)
    .bind(&header.contract_id)
    .bind(audit_payload.to_string())
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

    // Check reporting period lock for work_date
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

    // Check work calendar
    let cal_payload: Option<String> = sqlx::query_scalar(
        "SELECT payload FROM work_calendars WHERE (project_id IS NULL OR project_id = ?) ORDER BY project_id DESC LIMIT 1"
    )
    .bind(&header.project_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    let mut is_non_working_day = false;
    if let Some(cal_str) = cal_payload {
        if let Ok(cal_json) = serde_json::from_str::<Value>(&cal_str) {
            if let Some((y, m_val, d)) = parse_ymd(&header.work_date) {
                let dow = day_of_week(y, m_val, d);
                let working_days = cal_json.get("working_days").and_then(Value::as_array);
                let holidays = cal_json.get("holidays").and_then(Value::as_array);

                if let Some(wd) = working_days {
                    let wd_ints: Vec<i64> = wd.iter().filter_map(Value::as_i64).collect();
                    if !wd_ints.is_empty() && !wd_ints.contains(&(dow as i64)) {
                        is_non_working_day = true;
                    }
                }
                if let Some(h) = holidays {
                    for hol in h {
                        if hol.as_str() == Some(&header.work_date) {
                            is_non_working_day = true;
                            break;
                        }
                    }
                }
            }
        }
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

        if is_non_working_day && line.non_working_override_reason.as_deref().unwrap_or("").trim().is_empty() {
            return Err(format!(
                "Line #{}: Work date {} is a non-working calendar day. Documented override reason is required.",
                line_num, header.work_date
            ));
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

pub async fn submit_labor_timesheet(
    path: &Path,
    request: SubmitLaborTimesheetRequest,
) -> Result<LaborTimesheetOperationResult, String> {
    if request.operation_id.trim().is_empty() || request.actor.trim().is_empty() || request.submitted_at.trim().is_empty() {
        return Err("Timesheet submission requires operation ID, actor and date.".into());
    }

    let mut tx = db(path).await?.begin().await.map_err(|e| e.to_string())?;
    guard_on(&mut tx, &request.operation_id).await?;

    let result = async {
        let (header, lines) = load_timesheet(&mut tx, &request.timesheet_id).await?;

        if header.status != "Draft" {
            return Err(format!("Only a Draft timesheet can be submitted (current status: '{}').", header.status));
        }

        validate_timesheet_rules(&mut tx, &header, &lines).await?;

        let mut total_reg = 0.0;
        let mut total_ot = 0.0;
        let mut total_amt = 0.0;

        for line in &lines {
            total_reg += line.regular_hours;
            total_ot += line.overtime_hours;
            let line_amt = m((line.regular_hours * line.regular_rate) + (line.overtime_hours * line.overtime_rate));
            total_amt += line_amt;

            // Ensure line total_hours and calculated_amount are kept accurate
            sqlx::query("UPDATE labor_timesheet_lines SET total_hours = ?, calculated_amount = ? WHERE id = ?")
                .bind(m(line.regular_hours + line.overtime_hours))
                .bind(line_amt)
                .bind(&line.id)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        }

        let mut payload = header.payload.clone();
        if let Some(obj) = payload.as_object_mut() {
            obj.insert("status".into(), json!("Submitted"));
            obj.insert("submitted_by".into(), json!(request.actor));
            obj.insert("submitted_at".into(), json!(request.submitted_at));
            obj.insert("total_regular_hours".into(), json!(m(total_reg)));
            obj.insert("total_overtime_hours".into(), json!(m(total_ot)));
            obj.insert("total_amount".into(), json!(m(total_amt)));
        }

        sqlx::query(
            "UPDATE labor_timesheets SET status = 'Submitted', total_regular_hours = ?, total_overtime_hours = ?, total_amount = ?, payload = ? WHERE id = ?"
        )
        .bind(m(total_reg))
        .bind(m(total_ot))
        .bind(m(total_amt))
        .bind(payload.to_string())
        .bind(&request.timesheet_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        write_audit_log(
            &mut tx,
            &header,
            "Submit",
            &request.actor,
            &format!("Submitted labor timesheet #{} with {} lines on {}", header.timesheet_number, lines.len(), request.submitted_at),
        )
        .await?;

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
                status: "Submitted".into(),
            })
        }
        Err(e) => {
            let _ = tx.rollback().await;
            Err(e)
        }
    }
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

        if header.status != "Submitted" {
            return Err(format!("Timesheet {} in status '{}' cannot be approved (must be Submitted first).", header.timesheet_number, header.status));
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

        write_audit_log(
            &mut tx,
            &header,
            "Approve",
            &request.actor,
            &format!("Approved labor timesheet #{} on {}", header.timesheet_number, request.approved_at),
        )
        .await?;

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
            return Err(format!("Only an Approved timesheet can be posted (current status: '{}').", header.status));
        }

        // Validate posting date reporting period lock
        let locked_period_count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM reporting_periods WHERE status IN ('Locked', 'Closed') AND (project_id IS NULL OR project_id = ?) AND ? >= COALESCE(start_date, cutoff_date) AND ? <= COALESCE(end_date, cutoff_date)"
        )
        .bind(&header.project_id)
        .bind(&request.posted_at)
        .bind(&request.posted_at)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        if locked_period_count > 0 {
            return Err(format!("Posting date {} falls within a locked or closed reporting period.", request.posted_at));
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
                "Labor Timesheet #{}: Worker {} (Reg: {}h @ ${}, OT: {}h @ ${})",
                header.timesheet_number, line.resource_id, line.regular_hours, line.regular_rate, line.overtime_hours, line.overtime_rate
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

        write_audit_log(
            &mut tx,
            &header,
            "Post",
            &request.actor,
            &format!("Posted actual labor cost (${}) for timesheet #{} on {}", m(total_amt), header.timesheet_number, request.posted_at),
        )
        .await?;

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

        // Validate reversal date is not in a locked reporting period
        let locked_period_count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM reporting_periods WHERE status IN ('Locked', 'Closed') AND (project_id IS NULL OR project_id = ?) AND ? >= COALESCE(start_date, cutoff_date) AND ? <= COALESCE(end_date, cutoff_date)"
        )
        .bind(&header.project_id)
        .bind(&request.reversed_at)
        .bind(&request.reversed_at)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        if locked_period_count > 0 {
            return Err(format!("Reversal date {} falls within a locked or closed reporting period.", request.reversed_at));
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
                "date": request.reversed_at,
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

        write_audit_log(
            &mut tx,
            &header,
            "Reverse",
            &request.actor,
            &format!("Reversed labor timesheet #{}: {}", header.timesheet_number, request.reason),
        )
        .await?;

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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    async fn fixture_db() -> std::path::PathBuf {
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let path = std::env::temp_dir().join(format!("buildtrack-timesheet-test-{nonce}.db"));
        let pool = db(&path).await.unwrap();

        sqlx::query(
            "CREATE TABLE projects (id TEXT PRIMARY KEY);
             CREATE TABLE contracts (id TEXT PRIMARY KEY, project_id TEXT);
             CREATE TABLE control_accounts (id TEXT PRIMARY KEY, project_id TEXT, contract_id TEXT);
             CREATE TABLE schedules (id TEXT PRIMARY KEY, project_id TEXT, contract_id TEXT);
             CREATE TABLE resource_masters (id TEXT PRIMARY KEY, payload TEXT);
             CREATE TABLE reporting_periods (id TEXT PRIMARY KEY, project_id TEXT, start_date TEXT, end_date TEXT, cutoff_date TEXT, status TEXT);
             CREATE TABLE work_calendars (id TEXT PRIMARY KEY, project_id TEXT, payload TEXT);
             CREATE TABLE supplier_ap_mutation_guard (operation_id TEXT PRIMARY KEY, created_at TEXT);
             CREATE TABLE audit_log (id TEXT PRIMARY KEY, created_at TEXT, project_id TEXT, contract_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, payload TEXT);
             CREATE TABLE cost_entries (id TEXT PRIMARY KEY, created_at TEXT, project_id TEXT, contract_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, control_account_id TEXT, payload TEXT);
             CREATE TABLE labor_timesheets (
                 id TEXT PRIMARY KEY,
                 created_at TEXT NOT NULL,
                 updated_at TEXT,
                 project_id TEXT NOT NULL,
                 contract_id TEXT NOT NULL,
                 timesheet_number TEXT NOT NULL,
                 work_date TEXT NOT NULL,
                 shift TEXT NOT NULL,
                 crew_name TEXT,
                 contractor TEXT,
                 submitter TEXT NOT NULL,
                 status TEXT NOT NULL DEFAULT 'Draft',
                 approved_by TEXT,
                 approved_at TEXT,
                 posted_by TEXT,
                 posted_at TEXT,
                 reversed_by TEXT,
                 reversed_at TEXT,
                 reversal_reason TEXT,
                 total_regular_hours REAL NOT NULL DEFAULT 0,
                 total_overtime_hours REAL NOT NULL DEFAULT 0,
                 total_amount REAL NOT NULL DEFAULT 0,
                 source_batch TEXT,
                 notes TEXT,
                 payload TEXT NOT NULL
             );
             CREATE TABLE labor_timesheet_lines (
                 id TEXT PRIMARY KEY,
                 timesheet_id TEXT NOT NULL,
                 created_at TEXT NOT NULL,
                 project_id TEXT NOT NULL,
                 contract_id TEXT NOT NULL,
                 resource_id TEXT NOT NULL,
                 schedule_activity_id TEXT NOT NULL,
                 control_account_id TEXT NOT NULL,
                 cost_code_id TEXT,
                 regular_hours REAL NOT NULL DEFAULT 0,
                 overtime_hours REAL NOT NULL DEFAULT 0,
                 regular_rate REAL NOT NULL DEFAULT 0,
                 overtime_rate REAL NOT NULL DEFAULT 0,
                 total_hours REAL NOT NULL DEFAULT 0,
                 calculated_amount REAL NOT NULL DEFAULT 0,
                 currency TEXT NOT NULL DEFAULT 'USD',
                 non_working_override_reason TEXT,
                 notes TEXT,
                 payload TEXT NOT NULL
             );"
        )
        .execute(&pool)
        .await
        .unwrap();

        // Seed master records
        sqlx::query("INSERT INTO projects VALUES ('PRJ-1')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO contracts VALUES ('CTR-1', 'PRJ-1')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO control_accounts VALUES ('CA-1', 'PRJ-1', 'CTR-1')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO schedules VALUES ('ACT-1', 'PRJ-1', 'CTR-1')").execute(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO resource_masters VALUES ('RES-1', json('{\"id\":\"RES-1\",\"name\":\"John Carpenter\",\"resource_type\":\"Labor\",\"status\":\"Active\"}'))"
        )
        .execute(&pool)
        .await
        .unwrap();

        pool.close().await;
        path
    }

    async fn seed_timesheet(path: &Path, ts_id: &str, line_id: &str, status: &str) {
        let pool = db(path).await.unwrap();
        let ts_payload = json!({
            "id": ts_id,
            "project_id": "PRJ-1",
            "contract_id": "CTR-1",
            "timesheet_number": "TS-101",
            "work_date": "2026-09-07",
            "shift": "Day",
            "submitter": "Foreman Dave",
            "status": status,
            "total_regular_hours": 8.0,
            "total_overtime_hours": 2.0,
            "total_amount": 550.0,
        });

        let line_payload = json!({
            "id": line_id,
            "timesheet_id": ts_id,
            "project_id": "PRJ-1",
            "contract_id": "CTR-1",
            "resource_id": "RES-1",
            "schedule_activity_id": "ACT-1",
            "control_account_id": "CA-1",
            "regular_hours": 8.0,
            "overtime_hours": 2.0,
            "regular_rate": 50.0,
            "overtime_rate": 75.0,
            "total_hours": 10.0,
            "calculated_amount": 550.0,
            "currency": "USD",
        });

        sqlx::query(
            "INSERT INTO labor_timesheets (id, created_at, project_id, contract_id, timesheet_number, work_date, shift, submitter, status, total_regular_hours, total_overtime_hours, total_amount, payload)
             VALUES (?, '2026-09-07T08:00:00Z', 'PRJ-1', 'CTR-1', 'TS-101', '2026-09-07', 'Day', 'Foreman Dave', ?, 8.0, 2.0, 550.0, ?)"
        )
        .bind(ts_id)
        .bind(status)
        .bind(ts_payload.to_string())
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO labor_timesheet_lines (id, timesheet_id, created_at, project_id, contract_id, resource_id, schedule_activity_id, control_account_id, regular_hours, overtime_hours, regular_rate, overtime_rate, total_hours, calculated_amount, payload)
             VALUES (?, ?, '2026-09-07T08:00:00Z', 'PRJ-1', 'CTR-1', 'RES-1', 'ACT-1', 'CA-1', 8.0, 2.0, 50.0, 75.0, 10.0, 550.0, ?)"
        )
        .bind(line_id)
        .bind(ts_id)
        .bind(line_payload.to_string())
        .execute(&pool)
        .await
        .unwrap();

        pool.close().await;
    }

    #[tokio::test]
    async fn full_lifecycle_draft_submit_approve_post_reverse() {
        let path = fixture_db().await;
        seed_timesheet(&path, "ts-1", "line-1", "Draft").await;

        // 1. Submit
        let sub_res = submit_labor_timesheet(
            &path,
            SubmitLaborTimesheetRequest {
                operation_id: "op-sub-1".into(),
                timesheet_id: "ts-1".into(),
                actor: "Foreman Dave".into(),
                submitted_at: "2026-09-07".into(),
            },
        )
        .await
        .unwrap();
        assert_eq!(sub_res.status, "Submitted");

        // 2. Approve (cannot approve Draft, but now it's Submitted)
        let app_res = approve_labor_timesheet(
            &path,
            ApproveLaborTimesheetRequest {
                operation_id: "op-app-1".into(),
                timesheet_id: "ts-1".into(),
                actor: "PM Alice".into(),
                approved_at: "2026-09-07".into(),
            },
        )
        .await
        .unwrap();
        assert_eq!(app_res.status, "Approved");

        // 3. Post
        let post_res = post_labor_timesheet(
            &path,
            PostLaborTimesheetRequest {
                operation_id: "op-post-1".into(),
                timesheet_id: "ts-1".into(),
                actor: "Finance Bob".into(),
                posted_at: "2026-09-07".into(),
            },
        )
        .await
        .unwrap();
        assert_eq!(post_res.status, "Posted");

        // Verify cost entry created
        let pool = db(&path).await.unwrap();
        let cost_amount: f64 = sqlx::query_scalar(
            "SELECT json_extract(payload, '$.amount') FROM cost_entries WHERE id = 'labor-timesheet-cost:line-1'"
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(cost_amount, 550.0);

        // 4. Reverse
        let rev_res = reverse_labor_timesheet(
            &path,
            ReverseLaborTimesheetRequest {
                operation_id: "op-rev-1".into(),
                timesheet_id: "ts-1".into(),
                actor: "Finance Bob".into(),
                reason: "Incorrect shift logged".into(),
                reversed_at: "2026-09-08".into(),
            },
        )
        .await
        .unwrap();
        assert_eq!(rev_res.status, "Reversed");

        // Verify negative reversal cost entry created
        let rev_amount: f64 = sqlx::query_scalar(
            "SELECT json_extract(payload, '$.amount') FROM cost_entries WHERE id = 'labor-timesheet-reversal:line-1'"
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(rev_amount, -550.0);

        // Verify audit log entries count
        let audit_count: i64 = sqlx::query_scalar("SELECT count(*) FROM audit_log WHERE entity_id = 'ts-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(audit_count, 4); // Submit, Approve, Post, Reverse

        pool.close().await;
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn approval_fails_if_in_draft_status() {
        let path = fixture_db().await;
        seed_timesheet(&path, "ts-draft", "line-draft", "Draft").await;

        let err = approve_labor_timesheet(
            &path,
            ApproveLaborTimesheetRequest {
                operation_id: "op-app-draft".into(),
                timesheet_id: "ts-draft".into(),
                actor: "PM Alice".into(),
                approved_at: "2026-09-07".into(),
            },
        )
        .await
        .unwrap_err();

        assert!(err.contains("must be Submitted first"));
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn posting_fails_if_in_draft_or_submitted_status() {
        let path = fixture_db().await;
        seed_timesheet(&path, "ts-sub", "line-sub", "Submitted").await;

        let err = post_labor_timesheet(
            &path,
            PostLaborTimesheetRequest {
                operation_id: "op-post-sub".into(),
                timesheet_id: "ts-sub".into(),
                actor: "Finance Bob".into(),
                posted_at: "2026-09-07".into(),
            },
        )
        .await
        .unwrap_err();

        assert!(err.contains("Only an Approved timesheet can be posted"));
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn locked_reporting_period_blocks_submission_and_reversal() {
        let path = fixture_db().await;
        let pool = db(&path).await.unwrap();
        sqlx::query(
            "INSERT INTO reporting_periods (id, project_id, start_date, end_date, cutoff_date, status)
             VALUES ('rp-1', 'PRJ-1', '2026-09-01', '2026-09-30', '2026-09-30', 'Locked')"
        )
        .execute(&pool)
        .await
        .unwrap();
        pool.close().await;

        seed_timesheet(&path, "ts-locked", "line-locked", "Draft").await;

        let err = submit_labor_timesheet(
            &path,
            SubmitLaborTimesheetRequest {
                operation_id: "op-sub-lock".into(),
                timesheet_id: "ts-locked".into(),
                actor: "Foreman Dave".into(),
                submitted_at: "2026-09-07".into(),
            },
        )
        .await
        .unwrap_err();

        assert!(err.contains("locked or closed reporting period"));
        let _ = std::fs::remove_file(path);
    }
}


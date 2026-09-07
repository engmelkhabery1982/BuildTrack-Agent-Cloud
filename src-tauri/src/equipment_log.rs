//! Atomic equipment log, meter, hours & fuel posting lifecycle.
//! Draft -> Submitted -> Approved -> Posted -> Reversed.
//! Approval validates schedule activities, control accounts, active equipment resources,
//! non-negative hours/rates, meter rollback (meter_end >= meter_start), shift capacity <= 24h,
//! meter reading overlap for the same equipment, and locked reporting periods.
//! Posting creates immutable CostEntry rows atomically with source_type='EquipmentUsage' and 'EquipmentFuel'.
//! Reversal creates negative offset CostEntry rows without deleting the original audit trail.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{sqlite::SqliteConnectOptions, Row, Sqlite, SqlitePool, Transaction};
use std::path::Path;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveEquipmentLogRequest {
    pub operation_id: String,
    pub log_id: String,
    pub actor: String,
    pub approved_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostEquipmentLogRequest {
    pub operation_id: String,
    pub log_id: String,
    pub actor: String,
    pub posted_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReverseEquipmentLogRequest {
    pub operation_id: String,
    pub log_id: String,
    pub actor: String,
    pub reason: String,
    pub reversed_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EquipmentLogOperationResult {
    pub operation_id: String,
    pub log_id: String,
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

pub struct EquipmentLogHeader {
    pub id: String,
    pub project_id: String,
    pub contract_id: String,
    pub log_number: String,
    pub log_date: String,
    pub shift: String,
    pub resource_id: String,
    pub schedule_activity_id: String,
    pub control_account_id: String,
    pub cost_code_id: Option<String>,
    pub operator_name: Option<String>,
    pub meter_start: f64,
    pub meter_end: f64,
    pub meter_hours: f64,
    pub operating_hours: f64,
    pub idle_hours: f64,
    pub breakdown_hours: f64,
    pub total_hours: f64,
    pub hours_override_reason: Option<String>,
    pub hourly_rate: f64,
    pub equipment_cost: f64,
    pub fuel_quantity: f64,
    pub fuel_rate: f64,
    pub fuel_cost: f64,
    pub total_cost: f64,
    pub status: String,
    pub payload: Value,
}

async fn load_equipment_log(tx: &mut Transaction<'_, Sqlite>, id: &str) -> Result<EquipmentLogHeader, String> {
    let r = sqlx::query(
        "SELECT id, project_id, contract_id, log_number, log_date, shift, resource_id, schedule_activity_id, control_account_id, cost_code_id, operator_name, meter_start, meter_end, meter_hours, operating_hours, idle_hours, breakdown_hours, total_hours, hours_override_reason, hourly_rate, equipment_cost, fuel_quantity, fuel_rate, fuel_cost, total_cost, status, payload FROM equipment_logs WHERE id = ?"
    )
    .bind(id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Equipment log {} was not found.", id))?;

    let payload_str: String = r.try_get("payload").map_err(|e| e.to_string())?;
    let payload: Value = serde_json::from_str(&payload_str).map_err(|e| e.to_string())?;

    Ok(EquipmentLogHeader {
        id: r.try_get("id").map_err(|e| e.to_string())?,
        project_id: r.try_get("project_id").map_err(|e| e.to_string())?,
        contract_id: r.try_get("contract_id").map_err(|e| e.to_string())?,
        log_number: r.try_get("log_number").map_err(|e| e.to_string())?,
        log_date: r.try_get("log_date").map_err(|e| e.to_string())?,
        shift: r.try_get("shift").map_err(|e| e.to_string())?,
        resource_id: r.try_get("resource_id").map_err(|e| e.to_string())?,
        schedule_activity_id: r.try_get("schedule_activity_id").map_err(|e| e.to_string())?,
        control_account_id: r.try_get("control_account_id").map_err(|e| e.to_string())?,
        cost_code_id: r.try_get("cost_code_id").ok(),
        operator_name: r.try_get("operator_name").ok(),
        meter_start: r.try_get("meter_start").unwrap_or(0.0),
        meter_end: r.try_get("meter_end").unwrap_or(0.0),
        meter_hours: r.try_get("meter_hours").unwrap_or(0.0),
        operating_hours: r.try_get("operating_hours").unwrap_or(0.0),
        idle_hours: r.try_get("idle_hours").unwrap_or(0.0),
        breakdown_hours: r.try_get("breakdown_hours").unwrap_or(0.0),
        total_hours: r.try_get("total_hours").unwrap_or(0.0),
        hours_override_reason: r.try_get("hours_override_reason").ok(),
        hourly_rate: r.try_get("hourly_rate").unwrap_or(0.0),
        equipment_cost: r.try_get("equipment_cost").unwrap_or(0.0),
        fuel_quantity: r.try_get("fuel_quantity").unwrap_or(0.0),
        fuel_rate: r.try_get("fuel_rate").unwrap_or(0.0),
        fuel_cost: r.try_get("fuel_cost").unwrap_or(0.0),
        total_cost: r.try_get("total_cost").unwrap_or(0.0),
        status: r.try_get("status").map_err(|e| e.to_string())?,
        payload,
    })
}

async fn validate_equipment_log_rules(
    tx: &mut Transaction<'_, Sqlite>,
    log: &EquipmentLogHeader,
) -> Result<(), String> {
    // 1. Check project and contract scope
    let contract_valid: Option<String> = sqlx::query_scalar("SELECT id FROM contracts WHERE id = ? AND project_id = ?")
        .bind(&log.contract_id)
        .bind(&log.project_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

    if contract_valid.is_none() {
        return Err("Main contract does not belong to the selected project.".into());
    }

    // 2. Check reporting period lock
    let locked_period_count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM reporting_periods WHERE status IN ('Locked', 'Closed') AND (project_id IS NULL OR project_id = ?) AND ? >= COALESCE(start_date, cutoff_date) AND ? <= COALESCE(end_date, cutoff_date)"
    )
    .bind(&log.project_id)
    .bind(&log.log_date)
    .bind(&log.log_date)
    .fetch_one(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    if locked_period_count > 0 {
        return Err(format!("Log date {} falls within a locked or closed reporting period.", log.log_date));
    }

    // 3. Validate meter readings: meter_end >= meter_start
    if log.meter_end < log.meter_start {
        return Err(format!(
            "Meter rollback detected: End meter ({}) cannot be less than start meter ({}).",
            log.meter_end, log.meter_start
        ));
    }

    let calculated_meter_hours = m(log.meter_end - log.meter_start);
    if log.operating_hours != calculated_meter_hours {
        let reason = log.hours_override_reason.as_deref().unwrap_or("").trim();
        if reason.is_empty() {
            return Err(format!(
                "Operating hours ({}) differs from meter hours ({}); documented hours_override_reason is required.",
                log.operating_hours, calculated_meter_hours
            ));
        }
    }

    // 4. Validate non-negative hours and rates
    if log.operating_hours < 0.0 || log.idle_hours < 0.0 || log.breakdown_hours < 0.0 {
        return Err("Equipment hours cannot be negative.".into());
    }
    if log.hourly_rate < 0.0 || log.fuel_rate < 0.0 || log.fuel_quantity < 0.0 {
        return Err("Equipment rates and fuel quantities cannot be negative.".into());
    }

    let total_h = log.operating_hours + log.idle_hours + log.breakdown_hours;
    if total_h <= 0.0 && log.fuel_quantity <= 0.0 {
        return Err("Equipment log must record either working/standby hours or fuel consumption.".into());
    }
    if total_h > 24.0 {
        return Err(format!("Total hours ({}) cannot exceed 24 hours in a single shift.", total_h));
    }

    // 5. Validate Resource Master (Equipment type and Active status)
    let res_row = sqlx::query("SELECT payload FROM resource_masters WHERE id = ?")
        .bind(&log.resource_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

    let res_payload_str: String = match res_row {
        Some(r) => r.try_get("payload").map_err(|e| e.to_string())?,
        None => return Err(format!("Equipment resource {} does not exist in Resource Master.", log.resource_id)),
    };

    let res_payload: Value = serde_json::from_str(&res_payload_str).map_err(|e| e.to_string())?;
    let res_type = s(&res_payload, "resource_type");
    if !res_type.is_empty() && res_type != "Equipment" {
        return Err(format!("Resource {} is of type '{}', must be 'Equipment'.", log.resource_id, res_type));
    }
    let res_status = s(&res_payload, "status");
    if res_status == "Inactive" || res_status == "Decommissioned" {
        return Err(format!("Equipment {} is {} and cannot log operational hours.", log.resource_id, res_status));
    }

    // 6. Validate Schedule Activity scope
    let act_row = sqlx::query("SELECT project_id, contract_id FROM schedules WHERE id = ?")
        .bind(&log.schedule_activity_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

    match act_row {
        Some(ar) => {
            let act_proj: String = ar.try_get("project_id").unwrap_or_default();
            let act_cont: String = ar.try_get("contract_id").unwrap_or_default();
            if !act_proj.is_empty() && act_proj != log.project_id {
                return Err(format!("Activity {} belongs to another project.", log.schedule_activity_id));
            }
            if !act_cont.is_empty() && act_cont != log.contract_id {
                return Err(format!("Activity {} belongs to another contract.", log.schedule_activity_id));
            }
        }
        None => return Err(format!("Schedule activity {} not found.", log.schedule_activity_id)),
    }

    // 7. Validate Control Account scope
    let ca_row = sqlx::query("SELECT project_id, contract_id FROM control_accounts WHERE id = ?")
        .bind(&log.control_account_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

    match ca_row {
        Some(cr) => {
            let ca_proj: String = cr.try_get("project_id").unwrap_or_default();
            let ca_cont: String = cr.try_get("contract_id").unwrap_or_default();
            if !ca_proj.is_empty() && ca_proj != log.project_id {
                return Err(format!("Control account {} belongs to another project.", log.control_account_id));
            }
            if !ca_cont.is_empty() && ca_cont != log.contract_id {
                return Err(format!("Control account {} belongs to another contract.", log.control_account_id));
            }
        }
        None => return Err(format!("Control account {} not found.", log.control_account_id)),
    }

    // 8. Validate Meter Overlap across other active equipment logs for the same equipment on the same date/shift
    if log.meter_end > log.meter_start {
        let overlap_count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM equipment_logs WHERE id <> ? AND resource_id = ? AND log_date = ? AND shift = ? AND status <> 'Reversed' AND meter_start < ? AND meter_end > ?"
        )
        .bind(&log.id)
        .bind(&log.resource_id)
        .bind(&log.log_date)
        .bind(&log.shift)
        .bind(log.meter_end)
        .bind(log.meter_start)
        .fetch_one(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

        if overlap_count > 0 {
            return Err(format!(
                "Meter readings ({} - {}) overlap with another active log for equipment {} on {} ({}).",
                log.meter_start, log.meter_end, log.resource_id, log.log_date, log.shift
            ));
        }
    }

    Ok(())
}

pub async fn approve_equipment_log(
    path: &Path,
    request: ApproveEquipmentLogRequest,
) -> Result<EquipmentLogOperationResult, String> {
    if request.operation_id.trim().is_empty() || request.actor.trim().is_empty() || request.approved_at.trim().is_empty() {
        return Err("Equipment log approval requires operation ID, actor and date.".into());
    }

    let mut tx = db(path).await?.begin().await.map_err(|e| e.to_string())?;
    guard_on(&mut tx, &request.operation_id).await?;

    let result = async {
        let log = load_equipment_log(&mut tx, &request.log_id).await?;

        if !matches!(log.status.as_str(), "Draft" | "Submitted") {
            return Err(format!("Equipment log {} in status '{}' cannot be approved.", log.log_number, log.status));
        }

        validate_equipment_log_rules(&mut tx, &log).await?;

        let meter_hours = m(log.meter_end - log.meter_start);
        let total_hours = m(log.operating_hours + log.idle_hours + log.breakdown_hours);
        let equipment_cost = m(log.operating_hours * log.hourly_rate);
        let fuel_cost = m(log.fuel_quantity * log.fuel_rate);
        let total_cost = m(equipment_cost + fuel_cost);

        let mut payload = log.payload.clone();
        if let Some(obj) = payload.as_object_mut() {
            obj.insert("status".into(), json!("Approved"));
            obj.insert("approved_by".into(), json!(request.actor));
            obj.insert("approved_at".into(), json!(request.approved_at));
            obj.insert("meter_hours".into(), json!(meter_hours));
            obj.insert("total_hours".into(), json!(total_hours));
            obj.insert("equipment_cost".into(), json!(equipment_cost));
            obj.insert("fuel_cost".into(), json!(fuel_cost));
            obj.insert("total_cost".into(), json!(total_cost));
        }

        sqlx::query(
            "UPDATE equipment_logs SET status = 'Approved', approved_by = ?, approved_at = ?, meter_hours = ?, total_hours = ?, equipment_cost = ?, fuel_cost = ?, total_cost = ?, payload = ? WHERE id = ?"
        )
        .bind(&request.actor)
        .bind(&request.approved_at)
        .bind(meter_hours)
        .bind(total_hours)
        .bind(equipment_cost)
        .bind(fuel_cost)
        .bind(total_cost)
        .bind(payload.to_string())
        .bind(&request.log_id)
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
            Ok(EquipmentLogOperationResult {
                operation_id: request.operation_id,
                log_id: request.log_id,
                status: "Approved".into(),
            })
        }
        Err(e) => {
            let _ = tx.rollback().await;
            Err(e)
        }
    }
}

pub async fn post_equipment_log(
    path: &Path,
    request: PostEquipmentLogRequest,
) -> Result<EquipmentLogOperationResult, String> {
    if request.operation_id.trim().is_empty() || request.actor.trim().is_empty() || request.posted_at.trim().is_empty() {
        return Err("Equipment log posting requires operation ID, actor and date.".into());
    }

    let mut tx = db(path).await?.begin().await.map_err(|e| e.to_string())?;
    guard_on(&mut tx, &request.operation_id).await?;

    let result = async {
        let log = load_equipment_log(&mut tx, &request.log_id).await?;

        if log.status == "Posted" {
            // Idempotent: already posted
            return Ok(());
        }

        if log.status != "Approved" {
            if matches!(log.status.as_str(), "Draft" | "Submitted") {
                validate_equipment_log_rules(&mut tx, &log).await?;
            } else {
                return Err(format!("Equipment log in status '{}' cannot be posted.", log.status));
            }
        }

        let meter_hours = m(log.meter_end - log.meter_start);
        let total_hours = m(log.operating_hours + log.idle_hours + log.breakdown_hours);
        let equipment_cost = m(log.operating_hours * log.hourly_rate);
        let fuel_cost = m(log.fuel_quantity * log.fuel_rate);
        let total_cost = m(equipment_cost + fuel_cost);

        // 1. Post Equipment Usage Cost Entry if operating hours & rate > 0
        if log.operating_hours > 0.0 && equipment_cost > 0.0 {
            let cost_entry_id = format!("equipment-log-cost:{}", log.id);
            let description = format!(
                "Equipment Log #{}: {} ({}h @ {})",
                log.log_number, log.resource_id, log.operating_hours, log.hourly_rate
            );

            let cost_payload = json!({
                "id": cost_entry_id,
                "project_id": log.project_id,
                "contract_id": log.contract_id,
                "control_account_id": log.control_account_id,
                "cost_code_id": log.cost_code_id,
                "schedule_activity_id": log.schedule_activity_id,
                "date": log.log_date,
                "cost_type": "Equipment",
                "amount": equipment_cost,
                "source_type": "EquipmentUsage",
                "source_id": log.id,
                "invoice_number": log.log_number,
                "description": description,
                "created_at": request.posted_at,
            });

            sqlx::query(
                "INSERT OR REPLACE INTO cost_entries (id, created_at, project_id, contract_id, control_account_id, payload) VALUES (?, ?, ?, ?, ?, ?)"
            )
            .bind(&cost_entry_id)
            .bind(&request.posted_at)
            .bind(&log.project_id)
            .bind(&log.contract_id)
            .bind(&log.control_account_id)
            .bind(cost_payload.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }

        // 2. Post Fuel Cost Entry if fuel quantity & rate > 0
        if log.fuel_quantity > 0.0 && fuel_cost > 0.0 {
            let fuel_cost_entry_id = format!("equipment-fuel-cost:{}", log.id);
            let fuel_description = format!(
                "Equipment Fuel #{}: {} ({} units @ {})",
                log.log_number, log.resource_id, log.fuel_quantity, log.fuel_rate
            );

            let fuel_cost_payload = json!({
                "id": fuel_cost_entry_id,
                "project_id": log.project_id,
                "contract_id": log.contract_id,
                "control_account_id": log.control_account_id,
                "cost_code_id": log.cost_code_id,
                "schedule_activity_id": log.schedule_activity_id,
                "date": log.log_date,
                "cost_type": "Equipment",
                "amount": fuel_cost,
                "source_type": "EquipmentFuel",
                "source_id": log.id,
                "invoice_number": log.log_number,
                "description": fuel_description,
                "created_at": request.posted_at,
            });

            sqlx::query(
                "INSERT OR REPLACE INTO cost_entries (id, created_at, project_id, contract_id, control_account_id, payload) VALUES (?, ?, ?, ?, ?, ?)"
            )
            .bind(&fuel_cost_entry_id)
            .bind(&request.posted_at)
            .bind(&log.project_id)
            .bind(&log.contract_id)
            .bind(&log.control_account_id)
            .bind(fuel_cost_payload.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }

        let mut payload = log.payload.clone();
        if let Some(obj) = payload.as_object_mut() {
            obj.insert("status".into(), json!("Posted"));
            obj.insert("posted_by".into(), json!(request.actor));
            obj.insert("posted_at".into(), json!(request.posted_at));
            obj.insert("meter_hours".into(), json!(meter_hours));
            obj.insert("total_hours".into(), json!(total_hours));
            obj.insert("equipment_cost".into(), json!(equipment_cost));
            obj.insert("fuel_cost".into(), json!(fuel_cost));
            obj.insert("total_cost".into(), json!(total_cost));
        }

        sqlx::query(
            "UPDATE equipment_logs SET status = 'Posted', posted_by = ?, posted_at = ?, meter_hours = ?, total_hours = ?, equipment_cost = ?, fuel_cost = ?, total_cost = ?, payload = ? WHERE id = ?"
        )
        .bind(&request.actor)
        .bind(&request.posted_at)
        .bind(meter_hours)
        .bind(total_hours)
        .bind(equipment_cost)
        .bind(fuel_cost)
        .bind(total_cost)
        .bind(payload.to_string())
        .bind(&request.log_id)
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
            Ok(EquipmentLogOperationResult {
                operation_id: request.operation_id,
                log_id: request.log_id,
                status: "Posted".into(),
            })
        }
        Err(e) => {
            let _ = tx.rollback().await;
            Err(e)
        }
    }
}

pub async fn reverse_equipment_log(
    path: &Path,
    request: ReverseEquipmentLogRequest,
) -> Result<EquipmentLogOperationResult, String> {
    if request.operation_id.trim().is_empty()
        || request.actor.trim().is_empty()
        || request.reason.trim().is_empty()
        || request.reversed_at.trim().is_empty()
    {
        return Err("Equipment log reversal requires operation ID, actor, documented reason and date.".into());
    }

    let mut tx = db(path).await?.begin().await.map_err(|e| e.to_string())?;
    guard_on(&mut tx, &request.operation_id).await?;

    let result = async {
        let log = load_equipment_log(&mut tx, &request.log_id).await?;

        if log.status == "Reversed" {
            // Idempotent: already reversed
            return Ok(());
        }

        if !matches!(log.status.as_str(), "Approved" | "Posted") {
            return Err(format!("Equipment log in status '{}' cannot be reversed.", log.status));
        }

        // Check reporting period lock for reversal date
        let locked_period_count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM reporting_periods WHERE status IN ('Locked', 'Closed') AND (project_id IS NULL OR project_id = ?) AND ? >= COALESCE(start_date, cutoff_date) AND ? <= COALESCE(end_date, cutoff_date)"
        )
        .bind(&log.project_id)
        .bind(&request.reversed_at)
        .bind(&request.reversed_at)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        if locked_period_count > 0 {
            return Err(format!("Reversal date {} falls within a locked reporting period.", request.reversed_at));
        }

        // If it was Posted, create negative offsetting CostEntry rows
        if log.status == "Posted" {
            let equipment_cost = m(log.operating_hours * log.hourly_rate);
            let fuel_cost = m(log.fuel_quantity * log.fuel_rate);

            if equipment_cost > 0.0 {
                let original_cost_id = format!("equipment-log-cost:{}", log.id);
                let reversal_cost_id = format!("reversal:equipment-log-cost:{}", log.id);
                let rev_payload = json!({
                    "id": reversal_cost_id,
                    "project_id": log.project_id,
                    "contract_id": log.contract_id,
                    "control_account_id": log.control_account_id,
                    "cost_code_id": log.cost_code_id,
                    "schedule_activity_id": log.schedule_activity_id,
                    "date": request.reversed_at,
                    "cost_type": "Equipment",
                    "amount": -equipment_cost,
                    "source_type": "Reversal",
                    "source_id": log.id,
                    "invoice_number": log.log_number,
                    "description": format!("Reversal of Equipment Log #{}: {}", log.log_number, request.reason),
                    "reversal_of_id": original_cost_id,
                    "reversal_reason": request.reason,
                    "created_at": request.reversed_at,
                });

                sqlx::query(
                    "INSERT OR REPLACE INTO cost_entries (id, created_at, project_id, contract_id, control_account_id, payload) VALUES (?, ?, ?, ?, ?, ?)"
                )
                .bind(&reversal_cost_id)
                .bind(&request.reversed_at)
                .bind(&log.project_id)
                .bind(&log.contract_id)
                .bind(&log.control_account_id)
                .bind(rev_payload.to_string())
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
            }

            if fuel_cost > 0.0 {
                let original_fuel_cost_id = format!("equipment-fuel-cost:{}", log.id);
                let reversal_fuel_cost_id = format!("reversal:equipment-fuel-cost:{}", log.id);
                let rev_fuel_payload = json!({
                    "id": reversal_fuel_cost_id,
                    "project_id": log.project_id,
                    "contract_id": log.contract_id,
                    "control_account_id": log.control_account_id,
                    "cost_code_id": log.cost_code_id,
                    "schedule_activity_id": log.schedule_activity_id,
                    "date": request.reversed_at,
                    "cost_type": "Equipment",
                    "amount": -fuel_cost,
                    "source_type": "Reversal",
                    "source_id": log.id,
                    "invoice_number": log.log_number,
                    "description": format!("Reversal of Equipment Fuel #{}: {}", log.log_number, request.reason),
                    "reversal_of_id": original_fuel_cost_id,
                    "reversal_reason": request.reason,
                    "created_at": request.reversed_at,
                });

                sqlx::query(
                    "INSERT OR REPLACE INTO cost_entries (id, created_at, project_id, contract_id, control_account_id, payload) VALUES (?, ?, ?, ?, ?, ?)"
                )
                .bind(&reversal_fuel_cost_id)
                .bind(&request.reversed_at)
                .bind(&log.project_id)
                .bind(&log.contract_id)
                .bind(&log.control_account_id)
                .bind(rev_fuel_payload.to_string())
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
            }
        }

        let mut payload = log.payload.clone();
        if let Some(obj) = payload.as_object_mut() {
            obj.insert("status".into(), json!("Reversed"));
            obj.insert("reversed_by".into(), json!(request.actor));
            obj.insert("reversed_at".into(), json!(request.reversed_at));
            obj.insert("reversal_reason".into(), json!(request.reason));
        }

        sqlx::query(
            "UPDATE equipment_logs SET status = 'Reversed', reversed_by = ?, reversed_at = ?, reversal_reason = ?, payload = ? WHERE id = ?"
        )
        .bind(&request.actor)
        .bind(&request.reversed_at)
        .bind(&request.reason)
        .bind(payload.to_string())
        .bind(&request.log_id)
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
            Ok(EquipmentLogOperationResult {
                operation_id: request.operation_id,
                log_id: request.log_id,
                status: "Reversed".into(),
            })
        }
        Err(e) => {
            let _ = tx.rollback().await;
            Err(e)
        }
    }
}

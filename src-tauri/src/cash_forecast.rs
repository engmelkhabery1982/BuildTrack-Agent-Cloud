use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteConnectOptions, Row, SqlitePool};
use std::path::Path;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCashForecastVersionRequest {
    pub operation_id: String,
    pub version_id: String,
    pub project_id: String,
    pub data_date: String,
    pub scenario: String,
    pub assumptions_json: String,
    pub buckets_json: String,
    pub actor: String,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveCashForecastVersionRequest { pub operation_id: String, pub version_id: String, pub actor: String }
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CashForecastVersionResult { pub operation_id: String, pub version_id: String, pub status: String }
async fn db(path: &Path) -> Result<SqlitePool, String> { SqlitePool::connect_with(SqliteConnectOptions::new().filename(path).create_if_missing(true).foreign_keys(true)).await.map_err(|e| e.to_string()) }
fn valid_date(s: &str) -> bool { s.len() == 10 && s.as_bytes().get(4) == Some(&b'-') && s.as_bytes().get(7) == Some(&b'-') }
fn valid_scenario(s: &str) -> bool { matches!(s, "Base" | "Optimistic" | "Pessimistic") }
fn valid_json(s: &str) -> bool { serde_json::from_str::<serde_json::Value>(s).is_ok() }

pub async fn save_version(path: &Path, r: SaveCashForecastVersionRequest) -> Result<CashForecastVersionResult, String> {
    if r.operation_id.is_empty() || r.version_id.is_empty() || r.project_id.is_empty() || r.actor.is_empty() { return Err("Cash forecast version requires operation, version, project and actor.".into()); }
    if !valid_date(&r.data_date) { return Err("Cash forecast Data Date must be ISO YYYY-MM-DD.".into()); }
    if !valid_scenario(&r.scenario) || !valid_json(&r.assumptions_json) || !valid_json(&r.buckets_json) { return Err("Cash forecast scenario or governed JSON is invalid.".into()); }
    let bucket_value: serde_json::Value = serde_json::from_str(&r.buckets_json).map_err(|e| e.to_string())?;
    let buckets = bucket_value.as_array().ok_or("Cash forecast buckets must be an array.")?;
    for bucket in buckets { if bucket.get("sourceIds").and_then(|v| v.as_array()).map(|v| v.is_empty()).unwrap_or(true) { return Err("Every cash forecast bucket requires governed source IDs.".into()); } }
    let pool = db(path).await?; let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let source_rows = sqlx::query("SELECT payload FROM cash_flow WHERE project_id=? AND json_extract(payload,'$.status') NOT IN ('Cancelled','Rejected','Reversed')").bind(&r.project_id).fetch_all(&mut *tx).await.map_err(|e| e.to_string())?;
    let source_ids: std::collections::HashSet<String> = source_rows.into_iter().filter_map(|row| row.try_get::<String,_>("payload").ok()).filter_map(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok()).filter_map(|v| v.get("source_id").and_then(|x| x.as_str()).map(str::to_owned)).collect();
    for bucket in buckets { for source in bucket.get("sourceIds").and_then(|v| v.as_array()).into_iter().flatten() { let id = source.as_str().ok_or("Cash forecast source ID is invalid.")?; if !source_ids.contains(id) { return Err(format!("Cash forecast source {id} is not a governed cash ledger source.")); } } }
    if let Some(row) = sqlx::query("SELECT version_id,status FROM cash_forecast_versions WHERE operation_id=?").bind(&r.operation_id).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())? {
        let version_id: String = row.try_get("version_id").map_err(|e| e.to_string())?; let status: String = row.try_get("status").map_err(|e| e.to_string())?;
        tx.rollback().await.map_err(|e| e.to_string())?; return Ok(CashForecastVersionResult { operation_id: r.operation_id, version_id, status });
    }
    sqlx::query("INSERT INTO cash_forecast_mutation_guard(operation_id,created_at) VALUES (?,datetime('now'))").bind(&r.operation_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("INSERT INTO cash_forecast_versions(version_id,project_id,data_date,scenario,status,assumptions_json,buckets_json,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'))")
        .bind(&r.version_id).bind(&r.project_id).bind(&r.data_date).bind(&r.scenario).bind("Draft").bind(&r.assumptions_json).bind(&r.buckets_json).bind(&r.actor).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("INSERT INTO cash_forecast_operations(operation_id,version_id,command,result_json,created_at) VALUES (?,?,? ,?,datetime('now'))").bind(&r.operation_id).bind(&r.version_id).bind("save").bind(format!("{{\"status\":\"Draft\",\"versionId\":\"{}\"}}", r.version_id)).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?; Ok(CashForecastVersionResult { operation_id: r.operation_id, version_id: r.version_id, status: "Draft".into() })
}
pub async fn approve_version(path: &Path, r: ApproveCashForecastVersionRequest) -> Result<CashForecastVersionResult, String> {
    if r.operation_id.is_empty() || r.version_id.is_empty() || r.actor.is_empty() { return Err("Cash forecast approval requires operation, version and actor.".into()); }
    let pool = db(path).await?; let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    if let Some(row) = sqlx::query("SELECT result_json FROM cash_forecast_operations WHERE operation_id=?").bind(&r.operation_id).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())? { let result: CashForecastVersionResult = serde_json::from_str(&row.try_get::<String,_>("result_json").map_err(|e| e.to_string())?).map_err(|e| e.to_string())?; tx.rollback().await.map_err(|e| e.to_string())?; return Ok(result); }
    let row = sqlx::query("SELECT project_id,status,created_by FROM cash_forecast_versions WHERE version_id=?").bind(&r.version_id).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?.ok_or("Cash forecast version was not found.")?;
    let status: String = row.try_get("status").map_err(|e| e.to_string())?; let created_by: String = row.try_get("created_by").map_err(|e| e.to_string())?;
    if status != "Draft" { return Err("Only Draft cash forecast versions can be approved.".into()); } if created_by == r.actor { return Err("Maker-checker violation: creator cannot approve the same forecast.".into()); }
    sqlx::query("INSERT INTO cash_forecast_mutation_guard(operation_id,created_at) VALUES (?,datetime('now'))").bind(&r.operation_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("UPDATE cash_forecast_versions SET status='Superseded' WHERE project_id=? AND status='Approved'").bind(row.try_get::<String,_>("project_id").map_err(|e| e.to_string())?).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("UPDATE cash_forecast_versions SET status='Approved',approved_by=?,approved_at=datetime('now') WHERE version_id=?").bind(&r.actor).bind(&r.version_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    let result = CashForecastVersionResult { operation_id: r.operation_id.clone(), version_id: r.version_id.clone(), status: "Approved".into() };
    sqlx::query("INSERT INTO cash_forecast_operations(operation_id,version_id,command,result_json,created_at) VALUES (?,?,?, ?,datetime('now'))").bind(&r.operation_id).bind(&r.version_id).bind("approve").bind(serde_json::to_string(&result).map_err(|e| e.to_string())?).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?; Ok(result)
}

//! Atomic approval of time-phased Delivery Cost plans.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{sqlite::SqliteConnectOptions, Row, SqlitePool};
use std::path::Path;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveCostPlanRequest { pub version: Value }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveCostPlanResult { pub id: String, pub status: String, pub superseded_ids: Vec<String> }

fn text<'a>(value: &'a Value, key: &str) -> &'a str { value.get(key).and_then(Value::as_str).unwrap_or("").trim() }
fn optional_text<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    let result = text(value, key); if result.is_empty() { None } else { Some(result) }
}
fn number(value: &Value, key: &str) -> f64 { value.get(key).and_then(Value::as_f64).unwrap_or(0.0) }
fn iso_day(value: &str) -> bool {
    value.len() == 10 && value.as_bytes().get(4) == Some(&b'-') && value.as_bytes().get(7) == Some(&b'-')
        && value.chars().enumerate().all(|(index, ch)| index == 4 || index == 7 || ch.is_ascii_digit())
}
async fn database(path: &Path) -> Result<SqlitePool, String> {
    SqlitePool::connect_with(SqliteConnectOptions::new().filename(path).create_if_missing(true).foreign_keys(true))
        .await.map_err(|error| error.to_string())
}

pub async fn approve_cost_plan(path: &Path, request: ApproveCostPlanRequest) -> Result<ApproveCostPlanResult, String> {
    let version = request.version;
    let id = text(&version, "id").to_string();
    let project_id = text(&version, "project_id").to_string();
    let contract_id = text(&version, "contract_id").to_string();
    let account_id = text(&version, "control_account_id").to_string();
    let version_code = text(&version, "version_code").to_string();
    let data_date = text(&version, "data_date").to_string();
    let bac = number(&version, "delivery_cost_bac");
    let periods = version.get("periods").and_then(Value::as_array).ok_or("Approved cost plan requires periods.")?;
    for (value, label) in [(&id, "Cost plan ID"), (&project_id, "Project"), (&contract_id, "Contract"), (&account_id, "Control Account"), (&version_code, "Version code")] {
        if value.is_empty() { return Err(format!("{label} is required.")); }
    }
    if text(&version, "status") != "Approved" { return Err("This workflow only approves cost plans.".into()); }
    if !iso_day(&data_date) { return Err("Cost plan Data Date must use YYYY-MM-DD.".into()); }
    if !bac.is_finite() || bac <= 0.0 { return Err("Delivery Cost BAC must be positive.".into()); }
    if periods.is_empty() { return Err("Approved cost plan requires at least one period.".into()); }
    let period_total: f64 = periods.iter().map(|period| number(period, "planned_cost")).sum();
    if (period_total - bac).abs() > 0.01 { return Err("Cost plan periods must reconcile to Delivery Cost BAC within 0.01.".into()); }
    if text(&version, "owner").is_empty() || text(&version, "reason").is_empty() { return Err("Approved cost plan requires owner and approval reason.".into()); }

    let pool = database(path).await?;
    let mut tx = pool.begin().await.map_err(|error| error.to_string())?;
    let outcome: Result<Vec<String>, String> = async {
        let contract_project: Option<String> = sqlx::query_scalar("SELECT project_id FROM contracts WHERE id=?")
            .bind(&contract_id).fetch_optional(&mut *tx).await.map_err(|error| error.to_string())?;
        if contract_project.as_deref() != Some(project_id.as_str()) { return Err("Cost plan contract and project scope do not match.".into()); }
        let account_scope = sqlx::query("SELECT project_id,contract_id FROM control_accounts WHERE id=?")
            .bind(&account_id).fetch_optional(&mut *tx).await.map_err(|error| error.to_string())?.ok_or("Selected Control Account does not exist.")?;
        if account_scope.get::<String, _>("project_id") != project_id || account_scope.get::<String, _>("contract_id") != contract_id {
            return Err("Cost plan Control Account is outside the selected project/contract scope.".into());
        }
        let existing_status: Option<String> = sqlx::query_scalar("SELECT status FROM cost_plan_versions WHERE id=?")
            .bind(&id).fetch_optional(&mut *tx).await.map_err(|error| error.to_string())?;
        if matches!(existing_status.as_deref(), Some("Approved" | "Superseded")) { return Err("Approved or Superseded cost plans are immutable.".into()); }
        let duplicate: Option<String> = sqlx::query_scalar("SELECT id FROM cost_plan_versions WHERE project_id=? AND contract_id=? AND lower(version_code)=lower(?) AND id<>?")
            .bind(&project_id).bind(&contract_id).bind(&version_code).bind(&id).fetch_optional(&mut *tx).await.map_err(|error| error.to_string())?;
        if duplicate.is_some() { return Err("Cost plan version code already exists in this contract.".into()); }

        let prior = sqlx::query("SELECT id FROM cost_plan_versions WHERE project_id=? AND contract_id=? AND control_account_id=? AND status='Approved' AND id<>?")
            .bind(&project_id).bind(&contract_id).bind(&account_id).bind(&id).fetch_all(&mut *tx).await.map_err(|error| error.to_string())?;
        let superseded_ids = prior.iter().map(|row| row.get::<String, _>("id")).collect::<Vec<_>>();
        sqlx::query("UPDATE cost_plan_versions SET status='Superseded',payload=json_set(payload,'$.status','Superseded'),updated_at=CURRENT_TIMESTAMP WHERE project_id=? AND contract_id=? AND control_account_id=? AND status='Approved' AND id<>?")
            .bind(&project_id).bind(&contract_id).bind(&account_id).bind(&id).execute(&mut *tx).await.map_err(|error| error.to_string())?;

        let payload = version.to_string();
        if existing_status.is_some() {
            sqlx::query("UPDATE cost_plan_versions SET updated_at=?,project_id=?,contract_id=?,control_account_id=?,wbs_id=?,cost_code_id=?,contract_sov_line_id=?,boq_item_id=?,version_code=?,version_name=?,revision_number=?,status='Approved',data_date=?,delivery_cost_bac=?,curve_type=?,start_date=?,end_date=?,periods_count=?,owner=?,reason=?,approved_by=?,approved_at=?,notes=?,payload=? WHERE id=?")
                .bind(text(&version,"updated_at")).bind(&project_id).bind(&contract_id).bind(&account_id).bind(optional_text(&version,"wbs_id"))
                .bind(optional_text(&version,"cost_code_id")).bind(optional_text(&version,"contract_sov_line_id")).bind(optional_text(&version,"boq_item_id"))
                .bind(&version_code).bind(text(&version,"version_name")).bind(number(&version,"revision_number") as i64).bind(&data_date).bind(bac)
                .bind(text(&version,"curve_type")).bind(text(&version,"start_date")).bind(text(&version,"end_date")).bind(periods.len() as i64)
                .bind(text(&version,"owner")).bind(text(&version,"reason")).bind(optional_text(&version,"approved_by")).bind(optional_text(&version,"approved_at"))
                .bind(text(&version,"notes")).bind(&payload).bind(&id).execute(&mut *tx).await.map_err(|error| error.to_string())?;
            sqlx::query("DELETE FROM cost_plan_periods WHERE version_id=?").bind(&id).execute(&mut *tx).await.map_err(|error| error.to_string())?;
        } else {
            sqlx::query("INSERT INTO cost_plan_versions(id,created_at,updated_at,project_id,contract_id,control_account_id,wbs_id,cost_code_id,contract_sov_line_id,boq_item_id,version_code,version_name,revision_number,status,data_date,delivery_cost_bac,curve_type,start_date,end_date,periods_count,owner,reason,approved_by,approved_at,notes,payload) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'Approved',?,?,?,?,?,?,?,?,?,?,?,?)")
                .bind(&id).bind(text(&version,"created_at")).bind(text(&version,"updated_at")).bind(&project_id).bind(&contract_id).bind(&account_id)
                .bind(optional_text(&version,"wbs_id")).bind(optional_text(&version,"cost_code_id")).bind(optional_text(&version,"contract_sov_line_id"))
                .bind(optional_text(&version,"boq_item_id")).bind(&version_code).bind(text(&version,"version_name")).bind(number(&version,"revision_number") as i64)
                .bind(&data_date).bind(bac).bind(text(&version,"curve_type")).bind(text(&version,"start_date")).bind(text(&version,"end_date"))
                .bind(periods.len() as i64).bind(text(&version,"owner")).bind(text(&version,"reason")).bind(optional_text(&version,"approved_by"))
                .bind(optional_text(&version,"approved_at")).bind(text(&version,"notes")).bind(&payload).execute(&mut *tx).await.map_err(|error| error.to_string())?;
        }
        for (index, period) in periods.iter().enumerate() {
            let period_id = optional_text(period,"id").map(str::to_string).unwrap_or_else(|| format!("{id}-period-{}", index + 1));
            sqlx::query("INSERT INTO cost_plan_periods(id,version_id,period_index,period_start,period_end,planned_cost,cumulative_cost,weight_pct,distribution_source,is_closed_period,actual_cost,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
                .bind(period_id).bind(&id).bind(index as i64).bind(text(period,"period_start")).bind(text(period,"period_end"))
                .bind(number(period,"planned_cost")).bind(number(period,"cumulative_cost")).bind(number(period,"weight_pct"))
                .bind(text(period,"distribution_source")).bind(period.get("is_closed_period").and_then(Value::as_bool).unwrap_or(false) as i64)
                .bind(number(period,"actual_cost")).bind(text(period,"notes")).bind(optional_text(period,"created_at").unwrap_or(text(&version,"created_at")))
                .execute(&mut *tx).await.map_err(|error| error.to_string())?;
        }
        let audit_id = format!("audit:cost-plan:{id}");
        let audit = json!({"id":audit_id,"timestamp":text(&version,"approved_at"),"action":"Approve","table_name":"cost_plan_versions","record_id":id,"actor":text(&version,"approved_by"),"details":format!("Approved Delivery Cost plan {version_code}")});
        sqlx::query("INSERT INTO audit_log(id,created_at,project_id,contract_id,payload) VALUES(?,?,?,?,?)")
            .bind(audit_id).bind(text(&version,"approved_at")).bind(&project_id).bind(&contract_id).bind(audit.to_string())
            .execute(&mut *tx).await.map_err(|error| error.to_string())?;
        Ok(superseded_ids)
    }.await;
    match outcome {
        Ok(superseded_ids) => { tx.commit().await.map_err(|error| error.to_string())?; Ok(ApproveCostPlanResult { id, status:"Approved".into(), superseded_ids }) }
        Err(error) => { tx.rollback().await.map_err(|rollback| rollback.to_string())?; Err(error) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    async fn fixture() -> std::path::PathBuf {
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let path = std::env::temp_dir().join(format!("buildtrack-cost-plan-{nonce}.db"));
        let pool = database(&path).await.unwrap();
        sqlx::query("CREATE TABLE projects(id TEXT PRIMARY KEY); CREATE TABLE contracts(id TEXT PRIMARY KEY,project_id TEXT); CREATE TABLE control_accounts(id TEXT PRIMARY KEY,project_id TEXT,contract_id TEXT); CREATE TABLE audit_log(id TEXT PRIMARY KEY,created_at TEXT,project_id TEXT,contract_id TEXT,payload TEXT); CREATE TABLE cost_plan_versions(id TEXT PRIMARY KEY,created_at TEXT,updated_at TEXT,project_id TEXT,contract_id TEXT,control_account_id TEXT,wbs_id TEXT,cost_code_id TEXT,contract_sov_line_id TEXT,boq_item_id TEXT,version_code TEXT,version_name TEXT,revision_number INTEGER,status TEXT,data_date TEXT,delivery_cost_bac REAL,curve_type TEXT,start_date TEXT,end_date TEXT,periods_count INTEGER,owner TEXT,reason TEXT,approved_by TEXT,approved_at TEXT,notes TEXT,payload TEXT); CREATE UNIQUE INDEX one_approved_plan ON cost_plan_versions(project_id,contract_id,control_account_id) WHERE status='Approved'; CREATE TABLE cost_plan_periods(id TEXT PRIMARY KEY,version_id TEXT,period_index INTEGER,period_start TEXT,period_end TEXT,planned_cost REAL,cumulative_cost REAL,weight_pct REAL,distribution_source TEXT,is_closed_period INTEGER,actual_cost REAL,notes TEXT,created_at TEXT);")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO projects VALUES('p1'); INSERT INTO contracts VALUES('c1','p1'); INSERT INTO control_accounts VALUES('ca1','p1','c1');")
            .execute(&pool).await.unwrap();
        pool.close().await;
        path
    }

    fn version(id: &str, code: &str, period_id: &str) -> Value {
        json!({
            "id":id,"created_at":"2026-09-07T10:00:00Z","updated_at":"2026-09-07T10:00:00Z",
            "project_id":"p1","contract_id":"c1","control_account_id":"ca1","version_code":code,
            "version_name":code,"revision_number":1,"status":"Approved","data_date":"2026-09-07",
            "delivery_cost_bac":100.0,"curve_type":"Linear","start_date":"2026-09-01","end_date":"2026-09-30",
            "owner":"Cost Controller","reason":"Approved baseline","approved_by":"PMO Admin","approved_at":"2026-09-07T10:00:00Z","notes":"",
            "periods":[{"id":period_id,"period_start":"2026-09-01","period_end":"2026-09-30","planned_cost":100.0,"cumulative_cost":100.0,"weight_pct":100.0,"distribution_source":"Linear","is_closed_period":false}]
        })
    }

    #[tokio::test]
    async fn approval_supersedes_prior_plan_and_writes_audit_atomically() {
        let path = fixture().await;
        approve_cost_plan(&path, ApproveCostPlanRequest { version: version("v1","CP-001","p1") }).await.unwrap();
        let result = approve_cost_plan(&path, ApproveCostPlanRequest { version: version("v2","CP-002","p2") }).await.unwrap();
        assert_eq!(result.superseded_ids, vec!["v1"]);
        let pool = database(&path).await.unwrap();
        let rows: Vec<(String,String)> = sqlx::query_as("SELECT id,status FROM cost_plan_versions ORDER BY id").fetch_all(&pool).await.unwrap();
        assert_eq!(rows, vec![("v1".into(),"Superseded".into()),("v2".into(),"Approved".into())]);
        let audits: i64 = sqlx::query_scalar("SELECT count(*) FROM audit_log").fetch_one(&pool).await.unwrap();
        assert_eq!(audits, 2);
        pool.close().await;
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn failed_new_plan_rolls_back_superseding_the_prior_plan() {
        let path = fixture().await;
        approve_cost_plan(&path, ApproveCostPlanRequest { version: version("v1","CP-001","period-shared") }).await.unwrap();
        let error = approve_cost_plan(&path, ApproveCostPlanRequest { version: version("v2","CP-002","period-shared") }).await.unwrap_err();
        assert!(!error.is_empty());
        let pool = database(&path).await.unwrap();
        let status: String = sqlx::query_scalar("SELECT status FROM cost_plan_versions WHERE id='v1'").fetch_one(&pool).await.unwrap();
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM cost_plan_versions WHERE id='v2'").fetch_one(&pool).await.unwrap();
        assert_eq!(status, "Approved");
        assert_eq!(count, 0);
        pool.close().await;
        let _ = std::fs::remove_file(path);
    }
}

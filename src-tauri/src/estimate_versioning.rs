//! Atomic approval of governed ETC/FAC estimate versions.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{sqlite::SqliteConnectOptions, Row, SqlitePool};
use std::path::Path;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveEstimateRequest { pub version: Value }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveEstimateResult { pub id: String, pub status: String, pub superseded_ids: Vec<String> }

fn text<'a>(value: &'a Value, key: &str) -> &'a str { value.get(key).and_then(Value::as_str).unwrap_or("").trim() }
fn optional_text<'a>(value: &'a Value, key: &str) -> Option<&'a str> { let v=text(value,key); if v.is_empty(){None}else{Some(v)} }
fn number(value: &Value, key: &str) -> f64 { value.get(key).and_then(Value::as_f64).unwrap_or(0.0) }
fn iso_day(value: &str) -> bool { value.len()==10 && value.as_bytes().get(4)==Some(&b'-') && value.as_bytes().get(7)==Some(&b'-') }
async fn database(path: &Path) -> Result<SqlitePool,String> {
    SqlitePool::connect_with(SqliteConnectOptions::new().filename(path).create_if_missing(true).foreign_keys(true)).await.map_err(|e|e.to_string())
}

pub async fn approve_estimate(path: &Path, request: ApproveEstimateRequest) -> Result<ApproveEstimateResult,String> {
    let version=request.version;
    let id=text(&version,"id").to_string(); let project_id=text(&version,"project_id").to_string();
    let contract_id=text(&version,"contract_id").to_string(); let account_id=text(&version,"control_account_id").to_string();
    let code=text(&version,"version_code").to_string(); let data_date=text(&version,"data_date").to_string();
    for (value,label) in [(&id,"Estimate ID"),(&project_id,"Project"),(&contract_id,"Contract"),(&account_id,"Control Account"),(&code,"Version code")] {
        if value.is_empty(){return Err(format!("{label} is required."));}
    }
    if text(&version,"status")!="Approved" { return Err("This workflow only approves estimate versions.".into()); }
    if !iso_day(&data_date) { return Err("Estimate Data Date must use YYYY-MM-DD.".into()); }
    if text(&version,"owner").is_empty() || text(&version,"reason").is_empty() || text(&version,"assumptions").is_empty() {
        return Err("Approved estimate requires owner, reason, and assumptions.".into());
    }
    let lines=version.get("lines").and_then(Value::as_array).ok_or("Approved estimate requires a forecast line.")?;
    if lines.len()!=1 || text(&lines[0],"control_account_id")!=account_id { return Err("Estimate version must contain exactly one line for its selected Control Account.".into()); }
    let line=&lines[0]; let fac=number(line,"fac"); let floor=number(line,"actual_cost")+number(line,"open_commitment");
    let waived=line.get("waiver_documented").and_then(Value::as_bool).unwrap_or(false) && !text(line,"waiver_reason").is_empty();
    if fac+0.01<floor && !waived { return Err("FAC cannot be below AC plus open commitment without a documented waiver.".into()); }

    let pool=database(path).await?; let mut tx=pool.begin().await.map_err(|e|e.to_string())?;
    let outcome:Result<Vec<String>,String>=async {
        let contract_project:Option<String>=sqlx::query_scalar("SELECT project_id FROM contracts WHERE id=?").bind(&contract_id).fetch_optional(&mut *tx).await.map_err(|e|e.to_string())?;
        if contract_project.as_deref()!=Some(project_id.as_str()){return Err("Estimate contract and project scope do not match.".into());}
        let account=sqlx::query("SELECT project_id,contract_id FROM control_accounts WHERE id=?").bind(&account_id).fetch_optional(&mut *tx).await.map_err(|e|e.to_string())?.ok_or("Selected Control Account does not exist.")?;
        if account.get::<String,_>("project_id")!=project_id || account.get::<String,_>("contract_id")!=contract_id{return Err("Estimate Control Account is outside the selected scope.".into());}
        let duplicate:Option<String>=sqlx::query_scalar("SELECT id FROM estimate_versions WHERE project_id=? AND contract_id=? AND lower(version_code)=lower(?)")
            .bind(&project_id).bind(&contract_id).bind(&code).fetch_optional(&mut *tx).await.map_err(|e|e.to_string())?;
        if duplicate.is_some(){return Err("Estimate version code already exists in this contract.".into());}
        let prior=sqlx::query("SELECT id FROM estimate_versions WHERE project_id=? AND contract_id=? AND control_account_id=? AND status='Approved'")
            .bind(&project_id).bind(&contract_id).bind(&account_id).fetch_all(&mut *tx).await.map_err(|e|e.to_string())?;
        let superseded_ids=prior.iter().map(|row|row.get::<String,_>("id")).collect::<Vec<_>>();
        sqlx::query("UPDATE estimate_versions SET status='Superseded',payload=json_set(payload,'$.status','Superseded'),updated_at=CURRENT_TIMESTAMP WHERE project_id=? AND contract_id=? AND control_account_id=? AND status='Approved'")
            .bind(&project_id).bind(&contract_id).bind(&account_id).execute(&mut *tx).await.map_err(|e|e.to_string())?;
        sqlx::query("INSERT INTO estimate_versions(id,created_at,updated_at,project_id,contract_id,control_account_id,version_code,version_name,revision_number,status,data_date,method,owner,reason,assumptions,approved_by,approved_at,notes,payload) VALUES(?,?,?,?,?,?,?,?,?,'Approved',?,?,?,?,?,?,?,?,?)")
            .bind(&id).bind(text(&version,"created_at")).bind(text(&version,"updated_at")).bind(&project_id).bind(&contract_id).bind(&account_id)
            .bind(&code).bind(text(&version,"version_name")).bind(number(&version,"revision_number") as i64).bind(&data_date).bind(text(&version,"method"))
            .bind(text(&version,"owner")).bind(text(&version,"reason")).bind(text(&version,"assumptions")).bind(optional_text(&version,"approved_by"))
            .bind(optional_text(&version,"approved_at")).bind(text(&version,"notes")).bind(version.to_string()).execute(&mut *tx).await.map_err(|e|e.to_string())?;
        sqlx::query("INSERT INTO estimate_lines(id,version_id,control_account_id,planned_value,earned_value,actual_cost,open_commitment,etc,fac,method_used,notes,waiver_documented,waiver_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
            .bind(optional_text(line,"id").unwrap_or("")).bind(&id).bind(&account_id).bind(number(line,"planned_value")).bind(number(line,"earned_value"))
            .bind(number(line,"actual_cost")).bind(number(line,"open_commitment")).bind(number(line,"etc")).bind(fac).bind(text(line,"method_used"))
            .bind(text(line,"notes")).bind(waived as i64).bind(text(line,"waiver_reason")).execute(&mut *tx).await.map_err(|e|e.to_string())?;
        let audit_id=format!("audit:estimate:{id}"); let audit=json!({"id":audit_id,"timestamp":text(&version,"approved_at"),"action":"Approve","table_name":"estimate_versions","record_id":id,"actor":text(&version,"approved_by"),"details":format!("Approved estimate {code}")});
        sqlx::query("INSERT INTO audit_log(id,created_at,project_id,contract_id,payload) VALUES(?,?,?,?,?)").bind(audit_id).bind(text(&version,"approved_at"))
            .bind(&project_id).bind(&contract_id).bind(audit.to_string()).execute(&mut *tx).await.map_err(|e|e.to_string())?;
        Ok(superseded_ids)
    }.await;
    match outcome { Ok(ids)=>{tx.commit().await.map_err(|e|e.to_string())?;Ok(ApproveEstimateResult{id,status:"Approved".into(),superseded_ids:ids})}, Err(e)=>{tx.rollback().await.map_err(|r|r.to_string())?;Err(e)} }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    async fn fixture() -> std::path::PathBuf {
        let nonce=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let path=std::env::temp_dir().join(format!("buildtrack-estimate-{nonce}.db"));
        let pool=database(&path).await.unwrap();
        sqlx::query("CREATE TABLE projects(id TEXT PRIMARY KEY); CREATE TABLE contracts(id TEXT PRIMARY KEY,project_id TEXT); CREATE TABLE control_accounts(id TEXT PRIMARY KEY,project_id TEXT,contract_id TEXT); CREATE TABLE audit_log(id TEXT PRIMARY KEY,created_at TEXT,project_id TEXT,contract_id TEXT,payload TEXT); CREATE TABLE estimate_versions(id TEXT PRIMARY KEY,created_at TEXT,updated_at TEXT,project_id TEXT,contract_id TEXT,control_account_id TEXT,version_code TEXT,version_name TEXT,revision_number INTEGER,status TEXT,data_date TEXT,method TEXT,owner TEXT,reason TEXT,assumptions TEXT,approved_by TEXT,approved_at TEXT,notes TEXT,payload TEXT); CREATE UNIQUE INDEX one_estimate ON estimate_versions(project_id,contract_id,control_account_id) WHERE status='Approved'; CREATE TABLE estimate_lines(id TEXT PRIMARY KEY,version_id TEXT,control_account_id TEXT,planned_value REAL,earned_value REAL,actual_cost REAL,open_commitment REAL,etc REAL,fac REAL,method_used TEXT,notes TEXT,waiver_documented INTEGER,waiver_reason TEXT);")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO projects VALUES('p1'); INSERT INTO contracts VALUES('c1','p1'); INSERT INTO control_accounts VALUES('ca1','p1','c1');").execute(&pool).await.unwrap();
        pool.close().await; path
    }
    fn version(id:&str,code:&str,line_id:&str)->Value { json!({
        "id":id,"created_at":"2026-09-07T10:00:00Z","updated_at":"2026-09-07T10:00:00Z","project_id":"p1","contract_id":"c1","control_account_id":"ca1",
        "version_code":code,"version_name":code,"revision_number":1,"status":"Approved","data_date":"2026-09-07","method":"Bottom-up","owner":"Cost Lead","reason":"Period forecast","assumptions":"Approved cost plan and dated actuals","approved_by":"PMO Admin","approved_at":"2026-09-07T10:00:00Z","notes":"",
        "lines":[{"id":line_id,"control_account_id":"ca1","planned_value":40.0,"earned_value":35.0,"actual_cost":30.0,"open_commitment":20.0,"etc":40.0,"fac":70.0,"method_used":"Bottom-up","notes":"","waiver_documented":false,"waiver_reason":""}]
    }) }
    #[tokio::test]
    async fn approval_is_atomic_when_a_new_line_fails() {
        let path=fixture().await;
        approve_estimate(&path,ApproveEstimateRequest{version:version("e1","EST-001","shared")}).await.unwrap();
        assert!(approve_estimate(&path,ApproveEstimateRequest{version:version("e2","EST-002","shared")}).await.is_err());
        let pool=database(&path).await.unwrap();
        let status:String=sqlx::query_scalar("SELECT status FROM estimate_versions WHERE id='e1'").fetch_one(&pool).await.unwrap();
        let count:i64=sqlx::query_scalar("SELECT count(*) FROM estimate_versions WHERE id='e2'").fetch_one(&pool).await.unwrap();
        assert_eq!(status,"Approved"); assert_eq!(count,0);
        pool.close().await; let _=std::fs::remove_file(path);
    }
    #[tokio::test]
    async fn fac_floor_is_rejected_before_any_write() {
        let path=fixture().await; let mut invalid=version("e1","EST-001","l1");
        invalid["lines"][0]["fac"]=json!(40.0);
        assert!(approve_estimate(&path,ApproveEstimateRequest{version:invalid}).await.unwrap_err().contains("FAC cannot"));
        let pool=database(&path).await.unwrap(); let count:i64=sqlx::query_scalar("SELECT count(*) FROM estimate_versions").fetch_one(&pool).await.unwrap(); assert_eq!(count,0);
        pool.close().await; let _=std::fs::remove_file(path);
    }
}

//! Atomic, governed issuance of controlled report-pack snapshots.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{sqlite::SqliteConnectOptions, Row, SqlitePool};
use std::path::Path;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueReportVersionRequest {
    pub id: String,
    pub project_id: Option<String>,
    pub contract_id: Option<String>,
    pub data_date: String,
    pub pack_type: String,
    pub template_id: Option<String>,
    pub version_code: String,
    pub snapshot_hash: String,
    pub snapshot_payload: String,
    pub issuer: String,
    pub sign_off_note: String,
    pub issued_at: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueReportVersionResult {
    pub id: String,
    pub status: String,
    pub superseded_ids: Vec<String>,
}

fn required(value: &str, label: &str) -> Result<(), String> {
    if value.trim().is_empty() { Err(format!("{label} is required.")) } else { Ok(()) }
}

fn iso_day(value: &str) -> bool {
    value.len() == 10
        && value.as_bytes().get(4) == Some(&b'-')
        && value.as_bytes().get(7) == Some(&b'-')
        && value.chars().enumerate().all(|(index, ch)| index == 4 || index == 7 || ch.is_ascii_digit())
}

async fn database(path: &Path) -> Result<SqlitePool, String> {
    SqlitePool::connect_with(
        SqliteConnectOptions::new().filename(path).create_if_missing(true).foreign_keys(true),
    ).await.map_err(|error| error.to_string())
}

pub async fn issue_report_version(path: &Path, request: IssueReportVersionRequest) -> Result<IssueReportVersionResult, String> {
    for (value, label) in [
        (&request.id, "Report ID"),
        (&request.pack_type, "Report pack type"),
        (&request.version_code, "Report version code"),
        (&request.snapshot_hash, "Snapshot hash"),
        (&request.snapshot_payload, "Snapshot payload"),
        (&request.issuer, "Issuer"),
        (&request.sign_off_note, "Sign-off note"),
        (&request.issued_at, "Issued timestamp"),
        (&request.created_at, "Created timestamp"),
    ] { required(value, label)?; }
    if !iso_day(&request.data_date) { return Err("Report Data Date must use YYYY-MM-DD.".into()); }
    if !request.snapshot_hash.starts_with("sha256:") || request.snapshot_hash.len() != 71 {
        return Err("Controlled reports require a SHA-256 snapshot hash.".into());
    }
    serde_json::from_str::<Value>(&request.snapshot_payload)
        .map_err(|_| "Snapshot payload must be valid JSON.".to_string())?;

    let pool = database(path).await?;
    let mut tx = pool.begin().await.map_err(|error| error.to_string())?;
    let outcome: Result<Vec<String>, String> = async {
        if let Some(project_id) = request.project_id.as_deref() {
            let exists: Option<String> = sqlx::query_scalar("SELECT id FROM projects WHERE id = ?")
                .bind(project_id).fetch_optional(&mut *tx).await.map_err(|error| error.to_string())?;
            if exists.is_none() { return Err("Selected report project does not exist.".into()); }
        }
        if let Some(contract_id) = request.contract_id.as_deref() {
            let project: Option<String> = sqlx::query_scalar("SELECT project_id FROM contracts WHERE id = ?")
                .bind(contract_id).fetch_optional(&mut *tx).await.map_err(|error| error.to_string())?
                .ok_or("Selected report contract does not exist.")?;
            if request.project_id.as_deref() != project.as_deref() {
                return Err("Report contract and project scope do not match.".into());
            }
        }
        let duplicate: Option<String> = sqlx::query_scalar(
            "SELECT id FROM report_versions WHERE COALESCE(project_id, '') = COALESCE(?, '') AND lower(version_code) = lower(?)",
        ).bind(request.project_id.as_deref()).bind(request.version_code.trim())
            .fetch_optional(&mut *tx).await.map_err(|error| error.to_string())?;
        if duplicate.is_some() { return Err("Report version code already exists in this scope.".into()); }

        let prior = sqlx::query(
            "SELECT id FROM report_versions WHERE COALESCE(project_id, '') = COALESCE(?, '') AND pack_type = ? AND status = 'Issued'",
        ).bind(request.project_id.as_deref()).bind(request.pack_type.trim())
            .fetch_all(&mut *tx).await.map_err(|error| error.to_string())?;
        let superseded_ids = prior.iter().map(|row| row.get::<String, _>("id")).collect::<Vec<_>>();
        sqlx::query(
            "UPDATE report_versions SET status='Superseded', superseded_by=?, payload=json_set(payload, '$.status', 'Superseded', '$.superseded_by', ?) WHERE COALESCE(project_id, '') = COALESCE(?, '') AND pack_type=? AND status='Issued'",
        ).bind(&request.id).bind(&request.id).bind(request.project_id.as_deref()).bind(request.pack_type.trim())
            .execute(&mut *tx).await.map_err(|error| error.to_string())?;

        let payload = json!({
            "id": request.id, "project_id": request.project_id, "contract_id": request.contract_id,
            "data_date": request.data_date, "pack_type": request.pack_type, "template_id": request.template_id,
            "version_code": request.version_code, "status": "Issued", "snapshot_hash": request.snapshot_hash,
            "snapshot_payload": request.snapshot_payload, "issuer": request.issuer,
            "sign_off_note": request.sign_off_note, "issued_at": request.issued_at,
            "superseded_by": Value::Null, "created_at": request.created_at,
        });
        sqlx::query(
            "INSERT INTO report_versions (id,created_at,project_id,contract_id,data_date,pack_type,template_id,version_code,status,snapshot_hash,snapshot_payload,issuer,sign_off_note,issued_at,superseded_by,payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ).bind(&request.id).bind(&request.created_at).bind(request.project_id.as_deref()).bind(request.contract_id.as_deref())
            .bind(&request.data_date).bind(request.pack_type.trim()).bind(request.template_id.as_deref())
            .bind(request.version_code.trim()).bind("Issued").bind(&request.snapshot_hash).bind(&request.snapshot_payload)
            .bind(request.issuer.trim()).bind(request.sign_off_note.trim()).bind(&request.issued_at)
            .bind(Option::<String>::None).bind(payload.to_string())
            .execute(&mut *tx).await.map_err(|error| error.to_string())?;

        let audit_id = format!("audit:report:{}", request.id);
        let audit = json!({"id":audit_id,"timestamp":request.issued_at,"action":"Issue","table_name":"report_versions","record_id":request.id,"actor":request.issuer,"details":format!("Issued controlled report {}", request.version_code)});
        sqlx::query("INSERT INTO audit_log (id,created_at,project_id,contract_id,payload) VALUES (?,?,?,?,?)")
            .bind(audit_id).bind(&request.issued_at).bind(request.project_id.as_deref()).bind(request.contract_id.as_deref()).bind(audit.to_string())
            .execute(&mut *tx).await.map_err(|error| error.to_string())?;
        Ok(superseded_ids)
    }.await;

    match outcome {
        Ok(superseded_ids) => {
            tx.commit().await.map_err(|error| error.to_string())?;
            Ok(IssueReportVersionResult { id: request.id, status: "Issued".into(), superseded_ids })
        }
        Err(error) => {
            tx.rollback().await.map_err(|rollback| rollback.to_string())?;
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn request(id: &str, code: &str) -> IssueReportVersionRequest {
        IssueReportVersionRequest {
            id: id.into(), project_id: Some("p1".into()), contract_id: Some("c1".into()),
            data_date: "2026-09-06".into(), pack_type: "Monthly PMO Review".into(), template_id: None,
            version_code: code.into(), snapshot_hash: format!("sha256:{}", "a".repeat(64)),
            snapshot_payload: "{\"metrics\":{\"ev\":100}}".into(), issuer: "PMO Admin".into(),
            sign_off_note: "Reviewed and issued".into(), issued_at: "2026-09-06T10:00:00Z".into(),
            created_at: "2026-09-06T10:00:00Z".into(),
        }
    }

    async fn fixture() -> std::path::PathBuf {
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let path = std::env::temp_dir().join(format!("buildtrack-report-version-{nonce}.db"));
        let pool = database(&path).await.unwrap();
        sqlx::query("CREATE TABLE projects(id TEXT PRIMARY KEY, created_at TEXT, payload TEXT NOT NULL); CREATE TABLE contracts(id TEXT PRIMARY KEY, created_at TEXT, project_id TEXT, payload TEXT NOT NULL); CREATE TABLE audit_log(id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT, payload TEXT NOT NULL); CREATE TABLE report_versions(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,project_id TEXT,contract_id TEXT,data_date TEXT,pack_type TEXT,template_id TEXT,version_code TEXT,status TEXT,snapshot_hash TEXT,snapshot_payload TEXT,issuer TEXT,sign_off_note TEXT,issued_at TEXT,superseded_by TEXT,payload TEXT NOT NULL); CREATE UNIQUE INDEX one_issued ON report_versions(COALESCE(project_id,''),pack_type) WHERE status='Issued';")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO projects VALUES('p1','2026-01-01','{}'); INSERT INTO contracts VALUES('c1','2026-01-01','p1','{}');")
            .execute(&pool).await.unwrap();
        pool.close().await;
        path
    }

    #[tokio::test]
    async fn issuance_supersedes_prior_pack_atomically_and_audits_each_issue() {
        let path = fixture().await;
        let first = issue_report_version(&path, request("r1", "RPT-001")).await.unwrap();
        assert!(first.superseded_ids.is_empty());
        let second = issue_report_version(&path, request("r2", "RPT-002")).await.unwrap();
        assert_eq!(second.superseded_ids, vec!["r1"]);
        let pool = database(&path).await.unwrap();
        let rows: Vec<(String, String, Option<String>)> = sqlx::query_as("SELECT id,status,superseded_by FROM report_versions ORDER BY id")
            .fetch_all(&pool).await.unwrap();
        assert_eq!(rows, vec![("r1".into(), "Superseded".into(), Some("r2".into())), ("r2".into(), "Issued".into(), None)]);
        let audits: i64 = sqlx::query_scalar("SELECT count(*) FROM audit_log").fetch_one(&pool).await.unwrap();
        assert_eq!(audits, 2);
        pool.close().await;
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn issuance_rejects_non_sha256_snapshot_before_writing() {
        let path = fixture().await;
        let mut invalid = request("r1", "RPT-001");
        invalid.snapshot_hash = "weak-hash".into();
        assert!(issue_report_version(&path, invalid).await.unwrap_err().contains("SHA-256"));
        let pool = database(&path).await.unwrap();
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM report_versions").fetch_one(&pool).await.unwrap();
        assert_eq!(count, 0);
        pool.close().await;
        let _ = std::fs::remove_file(path);
    }
}

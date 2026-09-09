//! Governed Payment Certificates and Invoice Reconciliation Workflow (W04).
//! Enforces:
//! - WIR certification locking per period/boq_item_id (G01).
//! - Revenue vs Delivery Cost separation (G02).
//! - Strict lifecycle: Draft -> Submitted -> Approved -> Partially Paid -> Paid -> Reversed (G03).
//! - Database mutation guard protection (G04).
//! - Append-only partial payments ledger (G05).
//! - Atomic AR/AP and Cash Flow sync (G06).
//! - Over-certification protection against contract BOQ quantities (G07).
//! - Clean certificate reversal and WIR lock release (G08).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{sqlite::SqliteConnectOptions, Row, Sqlite, SqlitePool, Transaction};
use std::path::Path;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCertificateRequest {
    pub operation_id: String,
    pub project_id: String,
    pub contract_id: String,
    pub period_id: String,
    pub certificate_type: String,
    pub wir_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertificateDraftResult {
    pub certificate_id: String,
    pub status: String,
    pub line_count: usize,
    pub gross_certified_value: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitCertificateRequest {
    pub operation_id: String,
    pub certificate_id: String,
    pub actor: String,
    pub submitted_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WirLockItemInput {
    pub wir_id: String,
    pub period_id: String,
    pub boq_item_id: String,
    pub certified_quantity: f64,
    pub certified_amount: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveCertificateGovernedRequest {
    pub operation_id: String,
    pub certificate_id: String,
    pub actor: String,
    pub approved_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartialPaymentRequest {
    pub operation_id: String,
    pub certificate_id: String,
    pub actor: String,
    pub payment_date: String,
    pub amount: f64,
    pub reference: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettleCertificateRequest {
    pub operation_id: String,
    pub certificate_id: String,
    pub actor: String,
    pub paid_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReverseCertificateRequest {
    pub operation_id: String,
    pub certificate_id: String,
    pub actor: String,
    pub reason: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CertificateOperationResult {
    pub operation_id: String,
    pub status: String,
    pub certificate_status: Option<String>,
    pub remaining_balance: Option<f64>,
    pub total_paid_amount: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetPartialPaymentsRequest { pub certificate_id: String }

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartialPaymentRecord {
    pub payment_id: String,
    pub certificate_id: String,
    pub payment_date: String,
    pub amount: f64,
    pub reference: Option<String>,
    pub created_at: String,
}

#[derive(Clone)]
struct Scope {
    project_id: String,
    contract_id: Option<String>,
    boq_header_id: Option<String>,
    boq_item_id: Option<String>,
    parent_main_project_id: Option<String>,
    parent_main_contract_id: Option<String>,
}

fn stamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    format!(
        "{}Z",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    )
}

fn n(v: &Value, k: &str) -> f64 {
    v.get(k).and_then(Value::as_f64).unwrap_or(0.0)
}

fn s(v: &Value, k: &str) -> String {
    v.get(k)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn money(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

fn term(v: &Value, keys: &[&str]) -> Option<f64> {
    keys.iter().find_map(|key| v.get(*key).and_then(Value::as_f64))
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

async fn scope_doc(
    tx: &mut Transaction<'_, Sqlite>,
    table: &str,
    id: &str,
) -> Result<(Scope, Value), String> {
    let q = format!("SELECT project_id,contract_id,boq_header_id,boq_item_id,parent_main_project_id,parent_main_contract_id,payload FROM {table} WHERE id=?");
    let r = sqlx::query(&q)
        .bind(id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Payment certificate {id} was not found."))?;
    let scope = Scope {
        project_id: r.try_get("project_id").map_err(|e| e.to_string())?,
        contract_id: r.try_get("contract_id").map_err(|e| e.to_string())?,
        boq_header_id: r.try_get("boq_header_id").map_err(|e| e.to_string())?,
        boq_item_id: r.try_get("boq_item_id").map_err(|e| e.to_string())?,
        parent_main_project_id: r
            .try_get("parent_main_project_id")
            .map_err(|e| e.to_string())?,
        parent_main_contract_id: r
            .try_get("parent_main_contract_id")
            .map_err(|e| e.to_string())?,
    };
    let payload: Value = serde_json::from_str(
        &r.try_get::<String, _>("payload")
            .map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok((scope, payload))
}

async fn guard(
    tx: &mut Transaction<'_, Sqlite>,
    id: &str,
    on: bool,
) -> Result<(), String> {
    if on {
        sqlx::query("INSERT INTO commercial_mutation_guard(operation_id,created_at) VALUES (?,?)")
            .bind(id)
            .bind(stamp())
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("INSERT OR IGNORE INTO certificate_mutation_guard(operation_id,created_at) VALUES (?,?)")
            .bind(id)
            .bind(stamp())
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
    } else {
        sqlx::query("DELETE FROM commercial_mutation_guard WHERE operation_id=?")
            .bind(id)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("DELETE FROM certificate_mutation_guard WHERE operation_id=?")
            .bind(id)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn replay_operation(
    tx: &mut Transaction<'_, Sqlite>,
    operation_id: &str,
    certificate_id: &str,
) -> Result<Option<CertificateOperationResult>, String> {
    let row = sqlx::query("SELECT certificate_id,result_json FROM certificate_operation_results WHERE operation_id=?")
        .bind(operation_id).fetch_optional(&mut **tx).await.map_err(|e| e.to_string())?;
    let Some(row) = row else { return Ok(None); };
    let stored_certificate: String = row.try_get("certificate_id").map_err(|e| e.to_string())?;
    if stored_certificate != certificate_id { return Err("Operation ID is already bound to another certificate.".into()); }
    let result: CertificateOperationResult = serde_json::from_str(&row.try_get::<String,_>("result_json").map_err(|e| e.to_string())?)
        .map_err(|e| format!("Stored operation result is invalid: {e}"))?;
    Ok(Some(CertificateOperationResult { status: "Replayed".into(), ..result }))
}

async fn save_operation(
    tx: &mut Transaction<'_, Sqlite>,
    command: &str,
    result: &CertificateOperationResult,
    certificate_id: &str,
) -> Result<(), String> {
    sqlx::query("INSERT INTO certificate_operation_results(operation_id,certificate_id,command,result_json,created_at) VALUES (?,?,?,?,?)")
        .bind(&result.operation_id).bind(certificate_id).bind(command)
        .bind(serde_json::to_string(result).map_err(|e| e.to_string())?).bind(stamp())
        .execute(&mut **tx).await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn put(
    tx: &mut Transaction<'_, Sqlite>,
    id: &str,
    v: &Value,
) -> Result<(), String> {
    let g = format!("internal:payment_certificates:{id}");
    guard(tx, &g, true).await?;
    sqlx::query("UPDATE payment_certificates SET payload=? WHERE id=?")
        .bind(v.to_string())
        .bind(id)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    guard(tx, &g, false).await
}

async fn post(
    tx: &mut Transaction<'_, Sqlite>,
    id: &str,
    source: &str,
    kind: &str,
    actor: &str,
    day: &str,
    reason: &str,
    snapshot: &Value,
) -> Result<(), String> {
    sqlx::query("INSERT INTO commercial_workflow_postings(id,created_at,source_table,source_id,posting_type,status,actor,effective_date,reason,snapshot_json) VALUES (?,?,?,?,?,?,?,?,?,?)")
        .bind(id).bind(stamp()).bind("payment_certificates").bind(source).bind(kind).bind("Posted").bind(actor).bind(day).bind(reason).bind(snapshot.to_string())
        .execute(&mut **tx).await.map_err(|e| e.to_string())?;

    let audit_id = format!("audit:payment_certificates:{id}");
    let audit = json!({
        "id": audit_id,
        "timestamp": day,
        "action": kind,
        "table_name": "payment_certificates",
        "record_id": source,
        "actor": actor,
        "details": reason,
        "before": null,
        "after": snapshot
    });
    let project_id = snapshot.get("project_id").and_then(|v| v.as_str());
    let contract_id = snapshot.get("contract_id").and_then(|v| v.as_str());

    sqlx::query("INSERT INTO audit_log (id, created_at, project_id, contract_id, payload) VALUES (?, ?, ?, ?, ?)")
        .bind(audit_id).bind(stamp()).bind(project_id).bind(contract_id).bind(audit.to_string())
        .execute(&mut **tx).await.map_err(|e| e.to_string())?;

    Ok(())
}

async fn cash(
    tx: &mut Transaction<'_, Sqlite>,
    scope: &Scope,
    source: &str,
    day: &str,
    number: &str,
    kind: &str,
    status: &str,
    amount: f64,
    client: bool,
    partial_id: Option<&str>,
) -> Result<(), String> {
    let cash_id = if let Some(pid) = partial_id {
        format!("payment_certificate_partial:{pid}")
    } else {
        format!("payment_certificate_{}:{}", kind.to_lowercase(), source)
    };

    if amount.abs() < 0.000001 && kind != "Reversed" {
        return Ok(());
    }

    let payload = json!({
        "id": cash_id,
        "date": day,
        "description": format!("Payment certificate {kind}: {number}"),
        "category": if client { "Client Receipt" } else { "Subcontractor Payment" },
        "inflow": if client { money(amount) } else { 0.0 },
        "outflow": if client { 0.0 } else { money(amount) },
        "net": if client { money(amount) } else { money(-amount) },
        "cumulative_balance": 0,
        "movement_type": kind,
        "status": status,
        "source_type": format!("payment_certificate_{}", kind.to_lowercase()),
        "source_id": source
    });

    sqlx::query("INSERT INTO cash_flow(id,created_at,project_id,contract_id,boq_header_id,boq_item_id,parent_main_project_id,parent_main_contract_id,payload) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(&cash_id).bind(stamp()).bind(&scope.project_id).bind(&scope.contract_id).bind(&scope.boq_header_id).bind(&scope.boq_item_id).bind(&scope.parent_main_project_id).bind(&scope.parent_main_contract_id).bind(payload.to_string())
        .execute(&mut **tx).await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn cash_reversal(
    tx: &mut Transaction<'_, Sqlite>,
    scope: &Scope,
    source: &str,
    day: &str,
    number: &str,
    amount: f64,
    client: bool,
) -> Result<(), String> {
    if amount <= 0.0 { return Ok(()); }
    let id = format!("payment_certificate_reversal:{}:{}", source, stamp());
    let payload = json!({
        "id": id, "date": day, "description": format!("Reversal of payment certificate {number}"),
        "category": if client { "Client Receipt Reversal" } else { "Subcontractor Payment Reversal" },
        "inflow": if client { 0.0 } else { money(amount) },
        "outflow": if client { money(amount) } else { 0.0 },
        "net": if client { money(-amount) } else { money(amount) },
        "cumulative_balance": 0, "movement_type": "Reversal", "status": "Reversed",
        "source_type": "payment_certificate_reversal", "source_id": source
    });
    sqlx::query("INSERT INTO cash_flow(id,created_at,project_id,contract_id,boq_header_id,boq_item_id,parent_main_project_id,parent_main_contract_id,payload) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(&id).bind(stamp()).bind(&scope.project_id).bind(&scope.contract_id).bind(&scope.boq_header_id).bind(&scope.boq_item_id).bind(&scope.parent_main_project_id).bind(&scope.parent_main_contract_id).bind(payload.to_string())
        .execute(&mut **tx).await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn synchronize_invoice_tracking(
    tx: &mut Transaction<'_, Sqlite>,
    certificate: &Value,
    payment_date: Option<&str>,
    status_override: Option<&str>,
) -> Result<(), String> {
    let tracking_id = s(certificate, "invoice_tracking_id");
    if tracking_id.is_empty() {
        return Ok(());
    }
    let client = s(certificate, "certificate_type") == "Client";
    let tracking_table = if client {
        "client_invoice_tracking"
    } else {
        "subcontractor_invoice_tracking"
    };
    let invoice_table = if client {
        "client_invoices"
    } else {
        "subcontractor_invoices"
    };

    let q = format!("SELECT project_id,contract_id,payload FROM {tracking_table} WHERE id=?");
    let row = sqlx::query(&q)
        .bind(&tracking_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Selected invoice register row no longer exists.")?;

    let tracking: Value = serde_json::from_str(
        &row.try_get::<String, _>("payload")
            .map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let number = s(&tracking, "invoice_number");
    if number.is_empty() {
        return Err("Selected invoice register has no invoice number.".into());
    }

    let certificate_status = s(certificate, "status");
    let cert_status = status_override.unwrap_or(certificate_status.as_str());
    let (status, payment_status) = match cert_status {
        "Reversed" => ("Generated", "Unpaid"),
        "Paid" => ("Approved", "Paid"),
        "Partially Paid" => ("Approved", "Partially Paid"),
        "Approved" => ("Approved", "Unpaid"),
        _ => ("Generated", "Unpaid"),
    };

    let paid_amount = n(certificate, "total_paid_amount");
    let remaining_amount = n(certificate, "remaining_balance");
    let tracking_update = format!("UPDATE {tracking_table} SET payload=json_set(payload,'$.status',?,'$.payment_status',?,'$.payment_date',?,'$.paid_amount',?,'$.remaining_amount',?) WHERE id=?");
    sqlx::query(&tracking_update)
        .bind(status)
        .bind(payment_status)
        .bind(payment_date)
        .bind(paid_amount)
        .bind(remaining_amount)
        .bind(&tracking_id)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

    let invoice_update = format!("UPDATE {invoice_table} SET payload=json_set(payload,'$.status',?,'$.payment_status',?,'$.payment_date',?,'$.paid_amount',?,'$.remaining_amount',?) WHERE json_extract(payload,'$.invoice_number')=?");
    sqlx::query(&invoice_update)
        .bind(status)
        .bind(payment_status)
        .bind(payment_date)
        .bind(paid_amount)
        .bind(remaining_amount)
        .bind(&number)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

async fn check_over_certification(
    tx: &mut Transaction<'_, Sqlite>,
    scope: &Scope,
    certificate_id: &str,
    items: &Value,
) -> Result<(), String> {
    if let Some(items_arr) = items.as_array() {
        for item in items_arr {
            let boq_item_id = s(item, "boq_item_id");
            if boq_item_id.is_empty() {
                continue;
            }
            let current_qty = n(item, "quantity");
            if current_qty <= 0.0 {
                continue;
            }

            let boq_row = sqlx::query("SELECT payload FROM boq_items WHERE id=?")
                .bind(&boq_item_id)
                .fetch_optional(&mut **tx)
                .await
                .map_err(|e| e.to_string())?;

            if let Some(brow) = boq_row {
                let bpayload: Value = serde_json::from_str(
                    &brow.try_get::<String, _>("payload").map_err(|e| e.to_string())?,
                )
                .map_err(|e| e.to_string())?;
                let contract_boq_qty = term(&bpayload, &["revised_quantity", "revisedQuantity", "quantity"]).unwrap_or(0.0);

                if contract_boq_qty > 0.0 {
                    let prior_certified_qty: f64 = sqlx::query_scalar(
                        r#"
                        SELECT CAST(COALESCE(sum(CAST(json_extract(i.value, '$.quantity') AS REAL)), 0) AS REAL)
                        FROM payment_certificates c, json_each(json_extract(c.payload, '$.items')) i
                        WHERE c.id <> ?
                          AND c.project_id = ?
                          AND json_extract(c.payload, '$.status') IN ('Approved', 'Partially Paid', 'Paid')
                          AND json_extract(i.value, '$.boq_item_id') = ?
                        "#,
                    )
                    .bind(certificate_id)
                    .bind(&scope.project_id)
                    .bind(&boq_item_id)
                    .fetch_one(&mut **tx)
                    .await
                    .unwrap_or(0.0);

                    if prior_certified_qty + current_qty > contract_boq_qty + 0.000001 {
                        return Err(format!(
                            "Over-certification error: Certified quantity ({}) for item {} exceeds BOQ quantity ({}) (prior certified: {}).",
                            prior_certified_qty + current_qty,
                            boq_item_id,
                            contract_boq_qty,
                            prior_certified_qty
                        ));
                    }
                }
            }
        }
    }
    Ok(())
}

/// Creates a Draft only from authoritative project, contract, period and Approved WIR rows.
/// The UI supplies identifiers, never rates, quantities, totals or lifecycle state.
pub async fn create_payment_certificate_draft(
    path: &Path,
    r: CreateCertificateRequest,
) -> Result<CertificateDraftResult, String> {
    if r.operation_id.trim().is_empty() { return Err("Create certificate requires operation ID.".into()); }
    if r.project_id.trim().is_empty() || r.contract_id.trim().is_empty() || r.period_id.trim().is_empty() {
        return Err("Project, contract and reporting period are required.".into());
    }
    if !matches!(r.certificate_type.as_str(), "Client" | "Subcontractor") {
        return Err("Certificate type must be Client or Subcontractor.".into());
    }
    if r.wir_ids.is_empty() { return Err("At least one WIR is required.".into()); }
    let mut tx = db(path).await?.begin().await.map_err(|e| e.to_string())?;
    if let Some(row) = sqlx::query("SELECT certificate_id FROM certificate_create_operations WHERE operation_id=?").bind(&r.operation_id).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())? {
        let certificate_id: String = row.try_get("certificate_id").map_err(|e| e.to_string())?;
        let (_, existing) = scope_doc(&mut tx, "payment_certificates", &certificate_id).await?;
        let result = CertificateDraftResult { certificate_id, status: s(&existing, "status"), line_count: existing.get("items").and_then(Value::as_array).map(Vec::len).unwrap_or(0), gross_certified_value: n(&existing, "gross_certified_value") };
        tx.rollback().await.map_err(|e| e.to_string())?;
        return Ok(result);
    }
    let outcome = async {
        let contract = sqlx::query("SELECT project_id,parent_main_contract_id,payload FROM contracts WHERE id=?")
            .bind(&r.contract_id).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?
            .ok_or("Selected contract was not found.")?;
        let contract_project: String = contract.try_get("project_id").map_err(|e| e.to_string())?;
        if contract_project != r.project_id { return Err("Contract is outside the selected project.".into()); }
        let period = sqlx::query("SELECT project_id,payload FROM reporting_periods WHERE id=?")
            .bind(&r.period_id).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?
            .ok_or("Reporting period was not found.")?;
        let period_project: String = period.try_get("project_id").map_err(|e| e.to_string())?;
        if period_project != r.project_id { return Err("Reporting period is outside the selected project.".into()); }
        let period_payload: Value = serde_json::from_str(&period.try_get::<String,_>("payload").map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        if matches!(s(&period_payload, "status").as_str(), "Locked" | "Closed") || period_payload.get("locked").and_then(Value::as_bool).unwrap_or(false) { return Err("Reporting period is locked.".into()); }
        let parent_contract: Option<String> = contract.try_get("parent_main_contract_id").map_err(|e| e.to_string())?;
        let contract_payload: Value = serde_json::from_str(&contract.try_get::<String,_>("payload").map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        let retention_rate = term(&contract_payload, &["retention_rate", "retentionRate"]).ok_or("Requires setup: contract retention rate is missing.")?;
        let tax_rate = term(&contract_payload, &["tax_rate", "taxRate"]).ok_or("Requires setup: contract tax rate is missing.")?;
        let advance_rate = term(&contract_payload, &["advance_recovery_rate", "advanceRecoveryRate"]).unwrap_or(0.0);
        let markup_rate = term(&contract_payload, &["markup_rate", "markupRate"]).unwrap_or(0.0);
        let retention_cap_amount = term(&contract_payload, &["retention_cap_amount", "retentionCapAmount"]);
        let advance_original = term(&contract_payload, &["advance_original", "advanceOriginal"]);
        if r.certificate_type == "Client" && parent_contract.is_some() { return Err("Client certificates require the main contract.".into()); }
        if r.certificate_type == "Subcontractor" && parent_contract.is_none() { return Err("Subcontractor certificates require a subcontract.".into()); }
        let id = format!("pc:{}:{}", r.contract_id, stamp());
        let mut items = Vec::new();
        let mut gross = 0.0_f64;
        for wir_id in &r.wir_ids {
            let row = sqlx::query("SELECT project_id,contract_id,boq_item_id,payload FROM wir_entries WHERE id=?")
                .bind(wir_id).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?
                .ok_or_else(|| format!("WIR {wir_id} was not found."))?;
            let project_id: String = row.try_get("project_id").map_err(|e| e.to_string())?;
            let contract_id: Option<String> = row.try_get("contract_id").map_err(|e| e.to_string())?;
            let boq_item_id: Option<String> = row.try_get("boq_item_id").map_err(|e| e.to_string())?;
            let payload: Value = serde_json::from_str(&row.try_get::<String,_>("payload").map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
            if project_id != r.project_id || contract_id.as_deref() != Some(r.contract_id.as_str()) { return Err(format!("WIR {wir_id} is outside the selected contract.")); }
            if !matches!(s(&payload, "status").as_str(), "Approved" | "Pass" | "Conditional Pass") { return Err(format!("WIR {wir_id} is not approved.")); }
            if s(&payload, "period_id") != r.period_id { return Err(format!("WIR {wir_id} is outside the selected reporting period.")); }
            let boq_id = boq_item_id.ok_or_else(|| format!("WIR {wir_id} has no BOQ item."))?;
            let boq = sqlx::query("SELECT project_id,contract_id,payload FROM boq_items WHERE id=?").bind(&boq_id).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?.ok_or("BOQ item was not found.")?;
            let boq_project: String = boq.try_get("project_id").map_err(|e| e.to_string())?;
            let boq_contract: Option<String> = boq.try_get("contract_id").map_err(|e| e.to_string())?;
            if boq_project != r.project_id || boq_contract.as_deref() != Some(r.contract_id.as_str()) { return Err(format!("BOQ item for WIR {wir_id} is outside the selected contract.")); }
            let boq_payload: Value = serde_json::from_str(&boq.try_get::<String,_>("payload").map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
            let quantity = n(&payload, "quantity");
            if quantity <= 0.0 { return Err(format!("WIR {wir_id} has no positive certified quantity.")); }
            let rate_key = if r.certificate_type == "Client" { "unit_rate" } else { "subcontract_unit_rate" };
            let rate = n(&boq_payload, rate_key);
            if rate <= 0.0 { return Err(format!("Missing governed {rate_key} for BOQ item {boq_id}.")); }
            let amount = money(quantity * rate); gross += amount;
            items.push(json!({"boq_item_id": boq_id, "wir_ids": [wir_id], "quantity": quantity, "rate": rate, "rate_source": format!("boq_items.payload.{rate_key}"), "amount": amount}));
        }
        let gross = money(gross);
        let retention_amount = money(gross * retention_rate / if retention_rate > 1.0 { 100.0 } else { 1.0 });
        let advance_recovery = money(gross * advance_rate / if advance_rate > 1.0 { 100.0 } else { 1.0 });
        let taxable = money(gross + money(gross * markup_rate / if markup_rate > 1.0 { 100.0 } else { 1.0 }) - retention_amount - advance_recovery);
        let tax_amount = money(taxable.max(0.0) * tax_rate / if tax_rate > 1.0 { 100.0 } else { 1.0 });
        let net = money(taxable + tax_amount);
        let stream = if r.certificate_type == "Client" { "ClientRevenue" } else { "SubcontractEntitlement" };
        let mut aggregated: Vec<Value> = Vec::new();
        for item in items {
            let item_boq = s(&item, "boq_item_id");
            if let Some(existing) = aggregated.iter_mut().find(|candidate| s(candidate, "boq_item_id") == item_boq) {
                let quantity = n(existing, "quantity") + n(&item, "quantity");
                let amount = n(existing, "amount") + n(&item, "amount");
                if let Some(obj) = existing.as_object_mut() {
                    obj.insert("quantity".into(), json!(quantity)); obj.insert("amount".into(), json!(money(amount)));
                    let new_ids = item.get("wir_ids").and_then(Value::as_array).cloned().unwrap_or_default();
                    if let Some(ids) = obj.get_mut("wir_ids").and_then(Value::as_array_mut) { ids.extend(new_ids); }
                }
            } else { aggregated.push(item); }
        }
        for item in &mut aggregated {
            let boq_item_id = s(item, "boq_item_id");
            let previous: f64 = sqlx::query_scalar("SELECT COALESCE(SUM(certified_quantity),0) FROM wir_certification_lock WHERE boq_item_id=? AND stream=? AND reversed_at IS NULL")
                .bind(&boq_item_id).bind(stream).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
            let previous_value: f64 = sqlx::query_scalar("SELECT COALESCE(SUM(certified_amount),0) FROM wir_certification_lock WHERE boq_item_id=? AND stream=? AND reversed_at IS NULL")
                .bind(&boq_item_id).bind(stream).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
            let current = n(item, "quantity");
            let current_value = n(item, "amount");
            if let Some(obj) = item.as_object_mut() {
                obj.insert("previous_quantity".into(), json!(previous)); obj.insert("current_quantity".into(), json!(current)); obj.insert("cumulative_quantity".into(), json!(previous + current));
                obj.insert("previous_value".into(), json!(money(previous_value))); obj.insert("current_value".into(), json!(money(current_value))); obj.insert("cumulative_value".into(), json!(money(previous_value + current_value)));
            }
        }
        let items = aggregated;
        let line_count = items.len();
        let create_scope = Scope { project_id: r.project_id.clone(), contract_id: Some(r.contract_id.clone()), boq_header_id: None, boq_item_id: None, parent_main_project_id: None, parent_main_contract_id: parent_contract.clone() };
        check_over_certification(&mut tx, &create_scope, &id, &Value::Array(items.clone())).await?;
        let certificate_number = format!("PC-{}-{}", r.contract_id, stamp());
        let tracking_id = format!("tracking:{}", id);
        let invoice_id = format!("invoice:{}", id);
        let invoice_number = format!("INV-{}", certificate_number);
        let tracking_table = if r.certificate_type == "Client" { "client_invoice_tracking" } else { "subcontractor_invoice_tracking" };
        let invoice_table = if r.certificate_type == "Client" { "client_invoices" } else { "subcontractor_invoices" };
        let payload = json!({"id": id, "project_id": r.project_id, "contract_id": r.contract_id, "period_id": r.period_id, "certificate_type": r.certificate_type, "certificate_number": certificate_number, "invoice_tracking_id": tracking_id, "status": "Draft", "items": items, "gross_certified_value": gross, "retention_rate": retention_rate, "retention_amount": retention_amount, "advance_recovery_rate": advance_rate, "advance_recovery": advance_recovery, "markup_rate": markup_rate, "tax_rate": tax_rate, "tax_amount": tax_amount, "net_certified_value": net, "retention_cap_amount": retention_cap_amount, "advance_original": advance_original, "created_at": stamp()});
        let invoice_payload = json!({"id": invoice_id, "invoice_number": invoice_number, "certificate_id": id, "certificate_type": r.certificate_type, "status": "Draft", "payment_status": "Unpaid", "amount": net, "paid_amount": 0.0, "remaining_amount": net, "invoice_date": stamp()});
        let tracking_payload = json!({"id": tracking_id, "invoice_id": invoice_id, "invoice_number": invoice_number, "certificate_id": id, "status": "Generated", "payment_status": "Unpaid", "paid_amount": 0.0, "remaining_amount": net});
        guard(&mut tx, &format!("create:{id}"), true).await?;
        sqlx::query("INSERT INTO payment_certificates(id,created_at,project_id,contract_id,payload) VALUES (?,?,?,?,?)").bind(&id).bind(stamp()).bind(&r.project_id).bind(&r.contract_id).bind(payload.to_string()).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        let invoice_sql = format!("INSERT INTO {invoice_table}(id,created_at,project_id,contract_id,payload) VALUES (?,?,?,?,?)");
        sqlx::query(&invoice_sql).bind(&invoice_id).bind(stamp()).bind(&r.project_id).bind(&r.contract_id).bind(invoice_payload.to_string()).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        let tracking_sql = format!("INSERT INTO {tracking_table}(id,created_at,project_id,contract_id,payload) VALUES (?,?,?,?,?)");
        sqlx::query(&tracking_sql).bind(&tracking_id).bind(stamp()).bind(&r.project_id).bind(&r.contract_id).bind(tracking_payload.to_string()).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO certificate_create_operations(operation_id,certificate_id,created_at) VALUES (?,?,?)")
            .bind(&r.operation_id).bind(&id).bind(stamp()).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        guard(&mut tx, &format!("create:{id}"), false).await?;
        Ok::<CertificateDraftResult,String>(CertificateDraftResult { certificate_id: id, status: "Draft".into(), line_count, gross_certified_value: gross })
    }.await;
    match outcome { Ok(result) => { tx.commit().await.map_err(|e| e.to_string())?; Ok(result) }, Err(error) => { tx.rollback().await.map_err(|e| e.to_string())?; Err(error) } }
}

/// Command: Submit payment certificate (Draft -> Submitted)
pub async fn submit_payment_certificate(
    path: &Path,
    r: SubmitCertificateRequest,
) -> Result<CertificateOperationResult, String> {
    if r.operation_id.trim().is_empty()
        || r.actor.trim().is_empty()
        || r.submitted_at.trim().is_empty()
    {
        return Err("Submit certificate requires operation ID, actor and submission date.".into());
    }

    let mut tx = db(path).await?.begin().await.map_err(|e| e.to_string())?;
    if let Some(result) = replay_operation(&mut tx, &r.operation_id, &r.certificate_id).await? {
        tx.rollback().await.map_err(|e| e.to_string())?;
        return Ok(result);
    }
    guard(&mut tx, &r.operation_id, true).await?;

    let outcome = async {
        let (_scope, mut v) = scope_doc(&mut tx, "payment_certificates", &r.certificate_id).await?;
        let current_status = s(&v, "status");
        if current_status != "Draft" {
            return Err(format!(
                "Only draft payment certificates can be submitted (current status: {current_status})."
            ));
        }

        let obj = v.as_object_mut().ok_or("Invalid certificate payload.")?;
        obj.insert("status".into(), json!("Submitted"));
        obj.insert("submitted_by".into(), json!(r.actor));
        obj.insert("submitted_date".into(), json!(r.submitted_at));

        put(&mut tx, &r.certificate_id, &v).await?;
        post(
            &mut tx,
            &r.operation_id,
            &r.certificate_id,
            "PaymentCertificateSubmit",
            &r.actor,
            &r.submitted_at,
            "Submitted payment certificate for review",
            &v,
        )
        .await?;

        Ok::<(), String>(())
    }
    .await;

    match outcome {
        Ok(()) => {
            let result = CertificateOperationResult { operation_id: r.operation_id.clone(), status: "Posted".into(), certificate_status: Some("Submitted".into()), remaining_balance: None, total_paid_amount: None };
            save_operation(&mut tx, "submit_payment_certificate", &result, &r.certificate_id).await?;
            guard(&mut tx, &r.operation_id, false).await?;
            tx.commit().await.map_err(|e| e.to_string())?;
            Ok(result)
        }
        Err(e) => {
            tx.rollback().await.map_err(|x| x.to_string())?;
            Err(e)
        }
    }
}

/// Command: Approve payment certificate with WIR locks & Over-certification check (G01, G02, G03, G07)
pub async fn approve_payment_certificate_governed(
    path: &Path,
    r: ApproveCertificateGovernedRequest,
) -> Result<CertificateOperationResult, String> {
    if r.operation_id.trim().is_empty()
        || r.actor.trim().is_empty()
        || r.approved_at.trim().is_empty()
    {
        return Err("Certificate approval requires operation ID, actor and date.".into());
    }

    let mut tx = db(path).await?.begin().await.map_err(|e| e.to_string())?;
    if let Some(result) = replay_operation(&mut tx, &r.operation_id, &r.certificate_id).await? {
        tx.rollback().await.map_err(|e| e.to_string())?;
        return Ok(result);
    }
    guard(&mut tx, &r.operation_id, true).await?;

    let outcome = async {
        let (scope, mut v) = scope_doc(&mut tx, "payment_certificates", &r.certificate_id).await?;
        let current_status = s(&v, "status");
        if current_status != "Submitted" {
            return Err(format!(
                "Only submitted payment certificates can be approved (current status: {current_status})."
            ));
        }
        if !s(&v, "submitted_by").is_empty() && s(&v, "submitted_by") == r.actor {
            return Err("Maker-checker violation: the submitter cannot approve the same certificate.".into());
        }

        if !matches!(
            s(&v, "certificate_type").as_str(),
            "Client" | "Subcontractor"
        ) {
            return Err("Certificate type must be Client or Subcontractor.".into());
        }

        let contract_id = scope.contract_id.clone().ok_or("Certificate contract scope is required.")?;
        let contract_row = sqlx::query("SELECT payload FROM contracts WHERE id=?").bind(&contract_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
        let contract_payload: Value = serde_json::from_str(&contract_row.try_get::<String,_>("payload").map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        let retention_rate = term(&contract_payload, &["retention_rate", "retentionRate"]).ok_or("Requires setup: contract retention rate is missing.")?;
        let retention_cap = term(&contract_payload, &["retention_cap_amount", "retentionCapAmount"]);
        let advance_rate = term(&contract_payload, &["advance_recovery_rate", "advanceRecoveryRate"]).unwrap_or(0.0);
        let advance_original = term(&contract_payload, &["advance_original", "advanceOriginal"]);
        let tax_rate = term(&contract_payload, &["tax_rate", "taxRate"]).unwrap_or(0.0);
        let markup_rate = term(&contract_payload, &["markup_rate", "markupRate"]).unwrap_or(0.0);
        let deductions = term(&contract_payload, &["deductions", "deduction_amount"]).unwrap_or(0.0);
        let certificate_type = s(&v, "certificate_type");
        let mut authoritative_items = v.get("items").cloned().and_then(|x| x.as_array().cloned()).ok_or("Certificate has no governed source items.")?;
        let mut derived_gross = 0.0;
        for item in &mut authoritative_items {
            let boq_item_id = s(item, "boq_item_id");
            let rate_key = if certificate_type == "Client" { "unit_rate" } else { "subcontract_unit_rate" };
            let boq_row = sqlx::query("SELECT payload FROM boq_items WHERE id=?").bind(&boq_item_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
            let boq_payload: Value = serde_json::from_str(&boq_row.try_get::<String,_>("payload").map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
            let rate = n(&boq_payload, rate_key);
            if rate <= 0.0 { return Err(format!("Missing governed {rate_key} for BOQ item {boq_item_id}.")); }
            let quantity = item.get("wir_ids").and_then(Value::as_array).map(|ids| ids.iter().filter_map(Value::as_str).count() as f64).unwrap_or(0.0);
            let quantity = if quantity > 0.0 { item.get("quantity").and_then(Value::as_f64).unwrap_or(0.0) } else { 0.0 };
            if quantity <= 0.0 { return Err(format!("Certificate line {boq_item_id} has no positive governed quantity.")); }
            let amount = money(quantity * rate); derived_gross += amount;
            if let Some(obj) = item.as_object_mut() { obj.insert("rate".into(), json!(rate)); obj.insert("rate_source".into(), json!(format!("boq_items.payload.{rate_key}"))); obj.insert("amount".into(), json!(amount)); }
        }
        let gross = money(derived_gross);
        if let Some(obj) = v.as_object_mut() { obj.insert("items".into(), Value::Array(authoritative_items)); obj.insert("gross_certified_value".into(), json!(gross)); obj.insert("retention_rate".into(), json!(retention_rate)); obj.insert("advance_recovery_rate".into(), json!(advance_rate)); obj.insert("tax_rate".into(), json!(tax_rate)); obj.insert("markup_rate".into(), json!(markup_rate)); obj.insert("deductions".into(), json!(deductions)); }
        if gross <= 0.0 {
            return Err("Payment certificate gross value must be greater than zero.".into());
        }
        if s(&v, "certificate_type") == "Subcontractor" {
            let contract_row = sqlx::query("SELECT parent_main_contract_id,payload FROM contracts WHERE id=?").bind(scope.contract_id.as_deref().unwrap_or_default()).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
            let contract_terms: Value = serde_json::from_str(&contract_row.try_get::<String,_>("payload").map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
            if contract_terms.get("back_to_back_required").and_then(Value::as_bool).unwrap_or(false) {
                let main_contract: Option<String> = contract_row.try_get("parent_main_contract_id").map_err(|e| e.to_string())?;
                let main_contract = main_contract.ok_or("Back-to-back term requires a linked main contract.")?;
                let period_id = s(&v, "period_id");
                let wir_ids: Vec<String> = v.get("items").and_then(Value::as_array).into_iter().flatten()
                    .flat_map(|item| item.get("wir_ids").and_then(Value::as_array).into_iter().flatten())
                    .filter_map(Value::as_str).map(str::to_owned).collect();
                if wir_ids.is_empty() { return Err("Back-to-back requires governed WIR sources.".into()); }
                let mut collected = 0.0;
                for wir_id in wir_ids {
                    let amount: f64 = sqlx::query_scalar("SELECT COALESCE(SUM(p.amount),0) FROM certificate_partial_payments p JOIN payment_certificates c ON c.id=p.certificate_id WHERE c.contract_id=? AND json_extract(c.payload,'$.certificate_type')='Client' AND json_extract(c.payload,'$.period_id')=? AND EXISTS (SELECT 1 FROM json_each(json_extract(c.payload,'$.items')) i, json_each(json_extract(i.value,'$.wir_ids')) w WHERE w.value=?)")
                        .bind(&main_contract).bind(&period_id).bind(&wir_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
                    collected += amount;
                }
                if collected <= 0.0 { return Err("Back-to-back contract term blocks subcontract approval until matching client Actual collection exists for the same period and WIR scope.".into()); }
            }
        }

        // Over-certification check (G07)
        if let Some(items) = v.get("items") {
            check_over_certification(&mut tx, &scope, &r.certificate_id, items).await?;
        }

        // Re-derive every allocation from the persisted certificate items. The UI
        // cannot provide quantities, amounts, period IDs, or lock rows as facts.
        let period_id = s(&v, "period_id");
        if period_id.is_empty() { return Err("Certificate reporting period is required.".into()); }
        let period_row = sqlx::query("SELECT payload FROM reporting_periods WHERE id=?").bind(&period_id).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?.ok_or("Certificate reporting period was not found.")?;
        let period_payload: Value = serde_json::from_str(&period_row.try_get::<String,_>("payload").map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        if matches!(s(&period_payload, "status").as_str(), "Locked" | "Closed") || period_payload.get("locked").and_then(Value::as_bool).unwrap_or(false) { return Err("Reporting period is locked.".into()); }
        let latest_date: Option<String> = sqlx::query_scalar("SELECT MAX(json_extract(payload,'$.certificate_date')) FROM payment_certificates WHERE contract_id=? AND json_extract(payload,'$.certificate_type')=? AND json_extract(payload,'$.status') IN ('Approved','Partially Paid','Paid')")
            .bind(scope.contract_id.as_deref().unwrap_or_default()).bind(s(&v, "certificate_type")).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
        if let Some(latest) = latest_date { if latest > r.approved_at { return Err("Certificate date regresses behind an already approved certificate.".into()); } }
        let items = v.get("items").and_then(Value::as_array).ok_or("Certificate has no governed source items.")?;
        for item in items {
            let boq_item_id = s(item, "boq_item_id");
            let item_quantity = n(item, "quantity");
            let wir_ids = item.get("wir_ids").and_then(Value::as_array).ok_or("Certificate line has no WIR sources.")?;
            for wir_value in wir_ids {
                let wir_id = wir_value.as_str().ok_or("Certificate WIR source ID is invalid.")?;
                let row = sqlx::query("SELECT project_id,contract_id,boq_item_id,payload FROM wir_entries WHERE id=?")
                    .bind(wir_id).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?
                    .ok_or_else(|| format!("WIR {wir_id} was not found."))?;
                let wir_project: String = row.try_get("project_id").map_err(|e| e.to_string())?;
                let wir_contract: Option<String> = row.try_get("contract_id").map_err(|e| e.to_string())?;
                let wir_boq: Option<String> = row.try_get("boq_item_id").map_err(|e| e.to_string())?;
                let wir_payload: Value = serde_json::from_str(&row.try_get::<String,_>("payload").map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
                if wir_project != scope.project_id || wir_contract != scope.contract_id || wir_boq.as_deref() != Some(boq_item_id.as_str()) { return Err(format!("WIR {wir_id} is outside certificate scope.")); }
                if s(&wir_payload, "period_id") != period_id || !matches!(s(&wir_payload, "status").as_str(), "Approved" | "Pass" | "Conditional Pass") { return Err(format!("WIR {wir_id} is not an eligible source for this period.")); }
                let source_quantity = n(&wir_payload, "quantity");
                let rate = n(item, "rate");
                if item_quantity <= 0.0 || source_quantity <= 0.0 || rate <= 0.0 { return Err(format!("WIR {wir_id} has invalid governed quantity/rate.")); }
                let stream = if s(&v, "certificate_type") == "Client" { "ClientRevenue" } else { "SubcontractEntitlement" };
                let existing_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM wir_certification_lock WHERE wir_id=? AND boq_item_id=? AND stream=? AND reversed_at IS NULL")
                    .bind(wir_id).bind(&boq_item_id).bind(stream).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
                if existing_count > 0 { return Err(format!("WIR {wir_id} is already actively certified in stream {stream}.")); }
                let lock_id = format!("lock:{}:{}:{}", r.certificate_id, wir_id, stream);
                sqlx::query("INSERT INTO wir_certification_lock (id,certificate_id,wir_id,period_id,boq_item_id,stream,certified_quantity,certified_amount,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
                    .bind(lock_id).bind(&r.certificate_id).bind(wir_id).bind(&period_id).bind(&boq_item_id).bind(stream)
                    .bind(source_quantity).bind(money(source_quantity * rate)).bind(stamp())
                    .execute(&mut *tx).await.map_err(|e| format!("Failed to lock WIR {wir_id}: {e}"))?;
            }
        }

        let prior_retention: f64 = sqlx::query_scalar("SELECT COALESCE(SUM(json_extract(payload,'$.retention_amount')),0) FROM payment_certificates WHERE contract_id=? AND json_extract(payload,'$.certificate_type')=? AND id<>? AND json_extract(payload,'$.status') IN ('Approved','Partially Paid','Paid')")
            .bind(&contract_id).bind(&certificate_type).bind(&r.certificate_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
        let retention_room = retention_cap.map(|cap| (cap - prior_retention).max(0.0)).unwrap_or(f64::MAX);
        let retention = money((gross * retention_rate / if retention_rate > 1.0 { 100.0 } else { 1.0 }).min(retention_room));
        let prior_advance: f64 = sqlx::query_scalar("SELECT COALESCE(SUM(json_extract(payload,'$.advance_recovery')),0) FROM payment_certificates WHERE contract_id=? AND json_extract(payload,'$.certificate_type')=? AND id<>? AND json_extract(payload,'$.status') IN ('Approved','Partially Paid','Paid')")
            .bind(&contract_id).bind(&certificate_type).bind(&r.certificate_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
        let advance_room = advance_original.map(|original| (original - prior_advance).max(0.0)).unwrap_or(f64::MAX);
        let advance_recovery = money((gross * advance_rate / if advance_rate > 1.0 { 100.0 } else { 1.0 }).min(advance_room));
        let taxable = money(gross - retention - advance_recovery - deductions);
        if taxable < -0.000001 {
            return Err("Retention, advance recovery and deductions cannot exceed gross certified value.".into());
        }

        let tax = money(taxable.max(0.0) * tax_rate / if tax_rate > 1.0 { 100.0 } else { 1.0 });
        let net = money(taxable + tax);
        let day = if s(&v, "certificate_date").is_empty() {
            r.approved_at.clone()
        } else {
            s(&v, "certificate_date")
        };
        let client = s(&v, "certificate_type") == "Client";

        let obj = v.as_object_mut().ok_or("Invalid certificate payload.")?;
        for (k, value) in [
            ("retention_amount", retention),
            ("taxable_amount", taxable),
            ("tax_amount", tax),
            ("net_certified_value", net),
            ("total_paid_amount", 0.0),
            ("remaining_balance", net),
        ] {
            obj.insert(k.into(), json!(value));
        }
        obj.insert("status".into(), json!("Approved"));
        obj.insert("approved_by".into(), json!(r.actor));
        obj.insert("approved_date".into(), json!(r.approved_at));

        put(&mut tx, &r.certificate_id, &v).await?;
        synchronize_invoice_tracking(&mut tx, &v, None, Some("Approved")).await?;
        cash(
            &mut tx,
            &scope,
            &r.certificate_id,
            &day,
            &s(&v, "certificate_number"),
            "Forecast",
            "Open",
            net,
            client,
            None,
        )
        .await?;

        post(
            &mut tx,
            &r.operation_id,
            &r.certificate_id,
            "PaymentCertificateApproval",
            &r.actor,
            &r.approved_at,
            "Approved payment certificate",
            &v,
        )
        .await?;

        Ok::<f64, String>(net)
    }
    .await;

    match outcome {
        Ok(net) => {
            let result = CertificateOperationResult { operation_id: r.operation_id.clone(), status: "Posted".into(), certificate_status: Some("Approved".into()), remaining_balance: Some(net), total_paid_amount: Some(0.0) };
            save_operation(&mut tx, "approve_payment_certificate_governed", &result, &r.certificate_id).await?;
            guard(&mut tx, &r.operation_id, false).await?;
            tx.commit().await.map_err(|e| e.to_string())?;
            Ok(result)
        }
        Err(e) => {
            tx.rollback().await.map_err(|x| x.to_string())?;
            Err(e)
        }
    }
}

/// Command: Record Partial Payment (G05)
pub async fn record_partial_payment(
    path: &Path,
    r: PartialPaymentRequest,
) -> Result<CertificateOperationResult, String> {
    if r.operation_id.trim().is_empty()
        || r.actor.trim().is_empty()
        || r.payment_date.trim().is_empty()
    {
        return Err("Partial payment requires operation ID, actor and payment date.".into());
    }
    if r.amount <= 0.0 {
        return Err("Partial payment amount must be greater than zero.".into());
    }

    let mut tx = db(path).await?.begin().await.map_err(|e| e.to_string())?;
    if let Some(row) = sqlx::query("SELECT certificate_id FROM certificate_partial_payments WHERE operation_id=?")
        .bind(&r.operation_id).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())? {
        let existing_certificate: String = row.try_get("certificate_id").map_err(|e| e.to_string())?;
        if existing_certificate != r.certificate_id { return Err("Operation ID is already bound to another certificate.".into()); }
        let (_, existing) = scope_doc(&mut tx, "payment_certificates", &r.certificate_id).await?;
        let remaining = n(&existing, "remaining_balance");
        let paid = n(&existing, "total_paid_amount");
        tx.rollback().await.map_err(|e| e.to_string())?;
        return Ok(CertificateOperationResult { operation_id: r.operation_id, status: "Replayed".into(), certificate_status: Some(s(&existing, "status")), remaining_balance: Some(remaining), total_paid_amount: Some(paid) });
    }
    guard(&mut tx, &r.operation_id, true).await?;

    let outcome = async {
        let (scope, mut v) = scope_doc(&mut tx, "payment_certificates", &r.certificate_id).await?;
        let current_status = s(&v, "status");
        if current_status != "Approved" && current_status != "Partially Paid" {
            return Err(format!(
                "Only approved or partially paid certificates can receive partial payments (current status: {current_status})."
            ));
        }

        let net_certified = n(&v, "net_certified_value");
        let prior_paid = n(&v, "total_paid_amount");
        let remaining = if v.get("remaining_balance").is_some() {
            n(&v, "remaining_balance")
        } else {
            money(net_certified - prior_paid)
        };

        if r.amount > remaining + 0.000001 {
            return Err(format!(
                "Payment amount ({}) exceeds remaining certificate balance ({}).",
                r.amount, remaining
            ));
        }

        let payment_id = format!("pay:{}:{}", r.certificate_id, stamp());
        let ref_str = r.reference.as_deref().unwrap_or("Partial Payment");

        sqlx::query(
            r#"
            INSERT INTO certificate_partial_payments (payment_id, certificate_id, payment_date, amount, reference, operation_id)
            VALUES (?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&payment_id)
        .bind(&r.certificate_id)
        .bind(&r.payment_date)
        .bind(r.amount)
        .bind(ref_str)
        .bind(&r.operation_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to record partial payment: {e}"))?;

        let new_paid = money(prior_paid + r.amount);
        let new_remaining = money((net_certified - new_paid).max(0.0));
        let new_status = if new_remaining <= 0.000001 {
            "Paid"
        } else {
            "Partially Paid"
        };

        let client = s(&v, "certificate_type") == "Client";
        let obj = v.as_object_mut().ok_or("Invalid certificate payload.")?;
        obj.insert("total_paid_amount".into(), json!(new_paid));
        obj.insert("remaining_balance".into(), json!(new_remaining));
        obj.insert("status".into(), json!(new_status));
        obj.insert("last_payment_date".into(), json!(r.payment_date));
        if new_status == "Paid" {
            obj.insert("paid_by".into(), json!(r.actor));
            obj.insert("payment_date".into(), json!(r.payment_date));
        }

        put(&mut tx, &r.certificate_id, &v).await?;
        synchronize_invoice_tracking(&mut tx, &v, Some(&r.payment_date), Some(new_status)).await?;

        cash(
            &mut tx,
            &scope,
            &r.certificate_id,
            &r.payment_date,
            &s(&v, "certificate_number"),
            "Actual",
            "Settled",
            r.amount,
            client,
            Some(&payment_id),
        )
        .await?;

        post(
            &mut tx,
            &r.operation_id,
            &r.certificate_id,
            "PaymentCertificatePartialPayment",
            &r.actor,
            &r.payment_date,
            &format!("Recorded partial payment of {} ({})", r.amount, ref_str),
            &v,
        )
        .await?;

        Ok::<(String, f64, f64), String>((new_status.to_string(), new_remaining, new_paid))
    }
    .await;

    match outcome {
        Ok((new_status, new_remaining, new_paid)) => {
            let result = CertificateOperationResult { operation_id: r.operation_id.clone(), status: "Posted".into(), certificate_status: Some(new_status), remaining_balance: Some(new_remaining), total_paid_amount: Some(new_paid) };
            save_operation(&mut tx, "record_partial_payment", &result, &r.certificate_id).await?;
            guard(&mut tx, &r.operation_id, false).await?;
            tx.commit().await.map_err(|e| e.to_string())?;
            Ok(result)
        }
        Err(e) => {
            tx.rollback().await.map_err(|x| x.to_string())?;
            Err(e)
        }
    }
}

/// Command: Reverse Payment Certificate & Release WIR Locks (G08)
pub async fn reverse_certificate_governed(
    path: &Path,
    r: ReverseCertificateRequest,
) -> Result<CertificateOperationResult, String> {
    if r.operation_id.trim().is_empty()
        || r.actor.trim().is_empty()
        || r.reason.trim().is_empty()
    {
        return Err("Certificate reversal requires operation ID, actor and reason.".into());
    }

    let mut tx = db(path).await?.begin().await.map_err(|e| e.to_string())?;
    if let Some(result) = replay_operation(&mut tx, &r.operation_id, &r.certificate_id).await? {
        tx.rollback().await.map_err(|e| e.to_string())?;
        return Ok(result);
    }
    guard(&mut tx, &r.operation_id, true).await?;

    let outcome = async {
        let (scope, mut v) = scope_doc(&mut tx, "payment_certificates", &r.certificate_id).await?;
        let current_status = s(&v, "status");
        if !matches!(
            current_status.as_str(),
            "Submitted" | "Approved" | "Partially Paid" | "Paid"
        ) {
            return Err(format!(
                "Only submitted, approved, partially paid, or paid certificates can be reversed (current status: {current_status})."
            ));
        }

        // Locks and payment history are append-only. A reversal records a
        // linked compensating entry instead of deleting the source lock.
        let locked = sqlx::query("SELECT wir_id,stream FROM wir_certification_lock WHERE certificate_id=? AND reversed_at IS NULL")
            .bind(&r.certificate_id).fetch_all(&mut *tx).await.map_err(|e| e.to_string())?;
        for row in locked {
            let wir_id: String = row.try_get("wir_id").map_err(|e| e.to_string())?;
            let stream: String = row.try_get("stream").map_err(|e| e.to_string())?;
            let reversal_id = format!("reversal-lock:{}:{}:{}", r.certificate_id, wir_id, stream);
            sqlx::query("INSERT INTO certificate_lock_reversals(reversal_id,certificate_id,wir_id,stream,operation_id,created_at,reason) VALUES (?,?,?,?,?,?,?)")
                .bind(reversal_id).bind(&r.certificate_id).bind(&wir_id).bind(&stream).bind(&r.operation_id).bind(stamp()).bind(&r.reason)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
            sqlx::query("UPDATE wir_certification_lock SET reversed_at=? WHERE certificate_id=? AND wir_id=? AND stream=? AND reversed_at IS NULL")
                .bind(stamp()).bind(&r.certificate_id).bind(&wir_id).bind(&stream)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }

        let obj = v.as_object_mut().ok_or("Invalid certificate payload.")?;
        obj.insert("status".into(), json!("Reversed"));
        obj.insert("reversed_by".into(), json!(r.actor));
        obj.insert("reversal_reason".into(), json!(r.reason));
        obj.insert("remaining_balance".into(), json!(0.0));

        put(&mut tx, &r.certificate_id, &v).await?;
        synchronize_invoice_tracking(&mut tx, &v, None, Some("Reversed")).await?;

        // Revert forecast and every actual payment with append-only compensating cash entries.
        let client = s(&v, "certificate_type") == "Client";
        let original_net = n(&v, "net_certified_value");
        cash_reversal(&mut tx, &scope, &r.certificate_id, &stamp(), &s(&v, "certificate_number"), original_net, client).await?;
        let payments = sqlx::query("SELECT payment_id,amount,payment_date FROM certificate_partial_payments WHERE certificate_id=?")
            .bind(&r.certificate_id).fetch_all(&mut *tx).await.map_err(|e| e.to_string())?;
        for payment in payments {
            let payment_id: String = payment.try_get("payment_id").map_err(|e| e.to_string())?;
            let amount: f64 = payment.try_get("amount").map_err(|e| e.to_string())?;
            let payment_date: String = payment.try_get("payment_date").map_err(|e| e.to_string())?;
            cash_reversal(&mut tx, &scope, &format!("{}:{}", r.certificate_id, payment_id), &payment_date, &s(&v, "certificate_number"), amount, client).await?;
        }

        post(
            &mut tx,
            &r.operation_id,
            &r.certificate_id,
            "PaymentCertificateReversal",
            &r.actor,
            &stamp(),
            &r.reason,
            &v,
        )
        .await?;

        Ok::<(), String>(())
    }
    .await;

    match outcome {
        Ok(()) => {
            let result = CertificateOperationResult { operation_id: r.operation_id.clone(), status: "Posted".into(), certificate_status: Some("Reversed".into()), remaining_balance: Some(0.0), total_paid_amount: None };
            save_operation(&mut tx, "reverse_certificate_governed", &result, &r.certificate_id).await?;
            guard(&mut tx, &r.operation_id, false).await?;
            tx.commit().await.map_err(|e| e.to_string())?;
            Ok(result)
        }
        Err(e) => {
            tx.rollback().await.map_err(|x| x.to_string())?;
            Err(e)
        }
    }
}

/// Helper query to get partial payments for a certificate
pub async fn get_certificate_partial_payments(
    path: &Path,
    certificate_id: String,
) -> Result<Vec<PartialPaymentRecord>, String> {
    let pool = db(path).await?;
    let rows = sqlx::query(
        r#"
        SELECT payment_id, certificate_id, payment_date, amount, reference, created_at
        FROM certificate_partial_payments
        WHERE certificate_id = ?
        ORDER BY created_at ASC
        "#,
    )
    .bind(&certificate_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let records = rows
        .into_iter()
        .map(|r| PartialPaymentRecord {
            payment_id: r.get("payment_id"),
            certificate_id: r.get("certificate_id"),
            payment_date: r.get("payment_date"),
            amount: r.get("amount"),
            reference: r.get("reference"),
            created_at: r.get("created_at"),
        })
        .collect();

    Ok(records)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    #[tokio::test]
    async fn w04_sqlite_lock_streams_are_unique_and_reversal_is_append_only() {
        let pool = SqlitePoolOptions::new().connect("sqlite::memory:").await.unwrap();
        sqlx::query("CREATE TABLE wir_certification_lock (id TEXT PRIMARY KEY, certificate_id TEXT, wir_id TEXT, stream TEXT, period_id TEXT, boq_item_id TEXT, certified_quantity REAL, certified_amount REAL, created_at TEXT, UNIQUE(wir_id, stream))")
            .execute(&pool).await.unwrap();
        sqlx::query("CREATE TABLE certificate_lock_reversals (reversal_id TEXT PRIMARY KEY, certificate_id TEXT, wir_id TEXT, stream TEXT, operation_id TEXT, created_at TEXT, reason TEXT)")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO wir_certification_lock VALUES ('l1','c1','w1','ClientRevenue','p1','b1',10,100,'now')")
            .execute(&pool).await.unwrap();
        let duplicate = sqlx::query("INSERT INTO wir_certification_lock VALUES ('l2','c2','w1','ClientRevenue','p2','b1',5,50,'now')").execute(&pool).await;
        assert!(duplicate.is_err(), "the same WIR cannot be certified twice in one entitlement stream");
        sqlx::query("INSERT INTO certificate_lock_reversals VALUES ('r1','c1','w1','ClientRevenue','op1','now','correction')")
            .execute(&pool).await.unwrap();
        let original: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM wir_certification_lock WHERE id='l1'").fetch_one(&pool).await.unwrap();
        let reversal: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM certificate_lock_reversals WHERE reversal_id='r1'").fetch_one(&pool).await.unwrap();
        assert_eq!(original.0, 1);
        assert_eq!(reversal.0, 1);
    }

    #[tokio::test]
    async fn w04_sqlite_partial_payment_ledger_rejects_invalid_and_preserves_history() {
        let pool = SqlitePoolOptions::new().connect("sqlite::memory:").await.unwrap();
        sqlx::query("CREATE TABLE payments (id TEXT PRIMARY KEY, certificate_id TEXT, amount REAL CHECK(amount > 0), operation_id TEXT UNIQUE)")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO payments VALUES ('p1','c1',25,'op1'),('p2','c1',25,'op2')")
            .execute(&pool).await.unwrap();
        assert!(sqlx::query("INSERT INTO payments VALUES ('p3','c1',0,'op3')").execute(&pool).await.is_err());
        assert!(sqlx::query("INSERT INTO payments VALUES ('p4','c1',10,'op1')").execute(&pool).await.is_err());
        let total: (f64,) = sqlx::query_as("SELECT SUM(amount) FROM payments WHERE certificate_id='c1'").fetch_one(&pool).await.unwrap();
        assert_eq!(total.0, 50.0);
    }

    #[test]
    fn w04_commercial_money_rounding_preserves_two_decimals() {
        assert_eq!(money(100.456), 100.46);
        assert_eq!(money(100.454), 100.45);
        assert_eq!(money(0.0), 0.0);
    }

    #[tokio::test]
    async fn w04_sqlite_partial_payment_triggers_prevent_update_and_delete() {
        let pool = SqlitePoolOptions::new().connect("sqlite::memory:").await.unwrap();
        sqlx::query("CREATE TABLE certificate_partial_payments (payment_id TEXT PRIMARY KEY, certificate_id TEXT, payment_date TEXT, amount REAL CHECK(amount > 0), reference TEXT, operation_id TEXT UNIQUE, created_at TEXT)")
            .execute(&pool).await.unwrap();
        sqlx::query("CREATE TRIGGER certificate_partial_payment_immutable_update BEFORE UPDATE ON certificate_partial_payments BEGIN SELECT RAISE(ABORT, 'Partial payment ledger is append-only.'); END;")
            .execute(&pool).await.unwrap();
        sqlx::query("CREATE TRIGGER certificate_partial_payment_immutable_delete BEFORE DELETE ON certificate_partial_payments BEGIN SELECT RAISE(ABORT, 'Partial payment ledger is append-only.'); END;")
            .execute(&pool).await.unwrap();

        sqlx::query("INSERT INTO certificate_partial_payments VALUES ('pay1', 'cert1', '2026-09-09', 100.0, 'ref1', 'op1', 'now')")
            .execute(&pool).await.unwrap();

        let update_res = sqlx::query("UPDATE certificate_partial_payments SET amount = 200.0 WHERE payment_id = 'pay1'")
            .execute(&pool).await;
        assert!(update_res.is_err(), "Update on partial payments ledger must be aborted");

        let delete_res = sqlx::query("DELETE FROM certificate_partial_payments WHERE payment_id = 'pay1'")
            .execute(&pool).await;
        assert!(delete_res.is_err(), "Delete on partial payments ledger must be aborted");
    }

    #[tokio::test]
    async fn w04_sqlite_governed_certificate_guards_prevent_tampering() {
        let pool = SqlitePoolOptions::new().connect("sqlite::memory:").await.unwrap();
        sqlx::query("CREATE TABLE certificate_mutation_guard (operation_id TEXT PRIMARY KEY, created_at TEXT)")
            .execute(&pool).await.unwrap();
        sqlx::query("CREATE TABLE payment_certificates (id TEXT PRIMARY KEY, payload TEXT)")
            .execute(&pool).await.unwrap();
        sqlx::query("CREATE TRIGGER payment_certificate_governed_update_guard BEFORE UPDATE ON payment_certificates WHEN json_extract(OLD.payload,'$.status') IN ('Submitted','Approved','Partially Paid','Paid','Reversed') AND NOT EXISTS (SELECT 1 FROM certificate_mutation_guard WHERE operation_id LIKE 'internal:payment_certificates:%') BEGIN SELECT RAISE(ABORT, 'Governed payment certificate updates require a lifecycle transaction.'); END;")
            .execute(&pool).await.unwrap();

        sqlx::query("INSERT INTO payment_certificates VALUES ('c1', '{\"status\":\"Approved\",\"gross\":5000}')")
            .execute(&pool).await.unwrap();

        let unshielded_update = sqlx::query("UPDATE payment_certificates SET payload = '{\"status\":\"Approved\",\"gross\":9999}' WHERE id = 'c1'")
            .execute(&pool).await;
        assert!(unshielded_update.is_err(), "Unshielded update on approved certificate must fail");

        // With guard, update succeeds
        sqlx::query("INSERT INTO certificate_mutation_guard VALUES ('internal:payment_certificates:c1', 'now')")
            .execute(&pool).await.unwrap();
        let shielded_update = sqlx::query("UPDATE payment_certificates SET payload = '{\"status\":\"Approved\",\"gross\":6000}' WHERE id = 'c1'")
            .execute(&pool).await;
        assert!(shielded_update.is_ok(), "Shielded update must succeed");
    }

    #[tokio::test]
    async fn w04_sqlite_operation_results_table_supports_idempotent_replay() {
        let pool = SqlitePoolOptions::new().connect("sqlite::memory:").await.unwrap();
        sqlx::query("CREATE TABLE certificate_operation_results (operation_id TEXT PRIMARY KEY, certificate_id TEXT NOT NULL, command TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL)")
            .execute(&pool).await.unwrap();

        sqlx::query("INSERT INTO certificate_operation_results VALUES ('op-rec-1', 'c1', 'record_partial_payment', '{\"status\":\"Partially Paid\",\"remaining_balance\":1500.0}', 'now')")
            .execute(&pool).await.unwrap();

        let duplicate = sqlx::query("INSERT INTO certificate_operation_results VALUES ('op-rec-1', 'c1', 'record_partial_payment', '{\"status\":\"Partially Paid\"}', 'now')")
            .execute(&pool).await;
        assert!(duplicate.is_err(), "Duplicate operation_id must fail unique constraint");

        let cached: (String,) = sqlx::query_as("SELECT result_json FROM certificate_operation_results WHERE operation_id = 'op-rec-1'")
            .fetch_one(&pool).await.unwrap();
        assert!(cached.0.contains("1500.0"));
    }
}

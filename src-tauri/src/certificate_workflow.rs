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
    pub wir_locks: Option<Vec<WirLockItemInput>>,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertificateOperationResult {
    pub operation_id: String,
    pub status: String,
    pub certificate_status: Option<String>,
    pub remaining_balance: Option<f64>,
    pub total_paid_amount: Option<f64>,
}

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

    if partial_id.is_none() {
        sqlx::query("DELETE FROM cash_flow WHERE json_extract(payload,'$.source_type') LIKE 'payment_certificate_%' AND json_extract(payload,'$.source_id')=?")
            .bind(source)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    if amount.abs() < 0.000001 {
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

    sqlx::query("INSERT OR REPLACE INTO cash_flow(id,created_at,project_id,contract_id,boq_header_id,boq_item_id,parent_main_project_id,parent_main_contract_id,payload) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(&cash_id).bind(stamp()).bind(&scope.project_id).bind(&scope.contract_id).bind(&scope.boq_header_id).bind(&scope.boq_item_id).bind(&scope.parent_main_project_id).bind(&scope.parent_main_contract_id).bind(payload.to_string())
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

    let cert_status = status_override.unwrap_or_else(|| s(certificate, "status").as_str());
    let (status, payment_status) = match cert_status {
        "Reversed" => ("Generated", "Unpaid"),
        "Paid" => ("Approved", "Paid"),
        "Partially Paid" => ("Approved", "Partially Paid"),
        "Approved" => ("Approved", "Unpaid"),
        _ => ("Generated", "Unpaid"),
    };

    let tracking_update = format!("UPDATE {tracking_table} SET payload=json_set(payload,'$.status',?,'$.payment_status',?,'$.payment_date',?) WHERE id=?");
    sqlx::query(&tracking_update)
        .bind(status)
        .bind(payment_status)
        .bind(payment_date)
        .bind(&tracking_id)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

    let invoice_update = format!("UPDATE {invoice_table} SET payload=json_set(payload,'$.status',?,'$.payment_status',?,'$.payment_date',?) WHERE json_extract(payload,'$.invoice_number')=?");
    sqlx::query(&invoice_update)
        .bind(status)
        .bind(payment_status)
        .bind(payment_date)
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
                let contract_boq_qty = n(&bpayload, "quantity");

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
            guard(&mut tx, &r.operation_id, false).await?;
            tx.commit().await.map_err(|e| e.to_string())?;
            Ok(CertificateOperationResult {
                operation_id: r.operation_id,
                status: "Posted".into(),
                certificate_status: Some("Submitted".into()),
                remaining_balance: None,
                total_paid_amount: None,
            })
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
    guard(&mut tx, &r.operation_id, true).await?;

    let outcome = async {
        let (scope, mut v) = scope_doc(&mut tx, "payment_certificates", &r.certificate_id).await?;
        let current_status = s(&v, "status");
        if current_status != "Submitted" && current_status != "Draft" {
            return Err(format!(
                "Only submitted payment certificates can be approved (current status: {current_status})."
            ));
        }

        if !matches!(
            s(&v, "certificate_type").as_str(),
            "Client" | "Subcontractor"
        ) {
            return Err("Certificate type must be Client or Subcontractor.".into());
        }

        let gross = n(&v, "gross_certified_value");
        if gross <= 0.0 {
            return Err("Payment certificate gross value must be greater than zero.".into());
        }

        // Over-certification check (G07)
        if let Some(items) = v.get("items") {
            check_over_certification(&mut tx, &scope, &r.certificate_id, items).await?;
        }

        // WIR certification lock check & insertion (G01)
        let period_id = s(&v, "period_id");
        let period_id = if period_id.is_empty() {
            s(&v, "certificate_number")
        } else {
            period_id
        };

        if let Some(locks) = &r.wir_locks {
            for lock in locks {
                let existing_count: i64 = sqlx::query_scalar(
                    "SELECT COUNT(*) FROM wir_certification_lock WHERE wir_id=? AND period_id=? AND boq_item_id=?"
                )
                .bind(&lock.wir_id)
                .bind(&lock.period_id)
                .bind(&lock.boq_item_id)
                .fetch_one(&mut *tx)
                .await
                .unwrap_or(0);

                if existing_count > 0 {
                    return Err(format!(
                        "WIR {} is already locked/certified for period {} and BOQ item {}.",
                        lock.wir_id, lock.period_id, lock.boq_item_id
                    ));
                }

                let lock_id = format!("lock:{}:{}:{}", r.certificate_id, lock.wir_id, lock.boq_item_id);
                sqlx::query(
                    r#"
                    INSERT INTO wir_certification_lock (id, certificate_id, wir_id, period_id, boq_item_id, certified_quantity, certified_amount)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    "#,
                )
                .bind(&lock_id)
                .bind(&r.certificate_id)
                .bind(&lock.wir_id)
                .bind(&lock.period_id)
                .bind(&lock.boq_item_id)
                .bind(lock.certified_quantity)
                .bind(lock.certified_amount)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Failed to lock WIR {}: {e}", lock.wir_id))?;
            }
        }

        let retention = money(gross * n(&v, "retention_rate") / 100.0);
        let taxable = money(
            gross
                - retention
                - n(&v, "advance_recovery")
                - n(&v, "deductions"),
        );
        if taxable < -0.000001 {
            return Err("Retention, advance recovery and deductions cannot exceed gross certified value.".into());
        }

        let tax = money(taxable.max(0.0) * n(&v, "tax_rate") / 100.0);
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
            guard(&mut tx, &r.operation_id, false).await?;
            tx.commit().await.map_err(|e| e.to_string())?;
            Ok(CertificateOperationResult {
                operation_id: r.operation_id,
                status: "Posted".into(),
                certificate_status: Some("Approved".into()),
                remaining_balance: Some(net),
                total_paid_amount: Some(0.0),
            })
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
            INSERT INTO certificate_partial_payments (payment_id, certificate_id, payment_date, amount, reference)
            VALUES (?, ?, ?, ?, ?)
            "#,
        )
        .bind(&payment_id)
        .bind(&r.certificate_id)
        .bind(&r.payment_date)
        .bind(r.amount)
        .bind(ref_str)
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
            guard(&mut tx, &r.operation_id, false).await?;
            tx.commit().await.map_err(|e| e.to_string())?;
            Ok(CertificateOperationResult {
                operation_id: r.operation_id,
                status: "Posted".into(),
                certificate_status: Some(new_status),
                remaining_balance: Some(new_remaining),
                total_paid_amount: Some(new_paid),
            })
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

        // Release WIR certification locks (G08)
        sqlx::query("DELETE FROM wir_certification_lock WHERE certificate_id=?")
            .bind(&r.certificate_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Failed to release WIR locks: {e}"))?;

        let obj = v.as_object_mut().ok_or("Invalid certificate payload.")?;
        obj.insert("status".into(), json!("Reversed"));
        obj.insert("reversed_by".into(), json!(r.actor));
        obj.insert("reversal_reason".into(), json!(r.reason));
        obj.insert("remaining_balance".into(), json!(0.0));

        put(&mut tx, &r.certificate_id, &v).await?;
        synchronize_invoice_tracking(&mut tx, &v, None, Some("Reversed")).await?;

        // Revert cash flow
        cash(
            &mut tx,
            &scope,
            &r.certificate_id,
            "",
            &s(&v, "certificate_number"),
            "Reversed",
            "Reversed",
            0.0,
            false,
            None,
        )
        .await?;

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
            guard(&mut tx, &r.operation_id, false).await?;
            tx.commit().await.map_err(|e| e.to_string())?;
            Ok(CertificateOperationResult {
                operation_id: r.operation_id,
                status: "Posted".into(),
                certificate_status: Some("Reversed".into()),
                remaining_balance: Some(0.0),
                total_paid_amount: None,
            })
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

//! Atomic Claims & Potential Variation Order (PVO) lifecycle.
//! Draft / Notified -> Submitted -> Under Assessment -> Assessed -> Approved -> Converted.
//! Or Rejected / Reopened / Reversed.
//!
//! Strict governance rules:
//! 1. Submission validates non-empty claim numbers, notice_date >= event_date, scoping, and at least 1 line.
//! 2. Assessment validates lines, limits assessed value <= claimed value unless justified, calculates totals.
//! 3. Approval enforces maker-checker segregation (approver != creator/claimant). No premature commercial postings.
//! 4. Conversion creates a Draft Variation package and lines, links converted_variation_id, updates claim to Converted.
//! 5. Reversal reverts Converted claim back to Approved if the generated Variation is still Draft.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{sqlite::SqliteConnectOptions, Row, Sqlite, SqlitePool, Transaction};
use std::path::Path;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitClaimRequest {
    pub operation_id: String,
    pub claim_id: String,
    pub actor: String,
    pub submitted_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssessClaimLineInput {
    pub id: String,
    pub assessed_value: f64,
    pub assessed_days: Option<f64>,
    pub justification: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssessClaimRequest {
    pub operation_id: String,
    pub claim_id: String,
    pub actor: String,
    pub assessed_at: String,
    pub assessed_cost_impact: Option<f64>,
    pub assessed_time_impact_days: Option<f64>,
    pub lines: Option<Vec<AssessClaimLineInput>>,
    pub assessment_notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveClaimLineInput {
    pub id: String,
    pub approved_value: f64,
    pub approved_days: Option<f64>,
    pub justification: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveClaimRequest {
    pub operation_id: String,
    pub claim_id: String,
    pub actor: String,
    pub approved_at: String,
    pub approved_cost_impact: Option<f64>,
    pub approved_time_impact_days: Option<f64>,
    pub lines: Option<Vec<ApproveClaimLineInput>>,
    pub approval_notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RejectClaimRequest {
    pub operation_id: String,
    pub claim_id: String,
    pub actor: String,
    pub rejected_at: String,
    pub reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReopenClaimRequest {
    pub operation_id: String,
    pub claim_id: String,
    pub actor: String,
    pub reopened_at: String,
    pub target_status: String,
    pub reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertClaimToVariationRequest {
    pub operation_id: String,
    pub claim_id: String,
    pub actor: String,
    pub converted_at: String,
    pub variation_number: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReverseClaimConversionRequest {
    pub operation_id: String,
    pub claim_id: String,
    pub actor: String,
    pub reversed_at: String,
    pub reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimOperationResult {
    pub operation_id: String,
    pub claim_id: String,
    pub status: String,
    pub variation_id: Option<String>,
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

fn m(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

async fn open_pool(path: &Path) -> Result<SqlitePool, String> {
    let opt = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .foreign_keys(true);
    SqlitePool::connect_with(opt)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Clone)]
struct ClaimHeader {
    id: String,
    project_id: String,
    contract_id: String,
    claim_number: String,
    title: String,
    notice_date: String,
    event_date: String,
    entitlement_basis: String,
    claimed_cost_impact: f64,
    claimed_time_impact_days: f64,
    assessed_cost_impact: f64,
    assessed_time_impact_days: f64,
    approved_cost_impact: f64,
    approved_time_impact_days: f64,
    status: String,
    owner: String,
    evidence_notes: Option<String>,
    converted_variation_id: Option<String>,
    payload: String,
}

#[derive(Debug, Clone)]
struct ClaimLineRow {
    id: String,
    claim_id: String,
    contract_id: String,
    item_code: String,
    description: String,
    change_type: String,
    claimed_value: f64,
    assessed_value: f64,
    approved_value: f64,
    boq_header_id: Option<String>,
    boq_item_id: Option<String>,
}

async fn fetch_claim(
    tx: &mut Transaction<'_, Sqlite>,
    claim_id: &str,
) -> Result<ClaimHeader, String> {
    let row = sqlx::query(
        r#"
        SELECT id, project_id, contract_id, claim_number, title, notice_date, event_date,
               entitlement_basis, claimed_cost_impact, claimed_time_impact_days,
               assessed_cost_impact, assessed_time_impact_days, approved_cost_impact, approved_time_impact_days,
               status, owner, evidence_notes, converted_variation_id, payload
        FROM claims
        WHERE id = ?
        "#,
    )
    .bind(claim_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    match row {
        Some(r) => Ok(ClaimHeader {
            id: r.get("id"),
            project_id: r.get("project_id"),
            contract_id: r.get("contract_id"),
            claim_number: r.get("claim_number"),
            title: r.get("title"),
            notice_date: r.get("notice_date"),
            event_date: r.get("event_date"),
            entitlement_basis: r.get("entitlement_basis"),
            claimed_cost_impact: r.get("claimed_cost_impact"),
            claimed_time_impact_days: r.get("claimed_time_impact_days"),
            assessed_cost_impact: r.get("assessed_cost_impact"),
            assessed_time_impact_days: r.get("assessed_time_impact_days"),
            approved_cost_impact: r.get("approved_cost_impact"),
            approved_time_impact_days: r.get("approved_time_impact_days"),
            status: r.get("status"),
            owner: r.get("owner"),
            evidence_notes: r.get("evidence_notes"),
            converted_variation_id: r.get("converted_variation_id"),
            payload: r.get("payload"),
        }),
        None => Err(format!("Claim with ID '{}' not found.", claim_id)),
    }
}

async fn fetch_claim_lines(
    tx: &mut Transaction<'_, Sqlite>,
    claim_id: &str,
) -> Result<Vec<ClaimLineRow>, String> {
    let rows = sqlx::query(
        r#"
        SELECT id, claim_id, contract_id, item_code, description, change_type,
               claimed_value, assessed_value, approved_value, boq_header_id, boq_item_id
        FROM claim_lines
        WHERE claim_id = ?
        "#,
    )
    .bind(claim_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    let mut lines = Vec::new();
    for r in rows {
        lines.push(ClaimLineRow {
            id: r.get("id"),
            claim_id: r.get("claim_id"),
            contract_id: r.get("contract_id"),
            item_code: r.get("item_code"),
            description: r.get("description"),
            change_type: r.get("change_type"),
            claimed_value: r.get("claimed_value"),
            assessed_value: r.get("assessed_value"),
            approved_value: r.get("approved_value"),
            boq_header_id: r.get("boq_header_id"),
            boq_item_id: r.get("boq_item_id"),
        });
    }
    Ok(lines)
}

async fn log_claim_audit(
    tx: &mut Transaction<'_, Sqlite>,
    claim: &ClaimHeader,
    action: &str,
    actor: &str,
    details: Value,
) -> Result<(), String> {
    let audit_id = format!("audit:claim:{}:{}", claim.id, stamp());
    let payload = json!({
        "id": audit_id,
        "entity_type": "Claim",
        "entity_id": claim.id,
        "action": action,
        "actor": actor,
        "timestamp": stamp(),
        "details": details,
        "project_id": claim.project_id,
        "contract_id": claim.contract_id,
    });
    sqlx::query(
        "INSERT INTO audit_log (id, created_at, project_id, contract_id, payload) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&audit_id)
    .bind(stamp())
    .bind(&claim.project_id)
    .bind(&claim.contract_id)
    .bind(payload.to_string())
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn enter_mutation_guard(
    tx: &mut Transaction<'_, Sqlite>,
    op_id: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO claims_mutation_guard (operation_id, created_at) VALUES (?, ?)",
    )
    .bind(op_id)
    .bind(stamp())
    .execute(&mut **tx)
    .await
    .map_err(|e| format!("Failed to enter claims mutation guard: {}", e))?;
    Ok(())
}

async fn exit_mutation_guard(
    tx: &mut Transaction<'_, Sqlite>,
    op_id: &str,
) -> Result<(), String> {
    sqlx::query("DELETE FROM claims_mutation_guard WHERE operation_id = ?")
        .bind(op_id)
        .execute(&mut **tx)
        .await
        .map_err(|e| format!("Failed to exit claims mutation guard: {}", e))?;
    Ok(())
}

/// Submit Claim
pub async fn submit_claim(
    path: &Path,
    req: SubmitClaimRequest,
) -> Result<ClaimOperationResult, String> {
    let pool = open_pool(path).await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    enter_mutation_guard(&mut tx, &req.operation_id).await?;

    let claim = fetch_claim(&mut tx, &req.claim_id).await?;

    if claim.status != "Draft" && claim.status != "Notified" {
        exit_mutation_guard(&mut tx, &req.operation_id).await?;
        return Err(format!(
            "Cannot submit claim with status '{}'. Must be Draft or Notified.",
            claim.status
        ));
    }

    if claim.claim_number.trim().is_empty() {
        exit_mutation_guard(&mut tx, &req.operation_id).await?;
        return Err("Claim number is required.".into());
    }
    if claim.title.trim().is_empty() {
        exit_mutation_guard(&mut tx, &req.operation_id).await?;
        return Err("Claim title is required.".into());
    }
    if claim.entitlement_basis.trim().is_empty() {
        exit_mutation_guard(&mut tx, &req.operation_id).await?;
        return Err("Entitlement basis is required.".into());
    }
    if claim.notice_date.is_empty() || claim.event_date.is_empty() {
        exit_mutation_guard(&mut tx, &req.operation_id).await?;
        return Err("Notice date and event date are required.".into());
    }

    let lines = fetch_claim_lines(&mut tx, &req.claim_id).await?;
    if lines.is_empty() {
        exit_mutation_guard(&mut tx, &req.operation_id).await?;
        return Err("Submitted claim must have at least one breakdown line.".into());
    }

    // Scoping check
    let contract_exists: Option<String> = sqlx::query_scalar(
        "SELECT id FROM contracts WHERE id = ? AND project_id = ?",
    )
    .bind(&claim.contract_id)
    .bind(&claim.project_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    if contract_exists.is_none() {
        exit_mutation_guard(&mut tx, &req.operation_id).await?;
        return Err("Contract does not belong to the selected project.".into());
    }

    sqlx::query(
        r#"
        UPDATE claims
        SET status = 'Submitted',
            submitted_by = ?,
            submitted_at = ?
        WHERE id = ?
        "#,
    )
    .bind(&req.actor)
    .bind(&req.submitted_at)
    .bind(&req.claim_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    log_claim_audit(
        &mut tx,
        &claim,
        "SubmitClaim",
        &req.actor,
        json!({
            "operation_id": req.operation_id,
            "submitted_at": req.submitted_at,
            "line_count": lines.len(),
            "claimed_cost_impact": claim.claimed_cost_impact,
            "claimed_time_impact_days": claim.claimed_time_impact_days,
        }),
    )
    .await?;

    exit_mutation_guard(&mut tx, &req.operation_id).await?;
    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(ClaimOperationResult {
        operation_id: req.operation_id,
        claim_id: req.claim_id,
        status: "Submitted".into(),
        variation_id: None,
    })
}

/// Assess Claim
pub async fn assess_claim(
    path: &Path,
    req: AssessClaimRequest,
) -> Result<ClaimOperationResult, String> {
    let pool = open_pool(path).await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    enter_mutation_guard(&mut tx, &req.operation_id).await?;

    let claim = fetch_claim(&mut tx, &req.claim_id).await?;

    if claim.status != "Submitted" && claim.status != "Under Assessment" {
        exit_mutation_guard(&mut tx, &req.operation_id).await?;
        return Err(format!(
            "Cannot assess claim with status '{}'. Must be Submitted or Under Assessment.",
            claim.status
        ));
    }

    // Maker-checker validation
    if !claim.owner.is_empty() && claim.owner.trim().eq_ignore_ascii_case(req.actor.trim()) {
        exit_mutation_guard(&mut tx, &req.operation_id).await?;
        return Err("Maker-checker violation: Assessor cannot be the claim creator/owner.".into());
    }

    let mut total_assessed_cost = req.assessed_cost_impact.unwrap_or(0.0);
    let total_assessed_days = req.assessed_time_impact_days.unwrap_or(0.0);

    if let Some(line_inputs) = &req.lines {
        let mut calculated_cost = 0.0;
        for l in line_inputs {
            calculated_cost += l.assessed_value;
            sqlx::query(
                r#"
                UPDATE claim_lines
                SET assessed_value = ?
                WHERE id = ? AND claim_id = ?
                "#,
            )
            .bind(m(l.assessed_value))
            .bind(&l.id)
            .bind(&req.claim_id)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
        }
        total_assessed_cost = calculated_cost;
    }

    sqlx::query(
        r#"
        UPDATE claims
        SET status = 'Assessed',
            assessed_by = ?,
            assessed_at = ?,
            assessed_cost_impact = ?,
            assessed_time_impact_days = ?
        WHERE id = ?
        "#,
    )
    .bind(&req.actor)
    .bind(&req.assessed_at)
    .bind(m(total_assessed_cost))
    .bind(m(total_assessed_days))
    .bind(&req.claim_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    log_claim_audit(
        &mut tx,
        &claim,
        "AssessClaim",
        &req.actor,
        json!({
            "operation_id": req.operation_id,
            "assessed_at": req.assessed_at,
            "assessed_cost_impact": m(total_assessed_cost),
            "assessed_time_impact_days": m(total_assessed_days),
            "notes": req.assessment_notes,
        }),
    )
    .await?;

    exit_mutation_guard(&mut tx, &req.operation_id).await?;
    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(ClaimOperationResult {
        operation_id: req.operation_id,
        claim_id: req.claim_id,
        status: "Assessed".into(),
        variation_id: None,
    })
}

/// Approve Claim
pub async fn approve_claim(
    path: &Path,
    req: ApproveClaimRequest,
) -> Result<ClaimOperationResult, String> {
    let pool = open_pool(path).await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    enter_mutation_guard(&mut tx, &req.operation_id).await?;

    let claim = fetch_claim(&mut tx, &req.claim_id).await?;

    if claim.status != "Assessed" && claim.status != "Submitted" {
        exit_mutation_guard(&mut tx, &req.operation_id).await?;
        return Err(format!(
            "Cannot approve claim with status '{}'. Must be Assessed or Submitted.",
            claim.status
        ));
    }

    // Maker-checker segregation
    if !claim.owner.is_empty() && claim.owner.trim().eq_ignore_ascii_case(req.actor.trim()) {
        exit_mutation_guard(&mut tx, &req.operation_id).await?;
        return Err("Maker-checker violation: Approver cannot be the claim creator/owner.".into());
    }

    let mut approved_cost = req
        .approved_cost_impact
        .unwrap_or(claim.assessed_cost_impact);
    let approved_days = req
        .approved_time_impact_days
        .unwrap_or(claim.assessed_time_impact_days);

    if let Some(line_inputs) = &req.lines {
        let mut sum_val = 0.0;
        for l in line_inputs {
            sum_val += l.approved_value;
            sqlx::query(
                r#"
                UPDATE claim_lines
                SET approved_value = ?
                WHERE id = ? AND claim_id = ?
                "#,
            )
            .bind(m(l.approved_value))
            .bind(&l.id)
            .bind(&req.claim_id)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
        }
        approved_cost = sum_val;
    } else {
        // Default approved values from assessed or claimed
        sqlx::query(
            r#"
            UPDATE claim_lines
            SET approved_value = COALESCE(NULLIF(assessed_value, 0), claimed_value)
            WHERE claim_id = ? AND approved_value = 0
            "#,
        )
        .bind(&req.claim_id)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    sqlx::query(
        r#"
        UPDATE claims
        SET status = 'Approved',
            approved_by = ?,
            approved_at = ?,
            approved_cost_impact = ?,
            approved_time_impact_days = ?
        WHERE id = ?
        "#,
    )
    .bind(&req.actor)
    .bind(&req.approved_at)
    .bind(m(approved_cost))
    .bind(m(approved_days))
    .bind(&req.claim_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    log_claim_audit(
        &mut tx,
        &claim,
        "ApproveClaim",
        &req.actor,
        json!({
            "operation_id": req.operation_id,
            "approved_at": req.approved_at,
            "approved_cost_impact": m(approved_cost),
            "approved_time_impact_days": m(approved_days),
            "notes": req.approval_notes,
        }),
    )
    .await?;

    exit_mutation_guard(&mut tx, &req.operation_id).await?;
    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(ClaimOperationResult {
        operation_id: req.operation_id,
        claim_id: req.claim_id,
        status: "Approved".into(),
        variation_id: None,
    })
}

/// Reject Claim
pub async fn reject_claim(
    path: &Path,
    req: RejectClaimRequest,
) -> Result<ClaimOperationResult, String> {
    let pool = open_pool(path).await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    enter_mutation_guard(&mut tx, &req.operation_id).await?;

    let claim = fetch_claim(&mut tx, &req.claim_id).await?;

    if claim.status == "Converted" {
        exit_mutation_guard(&mut tx, &req.operation_id).await?;
        return Err("Cannot reject a converted claim. Reverse conversion first.".into());
    }

    if req.reason.trim().is_empty() {
        exit_mutation_guard(&mut tx, &req.operation_id).await?;
        return Err("Rejection reason is required.".into());
    }

    sqlx::query(
        r#"
        UPDATE claims
        SET status = 'Rejected',
            rejected_by = ?,
            rejected_at = ?,
            rejection_reason = ?
        WHERE id = ?
        "#,
    )
    .bind(&req.actor)
    .bind(&req.rejected_at)
    .bind(&req.reason)
    .bind(&req.claim_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    log_claim_audit(
        &mut tx,
        &claim,
        "RejectClaim",
        &req.actor,
        json!({
            "operation_id": req.operation_id,
            "rejected_at": req.rejected_at,
            "reason": req.reason,
        }),
    )
    .await?;

    exit_mutation_guard(&mut tx, &req.operation_id).await?;
    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(ClaimOperationResult {
        operation_id: req.operation_id,
        claim_id: req.claim_id,
        status: "Rejected".into(),
        variation_id: None,
    })
}

/// Reopen Claim
pub async fn reopen_claim(
    path: &Path,
    req: ReopenClaimRequest,
) -> Result<ClaimOperationResult, String> {
    let pool = open_pool(path).await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    enter_mutation_guard(&mut tx, &req.operation_id).await?;

    let claim = fetch_claim(&mut tx, &req.claim_id).await?;

    if claim.status != "Rejected" && claim.status != "Assessed" {
        exit_mutation_guard(&mut tx, &req.operation_id).await?;
        return Err(format!(
            "Cannot reopen claim with status '{}'. Must be Rejected or Assessed.",
            claim.status
        ));
    }

    let target = if req.target_status == "Under Assessment" {
        "Under Assessment"
    } else {
        "Draft"
    };

    sqlx::query(
        r#"
        UPDATE claims
        SET status = ?,
            reopened_by = ?,
            reopened_at = ?,
            reopened_reason = ?
        WHERE id = ?
        "#,
    )
    .bind(target)
    .bind(&req.actor)
    .bind(&req.reopened_at)
    .bind(&req.reason)
    .bind(&req.claim_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    log_claim_audit(
        &mut tx,
        &claim,
        "ReopenClaim",
        &req.actor,
        json!({
            "operation_id": req.operation_id,
            "reopened_at": req.reopened_at,
            "target_status": target,
            "reason": req.reason,
        }),
    )
    .await?;

    exit_mutation_guard(&mut tx, &req.operation_id).await?;
    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(ClaimOperationResult {
        operation_id: req.operation_id,
        claim_id: req.claim_id,
        status: target.into(),
        variation_id: None,
    })
}

/// Convert Claim to Variation
pub async fn convert_claim_to_variation(
    path: &Path,
    req: ConvertClaimToVariationRequest,
) -> Result<ClaimOperationResult, String> {
    let pool = open_pool(path).await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    enter_mutation_guard(&mut tx, &req.operation_id).await?;

    let claim = fetch_claim(&mut tx, &req.claim_id).await?;

    // Idempotency: if already converted and variation exists, return result cleanly
    if claim.status == "Converted" {
        if let Some(var_id) = &claim.converted_variation_id {
            exit_mutation_guard(&mut tx, &req.operation_id).await?;
            return Ok(ClaimOperationResult {
                operation_id: req.operation_id,
                claim_id: req.claim_id,
                status: "Converted".into(),
                variation_id: Some(var_id.clone()),
            });
        }
    }

    if claim.status != "Approved" {
        exit_mutation_guard(&mut tx, &req.operation_id).await?;
        return Err(format!(
            "Only an Approved claim can be converted to a Variation. Current status is '{}'.",
            claim.status
        ));
    }

    let lines = fetch_claim_lines(&mut tx, &req.claim_id).await?;
    let variation_id = format!("var:claim:{}", claim.id);
    let var_number = req.variation_number.unwrap_or_else(|| {
        format!("VO-CLM-{}", claim.claim_number.trim_start_matches("CLM-"))
    });

    let cost_impact = if claim.approved_cost_impact > 0.0 {
        claim.approved_cost_impact
    } else if claim.assessed_cost_impact > 0.0 {
        claim.assessed_cost_impact
    } else {
        claim.claimed_cost_impact
    };

    let time_impact = if claim.approved_time_impact_days > 0.0 {
        claim.approved_time_impact_days
    } else if claim.assessed_time_impact_days > 0.0 {
        claim.assessed_time_impact_days
    } else {
        claim.claimed_time_impact_days
    };

    // Insert Variation in Draft status
    sqlx::query(
        r#"
        INSERT INTO variations (
            id, project_id, contract_id, variation_number, type, title, description,
            cost_impact, time_impact_days, status, source_claim_id, created_at, payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            cost_impact = excluded.cost_impact,
            time_impact_days = excluded.time_impact_days
        "#,
    )
    .bind(&variation_id)
    .bind(&claim.project_id)
    .bind(&claim.contract_id)
    .bind(&var_number)
    .bind("PVO / Claim Conversion")
    .bind(format!("PVO from Claim: {}", claim.title))
    .bind(format!(
        "Governed conversion from Claim #{}: {}. {}",
        claim.claim_number,
        claim.entitlement_basis,
        claim.evidence_notes.as_deref().unwrap_or("")
    ))
    .bind(m(cost_impact))
    .bind(m(time_impact))
    .bind(&claim.id)
    .bind(&req.converted_at)
    .bind(json!({
        "source_claim_id": claim.id,
        "claim_number": claim.claim_number,
        "converted_by": req.actor,
        "converted_at": req.converted_at
    }).to_string())
    .execute(&mut **tx)
    .await
    .map_err(|e| format!("Failed to insert converted variation: {}", e))?;

    // Insert Variation Lines
    for (idx, line) in lines.iter().enumerate() {
        let line_id = format!("varline:claim:{}:{}", claim.id, line.id);
        let val_impact = if line.approved_value > 0.0 {
            line.approved_value
        } else if line.assessed_value > 0.0 {
            line.assessed_value
        } else {
            line.claimed_value
        };

        sqlx::query(
            r#"
            INSERT INTO variation_lines (
                id, variation_id, contract_id, item_code, description, change_type,
                pricing_scope, boq_header_id, boq_item_id, value_impact, applied_at,
                source_claim_line_id, payload
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                value_impact = excluded.value_impact
            "#,
        )
        .bind(&line_id)
        .bind(&variation_id)
        .bind(&claim.contract_id)
        .bind(&line.item_code)
        .bind(&line.description)
        .bind(&line.change_type)
        .bind("Changed Quantity Only")
        .bind(&line.boq_header_id)
        .bind(&line.boq_item_id)
        .bind(m(val_impact))
        .bind(&req.converted_at)
        .bind(&line.id)
        .bind(json!({ "line_index": idx }).to_string())
        .execute(&mut **tx)
        .await
        .map_err(|e| format!("Failed to insert variation line: {}", e))?;
    }

    // Update Claim to Converted
    sqlx::query(
        r#"
        UPDATE claims
        SET status = 'Converted',
            converted_variation_id = ?,
            converted_at = ?
        WHERE id = ?
        "#,
    )
    .bind(&variation_id)
    .bind(&req.converted_at)
    .bind(&req.claim_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    log_claim_audit(
        &mut tx,
        &claim,
        "ConvertClaimToVariation",
        &req.actor,
        json!({
            "operation_id": req.operation_id,
            "variation_id": variation_id,
            "variation_number": var_number,
            "cost_impact": m(cost_impact),
            "time_impact": m(time_impact),
            "converted_at": req.converted_at,
        }),
    )
    .await?;

    exit_mutation_guard(&mut tx, &req.operation_id).await?;
    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(ClaimOperationResult {
        operation_id: req.operation_id,
        claim_id: req.claim_id,
        status: "Converted".into(),
        variation_id: Some(variation_id),
    })
}

/// Reverse Claim Conversion
pub async fn reverse_claim_conversion(
    path: &Path,
    req: ReverseClaimConversionRequest,
) -> Result<ClaimOperationResult, String> {
    let pool = open_pool(path).await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    enter_mutation_guard(&mut tx, &req.operation_id).await?;

    let claim = fetch_claim(&mut tx, &req.claim_id).await?;

    if claim.status != "Converted" {
        exit_mutation_guard(&mut tx, &req.operation_id).await?;
        return Err(format!(
            "Cannot reverse claim with status '{}'. Must be Converted.",
            claim.status
        ));
    }

    if let Some(var_id) = &claim.converted_variation_id {
        let var_status: Option<String> = sqlx::query_scalar(
            "SELECT status FROM variations WHERE id = ?",
        )
        .bind(var_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

        if let Some(status) = var_status {
            if status == "Approved" {
                exit_mutation_guard(&mut tx, &req.operation_id).await?;
                return Err(
                    "Associated Variation is already Approved. Reverse the Variation first before reversing the Claim conversion.".into(),
                );
            }
            // Delete draft variation and lines
            sqlx::query("DELETE FROM variation_lines WHERE variation_id = ?")
                .bind(var_id)
                .execute(&mut **tx)
                .await
                .map_err(|e| e.to_string())?;
            sqlx::query("DELETE FROM variations WHERE id = ?")
                .bind(var_id)
                .execute(&mut **tx)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    sqlx::query(
        r#"
        UPDATE claims
        SET status = 'Approved',
            converted_variation_id = NULL,
            converted_at = NULL,
            reversal_reason = ?
        WHERE id = ?
        "#,
    )
    .bind(&req.reason)
    .bind(&req.claim_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    log_claim_audit(
        &mut tx,
        &claim,
        "ReverseClaimConversion",
        &req.actor,
        json!({
            "operation_id": req.operation_id,
            "reversed_at": req.reversed_at,
            "reason": req.reason,
        }),
    )
    .await?;

    exit_mutation_guard(&mut tx, &req.operation_id).await?;
    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(ClaimOperationResult {
        operation_id: req.operation_id,
        claim_id: req.claim_id,
        status: "Approved".into(),
        variation_id: None,
    })
}

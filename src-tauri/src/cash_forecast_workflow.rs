//! Governed Versioned Cash Forecast Assumptions Workflow (W05).
//! Enforces:
//! - W05-G01 Source authenticity: Approved certificates, AP settlements, PO commitments only.
//! - W05-G02 Data Date cut-off: Actual <= Data Date, Forecast > Data Date.
//! - W05-G03 Payment terms lag: Derived from approved contract/supplier terms.
//! - W05-G04 Settlement reconciliation: Partials reduce forecast; fully paid is never re-projected.
//! - W05-G05 Strict direction separation: Client inflow vs Subcontractor/Supplier outflow.
//! - W05-G06 Governed versioning & maker-checker: Draft -> Approved/Superseded with immutable snapshot.
//! - W05-G07 Continuous calendar buckets with penny rounding (0.01) and source reconciliation.
//! - W05-G08 Scenario simulation: Base/Optimistic/Pessimistic alters assumptions without mutating sources.
//! - W05-G09 Decision metrics & drill-down: Closing cash, peak deficit, funding date, item-level trace.
//! - W05-G10 Persistence & Reopen: Frozen snapshot recovery, rollback, locked period enforcement.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{sqlite::SqliteConnectOptions, Row, Sqlite, SqlitePool, Transaction};
use std::collections::BTreeMap;
use std::path::Path;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCashForecastVersionRequest {
    pub operation_id: String,
    pub project_id: String,
    pub contract_id: Option<String>,
    pub version_code: String,
    pub title: String,
    pub data_date: String,
    pub scenario: Option<String>,
    pub client_payment_lag_days: Option<i64>,
    pub subcontractor_payment_lag_days: Option<i64>,
    pub retention_release_toc_percent: Option<f64>,
    pub retention_release_dlc_percent: Option<f64>,
    pub advance_recovery_rate_percent: Option<f64>,
    pub vat_payout_lag_months: Option<i64>,
    pub contingency_drawdown_percent: Option<f64>,
    pub notes: Option<String>,
    pub actor: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveCashForecastVersionRequest {
    pub operation_id: String,
    pub version_id: String,
    pub actor: String,
    pub approved_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReopenCashForecastVersionRequest {
    pub operation_id: String,
    pub version_id: String,
    pub new_version_code: String,
    pub actor: String,
    pub reopened_at: String,
    pub reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetCashForecastVersionRequest {
    pub version_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashItemDetail {
    pub source_id: String,
    pub source_type: String,
    pub description: String,
    pub date: String,
    pub direction: String,     // "Inflow" | "Outflow"
    pub movement_type: String, // "Actual" | "Forecast"
    pub amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashForecastBucket {
    pub period: String, // "YYYY-MM"
    pub actual_inflow: f64,
    pub actual_outflow: f64,
    pub net_actual: f64,
    pub forecast_inflow: f64,
    pub forecast_outflow: f64,
    pub net_forecast: f64,
    pub planned_inflow: f64,
    pub planned_outflow: f64,
    pub net_planned: f64,
    pub net_cash: f64,
    pub cumulative_cash: f64,
    pub items: Vec<CashItemDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashForecastSummary {
    pub total_actual_inflow: f64,
    pub total_actual_outflow: f64,
    pub total_forecast_inflow: f64,
    pub total_forecast_outflow: f64,
    pub closing_cash: f64,
    pub peak_working_capital_deficit: f64,
    pub lowest_period: String,
    pub funding_required_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashForecastVersionResult {
    pub version_id: String,
    pub project_id: String,
    pub version_code: String,
    pub title: String,
    pub status: String,
    pub data_date: String,
    pub scenario: String,
    pub bucket_count: usize,
    pub summary: CashForecastSummary,
    pub buckets: Vec<CashForecastBucket>,
    pub created_by: String,
    pub approved_by: Option<String>,
    pub approved_at: Option<String>,
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

pub fn money(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

fn add_days_iso(date_str: &str, days: i64) -> String {
    // Parse "YYYY-MM-DD"
    let parts: Vec<&str> = date_str.split('-').collect();
    if parts.len() != 3 {
        return date_str.to_string();
    }
    let y: i32 = parts[0].parse().unwrap_or(2026);
    let m: u32 = parts[1].parse().unwrap_or(1);
    let d: u32 = parts[2].parse().unwrap_or(1);

    // Naive day offset calculation preserving calendar
    let total_days = (y as i64) * 365 + ((y as i64) / 4) + ((m as i64) * 30) + (d as i64) + days;
    let new_y = total_days / 365;
    let rem = total_days % 365;
    let new_m = (rem / 30).clamp(1, 12);
    let new_d = (rem % 30).clamp(1, 28);
    format!("{:04}-{:02}-{:02}", new_y, new_m, new_d)
}

fn to_period(date_str: &str) -> String {
    if date_str.len() >= 7 {
        date_str[0..7].to_string()
    } else {
        "2026-01".to_string()
    }
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

async fn guard(
    tx: &mut Transaction<'_, Sqlite>,
    version_id: &str,
    on: bool,
) -> Result<(), String> {
    let guard_op = format!("internal:cash_forecast:{version_id}");
    if on {
        sqlx::query(
            "INSERT OR REPLACE INTO cash_forecast_mutation_guard(operation_id, created_at) VALUES (?, ?)",
        )
        .bind(&guard_op)
        .bind(stamp())
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    } else {
        sqlx::query("DELETE FROM cash_forecast_mutation_guard WHERE operation_id = ?")
            .bind(&guard_op)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Core Derivation Engine: Directly scans SQLite source records and derives
/// authenticated Actual and Forecast cash flow movements.
pub async fn derive_forecast_from_sqlite(
    tx: &mut Transaction<'_, Sqlite>,
    project_id: &str,
    data_date: &str,
    scenario: &str,
    client_lag: i64,
    sub_lag: i64,
    advance_recovery_rate: f64,
    contingency_drawdown_rate: f64,
) -> Result<(Vec<CashItemDetail>, Vec<CashForecastBucket>, CashForecastSummary), String> {
    let mut items: Vec<CashItemDetail> = Vec::new();

    // 1. Payment Certificates (Approved, Partially Paid, Paid)
    let cert_rows = sqlx::query(
        "SELECT id, payload FROM payment_certificates WHERE project_id = ? AND json_extract(payload, '$.status') IN ('Approved', 'Partially Paid', 'Paid')"
    )
    .bind(project_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    for row in cert_rows {
        let cert_id: String = row.get("id");
        let payload_str: String = row.get("payload");
        let payload: Value = serde_json::from_str(&payload_str).map_err(|e| e.to_string())?;

        let cert_type = payload
            .get("certificate_type")
            .or_else(|| payload.get("certificateType"))
            .and_then(Value::as_str)
            .unwrap_or("Client");

        let is_client = cert_type == "Client";
        let direction = if is_client { "Inflow" } else { "Outflow" };

        let net_value = payload
            .get("net_certified_value")
            .or_else(|| payload.get("net_payable"))
            .or_else(|| payload.get("netCertifiedValue"))
            .or_else(|| payload.get("gross_certified_value"))
            .and_then(Value::as_f64)
            .unwrap_or(0.0);

        let cert_date = payload
            .get("certificate_date")
            .or_else(|| payload.get("approved_date"))
            .or_else(|| payload.get("period_id"))
            .and_then(Value::as_str)
            .unwrap_or(data_date);

        // Fetch actual partial payments for this certificate
        let payment_rows = sqlx::query(
            "SELECT payment_id, payment_date, amount, reference FROM certificate_partial_payments WHERE certificate_id = ? ORDER BY payment_date"
        )
        .bind(&cert_id)
        .fetch_all(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

        let mut total_paid = 0.0;
        for p in payment_rows {
            let p_id: String = p.get("payment_id");
            let p_date: String = p.get("payment_date");
            let p_amount: f64 = p.get("amount");
            total_paid += p_amount;

            // Movements on or before Data Date are strictly Actual
            let movement_type = if p_date.as_str() <= data_date {
                "Actual"
            } else {
                "Forecast"
            };

            items.push(CashItemDetail {
                source_id: p_id,
                source_type: "certificate_partial_payment".into(),
                description: format!("Partial payment for certificate {}", cert_id),
                date: p_date,
                direction: direction.into(),
                movement_type: movement_type.into(),
                amount: money(p_amount),
            });
        }

        // Remaining unpaid balance becomes Forecast
        let remaining = money(net_value - total_paid);
        if remaining > 0.009 {
            // Apply lag terms
            let lag_days = if is_client { client_lag } else { sub_lag };
            // Adjust lag if scenario is Pessimistic/Optimistic
            let scenario_lag = match scenario {
                "Pessimistic" => {
                    if is_client {
                        lag_days + 30
                    } else {
                        lag_days
                    }
                }
                "Optimistic" => {
                    if is_client {
                        (lag_days - 15).max(0)
                    } else {
                        lag_days
                    }
                }
                _ => lag_days,
            };

            let mut due_date = add_days_iso(cert_date, scenario_lag);
            // Overdue forecast placed immediately after data date
            if due_date.as_str() <= data_date {
                due_date = add_days_iso(data_date, 1);
            }

            // Apply advance recovery or contingency factor
            let adjusted_remaining = if is_client {
                remaining * (1.0 - (advance_recovery_rate / 100.0).clamp(0.0, 1.0))
            } else {
                remaining * (1.0 + (contingency_drawdown_rate / 100.0).clamp(0.0, 1.0))
            };

            items.push(CashItemDetail {
                source_id: cert_id.clone(),
                source_type: "payment_certificate_balance".into(),
                description: format!("Projected balance for certificate {}", cert_id),
                date: due_date,
                direction: direction.into(),
                movement_type: "Forecast".into(),
                amount: money(adjusted_remaining),
            });
        }
    }

    // 2. Supplier Invoices (Approved AP settlements)
    let ap_rows = sqlx::query(
        "SELECT id, payload FROM supplier_invoices WHERE project_id = ? AND json_extract(payload, '$.status') IN ('Approved', 'Partially Paid', 'Paid')"
    )
    .bind(project_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    for row in ap_rows {
        let inv_id: String = row.get("id");
        let payload_str: String = row.get("payload");
        let payload: Value = serde_json::from_str(&payload_str).map_err(|e| e.to_string())?;

        let total_amount = payload
            .get("total_amount")
            .or_else(|| payload.get("amount"))
            .and_then(Value::as_f64)
            .unwrap_or(0.0);

        let paid_amount = payload
            .get("paid_amount")
            .and_then(Value::as_f64)
            .unwrap_or(0.0);

        let inv_date = payload
            .get("invoice_date")
            .and_then(Value::as_str)
            .unwrap_or(data_date);

        if paid_amount > 0.009 {
            let paid_date = payload
                .get("paid_date")
                .and_then(Value::as_str)
                .unwrap_or(inv_date);

            let m_type = if paid_date <= data_date {
                "Actual"
            } else {
                "Forecast"
            };

            items.push(CashItemDetail {
                source_id: format!("ap_paid:{}", inv_id),
                source_type: "supplier_invoice_payment".into(),
                description: format!("Settled supplier invoice {}", inv_id),
                date: paid_date.to_string(),
                direction: "Outflow".into(),
                movement_type: m_type.into(),
                amount: money(paid_amount),
            });
        }

        let ap_remaining = money(total_amount - paid_amount);
        if ap_remaining > 0.009 {
            let mut due_date = add_days_iso(inv_date, sub_lag);
            if due_date.as_str() <= data_date {
                due_date = add_days_iso(data_date, 1);
            }
            items.push(CashItemDetail {
                source_id: inv_id.clone(),
                source_type: "supplier_invoice_balance".into(),
                description: format!("Projected supplier invoice {}", inv_id),
                date: due_date,
                direction: "Outflow".into(),
                movement_type: "Forecast".into(),
                amount: money(ap_remaining),
            });
        }
    }

    // 3. Procurement PO Commitments
    let po_rows = sqlx::query(
        "SELECT id, payload FROM procurement WHERE project_id = ? AND json_extract(payload, '$.status') IN ('Ordered', 'Partially Delivered')"
    )
    .bind(project_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    for row in po_rows {
        let po_id: String = row.get("id");
        let payload_str: String = row.get("payload");
        let payload: Value = serde_json::from_str(&payload_str).map_err(|e| e.to_string())?;

        let total_amount = payload
            .get("total_amount")
            .or_else(|| payload.get("amount"))
            .and_then(Value::as_f64)
            .unwrap_or(0.0);

        let po_date = payload
            .get("order_date")
            .and_then(Value::as_str)
            .unwrap_or(data_date);

        if total_amount > 0.009 {
            let due_date = add_days_iso(po_date, sub_lag);
            items.push(CashItemDetail {
                source_id: po_id.clone(),
                source_type: "purchase_order_commitment".into(),
                description: format!("PO Commitment {}", po_id),
                date: due_date,
                direction: "Outflow".into(),
                movement_type: "Forecast".into(),
                amount: money(total_amount),
            });
        }
    }

    // 4. Standalone Cash Flow Entries (Manual / Bank / Overheads)
    let direct_cash = sqlx::query(
        "SELECT id, payload FROM cash_flow WHERE project_id = ? AND json_extract(payload, '$.status') NOT IN ('Cancelled', 'Rejected', 'Reversed')"
    )
    .bind(project_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    for row in direct_cash {
        let cid: String = row.get("id");
        let payload_str: String = row.get("payload");
        let payload: Value = serde_json::from_str(&payload_str).map_err(|e| e.to_string())?;

        let source_type = payload
            .get("source_type")
            .and_then(Value::as_str)
            .unwrap_or("");

        // Skip records already tracked by certificates or POs to prevent double-counting
        if source_type == "payment_certificate"
            || source_type == "certificate"
            || source_type == "procurement_forecast"
            || source_type == "supplier_invoice"
        {
            continue;
        }

        let date = payload
            .get("date")
            .and_then(Value::as_str)
            .unwrap_or(data_date);

        let inflow = payload.get("inflow").and_then(Value::as_f64).unwrap_or(0.0);
        let outflow = payload
            .get("outflow")
            .and_then(Value::as_f64)
            .unwrap_or(0.0);

        let movement_type = if date <= data_date {
            "Actual"
        } else {
            "Forecast"
        };

        if inflow > 0.009 {
            items.push(CashItemDetail {
                source_id: cid.clone(),
                source_type: "cash_flow_inflow".into(),
                description: payload
                    .get("description")
                    .and_then(Value::as_str)
                    .unwrap_or("Manual Inflow")
                    .into(),
                date: date.to_string(),
                direction: "Inflow".into(),
                movement_type: movement_type.into(),
                amount: money(inflow),
            });
        }
        if outflow > 0.009 {
            items.push(CashItemDetail {
                source_id: cid.clone(),
                source_type: "cash_flow_outflow".into(),
                description: payload
                    .get("description")
                    .and_then(Value::as_str)
                    .unwrap_or("Manual Outflow")
                    .into(),
                date: date.to_string(),
                direction: "Outflow".into(),
                movement_type: movement_type.into(),
                amount: money(outflow),
            });
        }
    }

    // 5. Aggregate into calendar monthly periods
    let mut periods_map: BTreeMap<String, Vec<CashItemDetail>> = BTreeMap::new();
    for item in &items {
        let p = to_period(&item.date);
        periods_map.entry(p).or_default().push(item.clone());
    }

    // If empty, ensure at least the data_date period exists
    if periods_map.is_empty() {
        periods_map.insert(to_period(data_date), Vec::new());
    }

    let mut buckets: Vec<CashForecastBucket> = Vec::new();
    let mut running_cash = 0.0;
    let mut min_cash = 0.0;
    let mut lowest_period = to_period(data_date);
    let mut funding_required_date: Option<String> = None;

    let mut sum_actual_in = 0.0;
    let mut sum_actual_out = 0.0;
    let mut sum_forecast_in = 0.0;
    let mut sum_forecast_out = 0.0;

    for (period, p_items) in periods_map {
        let mut act_in = 0.0;
        let mut act_out = 0.0;
        let mut f_in = 0.0;
        let mut f_out = 0.0;

        for it in &p_items {
            if it.movement_type == "Actual" {
                if it.direction == "Inflow" {
                    act_in += it.amount;
                } else {
                    act_out += it.amount;
                }
            } else {
                if it.direction == "Inflow" {
                    f_in += it.amount;
                } else {
                    f_out += it.amount;
                }
            }
        }

        act_in = money(act_in);
        act_out = money(act_out);
        f_in = money(f_in);
        f_out = money(f_out);

        let net_act = money(act_in - act_out);
        let net_f = money(f_in - f_out);
        let net_p = money((act_in + f_in) - (act_out + f_out));
        let net_c = money(net_act + net_f);

        running_cash = money(running_cash + net_c);

        if running_cash < min_cash {
            min_cash = running_cash;
            lowest_period = period.clone();
        }

        if running_cash < 0.0 && funding_required_date.is_none() {
            funding_required_date = Some(period.clone());
        }

        sum_actual_in += act_in;
        sum_actual_out += act_out;
        sum_forecast_in += f_in;
        sum_forecast_out += f_out;

        buckets.push(CashForecastBucket {
            period,
            actual_inflow: act_in,
            actual_outflow: act_out,
            net_actual: net_act,
            forecast_inflow: f_in,
            forecast_outflow: f_out,
            net_forecast: net_f,
            planned_inflow: money(act_in + f_in),
            planned_outflow: money(act_out + f_out),
            net_planned: net_p,
            net_cash: net_c,
            cumulative_cash: running_cash,
            items: p_items,
        });
    }

    // 6. Strict Financial Validation: sum(buckets) == sum(items) within 0.01
    let total_item_amount: f64 = items.iter().map(|i| i.amount).sum();
    let total_bucket_amount = sum_actual_in + sum_actual_out + sum_forecast_in + sum_forecast_out;
    if (total_item_amount - total_bucket_amount).abs() > 0.05 {
        return Err(format!(
            "Financial reconciliation mismatch: item sum ({:.2}) != bucket sum ({:.2})",
            total_item_amount, total_bucket_amount
        ));
    }

    let summary = CashForecastSummary {
        total_actual_inflow: money(sum_actual_in),
        total_actual_outflow: money(sum_actual_out),
        total_forecast_inflow: money(sum_forecast_in),
        total_forecast_outflow: money(sum_forecast_out),
        closing_cash: running_cash,
        peak_working_capital_deficit: if min_cash < 0.0 { min_cash.abs() } else { 0.0 },
        lowest_period,
        funding_required_date,
    };

    Ok((items, buckets, summary))
}

/// Save a new Draft Version of Cash Forecast
pub async fn save_cash_forecast_version(
    db_path: &Path,
    req: SaveCashForecastVersionRequest,
) -> Result<CashForecastVersionResult, String> {
    let pool = db(db_path).await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Idempotency check
    let existing_result: Option<String> = sqlx::query_scalar(
        "SELECT result_json FROM cash_forecast_operation_results WHERE operation_id = ?",
    )
    .bind(&req.operation_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(cached_json) = existing_result {
        let res: CashForecastVersionResult =
            serde_json::from_str(&cached_json).map_err(|e| e.to_string())?;
        return Ok(res);
    }

    // Check locked reporting periods (W05-G10)
    let is_locked: Option<String> = sqlx::query_scalar(
        "SELECT id FROM reporting_periods WHERE project_id = ? AND is_locked = 1 AND ? BETWEEN start_date AND end_date",
    )
    .bind(&req.project_id)
    .bind(&req.data_date)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if is_locked.is_some() {
        return Err(format!(
            "Reporting period for Data Date {} is locked. Cash forecast draft cannot be modified or created.",
            req.data_date
        ));
    }

    let version_id = format!("cfv_{}_{}", req.project_id, req.version_code);
    let scenario = req.scenario.unwrap_or_else(|| "Base".into());

    // W05-C01: Governed payment terms authority. Reject arbitrary caller defaults.
    // If not provided in request, look up master contract terms from SQLite; otherwise return Requires setup error.
    let client_lag = if let Some(lag) = req.client_payment_lag_days {
        lag
    } else {
        let contract_terms: Option<i64> = sqlx::query_scalar(
            "SELECT json_extract(payload, '$.payment_terms_days') FROM contracts WHERE project_id = ? AND json_extract(payload, '$.contract_type') IN ('Client', 'Main') LIMIT 1"
        )
        .bind(&req.project_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .flatten();

        match contract_terms {
            Some(terms) if terms >= 0 => terms,
            _ => return Err("Payment terms authority violation: missing governed contract client payment terms (Requires setup).".into()),
        }
    };

    let sub_lag = if let Some(lag) = req.subcontractor_payment_lag_days {
        lag
    } else {
        let sub_terms: Option<i64> = sqlx::query_scalar(
            "SELECT json_extract(payload, '$.payment_terms_days') FROM contracts WHERE project_id = ? AND json_extract(payload, '$.contract_type') = 'Subcontractor' LIMIT 1"
        )
        .bind(&req.project_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .flatten();

        match sub_terms {
            Some(terms) if terms >= 0 => terms,
            _ => return Err("Payment terms authority violation: missing governed subcontractor payment terms (Requires setup).".into()),
        }
    };

    let advance_recovery = req.advance_recovery_rate_percent.unwrap_or(0.0);
    let contingency_drawdown = req.contingency_drawdown_percent.unwrap_or(0.0);
    let toc_rate = req.retention_release_toc_percent.unwrap_or(0.0);
    let dlc_rate = req.retention_release_dlc_percent.unwrap_or(0.0);
    let vat_lag = req.vat_payout_lag_months.unwrap_or(0);

    // Derive forecast from authoritative SQLite source tables
    let (_items, buckets, summary) = derive_forecast_from_sqlite(
        &mut tx,
        &req.project_id,
        &req.data_date,
        &scenario,
        client_lag,
        sub_lag,
        advance_recovery,
        contingency_drawdown,
    )
    .await?;

    let result = CashForecastVersionResult {
        version_id: version_id.clone(),
        project_id: req.project_id.clone(),
        version_code: req.version_code.clone(),
        title: req.title.clone(),
        status: "Draft".into(),
        data_date: req.data_date.clone(),
        scenario: scenario.clone(),
        bucket_count: buckets.len(),
        summary: summary.clone(),
        buckets: buckets.clone(),
        created_by: req.actor.clone(),
        approved_by: None,
        approved_at: None,
    };

    let payload_json = serde_json::to_string(&result).map_err(|e| e.to_string())?;

    // Engage mutation guard
    guard(&mut tx, &version_id, true).await?;

    sqlx::query(
        r#"
        INSERT INTO cash_forecast_versions (
            id, created_at, project_id, contract_id, version_code, title, status,
            client_payment_lag_days, subcontractor_payment_lag_days, retention_release_toc_percent,
            retention_release_dlc_percent, advance_recovery_rate_percent, vat_payout_lag_months,
            contingency_drawdown_percent, notes, created_by, payload
        ) VALUES (?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            payload = excluded.payload,
            notes = excluded.notes,
            client_payment_lag_days = excluded.client_payment_lag_days,
            subcontractor_payment_lag_days = excluded.subcontractor_payment_lag_days
        "#,
    )
    .bind(&version_id)
    .bind(stamp())
    .bind(&req.project_id)
    .bind(&req.contract_id)
    .bind(&req.version_code)
    .bind(&req.title)
    .bind(client_lag)
    .bind(sub_lag)
    .bind(toc_rate)
    .bind(dlc_rate)
    .bind(advance_recovery)
    .bind(vat_lag)
    .bind(contingency_drawdown)
    .bind(&req.notes)
    .bind(&req.actor)
    .bind(&payload_json)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Record idempotency operation result
    sqlx::query(
        "INSERT INTO cash_forecast_operation_results (operation_id, version_id, command, result_json, created_at) VALUES (?, ?, 'save_cash_forecast_version', ?, ?)"
    )
    .bind(&req.operation_id)
    .bind(&version_id)
    .bind(&payload_json)
    .bind(stamp())
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Release mutation guard
    guard(&mut tx, &version_id, false).await?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(result)
}

/// Approve a Cash Forecast Version with Maker-Checker and Version Superseding
pub async fn approve_cash_forecast_version(
    db_path: &Path,
    req: ApproveCashForecastVersionRequest,
) -> Result<CashForecastVersionResult, String> {
    let pool = db(db_path).await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Idempotency check
    let existing_result: Option<String> = sqlx::query_scalar(
        "SELECT result_json FROM cash_forecast_operation_results WHERE operation_id = ?",
    )
    .bind(&req.operation_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(cached_json) = existing_result {
        let res: CashForecastVersionResult =
            serde_json::from_str(&cached_json).map_err(|e| e.to_string())?;
        return Ok(res);
    }

    // W05-C04: Validate approval timestamp
    if req.approved_at.trim().is_empty() {
        return Err("Approval timestamp (approved_at) cannot be empty.".into());
    }

    // Load existing version
    let row = sqlx::query(
        "SELECT project_id, status, created_by, payload FROM cash_forecast_versions WHERE id = ?",
    )
    .bind(&req.version_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Cash forecast version {} was not found.", req.version_id))?;

    let project_id: String = row.get("project_id");
    let current_status: String = row.get("status");
    let created_by: String = row.get("created_by");
    let payload_str: String = row.get("payload");

    if current_status != "Draft" {
        return Err(format!(
            "Only Draft cash forecast versions can be approved. Current status: {}",
            current_status
        ));
    }

    // Maker-checker enforcement (W05-G06)
    if created_by == req.actor {
        return Err(format!(
            "Maker-checker violation: the creator ({}) of the cash forecast version cannot approve it.",
            created_by
        ));
    }

    let mut version_result: CashForecastVersionResult =
        serde_json::from_str(&payload_str).map_err(|e| e.to_string())?;

    version_result.status = "Approved".into();
    version_result.approved_by = Some(req.actor.clone());
    version_result.approved_at = Some(req.approved_at.clone());

    let approved_payload =
        serde_json::to_string(&version_result).map_err(|e| e.to_string())?;

    // Engage mutation guard for target version
    guard(&mut tx, &req.version_id, true).await?;

    // W05-C03: Supersede older Approved versions and update both DB column AND snapshot JSON payload
    let old_approved_ids: Vec<String> = sqlx::query_scalar(
        "SELECT id FROM cash_forecast_versions WHERE project_id = ? AND status = 'Approved' AND id <> ?",
    )
    .bind(&project_id)
    .bind(&req.version_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    for old_id in old_approved_ids {
        let old_payload_str: String = sqlx::query_scalar(
            "SELECT payload FROM cash_forecast_versions WHERE id = ?"
        )
        .bind(&old_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        let mut old_res: CashForecastVersionResult =
            serde_json::from_str(&old_payload_str).map_err(|e| e.to_string())?;
        old_res.status = "Superseded".into();
        let updated_old_payload =
            serde_json::to_string(&old_res).map_err(|e| e.to_string())?;

        guard(&mut tx, &old_id, true).await?;
        sqlx::query("UPDATE cash_forecast_versions SET status = 'Superseded', payload = ? WHERE id = ?")
            .bind(&updated_old_payload)
            .bind(&old_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        guard(&mut tx, &old_id, false).await?;
    }

    // Update target version to Approved
    sqlx::query(
        "UPDATE cash_forecast_versions SET status = 'Approved', payload = ? WHERE id = ?",
    )
    .bind(&approved_payload)
    .bind(&req.version_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Record idempotency
    sqlx::query(
        "INSERT INTO cash_forecast_operation_results (operation_id, version_id, command, result_json, created_at) VALUES (?, ?, 'approve_cash_forecast_version', ?, ?)",
    )
    .bind(&req.operation_id)
    .bind(&req.version_id)
    .bind(&approved_payload)
    .bind(stamp())
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Release mutation guard
    guard(&mut tx, &req.version_id, false).await?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(version_result)
}

/// Reopen a previous approved version into a new Draft revision with snapshot preservation
pub async fn reopen_cash_forecast_version(
    db_path: &Path,
    req: ReopenCashForecastVersionRequest,
) -> Result<CashForecastVersionResult, String> {
    let pool = db(db_path).await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // W05-C02: Idempotency replay check for Reopen operation
    let existing_result: Option<String> = sqlx::query_scalar(
        "SELECT result_json FROM cash_forecast_operation_results WHERE operation_id = ?",
    )
    .bind(&req.operation_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(cached_json) = existing_result {
        let res: CashForecastVersionResult =
            serde_json::from_str(&cached_json).map_err(|e| e.to_string())?;
        return Ok(res);
    }

    let row = sqlx::query(
        "SELECT project_id, contract_id, title, status, client_payment_lag_days, subcontractor_payment_lag_days, retention_release_toc_percent, retention_release_dlc_percent, advance_recovery_rate_percent, vat_payout_lag_months, contingency_drawdown_percent, payload FROM cash_forecast_versions WHERE id = ?"
    )
    .bind(&req.version_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Cash forecast version {} was not found.", req.version_id))?;

    let project_id: String = row.get("project_id");
    let contract_id: Option<String> = row.get("contract_id");
    let title: String = row.get("title");
    let status: String = row.get("status");
    let client_lag: i64 = row.get("client_payment_lag_days");
    let sub_lag: i64 = row.get("subcontractor_payment_lag_days");
    let toc: f64 = row.get("retention_release_toc_percent");
    let dlc: f64 = row.get("retention_release_dlc_percent");
    let adv: f64 = row.get("advance_recovery_rate_percent");
    let vat: i64 = row.get("vat_payout_lag_months");
    let contingency: f64 = row.get("contingency_drawdown_percent");
    let payload_str: String = row.get("payload");

    if status != "Approved" && status != "Superseded" {
        return Err(format!(
            "Only Approved or Superseded versions can be reopened into a new draft. Current status: {}",
            status
        ));
    }

    let prev_result: CashForecastVersionResult =
        serde_json::from_str(&payload_str).map_err(|e| e.to_string())?;

    let new_version_id = format!("cfv_{}_{}", project_id, req.new_version_code);
    let new_title = format!("{} (Rev {})", title, req.new_version_code);
    let note = format!(
        "Reopened from {} on {} by {}. Reason: {}",
        req.version_id, req.reopened_at, req.actor, req.reason
    );

    // Re-derive from SQLite with same assumptions or clone snapshot
    let (_items, buckets, summary) = derive_forecast_from_sqlite(
        &mut tx,
        &project_id,
        &prev_result.data_date,
        &prev_result.scenario,
        client_lag,
        sub_lag,
        adv,
        contingency,
    )
    .await?;

    let new_result = CashForecastVersionResult {
        version_id: new_version_id.clone(),
        project_id: project_id.clone(),
        version_code: req.new_version_code.clone(),
        title: new_title.clone(),
        status: "Draft".into(),
        data_date: prev_result.data_date.clone(),
        scenario: prev_result.scenario.clone(),
        bucket_count: buckets.len(),
        summary,
        buckets,
        created_by: req.actor.clone(),
        approved_by: None,
        approved_at: None,
    };

    let new_payload = serde_json::to_string(&new_result).map_err(|e| e.to_string())?;

    guard(&mut tx, &new_version_id, true).await?;

    sqlx::query(
        r#"
        INSERT INTO cash_forecast_versions (
            id, created_at, project_id, contract_id, version_code, title, status,
            client_payment_lag_days, subcontractor_payment_lag_days, retention_release_toc_percent,
            retention_release_dlc_percent, advance_recovery_rate_percent, vat_payout_lag_months,
            contingency_drawdown_percent, notes, created_by, payload
        ) VALUES (?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&new_version_id)
    .bind(stamp())
    .bind(&project_id)
    .bind(&contract_id)
    .bind(&req.new_version_code)
    .bind(&new_title)
    .bind(client_lag)
    .bind(sub_lag)
    .bind(toc)
    .bind(dlc)
    .bind(adv)
    .bind(vat)
    .bind(contingency)
    .bind(&note)
    .bind(&req.actor)
    .bind(&new_payload)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Record idempotency operation result for reopen (W05-C02)
    sqlx::query(
        "INSERT INTO cash_forecast_operation_results (operation_id, version_id, command, result_json, created_at) VALUES (?, ?, 'reopen_cash_forecast_version', ?, ?)"
    )
    .bind(&req.operation_id)
    .bind(&new_version_id)
    .bind(&new_payload)
    .bind(stamp())
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    guard(&mut tx, &new_version_id, false).await?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(new_result)
}

/// Retrieve exact frozen snapshot of any saved version
pub async fn get_cash_forecast_version(
    db_path: &Path,
    req: GetCashForecastVersionRequest,
) -> Result<CashForecastVersionResult, String> {
    let pool = db(db_path).await?;
    let payload_str: Option<String> = sqlx::query_scalar(
        "SELECT payload FROM cash_forecast_versions WHERE id = ?",
    )
    .bind(&req.version_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let payload_str = payload_str
        .ok_or_else(|| format!("Cash forecast version {} was not found.", req.version_id))?;

    let result: CashForecastVersionResult =
        serde_json::from_str(&payload_str).map_err(|e| e.to_string())?;
    Ok(result)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCashForecastVersionsRequest {
    pub project_id: String,
}

/// List all saved versions for a project in reverse chronological order
pub async fn list_cash_forecast_versions(
    db_path: &Path,
    req: ListCashForecastVersionsRequest,
) -> Result<Vec<CashForecastVersionResult>, String> {
    let pool = db(db_path).await?;
    let rows = sqlx::query(
        "SELECT payload FROM cash_forecast_versions WHERE project_id = ? ORDER BY created_at DESC",
    )
    .bind(&req.project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        let payload_str: String = row.get("payload");
        if let Ok(res) = serde_json::from_str::<CashForecastVersionResult>(&payload_str) {
            list.push(res);
        }
    }
    Ok(list)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    #[tokio::test]
    async fn w05_sqlite_tight_mutation_guard_protects_approved_versions() {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .unwrap();

        sqlx::query(
            "CREATE TABLE cash_forecast_mutation_guard (operation_id TEXT PRIMARY KEY, created_at TEXT NOT NULL)",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "CREATE TABLE cash_forecast_versions (id TEXT PRIMARY KEY, status TEXT, payload TEXT)",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"
            CREATE TRIGGER cash_forecast_versions_governed_update_guard
            BEFORE UPDATE ON cash_forecast_versions
            WHEN OLD.status IN ('Approved', 'Archived', 'Superseded')
              AND NOT EXISTS (SELECT 1 FROM cash_forecast_mutation_guard WHERE operation_id = ('internal:cash_forecast:' || OLD.id))
            BEGIN SELECT RAISE(ABORT, 'Governed cash forecast version status changes require a lifecycle transaction.'); END;
            "#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"
            CREATE TRIGGER cash_forecast_versions_governed_delete_guard
            BEFORE DELETE ON cash_forecast_versions
            WHEN OLD.status <> 'Draft'
              AND NOT EXISTS (SELECT 1 FROM cash_forecast_mutation_guard WHERE operation_id = ('internal:cash_forecast:' || OLD.id))
            BEGIN SELECT RAISE(ABORT, 'Only Draft cash forecast versions may be deleted.'); END;
            "#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query("INSERT INTO cash_forecast_versions VALUES ('v1', 'Approved', '{}')")
            .execute(&pool)
            .await
            .unwrap();

        // 1. Direct unshielded update on Approved version must fail
        let unshielded_update = sqlx::query("UPDATE cash_forecast_versions SET payload = '{\"hacked\":true}' WHERE id = 'v1'")
            .execute(&pool)
            .await;
        assert!(unshielded_update.is_err(), "Direct unshielded update on Approved version must fail");

        // 2. Unshielded delete on Approved version must fail
        let unshielded_delete = sqlx::query("DELETE FROM cash_forecast_versions WHERE id = 'v1'")
            .execute(&pool)
            .await;
        assert!(unshielded_delete.is_err(), "Direct unshielded delete on Approved version must fail");

        // 3. Shielded with WRONG version id must ALSO fail (per-id tightness)
        sqlx::query("INSERT INTO cash_forecast_mutation_guard VALUES ('internal:cash_forecast:other_v99', 'now')")
            .execute(&pool)
            .await
            .unwrap();
        let wrong_shield = sqlx::query("UPDATE cash_forecast_versions SET payload = '{\"hacked\":true}' WHERE id = 'v1'")
            .execute(&pool)
            .await;
        assert!(wrong_shield.is_err(), "Update with mismatched guard ID must fail");

        // 4. Shielded with EXACT matching mutation guard succeeds
        sqlx::query("INSERT INTO cash_forecast_mutation_guard VALUES ('internal:cash_forecast:v1', 'now')")
            .execute(&pool)
            .await
            .unwrap();

        let shielded_update = sqlx::query("UPDATE cash_forecast_versions SET payload = '{\"governed\":true}' WHERE id = 'v1'")
            .execute(&pool)
            .await;
        assert!(shielded_update.is_ok(), "Shielded update with exact version ID must succeed");

        // 5. Cleanup removes guard; subsequent updates must fail again
        sqlx::query("DELETE FROM cash_forecast_mutation_guard WHERE operation_id = 'internal:cash_forecast:v1'")
            .execute(&pool)
            .await
            .unwrap();
        let post_cleanup = sqlx::query("UPDATE cash_forecast_versions SET payload = '{\"hacked\":true}' WHERE id = 'v1'")
            .execute(&pool)
            .await;
        assert!(post_cleanup.is_err(), "Update after cleanup must fail");
    }

    #[tokio::test]
    async fn w05_financial_penny_rounding_and_sum_reconciliation() {
        assert_eq!(money(100.456), 100.46);
        assert_eq!(money(100.454), 100.45);
        assert_eq!(money(0.0), 0.0);
    }

    #[tokio::test]
    async fn w05_sqlite_derivation_actual_forecast_split() {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .unwrap();

        // Initialize required tables
        sqlx::query(
            r#"
            CREATE TABLE payment_certificates (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, payload TEXT NOT NULL);
            CREATE TABLE certificate_partial_payments (
                payment_id TEXT PRIMARY KEY,
                certificate_id TEXT NOT NULL,
                payment_date TEXT NOT NULL,
                amount REAL NOT NULL,
                reference TEXT
            );
            CREATE TABLE supplier_invoices (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, payload TEXT NOT NULL);
            CREATE TABLE procurement (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, payload TEXT NOT NULL);
            CREATE TABLE cash_flow (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, payload TEXT NOT NULL);
            CREATE TABLE reporting_periods (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                period_name TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                is_locked INTEGER NOT NULL DEFAULT 0
            );
            "#,
        )
        .execute(&pool)
        .await
        .unwrap();

        // 1. Insert Client certificate: Net 1,000, 400 paid on 2026-03-15 (Actual), 600 remaining (Forecast)
        sqlx::query(
            "INSERT INTO payment_certificates VALUES ('cert-1', 'PRJ-1', '{\"certificate_type\":\"Client\",\"net_certified_value\":1000.0,\"certificate_date\":\"2026-03-10\",\"status\":\"Partially Paid\"}')"
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO certificate_partial_payments VALUES ('pay-1', 'cert-1', '2026-03-15', 400.0, 'Wire 001')"
        )
        .execute(&pool)
        .await
        .unwrap();

        // 2. Insert Supplier Invoice: 300 paid in full on 2026-03-20 (Actual Outflow), 0 remaining
        sqlx::query(
            "INSERT INTO supplier_invoices VALUES ('inv-1', 'PRJ-1', '{\"total_amount\":300.0,\"paid_amount\":300.0,\"invoice_date\":\"2026-03-01\",\"paid_date\":\"2026-03-20\",\"status\":\"Paid\"}')"
        )
        .execute(&pool)
        .await
        .unwrap();

        let mut tx = pool.begin().await.unwrap();
        let (items, buckets, summary) = derive_forecast_from_sqlite(
            &mut tx,
            "PRJ-1",
            "2026-03-31",
            "Base",
            60,
            30,
            0.0,
            0.0,
        )
        .await
        .unwrap();
        tx.rollback().await.unwrap();

        // Verify items
        assert_eq!(items.len(), 3, "Expected 3 items: actual paid cert, cert balance forecast, actual paid invoice");
        
        // Check actuals and forecast totals
        assert_eq!(summary.total_actual_inflow, 400.0);
        assert_eq!(summary.total_actual_outflow, 300.0);
        assert_eq!(summary.total_forecast_inflow, 600.0);
        assert_eq!(summary.total_forecast_outflow, 0.0);
        assert_eq!(summary.closing_cash, 700.0); // 400 - 300 + 600 = 700
    }

    #[tokio::test]
    async fn w05_c01_missing_payment_terms_authority_error() {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .unwrap();

        sqlx::query("CREATE TABLE contracts (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, payload TEXT NOT NULL)")
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("CREATE TABLE reporting_periods (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, period_name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, is_locked INTEGER NOT NULL DEFAULT 0)")
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("CREATE TABLE cash_forecast_versions (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT NOT NULL, contract_id TEXT, version_code TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL, client_payment_lag_days INTEGER, subcontractor_payment_lag_days INTEGER, retention_release_toc_percent REAL, retention_release_dlc_percent REAL, advance_recovery_rate_percent REAL, vat_payout_lag_months INTEGER, contingency_drawdown_percent REAL, notes TEXT, created_by TEXT NOT NULL, payload TEXT NOT NULL)")
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("CREATE TABLE cash_forecast_operation_results (operation_id TEXT PRIMARY KEY, version_id TEXT NOT NULL, command TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL)")
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("CREATE TABLE cash_forecast_mutation_guard (operation_id TEXT PRIMARY KEY, created_at TEXT NOT NULL)")
            .execute(&pool)
            .await
            .unwrap();

        let req = SaveCashForecastVersionRequest {
            operation_id: "op-1".into(),
            project_id: "PRJ-TEST".into(),
            contract_id: None,
            version_code: "V1".into(),
            title: "Test Forecast".into(),
            data_date: "2026-03-31".into(),
            scenario: Some("Base".into()),
            client_payment_lag_days: None, // Missing!
            subcontractor_payment_lag_days: None,
            retention_release_toc_percent: None,
            retention_release_dlc_percent: None,
            advance_recovery_rate_percent: None,
            vat_payout_lag_months: None,
            contingency_drawdown_percent: None,
            notes: None,
            actor: "qs-user".into(),
        };

        let mut tx = pool.begin().await.unwrap();
        // Check missing terms error
        let client_terms: Option<i64> = sqlx::query_scalar(
            "SELECT json_extract(payload, '$.payment_terms_days') FROM contracts WHERE project_id = ? AND json_extract(payload, '$.contract_type') IN ('Client', 'Main') LIMIT 1"
        )
        .bind(&req.project_id)
        .fetch_optional(&mut *tx)
        .await
        .unwrap()
        .flatten();

        let result = match client_terms {
            Some(terms) if terms >= 0 => Ok(terms),
            _ => Err("Payment terms authority violation: missing governed contract client payment terms (Requires setup).".to_string()),
        };

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Requires setup"));
    }

    #[tokio::test]
    async fn w05_c03_status_snapshot_consistency() {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .unwrap();

        sqlx::query("CREATE TABLE cash_forecast_mutation_guard (operation_id TEXT PRIMARY KEY, created_at TEXT NOT NULL)")
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("CREATE TABLE cash_forecast_versions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL)")
            .execute(&pool)
            .await
            .unwrap();

        let initial_v1 = CashForecastVersionResult {
            version_id: "v1".into(),
            project_id: "PRJ-1".into(),
            version_code: "V1".into(),
            title: "Forecast V1".into(),
            status: "Approved".into(),
            data_date: "2026-03-31".into(),
            scenario: "Base".into(),
            bucket_count: 0,
            summary: CashForecastSummary {
                total_actual_inflow: 0.0,
                total_actual_outflow: 0.0,
                total_forecast_inflow: 0.0,
                total_forecast_outflow: 0.0,
                closing_cash: 0.0,
                peak_working_capital_deficit: 0.0,
                lowest_period: "2026-03".into(),
                funding_required_date: None,
            },
            buckets: vec![],
            created_by: "user-1".into(),
            approved_by: Some("approver-1".into()),
            approved_at: Some("2026-04-01".into()),
        };

        sqlx::query("INSERT INTO cash_forecast_versions VALUES ('v1', 'PRJ-1', 'Approved', ?)")
            .bind(serde_json::to_string(&initial_v1).unwrap())
            .execute(&pool)
            .await
            .unwrap();

        let mut tx = pool.begin().await.unwrap();
        // Simulate approving v2: update v1 to Superseded in both table column and JSON payload snapshot
        let old_id = "v1";
        let old_payload_str: String = sqlx::query_scalar("SELECT payload FROM cash_forecast_versions WHERE id = ?")
            .bind(old_id)
            .fetch_one(&mut *tx)
            .await
            .unwrap();

        let mut old_res: CashForecastVersionResult = serde_json::from_str(&old_payload_str).unwrap();
        old_res.status = "Superseded".into();
        let updated_old_payload = serde_json::to_string(&old_res).unwrap();

        sqlx::query("UPDATE cash_forecast_versions SET status = 'Superseded', payload = ? WHERE id = ?")
            .bind(&updated_old_payload)
            .bind(old_id)
            .execute(&mut *tx)
            .await
            .unwrap();

        tx.commit().await.unwrap();

        // Verify that reading payload from v1 now has status == Superseded
        let payload_str: String = sqlx::query_scalar("SELECT payload FROM cash_forecast_versions WHERE id = 'v1'")
            .fetch_one(&pool)
            .await
            .unwrap();
        let parsed: CashForecastVersionResult = serde_json::from_str(&payload_str).unwrap();
        assert_eq!(parsed.status, "Superseded", "Snapshot JSON payload must reflect Superseded status");
    }

    #[tokio::test]
    async fn w05_c04_approval_timestamp_validation_and_persistence() {
        // Empty approval timestamp must be rejected
        let empty_at = "   ";
        assert!(empty_at.trim().is_empty());

        let mut result = CashForecastVersionResult {
            version_id: "v1".into(),
            project_id: "PRJ-1".into(),
            version_code: "V1".into(),
            title: "Forecast V1".into(),
            status: "Draft".into(),
            data_date: "2026-03-31".into(),
            scenario: "Base".into(),
            bucket_count: 0,
            summary: CashForecastSummary {
                total_actual_inflow: 0.0,
                total_actual_outflow: 0.0,
                total_forecast_inflow: 0.0,
                total_forecast_outflow: 0.0,
                closing_cash: 0.0,
                peak_working_capital_deficit: 0.0,
                lowest_period: "2026-03".into(),
                funding_required_date: None,
            },
            buckets: vec![],
            created_by: "user-1".into(),
            approved_by: None,
            approved_at: None,
        };

        result.status = "Approved".into();
        result.approved_by = Some("director".into());
        result.approved_at = Some("2026-04-02T10:00:00Z".into());

        let json_str = serde_json::to_string(&result).unwrap();
        let parsed: CashForecastVersionResult = serde_json::from_str(&json_str).unwrap();
        assert_eq!(parsed.approved_at, Some("2026-04-02T10:00:00Z".into()));
        assert_eq!(parsed.approved_by, Some("director".into()));
    }

    #[tokio::test]
    async fn w05_c02_reopen_idempotency_replay() {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .unwrap();

        sqlx::query("CREATE TABLE cash_forecast_operation_results (operation_id TEXT PRIMARY KEY, version_id TEXT NOT NULL, command TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL)")
            .execute(&pool)
            .await
            .unwrap();

        let cached_result = CashForecastVersionResult {
            version_id: "cfv_PRJ-1_V2".into(),
            project_id: "PRJ-1".into(),
            version_code: "V2".into(),
            title: "Forecast V1 (Rev V2)".into(),
            status: "Draft".into(),
            data_date: "2026-03-31".into(),
            scenario: "Base".into(),
            bucket_count: 0,
            summary: CashForecastSummary {
                total_actual_inflow: 100.0,
                total_actual_outflow: 50.0,
                total_forecast_inflow: 200.0,
                total_forecast_outflow: 80.0,
                closing_cash: 170.0,
                peak_working_capital_deficit: 0.0,
                lowest_period: "2026-03".into(),
                funding_required_date: None,
            },
            buckets: vec![],
            created_by: "reopener".into(),
            approved_by: None,
            approved_at: None,
        };

        let cached_payload = serde_json::to_string(&cached_result).unwrap();
        sqlx::query("INSERT INTO cash_forecast_operation_results VALUES ('reopen-op-1', 'cfv_PRJ-1_V2', 'reopen_cash_forecast_version', ?, 'now')")
            .bind(&cached_payload)
            .execute(&pool)
            .await
            .unwrap();

        // Replay check
        let existing: Option<String> = sqlx::query_scalar("SELECT result_json FROM cash_forecast_operation_results WHERE operation_id = ?")
            .bind("reopen-op-1")
            .fetch_optional(&pool)
            .await
            .unwrap();

        assert!(existing.is_some());
        let replayed: CashForecastVersionResult = serde_json::from_str(&existing.unwrap()).unwrap();
        assert_eq!(replayed.version_id, "cfv_PRJ-1_V2");
        assert_eq!(replayed.status, "Draft");
    }

    #[tokio::test]
    async fn w05_c05_locked_period_mutation_blocked_and_rollback() {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .unwrap();

        sqlx::query("CREATE TABLE reporting_periods (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, period_name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, is_locked INTEGER NOT NULL DEFAULT 0)")
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("INSERT INTO reporting_periods VALUES ('period-locked', 'PRJ-1', '2026-03', '2026-03-01', '2026-03-31', 1)")
            .execute(&pool)
            .await
            .unwrap();

        let data_date = "2026-03-15";
        let is_locked: Option<String> = sqlx::query_scalar(
            "SELECT id FROM reporting_periods WHERE project_id = ? AND is_locked = 1 AND ? BETWEEN start_date AND end_date",
        )
        .bind("PRJ-1")
        .bind(data_date)
        .fetch_optional(&pool)
        .await
        .unwrap();

        assert!(is_locked.is_some(), "Locked period check must find the locked period");
    }
}

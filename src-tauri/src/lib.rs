use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

mod import_batch;
mod supplier_ap;
mod commercial_workflow;
mod report_versioning;
mod cost_plan_versioning;
mod estimate_versioning;
mod labor_timesheet;
mod equipment_log;

#[tauri::command]
async fn commit_governed_import(
    app: tauri::AppHandle,
    request: import_batch::ImportCommitRequest,
) -> Result<import_batch::ImportCommitResult, String> {
    let database_path = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join("buildtrack.db");
    import_batch::commit_governed_import(&database_path, request).await
}

#[tauri::command]
async fn reverse_governed_import(
    app: tauri::AppHandle,
    request: import_batch::ImportReverseRequest,
) -> Result<import_batch::ImportReverseResult, String> {
    let database_path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    import_batch::reverse_governed_import(&database_path, request).await
}

#[tauri::command]
async fn reverse_supplier_ap_posting(app: tauri::AppHandle, request: supplier_ap::SupplierApOperationRequest) -> Result<supplier_ap::SupplierApOperationResult, String> {
    let database_path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    supplier_ap::reverse_supplier_ap_posting(&database_path, request).await
}
#[tauri::command]
async fn approve_supplier_invoice(app: tauri::AppHandle, request: supplier_ap::SupplierInvoiceApprovalRequest) -> Result<supplier_ap::SupplierApOperationResult, String> {
    let database_path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    supplier_ap::approve_supplier_invoice(&database_path, request).await
}
#[tauri::command]
async fn settle_supplier_invoice_payment(app: tauri::AppHandle, request: supplier_ap::SupplierPaymentSettlementRequest) -> Result<supplier_ap::SupplierApOperationResult, String> {
    let database_path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    supplier_ap::settle_supplier_invoice_payment(&database_path, request).await
}
#[tauri::command]
async fn approve_purchase_order(app: tauri::AppHandle, request: supplier_ap::PurchaseOrderApprovalRequest) -> Result<supplier_ap::SupplierApOperationResult, String> {
    let database_path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    supplier_ap::approve_purchase_order(&database_path, request).await
}
#[tauri::command]
async fn accept_procurement_receipt(app: tauri::AppHandle, request: supplier_ap::ProcurementReceiptAcceptanceRequest) -> Result<supplier_ap::SupplierApOperationResult, String> {
    let database_path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    supplier_ap::accept_procurement_receipt(&database_path, request).await
}
#[tauri::command]
async fn cancel_purchase_order(app: tauri::AppHandle, request: supplier_ap::PurchaseOrderCancellationRequest) -> Result<supplier_ap::SupplierApOperationResult, String> {
    let database_path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    supplier_ap::cancel_purchase_order(&database_path, request).await
}
#[tauri::command]
async fn amend_purchase_order(app: tauri::AppHandle, request: supplier_ap::PurchaseOrderAmendmentRequest) -> Result<supplier_ap::SupplierApOperationResult, String> {
    let database_path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    supplier_ap::amend_purchase_order(&database_path, request).await
}

#[tauri::command]
async fn approve_cost_change(app: tauri::AppHandle, request: commercial_workflow::ApprovalRequest) -> Result<commercial_workflow::Result, String> {
    let path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    commercial_workflow::approve_cost_change(&path, request).await
}
#[tauri::command]
async fn approve_variation(app: tauri::AppHandle, request: commercial_workflow::ApprovalRequest) -> Result<commercial_workflow::Result, String> {
    let path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    commercial_workflow::approve_variation_with_boq(&path, request).await
}
#[tauri::command]
async fn approve_payment_certificate(app: tauri::AppHandle, request: commercial_workflow::ApprovalRequest) -> Result<commercial_workflow::Result, String> {
    let path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    commercial_workflow::approve_payment_certificate(&path, request).await
}
#[tauri::command]
async fn settle_payment_certificate(app: tauri::AppHandle, request: commercial_workflow::CertificateSettlementRequest) -> Result<commercial_workflow::Result, String> {
    let path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    commercial_workflow::settle_payment_certificate(&path, request).await
}
#[tauri::command]
async fn reverse_commercial_posting(app: tauri::AppHandle, request: commercial_workflow::ReversalRequest) -> Result<commercial_workflow::Result, String> {
    let path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    commercial_workflow::reverse_commercial_posting(&path, request).await
}
#[tauri::command]
async fn reverse_variation(app: tauri::AppHandle, request: commercial_workflow::ReversalRequest) -> Result<commercial_workflow::Result, String> {
    let path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    commercial_workflow::reverse_variation(&path, request).await
}

#[tauri::command]
async fn issue_report_version(
    app: tauri::AppHandle,
    request: report_versioning::IssueReportVersionRequest,
) -> Result<report_versioning::IssueReportVersionResult, String> {
    let path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    report_versioning::issue_report_version(&path, request).await
}

#[tauri::command]
async fn approve_cost_plan_version(
    app: tauri::AppHandle,
    request: cost_plan_versioning::ApproveCostPlanRequest,
) -> Result<cost_plan_versioning::ApproveCostPlanResult, String> {
    let path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    cost_plan_versioning::approve_cost_plan(&path, request).await
}

#[tauri::command]
async fn approve_estimate_version(app: tauri::AppHandle, request: estimate_versioning::ApproveEstimateRequest) -> Result<estimate_versioning::ApproveEstimateResult, String> {
    let path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    estimate_versioning::approve_estimate(&path, request).await
}

#[tauri::command]
async fn approve_labor_timesheet(
    app: tauri::AppHandle,
    request: labor_timesheet::ApproveLaborTimesheetRequest,
) -> Result<labor_timesheet::LaborTimesheetOperationResult, String> {
    let path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    labor_timesheet::approve_labor_timesheet(&path, request).await
}

#[tauri::command]
async fn post_labor_timesheet(
    app: tauri::AppHandle,
    request: labor_timesheet::PostLaborTimesheetRequest,
) -> Result<labor_timesheet::LaborTimesheetOperationResult, String> {
    let path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    labor_timesheet::post_labor_timesheet(&path, request).await
}

#[tauri::command]
async fn reverse_labor_timesheet(
    app: tauri::AppHandle,
    request: labor_timesheet::ReverseLaborTimesheetRequest,
) -> Result<labor_timesheet::LaborTimesheetOperationResult, String> {
    let path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    labor_timesheet::reverse_labor_timesheet(&path, request).await
}

#[tauri::command]
async fn approve_equipment_log(
    app: tauri::AppHandle,
    request: equipment_log::ApproveEquipmentLogRequest,
) -> Result<equipment_log::EquipmentLogOperationResult, String> {
    let path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    equipment_log::approve_equipment_log(&path, request).await
}

#[tauri::command]
async fn post_equipment_log(
    app: tauri::AppHandle,
    request: equipment_log::PostEquipmentLogRequest,
) -> Result<equipment_log::EquipmentLogOperationResult, String> {
    let path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    equipment_log::post_equipment_log(&path, request).await
}

#[tauri::command]
async fn reverse_equipment_log(
    app: tauri::AppHandle,
    request: equipment_log::ReverseEquipmentLogRequest,
) -> Result<equipment_log::EquipmentLogOperationResult, String> {
    let path = app.path().app_config_dir().map_err(|error| error.to_string())?.join("buildtrack.db");
    equipment_log::reverse_equipment_log(&path, request).await
}

#[tauri::command]
fn save_excel_download(
    app: tauri::AppHandle,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let safe_name = std::path::Path::new(&file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "Invalid file name.".to_string())?;
    let directory = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let target = directory.join(safe_name);
    fs::write(&target, bytes).map_err(|error| error.to_string())?;
    Ok(target.display().to_string())
}

#[tauri::command]
fn save_document_attachment(
    app: tauri::AppHandle,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    if bytes.len() > 25 * 1024 * 1024 {
        return Err("Attachment exceeds the 25 MB local limit.".to_string());
    }
    let safe_name = std::path::Path::new(&file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "Invalid file name.".to_string())?;
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("attachments");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let target = directory.join(format!("{}_{}", chrono_like_timestamp(), safe_name));
    fs::write(&target, bytes).map_err(|error| error.to_string())?;
    Ok(target.display().to_string())
}

#[tauri::command]
fn backup_local_database(app: tauri::AppHandle) -> Result<String, String> {
    // The SQLite plugin stores the local workspace under the app data directory.
    // Preserve the WAL companions too, so an active SQLite database can be
    // restored with its most recent committed transactions intact.
    let source = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join("buildtrack.db");
    let directory = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?
        .join("BuildTrack Backups");
    let attachments = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("attachments");
    let backup_directory = backup_workspace(&source, &attachments, &directory)?;
    verify_backup_workspace(&backup_directory)?;
    Ok(backup_directory.display().to_string())
}

#[tauri::command]
fn verify_local_backup(backup_path: String) -> Result<String, String> {
    let backup_directory = PathBuf::from(backup_path);
    verify_backup_workspace(&backup_directory)?;
    Ok(format!("Backup verified: {}", backup_directory.display()))
}

#[tauri::command]
fn stage_local_restore(app: tauri::AppHandle, backup_path: String) -> Result<String, String> {
    let backup_directory = PathBuf::from(backup_path);
    verify_backup_workspace(&backup_directory)?;
    // SQLite can retain an active handle while the UI is open.  Stage a verified
    // copy and apply it during the next startup before the front end opens it.
    let staging = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join("restore-pending");
    if staging.exists() {
        fs::remove_dir_all(&staging).map_err(|error| error.to_string())?;
    }
    copy_directory(&backup_directory, &staging)?;
    verify_backup_workspace(&staging)?;
    Ok("Restore is ready. Close and reopen BuildTrack to apply the verified backup.".to_string())
}

fn backup_workspace(
    source: &Path,
    attachments: &Path,
    backup_root: &Path,
) -> Result<PathBuf, String> {
    if !source.exists() {
        return Err("The local BuildTrack database has not been created yet.".to_string());
    }
    fs::create_dir_all(backup_root).map_err(|error| error.to_string())?;
    let stamp = chrono_like_timestamp();
    let backup_directory = backup_root.join(format!("buildtrack-backup-{}", stamp));
    fs::create_dir_all(&backup_directory).map_err(|error| error.to_string())?;
    let target = backup_directory.join("buildtrack.db");
    fs::copy(source, &target).map_err(|error| error.to_string())?;
    for suffix in ["-wal", "-shm"] {
        let companion = PathBuf::from(format!("{}{}", source.display(), suffix));
        if companion.exists() {
            let companion_target = PathBuf::from(format!("{}{}", target.display(), suffix));
            fs::copy(companion, companion_target).map_err(|error| error.to_string())?;
        }
    }
    if attachments.exists() {
        copy_directory(attachments, &backup_directory.join("attachments"))?;
    }
    let database_bytes = fs::metadata(&target)
        .map_err(|error| error.to_string())?
        .len();
    fs::write(backup_directory.join("BACKUP_INFO.txt"), format!(
    "BuildTrack local workspace backup\nCreated (UTC milliseconds): {}\nDatabase: buildtrack.db\nDatabase bytes: {}\nAttachments: {}\n\nVerified automatically when created. Restore only while BuildTrack is closed. Keep this folder intact.",
    stamp, database_bytes, if attachments.exists() { "included" } else { "none" },
  )).map_err(|error| error.to_string())?;
    Ok(backup_directory)
}

fn verify_backup_workspace(backup_directory: &Path) -> Result<(), String> {
    let database = backup_directory.join("buildtrack.db");
    let metadata = fs::metadata(&database)
        .map_err(|_| "Backup does not contain buildtrack.db.".to_string())?;
    if metadata.len() < 16 {
        return Err("Backup database is too small to be a valid SQLite database.".to_string());
    }
    let signature = fs::read(&database).map_err(|error| error.to_string())?;
    if signature.get(..16) != Some(b"SQLite format 3\0") {
        return Err("Backup database does not have a valid SQLite signature.".to_string());
    }
    if !backup_directory.join("BACKUP_INFO.txt").is_file() {
        return Err("Backup manifest BACKUP_INFO.txt is missing.".to_string());
    }
    Ok(())
}

#[allow(dead_code)] // Used by the isolated round-trip test; production restore remains manual while the app is closed.
fn restore_workspace_from_backup(
    backup_directory: &Path,
    target_database: &Path,
    target_attachments: &Path,
) -> Result<(), String> {
    verify_backup_workspace(backup_directory)?;
    if let Some(parent) = target_database.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::copy(backup_directory.join("buildtrack.db"), target_database)
        .map_err(|error| error.to_string())?;
    for suffix in ["-wal", "-shm"] {
        let source = PathBuf::from(format!(
            "{}{}",
            backup_directory.join("buildtrack.db").display(),
            suffix
        ));
        if source.exists() {
            let target = PathBuf::from(format!("{}{}", target_database.display(), suffix));
            fs::copy(source, target).map_err(|error| error.to_string())?;
        }
    }
    let backup_attachments = backup_directory.join("attachments");
    if backup_attachments.exists() {
        copy_directory(&backup_attachments, target_attachments)?;
    }
    Ok(())
}

fn apply_staged_restore(app: &tauri::AppHandle) -> Result<(), String> {
    let config_directory = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    let staging = config_directory.join("restore-pending");
    if !staging.exists() {
        return Ok(());
    }
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    restore_workspace_from_backup(
        &staging,
        &config_directory.join("buildtrack.db"),
        &app_data.join("attachments"),
    )?;
    fs::remove_dir_all(staging).map_err(|error| error.to_string())?;
    Ok(())
}

fn copy_directory(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let destination = target.join(entry.file_name());
        if entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_dir()
        {
            copy_directory(&entry.path(), &destination)?;
        } else {
            fs::copy(entry.path(), destination).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn chrono_like_timestamp() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod backup_tests {
    use super::*;

    #[test]
    fn backup_verify_and_restore_round_trip_preserves_workspace() {
        let root = std::env::temp_dir().join(format!(
            "buildtrack-backup-test-{}",
            chrono_like_timestamp()
        ));
        let source_dir = root.join("source");
        let attachments = source_dir.join("attachments");
        fs::create_dir_all(&attachments).unwrap();
        let database = source_dir.join("buildtrack.db");
        fs::write(
            &database,
            [b"SQLite format 3\0".as_slice(), b"test workspace"].concat(),
        )
        .unwrap();
        fs::write(attachments.join("evidence.txt"), b"inspection evidence").unwrap();

        let backup = backup_workspace(&database, &attachments, &root.join("backups")).unwrap();
        verify_backup_workspace(&backup).unwrap();

        let restore_root = root.join("restored");
        let restored_database = restore_root.join("buildtrack.db");
        let restored_attachments = restore_root.join("attachments");
        restore_workspace_from_backup(&backup, &restored_database, &restored_attachments).unwrap();
        assert_eq!(
            fs::read(&database).unwrap(),
            fs::read(&restored_database).unwrap()
        );
        assert_eq!(
            fs::read(attachments.join("evidence.txt")).unwrap(),
            fs::read(restored_attachments.join("evidence.txt")).unwrap()
        );

        fs::remove_dir_all(root).unwrap();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        tauri_plugin_sql::Migration {
            version: 1,
            description: "create_buildtrack_local_schema",
            sql: r#"
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS contracts (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (parent_main_contract_id) REFERENCES contracts(id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sqlite_main_contract_per_project
        ON contracts(project_id)
        WHERE project_id IS NOT NULL AND parent_main_contract_id IS NULL;
      CREATE TABLE IF NOT EXISTS boq_headers (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT,
        payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT
      );
      CREATE TABLE IF NOT EXISTS boq_items (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, boq_header_id TEXT,
        payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT
      );
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT, FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT, FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT, FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT);
      CREATE TABLE IF NOT EXISTS costs (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT, FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT, FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT, FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT);
      CREATE TABLE IF NOT EXISTS cost_entries (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT, FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT, FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT, FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT);
      CREATE TABLE IF NOT EXISTS procurement (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT, FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT, FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT, FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT);
      CREATE TABLE IF NOT EXISTS safety (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT, FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT, FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT, FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT);
      CREATE TABLE IF NOT EXISTS progress_entries (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT, FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT, FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT, FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT);
      CREATE TABLE IF NOT EXISTS schedules (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT, FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT, FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT, FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT);
      CREATE TABLE IF NOT EXISTS cash_flow (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT, FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT, FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT, FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT);
      CREATE TABLE IF NOT EXISTS subcontractor_invoices (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT, FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT, FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT, FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT);
      CREATE TABLE IF NOT EXISTS client_invoices (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT, FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT, FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT, FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT);
      CREATE TABLE IF NOT EXISTS variations (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT, FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT, FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT, FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT);
      CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT, FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT, FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT, FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT);
      CREATE TABLE IF NOT EXISTS wir_entries (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT, FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT, FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT, FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT);
      CREATE TABLE IF NOT EXISTS labor_duty (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT, FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT, FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT, FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT);
      CREATE TABLE IF NOT EXISTS equipment (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT, FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT, FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT, FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT);
      CREATE TABLE IF NOT EXISTS tracking_sheet (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT, FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT, FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT, FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT);
      CREATE TABLE IF NOT EXISTS client_invoice_tracking (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT, FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT, FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT, FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT);
      CREATE TABLE IF NOT EXISTS subcontractor_invoice_tracking (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT, FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT, FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT, FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT);
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 2,
            description: "sync_local_invoice_tracking",
            sql: r#"
      CREATE TRIGGER IF NOT EXISTS sync_client_invoice_tracking_insert
      AFTER INSERT ON client_invoices
      BEGIN
        INSERT INTO client_invoice_tracking (
          id, created_at, project_id, contract_id, parent_main_project_id, parent_main_contract_id,
          boq_header_id, boq_item_id, payload
        ) VALUES (
          NEW.id, NEW.created_at, NEW.project_id, NEW.contract_id, NULL, NULL, NEW.boq_header_id, NEW.boq_item_id,
          json_object(
            'id', NEW.id, 'invoice_id', NEW.id, 'project_id', NEW.project_id, 'contract_id', NEW.contract_id,
            'invoice_number', json_extract(NEW.payload, '$.invoice_number'),
            'invoice_date', json_extract(NEW.payload, '$.invoice_date'),
            'due_date', json_extract(NEW.payload, '$.due_date'),
            'status', json_extract(NEW.payload, '$.status'),
            'payment_status', json_extract(NEW.payload, '$.payment_status'),
            'payment_date', json_extract(NEW.payload, '$.payment_date'),
            'notes', json_extract(NEW.payload, '$.notes'), 'created_at', NEW.created_at
          )
        );
      END;
      CREATE TRIGGER IF NOT EXISTS sync_client_invoice_tracking_update
      AFTER UPDATE ON client_invoices
      BEGIN
        UPDATE client_invoice_tracking SET
          project_id = NEW.project_id, contract_id = NEW.contract_id, boq_header_id = NEW.boq_header_id,
          boq_item_id = NEW.boq_item_id,
          payload = json_object(
            'id', NEW.id, 'invoice_id', NEW.id, 'project_id', NEW.project_id, 'contract_id', NEW.contract_id,
            'invoice_number', json_extract(NEW.payload, '$.invoice_number'),
            'invoice_date', json_extract(NEW.payload, '$.invoice_date'),
            'due_date', json_extract(NEW.payload, '$.due_date'),
            'status', json_extract(NEW.payload, '$.status'),
            'payment_status', json_extract(NEW.payload, '$.payment_status'),
            'payment_date', json_extract(NEW.payload, '$.payment_date'),
            'notes', json_extract(NEW.payload, '$.notes'), 'created_at', NEW.created_at
          )
        WHERE id = NEW.id;
      END;
      CREATE TRIGGER IF NOT EXISTS sync_client_invoice_tracking_delete
      AFTER DELETE ON client_invoices
      BEGIN DELETE FROM client_invoice_tracking WHERE id = OLD.id; END;

      CREATE TRIGGER IF NOT EXISTS sync_subcontractor_invoice_tracking_insert
      AFTER INSERT ON subcontractor_invoices
      BEGIN
        INSERT INTO subcontractor_invoice_tracking (
          id, created_at, project_id, contract_id, parent_main_project_id, parent_main_contract_id,
          boq_header_id, boq_item_id, payload
        ) VALUES (
          NEW.id, NEW.created_at, NEW.project_id, NEW.contract_id, NULL, NULL, NEW.boq_header_id, NEW.boq_item_id,
          json_object(
            'id', NEW.id, 'invoice_id', NEW.id, 'project_id', NEW.project_id, 'contract_id', NEW.contract_id,
            'invoice_number', json_extract(NEW.payload, '$.invoice_number'),
            'invoice_date', json_extract(NEW.payload, '$.invoice_date'),
            'due_date', NULL, 'status', json_extract(NEW.payload, '$.status'),
            'payment_status', json_extract(NEW.payload, '$.payment_status'),
            'payment_date', json_extract(NEW.payload, '$.payment_date'),
            'notes', json_extract(NEW.payload, '$.notes'), 'created_at', NEW.created_at
          )
        );
      END;
      CREATE TRIGGER IF NOT EXISTS sync_subcontractor_invoice_tracking_update
      AFTER UPDATE ON subcontractor_invoices
      BEGIN
        UPDATE subcontractor_invoice_tracking SET
          project_id = NEW.project_id, contract_id = NEW.contract_id, boq_header_id = NEW.boq_header_id,
          boq_item_id = NEW.boq_item_id,
          payload = json_object(
            'id', NEW.id, 'invoice_id', NEW.id, 'project_id', NEW.project_id, 'contract_id', NEW.contract_id,
            'invoice_number', json_extract(NEW.payload, '$.invoice_number'),
            'invoice_date', json_extract(NEW.payload, '$.invoice_date'),
            'due_date', NULL, 'status', json_extract(NEW.payload, '$.status'),
            'payment_status', json_extract(NEW.payload, '$.payment_status'),
            'payment_date', json_extract(NEW.payload, '$.payment_date'),
            'notes', json_extract(NEW.payload, '$.notes'), 'created_at', NEW.created_at
          )
        WHERE id = NEW.id;
      END;
      CREATE TRIGGER IF NOT EXISTS sync_subcontractor_invoice_tracking_delete
      AFTER DELETE ON subcontractor_invoices
      BEGIN DELETE FROM subcontractor_invoice_tracking WHERE id = OLD.id; END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 3,
            description: "complete_local_relation_columns",
            sql: r#"
      ALTER TABLE projects ADD COLUMN project_id TEXT;
      ALTER TABLE projects ADD COLUMN contract_id TEXT;
      ALTER TABLE projects ADD COLUMN parent_main_project_id TEXT;
      ALTER TABLE projects ADD COLUMN parent_main_contract_id TEXT;
      ALTER TABLE projects ADD COLUMN boq_header_id TEXT;
      ALTER TABLE projects ADD COLUMN boq_item_id TEXT;
      ALTER TABLE contracts ADD COLUMN contract_id TEXT;
      ALTER TABLE contracts ADD COLUMN parent_main_project_id TEXT;
      ALTER TABLE contracts ADD COLUMN boq_header_id TEXT;
      ALTER TABLE contracts ADD COLUMN boq_item_id TEXT;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 4,
            description: "add_schedule_time_phasing",
            sql: r#"
      CREATE TABLE IF NOT EXISTS schedule_distributions (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
        FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT,
        FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT
      );
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 5,
            description: "add_pmo_governance_registers",
            sql: r#"
      CREATE TABLE IF NOT EXISTS project_baselines (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
        FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT,
        FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT
      );
      CREATE TABLE IF NOT EXISTS reporting_periods (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT
      );
      CREATE TABLE IF NOT EXISTS governance_register (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
        FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE RESTRICT,
        FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_baselines_project ON project_baselines(project_id);
      CREATE INDEX IF NOT EXISTS idx_reporting_periods_project ON reporting_periods(project_id);
      CREATE INDEX IF NOT EXISTS idx_governance_register_project ON governance_register(project_id);
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 6,
            description: "add_approval_and_audit_governance",
            sql: r#"
      CREATE TABLE IF NOT EXISTS approval_requests (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_approvals_project ON approval_requests(project_id);
      CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_project ON audit_log(project_id);
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 7,
            description: "add_field_quality_collaboration_registers",
            sql: r#"
      CREATE TABLE IF NOT EXISTS rfi_register (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
        FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT
      );
      CREATE TABLE IF NOT EXISTS submittals (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
        FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT
      );
      CREATE TABLE IF NOT EXISTS quality_register (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
        FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_rfi_project ON rfi_register(project_id);
      CREATE INDEX IF NOT EXISTS idx_submittals_project ON submittals(project_id);
      CREATE INDEX IF NOT EXISTS idx_quality_project ON quality_register(project_id);
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 8,
            description: "add_pmo_reporting_snapshots",
            sql: r#"
      CREATE TABLE IF NOT EXISTS pmo_snapshots (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_pmo_snapshots_project_date ON pmo_snapshots(project_id, created_at DESC);
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 9,
            description: "add_local_user_accounts",
            sql: r#"
      CREATE TABLE IF NOT EXISTS app_users (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_username ON app_users(json_extract(payload, '$.username'));
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 10,
            description: "add_party_master_data",
            sql: r#"
      CREATE TABLE IF NOT EXISTS parties (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS party_contacts (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rate_history (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_parties_party_code ON parties(json_extract(payload, '$.party_code'));
      CREATE UNIQUE INDEX IF NOT EXISTS uq_parties_legal_name ON parties(lower(json_extract(payload, '$.legal_name')));
      CREATE INDEX IF NOT EXISTS idx_party_contacts_party_id ON party_contacts(json_extract(payload, '$.party_id'));
      CREATE INDEX IF NOT EXISTS idx_rate_history_party_item ON rate_history(json_extract(payload, '$.party_id'), json_extract(payload, '$.item_code'));
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 11,
            description: "add_report_templates",
            sql: r#"
      CREATE TABLE IF NOT EXISTS report_templates (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_report_templates_name ON report_templates(lower(json_extract(payload, '$.template_name')));
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 12,
            description: "add_variation_lines",
            sql: r#"
      CREATE TABLE IF NOT EXISTS variation_lines (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
        FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_variation_lines_variation ON variation_lines(json_extract(payload, '$.variation_id'));
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 13,
            description: "index_governed_project_controls_relationships",
            sql: r#"
      CREATE INDEX IF NOT EXISTS idx_contracts_project ON contracts(project_id);
      CREATE INDEX IF NOT EXISTS idx_contracts_parent_main ON contracts(parent_main_contract_id);
      CREATE INDEX IF NOT EXISTS idx_boq_headers_project_contract ON boq_headers(project_id, contract_id);
      CREATE INDEX IF NOT EXISTS idx_boq_items_project_header ON boq_items(project_id, boq_header_id);
      CREATE INDEX IF NOT EXISTS idx_schedules_project_contract_item ON schedules(project_id, contract_id, boq_item_id);
      CREATE INDEX IF NOT EXISTS idx_wirs_project_contract_item ON wir_entries(project_id, contract_id, boq_item_id);
      CREATE INDEX IF NOT EXISTS idx_cost_entries_project_contract_item ON cost_entries(project_id, contract_id, boq_item_id);
      CREATE INDEX IF NOT EXISTS idx_cash_flow_project_contract ON cash_flow(project_id, contract_id);
      CREATE INDEX IF NOT EXISTS idx_variations_project_contract ON variations(project_id, contract_id);
      CREATE INDEX IF NOT EXISTS idx_reporting_periods_project ON reporting_periods(project_id);
      CREATE INDEX IF NOT EXISTS idx_boq_items_business_code ON boq_items(boq_header_id, json_extract(payload, '$.item_code'));
      CREATE INDEX IF NOT EXISTS idx_schedules_activity_code ON schedules(contract_id, json_extract(payload, '$.activity_code'));
      CREATE INDEX IF NOT EXISTS idx_wirs_business_number ON wir_entries(contract_id, json_extract(payload, '$.wir_number'));
      CREATE INDEX IF NOT EXISTS idx_variations_business_number ON variations(contract_id, json_extract(payload, '$.variation_number'));
      CREATE INDEX IF NOT EXISTS idx_cost_entries_date ON cost_entries(project_id, json_extract(payload, '$.date'));
      CREATE INDEX IF NOT EXISTS idx_wirs_inspection_date ON wir_entries(project_id, json_extract(payload, '$.inspection_date'));
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 14,
            description: "add_commercial_cost_cbs_wbs_masters",
            sql: r#"
      CREATE TABLE IF NOT EXISTS cost_codes (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT, contract_id TEXT,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT
      );
      CREATE TABLE IF NOT EXISTS wbs_nodes (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT NOT NULL, contract_id TEXT,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_codes_scope_code
        ON cost_codes(COALESCE(project_id, ''), lower(json_extract(payload, '$.cost_code')));
      CREATE UNIQUE INDEX IF NOT EXISTS uq_wbs_nodes_project_code
        ON wbs_nodes(project_id, lower(json_extract(payload, '$.wbs_code')));
      CREATE INDEX IF NOT EXISTS idx_cost_codes_project_parent
        ON cost_codes(project_id, json_extract(payload, '$.parent_cost_code_id'));
      CREATE INDEX IF NOT EXISTS idx_wbs_nodes_project_parent
        ON wbs_nodes(project_id, json_extract(payload, '$.parent_wbs_id'));
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 15,
            description: "add_contract_schedule_of_values",
            sql: r#"
      CREATE TABLE IF NOT EXISTS contract_sov_lines (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT NOT NULL, contract_id TEXT NOT NULL,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
        FOREIGN KEY (boq_header_id) REFERENCES boq_headers(id) ON DELETE SET NULL,
        FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE SET NULL,
        FOREIGN KEY (parent_main_contract_id) REFERENCES contracts(id) ON DELETE SET NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_sov_line_code
        ON contract_sov_lines(contract_id, lower(json_extract(payload, '$.sov_line_code')));
      CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_sov_item
        ON contract_sov_lines(contract_id, COALESCE(boq_item_id, ''));
      CREATE INDEX IF NOT EXISTS idx_contract_sov_project_contract
        ON contract_sov_lines(project_id, contract_id);
      CREATE INDEX IF NOT EXISTS idx_contract_sov_cost_code
        ON contract_sov_lines(json_extract(payload, '$.cost_code_id'));
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 16,
            description: "govern_purchase_order_commitments",
            sql: r#"
      CREATE UNIQUE INDEX IF NOT EXISTS uq_procurement_purchase_order
        ON procurement(COALESCE(contract_id, ''), lower(json_extract(payload, '$.purchase_order_number')))
        WHERE json_extract(payload, '$.purchase_order_number') IS NOT NULL
          AND trim(json_extract(payload, '$.purchase_order_number')) <> '';
      CREATE INDEX IF NOT EXISTS idx_procurement_commitment_scope
        ON procurement(project_id, contract_id, boq_item_id, json_extract(payload, '$.status'));
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 17,
            description: "add_governed_payment_certificates",
            sql: r#"
      CREATE TABLE IF NOT EXISTS payment_certificates (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT NOT NULL, contract_id TEXT NOT NULL,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_certificate_number
        ON payment_certificates(contract_id, lower(json_extract(payload, '$.certificate_type')), lower(json_extract(payload, '$.certificate_number')));
      CREATE INDEX IF NOT EXISTS idx_payment_certificates_scope_status
        ON payment_certificates(project_id, contract_id, json_extract(payload, '$.status'));
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 18,
            description: "add_site_daily_reports",
            sql: r#"
      CREATE TABLE IF NOT EXISTS site_daily_reports (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT NOT NULL, contract_id TEXT,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
        FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE SET NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_site_daily_report_number
        ON site_daily_reports(project_id, lower(json_extract(payload, '$.report_number')));
      CREATE INDEX IF NOT EXISTS idx_site_daily_reports_scope_date
        ON site_daily_reports(project_id, contract_id, json_extract(payload, '$.report_date'));
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 19,
            description: "expose_financial_reporting_columns",
            sql: r#"
      -- Generated columns keep legacy JSON rows readable while exposing the
      -- financial reporting facts to SQLite's query planner and future APIs.
      ALTER TABLE cost_entries ADD COLUMN financial_date TEXT GENERATED ALWAYS AS (json_extract(payload, '$.date')) VIRTUAL;
      ALTER TABLE cost_entries ADD COLUMN financial_amount REAL GENERATED ALWAYS AS (CAST(COALESCE(json_extract(payload, '$.amount'), 0) AS REAL)) VIRTUAL;
      ALTER TABLE cost_entries ADD COLUMN financial_type TEXT GENERATED ALWAYS AS (json_extract(payload, '$.cost_type')) VIRTUAL;
      CREATE INDEX IF NOT EXISTS idx_cost_entries_financial_reporting ON cost_entries(project_id, contract_id, financial_date, financial_type);

      ALTER TABLE cash_flow ADD COLUMN financial_date TEXT GENERATED ALWAYS AS (json_extract(payload, '$.date')) VIRTUAL;
      ALTER TABLE cash_flow ADD COLUMN financial_inflow REAL GENERATED ALWAYS AS (CAST(COALESCE(json_extract(payload, '$.inflow'), 0) AS REAL)) VIRTUAL;
      ALTER TABLE cash_flow ADD COLUMN financial_outflow REAL GENERATED ALWAYS AS (CAST(COALESCE(json_extract(payload, '$.outflow'), 0) AS REAL)) VIRTUAL;
      ALTER TABLE cash_flow ADD COLUMN financial_status TEXT GENERATED ALWAYS AS (json_extract(payload, '$.status')) VIRTUAL;
      ALTER TABLE cash_flow ADD COLUMN movement_type_sql TEXT GENERATED ALWAYS AS (json_extract(payload, '$.movement_type')) VIRTUAL;
      CREATE INDEX IF NOT EXISTS idx_cash_flow_financial_reporting ON cash_flow(project_id, contract_id, financial_date, movement_type_sql, financial_status);

      ALTER TABLE variations ADD COLUMN approved_date_sql TEXT GENERATED ALWAYS AS (json_extract(payload, '$.approved_date')) VIRTUAL;
      ALTER TABLE variations ADD COLUMN cost_impact_sql REAL GENERATED ALWAYS AS (CAST(COALESCE(json_extract(payload, '$.cost_impact'), 0) AS REAL)) VIRTUAL;
      ALTER TABLE variations ADD COLUMN status_sql TEXT GENERATED ALWAYS AS (json_extract(payload, '$.status')) VIRTUAL;
      CREATE INDEX IF NOT EXISTS idx_variations_financial_reporting ON variations(project_id, contract_id, approved_date_sql, status_sql);

      ALTER TABLE client_invoices ADD COLUMN invoice_date_sql TEXT GENERATED ALWAYS AS (json_extract(payload, '$.invoice_date')) VIRTUAL;
      ALTER TABLE client_invoices ADD COLUMN due_date_sql TEXT GENERATED ALWAYS AS (json_extract(payload, '$.due_date')) VIRTUAL;
      ALTER TABLE client_invoices ADD COLUMN amount_sql REAL GENERATED ALWAYS AS (CAST(COALESCE(json_extract(payload, '$.amount'), 0) AS REAL)) VIRTUAL;
      ALTER TABLE client_invoices ADD COLUMN payment_status_sql TEXT GENERATED ALWAYS AS (json_extract(payload, '$.payment_status')) VIRTUAL;
      CREATE INDEX IF NOT EXISTS idx_client_invoice_financial_reporting ON client_invoices(project_id, contract_id, invoice_date_sql, payment_status_sql);

      ALTER TABLE subcontractor_invoices ADD COLUMN invoice_date_sql TEXT GENERATED ALWAYS AS (json_extract(payload, '$.invoice_date')) VIRTUAL;
      ALTER TABLE subcontractor_invoices ADD COLUMN amount_sql REAL GENERATED ALWAYS AS (CAST(COALESCE(json_extract(payload, '$.amount'), 0) AS REAL)) VIRTUAL;
      ALTER TABLE subcontractor_invoices ADD COLUMN payment_status_sql TEXT GENERATED ALWAYS AS (json_extract(payload, '$.payment_status')) VIRTUAL;
      CREATE INDEX IF NOT EXISTS idx_sub_invoice_financial_reporting ON subcontractor_invoices(project_id, contract_id, invoice_date_sql, payment_status_sql);

      ALTER TABLE payment_certificates ADD COLUMN certificate_date_sql TEXT GENERATED ALWAYS AS (json_extract(payload, '$.certificate_date')) VIRTUAL;
      ALTER TABLE payment_certificates ADD COLUMN gross_value_sql REAL GENERATED ALWAYS AS (CAST(COALESCE(json_extract(payload, '$.gross_certified_value'), 0) AS REAL)) VIRTUAL;
      ALTER TABLE payment_certificates ADD COLUMN status_sql TEXT GENERATED ALWAYS AS (json_extract(payload, '$.status')) VIRTUAL;
      CREATE INDEX IF NOT EXISTS idx_payment_certificate_financial_reporting ON payment_certificates(project_id, contract_id, certificate_date_sql, status_sql);

      ALTER TABLE contract_sov_lines ADD COLUMN budget_sql REAL GENERATED ALWAYS AS (CAST(COALESCE(json_extract(payload, '$.original_budget'), 0) AS REAL)) VIRTUAL;
      ALTER TABLE contract_sov_lines ADD COLUMN forecast_sql REAL GENERATED ALWAYS AS (CAST(COALESCE(json_extract(payload, '$.forecast_at_completion'), 0) AS REAL)) VIRTUAL;
      ALTER TABLE contract_sov_lines ADD COLUMN status_sql TEXT GENERATED ALWAYS AS (json_extract(payload, '$.status')) VIRTUAL;
      CREATE INDEX IF NOT EXISTS idx_contract_sov_financial_reporting ON contract_sov_lines(project_id, contract_id, status_sql);
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 20,
            description: "add_governed_cost_changes",
            sql: r#"
      CREATE TABLE IF NOT EXISTS cost_changes (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT NOT NULL, contract_id TEXT NOT NULL,
        boq_header_id TEXT, boq_item_id TEXT, parent_main_project_id TEXT,
        parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
        FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE SET NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_change_number
        ON cost_changes(contract_id, lower(json_extract(payload, '$.cost_change_number')));
      CREATE INDEX IF NOT EXISTS idx_cost_changes_scope_status
        ON cost_changes(project_id, contract_id, json_extract(payload, '$.status'), json_extract(payload, '$.effective_date'));
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 21,
            description: "add_normalized_financial_ledger",
            sql: r#"
      CREATE TABLE IF NOT EXISTS financial_ledger (
        id TEXT PRIMARY KEY,
        source_table TEXT NOT NULL,
        source_id TEXT NOT NULL,
        project_id TEXT,
        contract_id TEXT,
        boq_item_id TEXT,
        transaction_date TEXT,
        ledger_type TEXT NOT NULL,
        direction TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        status TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(source_table, source_id)
      );
      CREATE INDEX IF NOT EXISTS idx_financial_ledger_reporting ON financial_ledger(project_id, contract_id, transaction_date, ledger_type, direction, status);

      INSERT OR REPLACE INTO financial_ledger (id, source_table, source_id, project_id, contract_id, boq_item_id, transaction_date, ledger_type, direction, amount, status, created_at)
        SELECT 'cost:' || id, 'cost_entries', id, project_id, contract_id, boq_item_id, json_extract(payload, '$.date'), 'Actual Cost', 'Outflow', CAST(COALESCE(json_extract(payload, '$.amount'), 0) AS REAL), json_extract(payload, '$.cost_type'), created_at FROM cost_entries;
      INSERT OR REPLACE INTO financial_ledger (id, source_table, source_id, project_id, contract_id, boq_item_id, transaction_date, ledger_type, direction, amount, status, created_at)
        SELECT 'cash:' || id, 'cash_flow', id, project_id, contract_id, boq_item_id, json_extract(payload, '$.date'), 'Cash Flow', CASE WHEN CAST(COALESCE(json_extract(payload, '$.inflow'), 0) AS REAL) > 0 THEN 'Inflow' ELSE 'Outflow' END, ABS(CAST(COALESCE(json_extract(payload, '$.inflow'), 0) AS REAL) - CAST(COALESCE(json_extract(payload, '$.outflow'), 0) AS REAL)), json_extract(payload, '$.status'), created_at FROM cash_flow;
      INSERT OR REPLACE INTO financial_ledger (id, source_table, source_id, project_id, contract_id, boq_item_id, transaction_date, ledger_type, direction, amount, status, created_at)
        SELECT 'variation:' || id, 'variations', id, project_id, contract_id, boq_item_id, json_extract(payload, '$.approved_date'), 'Commercial Variation', CASE WHEN CAST(COALESCE(json_extract(payload, '$.cost_impact'), 0) AS REAL) >= 0 THEN 'Increase' ELSE 'Decrease' END, ABS(CAST(COALESCE(json_extract(payload, '$.cost_impact'), 0) AS REAL)), json_extract(payload, '$.status'), created_at FROM variations;
      INSERT OR REPLACE INTO financial_ledger (id, source_table, source_id, project_id, contract_id, boq_item_id, transaction_date, ledger_type, direction, amount, status, created_at)
        SELECT 'certificate:' || id, 'payment_certificates', id, project_id, contract_id, boq_item_id, json_extract(payload, '$.certificate_date'), 'Payment Certificate', CASE WHEN json_extract(payload, '$.certificate_type') = 'Client' THEN 'Inflow' ELSE 'Outflow' END, CAST(COALESCE(json_extract(payload, '$.gross_certified_value'), 0) AS REAL), json_extract(payload, '$.status'), created_at FROM payment_certificates;

      CREATE TRIGGER IF NOT EXISTS financial_ledger_cost_entries_ai AFTER INSERT ON cost_entries BEGIN
        INSERT OR REPLACE INTO financial_ledger VALUES ('cost:' || NEW.id, 'cost_entries', NEW.id, NEW.project_id, NEW.contract_id, NEW.boq_item_id, json_extract(NEW.payload, '$.date'), 'Actual Cost', 'Outflow', CAST(COALESCE(json_extract(NEW.payload, '$.amount'), 0) AS REAL), json_extract(NEW.payload, '$.cost_type'), NEW.created_at);
      END;
      CREATE TRIGGER IF NOT EXISTS financial_ledger_cost_entries_au AFTER UPDATE ON cost_entries BEGIN
        INSERT OR REPLACE INTO financial_ledger VALUES ('cost:' || NEW.id, 'cost_entries', NEW.id, NEW.project_id, NEW.contract_id, NEW.boq_item_id, json_extract(NEW.payload, '$.date'), 'Actual Cost', 'Outflow', CAST(COALESCE(json_extract(NEW.payload, '$.amount'), 0) AS REAL), json_extract(NEW.payload, '$.cost_type'), NEW.created_at);
      END;
      CREATE TRIGGER IF NOT EXISTS financial_ledger_cost_entries_ad AFTER DELETE ON cost_entries BEGIN DELETE FROM financial_ledger WHERE source_table = 'cost_entries' AND source_id = OLD.id; END;

      CREATE TRIGGER IF NOT EXISTS financial_ledger_cash_flow_ai AFTER INSERT ON cash_flow BEGIN
        INSERT OR REPLACE INTO financial_ledger VALUES ('cash:' || NEW.id, 'cash_flow', NEW.id, NEW.project_id, NEW.contract_id, NEW.boq_item_id, json_extract(NEW.payload, '$.date'), 'Cash Flow', CASE WHEN CAST(COALESCE(json_extract(NEW.payload, '$.inflow'), 0) AS REAL) > 0 THEN 'Inflow' ELSE 'Outflow' END, ABS(CAST(COALESCE(json_extract(NEW.payload, '$.inflow'), 0) AS REAL) - CAST(COALESCE(json_extract(NEW.payload, '$.outflow'), 0) AS REAL)), json_extract(NEW.payload, '$.status'), NEW.created_at);
      END;
      CREATE TRIGGER IF NOT EXISTS financial_ledger_cash_flow_au AFTER UPDATE ON cash_flow BEGIN
        INSERT OR REPLACE INTO financial_ledger VALUES ('cash:' || NEW.id, 'cash_flow', NEW.id, NEW.project_id, NEW.contract_id, NEW.boq_item_id, json_extract(NEW.payload, '$.date'), 'Cash Flow', CASE WHEN CAST(COALESCE(json_extract(NEW.payload, '$.inflow'), 0) AS REAL) > 0 THEN 'Inflow' ELSE 'Outflow' END, ABS(CAST(COALESCE(json_extract(NEW.payload, '$.inflow'), 0) AS REAL) - CAST(COALESCE(json_extract(NEW.payload, '$.outflow'), 0) AS REAL)), json_extract(NEW.payload, '$.status'), NEW.created_at);
      END;
      CREATE TRIGGER IF NOT EXISTS financial_ledger_cash_flow_ad AFTER DELETE ON cash_flow BEGIN DELETE FROM financial_ledger WHERE source_table = 'cash_flow' AND source_id = OLD.id; END;

      CREATE TRIGGER IF NOT EXISTS financial_ledger_variations_ai AFTER INSERT ON variations BEGIN
        INSERT OR REPLACE INTO financial_ledger VALUES ('variation:' || NEW.id, 'variations', NEW.id, NEW.project_id, NEW.contract_id, NEW.boq_item_id, json_extract(NEW.payload, '$.approved_date'), 'Commercial Variation', CASE WHEN CAST(COALESCE(json_extract(NEW.payload, '$.cost_impact'), 0) AS REAL) >= 0 THEN 'Increase' ELSE 'Decrease' END, ABS(CAST(COALESCE(json_extract(NEW.payload, '$.cost_impact'), 0) AS REAL)), json_extract(NEW.payload, '$.status'), NEW.created_at);
      END;
      CREATE TRIGGER IF NOT EXISTS financial_ledger_variations_au AFTER UPDATE ON variations BEGIN
        INSERT OR REPLACE INTO financial_ledger VALUES ('variation:' || NEW.id, 'variations', NEW.id, NEW.project_id, NEW.contract_id, NEW.boq_item_id, json_extract(NEW.payload, '$.approved_date'), 'Commercial Variation', CASE WHEN CAST(COALESCE(json_extract(NEW.payload, '$.cost_impact'), 0) AS REAL) >= 0 THEN 'Increase' ELSE 'Decrease' END, ABS(CAST(COALESCE(json_extract(NEW.payload, '$.cost_impact'), 0) AS REAL)), json_extract(NEW.payload, '$.status'), NEW.created_at);
      END;
      CREATE TRIGGER IF NOT EXISTS financial_ledger_variations_ad AFTER DELETE ON variations BEGIN DELETE FROM financial_ledger WHERE source_table = 'variations' AND source_id = OLD.id; END;

      CREATE TRIGGER IF NOT EXISTS financial_ledger_payment_certificates_ai AFTER INSERT ON payment_certificates BEGIN
        INSERT OR REPLACE INTO financial_ledger VALUES ('certificate:' || NEW.id, 'payment_certificates', NEW.id, NEW.project_id, NEW.contract_id, NEW.boq_item_id, json_extract(NEW.payload, '$.certificate_date'), 'Payment Certificate', CASE WHEN json_extract(NEW.payload, '$.certificate_type') = 'Client' THEN 'Inflow' ELSE 'Outflow' END, CAST(COALESCE(json_extract(NEW.payload, '$.gross_certified_value'), 0) AS REAL), json_extract(NEW.payload, '$.status'), NEW.created_at);
      END;
      CREATE TRIGGER IF NOT EXISTS financial_ledger_payment_certificates_au AFTER UPDATE ON payment_certificates BEGIN
        INSERT OR REPLACE INTO financial_ledger VALUES ('certificate:' || NEW.id, 'payment_certificates', NEW.id, NEW.project_id, NEW.contract_id, NEW.boq_item_id, json_extract(NEW.payload, '$.certificate_date'), 'Payment Certificate', CASE WHEN json_extract(NEW.payload, '$.certificate_type') = 'Client' THEN 'Inflow' ELSE 'Outflow' END, CAST(COALESCE(json_extract(NEW.payload, '$.gross_certified_value'), 0) AS REAL), json_extract(NEW.payload, '$.status'), NEW.created_at);
      END;
      CREATE TRIGGER IF NOT EXISTS financial_ledger_payment_certificates_ad AFTER DELETE ON payment_certificates BEGIN DELETE FROM financial_ledger WHERE source_table = 'payment_certificates' AND source_id = OLD.id; END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 22,
            description: "govern_sov_cost_changes_and_commitment_ledger",
            sql: r#"
      -- A cost change is allocated to exactly one SOV line. The repository
      -- writes this real column as well as the audit payload.
      ALTER TABLE cost_changes ADD COLUMN contract_sov_line_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_cost_changes_sov_line ON cost_changes(contract_sov_line_id, project_id, contract_id, json_extract(payload, '$.status'));
      UPDATE cost_changes SET contract_sov_line_id = json_extract(payload, '$.contract_sov_line_id')
        WHERE contract_sov_line_id IS NULL;

      INSERT OR REPLACE INTO financial_ledger (id, source_table, source_id, project_id, contract_id, boq_item_id, transaction_date, ledger_type, direction, amount, status, created_at)
        SELECT 'cost-change:' || id, 'cost_changes', id, project_id, contract_id, boq_item_id, COALESCE(json_extract(payload, '$.approved_date'), json_extract(payload, '$.effective_date')), 'Cost Change', CASE WHEN CAST(COALESCE(json_extract(payload, '$.amount'), 0) AS REAL) >= 0 THEN 'Increase' ELSE 'Decrease' END, ABS(CAST(COALESCE(json_extract(payload, '$.amount'), 0) AS REAL)), json_extract(payload, '$.status'), created_at FROM cost_changes;
      INSERT OR REPLACE INTO financial_ledger (id, source_table, source_id, project_id, contract_id, boq_item_id, transaction_date, ledger_type, direction, amount, status, created_at)
        SELECT 'commitment:' || id, 'procurement', id, project_id, contract_id, boq_item_id, COALESCE(json_extract(payload, '$.order_date'), json_extract(payload, '$.date')), 'Commitment', 'Commitment', CAST(COALESCE(json_extract(payload, '$.total_cost'), CAST(COALESCE(json_extract(payload, '$.quantity'), 0) AS REAL) * CAST(COALESCE(json_extract(payload, '$.unit_cost'), 0) AS REAL)) AS REAL), json_extract(payload, '$.status'), created_at FROM procurement;

      CREATE TRIGGER IF NOT EXISTS financial_ledger_cost_changes_ai AFTER INSERT ON cost_changes BEGIN
        INSERT OR REPLACE INTO financial_ledger VALUES ('cost-change:' || NEW.id, 'cost_changes', NEW.id, NEW.project_id, NEW.contract_id, NEW.boq_item_id, COALESCE(json_extract(NEW.payload, '$.approved_date'), json_extract(NEW.payload, '$.effective_date')), 'Cost Change', CASE WHEN CAST(COALESCE(json_extract(NEW.payload, '$.amount'), 0) AS REAL) >= 0 THEN 'Increase' ELSE 'Decrease' END, ABS(CAST(COALESCE(json_extract(NEW.payload, '$.amount'), 0) AS REAL)), json_extract(NEW.payload, '$.status'), NEW.created_at);
      END;
      CREATE TRIGGER IF NOT EXISTS financial_ledger_cost_changes_au AFTER UPDATE ON cost_changes BEGIN
        INSERT OR REPLACE INTO financial_ledger VALUES ('cost-change:' || NEW.id, 'cost_changes', NEW.id, NEW.project_id, NEW.contract_id, NEW.boq_item_id, COALESCE(json_extract(NEW.payload, '$.approved_date'), json_extract(NEW.payload, '$.effective_date')), 'Cost Change', CASE WHEN CAST(COALESCE(json_extract(NEW.payload, '$.amount'), 0) AS REAL) >= 0 THEN 'Increase' ELSE 'Decrease' END, ABS(CAST(COALESCE(json_extract(NEW.payload, '$.amount'), 0) AS REAL)), json_extract(NEW.payload, '$.status'), NEW.created_at);
      END;
      CREATE TRIGGER IF NOT EXISTS financial_ledger_cost_changes_ad AFTER DELETE ON cost_changes BEGIN DELETE FROM financial_ledger WHERE source_table = 'cost_changes' AND source_id = OLD.id; END;

      CREATE TRIGGER IF NOT EXISTS financial_ledger_procurement_ai AFTER INSERT ON procurement BEGIN
        INSERT OR REPLACE INTO financial_ledger VALUES ('commitment:' || NEW.id, 'procurement', NEW.id, NEW.project_id, NEW.contract_id, NEW.boq_item_id, COALESCE(json_extract(NEW.payload, '$.order_date'), json_extract(NEW.payload, '$.date')), 'Commitment', 'Commitment', CAST(COALESCE(json_extract(NEW.payload, '$.total_cost'), CAST(COALESCE(json_extract(NEW.payload, '$.quantity'), 0) AS REAL) * CAST(COALESCE(json_extract(NEW.payload, '$.unit_cost'), 0) AS REAL)) AS REAL), json_extract(NEW.payload, '$.status'), NEW.created_at);
      END;
      CREATE TRIGGER IF NOT EXISTS financial_ledger_procurement_au AFTER UPDATE ON procurement BEGIN
        INSERT OR REPLACE INTO financial_ledger VALUES ('commitment:' || NEW.id, 'procurement', NEW.id, NEW.project_id, NEW.contract_id, NEW.boq_item_id, COALESCE(json_extract(NEW.payload, '$.order_date'), json_extract(NEW.payload, '$.date')), 'Commitment', 'Commitment', CAST(COALESCE(json_extract(NEW.payload, '$.total_cost'), CAST(COALESCE(json_extract(NEW.payload, '$.quantity'), 0) AS REAL) * CAST(COALESCE(json_extract(NEW.payload, '$.unit_cost'), 0) AS REAL)) AS REAL), json_extract(NEW.payload, '$.status'), NEW.created_at);
      END;
      CREATE TRIGGER IF NOT EXISTS financial_ledger_procurement_ad AFTER DELETE ON procurement BEGIN DELETE FROM financial_ledger WHERE source_table = 'procurement' AND source_id = OLD.id; END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 23,
            description: "repair_schedule_project_scope_from_contract",
            sql: r#"
      -- Older P6 schedule-only rows could retain the selected contract while
      -- missing project_id because project_id is a controlled UI relation.
      -- Repair both the relational column and JSON payload from that contract.
      UPDATE schedules
      SET project_id = (SELECT project_id FROM contracts WHERE contracts.id = schedules.contract_id),
          payload = json_set(payload, '$.project_id', (SELECT project_id FROM contracts WHERE contracts.id = schedules.contract_id))
      WHERE (project_id IS NULL OR project_id = '')
        AND contract_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM contracts WHERE contracts.id = schedules.contract_id AND contracts.project_id IS NOT NULL);
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 24,
            description: "add_governed_import_batches",
            sql: r#"
      CREATE TABLE IF NOT EXISTS import_batches (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        committed_at TEXT,
        source TEXT NOT NULL,
        file_name TEXT NOT NULL,
        target_table TEXT NOT NULL,
        project_id TEXT,
        contract_id TEXT,
        status TEXT NOT NULL,
        row_count INTEGER NOT NULL DEFAULT 0,
        committed_count INTEGER NOT NULL DEFAULT 0,
        rejected_count INTEGER NOT NULL DEFAULT 0,
        summary_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS import_batch_rows (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        source_row_number INTEGER NOT NULL,
        target_table TEXT NOT NULL,
        target_record_id TEXT,
        status TEXT NOT NULL,
        error_json TEXT,
        source_json TEXT NOT NULL,
        mapped_json TEXT NOT NULL,
        FOREIGN KEY(batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_import_batches_scope
        ON import_batches(project_id, contract_id, target_table, status);
      CREATE INDEX IF NOT EXISTS idx_import_batch_rows_batch
        ON import_batch_rows(batch_id, source_row_number);
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 25,
            description: "add_procurement_receipts_for_actual_cost",
            sql: r#"
      CREATE TABLE IF NOT EXISTS procurement_receipts (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
        project_id TEXT NOT NULL, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT,
        parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
        FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_procurement_receipt_number
        ON procurement_receipts(lower(json_extract(payload, '$.receipt_number')));
      CREATE INDEX IF NOT EXISTS idx_procurement_receipts_scope_po
        ON procurement_receipts(project_id, contract_id, boq_item_id, json_extract(payload, '$.procurement_id'), json_extract(payload, '$.status'));
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 26,
            description: "add_supplier_ap_three_way_match",
            sql: r#"
      CREATE TABLE IF NOT EXISTS supplier_invoices (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
        project_id TEXT NOT NULL, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT,
        parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_invoice_supplier_number
        ON supplier_invoices(json_extract(payload, '$.supplier_party_id'), lower(json_extract(payload, '$.invoice_number')));
      CREATE INDEX IF NOT EXISTS idx_supplier_invoices_scope_status
        ON supplier_invoices(project_id, contract_id, json_extract(payload, '$.supplier_party_id'), json_extract(payload, '$.status'));
      CREATE TABLE IF NOT EXISTS supplier_invoice_lines (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
        project_id TEXT NOT NULL, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT,
        parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
        FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_supplier_invoice_lines_match
        ON supplier_invoice_lines(json_extract(payload, '$.supplier_invoice_id'), json_extract(payload, '$.procurement_receipt_id'));
      CREATE TABLE IF NOT EXISTS supplier_invoice_payments (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
        project_id TEXT NOT NULL, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT,
        parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_payment_reference
        ON supplier_invoice_payments(lower(json_extract(payload, '$.payment_number')));
      CREATE INDEX IF NOT EXISTS idx_supplier_invoice_payments_invoice
        ON supplier_invoice_payments(json_extract(payload, '$.supplier_invoice_id'), json_extract(payload, '$.status'));
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 27,
            description: "add_supplier_ap_posting_audit",
            sql: r#"
      CREATE TABLE IF NOT EXISTS supplier_ap_postings (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, source_table TEXT NOT NULL,
        source_id TEXT NOT NULL, posting_type TEXT NOT NULL, status TEXT NOT NULL,
        actor TEXT NOT NULL, effective_date TEXT, reason TEXT NOT NULL, snapshot_json TEXT NOT NULL,
        UNIQUE(source_table, source_id, posting_type)
      );
      CREATE INDEX IF NOT EXISTS idx_supplier_ap_postings_source ON supplier_ap_postings(source_table, source_id, status);
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 28,
            description: "lock_governed_supplier_ap_documents",
            sql: r#"
      CREATE TABLE IF NOT EXISTS supplier_ap_mutation_guard (
        operation_id TEXT PRIMARY KEY, created_at TEXT NOT NULL
      );
      CREATE TRIGGER IF NOT EXISTS supplier_invoice_governed_insert
      BEFORE INSERT ON supplier_invoices
      WHEN json_extract(NEW.payload, '$.status') IN ('Approved','Partially Paid','Paid','Reversed')
       AND NOT EXISTS (SELECT 1 FROM supplier_ap_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Supplier AP approval must use a governed posting.'); END;
      CREATE TRIGGER IF NOT EXISTS supplier_invoice_governed_update
      BEFORE UPDATE ON supplier_invoices
      WHEN (json_extract(OLD.payload, '$.status') IN ('Approved','Partially Paid','Paid','Reversed')
         OR json_extract(NEW.payload, '$.status') IN ('Approved','Partially Paid','Paid','Reversed'))
       AND NOT EXISTS (SELECT 1 FROM supplier_ap_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Governed supplier invoice is immutable; use a reversal.'); END;
      CREATE TRIGGER IF NOT EXISTS supplier_payment_governed_insert
      BEFORE INSERT ON supplier_invoice_payments
      WHEN json_extract(NEW.payload, '$.status') IN ('Settled','Reversed')
       AND NOT EXISTS (SELECT 1 FROM supplier_ap_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Supplier payment settlement must use a governed posting.'); END;
      CREATE TRIGGER IF NOT EXISTS supplier_payment_governed_update
      BEFORE UPDATE ON supplier_invoice_payments
      WHEN (json_extract(OLD.payload, '$.status') IN ('Settled','Reversed')
         OR json_extract(NEW.payload, '$.status') IN ('Settled','Reversed'))
       AND NOT EXISTS (SELECT 1 FROM supplier_ap_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Governed supplier payment is immutable; use a reversal.'); END;
      CREATE TRIGGER IF NOT EXISTS supplier_ap_line_governed_update
      BEFORE UPDATE ON supplier_invoice_lines
      WHEN EXISTS (
        SELECT 1 FROM supplier_invoices i
        WHERE i.id = json_extract(OLD.payload, '$.supplier_invoice_id')
          AND json_extract(i.payload, '$.status') IN ('Approved','Partially Paid','Paid','Reversed')
      ) AND NOT EXISTS (SELECT 1 FROM supplier_ap_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Approved supplier invoice match lines are immutable.'); END;
      CREATE TRIGGER IF NOT EXISTS supplier_ap_line_governed_delete
      BEFORE DELETE ON supplier_invoice_lines
      WHEN EXISTS (
        SELECT 1 FROM supplier_invoices i
        WHERE i.id = json_extract(OLD.payload, '$.supplier_invoice_id')
          AND json_extract(i.payload, '$.status') IN ('Approved','Partially Paid','Paid','Reversed')
      ) AND NOT EXISTS (SELECT 1 FROM supplier_ap_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Approved supplier invoice match lines are immutable.'); END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        // The command layer already owns AP state changes.  These initial
        // triggers are retired immediately until all legacy direct-write
        // paths have been migrated to the scoped mutation guard.
        tauri_plugin_sql::Migration {
            version: 29,
            description: "retire_incomplete_supplier_ap_sql_guards",
            sql: r#"
      DROP TRIGGER IF EXISTS supplier_invoice_governed_insert;
      DROP TRIGGER IF EXISTS supplier_invoice_governed_update;
      DROP TRIGGER IF EXISTS supplier_payment_governed_insert;
      DROP TRIGGER IF EXISTS supplier_payment_governed_update;
      DROP TRIGGER IF EXISTS supplier_ap_line_governed_update;
      DROP TRIGGER IF EXISTS supplier_ap_line_governed_delete;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 30,
            description: "enforce_supplier_ap_posting_entry_points",
            sql: r#"
      CREATE TRIGGER IF NOT EXISTS supplier_invoice_governed_insert_v2
      BEFORE INSERT ON supplier_invoices
      WHEN json_extract(NEW.payload, '$.status') IN ('Approved','Partially Paid','Paid')
       AND NOT EXISTS (SELECT 1 FROM supplier_ap_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Supplier AP approval must use a governed posting.'); END;
      CREATE TRIGGER IF NOT EXISTS supplier_invoice_governed_update_v2
      BEFORE UPDATE ON supplier_invoices
      WHEN json_extract(NEW.payload, '$.status') IN ('Approved','Partially Paid','Paid')
       AND NOT EXISTS (SELECT 1 FROM supplier_ap_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Governed supplier invoice changes must use an AP posting.'); END;
      CREATE TRIGGER IF NOT EXISTS supplier_payment_governed_insert_v2
      BEFORE INSERT ON supplier_invoice_payments
      WHEN json_extract(NEW.payload, '$.status') = 'Settled'
       AND NOT EXISTS (SELECT 1 FROM supplier_ap_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Supplier payment settlement must use a governed posting.'); END;
      CREATE TRIGGER IF NOT EXISTS supplier_payment_governed_update_v2
      BEFORE UPDATE ON supplier_invoice_payments
      WHEN json_extract(NEW.payload, '$.status') = 'Settled'
       AND NOT EXISTS (SELECT 1 FROM supplier_ap_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Governed supplier payment changes must use an AP posting.'); END;
      CREATE TRIGGER IF NOT EXISTS supplier_ap_line_governed_update_v2
      BEFORE UPDATE ON supplier_invoice_lines
      WHEN EXISTS (
        SELECT 1 FROM supplier_invoices i
        WHERE i.id = json_extract(OLD.payload, '$.supplier_invoice_id')
          AND json_extract(i.payload, '$.status') IN ('Approved','Partially Paid','Paid','Reversed')
      )
      BEGIN SELECT RAISE(ABORT, 'Approved supplier invoice match lines are immutable.'); END;
      CREATE TRIGGER IF NOT EXISTS supplier_ap_line_governed_delete_v2
      BEFORE DELETE ON supplier_invoice_lines
      WHEN EXISTS (
        SELECT 1 FROM supplier_invoices i
        WHERE i.id = json_extract(OLD.payload, '$.supplier_invoice_id')
          AND json_extract(i.payload, '$.status') IN ('Approved','Partially Paid','Paid','Reversed')
      )
      BEGIN SELECT RAISE(ABORT, 'Approved supplier invoice match lines are immutable.'); END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 31,
            description: "govern_commercial_sov_cost_change_and_certificate_postings",
            sql: r#"
      CREATE TABLE IF NOT EXISTS commercial_workflow_postings (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, source_table TEXT NOT NULL,
        source_id TEXT NOT NULL, posting_type TEXT NOT NULL, status TEXT NOT NULL,
        actor TEXT NOT NULL, effective_date TEXT, reason TEXT NOT NULL, snapshot_json TEXT NOT NULL,
        UNIQUE(source_table, source_id, posting_type)
      );
      CREATE INDEX IF NOT EXISTS idx_commercial_workflow_postings_source
        ON commercial_workflow_postings(source_table, source_id, status);
      CREATE TABLE IF NOT EXISTS commercial_mutation_guard (
        operation_id TEXT PRIMARY KEY, created_at TEXT NOT NULL
      );

      -- The ledger is a reporting fact. Certificates report their governed
      -- net certified value once it has been calculated by the posting command.
      DROP TRIGGER IF EXISTS financial_ledger_payment_certificates_ai;
      DROP TRIGGER IF EXISTS financial_ledger_payment_certificates_au;
      INSERT OR REPLACE INTO financial_ledger (id, source_table, source_id, project_id, contract_id, boq_item_id, transaction_date, ledger_type, direction, amount, status, created_at)
        SELECT 'certificate:' || id, 'payment_certificates', id, project_id, contract_id, boq_item_id,
          json_extract(payload, '$.certificate_date'), 'Payment Certificate',
          CASE WHEN json_extract(payload, '$.certificate_type') = 'Client' THEN 'Inflow' ELSE 'Outflow' END,
          CAST(COALESCE(json_extract(payload, '$.net_certified_value'), json_extract(payload, '$.gross_certified_value'), 0) AS REAL),
          json_extract(payload, '$.status'), created_at FROM payment_certificates;
      CREATE TRIGGER financial_ledger_payment_certificates_ai AFTER INSERT ON payment_certificates BEGIN
        INSERT OR REPLACE INTO financial_ledger VALUES ('certificate:' || NEW.id, 'payment_certificates', NEW.id, NEW.project_id, NEW.contract_id, NEW.boq_item_id, json_extract(NEW.payload, '$.certificate_date'), 'Payment Certificate', CASE WHEN json_extract(NEW.payload, '$.certificate_type') = 'Client' THEN 'Inflow' ELSE 'Outflow' END, CAST(COALESCE(json_extract(NEW.payload, '$.net_certified_value'), json_extract(NEW.payload, '$.gross_certified_value'), 0) AS REAL), json_extract(NEW.payload, '$.status'), NEW.created_at);
      END;
      CREATE TRIGGER financial_ledger_payment_certificates_au AFTER UPDATE ON payment_certificates BEGIN
        INSERT OR REPLACE INTO financial_ledger VALUES ('certificate:' || NEW.id, 'payment_certificates', NEW.id, NEW.project_id, NEW.contract_id, NEW.boq_item_id, json_extract(NEW.payload, '$.certificate_date'), 'Payment Certificate', CASE WHEN json_extract(NEW.payload, '$.certificate_type') = 'Client' THEN 'Inflow' ELSE 'Outflow' END, CAST(COALESCE(json_extract(NEW.payload, '$.net_certified_value'), json_extract(NEW.payload, '$.gross_certified_value'), 0) AS REAL), json_extract(NEW.payload, '$.status'), NEW.created_at);
      END;

      CREATE TRIGGER IF NOT EXISTS cost_change_governed_insert_v1
      BEFORE INSERT ON cost_changes
      WHEN json_extract(NEW.payload, '$.status') IN ('Approved','Reversed')
       AND NOT EXISTS (SELECT 1 FROM commercial_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Cost-change approval must use a governed posting.'); END;
      CREATE TRIGGER IF NOT EXISTS cost_change_governed_update_v1
      BEFORE UPDATE ON cost_changes
      WHEN (json_extract(OLD.payload, '$.status') IN ('Approved','Reversed')
         OR json_extract(NEW.payload, '$.status') IN ('Approved','Reversed'))
       AND NOT EXISTS (SELECT 1 FROM commercial_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Governed cost change is immutable; use a reversal.'); END;
      CREATE TRIGGER IF NOT EXISTS certificate_governed_insert_v1
      BEFORE INSERT ON payment_certificates
      WHEN json_extract(NEW.payload, '$.status') IN ('Approved','Paid','Reversed')
       AND NOT EXISTS (SELECT 1 FROM commercial_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Certificate approval must use a governed posting.'); END;
      CREATE TRIGGER IF NOT EXISTS certificate_governed_update_v1
      BEFORE UPDATE ON payment_certificates
      WHEN (json_extract(OLD.payload, '$.status') IN ('Approved','Paid','Reversed')
         OR json_extract(NEW.payload, '$.status') IN ('Approved','Paid','Reversed'))
       AND NOT EXISTS (SELECT 1 FROM commercial_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Governed payment certificate is immutable; use settlement or reversal.'); END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 32,
            description: "govern_purchase_order_commitment_and_grn_acceptance",
            sql: r#"
      CREATE TRIGGER IF NOT EXISTS procurement_governed_insert_v1
      BEFORE INSERT ON procurement
      WHEN json_extract(NEW.payload, '$.status') IN ('Ordered','Partially Delivered','Delivered','Closed')
       AND NOT EXISTS (SELECT 1 FROM supplier_ap_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Purchase-order approval must use a governed posting.'); END;
      CREATE TRIGGER IF NOT EXISTS procurement_governed_update_v1
      BEFORE UPDATE ON procurement
      WHEN (json_extract(OLD.payload, '$.status') IN ('Ordered','Partially Delivered','Delivered','Closed')
         OR json_extract(NEW.payload, '$.status') IN ('Ordered','Partially Delivered','Delivered','Closed'))
       AND NOT EXISTS (SELECT 1 FROM supplier_ap_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Governed purchase order is immutable; use a controlled amendment or reversal.'); END;
      CREATE TRIGGER IF NOT EXISTS procurement_receipt_governed_insert_v1
      BEFORE INSERT ON procurement_receipts
      WHEN json_extract(NEW.payload, '$.status') = 'Accepted'
       AND NOT EXISTS (SELECT 1 FROM supplier_ap_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'GRN acceptance must use a governed posting.'); END;
      CREATE TRIGGER IF NOT EXISTS procurement_receipt_governed_update_v1
      BEFORE UPDATE ON procurement_receipts
      WHEN (json_extract(OLD.payload, '$.status') = 'Accepted'
         OR json_extract(NEW.payload, '$.status') = 'Accepted')
       AND NOT EXISTS (SELECT 1 FROM supplier_ap_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Accepted GRN is immutable; use a controlled correction.'); END;
      CREATE INDEX IF NOT EXISTS idx_procurement_commitment_status
        ON procurement(project_id, contract_id, boq_item_id, json_extract(payload, '$.status'));
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 33,
            description: "govern_purchase_order_cancellation",
            sql: r#"
      CREATE TRIGGER IF NOT EXISTS procurement_governed_cancel_insert_v1
      BEFORE INSERT ON procurement
      WHEN json_extract(NEW.payload, '$.status') = 'Cancelled'
       AND NOT EXISTS (SELECT 1 FROM supplier_ap_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Purchase-order cancellation must use a governed posting.'); END;
      CREATE TRIGGER IF NOT EXISTS procurement_governed_cancel_update_v1
      BEFORE UPDATE ON procurement
      WHEN (json_extract(OLD.payload, '$.status') = 'Cancelled'
         OR json_extract(NEW.payload, '$.status') = 'Cancelled')
       AND NOT EXISTS (SELECT 1 FROM supplier_ap_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Governed purchase-order cancellation is immutable.'); END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 34,
            description: "index_certificate_retention_and_advance_balances",
            sql: r#"
      ALTER TABLE payment_certificates ADD COLUMN retention_amount_sql REAL GENERATED ALWAYS AS (CAST(COALESCE(json_extract(payload, '$.retention_amount'), 0) AS REAL)) VIRTUAL;
      ALTER TABLE payment_certificates ADD COLUMN cumulative_retention_amount_sql REAL GENERATED ALWAYS AS (CAST(COALESCE(json_extract(payload, '$.cumulative_retention_amount'), 0) AS REAL)) VIRTUAL;
      ALTER TABLE payment_certificates ADD COLUMN advance_recovery_sql REAL GENERATED ALWAYS AS (CAST(COALESCE(json_extract(payload, '$.advance_recovery'), 0) AS REAL)) VIRTUAL;
      ALTER TABLE payment_certificates ADD COLUMN remaining_advance_balance_sql REAL GENERATED ALWAYS AS (CAST(COALESCE(json_extract(payload, '$.remaining_advance_balance'), 0) AS REAL)) VIRTUAL;
      CREATE INDEX IF NOT EXISTS idx_certificate_contract_balances ON payment_certificates(contract_id, certificate_date_sql, status_sql);
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 35,
            description: "governed_time_phased_cash_timeline",
            sql: r#"
      DROP VIEW IF EXISTS governed_cash_flow_timeline;
      CREATE VIEW governed_cash_flow_timeline AS
      SELECT
        id, project_id, contract_id, boq_item_id, financial_date AS cash_date,
        movement_type_sql AS movement_type, financial_status AS status,
        financial_inflow AS inflow, financial_outflow AS outflow,
        financial_inflow - financial_outflow AS net,
        sum(CASE WHEN financial_status IN ('Cancelled','Reversed') THEN 0 ELSE financial_inflow - financial_outflow END)
          OVER (PARTITION BY project_id, movement_type_sql ORDER BY COALESCE(financial_date, '9999-12-31'), created_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_balance
      FROM cash_flow;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 36,
            description: "govern_variation_approval",
            sql: r#"
      CREATE TRIGGER IF NOT EXISTS variation_governed_approval_insert_v1
      BEFORE INSERT ON variations
      WHEN json_extract(NEW.payload, '$.status') = 'Approved'
       AND NOT EXISTS (SELECT 1 FROM commercial_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Variation approval must use a governed posting.'); END;
      CREATE TRIGGER IF NOT EXISTS variation_governed_approval_update_v1
      BEFORE UPDATE ON variations
      WHEN (json_extract(OLD.payload, '$.status') = 'Approved'
         OR json_extract(NEW.payload, '$.status') = 'Approved')
       AND NOT EXISTS (SELECT 1 FROM commercial_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Governed variation is immutable; use a controlled reversal.'); END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 37,
            description: "freeze_approved_variation_lines",
            sql: r#"
      CREATE TRIGGER IF NOT EXISTS variation_line_governed_update_v1
      BEFORE UPDATE ON variation_lines
      WHEN EXISTS (
        SELECT 1 FROM variations v
        WHERE v.id = json_extract(OLD.payload, '$.variation_id')
          AND json_extract(v.payload, '$.status') = 'Approved'
      ) AND NOT EXISTS (SELECT 1 FROM commercial_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Approved variation lines are immutable.'); END;
      CREATE TRIGGER IF NOT EXISTS variation_line_governed_delete_v1
      BEFORE DELETE ON variation_lines
      WHEN EXISTS (
        SELECT 1 FROM variations v
        WHERE v.id = json_extract(OLD.payload, '$.variation_id')
          AND json_extract(v.payload, '$.status') = 'Approved'
      ) AND NOT EXISTS (SELECT 1 FROM commercial_mutation_guard)
      BEGIN SELECT RAISE(ABORT, 'Approved variation lines are immutable.'); END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 38,
            description: "create_work_calendar_master",
            sql: r#"
      CREATE TABLE IF NOT EXISTS work_calendars (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
        project_id TEXT, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT,
        parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_work_calendar_code
        ON work_calendars(json_extract(payload, '$.calendar_code'));
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 39,
            description: "create_reusable_resource_master",
            sql: r#"
      CREATE TABLE IF NOT EXISTS resource_masters (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
        project_id TEXT, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT,
        parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_resource_master_code
        ON resource_masters(json_extract(payload, '$.resource_code'));
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 40,
            description: "create_schedule_resource_assignments",
            sql: r#"
      CREATE TABLE IF NOT EXISTS schedule_resource_assignments (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
        project_id TEXT NOT NULL, contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT,
        parent_main_project_id TEXT, parent_main_contract_id TEXT, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
        FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_schedule_resource_assignments_scope
        ON schedule_resource_assignments(project_id, contract_id, boq_item_id);
      CREATE INDEX IF NOT EXISTS idx_schedule_resource_assignments_activity
        ON schedule_resource_assignments(json_extract(payload, '$.schedule_id'));
      CREATE INDEX IF NOT EXISTS idx_schedule_resource_assignments_resource
        ON schedule_resource_assignments(json_extract(payload, '$.resource_id'));
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 41,
            description: "enforce_sov_budget_availability_in_sqlite",
            sql: r#"
      -- Availability is enforced where records are persisted, not only in the
      -- React form. A controlled SOV line consumes its revised budget through
      -- actual cost plus the unreceived portion of ordered commitments.
      -- Accepted GRNs reduce their PO's open commitment, so they never count
      -- twice as both commitment and actual cost.
      CREATE TRIGGER IF NOT EXISTS sov_budget_cost_entry_insert_v1
      BEFORE INSERT ON cost_entries
      WHEN EXISTS (
        SELECT 1 FROM contract_sov_lines s
        WHERE s.project_id = NEW.project_id
          AND s.contract_id = NEW.contract_id
          AND COALESCE(s.boq_item_id, '') = COALESCE(NEW.boq_item_id, '')
          AND COALESCE(json_extract(s.payload, '$.status'), 'Active') = 'Active'
          AND (
            COALESCE(CAST(json_extract(s.payload, '$.revised_budget') AS REAL), CAST(json_extract(s.payload, '$.original_budget') AS REAL), 0)
            + 0.000001 <
            COALESCE((SELECT sum(CAST(COALESCE(json_extract(c.payload, '$.amount'), 0) AS REAL))
              FROM cost_entries c WHERE c.project_id = NEW.project_id AND c.contract_id = NEW.contract_id
                AND COALESCE(c.boq_item_id, '') = COALESCE(NEW.boq_item_id, '')), 0)
            + CAST(COALESCE(json_extract(NEW.payload, '$.amount'), 0) AS REAL)
            + COALESCE((SELECT sum(max(0,
                CAST(COALESCE(json_extract(p.payload, '$.total_cost'), CAST(COALESCE(json_extract(p.payload, '$.quantity'), 0) AS REAL) * CAST(COALESCE(json_extract(p.payload, '$.unit_cost'), 0) AS REAL)) AS REAL)
                - COALESCE((SELECT sum(CAST(COALESCE(json_extract(r.payload, '$.accepted_quantity'), 0) AS REAL) * CAST(COALESCE(json_extract(r.payload, '$.unit_cost'), 0) AS REAL))
                    FROM procurement_receipts r WHERE json_extract(r.payload, '$.procurement_id') = p.id AND json_extract(r.payload, '$.status') = 'Accepted'), 0)
              )) FROM procurement p
              WHERE p.project_id = NEW.project_id AND p.contract_id = NEW.contract_id
                AND COALESCE(p.boq_item_id, '') = COALESCE(NEW.boq_item_id, '')
                AND json_extract(p.payload, '$.status') IN ('Ordered', 'Partially Delivered', 'Delivered', 'Closed')), 0)
          )
      )
      BEGIN SELECT RAISE(ABORT, 'SOV budget availability exceeded by actual cost posting.'); END;

      CREATE TRIGGER IF NOT EXISTS sov_budget_cost_entry_update_v1
      BEFORE UPDATE ON cost_entries
      WHEN EXISTS (
        SELECT 1 FROM contract_sov_lines s
        WHERE s.project_id = NEW.project_id
          AND s.contract_id = NEW.contract_id
          AND COALESCE(s.boq_item_id, '') = COALESCE(NEW.boq_item_id, '')
          AND COALESCE(json_extract(s.payload, '$.status'), 'Active') = 'Active'
          AND (
            COALESCE(CAST(json_extract(s.payload, '$.revised_budget') AS REAL), CAST(json_extract(s.payload, '$.original_budget') AS REAL), 0)
            + 0.000001 <
            COALESCE((SELECT sum(CAST(COALESCE(json_extract(c.payload, '$.amount'), 0) AS REAL))
              FROM cost_entries c WHERE c.project_id = NEW.project_id AND c.contract_id = NEW.contract_id
                AND COALESCE(c.boq_item_id, '') = COALESCE(NEW.boq_item_id, '') AND c.id <> NEW.id), 0)
            + CAST(COALESCE(json_extract(NEW.payload, '$.amount'), 0) AS REAL)
            + COALESCE((SELECT sum(max(0,
                CAST(COALESCE(json_extract(p.payload, '$.total_cost'), CAST(COALESCE(json_extract(p.payload, '$.quantity'), 0) AS REAL) * CAST(COALESCE(json_extract(p.payload, '$.unit_cost'), 0) AS REAL)) AS REAL)
                - COALESCE((SELECT sum(CAST(COALESCE(json_extract(r.payload, '$.accepted_quantity'), 0) AS REAL) * CAST(COALESCE(json_extract(r.payload, '$.unit_cost'), 0) AS REAL))
                    FROM procurement_receipts r WHERE json_extract(r.payload, '$.procurement_id') = p.id AND json_extract(r.payload, '$.status') = 'Accepted'), 0)
              )) FROM procurement p
              WHERE p.project_id = NEW.project_id AND p.contract_id = NEW.contract_id
                AND COALESCE(p.boq_item_id, '') = COALESCE(NEW.boq_item_id, '')
                AND json_extract(p.payload, '$.status') IN ('Ordered', 'Partially Delivered', 'Delivered', 'Closed')), 0)
          )
      )
      BEGIN SELECT RAISE(ABORT, 'SOV budget availability exceeded by actual cost posting.'); END;

      CREATE TRIGGER IF NOT EXISTS sov_budget_procurement_commitment_update_v1
      BEFORE UPDATE ON procurement
      WHEN json_extract(NEW.payload, '$.status') IN ('Ordered', 'Partially Delivered', 'Delivered', 'Closed')
       AND EXISTS (
        SELECT 1 FROM contract_sov_lines s
        WHERE s.project_id = NEW.project_id
          AND s.contract_id = NEW.contract_id
          AND COALESCE(s.boq_item_id, '') = COALESCE(NEW.boq_item_id, '')
          AND COALESCE(json_extract(s.payload, '$.status'), 'Active') = 'Active'
          AND (
            COALESCE(CAST(json_extract(s.payload, '$.revised_budget') AS REAL), CAST(json_extract(s.payload, '$.original_budget') AS REAL), 0)
            + 0.000001 <
            COALESCE((SELECT sum(CAST(COALESCE(json_extract(c.payload, '$.amount'), 0) AS REAL))
              FROM cost_entries c WHERE c.project_id = NEW.project_id AND c.contract_id = NEW.contract_id
                AND COALESCE(c.boq_item_id, '') = COALESCE(NEW.boq_item_id, '')), 0)
            + CAST(COALESCE(json_extract(NEW.payload, '$.total_cost'), CAST(COALESCE(json_extract(NEW.payload, '$.quantity'), 0) AS REAL) * CAST(COALESCE(json_extract(NEW.payload, '$.unit_cost'), 0) AS REAL)) AS REAL)
            + COALESCE((SELECT sum(max(0,
                CAST(COALESCE(json_extract(p.payload, '$.total_cost'), CAST(COALESCE(json_extract(p.payload, '$.quantity'), 0) AS REAL) * CAST(COALESCE(json_extract(p.payload, '$.unit_cost'), 0) AS REAL)) AS REAL)
                - COALESCE((SELECT sum(CAST(COALESCE(json_extract(r.payload, '$.accepted_quantity'), 0) AS REAL) * CAST(COALESCE(json_extract(r.payload, '$.unit_cost'), 0) AS REAL))
                    FROM procurement_receipts r WHERE json_extract(r.payload, '$.procurement_id') = p.id AND json_extract(r.payload, '$.status') = 'Accepted'), 0)
              )) FROM procurement p
              WHERE p.project_id = NEW.project_id AND p.contract_id = NEW.contract_id
                AND COALESCE(p.boq_item_id, '') = COALESCE(NEW.boq_item_id, '') AND p.id <> NEW.id
                AND json_extract(p.payload, '$.status') IN ('Ordered', 'Partially Delivered', 'Delivered', 'Closed')), 0)
          )
      )
      BEGIN SELECT RAISE(ABORT, 'SOV budget availability exceeded by purchase-order commitment.'); END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 42,
            description: "enforce_financial_period_lock_in_sqlite",
            sql: r#"
      -- Financial history is protected in the database after the PMO locks
      -- or closes its reporting period. This is deliberately below the UI
      -- repository layer so direct plugin writes cannot rewrite past actuals.
      CREATE TRIGGER IF NOT EXISTS reporting_lock_cost_entries_insert_v1
      BEFORE INSERT ON cost_entries
      WHEN EXISTS (SELECT 1 FROM reporting_periods p WHERE p.project_id=NEW.project_id
        AND json_extract(p.payload,'$.status') IN ('Locked','Closed')
        AND substr(COALESCE(json_extract(NEW.payload,'$.date'),''),1,10) BETWEEN json_extract(p.payload,'$.start_date') AND json_extract(p.payload,'$.end_date'))
      BEGIN SELECT RAISE(ABORT, 'Reporting period is locked for this actual-cost posting.'); END;
      CREATE TRIGGER IF NOT EXISTS reporting_lock_cost_entries_update_v1
      BEFORE UPDATE ON cost_entries
      WHEN EXISTS (SELECT 1 FROM reporting_periods p WHERE p.project_id=OLD.project_id
        AND json_extract(p.payload,'$.status') IN ('Locked','Closed')
        AND substr(COALESCE(json_extract(OLD.payload,'$.date'),''),1,10) BETWEEN json_extract(p.payload,'$.start_date') AND json_extract(p.payload,'$.end_date'))
        OR EXISTS (SELECT 1 FROM reporting_periods p WHERE p.project_id=NEW.project_id
          AND json_extract(p.payload,'$.status') IN ('Locked','Closed')
          AND substr(COALESCE(json_extract(NEW.payload,'$.date'),''),1,10) BETWEEN json_extract(p.payload,'$.start_date') AND json_extract(p.payload,'$.end_date'))
      BEGIN SELECT RAISE(ABORT, 'Reporting period is locked for this actual-cost posting.'); END;
      CREATE TRIGGER IF NOT EXISTS reporting_lock_cost_entries_delete_v1
      BEFORE DELETE ON cost_entries
      WHEN EXISTS (SELECT 1 FROM reporting_periods p WHERE p.project_id=OLD.project_id
        AND json_extract(p.payload,'$.status') IN ('Locked','Closed')
        AND substr(COALESCE(json_extract(OLD.payload,'$.date'),''),1,10) BETWEEN json_extract(p.payload,'$.start_date') AND json_extract(p.payload,'$.end_date'))
      BEGIN SELECT RAISE(ABORT, 'Reporting period is locked for this actual-cost posting.'); END;

      CREATE TRIGGER IF NOT EXISTS reporting_lock_cash_flow_insert_v1
      BEFORE INSERT ON cash_flow
      WHEN EXISTS (SELECT 1 FROM reporting_periods p WHERE p.project_id=NEW.project_id
        AND json_extract(p.payload,'$.status') IN ('Locked','Closed')
        AND substr(COALESCE(json_extract(NEW.payload,'$.date'),''),1,10) BETWEEN json_extract(p.payload,'$.start_date') AND json_extract(p.payload,'$.end_date'))
      BEGIN SELECT RAISE(ABORT, 'Reporting period is locked for this cash movement.'); END;
      CREATE TRIGGER IF NOT EXISTS reporting_lock_cash_flow_update_v1
      BEFORE UPDATE ON cash_flow
      WHEN EXISTS (SELECT 1 FROM reporting_periods p WHERE p.project_id=OLD.project_id
        AND json_extract(p.payload,'$.status') IN ('Locked','Closed')
        AND substr(COALESCE(json_extract(OLD.payload,'$.date'),''),1,10) BETWEEN json_extract(p.payload,'$.start_date') AND json_extract(p.payload,'$.end_date'))
        OR EXISTS (SELECT 1 FROM reporting_periods p WHERE p.project_id=NEW.project_id
          AND json_extract(p.payload,'$.status') IN ('Locked','Closed')
          AND substr(COALESCE(json_extract(NEW.payload,'$.date'),''),1,10) BETWEEN json_extract(p.payload,'$.start_date') AND json_extract(p.payload,'$.end_date'))
      BEGIN SELECT RAISE(ABORT, 'Reporting period is locked for this cash movement.'); END;
      CREATE TRIGGER IF NOT EXISTS reporting_lock_cash_flow_delete_v1
      BEFORE DELETE ON cash_flow
      WHEN EXISTS (SELECT 1 FROM reporting_periods p WHERE p.project_id=OLD.project_id
        AND json_extract(p.payload,'$.status') IN ('Locked','Closed')
        AND substr(COALESCE(json_extract(OLD.payload,'$.date'),''),1,10) BETWEEN json_extract(p.payload,'$.start_date') AND json_extract(p.payload,'$.end_date'))
      BEGIN SELECT RAISE(ABORT, 'Reporting period is locked for this cash movement.'); END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 43,
            description: "enforce_procurement_period_lock_in_sqlite",
            sql: r#"
      -- Commitment and GRN dates are financial-control dates too. Their
      -- history may not be rewritten after the reporting period is locked.
      CREATE TRIGGER IF NOT EXISTS reporting_lock_procurement_insert_v1
      BEFORE INSERT ON procurement
      WHEN EXISTS (SELECT 1 FROM reporting_periods p WHERE p.project_id=NEW.project_id
        AND json_extract(p.payload,'$.status') IN ('Locked','Closed')
        AND substr(COALESCE(json_extract(NEW.payload,'$.order_date'),json_extract(NEW.payload,'$.date'),''),1,10) BETWEEN json_extract(p.payload,'$.start_date') AND json_extract(p.payload,'$.end_date'))
      BEGIN SELECT RAISE(ABORT, 'Reporting period is locked for this purchase-order commitment.'); END;
      CREATE TRIGGER IF NOT EXISTS reporting_lock_procurement_update_v1
      BEFORE UPDATE ON procurement
      WHEN EXISTS (SELECT 1 FROM reporting_periods p WHERE p.project_id=OLD.project_id
        AND json_extract(p.payload,'$.status') IN ('Locked','Closed')
        AND substr(COALESCE(json_extract(OLD.payload,'$.order_date'),json_extract(OLD.payload,'$.date'),''),1,10) BETWEEN json_extract(p.payload,'$.start_date') AND json_extract(p.payload,'$.end_date'))
        OR EXISTS (SELECT 1 FROM reporting_periods p WHERE p.project_id=NEW.project_id
          AND json_extract(p.payload,'$.status') IN ('Locked','Closed')
          AND substr(COALESCE(json_extract(NEW.payload,'$.order_date'),json_extract(NEW.payload,'$.date'),''),1,10) BETWEEN json_extract(p.payload,'$.start_date') AND json_extract(p.payload,'$.end_date'))
      BEGIN SELECT RAISE(ABORT, 'Reporting period is locked for this purchase-order commitment.'); END;
      CREATE TRIGGER IF NOT EXISTS reporting_lock_procurement_delete_v1
      BEFORE DELETE ON procurement
      WHEN EXISTS (SELECT 1 FROM reporting_periods p WHERE p.project_id=OLD.project_id
        AND json_extract(p.payload,'$.status') IN ('Locked','Closed')
        AND substr(COALESCE(json_extract(OLD.payload,'$.order_date'),json_extract(OLD.payload,'$.date'),''),1,10) BETWEEN json_extract(p.payload,'$.start_date') AND json_extract(p.payload,'$.end_date'))
      BEGIN SELECT RAISE(ABORT, 'Reporting period is locked for this purchase-order commitment.'); END;

      CREATE TRIGGER IF NOT EXISTS reporting_lock_receipts_insert_v1
      BEFORE INSERT ON procurement_receipts
      WHEN EXISTS (SELECT 1 FROM reporting_periods p WHERE p.project_id=NEW.project_id
        AND json_extract(p.payload,'$.status') IN ('Locked','Closed')
        AND substr(COALESCE(json_extract(NEW.payload,'$.receipt_date'),json_extract(NEW.payload,'$.accepted_date'),json_extract(NEW.payload,'$.date'),''),1,10) BETWEEN json_extract(p.payload,'$.start_date') AND json_extract(p.payload,'$.end_date'))
      BEGIN SELECT RAISE(ABORT, 'Reporting period is locked for this goods receipt.'); END;
      CREATE TRIGGER IF NOT EXISTS reporting_lock_receipts_update_v1
      BEFORE UPDATE ON procurement_receipts
      WHEN EXISTS (SELECT 1 FROM reporting_periods p WHERE p.project_id=OLD.project_id
        AND json_extract(p.payload,'$.status') IN ('Locked','Closed')
        AND substr(COALESCE(json_extract(OLD.payload,'$.receipt_date'),json_extract(OLD.payload,'$.accepted_date'),json_extract(OLD.payload,'$.date'),''),1,10) BETWEEN json_extract(p.payload,'$.start_date') AND json_extract(p.payload,'$.end_date'))
        OR EXISTS (SELECT 1 FROM reporting_periods p WHERE p.project_id=NEW.project_id
          AND json_extract(p.payload,'$.status') IN ('Locked','Closed')
          AND substr(COALESCE(json_extract(NEW.payload,'$.receipt_date'),json_extract(NEW.payload,'$.accepted_date'),json_extract(NEW.payload,'$.date'),''),1,10) BETWEEN json_extract(p.payload,'$.start_date') AND json_extract(p.payload,'$.end_date'))
      BEGIN SELECT RAISE(ABORT, 'Reporting period is locked for this goods receipt.'); END;
      CREATE TRIGGER IF NOT EXISTS reporting_lock_receipts_delete_v1
      BEFORE DELETE ON procurement_receipts
      WHEN EXISTS (SELECT 1 FROM reporting_periods p WHERE p.project_id=OLD.project_id
        AND json_extract(p.payload,'$.status') IN ('Locked','Closed')
        AND substr(COALESCE(json_extract(OLD.payload,'$.receipt_date'),json_extract(OLD.payload,'$.accepted_date'),json_extract(OLD.payload,'$.date'),''),1,10) BETWEEN json_extract(p.payload,'$.start_date') AND json_extract(p.payload,'$.end_date'))
      BEGIN SELECT RAISE(ABORT, 'Reporting period is locked for this goods receipt.'); END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 44,
            description: "add_governed_project_control_accounts",
            sql: r#"
      -- A control account is the explicit intersection of work (WBS), scope
      -- (BOQ), cost classification (CBS) and the approved SOV budget.
      CREATE TABLE IF NOT EXISTS control_accounts (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        project_id TEXT NOT NULL,
        contract_id TEXT NOT NULL,
        wbs_id TEXT NOT NULL,
        boq_item_id TEXT NOT NULL,
        cost_code_id TEXT NOT NULL,
        contract_sov_line_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
        FOREIGN KEY (wbs_id) REFERENCES wbs_nodes(id) ON DELETE RESTRICT,
        FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT,
        FOREIGN KEY (cost_code_id) REFERENCES cost_codes(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_sov_line_id) REFERENCES contract_sov_lines(id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_control_account_scope
        ON control_accounts(contract_id, wbs_id, boq_item_id, cost_code_id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_control_account_code
        ON control_accounts(contract_id, lower(json_extract(payload, '$.control_account_code')));

      -- The account must always be on the main contract and all controlling
      -- references must resolve to that same project/contract scope.
      CREATE TRIGGER IF NOT EXISTS control_account_scope_insert_v1
      BEFORE INSERT ON control_accounts
      WHEN EXISTS (SELECT 1 FROM contracts c WHERE c.id=NEW.contract_id AND c.parent_main_contract_id IS NOT NULL)
        OR NOT EXISTS (SELECT 1 FROM wbs_nodes w WHERE w.id=NEW.wbs_id AND w.project_id=NEW.project_id AND (w.contract_id IS NULL OR w.contract_id=NEW.contract_id))
        OR NOT EXISTS (SELECT 1 FROM boq_items b JOIN boq_headers h ON h.id=b.boq_header_id WHERE b.id=NEW.boq_item_id AND b.project_id=NEW.project_id AND h.contract_id=NEW.contract_id)
        OR NOT EXISTS (SELECT 1 FROM cost_codes c WHERE c.id=NEW.cost_code_id AND (c.project_id IS NULL OR c.project_id=NEW.project_id))
        OR NOT EXISTS (SELECT 1 FROM contract_sov_lines s WHERE s.id=NEW.contract_sov_line_id AND s.project_id=NEW.project_id AND s.contract_id=NEW.contract_id AND s.boq_item_id=NEW.boq_item_id AND (json_extract(s.payload,'$.cost_code_id') IS NULL OR json_extract(s.payload,'$.cost_code_id')=NEW.cost_code_id))
      BEGIN SELECT RAISE(ABORT, 'Control Account relationship is outside the main-contract scope.'); END;

      CREATE TRIGGER IF NOT EXISTS control_account_scope_update_v1
      BEFORE UPDATE ON control_accounts
      WHEN EXISTS (SELECT 1 FROM contracts c WHERE c.id=NEW.contract_id AND c.parent_main_contract_id IS NOT NULL)
        OR NOT EXISTS (SELECT 1 FROM wbs_nodes w WHERE w.id=NEW.wbs_id AND w.project_id=NEW.project_id AND (w.contract_id IS NULL OR w.contract_id=NEW.contract_id))
        OR NOT EXISTS (SELECT 1 FROM boq_items b JOIN boq_headers h ON h.id=b.boq_header_id WHERE b.id=NEW.boq_item_id AND b.project_id=NEW.project_id AND h.contract_id=NEW.contract_id)
        OR NOT EXISTS (SELECT 1 FROM cost_codes c WHERE c.id=NEW.cost_code_id AND (c.project_id IS NULL OR c.project_id=NEW.project_id))
        OR NOT EXISTS (SELECT 1 FROM contract_sov_lines s WHERE s.id=NEW.contract_sov_line_id AND s.project_id=NEW.project_id AND s.contract_id=NEW.contract_id AND s.boq_item_id=NEW.boq_item_id AND (json_extract(s.payload,'$.cost_code_id') IS NULL OR json_extract(s.payload,'$.cost_code_id')=NEW.cost_code_id))
      BEGIN SELECT RAISE(ABORT, 'Control Account relationship is outside the main-contract scope.'); END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 45,
            description: "link_operational_sources_to_control_accounts",
            sql: r#"
      -- Source facts remain in their operational tables, but each may now be
      -- explicitly assigned to exactly one governed Control Account.
      ALTER TABLE schedules ADD COLUMN control_account_id TEXT REFERENCES control_accounts(id) ON DELETE RESTRICT;
      ALTER TABLE wir_entries ADD COLUMN control_account_id TEXT REFERENCES control_accounts(id) ON DELETE RESTRICT;
      ALTER TABLE cost_entries ADD COLUMN control_account_id TEXT REFERENCES control_accounts(id) ON DELETE RESTRICT;
      ALTER TABLE procurement ADD COLUMN control_account_id TEXT REFERENCES control_accounts(id) ON DELETE RESTRICT;
      ALTER TABLE procurement_receipts ADD COLUMN control_account_id TEXT REFERENCES control_accounts(id) ON DELETE RESTRICT;
      CREATE INDEX IF NOT EXISTS idx_schedules_control_account ON schedules(control_account_id);
      CREATE INDEX IF NOT EXISTS idx_wir_entries_control_account ON wir_entries(control_account_id);
      CREATE INDEX IF NOT EXISTS idx_cost_entries_control_account ON cost_entries(control_account_id);
      CREATE INDEX IF NOT EXISTS idx_procurement_control_account ON procurement(control_account_id);
      CREATE INDEX IF NOT EXISTS idx_procurement_receipts_control_account ON procurement_receipts(control_account_id);

      -- A source may use a subcontract, but that subcontract must belong to
      -- the Control Account's main contract; child BOQ scope must map back to
      -- the account's main BOQ item. This prevents cross-project posting.
      CREATE TRIGGER IF NOT EXISTS control_account_schedule_insert_v1
      BEFORE INSERT ON schedules
      WHEN NEW.control_account_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM control_accounts ca JOIN contracts c ON c.id=NEW.contract_id JOIN boq_items b ON b.id=NEW.boq_item_id
        WHERE ca.id=NEW.control_account_id AND ca.project_id=NEW.project_id
          AND ((c.id=ca.contract_id AND b.id=ca.boq_item_id) OR (c.parent_main_contract_id=ca.contract_id AND json_extract(b.payload,'$.main_boq_item_id')=ca.boq_item_id))
          AND COALESCE(json_extract(NEW.payload,'$.wbs_id'),'')=ca.wbs_id
      ) BEGIN SELECT RAISE(ABORT, 'Schedule is outside its Control Account scope.'); END;
      CREATE TRIGGER IF NOT EXISTS control_account_schedule_update_v1
      BEFORE UPDATE OF project_id, contract_id, boq_item_id, control_account_id, payload ON schedules
      WHEN NEW.control_account_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM control_accounts ca JOIN contracts c ON c.id=NEW.contract_id JOIN boq_items b ON b.id=NEW.boq_item_id
        WHERE ca.id=NEW.control_account_id AND ca.project_id=NEW.project_id
          AND ((c.id=ca.contract_id AND b.id=ca.boq_item_id) OR (c.parent_main_contract_id=ca.contract_id AND json_extract(b.payload,'$.main_boq_item_id')=ca.boq_item_id))
          AND COALESCE(json_extract(NEW.payload,'$.wbs_id'),'')=ca.wbs_id
      ) BEGIN SELECT RAISE(ABORT, 'Schedule is outside its Control Account scope.'); END;

      CREATE TRIGGER IF NOT EXISTS control_account_wir_insert_v1
      BEFORE INSERT ON wir_entries
      WHEN NEW.control_account_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM control_accounts ca JOIN contracts c ON c.id=NEW.contract_id JOIN boq_items b ON b.id=NEW.boq_item_id
        WHERE ca.id=NEW.control_account_id AND ca.project_id=NEW.project_id
          AND ((c.id=ca.contract_id AND b.id=ca.boq_item_id) OR (c.parent_main_contract_id=ca.contract_id AND json_extract(b.payload,'$.main_boq_item_id')=ca.boq_item_id))
      ) BEGIN SELECT RAISE(ABORT, 'WIR is outside its Control Account scope.'); END;
      CREATE TRIGGER IF NOT EXISTS control_account_wir_update_v1
      BEFORE UPDATE OF project_id, contract_id, boq_item_id, control_account_id ON wir_entries
      WHEN NEW.control_account_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM control_accounts ca JOIN contracts c ON c.id=NEW.contract_id JOIN boq_items b ON b.id=NEW.boq_item_id
        WHERE ca.id=NEW.control_account_id AND ca.project_id=NEW.project_id
          AND ((c.id=ca.contract_id AND b.id=ca.boq_item_id) OR (c.parent_main_contract_id=ca.contract_id AND json_extract(b.payload,'$.main_boq_item_id')=ca.boq_item_id))
      ) BEGIN SELECT RAISE(ABORT, 'WIR is outside its Control Account scope.'); END;

      CREATE TRIGGER IF NOT EXISTS control_account_cost_insert_v1
      BEFORE INSERT ON cost_entries
      WHEN NEW.control_account_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM control_accounts ca JOIN contracts c ON c.id=NEW.contract_id JOIN boq_items b ON b.id=NEW.boq_item_id
        WHERE ca.id=NEW.control_account_id AND ca.project_id=NEW.project_id
          AND ((c.id=ca.contract_id AND b.id=ca.boq_item_id) OR (c.parent_main_contract_id=ca.contract_id AND json_extract(b.payload,'$.main_boq_item_id')=ca.boq_item_id))
          AND COALESCE(json_extract(NEW.payload,'$.cost_code_id'),'')=ca.cost_code_id
      ) BEGIN SELECT RAISE(ABORT, 'Cost entry is outside its Control Account scope.'); END;
      CREATE TRIGGER IF NOT EXISTS control_account_cost_update_v1
      BEFORE UPDATE OF project_id, contract_id, boq_item_id, control_account_id, payload ON cost_entries
      WHEN NEW.control_account_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM control_accounts ca JOIN contracts c ON c.id=NEW.contract_id JOIN boq_items b ON b.id=NEW.boq_item_id
        WHERE ca.id=NEW.control_account_id AND ca.project_id=NEW.project_id
          AND ((c.id=ca.contract_id AND b.id=ca.boq_item_id) OR (c.parent_main_contract_id=ca.contract_id AND json_extract(b.payload,'$.main_boq_item_id')=ca.boq_item_id))
          AND COALESCE(json_extract(NEW.payload,'$.cost_code_id'),'')=ca.cost_code_id
      ) BEGIN SELECT RAISE(ABORT, 'Cost entry is outside its Control Account scope.'); END;

      CREATE TRIGGER IF NOT EXISTS control_account_po_insert_v1
      BEFORE INSERT ON procurement
      WHEN NEW.control_account_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM control_accounts ca JOIN contracts c ON c.id=NEW.contract_id JOIN boq_items b ON b.id=NEW.boq_item_id
        WHERE ca.id=NEW.control_account_id AND ca.project_id=NEW.project_id
          AND ((c.id=ca.contract_id AND b.id=ca.boq_item_id) OR (c.parent_main_contract_id=ca.contract_id AND json_extract(b.payload,'$.main_boq_item_id')=ca.boq_item_id))
          AND COALESCE(json_extract(NEW.payload,'$.cost_code_id'),'')=ca.cost_code_id
      ) BEGIN SELECT RAISE(ABORT, 'Purchase order is outside its Control Account scope.'); END;
      CREATE TRIGGER IF NOT EXISTS control_account_po_update_v1
      BEFORE UPDATE OF project_id, contract_id, boq_item_id, control_account_id, payload ON procurement
      WHEN NEW.control_account_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM control_accounts ca JOIN contracts c ON c.id=NEW.contract_id JOIN boq_items b ON b.id=NEW.boq_item_id
        WHERE ca.id=NEW.control_account_id AND ca.project_id=NEW.project_id
          AND ((c.id=ca.contract_id AND b.id=ca.boq_item_id) OR (c.parent_main_contract_id=ca.contract_id AND json_extract(b.payload,'$.main_boq_item_id')=ca.boq_item_id))
          AND COALESCE(json_extract(NEW.payload,'$.cost_code_id'),'')=ca.cost_code_id
      ) BEGIN SELECT RAISE(ABORT, 'Purchase order is outside its Control Account scope.'); END;

      CREATE TRIGGER IF NOT EXISTS control_account_receipt_insert_v1
      BEFORE INSERT ON procurement_receipts
      WHEN NEW.control_account_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM control_accounts ca JOIN contracts c ON c.id=NEW.contract_id JOIN boq_items b ON b.id=NEW.boq_item_id
        WHERE ca.id=NEW.control_account_id AND ca.project_id=NEW.project_id
          AND ((c.id=ca.contract_id AND b.id=ca.boq_item_id) OR (c.parent_main_contract_id=ca.contract_id AND json_extract(b.payload,'$.main_boq_item_id')=ca.boq_item_id))
      ) BEGIN SELECT RAISE(ABORT, 'Goods receipt is outside its Control Account scope.'); END;
      CREATE TRIGGER IF NOT EXISTS control_account_receipt_update_v1
      BEFORE UPDATE OF project_id, contract_id, boq_item_id, control_account_id ON procurement_receipts
      WHEN NEW.control_account_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM control_accounts ca JOIN contracts c ON c.id=NEW.contract_id JOIN boq_items b ON b.id=NEW.boq_item_id
        WHERE ca.id=NEW.control_account_id AND ca.project_id=NEW.project_id
          AND ((c.id=ca.contract_id AND b.id=ca.boq_item_id) OR (c.parent_main_contract_id=ca.contract_id AND json_extract(b.payload,'$.main_boq_item_id')=ca.boq_item_id))
      ) BEGIN SELECT RAISE(ABORT, 'Goods receipt is outside its Control Account scope.'); END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 46,
            description: "govern_progress_period_corrections_in_sqlite",
            sql: r#"
      -- Progress is a reporting fact.  A locked period must protect WIRs in
      -- SQLite as well as in the React repository; otherwise a direct plugin
      -- write could silently restate EV and quantity history.
      CREATE TRIGGER IF NOT EXISTS reporting_lock_wir_insert_v1
      BEFORE INSERT ON wir_entries
      WHEN EXISTS (SELECT 1 FROM reporting_periods p WHERE p.project_id=NEW.project_id
        AND json_extract(p.payload,'$.status') IN ('Locked','Closed')
        AND substr(COALESCE(json_extract(NEW.payload,'$.inspection_date'),''),1,10) BETWEEN json_extract(p.payload,'$.start_date') AND json_extract(p.payload,'$.end_date'))
      BEGIN SELECT RAISE(ABORT, 'Reporting period is locked for this inspection progress record.'); END;
      CREATE TRIGGER IF NOT EXISTS reporting_lock_wir_update_v1
      BEFORE UPDATE ON wir_entries
      WHEN EXISTS (SELECT 1 FROM reporting_periods p WHERE p.project_id=OLD.project_id
        AND json_extract(p.payload,'$.status') IN ('Locked','Closed')
        AND substr(COALESCE(json_extract(OLD.payload,'$.inspection_date'),''),1,10) BETWEEN json_extract(p.payload,'$.start_date') AND json_extract(p.payload,'$.end_date'))
        OR EXISTS (SELECT 1 FROM reporting_periods p WHERE p.project_id=NEW.project_id
          AND json_extract(p.payload,'$.status') IN ('Locked','Closed')
          AND substr(COALESCE(json_extract(NEW.payload,'$.inspection_date'),''),1,10) BETWEEN json_extract(p.payload,'$.start_date') AND json_extract(p.payload,'$.end_date'))
      BEGIN SELECT RAISE(ABORT, 'Reporting period is locked for this inspection progress record. Use a progress correction in an open period.'); END;
      CREATE TRIGGER IF NOT EXISTS reporting_lock_wir_delete_v1
      BEFORE DELETE ON wir_entries
      WHEN EXISTS (SELECT 1 FROM reporting_periods p WHERE p.project_id=OLD.project_id
        AND json_extract(p.payload,'$.status') IN ('Locked','Closed')
        AND substr(COALESCE(json_extract(OLD.payload,'$.inspection_date'),''),1,10) BETWEEN json_extract(p.payload,'$.start_date') AND json_extract(p.payload,'$.end_date'))
      BEGIN SELECT RAISE(ABORT, 'Reporting period is locked for this inspection progress record. Use a progress correction in an open period.'); END;

      -- Corrections retain the original approved WIR and post a dated,
      -- traceable reversal/reinstatement in a later open reporting period.
      CREATE TABLE IF NOT EXISTS progress_corrections (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, project_id TEXT NOT NULL,
        contract_id TEXT, boq_header_id TEXT, boq_item_id TEXT,
        original_wir_id TEXT NOT NULL, payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
        FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE RESTRICT,
        FOREIGN KEY (original_wir_id) REFERENCES wir_entries(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_progress_corrections_original_wir ON progress_corrections(original_wir_id);
      CREATE INDEX IF NOT EXISTS idx_progress_corrections_scope ON progress_corrections(project_id, contract_id, boq_item_id);

      CREATE TRIGGER IF NOT EXISTS progress_correction_scope_v1
      BEFORE INSERT ON progress_corrections
      WHEN NOT EXISTS (
        SELECT 1 FROM wir_entries w WHERE w.id=NEW.original_wir_id
          AND w.project_id=NEW.project_id AND COALESCE(w.contract_id,'')=COALESCE(NEW.contract_id,'')
          AND COALESCE(w.boq_item_id,'')=COALESCE(NEW.boq_item_id,'')
          AND (json_extract(w.payload,'$.status')='Approved' OR json_extract(w.payload,'$.result') IN ('Pass','Conditional Pass'))
      )
      BEGIN SELECT RAISE(ABORT, 'Progress correction must reference an approved WIR in the same project, contract and BOQ scope.'); END;
      CREATE TRIGGER IF NOT EXISTS progress_correction_quantity_v1
      BEFORE INSERT ON progress_corrections
      WHEN CAST(COALESCE(json_extract(NEW.payload,'$.quantity'),0) AS REAL) <= 0
        OR COALESCE(json_extract(NEW.payload,'$.reason'),'') = ''
        OR COALESCE(json_extract(NEW.payload,'$.effective_date'),'') = ''
        OR COALESCE(json_extract(NEW.payload,'$.correction_type'),'') NOT IN ('Reversal','Reinstatement')
      BEGIN SELECT RAISE(ABORT, 'Progress correction requires a positive quantity, effective date, reason and valid correction type.'); END;
      CREATE TRIGGER IF NOT EXISTS progress_correction_balance_insert_v1
      BEFORE INSERT ON progress_corrections
      WHEN json_extract(NEW.payload,'$.status')='Posted' AND (
        (SELECT COALESCE(sum(CASE json_extract(pc.payload,'$.correction_type') WHEN 'Reinstatement' THEN CAST(COALESCE(json_extract(pc.payload,'$.quantity'),0) AS REAL) ELSE -CAST(COALESCE(json_extract(pc.payload,'$.quantity'),0) AS REAL) END),0)
          FROM progress_corrections pc WHERE pc.original_wir_id=NEW.original_wir_id AND json_extract(pc.payload,'$.status')='Posted')
        + CASE json_extract(NEW.payload,'$.correction_type') WHEN 'Reinstatement' THEN CAST(json_extract(NEW.payload,'$.quantity') AS REAL) ELSE -CAST(json_extract(NEW.payload,'$.quantity') AS REAL) END
        NOT BETWEEN -CAST(COALESCE((SELECT json_extract(w.payload,'$.quantity') FROM wir_entries w WHERE w.id=NEW.original_wir_id),0) AS REAL) AND 0
      )
      BEGIN SELECT RAISE(ABORT, 'Posted progress corrections cannot reverse more than the original WIR or reinstate more than previously reversed quantity.'); END;
      CREATE TRIGGER IF NOT EXISTS progress_correction_balance_update_v1
      BEFORE UPDATE ON progress_corrections
      WHEN json_extract(NEW.payload,'$.status')='Posted' AND (
        (SELECT COALESCE(sum(CASE json_extract(pc.payload,'$.correction_type') WHEN 'Reinstatement' THEN CAST(COALESCE(json_extract(pc.payload,'$.quantity'),0) AS REAL) ELSE -CAST(COALESCE(json_extract(pc.payload,'$.quantity'),0) AS REAL) END),0)
          FROM progress_corrections pc WHERE pc.original_wir_id=NEW.original_wir_id AND pc.id<>NEW.id AND json_extract(pc.payload,'$.status')='Posted')
        + CASE json_extract(NEW.payload,'$.correction_type') WHEN 'Reinstatement' THEN CAST(json_extract(NEW.payload,'$.quantity') AS REAL) ELSE -CAST(json_extract(NEW.payload,'$.quantity') AS REAL) END
        NOT BETWEEN -CAST(COALESCE((SELECT json_extract(w.payload,'$.quantity') FROM wir_entries w WHERE w.id=NEW.original_wir_id),0) AS REAL) AND 0
      )
      BEGIN SELECT RAISE(ABORT, 'Posted progress corrections cannot reverse more than the original WIR or reinstate more than previously reversed quantity.'); END;
      CREATE TRIGGER IF NOT EXISTS reporting_lock_progress_correction_v1
      BEFORE INSERT ON progress_corrections
      WHEN EXISTS (SELECT 1 FROM reporting_periods p WHERE p.project_id=NEW.project_id
        AND json_extract(p.payload,'$.status') IN ('Locked','Closed')
        AND substr(json_extract(NEW.payload,'$.effective_date'),1,10) BETWEEN json_extract(p.payload,'$.start_date') AND json_extract(p.payload,'$.end_date'))
      BEGIN SELECT RAISE(ABORT, 'Reporting period is locked for this progress correction. Post it in an open period.'); END;
      CREATE TRIGGER IF NOT EXISTS progress_correction_immutable_v1
      BEFORE UPDATE ON progress_corrections
      WHEN COALESCE(json_extract(OLD.payload,'$.status'),'Draft')='Posted'
      BEGIN SELECT RAISE(ABORT, 'Posted progress corrections are immutable; create a linked counter-correction.'); END;
      CREATE TRIGGER IF NOT EXISTS progress_correction_delete_v1
      BEFORE DELETE ON progress_corrections
      WHEN COALESCE(json_extract(OLD.payload,'$.status'),'Draft')='Posted'
      BEGIN SELECT RAISE(ABORT, 'Posted progress corrections cannot be deleted; create a linked counter-correction.'); END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 47,
            description: "add_boq_item_activities_allocation_link",
            sql: r#"
      CREATE TABLE IF NOT EXISTS boq_item_activities (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        boq_item_id TEXT NOT NULL,
        activity_id TEXT NOT NULL,
        allocated_quantity REAL NOT NULL DEFAULT 0,
        allocation_pct REAL NOT NULL DEFAULT 0,
        allocated_cost REAL NOT NULL DEFAULT 0,
        method TEXT NOT NULL DEFAULT 'percentage',
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (boq_item_id) REFERENCES boq_items(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_id) REFERENCES schedule_activities(id) ON DELETE CASCADE,
        UNIQUE(boq_item_id, activity_id)
      );
      CREATE INDEX IF NOT EXISTS idx_boq_item_activities_project ON boq_item_activities(project_id);
      CREATE INDEX IF NOT EXISTS idx_boq_item_activities_boq ON boq_item_activities(boq_item_id);
      CREATE INDEX IF NOT EXISTS idx_boq_item_activities_act ON boq_item_activities(activity_id);
      CREATE TRIGGER IF NOT EXISTS boq_item_activities_updated_at
      AFTER UPDATE ON boq_item_activities
      FOR EACH ROW
      BEGIN
        UPDATE boq_item_activities SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 48,
            description: "add_milestone_ladder_templates_and_stepped_earning",
            sql: r#"
      CREATE TABLE IF NOT EXISTS milestone_ladder_templates (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        discipline TEXT,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS milestone_ladder_steps (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        step_order INTEGER NOT NULL DEFAULT 1,
        step_name TEXT NOT NULL,
        weight_pct REAL NOT NULL,
        requires_wir INTEGER NOT NULL DEFAULT 1,
        requires_qa_signoff INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (template_id) REFERENCES milestone_ladder_templates(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS activity_milestone_progress (
        id TEXT PRIMARY KEY,
        activity_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        is_completed INTEGER NOT NULL DEFAULT 0,
        completed_date TEXT,
        verified_by TEXT,
        wir_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (activity_id) REFERENCES schedule_activities(id) ON DELETE CASCADE,
        FOREIGN KEY (step_id) REFERENCES milestone_ladder_steps(id) ON DELETE CASCADE,
        UNIQUE(activity_id, step_id)
      );
      CREATE INDEX IF NOT EXISTS idx_milestone_ladder_steps_template ON milestone_ladder_steps(template_id);
      CREATE INDEX IF NOT EXISTS idx_activity_milestone_prog_act ON activity_milestone_progress(activity_id);
      CREATE TRIGGER IF NOT EXISTS milestone_ladder_templates_updated_at
      AFTER UPDATE ON milestone_ladder_templates
      FOR EACH ROW
      BEGIN
        UPDATE milestone_ladder_templates SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
      CREATE TRIGGER IF NOT EXISTS activity_milestone_progress_updated_at
      AFTER UPDATE ON activity_milestone_progress
      FOR EACH ROW
      BEGIN
        UPDATE activity_milestone_progress SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 49,
            description: "add_time_phased_cost_distribution_engine",
            sql: r#"
      CREATE TABLE IF NOT EXISTS time_phased_cost_distributions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        control_account_id TEXT,
        boq_item_id TEXT,
        cost_code_id TEXT,
        curve_type TEXT NOT NULL DEFAULT 'linear',
        total_cost REAL NOT NULL DEFAULT 0,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS time_phased_cost_periods (
        id TEXT PRIMARY KEY,
        distribution_id TEXT NOT NULL,
        period_index INTEGER NOT NULL DEFAULT 0,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        planned_cost REAL NOT NULL DEFAULT 0,
        actual_cost REAL NOT NULL DEFAULT 0,
        forecast_cost REAL NOT NULL DEFAULT 0,
        weight_pct REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (distribution_id) REFERENCES time_phased_cost_distributions(id) ON DELETE CASCADE,
        UNIQUE(distribution_id, period_index)
      );
      CREATE INDEX IF NOT EXISTS idx_time_phased_dist_proj ON time_phased_cost_distributions(project_id);
      CREATE INDEX IF NOT EXISTS idx_time_phased_periods_dist ON time_phased_cost_periods(distribution_id);
      CREATE TRIGGER IF NOT EXISTS time_phased_cost_distributions_updated_at
      AFTER UPDATE ON time_phased_cost_distributions
      FOR EACH ROW
      BEGIN
        UPDATE time_phased_cost_distributions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 50,
            description: "add_schedule_versions_scenarios_and_immutability",
            sql: r#"
      CREATE TABLE IF NOT EXISTS schedule_versions (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        project_id TEXT NOT NULL,
        contract_id TEXT,
        boq_header_id TEXT,
        boq_item_id TEXT,
        parent_main_project_id TEXT,
        parent_main_contract_id TEXT,
        version_code TEXT NOT NULL,
        version_name TEXT NOT NULL,
        version_type TEXT NOT NULL CHECK (version_type IN ('Baseline', 'Current', 'Forecast', 'What-If')),
        status TEXT NOT NULL CHECK (status IN ('Draft', 'Approved', 'Superseded')),
        revision_number INTEGER NOT NULL CHECK (revision_number >= 1),
        data_date TEXT NOT NULL CHECK (length(data_date) = 10 AND date(data_date, '+0 days') = data_date),
        owner TEXT NOT NULL,
        reason TEXT NOT NULL,
        activity_snapshot TEXT NOT NULL CHECK (json_valid(activity_snapshot) AND json_type(activity_snapshot) = 'array'),
        distribution_snapshot TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(distribution_snapshot) AND json_type(distribution_snapshot) = 'array'),
        activity_count INTEGER NOT NULL CHECK (activity_count >= 0),
        critical_activity_count INTEGER NOT NULL CHECK (critical_activity_count >= 0 AND critical_activity_count <= activity_count),
        notes TEXT NOT NULL DEFAULT '',
        payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_schedule_versions_project ON schedule_versions(project_id);
      CREATE INDEX IF NOT EXISTS idx_schedule_versions_contract ON schedule_versions(contract_id);
      CREATE INDEX IF NOT EXISTS idx_schedule_versions_scope_status_date ON schedule_versions(project_id, contract_id, status, data_date);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_versions_revision_unique
        ON schedule_versions(project_id, COALESCE(contract_id, ''), lower(version_code), revision_number);
      CREATE TRIGGER IF NOT EXISTS schedule_version_no_direct_superseded_v1
      BEFORE INSERT ON schedule_versions WHEN NEW.status = 'Superseded'
      BEGIN SELECT RAISE(ABORT, 'A schedule version must be approved before it can be superseded.'); END;
      CREATE TRIGGER IF NOT EXISTS schedule_versions_updated_at
      AFTER UPDATE ON schedule_versions
      FOR EACH ROW
      WHEN OLD.status = 'Draft' AND NEW.status = 'Draft'
      BEGIN
        UPDATE schedule_versions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
      CREATE TRIGGER IF NOT EXISTS schedule_version_immutable_update_v1
      BEFORE UPDATE ON schedule_versions
      WHEN OLD.status = 'Superseded'
        OR (OLD.status = 'Approved' AND NOT (
          NEW.status = 'Superseded'
          AND NEW.project_id IS OLD.project_id AND NEW.contract_id IS OLD.contract_id
          AND NEW.version_code IS OLD.version_code AND NEW.version_name IS OLD.version_name
          AND NEW.version_type IS OLD.version_type AND NEW.revision_number IS OLD.revision_number
          AND NEW.data_date IS OLD.data_date AND NEW.owner IS OLD.owner AND NEW.reason IS OLD.reason
          AND NEW.activity_snapshot IS OLD.activity_snapshot AND NEW.distribution_snapshot IS OLD.distribution_snapshot
          AND NEW.activity_count IS OLD.activity_count AND NEW.critical_activity_count IS OLD.critical_activity_count
          AND NEW.notes IS OLD.notes
          AND json_remove(NEW.payload, '$.status', '$.updated_at') = json_remove(OLD.payload, '$.status', '$.updated_at')
        ))
        OR (OLD.status = 'Draft' AND NEW.status = 'Superseded')
      BEGIN SELECT RAISE(ABORT, 'Approved or Superseded schedule versions are immutable control points.'); END;
      CREATE TRIGGER IF NOT EXISTS schedule_version_immutable_delete_v1
      BEFORE DELETE ON schedule_versions
      WHEN OLD.status IN ('Approved', 'Superseded')
      BEGIN SELECT RAISE(ABORT, 'Approved or Superseded schedule versions cannot be deleted.'); END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 51,
            description: "delay_events_governed_time_impact_register",
            sql: r#"
      CREATE TABLE IF NOT EXISTS delay_events (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        project_id TEXT NOT NULL,
        contract_id TEXT,
        boq_header_id TEXT,
        boq_item_id TEXT,
        parent_main_project_id TEXT,
        parent_main_contract_id TEXT,
        wbs_id TEXT,
        schedule_activity_id TEXT,
        variation_id TEXT,
        delay_code TEXT NOT NULL,
        event_name TEXT NOT NULL,
        event_category TEXT NOT NULL CHECK (event_category IN ('Employer Delay', 'Contractor Delay', 'Force Majeure', 'Subcontractor Delay', 'Third Party', 'Weather / Site Condition')),
        discovery_date TEXT NOT NULL CHECK (length(discovery_date) = 10 AND date(discovery_date, '+0 days') = discovery_date),
        root_cause TEXT NOT NULL,
        responsible_party TEXT NOT NULL,
        entitlement_type TEXT NOT NULL CHECK (entitlement_type IN ('Compensable & Excusable', 'Excusable Non-Compensable', 'Non-Excusable', 'Under Review')),
        requested_extension_days INTEGER NOT NULL CHECK (requested_extension_days >= 0),
        approved_extension_days INTEGER NOT NULL CHECK (approved_extension_days >= 0),
        mitigation_action TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('Identified', 'Submitted', 'Approved', 'Rejected', 'Closed')),
        cpm_impact_days INTEGER NOT NULL DEFAULT 0,
        time_impact_analysis TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(time_impact_analysis)),
        notes TEXT NOT NULL DEFAULT '',
        payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_delay_events_project ON delay_events(project_id);
      CREATE INDEX IF NOT EXISTS idx_delay_events_contract ON delay_events(contract_id);
      CREATE INDEX IF NOT EXISTS idx_delay_events_scope_status ON delay_events(project_id, contract_id, status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_delay_events_code_unique
        ON delay_events(project_id, COALESCE(contract_id, ''), lower(delay_code));
      CREATE TRIGGER IF NOT EXISTS delay_events_updated_at
      AFTER UPDATE ON delay_events
      FOR EACH ROW
      WHEN OLD.status IS NEW.status
      BEGIN
        UPDATE delay_events SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
      CREATE TRIGGER IF NOT EXISTS delay_events_immutable_delete_v1
      BEFORE DELETE ON delay_events
      WHEN OLD.status IN ('Approved', 'Closed')
      BEGIN SELECT RAISE(ABORT, 'Approved or Closed delay events cannot be deleted.'); END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 52,
            description: "delay_events_scope_baseline_and_approval_governance",
            sql: r#"
      ALTER TABLE delay_events ADD COLUMN baseline_id TEXT;
      ALTER TABLE delay_events ADD COLUMN analysis_date TEXT;
      ALTER TABLE delay_events ADD COLUMN pre_impact_finish TEXT;
      ALTER TABLE delay_events ADD COLUMN post_impact_finish TEXT;
      CREATE INDEX IF NOT EXISTS idx_delay_events_activity ON delay_events(schedule_activity_id);
      CREATE INDEX IF NOT EXISTS idx_delay_events_baseline ON delay_events(baseline_id);
      CREATE TRIGGER IF NOT EXISTS delay_events_validate_insert_v2
      BEFORE INSERT ON delay_events
      BEGIN
        SELECT CASE WHEN NEW.approved_extension_days > NEW.requested_extension_days
          THEN RAISE(ABORT, 'Approved extension cannot exceed requested extension.') END;
        SELECT CASE WHEN NEW.status NOT IN ('Approved', 'Closed') AND NEW.approved_extension_days <> 0
          THEN RAISE(ABORT, 'Unapproved delay events cannot carry approved extension days.') END;
        SELECT CASE WHEN NEW.status = 'Closed'
          THEN RAISE(ABORT, 'A delay event cannot be inserted directly as Closed.') END;
        SELECT CASE WHEN NOT EXISTS (
          SELECT 1 FROM contracts c
          WHERE c.id = NEW.contract_id AND c.project_id = NEW.project_id AND c.parent_main_contract_id IS NULL
        ) THEN RAISE(ABORT, 'Delay event requires a main contract in the same project.') END;
        SELECT CASE WHEN NOT EXISTS (
          SELECT 1 FROM schedules s
          WHERE s.id = NEW.schedule_activity_id AND s.project_id = NEW.project_id AND s.contract_id = NEW.contract_id
        ) THEN RAISE(ABORT, 'Delay event activity is outside the project/contract scope.') END;
        SELECT CASE WHEN NEW.wbs_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM wbs_nodes w
          WHERE w.id = NEW.wbs_id AND w.project_id = NEW.project_id
            AND (w.contract_id IS NULL OR w.contract_id = NEW.contract_id)
        ) THEN RAISE(ABORT, 'Delay event WBS is outside the project/contract scope.') END;
        SELECT CASE WHEN NEW.variation_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM variations v
          WHERE v.id = NEW.variation_id AND v.project_id = NEW.project_id AND v.contract_id = NEW.contract_id
        ) THEN RAISE(ABORT, 'Delay event variation is outside the project/contract scope.') END;
        SELECT CASE WHEN NEW.status IN ('Approved', 'Closed') AND NOT (
          EXISTS (SELECT 1 FROM schedule_versions sv WHERE sv.id = NEW.baseline_id AND sv.project_id = NEW.project_id AND sv.contract_id = NEW.contract_id AND sv.status = 'Approved')
          OR EXISTS (SELECT 1 FROM project_baselines pb WHERE pb.id = NEW.baseline_id AND pb.project_id = NEW.project_id AND pb.contract_id = NEW.contract_id AND json_extract(pb.payload, '$.status') = 'Approved')
        ) THEN RAISE(ABORT, 'Approved delay event requires an approved frozen baseline in the same scope.') END;
      END;
      CREATE TRIGGER IF NOT EXISTS delay_events_validate_update_v2
      BEFORE UPDATE ON delay_events
      BEGIN
        SELECT CASE WHEN NOT (
          NEW.status = OLD.status
          OR (OLD.status = 'Identified' AND NEW.status IN ('Submitted', 'Rejected'))
          OR (OLD.status = 'Submitted' AND NEW.status IN ('Approved', 'Rejected'))
          OR (OLD.status = 'Approved' AND NEW.status = 'Closed')
        ) THEN RAISE(ABORT, 'Invalid delay-event workflow transition.') END;
        SELECT CASE WHEN NEW.approved_extension_days > NEW.requested_extension_days
          THEN RAISE(ABORT, 'Approved extension cannot exceed requested extension.') END;
        SELECT CASE WHEN NEW.status NOT IN ('Approved', 'Closed') AND NEW.approved_extension_days <> 0
          THEN RAISE(ABORT, 'Unapproved delay events cannot carry approved extension days.') END;
        SELECT CASE WHEN NOT EXISTS (
          SELECT 1 FROM contracts c
          WHERE c.id = NEW.contract_id AND c.project_id = NEW.project_id AND c.parent_main_contract_id IS NULL
        ) THEN RAISE(ABORT, 'Delay event requires a main contract in the same project.') END;
        SELECT CASE WHEN NOT EXISTS (
          SELECT 1 FROM schedules s
          WHERE s.id = NEW.schedule_activity_id AND s.project_id = NEW.project_id AND s.contract_id = NEW.contract_id
        ) THEN RAISE(ABORT, 'Delay event activity is outside the project/contract scope.') END;
        SELECT CASE WHEN NEW.status IN ('Approved', 'Closed') AND NOT (
          EXISTS (SELECT 1 FROM schedule_versions sv WHERE sv.id = NEW.baseline_id AND sv.project_id = NEW.project_id AND sv.contract_id = NEW.contract_id AND sv.status = 'Approved')
          OR EXISTS (SELECT 1 FROM project_baselines pb WHERE pb.id = NEW.baseline_id AND pb.project_id = NEW.project_id AND pb.contract_id = NEW.contract_id AND json_extract(pb.payload, '$.status') = 'Approved')
        ) THEN RAISE(ABORT, 'Approved delay event requires an approved frozen baseline in the same scope.') END;
      END;
      CREATE TRIGGER IF NOT EXISTS delay_events_immutable_update_v2
      BEFORE UPDATE ON delay_events
      WHEN OLD.status = 'Closed' OR (
        OLD.status = 'Approved' AND NOT (
          NEW.status = 'Closed'
          AND NEW.project_id IS OLD.project_id AND NEW.contract_id IS OLD.contract_id
          AND NEW.wbs_id IS OLD.wbs_id AND NEW.schedule_activity_id IS OLD.schedule_activity_id
          AND NEW.variation_id IS OLD.variation_id AND NEW.baseline_id IS OLD.baseline_id
          AND NEW.analysis_date IS OLD.analysis_date AND NEW.pre_impact_finish IS OLD.pre_impact_finish
          AND NEW.post_impact_finish IS OLD.post_impact_finish AND NEW.delay_code IS OLD.delay_code
          AND NEW.event_name IS OLD.event_name AND NEW.event_category IS OLD.event_category
          AND NEW.discovery_date IS OLD.discovery_date AND NEW.root_cause IS OLD.root_cause
          AND NEW.responsible_party IS OLD.responsible_party AND NEW.entitlement_type IS OLD.entitlement_type
          AND NEW.requested_extension_days IS OLD.requested_extension_days
          AND NEW.approved_extension_days IS OLD.approved_extension_days
          AND NEW.mitigation_action IS OLD.mitigation_action AND NEW.cpm_impact_days IS OLD.cpm_impact_days
          AND NEW.time_impact_analysis IS OLD.time_impact_analysis AND NEW.notes IS OLD.notes
          AND json_remove(NEW.payload, '$.status', '$.updated_at') = json_remove(OLD.payload, '$.status', '$.updated_at')
        )
      )
      BEGIN SELECT RAISE(ABORT, 'Approved delay events are immutable and may only be closed.'); END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 53,
            description: "add_cost_plan_versions_and_periods_governance",
            sql: r#"
      CREATE TABLE IF NOT EXISTS cost_plan_versions (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        project_id TEXT NOT NULL,
        contract_id TEXT NOT NULL,
        control_account_id TEXT NOT NULL,
        wbs_id TEXT,
        cost_code_id TEXT,
        contract_sov_line_id TEXT,
        boq_item_id TEXT,
        version_code TEXT NOT NULL,
        version_name TEXT NOT NULL,
        revision_number INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL CHECK (status IN ('Draft', 'Approved', 'Superseded')),
        data_date TEXT NOT NULL CHECK (length(data_date) = 10 AND date(data_date, '+0 days') = data_date),
        delivery_cost_bac REAL NOT NULL CHECK (delivery_cost_bac > 0),
        curve_type TEXT NOT NULL CHECK (curve_type IN ('Linear', 'Front-loaded', 'Back-loaded', 'Bell', 'S-Curve', 'Manual')),
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        periods_count INTEGER NOT NULL CHECK (periods_count > 0),
        owner TEXT NOT NULL DEFAULT '',
        reason TEXT NOT NULL DEFAULT '',
        approved_by TEXT,
        approved_at TEXT,
        notes TEXT NOT NULL DEFAULT '',
        payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
        FOREIGN KEY (control_account_id) REFERENCES control_accounts(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_cost_plan_scope ON cost_plan_versions(project_id, contract_id, control_account_id);
      CREATE INDEX IF NOT EXISTS idx_cost_plan_status ON cost_plan_versions(status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_plan_unique_code ON cost_plan_versions(project_id, contract_id, lower(version_code));
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_plan_single_approved 
        ON cost_plan_versions(project_id, contract_id, control_account_id) 
        WHERE status = 'Approved';

      CREATE TABLE IF NOT EXISTS cost_plan_periods (
        id TEXT PRIMARY KEY,
        version_id TEXT NOT NULL,
        period_index INTEGER NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        planned_cost REAL NOT NULL DEFAULT 0,
        cumulative_cost REAL NOT NULL DEFAULT 0,
        weight_pct REAL NOT NULL DEFAULT 0,
        distribution_source TEXT NOT NULL,
        is_closed_period INTEGER NOT NULL DEFAULT 0,
        actual_cost REAL DEFAULT 0,
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (version_id) REFERENCES cost_plan_versions(id) ON DELETE CASCADE,
        UNIQUE(version_id, period_index)
      );
      CREATE INDEX IF NOT EXISTS idx_cost_plan_periods_ver ON cost_plan_periods(version_id);

      CREATE TRIGGER IF NOT EXISTS cost_plan_versions_updated_at
      AFTER UPDATE ON cost_plan_versions
      FOR EACH ROW
      BEGIN
        UPDATE cost_plan_versions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;

      CREATE TRIGGER IF NOT EXISTS cost_plan_version_immutable_update
      BEFORE UPDATE ON cost_plan_versions
      WHEN (OLD.status = 'Superseded')
        OR (OLD.status = 'Approved' AND NEW.status != 'Superseded')
      BEGIN SELECT RAISE(ABORT, 'Approved cost plan versions are immutable control points and may only transition to Superseded.'); END;

      CREATE TRIGGER IF NOT EXISTS cost_plan_version_immutable_delete
      BEFORE DELETE ON cost_plan_versions
      WHEN OLD.status IN ('Approved', 'Superseded')
      BEGIN SELECT RAISE(ABORT, 'Approved or Superseded cost plan versions cannot be deleted.'); END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 54,
            description: "add_estimate_versions_and_lines_governance",
            sql: r#"
      CREATE TABLE IF NOT EXISTS estimate_versions (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        project_id TEXT NOT NULL,
        contract_id TEXT NOT NULL,
        control_account_id TEXT NOT NULL,
        version_code TEXT NOT NULL,
        version_name TEXT NOT NULL,
        revision_number INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL CHECK (status IN ('Draft', 'Approved', 'Superseded')),
        data_date TEXT NOT NULL CHECK (length(data_date) = 10 AND date(data_date, '+0 days') = data_date),
        method TEXT NOT NULL CHECK (method IN ('Bottom-up', 'Remaining Budget', 'CPI', 'CPI-SPI', 'Manual')),
        owner TEXT NOT NULL DEFAULT '',
        reason TEXT NOT NULL DEFAULT '',
        assumptions TEXT NOT NULL DEFAULT '',
        approved_by TEXT,
        approved_at TEXT,
        notes TEXT NOT NULL DEFAULT '',
        payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
        FOREIGN KEY (control_account_id) REFERENCES control_accounts(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_estimate_scope ON estimate_versions(project_id, contract_id, control_account_id);
      CREATE INDEX IF NOT EXISTS idx_estimate_status ON estimate_versions(status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_estimate_unique_code ON estimate_versions(project_id, contract_id, lower(version_code));
      CREATE UNIQUE INDEX IF NOT EXISTS idx_estimate_single_approved 
        ON estimate_versions(project_id, contract_id, control_account_id) 
        WHERE status = 'Approved';

      CREATE TABLE IF NOT EXISTS estimate_lines (
        id TEXT PRIMARY KEY,
        version_id TEXT NOT NULL,
        control_account_id TEXT NOT NULL,
        planned_value REAL NOT NULL DEFAULT 0,
        earned_value REAL NOT NULL DEFAULT 0,
        actual_cost REAL NOT NULL DEFAULT 0,
        open_commitment REAL NOT NULL DEFAULT 0,
        etc REAL NOT NULL DEFAULT 0,
        fac REAL NOT NULL DEFAULT 0,
        method_used TEXT NOT NULL,
        notes TEXT DEFAULT '',
        waiver_documented INTEGER NOT NULL DEFAULT 0,
        waiver_reason TEXT DEFAULT '',
        FOREIGN KEY (version_id) REFERENCES estimate_versions(id) ON DELETE CASCADE,
        FOREIGN KEY (control_account_id) REFERENCES control_accounts(id) ON DELETE RESTRICT,
        UNIQUE(version_id, control_account_id)
      );
      CREATE INDEX IF NOT EXISTS idx_estimate_lines_ver ON estimate_lines(version_id);

      CREATE TRIGGER IF NOT EXISTS estimate_versions_updated_at
      AFTER UPDATE ON estimate_versions
      FOR EACH ROW
      BEGIN
        UPDATE estimate_versions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;

      CREATE TRIGGER IF NOT EXISTS estimate_version_immutable_update
      BEFORE UPDATE ON estimate_versions
      WHEN (OLD.status = 'Superseded')
        OR (OLD.status = 'Approved' AND NEW.status != 'Superseded')
      BEGIN SELECT RAISE(ABORT, 'Approved estimate versions are immutable control points and may only transition to Superseded.'); END;

      CREATE TRIGGER IF NOT EXISTS estimate_version_immutable_delete
      BEFORE DELETE ON estimate_versions
      WHEN OLD.status IN ('Approved', 'Superseded')
      BEGIN SELECT RAISE(ABORT, 'Approved or Superseded estimate versions cannot be deleted.'); END;

      CREATE TABLE IF NOT EXISTS variance_actions (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        project_id TEXT,
        contract_id TEXT,
        payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_variance_actions_project ON variance_actions(project_id);
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 57,
            description: "add_report_versions",
            sql: r#"
      CREATE TABLE IF NOT EXISTS report_versions (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        project_id TEXT,
        contract_id TEXT,
        payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_report_versions_project ON report_versions(project_id);
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 58,
            description: "govern_controlled_report_versions",
            sql: r#"
      ALTER TABLE report_versions ADD COLUMN data_date TEXT;
      ALTER TABLE report_versions ADD COLUMN pack_type TEXT;
      ALTER TABLE report_versions ADD COLUMN template_id TEXT;
      ALTER TABLE report_versions ADD COLUMN version_code TEXT;
      ALTER TABLE report_versions ADD COLUMN status TEXT;
      ALTER TABLE report_versions ADD COLUMN snapshot_hash TEXT;
      ALTER TABLE report_versions ADD COLUMN snapshot_payload TEXT;
      ALTER TABLE report_versions ADD COLUMN issuer TEXT;
      ALTER TABLE report_versions ADD COLUMN sign_off_note TEXT;
      ALTER TABLE report_versions ADD COLUMN issued_at TEXT;
      ALTER TABLE report_versions ADD COLUMN superseded_by TEXT;

      UPDATE report_versions SET
        data_date = json_extract(payload, '$.data_date'),
        pack_type = json_extract(payload, '$.pack_type'),
        template_id = json_extract(payload, '$.template_id'),
        version_code = json_extract(payload, '$.version_code'),
        status = json_extract(payload, '$.status'),
        snapshot_hash = json_extract(payload, '$.snapshot_hash'),
        snapshot_payload = json_extract(payload, '$.snapshot_payload'),
        issuer = json_extract(payload, '$.issuer'),
        sign_off_note = json_extract(payload, '$.sign_off_note'),
        issued_at = json_extract(payload, '$.issued_at'),
        superseded_by = json_extract(payload, '$.superseded_by');

      CREATE UNIQUE INDEX IF NOT EXISTS idx_report_version_code_scope
        ON report_versions(COALESCE(project_id, ''), lower(version_code));
      CREATE UNIQUE INDEX IF NOT EXISTS idx_report_single_issued_pack
        ON report_versions(COALESCE(project_id, ''), pack_type) WHERE status = 'Issued';
      CREATE INDEX IF NOT EXISTS idx_report_version_register
        ON report_versions(project_id, data_date, pack_type, status);

      CREATE TRIGGER IF NOT EXISTS report_version_issued_immutable
      BEFORE UPDATE ON report_versions
      WHEN OLD.status = 'Issued' AND NOT (
        NEW.status = 'Superseded'
        AND NEW.id IS OLD.id AND NEW.project_id IS OLD.project_id AND NEW.contract_id IS OLD.contract_id
        AND NEW.data_date IS OLD.data_date AND NEW.pack_type IS OLD.pack_type
        AND NEW.template_id IS OLD.template_id AND NEW.version_code IS OLD.version_code
        AND NEW.snapshot_hash IS OLD.snapshot_hash AND NEW.snapshot_payload IS OLD.snapshot_payload
        AND NEW.issuer IS OLD.issuer AND NEW.sign_off_note IS OLD.sign_off_note
        AND NEW.issued_at IS OLD.issued_at
      )
      BEGIN SELECT RAISE(ABORT, 'Issued reports are immutable and may only transition to Superseded.'); END;
      CREATE TRIGGER IF NOT EXISTS report_version_locked_delete
      BEFORE DELETE ON report_versions WHEN OLD.status IN ('Issued', 'Superseded')
      BEGIN SELECT RAISE(ABORT, 'Issued or Superseded reports cannot be deleted.'); END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 59,
            description: "govern_variance_action_lifecycle",
            sql: r#"
      CREATE TRIGGER IF NOT EXISTS variance_action_close_requires_evidence
      BEFORE UPDATE ON variance_actions
      WHEN json_extract(NEW.payload, '$.status') = 'Closed'
        AND trim(COALESCE(json_extract(NEW.payload, '$.evidence'), '')) = ''
      BEGIN SELECT RAISE(ABORT, 'Evidence is required to close a variance action.'); END;
      CREATE TRIGGER IF NOT EXISTS variance_action_closed_immutable
      BEFORE UPDATE ON variance_actions
      WHEN json_extract(OLD.payload, '$.status') = 'Closed'
      BEGIN SELECT RAISE(ABORT, 'Closed variance actions are immutable.'); END;
      CREATE TRIGGER IF NOT EXISTS variance_action_closed_delete
      BEFORE DELETE ON variance_actions
      WHEN json_extract(OLD.payload, '$.status') = 'Closed'
      BEGIN SELECT RAISE(ABORT, 'Closed variance actions cannot be deleted.'); END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 60,
            description: "govern_variance_action_scope_and_transitions",
            sql: r#"
      CREATE TRIGGER IF NOT EXISTS variance_action_scope_insert
      BEFORE INSERT ON variance_actions
      WHEN NEW.project_id IS NULL OR trim(NEW.project_id) = ''
        OR (NEW.contract_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM contracts WHERE id = NEW.contract_id AND project_id = NEW.project_id
        ))
      BEGIN SELECT RAISE(ABORT, 'Variance action project/contract scope is invalid.'); END;
      CREATE TRIGGER IF NOT EXISTS variance_action_scope_update
      BEFORE UPDATE ON variance_actions
      WHEN NEW.project_id IS NULL OR trim(NEW.project_id) = ''
        OR (NEW.contract_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM contracts WHERE id = NEW.contract_id AND project_id = NEW.project_id
        ))
      BEGIN SELECT RAISE(ABORT, 'Variance action project/contract scope is invalid.'); END;
      CREATE TRIGGER IF NOT EXISTS variance_action_transition_guard
      BEFORE UPDATE ON variance_actions
      WHEN json_extract(OLD.payload, '$.status') <> json_extract(NEW.payload, '$.status')
        AND NOT (
          (json_extract(OLD.payload, '$.status') = 'Open' AND json_extract(NEW.payload, '$.status') = 'Assigned')
          OR (json_extract(OLD.payload, '$.status') = 'Assigned' AND json_extract(NEW.payload, '$.status') = 'In Progress')
          OR (json_extract(OLD.payload, '$.status') = 'In Progress' AND json_extract(NEW.payload, '$.status') = 'Resolved')
          OR (json_extract(OLD.payload, '$.status') = 'Resolved' AND json_extract(NEW.payload, '$.status') IN ('In Progress', 'Closed'))
        )
      BEGIN SELECT RAISE(ABORT, 'Invalid variance action lifecycle transition.'); END;
      CREATE TRIGGER IF NOT EXISTS variance_action_resolution_required
      BEFORE UPDATE ON variance_actions
      WHEN json_extract(NEW.payload, '$.status') IN ('Resolved', 'Closed')
        AND trim(COALESCE(json_extract(NEW.payload, '$.resolution'), '')) = ''
      BEGIN SELECT RAISE(ABORT, 'A documented resolution is required before resolving or closing an action.'); END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 61,
            description: "add_governed_labor_timesheets",
            sql: r#"
      CREATE TABLE IF NOT EXISTS labor_timesheets (
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
        payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_labor_timesheets_scope ON labor_timesheets(project_id, contract_id, work_date);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_labor_timesheets_number ON labor_timesheets(project_id, contract_id, lower(timesheet_number));
      CREATE INDEX IF NOT EXISTS idx_labor_timesheets_date_shift ON labor_timesheets(work_date, shift);

      CREATE TABLE IF NOT EXISTS labor_timesheet_lines (
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
        payload TEXT NOT NULL,
        FOREIGN KEY (timesheet_id) REFERENCES labor_timesheets(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
        FOREIGN KEY (resource_id) REFERENCES resource_masters(id) ON DELETE RESTRICT,
        FOREIGN KEY (control_account_id) REFERENCES control_accounts(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_labor_timesheet_lines_ts ON labor_timesheet_lines(timesheet_id);
      CREATE INDEX IF NOT EXISTS idx_labor_timesheet_lines_worker ON labor_timesheet_lines(resource_id);
      CREATE INDEX IF NOT EXISTS idx_labor_timesheet_lines_ca ON labor_timesheet_lines(control_account_id);

      CREATE TRIGGER IF NOT EXISTS labor_timesheet_locked_delete
      BEFORE DELETE ON labor_timesheets
      WHEN OLD.status IN ('Approved', 'Posted', 'Reversed')
      BEGIN SELECT RAISE(ABORT, 'Approved, Posted or Reversed labor timesheets cannot be deleted.'); END;

      CREATE TRIGGER IF NOT EXISTS labor_timesheet_lines_locked_mutation
      BEFORE UPDATE ON labor_timesheet_lines
      WHEN (SELECT status FROM labor_timesheets WHERE id = OLD.timesheet_id) IN ('Approved', 'Posted', 'Reversed')
      BEGIN SELECT RAISE(ABORT, 'Lines of an Approved, Posted or Reversed timesheet are immutable.'); END;

      CREATE TRIGGER IF NOT EXISTS labor_timesheet_lines_locked_delete
      BEFORE DELETE ON labor_timesheet_lines
      WHEN (SELECT status FROM labor_timesheets WHERE id = OLD.timesheet_id) IN ('Approved', 'Posted', 'Reversed')
      BEGIN SELECT RAISE(ABORT, 'Lines of an Approved, Posted or Reversed timesheet cannot be deleted.'); END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 62,
            description: "add_governed_equipment_logs",
            sql: r#"
      CREATE TABLE IF NOT EXISTS equipment_logs (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        project_id TEXT NOT NULL,
        contract_id TEXT NOT NULL,
        log_number TEXT NOT NULL,
        log_date TEXT NOT NULL,
        shift TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        schedule_activity_id TEXT NOT NULL,
        control_account_id TEXT NOT NULL,
        cost_code_id TEXT,
        operator_name TEXT,
        meter_start REAL NOT NULL DEFAULT 0,
        meter_end REAL NOT NULL DEFAULT 0,
        meter_hours REAL NOT NULL DEFAULT 0,
        operating_hours REAL NOT NULL DEFAULT 0,
        idle_hours REAL NOT NULL DEFAULT 0,
        breakdown_hours REAL NOT NULL DEFAULT 0,
        total_hours REAL NOT NULL DEFAULT 0,
        hours_override_reason TEXT,
        hourly_rate REAL NOT NULL DEFAULT 0,
        equipment_cost REAL NOT NULL DEFAULT 0,
        fuel_quantity REAL NOT NULL DEFAULT 0,
        fuel_rate REAL NOT NULL DEFAULT 0,
        fuel_cost REAL NOT NULL DEFAULT 0,
        total_cost REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Draft',
        approved_by TEXT,
        approved_at TEXT,
        posted_by TEXT,
        posted_at TEXT,
        reversed_by TEXT,
        reversed_at TEXT,
        reversal_reason TEXT,
        notes TEXT,
        payload TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
        FOREIGN KEY (resource_id) REFERENCES resource_masters(id) ON DELETE RESTRICT,
        FOREIGN KEY (schedule_activity_id) REFERENCES schedules(id) ON DELETE RESTRICT,
        FOREIGN KEY (control_account_id) REFERENCES control_accounts(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_equipment_logs_scope ON equipment_logs(project_id, contract_id, log_date);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_logs_number ON equipment_logs(project_id, contract_id, lower(log_number));
      CREATE INDEX IF NOT EXISTS idx_equipment_logs_resource_date ON equipment_logs(resource_id, log_date);
      CREATE INDEX IF NOT EXISTS idx_equipment_logs_ca ON equipment_logs(control_account_id);

      CREATE TRIGGER IF NOT EXISTS equipment_log_locked_delete
      BEFORE DELETE ON equipment_logs
      WHEN OLD.status IN ('Approved', 'Posted', 'Reversed')
      BEGIN SELECT RAISE(ABORT, 'Approved, Posted or Reversed equipment logs cannot be deleted.'); END;
    "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .setup(|app| {
            apply_staged_restore(app.handle()).map_err(|error| {
                std::io::Error::new(std::io::ErrorKind::Other, error)
            })?;
            Ok(())
        })
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:buildtrack.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commit_governed_import,
            reverse_governed_import,
            reverse_supplier_ap_posting,
            approve_supplier_invoice,
            settle_supplier_invoice_payment,
            approve_purchase_order,
            accept_procurement_receipt,
            cancel_purchase_order,
            amend_purchase_order,
            approve_cost_change,
            approve_variation,
            approve_payment_certificate,
            settle_payment_certificate,
            reverse_commercial_posting,
            reverse_variation,
            issue_report_version,
            approve_cost_plan_version,
            approve_estimate_version,
            approve_labor_timesheet,
            post_labor_timesheet,
            reverse_labor_timesheet,
            approve_equipment_log,
            post_equipment_log,
            reverse_equipment_log,
            save_excel_download,
            save_document_attachment,
            backup_local_database,
            verify_local_backup,
            stage_local_restore,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


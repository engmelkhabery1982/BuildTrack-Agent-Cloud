import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const libPath = new URL('../src-tauri/src/lib.rs', import.meta.url);

test('desktop commands used by the application are registered with Tauri', async () => {
  const source = await readFile(libPath, 'utf8');
  const handler = source.match(/\.invoke_handler\(tauri::generate_handler!\[([\s\S]*?)\]\)/)?.[1];

  assert.ok(handler, 'Tauri must declare an invoke_handler for desktop commands.');

  const requiredCommands = [
    'commit_governed_import',
    'reverse_governed_import',
    'reverse_supplier_ap_posting',
    'approve_supplier_invoice',
    'settle_supplier_invoice_payment',
    'approve_purchase_order',
    'accept_procurement_receipt',
    'cancel_purchase_order',
    'amend_purchase_order',
    'approve_cost_change',
    'approve_variation',
    'approve_payment_certificate',
    'settle_payment_certificate',
    'reverse_commercial_posting',
    'reverse_variation',
    'approve_cost_plan_version',
    'approve_estimate_version',
    'approve_labor_timesheet',
    'post_labor_timesheet',
    'reverse_labor_timesheet',
    'save_excel_download',
    'save_document_attachment',
    'backup_local_database',
    'verify_local_backup',
    'stage_local_restore',
  ];

  for (const command of requiredCommands) {
    assert.match(handler, new RegExp(`\\b${command}\\b`), `${command} is not registered.`);
  }
});

test('a staged restore is applied during desktop startup', async () => {
  const source = await readFile(libPath, 'utf8');

  assert.match(
    source,
    /\.setup\(\|app\|\s*\{[\s\S]*?apply_staged_restore\(app\.handle\(\)\)/,
    'BuildTrack must apply a verified staged restore before normal startup.',
  );
});

export type CodeControlledTable = 'projects' | 'contracts' | 'boq_headers' | 'boq_items' | 'schedules' | 'variations' | 'wir_entries' | 'client_invoices' | 'subcontractor_invoices' | 'supplier_invoices' | 'supplier_invoice_payments' | 'parties' | 'cost_codes' | 'wbs_nodes' | 'contract_sov_lines' | 'control_accounts' | 'cost_changes' | 'procurement' | 'procurement_receipts' | 'payment_certificates' | 'documents' | 'rfi_register' | 'submittals' | 'quality_register' | 'site_daily_reports' | 'cost_plan_versions';

export interface CodeControl {
  codeField: string;
  lockField: string;
  defaultPrefix: string;
  scopeFields: string[];
}

export const CODE_CONTROLS: Record<CodeControlledTable, CodeControl> = {
  projects: {
    codeField: 'project_code',
    lockField: 'project_code_locked',
    defaultPrefix: 'PRJ',
    scopeFields: [],
  },
  contracts: {
    codeField: 'contract_number',
    lockField: 'contract_number_locked',
    defaultPrefix: 'CNT',
    scopeFields: ['project_id'],
  },
  boq_headers: {
    codeField: 'boq_code',
    lockField: 'boq_code_locked',
    defaultPrefix: 'BOQ',
    scopeFields: ['project_id', 'classification'],
  },
  boq_items: {
    codeField: 'item_code',
    lockField: 'item_code_locked',
    defaultPrefix: 'ITM',
    scopeFields: ['boq_header_id', 'project_id', 'boq_code'],
  },
  schedules: {
    codeField: 'activity_code',
    lockField: 'activity_code_locked',
    defaultPrefix: 'ACT',
    scopeFields: ['boq_item_id'],
  },
  variations: {
    codeField: 'variation_number',
    lockField: 'variation_number_locked',
    defaultPrefix: 'VO',
    scopeFields: ['contract_id'],
  },
  wir_entries: { codeField: 'wir_number', lockField: 'wir_number_locked', defaultPrefix: 'WIR', scopeFields: ['contract_id'] },
  client_invoices: { codeField: 'invoice_number', lockField: 'invoice_number_locked', defaultPrefix: 'INV-CLIENT', scopeFields: ['contract_id'] },
  subcontractor_invoices: { codeField: 'invoice_number', lockField: 'invoice_number_locked', defaultPrefix: 'INV-SUB', scopeFields: ['contract_id'] },
  supplier_invoices: { codeField: 'invoice_number', lockField: 'invoice_number_locked', defaultPrefix: 'INV-SUP', scopeFields: ['supplier_party_id'] },
  supplier_invoice_payments: { codeField: 'payment_number', lockField: 'payment_number_locked', defaultPrefix: 'PAY-SUP', scopeFields: ['supplier_invoice_id'] },
  parties: { codeField: 'party_code', lockField: 'party_code_locked', defaultPrefix: 'PTY', scopeFields: [] },
  cost_codes: { codeField: 'cost_code', lockField: 'cost_code_locked', defaultPrefix: 'CBS', scopeFields: ['project_id'] },
  wbs_nodes: { codeField: 'wbs_code', lockField: 'wbs_code_locked', defaultPrefix: 'WBS', scopeFields: ['project_id'] },
  contract_sov_lines: { codeField: 'sov_line_code', lockField: 'sov_line_code_locked', defaultPrefix: 'SOV', scopeFields: ['contract_id'] },
  control_accounts: { codeField: 'control_account_code', lockField: 'control_account_code_locked', defaultPrefix: 'CA', scopeFields: ['contract_id'] },
  cost_changes: { codeField: 'cost_change_number', lockField: 'cost_change_number_locked', defaultPrefix: 'CC', scopeFields: ['contract_id'] },
  procurement: { codeField: 'purchase_order_number', lockField: 'purchase_order_number_locked', defaultPrefix: 'PO', scopeFields: ['contract_id'] },
  procurement_receipts: { codeField: 'receipt_number', lockField: 'receipt_number_locked', defaultPrefix: 'GRN', scopeFields: ['procurement_id'] },
  payment_certificates: { codeField: 'certificate_number', lockField: 'certificate_number_locked', defaultPrefix: 'PC', scopeFields: ['contract_id', 'certificate_type'] },
  documents: { codeField: 'document_number', lockField: 'document_number_locked', defaultPrefix: 'DOC', scopeFields: ['project_id', 'contract_id'] },
  rfi_register: { codeField: 'rfi_number', lockField: 'rfi_number_locked', defaultPrefix: 'RFI', scopeFields: ['contract_id'] },
  submittals: { codeField: 'submittal_number', lockField: 'submittal_number_locked', defaultPrefix: 'SUB', scopeFields: ['contract_id'] },
  quality_register: { codeField: 'reference_number', lockField: 'reference_number_locked', defaultPrefix: 'QMS', scopeFields: ['contract_id', 'record_type'] },
  site_daily_reports: { codeField: 'report_number', lockField: 'report_number_locked', defaultPrefix: 'SDR', scopeFields: ['project_id', 'contract_id'] },
  cost_plan_versions: { codeField: 'version_code', lockField: 'version_code_locked', defaultPrefix: 'CP', scopeFields: ['control_account_id'] },
};

function isCodeControlledTable(tableName: string): tableName is CodeControlledTable {
  return tableName in CODE_CONTROLS;
}

export function getCodeControl(tableName: string): CodeControl | undefined {
  return isCodeControlledTable(tableName) ? CODE_CONTROLS[tableName] : undefined;
}

function value(row: Record<string, unknown>, field: string): string {
  const item = row[field];
  return item === null || item === undefined ? '' : String(item).trim();
}

function isSameScope(
  row: Record<string, unknown>,
  draft: Record<string, unknown>,
  scopeFields: string[],
): boolean {
  return scopeFields.every((field) => {
    const expected = value(draft, field);
    return !expected || value(row, field) === expected;
  });
}

function nextCode(prefix: string, existingCodes: string[]): string {
  const matcher = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`, 'i');
  const greatest = existingCodes.reduce((max, code) => {
    const match = code.match(matcher);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${String(greatest + 1).padStart(3, '0')}`;
}

function prefixFor(tableName: CodeControlledTable, draft: Record<string, unknown>): string {
  if (tableName === 'boq_headers') {
    return value(draft, 'classification') === 'Subcontractor' ? 'BOQ-SUB' : 'BOQ-MAIN';
  }
  return CODE_CONTROLS[tableName].defaultPrefix;
}

export function createCodeDraft(
  tableName: string,
  existingRows: Record<string, unknown>[],
): Record<string, unknown> {
  const control = getCodeControl(tableName);
  if (!control) return {};

  const draft: Record<string, unknown> = { [control.lockField]: false };
  if (tableName === 'cost_codes') draft.cbs_level = 1;
  if (tableName === 'wbs_nodes') draft.wbs_level = 1;
  const controlledTable = tableName as CodeControlledTable;
  const prefix = prefixFor(controlledTable, draft);
  const existingCodes = existingRows
    .filter((row) => isSameScope(row, draft, control.scopeFields))
    .map((row) => value(row, control.codeField))
    .filter(Boolean);

  draft[control.codeField] = nextCode(prefix, existingCodes);
  return draft;
}

export function prepareCodeControlledInsert(
  tableName: string,
  draft: Record<string, unknown>,
  existingRows: Record<string, unknown>[],
): Record<string, unknown> {
  const control = getCodeControl(tableName);
  if (!control) return draft;

  const prepared = { ...draft };
  if (!value(prepared, control.codeField)) {
    const controlledTable = tableName as CodeControlledTable;
    const prefix = prefixFor(controlledTable, prepared);
    const existingCodes = existingRows
      .filter((row) => isSameScope(row, prepared, control.scopeFields))
      .map((row) => value(row, control.codeField))
      .filter(Boolean);
    prepared[control.codeField] = nextCode(prefix, existingCodes);
  }
  prepared[control.lockField] = Boolean(prepared[control.lockField]);
  return prepared;
}

export function assertCodeUpdateAllowed(
  tableName: string,
  existingRow: Record<string, unknown> | undefined,
  patch: Record<string, unknown>,
): void {
  const control = getCodeControl(tableName);
  if (!control || !existingRow) return;

  const codeChanged = control.codeField in patch && value(patch, control.codeField) !== value(existingRow, control.codeField);
  if (existingRow[control.lockField] === true && codeChanged) {
    throw new Error(`${control.codeField.replace('_', ' ')} is locked. Unlock it before changing the code.`);
  }
}

/** Enforces the same scoped uniqueness used by automatic code generation.
 * Invoice rows are intentionally excluded because one invoice contains many
 * BOQ lines with the same invoice number. Invoice creation governs that group
 * separately at the commercial workflow level. */
export function assertCodeIsUnique(
  tableName: string,
  record: Record<string, unknown>,
  existingRows: Record<string, unknown>[],
): void {
  const control = getCodeControl(tableName);
  if (!control || tableName === 'client_invoices' || tableName === 'subcontractor_invoices') return;
  const code = value(record, control.codeField);
  if (!code) throw new Error(`${control.codeField.replace('_', ' ')} is required.`);
  const conflict = existingRows.find((row) =>
    value(row, 'id') !== value(record, 'id')
    && isSameScope(row, record, control.scopeFields)
    && value(row, control.codeField).toLowerCase() === code.toLowerCase(),
  );
  if (conflict) {
    throw new Error(`${control.codeField.replace('_', ' ')} "${code}" already exists in this scope.`);
  }
}

export function assertCodeCanBeLocked(tableName: string, row: Record<string, unknown>): void {
  const control = getCodeControl(tableName);
  if (control && !value(row, control.codeField)) {
    throw new Error(`A ${control.codeField.replace('_', ' ')} is required before it can be locked.`);
  }
}

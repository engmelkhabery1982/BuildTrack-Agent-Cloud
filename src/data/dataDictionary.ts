/** Canonical vocabulary shared by forms, imports, governance and reports. */
export const STATUS_SETS = {
  project: ['Planning', 'In Progress', 'On Hold', 'Completed', 'Delayed'],
  contract: ['Draft', 'Active', 'Completed', 'Terminated'],
  schedule: ['Not Started', 'In Progress', 'Completed', 'Delayed'],
  variation: ['Draft', 'Submitted', 'Pending', 'Approved', 'Rejected', 'Reversed'],
  invoice: ['Draft', 'Submitted', 'Approved', 'Rejected', 'Paid'],
  payment: ['Unpaid', 'Partially Paid', 'Paid'],
  wir: ['Pending', 'Approved', 'Rejected'],
  reportingPeriod: ['Open', 'Locked', 'Closed'],
  baseline: ['Draft', 'Approved', 'Superseded'],
  scheduleVersion: ['Draft', 'Approved', 'Superseded'],
  costPlanVersion: ['Draft', 'Approved', 'Superseded'],
  delayEvent: ['Identified', 'Submitted', 'Approved', 'Rejected', 'Closed'],
  document: ['Draft', 'Under Review', 'Approved', 'Current', 'Superseded'],
  laborTimesheet: ['Draft', 'Submitted', 'Approved', 'Posted', 'Reversed'],
} as const;

export const CANONICAL_FIELDS = {
  project: ['project_id', 'project_code', 'project_name'],
  contract: ['contract_id', 'contract_number', 'parent_main_contract_id', 'contract_value'],
  boq: ['boq_header_id', 'boq_code', 'boq_item_id', 'item_code', 'quantity', 'unit_rate', 'amount'],
  schedule: ['activity_code', 'boq_item_id', 'start_date', 'end_date', 'duration_days', 'planned_quantity', 'planned_value'],
  scheduleVersion: ['version_code', 'version_name', 'version_type', 'status', 'revision_number', 'data_date', 'owner', 'reason', 'activity_snapshot', 'distribution_snapshot'],
  costPlanVersion: ['version_code', 'version_name', 'status', 'revision_number', 'data_date', 'delivery_cost_bac', 'curve_type', 'control_account_id', 'owner', 'reason'],
  delayEvent: ['delay_code', 'event_name', 'event_category', 'discovery_date', 'responsible_party', 'entitlement_type', 'requested_extension_days', 'approved_extension_days', 'status', 'cpm_impact_days'],
  progress: ['wir_number', 'inspection_date', 'boq_item_id', 'quantity', 'unit_price', 'item_amount'],
  commercial: ['variation_number', 'variation_id', 'invoice_number', 'approved_date', 'effective_date'],
  financial: ['budget', 'planned_value', 'earned_work_value', 'actual_cost', 'inflow', 'outflow', 'net'],
  laborTimesheet: ['timesheet_number', 'work_date', 'shift', 'crew_name', 'submitter', 'status', 'total_regular_hours', 'total_overtime_hours', 'total_amount'],
} as const;

export const IMPORT_FIELD_ALIASES: Record<string, string> = {
  'project code': 'project_code', 'contract code': 'contract_id',
  'activity id': 'activity_code', 'activity name': 'activity',
  'planned qty': 'planned_quantity', 'planned quantity': 'planned_quantity',
  'unit rate': 'unit_rate', 'unit price': 'unit_price',
  'inspection date': 'inspection_date', 'wir reference no': 'wir_number',
  'invoice #': 'invoice_number', 'variation #': 'variation_number',
};

export type CanonicalStatusSet = keyof typeof STATUS_SETS;
export function isCanonicalStatus(set: CanonicalStatusSet, value: unknown): boolean {
  return (STATUS_SETS[set] as readonly string[]).includes(String(value));
}

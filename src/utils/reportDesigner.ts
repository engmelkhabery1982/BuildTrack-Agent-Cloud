export interface ReportFieldDefinition {
  field_key: string;
  label: string;
  category: string;
  data_type: 'string' | 'number' | 'currency' | 'date';
  is_calculated: boolean;
  formula?: string;
}

export const STANDARD_REPORT_FIELDS: ReportFieldDefinition[] = [
  { field_key: 'project_name', label: 'Project Name', category: 'Project', data_type: 'string', is_calculated: false },
  { field_key: 'project_code', label: 'Project Code', category: 'Project', data_type: 'string', is_calculated: false },
  { field_key: 'data_date', label: 'Data Date', category: 'Project', data_type: 'date', is_calculated: false },
  { field_key: 'overall_health_score', label: 'Overall Health Score', category: 'Health', data_type: 'number', is_calculated: true, formula: 'calculateGovernedHealthScore' },
  { field_key: 'schedule_spi', label: 'Schedule SPI', category: 'EVM', data_type: 'number', is_calculated: true },
  { field_key: 'cost_cpi', label: 'Cost CPI', category: 'EVM', data_type: 'number', is_calculated: true },
  { field_key: 'bac_total', label: 'Budget at Completion (BAC)', category: 'Cost', data_type: 'currency', is_calculated: false },
  { field_key: 'fac_total', label: 'Forecast at Completion (FAC)', category: 'Cost', data_type: 'currency', is_calculated: true },
  { field_key: 'net_cash_flow', label: 'Net Cash Flow', category: 'Cash', data_type: 'currency', is_calculated: true },
  { field_key: 'open_claims_count', label: 'Open Claims Count', category: 'Commercial', data_type: 'number', is_calculated: true },
];

export function validateReportTemplate(template: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!template.title && !template.template_name) {
    errors.push('Template title or name is required');
  }
  if (!template.scope) {
    errors.push('Template scope type is required');
  }
  if (!template.sections || template.sections.length === 0) {
    errors.push('Report template must contain at least one section');
  }
  // Validate fields against allowlist
  for (const section of template.sections || []) {
    for (const fConfig of section.fields || []) {
      const found = STANDARD_REPORT_FIELDS.find(f => f.field_key === fConfig.field_id);
      if (!found) {
        errors.push(`Field key "${fConfig.field_id}" is not allowed in the standard registry`);
      }
    }
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

export function createReportSnapshot(template: any, dataContext: Record<string, any>): any {
  return {
    id: `snap-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    project_id: template.project_id || null,
    data_date: '2026-09-08',
    pack_type: template.report_type || 'Report Pack',
    template_id: template.id,
    version_code: `V-SNAP-${template.revision_number}`,
    status: 'Issued',
    snapshot_hash: `sha256-${Math.random().toString(36).substring(2)}${Date.now()}`,
    snapshot_payload: JSON.stringify(dataContext),
    issuer: 'Authorized User',
    created_at: new Date().toISOString(),
  };
}

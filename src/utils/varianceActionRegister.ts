import type { VarianceActionItem } from '../types/index.ts';

export type Warning = {
  severity: 'critical' | 'warning' | string;
  category: string;
  message: string;
  value?: number;
};

/**
 * Creates a new VarianceActionItem from a warning object
 *
 * @param warning - The warning object from earlyWarningSystem.ts
 * @returns A new VarianceActionItem with default values
 */
export function createActionFromWarning(
  warning: Warning,
  project_id: string = '',
  contract_id: string | null = null,
  source_kpi: string = '',
  source_record_id: string | null = null,
  materiality: number = 0
): VarianceActionItem {
  return {
    id: crypto.randomUUID(),
    project_id,
    contract_id,
    source_kpi: source_kpi || warning.category,
    source_record_id,
    warningMessage: warning.message,
    category: warning.category,
    severity: warning.severity === 'critical' ? 'Critical' : 'Medium',
    materiality,
    assignedTo: '',
    dueDate: '',
    status: 'Open',
    comments: '',
    evidence: '',
    escalation_level: 0,
    escalation_history: '',
    createdDate: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
}

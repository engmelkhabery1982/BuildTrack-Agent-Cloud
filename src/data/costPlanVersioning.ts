import { invoke } from '@tauri-apps/api/core';
import type { CostPlanVersion } from '../types';

export interface ApproveCostPlanResult {
  id: string;
  status: 'Approved';
  supersededIds: string[];
}

export function approveCostPlanVersion(version: CostPlanVersion): Promise<ApproveCostPlanResult> {
  return invoke<ApproveCostPlanResult>('approve_cost_plan_version', { request: { version } });
}

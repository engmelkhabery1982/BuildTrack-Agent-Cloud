import { invoke } from '@tauri-apps/api/core';
import type { EstimateVersion } from '../types';

export function approveEstimateVersion(version: EstimateVersion): Promise<{ id: string; status: 'Approved'; supersededIds: string[] }> {
  return invoke('approve_estimate_version', { request: { version } });
}

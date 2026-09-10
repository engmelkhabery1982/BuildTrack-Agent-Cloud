export interface CommercialWorkflowResult { operationId: string; status: 'Posted'; }
async function invokeCommercial<T>(command: string, request: Record<string, unknown>): Promise<T> {
  if (!('__TAURI_INTERNALS__' in window)) throw new Error('Governed commercial postings are available only in the BuildTrack desktop application.');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, { request });
}
export const approveCostChange = (request: { operationId: string; sourceId: string; actor: string; approvedAt: string }) => invokeCommercial<CommercialWorkflowResult>('approve_cost_change', request);
export const approveVariation = (request: { operationId: string; sourceId: string; actor: string; approvedAt: string }) => invokeCommercial<CommercialWorkflowResult>('approve_variation', request);
export const approvePaymentCertificate = (request: { operationId: string; sourceId: string; actor: string; approvedAt: string }) => invokeCommercial<CommercialWorkflowResult>('approve_payment_certificate', request);
export const settlePaymentCertificate = (request: { operationId: string; certificateId: string; actor: string; paidAt: string }) => invokeCommercial<CommercialWorkflowResult>('settle_payment_certificate', request);
export const reverseCommercialPosting = (request: { operationId: string; sourceTable: 'cost_changes' | 'payment_certificates'; sourceId: string; actor: string; reason: string }) => invokeCommercial<CommercialWorkflowResult>('reverse_commercial_posting', request);
export const reverseVariation = (request: { operationId: string; sourceId: string; actor: string; reason: string }) => invokeCommercial<CommercialWorkflowResult>('reverse_variation', request);
export interface CreatePaymentCertificateRequest extends Record<string, unknown> { operationId: string; projectId: string; contractId: string; periodId: string; certificateType: 'Client' | 'Subcontractor'; wirIds: string[]; }
export const createPaymentCertificateDraft = (request: CreatePaymentCertificateRequest) => invokeCommercial<Record<string, unknown>>('create_payment_certificate_draft', request);
export const submitPaymentCertificate = (request: { operationId: string; certificateId: string; actor: string; submittedAt: string }) => invokeCommercial<CommercialWorkflowResult>('submit_payment_certificate', request);
export const approvePaymentCertificateGoverned = (request: { operationId: string; certificateId: string; actor: string; approvedAt: string }) => invokeCommercial<CommercialWorkflowResult>('approve_payment_certificate_governed', request);
export const recordPartialPayment = (request: { operationId: string; certificateId: string; actor: string; paymentDate: string; amount: number; reference?: string }) => invokeCommercial<CommercialWorkflowResult>('record_partial_payment', request);
export const reverseCertificateGoverned = (request: { operationId: string; certificateId: string; actor: string; reason: string }) => invokeCommercial<CommercialWorkflowResult>('reverse_certificate_governed', request);
export const getCertificatePartialPayments = (certificateId: string) => invokeCommercial<Record<string, unknown>[]>('get_certificate_partial_payments', { certificateId });

export interface CashForecastVersionDto {
  versionId: string;
  projectId: string;
  versionCode: string;
  title: string;
  status: 'Draft' | 'Approved' | 'Superseded' | 'Archived';
  dataDate: string;
  scenario: 'Base' | 'Optimistic' | 'Pessimistic';
  bucketCount: number;
  summary: {
    totalActualInflow: number;
    totalActualOutflow: number;
    totalForecastInflow: number;
    totalForecastOutflow: number;
    closingCash: number;
    peakWorkingCapitalDeficit: number;
    lowestPeriod: string;
    fundingRequiredDate?: string | null;
  };
  buckets: Array<{
    period: string;
    actualInflow: number;
    actualOutflow: number;
    netActual: number;
    forecastInflow: number;
    forecastOutflow: number;
    netForecast: number;
    plannedInflow: number;
    plannedOutflow: number;
    netPlanned: number;
    netCash: number;
    cumulativeCash: number;
    items: Array<{
      sourceId: string;
      sourceType: string;
      description: string;
      date: string;
      direction: 'Inflow' | 'Outflow';
      movementType: 'Actual' | 'Forecast';
      amount: number;
    }>;
  }>;
  createdBy: string;
  approvedBy?: string | null;
}

export interface SaveCashForecastVersionRequest extends Record<string, unknown> {
  operationId: string;
  projectId: string;
  contractId?: string | null;
  versionCode: string;
  title: string;
  dataDate: string;
  scenario?: 'Base' | 'Optimistic' | 'Pessimistic';
  clientPaymentLagDays?: number;
  subcontractorPaymentLagDays?: number;
  retentionReleaseTocPercent?: number;
  retentionReleaseDlcPercent?: number;
  advanceRecoveryRatePercent?: number;
  vatPayoutLagMonths?: number;
  contingencyDrawdownPercent?: number;
  notes?: string | null;
  actor: string;
}

export interface ApproveCashForecastVersionRequest extends Record<string, unknown> {
  operationId: string;
  versionId: string;
  actor: string;
  approvedAt: string;
}

export interface ReopenCashForecastVersionRequest extends Record<string, unknown> {
  operationId: string;
  versionId: string;
  newVersionCode: string;
  actor: string;
  reopenedAt: string;
  reason: string;
}

export const saveCashForecastVersion = (request: SaveCashForecastVersionRequest) =>
  invokeCommercial<CashForecastVersionDto>('save_cash_forecast_version', request);

export const approveCashForecastVersion = (request: ApproveCashForecastVersionRequest) =>
  invokeCommercial<CashForecastVersionDto>('approve_cash_forecast_version', request);

export const reopenCashForecastVersion = (request: ReopenCashForecastVersionRequest) =>
  invokeCommercial<CashForecastVersionDto>('reopen_cash_forecast_version', request);

export const getCashForecastVersion = (versionId: string) =>
  invokeCommercial<CashForecastVersionDto>('get_cash_forecast_version', { versionId });

export const listCashForecastVersions = (projectId: string) =>
  invokeCommercial<CashForecastVersionDto[]>('list_cash_forecast_versions', { projectId });


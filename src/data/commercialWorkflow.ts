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
export interface CreatePaymentCertificateRequest extends Record<string, unknown> { projectId: string; contractId: string; periodId: string; certificateType: 'Client' | 'Subcontractor'; wirIds: string[]; }
export const createPaymentCertificateDraft = (request: CreatePaymentCertificateRequest) => invokeCommercial<Record<string, unknown>>('create_payment_certificate_draft', request);
export const submitPaymentCertificate = (request: { operationId: string; certificateId: string; actor: string; submittedAt: string }) => invokeCommercial<CommercialWorkflowResult>('submit_payment_certificate', request);
export const approvePaymentCertificateGoverned = (request: { operationId: string; certificateId: string; actor: string; approvedAt: string; wirLocks?: Array<Record<string, unknown>> }) => invokeCommercial<CommercialWorkflowResult>('approve_payment_certificate_governed', request);
export const recordPartialPayment = (request: { operationId: string; certificateId: string; actor: string; paymentDate: string; amount: number; reference?: string }) => invokeCommercial<CommercialWorkflowResult>('record_partial_payment', request);
export const reverseCertificateGoverned = (request: { operationId: string; certificateId: string; actor: string; reason: string }) => invokeCommercial<CommercialWorkflowResult>('reverse_certificate_governed', request);
export const getCertificatePartialPayments = (certificateId: string) => invokeCommercial<Record<string, unknown>[]>('get_certificate_partial_payments', { certificateId });

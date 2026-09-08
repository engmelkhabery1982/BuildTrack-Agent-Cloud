import type { DataRepository } from "./repository.ts";
import { supabaseRepository } from "./supabaseRepository.ts";
import { SqliteRepository } from "./sqliteRepository.ts";

export type { DataRepository } from "./repository.ts";
export { DataRepositoryError } from "./repository.ts";
export { SupabaseRepository } from "./supabaseRepository.ts";
export { SqliteRepository } from "./sqliteRepository.ts";
export { selectPrimaryContracts } from "./contractRules.ts";
export { getMainContractId } from "./contractScope.ts";
export { assertValidHierarchyChange, deriveHierarchyLevel, applyDerivedHierarchyLevel } from "./hierarchyRules.ts";
export { assertRecordGovernance } from "./governanceRules.ts";
export { approvedBaselinePlanForActivity, assertBaselineApproval, compareBaselineActivities, compareBaselineActivityDetails, compareBaselineRevisions, createBaselineActivitySnapshot, createBaselineDistributionSnapshot, summarizeBaselineSchedule } from "./baselineGovernance.ts";
export {
  assertRecordPeriodIsOpen,
  assertReportingPeriodDefinition,
  assertReportingPeriodMutation,
  isProtectedReportingPeriod,
  lockedPeriodForRecord,
} from "./reportingPeriodGovernance.ts";
export * from './dataQuality.ts';
export { approveSupplierInvoice, settleSupplierInvoicePayment, approvePurchaseOrder, acceptProcurementReceipt, cancelPurchaseOrder, amendPurchaseOrder, reverseSupplierApPosting } from "./supplierAp.ts";
export { approveCostChange, approveVariation, approvePaymentCertificate, settlePaymentCertificate, reverseCommercialPosting, reverseVariation } from "./commercialWorkflow.ts";
export { issueReportVersion } from "./reportVersioning.ts";
export { approveCostPlanVersion } from "./costPlanVersioning.ts";
export { approveEstimateVersion } from "./estimateVersioning.ts";
export {
  calculateLaborLineTotal,
  calculateLaborTimesheetTotals,
  validateLaborTimesheet,
  submitLaborTimesheet,
  approveLaborTimesheet,
  postLaborTimesheet,
  reverseLaborTimesheet,
} from "./laborTimesheet";
export {
  calculateEquipmentLogTotals,
  validateEquipmentLog,
  approveEquipmentLog,
  postEquipmentLog,
  reverseEquipmentLog,
} from "./equipmentLog";
export {
  calculateClaimTotals,
  evaluateContractNoticePeriod,
  validateClaim,
  canTransitionClaimStatus,
  convertClaimToVariationPayload,
  reverseClaimConversion,
  submitClaim,
  assessClaim,
  approveClaim,
  rejectClaim,
  reopenClaim,
  convertClaimToVariation,
  reverseClaimConversionBackend,
} from "./claims";
export { CANONICAL_FIELDS, IMPORT_FIELD_ALIASES, STATUS_SETS, isCanonicalStatus } from "./dataDictionary";
export {
  assertCodeCanBeLocked,
  assertCodeUpdateAllowed,
  assertCodeIsUnique,
  createCodeDraft,
  getCodeControl,
  prepareCodeControlledInsert,
} from "./codeControls";

const isTauriDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// The browser build continues to use Supabase. The desktop build uses the
// same repository contract backed by its local SQLite file.
export const dataRepository: DataRepository = isTauriDesktop
  ? new SqliteRepository()
  : supabaseRepository;

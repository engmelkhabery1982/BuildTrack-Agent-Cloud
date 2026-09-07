import type { DataRepository } from "./repository";
import { supabaseRepository } from "./supabaseRepository";
import { SqliteRepository } from "./sqliteRepository";

export type { DataRepository } from "./repository";
export { DataRepositoryError } from "./repository";
export { SupabaseRepository } from "./supabaseRepository";
export { SqliteRepository } from "./sqliteRepository";
export { selectPrimaryContracts } from "./contractRules";
export { getMainContractId } from "./contractScope";
export { assertValidHierarchyChange, deriveHierarchyLevel, applyDerivedHierarchyLevel } from "./hierarchyRules";
export { assertRecordGovernance } from "./governanceRules";
export { approvedBaselinePlanForActivity, assertBaselineApproval, compareBaselineActivities, compareBaselineActivityDetails, compareBaselineRevisions, createBaselineActivitySnapshot, createBaselineDistributionSnapshot, summarizeBaselineSchedule } from "./baselineGovernance";
export {
  assertRecordPeriodIsOpen,
  assertReportingPeriodDefinition,
  assertReportingPeriodMutation,
  isProtectedReportingPeriod,
  lockedPeriodForRecord,
} from "./reportingPeriodGovernance";
export { runDataQualityChecks } from "./dataQuality";
export { approveSupplierInvoice, settleSupplierInvoicePayment, approvePurchaseOrder, acceptProcurementReceipt, cancelPurchaseOrder, amendPurchaseOrder, reverseSupplierApPosting } from "./supplierAp";
export { approveCostChange, approveVariation, approvePaymentCertificate, settlePaymentCertificate, reverseCommercialPosting, reverseVariation } from "./commercialWorkflow";
export { issueReportVersion } from "./reportVersioning";
export { approveCostPlanVersion } from "./costPlanVersioning";
export { approveEstimateVersion } from "./estimateVersioning";
export {
  calculateLaborLineTotal,
  calculateLaborTimesheetTotals,
  validateLaborTimesheet,
  submitLaborTimesheet,
  approveLaborTimesheet,
  postLaborTimesheet,
  reverseLaborTimesheet,
} from "./laborTimesheet";
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

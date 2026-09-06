import { useEffect, useRef, useState } from 'react';
import { LayoutDashboard, FolderKanban, SquareCheck as CheckSquare, DollarSign, Package, ShieldAlert, TrendingUp, CalendarClock, Signature as FileSignature, ClipboardList, Banknote, Receipt, FileText, GitBranch, FolderOpen, FileCheck as FileCheck2, Building2, Menu, ListOrdered, HardHat, Wrench, ClipboardCheck, Layers, Download, Bell, CircleAlert, BrainCircuit, Maximize2, Minimize2, ArrowLeft, ArrowRight, Users, Gauge } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { acceptProcurementReceipt, amendPurchaseOrder, approveCostChange, approvePaymentCertificate, approvePurchaseOrder, approveSupplierInvoice, approveVariation, assertBaselineApproval, assertRecordPeriodIsOpen, assertReportingPeriodDefinition, cancelPurchaseOrder, compareBaselineActivities, compareBaselineActivityDetails, compareBaselineRevisions, createBaselineActivitySnapshot, createBaselineDistributionSnapshot, createCodeDraft, dataRepository, prepareCodeControlledInsert, reverseCommercialPosting, reverseSupplierApPosting, reverseVariation, runDataQualityChecks, settlePaymentCertificate, settleSupplierInvoicePayment, STATUS_SETS, summarizeBaselineSchedule } from '@/data';
import { Dashboard } from '@/components/Dashboard';
import { DataTableView, type ColumnDef, type FilterDef, type SelectOption } from '@/components/DataTableView';
import { ReportTemplateDesigner } from '@/components/ReportTemplateDesigner';
import { PmoInsights } from '@/components/PmoInsights';
import { DataEntryWorkspace } from '@/components/DataEntryWorkspace';
import { CommandPalette } from '@/components/CommandPalette';
import { WorkQueue } from '@/components/WorkQueue';
import { AuditTrailExplorer } from '@/components/AuditTrailExplorer';
import { ReportPack } from '@/components/ReportPack';
import { HelpCenter } from '@/components/HelpCenter';
import { PreferencesPanel, type WorkspaceMode } from '@/components/PreferencesPanel';
import { ResourceCapacityBoard } from '@/components/ResourceCapacityBoard';
import { ScheduleVersionModal } from '@/components/ScheduleVersionModal';
import { DelayRegisterModal } from '@/components/DelayRegisterModal';
import { CostPlanModal } from '@/components/CostPlanModal';
import { EstimateForecastModal } from '@/components/EstimateForecastModal';
import { CommitmentReconciliationModal } from '@/components/CommitmentReconciliationModal';
import { CostVarianceDrillDownModal } from '@/components/CostVarianceDrillDownModal';
import { IntegratedProjectControlsCockpit } from '@/components/IntegratedProjectControlsCockpit';
import { ProjectDataDateProvider, useProjectDataDate } from '@/context/ProjectDataDateContext';
import type { ViewKey, Project, ScheduleVersion, DelayEvent, WBSNode } from '@/types';
import { addCalendarDays, addWorkingDays, calendarShiftHours, distributedPlannedValueToDate, reconcileScheduleDistributions, scheduleBudget, schedulePlannedValueToDate, WORK_CALENDARS, workingDaysBetween } from '@/utils/schedulePlanning';
import { calculatePmoSnapshot } from '@/utils/pmoSnapshot';
import { calculateEvmAtDataDate } from '@/utils/evm';
import { deriveContractForecastFinish } from '@/utils/projectForecast';
import { calculateCpm, calculateCpmStatusForecast } from '@/utils/cpm';
import { calculateProductivityMetrics } from '@/utils/resourceProductivity';
import { calculatePlannedResourceLoads, calculateResourceLoads, suggestResourceLeveling } from '@/utils/resourceLoading';
import { dueDateFromTerms } from '@/utils/paymentTerms';
import { calculateBudgetAvailability, calculateCertificateValues, calculateSovCostForecast, certificateCashDirection, certificateCashStatus, costChangeAppliesToSovLine, procurementPostingState } from '@/utils/commercialControl';
import { calculateControlAccountSummary } from '@/utils/controlAccountSummary';
import { buildQuantityLedger } from '@/utils/quantityLedger';
import { previewVariationPackage } from '@/utils/variationPackage';

type IconType = React.ComponentType<{ size?: number | string; className?: string }>;
const NAV_ITEMS: { key: ViewKey; label: string; icon: IconType; group: string }[] = [
  { key: 'dashboard', label: 'PMO Command Center', icon: LayoutDashboard, group: 'Executive' },
  { key: 'alerts', label: 'PMO Alerts', icon: Bell, group: 'Executive' },
  { key: 'dataQuality', label: 'Data Quality Checks', icon: CircleAlert, group: 'Executive' },
  { key: 'workQueue', label: 'My Work Queue', icon: CheckSquare, group: 'Executive' },
  { key: 'reportPack', label: 'Executive Report Pack', icon: FileText, group: 'Executive' },
  { key: 'help', label: 'Help & Quick Guide', icon: ClipboardList, group: 'Executive' },
  { key: 'preferences', label: 'My Preferences', icon: Menu, group: 'Executive' },
  { key: 'dataEntry', label: 'Guided Data Entry', icon: ClipboardList, group: 'Planning & Controls' },
  { key: 'insights', label: 'PMO Insights', icon: BrainCircuit, group: 'Executive' },
  { key: 'portfolio', label: 'Project Portfolio', icon: Layers, group: 'Executive' },
  { key: 'controlsCockpit', label: 'Controls Cockpit', icon: Gauge, group: 'Executive' },
  { key: 'projects', label: 'Project Workspace', icon: FolderKanban, group: 'Executive' },
  { key: 'baselines', label: 'Baselines', icon: ClipboardList, group: 'Executive' },
  { key: 'reportingPeriods', label: 'Reporting Periods', icon: CalendarClock, group: 'Executive' },
  { key: 'snapshots', label: 'PMO Snapshots', icon: FileCheck2, group: 'Executive' },
  { key: 'users', label: 'Users & Roles', icon: Building2, group: 'Executive' },
  { key: 'boq', label: 'BOQ Headers', icon: ClipboardList, group: 'Planning & Controls' },
  { key: 'boqItems', label: 'BOQ Items', icon: ListOrdered, group: 'Planning & Controls' },
  { key: 'quantityLedger', label: 'Quantity Ledger', icon: ClipboardList, group: 'Planning & Controls' },
  { key: 'progressCorrections', label: 'Progress Corrections', icon: ClipboardList, group: 'Planning & Controls' },
  { key: 'schedule', label: 'Schedule & Activities', icon: CalendarClock, group: 'Planning & Controls' },
  { key: 'workCalendars', label: 'Work Calendar Master', icon: CalendarClock, group: 'Planning & Controls' },
  { key: 'scheduleDistributions', label: 'Planned Quantity Distribution', icon: CalendarClock, group: 'Planning & Controls' },
  { key: 'wir', label: 'Inspection Requests', icon: FileCheck2, group: 'Planning & Controls' },
  { key: 'progress', label: 'WIR & Progress', icon: TrendingUp, group: 'Planning & Controls' },
  { key: 'contracts', label: 'Contracts', icon: FileSignature, group: 'Commercial & Cash' },
  { key: 'variations', label: 'Variations', icon: GitBranch, group: 'Commercial & Cash' },
  { key: 'variationLines', label: 'Variation Lines', icon: ListOrdered, group: 'Commercial & Cash' },
  { key: 'contractSov', label: 'Contract SOV', icon: ClipboardList, group: 'Commercial & Cash' },
  { key: 'controlAccounts', label: 'Control Accounts', icon: Layers, group: 'Planning & Controls' },
  { key: 'costChanges', label: 'Cost Changes', icon: GitBranch, group: 'Commercial & Cash' },
  { key: 'paymentCertificates', label: 'Payment Certificates', icon: ClipboardCheck, group: 'Commercial & Cash' },
  { key: 'supplierInvoices', label: 'Supplier Invoices / AP', icon: Receipt, group: 'Commercial & Cash' },
  { key: 'supplierInvoiceLines', label: 'Supplier Invoice Match Lines', icon: ClipboardList, group: 'Commercial & Cash' },
  { key: 'supplierInvoicePayments', label: 'Supplier Payments', icon: Banknote, group: 'Commercial & Cash' },
  { key: 'clientinvoices', label: 'Client Invoices', icon: FileText, group: 'Commercial & Cash' },
  { key: 'subinvoices', label: 'Subcontractor Invoices', icon: Receipt, group: 'Commercial & Cash' },
  { key: 'clientInvoiceTracking', label: 'Client Invoice Tracking', icon: ClipboardCheck, group: 'Commercial & Cash' },
  { key: 'subcontractorInvoiceTracking', label: 'Sub Invoice Tracking', icon: ClipboardCheck, group: 'Commercial & Cash' },
  { key: 'cashflow', label: 'Cash Flow', icon: Banknote, group: 'Commercial & Cash' },
  { key: 'parties', label: 'Clients, Vendors & Subcontractors', icon: Building2, group: 'Commercial & Cash' },
  { key: 'partyContacts', label: 'Party Contacts', icon: ClipboardList, group: 'Commercial & Cash' },
  { key: 'rateHistory', label: 'Rate History', icon: DollarSign, group: 'Commercial & Cash' },
  { key: 'reportTemplates', label: 'Report Templates', icon: FileText, group: 'Commercial & Cash' },
  { key: 'costs', label: 'Cost Control', icon: DollarSign, group: 'Cost & Resources' },
  { key: 'costCodes', label: 'Cost Code / CBS Master', icon: Layers, group: 'Cost & Resources' },
  { key: 'wbs', label: 'WBS Master', icon: GitBranch, group: 'Planning & Controls' },
  { key: 'costEntries', label: 'Cost Entries', icon: ListOrdered, group: 'Cost & Resources' },
  { key: 'procurement', label: 'Procurement', icon: Package, group: 'Cost & Resources' },
  { key: 'procurementReconciliation', label: 'PO Reconciliation', icon: ClipboardCheck, group: 'Commercial & Cash' },
  { key: 'procurementReceipts', label: 'Goods Receipts', icon: ClipboardCheck, group: 'Cost & Resources' },
  { key: 'resourceMaster', label: 'Resource Master', icon: Users, group: 'Cost & Resources' },
  { key: 'resourceCapacity', label: 'Resource Capacity Board', icon: Users, group: 'Planning & Controls' },
  { key: 'resourceAssignments', label: 'Planned Resource Assignments', icon: Users, group: 'Planning & Controls' },
  { key: 'laborDuty', label: 'Labor Duty', icon: HardHat, group: 'Cost & Resources' },
  { key: 'equipment', label: 'Equipment', icon: Wrench, group: 'Cost & Resources' },
  { key: 'tasks', label: 'Tasks & Actions', icon: CheckSquare, group: 'Field & Governance' },
  { key: 'governance', label: 'Risk, Issue & Decision Register', icon: ShieldAlert, group: 'Field & Governance' },
  { key: 'approvals', label: 'Approvals', icon: ClipboardCheck, group: 'Field & Governance' },
  { key: 'auditLog', label: 'Audit Trail', icon: FileCheck2, group: 'Field & Governance' },
  { key: 'rfi', label: 'RFI Register', icon: FileText, group: 'Field & Governance' },
  { key: 'submittals', label: 'Submittals', icon: ClipboardList, group: 'Field & Governance' },
  { key: 'quality', label: 'NCR & Punch Register', icon: ClipboardCheck, group: 'Field & Governance' },
  { key: 'dailyReports', label: 'Site Daily Reports', icon: ClipboardList, group: 'Field & Governance' },
  { key: 'safety', label: 'Safety', icon: ShieldAlert, group: 'Field & Governance' },
  { key: 'documents', label: 'Documents', icon: FolderOpen, group: 'Field & Governance' },
  { key: 'tracking', label: 'Tracking Sheet', icon: ClipboardCheck, group: 'Field & Governance' },
];

const PROJECT_STATUSES = STATUS_SETS.project;
const TASK_STATUSES = ['Not Started', 'In Progress', 'Completed', 'Delayed'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const COST_STATUSES = ['Planned', 'Committed', 'Actual', 'Over Budget'];
const COST_TYPES = ['Labor', 'Equipment', 'Materials', 'Subcontractor Cost', 'Multiple Cost Types', 'Miscellaneous', 'Other'];
const PROC_STATUSES = ['Draft', 'Submitted', 'Approved', 'Ordered', 'Partially Delivered', 'Delivered', 'Closed', 'Cancelled'];
const SAFETY_STATUSES = ['Open', 'Investigating', 'Closed'];
const SAFETY_SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
const SAFETY_TYPES = ['Incident', 'Near Miss', 'Hazard', 'Inspection', 'Violation'];
const SCHEDULE_STATUSES = STATUS_SETS.schedule;
const CONTRACT_STATUSES = STATUS_SETS.contract;
const CONTRACT_TYPES = ['Lump Sum', 'Unit Price', 'Cost Plus', 'Time & Materials', 'Design-Build', 'GMP', 'Cost Reimbursable'];
const INVOICE_STATUSES = STATUS_SETS.invoice;
const PAYMENT_STATUSES = STATUS_SETS.payment;
const VARIATION_STATUSES = STATUS_SETS.variation;
const VARIATION_TYPES = ['Scope Change', 'Design Change', 'Site Condition', 'Client Request', 'Cost Adjustment'];
const DOC_STATUSES = STATUS_SETS.document;
const DOC_TYPES = ['Drawing', 'Specification', 'Report', 'Permit', 'Contract', 'Invoice', 'Plan', 'Other'];
const WIR_STATUSES = STATUS_SETS.wir;
const WIR_RESULTS = ['Pass', 'Fail', 'Conditional Pass'];
const BOQ_CLASSIFICATIONS = ['Main', 'Subcontractor'];

const PROJECT_COLUMNS: ColumnDef[] = [
  { key: 'project_code', label: 'Project Code', type: 'text', editable: true },
  { key: 'name', label: 'Project Name', type: 'text', editable: true },
  { key: 'client', label: 'Client', type: 'text', editable: true },
  { key: 'location', label: 'Location', type: 'text', editable: true },
  { key: 'category', label: 'Category', type: 'text', editable: true, options: ['Residential', 'Commercial', 'Industrial', 'Infrastructure', 'Renovation'] },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: PROJECT_STATUSES },
  { key: 'budget', label: 'Budget', type: 'money', editable: true },
  { key: 'spent', label: 'Spent', type: 'money' },
  { key: 'total_value', label: 'Total Value', type: 'money' },
  { key: 'progress', label: 'Progress', type: 'progress', editable: true },
  { key: 'project_manager', label: 'Manager', type: 'text', editable: true },
  { key: 'contractor', label: 'Contractor', type: 'text', editable: true },
  { key: 'start_date', label: 'Start Date', type: 'date', editable: true },
  { key: 'end_date', label: 'End Date', type: 'date', editable: true },
];

const BASELINE_COLUMNS: ColumnDef[] = [
  { key: 'baseline_number', label: 'Baseline #', type: 'text', editable: true },
  { key: 'revision_number', label: 'Revision', type: 'number', editable: false },
  { key: 'contract_id', label: 'Main Contract', type: 'select', editable: true },
  { key: 'baseline_date', label: 'Approval Date', type: 'date', editable: true },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Draft', 'Approved', 'Superseded'] },
  { key: 'original_contract_value', label: 'Original Contract', type: 'money', editable: true },
  { key: 'approved_variation_value', label: 'Approved Variations', type: 'money', editable: true },
  { key: 'modified_contract_value', label: 'Modified Contract', type: 'money', editable: true },
  { key: 'planned_budget', label: 'Planned Budget', type: 'money', editable: true },
  { key: 'planned_start_date', label: 'Planned Start', type: 'date', editable: true },
  { key: 'planned_end_date', label: 'Planned Finish', type: 'date', editable: true },
  { key: 'baseline_activity_count', label: 'Baseline Activities', type: 'number', editable: false },
  { key: 'baseline_critical_activity_count', label: 'Baseline Critical Activities', type: 'number', editable: false },
  { key: 'current_activity_count', label: 'Current Activities', type: 'number', editable: false },
  { key: 'activity_count_variance', label: 'Activity Count Variance', type: 'number', editable: false },
  { key: 'added_activity_count', label: 'Added Activities', type: 'number', editable: false },
  { key: 'removed_activity_count', label: 'Removed Activities', type: 'number', editable: false },
  { key: 'changed_activity_count', label: 'Changed Activities', type: 'number', editable: false },
  { key: 'variance_register_status', label: 'Variance Register', type: 'text', editable: false },
  { key: 'critical_path_variance', label: 'Critical Path Variance', type: 'number', editable: false },
  { key: 'current_schedule_start', label: 'Current Forecast Start', type: 'date', editable: false },
  { key: 'current_schedule_finish', label: 'Current Forecast Finish', type: 'date', editable: false },
  { key: 'start_variance_days', label: 'Start Variance (days)', type: 'number', editable: false },
  { key: 'finish_variance_days', label: 'Finish Variance (days)', type: 'number', editable: false },
  { key: 'current_schedule_budget', label: 'Current Planned Budget', type: 'money', editable: false },
  { key: 'budget_variance', label: 'Budget Variance', type: 'money', editable: false },
  { key: 'revision_reason', label: 'Revision Reason', type: 'text', editable: true },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];
const BASELINE_FORM_COLUMNS: ColumnDef[] = [
  { key: 'baseline_number', label: 'Baseline #', type: 'text', editable: true },
  { key: 'contract_id', label: 'Main Contract', type: 'select', editable: true },
  { key: 'baseline_date', label: 'Approval Date', type: 'date', editable: true },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Draft', 'Approved'] },
  { key: 'revision_reason', label: 'Revision Reason', type: 'text', editable: true },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];

const REPORTING_PERIOD_COLUMNS: ColumnDef[] = [
  { key: 'period_name', label: 'Period Name', type: 'text', editable: true },
  { key: 'contract_id', label: 'Main Contract', type: 'select', editable: true },
  { key: 'start_date', label: 'Period Start', type: 'date', editable: true },
  { key: 'end_date', label: 'Period End', type: 'date', editable: true },
  { key: 'data_date', label: 'Data Date', type: 'date', editable: true },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Open', 'Locked', 'Closed'] },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];
const SNAPSHOT_COLUMNS: ColumnDef[] = [
  { key: 'snapshot_name', label: 'Snapshot Name', type: 'text', editable: true }, { key: 'contract_id', label: 'Main Contract', type: 'select', editable: true }, { key: 'data_date', label: 'Data Date', type: 'date', editable: true }, { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Draft', 'Approved', 'Archived'] }, { key: 'planned_value', label: 'PV', type: 'money', editable: false }, { key: 'earned_value', label: 'EV', type: 'money', editable: false }, { key: 'actual_cost', label: 'AC', type: 'money', editable: false }, { key: 'cpi', label: 'CPI', type: 'number', editable: false }, { key: 'spi', label: 'SPI', type: 'number', editable: false }, { key: 'eac', label: 'EAC', type: 'money', editable: false }, { key: 'notes', label: 'Notes', type: 'text', editable: true },
];
const USER_COLUMNS: ColumnDef[] = [
  { key: 'username', label: 'Username', type: 'text', editable: true }, { key: 'display_name', label: 'Display Name', type: 'text', editable: true }, { key: 'role', label: 'Role', type: 'status', editable: true, options: ['PMO Admin', 'Project Manager', 'Commercial Manager', 'Site Engineer', 'Executive Viewer'] }, { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Active', 'Disabled'] }, { key: 'last_login_at', label: 'Last Login', type: 'date', editable: false },
];
const USER_FORM_COLUMNS: ColumnDef[] = [
  { key: 'username', label: 'Username', type: 'text', editable: true },
  { key: 'display_name', label: 'Display Name', type: 'text', editable: true },
  { key: 'role', label: 'Role', type: 'status', editable: true, options: ['PMO Admin', 'Project Manager', 'Commercial Manager', 'Site Engineer', 'Executive Viewer'] },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Active', 'Disabled'] },
  { key: 'initial_password', label: 'Initial Password (min. 8 characters)', type: 'password', editable: true },
];
const USER_EDIT_COLUMNS: ColumnDef[] = [
  { key: 'username', label: 'Username', type: 'text', editable: true },
  { key: 'display_name', label: 'Display Name', type: 'text', editable: true },
  { key: 'role', label: 'Role', type: 'status', editable: true, options: ['PMO Admin', 'Project Manager', 'Commercial Manager', 'Site Engineer', 'Executive Viewer'] },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Active', 'Disabled'] },
  { key: 'new_password', label: 'Reset Password (leave blank to keep current)', type: 'password', editable: true },
];

const GOVERNANCE_COLUMNS: ColumnDef[] = [
  { key: 'reference_number', label: 'Reference #', type: 'text', editable: true },
  { key: 'record_type', label: 'Record Type', type: 'status', editable: true, options: ['Risk', 'Issue', 'Decision', 'Opportunity'] },
  { key: 'title', label: 'Title', type: 'text', editable: true },
  { key: 'contract_id', label: 'Contract', type: 'select', editable: true },
  { key: 'boq_item_id', label: 'BOQ Item', type: 'select', editable: true },
  { key: 'category', label: 'Category', type: 'text', editable: true, options: ['Commercial', 'Cost', 'Schedule', 'Quality', 'Safety', 'Procurement', 'Design', 'Stakeholder', 'Other'] },
  { key: 'probability', label: 'Probability', type: 'status', editable: true, options: ['Low', 'Medium', 'High', 'Critical'] },
  { key: 'impact', label: 'Impact', type: 'status', editable: true, options: ['Low', 'Medium', 'High', 'Critical'] },
  { key: 'exposure_value', label: 'Exposure Value', type: 'money', editable: true },
  { key: 'owner', label: 'Owner', type: 'text', editable: true },
  { key: 'due_date', label: 'Due Date', type: 'date', editable: true },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Open', 'Mitigating', 'Escalated', 'Approved', 'Closed'] },
  { key: 'action_plan', label: 'Action / Decision', type: 'text', editable: true },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];

const APPROVAL_COLUMNS: ColumnDef[] = [
  { key: 'request_number', label: 'Request #', type: 'text', editable: true }, { key: 'entity_type', label: 'Subject Type', type: 'text', editable: true, options: ['Variation', 'Cost Change', 'Payment Certificate', 'Baseline', 'Invoice', 'Risk Decision', 'Document', 'RFI', 'Submittal', 'Quality Record'] }, { key: 'entity_id', label: 'Subject Reference', type: 'text', editable: true }, { key: 'title', label: 'Title', type: 'text', editable: true }, { key: 'contract_id', label: 'Contract', type: 'select', editable: true }, { key: 'requested_by', label: 'Requested By', type: 'text', editable: true }, { key: 'requested_date', label: 'Requested Date', type: 'date', editable: true }, { key: 'approver', label: 'Approver', type: 'text', editable: true }, { key: 'decision_date', label: 'Decision Date', type: 'date', editable: true }, { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Draft', 'Submitted', 'Approved', 'Rejected', 'Returned'] }, { key: 'notes', label: 'Notes', type: 'text', editable: true },
];
const AUDIT_COLUMNS: ColumnDef[] = [
  { key: 'created_at', label: 'Timestamp', type: 'date', editable: false }, { key: 'action', label: 'Action', type: 'status', editable: false }, { key: 'entity_type', label: 'Entity', type: 'text', editable: false }, { key: 'entity_id', label: 'Record ID', type: 'text', editable: false }, { key: 'actor', label: 'Actor', type: 'text', editable: false }, { key: 'summary', label: 'Summary', type: 'text', editable: false },
];
const RFI_COLUMNS: ColumnDef[] = [
  { key: 'rfi_number', label: 'RFI #', type: 'text', editable: true }, { key: 'subject', label: 'Subject', type: 'text', editable: true }, { key: 'contract_id', label: 'Contract', type: 'select', editable: true }, { key: 'boq_item_id', label: 'BOQ Item', type: 'select', editable: true }, { key: 'schedule_id', label: 'Activity', type: 'select', editable: true }, { key: 'raised_by', label: 'Raised By', type: 'text', editable: true }, { key: 'location', label: 'Location', type: 'text', editable: true }, { key: 'latitude', label: 'Latitude', type: 'number', editable: true }, { key: 'longitude', label: 'Longitude', type: 'number', editable: true }, { key: 'raised_date', label: 'Raised Date', type: 'date', editable: true }, { key: 'due_date', label: 'Due Date', type: 'date', editable: true }, { key: 'response', label: 'Response', type: 'text', editable: true }, { key: 'response_date', label: 'Response Date', type: 'date', editable: true }, { key: 'status', label: 'Status', editable: true, type: 'status', options: ['Draft', 'Open', 'Answered', 'Closed'] }, { key: 'impact', label: 'Impact', type: 'status', editable: true, options: ['None', 'Cost', 'Time', 'Cost & Time'] }, { key: 'file_reference', label: 'Attachment', type: 'text', editable: true }, { key: 'notes', label: 'Notes', type: 'text', editable: true },
];
const SUBMITTAL_COLUMNS: ColumnDef[] = [
  { key: 'submittal_number', label: 'Submittal #', type: 'text', editable: true }, { key: 'title', label: 'Title', type: 'text', editable: true }, { key: 'document_type', label: 'Type', type: 'status', editable: true, options: ['Material', 'Shop Drawing', 'Method Statement', 'Sample', 'Calculation', 'Other'] }, { key: 'contract_id', label: 'Contract', type: 'select', editable: true }, { key: 'boq_item_id', label: 'BOQ Item', type: 'select', editable: true }, { key: 'schedule_id', label: 'Activity', type: 'select', editable: true }, { key: 'submitted_by', label: 'Submitted By', type: 'text', editable: true }, { key: 'submitted_date', label: 'Submitted Date', type: 'date', editable: true }, { key: 'reviewer', label: 'Reviewer', type: 'text', editable: true }, { key: 'response_date', label: 'Response Date', type: 'date', editable: true }, { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Draft', 'Submitted', 'Approved', 'Approved as Noted', 'Revise & Resubmit', 'Rejected'] }, { key: 'revision', label: 'Revision', type: 'text', editable: true }, { key: 'file_reference', label: 'Attachment', type: 'text', editable: true }, { key: 'notes', label: 'Notes', type: 'text', editable: true },
];
const QUALITY_COLUMNS: ColumnDef[] = [
  { key: 'reference_number', label: 'Reference #', type: 'text', editable: true }, { key: 'record_type', label: 'Type', type: 'status', editable: true, options: ['NCR', 'Punch Item', 'Observation'] }, { key: 'title', label: 'Title', type: 'text', editable: true }, { key: 'contract_id', label: 'Contract', type: 'select', editable: true }, { key: 'boq_item_id', label: 'BOQ Item', type: 'select', editable: true }, { key: 'schedule_id', label: 'Activity', type: 'select', editable: true }, { key: 'location', label: 'Location', type: 'text', editable: true }, { key: 'latitude', label: 'Latitude', type: 'number', editable: true }, { key: 'longitude', label: 'Longitude', type: 'number', editable: true }, { key: 'raised_date', label: 'Raised Date', type: 'date', editable: true }, { key: 'owner', label: 'Owner', type: 'text', editable: true }, { key: 'due_date', label: 'Due Date', type: 'date', editable: true }, { key: 'closed_date', label: 'Closed Date', type: 'date', editable: true }, { key: 'severity', label: 'Severity', type: 'status', editable: true, options: ['Low', 'Medium', 'High', 'Critical'] }, { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Open', 'In Progress', 'Verified', 'Closed'] }, { key: 'corrective_action', label: 'Corrective Action', type: 'text', editable: true }, { key: 'file_reference', label: 'Attachment', type: 'text', editable: true }, { key: 'notes', label: 'Notes', type: 'text', editable: true },
];
const DAILY_REPORT_COLUMNS: ColumnDef[] = [
  { key: 'report_number', label: 'Daily Report #', type: 'text', editable: true },
  { key: 'report_date', label: 'Report Date', type: 'date', editable: true },
  { key: 'contract_id', label: 'Contract', type: 'select', editable: true },
  { key: 'boq_item_id', label: 'BOQ Item', type: 'select', editable: true },
  { key: 'schedule_id', label: 'Activity', type: 'select', editable: true },
  { key: 'location', label: 'Location', type: 'text', editable: true },
  { key: 'latitude', label: 'Latitude', type: 'number', editable: true },
  { key: 'longitude', label: 'Longitude', type: 'number', editable: true },
  { key: 'weather', label: 'Weather', type: 'text', editable: true, options: ['Clear', 'Cloudy', 'Rain', 'Windy', 'Hot', 'Other'] },
  { key: 'work_summary', label: 'Work Performed', type: 'text', editable: true },
  { key: 'manpower_count', label: 'Manpower', type: 'number', editable: true },
  { key: 'equipment_summary', label: 'Equipment Used', type: 'text', editable: true },
  { key: 'issues', label: 'Issues / Delays', type: 'text', editable: true },
  { key: 'next_day_plan', label: 'Next-Day Plan', type: 'text', editable: true },
  { key: 'photo_reference', label: 'Photo / Attachment Reference', type: 'text', editable: true },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Draft', 'Submitted', 'Reviewed'] },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];

const TASK_COLUMNS: ColumnDef[] = [
  { key: 'contract_id', label: 'Contract Code', type: 'select', editable: true },
  { key: 'name', label: 'Task Name', type: 'text', editable: true },
  { key: 'assignee', label: 'Assignee', type: 'text', editable: true },
  { key: 'category', label: 'Category', type: 'text', editable: true },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: TASK_STATUSES },
  { key: 'priority', label: 'Priority', type: 'status', editable: true, options: PRIORITIES },
  { key: 'cost', label: 'Cost', type: 'money', editable: true },
  { key: 'progress', label: 'Progress', type: 'progress', editable: true },
  { key: 'start_date', label: 'Start', type: 'date', editable: true },
  { key: 'end_date', label: 'End', type: 'date', editable: true },
  { key: 'revised_end_date', label: 'Revised End', type: 'date', editable: false },
];

const COST_COLUMNS: ColumnDef[] = [
  { key: 'cost_code_id', label: 'Cost Code', type: 'select', editable: true },
  { key: 'contract_id', label: 'Contract Code', type: 'select', editable: true },
  { key: 'boq_item_id', label: 'BOQ Item Code', type: 'select', editable: true },
  { key: 'company_name', label: 'Contractor', type: 'text', editable: true },
  { key: 'boq_item_name', label: 'BOQ Item Name', type: 'text' },
  { key: 'category', label: 'Category', type: 'text', editable: true, options: ['Labor', 'Materials', 'Equipment', 'Subcontractor', 'Overhead', 'Other'] },
  { key: 'description', label: 'Description', type: 'text', editable: true },
  { key: 'data_date', label: 'Control Data Date', type: 'date', editable: true },
  { key: 'control_status', label: 'Control Readiness', type: 'status', editable: false, options: ['Ready', 'Data Date Required', 'Approved Baseline Required'] },
  { key: 'budget', label: 'Budget', type: 'money', editable: false },
  { key: 'planned', label: 'Planned Value', type: 'money', editable: false },
  { key: 'actual', label: 'Actual', type: 'money', editable: false },
  { key: 'committed', label: 'Committed Work Value', type: 'money', editable: false },
  { key: 'status', label: 'EVM Status', type: 'evm', editable: false },
];

const COST_ENTRY_COLUMNS: ColumnDef[] = [
  { key: 'control_account_id', label: 'Control Account', type: 'select', editable: true },
  { key: 'cost_code_id', label: 'Cost Code', type: 'select', editable: true },
  { key: 'contract_id', label: 'Contract Code', type: 'select', editable: true },
  { key: 'boq_item_id', label: 'BOQ Item Code', type: 'select', editable: true },
  { key: 'company_name', label: 'Contractor', type: 'text', editable: true },
  { key: 'boq_item_name', label: 'BOQ Item Name', type: 'text' },
  { key: 'date', label: 'Date', type: 'date', editable: true },
  { key: 'cost_type', label: 'Cost Type', type: 'text', editable: true, options: COST_TYPES },
  { key: 'invoice_number', label: 'Invoice #', type: 'text', editable: true },
  { key: 'payment_order_number', label: 'Payment Order #', type: 'text', editable: true },
  { key: 'amount', label: 'Amount', type: 'money', editable: true },
];

const PROCUREMENT_COLUMNS: ColumnDef[] = [
  { key: 'control_account_id', label: 'Control Account', type: 'select', editable: true },
  { key: 'contract_id', label: 'Contract Code', type: 'select', editable: true },
  { key: 'boq_item_id', label: 'BOQ Item Code', type: 'select', editable: true },
  { key: 'cost_code_id', label: 'Cost Code', type: 'select', editable: true },
  { key: 'purchase_order_number', label: 'PO Number', type: 'text', editable: true },
  { key: 'item', label: 'Item', type: 'text', editable: true },
  { key: 'supplier_party_id', label: 'Supplier Master Record', type: 'select', editable: true },
  { key: 'supplier', label: 'Supplier', type: 'text', editable: true },
  { key: 'quantity', label: 'Qty', type: 'number', editable: true },
  { key: 'unit', label: 'Unit', type: 'text', editable: true },
  { key: 'unit_cost', label: 'Unit Cost', type: 'money', editable: true },
  { key: 'total_cost', label: 'Total', type: 'money' },
  { key: 'accepted_quantity', label: 'Accepted Qty', type: 'number', editable: false },
  { key: 'actual_cost', label: 'Actual from Receipts', type: 'money', editable: false },
  { key: 'open_commitment', label: 'Open Commitment', type: 'money', editable: false },
  { key: 'invoiced_amount', label: 'Approved AP', type: 'money', editable: false },
  { key: 'paid_amount', label: 'Paid', type: 'money', editable: false },
  { key: 'open_ap_amount', label: 'Open AP', type: 'money', editable: false },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: PROC_STATUSES },
  { key: 'payment_status', label: 'Payment Status', type: 'status', editable: true, options: PAYMENT_STATUSES },
  { key: 'order_date', label: 'Order Date', type: 'date', editable: true },
  { key: 'delivery_date', label: 'Delivery Date', type: 'date', editable: true },
];
const PROCUREMENT_RECEIPT_COLUMNS: ColumnDef[] = [
  { key: 'control_account_id', label: 'Control Account', type: 'select', editable: true },
  { key: 'procurement_id', label: 'PO Number', type: 'select', editable: true },
  { key: 'receipt_number', label: 'Receipt Number', type: 'text', editable: true },
  { key: 'supplier', label: 'Supplier', type: 'text', editable: false },
  { key: 'item', label: 'Item', type: 'text', editable: false },
  { key: 'unit', label: 'Unit', type: 'text', editable: false },
  { key: 'received_quantity', label: 'Received Qty', type: 'number', editable: true },
  { key: 'accepted_quantity', label: 'Accepted Qty', type: 'number', editable: true },
  { key: 'unit_cost', label: 'Accepted Unit Cost', type: 'money', editable: true },
  { key: 'accepted_amount', label: 'Accepted Amount', type: 'money', editable: false },
  { key: 'receipt_date', label: 'Receipt Date', type: 'date', editable: true },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Draft', 'Received', 'Accepted', 'Rejected'] },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];
const SUPPLIER_INVOICE_COLUMNS: ColumnDef[] = [
  { key: 'supplier_party_id', label: 'Supplier Master Record', type: 'select', editable: true },
  { key: 'supplier', label: 'Supplier', type: 'text', editable: false },
  { key: 'invoice_number', label: 'Supplier Invoice #', type: 'text', editable: true },
  { key: 'invoice_date', label: 'Invoice Date', type: 'date', editable: true },
  { key: 'due_date', label: 'Due Date', type: 'date', editable: true },
  { key: 'currency', label: 'Currency', type: 'status', editable: true, options: ['SAR', 'USD', 'AED', 'EGP', 'EUR'] },
  { key: 'goods_amount', label: 'Matched Goods', type: 'money', editable: false },
  { key: 'tax_amount', label: 'Tax', type: 'money', editable: true },
  { key: 'deductions_amount', label: 'Deductions', type: 'money', editable: true },
  { key: 'net_payable_amount', label: 'Net Payable', type: 'money', editable: false },
  { key: 'paid_amount', label: 'Paid', type: 'money', editable: false },
  { key: 'open_payable_amount', label: 'Open AP', type: 'money', editable: false },
  { key: 'status', label: 'AP Status', type: 'status', editable: true, options: ['Draft', 'Submitted', 'Matched', 'Exception', 'Approved', 'Partially Paid', 'Paid', 'Rejected', 'Cancelled', 'Reversed'] },
  { key: 'approved_by', label: 'Approved By', type: 'text', editable: true },
  { key: 'approved_date', label: 'Approved Date', type: 'date', editable: true },
  { key: 'variance_reason', label: 'Approved Variance Reason', type: 'text', editable: true },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];
const SUPPLIER_INVOICE_LINE_COLUMNS: ColumnDef[] = [
  { key: 'supplier_invoice_id', label: 'Supplier Invoice', type: 'select', editable: true },
  { key: 'procurement_receipt_id', label: 'Accepted GRN', type: 'select', editable: true },
  { key: 'procurement_id', label: 'PO', type: 'text', editable: false },
  { key: 'quantity', label: 'Invoiced Qty', type: 'number', editable: true },
  { key: 'unit_cost', label: 'Invoice Unit Cost', type: 'money', editable: true },
  { key: 'goods_amount', label: 'Goods Amount', type: 'money', editable: false },
  { key: 'tax_amount', label: 'Line Tax', type: 'money', editable: true },
  { key: 'line_total', label: 'Line Total', type: 'money', editable: false },
  { key: 'variance_reason', label: 'Variance Reason', type: 'text', editable: true },
];
const SUPPLIER_INVOICE_PAYMENT_COLUMNS: ColumnDef[] = [
  { key: 'supplier_invoice_id', label: 'Supplier Invoice', type: 'select', editable: true },
  { key: 'payment_number', label: 'Payment #', type: 'text', editable: true },
  { key: 'payment_date', label: 'Payment Date', type: 'date', editable: true },
  { key: 'amount', label: 'Amount', type: 'money', editable: true },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Draft', 'Settled', 'Cancelled', 'Reversed'] },
  { key: 'payment_reference', label: 'Bank / Reference', type: 'text', editable: true },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];

const SAFETY_COLUMNS: ColumnDef[] = [
  { key: 'contract_id', label: 'Contract Code', type: 'select', editable: true },
  { key: 'type', label: 'Type', type: 'status', editable: true, options: SAFETY_TYPES },
  { key: 'severity', label: 'Severity', type: 'status', editable: true, options: SAFETY_SEVERITIES },
  { key: 'description', label: 'Description', type: 'text', editable: true },
  { key: 'location', label: 'Location', type: 'text', editable: true },
  { key: 'responsible', label: 'Responsible', type: 'text', editable: true },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: SAFETY_STATUSES },
  { key: 'date', label: 'Date', type: 'date', editable: true },
  { key: 'action_taken', label: 'Action Taken', type: 'text', editable: true },
];

const PROGRESS_COLUMNS: ColumnDef[] = [
  { key: 'contract_id', label: 'Contract Code', type: 'select', editable: false },
  { key: 'company_name', label: 'Contractor', type: 'text', editable: false },
  { key: 'date', label: 'As Of', type: 'date', editable: false },
  { key: 'prev_value', label: 'Previous Value', type: 'money' },
  { key: 'prev_pct', label: 'Previous %', type: 'progress' },
  { key: 'current_value', label: 'Current Value', type: 'money' },
  { key: 'current_pct', label: 'Current %', type: 'progress' },
  { key: 'total_value', label: 'Total Value', type: 'money' },
  { key: 'total_pct', label: 'Total %', type: 'progress' },
  { key: 'percent_complete', label: '% Complete', type: 'progress' },
];

const SCHEDULE_COLUMNS: ColumnDef[] = [
  { key: 'control_account_id', label: 'Control Account', type: 'select', editable: true },
  { key: 'wbs_id', label: 'WBS Node', type: 'select', editable: true },
  { key: 'contract_id', label: 'Contract Code', type: 'select', editable: true },
  { key: 'boq_item_id', label: 'BOQ Item Code', type: 'select', editable: true },
  { key: 'boq_item_name', label: 'BOQ Item Name', type: 'text' },
  { key: 'wbs_code', label: 'WBS Code', type: 'text', editable: true },
  { key: 'activity_code', label: 'Activity Code', type: 'text', editable: true },
  { key: 'activity', label: 'Activity', type: 'text', editable: true },
  { key: 'measurement_method', label: 'EV Measurement Method', type: 'select', editable: true, options: ['Quantity', '0/100', '50/50', 'Weighted Milestone'] },
  { key: 'measurement_weight_pct', label: 'Milestone Complete %', type: 'number', editable: true },
  { key: 'start_date', label: 'Start', type: 'date', editable: true },
  { key: 'end_date', label: 'End', type: 'date', editable: true },
  { key: 'duration_days', label: 'Duration (days)', type: 'number' },
  { key: 'is_milestone', label: 'Milestone', type: 'boolean', editable: true },
  { key: 'constraint_type', label: 'Constraint Type', type: 'select', editable: true, options: ['None', 'Start No Earlier Than', 'Finish No Later Than', 'Mandatory Start', 'Mandatory Finish'] },
  { key: 'constraint_date', label: 'Constraint Date', type: 'date', editable: true },
  { key: 'activity_status', label: 'Update Status', type: 'status', editable: true, options: ['Not Started', 'In Progress', 'Completed'] },
  { key: 'status_data_date', label: 'Status Data Date', type: 'date', editable: true },
  { key: 'actual_start_date', label: 'Actual Start', type: 'date', editable: true },
  { key: 'actual_finish_date', label: 'Actual Finish', type: 'date', editable: true },
  { key: 'planned_labor_hours', label: 'Planned Man-hours', type: 'number', editable: true },
  { key: 'actual_labor_hours', label: 'Actual Man-hours', type: 'number', editable: false },
  { key: 'planned_equipment_hours', label: 'Planned Equipment-hours', type: 'number', editable: true },
  { key: 'linked_equipment_records', label: 'Equipment Assignments', type: 'number', editable: false },
  { key: 'planned_productivity', label: 'Planned Qty / MH', type: 'number', editable: false },
  { key: 'actual_work_quantity', label: 'Actual Qty (linked WIR)', type: 'number', editable: false },
  { key: 'actual_productivity', label: 'Actual Qty / MH', type: 'number', editable: false },
  { key: 'productivity_variance_pct', label: 'Productivity Variance %', type: 'number', editable: false },
  { key: 'remaining_duration_days', label: 'Remaining Duration', type: 'number', editable: true },
  { key: 'unit_rate', label: 'Main Unit Rate', type: 'money', editable: false },
  { key: 'budget', label: 'Planned Budget', type: 'money', editable: false },
  { key: 'planned_quantity', label: 'Planned Qty', type: 'number', editable: true },
  { key: 'planned_value', label: 'Planned Value to Date', type: 'money', editable: false },
  { key: 'earned_work_value', label: 'Earned Work Value', type: 'money', editable: false },
  { key: 'actual_cost', label: 'Actual Cost', type: 'money', editable: false },
  { key: 'predecessor_item', label: 'Predecessor Activity', type: 'select', editable: true },
  { key: 'relationship_type', label: 'Relationship', type: 'select', editable: true, options: ['FS', 'SS', 'FF', 'SF'] },
  { key: 'lag_days', label: 'Lag (days)', type: 'number', editable: true },
  { key: 'total_float_days', label: 'Total Float (days)', type: 'number', editable: false },
  { key: 'network_critical', label: 'Network Critical', type: 'boolean', editable: false },
  { key: 'network_warning', label: 'Network Check', type: 'text', editable: false },
  { key: 'forecast_start_date', label: 'CPM Forecast Start', type: 'date', editable: false },
  { key: 'forecast_end_date', label: 'CPM Forecast Finish', type: 'date', editable: false },
  { key: 'forecast_data_date', label: 'Forecast Data Date', type: 'date', editable: false },
  { key: 'calendar_id', label: 'Work Calendar', type: 'select', editable: true },
  { key: 'calendar_name', label: 'Calendar Pattern', type: 'status', editable: false, options: [...WORK_CALENDARS] },
  { key: 'calendar_exceptions', label: 'Non-working Dates', type: 'text', editable: false },
  { key: 'critical_path', label: 'Critical Path', type: 'boolean', editable: true },
  { key: 'is_critical_item', label: 'Critical Item', type: 'boolean', editable: true },
  { key: 'responsible', label: 'Responsible', type: 'text', editable: true },
  { key: 'variance_reason', label: 'Date Variance Reason', type: 'text', editable: true },
  { key: 'status', label: 'EVM Status', type: 'evm', editable: false },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];
const WORK_CALENDAR_COLUMNS: ColumnDef[] = [
  { key: 'calendar_code', label: 'Calendar Code', type: 'text', editable: true },
  { key: 'calendar_name', label: 'Calendar Name', type: 'text', editable: true },
  { key: 'working_pattern', label: 'Working Pattern', type: 'status', editable: true, options: [...WORK_CALENDARS] },
  { key: 'hours_per_day', label: 'Hours per Working Day', type: 'number', editable: true },
  { key: 'shift_definitions', label: 'Shift Definitions (JSON)', type: 'text', editable: true },
  { key: 'calendar_exceptions', label: 'Non-working Dates', type: 'text', editable: true },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Active', 'Inactive'] },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];
const SCHEDULE_DISTRIBUTION_COLUMNS: ColumnDef[] = [
  { key: 'contract_id', label: 'Main Contract', type: 'select', editable: true },
  { key: 'boq_item_id', label: 'BOQ Item', type: 'select', editable: true },
  { key: 'schedule_id', label: 'Activity ID', type: 'select', editable: true },
  { key: 'activity_name', label: 'Activity', type: 'text', editable: true },
  { key: 'period_start', label: 'Period Start', type: 'date', editable: true },
  { key: 'period_end', label: 'Period End', type: 'date', editable: true },
  { key: 'planned_quantity', label: 'Planned Qty', type: 'number', editable: true },
  { key: 'unit', label: 'Unit', type: 'text', editable: true },
  { key: 'unit_rate', label: 'Main Unit Rate', type: 'money', editable: false },
  { key: 'planned_value', label: 'Planned Value', type: 'money', editable: false },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];
const COST_CODE_COLUMNS: ColumnDef[] = [
  { key: 'cost_code', label: 'Cost Code', type: 'text', editable: true },
  { key: 'name', label: 'CBS Name', type: 'text', editable: true },
  { key: 'classification', label: 'Classification', type: 'status', editable: true, options: ['Labor', 'Material', 'Equipment', 'Subcontract', 'Indirect', 'Other'] },
  { key: 'parent_cost_code_id', label: 'Parent Cost Code', type: 'select', editable: true },
  { key: 'cbs_level', label: 'CBS Level', type: 'number', editable: false },
  { key: 'description', label: 'Description', type: 'text', editable: true },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Active', 'Inactive'] },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];
const WBS_COLUMNS: ColumnDef[] = [
  { key: 'contract_id', label: 'Main Contract', type: 'select', editable: true },
  { key: 'wbs_code', label: 'WBS Code', type: 'text', editable: true },
  { key: 'name', label: 'WBS Name', type: 'text', editable: true },
  { key: 'parent_wbs_id', label: 'Parent WBS', type: 'select', editable: true },
  { key: 'wbs_level', label: 'WBS Level', type: 'number', editable: false },
  { key: 'description', label: 'Description', type: 'text', editable: true },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Active', 'Inactive'] },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];
const CONTRACT_SOV_COLUMNS: ColumnDef[] = [
  { key: 'contract_id', label: 'Contract Code', type: 'select', editable: true },
  { key: 'boq_item_id', label: 'BOQ Item', type: 'select', editable: true },
  { key: 'cost_code_id', label: 'Cost Code', type: 'select', editable: true },
  { key: 'sov_line_code', label: 'SOV Line Code', type: 'text', editable: true },
  { key: 'description', label: 'Description', type: 'text', editable: true },
  { key: 'original_budget', label: 'Original Budget', type: 'money', editable: true },
  { key: 'approved_variation_value', label: 'Approved Variations', type: 'money', editable: false },
  { key: 'approved_cost_change_value', label: 'Approved Cost Changes', type: 'money', editable: false },
  { key: 'revised_budget', label: 'Revised Budget', type: 'money', editable: false },
  { key: 'committed_cost', label: 'Committed Cost', type: 'money', editable: false },
  { key: 'actual_cost', label: 'Actual Cost', type: 'money', editable: false },
  { key: 'open_commitment', label: 'Open Commitment', type: 'money', editable: false },
  { key: 'assigned_value', label: 'Budget Consumed', type: 'money', editable: false },
  { key: 'available_budget', label: 'Available Budget', type: 'money', editable: false },
  { key: 'availability_status', label: 'Availability Control', type: 'status', editable: false, options: ['Available', 'At Risk', 'Blocked'] },
  { key: 'forecast_override', label: 'Manual FAC Override', type: 'money', editable: true },
  { key: 'forecast_at_completion', label: 'Forecast at Completion', type: 'money', editable: false },
  { key: 'cost_to_complete', label: 'Cost to Complete', type: 'money', editable: false },
  { key: 'forecast_variance', label: 'Forecast Variance', type: 'money', editable: false },
  { key: 'retention_rate', label: 'Retention %', type: 'number', editable: true },
  { key: 'tax_rate', label: 'Tax %', type: 'number', editable: true },
  { key: 'markup_rate', label: 'Markup %', type: 'number', editable: true },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Draft', 'Active', 'Closed'] },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];
const CONTROL_ACCOUNT_COLUMNS: ColumnDef[] = [
  { key: 'control_account_code', label: 'Control Account Code', type: 'text', editable: true },
  { key: 'contract_id', label: 'Main Contract', type: 'select', editable: true },
  { key: 'wbs_id', label: 'WBS Node', type: 'select', editable: true },
  { key: 'boq_item_id', label: 'BOQ Item', type: 'select', editable: true },
  { key: 'cost_code_id', label: 'Cost Code', type: 'select', editable: true },
  { key: 'contract_sov_line_id', label: 'SOV Line', type: 'select', editable: true },
  { key: 'description', label: 'Description', type: 'text', editable: true },
  { key: 'scope_quantity', label: 'Scope Qty', type: 'number', editable: false },
  { key: 'control_budget', label: 'Control Budget', type: 'money', editable: false },
  { key: 'planned_value', label: 'PV', type: 'money', editable: false },
  { key: 'earned_value', label: 'EV', type: 'money', editable: false },
  { key: 'actual_cost', label: 'AC', type: 'money', editable: false },
  { key: 'open_commitment', label: 'Open Commitment', type: 'money', editable: false },
  { key: 'cost_to_complete', label: 'ETC', type: 'money', editable: false },
  { key: 'forecast_at_completion', label: 'FAC', type: 'money', editable: false },
  { key: 'source_count', label: 'Linked Source Rows', type: 'number', editable: false },
  { key: 'source_summary', label: 'Traceability', type: 'text', editable: false },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Active', 'Inactive', 'Closed'] },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];
const COST_CHANGE_COLUMNS: ColumnDef[] = [
  { key: 'cost_change_number', label: 'Cost Change #', type: 'text', editable: true },
  { key: 'contract_id', label: 'Contract', type: 'select', editable: true },
  { key: 'contract_sov_line_id', label: 'SOV Line', type: 'select', editable: true },
  { key: 'transfer_from_sov_line_id', label: 'Transfer From SOV', type: 'select', editable: true },
  { key: 'boq_item_id', label: 'BOQ Item', type: 'select', editable: true },
  { key: 'cost_code_id', label: 'Cost Code', type: 'select', editable: true },
  { key: 'title', label: 'Title', type: 'text', editable: true },
  { key: 'description', label: 'Description', type: 'text', editable: true },
  { key: 'change_type', label: 'Type', type: 'status', editable: true, options: ['Budget Transfer', 'Scope Cost', 'Forecast Adjustment', 'Procurement Change'] },
  { key: 'amount', label: 'Amount', type: 'money', editable: true },
  { key: 'effective_date', label: 'Effective Date', type: 'date', editable: true },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Draft', 'Submitted', 'Approved', 'Rejected'] },
  { key: 'approved_by', label: 'Approved By', type: 'text', editable: true },
  { key: 'approved_date', label: 'Approved Date', type: 'date', editable: true },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];
const PAYMENT_CERTIFICATE_COLUMNS: ColumnDef[] = [
  { key: 'certificate_number', label: 'Certificate #', type: 'text', editable: true },
  { key: 'certificate_type', label: 'Certificate Type', type: 'status', editable: true, options: ['Client', 'Subcontractor'] },
  { key: 'contract_id', label: 'Contract Code', type: 'select', editable: true },
  { key: 'invoice_tracking_id', label: 'Invoice Register', type: 'select', editable: true },
  { key: 'period_start', label: 'Period From', type: 'date', editable: true },
  { key: 'period_end', label: 'Period To', type: 'date', editable: true },
  { key: 'certificate_date', label: 'Certificate Date', type: 'date', editable: true },
  { key: 'gross_certified_value', label: 'Gross Certified', type: 'money', editable: true },
  { key: 'retention_rate', label: 'Retention %', type: 'number', editable: true },
  { key: 'retention_amount', label: 'Retention', type: 'money', editable: false },
  { key: 'cumulative_retention_amount', label: 'Cumulative Retention', type: 'money', editable: false },
  { key: 'advance_recovery', label: 'Advance Recovery', type: 'money', editable: true },
  { key: 'remaining_advance_balance', label: 'Advance Balance', type: 'money', editable: false },
  { key: 'deductions', label: 'Deductions', type: 'money', editable: true },
  { key: 'taxable_amount', label: 'Taxable Amount', type: 'money', editable: false },
  { key: 'tax_rate', label: 'Tax %', type: 'number', editable: true },
  { key: 'tax_amount', label: 'Tax', type: 'money', editable: false },
  { key: 'net_certified_value', label: 'Net Certified', type: 'money', editable: false },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Draft', 'Submitted', 'Approved', 'Rejected', 'Paid', 'Reversed'] },
  { key: 'approved_by', label: 'Approved By', type: 'text', editable: true },
  { key: 'approved_date', label: 'Approved Date', type: 'date', editable: true },
  { key: 'payment_date', label: 'Payment Date', type: 'date', editable: true },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];

const CONTRACT_COLUMNS: ColumnDef[] = [
  { key: 'contract_role', label: 'Contract Role', type: 'status', editable: true, options: ['Main Contract', 'Subcontract'] },
  { key: 'project_code', label: 'Project Code', type: 'text', editable: true },
  { key: 'contract_number', label: 'Contract Code', type: 'text', editable: true },
  { key: 'parent_main_contract_id', label: 'Parent Main Contract', type: 'select', editable: true },
  { key: 'title', label: 'Title', type: 'text', editable: true },
  { key: 'project_name', label: 'Project Name', type: 'text', editable: true },
  { key: 'client_party_id', label: 'Client Master Record', type: 'select', editable: true },
  { key: 'client', label: 'Client', type: 'text', editable: true },
  { key: 'contractor_party_id', label: 'Contractor Master Record', type: 'select', editable: true },
  { key: 'contractor', label: 'Contractor', type: 'text', editable: true },
  { key: 'contract_type', label: 'Type', type: 'status', editable: true, options: CONTRACT_TYPES },
  { key: 'contract_value', label: 'Original Contract Value', type: 'money', editable: true },
  { key: 'modified_contract_value', label: 'Modified Contract Value', type: 'money', editable: false },
  { key: 'advance_amount', label: 'Contract Advance', type: 'money', editable: true },
  { key: 'retention_cap_amount', label: 'Retention Cap', type: 'money', editable: true },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: CONTRACT_STATUSES },
  { key: 'document_reference', label: 'Document Ref', type: 'text', editable: true },
  { key: 'start_date', label: 'Start', type: 'date', editable: true },
  { key: 'end_date', label: 'End', type: 'date', editable: true },
  { key: 'revised_end_date', label: 'Revised End', type: 'date', editable: false },
  { key: 'signed_date', label: 'Signed Date', type: 'date', editable: true },
];

const BOQ_HEADER_COLUMNS: ColumnDef[] = [
  { key: 'contract_id', label: 'Contract Code', type: 'select', editable: true },
  { key: 'classification', label: 'Classification', type: 'text', editable: true, options: BOQ_CLASSIFICATIONS },
  { key: 'company_name', label: 'Contractor', type: 'text', editable: true },
  { key: 'contract_type', label: 'Contract Type', type: 'text', editable: true, options: CONTRACT_TYPES },
  { key: 'total_value', label: 'Total Value', type: 'money' },
];

const BOQ_ITEM_COLUMNS: ColumnDef[] = [
  { key: 'contract_id', label: 'Contract Code', type: 'select', editable: false },
  { key: 'boq_header_id', label: 'BOQ', type: 'select', editable: true },
  { key: 'main_boq_item_id', label: 'Parent Main BOQ Item', type: 'select', editable: true },
  { key: 'item_code', label: 'BOQ Item Code', type: 'text', editable: true },
  { key: 'item_name', label: 'Item Name', type: 'text', editable: true },
  { key: 'description', label: 'Description', type: 'text', editable: true },
  { key: 'category', label: 'Category', type: 'text', editable: true, options: ['Earthworks', 'Concrete', 'Steel', 'Masonry', 'Finishes', 'MEP', 'Other'] },
  { key: 'unit', label: 'Unit', type: 'text', editable: true },
  { key: 'quantity', label: 'Qty', type: 'number', editable: true },
  { key: 'unit_rate', label: 'Unit Rate', type: 'money', editable: true },
  { key: 'amount', label: 'Amount', type: 'money' },
  { key: 'waste_allowance_percent', label: 'Waste Allowance %', type: 'number', editable: true },
  { key: 'baseline_start_date', label: 'Baseline Start', type: 'date', editable: true },
  { key: 'baseline_end_date', label: 'Baseline Finish', type: 'date', editable: true },
  { key: 'planned_start_date', label: 'Current Plan Start', type: 'date', editable: true },
  { key: 'planned_end_date', label: 'Current Plan Finish', type: 'date', editable: true },
  { key: 'variance_reason', label: 'Schedule Variance Reason', type: 'text', editable: true },
];
const QUANTITY_LEDGER_COLUMNS: ColumnDef[] = [
  { key: 'item_code', label: 'Main BOQ Item', type: 'text', editable: false }, { key: 'item_name', label: 'Description', type: 'text', editable: false }, { key: 'unit', label: 'Unit', type: 'text', editable: false },
  { key: 'original_quantity', label: 'Original Qty', type: 'number', editable: false }, { key: 'approved_variation_quantity', label: 'Approved Variation Qty', type: 'number', editable: false }, { key: 'revised_quantity', label: 'Revised Qty', type: 'number', editable: false },
  { key: 'planned_quantity', label: 'Planned Qty', type: 'number', editable: false }, { key: 'inspected_quantity', label: 'Inspected Qty', type: 'number', editable: false }, { key: 'corrected_quantity', label: 'Posted Corrections', type: 'number', editable: false }, { key: 'accepted_quantity', label: 'Accepted Qty', type: 'number', editable: false },
  { key: 'remaining_quantity', label: 'Remaining Qty', type: 'number', editable: false }, { key: 'over_measured_quantity', label: 'Over-measured Qty', type: 'number', editable: false }, { key: 'quantity_status', label: 'Control Status', type: 'status', editable: false, options: ['Within Scope', 'Over Planned', 'Over Measured'] },
];

const PROGRESS_CORRECTION_COLUMNS: ColumnDef[] = [
  { key: 'correction_number', label: 'Correction #', type: 'text', editable: true },
  { key: 'original_wir_id', label: 'Original Approved WIR', type: 'select', editable: true },
  { key: 'correction_type', label: 'Movement', type: 'status', editable: true, options: ['Reversal', 'Reinstatement'] },
  { key: 'effective_date', label: 'Effective Date', type: 'date', editable: true },
  { key: 'quantity', label: 'Quantity', type: 'number', editable: true },
  { key: 'reason', label: 'Reason', type: 'text', editable: true },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Draft', 'Posted', 'Cancelled'] },
];

const PARTY_COLUMNS: ColumnDef[] = [
  { key: 'party_code', label: 'Party Code', type: 'text', editable: true },
  { key: 'legal_name', label: 'Legal Name', type: 'text', editable: true },
  { key: 'trading_name', label: 'Trading Name', type: 'text', editable: true },
  { key: 'party_type', label: 'Type', type: 'status', editable: true, options: ['Client', 'Supplier', 'Contractor', 'Subcontractor', 'Consultant'] },
  { key: 'tax_number', label: 'Tax Number', type: 'text', editable: true },
  { key: 'registration_number', label: 'Registration #', type: 'text', editable: true },
  { key: 'payment_terms_days', label: 'Payment Terms (days)', type: 'number', editable: true },
  { key: 'phone', label: 'Phone', type: 'text', editable: true },
  { key: 'email', label: 'Email', type: 'text', editable: true },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Active', 'Inactive'] },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];

const PARTY_CONTACT_COLUMNS: ColumnDef[] = [
  { key: 'party_id', label: 'Party', type: 'select', editable: true },
  { key: 'contact_name', label: 'Contact Name', type: 'text', editable: true },
  { key: 'job_title', label: 'Job Title', type: 'text', editable: true },
  { key: 'phone', label: 'Phone', type: 'text', editable: true },
  { key: 'email', label: 'Email', type: 'text', editable: true },
  { key: 'is_primary', label: 'Primary', type: 'boolean', editable: true },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Active', 'Inactive'] },
];

const RATE_HISTORY_COLUMNS: ColumnDef[] = [
  { key: 'party_id', label: 'Party', type: 'select', editable: true },
  { key: 'item_code', label: 'Item / BOQ Code', type: 'text', editable: true },
  { key: 'item_description', label: 'Item Description', type: 'text', editable: true },
  { key: 'unit', label: 'Unit', type: 'text', editable: true },
  { key: 'unit_rate', label: 'Unit Rate', type: 'money', editable: true },
  { key: 'currency', label: 'Currency', type: 'text', editable: true, options: ['SAR', 'USD', 'AED', 'EGP', 'EUR'] },
  { key: 'effective_date', label: 'Effective Date', type: 'date', editable: true },
  { key: 'source_reference', label: 'Source Reference', type: 'text', editable: true },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Active', 'Historical', 'Superseded'] },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];

const CASHFLOW_COLUMNS: ColumnDef[] = [
  { key: 'contract_id', label: 'Contract Code', type: 'select', editable: true },
  { key: 'movement_type', label: 'Movement Type', type: 'status', editable: true, options: ['Forecast', 'Actual', 'Manual'] },
  { key: 'date', label: 'Date', type: 'date', editable: true },
  { key: 'description', label: 'Description', type: 'text', editable: true },
  { key: 'category', label: 'Category', type: 'text', editable: true },
  { key: 'inflow', label: 'Inflow', type: 'money', editable: true },
  { key: 'outflow', label: 'Outflow', type: 'money', editable: true },
  { key: 'net', label: 'Net', type: 'money' },
  { key: 'cumulative_balance', label: 'Cumulative (Type)', type: 'money', editable: false },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Open', 'Settled', 'Cancelled'] },
];

const SUBINV_COLUMNS: ColumnDef[] = [
  { key: 'invoice_number', label: 'Invoice #', type: 'text', editable: false },
  { key: 'project_code', label: 'Project Code', type: 'text', editable: false },
  { key: 'contract_id', label: 'Contract Code', type: 'select', editable: false },
  { key: 'boq_item_id', label: 'BOQ Item Code', type: 'select', editable: false },
  { key: 'item_desc', label: 'Item Description', type: 'text', editable: false },
  { key: 'unit', label: 'Unit', type: 'text', editable: false },
  { key: 'quantity', label: 'Quantity', type: 'number', editable: false },
  { key: 'unit_rate', label: 'Unit Rate', type: 'money', editable: false },
  { key: 'amount', label: 'Amount', type: 'money', editable: false },
];

const CLIENTINV_COLUMNS: ColumnDef[] = [
  { key: 'invoice_number', label: 'Invoice #', type: 'text', editable: false },
  { key: 'project_code', label: 'Project Code', type: 'text', editable: false },
  { key: 'contract_id', label: 'Contract Code', type: 'select', editable: false },
  { key: 'boq_item_id', label: 'BOQ Item Code', type: 'select', editable: false },
  { key: 'item_desc', label: 'Item Description', type: 'text', editable: false },
  { key: 'unit', label: 'Unit', type: 'text', editable: false },
  { key: 'quantity', label: 'Quantity', type: 'number', editable: false },
  { key: 'unit_rate', label: 'Unit Rate', type: 'money', editable: false },
  { key: 'amount', label: 'Amount', type: 'money', editable: false },
];

const INVOICE_GENERATION_FORM_COLUMNS: ColumnDef[] = [
  { key: 'project_code', label: 'Project Code', type: 'text', editable: false },
  { key: 'contract_id', label: 'Contract Code', type: 'select', editable: true },
  { key: 'company_name', label: 'Contractor', type: 'text', editable: false },
  { key: 'from_date', label: 'From Date', type: 'date', editable: true },
  { key: 'to_date', label: 'To Date', type: 'date', editable: true },
  { key: 'result', label: 'WIR Result', type: 'status', editable: true, options: WIR_RESULTS },
  { key: 'invoice_number', label: 'Invoice #', type: 'text', editable: true },
];

const INVOICE_TRACKING_COLUMNS: ColumnDef[] = [
  { key: 'invoice_number', label: 'Invoice #', type: 'text', editable: false },
  { key: 'contract_id', label: 'Contract Code', type: 'select', editable: false },
  { key: 'total_work_value', label: 'Total Work Value', type: 'money', editable: false },
  { key: 'invoice_date', label: 'Invoice Date', type: 'date', editable: false },
  { key: 'due_date', label: 'Due Date', type: 'date', editable: true },
  { key: 'status', label: 'Invoice Status', type: 'status', editable: true, options: INVOICE_STATUSES },
  { key: 'payment_status', label: 'Payment Status', type: 'status', editable: true, options: PAYMENT_STATUSES },
  { key: 'payment_date', label: 'Payment Date', type: 'date', editable: true },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];

const VARIATION_COLUMNS: ColumnDef[] = [
  { key: 'variation_number', label: 'Variation #', type: 'text', editable: true },
  { key: 'contract_id', label: 'Contract Code', type: 'select', editable: true },
  { key: 'type', label: 'Type', type: 'status', editable: true, options: VARIATION_TYPES },
  { key: 'title', label: 'Title', type: 'text', editable: true },
  { key: 'description', label: 'Description', type: 'text', editable: true },
  { key: 'cost_impact', label: 'Cost Impact', type: 'money', editable: true },
  { key: 'time_impact_days', label: 'Time Impact (days)', type: 'number', editable: true },
  { key: 'line_count', label: 'Package Lines', type: 'number', editable: false },
  { key: 'preview_value_impact', label: 'Line Impact Preview', type: 'money', editable: false },
  { key: 'posting_readiness', label: 'Posting Readiness', type: 'status', editable: false, options: ['Ready to Submit', 'Needs Correction'] },
  { key: 'baseline_revision_status', label: 'Baseline Revision', type: 'status', editable: false, options: ['Pending', 'Included'] },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: VARIATION_STATUSES },
  { key: 'approved_by', label: 'Approved By', type: 'text', editable: true },
  { key: 'approved_date', label: 'Approved Date', type: 'date', editable: true },
];

const VARIATION_LINE_COLUMNS: ColumnDef[] = [
  { key: 'variation_id', label: 'Variation Order', type: 'select', editable: true },
  { key: 'change_type', label: 'Change Type', type: 'status', editable: true, options: ['New Item', 'Quantity Change', 'Rate Change', 'Quantity & Rate Change'] },
  { key: 'pricing_scope', label: 'Pricing Scope', type: 'status', editable: true, options: ['Entire Revised Quantity', 'Changed Quantity Only'] },
  { key: 'boq_header_id', label: 'BOQ Header', type: 'select', editable: true },
  { key: 'boq_item_id', label: 'Existing BOQ Item', type: 'select', editable: true },
  { key: 'main_boq_item_id', label: 'Parent Main BOQ Item', type: 'select', editable: true },
  { key: 'item_code', label: 'Item Code', type: 'text', editable: true },
  { key: 'description', label: 'Description', type: 'text', editable: true },
  { key: 'unit', label: 'Unit', type: 'text', editable: true },
  { key: 'original_quantity', label: 'Original Qty', type: 'number', editable: false },
  { key: 'quantity_change', label: 'Qty Change', type: 'number', editable: true },
  { key: 'revised_quantity', label: 'Revised Qty', type: 'number', editable: false },
  { key: 'original_rate', label: 'Original Rate', type: 'money', editable: false },
  { key: 'revised_rate', label: 'Revised Rate', type: 'money', editable: true },
  { key: 'value_impact', label: 'Value Impact', type: 'money', editable: false },
  { key: 'effective_date', label: 'Effective Date', type: 'date', editable: false },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];

const DOC_COLUMNS: ColumnDef[] = [
  { key: 'contract_id', label: 'Contract Code', type: 'select', editable: true },
  { key: 'boq_item_id', label: 'BOQ Item', type: 'select', editable: true },
  { key: 'document_number', label: 'Document #', type: 'text', editable: true },
  { key: 'document_name', label: 'Name', type: 'text', editable: true },
  { key: 'document_type', label: 'Type', type: 'status', editable: true, options: DOC_TYPES },
  { key: 'category', label: 'Category', type: 'text', editable: true },
  { key: 'version', label: 'Version', type: 'text', editable: true },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: DOC_STATUSES },
  { key: 'revision', label: 'Revision', type: 'text', editable: true },
  { key: 'supersedes_document_id', label: 'Supersedes', type: 'select', editable: true },
  { key: 'is_current', label: 'Current Revision', type: 'boolean', editable: true },
  { key: 'responsible', label: 'Responsible', type: 'text', editable: true },
  { key: 'upload_date', label: 'Upload Date', type: 'date', editable: true },
  { key: 'related_record_type', label: 'Related Record Type', type: 'status', editable: true, options: ['RFI', 'Submittal', 'NCR', 'Punch Item', 'Variation', 'WIR', 'Other'] },
  { key: 'related_record_reference', label: 'Related Record #', type: 'text', editable: true },
  { key: 'file_reference', label: 'Local File / URL Reference', type: 'text', editable: true },
];

const WIR_COLUMNS: ColumnDef[] = [
  { key: 'control_account_id', label: 'Control Account', type: 'select', editable: true },
  { key: 'company_name', label: 'Contractor', type: 'select', editable: true },
  { key: 'contract_id', label: 'Contract Code', type: 'select', editable: false },
  { key: 'boq_item_id', label: 'BOQ Item Code', type: 'select', editable: true },
  { key: 'schedule_id', label: 'Activity', type: 'select', editable: true },
  { key: 'item_name', label: 'Item Name', type: 'text' },
  { key: 'item_description', label: 'Description', type: 'text' },
  { key: 'wir_number', label: 'WIR #', type: 'text', editable: true },
  { key: 'area', label: 'Area', type: 'text', editable: true },
  { key: 'latitude', label: 'Latitude', type: 'number', editable: true },
  { key: 'longitude', label: 'Longitude', type: 'number', editable: true },
  { key: 'work_type', label: 'Work Type', type: 'text', editable: true },
  { key: 'inspection_date', label: 'Inspection Date', type: 'date', editable: true },
  { key: 'inspector', label: 'Inspector', type: 'text', editable: true },
  { key: 'result', label: 'Result', type: 'status', editable: true, options: WIR_RESULTS },
  { key: 'unit', label: 'Unit', type: 'text' },
  { key: 'quantity', label: 'Qty', type: 'number', editable: true },
  { key: 'unit_price', label: 'Unit Price', type: 'money' },
  { key: 'item_amount', label: 'Item Amount', type: 'money' },
  { key: 'completion_pct', label: 'Completion %', type: 'progress' },
  { key: 'remarks', label: 'Remarks', type: 'text', editable: true },
  { key: 'variance_reason', label: 'Date Variance Reason', type: 'text', editable: true },
  { key: 'file_reference', label: 'Site Photo / Attachment', type: 'text', editable: true },
];

const LABOR_DUTY_COLUMNS: ColumnDef[] = [
  { key: 'contract_id', label: 'Contract Code', type: 'select', editable: true },
  { key: 'boq_item_id', label: 'BOQ Item Code', type: 'select', editable: true },
  { key: 'schedule_id', label: 'Activity', type: 'select', editable: true },
  { key: 'resource_id', label: 'Resource', type: 'select', editable: true },
  { key: 'date', label: 'Date', type: 'date', editable: true },
  { key: 'worker_name', label: 'Worker Name', type: 'text', editable: true },
  { key: 'role', label: 'Role', type: 'text', editable: true, options: ['Mason', 'Carpenter', 'Steel Fixer', 'Electrician', 'Plumber', 'Painter', 'Laborer', 'Welder', 'Operator', 'Foreman', 'Supervisor'] },
  { key: 'no_of_workers', label: 'No. of Workers', type: 'number', editable: true },
  { key: 'hours_per_day', label: 'Hours/Day', type: 'number', editable: true },
  { key: 'days', label: 'Days', type: 'number', editable: true },
  { key: 'total_hours', label: 'Total Hours', type: 'number' },
  { key: 'rate_per_hour', label: 'Rate/Hour', type: 'money', editable: true },
  { key: 'amount', label: 'Amount', type: 'money' },
  { key: 'payment_status', label: 'Payment Status', type: 'status', editable: true, options: PAYMENT_STATUSES },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];

const EQUIPMENT_COLUMNS: ColumnDef[] = [
  { key: 'contract_id', label: 'Contract Code', type: 'select', editable: true },
  { key: 'boq_item_id', label: 'BOQ Item Code', type: 'select', editable: true },
  { key: 'schedule_id', label: 'Activity', type: 'select', editable: true },
  { key: 'resource_id', label: 'Resource', type: 'select', editable: true },
  { key: 'date', label: 'Date', type: 'date', editable: true },
  { key: 'equipment_name', label: 'Equipment Name', type: 'text', editable: true },
  { key: 'equipment_type', label: 'Type', type: 'text', editable: true, options: ['Excavator', 'Crane', 'Bulldozer', 'Concrete Mixer', 'Dump Truck', 'Forklift', 'Generator', 'Welding Machine', 'Air Compressor', 'Scaffolding', 'Other'] },
  { key: 'unit', label: 'Unit', type: 'text', editable: true, options: ['Day', 'Hour', 'Week', 'Month', 'Lump Sum'] },
  { key: 'quantity', label: 'Quantity', type: 'number', editable: true },
  { key: 'unit_rate', label: 'Unit Rate', type: 'money', editable: true },
  { key: 'amount', label: 'Amount', type: 'money' },
  { key: 'payment_status', label: 'Payment Status', type: 'status', editable: true, options: PAYMENT_STATUSES },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];

const RESOURCE_MASTER_COLUMNS: ColumnDef[] = [
  { key: 'resource_code', label: 'Resource Code', type: 'text', editable: true },
  { key: 'resource_name', label: 'Resource Name', type: 'text', editable: true },
  { key: 'resource_type', label: 'Resource Type', type: 'status', editable: true, options: ['Labor', 'Equipment'] },
  { key: 'role_or_type', label: 'Role / Equipment Type', type: 'text', editable: true },
  { key: 'unit', label: 'Unit', type: 'text', editable: true },
  { key: 'standard_rate', label: 'Standard Rate', type: 'money', editable: true },
  { key: 'daily_capacity_hours', label: 'Daily Capacity (hrs)', type: 'number', editable: true },
  { key: 'calendar_id', label: 'Resource Calendar', type: 'select', editable: true },
  { key: 'availability_start_date', label: 'Available From', type: 'date', editable: true },
  { key: 'availability_end_date', label: 'Available Until', type: 'date', editable: true },
  { key: 'peak_load_date', label: 'Peak Load Date', type: 'date', editable: false },
  { key: 'peak_allocated_hours', label: 'Peak Recorded Load (hrs)', type: 'number', editable: false },
  { key: 'peak_overallocation_hours', label: 'Peak Over-allocation (hrs)', type: 'number', editable: false },
  { key: 'planned_hours_total', label: 'Planned Hours', type: 'number', editable: false },
  { key: 'planned_cost_total', label: 'Planned Cost', type: 'money', editable: false },
  { key: 'planned_peak_load_hours', label: 'Peak Planned Load (hrs)', type: 'number', editable: false },
  { key: 'planned_peak_overallocation_hours', label: 'Planned Over-allocation (hrs)', type: 'number', editable: false },
  { key: 'load_status', label: 'Load Status', type: 'status', editable: false, options: ['No Recorded Load', 'Within Capacity', 'Over-allocated'] },
  { key: 'status', label: 'Status', type: 'status', editable: true, options: ['Active', 'Inactive'] },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];
const RESOURCE_ASSIGNMENT_COLUMNS: ColumnDef[] = [
  { key: 'contract_id', label: 'Main Contract', type: 'select', editable: true },
  { key: 'boq_item_id', label: 'BOQ Item', type: 'select', editable: true },
  { key: 'schedule_id', label: 'Activity', type: 'select', editable: true },
  { key: 'resource_id', label: 'Resource', type: 'select', editable: true },
  { key: 'resource_type', label: 'Resource Type', type: 'status', editable: false, options: ['Labor', 'Equipment'] },
  { key: 'assignment_start', label: 'Assignment Start', type: 'date', editable: true },
  { key: 'assignment_end', label: 'Assignment Finish', type: 'date', editable: true },
  { key: 'planned_hours', label: 'Planned Hours', type: 'number', editable: true },
  { key: 'planned_quantity', label: 'Planned Units', type: 'number', editable: true },
  { key: 'standard_rate', label: 'Standard Rate', type: 'money', editable: false },
  { key: 'planned_cost', label: 'Planned Cost', type: 'money', editable: false },
  { key: 'notes', label: 'Notes', type: 'text', editable: true },
];

const TRACKING_COLUMNS: ColumnDef[] = [
  { key: 'project_id', label: 'Project', type: 'text' },
  { key: 'company_name', label: 'Contractor', type: 'text' },
  { key: 'source_type', label: 'Source', type: 'text' },
  { key: 'amount', label: 'Amount', type: 'money' },
  { key: 'status', label: 'Status', type: 'status' },
  { key: 'created_by', label: 'Created By', type: 'text' },
  { key: 'created_time', label: 'Created Time', type: 'date' },
];

const VIEW_CONFIGS: Record<string, { columns: ColumnDef[]; filters?: FilterDef[]; showProjectFilter?: boolean; dateRangeColumn?: string }> = {
  projects: { columns: PROJECT_COLUMNS, filters: [{ key: 'status', label: 'Status', options: PROJECT_STATUSES }, { key: 'category', label: 'Category', options: ['Residential', 'Commercial', 'Industrial', 'Infrastructure', 'Renovation'] }], dateRangeColumn: 'start_date' },
  baselines: { columns: BASELINE_COLUMNS, filters: [{ key: 'status', label: 'Status', options: ['Draft', 'Approved', 'Superseded'] }], showProjectFilter: true, dateRangeColumn: 'baseline_date' },
  reportingPeriods: { columns: REPORTING_PERIOD_COLUMNS, filters: [{ key: 'status', label: 'Status', options: ['Open', 'Locked', 'Closed'] }], showProjectFilter: true, dateRangeColumn: 'start_date' },
  snapshots: { columns: SNAPSHOT_COLUMNS, filters: [{ key: 'status', label: 'Status', options: ['Draft', 'Approved', 'Archived'] }], showProjectFilter: true, dateRangeColumn: 'data_date' },
  users: { columns: USER_COLUMNS, filters: [{ key: 'role', label: 'Role', options: ['PMO Admin', 'Project Manager', 'Commercial Manager', 'Site Engineer', 'Executive Viewer'] }, { key: 'status', label: 'Status', options: ['Active', 'Disabled'] }] },
  governance: { columns: GOVERNANCE_COLUMNS, filters: [{ key: 'record_type', label: 'Type', options: ['Risk', 'Issue', 'Decision', 'Opportunity'] }, { key: 'status', label: 'Status', options: ['Open', 'Mitigating', 'Escalated', 'Approved', 'Closed'] }], showProjectFilter: true, dateRangeColumn: 'due_date' },
  approvals: { columns: APPROVAL_COLUMNS, filters: [{ key: 'status', label: 'Status', options: ['Draft', 'Submitted', 'Approved', 'Rejected', 'Returned'] }], showProjectFilter: true, dateRangeColumn: 'requested_date' },
  auditLog: { columns: AUDIT_COLUMNS, filters: [{ key: 'action', label: 'Action', options: ['Insert', 'Update', 'Delete'] }, { key: 'entity_type', label: 'Entity', options: [] }], showProjectFilter: true, dateRangeColumn: 'created_at' },
  rfi: { columns: RFI_COLUMNS, filters: [{ key: 'status', label: 'Status', options: ['Draft', 'Open', 'Answered', 'Closed'] }, { key: 'impact', label: 'Impact', options: ['None', 'Cost', 'Time', 'Cost & Time'] }], showProjectFilter: true, dateRangeColumn: 'raised_date' },
  submittals: { columns: SUBMITTAL_COLUMNS, filters: [{ key: 'status', label: 'Status', options: ['Draft', 'Submitted', 'Approved', 'Approved as Noted', 'Revise & Resubmit', 'Rejected'] }], showProjectFilter: true, dateRangeColumn: 'submitted_date' },
  quality: { columns: QUALITY_COLUMNS, filters: [{ key: 'status', label: 'Status', options: ['Open', 'In Progress', 'Verified', 'Closed'] }, { key: 'severity', label: 'Severity', options: ['Low', 'Medium', 'High', 'Critical'] }], showProjectFilter: true, dateRangeColumn: 'raised_date' },
  dailyReports: { columns: DAILY_REPORT_COLUMNS, filters: [{ key: 'status', label: 'Status', options: ['Draft', 'Submitted', 'Reviewed'] }, { key: 'weather', label: 'Weather', options: ['Clear', 'Cloudy', 'Rain', 'Windy', 'Hot', 'Other'] }], showProjectFilter: true, dateRangeColumn: 'report_date' },
  tasks: { columns: TASK_COLUMNS, filters: [{ key: 'status', label: 'Status', options: TASK_STATUSES }, { key: 'priority', label: 'Priority', options: PRIORITIES }], showProjectFilter: true, dateRangeColumn: 'start_date' },
  costs: { columns: COST_COLUMNS, filters: [{ key: 'category', label: 'Cost Type', options: COST_TYPES }], showProjectFilter: true },
  costCodes: { columns: COST_CODE_COLUMNS, filters: [{ key: 'classification', label: 'Classification', options: ['Labor', 'Material', 'Equipment', 'Subcontract', 'Indirect', 'Other'] }, { key: 'status', label: 'Status', options: ['Active', 'Inactive'] }], showProjectFilter: true },
  wbs: { columns: WBS_COLUMNS, filters: [{ key: 'status', label: 'Status', options: ['Active', 'Inactive'] }], showProjectFilter: true },
  contractSov: { columns: CONTRACT_SOV_COLUMNS, filters: [{ key: 'status', label: 'Status', options: ['Draft', 'Active', 'Closed'] }, { key: 'contract_role', label: 'Contract Role', options: ['Main Contract', 'Subcontract'] }], showProjectFilter: true },
  controlAccounts: { columns: CONTROL_ACCOUNT_COLUMNS, filters: [{ key: 'status', label: 'Status', options: ['Active', 'Inactive', 'Closed'] }], showProjectFilter: true },
  costChanges: { columns: COST_CHANGE_COLUMNS, filters: [{ key: 'status', label: 'Status', options: ['Draft', 'Submitted', 'Approved', 'Rejected', 'Reversed'] }, { key: 'change_type', label: 'Type', options: ['Budget Transfer', 'Scope Cost', 'Forecast Adjustment', 'Procurement Change'] }], showProjectFilter: true, dateRangeColumn: 'effective_date' },
  paymentCertificates: { columns: PAYMENT_CERTIFICATE_COLUMNS, filters: [{ key: 'certificate_type', label: 'Type', options: ['Client', 'Subcontractor'] }, { key: 'status', label: 'Status', options: ['Draft', 'Submitted', 'Approved', 'Rejected', 'Paid', 'Reversed'] }], showProjectFilter: true, dateRangeColumn: 'certificate_date' },
  costEntries: { columns: COST_ENTRY_COLUMNS, filters: [{ key: 'control_account_id', label: 'Control Account', options: [] }, { key: 'cost_type', label: 'Cost Type', options: COST_TYPES }], showProjectFilter: true, dateRangeColumn: 'date' },
  procurement: { columns: PROCUREMENT_COLUMNS, filters: [{ key: 'control_account_id', label: 'Control Account', options: [] }, { key: 'status', label: 'Commitment Status', options: PROC_STATUSES }], showProjectFilter: true, dateRangeColumn: 'order_date' },
  procurementReconciliation: { columns: PROCUREMENT_COLUMNS, filters: [{ key: 'status', label: 'Commitment Status', options: PROC_STATUSES }], showProjectFilter: true, dateRangeColumn: 'order_date' },
  procurementReceipts: { columns: PROCUREMENT_RECEIPT_COLUMNS, filters: [{ key: 'control_account_id', label: 'Control Account', options: [] }, { key: 'status', label: 'Receipt Status', options: ['Draft', 'Received', 'Accepted', 'Rejected'] }], showProjectFilter: true, dateRangeColumn: 'receipt_date' },
  supplierInvoices: { columns: SUPPLIER_INVOICE_COLUMNS, filters: [{ key: 'status', label: 'AP Status', options: ['Draft', 'Submitted', 'Matched', 'Exception', 'Approved', 'Partially Paid', 'Paid', 'Rejected', 'Cancelled'] }, { key: 'supplier', label: 'Supplier', options: [] }], showProjectFilter: true, dateRangeColumn: 'invoice_date' },
  supplierInvoiceLines: { columns: SUPPLIER_INVOICE_LINE_COLUMNS, showProjectFilter: true },
  supplierInvoicePayments: { columns: SUPPLIER_INVOICE_PAYMENT_COLUMNS, filters: [{ key: 'status', label: 'Payment Status', options: ['Draft', 'Settled', 'Cancelled'] }], showProjectFilter: true, dateRangeColumn: 'payment_date' },
  safety: { columns: SAFETY_COLUMNS, filters: [{ key: 'status', label: 'Status', options: SAFETY_STATUSES }, { key: 'severity', label: 'Severity', options: SAFETY_SEVERITIES }, { key: 'type', label: 'Type', options: SAFETY_TYPES }], showProjectFilter: true, dateRangeColumn: 'date' },
  progress: { columns: PROGRESS_COLUMNS, filters: [{ key: 'company_name', label: 'Contractor', options: [] }], showProjectFilter: true, dateRangeColumn: 'date' },
  schedule: { columns: SCHEDULE_COLUMNS, filters: [{ key: 'control_account_id', label: 'Control Account', options: [] }, { key: 'boq_item_name', label: 'BOQ Item', options: [] }, { key: 'is_critical_item', label: 'Critical', options: ['true', 'false'] }], showProjectFilter: true, dateRangeColumn: 'start_date' },
  workCalendars: { columns: WORK_CALENDAR_COLUMNS, filters: [{ key: 'status', label: 'Status', options: ['Active', 'Inactive'] }, { key: 'working_pattern', label: 'Working Pattern', options: [...WORK_CALENDARS] }] },
  scheduleDistributions: { columns: SCHEDULE_DISTRIBUTION_COLUMNS, filters: [{ key: 'activity_name', label: 'Activity', options: [] }], showProjectFilter: true, dateRangeColumn: 'period_start' },
  resourceAssignments: { columns: RESOURCE_ASSIGNMENT_COLUMNS, filters: [{ key: 'resource_type', label: 'Type', options: ['Labor', 'Equipment'] }], showProjectFilter: true, dateRangeColumn: 'assignment_start' },
  contracts: { columns: CONTRACT_COLUMNS, filters: [{ key: 'contractor', label: 'Company', options: [] }, { key: 'contract_role', label: 'Contract Role', options: ['Main Contract', 'Subcontract'] }, { key: 'status', label: 'Status', options: CONTRACT_STATUSES }], showProjectFilter: true, dateRangeColumn: 'start_date' },
  boq: { columns: BOQ_HEADER_COLUMNS, filters: [{ key: 'company_name', label: 'Company', options: [] }, { key: 'contract_role', label: 'Contract Role', options: ['Main Contract', 'Subcontract'] }, { key: 'classification', label: 'Classification', options: BOQ_CLASSIFICATIONS }], showProjectFilter: true },
  boqItems: { columns: BOQ_ITEM_COLUMNS, filters: [{ key: 'company_name', label: 'Company', options: [] }, { key: 'contract_role', label: 'Contract Role', options: ['Main Contract', 'Subcontract'] }, { key: 'category', label: 'Category', options: ['Earthworks', 'Concrete', 'Steel', 'Masonry', 'Finishes', 'MEP', 'Other'] }], showProjectFilter: true },
  quantityLedger: { columns: QUANTITY_LEDGER_COLUMNS, filters: [{ key: 'quantity_status', label: 'Control Status', options: ['Within Scope', 'Over Planned', 'Over Measured'] }], showProjectFilter: true },
  progressCorrections: { columns: PROGRESS_CORRECTION_COLUMNS, filters: [{ key: 'correction_type', label: 'Movement', options: ['Reversal', 'Reinstatement'] }, { key: 'status', label: 'Status', options: ['Draft', 'Posted', 'Cancelled'] }], showProjectFilter: true, dateRangeColumn: 'effective_date' },
  cashflow: { columns: CASHFLOW_COLUMNS, filters: [{ key: 'movement_type', label: 'Movement Type', options: ['Forecast', 'Actual', 'Manual'] }, { key: 'status', label: 'Status', options: ['Open', 'Settled', 'Cancelled'] }], showProjectFilter: true, dateRangeColumn: 'date' },
  parties: { columns: PARTY_COLUMNS, filters: [{ key: 'party_type', label: 'Type', options: ['Client', 'Supplier', 'Contractor', 'Subcontractor', 'Consultant'] }, { key: 'status', label: 'Status', options: ['Active', 'Inactive'] }] },
  partyContacts: { columns: PARTY_CONTACT_COLUMNS, filters: [{ key: 'status', label: 'Status', options: ['Active', 'Inactive'] }] },
  rateHistory: { columns: RATE_HISTORY_COLUMNS, filters: [{ key: 'status', label: 'Status', options: ['Active', 'Historical', 'Superseded'] }], dateRangeColumn: 'effective_date' },
  subinvoices: { columns: SUBINV_COLUMNS, showProjectFilter: true },
  clientinvoices: { columns: CLIENTINV_COLUMNS, showProjectFilter: true },
  clientInvoiceTracking: { columns: INVOICE_TRACKING_COLUMNS, filters: [{ key: 'status', label: 'Invoice Status', options: INVOICE_STATUSES }, { key: 'payment_status', label: 'Payment Status', options: PAYMENT_STATUSES }], showProjectFilter: true, dateRangeColumn: 'invoice_date' },
  subcontractorInvoiceTracking: { columns: INVOICE_TRACKING_COLUMNS, filters: [{ key: 'status', label: 'Invoice Status', options: INVOICE_STATUSES }, { key: 'payment_status', label: 'Payment Status', options: PAYMENT_STATUSES }], showProjectFilter: true, dateRangeColumn: 'invoice_date' },
  variations: { columns: VARIATION_COLUMNS, filters: [{ key: 'contractor', label: 'Company', options: [] }, { key: 'contract_role', label: 'Contract Role', options: ['Main Contract', 'Subcontract'] }, { key: 'status', label: 'Status', options: VARIATION_STATUSES }], showProjectFilter: true, dateRangeColumn: 'approved_date' },
  variationLines: { columns: VARIATION_LINE_COLUMNS, filters: [{ key: 'change_type', label: 'Change Type', options: ['New Item', 'Quantity Change', 'Rate Change', 'Quantity & Rate Change'] }], showProjectFilter: true, dateRangeColumn: 'effective_date' },
  documents: { columns: DOC_COLUMNS, filters: [{ key: 'status', label: 'Status', options: DOC_STATUSES }, { key: 'document_type', label: 'Type', options: DOC_TYPES }], showProjectFilter: true, dateRangeColumn: 'upload_date' },
  wir: { columns: WIR_COLUMNS, filters: [{ key: 'control_account_id', label: 'Control Account', options: [] }, { key: 'company_name', label: 'Contractor', options: [] }, { key: 'contract_role', label: 'Contract Role', options: ['Main Contract', 'Subcontract'] }, { key: 'result', label: 'Result', options: WIR_RESULTS }], showProjectFilter: true, dateRangeColumn: 'inspection_date' },
  laborDuty: { columns: LABOR_DUTY_COLUMNS, filters: [{ key: 'role', label: 'Role', options: ['Mason', 'Carpenter', 'Steel Fixer', 'Electrician', 'Plumber', 'Painter', 'Laborer', 'Welder', 'Operator', 'Foreman', 'Supervisor'] }], showProjectFilter: true, dateRangeColumn: 'date' },
  resourceMaster: { columns: RESOURCE_MASTER_COLUMNS, filters: [{ key: 'resource_type', label: 'Type', options: ['Labor', 'Equipment'] }, { key: 'status', label: 'Status', options: ['Active', 'Inactive'] }] },
  equipment: { columns: EQUIPMENT_COLUMNS, filters: [{ key: 'equipment_type', label: 'Type', options: ['Excavator', 'Crane', 'Bulldozer', 'Concrete Mixer', 'Dump Truck', 'Forklift', 'Generator', 'Welding Machine', 'Air Compressor', 'Scaffolding', 'Other'] }], showProjectFilter: true, dateRangeColumn: 'date' },
  tracking: { columns: TRACKING_COLUMNS, filters: [{ key: 'status', label: 'Status', options: [] }, { key: 'source_type', label: 'Source', options: [] }], showProjectFilter: true, dateRangeColumn: 'created_time' },
};

const TABLE_NAMES: Record<string, string> = {
  projects: 'projects', baselines: 'project_baselines', reportingPeriods: 'reporting_periods', snapshots: 'pmo_snapshots', users: 'app_users', governance: 'governance_register', approvals: 'approval_requests', auditLog: 'audit_log', rfi: 'rfi_register', submittals: 'submittals', quality: 'quality_register', dailyReports: 'site_daily_reports', tasks: 'tasks', costs: 'costs', costEntries: 'cost_entries', costCodes: 'cost_codes', wbs: 'wbs_nodes', contractSov: 'contract_sov_lines', controlAccounts: 'control_accounts', costChanges: 'cost_changes', paymentCertificates: 'payment_certificates',
  procurement: 'procurement', procurementReceipts: 'procurement_receipts', safety: 'safety', progress: 'progress_entries', scheduleDistributions: 'schedule_distributions', workCalendars: 'work_calendars',
  resourceAssignments: 'schedule_resource_assignments',
  procurementReconciliation: 'procurement',
  supplierInvoices: 'supplier_invoices', supplierInvoiceLines: 'supplier_invoice_lines', supplierInvoicePayments: 'supplier_invoice_payments',
  schedule: 'schedules', contracts: 'contracts', boq: 'boq_headers', boqItems: 'boq_items', quantityLedger: 'boq_items', progressCorrections: 'progress_corrections',
  cashflow: 'cash_flow', subinvoices: 'subcontractor_invoices', clientinvoices: 'client_invoices',
  clientInvoiceTracking: 'client_invoice_tracking', subcontractorInvoiceTracking: 'subcontractor_invoice_tracking',
  variations: 'variations', variationLines: 'variation_lines', documents: 'documents', wir: 'wir_entries',
  laborDuty: 'labor_duty', resourceMaster: 'resource_masters', equipment: 'equipment', tracking: 'tracking_sheet',
  parties: 'parties', partyContacts: 'party_contacts', rateHistory: 'rate_history',
};

const VIEW_TITLES: Record<string, string> = {
  projects: 'Projects', baselines: 'Baselines', reportingPeriods: 'Reporting Periods', snapshots: 'PMO Snapshots', users: 'Users & Roles', governance: 'Risk, Issue & Decision Register', approvals: 'Approvals', auditLog: 'Audit Trail', rfi: 'RFI Register', submittals: 'Submittals', quality: 'NCR & Punch Register', dailyReports: 'Site Daily Reports', tasks: 'Tasks', costs: 'Cost Control', costEntries: 'Cost Entries', costCodes: 'Cost Code / CBS Master', wbs: 'WBS Master', contractSov: 'Contract Schedule of Values', controlAccounts: 'Control Accounts', costChanges: 'Cost Changes', paymentCertificates: 'Payment Certificates',
  procurement: 'Procurement', procurementReceipts: 'Goods Receipts', safety: 'Safety Records', progress: 'Progress Entries', scheduleDistributions: 'Planned Quantity Distribution', workCalendars: 'Work Calendar Master',
  resourceAssignments: 'Planned Resource Assignments',
  procurementReconciliation: 'PO Reconciliation',
  supplierInvoices: 'Supplier Invoices / AP', supplierInvoiceLines: 'Supplier Invoice Match Lines', supplierInvoicePayments: 'Supplier Payments',
  schedule: 'Schedule', contracts: 'Contracts', boq: 'BOQ Headers', boqItems: 'BOQ Items', quantityLedger: 'Quantity Ledger', progressCorrections: 'Progress Corrections',
  cashflow: 'Cash Flow', subinvoices: 'Subcontractor Invoices', clientinvoices: 'Client Invoices',
  clientInvoiceTracking: 'Client Invoice Tracking', subcontractorInvoiceTracking: 'Subcontractor Invoice Tracking',
  variations: 'Variations', variationLines: 'Variation Lines', documents: 'Documents', wir: 'Work Inspection Reports',
  laborDuty: 'Labor Duty', resourceMaster: 'Resource Master', equipment: 'Equipment', tracking: 'Tracking Sheet',
  parties: 'Clients, Vendors & Subcontractors', partyContacts: 'Party Contacts', rateHistory: 'Rate History',
};

function UnifiedDataDateSelector() {
  const { dataDate, setDataDate } = useProjectDataDate();
  return (
    <label
      className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-600 shadow-sm hover:border-primary-300 transition-colors"
      title="Reporting cut-off date (All dashboard and report metrics are evaluated through this date — does not modify data records)"
    >
      <CalendarClock size={14} className="text-neutral-400" />
      <span className="hidden sm:inline font-medium text-neutral-500">Data Date:</span>
      <input
        aria-label="Project reporting data date"
        type="date"
        value={dataDate}
        onChange={(event) => setDataDate(event.target.value)}
        className="border-0 bg-transparent p-0 text-xs font-semibold text-neutral-800 outline-none cursor-pointer"
      />
      <span className="text-[10px] text-neutral-400 hidden xl:inline" title="Reporting cut-off only">(Cut-off)</span>
    </label>
  );
}

function AppWorkspace() {
  const [activeView, setActiveView] = useState<ViewKey>(() => (localStorage.getItem('buildtrack:default-view') as ViewKey) || 'dashboard');
  const [navigationHistory, setNavigationHistory] = useState<ViewKey[]>(() => [(localStorage.getItem('buildtrack:default-view') as ViewKey) || 'dashboard']);
  const navigationIndex = useRef(0);
  const restoringNavigation = useRef(false);
  const [recentViews, setRecentViews] = useState<ViewKey[]>(() => {
    try { const stored = JSON.parse(localStorage.getItem('buildtrack:recent-views') || '[]'); return Array.isArray(stored) ? stored.slice(0, 5) : []; } catch { return []; }
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() => (localStorage.getItem('buildtrack:workspace-mode') as WorkspaceMode) || 'professional');
  const [workspaceProjectId, setWorkspaceProjectId] = useState('');
  const [activeRole, setActiveRole] = useState(() => localStorage.getItem('buildtrack:active-role') || 'PMO Admin');
  const [sessionUserId, setSessionUserId] = useState(() => localStorage.getItem('buildtrack:session-user') || '');
  const [loginName, setLoginName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [scheduleVersionOpen, setScheduleVersionOpen] = useState(false);
  const [delayRegisterOpen, setDelayRegisterOpen] = useState(false);
  const [costPlanOpen, setCostPlanOpen] = useState(false);
  const [estimateModalOpen, setEstimateModalOpen] = useState(false);
  const [commitmentReconcileOpen, setCommitmentReconcileOpen] = useState(false);
  const [costVarianceDrillDownOpen, setCostVarianceDrillDownOpen] = useState(false);
  const { dataDate: unifiedDataDate } = useProjectDataDate();
  const data = useData();
  const synchronizingLiveSubcontractCosts = useRef(false);
  const synchronizingCostControl = useRef(false);
  const synchronizingProjectFinancials = useRef(false);
  const normalizingScheduleActivities = useRef(false);

  useEffect(() => { localStorage.setItem('buildtrack:active-role', activeRole); }, [activeRole]);
  useEffect(() => {
    document.documentElement.dataset.workspaceMode = workspaceMode;
    if (workspaceMode === 'focus') setFocusMode(true);
  }, [workspaceMode]);
  useEffect(() => {
    if (restoringNavigation.current) { restoringNavigation.current = false; return; }
    setNavigationHistory((previous) => {
      if (previous[navigationIndex.current] === activeView) return previous;
      const next = [...previous.slice(0, navigationIndex.current + 1), activeView].slice(-30);
      navigationIndex.current = next.length - 1;
      return next;
    });
  }, [activeView]);
  const goBack = () => { if (navigationIndex.current <= 0) return; navigationIndex.current -= 1; restoringNavigation.current = true; setActiveView(navigationHistory[navigationIndex.current]); };
  const goForward = () => { if (navigationIndex.current >= navigationHistory.length - 1) return; navigationIndex.current += 1; restoringNavigation.current = true; setActiveView(navigationHistory[navigationIndex.current]); };
  useEffect(() => {
    setRecentViews((previous) => {
      const next = [activeView, ...previous.filter((view) => view !== activeView)].slice(0, 5);
      localStorage.setItem('buildtrack:recent-views', JSON.stringify(next));
      return next;
    });
  }, [activeView]);

  const hashPassword = async (password: string, salt?: string) => {
    const actualSalt = salt || Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, '0')).join('');
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(actualSalt), iterations: 150000, hash: 'SHA-256' }, material, 256);
    return { salt: actualSalt, hash: Array.from(new Uint8Array(bits), (value) => value.toString(16).padStart(2, '0')).join('') };
  };

  const signIn = async () => {
    setLoginError('');
    try {
      if (!loginName.trim() || loginPassword.length < 8) throw new Error('Enter a username and a password of at least 8 characters.');
      if (data.users.length === 0) {
        const secured = await hashPassword(loginPassword);
        const user = await dataRepository.insert<Record<string, any>>('app_users', { username: loginName.trim(), display_name: loginName.trim(), role: 'PMO Admin', status: 'Active', password_hash: secured.hash, password_salt: secured.salt, last_login_at: new Date().toISOString() });
        data.applyLocalMutation('app_users', { type: 'insert', row: user });
        setSessionUserId(user.id); setActiveRole('PMO Admin'); localStorage.setItem('buildtrack:session-user', user.id); return;
      }
      const user = data.users.find((candidate: any) => candidate.username?.toLowerCase() === loginName.trim().toLowerCase() && candidate.status === 'Active') as any;
      if (!user?.password_hash || !user?.password_salt) throw new Error('Invalid username or password.');
      const secured = await hashPassword(loginPassword, user.password_salt);
      if (secured.hash !== user.password_hash) throw new Error('Invalid username or password.');
      const updated = await dataRepository.update<Record<string, any>>('app_users', user.id, { last_login_at: new Date().toISOString() });
      data.applyLocalMutation('app_users', { type: 'update', row: updated });
      setSessionUserId(user.id); setActiveRole(user.role); localStorage.setItem('buildtrack:session-user', user.id);
    } catch (error: any) { setLoginError(error.message || 'Could not sign in.'); }
  };

  // Repair/synchronize existing records as soon as the local database has
  // loaded. Earlier records may have been saved before the date relationship
  // between the main contract and its generated project was enforced.
  useEffect(() => {
    const synchronizeExistingProjectDates = async () => {
      const mainContracts = data.contracts.filter((contract: any) =>
        !contract.parent_main_contract_id && contract.project_id,
      ) as Record<string, any>[];
      for (const contract of mainContracts) {
        const project = data.projects.find((item: any) => item.id === contract.project_id) as Record<string, any> | undefined;
        if (!project) continue;
        const patch: Record<string, any> = {};
        if ((project.start_date || null) !== (contract.start_date || null)) patch.start_date = contract.start_date || null;
        if ((project.end_date || null) !== (contract.end_date || null)) patch.end_date = contract.end_date || null;
        if (Object.keys(patch).length === 0) continue;
        const updatedProject = await dataRepository.update<Record<string, any>>('projects', project.id, patch);
        data.applyLocalMutation('projects', { type: 'update', row: updatedProject });
      }
    };
    if (data.contracts.length > 0 && data.projects.length > 0) {
      void synchronizeExistingProjectDates().catch((error) =>
        console.error('Could not synchronize existing project dates.', error),
      );
    }
  }, [data.contracts, data.projects, data.applyLocalMutation]);

  // Older planning rows stored Budget and Planned Value independently. An
  // activity now has one financial truth: planned quantity × main BOQ rate.
  // Where an old row has no quantity, preserve its historical Planned Value
  // by deriving the missing quantity from the main BOQ rate.
  useEffect(() => {
    if (normalizingScheduleActivities.current || data.schedules.length === 0 || data.boqItems.length === 0) return;
    const normalizeScheduleActivities = async () => {
      normalizingScheduleActivities.current = true;
      try {
        for (const activity of data.schedules as Record<string, any>[]) {
          const item = data.boqItems.find((candidate: any) => candidate.id === activity.boq_item_id) as Record<string, any> | undefined;
          if (!item) continue;
          const rate = Number(item.unit_rate) || 0;
          if (rate <= 0) continue;
          const storedQuantity = Number(activity.planned_quantity) || 0;
          const storedValue = Number(activity.planned_value) || 0;
          const plannedQuantity = storedQuantity > 0 ? storedQuantity : (storedValue > 0 ? storedValue / rate : 0);
          const plannedValue = Math.round(plannedQuantity * rate * 100) / 100;
          const patch: Record<string, any> = {};
          if (Number(activity.planned_quantity) !== plannedQuantity) patch.planned_quantity = plannedQuantity;
          if (Number(activity.unit_rate) !== rate) patch.unit_rate = rate;
          if (Number(activity.planned_value) !== plannedValue) patch.planned_value = plannedValue;
          if (Number(activity.budget) !== plannedValue) patch.budget = plannedValue;
          if (Object.keys(patch).length === 0) continue;
          const updated = await dataRepository.update<Record<string, any>>('schedules', activity.id, patch);
          data.applyLocalMutation('schedules', { type: 'update', row: updated });
        }
      } finally {
        normalizingScheduleActivities.current = false;
      }
    };
    void normalizeScheduleActivities().catch((error) => console.error('Could not normalize schedule activities.', error));
  }, [data.schedules, data.boqItems, data.applyLocalMutation]);

  const groups = ['Executive', 'Planning & Controls', 'Commercial & Cash', 'Cost & Resources', 'Field & Governance'];

  async function syncSubcontractWirCost(mutation: { type: string; row?: Record<string, any>; id?: string }) {
    const sourceId = mutation.row?.id || mutation.id;
    if (!sourceId) return;
    const existing = data.costEntries.find((entry: any) => entry.source_type === 'subcontractor_wir' && entry.source_id === sourceId);
    if (mutation.type === 'delete') {
      if (existing) {
        await dataRepository.delete('cost_entries', existing.id);
        data.applyLocalMutation('cost_entries', { type: 'delete', id: existing.id });
      }
      return;
    }

    const wir = mutation.row;
    if (!wir) return;
    const subcontract = data.contracts.find((contract: any) => contract.id === wir.contract_id) as any;
    // Main-contract WIRs are not a cost. Only subcontractor work is loaded as
    // a live cost against its parent main contract.
    if (!subcontract?.parent_main_contract_id) {
      if (existing) {
        await dataRepository.delete('cost_entries', existing.id);
        data.applyLocalMutation('cost_entries', { type: 'delete', id: existing.id });
      }
      return;
    }
    const subcontractItem = data.boqItems.find((item: any) => item.id === wir.boq_item_id) as any;
    const mainItem = subcontractItem?.main_boq_item_id
      ? data.boqItems.find((item: any) => item.id === subcontractItem.main_boq_item_id) as any
      : null;
    if (!mainItem) {
      if (existing) {
        await dataRepository.delete('cost_entries', existing.id);
        data.applyLocalMutation('cost_entries', { type: 'delete', id: existing.id });
      }
      console.warn(`Subcontract WIR ${sourceId} has no linked main BOQ item; live cost was not created.`);
      return;
    }
    const mainContractId = subcontract.parent_main_contract_id;
    const project = data.projects.find((item) => item.id === subcontract.project_id);
    const mainHeader = data.boqHeaders.find((header: any) => header.id === mainItem.boq_header_id) as any;
    const entry = {
      project_id: subcontract.project_id,
      project_code: project?.project_code || '',
      contract_id: mainContractId,
      main_contract_id: mainContractId,
      boq_header_id: mainItem.boq_header_id || null,
      boq_item_id: mainItem.id,
      boq_code: mainHeader?.boq_code || mainItem.boq_code || '',
      company_name: subcontract.contractor || '',
      boq_item_code: mainItem.item_code || '',
      boq_item_name: mainItem.item_name || mainItem.description || '',
      date: wir.inspection_date || null,
      cost_type: 'Subcontractor Cost',
      invoice_number: wir.wir_number || '',
      payment_order_number: '',
      // Subcontractor cost uses its agreed subcontract rate, while its BOQ
      // code remains the linked main BOQ item code for project reporting.
      amount: Math.round((Number(wir.quantity) || 0) * (Number(subcontractItem.unit_rate) || 0) * 100) / 100,
      source_type: 'subcontractor_wir',
      source_id: sourceId,
    };
    if (existing) {
      const unchanged = Object.entries(entry).every(([key, value]) => {
        const previous = (existing as Record<string, any>)[key];
        return (previous ?? null) === (value ?? null);
      });
      if (unchanged) return;
      const updated = await dataRepository.update<Record<string, any>>('cost_entries', existing.id, entry);
      data.applyLocalMutation('cost_entries', { type: 'update', row: updated });
    } else {
      const inserted = await dataRepository.insert<Record<string, any>>('cost_entries', entry);
      data.applyLocalMutation('cost_entries', { type: 'insert', row: inserted });
    }
  }

  async function synchronizeVariationLines(variationId: string) {
    if (!variationId) return;
    const [lines, variations, items, headers, contracts, sovLines] = await Promise.all([
      dataRepository.list<Record<string, any>>('variation_lines'),
      dataRepository.list<Record<string, any>>('variations'),
      dataRepository.list<Record<string, any>>('boq_items'),
      dataRepository.list<Record<string, any>>('boq_headers'),
      dataRepository.list<Record<string, any>>('contracts'),
      dataRepository.list<Record<string, any>>('contract_sov_lines'),
    ]);
    const variation = variations.find((row) => row.id === variationId);
    if (!variation) return;
    const variationLines = lines.filter((line) => line.variation_id === variationId);
    const totalImpact = Math.round(variationLines.reduce((sum, line) => sum + (Number(line.value_impact) || 0), 0) * 100) / 100;
    if (Number(variation.cost_impact) !== totalImpact) {
      const updated = await dataRepository.update<Record<string, any>>('variations', variationId, { cost_impact: totalImpact });
      data.applyLocalMutation('variations', { type: 'update', row: updated });
    }

    const variationCashSource = `variation_cash_forecast:${variation.id}`;
    const existingVariationCash = data.cashFlow.find((entry: any) => entry.source_type === 'variation_cash_forecast' && entry.source_id === variation.id) as any;
    // A draft/submitted order is a commercial scenario only. Its BOQ and cash
    // impact are intentionally deferred until the order is formally approved.
    if (variation.status !== 'Approved') {
      if (existingVariationCash) {
        await dataRepository.delete('cash_flow', existingVariationCash.id);
        data.applyLocalMutation('cash_flow', { type: 'delete', id: existingVariationCash.id });
      }
      return;
    }
    const effectiveDate = variation.approved_date || new Date().toISOString().slice(0, 10);
    const variationContract = contracts.find((row) => row.id === variation.contract_id);
    if (!variationContract) throw new Error(`Variation ${variation.variation_number || variation.id} has no valid contract.`);
    // This is the variation's controlled commercial cash projection, not an
    // invoice/payment fact. A main-contract VO forecasts an inflow; a
    // subcontract VO forecasts an outflow. The deterministic source key makes
    // repeat synchronization idempotent.
    const variationCash = {
      project_id: variation.project_id,
      contract_id: variation.contract_id,
      date: effectiveDate,
      description: `Approved variation forecast: ${variation.variation_number || variation.id}`,
      category: 'Commercial Variation',
      // A negative main-contract VO reduces expected collection; a negative
      // subcontract VO is a supplier credit. Keep inflow/outflow non-negative
      // and express direction through net instead of storing a negative cash leg.
      inflow: variationContract.parent_main_contract_id ? Math.max(0, -totalImpact) : Math.max(0, totalImpact),
      outflow: variationContract.parent_main_contract_id ? Math.max(0, totalImpact) : Math.max(0, -totalImpact),
      net: variationContract.parent_main_contract_id ? -totalImpact : totalImpact,
      cumulative_balance: 0,
      movement_type: 'Forecast',
      status: 'Open',
      source_type: 'variation_cash_forecast',
      source_id: variation.id,
    };
    if (Math.abs(totalImpact) > 0.000001) {
      const saved = existingVariationCash
        ? await dataRepository.update<Record<string, any>>('cash_flow', existingVariationCash.id, variationCash)
        : await dataRepository.insert<Record<string, any>>('cash_flow', { id: variationCashSource, ...variationCash });
      data.applyLocalMutation('cash_flow', { type: existingVariationCash ? 'update' : 'insert', row: saved });
    } else if (existingVariationCash) {
      await dataRepository.delete('cash_flow', existingVariationCash.id);
      data.applyLocalMutation('cash_flow', { type: 'delete', id: existingVariationCash.id });
    }
    for (const line of variationLines) {
      if (line.applied_at) continue;
      const changeType = String(line.change_type || '');
      const contract = contracts.find((row) => row.id === line.contract_id);
      if (!contract) throw new Error(`Variation line ${line.item_code || line.id} has no valid contract.`);
      if (changeType === 'New Item') {
        if (!line.boq_header_id) throw new Error(`New variation item ${line.item_code || line.id} has no BOQ header.`);
        if (items.some((item) => item.boq_header_id === line.boq_header_id && item.item_code === line.item_code)) {
          throw new Error(`BOQ item code ${line.item_code} already exists in the target BOQ.`);
        }
        if (contract.parent_main_contract_id && !line.main_boq_item_id) {
          throw new Error(`New subcontract item ${line.item_code} must be linked to a parent main BOQ item.`);
        }
        const header = headers.find((row) => row.id === line.boq_header_id);
        const created = await dataRepository.insert<Record<string, any>>('boq_items', {
          project_id: line.project_id,
          project_code: String((data.projects.find((project: any) => project.id === line.project_id) as any)?.project_code || ''),
          boq_code: header?.boq_code || '',
          item_code: line.item_code,
          item_name: line.description,
          description: line.description,
          category: 'Variation',
          unit: line.unit || '',
          quantity: Number(line.revised_quantity) || 0,
          unit_rate: Number(line.revised_rate) || 0,
          amount: Math.round((Number(line.revised_quantity) || 0) * (Number(line.revised_rate) || 0) * 100) / 100,
          boq_header_id: line.boq_header_id,
          main_boq_item_id: line.main_boq_item_id || null,
          item_code_locked: false,
          last_modified: new Date().toISOString(),
          notes: `Created by approved variation ${variation.variation_number || variation.id} effective ${effectiveDate}.`,
        });
        data.applyLocalMutation('boq_items', { type: 'insert', row: created });
        // A new approved variation is a new commercial scope. It must have a
        // zero-original SOV line so its approved value is visible exactly once
        // in budget, forecast and cost control rather than being hidden in BOQ.
        if (!sovLines.some((sov) => sov.contract_id === line.contract_id && sov.boq_item_id === created.id)) {
          const reference = String(variation.variation_number || variation.id).replace(/[^A-Za-z0-9-]/g, '');
          const sov = await dataRepository.insert<Record<string, any>>('contract_sov_lines', {
            project_id: line.project_id,
            contract_id: line.contract_id,
            boq_header_id: line.boq_header_id,
            boq_item_id: created.id,
            sov_line_code: `SOV-VO-${reference}-${line.item_code || created.id}`,
            description: created.item_name || created.description || 'Approved variation scope',
            original_budget: 0,
            status: 'Active',
            notes: `Generated from approved variation ${variation.variation_number || variation.id}.`,
          });
          sovLines.push(sov);
          data.applyLocalMutation('contract_sov_lines', { type: 'insert', row: sov });
        }
        // Point the approved line to its generated BOQ item. This is the
        // allocation key used by SOV, dashboard and data-quality reconciliation.
        line.boq_item_id = created.id;
      } else {
        const item = items.find((row) => row.id === line.boq_item_id);
        if (!item) throw new Error(`Variation line ${line.item_code || line.id} has no valid existing BOQ item.`);
        // Existing BOQ rows are immutable commercial baselines. Every
        // approved adjustment is represented as one or more supplemental BOQ
        // rows, preserving the source item and the variation reference.
        const header = headers.find((row) => row.id === item.boq_header_id);
        const additions: Array<{ suffix: string; quantity: number; rate: number; label: string }> = [];
        if (changeType === 'Quantity Change') additions.push({ suffix: 'QTY', quantity: Number(line.quantity_change) || 0, rate: Number(item.unit_rate) || 0, label: 'Quantity adjustment' });
        if (changeType === 'Rate Change') additions.push({ suffix: 'RATE', quantity: Number(item.quantity) || 0, rate: (Number(line.revised_rate) || 0) - (Number(item.unit_rate) || 0), label: 'Rate adjustment' });
        if (changeType === 'Quantity & Rate Change') {
          if (line.pricing_scope === 'Changed Quantity Only') {
            additions.push({ suffix: 'QTY-RATE', quantity: Number(line.quantity_change) || 0, rate: Number(line.revised_rate) || 0, label: 'Additional quantity at revised rate' });
          } else {
            additions.push({ suffix: 'RATE', quantity: Number(item.quantity) || 0, rate: (Number(line.revised_rate) || 0) - (Number(item.unit_rate) || 0), label: 'Rate adjustment on original quantity' });
            additions.push({ suffix: 'QTY-RATE', quantity: Number(line.quantity_change) || 0, rate: Number(line.revised_rate) || 0, label: 'Additional quantity at revised rate' });
          }
        }
        const reference = String(variation.variation_number || variation.id).replace(/[^A-Za-z0-9-]/g, '');
        for (const addition of additions.filter((entry) => entry.quantity !== 0 && entry.rate !== 0)) {
          const supplementCode = `${item.item_code || 'ITEM'}-VO-${reference}-${addition.suffix}`;
          if (items.some((candidate) => candidate.boq_header_id === item.boq_header_id && candidate.item_code === supplementCode)) {
            throw new Error(`The variation BOQ item ${supplementCode} was already created.`);
          }
          const created = await dataRepository.insert<Record<string, any>>('boq_items', {
            project_id: item.project_id,
            project_code: item.project_code || '',
            boq_code: header?.boq_code || item.boq_code || '',
            // The system suffix keeps the physical key unique; the original
            // business code is retained below for reporting and selection.
            item_code: supplementCode,
            source_item_code: item.item_code || '',
            parent_boq_item_id: item.id,
            variation_id: variation.id,
            variation_number: variation.variation_number || variation.id,
            item_name: `${item.item_name || item.description || item.item_code} — ${addition.label}`,
            description: `Source item ${item.item_code || item.id}; ${addition.label}; approved variation ${variation.variation_number || variation.id}. ${line.description || ''}`.trim(),
            category: 'Variation',
            unit: item.unit || line.unit || '',
            quantity: addition.quantity,
            unit_rate: addition.rate,
            amount: Math.round(addition.quantity * addition.rate * 100) / 100,
            boq_header_id: item.boq_header_id,
            main_boq_item_id: item.main_boq_item_id || null,
            item_code_locked: false,
            last_modified: new Date().toISOString(),
            notes: `Variation supplement for ${item.item_code || item.id}; variation ${variation.variation_number || variation.id}; effective ${effectiveDate}.`,
          });
          data.applyLocalMutation('boq_items', { type: 'insert', row: created });
        }
      }
      const marked = await dataRepository.update<Record<string, any>>('variation_lines', line.id, { boq_item_id: line.boq_item_id || null, effective_date: effectiveDate, applied_at: new Date().toISOString() });
      data.applyLocalMutation('variation_lines', { type: 'update', row: marked });
    }
  }

  async function syncOperationalCost(sourceTable: 'procurement' | 'labor_duty' | 'equipment', mutation: { type: string; row?: Record<string, any>; id?: string }) {
    const sourceId = mutation.row?.id || mutation.id;
    if (!sourceId) return;
    // PO forecasts are an SQLite-governed commercial posting.  They must
    // never be recreated by a component re-render or by the browser client.
    if ((['procurement'] as string[]).includes(sourceTable)) return;
    const sourceType = sourceTable === 'procurement' ? 'procurement' : sourceTable === 'labor_duty' ? 'labor' : 'equipment';
    const existingCost = data.costEntries.find((entry: any) => entry.source_type === sourceType && entry.source_id === sourceId) as any;
    const existingCash = data.cashFlow.find((entry: any) => entry.source_type === sourceType && entry.source_id === sourceId) as any;
    const existingForecast = data.cashFlow.find((entry: any) => entry.source_type === `${sourceType}_forecast` && entry.source_id === sourceId) as any;
    if (mutation.type === 'delete') {
      if (existingCost) { await dataRepository.delete('cost_entries', existingCost.id); data.applyLocalMutation('cost_entries', { type: 'delete', id: existingCost.id }); }
      if (existingCash) { await dataRepository.delete('cash_flow', existingCash.id); data.applyLocalMutation('cash_flow', { type: 'delete', id: existingCash.id }); }
      if (existingForecast) { await dataRepository.delete('cash_flow', existingForecast.id); data.applyLocalMutation('cash_flow', { type: 'delete', id: existingForecast.id }); }
      return;
    }
    const source = mutation.row;
    if (!source) return;
    const contract = data.contracts.find((row: any) => row.id === source.contract_id) as any;
    const item = data.boqItems.find((row: any) => row.id === source.boq_item_id) as any;
    const header = data.boqHeaders.find((row: any) => row.id === item?.boq_header_id) as any;
    if (!contract || contract.parent_main_contract_id || !item || header?.contract_id !== contract.id) {
      // A source without the full main-contract / BOQ relationship remains a
      // draft operational record and is deliberately not posted as a cost.
      if (existingCost) { await dataRepository.delete('cost_entries', existingCost.id); data.applyLocalMutation('cost_entries', { type: 'delete', id: existingCost.id }); }
      return;
    }
    const amount = sourceTable === 'procurement'
      ? (Number(source.total_cost) || (Number(source.quantity) || 0) * (Number(source.unit_cost) || 0))
      : Number(source.amount) || 0;
    const costType = sourceTable === 'procurement' ? 'Materials' : sourceTable === 'labor_duty' ? 'Labor' : 'Equipment';
    const costRow = {
      project_id: contract.project_id, project_code: data.projects.find((project: any) => project.id === contract.project_id)?.project_code || '',
      contract_id: contract.id, main_contract_id: contract.id, boq_header_id: item.boq_header_id || null, boq_item_id: item.id,
      boq_code: header?.boq_code || item.boq_code || '', company_name: contract.contractor || '',
      boq_item_code: item.item_code || '', boq_item_name: item.item_name || item.description || '',
      date: sourceTable === 'procurement' ? (source.delivery_date || source.order_date || null) : (source.date || null),
      cost_type: costType, invoice_number: source.purchase_order_number || source.reference_number || '', payment_order_number: '',
      amount: Math.round(amount * 100) / 100, source_type: sourceType, source_id: sourceId,
    };
    // A PO is a commitment only. Older releases incorrectly generated an
    // Actual Cost record the moment a procurement row was saved. Remove that
    // legacy projection; accepted receipts/AP entries will become the only
    // source for PO actuals in the next commercial control unit.
    if (sourceTable === 'procurement') {
      if (existingCost) {
        await dataRepository.delete('cost_entries', existingCost.id);
        data.applyLocalMutation('cost_entries', { type: 'delete', id: existingCost.id });
      }
      if (existingCash) {
        await dataRepository.delete('cash_flow', existingCash.id);
        data.applyLocalMutation('cash_flow', { type: 'delete', id: existingCash.id });
      }
      const posting = procurementPostingState(source);
      const shouldForecast = posting.isForecast;
      if (shouldForecast) {
        const forecastRow = { project_id: contract.project_id, contract_id: contract.id, date: source.delivery_date || source.order_date || null, description: `Supplier payment forecast: ${source.item || item.item_name || ''}`, category: 'Supplier Payable', inflow: 0, outflow: amount, net: -amount, cumulative_balance: 0, movement_type: 'Forecast', status: 'Open', source_type: `${sourceType}_forecast`, source_id: sourceId };
        if (existingForecast) {
          const updated = await dataRepository.update<Record<string, any>>('cash_flow', existingForecast.id, forecastRow);
          data.applyLocalMutation('cash_flow', { type: 'update', row: updated });
        } else {
          const inserted = await dataRepository.insert<Record<string, any>>('cash_flow', forecastRow);
          data.applyLocalMutation('cash_flow', { type: 'insert', row: inserted });
        }
      } else if (existingForecast) {
        await dataRepository.delete('cash_flow', existingForecast.id);
        data.applyLocalMutation('cash_flow', { type: 'delete', id: existingForecast.id });
      }
      return;
    }
    if (existingCost) {
      const updated = await dataRepository.update<Record<string, any>>('cost_entries', existingCost.id, costRow);
      data.applyLocalMutation('cost_entries', { type: 'update', row: updated });
    } else {
      const inserted = await dataRepository.insert<Record<string, any>>('cost_entries', costRow);
      data.applyLocalMutation('cost_entries', { type: 'insert', row: inserted });
    }
    const isPaid = String(source.payment_status || '') === 'Paid';
    if (isPaid) {
      const cashRow = { project_id: contract.project_id, contract_id: contract.id, date: costRow.date, description: `${costType}: ${source.item || source.worker_name || source.equipment_name || item.item_name || ''}`, category: costType, inflow: 0, outflow: costRow.amount, net: -costRow.amount, cumulative_balance: 0, movement_type: 'Actual', status: 'Settled', source_type: sourceType, source_id: sourceId };
      if (existingCash) {
        const updated = await dataRepository.update<Record<string, any>>('cash_flow', existingCash.id, cashRow);
        data.applyLocalMutation('cash_flow', { type: 'update', row: updated });
      } else {
        const inserted = await dataRepository.insert<Record<string, any>>('cash_flow', cashRow);
        data.applyLocalMutation('cash_flow', { type: 'insert', row: inserted });
      }
    } else if (existingCash) {
      await dataRepository.delete('cash_flow', existingCash.id);
      data.applyLocalMutation('cash_flow', { type: 'delete', id: existingCash.id });
    }
  }

  /** AP posting is deliberately separate from receipt costing: Accepted GRN
   * posts accrual/actual cost, approved AP forecasts cash, and settled AP
   * payment posts cash. This prevents a supplier invoice from duplicating AC. */
  async function syncSupplierInvoiceFinancials(
    invoiceId: string,
    overrides: { invoice?: Record<string, any>; lines?: Record<string, any>[]; payments?: Record<string, any>[] } = {},
  ) {
    const invoice = overrides.invoice || data.supplierInvoices.find((row: any) => row.id === invoiceId) as Record<string, any> | undefined;
    if (!invoice) return;
    const lines = overrides.lines || data.supplierInvoiceLines.filter((row: any) => row.supplier_invoice_id === invoiceId) as Record<string, any>[];
    const payments = overrides.payments || data.supplierInvoicePayments.filter((row: any) => row.supplier_invoice_id === invoiceId) as Record<string, any>[];
    const goodsAmount = Math.round(lines.reduce((sum, line) => sum + (Number(line.goods_amount) || ((Number(line.quantity) || 0) * (Number(line.unit_cost) || 0))), 0) * 100) / 100;
    const lineTax = lines.reduce((sum, line) => sum + (Number(line.tax_amount) || 0), 0);
    const netPayable = Math.round((goodsAmount + lineTax + (Number(invoice.tax_amount) || 0) - (Number(invoice.deductions_amount) || 0)) * 100) / 100;
    const paidAmount = Math.round(payments.filter((payment) => payment.status === 'Settled').reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0) * 100) / 100;
    const openPayable = Math.max(0, Math.round((netPayable - paidAmount) * 100) / 100);
    if (paidAmount > netPayable + 0.000001) throw new Error('Settled supplier payments exceed the approved supplier invoice amount.');
    const approved = ['Approved', 'Partially Paid', 'Paid'].includes(String(invoice.status || ''));
    const nextStatus = approved && paidAmount >= netPayable && netPayable > 0 ? 'Paid'
      : approved && paidAmount > 0 ? 'Partially Paid' : invoice.status;
    const headerPatch = { goods_amount: goodsAmount, net_payable_amount: netPayable, paid_amount: paidAmount, open_payable_amount: openPayable, status: nextStatus };
    const persistedInvoice = await dataRepository.update<Record<string, any>>('supplier_invoices', invoiceId, headerPatch);
    data.applyLocalMutation('supplier_invoices', { type: 'update', row: persistedInvoice });

    const existingForecast = data.cashFlow.find((row: any) => row.source_type === 'supplier_invoice_forecast' && row.source_id === invoiceId) as any;
    if (approved && openPayable > 0) {
      const row = { project_id: invoice.project_id, contract_id: invoice.contract_id || null, date: invoice.due_date || invoice.invoice_date || null, description: `Supplier invoice payable forecast: ${invoice.invoice_number || invoiceId}`, category: 'Supplier Payable', inflow: 0, outflow: openPayable, net: -openPayable, cumulative_balance: 0, movement_type: 'Forecast', status: 'Open', source_type: 'supplier_invoice_forecast', source_id: invoiceId };
      const saved = existingForecast ? await dataRepository.update<Record<string, any>>('cash_flow', existingForecast.id, row) : await dataRepository.insert<Record<string, any>>('cash_flow', row);
      data.applyLocalMutation('cash_flow', { type: existingForecast ? 'update' : 'insert', row: saved });
    } else if (existingForecast) {
      await dataRepository.delete('cash_flow', existingForecast.id); data.applyLocalMutation('cash_flow', { type: 'delete', id: existingForecast.id });
    }
    for (const payment of payments) {
      const existingCash = data.cashFlow.find((row: any) => row.source_type === 'supplier_invoice_payment' && row.source_id === payment.id) as any;
      if (payment.status === 'Settled') {
        const row = { project_id: invoice.project_id, contract_id: invoice.contract_id || null, date: payment.payment_date || null, description: `Supplier payment: ${invoice.invoice_number || invoiceId}`, category: 'Supplier Payment', inflow: 0, outflow: Number(payment.amount) || 0, net: -(Number(payment.amount) || 0), cumulative_balance: 0, movement_type: 'Actual', status: 'Settled', source_type: 'supplier_invoice_payment', source_id: payment.id };
        const saved = existingCash ? await dataRepository.update<Record<string, any>>('cash_flow', existingCash.id, row) : await dataRepository.insert<Record<string, any>>('cash_flow', row);
        data.applyLocalMutation('cash_flow', { type: existingCash ? 'update' : 'insert', row: saved });
      } else if (existingCash) {
        await dataRepository.delete('cash_flow', existingCash.id); data.applyLocalMutation('cash_flow', { type: 'delete', id: existingCash.id });
      }
    }
    const effectiveAllLines = overrides.lines
      ? [...data.supplierInvoiceLines.filter((line: any) => line.supplier_invoice_id !== invoiceId), ...lines]
      : data.supplierInvoiceLines;
    // PO forecast represents only the portion not covered by approved AP.
    for (const poId of new Set(lines.map((line) => String(line.procurement_id || '')).filter(Boolean))) {
      const po = data.procurement.find((row: any) => row.id === poId) as any;
      const forecast = data.cashFlow.find((row: any) => row.source_type === 'procurement_forecast' && row.source_id === poId) as any;
      if (!po || !forecast) continue;
      const approvedForPo = effectiveAllLines.filter((line: any) => line.procurement_id === poId).reduce((sum: number, line: any) => {
        const parent = line.supplier_invoice_id === invoiceId ? { ...invoice, status: nextStatus } : data.supplierInvoices.find((candidate: any) => candidate.id === line.supplier_invoice_id) as any;
        return ['Approved', 'Partially Paid', 'Paid'].includes(String(parent?.status || '')) ? sum + (Number(line.goods_amount) || 0) : sum;
      }, 0);
      const total = Number(po.total_cost) || ((Number(po.quantity) || 0) * (Number(po.unit_cost) || 0));
      const revised = Math.max(0, Math.round((total - approvedForPo) * 100) / 100);
      const saved = await dataRepository.update<Record<string, any>>('cash_flow', forecast.id, { ...forecast, outflow: revised, net: -revised, description: `Supplier payment forecast (open PO): ${po.purchase_order_number || po.id}` });
      data.applyLocalMutation('cash_flow', { type: 'update', row: saved });
    }
  }

  async function upsertRateHistory(entry: Record<string, any>) {
    const existing = data.rateHistory.find((row: any) => row.source_type === entry.source_type && row.source_id === entry.source_id) as any;
    if (existing) {
      const updated = await dataRepository.update<Record<string, any>>('rate_history', existing.id, entry);
      data.applyLocalMutation('rate_history', { type: 'update', row: updated });
    } else {
      const inserted = await dataRepository.insert<Record<string, any>>('rate_history', entry);
      data.applyLocalMutation('rate_history', { type: 'insert', row: inserted });
    }
  }

  async function syncProcurementRateHistory(procurement: Record<string, any>) {
    if (!procurement.supplier_party_id || !procurement.id) return;
    const item = data.boqItems.find((row: any) => row.id === procurement.boq_item_id) as any;
    const contract = data.contracts.find((row: any) => row.id === procurement.contract_id) as any;
    await upsertRateHistory({
      party_id: procurement.supplier_party_id,
      item_code: item?.item_code || procurement.item || '',
      item_description: item?.item_name || item?.description || procurement.item || '',
      unit: procurement.unit || item?.unit || '',
      unit_rate: Number(procurement.unit_cost) || 0,
      currency: procurement.currency || 'SAR',
      effective_date: procurement.delivery_date || procurement.order_date || null,
      source_project_id: procurement.project_id || contract?.project_id || null,
      source_contract_id: procurement.contract_id || null,
      source_reference: procurement.purchase_order_number || procurement.reference_number || procurement.id,
      source_type: 'procurement', source_id: procurement.id,
      status: 'Historical', notes: 'Generated from procurement.',
    });
  }

  async function syncSubcontractRateHistory(boqItem: Record<string, any>) {
    const header = data.boqHeaders.find((row: any) => row.id === boqItem.boq_header_id) as any;
    const subcontract = data.contracts.find((row: any) => row.id === header?.contract_id) as any;
    if (!subcontract?.parent_main_contract_id || !subcontract.contractor_party_id || !boqItem.id) return;
    await upsertRateHistory({
      party_id: subcontract.contractor_party_id,
      item_code: boqItem.item_code || '', item_description: boqItem.item_name || boqItem.description || '',
      unit: boqItem.unit || '', unit_rate: Number(boqItem.unit_rate) || 0, currency: 'SAR',
      effective_date: subcontract.signed_date || subcontract.start_date || null,
      source_project_id: subcontract.project_id || null, source_contract_id: subcontract.id,
      source_reference: subcontract.contract_number || subcontract.id,
      source_type: 'subcontract_boq', source_id: boqItem.id,
      status: 'Historical', notes: 'Generated from subcontract BOQ rate.',
    });
  }

  async function migrateLegacyParties(): Promise<void> {
    const normalize = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const candidates = new Map<string, { name: string; type: string }>();
    const register = (name: unknown, type: string) => {
      const key = normalize(name);
      if (!key || key === '-' || key === '—') return;
      const existing = candidates.get(key);
      // A client role is retained if the same legal party appears in more
      // than one legacy column; it is the least risky default for reporting.
      if (!existing || (type === 'Client' && existing.type !== 'Client')) candidates.set(key, { name: String(name).trim(), type });
    };
    data.projects.forEach((row: any) => { register(row.client, 'Client'); register(row.contractor, 'Contractor'); });
    data.contracts.forEach((row: any) => { register(row.client, 'Client'); register(row.contractor, row.parent_main_contract_id ? 'Subcontractor' : 'Contractor'); });
    data.procurement.forEach((row: any) => register(row.supplier, 'Supplier'));

    const partyByName = new Map(data.parties.map((party: any) => [normalize(party.legal_name), party]));
    let created = 0;
    for (const candidate of candidates.values()) {
      if (partyByName.has(normalize(candidate.name))) continue;
      const row = prepareCodeControlledInsert('parties', {
        ...createCodeDraft('parties', [...partyByName.values()]),
        legal_name: candidate.name, trading_name: candidate.name, party_type: candidate.type,
        status: 'Active', payment_terms_days: 0, tax_number: '', registration_number: '', phone: '', email: '', address: '', notes: 'Migrated from existing application records.',
      }, [...partyByName.values()]);
      const inserted = await dataRepository.insert<Record<string, any>>('parties', row);
      data.applyLocalMutation('parties', { type: 'insert', row: inserted });
      partyByName.set(normalize(inserted.legal_name), inserted);
      created += 1;
    }

    let linked = 0;
    for (const contract of data.contracts as Record<string, any>[]) {
      const clientParty = partyByName.get(normalize(contract.client));
      const contractorParty = partyByName.get(normalize(contract.contractor));
      const patch: Record<string, any> = {};
      if (clientParty && contract.client_party_id !== clientParty.id) patch.client_party_id = clientParty.id;
      if (contractorParty && contract.contractor_party_id !== contractorParty.id) patch.contractor_party_id = contractorParty.id;
      if (Object.keys(patch).length) {
        const updated = await dataRepository.update<Record<string, any>>('contracts', contract.id, patch);
        data.applyLocalMutation('contracts', { type: 'update', row: updated });
        linked += 1;
      }
    }
    for (const purchase of data.procurement as Record<string, any>[]) {
      const supplierParty = partyByName.get(normalize(purchase.supplier));
      if (supplierParty && purchase.supplier_party_id !== supplierParty.id) {
        const updated = await dataRepository.update<Record<string, any>>('procurement', purchase.id, { supplier_party_id: supplierParty.id });
        data.applyLocalMutation('procurement', { type: 'update', row: updated });
        linked += 1;
      }
    }
    alert(`Master Data migration completed: ${created} party record(s) created and ${linked} legacy record(s) linked. Original names were kept unchanged.`);
  }

  useEffect(() => {
    if (synchronizingLiveSubcontractCosts.current || data.wirEntries.length === 0) return;
    const synchronizeLiveSubcontractCosts = async () => {
      synchronizingLiveSubcontractCosts.current = true;
      try {
        // These rows were previously generated from subcontractor invoices.
        // They represent the same WIR work and would double-count the cost,
        // so only generated rows are replaced; manual expense rows are kept.
        for (const entry of data.costEntries.filter((item: any) => item.source_type === 'subcontractor_invoice')) {
          await dataRepository.delete('cost_entries', entry.id);
          data.applyLocalMutation('cost_entries', { type: 'delete', id: entry.id });
        }
        for (const wir of data.wirEntries) await syncSubcontractWirCost({ type: 'update', row: wir });
      } finally {
        synchronizingLiveSubcontractCosts.current = false;
      }
    };
    void synchronizeLiveSubcontractCosts().catch((error) =>
      console.error('Could not synchronize live subcontractor costs.', error),
    );
  }, [data.wirEntries, data.contracts, data.boqItems, data.boqHeaders, data.projects, data.costEntries]);

  useEffect(() => {
    const synchronizeOperationalSources = async () => {
      for (const row of data.procurement as Record<string, any>[]) await syncOperationalCost('procurement', { type: 'update', row });
      for (const row of data.laborDuty as Record<string, any>[]) await syncOperationalCost('labor_duty', { type: 'update', row });
      for (const row of data.equipment as Record<string, any>[]) await syncOperationalCost('equipment', { type: 'update', row });
    };
    if (data.contracts.length > 0 && data.boqItems.length > 0) {
      void synchronizeOperationalSources().catch((error) => console.error('Could not synchronize operational cost sources.', error));
    }
  }, [data.procurement, data.laborDuty, data.equipment, data.contracts, data.boqItems, data.boqHeaders]);

  useEffect(() => {
    if (data.parties.length === 0) return;
    void Promise.all([
      ...data.procurement.map((row: any) => syncProcurementRateHistory(row)),
      ...data.boqItems.map((row: any) => syncSubcontractRateHistory(row)),
    ]).catch((error) => console.error('Could not synchronize master-data rate history.', error));
  }, [data.parties, data.procurement, data.boqItems, data.boqHeaders, data.contracts]);

  useEffect(() => {
    if (synchronizingCostControl.current) return;
    const synchronizeCostControl = async () => {
      const entriesByItem = new Map<string, Record<string, any>[]>();
      const committedByItem = new Map<string, number>();
      const scheduleValuesByItem = new Map<string, { budget: number; planned: number }>();
      for (const entry of data.costEntries as Record<string, any>[]) {
        // The Cost Control table is by the main BOQ item. Entries without an
        // item remain valid expenses but cannot be assigned to a BOQ control
        // line until the user selects the relevant main item.
        if (!entry.project_id || !entry.contract_id || !entry.boq_item_id) continue;
        // Cost Control keeps one row per main BOQ item and aggregates every
        // expense type assigned to that item.
        const key = `${entry.project_id}|${entry.contract_id}|${entry.boq_item_id}`;
        entriesByItem.set(key, [...(entriesByItem.get(key) || []), entry]);
      }
      for (const wir of data.wirEntries as Record<string, any>[]) {
        const wirContract = data.contracts.find((contract: any) => contract.id === wir.contract_id) as any;
        if (!wirContract?.project_id) continue;
        const mainContractId = wirContract.parent_main_contract_id || wirContract.id;
        const selectedItem = data.boqItems.find((item: any) => item.id === wir.boq_item_id) as any;
        const mainItem = selectedItem?.main_boq_item_id
          ? data.boqItems.find((item: any) => item.id === selectedItem.main_boq_item_id) as any
          : selectedItem;
        if (!mainItem?.id) continue;
        const key = `${wirContract.project_id}|${mainContractId}|${mainItem.id}`;
        const earnedValue = (Number(wir.quantity) || 0) * (Number(mainItem.unit_rate) || 0);
        committedByItem.set(key, (committedByItem.get(key) || 0) + earnedValue);
      }
      for (const schedule of data.schedules as Record<string, any>[]) {
        const hasChildActivities = !String(schedule.activity || '').trim() && (data.schedules as Record<string, any>[])
          .some((candidate) => candidate.boq_item_id === schedule.boq_item_id && String(candidate.activity || '').trim());
        // A blank-activity row is the BOQ summary. Its figures are derived
        // from children and must never be counted again in Cost Control.
        if (hasChildActivities) continue;
        const scheduleContract = data.contracts.find((contract: any) => contract.id === schedule.contract_id) as any;
        if (!scheduleContract?.project_id) continue;
        const selectedItem = data.boqItems.find((item: any) => item.id === schedule.boq_item_id) as any;
        const mainItemId = selectedItem?.main_boq_item_id || selectedItem?.id;
        if (!mainItemId) continue;
        const key = `${scheduleContract.project_id}|${scheduleContract.parent_main_contract_id || scheduleContract.id}|${mainItemId}`;
        const previous = scheduleValuesByItem.get(key) || { budget: 0, planned: 0 };
        const activityBudget = scheduleBudget(schedule);
        const activityPlannedValue = distributedPlannedValueToDate(schedule, data.scheduleDistributions as Record<string, any>[]);
        scheduleValuesByItem.set(key, {
          budget: previous.budget + activityBudget,
          planned: previous.planned + activityPlannedValue,
        });
      }
      const knownKeys = new Set(entriesByItem.keys());
      committedByItem.forEach((_value, key) => knownKeys.add(key));
      scheduleValuesByItem.forEach((_value, key) => knownKeys.add(key));
      for (const cost of data.costs as Record<string, any>[]) {
        if (cost.project_id && cost.contract_id && cost.boq_item_id) {
          knownKeys.add(`${cost.project_id}|${cost.contract_id}|${cost.boq_item_id}`);
        }
      }
      if (knownKeys.size === 0) return;

      synchronizingCostControl.current = true;
      try {
        for (const key of knownKeys) {
          const entries = entriesByItem.get(key) || [];
          const [projectId, contractId, boqItemId] = key.split('|');
          const matchingControls = (data.costs as Record<string, any>[]).filter((cost) =>
            cost.project_id === projectId && cost.contract_id === contractId && cost.boq_item_id === boqItemId,
          );
          // Historical versions could create more than one control row for
          // the same item. The first is retained; the rest are removed as
          // obsolete generated duplicates during this repair.
          const existing = matchingControls[0];
          const latest = entries[entries.length - 1];
          const categories = [...new Set(entries.map((entry) => entry.cost_type || 'Other'))];
          const costCategory = categories.length > 1 ? 'Multiple Cost Types' : (categories[0] || existing?.category || 'Other');
          const mainItem = data.boqItems.find((item: any) => item.id === boqItemId) as any;
          const mainHeader = data.boqHeaders.find((header: any) => header.id === mainItem?.boq_header_id) as any;
          const mainContract = data.contracts.find((contract: any) => contract.id === contractId) as any;
          const actual = Math.round(entries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0) * 100) / 100;
          const committed = Math.round((committedByItem.get(key) || 0) * 100) / 100;
          const scheduleValues = scheduleValuesByItem.get(key);
          const budget = Math.round((scheduleValues?.budget ?? (Number(existing?.budget) || 0)) * 100) / 100;
          const planned = Math.round((scheduleValues?.planned ?? (Number(existing?.planned) || 0)) * 100) / 100;
          const cpi = actual > 0 ? committed / actual : null;
          const spi = planned > 0 ? committed / planned : null;
          const costState = actual <= budget ? 'Under Budget' : 'Over Budget';
          const scheduleState = spi === null ? 'No Planned Value' : spi >= 1 ? 'Ahead of Schedule' : 'Behind Schedule';
          const evmStatus = `${costState} | ${scheduleState} | CPI ${cpi === null ? 'N/A' : cpi.toFixed(2)} | SPI ${spi === null ? 'N/A' : spi.toFixed(2)}`;
          const control = {
            project_id: projectId,
            project_code: latest?.project_code || existing?.project_code || '',
            contract_id: contractId,
            main_contract_id: contractId,
            boq_header_id: mainItem?.boq_header_id || latest?.boq_header_id || existing?.boq_header_id || null,
            boq_item_id: boqItemId,
            item_code: mainItem?.item_code || latest?.boq_item_code || existing?.item_code || '',
            boq_item_code: mainItem?.item_code || latest?.boq_item_code || existing?.boq_item_code || '',
            boq_item_name: mainItem?.item_name || mainItem?.description || latest?.boq_item_name || existing?.boq_item_name || '',
            // These describe the controlled main-contract BOQ line, never
            // the latest expense supplier/subcontractor.
            company_name: mainContract?.contractor || mainHeader?.company_name || existing?.company_name || '',
            // Do not let the latest entry overwrite the classification when
            // the same BOQ item has more than one type of expense.
            category: costCategory,
            description: mainItem?.description || mainItem?.item_name || existing?.description || '',
            budget,
            planned,
            // Earned work: all WIR quantities at the main-contract BOQ rate.
            // Subcontract work is therefore loaded at the main rate here.
            committed,
            actual,
            status: evmStatus,
            cost_cpi: cpi,
            schedule_spi: spi,
            notes: existing?.notes || '',
          };
          if (existing) {
            const changed = Object.entries(control).some(([field, value]) => (existing[field] ?? null) !== (value ?? null));
            if (changed) {
              const updated = await dataRepository.update<Record<string, any>>('costs', existing.id, control);
              data.applyLocalMutation('costs', { type: 'update', row: updated });
            }
          } else {
            const inserted = await dataRepository.insert<Record<string, any>>('costs', control);
            data.applyLocalMutation('costs', { type: 'insert', row: inserted });
          }
          for (const duplicate of matchingControls.slice(1)) {
            await dataRepository.delete('costs', duplicate.id);
            data.applyLocalMutation('costs', { type: 'delete', id: duplicate.id });
          }
        }
      } finally {
        synchronizingCostControl.current = false;
      }
    };
    void synchronizeCostControl().catch((error) =>
      console.error('Could not synchronize cost control.', error),
    );
  }, [data.costEntries, data.wirEntries, data.schedules, data.boqItems, data.boqHeaders, data.contracts]);

  useEffect(() => {
    if (synchronizingProjectFinancials.current || data.projects.length === 0) return;
    const synchronizeProjectFinancials = async () => {
      synchronizingProjectFinancials.current = true;
      try {
        for (const project of data.projects as Record<string, any>[]) {
          const budget = Math.round((data.schedules as Record<string, any>[])
            .filter((schedule) => schedule.project_id === project.id)
            .filter((schedule) => !(!String(schedule.activity || '').trim() && (data.schedules as Record<string, any>[])
              .some((candidate) => candidate.boq_item_id === schedule.boq_item_id && String(candidate.activity || '').trim())))
            .reduce((sum, schedule) => sum + scheduleBudget(schedule), 0) * 100) / 100;
          const spent = Math.round((data.costs as Record<string, any>[])
            .filter((cost) => cost.project_id === project.id)
            .reduce((sum, cost) => sum + (Number(cost.actual) || 0), 0) * 100) / 100;
          if ((Number(project.budget) || 0) === budget && (Number(project.spent) || 0) === spent) continue;
          const updated = await dataRepository.update<Record<string, any>>('projects', project.id, { budget, spent });
          data.applyLocalMutation('projects', { type: 'update', row: updated });
        }
      } finally {
        synchronizingProjectFinancials.current = false;
      }
    };
    void synchronizeProjectFinancials().catch((error) =>
      console.error('Could not synchronize project financial values.', error),
    );
  }, [data.projects, data.schedules, data.costs]);

  // A main contract creates and owns its project. Keeping their reporting
  // dates aligned prevents WIRs from being excluded when either record is
  // updated later.
  async function syncMainContractProjectDates(mutation: { type: string; row?: Record<string, any> }) {
    if (mutation.type !== 'update' || !mutation.row) return;
    const contract = mutation.row;
    if (contract.parent_main_contract_id || !contract.project_id) return;
    const project = data.projects.find((item: any) => item.id === contract.project_id) as Record<string, any> | undefined;
    if (!project) return;
    const patch: Record<string, any> = {};
    if ((project.start_date || null) !== (contract.start_date || null)) patch.start_date = contract.start_date || null;
    if ((project.end_date || null) !== (contract.end_date || null)) patch.end_date = contract.end_date || null;
    if (Object.keys(patch).length === 0) return;
    const updatedProject = await dataRepository.update<Record<string, any>>('projects', project.id, patch);
    data.applyLocalMutation('projects', { type: 'update', row: updatedProject });
  }

  async function createInvoiceFromWir(
    invoiceTable: 'client_invoices' | 'subcontractor_invoices',
    draft: Record<string, any>,
  ): Promise<Record<string, any>[]> {
    const contract = data.contracts.find((item: any) => item.id === draft.contract_id) as any;
    if (!contract) throw new Error('Select a contract before creating the invoice.');
    if (!draft.from_date || !draft.to_date || !draft.result) {
      throw new Error('Select From Date, To Date, and WIR Result.');
    }
    if (String(draft.from_date) > String(draft.to_date)) throw new Error('From Date cannot be after To Date.');
    const isSubcontract = Boolean(contract.parent_main_contract_id);
    if (invoiceTable === 'client_invoices' && isSubcontract) throw new Error('Client invoices are created from main-contract WIRs only.');
    if (invoiceTable === 'subcontractor_invoices' && !isSubcontract) throw new Error('Subcontractor invoices are created from subcontract WIRs only.');
    const existingInvoices = invoiceTable === 'client_invoices' ? data.clientInvoices : data.subInvoices;
    if (existingInvoices.some((row: any) => row.contract_id === contract.id && row.invoice_number === draft.invoice_number)) {
      throw new Error(`Invoice number ${draft.invoice_number} already exists for this contract. Use a new invoice number.`);
    }

    const matchingWirs = data.wirEntries.filter((wir: any) =>
      wir.contract_id === contract.id &&
      wir.result === draft.result &&
      String(wir.inspection_date || '') >= String(draft.from_date) &&
      String(wir.inspection_date || '') <= String(draft.to_date),
    );
    if (matchingWirs.length === 0) throw new Error('No WIR records match the selected contract, date range, and result.');

    const groups = new Map<string, any[]>();
    matchingWirs.forEach((wir: any) => {
      if (!wir.boq_item_id) return;
      groups.set(wir.boq_item_id, [...(groups.get(wir.boq_item_id) || []), wir]);
    });
    if (groups.size === 0) throw new Error('The selected WIR records do not contain BOQ items.');

    const project = data.projects.find((item: any) => item.id === contract.project_id) as any;
    const rows = [...groups.entries()].map(([boqItemId, wirs]) => {
      const item = data.boqItems.find((entry: any) => entry.id === boqItemId) as any;
      if (!item) throw new Error('A WIR references a missing BOQ item.');
      const firstWir = wirs[0];
      const quantity = wirs.reduce((sum: number, wir: any) => sum + (Number(wir.quantity) || 0), 0);
      const unitRate = invoiceTable === 'client_invoices'
        ? (Number(firstWir.unit_price) || 0)
        : (Number(item.unit_rate) || 0);
      return {
        invoice_number: draft.invoice_number,
        project_id: contract.project_id,
        project_code: project?.project_code || draft.project_code || '',
        contract_id: contract.id,
        main_contract_id: isSubcontract ? contract.parent_main_contract_id : contract.id,
        boq_header_id: item.boq_header_id || null,
        boq_item_id: item.id,
        boq_code: item.boq_code || '',
        boq_item_code: item.item_code || '',
        item_desc: item.item_name || item.description || '',
        unit: item.unit || '',
        quantity,
        unit_rate: unitRate,
        amount: Math.round(quantity * unitRate * 100) / 100,
        invoice_date: draft.to_date,
        source_from_date: draft.from_date,
        source_to_date: draft.to_date,
        source_wir_result: draft.result,
        status: 'Generated',
        payment_status: 'Unpaid',
        ...(invoiceTable === 'client_invoices'
          ? { client: contract.client || '' }
          : { subcontractor: contract.contractor || '' }),
      };
    });
    const inserted = await dataRepository.insertMany<Record<string, any>>(invoiceTable, rows);
    await consolidateInvoiceTracking(invoiceTable, inserted);
    return inserted;
  }

  async function consolidateInvoiceTracking(
    invoiceTable: 'client_invoices' | 'subcontractor_invoices',
    invoiceRows: Record<string, any>[],
  ): Promise<void> {
    if (invoiceRows.length === 0) return;
    const trackingTable = invoiceTable === 'client_invoices'
      ? 'client_invoice_tracking'
      : 'subcontractor_invoice_tracking';
    const invoiceNumber = invoiceRows[0].invoice_number;
    const existingTracking = await dataRepository.list<Record<string, any>>(trackingTable);
    for (const trackingRow of existingTracking.filter((row) => row.invoice_number === invoiceNumber)) {
      await dataRepository.delete(trackingTable, trackingRow.id);
    }
    const totalWorkValue = invoiceRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const first = invoiceRows[0];
    const contract = data.contracts.find((row: any) => row.id === first.contract_id) as any;
    const partyId = invoiceTable === 'client_invoices' ? contract?.client_party_id : contract?.contractor_party_id;
    const party = data.parties.find((row: any) => row.id === partyId) as any;
    const dueDate = dueDateFromTerms(first.invoice_date || null, party?.payment_terms_days);
    await dataRepository.insert<Record<string, any>>(trackingTable, {
      id: crypto.randomUUID(),
      invoice_id: null,
      invoice_number: invoiceNumber,
      project_id: first.project_id,
      project_code: first.project_code || '',
      contract_id: first.contract_id,
      invoice_date: first.invoice_date || null,
      due_date: dueDate,
      status: 'Generated',
      payment_status: 'Unpaid',
      payment_date: null,
      total_work_value: totalWorkValue,
      notes: '',
    });
  }

  async function deleteInvoiceGroup(
    invoiceTable: 'client_invoices' | 'subcontractor_invoices',
    invoiceRow: Record<string, any>,
  ): Promise<Record<string, any>[]> {
    const invoiceRows = (invoiceTable === 'client_invoices' ? data.clientInvoices : data.subInvoices)
      .filter((row: any) => row.invoice_number === invoiceRow.invoice_number) as Record<string, any>[];
    for (const row of invoiceRows) await dataRepository.delete(invoiceTable, row.id);
    const trackingTable = invoiceTable === 'client_invoices'
      ? 'client_invoice_tracking'
      : 'subcontractor_invoice_tracking';
    const trackingRows = await dataRepository.list<Record<string, any>>(trackingTable);
    for (const row of trackingRows.filter((tracking) => tracking.invoice_number === invoiceRow.invoice_number)) {
      await dataRepository.delete(trackingTable, row.id);
    }
    if (invoiceTable === 'client_invoices') await data.reloadInvoiceTracking('client_invoice_tracking');
    else await data.reloadInvoiceTracking('subcontractor_invoice_tracking');
    return invoiceRows;
  }

  async function updateInvoiceTrackingAndCash(
    trackingTable: 'client_invoice_tracking' | 'subcontractor_invoice_tracking',
    trackingId: string,
    patch: Record<string, any>,
  ): Promise<Record<string, any>> {
    const trackingRows = trackingTable === 'client_invoice_tracking'
      ? data.clientInvoiceTracking as Record<string, any>[]
      : data.subcontractorInvoiceTracking as Record<string, any>[];
    const current = trackingRows.find((row) => row.id === trackingId);
    if (!current) throw new Error('The invoice tracking record no longer exists. Refresh and try again.');
    const updatedTracking = { ...current, ...patch };
    const invoiceTable = trackingTable === 'client_invoice_tracking' ? 'client_invoices' : 'subcontractor_invoices';
    const invoiceRows = (invoiceTable === 'client_invoices' ? data.clientInvoices : data.subInvoices)
      .filter((row: any) => row.invoice_number === updatedTracking.invoice_number) as Record<string, any>[];
    if (!updatedTracking.due_date) {
      const contract = data.contracts.find((row: any) => row.id === updatedTracking.contract_id) as any;
      const partyId = trackingTable === 'client_invoice_tracking' ? contract?.client_party_id : contract?.contractor_party_id;
      const party = data.parties.find((row: any) => row.id === partyId) as any;
      updatedTracking.due_date = dueDateFromTerms(updatedTracking.invoice_date || invoiceRows[0]?.invoice_date || null, party?.payment_terms_days);
    }

    // Invoice tracking is the commercial control point. Keep every generated
    // line for the invoice aligned with the single tracking decision.
    for (const invoiceRow of invoiceRows) {
      const updatedInvoice = await dataRepository.update<Record<string, any>>(invoiceTable, invoiceRow.id, {
        status: updatedTracking.status,
        payment_status: updatedTracking.payment_status,
        payment_date: updatedTracking.payment_date || null,
        due_date: updatedTracking.due_date || null,
      });
      data.applyLocalMutation(invoiceTable, { type: 'update', row: updatedInvoice });
    }

    const sourcePrefix = trackingTable === 'client_invoice_tracking' ? 'client_invoice' : 'subcontractor_invoice';
    const invoiceNumber = String(updatedTracking.invoice_number);
    const amount = Number(updatedTracking.total_work_value) || invoiceRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const isClient = trackingTable === 'client_invoice_tracking';
    const cashRows = (movementType: 'Forecast' | 'Actual', date: string, status: string) => ({
      project_id: updatedTracking.project_id, contract_id: updatedTracking.contract_id, date,
      description: `${movementType === 'Forecast' ? (isClient ? 'Client receipt forecast' : 'Subcontractor payment forecast') : (isClient ? 'Client invoice received' : 'Subcontractor invoice paid')}: ${invoiceNumber}`,
      category: isClient ? (movementType === 'Forecast' ? 'Client Receivable' : 'Client Receipt') : (movementType === 'Forecast' ? 'Subcontractor Payable' : 'Subcontractor Payment'),
      inflow: isClient ? amount : 0, outflow: isClient ? 0 : amount, net: isClient ? amount : -amount,
      cumulative_balance: 0, movement_type: movementType, status,
      source_type: `${sourcePrefix}_${movementType.toLowerCase()}`, source_id: invoiceNumber,
    });
    const upsertCash = async (movementType: 'Forecast' | 'Actual', date: string, status: string) => {
      const sourceType = `${sourcePrefix}_${movementType.toLowerCase()}`;
      const existing = data.cashFlow.find((row: any) => row.source_type === sourceType && String(row.source_id) === invoiceNumber) as any;
      const cashRow = cashRows(movementType, date, status);
      if (existing) {
        const updatedCash = await dataRepository.update<Record<string, any>>('cash_flow', existing.id, cashRow);
        data.applyLocalMutation('cash_flow', { type: 'update', row: updatedCash });
      } else {
        const insertedCash = await dataRepository.insert<Record<string, any>>('cash_flow', cashRow);
        data.applyLocalMutation('cash_flow', { type: 'insert', row: insertedCash });
      }
    };
    const removeCash = async (movementType: 'Forecast' | 'Actual') => {
      const sourceType = `${sourcePrefix}_${movementType.toLowerCase()}`;
      const existing = data.cashFlow.find((row: any) => row.source_type === sourceType && String(row.source_id) === invoiceNumber) as any;
      if (existing) { await dataRepository.delete('cash_flow', existing.id); data.applyLocalMutation('cash_flow', { type: 'delete', id: existing.id }); }
    };
    // Replace the pre-ledger row format from the previous release if it exists.
    const legacy = data.cashFlow.find((row: any) => row.source_type === sourcePrefix && String(row.source_id) === invoiceNumber) as any;
    if (legacy) { await dataRepository.delete('cash_flow', legacy.id); data.applyLocalMutation('cash_flow', { type: 'delete', id: legacy.id }); }
    if (updatedTracking.payment_status === 'Paid') {
      await removeCash('Forecast');
      await upsertCash('Actual', updatedTracking.payment_date, 'Settled');
    } else {
      await removeCash('Actual');
      if (updatedTracking.status === 'Approved') await upsertCash('Forecast', updatedTracking.due_date || updatedTracking.invoice_date, 'Open');
      else await removeCash('Forecast');
    }

    return dataRepository.update<Record<string, any>>(trackingTable, trackingId, patch);
  }

  async function removeStandaloneCertificateCash(certificateId: string) {
    const generated = data.cashFlow.filter((row: any) =>
      ['payment_certificate_forecast', 'payment_certificate_actual'].includes(String(row.source_type || ''))
      && String(row.source_id || '') === certificateId,
    ) as Record<string, any>[];
    for (const row of generated) {
      await dataRepository.delete('cash_flow', row.id);
      data.applyLocalMutation('cash_flow', { type: 'delete', id: row.id, row });
    }
  }

  /** A certificate without an invoice-register link is still a governed
   * commercial event. It produces exactly one Forecast or Actual cash row,
   * never both, and is removed when the certificate is no longer approved. */
  async function synchronizeStandaloneCertificateCash(certificate: Record<string, any>) {
    await removeStandaloneCertificateCash(String(certificate.id || ''));
    const movementType = certificateCashStatus(certificate);
    if (!movementType) return;
    const values = calculateCertificateValues(certificate);
    const direction = certificateCashDirection(certificate);
    const date = movementType === 'Actual'
      ? certificate.payment_date || certificate.certificate_date || certificate.approved_date
      : certificate.certificate_date || certificate.approved_date;
    if (!date) throw new Error('An approved payment certificate requires a certificate or approval date for Cash Flow.');
    const row = {
      project_id: certificate.project_id,
      contract_id: certificate.contract_id,
      date,
      description: `${movementType === 'Actual' ? 'Payment certificate settled' : 'Payment certificate forecast'}: ${certificate.certificate_number || certificate.id}`,
      category: direction === 'Inflow' ? 'Client Receipt' : 'Subcontractor Payment',
      inflow: direction === 'Inflow' ? values.net_certified_value : 0,
      outflow: direction === 'Outflow' ? values.net_certified_value : 0,
      net: direction === 'Inflow' ? values.net_certified_value : -values.net_certified_value,
      cumulative_balance: 0,
      movement_type: movementType,
      status: movementType === 'Actual' ? 'Settled' : 'Open',
      source_type: `payment_certificate_${movementType.toLowerCase()}`,
      source_id: certificate.id,
    };
    const inserted = await dataRepository.insert<Record<string, any>>('cash_flow', row);
    data.applyLocalMutation('cash_flow', { type: 'insert', row: inserted });
  }

  /** A certificate approves or settles its selected invoice register row. The
   * invoice register remains the single writer to Cash Flow when linked, so a
   * certificate can never create a duplicate receipt/payment movement. */
  async function synchronizeCertificateToInvoiceTracking(certificate: Record<string, any>) {
    if (!certificate.invoice_tracking_id) {
      await synchronizeStandaloneCertificateCash(certificate);
      return;
    }
    await removeStandaloneCertificateCash(String(certificate.id || ''));
    if (!['Approved', 'Paid'].includes(String(certificate.status || ''))) return;
    const trackingTable = certificate.certificate_type === 'Client'
      ? 'client_invoice_tracking' as const
      : 'subcontractor_invoice_tracking' as const;
    const trackingRows = trackingTable === 'client_invoice_tracking'
      ? data.clientInvoiceTracking as Record<string, any>[]
      : data.subcontractorInvoiceTracking as Record<string, any>[];
    const tracking = trackingRows.find((row) => row.id === certificate.invoice_tracking_id);
    if (!tracking) throw new Error('The selected invoice register row no longer exists.');
    const patch = certificate.status === 'Paid'
      ? { status: 'Approved', payment_status: 'Paid', payment_date: certificate.payment_date || certificate.certificate_date || certificate.approved_date || null }
      : { status: 'Approved' };
    const updated = await updateInvoiceTrackingAndCash(trackingTable, tracking.id, patch);
    data.applyLocalMutation(trackingTable, { type: 'update', row: updated });
  }

  function previewInvoiceWithTemplate(invoiceTable: 'client_invoices' | 'subcontractor_invoices', invoiceRow: Record<string, any>) {
    const reportType = invoiceTable === 'client_invoices' ? 'Client Invoice' : 'Subcontractor Invoice';
    const templates = data.reportTemplates.filter((template: any) => template.report_type === reportType) as Record<string, any>[];
    if (templates.length === 0) { alert(`Create a ${reportType} template first in Report Templates.`); return; }
    let template = templates[0];
    if (templates.length > 1) {
      const choices = templates.map((item, index) => `${index + 1}. ${item.template_name}`).join('\n');
      const choice = Number(window.prompt(`Choose a template:\n${choices}`, '1'));
      if (!Number.isInteger(choice) || choice < 1 || choice > templates.length) return;
      template = templates[choice - 1];
    }
    const rows = (invoiceTable === 'client_invoices' ? data.clientInvoices : data.subInvoices)
      .filter((row: any) => row.invoice_number === invoiceRow.invoice_number) as Record<string, any>[];
    if (rows.length === 0) { alert('Invoice lines could not be found.'); return; }
    const contract = data.contracts.find((item: any) => item.id === invoiceRow.contract_id) as any;
    const project = data.projects.find((item: any) => item.id === invoiceRow.project_id) as any;
    const fields = new Set<string>(template.selected_fields || []);
    const total = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const esc = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char));
    const money = (value: unknown) => Number(value || 0).toLocaleString(undefined, { style: 'currency', currency: 'SAR', maximumFractionDigits: 2 });
    const headerValues: Record<string, unknown> = {
      'Invoice Number': invoiceRow.invoice_number, Project: `${project?.project_code || ''} ${project?.name || ''}`.trim(), Contract: contract?.contract_number || '',
      Client: contract?.client || invoiceRow.client || '', Subcontractor: contract?.contractor || invoiceRow.subcontractor || '',
      Period: `${invoiceRow.source_from_date || ''} — ${invoiceRow.source_to_date || ''}`, 'Payment Status': invoiceRow.payment_status || 'Unpaid', 'Grand Total': money(total),
    };
    const header = [...fields].filter((field) => headerValues[field] !== undefined).map((field) => `<div class="meta"><span>${esc(field)}</span><strong>${esc(headerValues[field])}</strong></div>`).join('');
    const lineFields = ['BOQ Item Code', 'Description', 'Unit', 'Quantity', 'Unit Rate', 'Amount'].filter((field) => fields.has(field));
    const valueFor = (row: Record<string, any>, field: string) => ({
      'BOQ Item Code': row.boq_item_code || row.boq_item_id, Description: row.item_desc || '', Unit: row.unit || '', Quantity: Number(row.quantity || 0).toLocaleString(), 'Unit Rate': money(row.unit_rate), Amount: money(row.amount),
    }[field] || '');
    const table = lineFields.length ? `<table><thead><tr>${lineFields.map((field) => `<th>${esc(field)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${lineFields.map((field) => `<td>${esc(valueFor(row, field))}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '';
    const signatures = template.show_signatures ? '<div class="signatures"><div>Prepared by</div><div>Reviewed by</div><div>Approved by</div></div>' : '';
    const generated = template.show_generated_at ? `<span>Generated ${new Date().toLocaleString()}</span>` : '';
    const win = window.open('', '_blank', 'width=1100,height=800');
    if (!win) { alert('Allow pop-ups to preview the invoice.'); return; }
    win.document.write(`<!doctype html><html><head><title>${esc(template.template_name)}</title><style>@page{size:${esc(template.page_size || 'A4')} ${esc(template.orientation || 'portrait')};margin:16mm}body{font-family:Arial,sans-serif;margin:38px;color:#1f2937}.head{display:flex;gap:20px;align-items:center;border-bottom:4px solid ${esc(template.accent_color || '#2563eb')};padding-bottom:18px}.logo{max-width:130px;max-height:80px;object-fit:contain}.title{font-size:27px;font-weight:700}.sub{color:#6b7280;margin-top:6px}.meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:24px 0}.meta{border:1px solid #d1d5db;border-radius:7px;padding:9px}.meta span{display:block;font-size:11px;color:#6b7280}.meta strong{display:block;margin-top:3px;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:20px}th{background:${esc(template.accent_color || '#2563eb')};color:white;text-align:left;padding:9px;font-size:12px}td{border:1px solid #d1d5db;padding:9px;font-size:12px}footer{display:flex;justify-content:space-between;margin-top:28px;border-top:1px solid #d1d5db;padding-top:10px;color:#6b7280;font-size:11px}.signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:30px;margin-top:70px}.signatures div{border-top:1px solid #64748b;padding-top:8px;text-align:center;font-size:12px}@media print{body{margin:0}}</style></head><body><div class="head">${template.logo_data_url ? `<img class="logo" src="${template.logo_data_url}"/>` : ''}<div><div class="title">${esc(template.title || template.template_name)}</div><div class="sub">${esc(template.subtitle)}</div></div></div><div class="meta-grid">${header}</div>${table}${signatures}<footer><span>${esc(template.footer_text || '')}</span>${generated}</footer></body></html>`);
    win.document.close();
  }

  function previewRecordWithTemplate(reportType: 'WIR' | 'Variation Order' | 'Cost Report' | 'Cash Forecast', row: Record<string, any>) {
    const templates = data.reportTemplates.filter((template: any) => template.report_type === reportType) as Record<string, any>[];
    if (templates.length === 0) { alert(`Create a ${reportType} template first in Report Templates.`); return; }
    let template = templates[0];
    if (templates.length > 1) {
      const choices = templates.map((item, index) => `${index + 1}. ${item.template_name}`).join('\n');
      const choice = Number(window.prompt(`Choose a template:\n${choices}`, '1'));
      if (!Number.isInteger(choice) || choice < 1 || choice > templates.length) return;
      template = templates[choice - 1];
    }
    const contract = data.contracts.find((item: any) => item.id === row.contract_id) as any;
    const project = data.projects.find((item: any) => item.id === row.project_id) as any;
    const item = data.boqItems.find((entry: any) => entry.id === row.boq_item_id) as any;
    const esc = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char));
    const money = (value: unknown) => Number(value || 0).toLocaleString(undefined, { style: 'currency', currency: 'SAR', maximumFractionDigits: 2 });
    const projectName = `${project?.project_code || row.project_code || ''} ${project?.name || ''}`.trim();
    const common = { Project: projectName, Contract: contract?.contract_number || row.contract_number || '' };
    const values: Record<string, unknown> = reportType === 'WIR' ? {
      ...common, 'WIR Number': row.wir_number || row.request_number || row.id, Contractor: contract?.contractor || row.contractor || '',
      'BOQ Item Code': row.boq_item_code || item?.item_code || '', Description: row.item_description || item?.item_name || item?.description || '', Unit: row.unit || item?.unit || '',
      Quantity: Number(row.quantity || 0).toLocaleString(), 'Unit Price': money(row.unit_price), Amount: money(row.item_amount || (Number(row.quantity) || 0) * (Number(row.unit_price) || 0)),
      'Inspection Date': row.inspection_date || '', Result: row.result || row.status || '', Inspector: row.inspector || '',
    } : reportType === 'Variation Order' ? {
      ...common, 'Variation Number': row.variation_number || row.code || row.id, Title: row.title || '', Description: row.description || '',
      'Cost Impact': money(row.cost_impact), 'Time Impact': `${Number(row.time_impact_days || 0).toLocaleString()} days`, Status: row.status || '', 'Approved By': row.approved_by || '', 'Approved Date': row.approved_date || '',
    } : reportType === 'Cost Report' ? {
      ...common, 'BOQ Item Code': row.boq_item_code || item?.item_code || '', Description: row.description || item?.item_name || item?.description || '',
      Budget: money(row.budget), 'Planned Value': money(row.planned), 'Actual Cost': money(row.actual), 'Earned Value': money(row.committed),
      CPI: Number(row.actual || 0) > 0 ? (Number(row.committed || 0) / Number(row.actual || 0)).toFixed(2) : '—',
      SPI: Number(row.planned || 0) > 0 ? (Number(row.committed || 0) / Number(row.planned || 0)).toFixed(2) : '—',
    } : {
      ...common, Date: row.date || '', Category: row.category || '', 'Movement Type': row.movement_type || '', Inflow: money(row.inflow), Outflow: money(row.outflow),
      Net: money(row.net ?? (Number(row.inflow || 0) - Number(row.outflow || 0))), 'Cumulative Balance': money(row.cumulative_balance), Status: row.status || '',
    };
    const selected = (template.selected_fields || []).filter((field: string) => values[field] !== undefined);
    const detailRows = selected.map((field: string) => `<tr><td>${esc(field)}</td><td>${esc(values[field])}</td></tr>`).join('');
    const win = window.open('', '_blank', 'width=900,height=760');
    if (!win) { alert('Allow pop-ups to preview the report.'); return; }
    const accent = esc(template.accent_color || '#2563eb');
    win.document.write(`<!doctype html><html><head><title>${esc(template.template_name)}</title><style>body{font-family:Arial,sans-serif;margin:38px;color:#1f2937}.head{display:flex;gap:20px;align-items:center;border-bottom:4px solid ${accent};padding-bottom:18px}.logo{max-width:130px;max-height:80px;object-fit:contain}.title{font-size:27px;font-weight:700}.sub{color:#6b7280;margin-top:6px}table{width:100%;border-collapse:collapse;margin-top:28px}td{border:1px solid #d1d5db;padding:10px;font-size:13px}td:first-child{width:42%;font-weight:600;background:#f9fafb}footer{margin-top:28px;border-top:1px solid #d1d5db;padding-top:10px;color:#6b7280;font-size:11px}</style></head><body><div class="head">${template.logo_data_url ? `<img class="logo" src="${template.logo_data_url}"/>` : ''}<div><div class="title">${esc(template.title || template.template_name)}</div><div class="sub">${esc(template.subtitle)}</div></div></div><table>${detailRows}</table><footer>${esc(template.footer_text || '')}</footer></body></html>`);
    win.document.close();
  }

  function renderView() {
    if (activeView === 'reportTemplates') {
      return <ReportTemplateDesigner templates={data.reportTemplates} onMutated={(mutation) => data.applyLocalMutation('report_templates', mutation)} />;
    }
    if (activeView === 'dataEntry') {
      return <DataEntryWorkspace projects={data.projects as Record<string, any>[]} contracts={data.contracts as Record<string, any>[]} boqHeaders={data.boqHeaders as Record<string, any>[]} boqItems={data.boqItems as Record<string, any>[]} schedules={data.schedules as Record<string, any>[]} wirs={data.wirEntries as Record<string, any>[]} costEntries={data.costEntries as Record<string, any>[]} onOpen={setActiveView} />;
    }
    if (activeView === 'insights') {
      return <PmoInsights
        projects={data.projects as Record<string, any>[]}
        contracts={data.contracts as Record<string, any>[]}
        schedules={data.schedules as Record<string, any>[]}
        costs={data.costs as Record<string, any>[]}
        variations={data.variations as Record<string, any>[]}
        clientInvoiceTracking={data.clientInvoiceTracking as Record<string, any>[]}
        subcontractorInvoiceTracking={data.subcontractorInvoiceTracking as Record<string, any>[]}
        rfis={data.rfis as Record<string, any>[]}
        quality={data.quality as Record<string, any>[]}
        onNavigate={setActiveView}
      />;
    }
    if (activeView === 'workQueue') {
      return <WorkQueue approvals={data.approvals as Record<string, any>[]} tasks={data.tasks as Record<string, any>[]} clientInvoices={data.clientInvoiceTracking as Record<string, any>[]} subInvoices={data.subcontractorInvoiceTracking as Record<string, any>[]} rfis={data.rfis as Record<string, any>[]} submittals={data.submittals as Record<string, any>[]} documents={data.documents as Record<string, any>[]} quality={data.quality as Record<string, any>[]} dailyReports={data.siteDailyReports as Record<string, any>[]} onNavigate={setActiveView} />;
    }
    if (activeView === 'auditLog') {
      return <AuditTrailExplorer records={data.auditLog as Record<string, any>[]} />;
    }
    if (activeView === 'reportPack') {
      return (
        <ReportPack
          projects={data.projects as Record<string, any>[]}
          contracts={data.contracts as Record<string, any>[]}
          variations={data.variations as Record<string, any>[]}
          schedules={data.schedules as Record<string, any>[]}
          wirs={data.wirEntries as Record<string, any>[]}
          cashFlow={data.cashFlow as Record<string, any>[]}
          costEntries={data.costEntries as Record<string, any>[]}
          scheduleDistributions={data.scheduleDistributions as Record<string, any>[]}
          boqItems={data.boqItems as Record<string, any>[]}
          baselines={data.baselines as Record<string, any>[]}
          controlAccounts={data.controlAccounts as Record<string, any>[]}
          contractSovLines={data.contractSovLines as Record<string, any>[]}
          procurement={data.procurement as Record<string, any>[]}
          procurementReceipts={data.procurementReceipts as Record<string, any>[]}
        />
      );
    }
    if (activeView === 'help') {
      return <HelpCenter onNavigate={setActiveView} />;
    }
    if (activeView === 'preferences') {
      return <PreferencesPanel destinations={NAV_ITEMS.map(({ key, label }) => ({ key, label }))} onSaved={setActiveView} mode={workspaceMode} onModeSaved={(mode) => { setWorkspaceMode(mode); setFocusMode(mode === 'focus'); }} />;
    }
    if (activeView === 'dashboard') {
      return (
        <Dashboard
          projects={data.projects}
          tasks={data.tasks}
          costs={data.costs}
          costEntries={data.costEntries}
          procurement={data.procurement}
          procurementReceipts={data.procurementReceipts}
          safety={data.safety}
          progress={data.progress}
          schedules={data.schedules}
          contracts={data.contracts}
          boqHeaders={data.boqHeaders}
          boqItems={data.boqItems}
          contractSovLines={data.contractSovLines}
          controlAccounts={data.controlAccounts}
          cashFlow={data.cashFlow}
          subInvoices={data.subInvoices}
          clientInvoices={data.clientInvoices}
          variations={data.variations}
          documents={data.documents}
          wirEntries={data.wirEntries}
          progressCorrections={data.progressCorrections}
          baselines={data.baselines}
          reportingPeriods={data.reportingPeriods}
          governanceRegister={data.governanceRegister}
          scheduleDistributions={data.scheduleDistributions}
          rfis={data.rfis}
          submittals={data.submittals}
          quality={data.quality}
          resourceMasters={data.resourceMasters as Record<string, any>[]}
          scheduleResourceAssignments={data.scheduleResourceAssignments as Record<string, any>[]}
          workCalendars={data.workCalendars as Record<string, any>[]}
          onDataReload={data.reload}
          onNavigate={setActiveView}
        />
      );
    }
    if (activeView === 'resourceCapacity') {
      return <ResourceCapacityBoard
        resources={data.resourceMasters as Record<string, any>[]}
        assignments={data.scheduleResourceAssignments as Record<string, any>[]}
        schedules={data.schedules as Record<string, any>[]}
        workCalendars={data.workCalendars as Record<string, any>[]}
        laborDuty={data.laborDuty as Record<string, any>[]}
        equipment={data.equipment as Record<string, any>[]}
        onNavigate={setActiveView}
      />;
    }

    if (activeView === 'alerts') {
      const today = unifiedDataDate;
      const alerts: { severity: 'Critical' | 'Warning' | 'Info'; title: string; detail: string; view: ViewKey }[] = [];
      const delayedActivities = data.schedules.filter((row: any) => row.status === 'Delayed' || (row.end_date && row.end_date < today && row.status !== 'Completed'));
      if (delayedActivities.length) alerts.push({ severity: 'Critical', title: 'Schedule delay requires action', detail: `${delayedActivities.length} activity(s) are delayed or past their finish date.`, view: 'schedule' });
      const overdueTasks = data.tasks.filter((row: any) => row.end_date && row.end_date < today && row.status !== 'Completed');
      if (overdueTasks.length) alerts.push({ severity: 'Critical', title: 'Overdue tasks', detail: `${overdueTasks.length} task(s) have passed their due date.`, view: 'tasks' });
      const overBudget = data.costs.filter((row: any) => (Number(row.actual) || 0) > (Number(row.budget) || Number(row.planned) || 0));
      if (overBudget.length) alerts.push({ severity: 'Critical', title: 'Cost overrun detected', detail: `${overBudget.length} BOQ cost-control line(s) exceed the approved budget.`, view: 'costs' });
      const pendingApprovals = data.approvals.filter((row: any) => ['Submitted', 'Returned'].includes(row.status));
      if (pendingApprovals.length) alerts.push({ severity: 'Warning', title: 'Approval decisions pending', detail: `${pendingApprovals.length} approval request(s) require review or resubmission.`, view: 'approvals' });
      const openRfis = data.rfis.filter((row: any) => row.status !== 'Closed');
      if (openRfis.length) alerts.push({ severity: 'Warning', title: 'Open RFIs', detail: `${openRfis.length} RFI(s) remain open and may affect delivery.`, view: 'rfi' });
      const overdueRfis = data.rfis.filter((row: any) => row.due_date && row.due_date < today && !['Answered', 'Closed'].includes(row.status));
      if (overdueRfis.length) alerts.push({ severity: 'Critical', title: 'Overdue RFIs', detail: `${overdueRfis.length} RFI(s) passed their response due date.`, view: 'rfi' });
      const qualityOpen = data.quality.filter((row: any) => row.status !== 'Closed');
      if (qualityOpen.length) alerts.push({ severity: 'Warning', title: 'Quality items remain open', detail: `${qualityOpen.length} NCR / punch item(s) need closure.`, view: 'quality' });
      const overdueQuality = data.quality.filter((row: any) => row.due_date && row.due_date < today && !['Verified', 'Closed'].includes(row.status));
      if (overdueQuality.length) alerts.push({ severity: 'Critical', title: 'Overdue quality actions', detail: `${overdueQuality.length} quality action(s) passed their due date.`, view: 'quality' });
      const overdueClientInvoices = data.clientInvoices.filter((row: any) => row.due_date && row.due_date < today && !['Paid', 'Closed'].includes(row.payment_status));
      if (overdueClientInvoices.length) alerts.push({ severity: 'Warning', title: 'Client collections overdue', detail: `${overdueClientInvoices.length} client invoice(s) are past their due date.`, view: 'clientinvoices' });
      const unreviewedDocs = data.documents.filter((row: any) => row.status === 'Under Review');
      if (unreviewedDocs.length) alerts.push({ severity: 'Info', title: 'Documents under review', detail: `${unreviewedDocs.length} document(s) are waiting for a review decision.`, view: 'documents' });
      const pendingSubmittals = data.submittals.filter((row: any) => row.status === 'Submitted');
      if (pendingSubmittals.length) alerts.push({ severity: 'Info', title: 'Submittals awaiting review', detail: `${pendingSubmittals.length} submitted item(s) are awaiting a review decision.`, view: 'submittals' });
      const styles = { Critical: 'border-error-200 bg-error-50 text-error-700', Warning: 'border-warning-200 bg-warning-50 text-warning-700', Info: 'border-primary-200 bg-primary-50 text-primary-700' };
      return <div className="h-full overflow-y-auto p-4 sm:p-6"><div className="mx-auto max-w-5xl space-y-5"><div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-xl bg-primary-50 p-3 text-primary-600"><Bell size={22} /></div><div><h2 className="text-2xl font-bold text-neutral-900">PMO Alerts</h2><p className="mt-1 text-sm text-neutral-500">Live exceptions generated from schedule, cost, commercial and field-control records.</p></div><span className="ml-auto rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-neutral-700">{alerts.length} open</span></div></div><div className="space-y-3">{alerts.length ? alerts.map((alert, index) => <button key={`${alert.title}-${index}`} onClick={() => setActiveView(alert.view)} className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition hover:shadow-sm ${styles[alert.severity]}`}><CircleAlert size={22} className="shrink-0" /><div className="min-w-0 flex-1"><p className="font-semibold">{alert.title}</p><p className="mt-1 text-sm opacity-90">{alert.detail}</p></div><span className="text-xs font-semibold">Open →</span></button>) : <div className="rounded-xl border border-success-200 bg-success-50 p-8 text-center text-success-700"><FileCheck2 className="mx-auto mb-2" size={26} /><p className="font-semibold">No active PMO alerts</p><p className="mt-1 text-sm">All monitored records are currently within their control state.</p></div>}</div></div></div>;
    }

    if (activeView === 'dataQuality') {
      const checks = runDataQualityChecks({
        projects: data.projects as Record<string, any>[], contracts: data.contracts as Record<string, any>[], boqHeaders: data.boqHeaders as Record<string, any>[], boqItems: data.boqItems as Record<string, any>[],
        schedules: data.schedules as Record<string, any>[], scheduleDistributions: data.scheduleDistributions as Record<string, any>[], scheduleResourceAssignments: data.scheduleResourceAssignments as Record<string, any>[], workCalendars: data.workCalendars as Record<string, any>[], resourceMasters: data.resourceMasters as Record<string, any>[], wbsNodes: data.wbsNodes as Record<string, any>[], controlAccounts: data.controlAccounts as Record<string, any>[], wirEntries: data.wirEntries as Record<string, any>[], progressCorrections: data.progressCorrections as Record<string, any>[], costEntries: data.costEntries as Record<string, any>[], laborDuty: data.laborDuty as Record<string, any>[], equipment: data.equipment as Record<string, any>[], cashFlow: data.cashFlow as Record<string, any>[], reportingPeriods: data.reportingPeriods as Record<string, any>[], baselines: data.baselines as Record<string, any>[], contractSovLines: data.contractSovLines as Record<string, any>[], costChanges: data.costChanges as Record<string, any>[], paymentCertificates: data.paymentCertificates as Record<string, any>[], variations: data.variations as Record<string, any>[], variationLines: data.variationLines as Record<string, any>[], procurement: data.procurement as Record<string, any>[], procurementReceipts: data.procurementReceipts as Record<string, any>[], supplierInvoices: data.supplierInvoices as Record<string, any>[], supplierInvoiceLines: data.supplierInvoiceLines as Record<string, any>[], supplierInvoicePayments: data.supplierInvoicePayments as Record<string, any>[], documents: data.documents as Record<string, any>[], rfis: data.rfis as Record<string, any>[], submittals: data.submittals as Record<string, any>[], quality: data.quality as Record<string, any>[], dailyReports: data.siteDailyReports as Record<string, any>[],
      });
      const styles = { Error: 'border-error-200 bg-error-50 text-error-700', Warning: 'border-warning-200 bg-warning-50 text-warning-700', Pass: 'border-success-200 bg-success-50 text-success-700' };
      return <div className="h-full overflow-y-auto p-4 sm:p-6"><div className="mx-auto max-w-5xl space-y-5"><div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-xl bg-primary-50 p-3 text-primary-600"><CircleAlert size={22} /></div><div><h2 className="text-2xl font-bold text-neutral-900">Data Quality & Relationship Checks</h2><p className="mt-1 text-sm text-neutral-500">Read-only acceptance controls for local PMO relationships, quantities, periods and baselines. No records are changed.</p></div><span className="ml-auto rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-neutral-700">{checks.filter((check) => check.severity !== 'Pass').length} finding(s)</span></div></div><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-error-200 bg-error-50 p-4"><p className="text-xs font-semibold text-error-700">ERRORS</p><p className="mt-1 text-2xl font-bold text-error-800">{checks.filter((check) => check.severity === 'Error').length}</p></div><div className="rounded-xl border border-warning-200 bg-warning-50 p-4"><p className="text-xs font-semibold text-warning-700">WARNINGS</p><p className="mt-1 text-2xl font-bold text-warning-800">{checks.filter((check) => check.severity === 'Warning').length}</p></div><div className="rounded-xl border border-success-200 bg-success-50 p-4"><p className="text-xs font-semibold text-success-700">CONTROL STATUS</p><p className="mt-1 text-lg font-bold text-success-800">{checks.some((check) => check.severity === 'Error') ? 'Action required' : 'Ready for review'}</p></div></div><div className="space-y-3">{checks.map((check, index) => <button key={`${check.title}-${index}`} onClick={() => setActiveView(check.view as ViewKey)} className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition hover:shadow-sm ${styles[check.severity]}`}><CircleAlert size={22} className="shrink-0" /><div className="min-w-0 flex-1"><p className="font-semibold">{check.title}</p><p className="mt-1 text-sm opacity-90">{check.detail}</p></div><span className="text-xs font-semibold">Open →</span></button>)}</div></div></div>;
    }

    if (activeView === 'controlsCockpit') {
      return (
        <div className="h-full overflow-y-auto p-4 sm:p-6 bg-slate-50/50">
          <IntegratedProjectControlsCockpit
            projects={data.projects as any[]}
            costs={data.costs as any[]}
            costEntries={data.costEntries as any[]}
            boqItems={data.boqItems as any[]}
            controlAccounts={data.controlAccounts as any[]}
            schedules={data.schedules as any[]}
            reportingPeriods={data.reportingPeriods as any[]}
            variations={data.variations as any[]}
            quality={data.quality as any[]}
            rfis={data.rfis as any[]}
            submittals={data.submittals as any[]}
            cashFlow={data.cashFlow as any[]}
            onNavigate={setActiveView}
          />
        </div>
      );
    }

    if (activeView === 'portfolio') {
      const money = (value: number | null) => value === null ? 'Unavailable' : value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
      const portfolioRows = data.projects.map((project: any) => {
        const mainContract = data.contracts.find((contract: any) => contract.project_id === project.id && !contract.parent_main_contract_id) as Record<string, any> | undefined;
        const contractIds = new Set(data.contracts
          .filter((contract: any) => contract.project_id === project.id || contract.parent_main_contract_id === mainContract?.id)
          .map((contract: any) => contract.id));
        const approvedVariations = data.variations.filter((variation: any) => variation.contract_id === mainContract?.id && variation.status === 'Approved');
        const variationValue = approvedVariations.reduce((sum: number, variation: any) => sum + (Number(variation.cost_impact) || 0), 0);
        const timeImpact = approvedVariations.reduce((sum: number, variation: any) => sum + (Number(variation.time_impact_days) || 0), 0);
        const originalValue = Number(mainContract?.contract_value) || 0;
        const modifiedValue = originalValue + variationValue;
        const evm = mainContract ? calculateEvmAtDataDate({
          contractIds: [mainContract.id], performanceContractIds: [...contractIds], dataDate: unifiedDataDate,
          schedules: data.schedules as Record<string, any>[], scheduleDistributions: data.scheduleDistributions as Record<string, any>[],
           baselines: data.baselines as Record<string, any>[], wirEntries: data.wirEntries as Record<string, any>[],
           boqItems: data.boqItems as Record<string, any>[], costEntries: data.costEntries as Record<string, any>[],
           controlAccounts: data.controlAccounts as Record<string, any>[], contractSovLines: data.contractSovLines as Record<string, any>[],
           procurement: data.procurement as Record<string, any>[], procurementReceipts: data.procurementReceipts as Record<string, any>[],
         }) : null;
        const actualCost = evm?.cost.AC || 0;
        const earnedValue = evm?.revenue.EV || 0;
        const plannedValue = evm?.revenue.PV || 0;
        const budgetAtCompletion = evm?.cost.BAC ?? null;
        const estimateAtCompletion = evm?.cost.EAC ?? null;
        const estimateToComplete = evm?.cost.ETC ?? null;
        const subcontractCount = Math.max(0, contractIds.size - (mainContract ? 1 : 0));
        const revisedEnd = addCalendarDays(mainContract?.end_date || project.end_date, timeImpact) || mainContract?.end_date || project.end_date;
        const finish = deriveContractForecastFinish(data.schedules as Record<string, any>[], mainContract?.id);
        const forecastFinish = finish.date || revisedEnd;
        return { project, mainContract, variationValue, originalValue, modifiedValue, actualCost, earnedValue, plannedValue, budgetAtCompletion, estimateAtCompletion, estimateToComplete, cpi: evm?.cost.CPI ?? null, spi: evm?.revenue.SPI || 0, subcontractCount, revisedEnd, forecastFinish, forecastSource: finish.date ? finish.source : 'Contract fallback' };
      });
      const totals = portfolioRows.reduce((sum, row) => ({
        originalValue: sum.originalValue + row.originalValue,
        variationValue: sum.variationValue + row.variationValue,
        modifiedValue: sum.modifiedValue + row.modifiedValue,
        plannedValue: sum.plannedValue + row.plannedValue,
        earnedValue: sum.earnedValue + row.earnedValue,
        actualCost: sum.actualCost + row.actualCost,
      }), { originalValue: 0, variationValue: 0, modifiedValue: 0, plannedValue: 0, earnedValue: 0, actualCost: 0 });
      const openProject = (projectId: string) => { setWorkspaceProjectId(projectId); setActiveView('projects'); };
      return (
        <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-5">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-600">Project Portfolio</p>
            <h2 className="mt-1 text-2xl font-bold text-neutral-900">Executive project register</h2>
            <p className="mt-1 text-sm text-neutral-500">One row per main contract/project. Values are calculated from contracts, approved variations, schedule, WIR and cost-control records.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            {[
              ['Original contracts', totals.originalValue], ['Approved variations', totals.variationValue], ['Modified contracts', totals.modifiedValue],
              ['Revenue PV to date', totals.plannedValue], ['Revenue EV', totals.earnedValue], ['Delivery AC', totals.actualCost],
            ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"><p className="text-xs text-neutral-500">{label}</p><p className="mt-1 text-lg font-bold text-neutral-900">{money(Number(value))}</p></div>)}
          </div>
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <table className="min-w-[1480px] w-full text-sm"><thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500"><tr><th className="px-4 py-3">Project</th><th className="px-4 py-3">Main contract</th><th className="px-4 py-3">Original</th><th className="px-4 py-3">Variations</th><th className="px-4 py-3">Modified</th><th className="px-4 py-3">Start</th><th className="px-4 py-3">Revised finish</th><th className="px-4 py-3">PV / EV / AC</th><th className="px-4 py-3">Performance</th><th className="px-4 py-3">Forecast</th><th className="px-4 py-3">Progress</th><th className="px-4 py-3">Subcontracts</th></tr></thead><tbody>
              {portfolioRows.map((row) => { const progress = row.modifiedValue > 0 ? Math.min(100, row.earnedValue / row.modifiedValue * 100) : 0; const overBudget = row.budgetAtCompletion !== null && row.estimateAtCompletion !== null && row.estimateAtCompletion > row.budgetAtCompletion; const late = row.forecastFinish && row.revisedEnd && row.forecastFinish > row.revisedEnd; return <tr key={row.project.id} onClick={() => openProject(row.project.id)} className="cursor-pointer border-b border-neutral-100 hover:bg-primary-50"><td className="px-4 py-3"><p className="font-semibold text-neutral-900">{row.project.name}</p><p className="text-xs text-neutral-500">{row.project.project_code}</p></td><td className="px-4 py-3"><p className="font-medium text-neutral-800">{row.mainContract?.contract_number || '—'}</p><p className="max-w-48 truncate text-xs text-neutral-500">{row.mainContract?.title || 'No main contract'}</p></td><td className="px-4 py-3">{money(row.originalValue)}</td><td className="px-4 py-3 text-primary-700">{money(row.variationValue)}</td><td className="px-4 py-3 font-semibold">{money(row.modifiedValue)}</td><td className="px-4 py-3">{row.mainContract?.start_date || row.project.start_date || '—'}</td><td className="px-4 py-3">{row.revisedEnd || '—'}</td><td className="px-4 py-3 text-xs"><p>Revenue PV {money(row.plannedValue)}</p><p>Revenue EV {money(row.earnedValue)}</p><p>Delivery AC {money(row.actualCost)}</p></td><td className="px-4 py-3 text-xs"><p className={row.cpi !== null && row.cpi >= 1 ? 'text-success-700' : row.cpi !== null && row.cpi > 0 ? 'font-semibold text-error-600' : 'text-neutral-500'}>Cost CPI {row.cpi !== null && row.cpi > 0 ? row.cpi.toFixed(2) : 'Unavailable'}</p><p className={row.spi >= 1 ? 'text-success-700' : row.spi > 0 ? 'font-semibold text-error-600' : 'text-neutral-500'}>Revenue SPI {row.spi > 0 ? row.spi.toFixed(2) : '—'}</p></td><td className="px-4 py-3 text-xs"><p className={overBudget ? 'font-semibold text-error-600' : ''}>Cost EAC {money(row.estimateAtCompletion)}</p><p>Cost ETC {money(row.estimateToComplete)}</p><p className={late ? 'font-semibold text-error-600' : ''}>Finish {row.forecastFinish || '—'}{late ? ' · late' : ''}</p><p className="text-[10px] text-neutral-500">{row.forecastSource}</p></td><td className="px-4 py-3"><div className="flex items-center gap-2"><div className="h-2 w-20 overflow-hidden rounded-full bg-neutral-100"><div className="h-full bg-primary-600" style={{ width: `${progress}%` }} /></div><span>{progress.toFixed(1)}%</span></div></td><td className="px-4 py-3">{row.subcontractCount}</td></tr>; })}
              {portfolioRows.length === 0 && <tr><td colSpan={12} className="px-4 py-10 text-center text-neutral-500">No projects have been generated from main contracts yet.</td></tr>}
            </tbody></table>
          </div>
        </div>
      );
    }

    if (activeView === 'projects') {
      const selectedProject = data.projects.find((project: any) => project.id === workspaceProjectId) || data.projects[0];
      if (!selectedProject) {
        return (
          <div className="p-6">
            <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
              <FolderKanban size={34} className="mx-auto mb-3 text-neutral-400" />
              <h2 className="text-lg font-semibold text-neutral-800">No project workspace yet</h2>
              <p className="mt-1 text-sm text-neutral-500">Create a main contract first. The project workspace is generated from that contract.</p>
              <button onClick={() => setActiveView('contracts')} className="mt-5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">Open Contracts</button>
            </div>
          </div>
        );
      }

      const mainContract = data.contracts.find((contract: any) =>
        contract.project_id === selectedProject.id && !contract.parent_main_contract_id,
      ) as Record<string, any> | undefined;
      const relatedContracts = data.contracts.filter((contract: any) =>
        contract.project_id === selectedProject.id || contract.parent_main_contract_id === mainContract?.id,
      ) as Record<string, any>[];
      const relatedContractIds = new Set(relatedContracts.map((contract) => contract.id));
      const approvedVariations = data.variations.filter((variation: any) =>
        variation.contract_id === mainContract?.id && variation.status === 'Approved',
      );
      const approvedVariationValue = approvedVariations.reduce((sum: number, variation: any) => sum + (Number(variation.cost_impact) || 0), 0);
      const originalValue = Number(mainContract?.contract_value) || 0;
      const modifiedValue = originalValue + approvedVariationValue;
      const relatedWirs = data.wirEntries.filter((wir: any) => relatedContractIds.has(wir.contract_id));
      const approvedWirs = relatedWirs.filter((wir: any) => wir.result === 'Pass' || wir.result === 'Conditional Pass' || wir.status === 'Approved');
      const completedValue = approvedWirs.reduce((sum: number, wir: any) => sum + (Number(wir.item_amount) || (Number(wir.quantity) || 0) * (Number(wir.unit_price) || 0)), 0);
      const projectCosts = data.costs.filter((cost: any) => cost.project_id === selectedProject.id);
      const plannedCost = projectCosts.reduce((sum: number, cost: any) => sum + (Number(cost.planned) || 0), 0);
      const actualCost = projectCosts.reduce((sum: number, cost: any) => sum + (Number(cost.actual) || 0), 0);
      const committedValue = projectCosts.reduce((sum: number, cost: any) => sum + (Number(cost.committed) || 0), 0);
      const projectCash = data.cashFlow.filter((entry: any) => (entry.project_id === selectedProject.id || relatedContractIds.has(entry.contract_id)) && (!entry.movement_type || entry.movement_type === 'Actual' || entry.movement_type === 'Manual'));
      const cashIn = projectCash.reduce((sum: number, entry: any) => sum + (Number(entry.inflow) || 0), 0);
      const cashOut = projectCash.reduce((sum: number, entry: any) => sum + (Number(entry.outflow) || 0), 0);
      const activityCount = data.schedules.filter((activity: any) => activity.project_id === selectedProject.id && activity.activity).length;
      const boqCount = data.boqItems.filter((item: any) => item.project_id === selectedProject.id).length;
      const boqHeaderCount = data.boqHeaders.filter((header: any) => header.project_id === selectedProject.id).length;
      const costEntryCount = data.costEntries.filter((entry: any) => entry.project_id === selectedProject.id).length;
      const invoiceCount = [...data.clientInvoices, ...data.subInvoices].filter((invoice: any) => invoice.project_id === selectedProject.id).length;
      const money = (value: number) => value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
      const progress = modifiedValue > 0 ? Math.min(100, (completedValue / modifiedValue) * 100) : 0;
      const sections: { label: string; value: string; description: string; view: ViewKey; icon: IconType; tone: string }[] = [
        { label: 'Commercial', value: money(modifiedValue), description: `${approvedVariations.length} approved variation(s)`, view: 'contracts', icon: FileSignature, tone: 'text-primary-600 bg-primary-50' },
        { label: 'Progress', value: `${progress.toFixed(1)}%`, description: `${approvedWirs.length} approved inspection request(s)`, view: 'progress', icon: TrendingUp, tone: 'text-emerald-600 bg-emerald-50' },
        { label: 'Cost control', value: money(actualCost), description: `Actual | committed ${money(committedValue)}`, view: 'costs', icon: DollarSign, tone: 'text-amber-600 bg-amber-50' },
        { label: 'Cash position', value: money(cashIn - cashOut), description: `In ${money(cashIn)} | Out ${money(cashOut)}`, view: 'cashflow', icon: Banknote, tone: 'text-violet-600 bg-violet-50' },
      ];
      const workspaceTabs: { label: string; view: ViewKey; icon: IconType }[] = [
        { label: 'Contracts', view: 'contracts', icon: FileSignature },
        { label: 'BOQ', view: 'boqItems', icon: ListOrdered },
        { label: 'Schedule', view: 'schedule', icon: CalendarClock },
        { label: 'Inspection & Progress', view: 'wir', icon: FileCheck2 },
        { label: 'Cost', view: 'costs', icon: DollarSign },
        { label: 'Cash Flow', view: 'cashflow', icon: Banknote },
        { label: 'Operations', view: 'procurement', icon: Package },
      ];
      const activateProjectContext = (projectId: string) => {
        const contract = data.contracts.find((item: any) => item.project_id === projectId && !item.parent_main_contract_id) as Record<string, any> | undefined;
        window.localStorage.setItem('buildtrack:work-context', JSON.stringify({ project_id: projectId, ...(contract?.id ? { contract_id: contract.id } : {}) }));
        setWorkspaceProjectId(projectId);
      };
      const openWorkspaceArea = (view: ViewKey) => {
        activateProjectContext(selectedProject.id);
        setWorkspaceProjectId(selectedProject.id);
        setActiveView(view);
      };
      const workflow = [
        { order: '1', label: 'Commercial setup', detail: mainContract ? `${mainContract.contract_number || 'Main contract'} ready` : 'Create main contract first', count: mainContract ? 1 : 0, view: 'contracts' as ViewKey },
        { order: '2', label: 'BOQ definition', detail: `${boqHeaderCount} header(s) · ${boqCount} item(s)`, count: boqCount, view: 'boqItems' as ViewKey },
        { order: '3', label: 'Schedule plan', detail: `${activityCount} activity(s)`, count: activityCount, view: 'schedule' as ViewKey },
        { order: '4', label: 'Field progress', detail: `${relatedWirs.length} inspection request(s)`, count: relatedWirs.length, view: 'wir' as ViewKey },
        { order: '5', label: 'Cost & payment', detail: `${costEntryCount} cost entry(s) · ${invoiceCount} invoice line(s)`, count: costEntryCount + invoiceCount, view: 'costEntries' as ViewKey },
      ];
      const delayedActivities = data.schedules.filter((activity: any) => activity.project_id === selectedProject.id && activity.activity && (activity.status === 'Delayed' || (activity.end_date && activity.end_date < unifiedDataDate && activity.status !== 'Completed'))).length;
      const overBudgetLines = projectCosts.filter((cost: any) => (Number(cost.actual) || 0) > (Number(cost.budget) || Number(cost.planned) || 0)).length;
      const pendingVariations = data.variations.filter((variation: any) => variation.project_id === selectedProject.id && ['Draft', 'Submitted', 'Pending'].includes(variation.status)).length;
      const pendingApprovals = data.approvals.filter((approval: any) => approval.project_id === selectedProject.id && !['Approved', 'Rejected', 'Cancelled'].includes(approval.status)).length;
      const decisionItems = [
        { label: 'Delayed activities', value: delayedActivities, detail: 'Review recovery actions and finish dates.', view: 'schedule' as ViewKey, tone: 'error' },
        { label: 'Cost exceptions', value: overBudgetLines, detail: 'Actual cost is above budget or planned value.', view: 'costs' as ViewKey, tone: 'error' },
        { label: 'Pending variations', value: pendingVariations, detail: 'Commercial decision has not been completed.', view: 'variations' as ViewKey, tone: 'warning' },
        { label: 'Pending approvals', value: pendingApprovals, detail: 'Approval action is still required.', view: 'approvals' as ViewKey, tone: 'warning' },
      ];

      return (
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto h-full">
          <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-600">Project Workspace</p>
              <h2 className="mt-1 text-2xl font-bold text-neutral-900">{selectedProject.name || selectedProject.project_code}</h2>
              <p className="mt-1 text-sm text-neutral-500">One project context for commercial, delivery, cost, cash and field operations.</p>
            </div>
            <label className="block text-sm font-medium text-neutral-700">
              Active project
              <select value={selectedProject.id} onChange={(event) => activateProjectContext(event.target.value)} className="mt-1 block min-w-64 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100">
                {data.projects.map((project: any) => <option key={project.id} value={project.id}>{project.project_code || project.id} — {project.name}</option>)}
              </select>
            </label>
          </div>

          <section className="rounded-2xl border border-primary-200 bg-gradient-to-r from-primary-50 to-white p-5 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary-700">Project workflow</p><h3 className="mt-1 text-lg font-bold text-neutral-900">Follow the project data flow</h3><p className="mt-1 text-sm text-neutral-600">Each step opens with the active project and main-contract context already selected.</p></div><button onClick={() => openWorkspaceArea('dataEntry')} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">Start guided entry</button></div><div className="mt-5 grid gap-3 lg:grid-cols-5">{workflow.map((step) => <button key={step.order} onClick={() => openWorkspaceArea(step.view)} className={`rounded-xl border p-3 text-left transition hover:shadow-sm ${step.count > 0 ? 'border-success-200 bg-white hover:border-success-300' : 'border-warning-200 bg-warning-50 hover:border-warning-300'}`}><div className="flex items-center justify-between"><span className="rounded-full bg-primary-100 px-2 py-1 text-xs font-bold text-primary-700">{step.order}</span><span className={`text-xs font-semibold ${step.count > 0 ? 'text-success-700' : 'text-warning-700'}`}>{step.count > 0 ? 'READY' : 'NEXT'}</span></div><p className="mt-3 text-sm font-bold text-neutral-900">{step.label}</p><p className="mt-1 text-xs leading-5 text-neutral-500">{step.detail}</p></button>)}</div></section>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {sections.map((section) => {
              const Icon = section.icon;
              return <button key={section.label} onClick={() => openWorkspaceArea(section.view)} className="rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition hover:border-primary-300 hover:shadow-md">
                <div className={`mb-3 inline-flex rounded-lg p-2 ${section.tone}`}><Icon size={19} /></div>
                <p className="text-xs font-medium text-neutral-500">{section.label}</p>
                <p className="mt-1 text-xl font-bold text-neutral-900">{section.value}</p>
                <p className="mt-1 truncate text-xs text-neutral-500">{section.description}</p>
              </button>;
            })}
          </div>

          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary-700">Decision view</p><h3 className="mt-1 text-lg font-bold text-neutral-900">What needs attention now?</h3><p className="mt-1 text-sm text-neutral-500">Values below are calculated from this project’s linked delivery, commercial, cost and approval records.</p></div><button onClick={() => setActiveView('workQueue')} className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100">Open full work queue</button></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{decisionItems.map((item) => <button key={item.label} onClick={() => openWorkspaceArea(item.view)} className={`rounded-xl border p-4 text-left transition hover:shadow-sm ${item.value > 0 ? item.tone === 'error' ? 'border-error-200 bg-error-50 hover:border-error-300' : 'border-warning-200 bg-warning-50 hover:border-warning-300' : 'border-success-200 bg-success-50 hover:border-success-300'}`}><p className="text-xs font-medium text-neutral-600">{item.label}</p><p className={`mt-1 text-3xl font-bold ${item.value > 0 ? item.tone === 'error' ? 'text-error-700' : 'text-warning-700' : 'text-success-700'}`}>{item.value}</p><p className="mt-2 text-xs leading-5 text-neutral-600">{item.value > 0 ? item.detail : 'No action required currently.'}</p></button>)}</div></section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-semibold text-neutral-900">Common project actions</h3><p className="mt-1 text-xs text-neutral-500">Start the operation from this project context; related tables keep the project filter.</p></div><span className="text-xs text-neutral-400">Use Ctrl + K to find any record or work area</span></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{[{ label: 'Guided import', note: 'BOQ, schedule and WIR', view: 'dataEntry' as ViewKey, icon: Download }, { label: 'Inspection requests', note: `${relatedWirs.length} request(s)`, view: 'wir' as ViewKey, icon: FileCheck2 }, { label: 'Record cost', note: `${projectCosts.length} cost item(s)`, view: 'costEntries' as ViewKey, icon: DollarSign }, { label: 'Project documents', note: `${data.documents.filter((item: any) => item.project_id === selectedProject.id).length} document(s)`, view: 'documents' as ViewKey, icon: FolderOpen }].map((action) => { const Icon = action.icon; return <button key={action.label} onClick={() => openWorkspaceArea(action.view)} className="flex items-center gap-3 rounded-xl border border-neutral-200 px-3 py-3 text-left hover:border-primary-300 hover:bg-primary-50"><span className="rounded-lg bg-primary-50 p-2 text-primary-700"><Icon size={17}/></span><span><span className="block text-sm font-semibold text-neutral-800">{action.label}</span><span className="block text-xs text-neutral-500">{action.note}</span></span></button>; })}</div></section>

          <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between"><div><h3 className="font-semibold text-neutral-900">Project control summary</h3><p className="text-xs text-neutral-500">Calculated from linked local records</p></div><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">{selectedProject.status || 'Planning'}</span></div>
              <div className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <div><p className="text-neutral-500">Original contract</p><p className="mt-1 font-semibold text-neutral-900">{money(originalValue)}</p></div>
                <div><p className="text-neutral-500">Modified contract</p><p className="mt-1 font-semibold text-neutral-900">{money(modifiedValue)}</p></div>
                <div><p className="text-neutral-500">Planned cost</p><p className="mt-1 font-semibold text-neutral-900">{money(plannedCost)}</p></div>
                <div><p className="text-neutral-500">Completed work</p><p className="mt-1 font-semibold text-neutral-900">{money(completedValue)}</p></div>
                <div><p className="text-neutral-500">BOQ items</p><p className="mt-1 font-semibold text-neutral-900">{boqCount}</p></div>
                <div><p className="text-neutral-500">Activities</p><p className="mt-1 font-semibold text-neutral-900">{activityCount}</p></div>
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-primary-600" style={{ width: `${progress}%` }} /></div>
              <div className="mt-2 flex justify-between text-xs text-neutral-500"><span>Delivery progress</span><span>{progress.toFixed(1)}%</span></div>
            </section>
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><h3 className="font-semibold text-neutral-900">Open a work area</h3><p className="mt-1 text-xs text-neutral-500">All areas preserve the same project relationship.</p><div className="mt-4 grid grid-cols-2 gap-2">{workspaceTabs.map((tab) => { const Icon = tab.icon; return <button key={tab.view} onClick={() => openWorkspaceArea(tab.view)} className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2.5 text-left text-sm text-neutral-700 hover:border-primary-300 hover:bg-primary-50"><Icon size={16} className="text-primary-600" />{tab.label}</button>; })}</div></section>
          </div>
        </div>
      );
    }

    const config = VIEW_CONFIGS[activeView];
    if (!config) return null;
    const tableName = TABLE_NAMES[activeView];
    const title = VIEW_TITLES[activeView];
    const roleReadOnly = activeRole === 'Executive Viewer' || (activeRole === 'Site Engineer' && ['contracts', 'variations', 'costs', 'cost_entries', 'cash_flow', 'project_baselines', 'reporting_periods', 'approval_requests'].includes(tableName)) || (tableName === 'app_users' && activeRole !== 'PMO Admin') || (tableName === 'reporting_periods' && activeRole !== 'PMO Admin');
    // The navigation key is "boq", while the loaded state is named
    // "boqHeaders". Reading the navigation key made successfully saved BOQs
    // look as if they had disappeared.
    const rawViewData = activeView === 'boq'
      ? data.boqHeaders
      : activeView === 'variations'
        ? data.variations.map((variation: any) => ({ ...variation, ...previewVariationPackage(variation, data.variationLines as Record<string, any>[]) }))
      : activeView === 'quantityLedger'
        ? buildQuantityLedger({ boqItems: data.boqItems as Record<string, any>[], schedules: data.schedules as Record<string, any>[], wirEntries: data.wirEntries as Record<string, any>[], progressCorrections: data.progressCorrections as Record<string, any>[], variations: data.variations as Record<string, any>[], variationLines: data.variationLines as Record<string, any>[] })
      : activeView === 'progressCorrections'
        ? data.progressCorrections
      : activeView === 'baselines'
        ? data.baselines
      : activeView === 'reportingPeriods'
          ? data.reportingPeriods
          : activeView === 'costCodes'
            ? data.costCodes
          : activeView === 'wbs'
              ? data.wbsNodes
              : activeView === 'contractSov'
                ? data.contractSovLines
                : activeView === 'controlAccounts'
                  ? data.controlAccounts.map((account: any) => ({ ...account, ...calculateControlAccountSummary({ account, boqItems: data.boqItems as Record<string, any>[], sovLines: data.contractSovLines as Record<string, any>[], schedules: data.schedules as Record<string, any>[], scheduleDistributions: data.scheduleDistributions as Record<string, any>[], baselines: data.baselines as Record<string, any>[], wirEntries: data.wirEntries as Record<string, any>[], costEntries: data.costEntries as Record<string, any>[], procurement: data.procurement as Record<string, any>[], procurementReceipts: data.procurementReceipts as Record<string, any>[] }) }))
                : activeView === 'costChanges'
                  ? data.costChanges
          : activeView === 'paymentCertificates'
                  ? data.paymentCertificates
      : activeView === 'procurementReceipts'
                    ? data.procurementReceipts
                    : activeView === 'procurementReconciliation'
                      ? data.procurement
                    : activeView === 'supplierInvoices'
                      ? data.supplierInvoices
                      : activeView === 'supplierInvoiceLines'
                        ? data.supplierInvoiceLines
                        : activeView === 'supplierInvoicePayments'
                          ? data.supplierInvoicePayments
          : activeView === 'snapshots'
            ? data.snapshots
            : activeView === 'users'
              ? data.users
          : activeView === 'governance'
            ? data.governanceRegister
            : activeView === 'approvals'
              ? data.approvals
              : activeView === 'rfi'
                  ? data.rfis
                  : activeView === 'submittals'
                    ? data.submittals
                    : activeView === 'quality'
                      ? data.quality
                      : activeView === 'dailyReports'
                        ? data.siteDailyReports
      : activeView === 'boqItems'
        ? data.boqItems
        : activeView === 'wir'
          ? data.wirEntries
        : activeView === 'schedule'
          ? data.schedules
        : activeView === 'scheduleDistributions'
            ? data.scheduleDistributions
            : activeView === 'resourceAssignments'
              ? data.scheduleResourceAssignments
            : activeView === 'workCalendars'
              ? data.workCalendars
            : activeView === 'parties'
              ? data.parties
              : activeView === 'partyContacts'
                ? data.partyContacts
                : activeView === 'rateHistory'
                  ? data.rateHistory
          : activeView === 'subinvoices'
            ? data.subInvoices
            : activeView === 'clientinvoices'
              ? data.clientInvoices
              : (data as any)[activeView] || [];
    const contractsWithModifiedValue = data.contracts.map((contract: any) => {
        const approvedVariationValue = data.variations
          .filter((variation: any) => variation.contract_id === contract.id && variation.status === 'Approved')
          .reduce((sum: number, variation: any) => sum + (Number(variation.cost_impact) || 0), 0);
        const approvedTimeImpact = data.variations
          .filter((variation: any) => variation.contract_id === contract.id && variation.status === 'Approved')
          .reduce((sum: number, variation: any) => sum + (Number(variation.time_impact_days) || 0), 0);
        const approvedVariationIds = new Set(data.variations
          .filter((variation: any) => variation.contract_id === contract.id && variation.status === 'Approved')
          .map((variation: any) => variation.id));
        // A delay linked to an approved variation is already represented by
        // that variation's EOT. Only independent approved delay events add a
        // separate forecast extension, preventing double counting.
        const approvedIndependentDelayDays = data.delayEvents
          .filter((event: any) => event.contract_id === contract.id
            && ['Approved', 'Closed'].includes(String(event.status))
            && (!event.variation_id || !approvedVariationIds.has(event.variation_id)))
          .reduce((sum: number, event: any) => sum + (Number(event.approved_extension_days) || 0), 0);
        const totalApprovedTimeImpact = approvedTimeImpact + approvedIndependentDelayDays;
        return {
          ...contract,
          contract_role: contract.parent_main_contract_id ? 'Subcontract' : 'Main Contract',
          project_code: contract.project_code || data.projects.find((project: any) => project.id === contract.project_id)?.project_code || '',
          modified_contract_value: (Number(contract.contract_value) || 0) + approvedVariationValue,
          revised_end_date: addCalendarDays(contract.end_date, totalApprovedTimeImpact),
          approved_time_impact_days: totalApprovedTimeImpact,
          approved_delay_event_days: approvedIndependentDelayDays,
        };
      });
    const contractById = new Map(contractsWithModifiedValue.map((contract: any) => [contract.id, contract]));
    const headersWithContractContext = data.boqHeaders.map((header: any) => {
      const contract = contractById.get(header.contract_id) as any;
      return {
        ...header,
        contract_role: contract?.contract_role || 'Main Contract',
        company_name: header.company_name || contract?.contractor || '',
      };
    });
    const headerById = new Map(headersWithContractContext.map((header: any) => [header.id, header]));
    const executableActivities = data.schedules.filter((activity: any) => String(activity.activity || '').trim());
    const activityIdByReference = new Map<string, string>();
    executableActivities.forEach((activity: any) => {
      [activity.id, activity.activity_code, activity.source_activity_id].filter(Boolean)
        .forEach((reference) => activityIdByReference.set(String(reference).trim(), activity.id));
    });
    const cpmByActivity = calculateCpm(executableActivities.map((activity: any) => ({
      id: activity.id,
      duration_days: activity.duration_days,
      predecessor_item: activity.predecessor_item,
      predecessor_items: String(activity.predecessors || '').split(',')
        .map((reference) => activityIdByReference.get(String(reference).trim()) || String(reference).trim())
        .filter(Boolean),
      predecessor_links: activity.predecessor_links,
      relationship_type: activity.relationship_type,
      lag_days: activity.lag_days,
    })));
    const mainBoqItemById = new Map(data.boqItems
      .filter((item: any) => !contractById.get((headerById.get(item.boq_header_id) as any)?.contract_id)?.parent_main_contract_id)
      .map((item: any) => [item.id, item]));
    // One live WIR projection is shared by WIR, Progress, and Projects. This
    // prevents a copied historical price from breaking downstream totals when
    // the linked BOQ item or parent-main-item relationship is updated.
    const derivedWirs = data.wirEntries.map((wir: any) => {
      const contract = contractById.get(wir.contract_id) as any;
      const selectedItem = data.boqItems.find((item: any) => item.id === wir.boq_item_id) as any;
      const mainItem = mainBoqItemById.get(selectedItem?.main_boq_item_id) || selectedItem;
      const unitPrice = Number(mainItem?.unit_rate) || Number(wir.unit_price) || 0;
      const itemAmount = Math.round((Number(wir.quantity) || 0) * unitPrice * 100) / 100;
      const mainItemValue = (Number(mainItem?.quantity) || 0) * (Number(mainItem?.unit_rate) || 0);
      return {
        ...wir,
        company_name: contract?.contractor || wir.company_name || '',
        contract_role: contract?.contract_role || 'Main Contract',
        unit_price: unitPrice,
        item_amount: itemAmount,
        completion_pct: mainItemValue > 0 ? Math.round(itemAmount / mainItemValue * 10000) / 100 : 0,
      };
    });
    const viewData = activeView === 'resourceMaster'
      ? (() => {
        const loads = calculateResourceLoads(data.resourceMasters as Record<string, any>[], data.laborDuty as Record<string, any>[], data.equipment as Record<string, any>[], data.workCalendars as Record<string, any>[]);
        const plannedLoads = calculatePlannedResourceLoads(data.resourceMasters as Record<string, any>[], data.scheduleResourceAssignments as Record<string, any>[], data.schedules as Record<string, any>[], data.workCalendars as Record<string, any>[]);
        return rawViewData.map((resource: any) => {
          const resourceLoads = loads.filter((load) => load.resourceId === resource.id);
          const resourcePlannedLoads = plannedLoads.filter((load) => load.resourceId === resource.id);
          const peak = resourceLoads.reduce((current: any, load) => !current || load.allocatedHours > current.allocatedHours ? load : current, null);
          const peakOver = resourceLoads.reduce((current: any, load) => !current || load.overAllocatedHours > current.overAllocatedHours ? load : current, null);
          const plannedPeak = resourcePlannedLoads.reduce((current: any, load) => !current || load.allocatedHours > current.allocatedHours ? load : current, null);
          const plannedPeakOver = resourcePlannedLoads.reduce((current: any, load) => !current || load.overAllocatedHours > current.overAllocatedHours ? load : current, null);
          return {
            ...resource,
            peak_load_date: peak?.date || null,
            peak_allocated_hours: peak?.allocatedHours || 0,
            peak_overallocation_hours: peakOver?.overAllocatedHours || 0,
            planned_hours_total: data.scheduleResourceAssignments.filter((assignment: any) => assignment.resource_id === resource.id).reduce((sum: number, assignment: any) => sum + (Number(assignment.planned_hours) || 0), 0),
            planned_cost_total: data.scheduleResourceAssignments.filter((assignment: any) => assignment.resource_id === resource.id).reduce((sum: number, assignment: any) => sum + (Number(assignment.planned_cost) || 0), 0),
            planned_peak_load_hours: plannedPeak?.allocatedHours || 0,
            planned_peak_overallocation_hours: plannedPeakOver?.overAllocatedHours || 0,
            load_status: !resourceLoads.length && !resourcePlannedLoads.length ? 'No Recorded Load' : (peakOver?.overAllocatedHours || 0) > 0 || (plannedPeakOver?.overAllocatedHours || 0) > 0 ? 'Over-allocated' : 'Within Capacity',
          };
        });
      })()
      : activeView === 'baselines'
      ? rawViewData.map((baseline: any) => {
        const activities = data.schedules.filter((activity: any) => activity.contract_id === baseline.contract_id && String(activity.activity || '').trim());
        const snapshotSummary = summarizeBaselineSchedule(baseline.activity_snapshot);
        const activityComparison = compareBaselineActivities(baseline.activity_snapshot, activities);
        const activityDetails = compareBaselineActivityDetails(baseline.activity_snapshot, activities);
        const activityStarts = activities
          .map((activity: any) => String(activity.start_date || ''))
          .filter(Boolean)
          .sort();
        const activityEnds = data.schedules
          .filter((activity: any) => activity.contract_id === baseline.contract_id && String(activity.activity || '').trim())
          .map((activity: any) => String(activity.forecast_end_date || activity.end_date || ''))
          .filter(Boolean)
          .sort();
        const currentStart = activityStarts[0] || null;
        const currentFinish = activityEnds[activityEnds.length - 1] || null;
        const startVariance = baseline.planned_start_date && currentStart
          ? Math.ceil((new Date(`${currentStart}T00:00:00`).getTime() - new Date(`${baseline.planned_start_date}T00:00:00`).getTime()) / 86400000)
          : null;
        const finishVariance = baseline.planned_end_date && currentFinish
          ? Math.ceil((new Date(`${currentFinish}T00:00:00`).getTime() - new Date(`${baseline.planned_end_date}T00:00:00`).getTime()) / 86400000)
          : null;
        const currentBudget = activities.reduce((sum: number, activity: any) => sum + (Number(activity.budget) || 0), 0);
        const baselineActivityCount = snapshotSummary.activity_count || Number(baseline.baseline_activity_count) || 0;
        const baselineCriticalCount = snapshotSummary.critical_activity_count || Number(baseline.baseline_critical_activity_count) || 0;
        return {
          ...baseline,
          planned_start_date: snapshotSummary.planned_start_date || baseline.planned_start_date,
          planned_end_date: snapshotSummary.planned_end_date || baseline.planned_end_date,
          planned_budget: snapshotSummary.planned_budget || baseline.planned_budget,
          baseline_activity_count: baselineActivityCount,
          baseline_critical_activity_count: baselineCriticalCount,
          current_activity_count: activities.length,
          activity_count_variance: activities.length - baselineActivityCount,
          added_activity_count: activityComparison.addedActivityCount,
          removed_activity_count: activityComparison.removedActivityCount,
          changed_activity_count: activityComparison.changedActivityCount,
          variance_register_status: !Array.isArray(baseline.activity_snapshot) || baseline.activity_snapshot.length === 0
            ? 'No frozen activity snapshot'
            : `${activityDetails.filter((row) => row.status !== 'Unchanged').length} exception(s) — open Variance Register`,
          critical_path_variance: activityComparison.criticalPathVariance,
          current_schedule_start: currentStart,
          current_schedule_finish: currentFinish,
          start_variance_days: startVariance,
          finish_variance_days: finishVariance,
          current_schedule_budget: currentBudget,
          budget_variance: currentBudget - (snapshotSummary.planned_budget || Number(baseline.planned_budget) || 0),
        };
      })
      : activeView === 'contracts'
      ? contractsWithModifiedValue
      : activeView === 'cashflow'
        ? (() => {
          const running = new Map<string, number>();
          return [...rawViewData]
            .sort((left: any, right: any) => `${left.date || '9999-12-31'}:${left.id}`.localeCompare(`${right.date || '9999-12-31'}:${right.id}`))
            .map((entry: any) => {
              const key = `${entry.project_id || ''}:${entry.movement_type || 'Manual'}`;
              const prior = running.get(key) || 0;
              const active = !['Cancelled', 'Reversed'].includes(String(entry.status || ''));
              const net = Math.round(((Number(entry.inflow) || 0) - (Number(entry.outflow) || 0)) * 100) / 100;
              const cumulative = Math.round((prior + (active ? net : 0)) * 100) / 100;
              running.set(key, cumulative);
              return { ...entry, net, cumulative_balance: cumulative };
            });
        })()
      : (activeView === 'procurement' || activeView === 'procurementReconciliation')
        ? rawViewData.map((po: any) => {
          const acceptedReceipts = data.procurementReceipts
            .filter((receipt: any) => receipt.procurement_id === po.id && receipt.status === 'Accepted');
          const acceptedQuantity = acceptedReceipts.reduce((sum: number, receipt: any) => sum + (Number(receipt.accepted_quantity) || 0), 0);
          const actualCost = Math.round(acceptedReceipts.reduce(
            (sum: number, receipt: any) => sum + (Number(receipt.accepted_amount) || ((Number(receipt.accepted_quantity) || 0) * (Number(receipt.unit_cost) || 0))),
            0,
          ) * 100) / 100;
          const commitment = Number(po.total_cost) || ((Number(po.quantity) || 0) * (Number(po.unit_cost) || 0));
          const effectiveLines = data.supplierInvoiceLines.filter((line: any) => line.procurement_id === po.id && !['Cancelled', 'Rejected', 'Voided'].includes(String((data.supplierInvoices.find((invoice: any) => invoice.id === line.supplier_invoice_id) as any)?.status || 'Draft')));
          const approvedInvoices = new Set(data.supplierInvoices.filter((invoice: any) => ['Approved', 'Partially Paid', 'Paid'].includes(String(invoice.status || ''))).map((invoice: any) => invoice.id));
          const invoicedAmount = effectiveLines.filter((line: any) => approvedInvoices.has(line.supplier_invoice_id)).reduce((sum: number, line: any) => sum + (Number(line.goods_amount) || 0), 0);
          const paidAmount = data.supplierInvoicePayments.filter((payment: any) => payment.status === 'Settled' && approvedInvoices.has(payment.supplier_invoice_id) && effectiveLines.some((line: any) => line.supplier_invoice_id === payment.supplier_invoice_id)).reduce((sum: number, payment: any) => sum + (Number(payment.amount) || 0), 0);
          const openApAmount = Math.max(0, Math.round((invoicedAmount - paidAmount) * 100) / 100);
          return { ...po, accepted_quantity: acceptedQuantity, actual_cost: actualCost, open_commitment: Math.max(0, Math.round((commitment - actualCost) * 100) / 100), invoiced_amount: Math.round(invoicedAmount * 100) / 100, paid_amount: Math.round(paidAmount * 100) / 100, open_ap_amount: openApAmount };
        })
      : activeView === 'supplierInvoices'
        ? rawViewData.map((invoice: any) => {
          const lines = data.supplierInvoiceLines.filter((line: any) => line.supplier_invoice_id === invoice.id);
          const goodsAmount = Math.round(lines.reduce((sum: number, line: any) => sum + (Number(line.goods_amount) || 0), 0) * 100) / 100;
          const lineTax = lines.reduce((sum: number, line: any) => sum + (Number(line.tax_amount) || 0), 0);
          const net = Math.round((goodsAmount + lineTax + (Number(invoice.tax_amount) || 0) - (Number(invoice.deductions_amount) || 0)) * 100) / 100;
          const paid = data.supplierInvoicePayments.filter((payment: any) => payment.supplier_invoice_id === invoice.id && payment.status === 'Settled').reduce((sum: number, payment: any) => sum + (Number(payment.amount) || 0), 0);
          return { ...invoice, goods_amount: goodsAmount, net_payable_amount: net, paid_amount: paid, open_payable_amount: Math.max(0, net - paid) };
        })
      : activeView === 'contractSov'
        ? rawViewData.map((line: any) => {
          const contract = contractById.get(line.contract_id) as any;
          const approvedVariationValue = data.variationLines
            .filter((variationLine: any) => {
              const variation = data.variations.find((candidate: any) => candidate.id === variationLine.variation_id);
              return variation?.status === 'Approved'
                && variationLine.contract_id === line.contract_id
                && variationLine.boq_item_id === line.boq_item_id;
            })
            .reduce((sum: number, variationLine: any) => sum + (Number(variationLine.value_impact) || 0), 0);
          const approvedCostChangeValue = data.costChanges
            .filter((change: any) => change.contract_id === line.contract_id && costChangeAppliesToSovLine(change, line))
            .reduce((sum: number, change: any) => sum + (Number(change.amount) || 0), 0);
          const committedCost = data.procurement
            .filter((entry: any) => entry.contract_id === line.contract_id && entry.boq_item_id === line.boq_item_id
              && ['Approved', 'Ordered', 'Partially Delivered', 'Delivered', 'Closed'].includes(String(entry.status || '')))
            .reduce((sum: number, entry: any) => sum + (Number(entry.total_cost) || ((Number(entry.quantity) || 0) * (Number(entry.unit_cost) || 0))), 0);
          const procurementActual = data.costEntries
            .filter((entry: any) => entry.contract_id === line.contract_id && entry.boq_item_id === line.boq_item_id
              && String(entry.source_type || '') === 'procurement_receipt')
            .reduce((sum: number, entry: any) => sum + (Number(entry.amount) || 0), 0);
          const otherActual = data.costEntries
            .filter((entry: any) => entry.contract_id === line.contract_id && entry.boq_item_id === line.boq_item_id)
            .filter((entry: any) => String(entry.source_type || '') !== 'procurement_receipt')
            .reduce((sum: number, entry: any) => sum + (Number(entry.amount) || 0), 0);
          const forecast = calculateSovCostForecast({
            originalBudget: Number(line.original_budget) || 0,
            approvedVariations: approvedVariationValue,
            approvedCostChanges: approvedCostChangeValue,
            procurementCommitment: committedCost,
            procurementActual,
            otherActual,
            manualForecastOverride: Number(line.forecast_override) || 0,
          });
          const availability = calculateBudgetAvailability({ revisedBudget: forecast.revisedBudget, actualCost: forecast.actualCost, openCommitment: forecast.openCommitment });
          return {
            ...line,
            contract_role: contract?.contract_role || 'Main Contract',
            contract_number: contract?.contract_number || '',
            approved_variation_value: Math.round(approvedVariationValue * 100) / 100,
            approved_cost_change_value: Math.round(approvedCostChangeValue * 100) / 100,
            revised_budget: forecast.revisedBudget,
            committed_cost: forecast.procurementCommitment,
            actual_cost: forecast.actualCost,
            open_commitment: forecast.openCommitment,
            assigned_value: availability.assignedValue,
            available_budget: availability.availableBudget,
            availability_status: availability.status,
            forecast_at_completion: forecast.forecastAtCompletion,
            cost_to_complete: forecast.costToComplete,
            forecast_variance: forecast.forecastVariance,
          };
        })
      : activeView === 'paymentCertificates'
        ? rawViewData.map((certificate: any) => {
          const values = calculateCertificateValues(certificate);
          const contract = contractById.get(certificate.contract_id) as any;
          return {
            ...certificate,
            contract_role: contract?.contract_role || 'Main Contract',
            ...values,
          };
        })
      : activeView === 'boq'
        ? headersWithContractContext.map((header: any) => ({
          ...header,
          total_value: data.boqItems
            .filter((item: any) => item.boq_header_id === header.id)
            .reduce((sum: number, item: any) => sum + ((Number(item.quantity) || 0) * (Number(item.unit_rate) || 0)), 0),
          }))
        : activeView === 'boqItems'
          ? rawViewData.map((item: any) => {
            const header = headerById.get(item.boq_header_id) as any;
            return {
              ...item,
              project_id: item.project_id || header?.project_id || null,
              contract_id: item.contract_id || header?.contract_id || null,
              company_name: item.company_name || header?.company_name || '',
              contract_role: header?.contract_role || 'Main Contract',
            };
          })
        : activeView === 'variations'
          ? rawViewData.map((variation: any) => {
            const contract = contractById.get(variation.contract_id) as any;
            return { ...variation, contractor: contract?.contractor || '', contract_role: contract?.contract_role || 'Main Contract' };
          })
        : activeView === 'wir'
          ? derivedWirs
        : activeView === 'schedule'
          ? rawViewData.map((schedule: any) => {
            const scheduleContract = contractById.get(schedule.contract_id) as any;
            const mainContractId = scheduleContract?.parent_main_contract_id || schedule.contract_id;
            const scheduleItem = data.boqItems.find((item: any) => item.id === schedule.boq_item_id) as any;
            const mainItemId = scheduleItem?.main_boq_item_id || scheduleItem?.id;
            const mainItem = mainItemId ? data.boqItems.find((item: any) => item.id === mainItemId) as any : null;
            const plannedQuantity = Number(schedule.planned_quantity) || 0;
            // One BOQ item can be split across many activities. Allocate the
            // item-level EV and actual cost by PV-to-date so activity rows
            // add up to the BOQ/control total without duplication.
            const itemRows = data.schedules
              .filter((activity: any) => activity.project_id === schedule.project_id && activity.boq_item_id === schedule.boq_item_id);
            const childActivities = itemRows.filter((activity: any) => String(activity.activity || '').trim());
            const isSummaryRow = !String(schedule.activity || '').trim();
            const activitiesForItem = childActivities.length > 0 ? childActivities : itemRows;
            const reportDate = unifiedDataDate;
            // EV and AC are allocated only among activities which have a PV
            // at the report date. Budget is never used as the allocation key.
            const itemPVToDate = activitiesForItem
              .reduce((sum: number, activity: any) => sum + distributedPlannedValueToDate(activity, data.scheduleDistributions as Record<string, any>[], reportDate), 0);
            const activityPVToDate = distributedPlannedValueToDate(schedule, data.scheduleDistributions as Record<string, any>[], reportDate);
            const allocation = isSummaryRow && childActivities.length > 0
              ? 1
              : itemPVToDate > 0 ? activityPVToDate / itemPVToDate : 0;
            const earnedWorkValue = derivedWirs
              .filter((wir: any) => {
                const wirContract = contractById.get(wir.contract_id) as any;
                const wirItem = data.boqItems.find((item: any) => item.id === wir.boq_item_id) as any;
                return (wirContract?.parent_main_contract_id || wir.contract_id) === mainContractId &&
                  (wirItem?.main_boq_item_id || wirItem?.id) === mainItemId;
              })
              .reduce((sum: number, wir: any) => sum + ((Number(wir.quantity) || 0) * (Number(mainItem?.unit_rate) || 0)), 0);
            const costControl = data.costs.find((cost: any) =>
              cost.project_id === schedule.project_id &&
              cost.contract_id === mainContractId &&
              cost.boq_item_id === mainItemId,
            ) as any;
            const actualLaborHours = data.laborDuty
              .filter((entry: any) => entry.schedule_id === schedule.id)
              .reduce((sum: number, entry: any) => sum + (Number(entry.total_hours) || ((Number(entry.no_of_workers) || 0) * (Number(entry.hours_per_day) || 0) * (Number(entry.days) || 0))), 0);
            const linkedEquipmentRecords = data.equipment.filter((entry: any) => entry.schedule_id === schedule.id).length;
            // A WIR can now be assigned to one activity. This creates a
            // traceable actual-quantity denominator for productivity instead
            // of allocating physical production across activities by value.
            const directWirQuantity = derivedWirs
              .filter((wir: any) => wir.schedule_id === schedule.id)
              .reduce((sum: number, wir: any) => sum + (Number(wir.quantity) || 0), 0);
            const earned = Math.round(earnedWorkValue * allocation * 100) / 100;
            const actualCost = Math.round((Number(costControl?.actual) || 0) * allocation * 100) / 100;
            const budget = isSummaryRow && childActivities.length > 0
              ? childActivities.reduce((sum: number, activity: any) => sum + scheduleBudget(activity), 0)
              : scheduleBudget(schedule);
            const plannedValue = isSummaryRow && childActivities.length > 0
              ? childActivities.reduce((sum: number, activity: any) => sum + distributedPlannedValueToDate(activity, data.scheduleDistributions as Record<string, any>[]), 0)
              : distributedPlannedValueToDate(schedule, data.scheduleDistributions as Record<string, any>[]);
            const summaryQuantity = isSummaryRow && childActivities.length > 0
              ? childActivities.reduce((sum: number, activity: any) => sum + (Number(activity.planned_quantity) || 0), 0)
              : plannedQuantity;
            // The BOQ date is the governed plan. Child activities are execution
            // forecasts and must not silently rewrite the controlled BOQ date.
            const governedStart = mainItem?.planned_start_date || mainItem?.baseline_start_date || schedule.start_date;
            const governedEnd = mainItem?.planned_end_date || mainItem?.baseline_end_date || schedule.end_date;
            const summaryStart = isSummaryRow ? governedStart : schedule.start_date;
            const childEndDates = childActivities.map((activity: any) => String(activity.end_date || '')).filter(Boolean).sort();
            const forecastEnd = childEndDates[childEndDates.length - 1] || '';
            const summaryEnd = isSummaryRow ? governedEnd : schedule.end_date;
            const summaryDuration = isSummaryRow && childActivities.length > 0
              ? childActivities.reduce((sum: number, activity: any) => sum + (Number(activity.duration_days) || 0), 0)
              : (Number(schedule.duration_days) || 0);
            const calendarSpan = summaryStart && summaryEnd
              ? Math.max(0, Math.ceil((new Date(`${summaryEnd}T00:00:00`).getTime() - new Date(`${summaryStart}T00:00:00`).getTime()) / 86400000))
              : 0;
            const calendarGapDays = isSummaryRow && childActivities.length > 0
              ? calendarSpan - summaryDuration
              : 0;
            const revisedFinish = scheduleContract?.revised_end_date || scheduleContract?.end_date;
            const reportedFinish = isSummaryRow ? forecastEnd || governedEnd : schedule.forecast_end_date || schedule.end_date;
            const boqDelay = isSummaryRow && forecastEnd && governedEnd && forecastEnd > governedEnd
              ? `Delayed against BOQ plan: forecast ${forecastEnd}, governed finish ${governedEnd}`
              : '';
            const dateAlert = revisedFinish && reportedFinish && String(reportedFinish) > revisedFinish
              ? `⚠ Delayed: finishes after revised contract end (${revisedFinish})`
              : scheduleContract?.end_date && reportedFinish && String(reportedFinish) > String(scheduleContract.end_date)
                ? `ℹ Uses approved time extension to ${revisedFinish || schedule.end_date}`
                : '';
            const cpi = actualCost > 0 ? earned / actualCost : null;
            const spi = plannedValue > 0 ? earned / plannedValue : null;
            const summaryLaborHours = isSummaryRow
              ? childActivities.reduce((sum: number, activity: any) => sum + (Number(activity.planned_labor_hours) || 0), 0)
              : Number(schedule.planned_labor_hours) || 0;
            const summaryActualLaborHours = isSummaryRow
              ? childActivities.reduce((sum: number, activity: any) => sum + data.laborDuty.filter((entry: any) => entry.schedule_id === activity.id).reduce((hours: number, entry: any) => hours + (Number(entry.total_hours) || ((Number(entry.no_of_workers) || 0) * (Number(entry.hours_per_day) || 0) * (Number(entry.days) || 0))), 0), 0)
              : actualLaborHours;
            const summaryActualQuantity = isSummaryRow
              ? childActivities.reduce((sum: number, activity: any) => sum + derivedWirs.filter((wir: any) => wir.schedule_id === activity.id).reduce((quantity: number, wir: any) => quantity + (Number(wir.quantity) || 0), 0), 0)
              : directWirQuantity;
            const productivity = calculateProductivityMetrics({ plannedQuantity: summaryQuantity, plannedLaborHours: summaryLaborHours, actualQuantity: summaryActualQuantity, actualLaborHours: summaryActualLaborHours });
            const network = cpmByActivity.get(schedule.id);
            // Remaining duration is a planner-controlled status value, not an
            // EVM percentage.  Old rows retain the former derived fallback
            // until the planner records an actual status update.
            const derivedRemaining = budget > 0
              ? Math.max(0, Math.round(summaryDuration * (1 - Math.min(1, earned / budget))))
              : summaryDuration;
            const activityRemaining = (activity: any) => {
              if (String(activity.activity_status || '') === 'Completed') return 0;
              const recorded = Number(activity.remaining_duration_days);
              return Number.isFinite(recorded) && recorded >= 0 ? recorded : Math.max(0, Number(activity.duration_days) || 0);
            };
            const remainingDuration = isSummaryRow && childActivities.length > 0
              ? childActivities.reduce((sum: number, activity: any) => sum + activityRemaining(activity), 0)
              : (Object.prototype.hasOwnProperty.call(schedule, 'remaining_duration_days')
                ? activityRemaining(schedule)
                : derivedRemaining);
            const costState = actualCost <= budget ? 'Under Budget' : 'Over Budget';
            const scheduleState = spi === null ? 'No Planned Value' : spi >= 1 ? 'Ahead of Schedule' : 'Behind Schedule';
            return {
              ...schedule,
              is_summary_row: isSummaryRow,
              activity: isSummaryRow ? `BOQ Total — ${schedule.boq_item_name || mainItem?.item_name || ''}` : schedule.activity,
              start_date: summaryStart,
              end_date: summaryEnd,
              duration_days: summaryDuration,
              actual_labor_hours: summaryActualLaborHours,
              linked_equipment_records: isSummaryRow ? childActivities.reduce((sum: number, activity: any) => sum + data.equipment.filter((entry: any) => entry.schedule_id === activity.id).length, 0) : linkedEquipmentRecords,
              planned_productivity: productivity.plannedProductivity,
              actual_work_quantity: summaryActualQuantity,
              actual_productivity: productivity.actualProductivity,
              productivity_variance_pct: productivity.variancePct,
              remaining_duration_days: remainingDuration,
              unit_rate: Number(mainItem?.unit_rate) || Number(schedule.unit_rate) || 0,
              budget,
              planned_quantity: summaryQuantity,
              planned_value: plannedValue,
              // Same rule as Cost Control: main and subcontract WIRs are
              // valued at the linked main-contract BOQ item rate.
              earned_work_value: earned,
              actual_cost: actualCost,
              cost_cpi: cpi,
              schedule_spi: spi,
              total_float_days: isSummaryRow ? null : network?.totalFloat ?? null,
              network_critical: isSummaryRow ? false : Boolean(network?.critical),
              network_warning: isSummaryRow ? '' : network?.cycle ? 'Dependency cycle detected' : '',
              forecast_start_date: isSummaryRow ? null : schedule.forecast_start_date || null,
              forecast_end_date: isSummaryRow ? forecastEnd || null : schedule.forecast_end_date || null,
              status: `${calendarGapDays !== 0 ? `Calendar ${calendarGapDays > 0 ? 'gap' : 'overlap'}: ${Math.abs(calendarGapDays)} day(s) | ` : ''}${boqDelay ? `${boqDelay} | ` : ''}${dateAlert ? `${dateAlert} | ` : ''}${costState} | ${scheduleState} | CPI ${cpi === null ? 'N/A' : cpi.toFixed(2)} | SPI ${spi === null ? 'N/A' : spi.toFixed(2)}`,
            };
          })
        : activeView === 'progress'
          ? contractsWithModifiedValue.map((contract: any) => ({
            id: `progress-${contract.id}`,
            project_id: contract.project_id,
            contract_id: contract.id,
            company_name: contract.contractor || '',
            // The main contract is the authoritative source of the project
            // reporting period because it creates the project.
            start_date: contract.start_date || null,
            end_date: contract.end_date || null,
            contract_value: contract.modified_contract_value,
            contract_role: contract.contract_role,
          }))
        : rawViewData;
    const navItem = NAV_ITEMS.find((n) => n.key === activeView);
    const projectCodeBackedTables = new Set([
      'costs', 'cost_entries', 'progress_entries', 'schedules', 'boq_headers',
      'boq_items', 'wir_entries', 'labor_duty', 'equipment',
    ]);

    const autoFillOptions: Record<string, string[]> = {};
    const relationshipOptions: Record<string, SelectOption[]> = {};
    const projectById = new Map(data.projects.map((project) => [project.id, project]));

    relationshipOptions.project_id = data.projects.map((project) => ({
      value: project.id,
      label: `${project.project_code || project.id} - ${project.name}`,
      data: {
        project_code: project.project_code,
        client: project.client,
        contractor: project.contractor,
      },
    }));
    relationshipOptions.cost_code_id = data.costCodes
      .filter((code: any) => code.status !== 'Inactive')
      .map((code: any) => ({ value: code.id, label: `${code.cost_code || code.id} — ${code.name || 'Unnamed cost code'}`, data: { project_id: code.project_id, cost_code: code.cost_code, cost_code_name: code.name, classification: code.classification, cbs_level: code.cbs_level } }));
    relationshipOptions.parent_cost_code_id = relationshipOptions.cost_code_id;
    relationshipOptions.contract_sov_line_id = data.contractSovLines
      .filter((line: any) => line.status !== 'Closed')
      .map((line: any) => ({
        value: line.id,
        label: `${line.sov_line_code || line.id} — ${line.description || 'Unnamed SOV line'}`,
        data: {
          project_id: line.project_id, contract_id: line.contract_id, boq_header_id: line.boq_header_id,
          boq_item_id: line.boq_item_id, cost_code_id: line.cost_code_id,
        },
      }));
    relationshipOptions.transfer_from_sov_line_id = relationshipOptions.contract_sov_line_id;
    relationshipOptions.control_account_id = data.controlAccounts
      .filter((account: any) => account.status !== 'Inactive' && account.status !== 'Closed')
      .map((account: any) => ({
        value: account.id,
        label: `${account.control_account_code || account.id} — ${account.description || 'Unnamed control account'}`,
        data: {
          project_id: account.project_id, contract_id: account.contract_id, wbs_id: account.wbs_id,
          boq_item_id: account.boq_item_id, cost_code_id: account.cost_code_id,
          contract_sov_line_id: account.contract_sov_line_id, control_account_code: account.control_account_code,
        },
      }));
    relationshipOptions.wbs_id = data.wbsNodes
      .filter((node: any) => node.status !== 'Inactive')
      .map((node: any) => ({ value: node.id, label: `${node.wbs_code || node.id} — ${node.name || 'Unnamed WBS'}`, data: { project_id: node.project_id, contract_id: node.contract_id, wbs_code: node.wbs_code, wbs_level: node.wbs_level } }));
    relationshipOptions.parent_wbs_id = relationshipOptions.wbs_id;
    relationshipOptions.party_id = data.parties
      .filter((party: any) => party.status !== 'Inactive')
      .map((party: any) => ({
        value: party.id,
        label: `${party.party_code || 'PTY'} - ${party.legal_name || party.trading_name || party.id}`,
        data: { party_code: party.party_code, legal_name: party.legal_name, party_type: party.party_type },
      }));
    relationshipOptions.client_party_id = data.parties
      .filter((party: any) => party.party_type === 'Client' && party.status !== 'Inactive')
      .map((party: any) => ({ value: party.id, label: `${party.party_code || 'PTY'} - ${party.legal_name}`, data: { client: party.legal_name } }));
    relationshipOptions.contractor_party_id = data.parties
      .filter((party: any) => ['Contractor', 'Subcontractor', 'Supplier', 'Consultant'].includes(party.party_type) && party.status !== 'Inactive')
      .map((party: any) => ({ value: party.id, label: `${party.party_code || 'PTY'} - ${party.legal_name}`, data: { contractor: party.legal_name } }));
    relationshipOptions.supplier_party_id = data.parties
      .filter((party: any) => party.party_type === 'Supplier' && party.status !== 'Inactive')
      .map((party: any) => ({ value: party.id, label: `${party.party_code || 'PTY'} - ${party.legal_name}`, data: { supplier: party.legal_name } }));
    relationshipOptions.contract_id = data.contracts.map((contract) => ({
      value: contract.id,
      // Contract Code selectors must show the business code only. Project
      // names remain available in their own column and are never persisted as
      // an identifier.
      label: contract.contract_number || contract.id,
      data: {
        project_id: contract.project_id,
        project_code: projectById.get(contract.project_id)?.project_code,
        client: contract.client,
        company_name: contract.company || contract.contractor,
        contractor: contract.contractor,
        contract_number: contract.contract_number,
        parent_main_contract_id: contract.parent_main_contract_id,
        contract_role: contract.parent_main_contract_id ? 'Subcontract' : 'Main Contract',
        variation_number: (() => {
          const prefix = `${contract.contract_number || 'CNT'}-VO-`;
          const existing = data.variations
            .filter((variation: any) => variation.contract_id === contract.id)
            .map((variation: any) => Number(String(variation.variation_number || '').replace(prefix, '')) || 0);
          return `${prefix}${String(Math.max(0, ...existing) + 1).padStart(3, '0')}`;
        })(),
      },
    }));
    relationshipOptions.original_wir_id = data.wirEntries
      .filter((wir: any) => wir.status === 'Approved' || ['Pass', 'Conditional Pass'].includes(String(wir.result || '')))
      .map((wir: any) => ({
        value: wir.id,
        label: `${wir.wir_number || wir.id} — ${wir.item_code || wir.boq_item_id || 'BOQ item'}`,
        data: {
          project_id: wir.project_id, contract_id: wir.contract_id, boq_header_id: wir.boq_header_id,
          boq_item_id: wir.boq_item_id, unit: wir.unit, original_wir_number: wir.wir_number,
        },
      }));
    relationshipOptions.procurement_id = data.procurement
      .filter((po: any) => !['Draft', 'Cancelled'].includes(String(po.status || 'Draft')))
      .map((po: any) => ({
        value: po.id,
        label: po.purchase_order_number || po.id,
        data: {
          project_id: po.project_id, contract_id: po.contract_id, boq_header_id: po.boq_header_id,
          boq_item_id: po.boq_item_id, supplier: po.supplier, item: po.item, unit: po.unit,
          unit_cost: po.unit_cost, cost_code_id: po.cost_code_id, quantity: po.quantity,
        },
      }));
    relationshipOptions.supplier_invoice_id = data.supplierInvoices
      .filter((invoice: any) => !['Cancelled', 'Rejected', 'Paid'].includes(String(invoice.status || 'Draft')))
      .map((invoice: any) => ({
        value: invoice.id,
        label: `${invoice.invoice_number || invoice.id} — ${invoice.supplier || 'Supplier'}`,
        data: { project_id: invoice.project_id, contract_id: invoice.contract_id, supplier_party_id: invoice.supplier_party_id, supplier: invoice.supplier, invoice_date: invoice.invoice_date, status: invoice.status },
      }));
    relationshipOptions.procurement_receipt_id = data.procurementReceipts
      .filter((receipt: any) => receipt.status === 'Accepted')
      .map((receipt: any) => ({
        value: receipt.id,
        label: `${receipt.receipt_number || receipt.id} — ${receipt.supplier || 'Supplier'}`,
        data: { project_id: receipt.project_id, contract_id: receipt.contract_id, boq_header_id: receipt.boq_header_id, boq_item_id: receipt.boq_item_id, procurement_id: receipt.procurement_id, supplier: receipt.supplier, supplier_party_id: data.procurement.find((po: any) => po.id === receipt.procurement_id)?.supplier_party_id || null, quantity: receipt.accepted_quantity, unit_cost: receipt.unit_cost, accepted_unit_cost: receipt.unit_cost, accepted_amount: receipt.accepted_amount, receipt_date: receipt.receipt_date },
      }));
    relationshipOptions.variation_id = data.variations
      .filter((variation: any) => !['Approved', 'Rejected'].includes(String(variation.status || 'Draft')))
      .map((variation: any) => ({
        value: variation.id,
        label: `${variation.variation_number || variation.id} — ${variation.title || 'Untitled variation'}`,
        data: {
          project_id: variation.project_id,
          contract_id: variation.contract_id,
          variation_number: variation.variation_number || variation.id,
          approved_date: variation.approved_date || null,
        },
      }));
    relationshipOptions.invoice_tracking_id = [
      ...(data.clientInvoiceTracking as Record<string, any>[]).map((row) => ({
        value: row.id,
        label: `Client — ${row.invoice_number || row.id}`,
        data: { project_id: row.project_id, contract_id: row.contract_id, certificate_type: 'Client', gross_certified_value: row.total_work_value || 0 },
      })),
      ...(data.subcontractorInvoiceTracking as Record<string, any>[]).map((row) => ({
        value: row.id,
        label: `Subcontractor — ${row.invoice_number || row.id}`,
        data: { project_id: row.project_id, contract_id: row.contract_id, certificate_type: 'Subcontractor', gross_certified_value: row.total_work_value || 0 },
      })),
    ];
    if (activeView === 'wir') {
      relationshipOptions.company_name = data.contracts.map((contract: any) => ({
        value: contract.id,
        label: contract.contractor || contract.contract_number || contract.id,
        data: {
          contract_id: contract.id,
          project_id: contract.project_id,
          project_code: projectById.get(contract.project_id)?.project_code,
          contract_role: contract.parent_main_contract_id ? 'Subcontract' : 'Main Contract',
          contract_number: contract.contract_number,
          company_name: contract.contractor || '',
        },
      }));
    }
    if (activeView === 'clientinvoices') {
      relationshipOptions.contract_id = relationshipOptions.contract_id.filter((option) => {
        const contract = data.contracts.find((item) => item.id === option.value);
        return contract && !contract.parent_main_contract_id;
      });
    }
    if (activeView === 'subinvoices') {
      relationshipOptions.contract_id = relationshipOptions.contract_id.filter((option) => {
        const contract = data.contracts.find((item) => item.id === option.value);
        return contract && Boolean(contract.parent_main_contract_id);
      });
    }
    relationshipOptions.boq_header_id = data.boqHeaders.map((header) => ({
      value: header.id,
      label: `${header.classification || 'BOQ'} - ${header.company_name || 'Unassigned contractor'}`,
      data: {
        project_id: header.project_id,
        contract_id: header.contract_id,
        project_code: header.project_code,
        boq_code: header.boq_code,
        company_name: header.company_name,
        contract_role: contractById.get(header.contract_id)?.contract_role || 'Main Contract',
      },
    }));
    relationshipOptions.main_boq_item_id = data.boqItems
      .filter((item: any) => mainBoqItemById.has(item.id))
      .map((item: any) => ({
        value: item.id,
        label: `${item.item_code || item.id} - ${item.item_name || item.description}`,
        data: {
          project_id: item.project_id,
          unit: item.unit,
          main_boq_item_code: item.item_code,
          main_unit_rate: item.unit_rate,
          main_boq_item_value: (Number(item.quantity) || 0) * (Number(item.unit_rate) || 0),
        },
      }));
    relationshipOptions.boq_item_id = data.boqItems.map((item) => ({
      value: item.id,
      label: `${item.item_code || item.id} - ${item.item_name || item.description}`,
      data: {
        project_id: item.project_id,
        boq_header_id: item.boq_header_id,
        contract_id: data.boqHeaders.find((header) => header.id === item.boq_header_id)?.contract_id || null,
        project_code: item.project_code,
        boq_code: item.boq_code,
        item_code: item.item_code,
        boq_item_code: item.item_code,
        item_name: item.item_name,
        boq_item_name: item.item_name,
        item_desc: item.item_name || item.description,
        item_description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        unit_rate: item.unit_rate,
        unit_price: (() => {
          const itemHeader = data.boqHeaders.find((header) => header.id === item.boq_header_id);
          const itemContract = data.contracts.find((contract) => contract.id === itemHeader?.contract_id);
          const mainContract = itemContract?.parent_main_contract_id
            ? data.contracts.find((contract) => contract.id === itemContract.parent_main_contract_id)
            : itemContract;
          const mainHeaderIds = new Set(data.boqHeaders.filter((header) => header.contract_id === mainContract?.id).map((header) => header.id));
          const mainItem = item.main_boq_item_id
            ? mainBoqItemById.get(item.main_boq_item_id)
            : data.boqItems.find((candidate) => Boolean(candidate.boq_header_id) && mainHeaderIds.has(candidate.boq_header_id as string) &&
              (candidate.item_code === item.item_code || candidate.item_name === item.item_name));
          return mainItem?.unit_rate ?? item.unit_rate;
        })(),
        main_boq_item_id: item.main_boq_item_id || null,
        main_boq_item_value: (() => {
          const mainItem = item.main_boq_item_id ? mainBoqItemById.get(item.main_boq_item_id) : item;
          return (Number(mainItem?.quantity) || 0) * (Number(mainItem?.unit_rate) || 0);
        })(),
      },
    }));
    relationshipOptions.predecessor_item = data.schedules.map((activity: any) => ({
      value: activity.id,
      label: `${activity.activity_code || 'ACT'} - ${activity.activity || activity.id}`,
      data: { project_id: activity.project_id, contract_id: activity.contract_id },
    }));
    relationshipOptions.schedule_id = data.schedules
      .filter((activity: any) => String(activity.activity || '').trim())
      .map((activity: any) => {
        const item = data.boqItems.find((candidate: any) => candidate.id === activity.boq_item_id) as any;
        return {
          value: activity.id,
          label: `${activity.activity_code || 'ACT'} - ${activity.activity}`,
          data: {
            project_id: activity.project_id, contract_id: activity.contract_id, boq_item_id: activity.boq_item_id,
            activity_name: activity.activity, unit: item?.unit || '', unit_rate: activity.unit_rate ?? item?.unit_rate ?? 0,
            start_date: activity.start_date, end_date: activity.end_date, planned_quantity: activity.planned_quantity,
          },
        };
      });
    relationshipOptions.resource_id = data.resourceMasters
      .filter((resource: any) => resource.status !== 'Inactive')
      .map((resource: any) => ({
        value: resource.id,
        label: `${resource.resource_code || 'RES'} — ${resource.resource_name || 'Unnamed resource'}`,
        data: {
          resource_type: resource.resource_type,
          worker_name: resource.resource_type === 'Labor' ? resource.resource_name : undefined,
          equipment_name: resource.resource_type === 'Equipment' ? resource.resource_name : undefined,
          role: resource.resource_type === 'Labor' ? resource.role_or_type : undefined,
          equipment_type: resource.resource_type === 'Equipment' ? resource.role_or_type : undefined,
          unit: resource.unit,
          standard_rate: resource.standard_rate || 0,
          rate_per_hour: resource.resource_type === 'Labor' ? resource.standard_rate : undefined,
          unit_rate: resource.resource_type === 'Equipment' ? resource.standard_rate : undefined,
        },
      }));
    relationshipOptions.calendar_id = data.workCalendars
      .filter((calendar: any) => calendar.status !== 'Inactive')
      .map((calendar: any) => ({
        value: calendar.id,
        label: `${calendar.calendar_code || 'CAL'} — ${calendar.calendar_name || calendar.working_pattern || 'Calendar'}`,
        data: {
          calendar_code: calendar.calendar_code || '',
          calendar_display_name: calendar.calendar_name || '',
          calendar_name: calendar.working_pattern || 'Calendar Days',
          calendar_exceptions: calendar.calendar_exceptions || '',
          calendar_working_days: calendar.calendar_working_days || '',
          calendar_hours_per_day: calendar.hours_per_day || 8,
          shift_definitions: calendar.shift_definitions || '',
        },
      }));
    relationshipOptions.supersedes_document_id = data.documents
      .filter((document: any) => document.is_current !== false && document.status !== 'Superseded')
      .map((document: any) => ({
        value: document.id,
        label: `${document.document_number || document.id} — ${document.document_name || 'Untitled document'}`,
        data: { project_id: document.project_id, contract_id: document.contract_id, document_number: document.document_number },
      }));
    if (activeView === 'costs' || activeView === 'costEntries' || activeView === 'schedule') {
      const mainContractIds = new Set(data.contracts
        .filter((contract: any) => !contract.parent_main_contract_id)
        .map((contract) => contract.id));
      // Costs are always loaded to the project/main-contract scope. A
      // subcontract is represented through its live WIR-derived cost entry.
      relationshipOptions.contract_id = relationshipOptions.contract_id
        .filter((option) => mainContractIds.has(option.value));
      relationshipOptions.boq_item_id = relationshipOptions.boq_item_id
        .filter((option) => mainContractIds.has(option.data?.contract_id));
    }
    if (activeView === 'schedule') {
      relationshipOptions.project_id = data.projects.map((project) => ({
        value: project.id,
        label: project.project_code || project.id,
        data: { project_code: project.project_code },
      }));
    }
    if (activeView === 'contracts') {
      relationshipOptions.parent_main_contract_id = data.contracts.filter((contract) => !contract.parent_main_contract_id).map((contract) => {
        const prefix = `${contract.contract_number || 'CNT'}-SUB-`;
        const existingSuffixes = data.contracts
          .filter((child) => child.parent_main_contract_id === contract.id)
          .map((child) => Number(String(child.contract_number || '').replace(prefix, '')) || 0);
        const nextChildNumber = Math.max(0, ...existingSuffixes) + 1;
        return {
        value: contract.id,
        label: contract.contract_number || contract.id,
        data: {
          project_id: contract.project_id,
          project_code: projectById.get(contract.project_id)?.project_code,
          client: contract.client,
          contractor: contract.contractor,
          project_name: contract.project_name,
          contract_number: `${prefix}${String(nextChildNumber).padStart(3, '0')}`,
        },
      };
      });
    }
    if (activeView === 'subinvoices') {
      autoFillOptions.subcontractor = [...new Set(data.subInvoices.map((r: any) => r.subcontractor).filter(Boolean))];
    }
    if (activeView === 'clientinvoices') {
      autoFillOptions.client = [...new Set(data.clientInvoices.map((r: any) => r.client).filter(Boolean))];
    }
    if (activeView === 'contracts') {
      autoFillOptions.client = data.parties.filter((party: any) => party.party_type === 'Client' && party.status !== 'Inactive').map((party: any) => party.legal_name);
      autoFillOptions.contractor = data.parties.filter((party: any) => party.party_type === 'Subcontractor' && party.status !== 'Inactive').map((party: any) => party.legal_name);
    }
    if (activeView === 'procurement') {
      autoFillOptions.supplier = data.parties.filter((party: any) => party.party_type === 'Supplier' && party.status !== 'Inactive').map((party: any) => party.legal_name);
    }
    if (activeView === 'laborDuty') {
      autoFillOptions.worker_name = [...new Set(data.laborDuty.map((r: any) => r.worker_name).filter(Boolean))];
      autoFillOptions.project_code = [...new Set(data.projects.map((r: any) => r.project_code).filter(Boolean))];
    }
    if (activeView === 'equipment') {
      autoFillOptions.equipment_name = [...new Set(data.equipment.map((r: any) => r.equipment_name).filter(Boolean))];
      autoFillOptions.project_code = [...new Set(data.projects.map((r: any) => r.project_code).filter(Boolean))];
    }

    const tailoredFormKeys: Record<string, string[]> = {
      boq_items: ['contract_id', 'boq_header_id', 'item_name', 'description', 'category', 'unit', 'quantity', 'unit_rate', 'waste_allowance_percent', 'planned_start_date', 'planned_end_date', 'notes'],
      schedules: ['contract_id', 'boq_item_id', 'activity', 'predecessor_item', 'relationship_type', 'lag_days', 'start_date', 'end_date', 'duration_days', 'activity_status', 'status_data_date', 'actual_start_date', 'actual_finish_date', 'remaining_duration_days', 'planned_quantity', 'calendar_name', 'critical_path', 'responsible', 'status', 'notes'],
      wir_entries: ['contract_id', 'boq_item_id', 'inspection_date', 'area', 'work_type', 'quantity', 'inspector', 'result', 'remarks', 'status'],
      progress_corrections: ['original_wir_id', 'correction_type', 'effective_date', 'quantity', 'reason', 'status'],
      cost_entries: ['contract_id', 'boq_item_id', 'date', 'cost_type', 'invoice_number', 'payment_order_number', 'amount'],
    };
    const tailoredFormColumns = tailoredFormKeys[tableName]
      ? config.columns.filter((column) => tailoredFormKeys[tableName].includes(column.key))
      : undefined;

    /** Controlled financial posting check. It intentionally applies only to a
     * mapped SOV line: unmapped/indirect spend is surfaced by Data Quality,
     * while a budget-carrying line receives a hard stop before posting. */
    const assertSovAvailabilityForPosting = (row: Record<string, any>, postingType: 'commitment' | 'actual') => {
      const matchingLines = data.contractSovLines.filter((line: any) => line.contract_id === row.contract_id
        && line.boq_item_id === row.boq_item_id && line.status !== 'Closed'
        && (!row.cost_code_id || !line.cost_code_id || line.cost_code_id === row.cost_code_id));
      const line = matchingLines.find((candidate: any) => candidate.cost_code_id === row.cost_code_id) || matchingLines[0];
      if (!line) return;
      const approvedVariationValue = data.variationLines
        .filter((variationLine: any) => {
          const variation = data.variations.find((candidate: any) => candidate.id === variationLine.variation_id);
          return variation?.status === 'Approved' && variationLine.contract_id === line.contract_id && variationLine.boq_item_id === line.boq_item_id;
        }).reduce((sum: number, variationLine: any) => sum + (Number(variationLine.value_impact) || 0), 0);
      const approvedCostChangeValue = data.costChanges
        .filter((change: any) => change.contract_id === line.contract_id && costChangeAppliesToSovLine(change, line as Record<string, any>))
        .reduce((sum: number, change: any) => sum + (Number(change.amount) || 0), 0);
      const priorCommitment = data.procurement
        .filter((entry: any) => entry.id !== row.id && entry.contract_id === line.contract_id && entry.boq_item_id === line.boq_item_id
          && (!line.cost_code_id || !entry.cost_code_id || entry.cost_code_id === line.cost_code_id)
          && procurementPostingState(entry).isCommitment)
        .reduce((sum: number, entry: any) => sum + (Number(entry.total_cost) || ((Number(entry.quantity) || 0) * (Number(entry.unit_cost) || 0))), 0);
      const procurementActual = data.costEntries
        .filter((entry: any) => entry.id !== row.id && entry.contract_id === line.contract_id && entry.boq_item_id === line.boq_item_id
          && (!line.cost_code_id || !entry.cost_code_id || entry.cost_code_id === line.cost_code_id)
          && String(entry.source_type || '') === 'procurement_receipt')
        .reduce((sum: number, entry: any) => sum + (Number(entry.amount) || 0), 0);
      const otherActual = data.costEntries
        .filter((entry: any) => entry.id !== row.id && entry.contract_id === line.contract_id && entry.boq_item_id === line.boq_item_id
          && (!line.cost_code_id || !entry.cost_code_id || entry.cost_code_id === line.cost_code_id)
          && String(entry.source_type || '') !== 'procurement_receipt')
        .reduce((sum: number, entry: any) => sum + (Number(entry.amount) || 0), 0);
      const forecast = calculateSovCostForecast({
        originalBudget: Number(line.original_budget) || 0,
        approvedVariations: approvedVariationValue,
        approvedCostChanges: approvedCostChangeValue,
        procurementCommitment: priorCommitment,
        procurementActual,
        otherActual,
      });
      const proposedAmount = postingType === 'commitment'
        ? Number(row.total_cost) || ((Number(row.quantity) || 0) * (Number(row.unit_cost) || 0))
        : (String(row.source_type || '') === 'procurement_receipt' ? Math.max(0, (Number(row.amount) || 0) - Math.min(Number(row.amount) || 0, forecast.openCommitment)) : Number(row.amount) || 0);
      const availability = calculateBudgetAvailability({ revisedBudget: forecast.revisedBudget, actualCost: forecast.actualCost, openCommitment: forecast.openCommitment, proposedAmount });
      if (availability.exceedsBudget) {
        throw new Error(`Budget availability control blocked this ${postingType}: SOV ${line.sov_line_code || line.id} has ${availability.availableBudget.toLocaleString()} available; this posting would exceed the approved budget by ${Math.abs(availability.projectedAvailableBudget).toLocaleString()}. Approve a Cost Change or reduce the posting first.`);
      }
    };

    return (
      <>
      <DataTableView
        tableName={tableName}
        title={title}
        icon={navItem?.icon || FolderKanban}
        data={viewData}
        columns={config.columns}
        filters={config.filters}
        projects={data.projects as Project[]}
        showProjectFilter={config.showProjectFilter}
        initialProjectId={workspaceProjectId || undefined}
        showProjectColumn={tableName !== 'contracts'}
        projectPickerInForm={!['contracts', 'boq_headers', 'boq_items', 'client_invoices', 'subcontractor_invoices', 'parties', 'party_contacts', 'rate_history'].includes(tableName)}
        dateRangeColumn={config.dateRangeColumn}
        boqItems={data.boqItems}
        contracts={data.contracts}
        baselines={data.baselines}
        dateWarning={tableName === 'schedules' ? (activity) => {
          const contract = contractsWithModifiedValue.find((row: any) => row.id === activity.contract_id) as any;
          const revisedEnd = contract?.revised_end_date || contract?.end_date;
          const item = data.boqItems.find((row: any) => row.id === activity.boq_item_id) as any;
          const governedEnd = item?.planned_end_date || item?.baseline_end_date;
          if (governedEnd && activity.end_date && String(activity.end_date) > String(governedEnd)) {
            return `Activity finish ${activity.end_date} is later than the governed BOQ finish ${governedEnd}. The BOQ plan remains unchanged and the activity is reported as delayed.`;
          }
          return revisedEnd && activity.end_date && String(activity.end_date) > String(revisedEnd)
            ? `Activity finish ${activity.end_date} is later than the revised contract finish ${revisedEnd}.`
            : null;
        } : undefined}
        validateRecord={tableName === 'procurement' ? (row) => {
          if (procurementPostingState(row).isCommitment) assertSovAvailabilityForPosting(row, 'commitment');
          assertRecordPeriodIsOpen(data.reportingPeriods, row);
        } : tableName === 'cost_entries' ? (row) => {
          assertSovAvailabilityForPosting(row, 'actual');
          assertRecordPeriodIsOpen(data.reportingPeriods, row);
        } : tableName === 'resourceAssignments' ? (row) => {
          const resource = data.resourceMasters.find((candidate: any) => candidate.id === row.resource_id) as any;
          const start = String(row.assignment_start || ''); const end = String(row.assignment_end || '');
          if (!resource) throw new Error('Select a valid active Resource Master record.');
          if (resource.status === 'Inactive') throw new Error('An inactive resource cannot receive a planned assignment.');
          if (resource.availability_start_date && start && start < resource.availability_start_date) throw new Error(`Assignment starts before this resource is available (${resource.availability_start_date}).`);
          if (resource.availability_end_date && end && end > resource.availability_end_date) throw new Error(`Assignment finishes after this resource is available (${resource.availability_end_date}).`);
          assertRecordPeriodIsOpen(data.reportingPeriods, row);
        } : tableName === 'resourceMaster' ? (row) => {
          if (row.availability_start_date && row.availability_end_date && String(row.availability_end_date) < String(row.availability_start_date)) throw new Error('Resource availability end cannot be earlier than its availability start.');
          if (row.calendar_id && !data.workCalendars.some((calendar: any) => calendar.id === row.calendar_id && calendar.status !== 'Inactive')) throw new Error('Select an active Work Calendar for this resource, or leave it blank to inherit the activity calendar.');
        } : tableName === 'workCalendars' ? (row) => {
          if (String(row.shift_definitions || '').trim() && calendarShiftHours(row) === null) throw new Error('Shift Definitions must be a JSON list of valid non-overlapping same-day time pairs, for example [{"start":"07:00","end":"12:00"},{"start":"13:00","end":"17:00"}].');
        } : tableName === 'reporting_periods' ? (row) => {
          assertReportingPeriodDefinition(row, data.reportingPeriods);
        } : tableName === 'progress_corrections' ? (row) => {
          const original = data.wirEntries.find((wir: any) => wir.id === row.original_wir_id) as any;
          if (!original || !(original.status === 'Approved' || ['Pass', 'Conditional Pass'].includes(String(original.result || '')))) throw new Error('Select an approved original WIR to correct.');
          if (original.project_id !== row.project_id || original.contract_id !== row.contract_id || original.boq_item_id !== row.boq_item_id) throw new Error('The correction must keep the original WIR project, contract and BOQ scope.');
          if (!(Number(row.quantity) > 0)) throw new Error('Correction quantity must be greater than zero.');
          if (!String(row.reason || '').trim()) throw new Error('A correction reason is required.');
          if (!String(row.effective_date || '').slice(0, 10)) throw new Error('An effective date is required.');
          if (!['Reversal', 'Reinstatement'].includes(String(row.correction_type || ''))) throw new Error('Select Reversal or Reinstatement.');
          assertRecordPeriodIsOpen(data.reportingPeriods, row);
        } : config.dateRangeColumn && !['project_baselines', 'audit_log', 'approval_requests'].includes(tableName) ? (row) => {
          const governedRow = tableName === 'projects' ? { ...row, project_id: row.id } : row;
          assertRecordPeriodIsOpen(data.reportingPeriods, governedRow);
        } : undefined}
        onMutated={(mutation) => {
          data.applyLocalMutation(tableName, mutation);
          if (tableName === 'approval_requests' && (mutation.type === 'insert' || mutation.type === 'update')) {
            const approval = mutation.row as Record<string, any>;
            const decision = approval.status === 'Approved' ? 'Approved' : approval.status === 'Rejected' ? 'Rejected' : null;
            const target = approval.entity_type === 'Variation' ? 'variations'
              : approval.entity_type === 'Document' ? 'documents'
              : approval.entity_type === 'Cost Change' ? 'cost_changes'
              : approval.entity_type === 'Payment Certificate' ? 'payment_certificates'
              : approval.entity_type === 'Baseline' ? 'project_baselines'
                : approval.entity_type === 'Submittal' ? 'submittals'
                  : approval.entity_type === 'RFI' ? 'rfi_register'
                    : approval.entity_type === 'Quality Record' ? 'quality_register' : null;
            if (decision && target && approval.entity_id) {
              if (decision === 'Approved' && target === 'cost_changes') {
                void approveCostChange({ operationId: crypto.randomUUID(), sourceId: approval.entity_id, actor: approval.approver || 'Approval Workflow', approvedAt: approval.decision_date || new Date().toISOString().slice(0, 10) })
                  .then(() => data.reload())
                  .catch((error) => alert(`Approval was saved, but the governed Cost Change posting failed: ${error.message || 'Unknown error'}`));
                return;
              }
              if (decision === 'Approved' && target === 'variations') {
                void approveVariation({ operationId: crypto.randomUUID(), sourceId: approval.entity_id, actor: approval.approver || 'Approval Workflow', approvedAt: approval.decision_date || new Date().toISOString().slice(0, 10) })
                  .then(() => data.reload())
                  .catch((error) => alert(`Approval was saved, but the governed Variation posting failed: ${error.message || 'Unknown error'}`));
                return;
              }
              if (decision === 'Approved' && target === 'payment_certificates') {
                void approvePaymentCertificate({ operationId: crypto.randomUUID(), sourceId: approval.entity_id, actor: approval.approver || 'Approval Workflow', approvedAt: approval.decision_date || new Date().toISOString().slice(0, 10) })
                  .then(() => data.reload())
                  .catch((error) => alert(`Approval was saved, but the governed Payment Certificate posting failed: ${error.message || 'Unknown error'}`));
                return;
              }
              void dataRepository.update<Record<string, any>>(target, approval.entity_id, {
                status: target === 'rfi_register' ? (decision === 'Approved' ? 'Answered' : 'Open')
                  : target === 'quality_register' ? (decision === 'Approved' ? 'In Progress' : 'Open')
                    : decision,
                ...(target === 'variations' ? { approved_date: approval.decision_date || new Date().toISOString().slice(0, 10), approved_by: approval.approver || 'Approval Workflow' } : {}),
                ...(target === 'cost_changes' && decision === 'Approved' ? { approved_date: approval.decision_date || new Date().toISOString().slice(0, 10), approved_by: approval.approver || 'Approval Workflow' } : {}),
                ...(target === 'payment_certificates' && decision === 'Approved' ? { approved_date: approval.decision_date || new Date().toISOString().slice(0, 10), approved_by: approval.approver || 'Approval Workflow' } : {}),
                ...(target === 'documents' && decision === 'Approved' ? { status: 'Approved' } : {}),
                ...(target === 'rfi_register' && decision === 'Approved' ? { status: 'Answered', response_date: approval.decision_date || new Date().toISOString().slice(0, 10) } : {}),
              }).then((updated) => {
                data.applyLocalMutation(target, { type: 'update', row: updated });
                if (target === 'variations' && decision === 'Approved') {
                  return synchronizeVariationLines(updated.id);
                }
                return undefined;
              }).catch((error) =>
                alert(`Approval was saved, but the linked ${approval.entity_type} could not be updated: ${error.message || 'Unknown error'}`),
              );
            }
          }
          if (tableName === 'variation_lines') {
            const affected = mutation.type === 'insertMany'
              ? [...new Set(mutation.rows.map((row) => String(row.variation_id || '')).filter(Boolean))]
              : [String((mutation as any).row?.variation_id || '')].filter(Boolean);
            affected.forEach((variationId) => void synchronizeVariationLines(variationId).catch((error) =>
              alert(`Variation line was saved, but its commercial total could not be synchronized: ${error.message || 'Unknown error'}`),
            ));
          }
          if (tableName === 'variations' && (mutation.type === 'insert' || mutation.type === 'update')) {
            const variation = mutation.row as Record<string, any>;
            if (variation.status === 'Approved') {
              void synchronizeVariationLines(variation.id).catch((error) =>
                alert(`Variation was approved, but its BOQ changes could not be posted: ${error.message || 'Unknown error'}`),
              );
            }
          }
          if (tableName === 'contracts') {
            void syncMainContractProjectDates(mutation).catch((error) =>
              alert(`Failed to synchronize project dates: ${error.message || 'Unknown error'}`),
            );
          }
          // Certificates remain editable while Draft/Submitted. Approval,
          // settlement and reversal are one SQLite transaction; the UI must
          // never independently write a second cash movement afterwards.
          if (tableName === 'documents' && (mutation.type === 'insert' || mutation.type === 'update')) {
            const document = mutation.row as Record<string, any>;
            if (document.supersedes_document_id) {
              void dataRepository.update<Record<string, any>>('documents', document.supersedes_document_id, { is_current: false, status: 'Superseded' })
                .then((updated) => data.applyLocalMutation('documents', { type: 'update', row: updated }))
                .catch((error) => alert(`Document was saved, but the superseded revision could not be updated: ${error.message || 'Unknown error'}`));
              if (document.is_current !== true) {
                void dataRepository.update<Record<string, any>>('documents', document.id, { is_current: true })
                  .then((updated) => data.applyLocalMutation('documents', { type: 'update', row: updated }))
                  .catch((error) => alert(`Document revision was saved, but could not be marked current: ${error.message || 'Unknown error'}`));
              }
            }
          }
          if (tableName === 'client_invoices') void data.reloadInvoiceTracking('client_invoice_tracking');
          if (tableName === 'subcontractor_invoices') void data.reloadInvoiceTracking('subcontractor_invoice_tracking');
          if (tableName === 'wir_entries') {
            if (mutation.type === 'insertMany') {
              mutation.rows.forEach((row) => void syncSubcontractWirCost({ type: 'insert', row }).catch((error) => alert(`Failed to synchronize subcontractor cost: ${error.message || 'Unknown error'}`)));
            } else {
              void syncSubcontractWirCost(mutation).catch((error) => alert(`Failed to synchronize subcontractor cost: ${error.message || 'Unknown error'}`));
            }
          }
          if (tableName === 'procurement' || tableName === 'labor_duty' || tableName === 'equipment') {
            const sourceTable = tableName as 'procurement' | 'labor_duty' | 'equipment';
            if (mutation.type === 'insertMany') {
              mutation.rows.forEach((row) => void syncOperationalCost(sourceTable, { type: 'insert', row }).catch((error) => alert(`Failed to synchronize ${sourceTable} cost: ${error.message || 'Unknown error'}`)));
            } else {
              void syncOperationalCost(sourceTable, mutation).catch((error) => alert(`Failed to synchronize ${sourceTable} cost: ${error.message || 'Unknown error'}`));
            }
          }
          // Accepted GRNs post their actual cost inside the same governed
          // SQLite transaction. The UI deliberately never replays it.
          if (['supplier_invoices', 'supplier_invoice_lines', 'supplier_invoice_payments'].includes(tableName)) {
            const sourceRow = (mutation as any).row as Record<string, any> | undefined;
            const invoiceId = tableName === 'supplier_invoices' ? (sourceRow?.id || '') : String(sourceRow?.supplier_invoice_id || '');
            const invoiceStatus = tableName === 'supplier_invoices'
              ? String(sourceRow?.status || '')
              : String((data.supplierInvoices.find((invoice: any) => invoice.id === invoiceId) as any)?.status || '');
            // Governed backend operations already reconcile headers, forecasts,
            // cash and PO exposure atomically.  Do not replay them through a
            // second UI-side sequence of writes.
            if (invoiceId && !['Approved', 'Partially Paid', 'Paid', 'Reversed'].includes(invoiceStatus)) {
              const override: { invoice?: Record<string, any>; lines?: Record<string, any>[]; payments?: Record<string, any>[] } = {};
              if (tableName === 'supplier_invoices' && sourceRow) override.invoice = sourceRow;
              if (tableName === 'supplier_invoice_lines' && sourceRow) {
                override.lines = [
                  ...data.supplierInvoiceLines.filter((line: any) => line.supplier_invoice_id === invoiceId && line.id !== sourceRow.id),
                  sourceRow,
                ];
              }
              if (tableName === 'supplier_invoice_payments' && sourceRow) {
                override.payments = [
                  ...data.supplierInvoicePayments.filter((payment: any) => payment.supplier_invoice_id === invoiceId && payment.id !== sourceRow.id),
                  sourceRow,
                ];
              }
              void syncSupplierInvoiceFinancials(invoiceId, override).catch((error) =>
                alert(`Supplier AP was saved, but its financial projections could not be synchronized: ${error.message || 'Unknown error'}`),
              );
            }
          }
        }}
        onRelatedMutation={(relatedTable, mutation) => data.applyLocalMutation(relatedTable, mutation)}
        autoFillOptions={autoFillOptions}
        relationshipOptions={relationshipOptions}
        relationshipAutoFillFields={projectCodeBackedTables.has(tableName) ? ['project_code'] : undefined}
        canAdd={!roleReadOnly && activeView !== 'quantityLedger' && tableName !== 'projects' && tableName !== 'progress_entries' && tableName !== 'audit_log'}
        readOnly={roleReadOnly || activeView === 'quantityLedger'}
        progressWirs={data.wirEntries}
        scheduleResourceAssignments={data.scheduleResourceAssignments as Record<string, any>[]}
        toolbarAction={tableName === 'schedule' ? {
          label: 'Update CPM Status Forecast',
          title: 'Recalculate retained-logic forecast from approved predecessor logic, actuals, remaining duration and Data Date. Planned dates and approved baselines are not changed.',
          onClick: async () => {
            const activities = data.schedules.filter((row: any) => String(row.activity || '').trim()) as Record<string, any>[];
            const byContract = new Map<string, Record<string, any>[]>();
            activities.forEach((activity) => {
              const key = String(activity.contract_id || '');
              byContract.set(key, [...(byContract.get(key) || []), activity]);
            });
            let updatedCount = 0;
            let cycleCount = 0;
            for (const [contractId, rows] of byContract) {
              const contract = data.contracts.find((candidate: any) => candidate.id === contractId) as any;
              const anchor = contract?.start_date || rows.map((row) => String(row.start_date || '')).filter(Boolean).sort()[0];
              if (!anchor) continue;
              const idByReference = new Map<string, string>();
              rows.forEach((row) => [row.id, row.activity_code, row.source_activity_code].filter(Boolean).forEach((reference) => idByReference.set(String(reference).trim(), row.id)));
              // Forecast every contract against the one application-level cut-off.
              // Imported/status dates remain source facts; they do not silently
              // replace the user's governed reporting date.
              const dataDate = unifiedDataDate;
              const forecast = calculateCpmStatusForecast(rows.map((row) => ({
                id: row.id,
                duration_days: row.duration_days,
                predecessor_item: row.predecessor_item,
                predecessor_items: String(row.predecessors || '').split(',').map((reference) => idByReference.get(String(reference).trim()) || String(reference).trim()).filter(Boolean),
                predecessor_links: row.predecessor_links,
                relationship_type: row.relationship_type,
                lag_days: row.lag_days,
                calendar_name: row.calendar_name,
                calendar_exceptions: row.calendar_exceptions,
                activity_status: row.activity_status,
                actual_start_date: row.actual_start_date,
                actual_finish_date: row.actual_finish_date,
                remaining_duration_days: row.remaining_duration_days,
                constraint_type: row.constraint_type,
                constraint_date: row.constraint_date,
                is_milestone: row.is_milestone,
              })), anchor, dataDate);
              for (const row of rows) {
                const result = forecast.get(row.id);
                if (!result) continue;
                if (result.cycle) { cycleCount += 1; continue; }
                const saved = await dataRepository.update<Record<string, any>>('schedules', row.id, {
                  forecast_start_date: result.forecastStart,
                  forecast_end_date: result.forecastFinish,
                  total_float_days: result.totalFloat,
                  network_critical: result.critical,
                  network_warning: result.statusWarning || '',
                  forecast_data_date: result.dataDate,
                });
                data.applyLocalMutation('schedules', { type: 'update', row: saved });
                updatedCount += 1;
              }
            }
            if (cycleCount) window.alert(`CPM forecast updated for ${updatedCount} activities. ${cycleCount} cyclic activity/activities were not updated; correct the predecessor logic first.`);
            else window.alert(`CPM forecast updated for ${updatedCount} activities. Planned dates and baselines were not changed.`);
          },
        } : tableName === 'schedule_distributions' ? {
          label: 'Reconcile Profiles',
          title: 'Read-only reconciliation of each activity time-phased quantity and value against its governed activity plan.',
          onClick: () => {
            const activities = data.schedules.filter((row: any) => String(row.activity || '').trim());
            const profiles = activities.map((activity: any) => ({
              activity,
              result: reconcileScheduleDistributions(activity, data.scheduleDistributions as Record<string, any>[]),
            }));
            const exceptions = profiles.filter(({ result }) => !result.isComplete);
            const lines = (exceptions.length ? exceptions : profiles).map(({ activity, result }) => {
              const state = result.isOverAllocated ? 'OVER-ALLOCATED' : result.isComplete ? 'Reconciled' : 'Incomplete';
              return `${activity.activity_code || activity.id} — ${activity.activity || 'Activity'}\n${state}: planned ${result.plannedQuantity.toLocaleString()} / ${result.plannedValue.toLocaleString()} | allocated ${result.distributedQuantity.toLocaleString()} / ${result.distributedValue.toLocaleString()} | remaining ${result.remainingQuantity.toLocaleString()} / ${result.remainingValue.toLocaleString()}`;
            });
            window.alert(`Time-phased profile reconciliation\n${exceptions.length} exception(s) across ${profiles.length} activity/activities. No records were changed.\n\n${lines.join('\n\n')}`);
          },
        } : tableName === 'parties' ? {
          label: 'Migrate Existing Parties',
          title: 'Create master records and link existing contracts and procurement without deleting legacy names.',
          onClick: migrateLegacyParties,
        } : tableName === 'control_accounts' ? {
          label: 'Time-phased Cost Phasing',
          title: 'Govern, phase and distribute control account delivery budgets, manage revisions, and execute CBS rollups.',
          onClick: () => setCostPlanOpen(true),
        } : tableName === 'procurement' ? {
          label: 'Reconcile PO Lifecycle',
          title: 'Analyze and reconcile PO commitments, goods receipts (GRN), supplier invoices, and settled cash payments.',
          onClick: () => setCommitmentReconcileOpen(true),
        } : tableName === 'costs' ? {
          label: 'Cost Variance Drill-down',
          title: 'Analyze budget, commitment, actual, ETC, and FAC variance by WBS, CBS, Vendor, and Period with actionable reasons.',
          onClick: () => setCostVarianceDrillDownOpen(true),
        } : undefined}
        secondaryToolbarAction={tableName === 'schedule' ? {
          label: 'Versions & Comparison',
          title: 'Capture governed schedule versions and compare scope, dates, logic, float, criticality and budget without changing the live schedule.',
          onClick: () => setScheduleVersionOpen(true),
        } : tableName === 'control_accounts' ? {
          label: 'Governed Forecasts (EAC/FAC)',
          title: 'Manage governed forecasts, remaining budgets, and calculation methods with strict floor controls.',
          onClick: () => setEstimateModalOpen(true),
        } : undefined}
        tertiaryToolbarAction={tableName === 'schedule' || tableName === 'delay_events' ? {
          label: 'Delay & Time-Impact Register',
          title: 'Govern delay events, extension of time (EOT) claims, and CPM time impact.',
          onClick: () => setDelayRegisterOpen(true),
        } : undefined}
        rowAction={tableName === 'supplier_invoices' ? {
          label: 'Reverse Invoice',
          title: 'Create a governed reversal. Approved supplier invoices are never deleted or edited in place.',
          onClick: async (row) => {
            const reason = window.prompt('Reason for governed supplier-invoice reversal:');
            if (!reason?.trim()) return;
            await reverseSupplierApPosting({ operationId: crypto.randomUUID(), sourceTable: 'supplier_invoices', sourceId: row.id, actor: 'Local User', reason: reason.trim() });
            await data.reload();
          },
        } : tableName === 'supplier_invoice_payments' ? {
          label: 'Reverse Payment',
          title: 'Create a governed payment reversal and restore the supplier-invoice payable balance.',
          onClick: async (row) => {
            const reason = window.prompt('Reason for governed supplier-payment reversal:');
            if (!reason?.trim()) return;
            await reverseSupplierApPosting({ operationId: crypto.randomUUID(), sourceTable: 'supplier_invoice_payments', sourceId: row.id, actor: 'Local User', reason: reason.trim() });
            await data.reload();
          },
        } : tableName === 'cost_changes' ? {
          label: 'Reverse Cost Change',
          title: 'Reverse an approved cost change and recompute the governed SOV value without deleting history.',
          onClick: async (row) => {
            const reason = window.prompt('Reason for governed cost-change reversal:');
            if (!reason?.trim()) return;
            await reverseCommercialPosting({ operationId: crypto.randomUUID(), sourceTable: 'cost_changes', sourceId: row.id, actor: 'Local User', reason: reason.trim() });
            await data.reload();
          },
        } : tableName === 'payment_certificates' ? {
          label: 'Reverse Certificate',
          title: 'Reverse a governed payment certificate and remove its generated cash movement without deleting history.',
          onClick: async (row) => {
            const reason = window.prompt('Reason for governed payment-certificate reversal:');
            if (!reason?.trim()) return;
            await reverseCommercialPosting({ operationId: crypto.randomUUID(), sourceTable: 'payment_certificates', sourceId: row.id, actor: 'Local User', reason: reason.trim() });
            await data.reload();
          },
        } : tableName === 'client_invoices' ? {
          label: 'Preview Invoice',
          title: 'Render this complete client invoice using a saved flexible template.',
          onClick: (row) => previewInvoiceWithTemplate('client_invoices', row),
        } : tableName === 'subcontractor_invoices' ? {
          label: 'Preview Invoice',
          title: 'Render this complete subcontractor invoice using a saved flexible template.',
          onClick: (row) => previewInvoiceWithTemplate('subcontractor_invoices', row),
        } : tableName === 'wir_entries' ? {
          label: 'Preview WIR',
          title: 'Render this inspection request using a saved flexible template.',
          onClick: (row) => previewRecordWithTemplate('WIR', row),
        } : tableName === 'variations' ? {
          label: 'Reverse Variation',
          title: 'Reverse an approved variation, its generated BOQ/SOV scope and commercial forecast without deleting history.',
          onClick: async (row) => {
            if (row.status !== 'Approved') throw new Error('Only an approved variation can be reversed.');
            const reason = window.prompt('Reason for governed variation reversal:');
            if (!reason?.trim()) return;
            await reverseVariation({ operationId: crypto.randomUUID(), sourceId: row.id, actor: 'Local User', reason: reason.trim() });
            await data.reload();
          },
        } : tableName === 'costs' ? {
          label: 'Preview Cost',
          title: 'Render this cost-control record using a saved flexible template.',
          onClick: (row) => previewRecordWithTemplate('Cost Report', row),
        } : tableName === 'cash_flow' ? {
          label: 'Preview Cash',
          title: 'Render this cash-flow record using a saved flexible template.',
          onClick: (row) => previewRecordWithTemplate('Cash Forecast', row),
        } : tableName === 'project_baselines' ? {
          label: 'Variance Register',
          title: 'Review activity-level baseline variance without altering the approved baseline.',
          onClick: (row) => {
            const activities = data.schedules.filter((activity: any) => activity.contract_id === row.contract_id && String(activity.activity || '').trim());
            const details = compareBaselineActivityDetails(row.activity_snapshot, activities);
            if (!details.length) {
              window.alert('This baseline has no frozen activity snapshot. Approve a governed baseline revision after the controlled schedule is ready.');
              return;
            }
            const exceptions = details.filter((detail) => detail.status !== 'Unchanged');
            const prior = data.baselines
              .filter((baseline: any) => baseline.contract_id === row.contract_id && baseline.id !== row.id && Number(baseline.revision_number || 0) < Number(row.revision_number || 0) && Array.isArray(baseline.activity_snapshot) && baseline.activity_snapshot.length)
              .sort((left: any, right: any) => Number(right.revision_number || 0) - Number(left.revision_number || 0))[0] as any;
            const revisionDifference = prior ? compareBaselineRevisions(prior.activity_snapshot, row.activity_snapshot) : null;
            const revisionSummary = revisionDifference
              ? `\nRevision comparison — ${prior.baseline_number || `Rev ${prior.revision_number}`} → ${row.baseline_number || `Rev ${row.revision_number}`}\n${revisionDifference.addedActivityCount} added | ${revisionDifference.removedActivityCount} removed | ${revisionDifference.changedActivityCount} changed | Critical-path Δ ${revisionDifference.criticalPathVariance >= 0 ? '+' : ''}${revisionDifference.criticalPathVariance}\n`
              : '\nRevision comparison — no earlier frozen revision is available for this contract.\n';
            const lines = (exceptions.length ? exceptions : details).map((detail) => {
              const changes = detail.status === 'Changed' ? detail.changedFields.join(', ') : detail.status;
              const variance = [
                detail.startVarianceDays === null ? '' : `Start ${detail.startVarianceDays >= 0 ? '+' : ''}${detail.startVarianceDays}d`,
                detail.finishVarianceDays === null ? '' : `Finish ${detail.finishVarianceDays >= 0 ? '+' : ''}${detail.finishVarianceDays}d`,
                detail.durationVarianceDays === null ? '' : `Duration ${detail.durationVarianceDays >= 0 ? '+' : ''}${detail.durationVarianceDays}d`,
                detail.budgetVariance === null ? '' : `Budget ${detail.budgetVariance >= 0 ? '+' : ''}${detail.budgetVariance.toLocaleString()}`,
              ].filter(Boolean).join(' | ');
              return `${detail.activityCode} — ${detail.activity}\n${changes || 'No change'}${variance ? `\n${variance}` : ''}`;
            });
            window.alert(`Baseline variance register — ${row.baseline_number || row.id}${revisionSummary}\nLive-plan variance: ${exceptions.length} exception(s) across ${details.length} activity/activities.\n\n${lines.join('\n\n')}`);
          },
        } : tableName === 'resource_masters' ? {
          label: 'Load & Level',
          title: 'Review capacity and safe, non-automatic resource-leveling recommendations.',
          onClick: (row) => {
            const loads = calculateResourceLoads(data.resourceMasters as Record<string, any>[], data.laborDuty as Record<string, any>[], data.equipment as Record<string, any>[], data.workCalendars as Record<string, any>[])
              .filter((load) => load.resourceId === row.id);
            const plannedLoads = calculatePlannedResourceLoads(data.resourceMasters as Record<string, any>[], data.scheduleResourceAssignments as Record<string, any>[], data.schedules as Record<string, any>[], data.workCalendars as Record<string, any>[])
              .filter((load) => load.resourceId === row.id);
            const recommendations = suggestResourceLeveling(data.resourceMasters as Record<string, any>[], data.scheduleResourceAssignments as Record<string, any>[], data.schedules as Record<string, any>[], data.workCalendars as Record<string, any>[])
              .filter((recommendation) => recommendation.resourceId === row.id);
            if (!loads.length && !plannedLoads.length) {
              window.alert(`${row.resource_code || row.resource_name || 'Resource'} has no planned or recorded allocation.`);
              return;
            }
            const byDate = new Map<string, { capacity: number; planned: number; actual: number }>();
            for (const load of plannedLoads) byDate.set(load.date, { capacity: load.capacityHours, planned: load.allocatedHours, actual: 0 });
            for (const load of loads) {
              const current = byDate.get(load.date) || { capacity: load.capacityHours, planned: 0, actual: 0 };
              current.actual += load.allocatedHours;
              byDate.set(load.date, current);
            }
            const lines = [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, load]) => {
              const plannedOver = Math.max(0, load.planned - load.capacity);
              const actualOver = Math.max(0, load.actual - load.capacity);
              return `${date}: plan ${load.planned.toLocaleString()}h · actual ${load.actual.toLocaleString()}h / ${load.capacity.toLocaleString()}h capacity${plannedOver || actualOver ? ` — OVER plan ${plannedOver.toLocaleString()}h, actual ${actualOver.toLocaleString()}h` : ''}`;
            });
            const leveling = recommendations.length
              ? `\n\nLEVELING REVIEW — no dates were changed automatically\n${recommendations.map((recommendation) => `${recommendation.date}: re-level at least ${recommendation.hoursToRelevel.toLocaleString()}h across ${recommendation.scheduleIds.join(', ') || 'assignment(s) ' + recommendation.assignmentIds.join(', ')}. Candidates: ${recommendation.candidates.map((candidate) => `${candidate.scheduleId} (${candidate.cycle ? 'network cycle — do not move' : candidate.critical ? 'critical — escalation required' : `${candidate.totalFloatDays.toLocaleString()}d float`})`).join('; ') || 'none'}.`).join('\n')}\n\nOnly move a non-critical candidate with positive float after reviewing CPM predecessors, constraints and the work calendar. Critical/cyclic activities require planner escalation.`
              : '\n\nLEVELING REVIEW — planned load is within the defined daily capacity.';
            window.alert(`Resource load profile — ${row.resource_code || row.resource_name}\n\n${lines.join('\n')}${leveling}`);
          },
        } : undefined}
        formColumns={tailoredFormColumns || (['client_invoices', 'subcontractor_invoices'].includes(tableName) ? INVOICE_GENERATION_FORM_COLUMNS : tableName === 'app_users' ? USER_FORM_COLUMNS : tableName === 'project_baselines' ? BASELINE_FORM_COLUMNS : undefined)}
        editFormColumns={tailoredFormColumns || (tableName === 'app_users' ? USER_EDIT_COLUMNS : tableName === 'project_baselines' ? BASELINE_FORM_COLUMNS : undefined)}
        onInsert={tableName === 'app_users' ? async (userDraft) => {
          const username = String(userDraft.username || '').trim();
          const password = String(userDraft.initial_password || '');
          if (!username) throw new Error('Username is required.');
          if (password.length < 8) throw new Error('Initial password must contain at least 8 characters.');
          if (data.users.some((user: any) => String(user.username || '').toLowerCase() === username.toLowerCase())) {
            throw new Error('This username is already in use.');
          }
          const secured = await hashPassword(password);
          const { initial_password: _password, ...safeUser } = userDraft;
          return dataRepository.insert<Record<string, any>>('app_users', {
            ...safeUser, username, display_name: String(userDraft.display_name || username).trim(),
            role: userDraft.role || 'Project Manager', status: userDraft.status || 'Active',
            password_hash: secured.hash, password_salt: secured.salt, last_login_at: null,
          });
        } : tableName === 'project_baselines' ? async (baselineDraft) => {
          const contract = data.contracts.find((item: any) => item.id === baselineDraft.contract_id) as any;
          if (!contract || contract.parent_main_contract_id) throw new Error('Select a main contract before creating a baseline.');
          const approvedVariations = data.variations.filter((variation: any) => variation.contract_id === contract.id && variation.status === 'Approved');
          const variationValue = approvedVariations.reduce((sum: number, variation: any) => sum + (Number(variation.cost_impact) || 0), 0);
          const activities = data.schedules.filter((schedule: any) => schedule.contract_id === contract.id && String(schedule.activity || '').trim());
          const budget = activities.reduce((sum: number, activity: any) => sum + (Number(activity.budget) || Number(activity.planned_value) || 0), 0);
          const starts = activities.map((activity: any) => String(activity.start_date || '')).filter(Boolean).sort();
          const ends = activities.map((activity: any) => String(activity.end_date || '')).filter(Boolean).sort();
          const original = Number(contract.contract_value) || 0;
          const priorBaselines = data.baselines.filter((baseline: any) => baseline.contract_id === contract.id);
          const revisionNumber = priorBaselines.reduce((highest: number, baseline: any) => Math.max(highest, Number(baseline.revision_number) || 0), 0) + 1;
          const status = baselineDraft.status || 'Draft';
          const approvedPredecessors = priorBaselines.filter((baseline: any) => baseline.status === 'Approved');
          if (status === 'Approved') {
            assertBaselineApproval({ baselineDate: baselineDraft.baseline_date, revisionReason: baselineDraft.revision_reason, activities, hasPriorApprovedBaseline: approvedPredecessors.length > 0 });
          }
          const snapshot = status === 'Approved' ? createBaselineActivitySnapshot(activities) : [];
          const distributionSnapshot = status === 'Approved' ? createBaselineDistributionSnapshot(data.scheduleDistributions as Record<string, any>[], activities) : [];
          const snapshotSummary = summarizeBaselineSchedule(snapshot);
          const inserted = await dataRepository.insert<Record<string, any>>('project_baselines', {
            ...baselineDraft, project_id: contract.project_id, status: baselineDraft.status || 'Draft',
            baseline_number: baselineDraft.baseline_number || `BL-${String(revisionNumber).padStart(3, '0')}`,
            revision_number: revisionNumber,
            original_contract_value: original, approved_variation_value: variationValue, modified_contract_value: original + variationValue,
            planned_budget: snapshotSummary.planned_budget || budget,
            planned_start_date: snapshotSummary.planned_start_date || starts[0] || contract.start_date || null,
            planned_end_date: snapshotSummary.planned_end_date || ends[ends.length - 1] || contract.end_date || null,
            activity_snapshot: snapshot,
            distribution_snapshot: distributionSnapshot,
            baseline_activity_count: snapshotSummary.activity_count,
            baseline_critical_activity_count: snapshotSummary.critical_activity_count,
          });
          for (const predecessor of approvedPredecessors) {
            const superseded = await dataRepository.update<Record<string, any>>('project_baselines', predecessor.id, { status: 'Superseded' });
            data.applyLocalMutation('project_baselines', { type: 'update', row: superseded });
          }
          for (const variation of approvedVariations.filter((row: any) => row.baseline_revision_required && String(row.approved_date || '') <= String(inserted.baseline_date || baselineDraft.baseline_date || '9999-12-31'))) {
            const updatedVariation = await dataRepository.update<Record<string, any>>('variations', variation.id, { baseline_revision_status: 'Included', baseline_revision_id: inserted.id, baseline_revision_required: false });
            data.applyLocalMutation('variations', { type: 'update', row: updatedVariation });
          }
          return inserted;
        } : tableName === 'pmo_snapshots' ? async (snapshotDraft) => {
          const dataDate = String(snapshotDraft.data_date || '').slice(0, 10);
          const contract = data.contracts.find((row: any) => row.id === snapshotDraft.contract_id) as any;
          if (!contract || contract.parent_main_contract_id) throw new Error('Select a valid main contract for the PMO Snapshot.');
          const period = data.reportingPeriods.find((row: any) => row.project_id === contract.project_id && dataDate >= String(row.start_date || '') && dataDate <= String(row.end_date || '')) as any;
          if (!period) throw new Error('PMO Snapshot Data Date must belong to a governed reporting period.');
          const status = snapshotDraft.status || 'Draft';
          if (status === 'Approved' && !['Locked', 'Closed'].includes(String(period.status || ''))) throw new Error('Approve the PMO Snapshot only after its reporting period is Locked or Closed.');
          const snapshot = calculatePmoSnapshot({ contract, dataDate, performanceContractIds: data.contracts.filter((row: any) => row.id === contract.id || row.parent_main_contract_id === contract.id).map((row: any) => row.id), schedules: data.schedules, scheduleDistributions: data.scheduleDistributions as Record<string, any>[], baselines: data.baselines as Record<string, any>[], wirEntries: data.wirEntries, progressCorrections: data.progressCorrections, boqItems: data.boqItems, costEntries: data.costEntries, requireApprovedBaseline: true });
          return dataRepository.insert<Record<string, any>>('pmo_snapshots', {
            ...snapshotDraft, project_id: contract.project_id, planned_value: snapshot.plannedValue, earned_value: snapshot.earnedValue, actual_cost: snapshot.actualCost,
            cpi: snapshot.cpi, spi: snapshot.spi, eac: snapshot.estimateAtCompletion, baseline_id: snapshot.baselineId, baseline_revision: snapshot.baselineRevision, reporting_period_id: period.id,
          });
        } : tableName === 'schedules' ? async (scheduleRow) => {
          const contract = data.contracts.find((item: any) => item.id === scheduleRow.contract_id) as any;
          if (!contract || contract.parent_main_contract_id) {
            throw new Error('Select a main contract before saving the schedule activity.');
          }
          const item = data.boqItems.find((candidate: any) => candidate.id === scheduleRow.boq_item_id) as any;
          if (!item) throw new Error('Select a BOQ item for the selected main contract.');
          const header = data.boqHeaders.find((candidate: any) => candidate.id === item.boq_header_id) as any;
          if (header?.contract_id !== contract.id) {
            throw new Error('The selected BOQ item does not belong to the selected main contract.');
          }
          if (!String(scheduleRow.activity || '').trim()) {
            throw new Error('Activity Name is required. A new Schedule row is always an activity under the selected BOQ item.');
          }
          const start = scheduleRow.start_date ? new Date(`${scheduleRow.start_date}T00:00:00`) : null;
          const end = scheduleRow.end_date ? new Date(`${scheduleRow.end_date}T00:00:00`) : null;
          const calendarName = String(scheduleRow.calendar_name || 'Calendar Days');
          const calendar = { ...scheduleRow, calendar_name: calendarName };
          const calculatedDuration = start && end
            ? Math.max(1, workingDaysBetween(scheduleRow.start_date, scheduleRow.end_date, calendar))
            : Number(scheduleRow.duration_days) || 0;
          const resolvedEndDate = scheduleRow.end_date || addWorkingDays(scheduleRow.start_date || null, calculatedDuration, calendar);
          const plannedQuantity = Number(scheduleRow.planned_quantity) || 0;
          if (plannedQuantity <= 0) throw new Error('Planned quantity must be greater than zero.');
          const alreadyPlanned = data.schedules
            .filter((activity: any) => activity.boq_item_id === item.id && String(activity.activity || '').trim())
            .reduce((sum: number, activity: any) => sum + (Number(activity.planned_quantity) || 0), 0);
          const allowedQuantity = Number(item.quantity) || 0;
          if (alreadyPlanned + plannedQuantity > allowedQuantity + 0.000001) {
            throw new Error(`Planned quantity exceeds BOQ quantity: existing activities ${alreadyPlanned.toLocaleString()} + new ${plannedQuantity.toLocaleString()} = ${(alreadyPlanned + plannedQuantity).toLocaleString()}, while BOQ allows ${allowedQuantity.toLocaleString()}.`);
          }
          const plannedValue = Math.round(plannedQuantity * (Number(item.unit_rate) || 0) * 100) / 100;
          const activityNumber = data.schedules
            .filter((activity: any) => activity.boq_item_id === item.id && String(activity.activity || '').trim())
            .length + 1;
          const generatedActivityCode = `${item.item_code || 'ITEM'}-ACT-${String(activityNumber).padStart(3, '0')}`;
          return dataRepository.insert<Record<string, any>>('schedules', {
            ...scheduleRow,
            project_id: contract.project_id,
            project_code: projectById.get(contract.project_id)?.project_code || scheduleRow.project_code || '',
            boq_header_id: item.boq_header_id || null,
            boq_code: header?.boq_code || item.boq_code || '',
            boq_item_code: item.item_code || '',
            boq_item_name: item.item_name || item.description || '',
            duration_days: calculatedDuration,
            end_date: resolvedEndDate,
            calendar_name: calendarName,
            calendar_exceptions: scheduleRow.calendar_exceptions || '',
            unit_rate: Number(item.unit_rate) || 0,
            planned_quantity: plannedQuantity,
            budget: plannedValue,
            planned_value: plannedValue,
            activity_code: scheduleRow.activity_code || generatedActivityCode,
            schedule_row_type: 'activity',
          });
        } : tableName === 'contracts' ? async (contractRow) => {
          // Project Code is entered with a contract because the main contract
          // creates the project. It belongs to Projects, not Contracts.
          // Modified Contract Value is calculated from variations and is not
          // a stored contract field.
          const { project_code: enteredProjectCode, modified_contract_value: _modifiedValue, ...contractRecord } = contractRow;
          const isSubcontract = contractRow.contract_role === 'Subcontract';
          if (isSubcontract && !contractRow.parent_main_contract_id) {
            throw new Error('Select the main contract for this subcontract.');
          }
          if (!isSubcontract && contractRow.parent_main_contract_id) {
            throw new Error('A main contract cannot have a parent contract. Select Subcontract first.');
          }
          if (isSubcontract) {
            return dataRepository.insert<Record<string, any>>("contracts", contractRecord);
          }
          const projectName = String(contractRow.project_name || '').trim();
          if (!projectName) throw new Error('Project Name is required when creating a main contract.');

          const projectDraft = prepareCodeControlledInsert('projects', {
            name: projectName,
            client: contractRow.client || '',
            contractor: contractRow.contractor || contractRow.company || '',
            status: contractRow.status || 'Planning',
            start_date: contractRow.start_date || null,
            end_date: contractRow.end_date || null,
            project_code: enteredProjectCode || '',
          }, data.projects as Record<string, any>[]);
          const project = await dataRepository.insert<Record<string, any>>('projects', projectDraft);
          try {
            const contract = await dataRepository.insert<Record<string, any>>('contracts', {
              ...contractRecord,
              project_id: project.id,
            });
            data.applyLocalMutation('projects', { type: 'insert', row: project });
            return contract;
          } catch (error) {
            await dataRepository.delete('projects', project.id);
            throw error;
          }
        } : tableName === 'client_invoices' || tableName === 'subcontractor_invoices'
          ? async (invoiceDraft) => createInvoiceFromWir(tableName, invoiceDraft)
          : undefined}
        onUpdate={tableName === 'app_users' ? async (id, userPatch) => {
          const username = String(userPatch.username || '').trim();
          const password = String(userPatch.new_password || '');
          if (!username) throw new Error('Username is required.');
          if (data.users.some((user: any) => user.id !== id && String(user.username || '').toLowerCase() === username.toLowerCase())) {
            throw new Error('This username is already in use.');
          }
          const { new_password: _password, ...safePatch } = userPatch;
          if (!password) return dataRepository.update<Record<string, any>>('app_users', id, safePatch);
          if (password.length < 8) throw new Error('Reset password must contain at least 8 characters.');
          const secured = await hashPassword(password);
          return dataRepository.update<Record<string, any>>('app_users', id, { ...safePatch, password_hash: secured.hash, password_salt: secured.salt });
        } : tableName === 'pmo_snapshots' ? async (id, patch) => {
          const existing = data.snapshots.find((snapshot: any) => snapshot.id === id) as any;
          if (existing?.status === 'Approved') throw new Error('An approved PMO Snapshot is frozen. Archive it and create a new snapshot for a later Data Date.');
          const next = { ...existing, ...patch } as any;
          const contract = data.contracts.find((row: any) => row.id === next.contract_id) as any;
          if (!contract || contract.parent_main_contract_id) throw new Error('Select a valid main contract for the PMO Snapshot.');
          const dataDate = String(next.data_date || '').slice(0, 10);
          const period = data.reportingPeriods.find((row: any) => row.project_id === contract.project_id && dataDate >= String(row.start_date || '') && dataDate <= String(row.end_date || '')) as any;
          if (!period) throw new Error('PMO Snapshot Data Date must belong to a governed reporting period.');
          if (next.status === 'Approved' && !['Locked', 'Closed'].includes(String(period.status || ''))) throw new Error('Approve the PMO Snapshot only after its reporting period is Locked or Closed.');
          const snapshot = calculatePmoSnapshot({ contract, dataDate, performanceContractIds: data.contracts.filter((row: any) => row.id === contract.id || row.parent_main_contract_id === contract.id).map((row: any) => row.id), schedules: data.schedules, scheduleDistributions: data.scheduleDistributions as Record<string, any>[], baselines: data.baselines as Record<string, any>[], wirEntries: data.wirEntries, progressCorrections: data.progressCorrections, boqItems: data.boqItems, costEntries: data.costEntries, requireApprovedBaseline: true });
          return dataRepository.update<Record<string, any>>('pmo_snapshots', id, { ...patch, project_id: contract.project_id, planned_value: snapshot.plannedValue, earned_value: snapshot.earnedValue, actual_cost: snapshot.actualCost, cpi: snapshot.cpi, spi: snapshot.spi, eac: snapshot.estimateAtCompletion, baseline_id: snapshot.baselineId, baseline_revision: snapshot.baselineRevision, reporting_period_id: period.id });
        } : tableName === 'project_baselines' ? async (id, baselinePatch) => {
          const existing = data.baselines.find((baseline: any) => baseline.id === id) as any;
          if (existing?.status === 'Approved') throw new Error('An approved baseline is frozen. Create a new revision instead of changing it.');
          if (baselinePatch.status === 'Approved') {
            const activities = data.schedules.filter((schedule: any) => schedule.contract_id === existing?.contract_id && String(schedule.activity || '').trim());
            const approvedPredecessors = data.baselines.filter((baseline: any) => baseline.contract_id === existing?.contract_id && baseline.id !== id && baseline.status === 'Approved');
            assertBaselineApproval({ baselineDate: baselinePatch.baseline_date || existing?.baseline_date, revisionReason: baselinePatch.revision_reason || existing?.revision_reason, activities, hasPriorApprovedBaseline: approvedPredecessors.length > 0 });
            const snapshot = createBaselineActivitySnapshot(activities);
            const distributionSnapshot = createBaselineDistributionSnapshot(data.scheduleDistributions as Record<string, any>[], activities);
            const summary = summarizeBaselineSchedule(snapshot);
            const approvedPatch = {
              ...baselinePatch,
              activity_snapshot: snapshot,
              distribution_snapshot: distributionSnapshot,
              baseline_activity_count: summary.activity_count,
              baseline_critical_activity_count: summary.critical_activity_count,
              planned_budget: summary.planned_budget,
              planned_start_date: summary.planned_start_date,
              planned_end_date: summary.planned_end_date,
            };
            const updated = await dataRepository.update<Record<string, any>>('project_baselines', id, approvedPatch);
            for (const predecessor of approvedPredecessors) {
              const superseded = await dataRepository.update<Record<string, any>>('project_baselines', predecessor.id, { status: 'Superseded' });
              data.applyLocalMutation('project_baselines', { type: 'update', row: superseded });
            }
            return updated;
          }
          return dataRepository.update<Record<string, any>>('project_baselines', id, baselinePatch);
        } : tableName === 'variations' ? async (id, patch) => {
          const current = data.variations.find((row: any) => row.id === id) as any;
          if (patch.status === 'Approved' && current?.status !== 'Approved') {
            await approveVariation({ operationId: crypto.randomUUID(), sourceId: id, actor: 'Local User', approvedAt: patch.approved_date || new Date().toISOString().slice(0, 10) });
            await data.reload();
            const rows = await dataRepository.list<Record<string, any>>('variations');
            return rows.find((row) => row.id === id) || current;
          }
          if (current?.status === 'Approved') throw new Error('Approved variations are immutable; use a controlled reversal.');
          return dataRepository.update<Record<string, any>>('variations', id, patch);
        } : tableName === 'procurement' ? async (id, patch) => {
          const current = data.procurement.find((row: any) => row.id === id) as any;
          if (patch.status === 'Ordered' && current?.status !== 'Ordered') {
            await approvePurchaseOrder({ operationId: crypto.randomUUID(), procurementId: id, actor: 'Local User', approvedAt: patch.approved_date || new Date().toISOString().slice(0, 10) });
            await data.reload();
            const rows = await dataRepository.list<Record<string, any>>('procurement');
            return rows.find((row) => row.id === id) || current;
          }
          if (patch.status === 'Cancelled' && current?.status !== 'Cancelled') {
            const reason = String(patch.cancellation_reason || window.prompt('Reason for governed PO cancellation:') || '').trim();
            if (!reason) throw new Error('A cancellation reason is required.');
            await cancelPurchaseOrder({ operationId: crypto.randomUUID(), procurementId: id, actor: 'Local User', cancelledAt: patch.cancelled_date || new Date().toISOString().slice(0, 10), reason });
            await data.reload();
            const rows = await dataRepository.list<Record<string, any>>('procurement');
            return rows.find((row) => row.id === id) || current;
          }
          if (current?.status === 'Ordered' && ['quantity', 'unit_cost', 'total_cost', 'delivery_date'].some((field) => field in patch)) {
            const reason = String(patch.amendment_reason || window.prompt('Reason for governed PO amendment:') || '').trim();
            if (!reason) throw new Error('A PO amendment reason is required.');
            const next = { ...current, ...patch };
            const quantity = Number(next.quantity) || 0;
            const unitCost = Number(next.unit_cost) || 0;
            const totalCost = Number(next.total_cost) || quantity * unitCost;
            await amendPurchaseOrder({ operationId: crypto.randomUUID(), procurementId: id, actor: 'Local User', amendedAt: new Date().toISOString().slice(0, 10), reason, quantity, unitCost, totalCost, deliveryDate: String(next.delivery_date || '') });
            await data.reload();
            const rows = await dataRepository.list<Record<string, any>>('procurement');
            return rows.find((row) => row.id === id) || current;
          }
          if (['Ordered', 'Partially Delivered', 'Delivered', 'Closed'].includes(String(current?.status || ''))) throw new Error('Governed purchase orders are immutable; use a controlled amendment or reversal.');
          return dataRepository.update<Record<string, any>>('procurement', id, patch);
        } : tableName === 'procurement_receipts' ? async (id, patch) => {
          const current = data.procurementReceipts.find((row: any) => row.id === id) as any;
          if (patch.status === 'Accepted' && current?.status !== 'Accepted') {
            await acceptProcurementReceipt({ operationId: crypto.randomUUID(), receiptId: id, actor: 'Local User', acceptedAt: patch.accepted_date || new Date().toISOString().slice(0, 10) });
            await data.reload();
            const rows = await dataRepository.list<Record<string, any>>('procurement_receipts');
            return rows.find((row) => row.id === id) || current;
          }
          if (current?.status === 'Accepted') throw new Error('Accepted GRNs are immutable; create a controlled correction instead of changing the receipt.');
          return dataRepository.update<Record<string, any>>('procurement_receipts', id, patch);
        } : tableName === 'supplier_invoices' ? async (id, patch) => {
          const current = data.supplierInvoices.find((row: any) => row.id === id) as any;
          if (patch.status === 'Approved' && current?.status !== 'Approved') {
            await approveSupplierInvoice({ operationId: crypto.randomUUID(), invoiceId: id, actor: 'Local User', approvedAt: patch.approved_date || new Date().toISOString().slice(0, 10) });
            const rows = await dataRepository.list<Record<string, any>>('supplier_invoices');
            return rows.find((row) => row.id === id) || current;
          }
          if (['Approved', 'Partially Paid', 'Paid', 'Reversed'].includes(String(current?.status || ''))) throw new Error('Governed supplier invoices are immutable; use a governed reversal.');
          return dataRepository.update<Record<string, any>>('supplier_invoices', id, patch);
        } : tableName === 'supplier_invoice_payments' ? async (id, patch) => {
          const current = data.supplierInvoicePayments.find((row: any) => row.id === id) as any;
          if (patch.status === 'Settled' && current?.status !== 'Settled') {
            await settleSupplierInvoicePayment({ operationId: crypto.randomUUID(), paymentId: id, actor: 'Local User', settledAt: patch.payment_date || new Date().toISOString().slice(0, 10) });
            const rows = await dataRepository.list<Record<string, any>>('supplier_invoice_payments');
            return rows.find((row) => row.id === id) || current;
          }
          if (['Settled', 'Reversed'].includes(String(current?.status || ''))) throw new Error('Governed supplier payments are immutable; use a governed reversal.');
          return dataRepository.update<Record<string, any>>('supplier_invoice_payments', id, patch);
        } : tableName === 'cost_changes' ? async (id, patch) => {
          const current = data.costChanges.find((row: any) => row.id === id) as any;
          if (patch.status === 'Approved' && current?.status !== 'Approved') {
            await approveCostChange({ operationId: crypto.randomUUID(), sourceId: id, actor: 'Local User', approvedAt: patch.approved_date || new Date().toISOString().slice(0, 10) });
            const rows = await dataRepository.list<Record<string, any>>('cost_changes');
            return rows.find((row) => row.id === id) || current;
          }
          if (['Approved', 'Reversed'].includes(String(current?.status || ''))) throw new Error('Governed cost changes are immutable; use a governed reversal.');
          return dataRepository.update<Record<string, any>>('cost_changes', id, patch);
        } : tableName === 'payment_certificates' ? async (id, patch) => {
          const current = data.paymentCertificates.find((row: any) => row.id === id) as any;
          if (patch.status === 'Approved' && current?.status !== 'Approved') {
            await approvePaymentCertificate({ operationId: crypto.randomUUID(), sourceId: id, actor: 'Local User', approvedAt: patch.approved_date || new Date().toISOString().slice(0, 10) });
            const rows = await dataRepository.list<Record<string, any>>('payment_certificates');
            return rows.find((row) => row.id === id) || current;
          }
          if (patch.status === 'Paid' && current?.status === 'Approved') {
            await settlePaymentCertificate({ operationId: crypto.randomUUID(), certificateId: id, actor: 'Local User', paidAt: patch.payment_date || new Date().toISOString().slice(0, 10) });
            const rows = await dataRepository.list<Record<string, any>>('payment_certificates');
            return rows.find((row) => row.id === id) || current;
          }
          if (['Approved', 'Paid', 'Reversed'].includes(String(current?.status || ''))) throw new Error('Governed payment certificates are immutable; use settlement or reversal.');
          return dataRepository.update<Record<string, any>>('payment_certificates', id, patch);
        } : tableName === 'supplier_invoice_lines' ? async (id, patch) => {
          const current = data.supplierInvoiceLines.find((row: any) => row.id === id) as any;
          const invoice = data.supplierInvoices.find((row: any) => row.id === current?.supplier_invoice_id) as any;
          if (['Approved', 'Partially Paid', 'Paid', 'Reversed'].includes(String(invoice?.status || ''))) throw new Error('Matched lines are frozen after supplier-invoice approval. Reverse the invoice before changing them.');
          return dataRepository.update<Record<string, any>>('supplier_invoice_lines', id, patch);
        } : tableName === 'client_invoice_tracking' || tableName === 'subcontractor_invoice_tracking'
          ? async (id, trackingPatch) => updateInvoiceTrackingAndCash(tableName, id, trackingPatch)
          : undefined}
        onDeleteGroup={tableName === 'client_invoices' || tableName === 'subcontractor_invoices'
          ? async (invoiceRow) => deleteInvoiceGroup(tableName, invoiceRow)
          : undefined}
        deleteGroupKey={tableName === 'client_invoices' || tableName === 'subcontractor_invoices' ? 'invoice_number' : undefined}
        addButtonLabel={tableName === 'client_invoices' || tableName === 'subcontractor_invoices' ? 'Create Invoice' : undefined}
        submitLabel={tableName === 'client_invoices' || tableName === 'subcontractor_invoices' ? 'Save Invoice' : undefined}
        createDraft={tableName === 'contracts' ? () => ({
          contract_role: 'Main Contract',
          ...createCodeDraft('contracts', data.contracts as Record<string, any>[]),
          ...createCodeDraft('projects', data.projects as Record<string, any>[]),
        }) : tableName === 'procurement' || tableName === 'procurement_receipts' ? () => ({ status: 'Draft' }) : undefined}
      />
      <ScheduleVersionModal
        isOpen={tableName === 'schedule' && scheduleVersionOpen}
        onClose={() => setScheduleVersionOpen(false)}
        projectId={workspaceProjectId || undefined}
        projects={data.projects}
        contracts={data.contracts}
        currentActivities={data.schedules}
        currentDistributions={data.scheduleDistributions as Record<string, any>[]}
        existingVersions={data.scheduleVersions}
        dataDate={unifiedDataDate}
        onSaveVersion={async (version: ScheduleVersion) => {
          const saved = await dataRepository.insert<ScheduleVersion>('schedule_versions', version);
          data.applyLocalMutation('schedule_versions', { type: 'insert', row: saved });
        }}
        onSupersedeVersion={async (version: ScheduleVersion) => {
          const updated = await dataRepository.update<ScheduleVersion>('schedule_versions', version.id, { status: 'Superseded' });
          data.applyLocalMutation('schedule_versions', { type: 'update', row: updated });
        }}
      />
      <DelayRegisterModal
        isOpen={(tableName === 'schedule' || tableName === 'delay_events') && delayRegisterOpen}
        onClose={() => setDelayRegisterOpen(false)}
        selectedProjectId={workspaceProjectId || null}
        selectedContractId={null}
        projects={data.projects}
        contracts={data.contracts}
        schedules={data.schedules}
        baselines={data.baselines as Record<string, any>[]}
        scheduleVersions={data.scheduleVersions as Record<string, any>[]}
        dataDate={unifiedDataDate}
        wbsNodes={data.wbsNodes as WBSNode[]}
        variations={data.variations}
        delayEvents={data.delayEvents || []}
        onSaveDelayEvent={async (event: Partial<DelayEvent>) => {
          if (event.id && data.delayEvents.some((e) => e.id === event.id)) {
            const updated = await dataRepository.update<DelayEvent>('delay_events', event.id, event);
            data.applyLocalMutation('delay_events', { type: 'update', row: updated });
          } else {
            const inserted = await dataRepository.insert<DelayEvent>('delay_events', event as DelayEvent);
            data.applyLocalMutation('delay_events', { type: 'insert', row: inserted });
          }
        }}
        onDeleteDelayEvent={async (id: string) => {
          await dataRepository.delete('delay_events', id);
          data.applyLocalMutation('delay_events', { type: 'delete', id });
        }}
      />
      <CostPlanModal
        isOpen={costPlanOpen}
        onClose={() => setCostPlanOpen(false)}
        projectId={workspaceProjectId || undefined}
        projects={data.projects}
        contracts={data.contracts}
        controlAccounts={data.controlAccounts}
        wbsNodes={data.wbsNodes as WBSNode[]}
        costCodes={data.costCodes}
        costPlanVersions={data.costPlanVersions}
        onSaveVersion={async (version) => {
          if (data.costPlanVersions.some((v) => v.id === version.id)) {
            const updated = await dataRepository.update<Record<string, any>>('cost_plan_versions', version.id, version);
            data.applyLocalMutation('cost_plan_versions', { type: 'update', row: updated });
          } else {
            const inserted = await dataRepository.insert<Record<string, any>>('cost_plan_versions', version);
            data.applyLocalMutation('cost_plan_versions', { type: 'insert', row: inserted });
          }
          await data.reload();
        }}
        dataDate={unifiedDataDate}
      />
      <EstimateForecastModal
        isOpen={estimateModalOpen}
        onClose={() => setEstimateModalOpen(false)}
        selectedProjectId={workspaceProjectId || undefined}
        onSaved={async () => {
          await data.reload();
        }}
      />
      <CommitmentReconciliationModal
        isOpen={commitmentReconcileOpen}
        onClose={() => setCommitmentReconcileOpen(false)}
        selectedProjectId={workspaceProjectId || undefined}
        onSaved={async () => {
          await data.reload();
        }}
      />
      <CostVarianceDrillDownModal
        isOpen={costVarianceDrillDownOpen}
        onClose={() => setCostVarianceDrillDownOpen(false)}
        selectedProjectId={workspaceProjectId || undefined}
        onSaved={async () => {
          await data.reload();
        }}
      />
      </>
    );
  }

  const sessionUser = data.users.find((user: any) => user.id === sessionUserId && user.status === 'Active');
  if (!data.loading && !sessionUser) {
    const setup = data.users.length === 0;
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-4">
        <form onSubmit={(event) => { event.preventDefault(); void signIn(); }} className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-7 shadow-xl">
          <div className="mb-6 flex items-center gap-3"><div className="rounded-xl bg-primary-600 p-3 text-white"><Building2 size={24} /></div><div><h1 className="text-xl font-bold text-neutral-900">BuildTrack</h1><p className="text-sm text-neutral-500">{setup ? 'Create the first local PMO administrator' : 'Sign in to the local workspace'}</p></div></div>
          <label className="mb-4 block text-sm font-medium text-neutral-700">Username<input value={loginName} onChange={(event) => setLoginName(event.target.value)} autoComplete="username" className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-primary-500" /></label>
          <label className="block text-sm font-medium text-neutral-700">Password<input value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} type="password" autoComplete={setup ? 'new-password' : 'current-password'} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-primary-500" /></label>
          {setup && <p className="mt-2 text-xs text-neutral-500">The first account is PMO Admin. Use at least 8 characters.</p>}
          {loginError && <p className="mt-3 rounded-lg bg-error-50 p-2 text-sm text-error-700">{loginError}</p>}
          <button type="submit" className="mt-5 w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">{setup ? 'Create administrator' : 'Sign in'}</button>
        </form>
      </div>
    );
  }

  return (
    <div className={`app-workspace app-mode-${workspaceMode} flex h-screen bg-neutral-50`}>
      {/* Sidebar */}
      {!focusMode && <aside className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-40 w-64 bg-neutral-800 flex flex-col transition-transform duration-300 no-print`}>
        {/* Logo */}
        <div className="px-5 py-5 border-b border-neutral-700">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-sm">
              <Building2 size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">BuildTrack</h1>
              <p className="text-xs text-neutral-400">Construction Mgmt</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3">
          {recentViews.length > 1 && <div className="mb-4"><p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider px-3 mb-1.5">Recent</p>{recentViews.filter((view) => view !== activeView).slice(0, 4).map((view) => { const item = NAV_ITEMS.find((candidate) => candidate.key === view); if (!item) return null; const Icon = item.icon; return <button key={`recent-${view}`} onClick={() => { setActiveView(view); setSidebarOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-neutral-300 hover:bg-neutral-700 hover:text-white"><Icon size={16} className="text-neutral-400" />{item.label}</button>; })}</div>}
          {groups.map((group) => (
            <div key={group} className="mb-4">
              <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider px-3 mb-1.5">{group}</p>
              {NAV_ITEMS.filter((n) => n.group === group).map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => { setActiveView(item.key); setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-neutral-300 hover:bg-neutral-700 hover:text-white'
                    }`}
                  >
                    <Icon size={17} className={isActive ? 'text-white' : 'text-neutral-400'} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-700">
          <p className="truncate text-xs font-medium text-neutral-200">{sessionUser?.display_name || sessionUser?.username || 'Local User'}</p>
          <p className="mb-2 text-[10px] text-neutral-500">{activeRole}</p>
          <button onClick={async () => { try { if (!('__TAURI_INTERNALS__' in window)) throw new Error('Local backup is available in the desktop app only.'); const { invoke } = await import('@tauri-apps/api/core'); const path = await invoke<string>('backup_local_database'); alert(`Complete workspace backup saved to:\n${path}\n\nIt includes the SQLite database and local attachments.`); } catch (error: any) { alert(`Could not create backup: ${error.message || 'Unknown error'}`); } }} className="mb-2 flex items-center gap-1 text-xs text-primary-300 hover:text-primary-200"><Download size={13} /> Backup local data</button>
          <button onClick={() => { localStorage.removeItem('buildtrack:session-user'); setSessionUserId(''); }} className="mb-2 text-xs text-primary-300 hover:text-primary-200">Sign out</button>
          <p className="text-xs text-neutral-500 text-center">BuildTrack v1.0</p>
        </div>
      </aside>}

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="hidden shrink-0 items-center justify-end gap-2 border-b border-neutral-200 bg-white px-5 py-2 lg:flex">
          <div className="mr-auto flex items-center gap-1">
            <button onClick={goBack} disabled={navigationIndex.current <= 0} className="rounded-lg border border-neutral-200 p-2 text-neutral-600 hover:bg-neutral-50 disabled:opacity-35" title="Back"><ArrowLeft size={16}/></button>
            <button onClick={goForward} disabled={navigationIndex.current >= navigationHistory.length - 1} className="rounded-lg border border-neutral-200 p-2 text-neutral-600 hover:bg-neutral-50 disabled:opacity-35" title="Forward"><ArrowRight size={16}/></button>
          </div>
          <UnifiedDataDateSelector />
          <button onClick={() => setFocusMode((value) => !value)} className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50" title="Hide or show navigation for focused table work">{focusMode ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}{focusMode ? 'Exit focus' : 'Focus mode'}</button>
          <CommandPalette destinations={NAV_ITEMS.map(({ key, label, group }) => ({ key, label, group }))} projects={data.projects as Record<string, any>[]} contracts={data.contracts as Record<string, any>[]} onNavigate={setActiveView} onOpenProject={(projectId) => { setWorkspaceProjectId(projectId); setActiveView('projects'); }}/>
        </div>
        {/* Top bar (mobile) */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-neutral-200">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-neutral-100">
            <Menu size={20} className="text-neutral-600" />
          </button>
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-primary-600" />
            <span className="text-sm font-bold text-neutral-900">BuildTrack</span>
          </div>
          <UnifiedDataDateSelector />
        </div>

        {/* Content */}
        {data.loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-10 h-10 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-3" style={{ borderWidth: '3px' }} />
              <p className="text-sm text-neutral-500">Loading data...</p>
            </div>
          </div>
        ) : (
          renderView()
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ProjectDataDateProvider>
      <AppWorkspace />
    </ProjectDataDateProvider>
  );
}

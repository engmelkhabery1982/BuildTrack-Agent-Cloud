import { useState, useEffect, useCallback } from 'react';
import { dataRepository } from '@/data';
import type {
  Project, Task, Cost, CostEntry, Procurement, ProcurementReceipt, SupplierInvoice, SupplierInvoiceLine, SupplierInvoicePayment, Safety, ProgressEntry,
  Schedule, Contract, BOQHeader, BOQItem, CashFlowEntry, SubcontractorInvoice,
  ClientInvoice, PaymentCertificate, Variation, VariationLine, DocumentEntry, WIREntry, LaborDuty, Equipment, TrackingSheet, ResourceMaster,
  InvoiceTracking, ScheduleDistribution, ScheduleResourceAssignment, ScheduleVersion, ProjectBaseline, ReportingPeriod, GovernanceRegisterEntry, ApprovalRequest, AuditLogEntry, RFIEntry, SubmittalEntry, QualityEntry, SiteDailyReport, PMOSnapshot, AppUser, Party, PartyContact, RateHistory, ReportTemplate, ReportVersion, CostCode, WBSNode, ContractSOVLine, ControlAccount, CostChange, WorkCalendar, ProgressCorrection, DelayEvent, CostPlanVersion, EstimateVersion, VarianceActionItem,
  LaborTimesheet, LaborTimesheetLine, EquipmentLog, Claim, ClaimLine,
} from '@/types';
import { syncWirApprovalProgress, evaluateBackToBackPaymentAuthorization } from '@/utils/commercialControl';

export type LocalDataMutation =
  | { type: 'insert'; row: Record<string, any> }
  | { type: 'insertMany'; rows: Record<string, any>[] }
  | { type: 'update'; row: Record<string, any> }
  | { type: 'delete'; id: string; row?: Record<string, any> };

export function useData() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [costEntries, setCostEntries] = useState<CostEntry[]>([]);
  const [procurement, setProcurement] = useState<Procurement[]>([]);
  const [procurementReceipts, setProcurementReceipts] = useState<ProcurementReceipt[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoice[]>([]);
  const [supplierInvoiceLines, setSupplierInvoiceLines] = useState<SupplierInvoiceLine[]>([]);
  const [supplierInvoicePayments, setSupplierInvoicePayments] = useState<SupplierInvoicePayment[]>([]);
  const [safety, setSafety] = useState<Safety[]>([]);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [scheduleDistributions, setScheduleDistributions] = useState<ScheduleDistribution[]>([]);
  const [scheduleResourceAssignments, setScheduleResourceAssignments] = useState<ScheduleResourceAssignment[]>([]);
  const [workCalendars, setWorkCalendars] = useState<WorkCalendar[]>([]);
  const [scheduleVersions, setScheduleVersions] = useState<ScheduleVersion[]>([]);
  const [delayEvents, setDelayEvents] = useState<DelayEvent[]>([]);
  const [baselines, setBaselines] = useState<ProjectBaseline[]>([]);
  const [reportingPeriods, setReportingPeriods] = useState<ReportingPeriod[]>([]);
  const [governanceRegister, setGovernanceRegister] = useState<GovernanceRegisterEntry[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [rfis, setRfis] = useState<RFIEntry[]>([]);
  const [submittals, setSubmittals] = useState<SubmittalEntry[]>([]);
  const [quality, setQuality] = useState<QualityEntry[]>([]);
  const [siteDailyReports, setSiteDailyReports] = useState<SiteDailyReport[]>([]);
  const [snapshots, setSnapshots] = useState<PMOSnapshot[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [boqHeaders, setBoqHeaders] = useState<BOQHeader[]>([]);
  const [boqItems, setBoqItems] = useState<BOQItem[]>([]);
  const [cashFlow, setCashFlow] = useState<CashFlowEntry[]>([]);
  const [subInvoices, setSubInvoices] = useState<SubcontractorInvoice[]>([]);
  const [clientInvoices, setClientInvoices] = useState<ClientInvoice[]>([]);
  const [clientInvoiceTracking, setClientInvoiceTracking] = useState<InvoiceTracking[]>([]);
  const [subcontractorInvoiceTracking, setSubcontractorInvoiceTracking] = useState<InvoiceTracking[]>([]);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [variationLines, setVariationLines] = useState<VariationLine[]>([]);
  const [documents, setDocuments] = useState<DocumentEntry[]>([]);
  const [wirEntries, setWirEntries] = useState<WIREntry[]>([]);
  const [progressCorrections, setProgressCorrections] = useState<ProgressCorrection[]>([]);
  const [laborDuty, setLaborDuty] = useState<LaborDuty[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [resourceMasters, setResourceMasters] = useState<ResourceMaster[]>([]);
  const [tracking, setTracking] = useState<TrackingSheet[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [partyContacts, setPartyContacts] = useState<PartyContact[]>([]);
  const [rateHistory, setRateHistory] = useState<RateHistory[]>([]);
  const [reportTemplates, setReportTemplates] = useState<ReportTemplate[]>([]);
  const [reportVersions, setReportVersions] = useState<ReportVersion[]>([]);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [wbsNodes, setWbsNodes] = useState<WBSNode[]>([]);
  const [contractSovLines, setContractSovLines] = useState<ContractSOVLine[]>([]);
  const [controlAccounts, setControlAccounts] = useState<ControlAccount[]>([]);
  const [costPlanVersions, setCostPlanVersions] = useState<CostPlanVersion[]>([]);
  const [estimateVersions, setEstimateVersions] = useState<EstimateVersion[]>([]);
  const [costChanges, setCostChanges] = useState<CostChange[]>([]);
  const [paymentCertificates, setPaymentCertificates] = useState<PaymentCertificate[]>([]);
  const [varianceActions, setVarianceActions] = useState<VarianceActionItem[]>([]);
  const [laborTimesheets, setLaborTimesheets] = useState<LaborTimesheet[]>([]);
  const [laborTimesheetLines, setLaborTimesheetLines] = useState<LaborTimesheetLine[]>([]);
  const [equipmentLogs, setEquipmentLogs] = useState<EquipmentLog[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimLines, setClaimLines] = useState<ClaimLine[]>([]);
  const [loading, setLoading] = useState(true);

  const listOptional = useCallback(async <T,>(tableName: string): Promise<T[]> => {
    try {
      return await dataRepository.list<T & object>(tableName);
    } catch {
      // The cloud database can be one migration behind the desktop schema.
      // Optional Phase 1 tables remain empty until their migration is applied.
      return [];
    }
  }, []);

  const loadAll = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);

    try {
      const [
        p, t, c, ce, pr, prec, supi, supil, supip, s, pg, sc, sd, sra, wc, sv, de, bl, rp, gr, ap, al, rf, su, qu, sdr, sn, us, ct, bh, bq, cf, si, ci, cit, sit, va, vl, dc, wr, pcor, ld, eq, rm, tr, pa, pc, rh, rt, rver, cc, wn, sov, ca, cpv, ev, cchg, pcert, vacts, lts, ltsl, eql, clm, clml,
      ] = await Promise.all([
        dataRepository.list<Project>('projects'),
        dataRepository.list<Task>('tasks'),
        dataRepository.list<Cost>('costs'),
        dataRepository.list<CostEntry>('cost_entries'),
        dataRepository.list<Procurement>('procurement'),
        listOptional<ProcurementReceipt>('procurement_receipts'),
        listOptional<SupplierInvoice>('supplier_invoices'),
        listOptional<SupplierInvoiceLine>('supplier_invoice_lines'),
        listOptional<SupplierInvoicePayment>('supplier_invoice_payments'),
        dataRepository.list<Safety>('safety'),
        dataRepository.list<ProgressEntry>('progress_entries'),
        dataRepository.list<Schedule>('schedules'),
        listOptional<ScheduleDistribution>('schedule_distributions'),
        listOptional<ScheduleResourceAssignment>('schedule_resource_assignments'),
        listOptional<WorkCalendar>('work_calendars'),
        listOptional<ScheduleVersion>('schedule_versions'),
        listOptional<DelayEvent>('delay_events'),
        listOptional<ProjectBaseline>('project_baselines'),
        listOptional<ReportingPeriod>('reporting_periods'),
        listOptional<GovernanceRegisterEntry>('governance_register'),
        listOptional<ApprovalRequest>('approval_requests'),
        listOptional<AuditLogEntry>('audit_log'),
        listOptional<RFIEntry>('rfi_register'), listOptional<SubmittalEntry>('submittals'), listOptional<QualityEntry>('quality_register'),
        listOptional<SiteDailyReport>('site_daily_reports'),
        listOptional<PMOSnapshot>('pmo_snapshots'),
        listOptional<AppUser>('app_users'),
        dataRepository.list<Contract>('contracts'),
        dataRepository.list<BOQHeader>('boq_headers'),
        dataRepository.list<BOQItem>('boq_items'),
        dataRepository.list<CashFlowEntry>('cash_flow'),
        dataRepository.list<SubcontractorInvoice>('subcontractor_invoices'),
        dataRepository.list<ClientInvoice>('client_invoices'),
        listOptional<InvoiceTracking>('client_invoice_tracking'),
        listOptional<InvoiceTracking>('subcontractor_invoice_tracking'),
        dataRepository.list<Variation>('variations'),
        listOptional<VariationLine>('variation_lines'),
        dataRepository.list<DocumentEntry>('documents'),
        dataRepository.list<WIREntry>('wir_entries'),
        listOptional<ProgressCorrection>('progress_corrections'),
        dataRepository.list<LaborDuty>('labor_duty'),
        dataRepository.list<Equipment>('equipment'),
        listOptional<ResourceMaster>('resource_masters'),
        dataRepository.list<TrackingSheet>('tracking_sheet'),
        listOptional<Party>('parties'),
        listOptional<PartyContact>('party_contacts'),
        listOptional<RateHistory>('rate_history'),
        listOptional<ReportTemplate>('report_templates'),
        listOptional<ReportVersion>('report_versions'),
        listOptional<CostCode>('cost_codes'), listOptional<WBSNode>('wbs_nodes'), listOptional<ContractSOVLine>('contract_sov_lines'), listOptional<ControlAccount>('control_accounts'), listOptional<CostPlanVersion>('cost_plan_versions'), listOptional<EstimateVersion>('estimate_versions'), listOptional<CostChange>('cost_changes'), listOptional<PaymentCertificate>('payment_certificates'), listOptional<VarianceActionItem>('variance_actions'),
        listOptional<LaborTimesheet>('labor_timesheets'), listOptional<LaborTimesheetLine>('labor_timesheet_lines'),
        listOptional<EquipmentLog>('equipment_logs'),
        listOptional<Claim>('claims'), listOptional<ClaimLine>('claim_lines'),
      ]);

      setProjects(p);
      setTasks(t);
      setCosts(c);
      setCostEntries(ce);
      setProcurement(pr);
      setProcurementReceipts(prec);
      setSupplierInvoices(supi); setSupplierInvoiceLines(supil); setSupplierInvoicePayments(supip);
      setSafety(s);
      setProgress(pg);
      setSchedules(sc);
      setScheduleDistributions(sd);
      setScheduleResourceAssignments(sra);
      setWorkCalendars(wc);
      setScheduleVersions(sv);
      setDelayEvents(de);
      setBaselines(bl);
      setReportingPeriods(rp);
      setGovernanceRegister(gr);
      setApprovals(ap);
      setAuditLog(al);
      setRfis(rf); setSubmittals(su); setQuality(qu);
      setSiteDailyReports(sdr);
      setSnapshots(sn);
      setUsers(us);
      setContracts(ct);
      setBoqHeaders(bh);
      setBoqItems(bq);
      setCashFlow(cf);
      setSubInvoices(si);
      setClientInvoices(ci);
      setClientInvoiceTracking(cit);
      setSubcontractorInvoiceTracking(sit);
      setVariations(va);
      setVariationLines(vl);
      setDocuments(dc);
      setWirEntries(wr);
      setProgressCorrections(pcor);
      setLaborDuty(ld);
      setEquipment(eq);
      setResourceMasters(rm);
      setTracking(tr);
      setParties(pa); setPartyContacts(pc); setRateHistory(rh);
      setReportTemplates(rt);
      setReportVersions(rver || []);
      setCostCodes(cc);
      setWbsNodes(wn);
      setContractSovLines(sov);
      setControlAccounts(ca);
      setCostPlanVersions(cpv);
      setEstimateVersions(ev);
      setCostChanges(cchg);
      setPaymentCertificates(pcert);
      setVarianceActions(vacts || []);
      setLaborTimesheets(lts || []);
      setLaborTimesheetLines(ltsl || []);
      setEquipmentLogs(eql || []);
      setClaims(clm || []);
      setClaimLines(clml || []);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [listOptional]);

  useEffect(() => {
    void loadAll(true);
  }, [loadAll]);

  const syncWirApproval = useCallback((wirRow: Record<string, any>) => {
    const isApproved = wirRow.status === 'Approved' || wirRow.result === 'Pass' || wirRow.result === 'Conditional Pass';

    const linkedBoq = boqItems.find(
      (b) => b.id === wirRow.boq_item_id || (b.project_id === wirRow.project_id && b.item_code === wirRow.item_code)
    );
    const linkedSchedule = schedules.find(
      (s) => s.id === wirRow.schedule_id || (linkedBoq && s.boq_item_id === linkedBoq.id)
    );

    const calc = syncWirApprovalProgress({
      wir: wirRow,
      allWirs: wirEntries,
      boqItem: linkedBoq,
      schedule: linkedSchedule,
    });

    if (linkedBoq) {
      setBoqItems((prev) =>
        prev.map((b) =>
          b.id === linkedBoq.id
            ? {
                ...b,
                verified_quantity: calc.cumulativeQuantity,
                executed_quantity: calc.cumulativeQuantity,
                verified_amount: calc.verifiedAmount,
              }
            : b
        )
      );
    }

    if (linkedSchedule) {
      setSchedules((prev) =>
        prev.map((s) =>
          s.id === linkedSchedule.id
            ? {
                ...s,
                progress: calc.progressPct,
                activity_status: calc.nextActivityStatus,
                earned_work_value: calc.earnedWorkValue,
              }
            : s
        )
      );
    }
  }, [boqItems, schedules, wirEntries]);

  const unlockBackToBackPayments = useCallback((clientCertRow: Record<string, any>) => {
    const auth = evaluateBackToBackPaymentAuthorization({
      clientCertificate: clientCertRow,
      subcontractCertificates: paymentCertificates,
      subcontractInvoiceTracking: subcontractorInvoiceTracking,
    });

    if (auth.pwpUnlocked) {
      if (auth.unlockedCertificateIds.length > 0) {
        setPaymentCertificates((prev) =>
          prev.map((c) =>
            auth.unlockedCertificateIds.includes(c.id)
              ? { ...c, pwp_unlocked: true, unlocked_for_subcontractors: true }
              : c
          )
        );
      }
      if (auth.unlockedTrackingIds.length > 0) {
        setSubcontractorInvoiceTracking((prev) =>
          prev.map((t) =>
            auth.unlockedTrackingIds.includes(t.id)
              ? { ...t, pwp_unlocked: true }
              : t
          )
        );
      }
    }
  }, [paymentCertificates, subcontractorInvoiceTracking]);

  const applyLocalMutation = useCallback((tableName: string, mutation: LocalDataMutation) => {
    const apply = (setRows: any) => {
      setRows((previous: Record<string, any>[]) => {
        switch (mutation.type) {
          case 'insert':
            return [mutation.row, ...previous];
          case 'insertMany':
            return [...mutation.rows, ...previous];
          case 'update':
            return previous.map((row: Record<string, any>) => row.id === mutation.row.id ? mutation.row : row);
          case 'delete':
            return previous.filter((row: Record<string, any>) => row.id !== mutation.id);
        }
      });
    };

    switch (tableName) {
      case 'projects': apply(setProjects); break;
      case 'tasks': apply(setTasks); break;
      case 'costs': apply(setCosts); break;
      case 'cost_entries': apply(setCostEntries); break;
      case 'procurement': apply(setProcurement); break;
      case 'procurement_receipts': apply(setProcurementReceipts); break;
      case 'supplier_invoices': apply(setSupplierInvoices); break;
      case 'supplier_invoice_lines': apply(setSupplierInvoiceLines); break;
      case 'supplier_invoice_payments': apply(setSupplierInvoicePayments); break;
      case 'safety': apply(setSafety); break;
      case 'progress_entries': apply(setProgress); break;
      case 'schedules': apply(setSchedules); break;
      case 'schedule_distributions': apply(setScheduleDistributions); break;
      case 'schedule_resource_assignments': apply(setScheduleResourceAssignments); break;
      case 'work_calendars': apply(setWorkCalendars); break;
      case 'schedule_versions': apply(setScheduleVersions); break;
      case 'delay_events': apply(setDelayEvents); break;
      case 'project_baselines': apply(setBaselines); break;
      case 'reporting_periods': apply(setReportingPeriods); break;
      case 'governance_register': apply(setGovernanceRegister); break;
      case 'approval_requests': apply(setApprovals); break;
      case 'audit_log': apply(setAuditLog); break;
      case 'rfi_register': apply(setRfis); break;
      case 'submittals': apply(setSubmittals); break;
      case 'quality_register': apply(setQuality); break;
      case 'site_daily_reports': apply(setSiteDailyReports); break;
      case 'pmo_snapshots': apply(setSnapshots); break;
      case 'app_users': apply(setUsers); break;
      case 'contracts': apply(setContracts); break;
      case 'boq_headers': apply(setBoqHeaders); break;
      case 'boq_items': apply(setBoqItems); break;
      case 'cash_flow': apply(setCashFlow); break;
      case 'subcontractor_invoices': apply(setSubInvoices); break;
      case 'client_invoices': apply(setClientInvoices); break;
      case 'client_invoice_tracking': apply(setClientInvoiceTracking); break;
      case 'subcontractor_invoice_tracking': apply(setSubcontractorInvoiceTracking); break;
      case 'variations': apply(setVariations); break;
      case 'variation_lines': apply(setVariationLines); break;
      case 'documents': apply(setDocuments); break;
      case 'wir_entries': {
        apply(setWirEntries);
        if (mutation.type === 'insert' || mutation.type === 'update') {
          syncWirApproval(mutation.row);
        }
        break;
      }
      case 'progress_corrections': apply(setProgressCorrections); break;
      case 'labor_duty': apply(setLaborDuty); break;
      case 'equipment': apply(setEquipment); break;
      case 'resource_masters': apply(setResourceMasters); break;
      case 'tracking_sheet': apply(setTracking); break;
      case 'parties': apply(setParties); break;
      case 'party_contacts': apply(setPartyContacts); break;
      case 'rate_history': apply(setRateHistory); break;
      case 'report_templates': apply(setReportTemplates); break;
      case 'report_versions': apply(setReportVersions); break;
      case 'cost_codes': apply(setCostCodes); break;
      case 'wbs_nodes': apply(setWbsNodes); break;
      case 'contract_sov_lines': apply(setContractSovLines); break;
      case 'control_accounts': apply(setControlAccounts); break;
      case 'cost_plan_versions': apply(setCostPlanVersions); break;
      case 'estimate_versions': apply(setEstimateVersions); break;
      case 'cost_changes': apply(setCostChanges); break;
      case 'variance_actions': apply(setVarianceActions); break;
      case 'labor_timesheets': apply(setLaborTimesheets); break;
      case 'labor_timesheet_lines': apply(setLaborTimesheetLines); break;
      case 'equipment_logs': apply(setEquipmentLogs); break;
      case 'claims': apply(setClaims); break;
      case 'claim_lines': apply(setClaimLines); break;
      case 'payment_certificates': {
        apply(setPaymentCertificates);
        if (mutation.type === 'insert' || mutation.type === 'update') {
          if (mutation.row.certificate_type === 'Client' && ['Approved', 'Paid'].includes(mutation.row.status)) {
            unlockBackToBackPayments(mutation.row);
          }
        }
        break;
      }
    }
  }, [syncWirApproval, unlockBackToBackPayments]);

  const reloadInvoiceTracking = useCallback(async (tableName: 'client_invoice_tracking' | 'subcontractor_invoice_tracking') => {
    const rows = await listOptional<InvoiceTracking>(tableName);
    if (tableName === 'client_invoice_tracking') setClientInvoiceTracking(rows);
    else setSubcontractorInvoiceTracking(rows);
  }, [listOptional]);

  return {
    projects, tasks, costs, costEntries, procurement, procurementReceipts, supplierInvoices, supplierInvoiceLines, supplierInvoicePayments, safety, progress, schedules, scheduleDistributions, scheduleResourceAssignments, workCalendars, scheduleVersions, delayEvents, baselines, reportingPeriods, governanceRegister, approvals, auditLog, rfis, submittals, quality, siteDailyReports, snapshots, users,
    contracts, boqHeaders, boqItems, cashFlow, subInvoices, clientInvoices,
    clientInvoiceTracking, subcontractorInvoiceTracking, variations, variationLines,
    documents, wirEntries, progressCorrections, laborDuty, equipment, resourceMasters, tracking, parties, partyContacts, rateHistory, reportTemplates, reportVersions, costCodes, wbsNodes, contractSovLines, controlAccounts, costPlanVersions, estimateVersions, costChanges, paymentCertificates, varianceActions, laborTimesheets, laborTimesheetLines, equipmentLogs, claims, claimLines, loading,
    reload: loadAll, applyLocalMutation, reloadInvoiceTracking, syncWirApproval, unlockBackToBackPayments,
  };
}

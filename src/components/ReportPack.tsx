import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Printer, Save, Lock, History, CheckCircle2, AlertTriangle, FileCheck, Shield, ChevronRight, Eye, RefreshCw, FileText, ArrowRight, Download } from 'lucide-react';
import { useProjectDataDate } from '@/context/ProjectDataDateContext';
import { calculateEvmAtDataDate } from '@/utils/evm';
import type { ReportTemplate, ReportVersion } from '@/types';

const money = (value: number | null | undefined) => {
  if (value === null || value === undefined) return 'Unavailable';
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 0,
  });
};

type ReportPackProps = {
  projects: Record<string, any>[];
  contracts: Record<string, any>[];
  variations: Record<string, any>[];
  schedules: Record<string, any>[];
  wirs: Record<string, any>[];
  cashFlow: Record<string, any>[];
  costEntries: Record<string, any>[];
  scheduleDistributions: Record<string, any>[];
  boqItems: Record<string, any>[];
  baselines?: Record<string, any>[];
  controlAccounts?: Record<string, any>[];
  costPlanVersions?: Record<string, any>[];
  contractSovLines?: Record<string, any>[];
  procurement?: Record<string, any>[];
  procurementReceipts?: Record<string, any>[];
  reportVersions?: ReportVersion[];
  reportTemplates?: ReportTemplate[];
  onSaveReportVersion?: (version: Partial<ReportVersion>) => Promise<void>;
};

const packDescriptions: Record<string, string> = {
  'Weekly Project Review': 'Operational delivery, exceptions and immediate actions for the selected project.',
  'Monthly PMO Review': 'Portfolio-level commercial, schedule, cost and cash review for management.',
  'Commercial & Payment Review': 'Contract, approved variations, value delivered and cash position for payment review.',
};

const dateKey = (value: unknown) => String(value || '').slice(0, 10);
const isOnOrBefore = (value: unknown, cutoff: string) => {
  const date = dateKey(value);
  return Boolean(date && date <= cutoff);
};

async function computeHash(payload: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('SHA-256 is unavailable; the controlled report cannot be issued safely.');
  }
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  const hex = Array.from(new Uint8Array(hashBuffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}

export function ReportPack({
  projects,
  contracts,
  variations,
  schedules,
  wirs,
  cashFlow,
  costEntries,
  scheduleDistributions,
  boqItems,
  baselines = [],
  controlAccounts = [],
  costPlanVersions = [],
  contractSovLines = [],
  procurement = [],
  procurementReceipts = [],
  reportVersions = [],
  reportTemplates = [],
  onSaveReportVersion,
}: ReportPackProps) {
  const [packType, setPackType] = useState('Weekly Project Review');
  const { dataDate: reportDate, projectId, setProjectId } = useProjectDataDate();

  // Navigation mode: 'live' or 'versions'
  const [activeTab, setActiveTab] = useState<'live' | 'versions'>('live');
  const [selectedVersion, setSelectedVersion] = useState<ReportVersion | null>(null);
  const [hashVerification, setHashVerification] = useState<'idle' | 'checking' | 'verified' | 'mismatch'>('idle');
  const [activeSubTab, setActiveSubTab] = useState<'summary' | 'reconciliation'>('summary');

  // Modal State for Issue / Save Draft
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<'Draft' | 'Issued'>('Draft');
  const [versionCodeInput, setVersionCodeInput] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [issuerInput, setIssuerInput] = useState('PMO Lead');
  const [signOffNoteInput, setSignOffNoteInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter for Version History
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterPackType, setFilterPackType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Calculate live report data and reconciliation details
  const liveData = useMemo(() => {
    const selectedProjects = projectId === 'all' ? projects : projects.filter((project) => project.id === projectId);
    const projectIds = new Set(selectedProjects.map((project) => project.id));
    const scopedMainContracts = contracts.filter((contract) => projectIds.has(contract.project_id) && !contract.parent_main_contract_id);
    const missingContractDates = scopedMainContracts.filter((contract) => !dateKey(contract.signed_date || contract.start_date)).length;
    const mainContracts = scopedMainContracts.filter((contract) => isOnOrBefore(contract.signed_date || contract.start_date, reportDate));
    const contractIds = new Set(mainContracts.map((contract) => contract.id));
    const performanceContractIds = contracts.filter((contract) => projectIds.has(contract.project_id)).map((contract) => contract.id);

    const original = mainContracts.reduce((sum, contract) => sum + (Number(contract.contract_value) || 0), 0);
    const approvedVariations = variations.filter((item) => contractIds.has(item.contract_id) && item.status === 'Approved');
    const missingVariationDates = approvedVariations.filter((item) => !dateKey(item.approved_date)).length;
    const effectiveVariations = approvedVariations.filter((item) => isOnOrBefore(item.approved_date, reportDate));
    const variation = effectiveVariations.reduce((sum, item) => sum + (Number(item.cost_impact) || 0), 0);
    const activities = schedules.filter((item) => projectIds.has(item.project_id) && String(item.activity || '').trim());

    const eligibleWirs = wirs.filter((item) => projectIds.has(item.project_id) && (item.status === 'Approved' || item.result === 'Pass' || item.result === 'Conditional Pass'));
    const missingWirDates = eligibleWirs.filter((item) => !dateKey(item.inspection_date)).length;

    const scopedCosts = costEntries.filter((item) => projectIds.has(item.project_id));
    const missingCostDates = scopedCosts.filter((item) => !dateKey(item.date)).length;

    const actualCash = cashFlow.filter((item) => projectIds.has(item.project_id) && (!item.movement_type || item.movement_type === 'Actual' || item.movement_type === 'Manual'));
    const missingCashDates = actualCash.filter((item) => !dateKey(item.date)).length;
    const effectiveCash = actualCash.filter((item) => isOnOrBefore(item.date, reportDate));
    const cashInflow = effectiveCash.reduce((sum, item) => sum + (Number(item.inflow) || 0), 0);
    const cashOutflow = effectiveCash.reduce((sum, item) => sum + (Number(item.outflow) || 0), 0);
    const cash = cashInflow - cashOutflow;
    const delayedActivitiesList = activities.filter((item) => item.status === 'Delayed' || (item.end_date && item.end_date < reportDate && item.status !== 'Completed'));
    const delayed = delayedActivitiesList.length;

    // EVM calculation
    const evm = calculateEvmAtDataDate({
      contractIds: [...contractIds],
      performanceContractIds,
      dataDate: reportDate,
      schedules: activities,
      scheduleDistributions,
      baselines: baselines.filter((b) => projectIds.has(b.project_id)),
      wirEntries: eligibleWirs,
      boqItems,
      costEntries: scopedCosts,
      controlAccounts: controlAccounts.filter((ca) => contractIds.has(ca.contract_id)),
      costPlanVersions: costPlanVersions.filter((plan) => contractIds.has(plan.contract_id)),
      contractSovLines,
      procurement,
      procurementReceipts,
    });

    return {
      metrics: {
        count: selectedProjects.length,
        original,
        variation,
        modified: original + variation,
        pv: evm.revenue.PV,
        ev: evm.revenue.EV,
        ac: evm.cost.AC,
        costBac: evm.cost.BAC,
        costEac: evm.cost.EAC,
        costCpi: evm.cost.CPI,
        grossMargin: evm.margin.grossMarginBAC,
        hasCostPlan: evm.cost.hasCostPlan,
        cash,
        cashInflow,
        cashOutflow,
        delayed,
        activities: activities.length,
        missingContractDates,
        missingVariationDates,
        missingWirDates,
        missingCostDates,
        missingCashDates,
      },
      reconciliation: {
        projects: selectedProjects.map((p) => ({ id: p.id, code: p.project_code, name: p.name })),
        mainContracts: mainContracts.map((c) => ({
          id: c.id,
          code: c.contract_number || c.id,
          title: c.title || c.name,
          value: Number(c.contract_value) || 0,
          signedDate: c.signed_date || c.start_date,
        })),
        approvedVariations: effectiveVariations.map((v) => ({
          id: v.id,
          number: v.variation_number || v.id,
          title: v.title,
          costImpact: Number(v.cost_impact) || 0,
          approvedDate: v.approved_date,
        })),
        delayedActivities: delayedActivitiesList.map((a) => ({
          id: a.id,
          code: a.activity_code || a.id,
          name: a.activity,
          endDate: a.end_date,
          status: a.status,
        })),
      },
    };
  }, [projectId, projects, contracts, variations, schedules, wirs, cashFlow, costEntries, scheduleDistributions, boqItems, baselines, controlAccounts, costPlanVersions, contractSovLines, procurement, procurementReceipts, reportDate]);

  // Open modal to save or issue report
  const openSaveModal = (action: 'Draft' | 'Issued') => {
    setModalAction(action);
    const dateTag = reportDate.replace(/-/g, '');
    const count = reportVersions.filter((v) => v.pack_type === packType).length + 1;
    setVersionCodeInput(`RPT-${dateTag}-${String(count).padStart(3, '0')}`);
    setSignOffNoteInput(
      action === 'Issued'
        ? `Controlled report issued for ${packType} as of data date ${reportDate}. Verified commercial and progress reconciliation.`
        : `Draft report created for ${packType} as of data date ${reportDate}.`,
    );
    setModalOpen(true);
  };

  const handleSaveOrIssue = async () => {
    if (!versionCodeInput.trim()) {
      alert('Report Version Code is required.');
      return;
    }
    setIsSubmitting(true);
    try {
      const payloadObj = {
        packType,
        projectId,
        reportDate,
        metrics: liveData.metrics,
        reconciliation: liveData.reconciliation,
        template: reportTemplates.find((template) => template.id === templateId) || null,
        generatedAt: new Date().toISOString(),
      };
      const payloadString = JSON.stringify(payloadObj);
      const hash = await computeHash(payloadString);

      const targetProjectId = projectId === 'all' ? null : projectId;

      const newVersion: Partial<ReportVersion> = {
        id: crypto.randomUUID(),
        project_id: targetProjectId,
        data_date: reportDate,
        pack_type: packType,
        template_id: templateId || null,
        version_code: versionCodeInput.trim(),
        status: modalAction,
        snapshot_hash: hash,
        snapshot_payload: payloadString,
        issuer: issuerInput.trim() || 'PMO Lead',
        sign_off_note: signOffNoteInput.trim(),
        issued_at: modalAction === 'Issued' ? new Date().toISOString() : undefined,
        created_at: new Date().toISOString(),
      };

      if (!onSaveReportVersion) throw new Error('Report persistence is unavailable.');
      await onSaveReportVersion(newVersion);

      setModalOpen(false);
      alert(`Report version ${versionCodeInput} successfully saved as ${modalAction}.`);
    } catch (error: any) {
      alert(`Failed to save report version: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Switch to viewing a specific report version
  const handleViewVersion = (version: ReportVersion) => {
    setSelectedVersion(version);
    setActiveTab('versions');
  };

  // Parsed version snapshot if viewing a version
  const activeSnapshot = useMemo(() => {
    if (!selectedVersion) return null;
    try {
      return JSON.parse(selectedVersion.snapshot_payload);
    } catch {
      return null;
    }
  }, [selectedVersion]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedVersion) {
      setHashVerification('idle');
      return () => { cancelled = true; };
    }
    setHashVerification('checking');
    void computeHash(selectedVersion.snapshot_payload).then((hash) => {
      if (!cancelled) setHashVerification(hash === selectedVersion.snapshot_hash ? 'verified' : 'mismatch');
    }).catch(() => {
      if (!cancelled) setHashVerification('mismatch');
    });
    return () => { cancelled = true; };
  }, [selectedVersion]);

  // Active data to display (either version snapshot or live calculation)
  const displayMetrics = activeTab === 'versions' && activeSnapshot ? activeSnapshot.metrics : liveData.metrics;
  const displayReconciliation = activeTab === 'versions' && activeSnapshot ? activeSnapshot.reconciliation : liveData.reconciliation;
  const displayPackType = activeTab === 'versions' && selectedVersion ? selectedVersion.pack_type : packType;
  const displayReportDate = activeTab === 'versions' && selectedVersion ? selectedVersion.data_date : reportDate;
  const displayTemplate = activeTab === 'versions' && activeSnapshot
    ? activeSnapshot.template
    : reportTemplates.find((template) => template.id === templateId) || null;

  const exportDisplayedSnapshotExcel = async () => {
    if (selectedVersion && hashVerification !== 'verified') {
      throw new Error('The controlled snapshot hash is not verified; export is blocked.');
    }
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    const summaryRows = Object.entries(displayMetrics || {}).map(([metric, value]) => ({ Metric: metric, Value: value ?? 'Unavailable' }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Executive Summary');
    const sheets: Array<[string, Record<string, any>[]]> = [
      ['Projects', displayReconciliation?.projects || []],
      ['Contracts', displayReconciliation?.mainContracts || []],
      ['Variations', displayReconciliation?.approvedVariations || []],
      ['Schedule Exceptions', displayReconciliation?.delayedActivities || []],
    ];
    sheets.forEach(([name, rows]) => XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(rows.length ? rows : [{ Status: 'No records in controlled snapshot' }]),
      name,
    ));
    const bytes = new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }));
    const safeCode = String(selectedVersion?.version_code || `${displayPackType}-${displayReportDate}`).replace(/[^a-zA-Z0-9_-]+/g, '-');
    const fileName = `${safeCode}.xlsx`;
    if ("__TAURI_INTERNALS__" in window) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke<string>('save_excel_download', { fileName, bytes: Array.from(bytes) });
      return;
    }
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const cards: Array<[string, string | number, boolean?]> = [
    ['Original contract', money(displayMetrics?.original)],
    ['Approved variations', money(displayMetrics?.variation)],
    ['Revenue BAC (Selling)', money(displayMetrics?.modified)],
    ['Cash position', money(displayMetrics?.cash)],
    ['Revenue Planned Value (PV)', money(displayMetrics?.pv)],
    ['Revenue Earned Value (EV)', money(displayMetrics?.ev)],
    ['Delivery Actual Cost (AC)', money(displayMetrics?.ac)],
    ['Delivery Cost BAC', displayMetrics?.hasCostPlan ? money(displayMetrics?.costBac) : 'Unavailable'],
    ['Delivery Cost EAC', displayMetrics?.hasCostPlan ? money(displayMetrics?.costEac) : 'Unavailable'],
    ['Delayed activities', displayMetrics?.delayed || 0, true],
  ];
  const cardTemplateFields: Record<string, string> = {
    'Revenue Planned Value (PV)': 'Planned Value',
    'Revenue Earned Value (EV)': 'Earned Value',
    'Delivery Actual Cost (AC)': 'Actual Cost',
    'Delivery Cost BAC': 'Budget',
    'Delivery Cost EAC': 'EAC',
  };
  const visibleCards = displayTemplate?.selected_fields?.length
    ? cards.filter(([label]) => !cardTemplateFields[label] || displayTemplate.selected_fields.includes(cardTemplateFields[label]))
    : cards;

  const filteredReportVersions = useMemo(() => {
    return reportVersions.filter((v) => {
      if (filterProject !== 'all' && v.project_id !== filterProject) return false;
      if (filterPackType !== 'all' && v.pack_type !== filterPackType) return false;
      if (filterStatus !== 'all' && v.status !== filterStatus) return false;
      return true;
    });
  }, [reportVersions, filterProject, filterPackType, filterStatus]);

  return (
    <div className="h-full overflow-y-auto bg-neutral-50 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        {/* Top View Selector: Live Calculation vs Controlled Versions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-3 print:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setActiveTab('live');
                setSelectedVersion(null);
              }}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'live'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white text-neutral-600 border border-neutral-300 hover:bg-neutral-100'
              }`}
            >
              <RefreshCw size={16} /> Live Calculation
            </button>
            <button
              onClick={() => setActiveTab('versions')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'versions'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white text-neutral-600 border border-neutral-300 hover:bg-neutral-100'
              }`}
            >
              <History size={16} /> Version Register & History ({reportVersions.length})
            </button>
          </div>

          {/* Action controls for Live Mode */}
          {activeTab === 'live' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => openSaveModal('Draft')}
                className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 shadow-sm"
                title="Save current state as an unissued Draft version"
              >
                <Save size={16} className="text-neutral-500" /> Save Draft
              </button>
              <button
                onClick={() => openSaveModal('Issued')}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 shadow-sm"
                title="Freeze and Issue an immutable Controlled Report Pack version"
              >
                <Lock size={16} /> Issue Controlled Pack
              </button>
            </div>
          )}
        </div>

        {/* VERSION REGISTER TAB */}
        {activeTab === 'versions' && !selectedVersion && (
          <div className="space-y-4">
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-neutral-900">Controlled Report Pack Register</h2>
                  <p className="mt-1 text-sm text-neutral-500">
                    Audit trail of all Draft, Issued, and Superseded report versions. Issued versions are frozen immutable snapshots.
                  </p>
                </div>
              </div>

              {/* Filters */}
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600">Project</label>
                  <select
                    value={filterProject}
                    onChange={(e) => setFilterProject(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                  >
                    <option value="all">All Projects</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.project_code || p.id} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600">Pack Type</label>
                  <select
                    value={filterPackType}
                    onChange={(e) => setFilterPackType(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                  >
                    <option value="all">All Pack Types</option>
                    <option value="Weekly Project Review">Weekly Project Review</option>
                    <option value="Monthly PMO Review">Monthly PMO Review</option>
                    <option value="Commercial & Payment Review">Commercial & Payment Review</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600">Status</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                  >
                    <option value="all">All Statuses</option>
                    <option value="Issued">Issued (Immutable)</option>
                    <option value="Draft">Draft</option>
                    <option value="Superseded">Superseded</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Versions Table */}
            <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="px-4 py-3">Version Code</th>
                    <th className="px-4 py-3">Pack Type</th>
                    <th className="px-4 py-3">Data Date</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Issuer & Sign-off</th>
                    <th className="px-4 py-3">SHA-256 Hash</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filteredReportVersions.map((v) => {
                    const projectObj = projects.find((p) => p.id === v.project_id);
                    return (
                      <tr key={v.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-3 font-semibold text-neutral-900">
                          {v.version_code}
                          {projectObj && <p className="text-xs font-normal text-neutral-500">{projectObj.project_code || projectObj.name}</p>}
                        </td>
                        <td className="px-4 py-3 text-neutral-800">{v.pack_type}</td>
                        <td className="px-4 py-3 text-neutral-700">{v.data_date}</td>
                        <td className="px-4 py-3">
                          {v.status === 'Issued' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                              <Lock size={12} /> Issued
                            </span>
                          ) : v.status === 'Superseded' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                              <History size={12} /> Superseded
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-700">
                              Draft
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-neutral-600 max-w-xs truncate">
                          <p className="font-semibold text-neutral-800">{v.issuer || 'Local User'}</p>
                          <p className="truncate text-neutral-500">{v.sign_off_note || '—'}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-neutral-500 max-w-[120px] truncate" title={v.snapshot_hash}>
                          {v.snapshot_hash.slice(0, 12)}...
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleViewVersion(v)}
                            className="inline-flex items-center gap-1 rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100"
                          >
                            <Eye size={14} /> View Snapshot
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredReportVersions.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                        No report versions found matching the criteria. Click "Issue Controlled Pack" or "Save Draft" in Live Mode to generate one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ACTIVE REPORT DISPLAY (LIVE or SELECTED VERSION) */}
        {(activeTab === 'live' || selectedVersion) && (
          <div className="space-y-5">
            {/* Version Snapshot Header Notice if viewing a saved version */}
            {activeTab === 'versions' && selectedVersion && (
              <div className="rounded-2xl border border-primary-200 bg-primary-50 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary-800">Controlled Version Snapshot</span>
                    {selectedVersion.status === 'Issued' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                        <Lock size={12} /> Issued (Immutable)
                      </span>
                    ) : selectedVersion.status === 'Superseded' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                        <History size={12} /> Superseded
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs font-bold text-neutral-800">
                        Draft
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1 text-lg font-bold text-neutral-900">
                    Version Code: {selectedVersion.version_code}
                  </h3>
                  <p className="text-xs text-neutral-600 mt-0.5">
                    Issued by <strong className="text-neutral-800">{selectedVersion.issuer}</strong> on{' '}
                    {selectedVersion.issued_at ? new Date(selectedVersion.issued_at).toLocaleString() : 'Draft state'}
                  </p>
                  {selectedVersion.sign_off_note && (
                    <p className="mt-2 text-xs italic text-neutral-700 bg-white/70 p-2 rounded-md border border-primary-100">
                      "{selectedVersion.sign_off_note}"
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <button
                    onClick={() => {
                      setSelectedVersion(null);
                      setActiveTab('versions');
                    }}
                    className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
                  >
                    ← Back to Register
                  </button>
                  <div className={`flex items-center gap-1 text-[11px] font-mono bg-white px-2 py-1 rounded border ${hashVerification === 'verified' ? 'text-emerald-700 border-emerald-200' : hashVerification === 'mismatch' ? 'text-error-700 border-error-200' : 'text-neutral-500 border-neutral-200'}`} title="Cryptographic SHA-256 Hash of snapshot payload">
                    <Shield size={13} />
                    <span>{hashVerification === 'verified' ? 'Hash Verified' : hashVerification === 'mismatch' ? 'Hash Mismatch — export blocked' : 'Verifying Hash…'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Main Report Header Section */}
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">Report Pack</p>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3">
                    {displayTemplate?.logo_data_url && <img src={displayTemplate.logo_data_url} alt="Report logo" className="max-h-14 max-w-28 object-contain" />}
                    <h1 className="text-2xl font-bold text-neutral-900">{displayTemplate?.title || displayPackType}</h1>
                  </div>
                  {displayTemplate?.subtitle && <p className="mt-1 text-sm font-medium text-neutral-600">{displayTemplate.subtitle}</p>}
                  <p className="mt-1 max-w-2xl text-sm text-neutral-500">
                    {packDescriptions[displayPackType]} {activeTab === 'versions' ? 'Values are frozen from the saved report version snapshot.' : 'Values are generated locally from linked commercial, schedule, progress, cost and cash records.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  {activeTab === 'live' && (
                    <>
                      <select value={packType} onChange={(event) => setPackType(event.target.value)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium">
                        <option>Weekly Project Review</option>
                        <option>Monthly PMO Review</option>
                        <option>Commercial & Payment Review</option>
                      </select>
                      <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium">
                        <option value="all">All projects</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.project_code || project.id} — {project.name}
                          </option>
                        ))}
                      </select>
                      <select value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium" title="Versioned report template">
                        <option value="">Default report layout</option>
                        {reportTemplates.filter((template) => template.report_type === 'Cost Report').map((template) => (
                          <option key={template.id} value={template.id}>{template.template_name}</option>
                        ))}
                      </select>
                    </>
                  )}
                  <div className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2.5 py-2 text-sm" title="Reporting Cut-off Date">
                    <CalendarDays size={15} className="text-neutral-400" />
                    <span className="text-xs font-medium text-neutral-600">As of {displayReportDate}</span>
                  </div>
                  <button disabled={Boolean(selectedVersion) && hashVerification !== 'verified'} onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
                    <Printer size={16} /> Print / PDF
                  </button>
                  <button disabled={Boolean(selectedVersion) && hashVerification !== 'verified'} onClick={() => void exportDisplayedSnapshotExcel().catch((error) => alert(error?.message || 'Snapshot export failed.'))} className="flex items-center gap-2 rounded-lg border border-primary-300 bg-white px-4 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50 shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
                    <Download size={16} /> Export Snapshot Excel
                  </button>
                </div>
              </div>
              <p className="mt-3 text-xs text-neutral-400">
                All cumulative values are calculated through {displayReportDate} (Reporting cut-off only; underlying records are not modified): contract effective date, approved variation date, plan distribution, inspection date, cost-entry date and cash-flow date.
              </p>
            </section>

            {/* Sub-tabs: Executive Summary vs Reconciliation & Source Traceability */}
            <div className="flex border-b border-neutral-200">
              <button
                onClick={() => setActiveSubTab('summary')}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
                  activeSubTab === 'summary' ? 'border-primary-600 text-primary-700' : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >
                Executive Metrics & Cards
              </button>
              <button
                onClick={() => setActiveSubTab('reconciliation')}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
                  activeSubTab === 'reconciliation' ? 'border-primary-600 text-primary-700' : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >
                Source Traceability & Reconciliation
              </button>
            </div>

            {/* SUBTAB 1: EXECUTIVE METRICS & CARDS */}
            {activeSubTab === 'summary' && (
              <div className="space-y-5">
                <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                  {visibleCards.map(([label, value, isCount]) => (
                    <div key={label} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                      <p className="text-xs text-neutral-500">{label}</p>
                      <p className="mt-1 text-lg font-bold text-neutral-900">{isCount ? value : value}</p>
                    </div>
                  ))}
                </section>

                <section className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                    <h2 className="font-semibold text-neutral-900">Management reading</h2>
                    <ul className="mt-3 space-y-2 text-sm text-neutral-700">
                      <li>• Portfolio/projects covered: {displayMetrics?.count || 0}</li>
                      <li>• Commercial revenue value: Revenue BAC {money(displayMetrics?.modified)} (Approved variations: {money(displayMetrics?.variation)})</li>
                      <li>• Progress delivery position: Revenue EV {money(displayMetrics?.ev)} against Revenue PV {money(displayMetrics?.pv)}</li>
                      <li>• Delivery cost position: AC {money(displayMetrics?.ac)} · Delivery BAC: {displayMetrics?.hasCostPlan ? money(displayMetrics?.costBac) : 'Unavailable'}</li>
                      <li>• Cost Forecast at Completion: {displayMetrics?.hasCostPlan ? money(displayMetrics?.costEac) : 'Unavailable (Approved Cost Plan Required)'}</li>
                      <li>• Schedule exceptions: {displayMetrics?.delayed || 0} delayed activity(s) across {displayMetrics?.activities || 0} planned activity(s).</li>
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                    <h2 className="font-semibold text-neutral-900">Review checklist</h2>
                    <ul className="mt-3 space-y-2 text-sm text-neutral-700">
                      <li>• Confirm approved variations before issuing the commercial position.</li>
                      <li>• Ensure delivery cost plan (Control Accounts / SOV) is approved to enable cost EAC and margin forecasting.</li>
                      <li>• Review delayed activities and agree the next recovery action.</li>
                      <li>• Compare planned, earned and actual values before management approval.</li>
                      <li>• Use Print / PDF to circulate the same local snapshot to the review team.</li>
                    </ul>
                  </div>
                </section>

                {((displayMetrics?.missingContractDates || 0) +
                  (displayMetrics?.missingVariationDates || 0) +
                  (displayMetrics?.missingWirDates || 0) +
                  (displayMetrics?.missingCostDates || 0) +
                  (displayMetrics?.missingCashDates || 0)) > 0 && (
                  <section className="rounded-2xl border border-warning-200 bg-warning-50 p-5 text-sm text-warning-900">
                    <h2 className="font-semibold flex items-center gap-1.5"><AlertTriangle size={16} /> Data-quality exclusions</h2>
                    <p className="mt-1 text-warning-800">
                      Undated records are intentionally excluded from this as-of report so they cannot create misleading values. Complete their dates before issuing the report.
                    </p>
                    <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                      <li>• Main contracts without effective date: {displayMetrics?.missingContractDates}</li>
                      <li>• Approved variations without approval date: {displayMetrics?.missingVariationDates}</li>
                      <li>• Accepted WIRs without inspection date: {displayMetrics?.missingWirDates}</li>
                      <li>• Cost entries without cost date: {displayMetrics?.missingCostDates}</li>
                      <li>• Actual/manual cash movements without date: {displayMetrics?.missingCashDates}</li>
                    </ul>
                  </section>
                )}
              </div>
            )}

            {/* SUBTAB 2: SOURCE TRACEABILITY & RECONCILIATION */}
            {activeSubTab === 'reconciliation' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-bold text-neutral-900">Traceability & Source Ledger Reconciliation</h2>
                  <p className="mt-1 text-sm text-neutral-500">
                    Audit proof linking executive report metrics directly to underlying contracts, variations, cash movements, and schedule records.
                  </p>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    {/* Main Contracts Trace */}
                    <div className="rounded-xl border border-neutral-200 p-4">
                      <h3 className="font-semibold text-neutral-800 text-sm border-b pb-2">
                        Main Contracts Included ({displayReconciliation?.mainContracts?.length || 0})
                      </h3>
                      <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                        {displayReconciliation?.mainContracts?.map((c: any) => (
                          <div key={c.id} className="flex items-center justify-between text-xs bg-neutral-50 p-2 rounded">
                            <div>
                              <p className="font-semibold text-neutral-900">{c.code}</p>
                              <p className="text-neutral-500">{c.title || 'Main contract'}</p>
                            </div>
                            <span className="font-semibold text-neutral-800">{money(c.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Approved Variations Trace */}
                    <div className="rounded-xl border border-neutral-200 p-4">
                      <h3 className="font-semibold text-neutral-800 text-sm border-b pb-2">
                        Effective Approved Variations ({displayReconciliation?.approvedVariations?.length || 0})
                      </h3>
                      <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                        {displayReconciliation?.approvedVariations?.map((v: any) => (
                          <div key={v.id} className="flex items-center justify-between text-xs bg-neutral-50 p-2 rounded">
                            <div>
                              <p className="font-semibold text-neutral-900">{v.number}</p>
                              <p className="text-neutral-500">{v.title}</p>
                            </div>
                            <span className="font-semibold text-emerald-700">{money(v.costImpact)}</span>
                          </div>
                        ))}
                        {(!displayReconciliation?.approvedVariations || displayReconciliation.approvedVariations.length === 0) && (
                          <p className="text-xs text-neutral-400 py-2">No approved variations recorded before cut-off date.</p>
                        )}
                      </div>
                    </div>

                    {/* Cash Breakdown */}
                    <div className="rounded-xl border border-neutral-200 p-4">
                      <h3 className="font-semibold text-neutral-800 text-sm border-b pb-2">
                        Cash Flow Reconciliation
                      </h3>
                      <div className="mt-3 space-y-2 text-xs">
                        <div className="flex justify-between py-1 border-b">
                          <span className="text-neutral-600">Total Cash Inflows:</span>
                          <span className="font-semibold text-emerald-700">{money(displayMetrics?.cashInflow)}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b">
                          <span className="text-neutral-600">Total Cash Outflows:</span>
                          <span className="font-semibold text-error-700">{money(displayMetrics?.cashOutflow)}</span>
                        </div>
                        <div className="flex justify-between py-1 font-bold">
                          <span>Net Cash Position:</span>
                          <span className={displayMetrics?.cash >= 0 ? 'text-emerald-700' : 'text-error-700'}>
                            {money(displayMetrics?.cash)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Delayed Activities Trace */}
                    <div className="rounded-xl border border-neutral-200 p-4">
                      <h3 className="font-semibold text-neutral-800 text-sm border-b pb-2">
                        Delayed Schedule Activities ({displayReconciliation?.delayedActivities?.length || 0})
                      </h3>
                      <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                        {displayReconciliation?.delayedActivities?.map((a: any) => (
                          <div key={a.id} className="flex items-center justify-between text-xs bg-error-50/50 p-2 rounded border border-error-100">
                            <div>
                              <p className="font-semibold text-error-900">{a.code} — {a.name}</p>
                              <p className="text-error-600">Target finish: {a.endDate || '—'}</p>
                            </div>
                            <span className="font-bold text-error-700">{a.status || 'Delayed'}</span>
                          </div>
                        ))}
                        {(!displayReconciliation?.delayedActivities || displayReconciliation.delayedActivities.length === 0) && (
                          <p className="text-xs text-emerald-600 py-2 font-medium">No delayed schedule activities detected as of cut-off.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {displayTemplate && (
              <footer className="rounded-xl border-t border-neutral-300 bg-white p-4 text-xs text-neutral-600">
                {displayTemplate.show_signatures && (
                  <div className="mb-10 grid grid-cols-3 gap-8 pt-8 text-center">
                    <span className="border-t border-neutral-400 pt-2">Prepared by</span>
                    <span className="border-t border-neutral-400 pt-2">Reviewed by</span>
                    <span className="border-t border-neutral-400 pt-2">Approved by</span>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <span>{displayTemplate.footer_text}</span>
                  {displayTemplate.show_generated_at && <span>Snapshot Data Date: {displayReportDate}</span>}
                </div>
              </footer>
            )}
          </div>
        )}

        {/* SAVE DRAFT / ISSUE REPORT MODAL */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                  {modalAction === 'Issued' ? <Lock className="text-emerald-600" size={20} /> : <Save className="text-primary-600" size={20} />}
                  {modalAction === 'Issued' ? 'Issue Controlled Report Pack' : 'Save Report Pack Draft'}
                </h3>
                <button onClick={() => setModalOpen(false)} className="text-neutral-400 hover:text-neutral-600">×</button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700">Report Pack Type</label>
                <input value={packType} disabled className="mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-600" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700">Data Cut-off Date</label>
                <input value={reportDate} disabled className="mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-600" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700">Report Version Code *</label>
                <input
                  value={versionCodeInput}
                  onChange={(e) => setVersionCodeInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-900 focus:border-primary-500 focus:outline-none"
                  placeholder="e.g. RPT-2026-001"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700">Issuer / Author Name</label>
                <input
                  value={issuerInput}
                  onChange={(e) => setIssuerInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-primary-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700">Sign-off / Review Note</label>
                <textarea
                  value={signOffNoteInput}
                  onChange={(e) => setSignOffNoteInput(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-primary-500 focus:outline-none"
                />
              </div>

              {modalAction === 'Issued' && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-start gap-2">
                  <Lock size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Governance Note:</strong> Issuing this report creates an immutable version and computes a SHA-256 snapshot hash. Any previous Issued version for this pack and project will be transitioned to <em>Superseded</em>.
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveOrIssue}
                  disabled={isSubmitting}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm ${
                    modalAction === 'Issued' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-primary-600 hover:bg-primary-700'
                  }`}
                >
                  {isSubmitting ? 'Saving...' : modalAction === 'Issued' ? 'Confirm & Issue Version' : 'Save Draft'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

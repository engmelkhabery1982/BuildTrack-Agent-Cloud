import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Download, FileText, CheckCircle2, AlertTriangle, GitFork, ShieldCheck, Database, RefreshCw, Undo2, ChevronDown, Eye } from 'lucide-react';
import { generateCleanXer, parseXerFileContent, type XerPred, type XerTask } from '../utils/xerEngine';
import {
  buildPrimaveraReconciliation,
  type DuplicatePolicy,
  type PrimaveraReconciliationResult,
  type ActivityDiff,
  type RelationshipDiff
} from '../utils/primaveraReconciliation';
import { commitGovernedImport } from '../data/governedImport';

export interface XerReconciliationProps {
  projectId?: string;
  contractId?: string;
  dataDate?: string;
  localActivities?: Record<string, any>[];
  projects?: Array<{ id: string; name?: string; code?: string }>;
  contracts?: Array<{ id: string; project_id: string; title?: string; code?: string }>;
  onCommitSuccess?: (batchId: string, summary: string) => void | Promise<void>;
  onMutated?: (mutation: any) => void;
}

export const XerReconciliationBoard: React.FC<XerReconciliationProps> = ({
  projectId: propProjectId,
  contractId: propContractId,
  dataDate = new Date().toISOString().slice(0, 10),
  localActivities = [],
  projects = [],
  contracts = [],
  onCommitSuccess,
  onMutated
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(propProjectId || '');
  const [selectedContractId, setSelectedContractId] = useState<string>(
    propContractId || ''
  );

  const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicatePolicy>('update');
  const [activeTab, setActiveTab] = useState<'activities' | 'relationships' | 'wbs' | 'calendars' | 'resources' | 'actuals'>('activities');
  const [currentFileName, setCurrentFileName] = useState<string>('No XER/P6 file loaded');
  const [fileContent, setFileContent] = useState<string>('');
  
  const [reconciliationResult, setReconciliationResult] = useState<PrimaveraReconciliationResult | null>(null);
  const [auditMessage, setAuditMessage] = useState<string>(
    'Read-only comparison active. Choose Project & Main Contract and load XER to evaluate governed differences.'
  );

  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const defaultProjectId = propProjectId || projects[0]?.id || '';
  const defaultContractId = propContractId || contracts.find((contract) => contract.project_id === defaultProjectId)?.id || '';

  useEffect(() => {
    setSelectedProjectId(defaultProjectId);
    setSelectedContractId(defaultContractId);
    setReconciliationResult(null);
    setFileContent('');
    setCurrentFileName('No XER/P6 file loaded');
  }, [defaultProjectId, defaultContractId]);

  // Filter contracts for selected project
  const availableContracts = useMemo(() => {
    return contracts.filter(c => c.project_id === selectedProjectId);
  }, [contracts, selectedProjectId]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!selectedProjectId || !selectedContractId) {
      setNotice({ kind: 'error', text: 'Select a project and its main contract before loading the XER file.' });
      event.target.value = '';
      return;
    }
    setCurrentFileName(file.name);
    const reader = new FileReader();

    reader.onload = (loadEvent) => {
      const content = String(loadEvent.target?.result || '');
      setFileContent(content);

      try {
        const result = buildPrimaveraReconciliation({
          projectId: selectedProjectId,
          contractId: selectedContractId,
          fileContent: content,
          fileName: file.name,
          duplicatePolicy,
          localActivities,
        });

        setReconciliationResult(result);
        setNotice(null);
        setAuditMessage(
          `Evaluated ${result.stats.totalP6} P6 tasks at Data Date ${dataDate}. Preserves local actuals for ${result.stats.actualsPreservedCount} matching activity code(s).`
        );
      } catch (err: any) {
        setAuditMessage(`Evaluation error: ${err.message || 'Failed to parse Primavera file.'}`);
        setReconciliationResult(null);
      }
    };

    reader.readAsText(file);
  };

  const handleReevaluatePolicy = (newPolicy: DuplicatePolicy) => {
    setDuplicatePolicy(newPolicy);
    if (!fileContent) return;

    try {
      const result = buildPrimaveraReconciliation({
        projectId: selectedProjectId,
        contractId: selectedContractId,
        fileContent,
        fileName: currentFileName,
        duplicatePolicy: newPolicy,
        localActivities,
      });

      setReconciliationResult(result);
      setAuditMessage(
        `Updated duplicate policy to '${newPolicy}'. ${result.stats.actualsPreservedCount} matching activity codes configured for actuals preservation.`
      );
    } catch (err: any) {
      setAuditMessage(`Re-evaluation error: ${err.message || 'Error applying policy.'}`);
    }
  };

  const handleExecuteGovernedCommit = async () => {
    if (!reconciliationResult) return;
    setIsCommitting(true);
    setNotice(null);

    const batchId = `xer-batch-${crypto.randomUUID().slice(0, 8)}`;

    try {
      const committed = await commitGovernedImport({
        batchId,
        source: 'Primavera XER Reconciliation',
        fileName: currentFileName,
        targetTable: 'schedules',
        projectId: selectedProjectId,
        contractId: selectedContractId,
        rows: reconciliationResult.preparedInsertRows,
        updates: reconciliationResult.preparedUpdatePatches,
        auxiliaryRows: reconciliationResult.newAuxiliaryRows,
      });
      // Update the UI projection only after the SQLite transaction commits.
      if (reconciliationResult.preparedInsertRows.length) {
        onMutated?.({
          type: 'insertMany',
          rows: reconciliationResult.preparedInsertRows
        });
      }

      reconciliationResult.preparedUpdatePatches.forEach(update => {
        const existing = localActivities.find(a => String(a.id) === update.id);
        if (existing) {
          onMutated?.({
            type: 'update',
            row: { ...existing, ...update.patch }
          });
        }
      });

      setLastBatchId(committed.batchId);
      const summaryText = `Governed Primavera import committed atomically. Inserted: ${reconciliationResult.preparedInsertRows.length}, Refreshed: ${reconciliationResult.preparedUpdatePatches.length}. Actuals preserved intact.`;
      setNotice({ kind: 'success', text: summaryText });
      setAuditMessage(`Batch ${batchId} committed successfully. All actuals preserved.`);
      await onCommitSuccess?.(committed.batchId, summaryText);
    } catch (err: any) {
      setNotice({ kind: 'error', text: `Commit failed: ${err.message || 'Unknown error'}` });
    } finally {
      setIsCommitting(false);
    }
  };

  const handleExportXer = () => {
    if (!reconciliationResult) return;
    const tasks: XerTask[] = reconciliationResult.activityDiffs
      .filter(row => row.status !== 'missing_in_p6')
      .map(row => ({
        task_code: row.activityCode,
        task_name: row.activityName,
        target_start_date: row.p6Start,
        target_end_date: row.p6Finish,
        remain_drtn_hr_cnt: row.p6Duration * 8,
        phys_complete_pct: 0
      }));

    const preds: XerPred[] = reconciliationResult.relationshipDiffs.map(row => ({
      pred_task_code: row.predCode,
      succ_task_code: row.succCode,
      pred_type: `PR_${row.p6Type}` as XerPred['pred_type'],
      lag_hr_cnt: row.p6Lag * 8
    }));

    const wbsNodes = (reconciliationResult.wbsDiffs || []).map(w => ({
      wbs_code: w.wbsCode,
      wbs_name: w.wbsName,
      parent_wbs_code: w.parentCode
    }));

    const calendars = (reconciliationResult.calendarDiffs || []).map(c => ({
      calendar_code: c.calendarCode,
      calendar_name: c.calendarName,
      hours_per_day: c.hoursPerDay
    }));

    const resources = (reconciliationResult.resourceDiffs || []).map(r => ({
      resource_code: r.resourceCode,
      resource_name: r.resourceName,
      resource_type: r.resourceType as 'Labor' | 'Equipment' | 'Other'
    }));

    const assignments = (reconciliationResult.assignmentDiffs || []).map(a => ({
      task_code: a.activityCode,
      resource_code: a.resourceCode,
      planned_hours: a.plannedHours,
      planned_cost: a.plannedCost
    }));

    const xerText = generateCleanXer(tasks, preds, {
      wbsNodes,
      calendars,
      resources,
      assignments
    });
    const url = URL.createObjectURL(new Blob([xerText], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `governed_reviewed_${currentFileName}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const stats = reconciliationResult?.stats;

  return (
    <div className="space-y-4" id="xer-reconciliation-board">
      {/* Scope and Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-3">
        <div>
          <h3 className="text-base font-bold text-neutral-900">Governed Primavera XER Reconciliation</h3>
          <p className="text-xs text-neutral-500">Evidence-based comparison and governed planning refresh preserving local actuals.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {projects.length > 0 && (
            <select
              value={selectedProjectId}
              onChange={e => {
                setSelectedProjectId(e.target.value);
                const firstContract = contracts.find(c => c.project_id === e.target.value);
                setSelectedContractId(firstContract?.id || '');
                setReconciliationResult(null);
                setFileContent('');
              }}
              className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700"
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>Project: {p.code || p.name || p.id}</option>
              ))}
            </select>
          )}

          {availableContracts.length > 0 && (
            <select
              value={selectedContractId}
              onChange={e => { setSelectedContractId(e.target.value); setReconciliationResult(null); setFileContent(''); }}
              className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700"
            >
              {availableContracts.map(c => (
                <option key={c.id} value={c.id}>Contract: {c.code || c.title || c.id}</option>
              ))}
            </select>
          )}

          <select
            value={duplicatePolicy}
            onChange={e => handleReevaluatePolicy(e.target.value as DuplicatePolicy)}
            className="rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-900"
          >
            <option value="update">Policy: Refresh Planning (Preserve Actuals)</option>
            <option value="skip">Policy: Skip Duplicates</option>
            <option value="conflict">Policy: Audit Conflict Only</option>
          </select>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xer,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            <Upload className="h-3.5 w-3.5" /> Load Primavera XER
          </button>

          <button
            disabled={!reconciliationResult || !selectedProjectId || !selectedContractId || reconciliationResult.parsedCount === 0 || isCommitting}
            onClick={handleExecuteGovernedCommit}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40"
          >
            <Database className="h-3.5 w-3.5" /> Commit Governed Refresh
          </button>

          <button
            disabled={!reconciliationResult}
            onClick={handleExportXer}
            className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" /> Export Reviewed XER
          </button>
        </div>
      </div>

      {/* Audit Banner */}
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span>{auditMessage}</span>
      </div>

      {notice && (
        <div className={`p-3 rounded-lg text-xs font-medium ${
          notice.kind === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {notice.text}
        </div>
      )}

      {/* Network Validation & Cycle Conflicts Banner */}
      {reconciliationResult?.cycleConflicts && reconciliationResult.cycleConflicts.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-900 shadow-sm">
          <div className="flex items-center gap-2 font-bold text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Predecessor Cycle Conflict Detected ({reconciliationResult.cycleConflicts.length} cycle(s))</span>
          </div>
          <p className="mt-1 text-red-600">
            Circular relationship loop detected in P6 relationship network: {reconciliationResult.cycleConflicts.join(' → ')}.
            Commit will be governed to prevent scheduling engine deadlocks.
          </p>
        </div>
      )}

      {reconciliationResult?.missingPredecessors && reconciliationResult.missingPredecessors.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 shadow-sm">
          <div className="flex items-center gap-2 font-bold text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Missing Relationship Codes ({reconciliationResult.missingPredecessors.length})</span>
          </div>
          <p className="mt-1 text-amber-700">
            Predecessors referenced in XER without corresponding activity: {reconciliationResult.missingPredecessors.join(', ')}.
          </p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
          <FileText className="h-4 w-4 text-neutral-600" />
          <p className="mt-1 text-lg font-bold text-neutral-900">{stats?.totalP6 ?? 0}</p>
          <p className="text-xs text-neutral-500 truncate">{currentFileName}</p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <p className="mt-1 text-lg font-bold text-emerald-900">{stats?.synced ?? 0}</p>
          <p className="text-xs text-emerald-700">Matched in Sync</p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <p className="mt-1 text-lg font-bold text-amber-900">{(stats?.dateDrift ?? 0) + (stats?.durationDiscrepancy ?? 0)}</p>
          <p className="text-xs text-amber-700">Date/Duration Differences</p>
        </div>

        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
          <ShieldCheck className="h-4 w-4 text-indigo-600" />
          <p className="mt-1 text-lg font-bold text-indigo-900">{stats?.actualsPreservedCount ?? 0}</p>
          <p className="text-xs text-indigo-700">Local Actuals Protected</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-neutral-200 pb-2">
        <button
          onClick={() => setActiveTab('activities')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            activeTab === 'activities' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          }`}
        >
          Activities ({reconciliationResult?.activityDiffs.length ?? 0})
        </button>

        <button
          onClick={() => setActiveTab('relationships')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            activeTab === 'relationships' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          }`}
        >
          <GitFork className="mr-1 inline h-3 w-3" />
          Relationships ({reconciliationResult?.relationshipDiffs.length ?? 0})
        </button>

        <button
          onClick={() => setActiveTab('wbs')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            activeTab === 'wbs' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          }`}
        >
          WBS ({reconciliationResult?.wbsDiffs?.length ?? 0})
        </button>

        <button
          onClick={() => setActiveTab('calendars')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            activeTab === 'calendars' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          }`}
        >
          Calendars ({reconciliationResult?.calendarDiffs?.length ?? 0})
        </button>

        <button
          onClick={() => setActiveTab('resources')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            activeTab === 'resources' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          }`}
        >
          Resources &amp; Assignments ({(reconciliationResult?.resourceDiffs?.length ?? 0) + (reconciliationResult?.assignmentDiffs?.length ?? 0)})
        </button>

        <button
          onClick={() => setActiveTab('actuals')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            activeTab === 'actuals' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          }`}
        >
          Actuals Protected ({reconciliationResult?.activityDiffs.filter(a => a.preservedActuals).length ?? 0})
        </button>
      </div>

      {/* Table Content */}
      <div className="max-h-96 overflow-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 border-b border-neutral-200 bg-neutral-50 text-neutral-700 font-semibold">
            <tr>
              {activeTab === 'activities' && (
                <>
                  <th className="p-3">Activity Code / Name</th>
                  <th className="p-3">P6 Duration / Dates</th>
                  <th className="p-3">Local Duration / Dates</th>
                  <th className="p-3">Difference Status</th>
                  <th className="p-3">Governed Action</th>
                  <th className="p-3">Reason</th>
                </>
              )}
              {activeTab === 'relationships' && (
                <>
                  <th className="p-3">Predecessor</th>
                  <th className="p-3">P6 Link / Lag</th>
                  <th className="p-3">Local Link / Lag</th>
                  <th className="p-3">Successor</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Reason</th>
                </>
              )}
              {activeTab === 'wbs' && (
                <>
                  <th className="p-3">WBS Code</th>
                  <th className="p-3">WBS Name</th>
                  <th className="p-3">Parent Code</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Reason</th>
                </>
              )}
              {activeTab === 'calendars' && (
                <>
                  <th className="p-3">Calendar Code</th>
                  <th className="p-3">Calendar Name</th>
                  <th className="p-3">Hours / Day</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Reason</th>
                </>
              )}
              {activeTab === 'resources' && (
                <>
                  <th className="p-3">Item Type</th>
                  <th className="p-3">Code / Task</th>
                  <th className="p-3">Details / Name</th>
                  <th className="p-3">Planned Qty / Cost</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Reason</th>
                </>
              )}
              {activeTab === 'actuals' && (
                <>
                  <th className="p-3">Activity Code</th>
                  <th className="p-3">P6 Proposed Dates</th>
                  <th className="p-3">Local Actual Start/Finish</th>
                  <th className="p-3">Local Actual Qty/Cost</th>
                  <th className="p-3">Governance Rule</th>
                  <th className="p-3">Reason</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 text-neutral-800">
            {activeTab === 'activities' && reconciliationResult?.activityDiffs.map(row => (
              <tr key={row.activityCode} className="hover:bg-neutral-50">
                <td className="p-3">
                  <span className="font-mono font-bold text-neutral-900">{row.activityCode}</span>
                  <p className="text-neutral-600 truncate max-w-xs">{row.activityName}</p>
                </td>
                <td className="p-3">
                  <span className="font-semibold">{row.p6Duration}d</span>
                  <p className="text-neutral-500">{row.p6Start} → {row.p6Finish}</p>
                </td>
                <td className="p-3">
                  <span className="font-semibold">{row.localDuration ? `${row.localDuration}d` : '—'}</span>
                  <p className="text-neutral-500">{row.localStart} → {row.localFinish}</p>
                </td>
                <td className="p-3">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    row.status === 'synced' ? 'bg-emerald-100 text-emerald-800' :
                    row.status === 'date_drift' ? 'bg-amber-100 text-amber-800' :
                    row.status === 'duration_discrepancy' ? 'bg-blue-100 text-blue-800' :
                    row.status === 'new_in_p6' ? 'bg-purple-100 text-purple-800' :
                    'bg-neutral-100 text-neutral-700'
                  }`}>
                    {row.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="p-3 font-medium">
                  <span className={`text-[11px] font-semibold ${
                    row.action === 'update_refresh' ? 'text-indigo-700' :
                    row.action === 'insert' ? 'text-emerald-700' :
                    row.action === 'conflict_flag' ? 'text-red-700' :
                    'text-neutral-500'
                  }`}>
                    {row.action === 'update_refresh' ? 'Planning Refresh (Actuals Kept)' : row.action}
                  </span>
                </td>
                <td className="p-3 text-[11px] text-neutral-600 max-w-xs truncate">
                  {row.reason || 'Standard governed evaluation'}
                </td>
              </tr>
            ))}

            {activeTab === 'relationships' && reconciliationResult?.relationshipDiffs.map((row, idx) => (
              <tr key={`${row.predCode}-${row.succCode}-${idx}`} className="hover:bg-neutral-50">
                <td className="p-3 font-mono font-bold">{row.predCode}</td>
                <td className="p-3">{row.p6Type} / {row.p6Lag}d</td>
                <td className="p-3">{row.localType ? `${row.localType} / ${row.localLag}d` : '—'}</td>
                <td className="p-3 font-mono font-bold">{row.succCode}</td>
                <td className="p-3 font-semibold">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                    row.status === 'matched' ? 'bg-emerald-100 text-emerald-800' :
                    row.status === 'conflict' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {row.status}
                  </span>
                </td>
                <td className="p-3 font-medium">
                  <span className={`text-[11px] font-semibold ${
                    row.action === 'conflict_flag' ? 'text-red-700' :
                    row.action === 'insert' ? 'text-emerald-700' : 'text-neutral-600'
                  }`}>
                    {row.action}
                  </span>
                </td>
                <td className="p-3 text-[11px] text-neutral-600">
                  {row.reason}
                </td>
              </tr>
            ))}

            {activeTab === 'wbs' && (reconciliationResult?.wbsDiffs || []).map((row, idx) => (
              <tr key={`wbs-${row.wbsCode}-${idx}`} className="hover:bg-neutral-50">
                <td className="p-3 font-mono font-bold">{row.wbsCode}</td>
                <td className="p-3 font-medium text-neutral-800">{row.wbsName}</td>
                <td className="p-3 font-mono text-neutral-600">{row.parentCode || '— (Root)'}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    row.status === 'synced' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
                  }`}>
                    {row.status}
                  </span>
                </td>
                <td className="p-3 font-medium text-[11px]">
                  <span className={row.action === 'insert' ? 'text-emerald-700 font-semibold' : 'text-neutral-600'}>
                    {row.action}
                  </span>
                </td>
                <td className="p-3 text-[11px] text-neutral-600">
                  {row.reason}
                </td>
              </tr>
            ))}

            {activeTab === 'calendars' && (reconciliationResult?.calendarDiffs || []).map((row, idx) => (
              <tr key={`cal-${row.calendarCode}-${idx}`} className="hover:bg-neutral-50">
                <td className="p-3 font-mono font-bold">{row.calendarCode}</td>
                <td className="p-3 font-medium text-neutral-800">{row.calendarName}</td>
                <td className="p-3 font-semibold">{row.hoursPerDay} hrs/day</td>
                <td className="p-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    row.status === 'synced' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
                  }`}>
                    {row.status}
                  </span>
                </td>
                <td className="p-3 font-medium text-[11px]">
                  <span className={row.action === 'insert' ? 'text-emerald-700 font-semibold' : 'text-neutral-600'}>
                    {row.action}
                  </span>
                </td>
                <td className="p-3 text-[11px] text-neutral-600">
                  {row.reason}
                </td>
              </tr>
            ))}

            {activeTab === 'resources' && (
              <>
                {(reconciliationResult?.resourceDiffs || []).map((row, idx) => (
                  <tr key={`res-${row.resourceCode}-${idx}`} className="hover:bg-neutral-50">
                    <td className="p-3 font-semibold text-neutral-600">Resource Master</td>
                    <td className="p-3 font-mono font-bold text-neutral-900">{row.resourceCode}</td>
                    <td className="p-3 font-medium text-neutral-800">{row.resourceName} ({row.resourceType})</td>
                    <td className="p-3 font-mono text-neutral-500">—</td>
                    <td className="p-3 font-medium text-[11px]">
                      <span className={row.action === 'insert' ? 'text-emerald-700 font-semibold' : 'text-neutral-600'}>
                        {row.action}
                      </span>
                    </td>
                    <td className="p-3 text-[11px] text-neutral-600">{row.reason}</td>
                  </tr>
                ))}
                {(reconciliationResult?.assignmentDiffs || []).map((row, idx) => (
                  <tr key={`asgn-${row.activityCode}-${row.resourceCode}-${idx}`} className="hover:bg-neutral-50">
                    <td className="p-3 font-semibold text-indigo-600">Assignment</td>
                    <td className="p-3 font-mono text-neutral-900">Task: {row.activityCode}</td>
                    <td className="p-3 font-medium text-neutral-800">Resource: {row.resourceCode}</td>
                    <td className="p-3 font-mono text-neutral-700">
                      {row.plannedHours} hrs | ${row.plannedCost}
                    </td>
                    <td className="p-3 font-medium text-[11px]">
                      <span className={row.action === 'insert' ? 'text-emerald-700 font-semibold' : 'text-neutral-600'}>
                        {row.action}
                      </span>
                    </td>
                    <td className="p-3 text-[11px] text-neutral-600">{row.reason}</td>
                  </tr>
                ))}
              </>
            )}

            {activeTab === 'actuals' && reconciliationResult?.activityDiffs.filter(a => a.preservedActuals).map(row => (
              <tr key={`act-${row.activityCode}`} className="hover:bg-neutral-50">
                <td className="p-3 font-mono font-bold text-neutral-900">{row.activityCode}</td>
                <td className="p-3 font-medium text-neutral-700">{row.p6Start} → {row.p6Finish}</td>
                <td className="p-3 font-semibold text-emerald-700">
                  {row.localActualStart || 'Not Started'} → {row.localActualFinish || 'In Progress'}
                </td>
                <td className="p-3 text-neutral-800 font-mono">
                  Qty: {row.localActualQuantity ?? 0} | Cost: ${row.localActualCost ?? 0}
                </td>
                <td className="p-3 text-emerald-800 font-semibold text-[11px]">
                  Protected — Actuals Frozen
                </td>
                <td className="p-3 text-[11px] text-neutral-600">
                  {row.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!reconciliationResult && (
          <div className="p-10 text-center text-xs text-neutral-500">
            Select a Project &amp; Main Contract and load a Primavera XER or P6 schedule file to perform governed reconciliation.
          </div>
        )}
      </div>
    </div>
  );
};

export default XerReconciliationBoard;

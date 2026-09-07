import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  UserCheck,
  Calendar,
  Filter,
  Search,
  Plus,
  FileCheck,
  ArrowUpRight,
  MessageSquare,
  AlertOctagon,
  ChevronRight,
  X,
  ExternalLink,
  Lock
} from 'lucide-react';
import type { Project, VarianceActionItem, ViewKey } from '@/types';
import type { Warning } from '@/utils/varianceActionRegister';

interface VarianceActionRegisterViewProps {
  projects: Project[];
  varianceActions: VarianceActionItem[];
  onCreateAction: (
    warning: Warning,
    assignedTo: string,
    dueDate: string,
    projectId?: string,
    contractId?: string | null,
    severity?: 'Low' | 'Medium' | 'High' | 'Critical',
    materiality?: number,
    sourceKpi?: string,
    sourceRecordId?: string | null
  ) => Promise<any>;
  onUpdateActionStatus: (
    id: string,
    status: 'Open' | 'Assigned' | 'In Progress' | 'Resolved' | 'Closed',
    evidence?: string,
    comments?: string
  ) => Promise<any>;
  onEscalateAction: (id: string, reason: string) => Promise<any>;
  onNavigate?: (view: ViewKey) => void;
}

export function VarianceActionRegisterView({
  projects,
  varianceActions,
  onCreateAction,
  onUpdateActionStatus,
  onEscalateAction,
  onNavigate,
}: VarianceActionRegisterViewProps) {
  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected Action Modal / Drawer State
  const [activeAction, setActiveAction] = useState<VarianceActionItem | null>(null);
  const [statusDraft, setStatusDraft] = useState<'Open' | 'Assigned' | 'In Progress' | 'Resolved' | 'Closed'>('Open');
  const [evidenceInput, setEvidenceInput] = useState<string>('');
  const [commentInput, setCommentInput] = useState<string>('');
  const [escalateReason, setEscalateReason] = useState<string>('');
  const [showEscalateModal, setShowEscalateModal] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New Action Modal
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newProjectId, setNewProjectId] = useState<string>(projects[0]?.id || '');
  const [newWarningMessage, setNewWarningMessage] = useState<string>('');
  const [newCategory, setNewCategory] = useState<string>('Cost & EVM');
  const [newSeverity, setNewSeverity] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Medium');
  const [newMateriality, setNewMateriality] = useState<number>(0);
  const [newAssignedTo, setNewAssignedTo] = useState<string>('');
  const [newDueDate, setNewDueDate] = useState<string>(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );

  // Filtered Actions
  const filteredActions = useMemo(() => {
    return varianceActions.filter((item) => {
      if (selectedProjectId !== 'all' && item.project_id !== selectedProjectId) return false;
      if (selectedStatus !== 'all' && item.status !== selectedStatus) return false;
      if (selectedSeverity !== 'all' && item.severity !== selectedSeverity) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const msg = (item.warningMessage || '').toLowerCase();
        const category = (item.category || '').toLowerCase();
        const owner = (item.assignedTo || '').toLowerCase();
        if (!msg.includes(q) && !category.includes(q) && !owner.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [varianceActions, selectedProjectId, selectedStatus, selectedSeverity, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const total = filteredActions.length;
    const open = filteredActions.filter((a) => a.status === 'Open').length;
    const inProgress = filteredActions.filter((a) => a.status === 'In Progress').length;
    const closed = filteredActions.filter((a) => a.status === 'Closed').length;
    const escalated = filteredActions.filter((a) => (a.escalation_level || 0) > 0).length;
    const totalMateriality = filteredActions
      .filter((a) => a.status !== 'Closed')
      .reduce((sum, a) => sum + (a.materiality || 0), 0);

    return { total, open, inProgress, closed, escalated, totalMateriality };
  }, [filteredActions]);

  const handleOpenActionDetail = (item: VarianceActionItem) => {
    setActiveAction(item);
    setStatusDraft(item.status);
    setEvidenceInput(item.evidence || '');
    setCommentInput('');
    setErrorMessage(null);
  };

  const handleSaveStatusUpdate = async () => {
    if (!activeAction) return;
    setErrorMessage(null);

    // Disallow closing without evidence
    if (statusDraft === 'Closed' && !evidenceInput.trim() && !(activeAction.evidence || '').trim()) {
      setErrorMessage(
        'عفواً، لا يمكن إغلاق بند الانحراف دون إرفاق دليل إثبات المعالجة والحل (Evidence & Document required).'
      );
      return;
    }

    try {
      await onUpdateActionStatus(activeAction.id, statusDraft, evidenceInput, commentInput);
      // Update activeAction locally for drawer
      setActiveAction((prev) =>
        prev
          ? {
              ...prev,
              status: statusDraft,
              evidence: evidenceInput || prev.evidence,
              comments: commentInput
                ? `${prev.comments || ''}\n[${new Date().toLocaleDateString()}] ${commentInput}`.trim()
                : prev.comments,
            }
          : null
      );
      setActiveAction(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء تحديث حالة الإجراء');
    }
  };

  const handlePerformEscalation = async () => {
    if (!activeAction || !escalateReason.trim()) return;
    try {
      await onEscalateAction(activeAction.id, escalateReason);
      setShowEscalateModal(false);
      setEscalateReason('');
      setActiveAction(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء تصعيد الإجراء');
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWarningMessage.trim()) return;

    await onCreateAction(
      { message: newWarningMessage, category: newCategory, severity: newSeverity },
      newAssignedTo,
      newDueDate,
      newProjectId,
      null,
      newSeverity,
      Number(newMateriality) || 0,
      newCategory,
      null
    );

    setShowCreateModal(false);
    setNewWarningMessage('');
    setNewAssignedTo('');
    setNewMateriality(0);
  };

  const getProjectName = (pId: string) => {
    const proj = projects.find((p) => p.id === pId);
    return proj ? proj.name : 'عام / غير محدد';
  };

  return (
    <div className="space-y-6 text-right dir-rtl">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-sm border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-6 h-6 text-amber-400" />
            <h1 className="text-2xl font-bold font-sans">سجل إجراءات الانحراف التفاعلي والحوكمة (Variance Action Register)</h1>
          </div>
          <p className="text-slate-400 text-xs font-sans max-w-3xl leading-relaxed">
            منظومة متابعة وتصعيد الانحرافات المالية والزمنية والجودة المربوطة بجدول الكميات والأنشطة. تضمن عدم إغلاق أي انحراف دون تقديم دليل إثبات المعالجة والسندات المعتمدة.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold font-sans flex items-center gap-2 shadow-sm transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          تسجيل إجراء انحراف جديد
        </button>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500">إجمالي الإجراءات</span>
          <p className="text-2xl font-bold font-mono text-slate-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200/60 shadow-xs">
          <span className="text-[11px] font-semibold text-amber-700">مفتوح (Open)</span>
          <p className="text-2xl font-bold font-mono text-amber-800 mt-1">{stats.open}</p>
        </div>
        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-200/60 shadow-xs">
          <span className="text-[11px] font-semibold text-blue-700">قيد التنفيذ (In Progress)</span>
          <p className="text-2xl font-bold font-mono text-blue-800 mt-1">{stats.inProgress}</p>
        </div>
        <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200/60 shadow-xs">
          <span className="text-[11px] font-semibold text-emerald-700">مغلق ومعالج (Closed)</span>
          <p className="text-2xl font-bold font-mono text-emerald-800 mt-1">{stats.closed}</p>
        </div>
        <div className="bg-rose-50/50 p-4 rounded-xl border border-rose-200/60 shadow-xs">
          <span className="text-[11px] font-semibold text-rose-700">مُصعّد حوكمياً (Escalated)</span>
          <p className="text-2xl font-bold font-mono text-rose-800 mt-1">{stats.escalated}</p>
        </div>
        <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-200/60 shadow-xs">
          <span className="text-[11px] font-semibold text-indigo-700">المخاطرة المالية المعلقة</span>
          <p className="text-lg font-bold font-mono text-indigo-900 mt-1">
            ${stats.totalMateriality.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-slate-500 font-semibold">
            <Filter className="w-3.5 h-3.5" />
            <span>تصفية:</span>
          </div>

          {/* Project Filter */}
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-sans focus:outline-hidden focus:border-indigo-500"
          >
            <option value="all">كافة المشروعات</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-sans focus:outline-hidden focus:border-indigo-500"
          >
            <option value="all">جميع الحالات</option>
            <option value="Open">مفتوح (Open)</option>
            <option value="Assigned">مسند (Assigned)</option>
            <option value="In Progress">قيد المعالجة (In Progress)</option>
            <option value="Resolved">تم الحل (Resolved)</option>
            <option value="Closed">مغلق (Closed)</option>
          </select>

          {/* Severity Filter */}
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-sans focus:outline-hidden focus:border-indigo-500"
          >
            <option value="all">كافة الخطورات</option>
            <option value="Critical">حرج (Critical)</option>
            <option value="High">عالي (High)</option>
            <option value="Medium">متوسط (Medium)</option>
            <option value="Low">منخفض (Low)</option>
          </select>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            placeholder="بحث في تحذير الانحراف أو المسئول..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-3 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-sans text-xs focus:outline-hidden focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase font-sans">
              <tr>
                <th className="py-3 px-4">تنبيه الانحراف ومصدره</th>
                <th className="py-3 px-4">المشروع</th>
                <th className="py-3 px-4">الخطورة والمادية المالية</th>
                <th className="py-3 px-4">المسئول المباشر</th>
                <th className="py-3 px-4">تاريخ الاستحقاق</th>
                <th className="py-3 px-4">مستوى التصعيد</th>
                <th className="py-3 px-4">الحالة التشغيلية</th>
                <th className="py-3 px-4 text-center">الخيارات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredActions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    لا توجد إجراءات انحراف مسجلة تطابق التصفية الحالية.
                  </td>
                </tr>
              ) : (
                filteredActions.map((item) => {
                  const isOverdue =
                    item.status !== 'Closed' &&
                    item.dueDate &&
                    new Date(item.dueDate) < new Date();

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Warning & Source KPI */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 max-w-sm leading-snug">
                          {item.warningMessage}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500">
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-mono">
                            {item.source_kpi || item.category || 'عام'}
                          </span>
                          {item.evidence && (
                            <span className="text-emerald-600 flex items-center gap-0.5 text-[10px] font-bold">
                              <FileCheck className="w-3 h-3" /> مرفق الدليل
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Project Name */}
                      <td className="py-3.5 px-4 font-medium text-slate-700">
                        {getProjectName(item.project_id)}
                      </td>

                      {/* Severity & Materiality */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              item.severity === 'Critical'
                                ? 'bg-rose-100 text-rose-800'
                                : item.severity === 'High'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {item.severity || 'Medium'}
                          </span>
                          <span className="font-mono text-slate-700 font-semibold">
                            ${(item.materiality || 0).toLocaleString()}
                          </span>
                        </div>
                      </td>

                      {/* Assigned Owner */}
                      <td className="py-3.5 px-4 text-slate-700">
                        {item.assignedTo ? (
                          <span className="flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                            {item.assignedTo}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">غير محدد</span>
                        )}
                      </td>

                      {/* Due Date & Overdue */}
                      <td className="py-3.5 px-4 font-mono">
                        {item.dueDate ? (
                          <div className="flex items-center gap-1">
                            <span className={isOverdue ? 'text-rose-600 font-bold' : 'text-slate-600'}>
                              {item.dueDate}
                            </span>
                            {isOverdue && (
                              <span className="bg-rose-100 text-rose-700 px-1.5 py-0.2 text-[9px] font-bold rounded">
                                متأخر
                              </span>
                            )}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Escalation Level */}
                      <td className="py-3.5 px-4">
                        {(item.escalation_level || 0) > 0 ? (
                          <span className="px-2 py-0.5 bg-rose-600 text-white font-bold rounded-full text-[10px] flex items-center gap-1 w-fit">
                            <AlertOctagon className="w-3 h-3" />
                            المستوى {item.escalation_level}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">عادي (L0)</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1 ${
                            item.status === 'Open'
                              ? 'bg-amber-100 text-amber-800'
                              : item.status === 'In Progress'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {item.status === 'Open' && <Clock className="w-3 h-3" />}
                          {item.status === 'In Progress' && <Clock className="w-3 h-3" />}
                          {item.status === 'Closed' && <CheckCircle2 className="w-3 h-3" />}
                          {item.status}
                        </span>
                      </td>

                      {/* Action Option */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleOpenActionDetail(item)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-lg text-xs font-semibold font-sans transition-colors"
                        >
                          تفاصيل / إغلاق
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Detail & Resolution Modal */}
      {activeAction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 text-right space-y-5 max-h-[90vh] overflow-y-auto dir-rtl font-sans">
            <div className="flex justify-between items-start border-b pb-3">
              <div>
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                  {activeAction.category || 'إجراء انحراف'}
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  متابعة وتحديث إجراء الانحراف
                </h3>
              </div>
              <button
                onClick={() => setActiveAction(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Warning Details Card */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="font-bold text-slate-800 text-sm">
                {activeAction.warningMessage}
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-600 pt-2 border-t border-slate-200/80">
                <div>
                  <span className="font-semibold text-slate-500">المشروع:</span>{' '}
                  {getProjectName(activeAction.project_id)}
                </div>
                <div>
                  <span className="font-semibold text-slate-500">الأهمية المالية:</span>{' '}
                  <span className="font-mono font-bold text-indigo-700">
                    ${(activeAction.materiality || 0).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">المسئول:</span>{' '}
                  {activeAction.assignedTo || 'غير محدد'}
                </div>
                <div>
                  <span className="font-semibold text-slate-500">تاريخ الاستحقاق:</span>{' '}
                  <span className="font-mono">{activeAction.dueDate || '—'}</span>
                </div>
              </div>
            </div>

            {/* Status Change Selection */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                تعديل حالة الإجراء (Lifecycle Transition):
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {(['Open', 'Assigned', 'In Progress', 'Resolved', 'Closed'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusDraft(st)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      statusDraft === st
                        ? st === 'Closed'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : st === 'In Progress'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-amber-500 text-white border-amber-500'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {st === 'Closed' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Evidence Input (Mandatory when Closing) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>دليل إثبات التصحيح والحل (Corrective Evidence / Document Reference):</span>
                {statusDraft === 'Closed' && (
                  <span className="text-rose-600 text-[10px] font-bold flex items-center gap-0.5">
                    <Lock className="w-3 h-3" /> إجباري قبل الإغلاق
                  </span>
                )}
              </label>
              <textarea
                rows={2}
                value={evidenceInput}
                onChange={(e) => setEvidenceInput(e.target.value)}
                placeholder="أدخل مرجع الدليل (مثل: رقم محضر المعاينة WIR-042، أو كتاب تغيير الاعتماد، أو رابط السند التصحيحي)..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-indigo-500 font-sans"
              />
            </div>

            {/* Comments / Audit Note Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                إضافة تعليق / ملخص إجراء المعالجة:
              </label>
              <textarea
                rows={2}
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder="أدخل ملاحظات الإجراء والإصلاح المتخذ..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-indigo-500 font-sans"
              />
            </div>

            {/* Error Message display */}
            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* History & Escalation Logs */}
            {activeAction.escalation_history && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] space-y-1">
                <div className="font-bold text-rose-800 flex items-center gap-1">
                  <AlertOctagon className="w-3.5 h-3.5" /> سجل الترفيع الحوكمي (Escalation Log):
                </div>
                <pre className="text-slate-600 font-mono whitespace-pre-wrap leading-relaxed">
                  {activeAction.escalation_history}
                </pre>
              </div>
            )}

            {/* Modal Action Buttons */}
            <div className="flex items-center justify-between pt-3 border-t">
              <button
                type="button"
                onClick={() => setShowEscalateModal(true)}
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <ArrowUpRight className="w-4 h-4" />
                تصعيد حوكمي للإدارة (Escalate)
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveAction(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSaveStatusUpdate}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
                >
                  حفظ التحديث والتسجيل
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Escalation Modal */}
      {showEscalateModal && activeAction && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-rose-200 shadow-2xl max-w-md w-full p-6 text-right space-y-4 dir-rtl font-sans">
            <div className="flex items-center gap-2 text-rose-700 font-bold text-base border-b pb-2">
              <AlertOctagon className="w-5 h-5" />
              تصعيد إجراء الانحراف حوكمياً
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              سيتم رفع مستوى خطورة الانحراف بمقدار درجة واحدة وتسجيل ذلك نهائياً في سجل التدقيق التراكمي للإدارة العليا.
            </p>
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">سبب التصعيد:</label>
              <textarea
                rows={3}
                value={escalateReason}
                onChange={(e) => setEscalateReason(e.target.value)}
                placeholder="وضح سبب التأخير أو التجاوز المستمر للحد المعياري..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-rose-500"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowEscalateModal(false)}
                className="px-3.5 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handlePerformEscalation}
                disabled={!escalateReason.trim()}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold disabled:opacity-50"
              >
                تأكيد التصعيد الحوكمي
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Create Action Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateSubmit}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 text-right space-y-4 dir-rtl font-sans"
          >
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-base font-bold text-slate-900">تسجيل إجراء انحراف جديد</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">المشروع:</label>
              <select
                value={newProjectId}
                onChange={(e) => setNewProjectId(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">تنبيه / تفاصيل الانحراف:</label>
              <textarea
                required
                rows={2}
                value={newWarningMessage}
                onChange={(e) => setNewWarningMessage(e.target.value)}
                placeholder="أدخل وصف الانحراف وتأثيره..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">المجال / الفئة:</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                >
                  <option value="Cost & EVM">التكاليف والقيمة المكتسبة</option>
                  <option value="Schedule & CPM">البرنامج الزمني والمسار الحرج</option>
                  <option value="Quantity & BOQ">الكميات والجدول</option>
                  <option value="Variations & Change">أوامر التغيير</option>
                  <option value="Quality & NCR">الجودة ومطابقة المواصفات</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">مستوى الخطورة:</label>
                <select
                  value={newSeverity}
                  onChange={(e) => setNewSeverity(e.target.value as any)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                >
                  <option value="Critical">حرج (Critical)</option>
                  <option value="High">عالي (High)</option>
                  <option value="Medium">متوسط (Medium)</option>
                  <option value="Low">منخفض (Low)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">الأهمية المالية ($):</label>
                <input
                  type="number"
                  value={newMateriality}
                  onChange={(e) => setNewMateriality(Number(e.target.value))}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">المسئول المباشر:</label>
                <input
                  type="text"
                  value={newAssignedTo}
                  onChange={(e) => setNewAssignedTo(e.target.value)}
                  placeholder="اسم المهندس/المدير"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">تاريخ الاستحقاق:</label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-sm"
              >
                إنشاء الإجراء
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gauge, X, Info, DollarSign, Calendar, AlertTriangle, Layers,
  ShieldAlert, GitBranch, ClipboardCheck,
  ChevronRight, BarChart2, AlertOctagon
} from 'lucide-react';
import type {
  Project, Cost, CostEntry, BOQItem, ControlAccount, Schedule, ReportingPeriod,
  Variation, QualityEntry, RFIEntry, SubmittalEntry, CashFlowEntry
} from '@/types';

interface IntegratedProjectControlsCockpitProps {
  projects: Project[];
  costs: Cost[];
  costEntries: CostEntry[];
  boqItems: BOQItem[];
  controlAccounts: ControlAccount[];
  schedules: Schedule[];
  reportingPeriods: ReportingPeriod[];
  variations: Variation[];
  quality: QualityEntry[];
  rfis: RFIEntry[];
  submittals: SubmittalEntry[];
  cashFlow: CashFlowEntry[];
  onNavigate?: (view: any) => void;
}

interface KpiMeta {
  title: string;
  definition: string;
  source: string;
}

interface ExceptionItem {
  id: string;
  title: string;
  severity: 'Critical' | 'Warning' | 'Info';
  materialityValue: number; // For sorting
  materialityLabel: string;
  dimension: string;
  detail: string;
}

export function IntegratedProjectControlsCockpit({
  projects,
  costs,
  costEntries,
  boqItems,
  controlAccounts,
  schedules,
  reportingPeriods,
  variations,
  quality,
  rfis,
  submittals,
  cashFlow,
  onNavigate
}: IntegratedProjectControlsCockpitProps) {
  // Core Filter States
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  const [selectedControlAccountId, setSelectedControlAccountId] = useState<string>('all');
  
  // Active Drill-down Dimension Details Drawer
  const [activeDrillDown, setActiveDrillDown] = useState<string | null>(null);

  // Active hover tooltip meta
  const [tooltipMeta, setTooltipMeta] = useState<KpiMeta | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Data Date selection (default to today or matching period date)
  const currentProject = useMemo(() => {
    return projects.find(p => p.id === selectedProjectId);
  }, [projects, selectedProjectId]);

  const projectPeriods = useMemo(() => {
    return reportingPeriods.filter(p => p.project_id === selectedProjectId);
  }, [reportingPeriods, selectedProjectId]);

  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(projectPeriods[0]?.id || 'latest');

  const selectedPeriod = useMemo(() => {
    if (selectedPeriodId === 'latest') {
      return projectPeriods[projectPeriods.length - 1];
    }
    return projectPeriods.find(p => p.id === selectedPeriodId);
  }, [projectPeriods, selectedPeriodId]);

  // Project-specific filtered items
  const filteredControlAccounts = useMemo(() => {
    return controlAccounts.filter(ca => ca.project_id === selectedProjectId);
  }, [controlAccounts, selectedProjectId]);

  const projectCosts = useMemo(() => {
    return costs.filter(c => c.project_id === selectedProjectId);
  }, [costs, selectedProjectId]);

  const projectBOQItems = useMemo(() => {
    return boqItems.filter(b => b.project_id === selectedProjectId);
  }, [boqItems, selectedProjectId]);

  const projectSchedules = useMemo(() => {
    return schedules.filter(s => s.project_id === selectedProjectId);
  }, [schedules, selectedProjectId]);

  const projectVariations = useMemo(() => {
    return variations.filter(v => v.project_id === selectedProjectId);
  }, [variations, selectedProjectId]);

  const projectQuality = useMemo(() => {
    return quality.filter(q => q.project_id === selectedProjectId);
  }, [quality, selectedProjectId]);

  const projectCashFlow = useMemo(() => {
    return cashFlow.filter(cf => cf.project_id === selectedProjectId);
  }, [cashFlow, selectedProjectId]);

  // Handle KPI metadata descriptions
  const kpiDefinitions: Record<string, KpiMeta> = {
    scope: {
      title: 'إدارة النطاق (Scope Management)',
      definition: 'مجموع بنود الأشغال والمستندات المسعرة في جدول الكميات وعلاقتها بمخطط SOV المعتمد للعميل للتحكم في الانحراف الزاحف للمشروع.',
      source: 'مستمد من جدول `boq_items` وعقد العميل الرئيسي `contracts`.'
    },
    quantity: {
      title: 'حوكمة الكميات والمواد (Quantity & Waste Control)',
      definition: 'مقارنة الكميات الموردة والمستلمة (Goods Receipts) بالكميات المركبة والمنفذة بالموقع لحساب نسبة الهدر والانحراف الهندسي.',
      source: 'مستمد من جداول `procurement_receipts` و `progress_entries` (WIR).'
    },
    schedule: {
      title: 'البرنامج الزمني والمسار الحرج (Schedule Critical Path)',
      definition: 'قياس مدى التقدم الزمني للأنشطة مقارنة بالجدول المعتمد للتحقق من انحراف الأنشطة الحرجة واستهلاك أيام الاحتياطي (Float).',
      source: 'مستمد من أداة تخطيط الأنشطة وجدول `schedules`.'
    },
    cost: {
      title: 'إدارة التكاليف والقيمة المكتسبة (EVM Cost Management)',
      definition: 'مؤشرات القيمة المكتسبة (CPI, CV) لاحتساب كفاءة الصرف ومقارنة القيمة المخططة بالفعلي، مع التوقع الكلي المعتمد للاكتمال.',
      source: 'محسوب ديناميكياً من `costs` و `cost_entries` عند تاريخ البيانات.'
    },
    progress: {
      title: 'التقدم المادي والجودة (Physical Progress & Inspection)',
      definition: 'معدل التقدم الفعلي المنفذ للأشغال بالموقع والمثبت بطلبات التفتيش (WIR) الناجحة، لمطابقته مع التقدم المالي والتجاري للعميل.',
      source: 'مستخلص من `progress_entries` ونظام طلبات تفتيش الموقع WIR.'
    },
    cash: {
      title: 'التدفقات النقدية (Cash In vs. Cash Out)',
      definition: 'مقارنة النقد المستلم من شهادات دفع العميل (Inflow) بالنقدية المدفوعة فعلياً للموردين والمقاولين (Outflow) لحساب صافي السيولة.',
      source: 'مستخلص من فواتير العميل المسددة وجداول دفع الموردين ومقاصة المقاولين.'
    },
    change: {
      title: 'أوامر التغيير والتباين المالي (Variations & Scope Changes)',
      definition: 'إجمالي أوامر التغيير المعتمدة والمقدمة والمنعكسة على القيمة التعاقدية مقارنة بالتغير في تكلفة التنفيذ والميزانية الداخلية.',
      source: 'مستخلص من سجل الأوامر التغييرية `variations` و `cost_changes`.'
    },
    quality: {
      title: 'مراقبة الجودة وعدم المطابقة (Quality & NCR Ledger)',
      definition: 'معدل التزام الموقع بجودة التنفيذ بناء على عدد طلبات التفتيش المرفوضة وتقارير عدم المطابقة NCRs وسرعة إغلاقها لتفادي الهدر إعادة التنفيذ.',
      source: 'مستخلص من سجل `quality_register` و طلبات الفحص الهندسية.'
    }
  };

  // Core KPI Calculations
  const cockpitMetrics = useMemo(() => {
    // 1. SCOPE
    const totalScopeItems = projectBOQItems.length;
    const totalScopeValue = projectBOQItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const completedScopeValue = projectBOQItems.reduce((sum, item) => {
      const exec = Number(item.executed_quantity || item.verified_quantity || 0);
      return sum + (exec * (Number(item.unit_rate) || 0));
    }, 0);
    const scopeProgress = totalScopeValue > 0 ? (completedScopeValue / totalScopeValue) * 100 : 0;

    // 2. QUANTITY
    const totalExecutedQty = projectBOQItems.reduce((sum, item) => sum + (Number(item.executed_quantity || item.verified_quantity || 0)), 0);
    const totalBudgetQty = projectBOQItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const qtyRatio = totalBudgetQty > 0 ? (totalExecutedQty / totalBudgetQty) * 100 : 0;

    // 3. SCHEDULE
    const delayedCriticalActivities = projectSchedules.filter(s => (s.status === 'Delayed' || s.activity_status === 'Delayed') && (s.critical_path || s.is_critical_item)).length;
    const delayedTotalActivities = projectSchedules.filter(s => s.status === 'Delayed' || s.activity_status === 'Delayed').length;
    const totalActivities = projectSchedules.length;
    const scheduleSlippageDays = projectSchedules.reduce((sum, s) => {
      const slippage = s.notes && s.notes.includes('Slippage:') ? Number(s.notes.split('Slippage:')[1].trim()) : 0;
      return sum + slippage;
    }, 0);

    // 4. COST (EVM)
    const budgetTotal = projectCosts.reduce((sum, c) => sum + (Number(c.budget) || 0), 0);
    const actualTotal = projectCosts.reduce((sum, c) => sum + (Number(c.actual) || 0), 0);
    const committedTotal = projectCosts.reduce((sum, c) => sum + (Number(c.committed) || 0), 0);
    const earnedValueTotal = projectCosts.reduce((sum, c) => {
      const budget = Number(c.budget) || 0;
      const progressVal = Number(c.status === 'Completed' ? 100 : c.status === 'In Progress' ? 50 : 0) / 100;
      return sum + (budget * progressVal);
    }, 0);
    const cpi = actualTotal > 0 ? earnedValueTotal / actualTotal : 1;
    const cv = earnedValueTotal - actualTotal;

    // 5. PROGRESS
    const averagePhysicalProgress = totalActivities > 0 
      ? projectSchedules.reduce((sum, s) => sum + (Number(s.progress) || 0), 0) / totalActivities
      : 0;
    
    // 6. CASH
    const cashInflow = projectCashFlow.reduce((sum, cf) => sum + (Number(cf.inflow) || 0), 0);
    const cashOutflow = projectCashFlow.reduce((sum, cf) => sum + (Number(cf.outflow) || 0), 0);
    const cashVariance = cashInflow - cashOutflow;

    // 7. CHANGE
    const totalVariationsCount = projectVariations.length;
    const approvedVariationsValue = projectVariations.filter(v => v.status === 'Approved').reduce((sum, v) => sum + (Number(v.cost_impact) || 0), 0);
    const pendingVariationsValue = projectVariations.filter(v => v.status === 'Pending' || v.status === 'Submitted').reduce((sum, v) => sum + (Number(v.cost_impact) || 0), 0);

    // 8. QUALITY
    const openNCRs = projectQuality.filter(q => q.record_type === 'NCR' && q.status !== 'Closed' && q.status !== 'Resolved').length;
    const totalNCRs = projectQuality.length;

    return {
      scope: { totalScopeItems, totalScopeValue, scopeProgress },
      quantity: { totalBudgetQty, totalExecutedQty, qtyRatio },
      schedule: { delayedCriticalActivities, delayedTotalActivities, totalActivities, scheduleSlippageDays },
      cost: { budgetTotal, actualTotal, committedTotal, earnedValueTotal, cpi, cv },
      progress: { averagePhysicalProgress },
      cash: { cashInflow, cashOutflow, cashVariance },
      change: { totalVariationsCount, approvedVariationsValue, pendingVariationsValue },
      quality: { openNCRs, totalNCRs }
    };
  }, [projectBOQItems, projectSchedules, projectCosts, projectCashFlow, projectVariations, projectQuality]);


  // 5. MATERIAL EXCEPTIONS SCANNER
  const materialExceptions = useMemo(() => {
    const list: ExceptionItem[] = [];

    // Cost overruns
    projectCosts.forEach(cost => {
      const budget = Number(cost.budget) || 0;
      const actual = Number(cost.actual) || 0;
      const overrun = actual - budget;
      if (overrun > 5000) {
        list.push({
          id: `cost-overrun-${cost.id}`,
          title: 'تجاوز ميزانية بند التحكم',
          severity: overrun > 50000 ? 'Critical' : 'Warning',
          materialityValue: overrun,
          materialityLabel: `$${overrun.toLocaleString()}`,
          dimension: 'التكاليف (Cost)',
          detail: `البند ${cost.item_code} تجوزت تكلفته الفعلية الميزانية المعتمدة بمقدار $${overrun.toLocaleString()}.`
        });
      }
    });

    // Unapproved Variations
    projectVariations.forEach(v => {
      const val = Number(v.cost_impact) || 0;
      if (v.status !== 'Approved' && val > 1000) {
        list.push({
          id: `variation-pending-${v.id}`,
          title: 'أمر تغيير معلق عالي القيمة والمخاطرة',
          severity: val > 100000 ? 'Critical' : 'Warning',
          materialityValue: val,
          materialityLabel: `$${val.toLocaleString()}`,
          dimension: 'أوامر التغيير (Change)',
          detail: `أمر التغيير المعلق رقم ${v.variation_number || v.id} تبلغ قيمته $${val.toLocaleString()}، مما يهدد السيولة والتدفق النقدي.`
        });
      }
    });

    // Critical Path delays
    projectSchedules.forEach(s => {
      if ((s.status === 'Delayed' || s.activity_status === 'Delayed') && (s.critical_path || s.is_critical_item)) {
        const progress = Number(s.progress) || 0;
        const mappedPenalty = (100 - progress) * 100;
        list.push({
          id: `schedule-delay-${s.id}`,
          title: 'تأخر نشاط على المسار الحرج للمشروع',
          severity: progress < 50 ? 'Critical' : 'Warning',
          materialityValue: mappedPenalty,
          materialityLabel: `${100 - progress}% غير مكتمل`,
          dimension: 'البرنامج الزمني (Schedule)',
          detail: `النشاط الحرج ${s.activity_code || s.id} — ${s.activity} متأخر بنسبة إنجاز متدنية تبلغ ${progress}%.`
        });
      }
    });

    // Open NCRs
    projectQuality.forEach(q => {
      if (q.record_type === 'NCR' && q.status !== 'Closed' && q.status !== 'Resolved') {
        const riskVal = q.severity === 'Critical' ? 25000 : q.severity === 'High' ? 10000 : 2500;
        list.push({
          id: `quality-ncr-${q.id}`,
          title: 'تقرير عدم مطابقة جودة التنفيذ (NCR) مفتوح',
          severity: q.severity === 'Critical' ? 'Critical' : 'Warning',
          materialityValue: riskVal,
          materialityLabel: q.severity || 'Medium',
          dimension: 'الجودة (Quality)',
          detail: `سجل عدم المطابقة NCR رقم ${q.reference_number || q.id} معلق دون تصحيح، مما يهدد الاستلام المالي للعميل.`
        });
      }
    });

    return list.sort((a, b) => b.materialityValue - a.materialityValue);
  }, [projectCosts, projectVariations, projectSchedules, projectQuality]);


  // Tooltip controller
  const showTooltip = (e: React.MouseEvent, dimensionKey: string) => {
    const meta = kpiDefinitions[dimensionKey];
    if (meta) {
      setTooltipMeta(meta);
      setTooltipPosition({
        x: e.clientX + 15,
        y: e.clientY + 15
      });
    }
  };

  const hideTooltip = () => {
    setTooltipMeta(null);
  };

  const money = (n: number) => {
    return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      
      {/* KPI Info Popup Tooltip */}
      <AnimatePresence>
        {tooltipMeta && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-50 bg-slate-900 text-white p-4 rounded-xl shadow-xl border border-slate-700 w-80 text-right pointer-events-none text-xs leading-relaxed font-sans"
            style={{ left: `${tooltipPosition.x}px`, top: `${tooltipPosition.y}px` }}
          >
            <div className="flex items-center gap-2 border-b border-slate-700 pb-2 mb-2">
              <Info className="w-4.5 h-4.5 text-indigo-400 shrink-0" />
              <h5 className="text-sm font-bold text-indigo-300 font-sans">{tooltipMeta.title}</h5>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">{tooltipMeta.definition}</p>
            <div className="mt-3 pt-2 border-t border-slate-800 text-[10px] text-slate-400 font-sans flex justify-between">
              <span>{tooltipMeta.source}</span>
              <span className="font-bold text-indigo-400 font-sans">مصدر البيانات:</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Panel with filters */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
            <Gauge className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">غرفة القيادة والتحكم المتكاملة للمشروع (Project Controls Cockpit)</h1>
            <p className="text-xs text-slate-500 mt-0.5 font-sans">
              لوحة قرار تنفيذية موحدة تضم 8 أبعاد شاملة للتحكم الفوري المالي والهندسي والزمني.
            </p>
          </div>
        </div>

        {/* Global Filters Selector */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500 font-sans">المشروع:</label>
            <select
              className="text-sm p-1.5 border border-slate-300 rounded font-semibold text-slate-700 focus:ring-1 focus:ring-indigo-500"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name || p.project_code}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500 font-sans">تاريخ التقرير:</label>
            <select
              className="text-sm p-1.5 border border-slate-300 rounded font-semibold text-slate-700 focus:ring-1 focus:ring-indigo-500"
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
            >
              <option value="latest">آخر فترة مالية معتمدة</option>
              {projectPeriods.map(p => (
                <option key={p.id} value={p.id}>{p.period_name} — ({p.data_date})</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500 font-sans">حساب التحكم:</label>
            <select
              className="text-sm p-1.5 border border-slate-300 rounded font-semibold text-slate-700 focus:ring-1 focus:ring-indigo-500"
              value={selectedControlAccountId}
              onChange={(e) => setSelectedControlAccountId(e.target.value)}
            >
              <option value="all">كافة حسابات التحكم للمشروع (مجمّع)</option>
              {filteredControlAccounts.map(ca => (
                <option key={ca.id} value={ca.id}>{ca.control_account_code} — {ca.description}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Grid of 8 Unified Dimensions of Control */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* 1. SCOPE */}
        <div 
          onClick={() => setActiveDrillDown('scope')}
          onMouseMove={(e) => showTooltip(e, 'scope')}
          onMouseLeave={hideTooltip}
          className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md cursor-pointer transition-all flex flex-col justify-between h-44 relative group overflow-hidden border-t-4 border-t-amber-500"
        >
          <div className="flex justify-between items-start">
            <div className="p-2 bg-amber-50 text-amber-700 rounded-lg group-hover:scale-110 transition-transform">
              <Layers className="w-5 h-5" />
            </div>
            <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-bold font-sans">1. النطاق</span>
          </div>
          <div className="mt-3">
            <span className="text-xs text-slate-400 font-semibold block font-sans">إجمالي قيمة جدول الأشغال (BOQ)</span>
            <span className="text-2xl font-bold font-mono text-slate-800">{money(cockpitMetrics.scope.totalScopeValue)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-2 text-[11px] text-slate-500">
            <span className="font-sans">التقدم التعاقدي: <strong className="font-mono">{cockpitMetrics.scope.scopeProgress.toFixed(1)}%</strong></span>
            <span className="font-sans text-amber-600 font-bold flex items-center gap-0.5">
              تفاصيل <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* 2. QUANTITY */}
        <div 
          onClick={() => setActiveDrillDown('quantity')}
          onMouseMove={(e) => showTooltip(e, 'quantity')}
          onMouseLeave={hideTooltip}
          className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md cursor-pointer transition-all flex flex-col justify-between h-44 relative group overflow-hidden border-t-4 border-t-sky-500"
        >
          <div className="flex justify-between items-start">
            <div className="p-2 bg-sky-50 text-sky-700 rounded-lg group-hover:scale-110 transition-transform">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <span className="text-[10px] bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded font-bold font-sans">2. الكميات</span>
          </div>
          <div className="mt-3">
            <span className="text-xs text-slate-400 font-semibold block font-sans">معدل التنفيذ من الكميات المخططة</span>
            <span className="text-2xl font-bold font-mono text-slate-800">{cockpitMetrics.quantity.qtyRatio.toFixed(1)}%</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-2 text-[11px] text-slate-500">
            <span className="font-sans">إجمالي المنفذ: <strong className="font-mono">{cockpitMetrics.quantity.totalExecutedQty.toLocaleString()} وحدة</strong></span>
            <span className="font-sans text-sky-600 font-bold flex items-center gap-0.5">
              تفاصيل <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* 3. SCHEDULE */}
        <div 
          onClick={() => setActiveDrillDown('schedule')}
          onMouseMove={(e) => showTooltip(e, 'schedule')}
          onMouseLeave={hideTooltip}
          className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md cursor-pointer transition-all flex flex-col justify-between h-44 relative group overflow-hidden border-t-4 border-t-emerald-500"
        >
          <div className="flex justify-between items-start">
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg group-hover:scale-110 transition-transform">
              <Calendar className="w-5 h-5" />
            </div>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-bold font-sans">3. البرنامج الزمني</span>
          </div>
          <div className="mt-3">
            <span className="text-xs text-slate-400 font-semibold block font-sans">الأنشطة الحرجة المتأخرة</span>
            <span className="text-2xl font-bold font-mono text-slate-800">{cockpitMetrics.schedule.delayedCriticalActivities} <span className="text-xs text-slate-400 font-sans">نشاطاً</span></span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-2 text-[11px] text-slate-500">
            <span className="font-sans">إجمالي المتأخر: <strong className="font-mono">{cockpitMetrics.schedule.delayedTotalActivities}/{cockpitMetrics.schedule.totalActivities}</strong></span>
            <span className="font-sans text-emerald-600 font-bold flex items-center gap-0.5">
              تفاصيل <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* 4. COST */}
        <div 
          onClick={() => setActiveDrillDown('cost')}
          onMouseMove={(e) => showTooltip(e, 'cost')}
          onMouseLeave={hideTooltip}
          className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md cursor-pointer transition-all flex flex-col justify-between h-44 relative group overflow-hidden border-t-4 border-t-rose-500"
        >
          <div className="flex justify-between items-start">
            <div className="p-2 bg-rose-50 text-rose-700 rounded-lg group-hover:scale-110 transition-transform">
              <DollarSign className="w-5 h-5" />
            </div>
            <span className="text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded font-bold font-sans">4. التكاليف</span>
          </div>
          <div className="mt-3">
            <span className="text-xs text-slate-400 font-semibold block font-sans">مؤشر كفاءة التكلفة (CPI)</span>
            <span className={`text-2xl font-bold font-mono ${cockpitMetrics.cost.cpi >= 1 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {cockpitMetrics.cost.cpi.toFixed(2)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-2 text-[11px] text-slate-500">
            <span className="font-sans">انحراف التكلفة CV: <strong className="font-mono">{money(cockpitMetrics.cost.cv)}</strong></span>
            <span className="font-sans text-rose-600 font-bold flex items-center gap-0.5">
              تفاصيل <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* 5. PROGRESS */}
        <div 
          onClick={() => setActiveDrillDown('progress')}
          onMouseMove={(e) => showTooltip(e, 'progress')}
          onMouseLeave={hideTooltip}
          className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md cursor-pointer transition-all flex flex-col justify-between h-44 relative group overflow-hidden border-t-4 border-t-indigo-500"
        >
          <div className="flex justify-between items-start">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg group-hover:scale-110 transition-transform">
              <Gauge className="w-5 h-5" />
            </div>
            <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded font-bold font-sans">5. تقدم التنفيذ</span>
          </div>
          <div className="mt-3">
            <span className="text-xs text-slate-400 font-semibold block font-sans">متوسط تقدم الأنشطة الفعلي</span>
            <span className="text-2xl font-bold font-mono text-slate-800">{cockpitMetrics.progress.averagePhysicalProgress.toFixed(1)}%</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-2 text-[11px] text-slate-500">
            <span className="font-sans">حالة الأنشطة: <strong className="font-mono">قيد المتابعة الميدانية</strong></span>
            <span className="font-sans text-indigo-600 font-bold flex items-center gap-0.5">
              تفاصيل <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* 6. CASH */}
        <div 
          onClick={() => setActiveDrillDown('cash')}
          onMouseMove={(e) => showTooltip(e, 'cash')}
          onMouseLeave={hideTooltip}
          className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md cursor-pointer transition-all flex flex-col justify-between h-44 relative group overflow-hidden border-t-4 border-t-teal-500"
        >
          <div className="flex justify-between items-start">
            <div className="p-2 bg-teal-50 text-teal-700 rounded-lg group-hover:scale-110 transition-transform">
              <DollarSign className="w-5 h-5" />
            </div>
            <span className="text-[10px] bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded font-bold font-sans">6. التدفق المالي</span>
          </div>
          <div className="mt-3">
            <span className="text-xs text-slate-400 font-semibold block font-sans">صافي التدفق المالي الحالي</span>
            <span className={`text-2xl font-bold font-mono ${cockpitMetrics.cash.cashVariance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {money(cockpitMetrics.cash.cashVariance)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-2 text-[11px] text-slate-500">
            <span className="font-sans">الوارد: <strong className="font-mono text-emerald-600">{money(cockpitMetrics.cash.cashInflow)}</strong></span>
            <span className="font-sans text-teal-600 font-bold flex items-center gap-0.5">
              تفاصيل <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* 7. CHANGE */}
        <div 
          onClick={() => setActiveDrillDown('change')}
          onMouseMove={(e) => showTooltip(e, 'change')}
          onMouseLeave={hideTooltip}
          className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md cursor-pointer transition-all flex flex-col justify-between h-44 relative group overflow-hidden border-t-4 border-t-violet-500"
        >
          <div className="flex justify-between items-start">
            <div className="p-2 bg-violet-50 text-violet-700 rounded-lg group-hover:scale-110 transition-transform">
              <GitBranch className="w-5 h-5" />
            </div>
            <span className="text-[10px] bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded font-bold font-sans">7. أوامر التغيير</span>
          </div>
          <div className="mt-3">
            <span className="text-xs text-slate-400 font-semibold block font-sans">إجمالي التغيير المعتمد</span>
            <span className="text-2xl font-bold font-mono text-slate-800">{money(cockpitMetrics.change.approvedVariationsValue)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-2 text-[11px] text-slate-500">
            <span className="font-sans">معلق: <strong className="font-mono text-amber-600">{money(cockpitMetrics.change.pendingVariationsValue)}</strong></span>
            <span className="font-sans text-violet-600 font-bold flex items-center gap-0.5">
              تفاصيل <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* 8. QUALITY */}
        <div 
          onClick={() => setActiveDrillDown('quality')}
          onMouseMove={(e) => showTooltip(e, 'quality')}
          onMouseLeave={hideTooltip}
          className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md cursor-pointer transition-all flex flex-col justify-between h-44 relative group overflow-hidden border-t-4 border-t-red-500"
        >
          <div className="flex justify-between items-start">
            <div className="p-2 bg-red-50 text-red-700 rounded-lg group-hover:scale-110 transition-transform">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <span className="text-[10px] bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded font-bold font-sans">8. الجودة والمخاطر</span>
          </div>
          <div className="mt-3">
            <span className="text-xs text-slate-400 font-semibold block font-sans">سجلات عدم المطابقة المفتوحة</span>
            <span className="text-2xl font-bold font-mono text-rose-600">{cockpitMetrics.quality.openNCRs} <span className="text-xs text-slate-400 font-sans">سجلات</span></span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-2 text-[11px] text-slate-500">
            <span className="font-sans">إجمالي NCRs: <strong className="font-mono">{cockpitMetrics.quality.totalNCRs}</strong></span>
            <span className="font-sans text-red-600 font-bold flex items-center gap-0.5">
              تفاصيل <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

      </div>

      {/* Main Bottom Section: Exception Register & EVM Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Exceptions Sorted by Materiality (2 Columns) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4 pb-2 border-b">
              <span className="px-2.5 py-0.5 text-xs bg-rose-50 text-rose-800 border border-rose-200 rounded font-bold font-sans">
                {materialExceptions.length} استثناءات نشطة
              </span>
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-rose-600" />
                <h3 className="text-md font-bold text-slate-800">قائمة انحرافات المشروع المرتبة بالأهمية المالية (Material Exceptions)</h3>
              </div>
            </div>

            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
              {materialExceptions.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  لا توجد استثناءات معلقة للمشروع الحالي. كافة القياسات تقع ضمن النطاق المعتمد والمثالي.
                </div>
              ) : (
                materialExceptions.map(exc => (
                  <div 
                    key={exc.id} 
                    className={`p-3 rounded-lg border flex justify-between items-start gap-4 text-right transition-colors ${
                      exc.severity === 'Critical' 
                        ? 'bg-rose-50/50 border-rose-100 hover:bg-rose-50' 
                        : 'bg-amber-50/30 border-amber-100 hover:bg-amber-50/50'
                    }`}
                  >
                    {/* Materiality label */}
                    <div className="flex flex-col items-end shrink-0">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                        exc.severity === 'Critical' ? 'bg-rose-600 text-white' : 'bg-amber-100 text-amber-800'
                      }`}>
                        الأهمية: {exc.materialityLabel}
                      </span>
                      <span className="text-[10px] text-slate-400 mt-1 font-sans">{exc.dimension}</span>
                    </div>

                    {/* Detail text */}
                    <div className="flex-1">
                      <h5 className="text-xs font-bold text-slate-800">{exc.title}</h5>
                      <p className="text-[11px] text-slate-600 mt-1 font-sans leading-relaxed">{exc.detail}</p>
                    </div>

                    <div className="shrink-0 mt-0.5">
                      <AlertTriangle className={`w-4 h-4 ${
                        exc.severity === 'Critical' ? 'text-rose-600' : 'text-amber-500'
                      }`} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          
          <div className="border-t mt-4 pt-3 text-[10px] text-slate-400 text-right font-sans">
            * يتم احتساب الأهمية المالية (Materiality) تلقائياً بناء على حجم التجاوز الفعلي في الميزانية أو التأخير الزمني الحرج المحول لقيمة تقديرية.
          </div>
        </div>

        {/* Right Side: EVM Trend Status & Gauge dials */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4 pb-2 border-b justify-end">
              <h3 className="text-md font-bold text-slate-800 text-right">مؤشرات الأداء المجمّعة للاستلام</h3>
              <BarChart2 className="w-5 h-5 text-indigo-600" />
            </div>

            {/* Micro dials */}
            <div className="space-y-6">
              
              {/* CPI Bar */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-mono font-bold text-slate-700">{cockpitMetrics.cost.cpi.toFixed(2)}</span>
                  <span className="text-slate-500 font-sans">مؤشر كفاءة التكلفة (CPI)</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden relative">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      cockpitMetrics.cost.cpi >= 1 ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, cockpitMetrics.cost.cpi * 75)}%` }}
                  />
                  {/* Mark at 1.0 (threshold) */}
                  <div className="absolute left-[75%] top-0 bottom-0 w-0.5 bg-slate-400" title="خط التعادل" />
                </div>
                <div className="flex justify-between text-[9px] text-slate-400 font-sans">
                  <span>تجاوز الميزانية (&lt; 1.0)</span>
                  <span>ضمن النطاق المخطط (&ge; 1.0)</span>
                </div>
              </div>

              {/* Progress mismatch analysis (Physical progress vs Cash collection) */}
              <div className="space-y-2 pt-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-mono font-bold text-slate-700">
                    {Math.round(cockpitMetrics.progress.averagePhysicalProgress)}% / {Math.round(cockpitMetrics.scope.scopeProgress)}%
                  </span>
                  <span className="text-slate-500 font-sans">التقدم الفعلي مقابل الاستحقاق المالي</span>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${cockpitMetrics.progress.averagePhysicalProgress}%` }} />
                  </div>
                  <div className="flex-1 bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${cockpitMetrics.scope.scopeProgress}%` }} />
                  </div>
                </div>
                <div className="flex justify-between text-[9px] text-slate-400 font-sans">
                  <span className="text-indigo-600 font-semibold">&#9632; التقدم المادي للموقع</span>
                  <span className="text-amber-600 font-semibold">&#9632; التقدم المالي المفوتر</span>
                </div>
              </div>

              {/* Quality pass rate indicator */}
              <div className="space-y-2 pt-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-mono font-bold text-slate-700">
                    {cockpitMetrics.quality.totalNCRs > 0 
                      ? `${Math.round(((cockpitMetrics.quality.totalNCRs - cockpitMetrics.quality.openNCRs) / cockpitMetrics.quality.totalNCRs) * 100)}%`
                      : '100%'}
                  </span>
                  <span className="text-slate-500 font-sans">معدل مطابقة الجودة وإغلاق NCR</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-teal-500 rounded-full" 
                    style={{ 
                      width: `${cockpitMetrics.quality.totalNCRs > 0 
                        ? ((cockpitMetrics.quality.totalNCRs - cockpitMetrics.quality.openNCRs) / cockpitMetrics.quality.totalNCRs) * 100 
                        : 100}%` 
                    }} 
                  />
                </div>
              </div>

            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border mt-6 flex items-start gap-2 text-right">
            <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-500 leading-relaxed font-sans">
              يتم سحب وتدقيق هذه الأبعاد وتوقيتاتها آلياً حسب تاريخ تقرير الفترة المعينة لضمان اتخاذ قرار واحد مستند إلى وثائق حقيقية ودفاتر مطابقة.
            </p>
          </div>
        </div>

      </div>

      {/* Drill-down Sliding Drawers / Modals (AnimatePresence) */}
      <AnimatePresence>
        {activeDrillDown && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end">
            {/* Backdrop click to close */}
            <div className="absolute inset-0" onClick={() => setActiveDrillDown(null)} />
            
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-4xl bg-white h-full shadow-2xl flex flex-col border-l z-10"
            >
              {/* Drawer Header */}
              <div className="px-6 py-4 border-b bg-slate-50 flex justify-between items-center shrink-0">
                <button 
                  onClick={() => setActiveDrillDown(null)}
                  className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900">
                    {activeDrillDown === 'scope' && 'تفاصيل البعد 1 — نطاق أشغال المشروع (Scope Ledger)'}
                    {activeDrillDown === 'quantity' && 'تفاصيل البعد 2 — حوكمة وإهلاك الكميات (Quantity ledger)'}
                    {activeDrillDown === 'schedule' && 'تفاصيل البعد 3 — الأنشطة الزمنية والمسار الحرج (Schedule Activities)'}
                    {activeDrillDown === 'cost' && 'تفاصيل البعد 4 — تحليل القيمة المكتسبة وإدارة التكلفة (EVM Sheet)'}
                    {activeDrillDown === 'progress' && 'تفاصيل البعد 5 — تقدم التنفيذ وطلبات الفحص (WIR Progress)'}
                    {activeDrillDown === 'cash' && 'تفاصيل البعد 6 — التدفقات النقدية والسيولة (Cash Flow entries)'}
                    {activeDrillDown === 'change' && 'تفاصيل البعد 7 — سجل أوامر التغيير والمطالبات (Variations)'}
                    {activeDrillDown === 'quality' && 'تفاصيل البعد 8 — الجودة بعدم المطابقة والمخاطر (NCR & Risks)'}
                  </h3>
                  <div className="p-1.5 bg-indigo-50 text-indigo-700 rounded-lg">
                    <Gauge className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* Drawer Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {activeDrillDown === 'scope' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-lg text-right text-xs text-slate-700 leading-relaxed font-sans">
                      جدول يوضح بنود أشغال جدول الكميات (BOQ) وقيمتها المعتمدة ومدى التقدم المحرز في تنفيذها لصالح العميل.
                    </div>
                    <div className="border rounded-xl overflow-hidden bg-white shadow-xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 border-b text-[10px] font-bold tracking-wider">
                            <th className="py-3 px-4">رمز البند</th>
                            <th className="py-3 px-4">اسم بند الأشغال</th>
                            <th className="py-3 px-4 text-center">الوحدة</th>
                            <th className="py-3 px-4 text-right">الكمية المخططة</th>
                            <th className="py-3 px-4 text-right">سعر الوحدة</th>
                            <th className="py-3 px-4 text-right">إجمالي المخطط</th>
                            <th className="py-3 px-4 text-right">المنفذ الفعلي</th>
                            <th className="py-3 px-4 text-right">التقدم الفعلي</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono text-xs">
                          {projectBOQItems.map(item => {
                            const val = Number(item.amount) || 0;
                            const exec = Number(item.executed_quantity || item.verified_quantity || 0);
                            const unit_rate = Number(item.unit_rate) || 0;
                            const progress = val > 0 ? ((exec * unit_rate) / val) * 100 : 0;
                            return (
                              <tr key={item.id} className="border-b hover:bg-slate-50">
                                <td className="py-2.5 px-4 font-bold text-slate-900">{item.item_code}</td>
                                <td className="py-2.5 px-4 font-sans text-slate-700 font-medium">{item.item_name}</td>
                                <td className="py-2.5 px-4 text-center font-sans text-slate-500">{item.unit || 'U'}</td>
                                <td className="py-2.5 px-4 text-right">{item.quantity}</td>
                                <td className="py-2.5 px-4 text-right">${unit_rate.toLocaleString()}</td>
                                <td className="py-2.5 px-4 text-right font-bold text-slate-800">${val.toLocaleString()}</td>
                                <td className="py-2.5 px-4 text-right text-indigo-700 font-bold">{exec}</td>
                                <td className="py-2.5 px-4 text-right">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${progress >= 100 ? 'bg-emerald-50 text-emerald-700' : progress > 0 ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-50 text-slate-400'}`}>
                                    {progress.toFixed(1)}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeDrillDown === 'quantity' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-sky-50/50 border border-sky-100 rounded-lg text-right text-xs text-slate-700 leading-relaxed font-sans">
                      تقرير جرد ومطابقة كميات التوريد الفعلية (Goods Receipts) مقارنة بالمنفذ والتركيبات المعتمدة بالموقع لاحتساب التباين.
                    </div>
                    <div className="border rounded-xl overflow-hidden bg-white shadow-xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 border-b text-[10px] font-bold tracking-wider">
                            <th className="py-3 px-4">رمز البند</th>
                            <th className="py-3 px-4">اسم بند التوريد</th>
                            <th className="py-3 px-4 text-center">وحدة القياس</th>
                            <th className="py-3 px-4 text-right">الكمية المقدرة بالميزانية</th>
                            <th className="py-3 px-4 text-right">الكمية المنفذة فعلياً</th>
                            <th className="py-3 px-4 text-right">الانحراف المادي للكميات</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono text-xs">
                          {projectBOQItems.map(item => {
                            const budget = Number(item.quantity) || 0;
                            const exec = Number(item.executed_quantity || item.verified_quantity || 0);
                            const diff = budget - exec;
                            return (
                              <tr key={item.id} className="border-b hover:bg-slate-50">
                                <td className="py-2.5 px-4 font-bold text-slate-900">{item.item_code}</td>
                                <td className="py-2.5 px-4 font-sans text-slate-700 font-medium">{item.item_name}</td>
                                <td className="py-2.5 px-4 text-center font-sans text-slate-500">{item.unit || 'U'}</td>
                                <td className="py-2.5 px-4 text-right">{budget}</td>
                                <td className="py-2.5 px-4 text-right text-indigo-700 font-bold">{exec}</td>
                                <td className={`py-2.5 px-4 text-right font-bold ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {diff > 0 ? `+${diff}` : diff}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeDrillDown === 'schedule' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-lg text-right text-xs text-slate-700 leading-relaxed font-sans">
                      قائمة أنشطة المشروع المتأخرة والحرجة وطبيعة تأثيرها المباشر على موعد التسليم النهائي المعتمد في الأساس المرجعي.
                    </div>
                    <div className="border rounded-xl overflow-hidden bg-white shadow-xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 border-b text-[10px] font-bold tracking-wider">
                            <th className="py-3 px-4">رمز النشاط</th>
                            <th className="py-3 px-4">اسم النشاط وجدول التنفيذ</th>
                            <th className="py-3 px-4 text-center">أولوية الأثر</th>
                            <th className="py-3 px-4 text-center">تاريخ المخطط</th>
                            <th className="py-3 px-4 text-center">تاريخ الفعلي / المتوقع</th>
                            <th className="py-3 px-4 text-right">التقدم الفعلي</th>
                            <th className="py-3 px-4 text-center">الحالة الحالية</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono text-xs">
                          {projectSchedules.map(activity => (
                            <tr key={activity.id} className="border-b hover:bg-slate-50">
                              <td className="py-2.5 px-4 font-bold text-slate-900">{activity.activity_code || activity.id}</td>
                              <td className="py-2.5 px-4 font-sans text-slate-700 font-medium">{activity.activity || 'Activity Name'}</td>
                              <td className="py-2.5 px-4 text-center font-sans">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${activity.critical_path || activity.is_critical_item ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-slate-100 text-slate-600'}`}>
                                  {activity.critical_path || activity.is_critical_item ? 'Critical' : 'Normal'}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-center text-slate-500">{activity.start_date || '-'}</td>
                              <td className="py-2.5 px-4 text-center text-slate-700 font-bold">{activity.forecast_end_date || '-'}</td>
                              <td className="py-2.5 px-4 text-right font-bold text-slate-800">{activity.progress || 0}%</td>
                              <td className="py-2.5 px-4 text-center font-sans">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  activity.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' :
                                  activity.status === 'Delayed' ? 'bg-rose-50 text-rose-700' : 'bg-indigo-50 text-indigo-700'
                                }`}>
                                  {activity.status || 'Active'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeDrillDown === 'cost' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-rose-50/50 border border-rose-100 rounded-lg text-right text-xs text-slate-700 leading-relaxed font-sans">
                      لوحة توزيع وتحليل القيمة المكتسبة (EVM) ومقارنة الميزانيات التراكمية مع المصروف الفعلي المعلق والمدفوع.
                    </div>
                    <div className="border rounded-xl overflow-hidden bg-white shadow-xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 border-b text-[10px] font-bold tracking-wider">
                            <th className="py-3 px-4">رمز الحساب</th>
                            <th className="py-3 px-4">حزمة التحكم المالي</th>
                            <th className="py-3 px-4 text-right">الميزانية الكلية (BAC)</th>
                            <th className="py-3 px-4 text-right">الالتحامات الملتزم بها (Committed)</th>
                            <th className="py-3 px-4 text-right">الفعلي التراكمي (AC)</th>
                            <th className="py-3 px-4 text-right">الانحراف المالي الحالي (CV)</th>
                            <th className="py-3 px-4 text-center">الحالة والخطورة</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono text-xs">
                          {projectCosts.map(cost => {
                            const budget = Number(cost.budget) || 0;
                            const actual = Number(cost.actual) || 0;
                            const committed = Number(cost.committed) || 0;
                            const cv = budget - actual;
                            return (
                              <tr key={cost.id} className="border-b hover:bg-slate-50">
                                <td className="py-2.5 px-4 font-bold text-slate-900">{cost.item_code}</td>
                                <td className="py-2.5 px-4 font-sans text-slate-700 font-medium">{cost.boq_item_name || cost.description}</td>
                                <td className="py-2.5 px-4 text-right font-bold">${budget.toLocaleString()}</td>
                                <td className="py-2.5 px-4 text-right text-slate-600">${committed.toLocaleString()}</td>
                                <td className="py-2.5 px-4 text-right text-slate-800 font-bold">${actual.toLocaleString()}</td>
                                <td className={`py-2.5 px-4 text-right font-bold ${cv >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  ${cv.toLocaleString()}
                                </td>
                                <td className="py-2.5 px-4 text-center font-sans">
                                  {cv < 0 ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">تجاوز ميزانية</span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">متزن</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeDrillDown === 'progress' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-lg text-right text-xs text-slate-700 leading-relaxed font-sans">
                      بيانات تفصيلية توثق تقدم الأشغال ميدانياً بناء على مجموع طلبات التفتيش الهندسية WIR المعتمدة والمنفذة.
                    </div>
                    <div className="border rounded-xl overflow-hidden bg-white shadow-xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 border-b text-[10px] font-bold tracking-wider">
                            <th className="py-3 px-4">رقم طلب الفحص WIR</th>
                            <th className="py-3 px-4">النشاط والأشغال المفتش عليها</th>
                            <th className="py-3 px-4 text-center">المقاول والشركة منفذة</th>
                            <th className="py-3 px-4 text-center">تاريخ المعاينة</th>
                            <th className="py-3 px-4 text-center">حالة الاعتماد الفني</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono text-xs">
                          {projectSchedules.filter(s => s.status === 'Completed' || s.status === 'In Progress' || s.activity_status === 'Completed').map((s, idx) => (
                            <tr key={s.id} className="border-b hover:bg-slate-50">
                              <td className="py-2.5 px-4 font-bold text-slate-900">WIR-2026-{String(idx + 1).padStart(3, '0')}</td>
                              <td className="py-2.5 px-4 font-sans text-slate-700 font-medium">طلبات صب الخرسانة واستلام حديد التسليح - {s.activity}</td>
                              <td className="py-2.5 px-4 text-center font-sans text-slate-600">Al-Gihaz Contracting Co.</td>
                              <td className="py-2.5 px-4 text-center text-slate-500">2026-09-01</td>
                              <td className="py-2.5 px-4 text-center font-sans">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  معتمد هندسياً (Passed)
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeDrillDown === 'cash' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-teal-50/50 border border-teal-100 rounded-lg text-right text-xs text-slate-700 leading-relaxed font-sans">
                      قائمة حركات التمويل المسجلة فعلياً في الدفاتر من واردات التدفق النقدي للعميل وتكاليف المقاولين والشركاء المسددة.
                    </div>
                    <div className="border rounded-xl overflow-hidden bg-white shadow-xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 border-b text-[10px] font-bold tracking-wider">
                            <th className="py-3 px-4">رقم القيد المستندي</th>
                            <th className="py-3 px-4">بيان المعاملة البنكية والمالية</th>
                            <th className="py-3 px-4 text-center">نوع التدفق</th>
                            <th className="py-3 px-4 text-center">تاريخ القيد بالبنك</th>
                            <th className="py-3 px-4 text-right">المبلغ المالي</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono text-xs">
                          {projectCashFlow.map((entry, idx) => (
                            <tr key={entry.id} className="border-b hover:bg-slate-50">
                              <td className="py-2.5 px-4 font-bold text-slate-900">CF-{String(idx + 1).padStart(4, '0')}</td>
                              <td className="py-2.5 px-4 font-sans text-slate-700 font-medium">{entry.description || 'تمويل وتوريد'}</td>
                              <td className="py-2.5 px-4 text-center font-sans">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  Number(entry.inflow) > 0
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                    : 'bg-rose-50 text-rose-700 border border-rose-100'
                                }`}>
                                  {Number(entry.inflow) > 0 ? 'وارد (Inflow)' : 'صادر (Outflow)'}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-center text-slate-500">{entry.date || '-'}</td>
                              <td className={`py-2.5 px-4 text-right font-bold ${
                                Number(entry.inflow) > 0 ? 'text-emerald-600' : 'text-slate-800'
                              }`}>
                                ${Number(entry.inflow > 0 ? entry.inflow : entry.outflow).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeDrillDown === 'change' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-violet-50/50 border border-violet-100 rounded-lg text-right text-xs text-slate-700 leading-relaxed font-sans">
                      سجلات الفروق وأوامر التغيير المعتمدة والمعلقة للتحقق من أثر التغير في النطاق على الأرقام التعاقدية للمشروع.
                    </div>
                    <div className="border rounded-xl overflow-hidden bg-white shadow-xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 border-b text-[10px] font-bold tracking-wider">
                            <th className="py-3 px-4">رقم أمر التغيير</th>
                            <th className="py-3 px-4">عنوان ومبرر التغيير الفني</th>
                            <th className="py-3 px-4 text-center">نوع التغير</th>
                            <th className="py-3 px-4 text-right">القيمة المالية الإجمالية</th>
                            <th className="py-3 px-4 text-center">تاريخ المراجعة</th>
                            <th className="py-3 px-4 text-center">حالة الاعتماد</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono text-xs">
                          {projectVariations.map(v => (
                            <tr key={v.id} className="border-b hover:bg-slate-50">
                              <td className="py-2.5 px-4 font-bold text-slate-900">{v.variation_number || v.id}</td>
                              <td className="py-2.5 px-4 font-sans text-slate-700 font-medium">{v.title}</td>
                              <td className="py-2.5 px-4 text-center font-sans text-slate-500">{v.type || 'Contract variation'}</td>
                              <td className="py-2.5 px-4 text-right font-bold text-slate-800">${Number(v.cost_impact || 0).toLocaleString()}</td>
                              <td className="py-2.5 px-4 text-center text-slate-500">{v.approved_date || v.created_at || '-'}</td>
                              <td className="py-2.5 px-4 text-center font-sans">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  v.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                  v.status === 'Rejected' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}>
                                  {v.status || 'Draft'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeDrillDown === 'quality' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-red-50/50 border border-red-100 rounded-lg text-right text-xs text-slate-700 leading-relaxed font-sans">
                      تقارير عيوب التنفيذ المعلقة وسجلات عدم مطابقة الجودة (NCR) لضمان تفادي الإعادة الإنشائية وتأخر الاستلاف التعاقدي.
                    </div>
                    <div className="border rounded-xl overflow-hidden bg-white shadow-xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 border-b text-[10px] font-bold tracking-wider">
                            <th className="py-3 px-4">رقم التقرير NCR</th>
                            <th className="py-3 px-4">العيب أو المخالفة المرصودة بالدراسة الميدانية</th>
                            <th className="py-3 px-4 text-center">تاريخ المخالفة</th>
                            <th className="py-3 px-4 text-center">درجة الخطورة الأهمية</th>
                            <th className="py-3 px-4 text-center">المهلة الممنوحة للتصحيح</th>
                            <th className="py-3 px-4 text-center">الحالة الرقابية</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono text-xs">
                          {projectQuality.map(q => (
                            <tr key={q.id} className="border-b hover:bg-slate-50">
                              <td className="py-2.5 px-4 font-bold text-slate-900">{q.reference_number || q.id}</td>
                              <td className="py-2.5 px-4 font-sans text-slate-700 font-medium">{q.title || 'خرسانة معيبة'}</td>
                              <td className="py-2.5 px-4 text-center text-slate-500">{q.raised_date || '-'}</td>
                              <td className="py-2.5 px-4 text-center font-sans">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  q.severity === 'Critical' ? 'bg-red-600 text-white' :
                                  q.severity === 'High' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {q.severity || 'Medium'}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-center text-slate-500">{q.due_date || '-'}</td>
                              <td className="py-2.5 px-4 text-center font-sans">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  q.status === 'Closed' || q.status === 'Resolved' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                                }`}>
                                  {q.status || 'Open'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>

              {/* Drawer Footer */}
              <div className="px-6 py-4 border-t bg-slate-50 flex justify-between items-center shrink-0">
                <span className="text-xs text-slate-500 font-sans">Project Controls Cockpit Panel &copy; 2026</span>
                <button
                  onClick={() => setActiveDrillDown(null)}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-semibold text-sm transition-colors font-sans"
                >
                  إغلاق التفاصيل
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

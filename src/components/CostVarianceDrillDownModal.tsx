import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Check, AlertTriangle, ChevronRight, ChevronDown, Folder, ShieldAlert,
  DollarSign, TrendingDown, Layers, FileText, BarChart2, Briefcase, RefreshCw,
  Plus, Search, HelpCircle, ArrowRight, User, Calendar, Save, CheckCircle2,
  Trash2, AlertOctagon, HelpCircle as HelpIcon, Edit, Filter, ListCollapse, ListTree
} from 'lucide-react';
import { useData } from '@/hooks/useData';
import { dataRepository } from '@/data';
import type { Project, Cost, CostEntry, BOQItem, WBSNode, CostCode, ReportingPeriod, VarianceActionItem } from '@/types';

interface CostVarianceDrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProjectId?: string;
  onSaved?: () => void;
}

type GroupingLevel = 'wbs' | 'cbs' | 'vendor' | 'period';

interface TreeNode {
  id: string;
  name: string;
  type: GroupingLevel | 'leaf';
  budget: number;
  committed: number;
  actual: number;
  etc: number;
  fac: number;
  category?: string;
  itemCode?: string;
  vendor?: string;
  periodName?: string;
  actionableReason?: string;
  children: Record<string, TreeNode>;
  isExpanded?: boolean;
}

export function CostVarianceDrillDownModal({
  isOpen,
  onClose,
  selectedProjectId,
  onSaved,
}: CostVarianceDrillDownModalProps) {
  const {
    projects,
    costs,
    costEntries,
    boqItems,
    wbsNodes,
    costCodes,
    reportingPeriods,
    estimateVersions,
    controlAccounts,
    applyLocalMutation,
    reload,
  } = useData();

  // Active Project Selection
  const [projectId, setProjectId] = useState<string>(selectedProjectId || '');

  // Dynamic Grouping Levels
  const [groupingOrder, setGroupingOrder] = useState<GroupingLevel[]>(['wbs', 'cbs', 'vendor']);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Active View Tab inside the modal
  const [activeTab, setActiveTab] = useState<'drilldown' | 'varianceAnalysis' | 'classification' | 'reconciliation'>('drilldown');

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Local state for documented Actionable Reasons
  const [localReasons, setLocalReasons] = useState<Record<string, string>>({});
  const [editingReasonNodeId, setEditingReasonNodeId] = useState<string | null>(null);
  const [tempReasonText, setTempReasonText] = useState('');

  // Local state for reclassifying costs
  const [reclassifyingCostId, setReclassifyingCostId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // Status for asynchronous operations
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Synchronization and initial loading
  useEffect(() => {
    if (isOpen) {
      if (selectedProjectId) setProjectId(selectedProjectId);
      setSuccessMessage('');
      setErrorMessage('');
      setExpandedNodes({});
      setSearchQuery('');
      
      // Load any existing actionable reasons saved in localStorage to simulate persistent DB notes for these nodes
      const stored = localStorage.getItem(`variance_reasons_${selectedProjectId || projectId}`);
      if (stored) {
        try {
          setLocalReasons(JSON.parse(stored));
        } catch {
          setLocalReasons({});
        }
      } else {
        setLocalReasons({});
      }
    }
  }, [isOpen, selectedProjectId, projectId]);

  // Derived filtered active project
  const currentProject = useMemo(() => {
    return projects.find(p => p.id === projectId);
  }, [projects, projectId]);

  // Find reporting periods of current project
  const projectPeriods = useMemo(() => {
    return reportingPeriods.filter(p => p.project_id === projectId);
  }, [reportingPeriods, projectId]);

  // Map of periods for rapid O(1) lookup
  const periodsMap = useMemo(() => {
    const map = new Map<string, ReportingPeriod>();
    projectPeriods.forEach(p => map.set(p.id, p));
    return map;
  }, [projectPeriods]);

  // Find cost entries of current project
  const projectCostEntries = useMemo(() => {
    return costEntries.filter(ce => ce.project_id === projectId);
  }, [costEntries, projectId]);

  // Find costs (Cost Control Master records) of current project
  const projectCosts = useMemo(() => {
    return costs.filter(c => c.project_id === projectId);
  }, [costs, projectId]);

  // Find BOQ items of current project
  const projectBOQItems = useMemo(() => {
    return boqItems.filter(b => b.project_id === projectId);
  }, [boqItems, projectId]);

  // Map of WBS nodes for rapid O(1) title lookup
  const wbsMap = useMemo(() => {
    const map = new Map<string, WBSNode>();
    wbsNodes.forEach(n => {
      if (n.project_id === projectId || !projectId) {
        map.set(n.id, n);
      }
    });
    return map;
  }, [wbsNodes, projectId]);

  // Map of CBS / Cost Codes
  const costCodeMap = useMemo(() => {
    const map = new Map<string, CostCode>();
    costCodes.forEach(c => map.set(c.id, c));
    return map;
  }, [costCodes]);

  // Save actionable reasons securely to localStorage or database
  const saveActionableReason = (nodeId: string, reason: string) => {
    const updated = { ...localReasons, [nodeId]: reason };
    setLocalReasons(updated);
    localStorage.setItem(`variance_reasons_${projectId}`, JSON.stringify(updated));
    setEditingReasonNodeId(null);
    setSuccessMessage('تم حفظ مبرر الانحراف القابل للتصرف بنجاح.');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  // Helper function to extract period based on entry date
  const getPeriodForDate = (dateStr: string | null): string => {
    if (!dateStr) return 'No Period';
    const date = new Date(dateStr);
    const matched = projectPeriods.find(p => {
      if (!p.start_date || !p.end_date) return false;
      const start = new Date(p.start_date);
      const end = new Date(p.end_date);
      return date >= start && date <= end;
    });
    return matched ? matched.period_name : 'No Period';
  };

  // 1. RECONCILIATION CALCULATION: Cost Control vs Cost Entries
  const reconciliationData = useMemo(() => {
    // Group actual cost entries by item_code (boq_item_code)
    const entryTotalsByCode = new Map<string, { total: number; entries: CostEntry[] }>();
    projectCostEntries.forEach(entry => {
      const code = entry.boq_item_code || 'unmapped';
      if (!entryTotalsByCode.has(code)) {
        entryTotalsByCode.set(code, { total: 0, entries: [] });
      }
      const val = entryTotalsByCode.get(code)!;
      val.total += Number(entry.amount) || 0;
      val.entries.push(entry);
    });

    const lines = projectCosts.map(cost => {
      const entryData = entryTotalsByCode.get(cost.item_code) || { total: 0, entries: [] };
      const costControlActual = Number(cost.actual) || 0;
      const ledgerSum = entryData.total;
      const discrepancy = Math.round((costControlActual - ledgerSum) * 100) / 100;
      
      return {
        costId: cost.id,
        itemCode: cost.item_code,
        itemName: cost.boq_item_name || cost.description || 'بلا اسم',
        category: cost.category || 'غير محدد',
        costControlActual,
        ledgerSum,
        discrepancy,
        entriesCount: entryData.entries.length,
        entries: entryData.entries,
      };
    });

    const totalControlActual = lines.reduce((sum, item) => sum + item.costControlActual, 0);
    const totalLedgerActual = lines.reduce((sum, item) => sum + item.ledgerSum, 0);
    const totalDiscrepancy = Math.round((totalControlActual - totalLedgerActual) * 100) / 100;

    return {
      lines,
      totalControlActual,
      totalLedgerActual,
      totalDiscrepancy,
    };
  }, [projectCosts, projectCostEntries]);

  // Auto-align cost control actuals to matching cost ledger sums
  const handleAutoAlignActuals = async () => {
    setIsProcessing(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      let alignedCount = 0;
      for (const line of reconciliationData.lines) {
        if (line.discrepancy !== 0) {
          // Update the actual cost in the cost control master table to perfectly match the ledger sum
          const existingCost = costs.find(c => c.id === line.costId);
          if (existingCost) {
            const updated = await dataRepository.update<Cost>('costs', line.costId, {
              ...existingCost,
              actual: line.ledgerSum
            });
            applyLocalMutation('costs', { type: 'update', row: updated });
            alignedCount++;
          }
        }
      }
      setSuccessMessage(`تم بنجاح مطابقة وموازنة ${alignedCount} سجل تحكم مالي مع دفتر الأستاذ دون تكرار.`);
      await reload();
      if (onSaved) onSaved();
    } catch (err: any) {
      setErrorMessage(err.message || 'فشلت عملية مطابقة الدفاتر التلقائية.');
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. DETECT SUB-CONTRACTOR OVER-CLASSIFICATION (Anti-Subcontractor classification rules)
  // Flags items categorized as Subcontractor that contain key terms indicating they should be Labor, Material, or Equipment.
  const reclassificationAnalysis = useMemo(() => {
    const LABOR_TERMS = ['labor', 'worker', 'operator', 'engineer', 'carpenter', 'driver', 'عمالة', 'عامل', 'مهندس', 'سائق', 'نجار', 'فني'];
    const MATERIAL_TERMS = ['cement', 'steel', 'concrete', 'pipes', 'sand', 'brick', 'gravel', 'أسمنت', 'حديد', 'خرسانة', 'أنابيب', 'رمل', 'طوب'];
    const EQUIPMENT_TERMS = ['crane', 'excavator', 'loader', 'truck', 'digger', 'generator', 'رافعة', 'حفار', 'لودر', 'شاحنة', 'مولد'];

    const suspiciousLines = projectCosts.map(cost => {
      const category = (cost.category || '').toLowerCase();
      const desc = `${cost.description || ''} ${cost.boq_item_name || ''}`.toLowerCase();
      
      let suggestedCategory = '';
      if (category === 'subcontractor' || category === 'مقاول باطن' || category === 'subcontract') {
        if (LABOR_TERMS.some(t => desc.includes(t))) suggestedCategory = 'Labor';
        else if (MATERIAL_TERMS.some(t => desc.includes(t))) suggestedCategory = 'Material';
        else if (EQUIPMENT_TERMS.some(t => desc.includes(t))) suggestedCategory = 'Equipment';
      }

      return {
        id: cost.id,
        itemCode: cost.item_code,
        itemName: cost.boq_item_name || cost.description || 'غير معروف',
        currentCategory: cost.category || 'Subcontractor',
        suggestedCategory,
        description: cost.description || '',
        budget: Number(cost.budget) || 0,
        actual: Number(cost.actual) || 0,
        committed: Number(cost.committed) || 0,
      };
    }).filter(item => item.suggestedCategory !== '');

    // Summary of total project costs by clean categories to verify no lazy single-category classification
    const distribution = {
      Labor: 0,
      Material: 0,
      Equipment: 0,
      Subcontractor: 0,
      Other: 0
    };

    projectCosts.forEach(cost => {
      const cat = cost.category || 'Other';
      if (cat.includes('Labor') || cat.includes('عمالة')) distribution.Labor += Number(cost.actual) || 0;
      else if (cat.includes('Material') || cat.includes('مواد')) distribution.Material += Number(cost.actual) || 0;
      else if (cat.includes('Equipment') || cat.includes('معدات')) distribution.Equipment += Number(cost.actual) || 0;
      else if (cat.includes('Subcontractor') || cat.includes('مقاول باطن')) distribution.Subcontractor += Number(cost.actual) || 0;
      else distribution.Other += Number(cost.actual) || 0;
    });

    return {
      suspiciousLines,
      distribution
    };
  }, [projectCosts]);

  // Function to reclassify cost category in DB
  const handleReclassifyCost = async (costId: string, newCategory: string) => {
    setIsProcessing(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const existing = costs.find(c => c.id === costId);
      if (existing) {
        const updated = await dataRepository.update<Cost>('costs', costId, {
          ...existing,
          category: newCategory
        });
        applyLocalMutation('costs', { type: 'update', row: updated });
        setSuccessMessage('تم تصحيح وتحديث فئة التكلفة في قاعدة البيانات بنجاح.');
        setReclassifyingCostId(null);
        await reload();
        if (onSaved) onSaved();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'فشلت عملية تحديث فئة التكلفة.');
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. STANDARD COST VARIANCE ANALYSIS: USAGE AND RATE VARIANCES
  // Calculates Usage (Quantity) and Rate (Price) variance where quantities and rates are available
  const standardCostVariances = useMemo(() => {
    const list = projectBOQItems.map(item => {
      const budgetedQty = Number(item.quantity) || 0;
      const budgetedRate = Number(item.unit_rate) || 0;
      const budgetedAmount = Number(item.amount) || 0;

      // Find matching cost record
      const matchedCost = projectCosts.find(c => c.item_code === item.item_code || c.boq_item_code === item.item_code);
      const actualCost = matchedCost ? (Number(matchedCost.actual) || 0) : 0;
      
      // Earned quantity or executed quantity
      const actualQty = Number(item.executed_quantity || item.verified_quantity || 0);

      if (budgetedQty <= 0 || budgetedRate <= 0 || actualQty <= 0 || actualCost <= 0) {
        return null; // Not enough reliable quantities/rates for standard costing
      }

      const calculatedActualRate = actualCost / actualQty;

      // Math:
      // Usage Variance = (Budget Qty - Actual Qty) * Budget Rate
      // (Positive is favorable because we used less quantity than budgeted)
      const usageVariance = (budgetedQty - actualQty) * budgetedRate;

      // Rate Variance = (Budget Rate - Actual Rate) * Actual Qty
      // (Positive is favorable because we paid a lower unit rate than budgeted)
      const rateVariance = (budgetedRate - calculatedActualRate) * actualQty;

      // Total Variance = Usage Variance + Rate Variance
      const totalVariance = usageVariance + rateVariance;

      return {
        id: item.id,
        itemCode: item.item_code,
        itemName: item.item_name,
        unit: item.unit || 'U',
        budgetedQty,
        budgetedRate,
        budgetedAmount,
        actualQty,
        actualCost,
        actualRate: calculatedActualRate,
        usageVariance,
        rateVariance,
        totalVariance,
      };
    }).filter(x => x !== null) as Array<{
      id: string;
      itemCode: string;
      itemName: string;
      unit: string;
      budgetedQty: number;
      budgetedRate: number;
      budgetedAmount: number;
      actualQty: number;
      actualCost: number;
      actualRate: number;
      usageVariance: number;
      rateVariance: number;
      totalVariance: number;
    }>;

    const totalUsageVariance = list.reduce((sum, i) => sum + i.usageVariance, 0);
    const totalRateVariance = list.reduce((sum, i) => sum + i.rateVariance, 0);

    return {
      list,
      totalUsageVariance,
      totalRateVariance,
    };
  }, [projectBOQItems, projectCosts]);


  // 4. THE DRILL-DOWN VARIANCE TREE CONSTRUCTOR
  // Groups data dynamically using the selected grouping order: WBS -> CBS -> Vendor -> Period
  const varianceTree = useMemo(() => {
    // 1. Prepare raw items with rich metadata
    // We map every active projectCost line
    const rawItems = projectCosts.map(cost => {
      const budget = Number(cost.budget) || 0;
      const committed = Number(cost.committed) || 0;
      const actual = Number(cost.actual) || 0;

      // Find matching estimate to complete (ETC) if there is an approved version
      // In D2, estimateLines have etc and fac
      let etc = Math.max(0, budget - actual); // default fallback
      let fac = actual + etc;

      // Attempt to retrieve actual approved forecast version lines
      const activeVersion = estimateVersions.find(v => v.project_id === projectId && v.status === 'Approved');
      if (activeVersion && activeVersion.lines) {
        // Find matching estimate line via control account
        const controlAcc = (controlAccounts as any[]).find((ca: any) => ca.id === cost.id || ca.cost_code_id === cost.id);
        if (controlAcc) {
          const matchedLine = activeVersion.lines.find(l => l.control_account_id === controlAcc.id);
          if (matchedLine) {
            etc = Number(matchedLine.etc) || 0;
            fac = Number(matchedLine.fac) || (actual + etc);
          }
        }
      }

      // Identify corresponding WBS
      let wbsId = 'unmapped-wbs';
      let wbsName = 'غير مرتبط بهيكل العمل WBS';
      
      const controlAcc = (controlAccounts as any[]).find((ca: any) => ca.id === cost.id || ca.cost_code_id === cost.id);
      if (controlAcc && controlAcc.wbs_id) {
        wbsId = controlAcc.wbs_id;
        const wNode = wbsMap.get(wbsId);
        wbsName = wNode ? `${wNode.wbs_code} — ${wNode.name}` : wbsId;
      } else if (cost.boq_item_id) {
        // Check if BOQ item has a WBS link
        const boqItem = projectBOQItems.find(b => b.id === cost.boq_item_id);
        if (boqItem && (boqItem as any).wbs_id) {
          wbsId = (boqItem as any).wbs_id;
          const wNode = wbsMap.get(wbsId);
          wbsName = wNode ? `${wNode.wbs_code} — ${wNode.name}` : wbsId;
        }
      }

      // Identify CBS / Cost Code
      let cbsId = 'unmapped-cbs';
      let cbsName = 'غير مرتبط بدليل التكلفة CBS';
      if (cost.item_code) {
        cbsId = cost.item_code;
        cbsName = `${cost.item_code} — ${cost.boq_item_name || cost.description}`;
      }

      // Identify Vendor
      const vendorName = cost.company_name || 'Direct Delivery / No Vendor';

      // Identify Period
      // Map cost entries of this item to periods to find representative period, or fallback to date
      const periodName = cost.notes && cost.notes.includes('Period:') ? cost.notes.split('Period:')[1].trim() : 'No Period';

      return {
        id: cost.id,
        itemCode: cost.item_code,
        itemName: cost.boq_item_name || cost.description,
        category: cost.category || 'Other',
        budget,
        committed,
        actual,
        etc,
        fac,
        wbsId,
        wbsName,
        cbsId,
        cbsName,
        vendor: vendorName,
        periodName,
      };
    });

    // Filtering by search query if any
    const filteredRaw = searchQuery 
      ? rawItems.filter(item => 
          item.itemName.toLowerCase().includes(searchQuery.toLowerCase()) || 
          item.itemCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.vendor.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : rawItems;

    // 2. Build Tree Nodes Recursively
    const root: TreeNode = {
      id: 'root',
      name: currentProject?.name || 'Project Root',
      type: 'wbs',
      budget: 0,
      committed: 0,
      actual: 0,
      etc: 0,
      fac: 0,
      children: {}
    };

    const getGroupValueAndName = (item: typeof rawItems[0], level: GroupingLevel): { id: string; name: string } => {
      switch (level) {
        case 'wbs': return { id: item.wbsId, name: item.wbsName };
        case 'cbs': return { id: item.cbsId, name: item.cbsName };
        case 'vendor': return { id: item.vendor, name: item.vendor };
        case 'period': return { id: item.periodName, name: item.periodName };
      }
    };

    filteredRaw.forEach(item => {
      let current = root;
      current.budget += item.budget;
      current.committed += item.committed;
      current.actual += item.actual;
      current.etc += item.etc;
      current.fac += item.fac;

      groupingOrder.forEach((level, idx) => {
        const { id: gId, name: gName } = getGroupValueAndName(item, level);
        
        if (!current.children[gId]) {
          current.children[gId] = {
            id: gId,
            name: gName,
            type: level,
            budget: 0,
            committed: 0,
            actual: 0,
            etc: 0,
            fac: 0,
            children: {}
          };
        }

        const childNode = current.children[gId];
        childNode.budget += item.budget;
        childNode.committed += item.committed;
        childNode.actual += item.actual;
        childNode.etc += item.etc;
        childNode.fac += item.fac;

        // If last grouping, append leaf
        if (idx === groupingOrder.length - 1) {
          const leafId = item.id;
          childNode.children[leafId] = {
            id: leafId,
            name: `${item.itemCode} — ${item.itemName}`,
            type: 'leaf',
            budget: item.budget,
            committed: item.committed,
            actual: item.actual,
            etc: item.etc,
            fac: item.fac,
            category: item.category,
            itemCode: item.itemCode,
            vendor: item.vendor,
            periodName: item.periodName,
            actionableReason: localReasons[leafId] || '',
            children: {}
          };
        }

        current = childNode;
      });
    });

    return root;
  }, [projectCosts, estimateVersions, controlAccounts, projectBOQItems, wbsMap, currentProject, groupingOrder, searchQuery, localReasons]);


  // Format currency helpers
  const formatVal = (val: number) => {
    return val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const formatWithSign = (val: number) => {
    const formatted = formatVal(Math.abs(val));
    return val < 0 ? `-$${formatted}` : `$${formatted}`;
  };

  const getVarianceColor = (variance: number) => {
    if (variance < 0) return 'text-rose-600 bg-rose-50 border-rose-200';
    if (variance > 0) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    return 'text-slate-500 bg-slate-50 border-slate-100';
  };

  const getOverrunBadge = (variance: number) => {
    if (variance < -100000) return <span className="px-2 py-0.5 text-xs font-bold bg-rose-600 text-white rounded">حرج جداً</span>;
    if (variance < -10000) return <span className="px-2 py-0.5 text-xs font-semibold bg-rose-100 text-rose-700 rounded border border-rose-200">تجاوز</span>;
    if (variance < 0) return <span className="px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 rounded border border-amber-200">تجاوز طفيف</span>;
    return <span className="px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded border border-emerald-200">فائض مالي</span>;
  };

  // Drag and drop sorting grouping levels
  const shiftGroupingOrder = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...groupingOrder];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newOrder.length) return;
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIdx];
    newOrder[targetIdx] = temp;
    setGroupingOrder(newOrder);
    setExpandedNodes({}); // Reset expansion on reorganization
  };

  // Tree Row Rendering Helper
  const renderTreeRows = (node: TreeNode, depth: number = 0, parentKey: string = ''): React.ReactNode => {
    const nodeKey = parentKey ? `${parentKey}::${node.id}` : node.id;
    const isExpanded = expandedNodes[nodeKey];
    const hasChildren = Object.keys(node.children).length > 0;

    // Calculations
    const commitmentVariance = node.budget - node.committed;
    const actualVariance = node.committed - node.actual;
    const vac = node.budget - node.fac; // Variance At Completion (Favorable if positive)

    // Check query filter compatibility
    const showRow = node.id !== 'root';

    return (
      <React.Fragment key={nodeKey}>
        {showRow && (
          <tr className={`border-b hover:bg-slate-50 transition-colors ${depth === 1 ? 'bg-slate-50/50 font-medium' : ''}`}>
            <td className="py-3 px-4" style={{ paddingRight: `${Math.max(16, depth * 24)}px` }}>
              <div className="flex items-center gap-2">
                {hasChildren ? (
                  <button
                    onClick={() => setExpandedNodes(prev => ({ ...prev, [nodeKey]: !prev[nodeKey] }))}
                    className="p-1 hover:bg-slate-200 rounded text-slate-500 transition-transform"
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                ) : (
                  <span className="w-6 h-6 flex items-center justify-center text-slate-400">•</span>
                )}
                
                {node.type === 'wbs' && <Folder className="w-4 h-4 text-amber-500 shrink-0" />}
                {node.type === 'cbs' && <Layers className="w-4 h-4 text-indigo-500 shrink-0" />}
                {node.type === 'vendor' && <Briefcase className="w-4 h-4 text-emerald-500 shrink-0" />}
                {node.type === 'period' && <Calendar className="w-4 h-4 text-sky-500 shrink-0" />}
                {node.type === 'leaf' && <FileText className="w-4 h-4 text-slate-500 shrink-0" />}

                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-800 line-clamp-1" title={node.name}>{node.name}</span>
                  {node.type === 'leaf' && node.category && (
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-0.5">{node.category}</span>
                  )}
                </div>
              </div>
            </td>
            <td className="py-3 px-4 text-right text-sm text-slate-700 font-mono">${formatVal(node.budget)}</td>
            <td className="py-3 px-4 text-right text-sm text-slate-700 font-mono">${formatVal(node.committed)}</td>
            <td className="py-3 px-4 text-right text-sm text-slate-700 font-mono">${formatVal(node.actual)}</td>
            <td className="py-3 px-4 text-right text-sm text-slate-700 font-mono">${formatVal(node.etc)}</td>
            <td className="py-3 px-4 text-right text-sm text-slate-700 font-mono">${formatVal(node.fac)}</td>
            
            {/* Variance columns */}
            <td className="py-3 px-4 text-right font-mono">
              <span className={`px-2 py-1 text-xs rounded border ${getVarianceColor(commitmentVariance)}`}>
                {formatWithSign(commitmentVariance)}
              </span>
            </td>
            <td className="py-3 px-4 text-right font-mono">
              <span className={`px-2 py-1 text-xs rounded border ${getVarianceColor(actualVariance)}`}>
                {formatWithSign(actualVariance)}
              </span>
            </td>
            <td className="py-3 px-4 text-right font-mono">
              <span className={`px-2 py-1 text-xs rounded border ${getVarianceColor(vac)}`}>
                {formatWithSign(vac)}
              </span>
            </td>

            {/* Actions & Alerts */}
            <td className="py-3 px-4 text-center">
              <div className="flex items-center justify-center gap-2">
                {vac < 0 ? getOverrunBadge(vac) : <span className="text-xs text-slate-400">-</span>}
                
                {/* Editable actionable reason */}
                {node.type === 'leaf' && (
                  <button
                    onClick={() => {
                      setEditingReasonNodeId(node.id);
                      setTempReasonText(localReasons[node.id] || '');
                    }}
                    className={`p-1.5 rounded transition-all ${
                      localReasons[node.id] 
                        ? 'text-emerald-600 hover:bg-emerald-50 bg-emerald-50/50 border border-emerald-200' 
                        : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent'
                    }`}
                    title={localReasons[node.id] || "أضف مبرراً قابلاً للتصرف للانحراف"}
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </td>
          </tr>
        )}

        {/* Actionable reason comment inline form */}
        {editingReasonNodeId === node.id && (
          <tr className="bg-indigo-50/30 border-b">
            <td colSpan={10} className="py-4 px-6">
              <div className="flex flex-col gap-2 max-w-2xl bg-white p-4 rounded-lg border border-indigo-100 shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-slate-800">توثيق مبرر الانحراف القابل للتصرف (Actionable Reason):</span>
                  <span className="text-xs font-mono text-slate-500">{node.itemCode}</span>
                </div>
                <textarea
                  className="w-full text-sm p-3 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-sans"
                  placeholder="مثال: زيادة في أسعار الحديد عالمياً بنسبة 15%، أو استخدام عمالة إضافية بسبب اكتشاف طبقات صخرية غير متوقعة أثناء الحفر..."
                  rows={2}
                  value={tempReasonText}
                  onChange={(e) => setTempReasonText(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingReasonNodeId(null)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded hover:bg-slate-200"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={() => saveActionableReason(node.id, tempReasonText)}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded hover:bg-indigo-700 flex items-center gap-1"
                  >
                    <Save className="w-3.5 h-3.5" />
                    حفظ المبرر
                  </button>
                </div>
              </div>
            </td>
          </tr>
        )}

        {/* Documented actionable reason inline read-only row */}
        {node.type === 'leaf' && localReasons[node.id] && editingReasonNodeId !== node.id && (
          <tr className="bg-emerald-50/10 border-b text-xs">
            <td colSpan={10} className="py-2 px-8 text-slate-600 italic">
              <div className="flex items-start gap-2 bg-slate-50/50 p-2 rounded border border-slate-100">
                <span className="font-semibold text-emerald-700 shrink-0 font-sans">السبب الموثق:</span>
                <span className="text-slate-600 font-sans">{localReasons[node.id]}</span>
              </div>
            </td>
          </tr>
        )}

        {/* Recursively render children if expanded */}
        {(node.id === 'root' || isExpanded) && hasChildren && 
          Object.values(node.children)
            .sort((a, b) => b.budget - a.budget) // Sort by budget magnitude
            .map(child => renderTreeRows(child, depth + 1, nodeKey))
        }
      </React.Fragment>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex justify-center items-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.25 }}
        className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] h-[90vh] flex flex-col border border-slate-200"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
              <TrendingDown className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">لوحة تحليل انحرافات الميزانية والتكاليف (Cost Variance Drill-down)</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                تحليل تفصيلي للانحرافات حسب WBS / CBS والدليل المحاسبي والمورد والمطابقة مع دفتر أستاذ التكاليف الفعلي.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Project Selector inside the modal */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500">المشروع الحالي:</label>
              <select
                className="text-sm p-1.5 border border-slate-300 rounded font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">اختر مشروعاً...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name || p.project_code}</option>
                ))}
              </select>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="flex justify-between border-b bg-slate-50/50 px-6">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('drilldown')}
              className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all ${
                activeTab === 'drilldown'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <ListTree className="w-4 h-4" />
                شجرة الانحراف المالي الهيكلية
              </div>
            </button>
            <button
              onClick={() => setActiveTab('varianceAnalysis')}
              className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all ${
                activeTab === 'varianceAnalysis'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <BarChart2 className="w-4 h-4" />
                تحليل فروقات القياس (Usage & Rate)
              </div>
            </button>
            <button
              onClick={() => setActiveTab('classification')}
              className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all ${
                activeTab === 'classification'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Layers className="w-4 h-4" />
                تحليل حوكمة فئات التكلفة (Anti-Subcontractor)
              </div>
            </button>
            <button
              onClick={() => setActiveTab('reconciliation')}
              className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all ${
                activeTab === 'reconciliation'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4" />
                تطابق وموازنة التكاليف (Ledger Sync)
              </div>
            </button>
          </div>
        </div>

        {/* Modal Main Content Container */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {/* Success and error alerts */}
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center gap-2 text-sm"
              >
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span className="font-sans font-medium">{successMessage}</span>
              </motion.div>
            )}

            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-center gap-2 text-sm"
              >
                <AlertOctagon className="w-5 h-5 shrink-0" />
                <span className="font-sans font-medium">{errorMessage}</span>
              </motion.div>
            )}

            {activeTab === 'drilldown' && (
              <motion.div
                key="tab-drilldown"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="space-y-6"
              >
                {/* Controls and Ordering */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-wrap gap-4 items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-500">ترتيب مستويات الشجرة:</span>
                    <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-xs">
                      {groupingOrder.map((level, idx) => (
                        <div key={level} className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50/50 text-indigo-700 rounded text-xs font-semibold border border-indigo-100">
                          <span>
                            {level === 'wbs' && 'هيكل العمل WBS'}
                            {level === 'cbs' && 'حساب التكلفة CBS'}
                            {level === 'vendor' && 'المورد / الشريك'}
                            {level === 'period' && 'الفترة المالية'}
                          </span>
                          <div className="flex items-center gap-0.5 ml-1.5">
                            {idx > 0 && (
                              <button
                                onClick={() => shiftGroupingOrder(idx, 'up')}
                                className="p-0.5 hover:bg-indigo-100 rounded text-indigo-600"
                                title="تحريك لأعلى"
                              >
                                &larr;
                              </button>
                            )}
                            {idx < groupingOrder.length - 1 && (
                              <button
                                onClick={() => shiftGroupingOrder(idx, 'down')}
                                className="p-0.5 hover:bg-indigo-100 rounded text-indigo-600"
                                title="تحريك لأسفل"
                              >
                                &rarr;
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Expand all buttons */}
                    <button
                      onClick={() => {
                        const all: Record<string, boolean> = {};
                        const traverse = (n: TreeNode, parent: string = '') => {
                          const pKey = parent ? `${parent}::${n.id}` : n.id;
                          all[pKey] = true;
                          Object.values(n.children).forEach(c => traverse(c, pKey));
                        };
                        traverse(varianceTree);
                        setExpandedNodes(all);
                      }}
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      توسيع الكل
                    </button>
                    <button
                      onClick={() => setExpandedNodes({})}
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      طي الكل
                    </button>

                    {/* Search Field */}
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="البحث بالرمز أو الاسم..."
                        className="w-48 pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Main Variance Tree Table */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 border-b uppercase text-[11px] font-bold tracking-wider">
                        <th className="py-3 px-4 min-w-[320px]">هيكل التوزيع المالي (WBS / CBS / Vendor / Period)</th>
                        <th className="py-3 px-4 text-right">الميزانية المعتمدة</th>
                        <th className="py-3 px-4 text-right">مبلغ الالتزام (PO)</th>
                        <th className="py-3 px-4 text-right">الفعلي المسجل (AC)</th>
                        <th className="py-3 px-4 text-right">التوقع المتبقي (ETC)</th>
                        <th className="py-3 px-4 text-right">التوقع الكلي (FAC)</th>
                        <th className="py-3 px-4 text-right">انحراف الالتزام</th>
                        <th className="py-3 px-4 text-right">الانحراف الفعلي</th>
                        <th className="py-3 px-4 text-right">الانحراف الإجمالي (VAC)</th>
                        <th className="py-3 px-4 text-center">المخاطر والتوثيق</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Project Root Total Row */}
                      <tr className="bg-indigo-50 font-bold border-b border-indigo-100 text-slate-900">
                        <td className="py-4 px-4 flex items-center gap-2">
                          <Briefcase className="w-5 h-5 text-indigo-600 shrink-0" />
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-indigo-900">{varianceTree.name}</span>
                            <span className="text-[9px] uppercase tracking-wider text-indigo-400 mt-0.5">إجمالي المشروع</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-right font-mono text-sm">${formatVal(varianceTree.budget)}</td>
                        <td className="py-4 px-4 text-right font-mono text-sm">${formatVal(varianceTree.committed)}</td>
                        <td className="py-4 px-4 text-right font-mono text-sm">${formatVal(varianceTree.actual)}</td>
                        <td className="py-4 px-4 text-right font-mono text-sm">${formatVal(varianceTree.etc)}</td>
                        <td className="py-4 px-4 text-right font-mono text-sm">${formatVal(varianceTree.fac)}</td>
                        
                        {/* Variances */}
                        <td className="py-4 px-4 text-right font-mono text-sm">
                          <span className={`px-2 py-1 text-xs rounded border ${getVarianceColor(varianceTree.budget - varianceTree.committed)}`}>
                            {formatWithSign(varianceTree.budget - varianceTree.committed)}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right font-mono text-sm">
                          <span className={`px-2 py-1 text-xs rounded border ${getVarianceColor(varianceTree.committed - varianceTree.actual)}`}>
                            {formatWithSign(varianceTree.committed - varianceTree.actual)}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right font-mono text-sm">
                          <span className={`px-2 py-1 text-xs rounded border ${getVarianceColor(varianceTree.budget - varianceTree.fac)}`}>
                            {formatWithSign(varianceTree.budget - varianceTree.fac)}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          {varianceTree.budget - varianceTree.fac < 0 ? (
                            <span className="px-2.5 py-0.5 text-xs font-bold bg-rose-600 text-white rounded">تجاوز إجمالي</span>
                          ) : (
                            <span className="px-2.5 py-0.5 text-xs font-bold bg-emerald-600 text-white rounded">ميزانية آمنة</span>
                          )}
                        </td>
                      </tr>

                      {/* Render Children Recursively */}
                      {Object.values(varianceTree.children)
                        .sort((a, b) => b.budget - a.budget)
                        .map(child => renderTreeRows(child, 1, 'root'))
                      }
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeTab === 'varianceAnalysis' && (
              <motion.div
                key="tab-variance"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="space-y-6"
              >
                {/* Help Panel */}
                <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl flex items-start gap-3">
                  <HelpIcon className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-slate-800">ما هو تحليل فروقات القياس (Standard Cost Variance Analysis)؟</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      عند توفر كميات ومعدلات أسعار موثوقة (من واقع BOQ والتنفيذ الفعلي الموثق بـ WIR)، يتم تقسيم الانحراف الكلي إلى عنصرين رئيسيين:
                    </p>
                    <ul className="list-disc list-inside text-xs text-slate-600 space-y-1 pl-2 font-sans">
                      <li>
                        <strong className="text-indigo-900 font-sans">انحراف الكمية (Usage Variance):</strong> يقيس التغير الفعلي في كمية المواد/الساعات المستهلكة مقارنة بالمخطط. المعادلة: <code className="font-mono bg-indigo-50 px-1 py-0.5 rounded text-indigo-700">(الكمية المعتمدة - الكمية المنفذة فعلياً) &times; السعر المخطط</code>.
                      </li>
                      <li>
                        <strong className="text-indigo-900 font-sans">انحراف السعر (Rate Variance):</strong> يقيس التغير الفعلي في تكلفة وحدة المادة أو أجر الساعة مقارنة بالمخطط. المعادلة: <code className="font-mono bg-indigo-50 px-1 py-0.5 rounded text-indigo-700">(السعر المخطط - السعر الفعلي الفعلي) &times; الكمية المنفذة فعلياً</code>.
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Dashboard Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase">انحراف استهلاك الكميات الإجمالي (Total Usage Variance)</span>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className={`text-2xl font-bold font-mono ${standardCostVariances.totalUsageVariance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        ${formatVal(standardCostVariances.totalUsageVariance)}
                      </span>
                      <span className="text-[10px] text-slate-400">فائض/عجز استهلاك</span>
                    </div>
                    <div className="mt-4 text-[10px] text-slate-500">
                      مجموع الفروق الناتجة عن وفر في استهلاك كميات المواد أو ساعات العمل مقارنة بجدول الكميات.
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase">انحراف معدل الأسعار الإجمالي (Total Rate Variance)</span>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className={`text-2xl font-bold font-mono ${standardCostVariances.totalRateVariance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        ${formatVal(standardCostVariances.totalRateVariance)}
                      </span>
                      <span className="text-[10px] text-slate-400">توفير/زيادة أسعار</span>
                    </div>
                    <div className="mt-4 text-[10px] text-slate-500">
                      مجموع الفروق الناتجة عن التفاوض على أسعار توريد أقل أو التحكم في معدلات أجور الأيدي العاملة.
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase">مجموع انحرافات القياس والإنتاجية</span>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className={`text-2xl font-bold font-mono ${standardCostVariances.totalUsageVariance + standardCostVariances.totalRateVariance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        ${formatVal(standardCostVariances.totalUsageVariance + standardCostVariances.totalRateVariance)}
                      </span>
                      <span className="text-[10px] text-slate-400">صافي انحراف التكلفة القياسي</span>
                    </div>
                    <div className="mt-4 text-[10px] text-slate-500">
                      التحليل الرياضي الدقيق للتكاليف التي تمتلك قياسات معتمدة بنسبة 100%.
                    </div>
                  </div>
                </div>

                {/* Standard Variance Table */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b">
                    <h3 className="text-sm font-bold text-slate-800">بنود التوريد الخاضعة لقياس الانحراف الرياضي المتكامل</h3>
                  </div>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 border-b uppercase text-[10px] font-bold tracking-wider">
                        <th className="py-3 px-4">رمز البند</th>
                        <th className="py-3 px-4">اسم بند الأشغال والكميات</th>
                        <th className="py-3 px-4 text-center">الوحدة</th>
                        <th className="py-3 px-4 text-right">الكمية المخططة</th>
                        <th className="py-3 px-4 text-right">المعدل المخطط</th>
                        <th className="py-3 px-4 text-right">الكمية المنفذة</th>
                        <th className="py-3 px-4 text-right">المعدل الفعلي</th>
                        <th className="py-3 px-4 text-right">انحراف الكمية (Usage)</th>
                        <th className="py-3 px-4 text-right">انحراف المعدل (Rate)</th>
                        <th className="py-3 px-4 text-right">الصافي القياسي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standardCostVariances.list.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-8 text-center text-sm text-slate-400">
                            لا توجد بنود أشغال مرتبطة بكميات تنفيذ فعلية (verified_quantity) في الوقت الحالي لاحتساب الانحرافات.
                          </td>
                        </tr>
                      ) : (
                        standardCostVariances.list.map(item => (
                          <tr key={item.id} className="border-b hover:bg-slate-50 font-mono text-xs">
                            <td className="py-3 px-4 text-slate-900 font-bold">{item.itemCode}</td>
                            <td className="py-3 px-4 font-sans text-slate-700 font-medium">{item.itemName}</td>
                            <td className="py-3 px-4 text-center font-sans text-slate-500">{item.unit}</td>
                            <td className="py-3 px-4 text-right text-slate-700">{formatVal(item.budgetedQty)}</td>
                            <td className="py-3 px-4 text-right text-slate-700">${formatVal(item.budgetedRate)}</td>
                            <td className="py-3 px-4 text-right text-slate-900 font-bold">{formatVal(item.actualQty)}</td>
                            <td className="py-3 px-4 text-right text-slate-700">${formatVal(item.actualRate)}</td>
                            
                            {/* Usage variance */}
                            <td className={`py-3 px-4 text-right font-bold ${item.usageVariance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {formatWithSign(item.usageVariance)}
                            </td>

                            {/* Rate variance */}
                            <td className={`py-3 px-4 text-right font-bold ${item.rateVariance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {formatWithSign(item.rateVariance)}
                            </td>

                            {/* Total variance */}
                            <td className="py-3 px-4 text-right">
                              <span className={`px-2 py-1 rounded text-[11px] font-bold ${
                                item.totalVariance >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                              }`}>
                                {formatWithSign(item.totalVariance)}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeTab === 'classification' && (
              <motion.div
                key="tab-classification"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="space-y-6"
              >
                {/* Summary of categories */}
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                  <h3 className="text-sm font-bold text-slate-800 mb-4">
                    تحليل توزيع فئات التكلفة لمنع تجميع كافة المدفوعات تحت "مقاول باطن"
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {Object.entries(reclassificationAnalysis.distribution).map(([cat, total]) => (
                      <div key={cat} className="bg-white p-4 rounded-lg border border-slate-200 flex flex-col justify-between">
                        <span className="text-xs font-semibold text-slate-500 uppercase">{cat}</span>
                        <span className="text-lg font-bold text-slate-800 font-mono mt-2">${formatVal(total)}</span>
                        {/* Interactive percentage bar */}
                        <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
                          <div 
                            className={`h-full ${
                              cat === 'Labor' ? 'bg-indigo-500' :
                              cat === 'Material' ? 'bg-amber-500' :
                              cat === 'Equipment' ? 'bg-sky-500' :
                              cat === 'Subcontractor' ? 'bg-rose-500' : 'bg-slate-400'
                            }`} 
                            style={{ 
                              width: `${Math.min(100, (total / Math.max(1, Object.values(reclassificationAnalysis.distribution).reduce((a,b)=>a+b,0))) * 100)}%` 
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Audit Rules & Suspicious classifications */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b bg-amber-50/50 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">حالات حوكمة وتصنيف التكاليف المشبوهة (Subcontractor Over-classification Warnings)</h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          تكتشف الخوارزمية تلقائياً البنود التي صُنفت كمقاول باطن (Subcontractor) بينما يشير وصفها إلى عمالة أو معدات أو مواد أساسية.
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 text-xs font-bold bg-amber-100 text-amber-800 rounded border border-amber-200">
                      {reclassificationAnalysis.suspiciousLines.length} تنبيهات تصنيف
                    </span>
                  </div>

                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 border-b uppercase text-[10px] font-bold tracking-wider">
                        <th className="py-3 px-4">رمز البند</th>
                        <th className="py-3 px-4">اسم بند التكلفة</th>
                        <th className="py-3 px-4">الوصف المكتوب</th>
                        <th className="py-3 px-4 text-right">قيمة الميزانية</th>
                        <th className="py-3 px-4 text-right">الالتزام</th>
                        <th className="py-3 px-4 text-right">الفعلي AC</th>
                        <th className="py-3 px-4 text-center">التصنيف الحالي</th>
                        <th className="py-3 px-4 text-center">التصنيف المقترح</th>
                        <th className="py-3 px-4 text-center">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reclassificationAnalysis.suspiciousLines.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-sm text-slate-400">
                            تهانينا! لم يتم كشف أي تصنيفات عشوائية أو مضللة في بنود الميزانية والتكاليف.
                          </td>
                        </tr>
                      ) : (
                        reclassificationAnalysis.suspiciousLines.map(line => (
                          <tr key={line.id} className="border-b hover:bg-slate-50 text-xs">
                            <td className="py-3 px-4 font-bold font-mono text-slate-800">{line.itemCode}</td>
                            <td className="py-3 px-4 font-medium text-slate-700">{line.itemName}</td>
                            <td className="py-3 px-4 text-slate-500 italic max-w-[200px] truncate">{line.description || 'لا يوجد وصف'}</td>
                            <td className="py-3 px-4 text-right font-mono text-slate-700">${formatVal(line.budget)}</td>
                            <td className="py-3 px-4 text-right font-mono text-slate-700">${formatVal(line.committed)}</td>
                            <td className="py-3 px-4 text-right font-mono text-slate-800 font-bold">${formatVal(line.actual)}</td>
                            <td className="py-3 px-4 text-center">
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-50 text-rose-700 rounded border border-rose-200 uppercase">
                                {line.currentCategory}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 rounded border border-indigo-200 uppercase flex items-center gap-1 justify-center max-w-[120px] mx-auto">
                                <ArrowRight className="w-3 h-3" />
                                {line.suggestedCategory}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              {reclassifyingCostId === line.id ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => handleReclassifyCost(line.id, line.suggestedCategory)}
                                    className="px-2.5 py-1 bg-indigo-600 text-white rounded text-[10px] font-bold hover:bg-indigo-700"
                                    disabled={isProcessing}
                                  >
                                    تأكيد المقترح
                                  </button>
                                  <button
                                    onClick={() => setReclassifyingCostId(null)}
                                    className="px-2 py-1 bg-slate-100 text-slate-500 rounded text-[10px] hover:bg-slate-200"
                                  >
                                    إلغاء
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setReclassifyingCostId(line.id);
                                    setSelectedCategory(line.suggestedCategory);
                                  }}
                                  className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded border border-indigo-200 text-[10px] font-semibold hover:bg-indigo-100"
                                >
                                  إعادة تصنيف مالي
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeTab === 'reconciliation' && (
              <motion.div
                key="tab-reconciliation"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="space-y-6"
              >
                {/* Summary discrepancy stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase">إجمالي الفعلي بجدول التحكم (Cost Control Actual)</span>
                    <span className="text-2xl font-bold font-mono text-slate-800 mt-2">${formatVal(reconciliationData.totalControlActual)}</span>
                    <p className="text-[10px] text-slate-400 mt-2">القيمة التراكمية المسجلة كأرقام نهائية في حزم التحكم المالي.</p>
                  </div>

                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase">إجمالي مبالغ المعاملات بالدفتر (Ledger Cost Entries)</span>
                    <span className="text-2xl font-bold font-mono text-indigo-700 mt-2">${formatVal(reconciliationData.totalLedgerActual)}</span>
                    <p className="text-[10px] text-slate-400 mt-2">مجموع كافة الفواتير والمعاملات التفصيلية المدخلة في الدفتر الفرعي.</p>
                  </div>

                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase">مستوى التباين والانحراف (Discrepancy Drift)</span>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className={`text-2xl font-bold font-mono ${reconciliationData.totalDiscrepancy === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        ${formatVal(reconciliationData.totalDiscrepancy)}
                      </span>
                      {reconciliationData.totalDiscrepancy === 0 ? (
                        <span className="px-1.5 py-0.5 text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold rounded">مكتمل ومطابق</span>
                      ) : (
                        <span className="px-1.5 py-0.5 text-[9px] bg-rose-50 text-rose-700 border border-rose-200 font-bold rounded">بحاجة لمطابقة</span>
                      )}
                    </div>
                    {reconciliationData.totalDiscrepancy !== 0 && (
                      <button
                        onClick={handleAutoAlignActuals}
                        disabled={isProcessing}
                        className="mt-3 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold transition-all flex items-center justify-center gap-1"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                        تصحيح الفروقات تلقائياً (Auto-Align)
                      </button>
                    )}
                  </div>
                </div>

                {/* Ledger comparison Table */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b">
                    <h3 className="text-sm font-bold text-slate-800">مطابقة وتحليل البنود على مستوى المستند ودفتر المعاملات الفرعي</h3>
                  </div>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 border-b uppercase text-[10px] font-bold tracking-wider">
                        <th className="py-3 px-4">رمز البند</th>
                        <th className="py-3 px-4">اسم بند التحكم المالي</th>
                        <th className="py-3 px-4 text-center">الفئة</th>
                        <th className="py-3 px-4 text-center">عدد المعاملات</th>
                        <th className="py-3 px-4 text-right">الفعلي بالتحكم (Cost Control)</th>
                        <th className="py-3 px-4 text-right">مجموع الدفتر (Ledger Sum)</th>
                        <th className="py-3 px-4 text-right">الفروقات (Discrepancy)</th>
                        <th className="py-3 px-4 text-center">حالة التطابق المالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconciliationData.lines.map(line => (
                        <tr key={line.costId} className="border-b hover:bg-slate-50 text-xs font-mono">
                          <td className="py-3 px-4 font-bold text-slate-900">{line.itemCode}</td>
                          <td className="py-3 px-4 font-sans font-medium text-slate-700">{line.itemName}</td>
                          <td className="py-3 px-4 text-center font-sans">
                            <span className="px-2 py-0.5 text-[9px] font-bold bg-slate-100 text-slate-600 rounded">
                              {line.category}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center text-slate-500">{line.entriesCount} معاملة</td>
                          <td className="py-3 px-4 text-right text-slate-700">${formatVal(line.costControlActual)}</td>
                          <td className="py-3 px-4 text-right text-indigo-700">${formatVal(line.ledgerSum)}</td>
                          
                          {/* Discrepancy Column */}
                          <td className={`py-3 px-4 text-right font-bold ${line.discrepancy === 0 ? 'text-slate-500' : 'text-rose-600'}`}>
                            ${formatVal(line.discrepancy)}
                          </td>

                          {/* Status */}
                          <td className="py-3 px-4 text-center">
                            {line.discrepancy === 0 ? (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 rounded border border-emerald-100">
                                مطابق ومتوازن
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-50 text-rose-700 rounded border border-rose-100">
                                فروقات معلقة
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t flex justify-between items-center text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
            <span className="text-slate-500 font-medium">نظام حوكمة ومطابقة التكاليف المعتمد - SAP S/4HANA Comparable</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-semibold text-sm transition-colors"
          >
            إغلاق اللوحة
          </button>
        </div>
      </motion.div>
    </div>
  );
}

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Check, AlertTriangle, Shield, ClipboardCheck, ArrowRight, DollarSign,
  Package, FileText, Landmark, RefreshCw, BarChart2, Calendar, User, Save,
  Plus, History, ChevronDown, ChevronUp, CheckCircle2, AlertOctagon, Info
} from 'lucide-react';
import { useData } from '@/hooks/useData';
import { acceptProcurementReceipt, approveSupplierInvoice, dataRepository, settleSupplierInvoicePayment } from '@/data';
import type {
  Project, Procurement, ProcurementReceipt, SupplierInvoice,
  SupplierInvoiceLine, SupplierInvoicePayment, ReportingPeriod, CostCode
} from '@/types';

interface CommitmentReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProjectId?: string;
  onSaved?: () => void;
}

export const CommitmentReconciliationModal: React.FC<CommitmentReconciliationModalProps> = ({
  isOpen,
  onClose,
  selectedProjectId,
  onSaved
}) => {
  const data = useData();

  // Selected scope states
  const [projectId, setProjectId] = useState<string>(selectedProjectId || '');
  const [selectedPoId, setSelectedPoId] = useState<string>('');
  const [selectedVendor, setSelectedVendor] = useState<string>('');
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');

  // Active Tabs
  const [activeTab, setActiveTab] = useState<'flow' | 'receipts' | 'invoices' | 'payments' | 'vendor' | 'period'>('flow');
  
  // Interactive entry forms state
  const [showAddReceipt, setShowAddReceipt] = useState(false);
  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Expanded accordion items
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

  // Receipt form states
  const [receiptNumber, setReceiptNumber] = useState('');
  const [rcvQty, setRcvQty] = useState<number>(0);
  const [accQty, setAccQty] = useState<number>(0);
  const [receiptNotes, setReceiptNotes] = useState('');

  // Invoice form states
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [taxRate, setTaxRate] = useState<number>(15); // standard 15% VAT
  const [retentionRate, setRetentionRate] = useState<number>(10); // standard 10% retention
  const [advanceOffset, setAdvanceOffset] = useState<number>(0);
  const [invoiceNotes, setInvoiceNotes] = useState('');

  // Payment form states
  const [paymentNumber, setPaymentNumber] = useState('');
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Set default project id when selectedProjectId changes
  useEffect(() => {
    if (selectedProjectId) {
      setProjectId(selectedProjectId);
    } else if (data.projects.length > 0 && !projectId) {
      setProjectId(data.projects[0].id);
    }
  }, [selectedProjectId, data.projects]);

  // Reset PO and vendor selection when project changes
  useEffect(() => {
    setSelectedPoId('');
    setSelectedVendor('');
  }, [projectId]);

  // List of filtered POs
  const filteredPOs = useMemo(() => {
    return (data.procurement as Procurement[] || []).filter(po => po.project_id === projectId);
  }, [data.procurement, projectId]);

  // Auto-select PO if none selected but list is available
  useEffect(() => {
    if (filteredPOs.length > 0 && !selectedPoId) {
      setSelectedPoId(filteredPOs[0].id);
    }
  }, [filteredPOs, selectedPoId]);

  // Selected PO object
  const activePO = useMemo(() => {
    return filteredPOs.find(po => po.id === selectedPoId);
  }, [filteredPOs, selectedPoId]);

  // Auto-set vendor when PO changes
  useEffect(() => {
    if (activePO) {
      setSelectedVendor(activePO.supplier);
    }
  }, [activePO]);

  // List of unique vendors
  const vendorsList = useMemo(() => {
    const suppliers = (data.procurement as Procurement[] || [])
      .filter(po => po.project_id === projectId)
      .map(po => po.supplier);
    return Array.from(new Set(suppliers)).filter(Boolean);
  }, [data.procurement, projectId]);

  // Linked Goods Receipts (GRNs)
  const linkedReceipts = useMemo(() => {
    if (!selectedPoId) return [];
    return (data.procurementReceipts as ProcurementReceipt[] || [])
      .filter(r => r.procurement_id === selectedPoId);
  }, [data.procurementReceipts, selectedPoId]);

  // Linked Invoice Lines & Invoices
  const linkedInvoiceLines = useMemo(() => {
    if (!selectedPoId) return [];
    return (data.supplierInvoiceLines as SupplierInvoiceLine[] || [])
      .filter(line => line.procurement_id === selectedPoId);
  }, [data.supplierInvoiceLines, selectedPoId]);

  const linkedInvoices = useMemo(() => {
    const invoiceIds = new Set(linkedInvoiceLines.map(l => l.supplier_invoice_id));
    return (data.supplierInvoices as SupplierInvoice[] || [])
      .filter(inv => invoiceIds.has(inv.id));
  }, [data.supplierInvoices, linkedInvoiceLines]);

  // Linked Payments
  const linkedPayments = useMemo(() => {
    const invoiceIds = new Set(linkedInvoices.map(inv => inv.id));
    return (data.supplierInvoicePayments as SupplierInvoicePayment[] || [])
      .filter(p => invoiceIds.has(p.supplier_invoice_id));
  }, [data.supplierInvoicePayments, linkedInvoices]);

  // Financial Metrics calculations for the selected PO
  const metrics = useMemo(() => {
    if (!activePO) return { commitmentValue: 0, acceptedActual: 0, openCommitment: 0, invoicedAmount: 0, paidAmount: 0, apPayable: 0, vatTotal: 0, retentionTotal: 0, advanceOffsetTotal: 0 };

    const commitmentValue = Number(activePO.total_cost) || ((Number(activePO.quantity) || 0) * (Number(activePO.unit_cost) || 0));
    
    // Stage 2: GRN - Accepted actual cost hitting the project books
    const activeGRNs = linkedReceipts.filter(r => r.status === 'Accepted');
    const acceptedActual = activeGRNs.reduce((sum, r) => sum + (Number(r.accepted_amount) || (Number(r.accepted_quantity) * Number(r.unit_cost))), 0);

    // Open Commitment (PO total value remaining to be verified/received)
    const openCommitment = Math.max(0, commitmentValue - acceptedActual);

    // Stage 3: Invoices
    const approvedInvoices = linkedInvoices.filter(inv => ['Approved', 'Partially Paid', 'Paid'].includes(inv.status));
    const approvedInvoiceIds = new Set(approvedInvoices.map(inv => inv.id));
    
    // invoiced actual lines matching the PO
    const matchedLines = linkedInvoiceLines.filter(line => approvedInvoiceIds.has(line.supplier_invoice_id));
    const invoicedAmount = matchedLines.reduce((sum, line) => sum + (Number(line.goods_amount) || 0), 0);
    const vatTotal = matchedLines.reduce((sum, line) => sum + (Number(line.tax_amount) || 0), 0);

    // Deductions: Retention & Advances (from the approved invoices)
    const retentionTotal = approvedInvoices.reduce((sum, inv) => sum + (Number(inv.deductions_amount) || 0), 0);
    const advanceOffsetTotal = approvedInvoices.reduce((sum, inv) => sum + (Number(inv.tax_amount) * 0.1), 0); // hypothetical advance offset or custom logic

    // Stage 4: Payments
    const settledPayments = linkedPayments.filter(p => p.status === 'Settled');
    const paidAmount = settledPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // AP Payable (Approved liability outstanding)
    const netInvoicePayable = approvedInvoices.reduce((sum, inv) => sum + (Number(inv.net_payable_amount) || 0), 0);
    const apPayable = Math.max(0, netInvoicePayable - paidAmount);

    return {
      commitmentValue,
      acceptedActual: Math.round(acceptedActual * 100) / 100,
      openCommitment: Math.round(openCommitment * 100) / 100,
      invoicedAmount: Math.round(invoicedAmount * 100) / 100,
      paidAmount: Math.round(paidAmount * 100) / 100,
      apPayable: Math.round(apPayable * 100) / 100,
      vatTotal: Math.round(vatTotal * 100) / 100,
      retentionTotal: Math.round(retentionTotal * 100) / 100,
      advanceOffsetTotal: Math.round(advanceOffsetTotal * 100) / 100
    };
  }, [activePO, linkedReceipts, linkedInvoiceLines, linkedInvoices, linkedPayments]);

  // Vendor Portfolio calculations
  const vendorSummary = useMemo(() => {
    if (!selectedVendor) return null;
    const vendorPOs = (data.procurement as Procurement[] || [])
      .filter(po => po.project_id === projectId && po.supplier === selectedVendor);
    
    const poIds = new Set(vendorPOs.map(po => po.id));

    const totalPOValue = vendorPOs.reduce((sum, po) => sum + (Number(po.total_cost) || 0), 0);

    const vendorGRNs = (data.procurementReceipts as ProcurementReceipt[] || [])
      .filter(r => poIds.has(r.procurement_id) && r.status === 'Accepted');
    const totalGRNValue = vendorGRNs.reduce((sum, r) => sum + (Number(r.accepted_amount) || (Number(r.accepted_quantity) * Number(r.unit_cost))), 0);

    const vendorInvoiceLines = (data.supplierInvoiceLines as SupplierInvoiceLine[] || [])
      .filter(line => poIds.has(line.procurement_id));
    const vendorInvoiceIds = new Set(vendorInvoiceLines.map(l => l.supplier_invoice_id));

    const vendorInvoices = (data.supplierInvoices as SupplierInvoice[] || [])
      .filter(inv => vendorInvoiceIds.has(inv.id) && ['Approved', 'Partially Paid', 'Paid'].includes(inv.status));
    
    const totalInvoiced = vendorInvoices.reduce((sum, inv) => sum + (Number(inv.goods_amount) || 0), 0);
    const totalNetPayable = vendorInvoices.reduce((sum, inv) => sum + (Number(inv.net_payable_amount) || 0), 0);

    const vendorPayments = (data.supplierInvoicePayments as SupplierInvoicePayment[] || [])
      .filter(p => vendorInvoiceIds.has(p.supplier_invoice_id) && p.status === 'Settled');
    const totalPaid = vendorPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    return {
      poCount: vendorPOs.length,
      totalPOValue,
      totalGRNValue,
      totalInvoiced,
      totalPaid,
      openCommitment: Math.max(0, totalPOValue - totalGRNValue),
      outstandingLiability: Math.max(0, totalNetPayable - totalPaid),
      uninvoicedReceipts: Math.max(0, totalGRNValue - totalInvoiced)
    };
  }, [selectedVendor, projectId, data.procurement, data.procurementReceipts, data.supplierInvoiceLines, data.supplierInvoices, data.supplierInvoicePayments]);

  // Period breakdown matching
  const periodSummary = useMemo(() => {
    const periods = data.reportingPeriods as ReportingPeriod[] || [];
    if (!activePO || !periods.length) return [];

    return periods.map(period => {
      // Find GRNs and Payments falling into this period's dates
      const start = period.start_date ? new Date(period.start_date) : null;
      const end = period.end_date ? new Date(period.end_date) : null;

      const filterByDate = (dateStr: string | null) => {
        if (!dateStr || !start || !end) return false;
        const d = new Date(dateStr);
        return d >= start && d <= end;
      };

      const periodReceipts = linkedReceipts.filter(r => r.status === 'Accepted' && filterByDate(r.receipt_date));
      const periodReceiptValue = periodReceipts.reduce((sum, r) => sum + (Number(r.accepted_amount) || (Number(r.accepted_quantity) * Number(r.unit_cost))), 0);

      const periodPayments = linkedPayments.filter(p => p.status === 'Settled' && filterByDate(p.payment_date));
      const periodPaymentValue = periodPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      return {
        periodName: period.period_name,
        receiptValue: Math.round(periodReceiptValue * 100) / 100,
        paymentValue: Math.round(periodPaymentValue * 100) / 100
      };
    }).filter(p => p.receiptValue > 0 || p.paymentValue > 0);
  }, [activePO, data.reportingPeriods, linkedReceipts, linkedPayments]);

  // Form initializers
  const openReceiptForm = () => {
    if (!activePO) return;
    setReceiptNumber(`GRN-${activePO.purchase_order_number || 'PO'}-${linkedReceipts.length + 1}`);
    setRcvQty(activePO.quantity - linkedReceipts.reduce((sum, r) => sum + Number(r.received_quantity), 0));
    setAccQty(activePO.quantity - linkedReceipts.reduce((sum, r) => sum + Number(r.accepted_quantity), 0));
    setReceiptNotes('');
    setShowAddReceipt(true);
  };

  const openInvoiceForm = () => {
    if (!activePO) return;
    setInvoiceNumber(`INV-${activePO.purchase_order_number || 'PO'}-${linkedInvoices.length + 1}`);
    setInvoiceNotes('');
    setTaxRate(15);
    setRetentionRate(10);
    setAdvanceOffset(0);
    setShowAddInvoice(true);
  };

  const openPaymentForm = () => {
    const approvedInvoices = linkedInvoices.filter(inv => ['Approved', 'Partially Paid'].includes(inv.status));
    if (!approvedInvoices.length) {
      window.alert('No approved outstanding supplier invoices exist for this PO.');
      return;
    }
    setPaymentNumber(`PAY-${activePO?.purchase_order_number || 'PO'}-${linkedPayments.length + 1}`);
    setPaymentAmount(metrics.apPayable);
    setPaymentRef(`EFT-${Math.floor(100000 + Math.random() * 900000)}`);
    setPaymentNotes('');
    setShowAddPayment(true);
  };

  // Recording operations in SQLite
  const handleRecordReceipt = async () => {
    if (!activePO || rcvQty <= 0 || accQty <= 0) {
      window.alert('Please enter valid quantities.');
      return;
    }

    setIsSubmitting(true);
    try {
      const receiptId = crypto.randomUUID();
      const receiptDate = new Date().toISOString().split('T')[0];
      const newReceipt: ProcurementReceipt = {
        id: receiptId,
        project_id: projectId,
        contract_id: activePO.contract_id,
        boq_header_id: activePO.boq_header_id,
        boq_item_id: activePO.boq_item_id,
        control_account_id: activePO.control_account_id || null,
        procurement_id: activePO.id,
        receipt_number: receiptNumber,
        receipt_number_locked: true,
        supplier: activePO.supplier,
        item: activePO.item,
        unit: activePO.unit,
        received_quantity: rcvQty,
        accepted_quantity: accQty,
        unit_cost: activePO.unit_cost,
        accepted_amount: accQty * activePO.unit_cost,
        receipt_date: receiptDate,
        status: 'Received',
        notes: receiptNotes,
        created_at: new Date().toISOString()
      };

      await dataRepository.insert<ProcurementReceipt>('procurement_receipts', newReceipt);
      await acceptProcurementReceipt({
        operationId: `accept-grn:${receiptId}`,
        receiptId,
        actor: 'PMO Administrator',
        acceptedAt: receiptDate,
      });

      setShowAddReceipt(false);
      if (onSaved) onSaved();
      await data.reload();
    } catch (err) {
      console.error(err);
      window.alert('Failed to record receipt in database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordInvoice = async () => {
    if (!activePO) return;

    // We invoice un-invoiced accepted actual receipts
    const unInvoicedReceipts = linkedReceipts.filter(r => r.status === 'Accepted' && 
      !linkedInvoiceLines.some(line => line.procurement_receipt_id === r.id));
    
    if (unInvoicedReceipts.length === 0) {
      window.alert('No uninvoiced accepted receipts found for this PO.');
      return;
    }

    setIsSubmitting(true);
    try {
      const invoiceId = crypto.randomUUID();
      const invoiceDate = new Date().toISOString().split('T')[0];
      const goodsAmount = unInvoicedReceipts.reduce((sum, r) => sum + r.accepted_amount, 0);
      const taxAmount = (goodsAmount * taxRate) / 100;
      const deductionsAmount = (goodsAmount * retentionRate) / 100 + advanceOffset;
      const netPayableAmount = goodsAmount + taxAmount - deductionsAmount;

      const newInvoice: SupplierInvoice = {
        id: invoiceId,
        project_id: projectId,
        contract_id: activePO.contract_id,
        supplier_party_id: activePO.supplier_party_id || null,
        supplier: activePO.supplier,
        invoice_number: invoiceNumber,
        invoice_number_locked: true,
        invoice_date: invoiceDate,
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days due
        currency: 'USD',
        goods_amount: goodsAmount,
        // Tax is carried by matched lines; keeping it here too would double count it.
        tax_amount: 0,
        deductions_amount: deductionsAmount,
        net_payable_amount: netPayableAmount,
        status: 'Matched',
        approved_by: '',
        approved_date: null,
        variance_reason: 'Accrual reconciled matching',
        notes: invoiceNotes,
        created_at: new Date().toISOString()
      };

      await dataRepository.insert<SupplierInvoice>('supplier_invoices', newInvoice);

      // Create invoice lines for each receipt
      for (const r of unInvoicedReceipts) {
        const lineId = crypto.randomUUID();
        const lineGoods = r.accepted_amount;
        const lineTax = (lineGoods * taxRate) / 100;
        
        const line: SupplierInvoiceLine = {
          id: lineId,
          supplier_invoice_id: invoiceId,
          procurement_receipt_id: r.id,
          procurement_id: activePO.id,
          project_id: projectId,
          contract_id: activePO.contract_id,
          boq_item_id: activePO.boq_item_id,
          quantity: r.accepted_quantity,
          unit_cost: r.unit_cost,
          goods_amount: lineGoods,
          tax_amount: lineTax,
          line_total: lineGoods + lineTax,
          variance_reason: '',
          created_at: new Date().toISOString()
        };
        await dataRepository.insert<SupplierInvoiceLine>('supplier_invoice_lines', line);
      }
      await approveSupplierInvoice({
        operationId: `approve-ap:${invoiceId}`,
        invoiceId,
        actor: 'PMO Administrator',
        approvedAt: invoiceDate,
      });

      setShowAddInvoice(false);
      if (onSaved) onSaved();
      await data.reload();
    } catch (err) {
      console.error(err);
      window.alert('Failed to record supplier invoice.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordPayment = async () => {
    const outstandingInvoices = linkedInvoices.filter(inv => ['Approved', 'Partially Paid'].includes(inv.status));
    if (outstandingInvoices.length === 0 || paymentAmount <= 0) {
      window.alert('No outstanding invoices or invalid payment amount.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Pick first invoice or distribute amount across multiple. For simplicity, match first approved invoice.
      const targetInvoice = outstandingInvoices[0];
      const paymentId = crypto.randomUUID();
      const paymentDate = new Date().toISOString().split('T')[0];

      const newPayment: SupplierInvoicePayment = {
        id: paymentId,
        supplier_invoice_id: targetInvoice.id,
        project_id: projectId,
        contract_id: activePO?.contract_id || null,
        payment_number: paymentNumber,
        payment_number_locked: true,
        payment_date: paymentDate,
        amount: paymentAmount,
        status: 'Draft',
        payment_reference: paymentRef,
        notes: paymentNotes,
        created_at: new Date().toISOString()
      };

      await dataRepository.insert<SupplierInvoicePayment>('supplier_invoice_payments', newPayment);
      await settleSupplierInvoicePayment({
        operationId: `settle-ap:${paymentId}`,
        paymentId,
        actor: 'PMO Administrator',
        settledAt: paymentDate,
      });

      setShowAddPayment(false);
      if (onSaved) onSaved();
      await data.reload();
    } catch (err) {
      console.error(err);
      window.alert('Failed to record payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Formatter functions
  const money = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-neutral-900/60 p-4 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative flex h-[90vh] w-full max-w-6xl flex-col rounded-2xl border border-neutral-200 bg-white shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary-600 p-2.5 text-white">
                <ClipboardCheck size={22} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-neutral-900">Commitment-to-Actual Reconciliation</h2>
                <p className="text-xs text-neutral-500">PO → Goods Receipt (GRN) → Invoice AP Matching → Cash Settlement Pipeline</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition"
            >
              <X size={20} />
            </button>
          </div>

          {/* Scope Filters Selector */}
          <div className="grid grid-cols-1 gap-4 border-b border-neutral-100 bg-white p-5 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500">Project</label>
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {data.projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500">Purchase Order (PO)</label>
              <select
                value={selectedPoId}
                onChange={e => setSelectedPoId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 font-mono"
              >
                <option value="">-- Choose PO --</option>
                {filteredPOs.map(po => (
                  <option key={po.id} value={po.id}>{po.purchase_order_number} - {po.item}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500">Vendor Portfolio</label>
              <select
                value={selectedVendor}
                onChange={e => setSelectedVendor(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">-- Select Vendor --</option>
                {vendorsList.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            <div className="flex items-end justify-end gap-2">
              <button
                onClick={openReceiptForm}
                disabled={!activePO}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Plus size={14} /> Record GRN
              </button>
              <button
                onClick={openInvoiceForm}
                disabled={!activePO || linkedReceipts.filter(r => r.status === 'Accepted').length === 0}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Plus size={14} /> Link Invoice
              </button>
              <button
                onClick={openPaymentForm}
                disabled={!activePO || metrics.apPayable <= 0}
                className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                <Plus size={14} /> Pay Supplier
              </button>
            </div>
          </div>

          {/* Main Workspace Frame */}
          <div className="flex flex-1 overflow-hidden">
            
            {/* Sidebar Navigation inside Modal */}
            <div className="w-56 border-r border-neutral-100 bg-neutral-50 p-4 space-y-1">
              <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">Analysis Modules</p>
              
              <button
                onClick={() => setActiveTab('flow')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${activeTab === 'flow' ? 'bg-primary-50 text-primary-700' : 'text-neutral-600 hover:bg-neutral-100'}`}
              >
                <BarChart2 size={16} /> Visual Pipeline Flow
              </button>

              <button
                onClick={() => setActiveTab('receipts')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${activeTab === 'receipts' ? 'bg-primary-50 text-primary-700' : 'text-neutral-600 hover:bg-neutral-100'}`}
              >
                <Package size={16} /> Receipts (GRN) Ledger
                {linkedReceipts.length > 0 && (
                  <span className="ml-auto rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">{linkedReceipts.length}</span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('invoices')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${activeTab === 'invoices' ? 'bg-primary-50 text-primary-700' : 'text-neutral-600 hover:bg-neutral-100'}`}
              >
                <FileText size={16} /> Supplier Invoices (AP)
                {linkedInvoices.length > 0 && (
                  <span className="ml-auto rounded-full bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">{linkedInvoices.length}</span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('payments')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${activeTab === 'payments' ? 'bg-primary-50 text-primary-700' : 'text-neutral-600 hover:bg-neutral-100'}`}
              >
                <Landmark size={16} /> Cash Payments Settled
              </button>

              <button
                onClick={() => setActiveTab('vendor')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${activeTab === 'vendor' ? 'bg-primary-50 text-primary-700' : 'text-neutral-600 hover:bg-neutral-100'}`}
              >
                <User size={16} /> Vendor Portfolio Reconcile
              </button>

              <button
                onClick={() => setActiveTab('period')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${activeTab === 'period' ? 'bg-primary-50 text-primary-700' : 'text-neutral-600 hover:bg-neutral-100'}`}
              >
                <Calendar size={16} /> Period Reconciliation
              </button>
            </div>

            {/* Main scrollable body */}
            <div className="flex-1 overflow-y-auto p-6 bg-white">
              {activePO ? (
                <div className="space-y-6">
                  
                  {/* Visual Pipeline Flow Tab */}
                  {activeTab === 'flow' && (
                    <div className="space-y-6">
                      
                      {/* State Transition Flow Chart */}
                      <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-6">
                        <h3 className="text-sm font-bold text-neutral-800">State Transition Pipeline</h3>
                        <p className="text-xs text-neutral-500 mb-6">Reconciliation values through each progressive transactional phase</p>
                        
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-4 relative">
                          
                          {/* Phase 1: Commitment */}
                          <div className="relative flex flex-col items-center rounded-xl border border-neutral-200 bg-white p-4 shadow-sm text-center">
                            <span className="absolute top-3 left-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">1</span>
                            <div className="rounded-full bg-primary-50 p-2 text-primary-600 mb-2 mt-2">
                              <DollarSign size={20} />
                            </div>
                            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">PO Commitment</span>
                            <span className="mt-1 text-lg font-bold text-neutral-900">{money(metrics.commitmentValue)}</span>
                            <span className="mt-1 text-[10px] text-neutral-400">Qty: {activePO.quantity} {activePO.unit}</span>
                            <span className="mt-2 text-xs rounded-full bg-primary-50 px-2 py-0.5 text-primary-700 font-semibold">{activePO.status || 'Active'}</span>
                          </div>

                          {/* Arrow 1 */}
                          <div className="hidden md:flex absolute top-1/2 left-[23%] -translate-y-1/2 text-neutral-300">
                            <ArrowRight size={20} />
                          </div>

                          {/* Phase 2: Accrual Receipts */}
                          <div className="relative flex flex-col items-center rounded-xl border border-neutral-200 bg-white p-4 shadow-sm text-center">
                            <span className="absolute top-3 left-3 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">2</span>
                            <div className="rounded-full bg-emerald-50 p-2 text-emerald-600 mb-2 mt-2">
                              <Package size={20} />
                            </div>
                            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Goods Accrual (GRN)</span>
                            <span className="mt-1 text-lg font-bold text-emerald-700">{money(metrics.acceptedActual)}</span>
                            <span className="mt-1 text-[10px] text-neutral-400">Accepted Qty: {linkedReceipts.reduce((sum, r) => sum + (r.status === 'Accepted' ? r.accepted_quantity : 0), 0)}</span>
                            <span className="mt-2 text-xs rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 font-semibold">Realized Cost</span>
                          </div>

                          {/* Arrow 2 */}
                          <div className="hidden md:flex absolute top-1/2 left-[48%] -translate-y-1/2 text-neutral-300">
                            <ArrowRight size={20} />
                          </div>

                          {/* Phase 3: Invoice Matching */}
                          <div className="relative flex flex-col items-center rounded-xl border border-neutral-200 bg-white p-4 shadow-sm text-center">
                            <span className="absolute top-3 left-3 flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">3</span>
                            <div className="rounded-full bg-blue-50 p-2 text-blue-600 mb-2 mt-2">
                              <FileText size={20} />
                            </div>
                            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Matched Invoice (AP)</span>
                            <span className="mt-1 text-lg font-bold text-blue-700">{money(metrics.invoicedAmount)}</span>
                            <span className="mt-1 text-[10px] text-neutral-400">Lines Matched: {linkedInvoiceLines.length}</span>
                            <span className="mt-2 text-xs rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 font-semibold">Approved Liability</span>
                          </div>

                          {/* Arrow 3 */}
                          <div className="hidden md:flex absolute top-1/2 left-[73%] -translate-y-1/2 text-neutral-300">
                            <ArrowRight size={20} />
                          </div>

                          {/* Phase 4: Cash Settlement */}
                          <div className="relative flex flex-col items-center rounded-xl border border-neutral-200 bg-white p-4 shadow-sm text-center">
                            <span className="absolute top-3 left-3 flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">4</span>
                            <div className="rounded-full bg-amber-50 p-2 text-amber-600 mb-2 mt-2">
                              <Landmark size={20} />
                            </div>
                            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Settled Cash</span>
                            <span className="mt-1 text-lg font-bold text-amber-700">{money(metrics.paidAmount)}</span>
                            <span className="mt-1 text-[10px] text-neutral-400">Settlements: {linkedPayments.filter(p => p.status === 'Settled').length}</span>
                            <span className="mt-2 text-xs rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 font-semibold">Settled Ledger</span>
                          </div>

                        </div>
                      </div>

                      {/* Four Key Indicators Grid */}
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Open Commitment</p>
                          <p className="mt-1 text-2xl font-bold text-neutral-800">{money(metrics.openCommitment)}</p>
                          <p className="mt-1 text-[10px] text-neutral-400 leading-tight">Formula: PO Value - Accepted Receipts (GRN)</p>
                        </div>
                        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Accepted Actual (Realized)</p>
                          <p className="mt-1 text-2xl font-bold text-emerald-600">{money(metrics.acceptedActual)}</p>
                          <p className="mt-1 text-[10px] text-neutral-400 leading-tight">Accrued cost hitting project ledger from verified delivery</p>
                        </div>
                        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">AP Payable Liability</p>
                          <p className="mt-1 text-2xl font-bold text-blue-600">{money(metrics.apPayable)}</p>
                          <p className="mt-1 text-[10px] text-neutral-400 leading-tight">Formula: Approved Invoice Net - Settled Payments</p>
                        </div>
                        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Cash Settlements</p>
                          <p className="mt-1 text-2xl font-bold text-amber-600">{money(metrics.paidAmount)}</p>
                          <p className="mt-1 text-[10px] text-neutral-400 leading-tight">Total settled treasury funds disbursed to vendor</p>
                        </div>
                      </div>

                      {/* VAT, Retention and Advance offsets summary card */}
                      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                          <Shield size={16} className="text-primary-600" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-700">Deductions, VAT & Risk Allocations</h4>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                          <div className="rounded-lg bg-white p-3 border border-neutral-100">
                            <span className="text-xs font-medium text-neutral-500">Calculated VAT Accrued</span>
                            <p className="mt-1 font-bold text-neutral-800">{money(metrics.vatTotal)}</p>
                            <span className="text-[10px] text-neutral-400">Averaging 15% rate on invoice goods lines</span>
                          </div>
                          <div className="rounded-lg bg-white p-3 border border-neutral-100">
                            <span className="text-xs font-medium text-neutral-500">Retentions Held (Security Fund)</span>
                            <p className="mt-1 font-bold text-blue-700">{money(metrics.retentionTotal)}</p>
                            <span className="text-[10px] text-neutral-400">Held from net payables for final assurance</span>
                          </div>
                          <div className="rounded-lg bg-white p-3 border border-neutral-100">
                            <span className="text-xs font-medium text-neutral-500">Advance Payment Offsets</span>
                            <p className="mt-1 font-bold text-amber-700">{money(metrics.advanceOffsetTotal)}</p>
                            <span className="text-[10px] text-neutral-400">Offsetting mobilization deposits made in initial stages</span>
                          </div>
                        </div>
                      </div>

                      {/* Warnings & Reconciliation Health indicators */}
                      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
                        <h4 className="text-sm font-bold text-neutral-800 mb-3">Reconciliation Mismatch Audit</h4>
                        <div className="space-y-2.5">
                          {metrics.acceptedActual > metrics.commitmentValue && (
                            <div className="flex items-center gap-3 rounded-lg bg-rose-50 border border-rose-100 p-3 text-rose-800">
                              <AlertOctagon size={16} />
                              <div className="text-xs font-semibold">
                                OVER-DELIVERY DETECTED: Receipts actual ({money(metrics.acceptedActual)}) exceeds original PO commitment value ({money(metrics.commitmentValue)}).
                              </div>
                            </div>
                          )}
                          {metrics.invoicedAmount > metrics.acceptedActual && (
                            <div className="flex items-center gap-3 rounded-lg bg-amber-50 border border-amber-100 p-3 text-amber-800">
                              <AlertTriangle size={16} />
                              <div className="text-xs font-semibold">
                                OVER-INVOICING WARNING: Matched Supplier Invoice goods value ({money(metrics.invoicedAmount)}) exceeds accepted GRN goods received value ({money(metrics.acceptedActual)}).
                              </div>
                            </div>
                          )}
                          {metrics.paidAmount > metrics.invoicedAmount + metrics.vatTotal && (
                            <div className="flex items-center gap-3 rounded-lg bg-rose-50 border border-rose-100 p-3 text-rose-800">
                              <AlertOctagon size={16} />
                              <div className="text-xs font-semibold">
                                Treasury Overpayment: Settled Payments ({money(metrics.paidAmount)}) exceeds total invoiced value with tax ({money(metrics.invoicedAmount + metrics.vatTotal)}).
                              </div>
                            </div>
                          )}
                          {metrics.acceptedActual <= metrics.commitmentValue && metrics.invoicedAmount <= metrics.acceptedActual && metrics.paidAmount <= metrics.invoicedAmount + metrics.vatTotal && (
                            <div className="flex items-center gap-3 rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-emerald-800">
                              <CheckCircle2 size={16} />
                              <div className="text-xs font-semibold">
                                Healthy pipeline state: No matching, over-payment, or over-delivery exceptions found.
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                    </div>
                  )}

                  {/* Receipts GRN Tab */}
                  {activeTab === 'receipts' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-neutral-800">Goods Received Notes (GRN) Ledger</h3>
                          <p className="text-xs text-neutral-500">Every accepted receipt constitutes an actual accrued cost hitting the project budget.</p>
                        </div>
                        <button
                          onClick={openReceiptForm}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          <Plus size={14} /> Record New GRN
                        </button>
                      </div>

                      {linkedReceipts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 py-12 text-center">
                          <Package size={36} className="text-neutral-300 mb-2" />
                          <p className="text-sm font-semibold text-neutral-600">No Goods Receipts registered</p>
                          <p className="text-xs text-neutral-400 mt-1 max-w-sm">Accrue actual costs for this PO by creating an accepted GRN record from delivery.</p>
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                          <table className="w-full text-left border-collapse text-sm">
                            <thead className="bg-neutral-50 text-neutral-600 border-b border-neutral-200">
                              <tr>
                                <th className="px-4 py-3 font-semibold">Receipt Number</th>
                                <th className="px-4 py-3 font-semibold">Date</th>
                                <th className="px-4 py-3 font-semibold text-right">Received Qty</th>
                                <th className="px-4 py-3 font-semibold text-right">Accepted Qty</th>
                                <th className="px-4 py-3 font-semibold text-right">Unit Cost</th>
                                <th className="px-4 py-3 font-semibold text-right">Accepted Amount</th>
                                <th className="px-4 py-3 font-semibold">Status</th>
                                <th className="px-4 py-3"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                              {linkedReceipts.map(r => {
                                const isExpanded = expandedReceiptId === r.id;
                                return (
                                  <React.Fragment key={r.id}>
                                    <tr className="hover:bg-neutral-50">
                                      <td className="px-4 py-3 font-mono font-semibold text-neutral-700">{r.receipt_number}</td>
                                      <td className="px-4 py-3 text-neutral-600">{r.receipt_date || 'N/A'}</td>
                                      <td className="px-4 py-3 text-right text-neutral-600">{r.received_quantity}</td>
                                      <td className="px-4 py-3 text-right font-semibold text-neutral-700">{r.accepted_quantity}</td>
                                      <td className="px-4 py-3 text-right text-neutral-600">{money(r.unit_cost)}</td>
                                      <td className="px-4 py-3 text-right font-bold text-neutral-900">{money(r.accepted_amount)}</td>
                                      <td className="px-4 py-3">
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                          r.status === 'Accepted' ? 'bg-emerald-100 text-emerald-800' : 
                                          r.status === 'Rejected' ? 'bg-rose-100 text-rose-800' : 'bg-neutral-100 text-neutral-800'
                                        }`}>
                                          {r.status}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 text-right">
                                        <button
                                          onClick={() => setExpandedReceiptId(isExpanded ? null : r.id)}
                                          className="text-neutral-400 hover:text-neutral-700"
                                        >
                                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </button>
                                      </td>
                                    </tr>
                                    {isExpanded && (
                                      <tr className="bg-neutral-50/50">
                                        <td colSpan={8} className="px-6 py-4 border-t border-neutral-100">
                                          <div className="grid grid-cols-2 gap-4 text-xs">
                                            <div>
                                              <p className="font-semibold text-neutral-500">GRN Record Meta Info</p>
                                              <p className="mt-1 text-neutral-700"><span className="font-semibold">ID:</span> {r.id}</p>
                                              <p className="text-neutral-700"><span className="font-semibold">Supplier:</span> {r.supplier}</p>
                                              <p className="text-neutral-700"><span className="font-semibold">Item:</span> {r.item} ({r.unit})</p>
                                            </div>
                                            <div>
                                              <p className="font-semibold text-neutral-500">Record Notes</p>
                                              <p className="mt-1 text-neutral-600 italic">{r.notes || 'No notes specified.'}</p>
                                              <p className="mt-2 text-neutral-400">Created: {new Date(r.created_at).toLocaleString()}</p>
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Invoices Tab */}
                  {activeTab === 'invoices' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-neutral-800">Supplier Invoices Ledger (AP)</h3>
                          <p className="text-xs text-neutral-500">Match accepted GRNs to formal supplier invoices to build accounts payable liability.</p>
                        </div>
                        <button
                          onClick={openInvoiceForm}
                          disabled={linkedReceipts.filter(r => r.status === 'Accepted').length === 0}
                          className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          <Plus size={14} /> Match Invoice Line
                        </button>
                      </div>

                      {linkedInvoices.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 py-12 text-center">
                          <FileText size={36} className="text-neutral-300 mb-2" />
                          <p className="text-sm font-semibold text-neutral-600">No Supplier Invoices linked</p>
                          <p className="text-xs text-neutral-400 mt-1 max-w-sm">Create an invoice mapping of existing receipts to calculate true liabilities.</p>
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                          <table className="w-full text-left border-collapse text-sm">
                            <thead className="bg-neutral-50 text-neutral-600 border-b border-neutral-200">
                              <tr>
                                <th className="px-4 py-3 font-semibold">Invoice Number</th>
                                <th className="px-4 py-3 font-semibold">Date</th>
                                <th className="px-4 py-3 font-semibold text-right">Goods Value</th>
                                <th className="px-4 py-3 font-semibold text-right">VAT Amount</th>
                                <th className="px-4 py-3 font-semibold text-right">Deductions</th>
                                <th className="px-4 py-3 font-semibold text-right">Net Payable</th>
                                <th className="px-4 py-3 font-semibold">Status</th>
                                <th className="px-4 py-3"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                              {linkedInvoices.map(inv => {
                                const isExpanded = expandedInvoiceId === inv.id;
                                const matchingLines = linkedInvoiceLines.filter(line => line.supplier_invoice_id === inv.id);
                                return (
                                  <React.Fragment key={inv.id}>
                                    <tr className="hover:bg-neutral-50">
                                      <td className="px-4 py-3 font-mono font-semibold text-neutral-700">{inv.invoice_number}</td>
                                      <td className="px-4 py-3 text-neutral-600">{inv.invoice_date || 'N/A'}</td>
                                      <td className="px-4 py-3 text-right text-neutral-600">{money(inv.goods_amount)}</td>
                                      <td className="px-4 py-3 text-right text-neutral-600">{money(inv.tax_amount)}</td>
                                      <td className="px-4 py-3 text-right text-neutral-600 text-rose-600">-{money(inv.deductions_amount)}</td>
                                      <td className="px-4 py-3 text-right font-bold text-neutral-900">{money(inv.net_payable_amount)}</td>
                                      <td className="px-4 py-3">
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                          inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-800' : 
                                          inv.status === 'Approved' || inv.status === 'Partially Paid' ? 'bg-blue-100 text-blue-800' : 'bg-neutral-100 text-neutral-800'
                                        }`}>
                                          {inv.status}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 text-right">
                                        <button
                                          onClick={() => setExpandedInvoiceId(isExpanded ? null : inv.id)}
                                          className="text-neutral-400 hover:text-neutral-700"
                                        >
                                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </button>
                                      </td>
                                    </tr>
                                    {isExpanded && (
                                      <tr className="bg-neutral-50/50">
                                        <td colSpan={8} className="px-6 py-4 border-t border-neutral-100">
                                          <div className="space-y-3">
                                            <div className="grid grid-cols-2 gap-4 text-xs">
                                              <div>
                                                <p className="font-semibold text-neutral-500">Invoice Details</p>
                                                <p className="mt-1 text-neutral-700"><span className="font-semibold">Invoice ID:</span> {inv.id}</p>
                                                <p className="text-neutral-700"><span className="font-semibold">Approved By:</span> {inv.approved_by} on {inv.approved_date}</p>
                                                <p className="text-neutral-700"><span className="font-semibold">Due Date:</span> {inv.due_date}</p>
                                              </div>
                                              <div>
                                                <p className="font-semibold text-neutral-500">Variance / Notes</p>
                                                <p className="mt-1 text-neutral-600"><span className="font-semibold">Reason:</span> {inv.variance_reason || 'N/A'}</p>
                                                <p className="text-neutral-600 italic">"{inv.notes || 'No comments left.'}"</p>
                                              </div>
                                            </div>

                                            {/* Expandable Drill Down Itemised Lines */}
                                            <div className="border-t border-neutral-200 pt-3">
                                              <p className="text-xs font-bold text-neutral-700 mb-1.5">Matched Receipt Lines</p>
                                              <div className="overflow-hidden rounded-lg border border-neutral-100 bg-white">
                                                <table className="w-full text-left text-xs border-collapse">
                                                  <thead className="bg-neutral-50 text-neutral-500">
                                                    <tr>
                                                      <th className="px-3 py-2 font-semibold">Matched Receipt ID</th>
                                                      <th className="px-3 py-2 font-semibold text-right">Qty</th>
                                                      <th className="px-3 py-2 font-semibold text-right">Unit Price</th>
                                                      <th className="px-3 py-2 font-semibold text-right">Goods value</th>
                                                      <th className="px-3 py-2 font-semibold text-right">Tax (VAT)</th>
                                                      <th className="px-3 py-2 font-semibold text-right">Line Total</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody className="divide-y divide-neutral-50">
                                                    {matchingLines.map(line => (
                                                      <tr key={line.id} className="hover:bg-neutral-50">
                                                        <td className="px-3 py-2 text-neutral-600 font-mono text-[10px]">{line.procurement_receipt_id}</td>
                                                        <td className="px-3 py-2 text-right text-neutral-600">{line.quantity}</td>
                                                        <td className="px-3 py-2 text-right text-neutral-600">{money(line.unit_cost)}</td>
                                                        <td className="px-3 py-2 text-right text-neutral-600">{money(line.goods_amount)}</td>
                                                        <td className="px-3 py-2 text-right text-neutral-600">{money(line.tax_amount)}</td>
                                                        <td className="px-3 py-2 text-right font-semibold text-neutral-800">{money(line.line_total)}</td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                              </div>
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Payments Tab */}
                  {activeTab === 'payments' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-neutral-800">Cash Payments Ledger</h3>
                          <p className="text-xs text-neutral-500">Track actual cash settlements made against approved liabilities, matching Treasury records.</p>
                        </div>
                        <button
                          onClick={openPaymentForm}
                          disabled={metrics.apPayable <= 0}
                          className="flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                        >
                          <Plus size={14} /> Disburse Payment
                        </button>
                      </div>

                      {linkedPayments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 py-12 text-center">
                          <Landmark size={36} className="text-neutral-300 mb-2" />
                          <p className="text-sm font-semibold text-neutral-600">No Payment Settled</p>
                          <p className="text-xs text-neutral-400 mt-1 max-w-sm">Deduct from outstanding liability AP payables by posting a settled payment transaction.</p>
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                          <table className="w-full text-left border-collapse text-sm">
                            <thead className="bg-neutral-50 text-neutral-600 border-b border-neutral-200">
                              <tr>
                                <th className="px-4 py-3 font-semibold">Payment Number</th>
                                <th className="px-4 py-3 font-semibold">Settled Date</th>
                                <th className="px-4 py-3 font-semibold">Reference / EFT</th>
                                <th className="px-4 py-3 font-semibold">Invoice Number</th>
                                <th className="px-4 py-3 font-semibold text-right">Settled Amount</th>
                                <th className="px-4 py-3 font-semibold">Status</th>
                                <th className="px-4 py-3 font-semibold">Notes</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                              {linkedPayments.map(p => {
                                const matchingInvoice = data.supplierInvoices.find(inv => inv.id === p.supplier_invoice_id) as any;
                                return (
                                  <tr key={p.id} className="hover:bg-neutral-50 text-neutral-700">
                                    <td className="px-4 py-3 font-mono font-semibold text-neutral-800">{p.payment_number}</td>
                                    <td className="px-4 py-3 text-neutral-600">{p.payment_date || 'N/A'}</td>
                                    <td className="px-4 py-3 text-neutral-600 font-semibold font-mono">{p.payment_reference || 'N/A'}</td>
                                    <td className="px-4 py-3 text-neutral-600 font-mono">{matchingInvoice?.invoice_number || 'N/A'}</td>
                                    <td className="px-4 py-3 text-right font-bold text-neutral-900">{money(p.amount)}</td>
                                    <td className="px-4 py-3">
                                      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                        {p.status}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs italic text-neutral-500 max-w-xs truncate" title={p.notes}>
                                      {p.notes || '—'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Vendor Portfolio Tab */}
                  {activeTab === 'vendor' && (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-sm font-bold text-neutral-800">Vendor Balance Portfolio Reconciliation</h3>
                        <p className="text-xs text-neutral-500">Summary of all transactional phases specifically for vendor: <span className="font-bold text-neutral-800">{selectedVendor || 'Not Selected'}</span></p>
                      </div>

                      {vendorSummary ? (
                        <div className="space-y-6">
                          
                          {/* Vendor stats metrics card */}
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Total Purchase Orders (Commitment)</p>
                              <p className="mt-1 text-2xl font-bold text-neutral-900">{money(vendorSummary.totalPOValue)}</p>
                              <p className="mt-1 text-[10px] text-neutral-400">Total active orders: {vendorSummary.poCount}</p>
                            </div>
                            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Outstanding Unpaid AP Liability</p>
                              <p className="mt-1 text-2xl font-bold text-rose-600">{money(vendorSummary.outstandingLiability)}</p>
                              <p className="mt-1 text-[10px] text-neutral-400">Approved matched invoices awaiting treasury payout</p>
                            </div>
                            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Accrued Un-invoiced Receipts</p>
                              <p className="mt-1 text-2xl font-bold text-amber-600">{money(vendorSummary.uninvoicedReceipts)}</p>
                              <p className="mt-1 text-[10px] text-neutral-400">Goods received but no supplier invoices mapped yet</p>
                            </div>
                          </div>

                          {/* Detail summary blocks */}
                          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-3">Portfolio Balance Flow</h4>
                            <div className="space-y-3 text-sm text-neutral-700">
                              <div className="flex justify-between border-b border-neutral-200 pb-2">
                                <span>Total Committed Orders (POs)</span>
                                <span className="font-bold">{money(vendorSummary.totalPOValue)}</span>
                              </div>
                              <div className="flex justify-between border-b border-neutral-200 pb-2">
                                <span>Unverified Remaining Commitments</span>
                                <span className="font-bold text-neutral-500">{money(vendorSummary.openCommitment)}</span>
                              </div>
                              <div className="flex justify-between border-b border-neutral-200 pb-2 text-emerald-700">
                                <span>Verified Receipts Accrual (Realized Actuals)</span>
                                <span className="font-bold">{money(vendorSummary.totalGRNValue)}</span>
                              </div>
                              <div className="flex justify-between border-b border-neutral-200 pb-2 text-blue-700">
                                <span>Total Mapped Supplier Invoices</span>
                                <span className="font-bold">{money(vendorSummary.totalInvoiced)}</span>
                              </div>
                              <div className="flex justify-between border-b border-neutral-200 pb-2 text-amber-700 font-semibold">
                                <span>Actual Disbursed Payments Settled</span>
                                <span className="font-bold">{money(vendorSummary.totalPaid)}</span>
                              </div>
                            </div>
                          </div>

                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 py-12 text-center">
                          <User size={36} className="text-neutral-300 mb-2" />
                          <p className="text-sm font-semibold text-neutral-600">Please choose a supplier records portfolio</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Period Reconciliation Tab */}
                  {activeTab === 'period' && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-bold text-neutral-800">Monthly Progress Period Matching</h3>
                        <p className="text-xs text-neutral-500">Distribution of accrued GRN costs and settled treasury outflows mapped to reporting periods.</p>
                      </div>

                      {periodSummary.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 py-12 text-center">
                          <Calendar size={36} className="text-neutral-300 mb-2" />
                          <p className="text-sm font-semibold text-neutral-600">No period records matched</p>
                          <p className="text-xs text-neutral-400 mt-1 max-w-sm">Verify dates on Goods Receipts and Payments to distribute across active reporting periods.</p>
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                          <table className="w-full text-left border-collapse text-sm">
                            <thead className="bg-neutral-50 text-neutral-600 border-b border-neutral-200">
                              <tr>
                                <th className="px-4 py-3 font-semibold">Reporting Period</th>
                                <th className="px-4 py-3 font-semibold text-right">Accrued Cost (GRN)</th>
                                <th className="px-4 py-3 font-semibold text-right">Cash Outflow Paid</th>
                                <th className="px-4 py-3 font-semibold text-right">Period Net Cash Differential</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                              {periodSummary.map((period, idx) => (
                                <tr key={idx} className="hover:bg-neutral-50">
                                  <td className="px-4 py-3 font-semibold text-neutral-800">{period.periodName}</td>
                                  <td className="px-4 py-3 text-right font-bold text-emerald-600">{money(period.receiptValue)}</td>
                                  <td className="px-4 py-3 text-right font-bold text-amber-600">{money(period.paymentValue)}</td>
                                  <td className="px-4 py-3 text-right font-bold text-neutral-900">
                                    {money(period.receiptValue - period.paymentValue)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-24">
                  <Package size={48} className="text-neutral-300 mb-3" />
                  <h3 className="text-base font-bold text-neutral-700">No active Purchase Order selected</h3>
                  <p className="text-sm text-neutral-400 max-w-sm mt-1">Please select an active project and purchase order from the dropdowns above to initiate the reconciliation audit.</p>
                </div>
              )}
            </div>

          </div>

          {/* Interactive Accrual GRN Form Overlay */}
          {showAddReceipt && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-xl">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-4">
                  <h3 className="text-sm font-bold text-neutral-900">Accrue Delivery: Create GRN</h3>
                  <button onClick={() => setShowAddReceipt(false)} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100">
                    <X size={16} />
                  </button>
                </div>
                <div className="space-y-4 text-sm">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600">GRN Receipt Reference</label>
                    <input
                      type="text"
                      value={receiptNumber}
                      onChange={e => setReceiptNumber(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-800 font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600">Received Qty</label>
                      <input
                        type="number"
                        value={rcvQty}
                        onChange={e => setRcvQty(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600">Accepted Qty</label>
                      <input
                        type="number"
                        value={accQty}
                        onChange={e => setAccQty(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-800"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600">Auditor Notes</label>
                    <textarea
                      value={receiptNotes}
                      onChange={e => setReceiptNotes(e.target.value)}
                      className="mt-1 w-full h-20 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-800"
                      placeholder="Comment on delivery checklist conformity..."
                    />
                  </div>
                  <div className="flex justify-end gap-2 border-t border-neutral-100 pt-3">
                    <button
                      onClick={() => setShowAddReceipt(false)}
                      className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRecordReceipt}
                      disabled={isSubmitting}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {isSubmitting ? 'Recording...' : 'Accept & Record GRN'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Invoice Line Mapping Form Overlay */}
          {showAddInvoice && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-xl">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-4">
                  <h3 className="text-sm font-bold text-neutral-900">Map Supplier Invoice AP</h3>
                  <button onClick={() => setShowAddInvoice(false)} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100">
                    <X size={16} />
                  </button>
                </div>
                <p className="text-xs text-neutral-500 mb-3">This matches all uninvoiced accepted receipts for this PO into a formal invoice posting.</p>
                <div className="space-y-4 text-sm">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600">Invoice Number</label>
                    <input
                      type="text"
                      value={invoiceNumber}
                      onChange={e => setInvoiceNumber(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-800 font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600">VAT Rate (%)</label>
                      <input
                        type="number"
                        value={taxRate}
                        onChange={e => setTaxRate(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600">Retention Rate (%)</label>
                      <input
                        type="number"
                        value={retentionRate}
                        onChange={e => setRetentionRate(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-800"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600">Advance Offset Amount</label>
                    <input
                      type="number"
                      value={advanceOffset}
                      onChange={e => setAdvanceOffset(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600">Invoice Notes</label>
                    <textarea
                      value={invoiceNotes}
                      onChange={e => setInvoiceNotes(e.target.value)}
                      className="mt-1 w-full h-16 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-800"
                      placeholder="Special invoice stipulations or approvals..."
                    />
                  </div>
                  <div className="flex justify-end gap-2 border-t border-neutral-100 pt-3">
                    <button
                      onClick={() => setShowAddInvoice(false)}
                      className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRecordInvoice}
                      disabled={isSubmitting}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isSubmitting ? 'Posting...' : 'Approve & Match Invoice'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Payment Disbursal Form Overlay */}
          {showAddPayment && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-xl">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-4">
                  <h3 className="text-sm font-bold text-neutral-900">Disburse Treasury Fund</h3>
                  <button onClick={() => setShowAddPayment(false)} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100">
                    <X size={16} />
                  </button>
                </div>
                <div className="space-y-4 text-sm">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600">Payment Voucher Number</label>
                    <input
                      type="text"
                      value={paymentNumber}
                      onChange={e => setPaymentNumber(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600">Disbursed Amount</label>
                    <input
                      type="number"
                      value={paymentAmount}
                      onChange={e => setPaymentAmount(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-800 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600">EFT Settlement Reference</label>
                    <input
                      type="text"
                      value={paymentRef}
                      onChange={e => setPaymentRef(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600">Treasury Notes</label>
                    <textarea
                      value={paymentNotes}
                      onChange={e => setPaymentNotes(e.target.value)}
                      className="mt-1 w-full h-16 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-800"
                      placeholder="Bank wire details or approvals..."
                    />
                  </div>
                  <div className="flex justify-end gap-2 border-t border-neutral-100 pt-3">
                    <button
                      onClick={() => setShowAddPayment(false)}
                      className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRecordPayment}
                      disabled={isSubmitting}
                      className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {isSubmitting ? 'Settling...' : 'Disburse & Settle'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export interface CashFlowPeriod {
  period: string;
  plannedInflow: number;
  actualInflow: number;
  plannedOutflow: number;
  actualOutflow: number;
  netPlanned: number;
  netActual: number;
  cumulativeCash: number;
}

export interface CashForecastAssumptions {
  clientPaymentLagDays: number; // e.g. 60
  subcontractorPaymentLagDays: number; // e.g. 30
  retentionReleaseTocPercent: number; // e.g. 50%
  retentionReleaseDlcPercent: number; // e.g. 50%
  advanceRecoveryRatePercent: number; // e.g. 10%
  vatPayoutLagMonths: number; // e.g. 1
  contingencyDrawdownPercent: number; // e.g. 5%
}

export const DEFAULT_CASH_ASSUMPTIONS: CashForecastAssumptions = {
  clientPaymentLagDays: 60,
  subcontractorPaymentLagDays: 30,
  retentionReleaseTocPercent: 50,
  retentionReleaseDlcPercent: 50,
  advanceRecoveryRatePercent: 10,
  vatPayoutLagMonths: 1,
  contingencyDrawdownPercent: 0,
};

export function applyCashAssumptionsToPeriods(
  rawPeriods: Array<{
    period: string;
    grossInflow: number;
    grossOutflow: number;
    actualInflow?: number;
    actualOutflow?: number;
  }>,
  assumptions: CashForecastAssumptions = DEFAULT_CASH_ASSUMPTIONS
): CashFlowPeriod[] {
  if (rawPeriods.length === 0) return [];

  // Lag offset in period slots (assuming monthly periods)
  const clientLagSlots = Math.round(assumptions.clientPaymentLagDays / 30);
  const subLagSlots = Math.round(assumptions.subcontractorPaymentLagDays / 30);

  const adjustedInflows = new Array(rawPeriods.length).fill(0);
  const adjustedOutflows = new Array(rawPeriods.length).fill(0);

  rawPeriods.forEach((p, idx) => {
    // Inflow lagged by client payment terms
    const targetInflowIdx = Math.min(rawPeriods.length - 1, idx + clientLagSlots);
    const netInflowValue = p.grossInflow * (1 - assumptions.advanceRecoveryRatePercent / 100);
    adjustedInflows[targetInflowIdx] += netInflowValue;

    // Outflow lagged by subcontractor payment terms
    const targetOutflowIdx = Math.min(rawPeriods.length - 1, idx + subLagSlots);
    const netOutflowValue = p.grossOutflow * (1 + assumptions.contingencyDrawdownPercent / 100);
    adjustedOutflows[targetOutflowIdx] += netOutflowValue;
  });

  let runningCumulative = 0;
  return rawPeriods.map((p, idx) => {
    const plannedIn = Math.round(adjustedInflows[idx] * 100) / 100;
    const plannedOut = Math.round(adjustedOutflows[idx] * 100) / 100;
    const actualIn = p.actualInflow ?? 0;
    const actualOut = p.actualOutflow ?? 0;

    const netPlanned = plannedIn - plannedOut;
    const netActual = (p.actualInflow !== undefined || p.actualOutflow !== undefined)
      ? actualIn - actualOut
      : netPlanned;

    runningCumulative += netActual;

    return {
      period: p.period,
      plannedInflow: plannedIn,
      actualInflow: actualIn,
      plannedOutflow: plannedOut,
      actualOutflow: actualOut,
      netPlanned,
      netActual,
      cumulativeCash: Math.round(runningCumulative * 100) / 100,
    };
  });
}

export function calculateCashFlowForecast(
  periods: Array<{
    period: string;
    plannedInflow: number;
    actualInflow?: number;
    plannedOutflow: number;
    actualOutflow?: number;
  }>
): CashFlowPeriod[] {
  if (periods.length === 0) return [];

  let cumulativeCash = 0;
  return periods.map((period) => {
    const actualIn = period.actualInflow ?? 0;
    const actualOut = period.actualOutflow ?? 0;
    const netPlanned = period.plannedInflow - period.plannedOutflow;
    const netActual = (period.actualInflow !== undefined || period.actualOutflow !== undefined)
      ? actualIn - actualOut
      : netPlanned;

    cumulativeCash += netActual;

    return {
      period: period.period,
      plannedInflow: period.plannedInflow,
      actualInflow: actualIn,
      plannedOutflow: period.plannedOutflow,
      actualOutflow: actualOut,
      netPlanned,
      netActual,
      cumulativeCash: Math.round(cumulativeCash * 100) / 100,
    };
  });
}

export function getCashFlowStatus(periods: CashFlowPeriod[]) {
  const result = {
    isDeficitExpected: false,
    lowestCashPoint: 0,
    lowestPeriod: '',
    peakWorkingCapitalDeficit: 0,
  };

  if (periods.length === 0) return result;

  let minCash = Infinity;
  let minPeriod = '';

  for (const period of periods) {
    if (period.cumulativeCash < minCash) {
      minCash = period.cumulativeCash;
      minPeriod = period.period;
    }
  }

  const peakDeficit = minCash < 0 ? Math.abs(minCash) : 0;

  return {
    isDeficitExpected: minCash < 0,
    lowestCashPoint: minCash,
    lowestPeriod: minPeriod,
    peakWorkingCapitalDeficit: peakDeficit,
  };
}

export function compareCashForecastVersions(
  versionA: CashFlowPeriod[],
  versionB: CashFlowPeriod[]
) {
  const periodKeys = Array.from(new Set([...versionA.map(p => p.period), ...versionB.map(p => p.period)])).sort();
  const mapA = new Map(versionA.map(p => [p.period, p]));
  const mapB = new Map(versionB.map(p => [p.period, p]));

  const deltas = periodKeys.map(period => {
    const a = mapA.get(period);
    const b = mapB.get(period);
    const cumulativeA = a ? a.cumulativeCash : 0;
    const cumulativeB = b ? b.cumulativeCash : 0;
    return {
      period,
      cumulativeA,
      cumulativeB,
      deltaCumulative: Math.round((cumulativeB - cumulativeA) * 100) / 100,
    };
  });

  const statusA = getCashFlowStatus(versionA);
  const statusB = getCashFlowStatus(versionB);

  return {
    deltas,
    workingCapitalImpact: Math.round((statusB.peakWorkingCapitalDeficit - statusA.peakWorkingCapitalDeficit) * 100) / 100,
    finalCashDifference: deltas.length > 0 ? deltas[deltas.length - 1].deltaCumulative : 0,
  };
}

export interface CashItemDetail {
  sourceId: string;
  sourceType: string;
  description: string;
  date: string;
  direction: 'Inflow' | 'Outflow';
  movementType: 'Actual' | 'Forecast';
  amount: number;
}

export interface CashForecastBucket {
  period: string;
  actualInflow: number;
  actualOutflow: number;
  netActual: number;
  forecastInflow: number;
  forecastOutflow: number;
  netForecast: number;
  plannedInflow: number;
  plannedOutflow: number;
  netPlanned: number;
  netCash: number;
  cumulativeCash: number;
  items: CashItemDetail[];
}

export interface CashForecastSummary {
  totalActualInflow: number;
  totalActualOutflow: number;
  totalForecastInflow: number;
  totalForecastOutflow: number;
  closingCash: number;
  peakWorkingCapitalDeficit: number;
  lowestPeriod: string;
  fundingRequiredDate?: string | null;
}

export interface BuildForecastParams {
  projectId: string;
  dataDate: string;
  scenario?: 'Base' | 'Optimistic' | 'Pessimistic';
  assumptions?: Partial<CashForecastAssumptions>;
  paymentCertificates?: any[];
  partialPayments?: any[];
  supplierInvoices?: any[];
  procurement?: any[];
  cashFlow?: any[];
}

function addDaysIso(dateStr: string, days: number): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const y = parseInt(parts[0], 10) || 2026;
  const m = parseInt(parts[1], 10) || 1;
  const d = parseInt(parts[2], 10) || 1;
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

function toPeriod(dateStr: string): string {
  return dateStr.length >= 7 ? dateStr.substring(0, 7) : '2026-01';
}

export function buildVersionedCashForecast(params: BuildForecastParams): {
  items: CashItemDetail[];
  buckets: CashForecastBucket[];
  summary: CashForecastSummary;
} {
  const {
    projectId,
    dataDate,
    scenario = 'Base',
    assumptions = DEFAULT_CASH_ASSUMPTIONS,
    paymentCertificates = [],
    partialPayments = [],
    supplierInvoices = [],
    procurement = [],
    cashFlow = [],
  } = params;

  const clientLag = assumptions.clientPaymentLagDays ?? 60;
  const subLag = assumptions.subcontractorPaymentLagDays ?? 30;
  const advRate = assumptions.advanceRecoveryRatePercent ?? 10;
  const contingencyRate = assumptions.contingencyDrawdownPercent ?? 0;

  const items: CashItemDetail[] = [];

  // 1. Payment Certificates (Approved, Partially Paid, Paid)
  const relevantCerts = paymentCertificates.filter((c: any) => {
    const pId = c.projectId ?? c.project_id;
    const status = c.status ?? c.payload?.status;
    return (!projectId || pId === projectId) && ['Approved', 'Partially Paid', 'Paid'].includes(status);
  });

  relevantCerts.forEach((cert: any) => {
    const certId = cert.id;
    const certType = cert.certificateType ?? cert.certificate_type ?? cert.payload?.certificate_type ?? 'Client';
    const isClient = certType === 'Client';
    const direction: 'Inflow' | 'Outflow' = isClient ? 'Inflow' : 'Outflow';

    const netValue = Number(
      cert.netCertifiedValue ??
      cert.net_certified_value ??
      cert.net_payable ??
      cert.payload?.net_certified_value ??
      cert.grossCertifiedValue ??
      cert.gross_certified_value ??
      0
    );

    const certDate = cert.certificateDate ?? cert.certificate_date ?? cert.periodId ?? cert.period_id ?? dataDate;

    // Filter partial payments
    const certPayments = partialPayments.filter((p: any) => (p.certificateId ?? p.certificate_id) === certId);
    let totalPaid = 0;

    certPayments.forEach((p: any) => {
      const pId = p.paymentId ?? p.payment_id ?? p.id;
      const pDate = p.paymentDate ?? p.payment_date;
      const pAmt = Number(p.amount ?? 0);
      totalPaid += pAmt;

      const movementType = pDate <= dataDate ? 'Actual' : 'Forecast';
      items.push({
        sourceId: pId,
        sourceType: 'certificate_partial_payment',
        description: `Partial payment for certificate ${certId}`,
        date: pDate,
        direction,
        movementType,
        amount: Math.round(pAmt * 100) / 100,
      });
    });

    const remaining = Math.round((netValue - totalPaid) * 100) / 100;
    if (remaining > 0.009) {
      let lagDays = isClient ? clientLag : subLag;
      if (scenario === 'Pessimistic' && isClient) lagDays += 30;
      if (scenario === 'Optimistic' && isClient) lagDays = Math.max(0, lagDays - 15);

      let dueDate = addDaysIso(certDate, lagDays);
      if (dueDate <= dataDate) {
        dueDate = addDaysIso(dataDate, 1);
      }

      const adjustedRemaining = isClient
        ? remaining * (1 - Math.min(1, Math.max(0, advRate / 100)))
        : remaining * (1 + Math.max(0, contingencyRate / 100));

      items.push({
        sourceId: certId,
        sourceType: 'payment_certificate_balance',
        description: `Projected balance for certificate ${certId}`,
        date: dueDate,
        direction,
        movementType: 'Forecast',
        amount: Math.round(adjustedRemaining * 100) / 100,
      });
    }
  });

  // 2. Supplier Invoices
  const relevantInvoices = supplierInvoices.filter((inv: any) => {
    const pId = inv.projectId ?? inv.project_id;
    const status = inv.status ?? inv.payload?.status;
    return (!projectId || pId === projectId) && ['Approved', 'Partially Paid', 'Paid'].includes(status);
  });

  relevantInvoices.forEach((inv: any) => {
    const invId = inv.id;
    const total = Number(inv.totalAmount ?? inv.total_amount ?? inv.amount ?? 0);
    const paid = Number(inv.paidAmount ?? inv.paid_amount ?? 0);
    const invDate = inv.invoiceDate ?? inv.invoice_date ?? dataDate;

    if (paid > 0.009) {
      const paidDate = inv.paidDate ?? inv.paid_date ?? invDate;
      items.push({
        sourceId: `ap_paid:${invId}`,
        sourceType: 'supplier_invoice_payment',
        description: `Settled supplier invoice ${invId}`,
        date: paidDate,
        direction: 'Outflow',
        movementType: paidDate <= dataDate ? 'Actual' : 'Forecast',
        amount: Math.round(paid * 100) / 100,
      });
    }

    const remaining = Math.round((total - paid) * 100) / 100;
    if (remaining > 0.009) {
      let dueDate = addDaysIso(invDate, subLag);
      if (dueDate <= dataDate) dueDate = addDaysIso(dataDate, 1);
      items.push({
        sourceId: invId,
        sourceType: 'supplier_invoice_balance',
        description: `Projected supplier invoice ${invId}`,
        date: dueDate,
        direction: 'Outflow',
        movementType: 'Forecast',
        amount: remaining,
      });
    }
  });

  // 3. Procurement POs
  const relevantPOs = procurement.filter((po: any) => {
    const pId = po.projectId ?? po.project_id;
    const status = po.status ?? po.payload?.status;
    return (!projectId || pId === projectId) && ['Ordered', 'Partially Delivered'].includes(status);
  });

  relevantPOs.forEach((po: any) => {
    const poId = po.id;
    const total = Number(po.totalAmount ?? po.total_amount ?? po.amount ?? 0);
    const poDate = po.orderDate ?? po.order_date ?? dataDate;
    if (total > 0.009) {
      items.push({
        sourceId: poId,
        sourceType: 'purchase_order_commitment',
        description: `PO Commitment ${poId}`,
        date: addDaysIso(poDate, subLag),
        direction: 'Outflow',
        movementType: 'Forecast',
        amount: Math.round(total * 100) / 100,
      });
    }
  });

  // 4. Standalone cash flow movements
  const directCash = cashFlow.filter((cf: any) => {
    const pId = cf.projectId ?? cf.project_id;
    const status = cf.status ?? cf.payload?.status;
    const sType = cf.sourceType ?? cf.source_type ?? '';
    return (
      (!projectId || pId === projectId) &&
      !['Cancelled', 'Rejected', 'Reversed'].includes(status) &&
      !['certificate', 'payment_certificate', 'procurement_forecast', 'supplier_invoice'].includes(sType)
    );
  });

  directCash.forEach((cf: any) => {
    const cId = cf.id;
    const date = cf.date ?? dataDate;
    const inflow = Number(cf.inflow ?? 0);
    const outflow = Number(cf.outflow ?? 0);
    const movementType = date <= dataDate ? 'Actual' : 'Forecast';

    if (inflow > 0.009) {
      items.push({
        sourceId: cId,
        sourceType: 'cash_flow_inflow',
        description: cf.description ?? 'Manual Inflow',
        date,
        direction: 'Inflow',
        movementType,
        amount: Math.round(inflow * 100) / 100,
      });
    }
    if (outflow > 0.009) {
      items.push({
        sourceId: cId,
        sourceType: 'cash_flow_outflow',
        description: cf.description ?? 'Manual Outflow',
        date,
        direction: 'Outflow',
        movementType,
        amount: Math.round(outflow * 100) / 100,
      });
    }
  });

  // 5. Aggregate into calendar monthly periods
  const periodMap = new Map<string, CashItemDetail[]>();
  items.forEach((item) => {
    const p = toPeriod(item.date);
    if (!periodMap.has(p)) periodMap.set(p, []);
    periodMap.get(p)!.push(item);
  });

  const sortedPeriods = Array.from(periodMap.keys()).sort();
  if (sortedPeriods.length === 0) {
    sortedPeriods.push(toPeriod(dataDate));
    periodMap.set(toPeriod(dataDate), []);
  }

  const buckets: CashForecastBucket[] = [];
  let runningCash = 0;
  let minCash = 0;
  let lowestPeriod = sortedPeriods[0];
  let fundingRequiredDate: string | null = null;

  let sumActIn = 0;
  let sumActOut = 0;
  let sumFIn = 0;
  let sumFOut = 0;

  sortedPeriods.forEach((period) => {
    const pItems = periodMap.get(period) || [];
    let actIn = 0;
    let actOut = 0;
    let fIn = 0;
    let fOut = 0;

    pItems.forEach((it) => {
      if (it.movementType === 'Actual') {
        if (it.direction === 'Inflow') actIn += it.amount;
        else actOut += it.amount;
      } else {
        if (it.direction === 'Inflow') fIn += it.amount;
        else fOut += it.amount;
      }
    });

    actIn = Math.round(actIn * 100) / 100;
    actOut = Math.round(actOut * 100) / 100;
    fIn = Math.round(fIn * 100) / 100;
    fOut = Math.round(fOut * 100) / 100;

    const netAct = Math.round((actIn - actOut) * 100) / 100;
    const netF = Math.round((fIn - fOut) * 100) / 100;
    const netP = Math.round(((actIn + fIn) - (actOut + fOut)) * 100) / 100;
    const netC = Math.round((netAct + netF) * 100) / 100;

    runningCash = Math.round((runningCash + netC) * 100) / 100;

    if (runningCash < minCash) {
      minCash = runningCash;
      lowestPeriod = period;
    }

    if (runningCash < 0 && !fundingRequiredDate) {
      fundingRequiredDate = period;
    }

    sumActIn += actIn;
    sumActOut += actOut;
    sumFIn += fIn;
    sumFOut += fOut;

    buckets.push({
      period,
      actualInflow: actIn,
      actualOutflow: actOut,
      netActual: netAct,
      forecastInflow: fIn,
      forecastOutflow: fOut,
      netForecast: netF,
      plannedInflow: Math.round((actIn + fIn) * 100) / 100,
      plannedOutflow: Math.round((actOut + fOut) * 100) / 100,
      netPlanned: netP,
      netCash: netC,
      cumulativeCash: runningCash,
      items: pItems,
    });
  });

  const summary: CashForecastSummary = {
    totalActualInflow: Math.round(sumActIn * 100) / 100,
    totalActualOutflow: Math.round(sumActOut * 100) / 100,
    totalForecastInflow: Math.round(sumFIn * 100) / 100,
    totalForecastOutflow: Math.round(sumFOut * 100) / 100,
    closingCash: runningCash,
    peakWorkingCapitalDeficit: minCash < 0 ? Math.abs(minCash) : 0,
    lowestPeriod,
    fundingRequiredDate,
  };

  return { items, buckets, summary };
}



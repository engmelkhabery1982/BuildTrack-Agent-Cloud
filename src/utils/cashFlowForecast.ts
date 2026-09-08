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

export interface GovernedCashSourceItem {
  id: string;
  sourceType: 'ClientCertificate' | 'SubcontractInvoice' | 'SupplierInvoice' | 'PurchaseOrder' | 'ApprovedVariation' | 'ManualCashMovement';
  sourceId: string;
  sourceReference: string;
  description: string;
  baseDate: string;
  expectedDate: string;
  grossAmount: number;
  netAmount: number;
  direction: 'Inflow' | 'Outflow';
  isSettled: boolean;
  settledDate?: string | null;
  paymentTermsDays: number;
  lagDays: number;
  probabilityPercent: number;
  dateOverride?: string | null;
  overrideReason?: string | null;
  status: string;
}

export interface GovernedCashForecastPeriod {
  period: string; // YYYY-MM
  isHistorical: boolean;
  actualInflow: number;
  actualOutflow: number;
  netActual: number;
  forecastInflow: number;
  forecastOutflow: number;
  netForecast: number;
  periodCashFlow: number;
  cumulativeCashBalance: number;
  contributions: GovernedCashSourceItem[];
}

export interface GovernedCashForecastSummary {
  openingBalance: number;
  totalActualInflow: number;
  totalActualOutflow: number;
  netActualCash: number;
  totalForecastInflow: number;
  totalForecastOutflow: number;
  netForecastCash: number;
  closingProjectedBalance: number;
  lowestCashPoint: number;
  lowestCashPeriod: string;
  isDeficitExpected: boolean;
  peakWorkingCapitalDeficit: number;
  overdueInflows: number;
  overdueOutflows: number;
}

export interface CashForecastComparisonResult {
  deltas: Array<{
    period: string;
    cumulativeA: number;
    cumulativeB: number;
    deltaCumulative: number;
    inflowA: number;
    inflowB: number;
    deltaInflow: number;
    outflowA: number;
    outflowB: number;
    deltaOutflow: number;
  }>;
  workingCapitalImpact: number;
  finalCashDifference: number;
  lowestPointShift: number;
}

function round2(val: number): number {
  return Math.round((Number(val) || 0) * 100) / 100;
}

export function shiftDateByDays(dateStr: string, days: number): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function getMonthPeriod(dateStr: string): string {
  if (!dateStr || dateStr.length < 7) return '2026-01';
  return dateStr.slice(0, 7);
}

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
    const plannedIn = round2(adjustedInflows[idx]);
    const plannedOut = round2(adjustedOutflows[idx]);
    const actualIn = p.actualInflow ?? 0;
    const actualOut = p.actualOutflow ?? 0;

    const netPlanned = round2(plannedIn - plannedOut);
    const netActual = (p.actualInflow !== undefined || p.actualOutflow !== undefined)
      ? round2(actualIn - actualOut)
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
      cumulativeCash: round2(runningCumulative),
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
    const netPlanned = round2(period.plannedInflow - period.plannedOutflow);
    const netActual = (period.actualInflow !== undefined || period.actualOutflow !== undefined)
      ? round2(actualIn - actualOut)
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
      cumulativeCash: round2(cumulativeCash),
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
    peakWorkingCapitalDeficit: round2(peakDeficit),
  };
}

export function compareCashForecastVersions(
  versionA: CashFlowPeriod[],
  versionB: CashFlowPeriod[]
): CashForecastComparisonResult {
  const periodKeys = Array.from(new Set([...versionA.map(p => p.period), ...versionB.map(p => p.period)])).sort();
  const mapA = new Map(versionA.map(p => [p.period, p]));
  const mapB = new Map(versionB.map(p => [p.period, p]));

  const deltas = periodKeys.map(period => {
    const a = mapA.get(period);
    const b = mapB.get(period);
    const cumulativeA = a ? a.cumulativeCash : 0;
    const cumulativeB = b ? b.cumulativeCash : 0;
    const inflowA = a ? a.plannedInflow : 0;
    const inflowB = b ? b.plannedInflow : 0;
    const outflowA = a ? a.plannedOutflow : 0;
    const outflowB = b ? b.plannedOutflow : 0;

    return {
      period,
      cumulativeA,
      cumulativeB,
      deltaCumulative: round2(cumulativeB - cumulativeA),
      inflowA,
      inflowB,
      deltaInflow: round2(inflowB - inflowA),
      outflowA,
      outflowB,
      deltaOutflow: round2(outflowB - outflowA),
    };
  });

  const statusA = getCashFlowStatus(versionA);
  const statusB = getCashFlowStatus(versionB);

  return {
    deltas,
    workingCapitalImpact: round2(statusB.peakWorkingCapitalDeficit - statusA.peakWorkingCapitalDeficit),
    finalCashDifference: deltas.length > 0 ? deltas[deltas.length - 1].deltaCumulative : 0,
    lowestPointShift: round2(statusB.lowestCashPoint - statusA.lowestCashPoint),
  };
}

/**
 * Governed Cash Forecast Matrix Generator
 * Fully integrates actuals vs forecasts from actual project records
 */
export function generateGovernedCashForecastMatrix(params: {
  projectId: string;
  dataDate: string;
  assumptions: CashForecastAssumptions;
  paymentCertificates?: any[];
  cashFlowEntries?: any[];
  supplierInvoices?: any[];
  procurementOrders?: any[];
  variations?: any[];
  openingBalance?: number;
  lineOverrides?: Record<string, { dateOverride?: string; overrideReason?: string; probabilityPercent?: number }>;
}): {
  periods: GovernedCashForecastPeriod[];
  summary: GovernedCashForecastSummary;
  sourceItems: GovernedCashSourceItem[];
} {
  const {
    projectId,
    dataDate,
    assumptions,
    paymentCertificates = [],
    cashFlowEntries = [],
    supplierInvoices = [],
    procurementOrders = [],
    variations = [],
    openingBalance = 0,
    lineOverrides = {},
  } = params;

  const dataDatePeriod = getMonthPeriod(dataDate);
  const sourceItems: GovernedCashSourceItem[] = [];

  // 1. Process Payment Certificates
  paymentCertificates.forEach((cert) => {
    if (cert.project_id && cert.project_id !== projectId) return;
    if (['Draft', 'Cancelled', 'Reversed'].includes(cert.status)) return;

    const isClient = cert.certificate_type === 'Client';
    const isPaid = cert.status === 'Paid' || (Number(cert.paid_amount) || 0) >= (Number(cert.net_certified_value) || 0);
    const settledDate = cert.payment_date || cert.period_end || cert.issue_date || dataDate;
    const baseDate = cert.issue_date || cert.period_end || dataDate;
    const netVal = Number(cert.net_certified_value) || 0;
    const paidVal = Number(cert.paid_amount) || (isPaid ? netVal : 0);
    const balanceDue = Math.max(0, netVal - paidVal);

    const override = lineOverrides[cert.id] || {};
    const probability = override.probabilityPercent !== undefined ? override.probabilityPercent : 100;
    const lagDays = isClient ? assumptions.clientPaymentLagDays : assumptions.subcontractorPaymentLagDays;
    
    // Settled portion (Actual)
    if (paidVal > 0) {
      sourceItems.push({
        id: `${cert.id}_actual`,
        sourceType: isClient ? 'ClientCertificate' : 'SubcontractInvoice',
        sourceId: cert.id,
        sourceReference: cert.certificate_number || cert.id,
        description: `${cert.certificate_type || 'Contractor'} Certificate ${cert.certificate_number || ''} (Paid Settlement)`,
        baseDate,
        expectedDate: settledDate,
        grossAmount: round2(paidVal),
        netAmount: round2(paidVal),
        direction: isClient ? 'Inflow' : 'Outflow',
        isSettled: true,
        settledDate,
        paymentTermsDays: 0,
        lagDays: 0,
        probabilityPercent: 100,
        status: 'Settled',
      });
    }

    // Unpaid portion (Forecast)
    if (balanceDue > 0 && cert.status !== 'Paid') {
      const calculatedExpectedDate = shiftDateByDays(baseDate, lagDays);
      const effectiveExpectedDate = override.dateOverride || calculatedExpectedDate;
      const effectiveAmount = round2(balanceDue * (probability / 100));

      sourceItems.push({
        id: `${cert.id}_forecast`,
        sourceType: isClient ? 'ClientCertificate' : 'SubcontractInvoice',
        sourceId: cert.id,
        sourceReference: cert.certificate_number || cert.id,
        description: `${cert.certificate_type || 'Contractor'} Certificate ${cert.certificate_number || ''} (Forecast Balance)`,
        baseDate,
        expectedDate: effectiveExpectedDate,
        grossAmount: round2(balanceDue),
        netAmount: effectiveAmount,
        direction: isClient ? 'Inflow' : 'Outflow',
        isSettled: false,
        paymentTermsDays: lagDays,
        lagDays,
        probabilityPercent: probability,
        dateOverride: override.dateOverride || null,
        overrideReason: override.overrideReason || null,
        status: cert.status,
      });
    }
  });

  // 2. Process Settled / Actual Cash Flow Entries (Manual or Imported Ledger)
  cashFlowEntries.forEach((entry) => {
    if (entry.project_id && entry.project_id !== projectId) return;
    if (['Cancelled', 'Reversed', 'Rejected'].includes(entry.status || '')) return;

    // Only non-forecast or explicitly actual entries
    const isActual = entry.movement_type === 'Actual' || entry.movement_type === 'Manual' || entry.status === 'Settled';
    const entryDate = entry.date || dataDate;
    const inflow = Number(entry.inflow) || 0;
    const outflow = Number(entry.outflow) || 0;

    if (inflow > 0) {
      sourceItems.push({
        id: entry.id || `cash_in_${Math.random()}`,
        sourceType: 'ManualCashMovement',
        sourceId: entry.id || '',
        sourceReference: entry.description || 'Cash Inflow',
        description: entry.description || 'Manual Cash Receipt',
        baseDate: entryDate,
        expectedDate: entryDate,
        grossAmount: round2(inflow),
        netAmount: round2(inflow),
        direction: 'Inflow',
        isSettled: isActual,
        settledDate: isActual ? entryDate : null,
        paymentTermsDays: 0,
        lagDays: 0,
        probabilityPercent: 100,
        status: isActual ? 'Settled' : 'Open',
      });
    }

    if (outflow > 0) {
      sourceItems.push({
        id: entry.id ? `${entry.id}_out` : `cash_out_${Math.random()}`,
        sourceType: 'ManualCashMovement',
        sourceId: entry.id || '',
        sourceReference: entry.description || 'Cash Outflow',
        description: entry.description || 'Manual Cash Disbursement',
        baseDate: entryDate,
        expectedDate: entryDate,
        grossAmount: round2(outflow),
        netAmount: round2(outflow),
        direction: 'Outflow',
        isSettled: isActual,
        settledDate: isActual ? entryDate : null,
        paymentTermsDays: 0,
        lagDays: 0,
        probabilityPercent: 100,
        status: isActual ? 'Settled' : 'Open',
      });
    }
  });

  // 3. Process Open Procurement Orders (Forecast Outflow)
  procurementOrders.forEach((po) => {
    if (po.project_id && po.project_id !== projectId) return;
    if (['Cancelled', 'Closed', 'Draft'].includes(po.status || '')) return;

    const totalVal = (Number(po.quantity) || 0) * (Number(po.unit_rate) || Number(po.cost) || 0);
    const receivedVal = Number(po.received_amount) || 0;
    const openCommitment = Math.max(0, totalVal - receivedVal);

    if (openCommitment > 0) {
      const baseDate = po.required_date || po.delivery_date || dataDate;
      const lagDays = assumptions.subcontractorPaymentLagDays;
      const expectedDate = shiftDateByDays(baseDate, lagDays);

      sourceItems.push({
        id: `po_${po.id}`,
        sourceType: 'PurchaseOrder',
        sourceId: po.id,
        sourceReference: po.po_number || po.item || po.id,
        description: `Open PO: ${po.item || po.description || 'Materials/Procurement'}`,
        baseDate,
        expectedDate,
        grossAmount: round2(openCommitment),
        netAmount: round2(openCommitment),
        direction: 'Outflow',
        isSettled: false,
        paymentTermsDays: lagDays,
        lagDays,
        probabilityPercent: 100,
        status: po.status || 'Ordered',
      });
    }
  });

  // Determine all distinct period keys
  const periodSet = new Set<string>();
  periodSet.add(dataDatePeriod);
  sourceItems.forEach((item) => {
    const p = getMonthPeriod(item.expectedDate);
    if (p) periodSet.add(p);
  });

  const sortedPeriods = Array.from(periodSet).sort();

  let runningCumulative = openingBalance;
  let overdueInflows = 0;
  let overdueOutflows = 0;
  let totalActualInflow = 0;
  let totalActualOutflow = 0;
  let totalForecastInflow = 0;
  let totalForecastOutflow = 0;

  const periods: GovernedCashForecastPeriod[] = sortedPeriods.map((periodKey) => {
    const isHistorical = periodKey <= dataDatePeriod;
    const periodItems = sourceItems.filter((it) => getMonthPeriod(it.expectedDate) === periodKey);

    let pActualIn = 0;
    let pActualOut = 0;
    let pForecastIn = 0;
    let pForecastOut = 0;

    periodItems.forEach((it) => {
      if (it.isSettled) {
        if (it.direction === 'Inflow') {
          pActualIn += it.netAmount;
        } else {
          pActualOut += it.netAmount;
        }
      } else {
        // Unsettled forecast item
        if (it.direction === 'Inflow') {
          pForecastIn += it.netAmount;
        } else {
          pForecastOut += it.netAmount;
        }

        // Overdue check: if unsettled item expectedDate is before dataDate
        if (it.expectedDate < dataDate) {
          if (it.direction === 'Inflow') overdueInflows += it.netAmount;
          else overdueOutflows += it.netAmount;
        }
      }
    });

    pActualIn = round2(pActualIn);
    pActualOut = round2(pActualOut);
    pForecastIn = round2(pForecastIn);
    pForecastOut = round2(pForecastOut);

    totalActualInflow += pActualIn;
    totalActualOutflow += pActualOut;
    totalForecastInflow += pForecastIn;
    totalForecastOutflow += pForecastOut;

    const netActual = round2(pActualIn - pActualOut);
    const netForecast = round2(pForecastIn - pForecastOut);

    // Period cash flow contribution: Actual if historical else Forecast
    const periodCashFlow = isHistorical ? netActual : netForecast;
    runningCumulative = round2(runningCumulative + periodCashFlow);

    return {
      period: periodKey,
      isHistorical,
      actualInflow: pActualIn,
      actualOutflow: pActualOut,
      netActual,
      forecastInflow: pForecastIn,
      forecastOutflow: pForecastOut,
      netForecast,
      periodCashFlow,
      cumulativeCashBalance: runningCumulative,
      contributions: periodItems,
    };
  });

  // Calculate KPIs
  let lowestCash = Infinity;
  let lowestPeriod = '';
  periods.forEach((p) => {
    if (p.cumulativeCashBalance < lowestCash) {
      lowestCash = p.cumulativeCashBalance;
      lowestPeriod = p.period;
    }
  });

  if (periods.length === 0) {
    lowestCash = openingBalance;
    lowestPeriod = dataDatePeriod;
  }

  const peakDeficit = lowestCash < 0 ? Math.abs(lowestCash) : 0;

  const summary: GovernedCashForecastSummary = {
    openingBalance: round2(openingBalance),
    totalActualInflow: round2(totalActualInflow),
    totalActualOutflow: round2(totalActualOutflow),
    netActualCash: round2(totalActualInflow - totalActualOutflow),
    totalForecastInflow: round2(totalForecastInflow),
    totalForecastOutflow: round2(totalForecastOutflow),
    netForecastCash: round2(totalForecastInflow - totalForecastOutflow),
    closingProjectedBalance: round2(runningCumulative),
    lowestCashPoint: round2(lowestCash),
    lowestCashPeriod: lowestPeriod,
    isDeficitExpected: lowestCash < 0,
    peakWorkingCapitalDeficit: round2(peakDeficit),
    overdueInflows: round2(overdueInflows),
    overdueOutflows: round2(overdueOutflows),
  };

  return {
    periods,
    summary,
    sourceItems,
  };
}

export function validateCashForecastAssumptions(assumptions: CashForecastAssumptions): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (assumptions.clientPaymentLagDays < 0 || assumptions.clientPaymentLagDays > 365) {
    errors.push('Client payment lag must be between 0 and 365 days');
  }
  if (assumptions.subcontractorPaymentLagDays < 0 || assumptions.subcontractorPaymentLagDays > 365) {
    errors.push('Subcontractor payment lag must be between 0 and 365 days');
  }
  if (assumptions.advanceRecoveryRatePercent < 0 || assumptions.advanceRecoveryRatePercent > 100) {
    errors.push('Advance recovery rate must be between 0% and 100%');
  }
  if (assumptions.retentionReleaseTocPercent < 0 || assumptions.retentionReleaseTocPercent > 100) {
    errors.push('Retention release at TOC must be between 0% and 100%');
  }
  if (assumptions.retentionReleaseDlcPercent < 0 || assumptions.retentionReleaseDlcPercent > 100) {
    errors.push('Retention release at DLC must be between 0% and 100%');
  }
  if (assumptions.contingencyDrawdownPercent < 0 || assumptions.contingencyDrawdownPercent > 50) {
    errors.push('Contingency drawdown must be between 0% and 50%');
  }
  return { valid: errors.length === 0, errors };
}

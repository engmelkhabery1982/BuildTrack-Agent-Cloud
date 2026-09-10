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
    // Missing actuals are zero; forecast must never be presented as settled cash.
    const netActual = actualIn - actualOut;

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
    // Missing actuals are zero; planned values remain forecast-only.
    const netActual = actualIn - actualOut;

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


/**
 * Parse Model Output from API Response
 * 
 * Converts API response data into canonical output types for previews.
 * Handles missing/incomplete data gracefully.
 */

import type {
  ModelOutput,
  ThreeStatementOutput,
  DCFOutput,
  LBOOutput,
  CompsOutput,
  MergerOutput,
  OperatingOutput,
} from './outputTypes';
import { mapDcfOutputToPreview } from './dcf/mapToPreview';

/**
 * Parse DCF output from API response
 */
export function parseDCFOutput(data: any): DCFOutput | null {
  try {
    // Debug logging (dev only)
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.log('[parseDCFOutput] Input data keys:', data ? Object.keys(data) : null);
      console.log('[parseDCFOutput] data.dcfSummary:', data?.dcfSummary);
      console.log('[parseDCFOutput] data.dcfSummary?.valuation:', data?.dcfSummary?.valuation);
      console.log('[parseDCFOutput] data.dcfSummary?.results:', data?.dcfSummary?.results);
    }
    
    // Use the canonical mapper to extract data from various response shapes
    const preview = mapDcfOutputToPreview(data);
    
    // Debug logging after mapping (dev only)
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.log('[parseDCFOutput] Mapped preview:', preview);
      console.log('[parseDCFOutput] impliedValuePerShare:', preview.impliedValuePerShare);
      console.log('[parseDCFOutput] enterpriseValue:', preview.enterpriseValue);
      console.log('[parseDCFOutput] equityValue:', preview.equityValue);
    }
    
    // Detect missing inputs - only flag if data is truly missing (not just mapping issue)
    // Use mapped values ONLY for canComputeValuation check
    const canComputeValuation = 
      preview.impliedValuePerShare != null &&
      preview.enterpriseValue != null &&
      preview.equityValue != null;
    
    const missingInputs: string[] = [];
    
    // Only flag as missing if we cannot compute valuation
    if (!canComputeValuation) {
      // No valuation data at all - likely missing inputs
      if (preview.pvOfFcf === null && preview.pvOfTerminalValue === null) {
        missingInputs.push('Free cash flow series incomplete');
        missingInputs.push('Terminal value inputs missing');
      }
      if (preview.netDebt === null) {
        missingInputs.push('Net debt not available');
      }
      if (preview.impliedValuePerShare === null && preview.equityValue !== null) {
        // Equity value exists but price per share doesn't - likely missing shares
        missingInputs.push('Shares outstanding not available');
      }
    }
    
    return {
      valuation: {
        impliedValuePerShare: preview.impliedValuePerShare,
        enterpriseValue: preview.enterpriseValue,
        equityValue: preview.equityValue,
        currentPrice: preview.currentPrice ?? undefined,
        upsideDownside: preview.upsidePct ?? undefined,
      },
      assumptions: {
        wacc: preview.wacc,
        terminalGrowth: preview.terminalGrowth ?? undefined,
        exitMultiple: preview.exitMultiple ?? undefined,
        projectionHorizon: preview.forecastYears ?? 5,
        taxRate: preview.taxRate ?? undefined,
        reinvestmentRate: undefined, // Not in preview data yet
        capexPct: undefined, // Not in preview data yet
      },
      projections: {
        revenue: preview.projections.revenue,
        ebitda: preview.projections.ebitda,
        freeCashFlow: preview.projections.fcf,
        years: preview.projections.years,
      },
      valuationBridge: {
        pvOfFCF: preview.pvOfFcf,
        pvOfTerminalValue: preview.pvOfTerminalValue,
        enterpriseValue: preview.enterpriseValue,
        netDebt: preview.netDebt,
        equityValue: preview.equityValue,
      },
      sensitivity: undefined, // Will be populated if available in raw data
      missingInputs: missingInputs.length > 0 ? missingInputs : undefined,
    };
  } catch (error) {
    console.error('[parseDCFOutput] Error:', error);
    return null;
  }
}

/**
 * Parse LBO output from API response
 */
export function parseLBOOutput(data: any): LBOOutput | null {
  try {
    const lboOutput = data?.lboOutput;
    if (lboOutput?.valuation) {
      return {
        ...lboOutput,
        modelChecks: lboOutput.modelChecks ?? data.modelChecks ?? data.results?.modelChecks,
      } as LBOOutput;
    }

    const lboSummary = data.lboSummary || {};
    const entry = lboSummary.entry || {};
    const exit = lboSummary.exit || {};
    const sourcesUses = lboSummary.sourcesUses || lboSummary.sourcesAndUses || {};
    
    // Parse sources & uses - handle both array and object formats
    let sources: Array<{ item: string; amount: number }> = [];
    let uses: Array<{ item: string; amount: number }> = [];
    
    if (Array.isArray(sourcesUses.sources)) {
      sources = sourcesUses.sources;
    } else if (sourcesUses.sources && typeof sourcesUses.sources === 'object') {
      sources = Object.entries(sourcesUses.sources).map(([item, amount]) => ({
        item,
        amount: typeof amount === 'number' ? amount : 0,
      }));
    }
    
    if (Array.isArray(sourcesUses.uses)) {
      uses = sourcesUses.uses;
    } else if (sourcesUses.uses && typeof sourcesUses.uses === 'object') {
      uses = Object.entries(sourcesUses.uses).map(([item, amount]) => ({
        item,
        amount: typeof amount === 'number' ? amount : 0,
      }));
    }
    
    const sourcesTotal = sources.reduce((sum, s) => sum + s.amount, 0);
    const usesTotal = uses.reduce((sum, u) => sum + u.amount, 0);
    
    // Extract debt paydown from debt schedule
    const debtSchedule = lboSummary.debtSchedule || [];
    const debtPaydown = debtSchedule.length > 0
      ? debtSchedule.map((year: any) => year.endingDebt || year.debtBalance || 0)
      : [];
    const checks = data.modelChecks ?? data.results?.modelChecks ?? undefined;
    const valuationFallback = {
      enterpriseValue: { reason: 'Workbook valuation outputs unavailable' },
      equityValue: { reason: 'Workbook valuation outputs unavailable' },
      netDebt: { reason: 'Workbook valuation outputs unavailable' },
      sharesOutstanding: { reason: 'Workbook valuation outputs unavailable' },
      pricePerShare: { reason: 'Workbook valuation outputs unavailable' },
      irr: { reason: 'Workbook valuation outputs unavailable' },
      moic: { reason: 'Workbook valuation outputs unavailable' },
      units: { reason: 'Workbook valuation outputs unavailable' },
    };
    
    return {
      dealTerms: {
        entryMultiple: entry.entryMultiple || lboSummary.entryMultiple || 0,
        entryPrice: entry.purchasePrice || entry.entryPrice || lboSummary.entryEV || 0,
        leverageMultiple: entry.leverageMultiple || lboSummary.leverageMultiple || 0,
        holdPeriod: entry.holdPeriod || lboSummary.holdYears || 5,
        exitMultiple: exit.exitMultiple || 0,
      },
      sourcesAndUses: {
        sources,
        uses,
        sourcesTotal,
        usesTotal,
        reconciles: Math.abs(sourcesTotal - usesTotal) < 0.01,
        mismatch: Math.abs(sourcesTotal - usesTotal) >= 0.01 ? sourcesTotal - usesTotal : undefined,
      },
      returns: {
        irr: exit.irr || lboSummary.irr || 0,
        moic: exit.moic || lboSummary.moic || 0,
      },
      debtPaydown: {
        year0: debtPaydown[0] || 0,
        year1: debtPaydown[1] || 0,
        year2: debtPaydown[2] || 0,
        exit: debtPaydown[debtPaydown.length - 1] || 0,
        periods: ['Year 0', 'Year 1', 'Year 2', 'Exit'],
      },
      modelChecks: checks,
      valuation: valuationFallback,
    };
  } catch (error) {
    console.error('[parseLBOOutput] Error:', error);
    return null;
  }
}

/**
 * Parse Three-Statement output from API response
 */
export function parseThreeStatementOutput(data: any): ThreeStatementOutput | null {
  try {
    // Try multiple paths to find the statements data
    const statements = data.statements || 
                      data.threeStatement || 
                      data.threeStatementModel ||
                      data.model?.statements ||
                      {};
    
    // Extract periods - try to infer from data or default
    let periods = statements.periods || 
                  statements.incomeStatement?.periods ||
                  statements.cashFlow?.periods ||
                  statements.balanceSheet?.periods;
    
    // If no periods found, try to infer from array lengths
    if (!periods || periods.length === 0) {
      const revenueLength = statements.incomeStatement?.revenue?.length || 0;
      if (revenueLength > 0) {
        periods = ['LTM', ...Array.from({ length: revenueLength - 1 }, (_, i) => `FY+${i + 1}`)];
      } else {
        periods = ['LTM', 'FY+1', 'FY+2'];
      }
    }
    
    // Helper to safely extract array with null handling
    const getArray = (arr: any): (number | null)[] => {
      if (!Array.isArray(arr)) return [];
      return arr.map(val => {
        if (val === null || val === undefined) return null;
        if (typeof val === 'number' && isFinite(val)) return val;
        const parsed = parseFloat(String(val));
        return isFinite(parsed) ? parsed : null;
      });
    };
    
    // Calculate balance sheet tie status
    const calculateTieStatus = () => {
      const assets = getArray(statements.balanceSheet?.totalAssets);
      const liabilities = getArray(statements.balanceSheet?.totalLiabilities);
      const equity = getArray(statements.balanceSheet?.totalEquity);
      
      if (assets.length === 0 || liabilities.length === 0 || equity.length === 0) {
        return { ties: false, mismatch: null };
      }
      
      const tolerance = 1_000_000; // $1M tolerance
      let maxMismatch = 0;
      let allTie = true;
      
      periods.forEach((_, idx) => {
        const a = assets[idx] ?? 0;
        const l = liabilities[idx] ?? 0;
        const e = equity[idx] ?? 0;
        const diff = Math.abs(a - (l + e));
        maxMismatch = Math.max(maxMismatch, diff);
        if (diff >= tolerance) {
          allTie = false;
        }
      });
      
      return {
        ties: allTie,
        mismatch: allTie ? null : maxMismatch,
      };
    };
    
    const tieStatus = calculateTieStatus();
    
    return {
      incomeStatement: {
        revenue: getArray(statements.incomeStatement?.revenue),
        cogs: getArray(statements.incomeStatement?.cogs),
        grossProfit: getArray(statements.incomeStatement?.grossProfit),
        operatingExpenses: getArray(statements.incomeStatement?.operatingExpenses),
        ebitda: getArray(statements.incomeStatement?.ebitda),
        ebit: getArray(statements.incomeStatement?.ebit),
        netIncome: getArray(statements.incomeStatement?.netIncome),
        periods,
      },
      cashFlow: {
        operatingCashFlow: getArray(statements.cashFlow?.operatingCashFlow),
        investingCashFlow: getArray(statements.cashFlow?.investingCashFlow),
        financingCashFlow: getArray(statements.cashFlow?.financingCashFlow),
        netChangeInCash: getArray(statements.cashFlow?.netChangeInCash),
        periods,
      },
      balanceSheet: {
        cash: getArray(statements.balanceSheet?.cash),
        totalAssets: getArray(statements.balanceSheet?.totalAssets),
        totalLiabilities: getArray(statements.balanceSheet?.totalLiabilities),
        totalEquity: getArray(statements.balanceSheet?.totalEquity),
        periods,
      },
      balanceSheetTies: tieStatus.ties,
      balanceSheetMismatch: tieStatus.mismatch ?? undefined,
      modelChecks: data.modelChecks || statements.modelChecks || undefined,
    };
  } catch (error) {
    console.error('[parseThreeStatementOutput] Error:', error);
    return null;
  }
}

/**
 * Parse Comps output from API response
 */
export function parseCompsOutput(data: any): CompsOutput | null {
  try {
    const compsData = data.compsModel || data.comps || {};
    const rawPeers = compsData.peers || compsData.comps;
    const peers = Array.isArray(rawPeers) ? rawPeers : [];
    const target = compsData.target || {};
    const checks = data.modelChecks ?? data.results?.modelChecks ?? undefined;
    
    // Calculate summary statistics
    const evRevenueValues = peers
      .map((p: any) => p.evRevenue || p.evRev)
      .filter((v: any): v is number => typeof v === 'number');
    const evEbitdaValues = peers
      .map((p: any) => p.evEbitda || p.evEbitdaMultiple)
      .filter((v: any): v is number => typeof v === 'number');
    const peValues = peers
      .map((p: any) => p.pe || p.peMultiple)
      .filter((v: any): v is number => typeof v === 'number');
    
    const percentile = (arr: number[], p: number) => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const index = Math.floor(p * (sorted.length - 1));
      return sorted[index] || 0;
    };
    
    return {
      target: {
        ticker: target.ticker || '',
        evRevenue: target.evRevenue || target.evRev,
        evEbitda: target.evEbitda || target.evEbitdaMultiple,
        pe: target.pe || target.peMultiple,
      },
      peers: peers.map((p: any) => ({
        ticker: p.ticker || '',
        evRevenue: p.evRevenue || p.evRev,
        evEbitda: p.evEbitda || p.evEbitdaMultiple,
        pe: p.pe || p.peMultiple,
      })),
      summary: {
        evRevenue: {
          median: percentile(evRevenueValues, 0.5),
          p25: percentile(evRevenueValues, 0.25),
          p75: percentile(evRevenueValues, 0.75),
        },
        evEbitda: {
          median: percentile(evEbitdaValues, 0.5),
          p25: percentile(evEbitdaValues, 0.25),
          p75: percentile(evEbitdaValues, 0.75),
        },
        pe: {
          median: percentile(peValues, 0.5),
          p25: percentile(peValues, 0.25),
          p75: percentile(peValues, 0.75),
        },
      },
      modelChecks: checks,
    };
  } catch (error) {
    console.error('[parseCompsOutput] Error:', error);
    return null;
  }
}

/**
 * Parse Merger output from API response
 */
export function parseMergerOutput(data: any): MergerOutput | null {
  try {
    const mergerData = data.mergerModel || data.merger || {};
    const epsBridge = mergerData.epsBridge || {};
    const sourcesUses = mergerData.sourcesUses || {};
    const checks = data.modelChecks ?? data.results?.modelChecks ?? undefined;
    const maV1 = mergerData.maV1 || data.maV1 || data.output?.maV1 || data.results?.maV1;

    const parseMaField = (field: any) => {
      if (!field || typeof field !== 'object') {
        return undefined;
      }
      const value = typeof field.value === 'number' && Number.isFinite(field.value) ? field.value : undefined;
      const reason = typeof field.reason === 'string' ? field.reason : undefined;
      return value !== undefined ? { value } : reason ? { reason } : undefined;
    };

    const parsedMaV1 = maV1
      ? {
          targetEquityValue: parseMaField(maV1.targetEquityValue),
          newSharesIssued: parseMaField(maV1.newSharesIssued),
          proFormaNetIncome: parseMaField(maV1.proFormaNetIncome),
          proFormaShares: parseMaField(maV1.proFormaShares),
          standaloneEps: parseMaField(maV1.standaloneEps),
          proFormaEps: parseMaField(maV1.proFormaEps),
          accretionPct: parseMaField(maV1.accretionPct),
        }
      : undefined;
    
    return {
      maV1: parsedMaV1,
      accretionDilution: {
        epsImpact: mergerData.epsImpact || 0,
        isAccretive: (mergerData.epsImpact || 0) > 0,
      },
      epsBridge: {
        standaloneAcquirerEPS: epsBridge.standaloneAcquirerEPS || 0,
        purchaseAccounting: epsBridge.purchaseAccounting || 0,
        intangAmort: epsBridge.intangAmort || 0,
        synergies: epsBridge.synergies || 0,
        financingEffects: epsBridge.financingEffects || 0,
        proFormaEPS: epsBridge.proFormaEPS || 0,
      },
      sourcesAndUses: {
        sources: Array.isArray(sourcesUses.sources)
          ? sourcesUses.sources
          : Object.entries(sourcesUses.sources || {}).map(([item, amount]) => ({
              item,
              amount: typeof amount === 'number' ? amount : 0,
            })),
        uses: Array.isArray(sourcesUses.uses)
          ? sourcesUses.uses
          : Object.entries(sourcesUses.uses || {}).map(([item, amount]) => ({
              item,
              amount: typeof amount === 'number' ? amount : 0,
            })),
      },
      assumptions: {
        premium: mergerData.premium || 0,
        mix: {
          cash: mergerData.mix?.cash || 0,
          debt: mergerData.mix?.debt || 0,
          stock: mergerData.mix?.stock || 0,
        },
        synergiesTimeline: mergerData.synergiesTimeline || 'Year 1-2',
        revenueSynergies: mergerData.revenueSynergies,
        costSynergies: mergerData.costSynergies,
      },
      modelChecks: checks,
    };
  } catch (error) {
    console.error('[parseMergerOutput] Error:', error);
    return null;
  }
}

/**
 * Parse Operating output from API response
 */
export function parseOperatingOutput(data: any): OperatingOutput | null {
  try {
    const operatingData = data.operatingModel || data.operating || {};
    const monthly = operatingData.monthly || [];
    
    // Find when cash turns negative
    const negativeCashMonth = monthly.find((m: any) => m.endingCash < 0);
    
    return {
      monthly: monthly.map((m: any) => ({
        month: m.month || m.period || '',
        revenue: m.revenue || 0,
        grossProfit: m.grossProfit || 0,
        ebitda: m.ebitda || 0,
        netIncome: m.netIncome || 0,
        endingCash: m.endingCash || 0,
      })),
      runway: {
        monthCashTurnsNegative: negativeCashMonth?.month || null,
        isPositive: !negativeCashMonth,
      },
      drivers: operatingData.drivers ? {
        customerAdds: operatingData.drivers.customerAdds,
        churn: operatingData.drivers.churn,
        arpu: operatingData.drivers.arpu,
        headcount: operatingData.drivers.headcount,
      } : undefined,
    };
  } catch (error) {
    console.error('[parseOperatingOutput] Error:', error);
    return null;
  }
}

/**
 * Parse model output based on type
 */
export function parseModelOutput(
  modelType: string,
  data: any
): ModelOutput | null {
  try {
    switch (modelType) {
      case 'dcf':
        const dcf = parseDCFOutput(data);
        return dcf ? { type: 'dcf', data: dcf } : null;
      case 'lbo':
        const lbo = parseLBOOutput(data);
        return lbo ? { type: 'lbo', data: lbo } : null;
      case 'three-statement':
      case 'threeStatement':
        const threeStmt = parseThreeStatementOutput(data);
        return threeStmt ? { type: 'three-statement', data: threeStmt } : null;
      case 'comps':
        const comps = parseCompsOutput(data);
        return comps ? { type: 'comps', data: comps } : null;
      case 'merger':
        const merger = parseMergerOutput(data);
        return merger ? { type: 'merger', data: merger } : null;
      case 'operating':
        const operating = parseOperatingOutput(data);
        return operating ? { type: 'operating', data: operating } : null;
      default:
        console.warn(`[parseModelOutput] Unknown model type: ${modelType}`);
        return null;
    }
  } catch (error) {
    console.error('[parseModelOutput] Error:', error);
    return null;
  }
}

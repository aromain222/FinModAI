/**
 * DCF Tear Sheet Mapper
 * 
 * Converts DCF model output to canonical TearSheet format.
 */

import type { TearSheet } from '../tearSheet/types';
import type { DCFOutput } from '../outputTypes';
import { formatMoney, formatPct, formatMultiple, formatPrice } from '@/lib/format/finance';

export function mapDcfToTearSheet(
  output: DCFOutput,
  rawData: any,
  diagnostics: {
    coverage?: Array<{ label: string; status: 'available' | 'partial' | 'unavailable' }>;
    defaults?: Array<{ path: string; value: any }>;
    warnings?: string[];
  } = {}
): TearSheet {
  const canComputeValuation =
    output.valuation.impliedValuePerShare != null &&
    output.valuation.enterpriseValue != null &&
    output.valuation.equityValue != null;

  // Build KPIs
  const kpis: TearSheet['kpis'] = [];
  if (output.valuation.impliedValuePerShare != null) {
    kpis.push({
      label: 'Implied Value / Share',
      value: output.valuation.impliedValuePerShare,
      format: 'money',
      unit: 'raw',
      decimals: 2,
    });
  }
  if (output.valuation.enterpriseValue != null) {
    kpis.push({
      label: 'Enterprise Value',
      value: output.valuation.enterpriseValue,
      format: 'money',
      unit: 'millions',
    });
  }
  if (output.valuation.equityValue != null) {
    kpis.push({
      label: 'Equity Value',
      value: output.valuation.equityValue,
      format: 'money',
      unit: 'millions',
    });
  }
  if (output.valuation.currentPrice != null) {
    kpis.push({
      label: 'Current Price',
      value: output.valuation.currentPrice,
      format: 'money',
      unit: 'raw',
      decimals: 2,
    });
  }
  if (output.valuation.upsideDownside != null) {
    kpis.push({
      label: 'Upside/Downside',
      value: output.valuation.upsideDownside,
      format: 'pct',
    });
  }

  // Build assumption chips
  const chips: TearSheet['chips'] = [];
  if (output.assumptions.wacc != null) {
    chips.push({
      label: 'WACC',
      value: formatPct(output.assumptions.wacc),
    });
  }
  if (output.assumptions.terminalGrowth != null) {
    chips.push({
      label: 'Terminal Growth',
      value: formatPct(output.assumptions.terminalGrowth),
    });
  }
  if (output.assumptions.exitMultiple != null) {
    chips.push({
      label: 'Exit Multiple',
      value: formatMultiple(output.assumptions.exitMultiple),
    });
  }
  if (output.assumptions.projectionHorizon != null) {
    chips.push({
      label: 'Forecast Years',
      value: `${output.assumptions.projectionHorizon} years`,
    });
  }
  if (output.assumptions.taxRate != null) {
    chips.push({
      label: 'Tax Rate',
      value: formatPct(output.assumptions.taxRate),
    });
  }

  // Build main blocks
  const mainBlocks: TearSheet['mainBlocks'] = [];

  // Projections table
  if (output.projections && output.projections.revenue.length > 0) {
    const projectionRows: (string | number | null)[][] = [];
    
    // Revenue row
    projectionRows.push([
      'Revenue',
      ...output.projections.revenue.map(v => v),
    ]);
    
    // EBITDA row
    if (output.projections.ebitda.length > 0) {
      projectionRows.push([
        'EBITDA',
        ...output.projections.ebitda.map(v => v),
      ]);
    }
    
    // FCF row
    if (output.projections.freeCashFlow.length > 0) {
      projectionRows.push([
        'Free Cash Flow',
        ...output.projections.freeCashFlow.map(v => v),
      ]);
    }

    if (projectionRows.length > 0) {
      mainBlocks.push({
        type: 'table',
        title: 'Projections (FY+1 to FY+3)',
        columns: [
          { header: 'Metric', format: 'text', align: 'left' },
          ...output.projections.years.map(year => ({
            header: year,
            format: 'money' as const,
            unit: 'millions' as const,
            align: 'right' as const,
          })),
        ],
        rows: projectionRows,
        unitNote: 'Units: $M',
      });
    }
  }

  // Valuation bridge
  if (canComputeValuation) {
    const bridgeLines: TearSheet['mainBlocks'][0]['lines'] = [];
    
    if (output.valuationBridge.pvOfFCF != null) {
      bridgeLines.push({
        label: 'PV of Explicit FCF',
        value: output.valuationBridge.pvOfFCF,
        format: 'money',
        unit: 'millions',
      });
    }
    
    if (output.valuationBridge.pvOfTerminalValue != null) {
      bridgeLines.push({
        label: 'PV of Terminal Value',
        value: output.valuationBridge.pvOfTerminalValue,
        format: 'money',
        unit: 'millions',
      });
    }
    
    bridgeLines.push({
      label: 'Enterprise Value',
      value: output.valuationBridge.enterpriseValue,
      format: 'money',
      unit: 'millions',
      isSubtotal: true,
    });
    
    if (output.valuationBridge.netDebt != null) {
      bridgeLines.push({
        label: 'Less: Net Debt',
        value: -output.valuationBridge.netDebt, // Show as negative
        format: 'money',
        unit: 'millions',
      });
    }
    
    bridgeLines.push({
      label: 'Equity Value',
      value: output.valuationBridge.equityValue,
      format: 'money',
      unit: 'millions',
      isTotal: true,
    });

    if (bridgeLines.length > 0) {
      mainBlocks.push({
        type: 'bridge',
        title: 'Valuation Bridge',
        lines: bridgeLines,
      });
    }
  }

  // Per-share bridge (if we have shares data)
  if (canComputeValuation && output.valuation.impliedValuePerShare != null) {
    const perShareLines: TearSheet['mainBlocks'][0]['lines'] = [];
    
    perShareLines.push({
      label: 'Enterprise Value',
      value: output.valuationBridge.enterpriseValue,
      format: 'money',
      unit: 'millions',
    });
    
    if (output.valuationBridge.netDebt != null) {
      perShareLines.push({
        label: 'Less: Net Debt',
        value: -output.valuationBridge.netDebt,
        format: 'money',
        unit: 'millions',
      });
    }
    
    perShareLines.push({
      label: 'Equity Value',
      value: output.valuationBridge.equityValue,
      format: 'money',
      unit: 'millions',
      isSubtotal: true,
    });
    
    perShareLines.push({
      label: 'Implied Value / Share',
      value: output.valuation.impliedValuePerShare,
      format: 'money',
      unit: 'raw',
      decimals: 2,
      isTotal: true,
    });

    mainBlocks.push({
      type: 'bridge',
      title: 'Per-Share Bridge',
      lines: perShareLines,
    });
  }

  // Terminal value block
  if (output.valuationBridge.pvOfTerminalValue != null && output.valuationBridge.enterpriseValue != null) {
    const tvPctOfEV = (output.valuationBridge.pvOfTerminalValue / output.valuationBridge.enterpriseValue) * 100;
    
    const tvLines: TearSheet['mainBlocks'][0]['lines'] = [];
    
    if (output.assumptions.terminalGrowth != null) {
      tvLines.push({
        label: 'Terminal Growth Rate',
        value: output.assumptions.terminalGrowth,
        format: 'pct',
      });
    }
    
    if (output.assumptions.exitMultiple != null) {
      tvLines.push({
        label: 'Exit Multiple',
        value: output.assumptions.exitMultiple,
        format: 'multiple',
      });
    }
    
    tvLines.push({
      label: 'PV of Terminal Value',
      value: output.valuationBridge.pvOfTerminalValue,
      format: 'money',
      unit: 'millions',
    });
    
    tvLines.push({
      label: '% of Enterprise Value',
      value: tvPctOfEV,
      format: 'pct',
      isTotal: true,
    });

    mainBlocks.push({
      type: 'bridge',
      title: 'Terminal Value Analysis',
      lines: tvLines,
    });
  }

  // Missing inputs callout
  if (!canComputeValuation && output.missingInputs && output.missingInputs.length > 0) {
    mainBlocks.unshift({
      type: 'callout',
      tone: 'warning',
      title: 'Cannot compute valuation yet',
      bullets: output.missingInputs,
      ctaLabel: 'Edit assumptions',
    });
  }

  // Build bottom blocks (sensitivity)
  const bottomBlocks: TearSheet['bottomBlocks'] = [];
  
  if (output.sensitivity && output.sensitivity.grid && output.sensitivity.grid.length > 0) {
    // Build sensitivity table
    const sensitivityRows: (string | number | null)[][] = [];
    
    // Assume 3x3 grid for now
    const waccRange = output.sensitivity.waccRange?.slice(0, 3) || [];
    const terminalRange = output.sensitivity.terminalGrowthRange?.slice(0, 3) || 
                         output.sensitivity.exitMultipleRange?.slice(0, 3) || [];
    
    waccRange.forEach((wacc, waccIdx) => {
      const row: (string | number | null)[] = [
        `WACC ${formatPct(wacc)}`,
        ...(output.sensitivity.grid[waccIdx]?.slice(0, 3) || []).map(v => v),
      ];
      sensitivityRows.push(row);
    });

    if (sensitivityRows.length > 0) {
      bottomBlocks.push({
        type: 'table',
        title: 'Sensitivity Analysis',
        columns: [
          { header: 'WACC →', format: 'text', align: 'left' },
          ...terminalRange.map(val => ({
            header: output.sensitivity.terminalGrowthRange
              ? formatPct(val)
              : formatMultiple(val),
            format: 'money' as const,
            unit: 'raw' as const,
            decimals: 2,
            align: 'right' as const,
          })),
        ],
        rows: sensitivityRows,
      });
    }
  }

  // Build sidebar assumptions
  const sidebarAssumptions: TearSheet['sidebar']['assumptions'] = chips.map(chip => ({
    label: chip.label,
    value: chip.value,
  }));

  return {
    header: {
      ticker: rawData?.ticker || 'N/A',
      modelName: 'DCF',
      createdAt: rawData?.createdAt || new Date().toISOString(),
    },
    kpis,
    chips,
    mainBlocks,
    sidebar: {
      diagnostics: {
        coverage: diagnostics.coverage || [],
        defaults: diagnostics.defaults || [],
        warnings: diagnostics.warnings || [],
      },
      assumptions: sidebarAssumptions,
    },
    bottomBlocks: bottomBlocks.length > 0 ? bottomBlocks : undefined,
  };
}

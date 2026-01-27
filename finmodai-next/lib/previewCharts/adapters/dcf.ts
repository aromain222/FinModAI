import type { ChartSpec } from '@/types/chartSpecs';

const normalizeSeries = (series: any, valueKey: string, xKey = 'year') => {
  if (!series) return [];
  if (Array.isArray(series) && series.length && typeof series[0] === 'object') {
    return series.map((row: any) => ({
      [xKey]: row[xKey] ?? row.year ?? row.period ?? row.date ?? '',
      [valueKey]: row[valueKey] ?? row.value ?? null,
    }));
  }
  return [];
};

export function dcfCharts(results: any): ChartSpec[] {
  const charts: ChartSpec[] = [];
  const fcfSeries = normalizeSeries(results?.fcfSeries ?? results?.fcfForecast, 'fcf');
  if (fcfSeries.length) {
    charts.push({
      type: 'line',
      title: 'Free Cash Flow Forecast',
      xKey: 'year',
      series: [{ key: 'fcf', label: 'FCF' }],
      data: fcfSeries,
    });
  }

  const revenueSeries = normalizeSeries(results?.revenueSeries ?? results?.forecast, 'revenue');
  const marginSeries = normalizeSeries(results?.marginSeries ?? results?.forecast, 'margin');
  if (revenueSeries.length || marginSeries.length) {
    const merged: Record<string, any>[] = [];
    const byYear = new Map<string, any>();
    const pushRow = (row: any, key: string) => {
      const yr = row.year ?? row.date ?? row.period ?? '';
      if (!byYear.has(yr)) byYear.set(yr, { year: yr });
      byYear.get(yr)[key] = row[key];
    };
    revenueSeries.forEach((r) => pushRow(r, 'revenue'));
    marginSeries.forEach((r) => pushRow(r, 'margin'));
    byYear.forEach((v) => merged.push(v));
    charts.push({
      type: 'line',
      title: 'Revenue & Margin',
      xKey: 'year',
      series: [
        { key: 'revenue', label: 'Revenue' },
        { key: 'margin', label: 'Margin' },
      ],
      data: merged,
    });
  }

  const sensitivities = results?.sensitivities ?? results?.sensitivity;
  const wacc = sensitivities?.wacc;
  const tg = sensitivities?.terminalGrowth ?? sensitivities?.tg;
  const price = sensitivities?.price ?? sensitivities?.impliedPrice;
  if (Array.isArray(wacc) && Array.isArray(tg) && Array.isArray(price)) {
    const values: number[][] = [];
    for (let i = 0; i < wacc.length; i++) {
      values[i] = [];
      for (let j = 0; j < tg.length; j++) {
        values[i][j] = price[i]?.[j] ?? 0;
      }
    }
    charts.push({
      type: 'heatmap',
      title: 'WACC vs Terminal Growth Sensitivity',
      xLabels: tg.map((v: any) => String(v)),
      yLabels: wacc.map((v: any) => String(v)),
      values,
      format: 'currency',
    });
  }

  const bridge = results?.valuationBridge || results?.valuation_bridge;
  if (bridge && (bridge.enterpriseValue || bridge.equityValue)) {
    const steps = [
      { label: 'Enterprise Value', value: bridge.enterpriseValue ?? bridge.ev ?? 0 },
      { label: 'Net Debt', value: -(bridge.netDebt ?? 0) },
      { label: 'Equity Value', value: bridge.equityValue ?? bridge.eq ?? 0 },
    ].filter((s) => s.value !== null && s.value !== undefined);
    if (steps.length) {
      charts.push({
        type: 'waterfall',
        title: 'Valuation Bridge',
        steps,
      });
    }
  }

  return charts;
}

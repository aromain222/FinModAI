import type { ChartSpec } from '@/types/chartSpecs';

export function operatingCharts(results: any): ChartSpec[] {
  const charts: ChartSpec[] = [];
  const series = results?.forecast ?? results?.series ?? [];
  if (Array.isArray(series) && series.length) {
    const data = series.map((row: any) => ({
      year: row.year ?? row.period ?? row.date ?? '',
      revenue: row.revenue ?? null,
      ebitda: row.ebitda ?? null,
      fcf: row.fcf ?? row.freeCashFlow ?? null,
    }));
    charts.push({
      type: 'line',
      title: 'Revenue / EBITDA / FCF',
      xKey: 'year',
      series: [
        { key: 'revenue', label: 'Revenue' },
        { key: 'ebitda', label: 'EBITDA' },
        { key: 'fcf', label: 'FCF' },
      ],
      data,
    });
  }

  const cfBridge = results?.cashFlowBridge;
  if (cfBridge?.steps) {
    charts.push({
      type: 'waterfall',
      title: 'Cash Flow Bridge',
      steps: cfBridge.steps.map((s: any) => ({ label: s.label ?? s.name ?? '', value: Number(s.value ?? 0) })),
    });
  }

  return charts;
}

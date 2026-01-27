import type { ChartSpec } from '@/types/chartSpecs';

export function lboCharts(results: any): ChartSpec[] {
  const charts: ChartSpec[] = [];
  const debtSeries = results?.debtSchedule ?? results?.debtSeries;
  if (Array.isArray(debtSeries) && debtSeries.length) {
    const data = debtSeries.map((row: any) => ({
      year: row.year ?? row.period ?? row.date ?? '',
      debt: row.balance ?? row.debt ?? row.total ?? null,
    }));
    charts.push({
      type: 'bar',
      title: 'Total Debt Over Time',
      xKey: 'year',
      series: [{ key: 'debt', label: 'Debt' }],
      data,
    });
  }

  const returnsBridge = results?.returnsBridge;
  if (returnsBridge && Array.isArray(returnsBridge.steps)) {
    charts.push({
      type: 'waterfall',
      title: 'Returns Bridge',
      steps: returnsBridge.steps.map((s: any) => ({ label: s.label ?? s.name ?? '', value: Number(s.value ?? 0) })),
    });
  }

  const irrHeatmap = results?.irrSensitivity ?? results?.moicSensitivity;
  if (irrHeatmap?.x && irrHeatmap?.y && irrHeatmap?.values) {
    charts.push({
      type: 'heatmap',
      title: irrHeatmap.title ?? 'IRR Sensitivity',
      xLabels: irrHeatmap.x.map((v: any) => String(v)),
      yLabels: irrHeatmap.y.map((v: any) => String(v)),
      values: irrHeatmap.values,
      format: 'percent',
    });
  }

  return charts;
}

import type { ComponentType } from 'react';
import { ReportShell } from '@/components/reports/ReportShell';
import { DcfReportTemplate, LboReportTemplate, CompsReportTemplate, MaReportTemplate } from '@/components/reports/templates';

const mockReports = [
  {
    id: '1',
    modelType: 'DCF',
    companyName: 'DemoCo',
    ticker: 'DEMO',
    createdAt: new Date().toISOString(),
    valuation: { impliedValuePerShare: 42, enterpriseValue: 1800, equityValue: 1400, upsideDownside: 0.25 },
    assumptions: { wacc: 0.09, terminalGrowth: 0.02, forecastYears: 5 },
    bridge: { pvOfFCF: 900, pvOfTerminalValue: 1100, netDebt: 200 },
  },
  {
    id: '2',
    modelType: 'LBO',
    companyName: 'DemoCo',
    ticker: 'DEMO',
    createdAt: new Date().toISOString(),
    valuation: { enterpriseValue: 2200, equityValue: 800, netDebt: 1400 },
    returns: { irr: 0.18, moic: 2.1 },
    dealTerms: { entryMultiple: 9.5, exitMultiple: 11, holdPeriod: 5, leverageMultiple: 4.0 },
  },
  {
    id: '3',
    modelType: 'COMPS',
    companyName: 'DemoCo',
    ticker: 'DEMO',
    createdAt: new Date().toISOString(),
    target: { evRevenue: 5.2, evEbitda: 12.4, pe: 18.1 },
    summary: { evRevenue: { p25: 4.2, p75: 6.4 }, evEbitda: { p25: 10.5, p75: 14.0 }, pe: { p25: 16, p75: 21 } },
  },
  {
    id: '4',
    modelType: 'MA',
    companyName: 'DemoCo',
    ticker: 'DEMO',
    createdAt: new Date().toISOString(),
    consideration: { cashPct: 60, stockPct: 40 },
    newSharesIssued: 120,
    proFormaShares: 620,
    epsImpact: { standalone: 3.1, proForma: 3.4, accretionPct: 0.09 },
    synergies: { cost: 80, revenue: 40 },
  },
];

const templateMap: Record<string, ComponentType<{ payload: any }>> = {
  DCF: DcfReportTemplate,
  LBO: LboReportTemplate,
  COMPS: CompsReportTemplate,
  MA: MaReportTemplate,
};

export default function ReportDetailPage({ params }: { params: { id: string } }) {
  const report = mockReports.find((r) => r.id === params.id) ?? mockReports[0];
  const Template = templateMap[report.modelType?.toUpperCase()] ?? DcfReportTemplate;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 text-[var(--cb-text-body)]">
      <ReportShell
        title={report.companyName}
        subtitle={`${report.ticker} · ${report.modelType.toUpperCase()} Report`}
        modelType={report.modelType}
        ticker={report.ticker}
        createdAt={report.createdAt}
        checks={[
          { label: 'Integrity', status: 'pass' },
          { label: 'Data source', status: 'warn' },
          { label: 'Completeness', status: 'pass' },
        ]}
      >
        <Template payload={report} />
      </ReportShell>
    </main>
  );
}

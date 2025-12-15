"use client";

import { CapitalBaseLogo } from '@/components/CapitalBaseLogo';
import type { ModelReport } from '@/lib/reportTypes';

interface Props {
  report: ModelReport;
}

export function CapitalBaseReportView({ report }: Props) {
  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const keyTakeaways = report.keyTakeaways ?? [];
  const revenueDrivers = report.companySnapshot.revenueDrivers ?? [];
  const macroThemes = report.macroContext.themes ?? [];
  const risks = report.riskAndMitigants.risks ?? [];
  const mitigants = report.riskAndMitigants.mitigants ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handlePrint}
          className="rounded-md border border-cb-line px-3 py-1.5 text-sm font-medium text-cb-ink hover:bg-cb-soft"
        >
          Print / Save as PDF
        </button>
      </div>
      <article className="report-print-area mx-auto max-w-3xl rounded-2xl border border-cb-line bg-white p-6 shadow-sm">
        <header className="flex flex-col gap-4 border-b border-cb-line pb-4 sm:flex-row sm:items-center sm:justify-between">
          <CapitalBaseLogo />
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cb-slate">
              CapitalBase Analyst Report
            </p>
            <p className="text-sm text-cb-slate">Generated {new Date(report.generatedAt).toLocaleString()}</p>
          </div>
        </header>

        <section className="mt-4 space-y-2">
          <h1 className="text-2xl font-semibold text-cb-ink">{report.title}</h1>
          <h2 className="text-lg text-cb-slate">{report.subtitle}</h2>
          <p className="text-base text-cb-ink">{report.oneLineSummary}</p>
        </section>

        <Section title="Key Takeaways">
          <ul className="list-disc space-y-1 pl-5 text-sm text-cb-ink">
            {keyTakeaways.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </Section>

        <Section title="Company Snapshot">
          <div className="grid gap-4 text-sm text-cb-ink sm:grid-cols-2">
            <div>
              <p className="font-semibold text-cb-slate">Business model</p>
              <p>{report.companySnapshot.businessModel}</p>
            </div>
            <div>
              <p className="font-semibold text-cb-slate">Revenue drivers</p>
              <ul className="list-disc pl-5">
                {revenueDrivers.map((driver, idx) => (
                  <li key={idx}>{driver}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-cb-slate">Margin profile</p>
              <p>{report.companySnapshot.marginProfile}</p>
            </div>
            <div>
              <p className="font-semibold text-cb-slate">Capital structure</p>
              <p>{report.companySnapshot.capitalStructure}</p>
            </div>
          </div>
        </Section>

        <Section title="Valuation Overview">
          <div className="space-y-2 text-sm text-cb-ink">
            <p className="font-semibold text-cb-ink">{report.valuationSummary.headline}</p>
            <p>
              <strong>Base case:</strong> {report.valuationSummary.baseCase}
            </p>
            <p>
              <strong>Bull case:</strong> {report.valuationSummary.bullCase}
            </p>
            <p>
              <strong>Bear case:</strong> {report.valuationSummary.bearCase}
            </p>
            <p>{report.valuationSummary.upsideDownsideCommentary}</p>
          </div>
        </Section>

        <Section title="Macro Context">
          <div className="space-y-2 text-sm text-cb-ink">
            <span className="inline-flex rounded-full bg-cb-soft px-3 py-1 text-xs font-semibold uppercase text-cb-blue">
              {report.macroContext.regimeLabel}
            </span>
            <ul className="list-disc pl-5">
              {macroThemes.map((theme, index) => (
                <li key={index}>{theme}</li>
              ))}
            </ul>
          </div>
        </Section>

        <Section title="Risks & Mitigants">
          <div className="grid gap-4 text-sm text-cb-ink sm:grid-cols-2">
            <div>
              <p className="font-semibold text-cb-slate">Risks</p>
              <ul className="list-disc pl-5">
                {risks.map((risk, idx) => (
                  <li key={idx}>{risk}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-cb-slate">Mitigants</p>
              <ul className="list-disc pl-5">
                {mitigants.map((mitigant, idx) => (
                  <li key={idx}>{mitigant}</li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        <Section title="Process Notes">
          <p className="text-sm text-cb-ink">{report.processNotes}</p>
        </Section>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-cb-slate">{title}</h3>
      <div className="rounded-2xl border border-cb-line/70 bg-cb-soft/40 p-4">{children}</div>
    </section>
  );
}

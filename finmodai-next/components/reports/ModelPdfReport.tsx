import type { AssumptionItem, ModelRunReportData, ReportTable, SnapshotItem } from '@/lib/reports/modelRunReport';

type ModelPdfReportProps = {
  data: ModelRunReportData;
  summaryParagraphs: string[];
  summarySource: 'ai' | 'fallback';
  demoMode: boolean;
};

function formatValue(value: number | string | null, format: SnapshotItem['format'] | AssumptionItem['format']): string {
  if (value === null) return '—';
  if (typeof value === 'string') return value;
  if (format === 'percent') return `${(value * 100).toFixed(1)}%`;
  if (format === 'multiple') return `${value.toFixed(2)}x`;
  if (format === 'money') return value.toLocaleString('en-US');
  return value.toLocaleString('en-US');
}

function renderTable(table: ReportTable) {
  return (
    <section key={table.title} className="report-card avoid-break">
      <h3 className="section-title">{table.title}</h3>
      <div className="table-wrap">
        <table className="report-table">
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th key={`${table.title}-${column}`}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.slice(0, 14).map((row, rowIndex) => (
              <tr key={`${table.title}-row-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${table.title}-row-${rowIndex}-col-${cellIndex}`}>{cell === null ? '—' : String(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ModelPdfReport({ data, summaryParagraphs, summarySource, demoMode }: ModelPdfReportProps) {
  return (
    <div className="report-root">
      <header className="print-header">
        <div className="header-left">CAPITALBASE</div>
        <div className="header-right">{demoMode ? 'Demo' : 'Confidential'}</div>
      </header>

      <main className="report-body">
        <section className="cover avoid-break">
          <p className="kicker">Model Report</p>
          <h1>{data.companyName} ({data.ticker})</h1>
          <p className="subhead">{data.modelType} • As of {data.asOfDate}</p>
          <p className="meta">Generated {new Date(data.generatedAt).toLocaleString()} • Run ID {data.runId}</p>
          <p className="disclaimer">For demonstration purposes. Not investment advice.</p>
        </section>

        <section className="report-card avoid-break">
          <h2 className="section-title">Executive Summary</h2>
          <p className="summary-meta">Source: {summarySource === 'ai' ? 'OpenAI synthesis' : 'Deterministic fallback'}</p>
          <div className="summary-stack">
            {summaryParagraphs.map((paragraph, index) => (
              <p key={`summary-${index}`} className="summary-paragraph">
                {paragraph}
              </p>
            ))}
          </div>
        </section>

        <section className="report-card avoid-break">
          <h2 className="section-title">Model Snapshot</h2>
          <div className="grid two-col">
            {data.snapshotItems.length > 0 ? (
              data.snapshotItems.map((item) => (
                <div key={item.label} className="metric-row">
                  <span className="metric-label">{item.label}</span>
                  <span className="metric-value">
                    {item.format === 'money' ? '$' : ''}
                    {formatValue(item.value, item.format)}
                  </span>
                </div>
              ))
            ) : (
              <p className="muted">No model snapshot metrics were available for this run.</p>
            )}
          </div>
        </section>

        <section className="report-card avoid-break">
          <h2 className="section-title">Key Assumptions</h2>
          <div className="grid two-col">
            {data.assumptions.length > 0 ? (
              data.assumptions.map((assumption) => (
                <div key={assumption.label} className="metric-row">
                  <span className="metric-label">
                    {assumption.label}
                    {assumption.source ? ` (${assumption.source})` : ''}
                  </span>
                  <span className="metric-value">
                    {assumption.format === 'money' ? '$' : ''}
                    {formatValue(assumption.value, assumption.format)}
                  </span>
                </div>
              ))
            ) : (
              <p className="muted">No assumptions were available in this model output.</p>
            )}
          </div>
        </section>

        {data.keyTables.slice(0, 3).map(renderTable)}
      </main>

      <footer className="print-footer">
        <span>{data.companyName} ({data.ticker}) • {data.modelType}</span>
        <span className="page-number" />
      </footer>
    </div>
  );
}

import { APP_NAME } from '@/lib/branding';

type SummaryTable = {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  footnote?: string;
};

type ModelContent = {
  title: string;
  description: string;
  highlights: string[];
  tables: SummaryTable[];
};

type ModelSummaryProps = {
  modelType?: string;
  ticker?: string;
};

const MODEL_CONTENT: Record<string, ModelContent> = {
  'three-statement': {
    title: 'Integrated Three-Statement Model',
    description: 'Linked income statement, balance sheet, and cash flow statement with consistent drivers.',
    highlights: [
      'EBITDA expanding 60 bps annually with disciplined opex control.',
      'Working capital absorbs near-term cash before reverting to historical levels.',
      'Leverage below 2.0x by FY3 with healthy cash conversion.'
    ],
    tables: [
      {
        title: 'Income Statement (USD in millions)',
        headers: ['Metric', 'FY1', 'FY2', 'FY3'],
        rows: [
          ['Revenue', 18240, 19170, 20115],
          ['Gross Profit', 10268, 10812, 11373],
          ['EBITDA', 4380, 4725, 5090],
          ['Net Income', 2155, 2320, 2495]
        ],
        footnote: 'FY1 corresponds to the first full fiscal year post-close.'
      },
      {
        title: 'Balance Sheet (USD in millions)',
        headers: ['Metric', 'FY1', 'FY2', 'FY3'],
        rows: [
          ['Cash', 820, 1045, 1310],
          ['Net Working Capital', 2180, 2245, 2290],
          ['PP&E', 6950, 7125, 7280],
          ['Net Debt', 4820, 3980, 3025]
        ]
      },
      {
        title: 'Cash Flow Walk (USD in millions)',
        headers: ['Metric', 'FY1', 'FY2', 'FY3'],
        rows: [
          ['Operating Cash Flow', 3245, 3510, 3795],
          ['Capex', -640, -665, -695],
          ['Free Cash Flow', 2605, 2845, 3100],
          ['Ending Cash', 820, 1045, 1310]
        ]
      }
    ]
  },
  dcf: {
    title: 'Discounted Cash Flow',
    description: 'Present value of projected cash flows using macro-consistent WACC and exit assumptions.',
    highlights: [
      'Mid-cycle WACC of 9.0% with conservative 2.5% terminal growth.',
      'PV of explicit period drives ~54% of valuation—limited reliance on terminal value.',
      'Equity value implies ~22% upside to last close.'
    ],
    tables: [
      {
        title: 'Free Cash Flow Summary (USD in millions)',
        headers: ['Year', 'FCF', 'Discount Factor', 'PV'],
        rows: [
          ['Year 1', 425, 0.92, 391],
          ['Year 2', 468, 0.84, 394],
          ['Year 3', 512, 0.77, 394],
          ['Year 4', 558, 0.71, 397],
          ['Year 5', 606, 0.65, 394]
        ]
      },
      {
        title: 'Valuation Bridge',
        headers: ['Metric', 'Amount'],
        rows: [
          ['PV of Explicit FCF', 1970],
          ['PV of Terminal Value', 1705],
          ['Enterprise Value', 3675],
          ['Less: Net Debt', 910],
          ['Equity Value', 2765]
        ],
        footnote: 'Terminal value computed using Gordon Growth with 2.5% terminal growth.'
      }
    ]
  },
  lbo: {
    title: 'Leveraged Buyout Summary',
    description: 'Debt schedule, deleveraging profile, and sponsor returns based on the underwritten case.',
    highlights: [
      'Entry leverage at 5.0x, de-levered to 2.2x by exit through cash generation.',
      'Mandatory amortization plus optional sweep retires 58% of debt in five years.',
      'Sponsor achieves 2.4x MOIC / 21% IRR assuming base-case exit multiple.'
    ],
    tables: [
      {
        title: 'Debt Roll-Forward (USD in millions)',
        headers: ['Year', 'Opening Debt', 'Mandatory', 'Optional', 'Ending Debt'],
        rows: [
          ['Year 1', 1250, 63, 140, 1047],
          ['Year 2', 1047, 52, 165, 830],
          ['Year 3', 830, 42, 185, 603],
          ['Year 4', 603, 30, 205, 368],
          ['Year 5', 368, 18, 225, 125]
        ]
      },
      {
        title: 'Returns Analysis',
        headers: ['Metric', 'Value'],
        rows: [
          ['Entry Enterprise Value', 2250],
          ['Exit Enterprise Value', 2600],
          ['Net Debt at Exit', 125],
          ['Equity Value to Sponsor', 2475],
          ['MOIC', 2.4],
          ['IRR', '21%']
        ]
      }
    ]
  },
  comps: {
    title: 'Trading Comps Snapshot',
    description: 'Peer benchmarks and implied valuation based on forward multiples.',
    highlights: [
      'Company trades at 8.3x EV/EBITDA vs. peer median 9.4x.',
      'Premium multiples supported by above-market growth and margin expansion.',
      'Median EV/Revenue implies ~15% upside to base case equity value.'
    ],
    tables: [
      {
        title: 'Peer Multiples',
        headers: ['Ticker', 'EV/Revenue', 'EV/EBITDA', 'P/E'],
        rows: [
          ['ACME', 3.9, 11.2, 21.4],
          ['GLOB', 4.1, 10.5, 19.8],
          ['NOVA', 3.5, 8.9, 17.6],
          ['VCTR', 3.7, 9.2, 18.4]
        ]
      },
      {
        title: 'Implied Valuation (USD in millions)',
        headers: ['Method', 'Enterprise Value', 'Equity Value', 'Price / Share'],
        rows: [
          ['EV/Revenue Median', 2480, 1825, 42.50],
          ['EV/EBITDA Median', 2550, 1895, 44.15],
          ['P/E Median', '-', 1950, 45.40]
        ]
      }
    ]
  }
};

const MODEL_LABELS: Record<string, string> = {
  'three-statement': 'Three-Statement Model',
  dcf: 'DCF Model',
  lbo: 'LBO Model',
  comps: 'Trading Comps Model'
};

export function ModelSummary({ modelType = 'three-statement', ticker }: ModelSummaryProps) {
  const normalizedType = MODEL_CONTENT[modelType] ? modelType : 'three-statement';
  const content = MODEL_CONTENT[normalizedType];
  const friendlyName = MODEL_LABELS[normalizedType] ?? 'Model';
  const formattedTicker = ticker ? ticker.toUpperCase() : 'Sample';

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-cb-blue">{APP_NAME} Model Viewer</p>
            <h2 className="text-2xl font-semibold text-cb-ink">
              {formattedTicker} — {friendlyName}
            </h2>
            <p className="text-sm text-cb-slate">{content.description}</p>
          </div>
        </div>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-cb-ink">
          {content.highlights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      {content.tables.map((table) => (
        <SummaryCard key={table.title} table={table} />
      ))}
    </div>
  );
}

function SummaryCard({ table }: { table: SummaryTable }) {
  return (
    <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-secondary">{table.title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-muted/40 text-secondary">
              {table.headers.map((header) => (
                <th key={header} className="px-3 py-2 text-left font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, idx) => (
              <tr key={`${table.title}-${idx}`} className="border-b border-border/60 last:border-0">
                {row.map((value, valueIdx) => (
                  <td key={`${table.title}-${idx}-${valueIdx}`} className="px-3 py-2 text-secondary">
                    {typeof value === 'number' && valueIdx > 0
                      ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
                      : value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.footnote && <p className="mt-3 text-xs text-muted-foreground">{table.footnote}</p>}
    </section>
  );
}

import { headers } from 'next/headers';
import { CompanyViewTracker } from '@/components/analytics/CompanyViewTracker';

type ScenarioDrivers = {
  revenueGrowth: number[];
  targetEbitdaMargin: number;
  marginRampYears: number;
  salesToCapital: number;
  terminalGrowth: number;
  discountRate: number;
};

type ScenarioForecast = {
  scenario: string;
  projections: Array<{
    year: number;
    revenue: number;
    ebitda: number;
    ebitdaMargin: number;
    freeCashFlow: number;
  }>;
};

type ScenarioValuation = {
  enterpriseValue: number;
  equityValue: number;
  valuePerShare: number;
  terminalValue: number;
  pvOfFcff: number;
};

type ScenarioComparison = {
  deltaEnterpriseValue: number;
  deltaEquityValue: number;
  deltaPerShare: number;
  driversImpactBreakdown: {
    revenueChangePct: number;
    marginExpansionPct: number;
    terminalGrowthPct: number;
  };
};

type ScenarioApiResponse = {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  baseline: {
    revenue_ltm: number;
    ebitda_ltm: number;
    net_income_ltm: number;
    cash: number;
    total_debt: number;
    shares_outstanding: number;
    ebitda_margin: number;
    net_margin: number;
    net_debt: number;
  };
  drivers: {
    base: ScenarioDrivers;
    bull: ScenarioDrivers;
    bear: ScenarioDrivers;
  };
  forecast: {
    base: ScenarioForecast;
    bull: ScenarioForecast;
    bear: ScenarioForecast;
  };
  valuation: {
    base: ScenarioValuation;
    bull: ScenarioValuation;
    bear: ScenarioValuation;
  };
  comparison: {
    bull: ScenarioComparison;
    bear: ScenarioComparison;
  };
};

function getBaseUrl(): string {
  const hdrs = headers();
  const host = hdrs.get('x-forwarded-host') || hdrs.get('host');
  const proto = hdrs.get('x-forwarded-proto') || 'https';
  if (!host) return '';
  return `${proto}://${host}`;
}

function formatCurrency(value: number, decimals: number = 0): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(value);
}

async function fetchScenario(ticker: string): Promise<ScenarioApiResponse | null> {
  const baseUrl = getBaseUrl();
  const url = baseUrl ? `${baseUrl}/api/scenario/${ticker}` : `/api/scenario/${ticker}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  const data = (await res.json()) as ScenarioApiResponse;
  return data;
}

export default async function ScenarioPage({
  params,
}: {
  params: { ticker: string };
}) {
  const ticker = params.ticker?.trim().toUpperCase();
  if (!ticker) {
    return (
      <div className="p-10">
        <div className="rounded-md border border-slate-200 bg-white p-6 text-slate-700">
          Scenario data unavailable.
        </div>
      </div>
    );
  }

  const data = await fetchScenario(ticker);
  if (!data) {
    return (
      <div className="p-10">
        <div className="rounded-md border border-slate-200 bg-white p-6 text-slate-700">
          No scenario data found for this ticker.
        </div>
      </div>
    );
  }

  const { company_name, sector, valuation, comparison, baseline } = data;

  return (
    <div className="p-8">
      <CompanyViewTracker ticker={ticker} />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          {company_name || ticker} — Scenario Analysis
        </h1>
        <p className="text-sm text-slate-500">
          {ticker} · {sector || 'Sector N/A'} · Revenue LTM {formatCurrency(baseline.revenue_ltm)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {(['base', 'bull', 'bear'] as const).map(key => {
          const label = key.charAt(0).toUpperCase() + key.slice(1);
          const val = valuation[key];
          return (
            <div key={key} className="rounded-md border border-slate-200 bg-white p-4">
              <div className="text-sm font-medium text-slate-500">{label} Case</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {formatCurrency(val.valuePerShare, 2)}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-y-2 text-sm text-slate-600">
                <div>Enterprise Value</div>
                <div className="text-right">{formatCurrency(val.enterpriseValue)}</div>
                <div>Equity Value</div>
                <div className="text-right">{formatCurrency(val.equityValue)}</div>
                <div>PV of FCFF</div>
                <div className="text-right">{formatCurrency(val.pvOfFcff)}</div>
                <div>Terminal Value</div>
                <div className="text-right">{formatCurrency(val.terminalValue)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-3 text-sm font-semibold text-slate-800">Comparison vs Base</div>
        <div className="overflow-hidden rounded-md border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Scenario</th>
                <th className="px-4 py-2 text-right font-medium">Δ Enterprise Value</th>
                <th className="px-4 py-2 text-right font-medium">Δ Equity Value</th>
                <th className="px-4 py-2 text-right font-medium">Δ Per Share</th>
                <th className="px-4 py-2 text-right font-medium">Revenue Impact</th>
                <th className="px-4 py-2 text-right font-medium">Margin Impact</th>
                <th className="px-4 py-2 text-right font-medium">Terminal Growth Impact</th>
              </tr>
            </thead>
            <tbody>
              {(['bull', 'bear'] as const).map(key => {
                const comp = comparison[key];
                return (
                  <tr key={key} className="border-t border-slate-200">
                    <td className="px-4 py-2 font-medium text-slate-800">
                      {key === 'bull' ? 'Bull' : 'Bear'}
                    </td>
                    <td className="px-4 py-2 text-right">{formatCurrency(comp.deltaEnterpriseValue)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(comp.deltaEquityValue)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(comp.deltaPerShare, 2)}</td>
                    <td className="px-4 py-2 text-right">
                      {formatPercent(comp.driversImpactBreakdown.revenueChangePct)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatPercent(comp.driversImpactBreakdown.marginExpansionPct)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatPercent(comp.driversImpactBreakdown.terminalGrowthPct)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-slate-200">
                <td className="px-4 py-2 text-slate-500">Shares Outstanding (mm)</td>
                <td className="px-4 py-2 text-right text-slate-600" colSpan={6}>
                  {formatNumber(baseline.shares_outstanding)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

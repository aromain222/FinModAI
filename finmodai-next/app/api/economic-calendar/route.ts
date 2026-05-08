import { NextResponse } from 'next/server';
import { MACRO_CALENDAR, type CalendarEventType } from '@/lib/macroCalendar';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type FmpEconomicEntry = {
  event:    string;
  date:     string;
  country:  string;
  actual:   number | null;
  previous: number | null;
  estimate: number | null;
  change:   number | null;
  impact:   string;
  unit?:    string;
};

export type CalendarActual = {
  actual: string;
  estimate: string | null;
  surpriseNum: number | null;
  source?: 'fmp' | 'bls' | 'fred';
  sourceLabel?: string;
  asOf?: string;
};

export type EconomicCalendarResponse = {
  actuals: Record<string, CalendarActual>;
};

// Priority-ordered keywords per event type — first match wins
const TYPE_KEYWORDS: Record<CalendarEventType, string[]> = {
  FOMC: ['fed funds rate', 'fomc', 'federal funds'],
  NFP:  ['nonfarm payrolls', 'non farm payrolls', 'non-farm payrolls', 'payrolls'],
  CPI:  ['core cpi', 'cpi m/m', 'cpi y/y', 'consumer price index'],
  PCE:  ['core pce', 'pce price index', 'personal consumption expenditure'],
  GDP:  ['gdp q/q', 'gdp growth', 'gross domestic product'],
  ECB:  ['main refinancing rate', 'ecb rate', 'ecb deposit'],
  BOJ:  ['boj interest rate', 'bank of japan rate', 'overnight call rate'],
};

// Non-US events we still want to match (ECB → EU, BOJ → JP)
const TYPE_COUNTRY: Partial<Record<CalendarEventType, string>> = {
  ECB: 'EU',
  BOJ: 'JP',
};

function matchesToType(fmpEvent: FmpEconomicEntry, type: CalendarEventType): boolean {
  const lower = fmpEvent.event.toLowerCase();
  const matched = TYPE_KEYWORDS[type].some(kw => lower.includes(kw));
  if (!matched) return false;
  const expectedCountry = TYPE_COUNTRY[type];
  if (expectedCountry) return fmpEvent.country === expectedCountry || fmpEvent.country === 'EU';
  return fmpEvent.country === 'US';
}

function formatActualStr(value: number, type: CalendarEventType, unit?: string): string {
  if (type === 'FOMC' || type === 'ECB' || type === 'BOJ') {
    return `${value.toFixed(2)}%`;
  }
  if (type === 'NFP') {
    const rounded = Math.round(value);
    return unit === 'K' || Math.abs(rounded) > 10 ? `${rounded}K` : `${value.toFixed(1)}%`;
  }
  if (type === 'CPI' || type === 'PCE' || type === 'GDP') {
    return `${value.toFixed(1)}%`;
  }
  return unit ? `${value}${unit}` : String(value);
}

function formatEstimateStr(value: number | null, type: CalendarEventType, unit?: string): string | null {
  if (value === null) return null;
  return formatActualStr(value, type, unit);
}

function sourcedActual(
  value: Omit<CalendarActual, 'source' | 'sourceLabel' | 'asOf'>,
  source: NonNullable<CalendarActual['source']>,
  sourceLabel: string,
): CalendarActual {
  return { ...value, source, sourceLabel, asOf: new Date().toISOString() };
}

// ---- Scraping fallback (BLS public API + FRED CSV, no key required) ----

type RawBLS  = Array<{ year: string; period: string; value: string }>;
type RawFRED = Array<{ date: string; value: number }>;

async function fetchBLS(seriesId: string): Promise<RawBLS> {
  try {
    const res = await fetch(
      `https://api.bls.gov/publicAPI/v1/timeseries/data/${seriesId}`,
      { signal: AbortSignal.timeout(7000), cache: 'no-store' },
    );
    if (!res.ok) return [];
    type Payload = { Results?: { series?: Array<{ data?: RawBLS }> } };
    const json = (await res.json()) as Payload;
    return json?.Results?.series?.[0]?.data ?? [];
  } catch { return []; }
}

async function fetchFREDCsv(seriesId: string): Promise<RawFRED> {
  try {
    const res = await fetch(
      `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`,
      { signal: AbortSignal.timeout(7000), cache: 'no-store' },
    );
    if (!res.ok) return [];
    const text = await res.text();
    return text
      .split('\n')
      .slice(1) // skip header row
      .flatMap(line => {
        const [date, raw] = line.trim().split(',');
        const value = parseFloat(raw ?? '');
        return date && !isNaN(value) ? [{ date, value }] : [];
      });
  } catch { return []; }
}

function blsSorted(data: RawBLS): RawBLS {
  return [...data].sort((a, b) =>
    `${a.year}${a.period}`.localeCompare(`${b.year}${b.period}`)
  );
}

// NFP/CPI/PCE release the prior month's data — return that month's year+period
function priorMonthPeriod(dateStr: string): { year: string; period: string } {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return {
    year:   String(d.getUTCFullYear()),
    period: `M${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
  };
}

function resolveFOMC(data: RawFRED, dateStr: string): CalendarActual | null {
  // DFEDTARU: Fed funds target upper bound — changes only on FOMC decision dates
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const obs = sorted.filter(d => d.date <= dateStr).pop();
  if (!obs) return null;
  return sourcedActual(
    { actual: `${obs.value.toFixed(2)}%`, estimate: null, surpriseNum: null },
    'fred',
    'FRED fed target upper bound',
  );
}

function resolveNFP(data: RawBLS, dateStr: string): CalendarActual | null {
  // CES0000000001: total nonfarm level in thousands — M/M change = the NFP print
  const { year, period } = priorMonthPeriod(dateStr);
  const sorted = blsSorted(data);
  const idx = sorted.findIndex(d => d.year === year && d.period === period);
  if (idx < 1) return null;
  const diff = Math.round(parseFloat(sorted[idx]!.value) - parseFloat(sorted[idx - 1]!.value));
  if (isNaN(diff)) return null;
  return sourcedActual(
    { actual: `${diff}K`, estimate: null, surpriseNum: null },
    'bls',
    'BLS nonfarm payrolls',
  );
}

function resolveCPI(data: RawBLS, dateStr: string): CalendarActual | null {
  // CUSR0000SA0L1E: Core CPI-U SA — compute M/M %
  const { year, period } = priorMonthPeriod(dateStr);
  const sorted = blsSorted(data);
  const idx = sorted.findIndex(d => d.year === year && d.period === period);
  if (idx < 1) return null;
  const current  = parseFloat(sorted[idx]!.value);
  const previous = parseFloat(sorted[idx - 1]!.value);
  if (isNaN(current) || isNaN(previous) || previous === 0) return null;
  return sourcedActual(
    { actual: `${(((current - previous) / previous) * 100).toFixed(1)}%`, estimate: null, surpriseNum: null },
    'bls',
    'BLS core CPI',
  );
}

function resolvePCE(data: RawFRED, dateStr: string): CalendarActual | null {
  // PCEPILFE: PCE ex-food & energy — monthly level, released with 1-month lag
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const dataMonth = d.toISOString().slice(0, 7); // YYYY-MM
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const idx = sorted.findIndex(s => s.date.startsWith(dataMonth));
  if (idx < 1) return null;
  const current  = sorted[idx]!.value;
  const previous = sorted[idx - 1]!.value;
  if (previous === 0) return null;
  return sourcedActual(
    { actual: `${(((current - previous) / previous) * 100).toFixed(1)}%`, estimate: null, surpriseNum: null },
    'fred',
    'FRED core PCE',
  );
}

function resolveGDP(data: RawFRED, dateStr: string): CalendarActual | null {
  // A191RL1Q225SBEA: Real GDP % change SAAR — already a percentage
  // FRED dates at quarter start: Q1=Jan-01, Q2=Apr-01, Q3=Jul-01, Q4=Oct-01
  // Advance release timing: Apr → Q1, Jul → Q2, Oct → Q3, Jan → Q4 of prev year
  const releaseMonth = parseInt(dateStr.slice(5, 7));
  const releaseYear  = parseInt(dateStr.slice(0, 4));
  let qStartMonth: number;
  let qStartYear = releaseYear;
  if      (releaseMonth <= 3)  { qStartMonth = 10; qStartYear = releaseYear - 1; }
  else if (releaseMonth <= 6)  { qStartMonth = 1; }
  else if (releaseMonth <= 9)  { qStartMonth = 4; }
  else                          { qStartMonth = 7; }
  const targetDate = `${qStartYear}-${String(qStartMonth).padStart(2, '0')}-01`;
  const obs = data.find(d => d.date === targetDate);
  if (!obs) return null;
  return sourcedActual(
    { actual: `${obs.value.toFixed(1)}%`, estimate: null, surpriseNum: null },
    'fred',
    'FRED real GDP',
  );
}

export async function GET() {
  const apiKey = process.env.FMP_API_KEY;

  const dates = [...MACRO_CALENDAR].map(e => e.date).sort();
  const from  = dates[0] ?? '2026-04-01';
  const to    = dates[dates.length - 1] ?? '2026-09-30';

  // --- Pass 1: FMP (if key available) ---
  let fmpData: FmpEconomicEntry[] = [];
  if (apiKey) {
    try {
      const url = `https://financialmodelingprep.com/api/v3/economic_calendar?from=${from}&to=${to}&apikey=${apiKey}`;
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const raw = (await res.json()) as unknown;
        fmpData = Array.isArray(raw) ? (raw as FmpEconomicEntry[]) : [];
      }
    } catch { /* degrade gracefully */ }
  }

  const actuals: Record<string, CalendarActual> = {};

  for (const entry of MACRO_CALENDAR) {
    const candidates = fmpData.filter(fmp => {
      const fmpDate = fmp.date.slice(0, 10);
      return fmpDate === entry.date && fmp.actual !== null && matchesToType(fmp, entry.type);
    });
    if (candidates.length === 0) continue;

    const keywords = TYPE_KEYWORDS[entry.type];
    const sorted   = candidates.sort((a, b) => {
      const ai = keywords.findIndex(kw => a.event.toLowerCase().includes(kw));
      const bi = keywords.findIndex(kw => b.event.toLowerCase().includes(kw));
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    const fmp = sorted[0]!;
    if (fmp.actual === null) continue;

    const actualStr   = formatActualStr(fmp.actual, entry.type, fmp.unit);
    const estimateStr = formatEstimateStr(fmp.estimate, entry.type, fmp.unit);
    const surpriseNum = fmp.estimate !== null ? fmp.actual - fmp.estimate : null;

    actuals[entry.id] = sourcedActual(
      { actual: actualStr, estimate: estimateStr, surpriseNum },
      'fmp',
      'FMP economic calendar',
    );
  }

  // --- Pass 2: Scraping fallback for past events FMP didn't cover ---
  const today       = new Date().toISOString().slice(0, 10);
  const missingPast = MACRO_CALENDAR.filter(e => !actuals[e.id] && e.date < today);

  if (missingPast.length > 0) {
    const needed = new Set(missingPast.map(e => e.type));

    const [rNFP, rCPI, rFOMC, rPCE, rGDP] = await Promise.allSettled([
      needed.has('NFP')  ? fetchBLS('CES0000000001')        : Promise.resolve([] as RawBLS),
      needed.has('CPI')  ? fetchBLS('CUSR0000SA0L1E')       : Promise.resolve([] as RawBLS),
      needed.has('FOMC') ? fetchFREDCsv('DFEDTARU')         : Promise.resolve([] as RawFRED),
      needed.has('PCE')  ? fetchFREDCsv('PCEPILFE')         : Promise.resolve([] as RawFRED),
      needed.has('GDP')  ? fetchFREDCsv('A191RL1Q225SBEA')  : Promise.resolve([] as RawFRED),
    ]);

    const nfpData  = rNFP.status  === 'fulfilled' ? rNFP.value  : ([] as RawBLS);
    const cpiData  = rCPI.status  === 'fulfilled' ? rCPI.value  : ([] as RawBLS);
    const fomcData = rFOMC.status === 'fulfilled' ? rFOMC.value : ([] as RawFRED);
    const pceData  = rPCE.status  === 'fulfilled' ? rPCE.value  : ([] as RawFRED);
    const gdpData  = rGDP.status  === 'fulfilled' ? rGDP.value  : ([] as RawFRED);

    for (const entry of missingPast) {
      let result: CalendarActual | null = null;
      if      (entry.type === 'FOMC') result = resolveFOMC(fomcData, entry.date);
      else if (entry.type === 'NFP')  result = resolveNFP(nfpData,   entry.date);
      else if (entry.type === 'CPI')  result = resolveCPI(cpiData,   entry.date);
      else if (entry.type === 'PCE')  result = resolvePCE(pceData,   entry.date);
      else if (entry.type === 'GDP')  result = resolveGDP(gdpData,   entry.date);
      if (result) actuals[entry.id] = result;
    }
  }

  return NextResponse.json<EconomicCalendarResponse>(
    { actuals },
    { headers: { 'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600' } },
  );
}

export type CalendarEventImportance = 'high' | 'medium' | 'low';
export type CalendarEventType = 'FOMC' | 'NFP' | 'CPI' | 'PCE' | 'GDP' | 'ECB' | 'BOJ';

export interface MacroCalendarEntry {
  id: string;
  date: string;
  event: string;
  type: CalendarEventType;
  actual?: string | null;
  prior: string | null;
  forecast: string | null;
  importance: CalendarEventImportance;
  notes?: string;
}

export const MACRO_CALENDAR: MacroCalendarEntry[] = [
  { id: 'fomc-apr26',  date: '2026-04-30', event: 'FOMC Decision',       type: 'FOMC', prior: '4.25–4.50%', forecast: 'Hold',   importance: 'high',   notes: 'Press conference follows' },
  { id: 'pce-apr26',   date: '2026-04-30', event: 'PCE (Mar)',            type: 'PCE',  prior: null,          forecast: null,     importance: 'high' },
  { id: 'gdp-q1-26',   date: '2026-04-30', event: 'GDP Advance (Q1)',     type: 'GDP',  prior: null,          forecast: null,     importance: 'high' },
  { id: 'nfp-may26',   date: '2026-05-01', event: 'Nonfarm Payrolls',     type: 'NFP',  prior: null,          forecast: null,     importance: 'high' },
  { id: 'boj-may26',   date: '2026-05-01', event: 'BOJ Policy Decision',  type: 'BOJ',  prior: null,          forecast: null,     importance: 'medium' },
  { id: 'cpi-may26',   date: '2026-05-13', event: 'CPI (Apr)',            type: 'CPI',  prior: null,          forecast: null,     importance: 'high' },
  { id: 'pce-may26',   date: '2026-05-29', event: 'PCE (Apr)',            type: 'PCE',  prior: null,          forecast: null,     importance: 'high' },
  { id: 'nfp-jun26',   date: '2026-06-05', event: 'Nonfarm Payrolls',     type: 'NFP',  prior: null,          forecast: null,     importance: 'high' },
  { id: 'ecb-jun26',   date: '2026-06-05', event: 'ECB Rate Decision',    type: 'ECB',  prior: null,          forecast: null,     importance: 'medium' },
  { id: 'cpi-jun26',   date: '2026-06-10', event: 'CPI (May)',            type: 'CPI',  prior: null,          forecast: null,     importance: 'high' },
  { id: 'boj-jun26',   date: '2026-06-17', event: 'BOJ Policy Decision',  type: 'BOJ',  prior: null,          forecast: null,     importance: 'medium' },
  { id: 'fomc-jun26',  date: '2026-06-18', event: 'FOMC Decision',        type: 'FOMC', prior: null,          forecast: null,     importance: 'high',   notes: 'SEP + dot plot released' },
  { id: 'pce-jun26',   date: '2026-06-26', event: 'PCE (May)',            type: 'PCE',  prior: null,          forecast: null,     importance: 'high' },
  { id: 'nfp-jul26',   date: '2026-07-10', event: 'Nonfarm Payrolls',     type: 'NFP',  prior: null,          forecast: null,     importance: 'high' },
  { id: 'cpi-jul26',   date: '2026-07-15', event: 'CPI (Jun)',            type: 'CPI',  prior: null,          forecast: null,     importance: 'high' },
  { id: 'ecb-jul26',   date: '2026-07-24', event: 'ECB Rate Decision',    type: 'ECB',  prior: null,          forecast: null,     importance: 'medium' },
  { id: 'fomc-jul26',  date: '2026-07-30', event: 'FOMC Decision',        type: 'FOMC', prior: null,          forecast: null,     importance: 'high' },
  { id: 'gdp-q2-26',   date: '2026-07-30', event: 'GDP Advance (Q2)',     type: 'GDP',  prior: null,          forecast: null,     importance: 'high' },
  { id: 'boj-jul26',   date: '2026-07-31', event: 'BOJ Policy Decision',  type: 'BOJ',  prior: null,          forecast: null,     importance: 'medium' },
  { id: 'nfp-aug26',   date: '2026-08-07', event: 'Nonfarm Payrolls',     type: 'NFP',  prior: null,          forecast: null,     importance: 'high' },
  { id: 'cpi-aug26',   date: '2026-08-12', event: 'CPI (Jul)',            type: 'CPI',  prior: null,          forecast: null,     importance: 'high' },
  { id: 'ecb-sep26',   date: '2026-09-11', event: 'ECB Rate Decision',    type: 'ECB',  prior: null,          forecast: null,     importance: 'medium' },
  { id: 'fomc-sep26',  date: '2026-09-17', event: 'FOMC Decision',        type: 'FOMC', prior: null,          forecast: null,     importance: 'high',   notes: 'SEP + dot plot released' },
];

export function getUpcomingEntries(from: Date, days = 7): MacroCalendarEntry[] {
  const to = new Date(from.getTime() + days * 86_400_000);
  return MACRO_CALENDAR.filter((entry) => {
    const d = new Date(entry.date + 'T12:00:00');
    return d >= from && d <= to;
  });
}

export function isPastEntry(entry: MacroCalendarEntry, now: Date): boolean {
  return new Date(entry.date + 'T12:00:00') < now;
}

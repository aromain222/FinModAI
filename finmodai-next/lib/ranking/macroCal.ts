// Upcoming macro dates — 2026 schedule
// Update quarterly when Fed/BLS releases new calendars.

export type MacroEvent = {
  date: string; // ISO date string
  name: string;
  abbr: string;
  channel: 'estimate' | 'multiple' | 'macro' | 'risk';
  description: string;
  sectors: string[]; // empty = affects all
};

const MACRO_EVENTS: MacroEvent[] = [
  // May 2026
  { date: '2026-05-15', name: 'Producer Price Index (PPI)',    abbr: 'PPI',        channel: 'estimate', description: 'Input cost read-through for margins.', sectors: [] },
  { date: '2026-05-22', name: 'Fed Minutes (May FOMC)',        abbr: 'Fed Minutes', channel: 'multiple', description: 'Policy tone signals rate path expectations.', sectors: [] },
  { date: '2026-05-28', name: 'GDP Second Estimate (Q1)',      abbr: 'GDP',         channel: 'macro',    description: 'Confirms or revises Q1 growth picture.', sectors: [] },
  // June 2026
  { date: '2026-06-05', name: 'Jobs Report (May)',             abbr: 'NFP',         channel: 'macro',    description: 'Labor market read guides Fed policy path.', sectors: [] },
  { date: '2026-06-11', name: 'Consumer Price Index (CPI)',    abbr: 'CPI',         channel: 'multiple', description: 'Inflation print moves rate expectations and multiples.', sectors: [] },
  { date: '2026-06-12', name: 'Producer Price Index (PPI)',    abbr: 'PPI',         channel: 'estimate', description: 'Input cost signal for margin guidance.', sectors: [] },
  { date: '2026-06-18', name: 'FOMC Rate Decision',            abbr: 'FOMC',        channel: 'multiple', description: 'Rate decision + dot plot reshapes discount rate.', sectors: [] },
  { date: '2026-06-25', name: 'GDP Final Estimate (Q1)',       abbr: 'GDP Final',   channel: 'macro',    description: 'Final Q1 read; sets macro narrative for summer.', sectors: [] },
  // July 2026
  { date: '2026-07-02', name: 'Jobs Report (June)',            abbr: 'NFP',         channel: 'macro',    description: 'Labor market read guides Fed policy path.', sectors: [] },
  { date: '2026-07-15', name: 'Consumer Price Index (CPI)',    abbr: 'CPI',         channel: 'multiple', description: 'Inflation print moves rate expectations and multiples.', sectors: [] },
  { date: '2026-07-30', name: 'FOMC Rate Decision',            abbr: 'FOMC',        channel: 'multiple', description: 'Rate decision + press conference.', sectors: [] },
  // Aug 2026
  { date: '2026-08-07', name: 'Jobs Report (July)',            abbr: 'NFP',         channel: 'macro',    description: 'Labor market read guides Fed policy path.', sectors: [] },
  { date: '2026-08-12', name: 'Consumer Price Index (CPI)',    abbr: 'CPI',         channel: 'multiple', description: 'Inflation print moves rate expectations and multiples.', sectors: [] },
  { date: '2026-08-26', name: 'Jackson Hole Symposium',        abbr: 'Jackson Hole',channel: 'multiple', description: 'Fed chair speech can reprice rate expectations globally.', sectors: [] },
  // Sep 2026
  { date: '2026-09-05', name: 'Jobs Report (Aug)',             abbr: 'NFP',         channel: 'macro',    description: 'Labor market read guides Fed policy path.', sectors: [] },
  { date: '2026-09-10', name: 'Consumer Price Index (CPI)',    abbr: 'CPI',         channel: 'multiple', description: 'Inflation print ahead of FOMC.', sectors: [] },
  { date: '2026-09-17', name: 'FOMC Rate Decision',            abbr: 'FOMC',        channel: 'multiple', description: 'Rate decision + updated dot plot and economic projections.', sectors: [] },
];

export function getUpcomingMacroEvents(daysAhead = 45): MacroEvent[] {
  const now     = new Date();
  const cutoff  = new Date(now.getTime() + daysAhead * 86_400_000);
  return MACRO_EVENTS.filter(e => {
    const d = new Date(e.date + 'T00:00:00');
    return d >= now && d <= cutoff;
  });
}

export function daysUntil(isoDate: string): number {
  const now   = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(isoDate + 'T00:00:00');
  return Math.round((target.getTime() - now.getTime()) / 86_400_000);
}

export function fmtEventDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
  });
}

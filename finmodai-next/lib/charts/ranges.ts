import { startOfYear, subDays, subMonths, subWeeks, subYears } from 'date-fns';

export type RangeKey = '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y';
export type RangeInterval = '5m' | '15m' | '1h' | '1d';

export function getRangeWindow(range: RangeKey): {
  startISO: string;
  endISO: string;
  interval: RangeInterval;
} {
  const end = new Date();
  let start: Date;
  let interval: RangeInterval;

  switch (range) {
    case '1D':
      start = subDays(end, 1);
      interval = '5m';
      break;
    case '1W':
      start = subWeeks(end, 1);
      interval = '15m';
      break;
    case '1M':
      start = subMonths(end, 1);
      interval = '1h';
      break;
    case '3M':
      start = subMonths(end, 3);
      interval = '1d';
      break;
    case 'YTD':
      start = startOfYear(end);
      interval = '1d';
      break;
    case '1Y':
    default:
      start = subYears(end, 1);
      interval = '1d';
      break;
  }

  return {
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    interval,
  };
}

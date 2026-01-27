import { subDays, subMonths, subYears } from 'date-fns';

export function toDateRange(range: '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y') {
  const to = new Date();
  let from = subMonths(to, 1);
  let multiplier = 1;
  let timespan = 'day';
  let interval: '1d' | '1w' | '1m' | '3m' | '1y' | '5y' = '1m';

  switch (range) {
    case '1D':
      from = subDays(to, 1);
      multiplier = 5;
      timespan = 'minute';
      interval = '1d';
      break;
    case '1W':
      from = subDays(to, 7);
      multiplier = 30;
      timespan = 'minute';
      interval = '1w';
      break;
    case '1M':
      from = subMonths(to, 1);
      multiplier = 1;
      timespan = 'day';
      interval = '1m';
      break;
    case '3M':
      from = subMonths(to, 3);
      multiplier = 1;
      timespan = 'day';
      interval = '3m';
      break;
    case '1Y':
      from = subYears(to, 1);
      multiplier = 1;
      timespan = 'day';
      interval = '1y';
      break;
    case '5Y':
      from = subYears(to, 5);
      multiplier = 1;
      timespan = 'week';
      interval = '5y';
      break;
    default:
      break;
  }

  return { from, to, multiplier, timespan, interval };
}

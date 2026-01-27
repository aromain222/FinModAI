/**
 * Deterministic Templates for Macro IQ Events
 * Consistent output for each event type
 */

import type { MacroIQCard } from './types';

export type EventType = 'CPI_PRINT' | 'JOBS_REPORT' | 'FOMC_UPDATE' | 'OIL_SHOCK' | 'GEOPOLITICS';

export type MarketMoves = {
  spy1d?: number | null;
  spy1w?: number | null;
  tlt1d?: number | null;
  hyg1d?: number | null;
  uup1d?: number | null;
  gld1d?: number | null;
  wti1d?: number | null;
};

export type TemplateInputs = {
  // CPI_PRINT
  cpiValue?: number | null;
  cpiDate?: string | null;
  cpiDirection?: 'up' | 'down' | 'stable';
  
  // JOBS_REPORT
  unemploymentRate?: number | null;
  jobsDate?: string | null;
  jobsDirection?: 'up' | 'down' | 'stable';
  
  // FOMC_UPDATE
  fedFundsRate?: number | null;
  fomcDate?: string | null;
  fomcDirection?: 'hike' | 'cut' | 'hold';
  
  // OIL_SHOCK
  oilPrice?: number | null;
  oilDate?: string | null;
  oilDirection?: 'up' | 'down' | 'stable';
  
  // GEOPOLITICS
  headline?: string;
  headlineDate?: string | null;
  
  // Market context
  spyMove?: number | null; // % change
  marketMoves?: MarketMoves;
  marketContext?: string;
  
  // Data availability
  hasNews?: boolean;
  hasMacro?: boolean;
  hasPrices?: boolean;
};

const SECTOR_LABELS: Record<string, string> = {
  XLE: 'Energy',
  XLF: 'Financials',
  XLK: 'Technology',
  XLY: 'Consumer Discretionary',
  XLP: 'Consumer Staples',
  XLV: 'Healthcare',
  XLU: 'Utilities',
  XLRE: 'Real Estate',
  XLI: 'Industrials',
  XLB: 'Materials',
  XLC: 'Communication Services',
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const formatPct = (value: number) => {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

const formatSector = (ticker: string) => (SECTOR_LABELS[ticker] ? `${SECTOR_LABELS[ticker]} (${ticker})` : ticker);

const toOneSentence = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed.length) return '';
  return trimmed.endsWith('.') ? trimmed : `${trimmed}.`;
};

const joinAsSentence = (items: string[]) => {
  const cleaned = items.map((item) => item.replace(/\.+$/, '').trim()).filter(Boolean);
  if (cleaned.length === 0) return '';
  if (cleaned.length === 1) return toOneSentence(cleaned[0]);
  if (cleaned.length === 2) return toOneSentence(`${cleaned[0]} and ${cleaned[1]}`);
  return toOneSentence(`${cleaned[0]}, ${cleaned[1]}, and ${cleaned[2]}`);
};

const marketReaction = (inputs: TemplateInputs, rows: Array<{ label: string; value: number | null | undefined; window: string }>) => {
  const bullets = rows
    .map((row) => (isFiniteNumber(row.value) ? `${row.label} ${formatPct(row.value)} (${row.window})` : null))
    .filter((line): line is string => Boolean(line));

  if (bullets.length) return bullets;
  if (isFiniteNumber(inputs.spyMove)) return [`SPY ${formatPct(inputs.spyMove)} (1W)`];
  return [];
};

const buildInvestorBrief = (params: {
  title: string;
  whatHappened: string;
  marketReactionBullets: string[];
  transmission: { rates: string; equities: string; credit: string; fxCommodities?: string };
  winners: { sectors: string[]; tickers: string[] };
  losers: { sectors: string[]; tickers: string[] };
  whatToWatchSentence: string;
}) => {
  const lines: string[] = [];
  lines.push(params.title);
  lines.push('');
  lines.push('What happened:');
  lines.push(`- ${toOneSentence(params.whatHappened).replace(/\.$/, '')}.`);
  lines.push('');
  lines.push('Market reaction:');
  if (params.marketReactionBullets.length) {
    for (const bullet of params.marketReactionBullets) lines.push(`- ${bullet}`);
  } else {
    lines.push('- Market impact limited — data largely in line with expectations.');
  }
  lines.push('');
  lines.push('Transmission:');
  lines.push(`- Rates: ${toOneSentence(params.transmission.rates).replace(/\.$/, '')}.`);
  lines.push(`- Equities: ${toOneSentence(params.transmission.equities).replace(/\.$/, '')}.`);
  lines.push(`- Credit: ${toOneSentence(params.transmission.credit).replace(/\.$/, '')}.`);
  if (params.transmission.fxCommodities) {
    lines.push(`- FX/Commodities: ${toOneSentence(params.transmission.fxCommodities).replace(/\.$/, '')}.`);
  }
  lines.push('');
  lines.push('Winners / Losers:');
  lines.push(
    `- Winners: ${params.winners.sectors.map(formatSector).join(', ')}; Tickers: ${params.winners.tickers.join(', ')}.`
  );
  lines.push(`- Losers: ${params.losers.sectors.map(formatSector).join(', ')}; Tickers: ${params.losers.tickers.join(', ')}.`);
  lines.push('');
  lines.push('What to watch next:');
  lines.push(`- ${toOneSentence(params.whatToWatchSentence).replace(/\.$/, '')}.`);
  return lines.join('\n');
};

/**
 * Render CPI Print event
 */
export function renderCPIEvent(inputs: TemplateInputs, eventId: string): MacroIQCard {
  const cpiValue = inputs.cpiValue;
  const direction = inputs.cpiDirection || (cpiValue != null && cpiValue > 3 ? 'up' : cpiValue != null && cpiValue < 2 ? 'down' : 'stable');
  const hasData = cpiValue != null;
  
  const title = hasData
    ? direction === 'down'
      ? `U.S. CPI: Inflation closer to target (${cpiValue.toFixed(1)}% YoY)`
      : direction === 'up'
      ? `U.S. CPI: Inflation remains elevated (${cpiValue.toFixed(1)}% YoY)`
      : `U.S. CPI: Inflation still above target (${cpiValue.toFixed(1)}% YoY)`
    : 'U.S. CPI: Inflation data unavailable';

  const whatHappened = hasData
    ? cpiValue < 2.1
      ? `U.S. CPI is running at ${cpiValue.toFixed(1)}% YoY, roughly in line with the Fed’s 2% target.`
      : `U.S. CPI is running at ${cpiValue.toFixed(1)}% YoY, keeping inflation above the Fed’s 2% target.`
    : 'Inflation data was not available in the current snapshot.';

  const coreTake = hasData
    ? `${whatHappened} The key question for markets is whether disinflation broadens enough to pull forward rate cuts.`
    : `${whatHappened} Without the print, markets trade the rate path off other inflation signals and Fed communication.`;

  const moves = inputs.marketMoves;
  const marketReactionBullets = marketReaction(inputs, [
    { label: 'SPY', value: moves?.spy1d ?? null, window: '1D' },
    { label: 'TLT', value: moves?.tlt1d ?? null, window: '1D' },
    { label: 'HYG', value: moves?.hyg1d ?? null, window: '1D' },
    { label: 'UUP', value: moves?.uup1d ?? null, window: '1D' },
  ]);

  const transmission = {
    rates:
      direction === 'up'
        ? 'Front-end yields reprice a higher-for-longer path; real yields tend to rise as cuts get pushed out'
        : direction === 'down'
        ? 'Lower inflation pressure lets the front-end price earlier cuts; duration rallies when real yields fall'
        : 'Rates trade the distribution around the policy path; the front-end stays sensitive to services inflation',
    equities:
      direction === 'up'
        ? 'Higher real yields compress duration; growth/tech (QQQ, XLK) typically lags while value/financials (XLF) hold up'
        : direction === 'down'
        ? 'Lower real yields support duration; growth/tech (QQQ, XLK) tends to lead while defensives lag'
        : 'Equity leadership is driven by real yields and earnings; watch growth vs value factor moves',
    credit:
      direction === 'up'
        ? 'Tighter financial conditions widen HY spreads first; watch HYG vs LQD and refinancing-sensitive issuers'
        : direction === 'down'
        ? 'Easier rate expectations help spreads tighten; HY outperforms if growth stays intact'
        : 'Credit tends to follow equity beta; spreads stay anchored unless growth deteriorates',
    fxCommodities:
      direction === 'up'
        ? 'USD strength can build on carry; gold (GLD) often softens as real yields rise'
        : direction === 'down'
        ? 'USD carry eases; gold (GLD) can benefit if real yields fall'
        : 'FX tracks rate differentials; gold trades real yields more than CPI headlines',
  } satisfies NonNullable<Parameters<typeof buildInvestorBrief>[0]>['transmission'];

  const sectors =
    direction === 'up'
      ? { winners: ['XLE', 'XLF', 'XLI'] as const, losers: ['XLK', 'XLY', 'XLU'] as const }
      : direction === 'down'
      ? { winners: ['XLK', 'XLY', 'XLRE'] as const, losers: ['XLE', 'XLF', 'XLB'] as const }
      : { winners: ['XLF', 'XLE', 'XLV'] as const, losers: ['XLK', 'XLY', 'XLU'] as const };

  const tickersToWatch =
    direction === 'up'
      ? { winners: ['XLF', 'XLE', 'UUP'] as const, losers: ['QQQ', 'TLT', 'GLD'] as const }
      : direction === 'down'
      ? { winners: ['QQQ', 'TLT', 'HYG'] as const, losers: ['XLE', 'UUP', 'XLF'] as const }
      : { winners: ['SPY', 'TLT', 'HYG'] as const, losers: ['QQQ', 'XLY', 'XLU'] as const };

  const whatToWatch = [
    'Core services inflation and wage pressure',
    'Fed guidance on cuts vs higher-for-longer',
    'Real yields and credit spreads (HYG/LQD)',
  ];

  const investorBrief = buildInvestorBrief({
    title,
    whatHappened,
    marketReactionBullets,
    transmission,
    winners: { sectors: [...sectors.winners], tickers: [...tickersToWatch.winners] },
    losers: { sectors: [...sectors.losers], tickers: [...tickersToWatch.losers] },
    whatToWatchSentence: `Next: ${joinAsSentence(whatToWatch)}`,
  });
  
  return {
    id: eventId,
    eventType: 'CPI_PRINT',
    title,
    tag: 'Inflation',
    investorBrief,
    coreTake,
    marketTransmission: {
      bullets: [
        `Rates: ${transmission.rates}`,
        `Equities: ${transmission.equities}`,
        `Credit: ${transmission.credit}`,
        `FX/Commodities: ${transmission.fxCommodities}`,
      ],
    },
    sectors: { winners: [...sectors.winners], losers: [...sectors.losers] },
    tickersToWatch: { winners: [...tickersToWatch.winners], losers: [...tickersToWatch.losers] },
    scenarios: [
      {
        name: 'Base Case',
        prob: 60,
        impact:
          direction === 'up'
            ? 'Inflation stays sticky; front-end stays high; growth underperforms value and HY spreads drift wider.'
            : direction === 'down'
            ? 'Disinflation continues; duration rallies; growth leads and spreads tighten.'
            : 'Inflation progress stalls; markets chop with real yields as the primary driver.',
      },
      {
        name: 'Upside',
        prob: 20,
        impact:
          direction === 'up'
            ? 'A second inflation impulse forces repricing of the terminal path; equities de-rate and credit weakens.'
            : direction === 'down'
            ? 'Faster disinflation pulls cuts forward; broad risk-on with duration and quality growth leading.'
            : 'Inflation cools without growth shock; equities grind higher with stable credit.',
      },
      {
        name: 'Tail',
        prob: 20,
        impact:
          direction === 'up'
            ? 'Inflation re-accelerates into a growth slowdown; HY spreads gap wider and volatility spikes.'
            : direction === 'down'
            ? 'Growth breaks while inflation falls; policy cuts arrive with risk-off and wider spreads.'
            : 'Inflation surprise hits risk parity positioning; sharp cross-asset volatility.',
      },
    ],
    whatToWatch,
    confidence: hasData ? 'MED' : 'LOW',
    dataCoverage: {
      news: inputs.hasNews || false,
      macro: inputs.hasMacro || hasData,
      prices: inputs.hasPrices || false,
    },
  };
}

/**
 * Render Jobs Report event
 */
export function renderJobsEvent(inputs: TemplateInputs, eventId: string): MacroIQCard {
  const unemployment = inputs.unemploymentRate;
  const direction = inputs.jobsDirection || (unemployment != null && unemployment < 4 ? 'down' : unemployment != null && unemployment > 5 ? 'up' : 'stable');
  const hasData = unemployment != null;
  
  const title = hasData ? `U.S. labor: Unemployment at ${unemployment.toFixed(1)}%` : 'U.S. labor: Data unavailable';

  const whatHappened = hasData
    ? `The unemployment rate is ${unemployment.toFixed(1)}%.`
    : 'Labor market data was not available in the current snapshot.';

  const coreTake = hasData
    ? `${whatHappened} Markets trade jobs through the Fed reaction function and wage inflation risk, not the headline itself.`
    : `${whatHappened} Without the print, rates trade off wages, inflation, and Fed messaging.`;

  const moves = inputs.marketMoves;
  const marketReactionBullets = marketReaction(inputs, [
    { label: 'SPY', value: moves?.spy1d ?? null, window: '1D' },
    { label: 'TLT', value: moves?.tlt1d ?? null, window: '1D' },
    { label: 'HYG', value: moves?.hyg1d ?? null, window: '1D' },
  ]);

  const transmission = {
    rates:
      direction === 'down'
        ? 'A tight labor market keeps cuts priced out; front-end yields stay supported on wage inflation risk'
        : direction === 'up'
        ? 'A softer labor market pulls forward cuts; duration rallies if inflation also cools'
        : 'Rates need confirmation from wages and inflation; the front-end stays data-dependent',
    equities:
      direction === 'down'
        ? 'Higher real yields pressure long-duration growth; cyclicals only win if growth stays firm'
        : direction === 'up'
        ? 'Lower yields help duration; defensives can hold up if growth rolls over'
        : 'Equity leadership tracks rates and earnings revisions; watch cyclicals vs defensives',
    credit:
      direction === 'down'
        ? 'Higher-for-longer increases refinancing stress in HY; spreads can widen even with steady growth'
        : direction === 'up'
        ? 'If weakness signals recession risk, HY underperforms and spreads widen quickly'
        : 'Credit trades beta until growth breaks; watch HYG and financial conditions',
    fxCommodities:
      direction === 'down'
        ? 'USD carry stays attractive; commodities respond more to growth than payroll headlines'
        : direction === 'up'
        ? 'USD can soften as cuts get priced; oil and industrial metals fade if demand expectations slip'
        : 'FX follows rate differentials; commodities follow growth and inventories',
  } satisfies NonNullable<Parameters<typeof buildInvestorBrief>[0]>['transmission'];

  const sectors =
    direction === 'down'
      ? { winners: ['XLF', 'XLI', 'XLE'] as const, losers: ['XLU', 'XLRE', 'XLK'] as const }
      : direction === 'up'
      ? { winners: ['XLV', 'XLP', 'XLU'] as const, losers: ['XLI', 'XLE', 'XLF'] as const }
      : { winners: ['XLV', 'XLF', 'XLP'] as const, losers: ['XLY', 'XLRE', 'XLK'] as const };

  const tickersToWatch =
    direction === 'down'
      ? { winners: ['XLF', 'SPY', 'UUP'] as const, losers: ['QQQ', 'TLT', 'HYG'] as const }
      : direction === 'up'
      ? { winners: ['TLT', 'GLD', 'XLV'] as const, losers: ['HYG', 'XLI', 'XLE'] as const }
      : { winners: ['SPY', 'TLT', 'XLV'] as const, losers: ['XLY', 'QQQ', 'XLRE'] as const };

  const whatToWatch = [
    'Wage growth and hours worked',
    'Job openings / quits (JOLTS) and claims',
    'Fed messaging on labor vs inflation trade-off',
  ];

  const investorBrief = buildInvestorBrief({
    title,
    whatHappened,
    marketReactionBullets,
    transmission,
    winners: { sectors: [...sectors.winners], tickers: [...tickersToWatch.winners] },
    losers: { sectors: [...sectors.losers], tickers: [...tickersToWatch.losers] },
    whatToWatchSentence: `Next: ${joinAsSentence(whatToWatch)}`,
  });
  
  return {
    id: eventId,
    eventType: 'JOBS_REPORT',
    title,
    tag: 'Labor',
    investorBrief,
    coreTake,
    marketTransmission: {
      bullets: [
        `Rates: ${transmission.rates}`,
        `Equities: ${transmission.equities}`,
        `Credit: ${transmission.credit}`,
        `FX/Commodities: ${transmission.fxCommodities}`,
      ],
    },
    sectors: { winners: [...sectors.winners], losers: [...sectors.losers] },
    tickersToWatch: { winners: [...tickersToWatch.winners], losers: [...tickersToWatch.losers] },
    scenarios: [
      {
        name: 'Base Case',
        prob: 60,
        impact:
          direction === 'down'
            ? 'Labor stays tight; cuts stay priced out; growth leadership narrows while HY lags.'
            : direction === 'up'
            ? 'Labor cools; cuts get priced; duration rallies but cyclicals lag if growth slows.'
            : 'Labor data mixed; markets key off wages and inflation for the next policy step.',
      },
      {
        name: 'Upside',
        prob: 20,
        impact:
          direction === 'down'
            ? 'Wage pressure re-accelerates; front-end reprices higher; equity multiples compress.'
            : direction === 'up'
            ? 'Cooling without recession; cuts pull forward; risk-on led by duration and quality.'
            : 'Growth re-accelerates; cyclicals and energy lead with stable credit.',
      },
      {
        name: 'Tail',
        prob: 20,
        impact:
          direction === 'down'
            ? 'Policy overtightens into a growth slowdown; spreads gap wider and equities de-risk.'
            : direction === 'up'
            ? 'Labor breaks; recession pricing hits; HY underperforms and defensives lead.'
            : 'Shock print destabilizes positioning; cross-asset volatility spikes.',
      },
    ],
    whatToWatch,
    confidence: hasData ? 'MED' : 'LOW',
    dataCoverage: {
      news: inputs.hasNews || false,
      macro: inputs.hasMacro || hasData,
      prices: inputs.hasPrices || false,
    },
  };
}

/**
 * Render FOMC Update event
 */
export function renderFOMCEvent(inputs: TemplateInputs, eventId: string): MacroIQCard {
  const fedRate = inputs.fedFundsRate;
  const direction = inputs.fomcDirection || 'hold';
  const hasData = fedRate != null;
  
  const title = hasData ? `Fed policy: Funds rate at ${fedRate.toFixed(2)}%` : 'Fed policy: Data unavailable';

  const whatHappened = hasData ? `The policy rate is ${fedRate.toFixed(2)}%.` : 'Fed policy data was not available in the current snapshot.';

  const coreTake = hasData
    ? `${whatHappened} Markets will trade the next step off guidance: how long the hold lasts and what conditions trigger cuts or hikes.`
    : `${whatHappened} Without the update, the front-end prices the path from inflation and labor data.`;

  const moves = inputs.marketMoves;
  const marketReactionBullets = marketReaction(inputs, [
    { label: 'SPY', value: moves?.spy1d ?? null, window: '1D' },
    { label: 'TLT', value: moves?.tlt1d ?? null, window: '1D' },
    { label: 'UUP', value: moves?.uup1d ?? null, window: '1D' },
    { label: 'HYG', value: moves?.hyg1d ?? null, window: '1D' },
  ]);

  const rateRegime = hasData ? (fedRate >= 4.5 ? 'restrictive' : fedRate <= 3.0 ? 'easy' : 'neutral') : 'unknown';

  const transmission = {
    rates:
      direction === 'hike'
        ? 'Hawkish action lifts the front-end and real yields; duration sells off as cuts get priced out'
        : direction === 'cut'
        ? 'Dovish action pulls the curve lower; duration rallies as the terminal path reprices down'
        : rateRegime === 'restrictive'
        ? 'A high policy rate keeps real yields elevated; the front-end stays sensitive to guidance on cuts'
        : 'Rates trade expectations for the next move; forward guidance drives the front-end',
    equities:
      direction === 'hike'
        ? 'Higher real yields pressure long-duration growth; financials benefit only if the curve steepens'
        : direction === 'cut'
        ? 'Lower yields support growth/tech (QQQ, XLK); defensives lag as duration catches a bid'
        : rateRegime === 'restrictive'
        ? 'Multiples stay capped while real yields are high; leadership skews to value and quality'
        : 'Equities trade the discount rate and earnings; watch factor rotation around guidance',
    credit:
      direction === 'hike'
        ? 'Tighter policy pushes HY spreads wider first; refinancing-sensitive issuers underperform'
        : direction === 'cut'
        ? 'Easing tends to tighten spreads; HY stabilizes if growth holds'
        : rateRegime === 'restrictive'
        ? 'Carry looks good until growth cracks; HY is vulnerable to a guidance-driven risk-off'
        : 'Credit trades beta; spreads key off growth rather than the statement wording',
    fxCommodities:
      direction === 'hike'
        ? 'USD strengthens on rate differentials; gold (GLD) softens as real yields rise'
        : direction === 'cut'
        ? 'USD carry fades; gold can benefit if real yields fall'
        : 'USD tracks policy differentials; gold trades real yields; oil is secondary to supply/demand',
  } satisfies NonNullable<Parameters<typeof buildInvestorBrief>[0]>['transmission'];

  const sectors =
    direction === 'cut' || rateRegime === 'easy'
      ? { winners: ['XLK', 'XLY', 'XLRE'] as const, losers: ['XLF', 'XLE', 'XLU'] as const }
      : direction === 'hike' || rateRegime === 'restrictive'
      ? { winners: ['XLF', 'XLV', 'XLE'] as const, losers: ['XLRE', 'XLU', 'XLK'] as const }
      : { winners: ['XLV', 'XLF', 'XLE'] as const, losers: ['XLK', 'XLY', 'XLRE'] as const };

  const tickersToWatch =
    direction === 'cut' || rateRegime === 'easy'
      ? { winners: ['QQQ', 'TLT', 'HYG'] as const, losers: ['UUP', 'XLF', 'XLE'] as const }
      : direction === 'hike' || rateRegime === 'restrictive'
      ? { winners: ['UUP', 'XLF', 'SPY'] as const, losers: ['QQQ', 'TLT', 'HYG'] as const }
      : { winners: ['SPY', 'TLT', 'HYG'] as const, losers: ['QQQ', 'XLRE', 'XLY'] as const };

  const whatToWatch = [
    'Dot plot / SEP and forward guidance',
    'Inflation and labor prints that shift the cut/hike timing',
    'Financial conditions and HY spreads (HYG/LQD)',
  ];

  const investorBrief = buildInvestorBrief({
    title,
    whatHappened,
    marketReactionBullets,
    transmission,
    winners: { sectors: [...sectors.winners], tickers: [...tickersToWatch.winners] },
    losers: { sectors: [...sectors.losers], tickers: [...tickersToWatch.losers] },
    whatToWatchSentence: `Next: ${joinAsSentence(whatToWatch)}`,
  });
  
  return {
    id: eventId,
    eventType: 'FOMC_UPDATE',
    title,
    tag: 'Monetary Policy',
    investorBrief,
    coreTake,
    marketTransmission: {
      bullets: [
        `Rates: ${transmission.rates}`,
        `Equities: ${transmission.equities}`,
        `Credit: ${transmission.credit}`,
        `FX/Commodities: ${transmission.fxCommodities}`,
      ],
    },
    sectors: { winners: [...sectors.winners], losers: [...sectors.losers] },
    tickersToWatch: { winners: [...tickersToWatch.winners], losers: [...tickersToWatch.losers] },
    scenarios: [
      {
        name: 'Base Case',
        prob: 60,
        impact:
          direction === 'hike'
            ? 'Policy stays tight; duration sells off; growth underperforms and HY spreads widen.'
            : direction === 'cut'
            ? 'Easing cycle begins; duration rallies; growth leads and spreads tighten.'
            : rateRegime === 'restrictive'
            ? 'Hold stays restrictive; real yields cap multiples; leadership skews to value/quality.'
            : 'Hold with balanced guidance; cross-asset trades key off incoming inflation and labor data.',
      },
      {
        name: 'Upside',
        prob: 20,
        impact:
          direction === 'hike'
            ? 'Guidance turns less restrictive; duration stabilizes and equities recover with tighter spreads.'
            : direction === 'cut'
            ? 'Cuts arrive with stable growth; broad risk-on led by duration and cyclicals.'
            : 'Guidance turns dovish; curve bull-steepens and risk assets rally.',
      },
      {
        name: 'Tail',
        prob: 20,
        impact:
          direction === 'hike'
            ? 'Overtightening triggers growth break; HY spreads gap wider and equities de-risk.'
            : direction === 'cut'
            ? 'Cuts are reactive to stress; risk-off with wider spreads and volatility.'
            : 'Guidance surprises hawkish; abrupt repricing hits duration and credit.',
      },
    ],
    whatToWatch,
    confidence: hasData ? 'MED' : 'LOW',
    dataCoverage: {
      news: inputs.hasNews || false,
      macro: inputs.hasMacro || hasData,
      prices: inputs.hasPrices || false,
    },
  };
}

/**
 * Render Oil Shock event
 */
export function renderOilEvent(inputs: TemplateInputs, eventId: string): MacroIQCard {
  const oilPrice = inputs.oilPrice;
  const direction = inputs.oilDirection || (oilPrice != null && oilPrice > 80 ? 'up' : oilPrice != null && oilPrice < 60 ? 'down' : 'stable');
  const hasData = oilPrice != null;
  
  const title = hasData ? `Energy: WTI around $${oilPrice.toFixed(0)}/bbl` : 'Energy: Oil data unavailable';

  const whatHappened = hasData
    ? `WTI crude is trading around $${oilPrice.toFixed(0)}/barrel.`
    : 'Oil price data was not available in the current snapshot.';

  const coreTake = hasData
    ? `${whatHappened} The key market channel is the inflation impulse and the margin squeeze on consumers and transport.`
    : `${whatHappened} Energy risk gets expressed through inflation expectations and sector dispersion.`;

  const moves = inputs.marketMoves;
  const marketReactionBullets = marketReaction(inputs, [
    { label: 'WTI', value: moves?.wti1d ?? null, window: '1D' },
    { label: 'SPY', value: moves?.spy1d ?? null, window: '1D' },
    { label: 'UUP', value: moves?.uup1d ?? null, window: '1D' },
  ]);

  const transmission = {
    rates:
      direction === 'up'
        ? 'Sustained oil strength lifts breakevens and keeps the cut timeline pushed out'
        : direction === 'down'
        ? 'Lower energy pass-through reduces inflation pressure and increases flexibility for cuts'
        : 'Rates react to whether energy stays high enough to feed services prices and breakevens',
    equities:
      direction === 'up'
        ? 'Energy (XLE) benefits while transports and consumers face margin pressure; watch airlines and discretionary'
        : direction === 'down'
        ? 'Lower fuel costs help consumers and transport; energy underperforms as cash flows compress'
        : 'Equity impact depends on persistence: short spikes fade, sustained moves reprice margins',
    credit:
      direction === 'up'
        ? 'Energy HY tightens when oil is firm, but broader HY can weaken if inflation forces tighter policy'
        : direction === 'down'
        ? 'Energy credit weakens as price declines hit cash flow; broad credit can improve if policy eases'
        : 'Credit follows risk sentiment unless oil threatens the inflation path',
    fxCommodities:
      direction === 'up'
        ? 'Oil can support USD via inflation and growth differentials; commodity complex reprices with crude'
        : direction === 'down'
        ? 'Weaker oil pressures exporters; commodity complex softens and USD carry can fade'
        : 'FX reacts to terms-of-trade; commodities follow inventories and OPEC supply discipline',
  } satisfies NonNullable<Parameters<typeof buildInvestorBrief>[0]>['transmission'];

  const sectors =
    direction === 'up'
      ? { winners: ['XLE', 'XLB', 'XLI'] as const, losers: ['XLY', 'XLU', 'XLRE'] as const }
      : direction === 'down'
      ? { winners: ['XLY', 'XLU', 'XLK'] as const, losers: ['XLE', 'XLB', 'XLI'] as const }
      : { winners: ['XLE', 'XLV', 'XLP'] as const, losers: ['XLY', 'XLRE', 'XLU'] as const };

  const tickersToWatch =
    direction === 'up'
      ? { winners: ['XLE', 'XOM', 'CVX'] as const, losers: ['XLY', 'JETS', 'IWM'] as const }
      : direction === 'down'
      ? { winners: ['XLY', 'SPY', 'TLT'] as const, losers: ['XLE', 'XOM', 'CVX'] as const }
      : { winners: ['XLE', 'SPY', 'UUP'] as const, losers: ['XLY', 'XLRE', 'TLT'] as const };

  const whatToWatch = [
    'OPEC+ supply decisions and compliance',
    'U.S. inventories and gasoline demand',
    'Breakevens and how energy feeds core inflation',
  ];

  const investorBrief = buildInvestorBrief({
    title,
    whatHappened,
    marketReactionBullets,
    transmission,
    winners: { sectors: [...sectors.winners], tickers: [...tickersToWatch.winners] },
    losers: { sectors: [...sectors.losers], tickers: [...tickersToWatch.losers] },
    whatToWatchSentence: `Next: ${joinAsSentence(whatToWatch)}`,
  });
  
  return {
    id: eventId,
    eventType: 'OIL_SHOCK',
    title,
    tag: 'Energy',
    investorBrief,
    coreTake,
    marketTransmission: {
      bullets: [
        `Rates: ${transmission.rates}`,
        `Equities: ${transmission.equities}`,
        `Credit: ${transmission.credit}`,
        `FX/Commodities: ${transmission.fxCommodities}`,
      ],
    },
    sectors: { winners: [...sectors.winners], losers: [...sectors.losers] },
    tickersToWatch: { winners: [...tickersToWatch.winners], losers: [...tickersToWatch.losers] },
    scenarios: [
      {
        name: 'Base Case',
        prob: 60,
        impact:
          direction === 'up'
            ? 'Oil holds elevated; breakevens stay firm; energy outperforms and discretionary lags.'
            : direction === 'down'
            ? 'Oil stays lower; disinflation improves; consumers benefit and energy underperforms.'
            : 'Oil range trades; macro impact muted with dispersion mostly sector-specific.',
      },
      {
        name: 'Upside',
        prob: 20,
        impact:
          direction === 'up'
            ? 'Supply shock drives a second inflation impulse; risk-off with wider spreads and defensive leadership.'
            : direction === 'down'
            ? 'Oil collapses on demand break; risk-off cyclicals and weaker credit despite lower inflation.'
            : 'Oil rallies with stronger growth; cyclicals and energy outperform with stable credit.',
      },
      {
        name: 'Tail',
        prob: 20,
        impact:
          direction === 'up'
            ? 'Stagflation risk: growth slows while inflation rises; cross-asset volatility spikes.'
            : direction === 'down'
            ? 'Demand shock dominates: recession pricing hits; HY spreads widen sharply.'
            : 'Abrupt swing disrupts positioning; sharp sector and FX moves.',
      },
    ],
    whatToWatch,
    confidence: hasData ? 'MED' : 'LOW',
    dataCoverage: {
      news: inputs.hasNews || false,
      macro: inputs.hasMacro || false,
      prices: inputs.hasPrices || hasData,
    },
  };
}

/**
 * Render Geopolitics event
 */
export function renderGeopoliticsEvent(inputs: TemplateInputs, eventId: string): MacroIQCard {
  const headline = inputs.headline || 'Geopolitical development';
  const hasData = !!inputs.headline;
  
  const title = (() => {
    const lower = headline.toLowerCase();
    if (lower.includes('war') || lower.includes('conflict') || lower.includes('attack')) return 'Geopolitics: Escalation risk in focus';
    if (lower.includes('trade') || lower.includes('tariff') || lower.includes('sanction')) return 'Geopolitics: Trade and sanctions risk';
    return 'Geopolitics: Risk premium watch';
  })();

  const whatHappened = hasData ? headline.slice(0, 160) : 'No major geopolitical headline was captured in the current feed.';

  const coreTake = hasData
    ? `${toOneSentence(whatHappened)} Markets typically express geopolitical risk via safe-haven demand and an energy/defense bid.`
    : `${toOneSentence(whatHappened)} Without a headline, treat geopolitics as a volatility risk factor rather than a trade.`;

  const moves = inputs.marketMoves;
  const marketReactionBullets = marketReaction(inputs, [
    { label: 'SPY', value: moves?.spy1d ?? null, window: '1D' },
    { label: 'TLT', value: moves?.tlt1d ?? null, window: '1D' },
    { label: 'GLD', value: moves?.gld1d ?? null, window: '1D' },
  ]);

  const transmission = {
    rates: 'Risk-off episodes drive flight-to-quality into duration; yields fall unless inflation risk dominates via energy',
    equities: 'Defense and energy can outperform on risk premium; broad equities de-rate when volatility rises',
    credit: 'Credit spreads widen as liquidity premia rise; HY underperforms first in a risk-off tape',
    fxCommodities: 'USD and gold act as safe havens; oil can spike if supply routes are threatened',
  } satisfies NonNullable<Parameters<typeof buildInvestorBrief>[0]>['transmission'];

  const sectors = { winners: ['XLE', 'XLI', 'XLU'] as const, losers: ['XLK', 'XLY', 'XLRE'] as const };
  const tickersToWatch = { winners: ['GLD', 'TLT', 'XLE'] as const, losers: ['QQQ', 'HYG', 'IWM'] as const };

  const whatToWatch = [
    'Escalation / de-escalation headlines and timeline',
    'Energy supply risks and shipping disruptions',
    'Volatility and credit spreads for spillover',
  ];

  const investorBrief = buildInvestorBrief({
    title,
    whatHappened,
    marketReactionBullets,
    transmission,
    winners: { sectors: [...sectors.winners], tickers: [...tickersToWatch.winners] },
    losers: { sectors: [...sectors.losers], tickers: [...tickersToWatch.losers] },
    whatToWatchSentence: `Next: ${joinAsSentence(whatToWatch)}`,
  });
  
  return {
    id: eventId,
    eventType: 'GEOPOLITICS',
    title,
    tag: 'Geopolitics',
    investorBrief,
    coreTake,
    marketTransmission: {
      bullets: [
        `Rates: ${transmission.rates}`,
        `Equities: ${transmission.equities}`,
        `Credit: ${transmission.credit}`,
        `FX/Commodities: ${transmission.fxCommodities}`,
      ],
    },
    sectors: { winners: [...sectors.winners], losers: [...sectors.losers] },
    tickersToWatch: { winners: [...tickersToWatch.winners], losers: [...tickersToWatch.losers] },
    scenarios: [
      {
        name: 'Base Case',
        prob: 60,
        impact: 'Risk premium persists; volatility stays elevated; energy/defense outperform while growth lags.',
      },
      {
        name: 'Upside',
        prob: 20,
        impact: 'De-escalation removes tail risk; risk-on rotation with tighter spreads and higher equity beta.',
      },
      {
        name: 'Tail',
        prob: 20,
        impact: 'Escalation triggers oil spike and liquidity stress; HY spreads gap wider and equities de-risk.',
      },
    ],
    whatToWatch,
    confidence: hasData ? 'MED' : 'LOW',
    dataCoverage: {
      news: inputs.hasNews || hasData,
      macro: inputs.hasMacro || false,
      prices: inputs.hasPrices || false,
    },
  };
}

/**
 * Render event by type
 */
export function renderMacroEvent(
  eventType: EventType,
  inputs: TemplateInputs,
  eventId: string
): MacroIQCard {
  switch (eventType) {
    case 'CPI_PRINT':
      return renderCPIEvent(inputs, eventId);
    case 'JOBS_REPORT':
      return renderJobsEvent(inputs, eventId);
    case 'FOMC_UPDATE':
      return renderFOMCEvent(inputs, eventId);
    case 'OIL_SHOCK':
      return renderOilEvent(inputs, eventId);
    case 'GEOPOLITICS':
      return renderGeopoliticsEvent(inputs, eventId);
    default:
      // Fallback to CPI if unknown
      return renderCPIEvent(inputs, eventId);
  }
}

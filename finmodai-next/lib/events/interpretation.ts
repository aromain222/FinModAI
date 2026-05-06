import type { MacroCalendarEntry } from '@/lib/macroCalendar';

export type EventBias = 'hawkish' | 'dovish' | 'neutral';

export type EventInterpretation = {
  summary: string;
  bias: EventBias;
};

export type PreReleaseSetup = {
  baseCase: string;
  upsideSurprise: string;
  downsideSurprise: string;
  watchAfterRelease: string;
};

export type EventCalendarReadThrough = {
  setup: string;
  marketWatch: string;
  whyItMatters: string;
};

type InterpretableEvent = MacroCalendarEntry & {
  actual?: string | null;
};

function normalizeDash(value: string): string {
  return value.replace(/[–—]/g, '-');
}

export function parseEventValue(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = normalizeDash(value).trim().toLowerCase();
  if (normalized === 'hold') return null;

  const rangeMatch = normalized.match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    const low = Number(rangeMatch[1]);
    const high = Number(rangeMatch[2]);
    if (Number.isFinite(low) && Number.isFinite(high)) return (low + high) / 2;
  }

  const firstNumber = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!firstNumber) return null;
  const parsed = Number(firstNumber[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function computeEventSurprise(event: InterpretableEvent): number | null {
  const actual = parseEventValue(event.actual);
  const forecast = parseEventValue(event.forecast);
  if (actual === null || forecast === null) return null;
  return actual - forecast;
}

function directionFromSurprise(surprise: number | null): 'higher' | 'lower' | 'inline' | 'awaiting' {
  if (surprise === null) return 'awaiting';
  if (Math.abs(surprise) < 0.0001) return 'inline';
  return surprise > 0 ? 'higher' : 'lower';
}

export function preReleaseSetup(event: InterpretableEvent): PreReleaseSetup {
  switch (event.type) {
    case 'CPI':
    case 'PCE':
      return {
        baseCase: 'Market base case is inflation near consensus; the important read is whether core/services inflation changes rate-cut odds.',
        upsideSurprise: 'Cooler inflation should pull yields lower and support growth stocks through lower discount-rate pressure.',
        downsideSurprise: 'Hotter core inflation would push higher-for-longer risk and pressure long-duration equity multiples.',
        watchAfterRelease: 'Watch 2Y Treasury yields, Nasdaq futures, USD, and whether the move fades after the first hour.',
      };

    case 'NFP':
      return {
        baseCase: 'Market base case is resilient jobs growth without a wage/inflation scare.',
        upsideSurprise: 'Soft-but-not-weak payrolls would support rate-cut odds while avoiding a growth scare.',
        downsideSurprise: 'A very hot jobs or wage print raises rate risk; a very weak print shifts the problem to demand risk.',
        watchAfterRelease: 'Watch wage growth, unemployment rate, revisions, 2Y yields, and mega-cap tech breadth.',
      };

    case 'FOMC':
    case 'ECB':
    case 'BOJ':
      return {
        baseCase: event.forecast?.toLowerCase() === 'hold'
          ? 'Base case is no rate change; the market will trade guidance, statement language, and the press conference tone.'
          : 'Base case is the expected policy move; the market will trade the forward path more than the headline rate.',
        upsideSurprise: 'More dovish guidance supports duration assets and growth equities through lower expected policy rates.',
        downsideSurprise: 'Higher-for-longer guidance or inflation concern would pressure equity multiples and tighten financial conditions.',
        watchAfterRelease: 'Watch front-end yields, rate-cut probabilities, USD, and leadership between defensives and growth.',
      };

    case 'GDP':
      return {
        baseCase: 'Market base case is steady growth without forcing a hawkish rate repricing.',
        upsideSurprise: 'Better growth can help cyclicals and earnings confidence if inflation detail stays contained.',
        downsideSurprise: 'Weak growth raises slowdown risk; very strong growth can still hurt if it pushes yields higher.',
        watchAfterRelease: 'Watch consumption, inflation components, 10Y yields, cyclicals, and credit spreads.',
      };
  }
}

export function calendarReadThrough(event: InterpretableEvent): EventCalendarReadThrough {
  const releasedInterpretation = event.actual ? interpretEvent(event) : null;
  if (releasedInterpretation) {
    return {
      setup: releasedInterpretation.summary,
      marketWatch: expectedMarketReaction(event, releasedInterpretation),
      whyItMatters: 'The actual print can reprice rates, factor leadership, and risk appetite immediately.',
    };
  }

  switch (event.type) {
    case 'CPI':
      return {
        setup: 'Inflation check: cooler core helps growth multiples; hot services inflation pressures rate-cut odds.',
        marketWatch: '2Y yields, Nasdaq futures, USD',
        whyItMatters: 'CPI is the fastest path from macro data to discount-rate pressure for long-duration equities.',
      };

    case 'PCE':
      return {
        setup: 'Fed inflation read: in-line is fine; sticky core PCE keeps higher-for-longer risk alive.',
        marketWatch: 'Fed-cut odds, 2Y yields, mega-cap tech',
        whyItMatters: 'PCE matters because it is the Fed-preferred inflation gauge and can shift policy expectations.',
      };

    case 'NFP':
      return {
        setup: 'Jobs setup: best case is soft enough for cuts, not weak enough to signal demand risk.',
        marketWatch: 'Wages, unemployment, revisions',
        whyItMatters: 'Payrolls move stocks through wage inflation, growth confidence, and front-end rates.',
      };

    case 'FOMC':
      return {
        setup: event.forecast?.toLowerCase() === 'hold'
          ? 'Fed setup: headline hold is expected; statement tone, dots, and Powell matter more.'
          : 'Fed setup: the policy path matters more than the headline move.',
        marketWatch: 'Dot plot, press conference, 2Y yields',
        whyItMatters: 'Fed guidance directly changes the discount rate investors apply to future earnings.',
      };

    case 'ECB':
      return {
        setup: 'ECB setup: watch whether guidance validates easier financial conditions or pushes back on cuts.',
        marketWatch: 'Bund yields, EURUSD, global rates',
        whyItMatters: 'ECB tone can spill into global rate expectations and dollar liquidity.',
      };

    case 'BOJ':
      return {
        setup: 'BOJ setup: the risk is yen/rates volatility if policy normalization sounds faster than expected.',
        marketWatch: 'JPY, JGB yields, global carry trades',
        whyItMatters: 'BOJ surprises can unwind carry positioning and tighten global risk appetite.',
      };

    case 'GDP':
      return {
        setup: 'Growth setup: stronger GDP helps earnings confidence unless it pushes yields higher.',
        marketWatch: 'Consumption, inflation detail, 10Y yields',
        whyItMatters: 'GDP changes the market’s read on earnings durability versus rate pressure.',
      };
  }
}

export function interpretEvent(event: InterpretableEvent): EventInterpretation {
  const surprise = computeEventSurprise(event);
  const direction = directionFromSurprise(surprise);

  if (!event.actual) {
    const setup = preReleaseSetup(event);
    return {
      summary: setup.baseCase,
      bias: 'neutral',
    };
  }

  switch (event.type) {
    case 'CPI':
    case 'PCE':
      if (direction === 'higher') {
        return {
          summary: 'Inflation came in hotter than expected, increasing pressure for tighter policy.',
          bias: 'hawkish',
        };
      }
      if (direction === 'lower') {
        return {
          summary: 'Inflation cooled versus expectations, easing pressure on the Fed.',
          bias: 'dovish',
        };
      }
      return {
        summary: 'Inflation was broadly in line with expectations, limiting immediate policy repricing.',
        bias: 'neutral',
      };

    case 'NFP':
      if (direction === 'higher') {
        return {
          summary: 'Payrolls beat expectations, signaling labor-market strength and a higher-for-longer rate risk.',
          bias: 'hawkish',
        };
      }
      if (direction === 'lower') {
        return {
          summary: 'Payrolls missed expectations, pointing to softer labor demand and less rate pressure.',
          bias: 'dovish',
        };
      }
      return {
        summary: 'Payrolls were close to forecast, so wage details and revisions matter more than the headline.',
        bias: 'neutral',
      };

    case 'FOMC':
    case 'ECB':
    case 'BOJ':
      if (direction === 'higher') {
        return {
          summary: 'The policy rate landed above expectations, tightening financial conditions.',
          bias: 'hawkish',
        };
      }
      if (direction === 'lower') {
        return {
          summary: 'The policy rate landed below expectations, easing financial conditions.',
          bias: 'dovish',
        };
      }
      return {
        summary: 'The rate decision was in line; forward guidance is the main driver for markets.',
        bias: 'neutral',
      };

    case 'GDP':
      if (direction === 'higher') {
        return {
          summary: 'Growth beat expectations, supporting cyclicals but potentially keeping rate cuts further away.',
          bias: 'hawkish',
        };
      }
      if (direction === 'lower') {
        return {
          summary: 'Growth missed expectations, increasing slowdown risk and lowering rate pressure.',
          bias: 'dovish',
        };
      }
      return {
        summary: 'Growth was in line with expectations, so markets should focus on inflation and consumption detail.',
        bias: 'neutral',
      };
  }
}

export function expectedMarketReaction(event: InterpretableEvent, interpretation: EventInterpretation): string {
  if (!event.actual) {
    const setup = preReleaseSetup(event);
    return `Bullish surprise: ${setup.upsideSurprise} Bearish surprise: ${setup.downsideSurprise}`;
  }

  if (interpretation.bias === 'hawkish') {
    if (event.type === 'NFP') return 'Rates likely rise -> mixed/negative for tech and long-duration growth stocks.';
    if (event.type === 'GDP') return 'Stronger growth supports cyclicals, but higher rates can pressure expensive equities.';
    return 'Rates likely rise -> pressure on growth stocks and valuation multiples.';
  }

  if (interpretation.bias === 'dovish') {
    return 'Lower rate pressure -> supports equities, especially long-duration growth stocks.';
  }

  return 'Inline result -> limited first-order market reaction unless details or guidance surprise.';
}

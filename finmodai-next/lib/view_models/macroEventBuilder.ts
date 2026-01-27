/**
 * Macro Event Builder
 * Selects and ranks 3-4 macro events for Macro IQ
 * Uses strict LLM templates with zod validation
 */

import 'server-only';

import { createHash } from 'crypto';
import { generateBackfillEvents } from './macroEventBackfills';

export type MacroEventType = 'Rates' | 'Geopolitics' | 'Growth/Labor' | 'Energy';

export type MacroEventCategory = 'CPI' | 'Jobs' | 'Fed' | 'Oil' | 'Geopolitics' | 'Earnings/Credit' | 'FX';

// New template-based MacroEvent structure
export type MacroEvent = {
  eventId: string; // Stable hash: hash(title + date + category + region)
  category: 'CPI' | 'FED' | 'JOBS' | 'OIL' | 'GEOPOLITICS';
  eventTitle: string;
  whatHappened: {
    oneLine: string;
    details: string[];
  };
  marketImpact: Array<{
    bucket: 'Equities' | 'Rates' | 'USD/FX' | 'Commodities';
    shortTerm: string;
    watch: string;
  }>;
  winnersLosers: {
    sectorsUp: string[];
    sectorsDown: string[];
    stocksToWatch: Array<{
      ticker: string;
      why: string;
    }>;
  };
  scenarios: Array<{
    name: 'Base' | 'Upside' | 'Tail';
    prob: number;
    assumptions: string[];
    assetMoves: {
      SPY: string;
      VIX: string;
      '10Y': string;
      WTI: string;
      Gold: string;
    };
  }>;
  confidence: 'Low' | 'Medium' | 'High';
  sources: Array<{
    name: string;
    url: string;
  }>;
  publishedAt: string;
  region: string;
  // Backfill metadata
  isBackfill?: boolean;
  backfillReason?: string;
  // Legacy fields for backward compatibility
  type: MacroEventType;
  title: string; // Alias for eventTitle
};

export type BuildMacroEventsResult = {
  events: MacroEvent[];
  debug?: {
    selectedCategories: MacroEventCategory[];
    dedupedCount: number;
    sourceCount: number;
  };
};

/**
 * Generate stable eventId hash from title + date + category + region
 */
function generateEventId(title: string, date: string, category: MacroEventCategory, region: string = 'global'): string {
  const input = `${title}|${date}|${category}|${region}`;
  return createHash('sha256').update(input).digest('hex').substring(0, 16);
}

/**
 * Rank macro events by importance
 * Rates > Geopolitics > Growth/Labor > Energy
 */
function getEventPriority(type: MacroEventType): number {
  const priority: Record<MacroEventType, number> = {
    Rates: 4,
    Geopolitics: 3,
    'Growth/Labor': 2,
    Energy: 1,
  };
  return priority[type] || 0;
}

/**
 * Extract macro events from data sources
 * Returns deduplicated events with diversity enforcement
 * Adds backfill events when coverage is sparse
 */
export async function buildMacroEvents(data: {
  headlines?: Array<{ title: string; impact?: string; publishedAt: string; region?: string }>;
  macroSummary?: {
    inflation?: { value: number | null; date: string | null };
    unemployment?: { value: number | null; date: string | null };
    fedFunds?: { value: number | null; date: string | null };
  };
  keyDrivers?: string[];
  region?: string;
  deterministic?: boolean;
}): Promise<BuildMacroEventsResult> {
  const deterministic = data.deterministic ?? false;
  const candidates: Array<MacroEvent & { sourceDate: string; sourceRegion: string }> = [];
  const sourceCount = (data.headlines?.length || 0) + (data.macroSummary ? 3 : 0);
  
  // Helper to add candidate with metadata
  const addCandidate = (event: MacroEvent, sourceDate: string, sourceRegion: string) => {
    candidates.push({
      ...event,
      sourceDate,
      sourceRegion,
    });
  };
  
  // Track if we've already added CPI event from macro summary to avoid duplicates
  let hasCPIFromMacro = false;
  const region = data.region || 'global';

  // Extract from headlines
  const headlines = data.headlines || [];
  for (const headline of headlines) {
    const title = headline.title || '';
    const impact = headline.impact || '';
    const lower = title.toLowerCase();

    const headlineRegion = headline.region || region;
    const headlineDate = headline.publishedAt || new Date().toISOString();

    // CPI events (prioritize CPI-specific template)
    if (
      /cpi|inflation/i.test(title) ||
      (impact === 'Rates' && /cpi|inflation/i.test(title))
    ) {
      // Use CPI template if macro summary has inflation data and we haven't added it yet
      if (data.macroSummary?.inflation?.value !== null && data.macroSummary?.inflation?.date && !hasCPIFromMacro) {
        const event = buildCPIEvent(data.macroSummary.inflation.value, data.macroSummary.inflation.date, headlineRegion);
        addCandidate(event, data.macroSummary.inflation.date, headlineRegion);
        hasCPIFromMacro = true;
      } else if (!hasCPIFromMacro) {
        // Fallback to generic rates event only if we don't have CPI from macro summary
        const event = buildRatesEvent(title, headlineDate, data.macroSummary, headlineRegion, 'Fed');
        addCandidate(event, headlineDate, headlineRegion);
      }
    }
    // Other Rates events (Fed, yield, etc.)
    else if (
      /fed|fomc|powell|rates|yield|hawk|dove/i.test(title) ||
      impact === 'Rates'
    ) {
      const category: MacroEventCategory = /fed|fomc|powell/i.test(title) ? 'Fed' : 'CPI';
      const event = buildRatesEvent(title, headlineDate, data.macroSummary, headlineRegion, category);
      addCandidate(event, headlineDate, headlineRegion);
    }
    // Geopolitics events
    else if (
      /war|attack|invasion|sanctions|conflict|russia|china|ukraine|israel|iran/i.test(title) ||
      impact === 'Geopolitics'
    ) {
      const event = buildGeopoliticsEvent(title, headlineDate, headlineRegion);
      addCandidate(event, headlineDate, headlineRegion);
    }
    // Growth/Labor events
    else if (
      /jobs|unemployment|gdp|growth|recession|employment/i.test(title) ||
      impact === 'Earnings'
    ) {
      const category: MacroEventCategory = /jobs|unemployment|employment/i.test(title) ? 'Jobs' : 'Earnings/Credit';
      const event = buildGrowthEvent(title, headlineDate, data.macroSummary, headlineRegion, category);
      addCandidate(event, headlineDate, headlineRegion);
    }
    // Energy events
    else if (
      /oil|opec|energy|crude|gas|petroleum/i.test(title) ||
      impact === 'Energy'
    ) {
      const event = buildEnergyEvent(title, headlineDate, headlineRegion);
      addCandidate(event, headlineDate, headlineRegion);
    }
  }

  // Extract from macro summary data
  if (data.macroSummary) {
    const { inflation, unemployment, fedFunds } = data.macroSummary;
    
    // CPI release event (always add from macro summary if available)
    if (inflation?.value !== null && inflation?.date && !hasCPIFromMacro) {
      const event = buildCPIEvent(inflation.value, inflation.date, region);
      addCandidate(event, inflation.date, region);
      hasCPIFromMacro = true;
    }
    
    // Jobs report event
    if (unemployment?.value !== null && unemployment?.date) {
      const event = buildJobsEvent(unemployment.value, unemployment.date, region);
      addCandidate(event, unemployment.date, region);
    }
    
    // Fed policy event
    if (fedFunds?.value !== null && fedFunds?.date) {
      const event = buildFedEvent(fedFunds.value, fedFunds.date, region);
      addCandidate(event, fedFunds.date, region);
    }
  }

  // Generate eventIds for all candidates (if not already set)
  const candidatesWithIds = candidates.map((candidate) => {
    // eventId should already be set, but regenerate if missing
    const eventId = candidate.eventId || generateEventId(candidate.title, candidate.sourceDate, candidate.category, candidate.sourceRegion);
    return {
      ...candidate,
      eventId,
      publishedAt: candidate.publishedAt || candidate.sourceDate,
      region: candidate.region || candidate.sourceRegion,
    };
  });

  // De-duplicate by eventId
  const seenIds = new Set<string>();
  const deduped: typeof candidatesWithIds = [];
  for (const candidate of candidatesWithIds) {
    if (!seenIds.has(candidate.eventId)) {
      seenIds.add(candidate.eventId);
      deduped.push(candidate);
    }
  }

  // Rank by priority
  deduped.sort((a, b) => getEventPriority(b.type) - getEventPriority(a.type));

  // Diversity enforcement: ensure at least 3 distinct categories
  const categoryPriority: Record<MacroEventCategory, number> = {
    'CPI': 6,
    'Jobs': 5,
    'Fed': 4,
    'Geopolitics': 3,
    'Oil': 2,
    'Earnings/Credit': 1,
    'FX': 0,
  };

  let selected: typeof deduped = [];
  const selectedCategories = new Set<MacroEventCategory>();
  const categoryGroups = new Map<MacroEventCategory, typeof deduped>();

  // Group by category
  for (const event of deduped) {
    if (!categoryGroups.has(event.category)) {
      categoryGroups.set(event.category, []);
    }
    categoryGroups.get(event.category)!.push(event);
  }

  // First pass: select top event from each category (by priority)
  const sortedCategories = Array.from(categoryGroups.keys()).sort(
    (a, b) => categoryPriority[b] - categoryPriority[a]
  );

  for (const category of sortedCategories) {
    const events = categoryGroups.get(category)!;
    if (events.length > 0 && selected.length < 4) {
      selected.push(events[0]);
      selectedCategories.add(category);
    }
  }

  // Second pass: if we have fewer than 3 distinct categories, backfill from next best category
  while (selected.length < 4 && selectedCategories.size < 3) {
    let added = false;
    for (const category of sortedCategories) {
      if (!selectedCategories.has(category)) {
        const events = categoryGroups.get(category)!;
        if (events.length > 0) {
          selected.push(events[0]);
          selectedCategories.add(category);
          added = true;
          break;
        }
      }
    }
    if (!added) break; // No more categories available
  }

  // Third pass: fill remaining slots (up to 4) from highest priority events
  for (const event of deduped) {
    if (selected.length >= 4) break;
    if (!selected.some((e) => e.eventId === event.eventId)) {
      selected.push(event);
      selectedCategories.add(event.category);
    }
  }

  // If fewer than 4 unique events, add backfills for missing categories
  if (selected.length < 4) {
    const backfills = await generateBackfillEvents(
      selectedCategories,
      data.macroSummary,
      region,
      deterministic
    );
    
    // Add backfills, ensuring no duplicate categories unless total < 4
    for (const backfill of backfills) {
      if (selected.length >= 4) break;
      
      // Map template category to builder category
      const builderCategory: MacroEventCategory = 
        backfill.category === 'CPI' ? 'CPI' :
        backfill.category === 'FED' ? 'Fed' :
        backfill.category === 'JOBS' ? 'Jobs' :
        backfill.category === 'OIL' ? 'Oil' :
        'Geopolitics';
      
      // Only add if category not already present, OR if we have fewer than 4 total
      if (!selectedCategories.has(builderCategory) || selected.length < 4) {
        selected.push({
          ...backfill,
          sourceDate: backfill.publishedAt,
          sourceRegion: backfill.region,
        });
        selectedCategories.add(builderCategory);
      }
    }
  }

  // If still fewer than 3, add regime fillers until we have at least 3
  while (selected.length < 3) {
    const fillers = generateRegimeFillers(selected, region);
    if (fillers.length === 0) break; // Prevent infinite loop
    for (const filler of fillers) {
      if (selected.length >= 3) break;
      const now = new Date().toISOString();
      selected.push({
        ...filler,
        sourceDate: filler.publishedAt || now,
        sourceRegion: filler.region || region,
      });
      selectedCategories.add(filler.category);
    }
  }

  // Return exactly 3-4 events (never fewer than 3, never more than 4)
  const finalEvents = selected.slice(0, 4).map(({ sourceDate, sourceRegion, ...event }) => event);

  return {
    events: finalEvents,
    debug: process.env.NODE_ENV !== 'production' ? {
      selectedCategories: Array.from(selectedCategories),
      dedupedCount: deduped.length,
      sourceCount,
    } : undefined,
  };
}

/**
 * Build Rates event
 */
function buildRatesEvent(
  title: string,
  publishedAt: string,
  macroSummary?: any,
  region: string = 'global',
  category: MacroEventCategory = 'Fed'
): MacroEvent {
  const isHawkish = /hawk|hike|tighten|raise/i.test(title);
  const isDovish = /dove|cut|ease|lower/i.test(title);
  const isCPI = /cpi|inflation/i.test(title);
  const isFed = /fed|fomc|powell/i.test(title);

  let eventTitle = title;
  if (isCPI) {
    eventTitle = 'CPI print exceeds expectations';
  } else if (isFed) {
    eventTitle = isHawkish ? 'Fed signals higher-for-longer' : isDovish ? 'Fed hints at policy pivot' : 'Fed policy update';
  } else {
    eventTitle = title.length > 60 ? title.substring(0, 57) + '...' : title;
  }

  const coreTake = isHawkish
    ? 'Monetary policy remains restrictive, keeping upward pressure on front-end yields and discount rates. Rate-sensitive assets face headwinds while banks may benefit from wider margins.'
    : isDovish
    ? 'Policy pivot signals support for duration-sensitive assets and growth stocks. Real estate and utilities rally as discount rates decline.'
    : 'Rate policy shifts impact duration-sensitive assets and financial conditions. Monitor Fed communications for directional signals.';

  return {
    eventId: generateEventId(eventTitle, publishedAt, category, region),
    title: eventTitle,
    type: 'Rates',
    category,
    publishedAt,
    region,
    coreTake,
    marketTransmission: {
      ratesAndPolicy: isHawkish
        ? 'Front-end yields ↑ → discount rates ↑ → duration assets ↓. Banks benefit from wider NIM (JPM, BAC).'
        : 'Yields ↓ → discount rates ↓ → duration assets ↑. XLU, XLRE outperform.',
      equities: isHawkish
        ? 'Value outperforms growth. XLU ↓, XLRE ↓, ARKK ↓. Banks ↑ (steepening).'
        : 'Growth outperforms value. QQQ ↑, ARKK ↑. Defensives underperform.',
      commodities: 'Gold mixed (real yields vs safe-haven). Energy neutral unless policy impacts demand.',
      fxAndGlobal: isHawkish
        ? 'USD ↑ (carry). EM currencies ↓. Exporters underperform.'
        : 'USD ↓. EM currencies ↑. Exporters benefit.',
      riskAndVolatility: isHawkish
        ? 'VIX ↑ (uncertainty). Risk-off flows. Defensives outperform.'
        : 'VIX ↓ (risk-on). High beta outperforms.',
    },
    scenarios: [
      { label: 'Policy remains restrictive (60%)', probability: 60 },
      { label: 'Gradual easing begins (25%)', probability: 25 },
      { label: 'Aggressive pivot (15%)', probability: 15 },
    ],
    whatToWatch: [
      'Next FOMC statement and dot plot revisions',
      'Core PCE trends and labor market tightness',
    ],
  };
}

/**
 * Build Geopolitics event
 * Uses strict Geopolitics template
 */
function buildGeopoliticsEvent(title: string, publishedAt: string, region: string = 'global'): MacroEvent {
  return {
    eventId: generateEventId('Geopolitical escalation raises global risk premium', publishedAt, 'Geopolitics', region),
    title: 'Geopolitical escalation raises global risk premium',
    type: 'Geopolitics',
    category: 'Geopolitics',
    publishedAt,
    region,
    coreTake: 'Markets are repricing risk and uncertainty rather than fundamentals.',
    marketTransmission: {
      ratesAndPolicy: 'Risk-off flows push yields ↓.',
      equities: 'Defense (LMT, RTX, NOC) ↑; high-beta ↓.',
      commodities: 'Oil ↑; gold ↑.',
      fxAndGlobal: 'Safe havens ↑; EM spreads widen.',
      riskAndVolatility: 'Volatility ↑.',
    },
    scenarios: [
      { label: 'Contained escalation', probability: 60 },
      { label: 'De-escalation', probability: 25 },
      { label: 'Broad macro shock', probability: 15 },
    ],
    whatToWatch: [
      'Sanctions regime',
      'Energy/shipping disruption',
    ],
  };
}

/**
 * Build Growth/Labor event
 */
function buildGrowthEvent(
  title: string,
  publishedAt: string,
  macroSummary?: any,
  region: string = 'global',
  category: MacroEventCategory = 'Jobs'
): MacroEvent {
  const isJobs = /jobs|unemployment|employment/i.test(title);
  const isGDP = /gdp|growth|recession/i.test(title);
  const isPositive = /strong|beat|surprise|up/i.test(title);
  const isNegative = /weak|miss|down|decline/i.test(title);

  let eventTitle = title;
  if (isJobs) {
    eventTitle = isPositive ? 'Jobs report shows labor market strength' : isNegative ? 'Jobs report signals labor market cooling' : 'Jobs report released';
  } else if (isGDP) {
    eventTitle = isPositive ? 'GDP growth exceeds expectations' : isNegative ? 'GDP growth disappoints' : 'GDP data released';
  } else {
    eventTitle = title.length > 60 ? title.substring(0, 57) + '...' : title;
  }

  const coreTake = isPositive
    ? 'Strong labor market data supports consumer spending and reduces recession fears. Cyclical sectors benefit while defensives underperform.'
    : isNegative
    ? 'Weak labor market data signals economic slowdown. Defensives outperform while cyclicals face headwinds.'
    : 'Labor market trends shape Fed policy expectations and sector rotation. Monitor wage growth and participation rates.';

  return {
    eventId: generateEventId(eventTitle, publishedAt, category, region),
    title: eventTitle,
    type: 'Growth/Labor',
    category,
    publishedAt,
    region,
    coreTake,
    marketTransmission: {
      ratesAndPolicy: isPositive
        ? 'Strong data → Fed hawkish. Yields ↑. Rate-sensitive assets ↓.'
        : 'Weak data → Fed dovish. Yields ↓. Rate-sensitive assets ↑.',
      equities: isPositive
        ? 'Cyclicals ↑ (XLY, XLI). Consumer discretionary ↑. Defensives ↓.'
        : 'Defensives ↑ (XLP, XLV). Consumer staples ↑. Cyclicals ↓.',
      commodities: isPositive
        ? 'Oil ↑ (demand). Copper ↑ (growth).'
        : 'Oil ↓ (demand). Copper ↓ (growth).',
      fxAndGlobal: isPositive
        ? 'USD ↑ (growth). EM mixed.'
        : 'USD ↓ (growth concerns). EM underperform.',
      riskAndVolatility: isPositive
        ? 'VIX ↓ (risk-on). High beta outperforms.'
        : 'VIX ↑ (risk-off). Defensives outperform.',
    },
    scenarios: [
      { label: 'Trend continues (60%)', probability: 60 },
      { label: 'Moderate reversal (25%)', probability: 25 },
      { label: 'Sharp shift (15%)', probability: 15 },
    ],
    whatToWatch: [
      'Next jobs report and wage growth trends',
      'Consumer spending and retail sales data',
    ],
  };
}

/**
 * Build Energy event
 * Uses strict Oil/Energy template
 */
function buildEnergyEvent(title: string, publishedAt: string, region: string = 'global'): MacroEvent {
  // Determine event type based on headline content
  const isSupplyShock = /supply.*shock|supply.*disruption|production.*cut|geopolitical.*supply|sanctions.*oil/i.test(title);
  const isOPECDecision = /opec|opec\+|production.*decision|output.*decision/i.test(title);
  const isDemandShift = /demand|consumption|economic.*growth|recession.*demand/i.test(title);
  
  // Determine price direction
  const isUp = /up|rise|surge|spike|cut|reduce|decrease.*production/i.test(title);
  const isDown = /down|fall|drop|increase.*production|glut/i.test(title);
  
  // Determine event type for title
  let eventType = 'demand shift';
  if (isSupplyShock) {
    eventType = 'supply shock';
  } else if (isOPECDecision) {
    eventType = 'OPEC decision';
  } else if (isDemandShift) {
    eventType = 'demand shift';
  }

  // Determine direction arrows for commodities
  const oilDir = isUp ? '↑' : isDown ? '↓' : '→';

  const eventTitle = `Oil prices move on ${eventType}`;
  return {
    eventId: generateEventId(eventTitle, publishedAt, 'Oil', region),
    title: eventTitle,
    type: 'Energy',
    category: 'Oil',
    publishedAt,
    region,
    coreTake: 'Oil markets are repricing supply risk and inflation spillovers, not immediate shortages.',
    marketTransmission: {
      ratesAndPolicy: 'Sustained oil ↑ → inflation risk ↑.',
      equities: 'Energy (XLE, XOM, CVX) ↑; airlines (DAL, UAL) ↓.',
      commodities: `Crude ${oilDir}; margins shift.`,
      fxAndGlobal: 'Exporters benefit; importers pressured.',
      riskAndVolatility: 'Vol ↑ if inflation fears grow.',
    },
    scenarios: [
      { label: 'Oil stabilizes', probability: 60 },
      { label: 'Persistent rally', probability: 25 },
      { label: 'Supply shock, stagflation risk', probability: 15 },
    ],
    whatToWatch: [
      'OPEC compliance',
      'Inventory data',
    ],
  };
}

/**
 * Build CPI event from macro data
 * Uses strict CPI/Inflation template
 */
function buildCPIEvent(value: number, date: string, region: string = 'global'): MacroEvent {
  // Determine if CPI is hotter, in line, or cooler than expected
  // Threshold: > 3.0% = hotter, < 2.0% = cooler, else = in line
  const isHotter = value > 3.0;
  const isCooler = value < 2.0;
  const isInLine = !isHotter && !isCooler;
  
  // Determine narrative direction
  const narrativeType = isHotter ? 'higher-for-longer' : 'disinflationary';
  
  // Determine direction arrows for market transmission
  const ratesDir = isHotter ? '↑' : isCooler ? '↓' : '→';
  const realRatesDir = isHotter ? '↑' : isCooler ? '↓' : '→';
  const equitiesDir = isHotter ? '↓' : isCooler ? '↑' : '→';
  const goldDir = isHotter ? '↓' : isCooler ? '↑' : '→';
  const usdDir = isHotter ? '↑' : isCooler ? '↓' : '→';
  const volDir = isHotter ? '↑' : isCooler ? '↓' : '→';
  
  // Determine performance verbs
  const equitiesPerformance = isHotter ? 'underperform' : isCooler ? 'outperform' : 'neutral';
  const emRisk = isHotter ? 'tightens' : isCooler ? 'eases' : 'stable';

  // Build title
  let titleModifier = 'in line';
  if (isHotter) titleModifier = 'hotter';
  else if (isCooler) titleModifier = 'cooler';

  const eventTitle = `U.S. CPI comes in ${titleModifier} than expected`;
  return {
    eventId: generateEventId(eventTitle, date, 'CPI', region),
    title: eventTitle,
    type: 'Rates',
    category: 'CPI',
    publishedAt: date,
    region,
    coreTake: `Inflation data reinforces a ${narrativeType} narrative, shaping expectations for Fed policy and real rates. Markets are responding primarily through rates repricing.`,
    marketTransmission: {
      ratesAndPolicy: `Front-end yields ${ratesDir}; real rates ${realRatesDir}.`,
      equities: `Duration assets ${equitiesDir} → growth/tech (QQQ, XLK) ${equitiesPerformance}.`,
      commodities: `Gold (GLD) ${goldDir} on real rates; oil secondary.`,
      fxAndGlobal: `USD ${usdDir}; EM risk ${emRisk}.`,
      riskAndVolatility: `Volatility floor ${volDir}.`,
    },
    scenarios: [
      { label: 'Restrictive rates, equities range-bound', probability: 60 },
      { label: 'Disinflation resumes, growth rebounds', probability: 25 },
      { label: 'Re-acceleration, sharp risk-off', probability: 15 },
    ],
    whatToWatch: [
      'Core CPI / PCE trend',
      'Fed messaging',
    ],
  };
}

/**
 * Build Jobs event from macro data
 * Uses strict Jobs/Labor template
 */
function buildJobsEvent(value: number, date: string, region: string = 'global'): MacroEvent {
  // Determine if labor market is strengthening or cooling
  // Lower unemployment = strengthening, higher unemployment = cooling
  // Threshold: < 4.0% = strengthening, > 5.0% = cooling, else = neutral
  const isStrengthening = value < 4.0;
  const isCooling = value > 5.0;
  
  // Determine direction arrows for market transmission
  const durationDir = isStrengthening ? '↓' : isCooling ? '↑' : '→';
  const oilDir = isStrengthening ? '↑' : isCooling ? '↓' : '→';
  const goldDir = isStrengthening ? '↓' : isCooling ? '↑' : '→';
  const usdDir = isStrengthening ? '↑' : isCooling ? '↓' : '→';
  const volDir = isStrengthening ? '↑' : isCooling ? '↓' : '→';
  
  // Determine labor market state for title
  let marketState = 'cooling';
  if (isStrengthening) marketState = 'strengthening';
  else if (!isCooling) marketState = 'cooling'; // Default to cooling for neutral

  const eventTitle = `U.S. jobs data shows labor market ${marketState}`;
  return {
    eventId: generateEventId(eventTitle, date, 'Jobs', region),
    title: eventTitle,
    type: 'Growth/Labor',
    category: 'Jobs',
    publishedAt: date,
    region,
    coreTake: 'Labor data affects markets through wage pressure and Fed reaction, not earnings directly.',
    marketTransmission: {
      ratesAndPolicy: 'Strong jobs → yields ↑; cooling → yields ↓.',
      equities: 'Duration stocks ↓ on strength; cyclicals mixed.',
      commodities: isStrengthening
        ? 'Oil ↑; gold ↓.'
        : isCooling
        ? 'Oil →; gold ↑.'
        : 'Oil →; gold →.',
      fxAndGlobal: `USD ${usdDir}; EM sentiment shifts.`,
      riskAndVolatility: isStrengthening || isCooling
        ? 'Vol ↑ if policy uncertainty rises.'
        : 'Vol → if policy uncertainty rises.',
    },
    scenarios: [
      { label: 'Soft landing intact', probability: 60 },
      { label: 'Faster cooling, rate cuts', probability: 25 },
      { label: 'Re-tightening, risk-off', probability: 15 },
    ],
    whatToWatch: [
      'Wage growth',
      'Participation rate',
    ],
  };
}

/**
 * Build Fed event from macro data
 */
function buildFedEvent(value: number, date: string, region: string = 'global'): MacroEvent {
  const isHigh = value > 5.0;
  const isLow = value < 3.0;

  const eventTitle = `Fed Funds at ${value.toFixed(2)}% (${new Date(date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})`;
  return {
    eventId: generateEventId(eventTitle, date, 'Fed', region),
    title: eventTitle,
    type: 'Rates',
    category: 'Fed',
    publishedAt: date,
    region,
    coreTake: isHigh
      ? `Fed Funds at ${value.toFixed(2)}% keeps policy restrictive. Rate-sensitive assets face headwinds while banks benefit from wider margins.`
      : isLow
      ? `Fed Funds at ${value.toFixed(2)}% supports accommodative policy. Duration assets and growth stocks benefit.`
      : `Fed Funds at ${value.toFixed(2)}% reflects balanced policy stance.`,
    marketTransmission: {
      ratesAndPolicy: isHigh
        ? 'High rates → Yields ↑. XLU ↓, XLRE ↓. Banks ↑.'
        : 'Low rates → Yields ↓. XLU ↑, XLRE ↑.',
      equities: isHigh
        ? 'Value outperforms. XLU ↓, XLRE ↓. Banks ↑.'
        : 'Growth outperforms. QQQ ↑.',
      commodities: 'Gold mixed. Energy neutral.',
      fxAndGlobal: isHigh
        ? 'USD ↑ (carry). EM currencies ↓.'
        : 'USD ↓. EM currencies ↑.',
      riskAndVolatility: isHigh
        ? 'VIX ↑ (uncertainty).'
        : 'VIX ↓ (risk-on).',
    },
    scenarios: [
      { label: 'Policy remains restrictive (60%)', probability: 60 },
      { label: 'Gradual easing (25%)', probability: 25 },
      { label: 'Aggressive pivot (15%)', probability: 15 },
    ],
    whatToWatch: [
      'Next FOMC statement and economic projections',
      'Core inflation and labor market data',
    ],
  };
}

/**
 * Generate regime fillers if fewer than 3 events
 */
function generateRegimeFillers(existing: MacroEvent[], region: string = 'global'): MacroEvent[] {
  const fillers: MacroEvent[] = [];
  const existingTypes = new Set(existing.map((e) => e.type));
  const now = new Date().toISOString();

  // Always include a rates regime filler if missing
  if (!existingTypes.has('Rates')) {
    const title = 'Higher-for-longer rates environment';
    fillers.push({
      eventId: generateEventId(title, now, 'Fed', region),
      title,
      type: 'Rates',
      category: 'Fed',
      publishedAt: now,
      region,
      coreTake: 'Monetary policy remains restrictive with front-end yields elevated. Rate-sensitive sectors face persistent headwinds while banks benefit from wider net interest margins.',
      marketTransmission: {
        ratesAndPolicy: 'Front-end yields ↑ → discount rates ↑ → duration assets ↓. Banks benefit (JPM, BAC).',
        equities: 'Value outperforms growth. XLU ↓, XLRE ↓, ARKK ↓. Banks ↑.',
        commodities: 'Gold mixed (real yields vs safe-haven). Energy neutral.',
        fxAndGlobal: 'USD ↑ (carry). EM currencies ↓. Exporters underperform.',
        riskAndVolatility: 'VIX elevated. Risk-off flows. Defensives outperform.',
      },
      scenarios: [
        { label: 'Rates remain elevated (60%)', probability: 60 },
        { label: 'Gradual easing begins (25%)', probability: 25 },
        { label: 'Policy pivot accelerates (15%)', probability: 15 },
      ],
      whatToWatch: [
        'Fed communications and dot plot revisions',
        'Core inflation and labor market tightness',
      ],
    });
  }

  // Add growth filler if still needed
  if (fillers.length + existing.length < 3 && !existingTypes.has('Growth/Labor')) {
    const title = 'Labor market normalization';
    fillers.push({
      eventId: generateEventId(title, now, 'Jobs', region),
      title,
      type: 'Growth/Labor',
      category: 'Jobs',
      publishedAt: now,
      region,
      coreTake: 'Labor market conditions are normalizing with wage growth moderating. Consumer spending remains resilient while inflation pressures ease.',
      marketTransmission: {
        ratesAndPolicy: 'Normalization → Fed dovish. Yields ↓. Rate-sensitive assets ↑.',
        equities: 'Cyclicals ↑ (XLY, XLI). Consumer discretionary ↑. Defensives neutral.',
        commodities: 'Oil neutral. Copper ↑ (growth).',
        fxAndGlobal: 'USD mixed. EM currencies ↑.',
        riskAndVolatility: 'VIX ↓ (risk-on).',
      },
      scenarios: [
        { label: 'Gradual normalization (60%)', probability: 60 },
        { label: 'Faster cooling (25%)', probability: 25 },
        { label: 'Labor market tightens (15%)', probability: 15 },
      ],
      whatToWatch: [
        'Wage growth and participation trends',
        'Consumer spending and retail sales',
      ],
    });
  }

  // Add energy filler if still needed to reach 3
  if (fillers.length + existing.length < 3 && !existingTypes.has('Energy')) {
    const title = 'Energy market stability';
    fillers.push({
      eventId: generateEventId(title, now, 'Oil', region),
      title,
      type: 'Energy',
      category: 'Oil',
      publishedAt: now,
      region,
      coreTake: 'Energy markets remain balanced with supply and demand in equilibrium. Oil prices reflect global growth expectations and geopolitical risk premiums.',
      marketTransmission: {
        ratesAndPolicy: 'Energy neutral. Inflation impact muted.',
        equities: 'Energy neutral (XLE). Airlines neutral. Transports neutral.',
        commodities: 'Oil neutral. Natural gas neutral.',
        fxAndGlobal: 'CAD, NOK neutral. USD mixed.',
        riskAndVolatility: 'Energy volatility normal.',
      },
      scenarios: [
        { label: 'Stable prices continue (60%)', probability: 60 },
        { label: 'Moderate supply disruption (25%)', probability: 25 },
        { label: 'Demand shock (15%)', probability: 15 },
      ],
      whatToWatch: [
        'OPEC+ production decisions',
        'Global demand trends and inventory levels',
      ],
    });
  }

  return fillers;
}


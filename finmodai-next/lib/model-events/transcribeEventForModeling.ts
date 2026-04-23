import { classifyInvestmentEvent } from '@/lib/investment-analysis/eventClassifier';
import type {
  EventLinkedModelAdjustmentInput,
  EventLinkedModelApplicability,
  EventLinkedModelCompanyContext,
  EventLinkedModelEventSource,
  EventLinkedModelImpactItem,
  EventLinkedModelImpactSeverity,
  EventLinkedModelSignal,
  EventLinkedModelSuggestionDirection,
  EventLinkedModelSuggestedAssumption,
  EventLinkedModelTranscription,
} from '@/lib/model-events/types';

type DriverKey = EventLinkedModelSuggestedAssumption['driver'];

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasPattern(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function inferApplicability(company: EventLinkedModelCompanyContext, event: EventLinkedModelEventSource): EventLinkedModelApplicability {
  const eventText = normalizeText([
    event.title,
    event.rawEventText,
    ...(event.impactedTickers ?? []),
    ...(event.impactedSectors ?? []),
  ].join(' '));
  const normalizedCompany = normalizeText(company.companyName);
  const normalizedTicker = normalizeText(company.ticker);
  const normalizedSector = normalizeText(company.sector);
  const normalizedIndustry = normalizeText(company.industry);

  const companyMatch =
    (normalizedCompany.length > 0 && eventText.includes(normalizedCompany)) ||
    (normalizedTicker.length > 0 && eventText.includes(normalizedTicker));
  const sectorMatch =
    (normalizedSector.length > 0 && eventText.includes(normalizedSector)) ||
    (normalizedIndustry.length > 0 && eventText.includes(normalizedIndustry)) ||
    (event.impactedSectors ?? []).some((sector) => normalizeText(sector) === normalizedSector);

  if (companyMatch) {
    return {
      scope: 'company_specific',
      relevanceSummary: 'The event appears directly tied to the selected company or ticker.',
      companyMatch: true,
      sectorMatch,
    };
  }

  if (sectorMatch) {
    return {
      scope: 'sector_wide',
      relevanceSummary: 'The event appears sector-relevant, so the model effect should reflect business exposure rather than only macro tone.',
      companyMatch: false,
      sectorMatch: true,
    };
  }

  return {
    scope: 'macro',
    relevanceSummary: 'The event reads as macro or cross-asset context, so the suggested model impact should stay conservative and valuation-aware.',
    companyMatch: false,
    sectorMatch: false,
  };
}

function severityFromEvent(event: EventLinkedModelEventSource, categoryConfidence: 'low' | 'medium' | 'high'): EventLinkedModelImpactSeverity {
  const severity = typeof event.severity === 'number' && Number.isFinite(event.severity) ? event.severity : null;
  if (severity !== null) {
    if (severity >= 75) return 'high';
    if (severity >= 45) return 'medium';
    return 'low';
  }
  return categoryConfidence === 'high' ? 'medium' : 'low';
}

function signalFromDirection(direction: EventLinkedModelSuggestionDirection): EventLinkedModelSignal {
  if (direction === 'up') return 'positive';
  if (direction === 'down') return 'negative';
  return 'neutral';
}

function summarizeSignal(label: string, direction: EventLinkedModelSuggestionDirection, detail: string): string {
  const verb = direction === 'up' ? 'moves up' : direction === 'down' ? 'moves down' : 'stays stable';
  return `${label} ${verb} because ${detail}`;
}

function buildChannelList(text: string, applicability: EventLinkedModelApplicability): string[] {
  const channels: string[] = [];
  if (hasPattern(text, /\bdemand\b|\bslowdown\b|\bpullback\b|\bvolume\b|\borders?\b/i)) channels.push('demand');
  if (hasPattern(text, /\bprice\b|\bpricing\b|\bdiscount\b|\bpromotional\b/i)) channels.push('pricing');
  if (hasPattern(text, /\binput cost\b|\bcost inflation\b|\bcommodity\b|\boil\b|\benergy\b|\bfreight\b|\blabor\b/i)) channels.push('input_costs');
  if (hasPattern(text, /\brate\b|\byield\b|\brefinanc\b|\bdebt\b|\bfunding\b|\bliquidity\b|\bcapital cost\b/i)) channels.push('financing');
  if (hasPattern(text, /\bregulat|\bpolicy\b|\bantitrust\b|\bexport control\b|\btariff\b/i)) channels.push('regulation');
  if (hasPattern(text, /\bsupply chain\b|\bshipment\b|\bport\b|\bprocurement\b|\binventory\b/i)) channels.push('supply_chain');
  if (hasPattern(text, /\bstructural\b|\blong[\s-]?term\b|\bsecular\b|\bterminal\b/i)) channels.push('structural_outlook');
  if (channels.length === 0) {
    channels.push(applicability.scope === 'macro' ? 'financing' : 'demand');
  }
  return uniqueStrings(channels);
}

function addImpact(
  target: EventLinkedModelImpactItem[],
  key: string,
  label: string,
  signal: EventLinkedModelSignal,
  severity: EventLinkedModelImpactSeverity,
  summary: string,
) {
  target.push({ key, label, signal, severity, summary });
}

function buildSuggestedAssumptions(
  channels: string[],
  applicability: EventLinkedModelApplicability,
  confidence: 'low' | 'medium' | 'high',
): EventLinkedModelSuggestedAssumption[] {
  const suggestions = new Map<DriverKey, EventLinkedModelSuggestedAssumption>();

  const pushSuggestion = (
    driver: DriverKey,
    label: string,
    direction: EventLinkedModelSuggestionDirection,
    magnitude: EventLinkedModelImpactSeverity,
    rationale: string,
  ) => {
    const existing = suggestions.get(driver);
    if (!existing) {
      suggestions.set(driver, { driver, label, direction, magnitude, rationale });
      return;
    }
    const rank: Record<EventLinkedModelImpactSeverity, number> = { low: 1, medium: 2, high: 3 };
    if (rank[magnitude] > rank[existing.magnitude]) {
      suggestions.set(driver, { driver, label, direction, magnitude, rationale });
    }
  };

  if (channels.includes('demand')) {
    pushSuggestion(
      'revenue_growth',
      'Revenue growth',
      applicability.scope === 'company_specific' ? 'down' : 'down',
      applicability.scope === 'company_specific' ? 'medium' : 'low',
      'Demand pressure usually reduces the near-term revenue trajectory before it changes long-run valuation levers.',
    );
  }
  if (channels.includes('pricing') || channels.includes('input_costs')) {
    pushSuggestion(
      'operating_margin',
      'Operating margin',
      'down',
      channels.includes('pricing') && channels.includes('input_costs') ? 'high' : 'medium',
      'Pricing pressure or higher input costs typically compress operating margin before they change the discount rate.',
    );
  }
  if (channels.includes('financing')) {
    pushSuggestion(
      'wacc',
      'WACC',
      'up',
      confidence === 'high' ? 'medium' : 'low',
      'Tighter funding conditions and higher required returns should show up in WACC before they affect steady-state growth.',
    );
  }
  if (channels.includes('structural_outlook') || channels.includes('regulation')) {
    pushSuggestion(
      'terminal_growth_rate',
      'Terminal growth',
      applicability.scope === 'company_specific' ? 'down' : 'down',
      applicability.scope === 'macro' ? 'low' : 'medium',
      'Structural changes to industry outlook or regulation should feed terminal growth conservatively rather than through a one-period shock.',
    );
  }

  if (suggestions.size === 0) {
    pushSuggestion(
      'wacc',
      'WACC',
      applicability.scope === 'macro' ? 'up' : 'flat',
      'low',
      'With ambiguous event transmission, keep the suggested model move conservative and valuation-focused.',
    );
  }

  return Array.from(suggestions.values());
}

function buildSuggestedImpacts(
  channels: string[],
  suggestions: EventLinkedModelSuggestedAssumption[],
  applicability: EventLinkedModelApplicability,
  severity: EventLinkedModelImpactSeverity,
): EventLinkedModelTranscription['suggestedImpacts'] {
  const business: EventLinkedModelImpactItem[] = [];
  const market: EventLinkedModelImpactItem[] = [];
  const model: EventLinkedModelImpactItem[] = [];

  if (channels.includes('demand')) {
    addImpact(business, 'demand', 'Demand', 'negative', severity, 'Near-term demand looks pressured, which should show up in volume or booking assumptions.');
  }
  if (channels.includes('pricing')) {
    addImpact(business, 'pricing', 'Pricing', 'negative', severity, 'Pricing power looks weaker, so realization and margin resilience should be challenged.');
  }
  if (channels.includes('input_costs')) {
    addImpact(business, 'margin_pressure', 'Margin pressure', 'negative', severity, 'Higher input or logistics costs point to operating margin compression.');
  }
  if (channels.includes('financing')) {
    addImpact(business, 'financing_pressure', 'Financing pressure', 'negative', severity, 'Funding conditions and required returns look less supportive for valuation.');
    addImpact(market, 'rates', 'Rates', 'negative', severity, 'Rates and discount-rate sensitivity are likely part of the market read-through.');
    addImpact(market, 'credit', 'Credit', 'negative', severity, 'Credit or refinancing conditions look more relevant than a pure operating catalyst.');
  }
  if (channels.includes('regulation')) {
    addImpact(business, 'regulatory_risk', 'Regulatory risk', 'negative', severity, 'Policy or compliance risk can impair growth visibility and steady-state assumptions.');
  }
  if (channels.includes('supply_chain')) {
    addImpact(business, 'supply_chain', 'Supply chain', 'negative', severity, 'The event looks capable of disrupting fulfillment, input timing, or working-capital efficiency.');
  }

  const primaryDrivers = suggestions.map((suggestion) => suggestion.label).join(', ');
  addImpact(
    model,
    'valuation_pressure',
    'Valuation pressure',
    suggestions.some((item) => item.direction === 'down' || item.driver === 'wacc') ? 'negative' : 'mixed',
    severity,
    applicability.scope === 'macro'
      ? `The model should emphasize valuation sensitivity through ${primaryDrivers}.`
      : `The model should show the operating and valuation impact through ${primaryDrivers}.`,
  );

  if (suggestions.some((item) => item.driver === 'wacc')) {
    addImpact(model, 'wacc_sensitivity', 'Discount-rate sensitivity', 'negative', severity, 'WACC is a first-order impact channel for this event.');
  }
  if (suggestions.some((item) => item.driver === 'terminal_growth_rate')) {
    addImpact(model, 'terminal_sensitivity', 'Terminal-value sensitivity', 'negative', severity, 'Terminal assumptions should move only modestly but visibly for this event.');
  }
  if (suggestions.some((item) => item.driver === 'revenue_growth' || item.driver === 'operating_margin')) {
    addImpact(model, 'operating_sensitivity', 'Operating sensitivity', 'negative', severity, 'The event reads through the operating forecast, not only the discount rate.');
  }

  if (market.length === 0) {
    addImpact(
      market,
      'equities',
      'Equities',
      applicability.scope === 'macro' ? 'mixed' : 'negative',
      severity,
      'The market reaction is likely to be differentiated rather than a uniform one-way move.',
    );
  }

  return { business, market, model };
}

function buildWhatChanged(text: string, channels: string[]): string {
  if (channels.includes('financing')) {
    return 'The event changes the funding or discount-rate backdrop rather than only the headline narrative.';
  }
  if (channels.includes('demand') && channels.includes('input_costs')) {
    return 'The event pressures both demand and margins, which makes the operating forecast the primary impact channel.';
  }
  if (channels.includes('regulation')) {
    return 'The event changes the operating rule set or strategic flexibility, not just sentiment.';
  }
  return text;
}

function buildWhyItMatters(channels: string[], suggestions: EventLinkedModelSuggestedAssumption[]): string {
  const driverLabels = suggestions.map((item) => item.label).join(', ');
  if (channels.includes('financing')) {
    return `This matters because the market is likely to reprice required returns and valuation duration through ${driverLabels}.`;
  }
  if (channels.includes('demand') || channels.includes('input_costs')) {
    return `This matters because the first-order read-through is into the forecast itself via ${driverLabels}.`;
  }
  return `This matters because the event can change decision-useful model drivers including ${driverLabels}.`;
}

function buildCompanyExposure(applicability: EventLinkedModelApplicability, company: EventLinkedModelCompanyContext): string {
  if (applicability.companyMatch) {
    return 'Direct company exposure is high because the event appears tied to the selected business or ticker.';
  }
  if (applicability.sectorMatch) {
    return `Sector exposure is relevant${company.sector ? ` for ${company.sector}` : ''}, so the suggested model impact should focus on business transmission rather than generic macro tone.`;
  }
  return 'Exposure looks more macro than company-specific, so the suggested model effect should stay conservative and valuation-aware.';
}

export function transcribeEventForModeling(input: {
  event: EventLinkedModelEventSource;
  company?: EventLinkedModelCompanyContext | null;
  modelType?: string | null;
}): {
  eventCategory: string;
  confidence: 'low' | 'medium' | 'high';
  scenarioBias: 'bullish' | 'base' | 'bearish' | 'mixed' | 'neutral';
  applicability: EventLinkedModelApplicability;
  transcription: EventLinkedModelTranscription;
} {
  const company = input.company ?? {};
  const classification = classifyInvestmentEvent({
    rawEventText: input.event.rawEventText,
    companyName: company.companyName,
    sector: company.sector,
  });
  const applicability = inferApplicability(company, input.event);
  const severity = severityFromEvent(input.event, classification.confidence);
  const eventText = normalizeText([input.event.title, input.event.rawEventText].filter(Boolean).join(' '));
  const channels = buildChannelList(eventText, applicability);
  const suggestions = buildSuggestedAssumptions(channels, applicability, classification.confidence);
  const suggestedImpacts = buildSuggestedImpacts(channels, suggestions, applicability, severity);

  const negativeCount = suggestions.filter((item) => item.direction === 'down' || item.driver === 'wacc').length;
  const positiveCount = suggestions.filter((item) => item.direction === 'up' && item.driver !== 'wacc').length;
  const scenarioBias =
    negativeCount > 0 && positiveCount === 0
      ? 'bearish'
      : positiveCount > 0 && negativeCount === 0
        ? 'bullish'
        : negativeCount > 0 && positiveCount > 0
          ? 'mixed'
          : 'neutral';

  const warnings: string[] = [];
  if (classification.confidence === 'low') {
    warnings.push('The event signal is weak, so the suggested model impact should be treated as directional rather than high-conviction.');
  }
  if (applicability.scope === 'macro') {
    warnings.push('This event looks more macro than company-specific, so the suggested assumption moves stay conservative.');
  }

  return {
    eventCategory: classification.category,
    confidence: classification.confidence,
    scenarioBias,
    applicability,
    transcription: {
      eventSummary: classification.normalizedEventSummary,
      whatChanged: buildWhatChanged(classification.rationale, channels),
      whyItMatters: buildWhyItMatters(channels, suggestions),
      transmissionChannels: channels,
      companyExposure: buildCompanyExposure(applicability, company),
      suggestedImpacts,
      suggestedAssumptions: suggestions,
      confidence: classification.confidence,
      warnings,
    },
  };
}

export function buildCompactModelImpactPreview(
  transcription: EventLinkedModelTranscription,
): {
  summary: string;
  impacts: EventLinkedModelImpactItem[];
  suggestions: EventLinkedModelSuggestedAssumption[];
} {
  return {
    summary: transcription.eventSummary,
    impacts: [
      ...transcription.suggestedImpacts.business,
      ...transcription.suggestedImpacts.market,
      ...transcription.suggestedImpacts.model,
    ].slice(0, 4),
    suggestions: transcription.suggestedAssumptions.slice(0, 4),
  };
}

export function formatSuggestionChip(suggestion: EventLinkedModelSuggestedAssumption): string {
  const arrow = suggestion.direction === 'up' ? '↑' : suggestion.direction === 'down' ? '↓' : '→';
  return `${suggestion.label} ${arrow}`;
}

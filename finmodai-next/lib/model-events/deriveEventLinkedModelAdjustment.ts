import type {
  EventLinkedModelAdjustmentInput,
  EventLinkedModelAdjustmentResult,
  EventLinkedModelChangedDriver,
  EventLinkedModelDriverChange,
  EventLinkedModelDriverChanges,
  EventLinkedModelDriverKey,
} from '@/lib/model-events/types';
import { transcribeEventForModeling } from '@/lib/model-events/transcribeEventForModeling';

const DRIVER_LABELS: Record<EventLinkedModelDriverKey, string> = {
  revenue_growth: 'Revenue growth',
  operating_margin: 'Operating margin',
  cogs_percentage: 'COGS percentage',
  opex_percentage: 'Opex percentage',
  wacc: 'WACC',
  terminal_growth_rate: 'Terminal growth',
  multiple: 'Multiple',
};

function emptyDriverChanges(): EventLinkedModelDriverChanges {
  return {
    revenue_growth: { old: null, new: null },
    operating_margin: { old: null, new: null },
    cogs_percentage: { old: null, new: null },
    opex_percentage: { old: null, new: null },
    wacc: { old: null, new: null },
    terminal_growth_rate: { old: null, new: null },
    multiple: { old: null, new: null },
  };
}

function hasMeaningfulChange(change: EventLinkedModelDriverChange): boolean {
  return (
    typeof change.old === 'number' &&
    Number.isFinite(change.old) &&
    typeof change.new === 'number' &&
    Number.isFinite(change.new) &&
    Math.abs(change.new - change.old) > 1e-9
  );
}

function buildChangedDrivers(
  changes: EventLinkedModelDriverChanges,
  rationales: Partial<Record<EventLinkedModelDriverKey, string>>,
): EventLinkedModelChangedDriver[] {
  return (Object.keys(changes) as EventLinkedModelDriverKey[])
    .filter((driver) => hasMeaningfulChange(changes[driver]))
    .map((driver) => ({
      driver,
      label: DRIVER_LABELS[driver],
      old: changes[driver].old,
      new: changes[driver].new,
      rationale: rationales[driver] ?? `${DRIVER_LABELS[driver]} updated from the event-linked model adjustment.`,
    }));
}

function buildNormalizedOverrides(changes: EventLinkedModelDriverChanges): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  if (hasMeaningfulChange(changes.revenue_growth) && changes.revenue_growth.new !== null) {
    overrides.revenue_growth = changes.revenue_growth.new;
  }
  if (hasMeaningfulChange(changes.operating_margin) && changes.operating_margin.new !== null) {
    overrides.ebit_margin = changes.operating_margin.new;
  }
  if (hasMeaningfulChange(changes.wacc) && changes.wacc.new !== null) {
    overrides.wacc = changes.wacc.new;
  }
  if (hasMeaningfulChange(changes.terminal_growth_rate) && changes.terminal_growth_rate.new !== null) {
    overrides.terminal_growth = changes.terminal_growth_rate.new;
  }
  return overrides;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function magnitudeForDriver(driver: EventLinkedModelDriverKey, magnitude: 'low' | 'medium' | 'high'): number {
  if (driver === 'revenue_growth') {
    return magnitude === 'high' ? 0.04 : magnitude === 'medium' ? 0.025 : 0.01;
  }
  if (driver === 'operating_margin') {
    return magnitude === 'high' ? 0.03 : magnitude === 'medium' ? 0.015 : 0.005;
  }
  if (driver === 'wacc') {
    return magnitude === 'high' ? 0.01 : magnitude === 'medium' ? 0.005 : 0.0025;
  }
  if (driver === 'terminal_growth_rate') {
    return magnitude === 'high' ? 0.005 : magnitude === 'medium' ? 0.0025 : 0.001;
  }
  return 0;
}

function applySuggestedChange(
  current: number | null,
  driver: EventLinkedModelDriverKey,
  direction: 'up' | 'down' | 'flat',
  magnitude: 'low' | 'medium' | 'high',
): EventLinkedModelDriverChange {
  if (typeof current !== 'number' || !Number.isFinite(current)) return { old: null, new: null };
  if (direction === 'flat') return { old: current, new: current };

  const delta = magnitudeForDriver(driver, magnitude);
  const signed = direction === 'up' ? delta : -delta;
  const nextValue =
    driver === 'revenue_growth'
      ? clamp(current + signed, -0.2, 0.5)
      : driver === 'operating_margin'
        ? clamp(current + signed, -0.1, 0.6)
        : driver === 'wacc'
          ? clamp(current + signed, 0.03, 0.25)
          : clamp(current + signed, -0.02, 0.08);

  return { old: current, new: nextValue };
}

export async function deriveEventLinkedModelAdjustment(
  input: EventLinkedModelAdjustmentInput,
): Promise<EventLinkedModelAdjustmentResult> {
  const rawEventText = String(input.event.rawEventText ?? '').trim();
  if (!rawEventText) {
    throw new Error('Event text is required.');
  }

  const transcribed = transcribeEventForModeling({
    event: input.event,
    company: input.company,
    modelType: input.modelType,
  });

  const changes = emptyDriverChanges();
  const rationaleMap: Partial<Record<EventLinkedModelDriverKey, string>> = {};

  for (const suggestion of transcribed.transcription.suggestedAssumptions) {
    changes[suggestion.driver] = applySuggestedChange(
      input.currentAssumptions[suggestion.driver],
      suggestion.driver,
      suggestion.direction,
      suggestion.magnitude,
    );
    rationaleMap[suggestion.driver] = suggestion.rationale;
  }

  const warnings = [...transcribed.transcription.warnings];
  const blockingErrors: string[] = [];

  const normalizedOverrides = buildNormalizedOverrides(changes);
  const changedDrivers = buildChangedDrivers(changes, rationaleMap);

  return {
    event: input.event,
    eventCategory: transcribed.eventCategory,
    confidence: transcribed.confidence,
    normalizedEventSummary: transcribed.transcription.eventSummary,
    scenarioBias: transcribed.scenarioBias,
    applicability: transcribed.applicability,
    transcription: transcribed.transcription,
    changes,
    changedDrivers,
    normalizedOverrides,
    warnings,
    blockingErrors,
    hasMaterialChanges: changedDrivers.length > 0 && blockingErrors.length === 0,
    summary: `${transcribed.transcription.whatChanged} ${transcribed.transcription.whyItMatters}`,
    detailedReasoning: [
      transcribed.transcription.companyExposure,
      transcribed.transcription.whyItMatters,
      ...transcribed.transcription.suggestedAssumptions.map((suggestion) => suggestion.rationale),
    ]
      .filter(Boolean)
      .join(' '),
  };
}

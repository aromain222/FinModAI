/**
 * Macro Events - Deterministic event generation from news items
 * Transforms raw headlines into canonical event items with categories, confidence, and market impact
 * 
 * Uses deterministic normalization and deduplication from ./events/normalize.ts and ./events/dedupe.ts
 */

export type {
  MacroEvent,
  MacroEventCategory,
  MacroEventWindow,
  MacroEventConfidence,
  MacroEventSource,
  MacroEventAISynthesis,
} from './events/types';

export { transformNewsToEvents } from './events/transform';

/**
 * Enrich macro events with LLM templates
 * Converts old event structure to new template-based structure
 */

import { buildEventFromTemplate, type MacroEventCategory } from './macroEventBuilderHelpers';
import type { MacroEvent } from './macroEventBuilder';
import type { TemplateInputs } from './macroEventTemplates';

/**
 * Enrich a single event with template
 */
export async function enrichEventWithTemplate(
  oldEvent: MacroEvent,
  inputs: TemplateInputs
): Promise<MacroEvent> {
  const category: MacroEventCategory = 
    oldEvent.category === 'CPI' ? 'CPI' :
    oldEvent.category === 'Fed' ? 'Fed' :
    oldEvent.category === 'Jobs' ? 'Jobs' :
    oldEvent.category === 'Oil' ? 'Oil' :
    oldEvent.category === 'Geopolitics' ? 'Geopolitics' :
    'Fed'; // Default

  return buildEventFromTemplate(category, inputs, oldEvent.publishedAt, oldEvent.region);
}

/**
 * Enrich multiple events with templates (in parallel)
 */
export async function enrichEventsWithTemplates(
  events: MacroEvent[],
  getInputs: (event: MacroEvent) => TemplateInputs
): Promise<MacroEvent[]> {
  const enriched = await Promise.all(
    events.map((event) => enrichEventWithTemplate(event, getInputs(event)))
  );
  return enriched;
}


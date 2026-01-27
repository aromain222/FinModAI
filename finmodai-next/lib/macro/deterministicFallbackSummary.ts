/**
 * Deterministic fallback summary generator for macro stories/events
 * 
 * RULES:
 * - Exactly 2-4 sentences (returns 3 for safety)
 * - Story-specific using available fields
 * - No hype, forecasts, or invented numbers
 * - Institutional tone
 * - Explicitly says "monitor-only" when signal is weak
 * - NEVER throws, even if all fields are missing
 */

export function deterministicFallbackSummary(story: any): string {
  // Safe field extraction with defaults
  const assetClass = story?.assetClass || story?.category || story?.topic || 'Markets';
  const direction = story?.direction || story?.impact || '';
  const region = story?.region || story?.geo?.region || '';
  const source = story?.source || story?.publisher || '';
  const title = story?.title || story?.canonicalTitle || story?.headline || 'Untitled story';
  
  // Build sentence 1: "{assetClass}{direction}{region}: {title} (per {source})."
  let sentence1 = assetClass;
  if (direction) sentence1 += ` (${direction})`;
  if (region && region !== 'global') sentence1 += ` in ${region}`;
  sentence1 += `: ${title}`;
  if (source) sentence1 += ` (per ${source})`;
  sentence1 += '.';
  
  // Sentence 2: Impact explanation
  const sentence2 = 
    'This matters for the most exposed sectors or assets linked to the headline\'s theme ' +
    'and should be treated as a positioning or risk-monitoring item.';
  
  // Sentence 3: Signal limitation disclaimer
  const sentence3 = 
    'Signal is limited from available fields, so treat this as monitor-only until ' +
    'confirmed by follow-through or data.';
  
  return `${sentence1} ${sentence2} ${sentence3}`;
}

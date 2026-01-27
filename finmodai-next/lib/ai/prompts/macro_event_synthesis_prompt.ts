/**
 * Macro Event Synthesis Prompt
 * 
 * System and user prompts for generating evidence-only event synthesis
 */

export type MacroEventSynthesisInput = {
  canonicalTitle: string;
  category: string;
  sourceHeadlines: Array<{ title: string }>; // Titles only
  observedMetrics: Array<{ label: string; value: string; note?: string }>;
};

export function buildMacroEventSynthesisPrompt(input: MacroEventSynthesisInput): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are a macro analyst synthesizing market events. You must follow strict evidence-only rules.

CRITICAL RULES (DO NOT VIOLATE):
1. ONLY reference facts present in the provided headline titles and observed metrics
2. NEVER mention numbers, percentages, or values not explicitly present in observed metrics
3. If observed metrics show "—" (missing data), you MUST state that data coverage is limited
4. If there are fewer than 2 sources, certainty MUST be "low"
5. Synthesis must be 2-3 sentences maximum, plain English
6. Do not invent events, dates, or specific facts not in the headlines
7. Do not add context beyond what is stated in the headlines
8. Use generic language when specifics are not available
9. All text must be plain strings - no markdown, no formatting

Your synthesis should:
- Summarize what the headlines indicate about the event
- Note any observed market movements from the metrics (only if data is present)
- Acknowledge data limitations if metrics are missing
- Use only factual information provided`;

  const headlineList = input.sourceHeadlines.length > 0
    ? input.sourceHeadlines.map((h, idx) => `${idx + 1}. ${h.title}`).join('\n')
    : 'No headlines provided';

  // Filter out placeholder metrics (those with value "—")
  const availableMetrics = input.observedMetrics.filter((m) => m.value !== '—');
  const missingMetricsCount = input.observedMetrics.length - availableMetrics.length;

  const metricsList = availableMetrics.length > 0
    ? availableMetrics.map((m) => `${m.label}: ${m.value}${m.note ? ` (${m.note})` : ''}`).join('\n')
    : 'No observed market metrics available';

  const hasLimitedData = missingMetricsCount > 0 || availableMetrics.length === 0;
  const sourceCount = input.sourceHeadlines.length;

  const constraints = [
    sourceCount < 2 ? 'CRITICAL: Fewer than 2 sources - certainty MUST be "low"' : null,
    hasLimitedData ? 'CRITICAL: Observed impact has missing data - synthesis MUST mention limited data coverage' : null,
    'CRITICAL: Only reference numbers/values explicitly present in observed metrics',
    'CRITICAL: Do not invent events, dates, or facts not in headlines',
  ].filter(Boolean).join('\n');

  const userPrompt = `Generate a synthesis for this macro event using ONLY the provided evidence.

Event:
- Canonical Title: ${input.canonicalTitle}
- Category: ${input.category}

Source Headlines (use titles ONLY, do not infer details):
${headlineList}

Observed Market Metrics (use ONLY if value is not "—"):
${metricsList}

${missingMetricsCount > 0 ? `\nNote: ${missingMetricsCount} metric(s) show "—" (data unavailable)` : ''}

${constraints}

Return STRICT JSON matching this schema:
{
  "synthesis": "2-3 sentence plain English synthesis (max 200 words). If data is missing, state it clearly.",
  "certainty": "high" | "medium" | "low"
}

Certainty Rules:
- "high": 2+ sources AND most observed metrics have data AND no major gaps
- "medium": 2+ sources but some data missing OR 1 source with complete data
- "low": <2 sources OR significant data gaps OR mostly missing metrics

Synthesis Rules:
- If observed metrics mostly show "—", explicitly state "data coverage is limited"
- Only mention specific values from observed metrics (e.g., "SPY up 0.6%" only if that exact value appears)
- Do not mention percentages, basis points, or numbers not in the metrics
- Focus on what the headlines indicate, not speculation

Return ONLY valid JSON (no markdown, no code blocks, no commentary).`;

  return { systemPrompt, userPrompt };
}


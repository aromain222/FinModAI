import { z } from 'zod';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';

const EXTRACTION_SYSTEM_PROMPT = `You are an event extraction system that operates above news headlines.

You must follow a strict process to derive events. Do not jump directly to conclusions.

PROCESS:

Step 1: Identify the primary subject
Determine the main entity the article is about (company, government, central bank, sector).

Step 2: Identify the concrete change
Find the single verifiable action or outcome that occurred.
This must be something that changed in the real world, not commentary.

Examples of valid changes:

* executive departure or appointment
* earnings release (beat/miss)
* policy decision (rate hike/cut)
* regulatory action (fine, ban, approval)
* product launch or failure

Step 3: Filter out noise
Ignore:

* opinions
* forecasts without action
* repeated headlines across sources
* descriptive or emotional language

Step 4: Normalize the event
Convert the change into a standardized, concise event label.

Examples:

* "Company X announced that its CEO will step down" → "CEO departure"
* "The Federal Reserve cut rates by 25bps" → "Rate cut"
* "Company Y reported stronger than expected earnings" → "Earnings beat"

Step 5: Classify the event
Assign:

* type: earnings | macro | geopolitics | regulatory | systemic
* direction: positive or negative
* impact_type: growth | margin | risk

Step 6: Validate
Before outputting, confirm:

* Is this a real-world change?
* Is it the most important event in the article?
* Can it affect financial outcomes?

If not, discard and choose a better event.

OUTPUT RULES:

* Extract exactly ONE event
* Output must be valid JSON only
* No summaries, no explanations
* No multiple events
* No narrative text

Your goal is to reduce complex articles into a single, structured event that can be used in financial models.

Output schema:
{
  "event_label": "<normalized label from Step 4>",
  "subject": "<primary entity from Step 1>",
  "type": "earnings|macro|geopolitics|regulatory|systemic",
  "direction": "positive|negative",
  "impact_type": "growth|margin|risk",
  "valid": true|false
}

If the article fails Step 6 validation (not a real-world change, not market-affecting), set valid=false and still output the other fields with best-effort values.`;

const extractionSchema = z.object({
  event_label: z.string().min(1),
  subject: z.string().min(1),
  type: z.enum(['earnings', 'macro', 'geopolitics', 'regulatory', 'systemic']),
  direction: z.enum(['positive', 'negative']),
  impact_type: z.enum(['growth', 'margin', 'risk']),
  valid: z.boolean().optional().default(true),
});

export type EventExtraction = z.infer<typeof extractionSchema>;

function extractJson(text: string): unknown {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const first = stripped.indexOf('{');
  const last = stripped.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('no JSON object found');
  return JSON.parse(stripped.slice(first, last + 1));
}

export async function getEventExtraction(article: {
  title: string;
  description: string | null;
}): Promise<EventExtraction | null> {
  try {
    const response = await generateTextWithProviderFallback({
      clientType: 'service',
      preferredProvider: 'anthropic',
      temperature: 0.1,
      maxTokens: 300,
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: `Title: ${article.title}\nDescription: ${article.description ?? 'None'}` },
      ],
    });

    if (!response?.text) return null;

    const parsed = extractionSchema.safeParse(extractJson(response.text));
    if (!parsed.success) return null;

    return parsed.data;
  } catch {
    return null;
  }
}

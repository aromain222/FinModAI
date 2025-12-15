import OpenAI from 'openai';

type GenerateModelBody = {
  ticker?: string;
  modelType?: 'dcf' | 'comps' | 'lbo';
  includeScenario?: boolean;
  scenarioNotes?: string | null;
  includeAssumptions?: boolean;
  assumptionsText?: string | null;
};

export async function POST(req: Request) {
  try {
    const body: GenerateModelBody = await req.json();
    const ticker = body.ticker?.trim().toUpperCase();
    const modelType = body.modelType;
    const includeScenario = Boolean(body.includeScenario);
    const includeAssumptions = Boolean(body.includeAssumptions);
    const scenarioNotes = body.scenarioNotes?.trim();
    const assumptionsText = body.assumptionsText?.trim();

    if (!ticker || !modelType) {
      return new Response(JSON.stringify({ error: 'Ticker and modelType are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: 'Server is missing OPENAI_API_KEY. Configure it in .env.local.'
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const client = new OpenAI({ apiKey });

    const prompt = [
      `Ticker: ${ticker}`,
      `Model type: ${modelType}`,
      `Include scenario engine input: ${includeScenario ? 'yes' : 'no'}`,
      scenarioNotes ? `Scenario details: ${scenarioNotes}` : 'Scenario details: none provided',
      `Include custom assumptions: ${includeAssumptions ? 'yes' : 'no'}`,
      includeAssumptions && assumptionsText ? `Custom assumptions:\n${assumptionsText}` : undefined,
      '',
      'Return clean JSON with the following schema:',
      `{
  "ticker": "${ticker}",
  "modelType": "${modelType}",
  "summary": "High level summary of what the model is analyzing",
  "keyAssumptions": ["Assumption bullet 1", "Assumption bullet 2"],
  "baseCase": {
    "impliedValuePerShare": number,
    "upsideDownsideVsSpot": "string description",
    "notes": "context"
  },
  "scenarios": include scenario blocks only if requested, each with name, assumptions, and valuation highlights
}`
    ]
      .filter(Boolean)
      .join('\n');

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You are a sell-side equity analyst building a structured valuation model. Return valid JSON only, no prose or markdown fences.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const rawContent = completion.choices[0]?.message?.content ?? '';
    const payload = safeJsonParse(rawContent) ?? {
      ticker,
      modelType,
      summary: rawContent
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Model generation error:', error);
    return new Response(JSON.stringify({ error: 'Unable to generate model. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function safeJsonParse(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const cleaned = trimmed
    .replace(/^```json/i, '')
    .replace(/^```/, '')
    .replace(/```$/, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.warn('Failed to parse JSON from OpenAI response:', error);
    return null;
  }
}


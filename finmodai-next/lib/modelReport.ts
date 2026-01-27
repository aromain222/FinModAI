import OpenAI from 'openai';

import type { ModelKind, ModelReport, ModelReportSection } from './modelReportTypes';

interface KeyOutputs {
  impliedPrice?: number;
  upsidePct?: number;
  entryMultiple?: number;
  exitMultiple?: number;
  irrPct?: number;
  moic?: number;
}

export interface BuildPromptArgs {
  ticker: string;
  companyName?: string;
  modelKind: ModelKind;
  keyOutputs?: KeyOutputs;
}

export function buildModelReportPrompt(args: BuildPromptArgs): { system: string; user: string } {
  const { ticker, companyName, modelKind, keyOutputs } = args;

  const baseSystem =
    'You are CapitalBase, a professional financial modeling assistant. Your audience is a junior to mid-level analyst in investment banking, private equity, or corporate finance. ' +
    'Write concise, analytical prose without hype, emojis, slang, or excessive bullet points. Explain cause and effect clearly and keep each paragraph tight.';

  const modelFlavor = (() => {
    switch (modelKind) {
      case 'dcf':
        return 'Focus on intrinsic value, cash flow durability, WACC, sensitivity, and long-term growth and margin drivers.';
      case 'lbo':
        return 'Focus on entry multiples, leverage profile, deleveraging path, IRR/MOIC, exit assumptions, and credit risk.';
      case 'comps':
        return 'Focus on relative valuation vs peers, screening signals, and where the company looks rich or cheap on key multiples.';
      case 'three_statement':
      default:
        return 'Focus on revenue growth, margin trajectory, free cash flow conversion, balance sheet health, and coverage metrics.';
    }
  })();

  const system = `${baseSystem} ${modelFlavor}`.trim();

  const lines: string[] = [
    `Ticker: ${ticker}`,
    companyName ? `Company: ${companyName}` : '',
    `Model kind: ${modelKind}`,
  ];

  if (keyOutputs) {
    lines.push('Key Outputs:');
    if (typeof keyOutputs.impliedPrice === 'number') {
      lines.push(`- Implied price/share: ${keyOutputs.impliedPrice.toFixed(2)}`);
    }
    if (typeof keyOutputs.upsidePct === 'number') {
      lines.push(`- Upside vs current: ${keyOutputs.upsidePct.toFixed(1)}%`);
    }
    if (typeof keyOutputs.entryMultiple === 'number') {
      lines.push(`- Entry multiple: ${keyOutputs.entryMultiple.toFixed(1)}x`);
    }
    if (typeof keyOutputs.exitMultiple === 'number') {
      lines.push(`- Exit multiple: ${keyOutputs.exitMultiple.toFixed(1)}x`);
    }
    if (typeof keyOutputs.irrPct === 'number') {
      lines.push(`- IRR: ${keyOutputs.irrPct.toFixed(1)}%`);
    }
    if (typeof keyOutputs.moic === 'number') {
      lines.push(`- MOIC: ${keyOutputs.moic.toFixed(2)}x`);
    }
  }

  lines.push(
    '',
    'Produce 4-6 sections with the following structure:',
    '• Executive Overview / summary',
    '• Business & positioning',
    '• Valuation takeaway tailored to the model type',
    '• Macro & market context',
    '• Key risks or watchpoints',
    '• Optional: How the analyst should use this output',
    '',
    'Return ONLY valid JSON matching this type: { "sections": [{ "id": string; "title": string; "body": string }] }. ' +
      'Each body must be 2-5 sentences, professional tone.'
  );

  return {
    system,
    user: lines.filter(Boolean).join('\n'),
  };
}

export interface GenerateModelReportArgs extends BuildPromptArgs {}

export async function generateModelReport(args: GenerateModelReportArgs): Promise<ModelReport> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY');
  }

  const { system, user } = buildModelReportPrompt(args);
  const start = Date.now();
  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const rawText = completion.choices[0]?.message?.content?.trim() ?? '';
  const sections = parseSections(rawText);

  const report: ModelReport = {
    ticker: args.ticker,
    companyName: args.companyName,
    modelKind: args.modelKind,
    asOfDate: new Date().toISOString(),
    runtimeSeconds: Math.round((Date.now() - start) / 1000),
    keyOutputs: args.keyOutputs,
    sections,
  };

  return report;
}

function parseSections(payload: string): ModelReportSection[] {
  if (!payload) {
    return [
      {
        id: 'analysis',
        title: 'Analysis',
        body: 'No report text was returned from the language model.',
      },
    ];
  }

  try {
    const parsed = JSON.parse(
      payload
        .replace(/^```json/i, '')
        .replace(/^```/, '')
        .replace(/```$/, '')
    );
    if (parsed && Array.isArray(parsed.sections)) {
      return parsed.sections.map((section: any, index: number) => ({
        id: String(section?.id ?? `section-${index}`),
        title: section?.title ?? 'Untitled',
        body: section?.body ?? '',
      }));
    }
  } catch (error) {
    console.warn('[modelReport] Failed to parse structured JSON', error, payload);
  }

  return [
    {
      id: 'raw',
      title: 'Analysis',
      body: payload,
    },
  ];
}


import {
  WorldBriefAnalysis,
  WorldBriefItem,
  WorldBriefResponse,
  WorldRegion,
  WorldTopic,
} from '@/types/worldBrief';

type Mode =
  | 'geopolitics'
  | 'policy'
  | 'sanctions'
  | 'energy'
  | 'elections'
  | 'climate'
  | 'cyber'
  | 'all';

const modeMap: Record<Mode, string[]> = {
  geopolitics: ['conflict', 'frontline', 'ceasefire', 'missile', 'drone', 'attack', 'strike', 'troop', 'border', 'refugee'],
  policy: ['law', 'regulation', 'parliament', 'congress', 'policy', 'cabinet', 'ministry', 'ban'],
  sanctions: ['sanction', 'export control', 'tariff', 'blacklist', 'embargo'],
  energy: ['pipeline', 'oil', 'gas', 'opec', 'lng', 'energy', 'grid', 'power'],
  elections: ['election', 'runoff', 'vote', 'ballot', 'polls', 'governance', 'coup'],
  climate: ['wildfire', 'hurricane', 'typhoon', 'earthquake', 'flood', 'storm', 'heatwave'],
  cyber: ['cyber', 'ransomware', 'malware', 'breach', 'hack', 'ddos', 'infrastructure'],
  all: [],
};

const junkKeywords = [
  'coupon',
  'deal',
  'discount',
  'gaming',
  'launches',
  'product launch',
  'best ',
  'crypto',
  'bitcoin',
  'eth',
  'nft',
  'speculation',
  'price target',
  'stocks might',
  'chart pattern',
];

const denyDomains = ['seekingalpha.com', 'benzinga.com', 'streetinsider.com', 'fxstreet.com', 'themotleyfool.com'];

const topicKeywords: Record<WorldTopic, string[]> = {
  conflict: ['missile', 'drone', 'attack', 'strike', 'frontline', 'shelling', 'ceasefire', 'troop', 'raid'],
  diplomacy: ['summit', 'talks', 'embassy', 'peace', 'envoy', 'delegation', 'un security council', 'nato'],
  sanctions: ['sanction', 'blacklist', 'export control', 'tariff', 'embargo'],
  trade: ['tariff', 'trade deal', 'fta', 'trade dispute', 'supply chain'],
  elections: ['election', 'runoff', 'ballot', 'vote', 'referendum', 'coup', 'parliamentary', 'governance'],
  energy_security: ['pipeline', 'opec', 'lng', 'oil tanker', 'gas', 'grid', 'power plant'],
  migration: ['migration', 'refugee', 'border crossing', 'asylum', 'displacement'],
  climate_disaster: ['earthquake', 'hurricane', 'cyclone', 'typhoon', 'wildfire', 'flood', 'storm', 'heatwave'],
  cyber: ['cyber', 'ransomware', 'malware', 'breach', 'hack', 'ddos', 'infrastructure'],
  public_health: ['outbreak', 'virus', 'epidemic', 'pandemic', 'vaccine', 'who declares'],
  other: [],
};

const regionMatchers: { region: WorldRegion; patterns: RegExp[] }[] = [
  { region: 'us', patterns: [/us\b/i, /u\.s\./i, /america\b/i, /washington\b/i] },
  { region: 'europe', patterns: [/eu\b/i, /europe/i, /brussels/i, /paris/i, /berlin/i, /london/i] },
  { region: 'china', patterns: [/china/i, /beijing/i, /prc\b/i] },
  { region: 'russia_ukraine', patterns: [/ukraine/i, /russia/i, /kremlin/i, /moscow/i, /kyiv/i] },
  { region: 'middle_east', patterns: [/israel/i, /gaza/i, /iran/i, /iraq/i, /saudi/i, /gcc\b/i, /turkey/i, /syria/i, /lebanon/i, /yemen/i] },
  { region: 'latam', patterns: [/brazil/i, /mexico/i, /argentina/i, /chile/i, /colombia/i, /peru/i] },
  { region: 'africa', patterns: [/africa/i, /nigeria/i, /kenya/i, /south africa/i, /egypt/i, /sahel/i, /sudan/i] },
  { region: 'asia', patterns: [/japan/i, /korea/i, /philippines/i, /india/i, /indonesia/i, /asia/i] },
];

const sourceWeights: Record<string, number> = {
  'reuters.com': 1.0,
  'apnews.com': 1.0,
  'bloomberg.com': 0.95,
  'ft.com': 0.9,
  'wsj.com': 0.9,
  'nytimes.com': 0.9,
  'washingtonpost.com': 0.85,
  'politico.com': 0.8,
  'aljazeera.com': 0.8,
};

const severityByTopic: Record<WorldTopic, number> = {
  conflict: 1.0,
  diplomacy: 0.6,
  sanctions: 0.8,
  trade: 0.6,
  elections: 0.7,
  energy_security: 0.8,
  migration: 0.6,
  climate_disaster: 0.8,
  cyber: 0.7,
  public_health: 0.7,
  other: 0.4,
};

const impactChannelsByTopic: Record<WorldTopic, string[]> = {
  conflict: ['energy', 'equities risk sentiment', 'FX'],
  diplomacy: ['equities risk sentiment', 'FX', 'rates'],
  sanctions: ['trade flows', 'commodities', 'inflation expectations'],
  trade: ['trade flows', 'FX', 'equities risk sentiment'],
  elections: ['rates', 'FX', 'credit spreads'],
  energy_security: ['energy', 'inflation expectations', 'rates'],
  migration: ['fiscal policy', 'rates', 'equities risk sentiment'],
  climate_disaster: ['commodities', 'inflation expectations', 'credit spreads'],
  cyber: ['equities risk sentiment', 'credit spreads', 'FX'],
  public_health: ['equities risk sentiment', 'rates', 'trade flows'],
  other: ['equities risk sentiment', 'rates', 'FX'],
};

export interface RawNewsItem {
  title: string;
  description?: string;
  url: string;
  source: string;
  publishedAt: string;
}

type ValidationIssue = { field: string; message: string };

type AnalysisDraft = {
  world_summary_sentences?: string[];
  market_impact_sentences?: string[];
  impact_channels?: string[];
  confidence?: 'low' | 'medium' | 'high';
  key_numbers?: { label: string; value: string }[];
  notes?: string;
};

function inferTopic(text: string): WorldTopic {
  const lower = text.toLowerCase();
  for (const [topic, keys] of Object.entries(topicKeywords) as [WorldTopic, string[]][]) {
    if (keys.some((k) => lower.includes(k))) return topic;
  }
  return 'other';
}

function inferRegion(text: string): WorldRegion {
  for (const entry of regionMatchers) {
    if (entry.patterns.some((p) => p.test(text))) return entry.region;
  }
  return 'global';
}

function matchesMode(text: string, mode: Mode): boolean {
  if (mode === 'all') return true;
  const keys = modeMap[mode];
  return keys.some((k) => text.toLowerCase().includes(k));
}

function isJunk(text: string, url: string): boolean {
  const lower = text.toLowerCase();
  if (junkKeywords.some((k) => lower.includes(k))) return true;
  return denyDomains.some((d) => url.includes(d));
}

function eligible(text: string): { ok: boolean; reasons: string[] } {
  const lower = text.toLowerCase();
  const triggers = [
    'missile',
    'drone',
    'attack',
    'strike',
    'ceasefire',
    'summit',
    'embassy',
    'treaty',
    'sanction',
    'export control',
    'tariff',
    'blacklist',
    'election',
    'runoff',
    'coup',
    'border',
    'refugee',
    'migration',
    'earthquake',
    'hurricane',
    'wildfire',
    'flood',
    'cyber',
    'infrastructure',
    'outbreak',
    'pandemic',
    'who declares',
  ];
  const hit = triggers.filter((t) => lower.includes(t));
  return { ok: hit.length > 0, reasons: hit };
}

function computeScore(publishedAt: string, topic: WorldTopic, url: string): number {
  const ageHours = Math.max(1, (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60));
  const recency = 1 / ageHours;
  const severity = severityByTopic[topic] || 0.5;
  const domain = new URL(url).hostname.replace(/^www\./, '');
  const credibility = sourceWeights[domain] ?? 0.6;
  return credibility * 0.4 + severity * 0.4 + recency * 0.2;
}

function fallbackWorldSentences(item: Pick<WorldBriefItem, 'title' | 'topic' | 'region'>): [string, string, string] {
  const topicLine: Record<WorldTopic, string> = {
    conflict: 'The development indicates active security tension and uncertain near-term diplomatic traction.',
    diplomacy: 'Diplomatic channels appear active, but implementation risks remain elevated for regional stability.',
    sanctions: 'Policy pressure appears focused on restrictions that could reshape bilateral and regional economic ties.',
    trade: 'Officials are signaling possible shifts in trade posture that could alter cross-border commercial flows.',
    elections: 'The political development could reshape policy direction and institutional decision-making in the coming months.',
    energy_security: 'Energy security concerns may stay elevated as governments reassess supply reliability and contingency plans.',
    migration: 'Cross-border movement pressures may keep policy coordination and humanitarian logistics in focus.',
    climate_disaster: 'Response capacity and infrastructure resilience are likely to remain central policy constraints.',
    cyber: 'Critical systems resilience and state-level cyber posture are likely to draw closer scrutiny.',
    public_health: 'Public health coordination may become a larger policy variable as authorities assess spillover risk.',
    other: 'The event may influence regional policy posture while details continue to develop.',
  };

  const regionLine =
    item.region === 'global'
      ? 'The implications are not isolated to one market and could influence broader international policy signals.'
      : `The situation could affect ${item.region.replace('_', ' ')} policy coordination and external risk perceptions.`;

  return [toSentence(item.title), topicLine[item.topic], regionLine];
}

function fallbackMarketSentences(item: Pick<WorldBriefItem, 'topic'>): string[] {
  const channels = impactChannelsByTopic[item.topic] || impactChannelsByTopic.other;
  const a = channels[0] || 'rates';
  const b = channels[1] || 'FX';
  const c = channels[2] || 'equities risk sentiment';
  return [
    `The event could reprice ${a} as investors reassess geopolitical and policy risk assumptions.`,
    `If developments escalate, ${b} could react through safe-haven positioning and regional allocation shifts.`,
    `Cross-asset sentiment may remain sensitive, with ${c} likely reacting to headline momentum.`,
    `Portfolio rebalancing and hedging flows could amplify short-term volatility across related assets.`,
    `Market impact likely remains contained unless the situation escalates or policy responses shift.`,
  ];
}

function toSentence(input: string): string {
  const clean = input.trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  const tail = clean.slice(-1);
  return ['.', '!', '?'].includes(tail) ? clean : `${clean}.`;
}

function normalizeSentence(input: string): string {
  return toSentence(input)
    .replace(/\s+/g, ' ')
    .trim();
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function sentenceWordCountOk(text: string, minWords: number, maxWords: number): boolean {
  const count = words(text).length;
  return count >= minWords && count <= maxWords;
}

function overlapRatio(a: string, b: string): number {
  const sa = new Set(words(a));
  const sb = new Set(words(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let overlap = 0;
  for (const token of sa) {
    if (sb.has(token)) overlap += 1;
  }
  return overlap / Math.min(sa.size, sb.size);
}

function hasDuplicateSentences(sentences: string[]): boolean {
  for (let i = 0; i < sentences.length; i += 1) {
    for (let j = i + 1; j < sentences.length; j += 1) {
      const a = normalizeSentence(sentences[i]).toLowerCase();
      const b = normalizeSentence(sentences[j]).toLowerCase();
      if (a === b) return true;
      if (overlapRatio(a, b) > 0.82) return true;
    }
  }
  return false;
}

function tupleWhat(input: string[]): [string, string] {
  return [input[0], input[1]];
}

function tupleImpact(input: string[]): string[] {
  return input.slice(0, 6);
}

function validateDraft(
  draft: AnalysisDraft,
  _marketLens: boolean
): { ok: true; value: WorldBriefAnalysis } | { ok: false; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const what = Array.isArray((draft as any).what_happened)
    ? (draft as any).what_happened.map(normalizeSentence).filter(Boolean)
    : [];
  const market = Array.isArray((draft as any).market_impact)
    ? (draft as any).market_impact.map(normalizeSentence).filter(Boolean)
    : [];
  const channelsRaw: string[] = Array.isArray((draft as any).affected_channels)
    ? (draft as any).affected_channels.map((x: any) => String(x).trim()).filter(Boolean)
    : [];
  const confidence = draft.confidence;

  if (what.length !== 2) {
    issues.push({ field: 'what_happened', message: 'Must have exactly 2 sentences.' });
  }

  if (what.some((s: string) => !sentenceWordCountOk(s, 8, 24))) {
    issues.push({ field: 'what_happened', message: 'Each sentence must be 8-24 words.' });
  }

  if (hasDuplicateSentences(what)) {
    issues.push({ field: 'what_happened', message: 'Sentences contain duplicates/near-duplicates.' });
  }

  if (market.length < 4 || market.length > 6) {
    issues.push({ field: 'market_impact', message: 'Must have approximately 5 market impact sentences (4-6).' });
  }
  if (market.some((s: string) => !sentenceWordCountOk(s, 10, 35))) {
    issues.push({ field: 'market_impact', message: 'Each market sentence must be 10-35 words.' });
  }
  if (hasDuplicateSentences(market)) {
    issues.push({ field: 'market_impact', message: 'Market impact sentences contain duplicates/near-duplicates.' });
  }

  const allowedChannels = new Set([
    'equities',
    'rates',
    'FX',
    'commodities',
    'credit',
    'volatility',
    'capital_flows',
  ]);
  const channels = channelsRaw.filter((c: string) => allowedChannels.has(c));
  if (channels.length < 2 || channels.length > 5) {
    issues.push({ field: 'affected_channels', message: 'Must include 2-5 affected channels from the allowlist.' });
  }
  if (channels.length !== channelsRaw.length) {
    issues.push({ field: 'affected_channels', message: 'Contains invalid channel(s).' });
  }

  if (!confidence || !['low', 'medium', 'high'].includes(confidence)) {
    issues.push({ field: 'confidence', message: 'Confidence must be low|medium|high.' });
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      what_happened: tupleWhat(what),
      market_impact: tupleImpact(market),
      affected_channels: channels as any,
      confidence: confidence as 'low' | 'medium' | 'high',
      key_numbers: Array.isArray(draft.key_numbers)
        ? draft.key_numbers
            .filter((x) => x && typeof x.label === 'string' && typeof x.value === 'string')
            .map((x) => ({ label: x.label.trim(), value: x.value.trim() }))
        : [],
      notes: typeof draft.notes === 'string' ? draft.notes.trim() : '',
    },
  };
}

function repairAnalysis(item: WorldBriefItem, marketLens: boolean, reason: string): WorldBriefAnalysis {
  const world = fallbackWorldSentences(item);
  const market = fallbackMarketSentences(item);
  return {
    what_happened: tupleWhat(world.slice(0, 2)),
    market_impact: tupleImpact(market),
    affected_channels: impactChannelsByTopic[item.topic].slice(0, 3) as any,
    confidence: 'low',
    key_numbers: [],
    notes: `Fallback analysis used: ${reason}`,
  };
}

const analysisSchema = `
Return JSON only with this exact schema:
{
  "what_happened": ["...", "..."], // exactly 2 sentences
  "market_impact": ["...", "...", "...", "...", "..."], // approximately 5 sentences — write as a short paragraph
  "affected_channels": ["rates", "FX"], // 2-5 channels
  "confidence": "low|medium|high",
  "key_numbers": [{"label":"", "value":""}],
  "notes": ""
}

Rules:
- what_happened: 8-24 words per sentence. Do not restate the headline verbatim.
- market_impact: Write approximately 5 sentences (4-6 allowed). Each sentence 10-35 words. Form a coherent paragraph: name asset classes and regions explicitly, explain mechanisms, then discuss volatility/hedging and conditions for escalation or containment. No duplicate or near-duplicate sentences.
- No invented stats, index moves, or casualty counts.
- Use directional language when justified. Avoid "will"; prefer "could/may/likely if".
- If impact is limited, explicitly say: "Market impact likely limited unless further escalation occurs."
`;

async function generateAnalysis(
  openai: any,
  item: WorldBriefItem,
  _marketLens: boolean
): Promise<WorldBriefAnalysis> {
  const userPrompt = `
Headline: ${item.title}
Source: ${item.source}
Published: ${item.publishedAt}
Topic: ${item.topic}
Region: ${item.region}
Why included keywords: ${item.whyIncluded.join(', ')}
${analysisSchema}
`;

  const runAttempt = async (extraInstruction?: string) => {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a senior macro strategist writing concise, decisive market intelligence for professional investors. Return strict JSON only. Avoid fabricated numbers.',
        },
        {
          role: 'user',
          content: `${userPrompt}${extraInstruction ? `\n${extraInstruction}` : ''}`,
        },
      ],
    });
    const content = completion.choices?.[0]?.message?.content || '{}';
    return JSON.parse(content) as AnalysisDraft;
  };

  // First attempt
  try {
    const draft = await runAttempt();
    const validated = validateDraft(draft, true);
    if (validated.ok) return validated.value;
  } catch {
    // Continue to retry/repair.
  }

  // Retry with hard correction
  try {
    const retryDraft = await runAttempt(
      'Rewrite to satisfy schema exactly. Return JSON only. what_happened must have exactly 2 sentences. market_impact must have approximately 5 sentences (4-6).'
    );
    const validatedRetry = validateDraft(retryDraft, true);
    if (validatedRetry.ok) return validatedRetry.value;
    return repairAnalysis(item, true, validatedRetry.issues.map((i) => `${i.field}: ${i.message}`).join('; '));
  } catch {
    return repairAnalysis(item, true, 'AI parse/validation failed');
  }
}

export function tagAndFilter(items: RawNewsItem[], mode: Mode): WorldBriefItem[] {
  const results: WorldBriefItem[] = [];

  for (const item of items) {
    const text = `${item.title} ${item.description || ''}`;
    if (isJunk(text, item.url)) continue;
    if (!matchesMode(text, mode)) continue;
    const eligibility = eligible(text);
    if (!eligibility.ok) continue;

    const topic = inferTopic(text);
    const region = inferRegion(text);
    const tags = [...new Set([...eligibility.reasons, topic, region])];

    results.push({
      title: item.title,
      source: item.source,
      url: item.url,
      publishedAt: item.publishedAt,
      topic,
      region,
      tags,
      whyIncluded: eligibility.reasons.length ? eligibility.reasons : ['keyword match'],
      analysis: {
        what_happened: tupleWhat(fallbackWorldSentences({ title: item.title, topic, region }).slice(0, 2)),
        market_impact: tupleImpact(fallbackMarketSentences({ topic })),
        affected_channels: impactChannelsByTopic[topic].slice(0, 3) as any,
        confidence: 'low',
        key_numbers: [],
        notes: 'Placeholder analysis before enrichment.',
      },
    });
  }

  return results
    .map((r) => ({ ...r, _score: computeScore(r.publishedAt, r.topic, r.url) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 12)
    .map(({ _score, ...rest }) => rest);
}

export async function applySummaries(
  items: WorldBriefItem[],
  marketLens: boolean
): Promise<WorldBriefItem[]> {
  const { getOpenAIKey } = await import('@/lib/openaiKey');
  const apiKey = getOpenAIKey('service');
  const useAI =
    typeof apiKey === 'string' && !apiKey.includes('REDACTED') && apiKey.trim().length >= 10;

  if (!useAI) {
    return items.map((item) => ({
      ...item,
      analysis: repairAnalysis(item, true, 'OpenAI key unavailable'),
    }));
  }

  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey });

  const enriched = await Promise.all(
    items.map(async (item) => {
      try {
        const analysis = await generateAnalysis(openai, item, true);
        return { ...item, analysis };
      } catch (error) {
        console.error(`[worldBrief] analysis failure for "${item.title}"`, error);
        return {
          ...item,
          analysis: repairAnalysis(item, true, 'AI analysis failure'),
        };
      }
    })
  );

  return enriched;
}

export function runWorldBriefValidationFixtures() {
  const sample: WorldBriefItem = {
    title: 'Emergency summit announced after regional missile exchanges',
    source: 'fixture',
    url: 'https://example.com',
    publishedAt: new Date().toISOString(),
    topic: 'conflict',
    region: 'middle_east',
    tags: ['missile', 'summit'],
    whyIncluded: ['missile', 'summit'],
    analysis: repairAnalysis(
      {
        title: 'Emergency summit announced after regional missile exchanges',
        source: 'fixture',
        url: 'https://example.com',
        publishedAt: new Date().toISOString(),
        topic: 'conflict',
        region: 'middle_east',
        tags: ['missile', 'summit'],
        whyIncluded: ['missile', 'summit'],
        analysis: {} as WorldBriefAnalysis,
      },
      true,
      'fixture'
    ),
  };

  const whatLen = sample.analysis.what_happened.length;
  const marketLen = sample.analysis.market_impact.length;
  return {
    ok: whatLen === 2 && marketLen >= 4 && marketLen <= 6,
    whatLen,
    marketLen,
  };
}

export async function buildResponse(
  items: WorldBriefItem[],
  mode: Mode,
  rangeDays: number,
  _marketLens: boolean
): Promise<WorldBriefResponse> {
  return {
    items,
    generatedAt: new Date().toISOString(),
    mode,
    rangeDays,
    note: items.length < 5 ? 'Not enough high-quality world headlines recently.' : undefined,
  };
}

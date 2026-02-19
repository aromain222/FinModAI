import type { RawNewsItem } from '@/lib/worldBrief';

export type MacroRegion =
  | 'north_america'
  | 'latin_america'
  | 'europe'
  | 'middle_east'
  | 'africa'
  | 'asia_pacific'
  | 'global';

export type MacroImpactTag =
  | 'rates'
  | 'fx'
  | 'equities'
  | 'credit'
  | 'commodities'
  | 'energy'
  | 'inflation'
  | 'growth'
  | 'trade'
  | 'policy'
  | 'geopolitics';

export type MacroEventSource = {
  url: string;
  source: string;
  title: string;
  publishedAt: string;
};

export type MacroEvent = {
  id: string;
  eventTitle: string;
  whatHappened: string;
  whyItMatters: Array<{ tag: MacroImpactTag; text: string }>;
  region: MacroRegion;
  countryCodes: string[];
  impactTags: MacroImpactTag[];
  confidence: number;
  importanceScore: number;
  sources: MacroEventSource[];
  entities: string[];
  publishedAt: string;
  updatedAt: string;
};

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'for', 'in', 'on', 'with', 'as', 'by', 'from',
  'after', 'over', 'at', 'amid', 'into', 'new', 'says', 'say', 'said', 'will', 'may', 'could',
]);

const TRIGGER_TERMS = [
  'sanction', 'export control', 'tariff', 'trade ban', 'embargo', 'summit', 'ceasefire',
  'attack', 'strike', 'missile', 'drone', 'invasion', 'coup', 'election', 'referendum',
  'rate hike', 'rate cut', 'central bank', 'opec', 'oil', 'gas', 'lng', 'pipeline',
  'blackout', 'outage', 'shutdown', 'cyberattack', 'ransomware', 'earthquake', 'hurricane',
  'wildfire', 'flood', 'outbreak', 'pandemic',
];

const OPINION_TERMS = [
  'what to watch', 'opinion', 'analysis', 'explainer', 'why it matters', 'here is why',
  'preview', 'outlook', 'earnings', 'stocks', 'market wrap', 'weekly recap',
];

const VERBS = [
  'imposes', 'announces', 'approves', 'signs', 'targets', 'launches', 'raises', 'cuts',
  'deploys', 'suspends', 'halts', 'expands', 'tightens', 'eases', 'conducts', 'opens',
];

const ACTORS = [
  'United States', 'U.S.', 'EU', 'European Union', 'UK', 'United Kingdom', 'Russia', 'China',
  'Japan', 'India', 'Iran', 'Israel', 'Saudi Arabia', 'OPEC', 'OPEC+', 'NATO', 'UN',
  'European Commission', 'White House', 'Treasury', 'Federal Reserve', 'ECB', 'BoJ',
  'PBOC', 'IMF', 'World Bank',
];

const COUNTRY_CODES: Record<string, string> = {
  'United States': 'US',
  'U.S.': 'US',
  'US': 'US',
  'United Kingdom': 'GB',
  'UK': 'GB',
  'European Union': 'EU',
  'EU': 'EU',
  'Russia': 'RU',
  'China': 'CN',
  'Japan': 'JP',
  'India': 'IN',
  'Iran': 'IR',
  'Israel': 'IL',
  'Saudi Arabia': 'SA',
  'Ukraine': 'UA',
  'Germany': 'DE',
  'France': 'FR',
  'Italy': 'IT',
  'Turkey': 'TR',
  'Canada': 'CA',
  'Mexico': 'MX',
  'Brazil': 'BR',
  'Australia': 'AU',
  'South Korea': 'KR',
  'North Korea': 'KP',
};

const REGION_BY_COUNTRY: Record<string, MacroRegion> = {
  US: 'north_america',
  CA: 'north_america',
  MX: 'latin_america',
  BR: 'latin_america',
  EU: 'europe',
  GB: 'europe',
  DE: 'europe',
  FR: 'europe',
  IT: 'europe',
  RU: 'europe',
  UA: 'europe',
  TR: 'middle_east',
  IR: 'middle_east',
  IL: 'middle_east',
  SA: 'middle_east',
  CN: 'asia_pacific',
  JP: 'asia_pacific',
  IN: 'asia_pacific',
  KR: 'asia_pacific',
  KP: 'asia_pacific',
  AU: 'asia_pacific',
};

const CREDIBLE_DOMAINS = new Set([
  'reuters.com', 'apnews.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'nytimes.com',
  'washingtonpost.com', 'economist.com', 'bbc.co.uk', 'bbc.com', 'aljazeera.com',
  'politico.com', 'defense.gov', 'whitehouse.gov', 'ec.europa.eu',
  'imf.org', 'worldbank.org', 'treasury.gov', 'federalreserve.gov', 'ecb.europa.eu',
  'boj.or.jp', 'pbc.gov.cn', 'un.org', 'nato.int',
]);

const OFFICIAL_HINTS = [
  'ministry', 'central bank', 'treasury', 'white house', 'european commission',
  'official statement', 'government', 'defense ministry', 'foreign ministry',
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/g)
    .filter((t) => t && !STOPWORDS.has(t));
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  setA.forEach((x) => {
    if (setB.has(x)) inter++;
  });
  return inter / (setA.size + setB.size - inter);
}

function extractEntities(text: string): string[] {
  const entities = new Set<string>();
  for (const actor of ACTORS) {
    const pattern = new RegExp(`\\b${actor.replace('.', '\\.')}\\b`, 'i');
    if (pattern.test(text)) entities.add(actor);
  }
  for (const [name] of Object.entries(COUNTRY_CODES)) {
    const pattern = new RegExp(`\\b${name.replace('.', '\\.')}\\b`, 'i');
    if (pattern.test(text)) entities.add(name);
  }
  return Array.from(entities);
}

function extractCountryCodes(entities: string[]): string[] {
  const codes = new Set<string>();
  entities.forEach((e) => {
    const code = COUNTRY_CODES[e];
    if (code) codes.add(code);
  });
  return Array.from(codes);
}

function inferRegion(codes: string[]): MacroRegion {
  if (!codes.length) return 'global';
  const regions = codes.map((c) => REGION_BY_COUNTRY[c]).filter(Boolean) as MacroRegion[];
  if (!regions.length) return 'global';
  const counts = regions.reduce<Record<string, number>>((acc, r) => {
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {});
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as MacroRegion) || 'global';
}

function scoreEventLikeness(item: RawNewsItem): number {
  const text = `${item.title} ${item.description || ''}`.toLowerCase();
  const triggerHit = TRIGGER_TERMS.filter((t) => text.includes(t)).length;
  const hasEntity = extractEntities(text).length > 0 ? 1 : 0;
  const timeBounded = /(today|overnight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(text) ? 1 : 0;
  const opinionPenalty = OPINION_TERMS.some((t) => text.includes(t)) ? 1 : 0;
  const score = triggerHit * 0.35 + hasEntity * 0.25 + timeBounded * 0.2 - opinionPenalty * 0.4;
  return Math.max(0, Math.min(1, score));
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isCredibleSource(url: string): boolean {
  const domain = domainOf(url);
  return CREDIBLE_DOMAINS.has(domain);
}

function isOfficialSource(item: RawNewsItem): boolean {
  const text = `${item.title} ${item.description || ''} ${item.source}`.toLowerCase();
  if (OFFICIAL_HINTS.some((h) => text.includes(h))) return true;
  const domain = domainOf(item.url);
  return domain.endsWith('.gov') || domain.endsWith('.int');
}

function impactTagsFor(text: string): MacroImpactTag[] {
  const lower = text.toLowerCase();
  const tags = new Set<MacroImpactTag>();
  if (/(rate|central bank|yield|bond)/i.test(lower)) tags.add('rates');
  if (/(fx|currency|yen|euro|dollar)/i.test(lower)) tags.add('fx');
  if (/(equities|stocks|index|market)/i.test(lower)) tags.add('equities');
  if (/(credit|default|spread)/i.test(lower)) tags.add('credit');
  if (/(oil|gas|lng|commodity|opec|energy)/i.test(lower)) tags.add('commodities');
  if (/(oil|gas|lng|pipeline|opec)/i.test(lower)) tags.add('energy');
  if (/(inflation|price|cpi)/i.test(lower)) tags.add('inflation');
  if (/(growth|gdp|recession|slowdown)/i.test(lower)) tags.add('growth');
  if (/(tariff|trade|export|import|sanction)/i.test(lower)) tags.add('trade');
  if (/(policy|regulation|law|parliament|congress|ministry)/i.test(lower)) tags.add('policy');
  if (/(attack|missile|ceasefire|conflict|invasion|coup|sanction)/i.test(lower)) tags.add('geopolitics');
  if (tags.size === 0) tags.add('geopolitics');
  return Array.from(tags);
}

function buildEventTitle(item: RawNewsItem, entities: string[]): string {
  const title = item.title.replace(/\s+/g, ' ').trim();
  const actor = entities[0] || ACTORS.find((a) => new RegExp(`\\b${a.replace('.', '\\.')}\\b`, 'i').test(title)) || 'Officials';
  const lower = title.toLowerCase();
  const verb = VERBS.find((v) => lower.includes(` ${v} `)) || 'announce';
  if (title.toLowerCase().startsWith(actor.toLowerCase())) {
    return title;
  }
  const verbIdx = lower.indexOf(verb);
  if (verbIdx > 0) {
    const object = title.slice(verbIdx + verb.length).trim();
    if (object) return `${actor} ${verb} ${object}`;
  }
  return `${actor} ${verb} ${title}`;
}

function buildWhyItMatters(tags: MacroImpactTag[], headline: string): Array<{ tag: MacroImpactTag; text: string }> {
  const primary = tags.slice(0, 3);
  const templates: Record<MacroImpactTag, string> = {
    rates: `Rates could react if this development shifts policy expectations or term-premium assumptions.`,
    fx: `FX markets may reprice relative risk and capital flows tied to the affected region.`,
    equities: `Equities could react if risk sentiment or sector exposure changes materially.`,
    credit: `Credit spreads could widen if the event increases default or funding risk.`,
    commodities: `Commodities may move if supply expectations or transport risks change.`,
    energy: `Energy markets could respond if supply reliability or logistics are affected.`,
    inflation: `Inflation expectations may shift if supply constraints or pricing power changes.`,
    growth: `Growth expectations could adjust if trade or investment slows.`,
    trade: `Trade flows could be disrupted or rerouted depending on policy implementation.`,
    policy: `Policy risk could rise if authorities signal tighter controls or enforcement.`,
    geopolitics: `Geopolitical risk premia may increase if tensions escalate.`,
  };
  return primary.map((tag) => ({ tag, text: templates[tag] || `Macro impact likely through ${tag} channel.` }));
}

function makeId(base: string): string {
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;
  }
  return `ev_${Math.abs(hash)}`;
}

function withinHours(a: string, b: string, hours: number): boolean {
  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return diff <= hours * 3600 * 1000;
}

type Cluster = {
  items: RawNewsItem[];
  entities: string[];
  tokens: string[];
};

export function buildMacroEvents(raw: RawNewsItem[], minScore = 0.25): { events: MacroEvent[]; developing: MacroEvent[] } {
  const candidates = raw
    .map((item) => ({ item, score: scoreEventLikeness(item) }))
    .filter((c) => c.score >= minScore)
    .sort((a, b) => new Date(b.item.publishedAt).getTime() - new Date(a.item.publishedAt).getTime());

  const clusters: Cluster[] = [];

  for (const { item } of candidates) {
    const entities = extractEntities(`${item.title} ${item.description || ''}`);
    const tokens = tokenize(item.title);
    let assigned = false;

    for (const cluster of clusters) {
      const entityOverlap = cluster.entities.some((e) => entities.includes(e));
      const similarity = jaccard(tokens, cluster.tokens);
      const timeClose = withinHours(item.publishedAt, cluster.items[0].publishedAt, 96);
      if (entityOverlap && similarity >= 0.25 && timeClose) {
        cluster.items.push(item);
        cluster.entities = Array.from(new Set([...cluster.entities, ...entities]));
        cluster.tokens = Array.from(new Set([...cluster.tokens, ...tokens]));
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      clusters.push({ items: [item], entities, tokens });
    }
  }

  const events: MacroEvent[] = [];
  const developing: MacroEvent[] = [];

  for (const cluster of clusters) {
    const items = cluster.items;
    const sourceSet = new Set(items.map((i) => domainOf(i.url)));
    const credibleCount = items.filter((i) => isCredibleSource(i.url)).length;
    const officialCount = items.filter((i) => isOfficialSource(i)).length;
    const hasCredible = credibleCount > 0;
    const allow = sourceSet.size >= 2 && credibleCount >= 2 ? true : hasCredible && officialCount >= 1;

    const sample = items[0];
    const entities = cluster.entities;
    const countryCodes = extractCountryCodes(entities);
    const region = inferRegion(countryCodes);
    const impactTags = impactTagsFor(`${sample.title} ${sample.description || ''}`);

    const eventTitle = buildEventTitle(sample, entities);
    const whatHappened = sample.description?.trim()
      ? sample.description.trim().replace(/\s+/g, ' ')
      : sample.title;
    const whyItMatters = buildWhyItMatters(impactTags, sample.title);

    const sources: MacroEventSource[] = items.map((i) => ({
      url: i.url,
      source: i.source,
      title: i.title,
      publishedAt: i.publishedAt,
    }));

    const confidence = Math.min(
      0.95,
      0.55 + credibleCount * 0.12 + officialCount * 0.1 + Math.min(0.1, (sourceSet.size - 2) * 0.03)
    );

    const combinedText = items.map((i) => `${i.title} ${i.description || ''}`).join(' ').toLowerCase();
    const triggerHit = TRIGGER_TERMS.filter((t) => combinedText.includes(t)).length;
    const entityBoost = Math.min(0.2, cluster.entities.length * 0.04);
    const sourceBoost = Math.min(0.3, credibleCount * 0.08 + officialCount * 0.1 + Math.max(0, sourceSet.size - 1) * 0.05);
    const impactBoost = impactTags.includes('energy') || impactTags.includes('rates') || impactTags.includes('geopolitics') ? 0.12 : 0.06;
    const conflictBoost = /(attack|strike|missile|invasion|coup|sanction|embargo|ceasefire)/i.test(combinedText) ? 0.12 : 0;
    const importanceScore = clamp(0.2 + triggerHit * 0.06 + entityBoost + sourceBoost + impactBoost + conflictBoost, 0, 1);

    const event: MacroEvent = {
      id: makeId(`${eventTitle}-${sample.publishedAt}`),
      eventTitle,
      whatHappened,
      whyItMatters,
      region,
      countryCodes,
      impactTags,
      confidence,
      importanceScore,
      sources,
      entities,
      publishedAt: sample.publishedAt,
      updatedAt: new Date().toISOString(),
    };

    if (allow) events.push(event);
    else developing.push(event);
  }

  return { events, developing };
}

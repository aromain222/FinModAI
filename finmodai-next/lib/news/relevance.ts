export type RelevanceEventType =
  | 'policy'
  | 'rates'
  | 'inflation'
  | 'growth'
  | 'energy'
  | 'fx'
  | 'credit'
  | 'geopolitics'
  | 'equities'
  | 'other';

export type RelevanceAssessment = {
  score: number;
  eventType: RelevanceEventType;
  reasons: string[];
  accepted: boolean;
};

const EVENT_PATTERNS: Array<{
  eventType: RelevanceEventType;
  weight: number;
  patterns: RegExp[];
}> = [
  {
    eventType: 'policy',
    weight: 34,
    patterns: [
      /\bfederal reserve\b/i,
      /\bcentral bank\b/i,
      /\brate decision\b/i,
      /\bfomc\b/i,
      /\becb\b/i,
      /\bboe\b/i,
      /\bboj\b/i,
      /\blagarde\b/i,
      /\bpowell\b/i,
      /\bgovernor\b/i,
      /\bpolicy makers?\b/i,
      /\btariffs?\b/i,
      /\bhawkish\b/i,
      /\bdovish\b/i,
    ],
  },
  {
    eventType: 'rates',
    weight: 28,
    patterns: [
      /\btreasury yields?\b/i,
      /\bbond yields?\b/i,
      /\bfed funds\b/i,
      /\brate differentials?\b/i,
      /\bterm premium\b/i,
      /\breal yields?\b/i,
      /\bcurve\b/i,
    ],
  },
  {
    eventType: 'inflation',
    weight: 28,
    patterns: [/\bcpi\b/i, /\bpce\b/i, /\bppi\b/i, /\binflation\b/i, /\bprice pressures?\b/i, /\bdeflator\b/i],
  },
  {
    eventType: 'growth',
    weight: 24,
    patterns: [
      /\bgdp\b/i,
      /\bpayrolls?\b/i,
      /\bjobs?\b/i,
      /\bunemployment\b/i,
      /\brecession\b/i,
      /\bpmi\b/i,
      /\bism\b/i,
      /\bretail sales\b/i,
    ],
  },
  {
    eventType: 'energy',
    weight: 22,
    patterns: [/\boil\b/i, /\bwti\b/i, /\bbrent\b/i, /\bopec\b/i, /\bcrude\b/i, /\beia\b/i, /\bnatural gas\b/i, /\bsupply risks?\b/i],
  },
  {
    eventType: 'fx',
    weight: 20,
    patterns: [/\bdxy\b/i, /\bdollar\b/i, /\bcurrency\b/i, /\bfx\b/i, /\byen\b/i, /\beuro\b/i, /\byuan\b/i, /\bsterling\b/i, /\brate differentials?\b/i],
  },
  {
    eventType: 'credit',
    weight: 20,
    patterns: [/\bcredit spreads?\b/i, /\bhigh yield\b/i, /\binvestment grade\b/i, /\bdefault\b/i, /\bdowngrade\b/i, /\bliquidity\b/i],
  },
  {
    eventType: 'geopolitics',
    weight: 18,
    patterns: [
      /\bsanctions?\b/i,
      /\bwar\b/i,
      /\bceasefire\b/i,
      /\bgeopolitical\b/i,
      /\btrade ban\b/i,
      /\bmiddle east\b/i,
      /\bukraine\b/i,
      /\btaiwan\b/i,
      /\bred sea\b/i,
    ],
  },
  {
    eventType: 'equities',
    weight: 16,
    patterns: [
      /\bs&p 500\b/i,
      /\bstocks?\b/i,
      /\bearnings\b/i,
      /\bvix\b/i,
      /\bvolatility\b/i,
      /\bnasdaq\b/i,
      /\bdow\b/i,
      /\bstoxx\b/i,
      /\bmsci\b/i,
    ],
  },
];

const NOISE_PATTERNS: RegExp[] = [
  /\bproduct launch\b/i,
  /\bcelebrity\b/i,
  /\bsports\b/i,
  /\bentertainment\b/i,
  /\blifestyle\b/i,
  /\bgaming\b/i,
  /\bthrift stores?\b/i,
  /\bthrift\b/i,
  /\bdentist\b/i,
  /\btooth decay\b/i,
  /\bozempic teeth\b/i,
  /\bpodcast\b/i,
  /\bfill your trunk\b/i,
  /\bunder \$?\d+\b/i,
  /\bwhere you can\b/i,
  /\bstocks to watch\b/i,
  /\bwhy is nobody talking about\b/i,
  /\bcivic polls?\b/i,
  /\bstate election\b/i,
  /\bfashion\b/i,
  /\btravel tips?\b/i,
  /\brecipe\b/i,
  /\bhealth tips?\b/i,
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function assessHeadlineRelevance(params: {
  title: string;
  description: string | null;
  source: string;
  minScore?: number;
}): RelevanceAssessment {
  const text = `${params.title}\n${params.description ?? ''}`;
  const minScore = params.minScore ?? 35;
  const reasons: string[] = [];

  let score = 0;
  let best: { eventType: RelevanceEventType; weight: number } = { eventType: 'other', weight: 0 };

  for (const entry of EVENT_PATTERNS) {
    const hits = entry.patterns.filter((pattern) => pattern.test(text)).length;
    if (hits === 0) continue;
    const contribution = Math.min(entry.weight, hits * Math.ceil(entry.weight / 3));
    score += contribution;
    reasons.push(`${entry.eventType}:${hits}`);
    if (contribution > best.weight) {
      best = { eventType: entry.eventType, weight: contribution };
    }
  }

  if (/\b(market|markets|macro|yields?|treasury|rates?|inflation|policy|earnings|equity|equities|stocks?|bonds?|credit|fx|dollar)\b/i.test(text)) {
    score += 8;
    reasons.push('context:market');
  }

  if (/\b(reuters|bloomberg|financial times|wall street journal|cnbc)\b/i.test(params.source)) {
    score += 8;
    reasons.push('source:top-tier');
  }

  if (NOISE_PATTERNS.some((pattern) => pattern.test(text))) {
    score -= 22;
    reasons.push('noise:detected');
  }

  const normalizedScore = clamp(score, 0, 100);
  const effectiveEventType: RelevanceEventType =
    reasons.includes('noise:detected') && normalizedScore < 40 ? 'other' : best.eventType;
  return {
    score: normalizedScore,
    eventType: effectiveEventType,
    reasons,
    accepted: normalizedScore >= minScore && effectiveEventType !== 'other',
  };
}

export function filterRelevantHeadlines<T extends { title: string; description: string | null; source: string }>(
  items: T[],
  minScore = 35
): Array<T & { relevance: RelevanceAssessment }> {
  return items
    .map((item) => {
      const relevance = assessHeadlineRelevance({
        title: item.title,
        description: item.description,
        source: item.source,
        minScore,
      });
      return { ...item, relevance };
    })
    .filter((item) => item.relevance.accepted)
    .sort((a, b) => b.relevance.score - a.relevance.score);
}

export type MacroEvent = {
  sector: string;
  title: string;
  source?: string;
  date?: string; // ISO
  url?: string;
  tone?: 'positive' | 'negative' | 'neutral';
  magnitude?: number;
  type?: string; // e.g. "rates","inflation","geopolitics","earnings","regulation"
};

export type SectorSignal = {
  sector: string;
  title: string;
  source?: string;
  date?: string;
  url?: string;
  tone: 'positive' | 'negative' | 'neutral';
  type?: string;
  recencyDays: number;
  impact: number;
};

export type SectorMomentum = {
  sector: string;
  score: number; // [-100, 100]
  direction: 'up' | 'down' | 'flat';
  summary: string;
  drivers: { label: string; impact: number }[];
  drags: { label: string; impact: number }[];
  components: {
    eventTitle: string;
    impact: number;
    tone: string;
    recencyDays: number;
    source?: string;
    url?: string;
    date?: string;
  }[];
  evidence: {
    title: string;
    source?: string;
    date?: string;
    url?: string;
    impact: number;
    tone?: string;
    type?: string;
  }[];
  eventCount: number;
  hasHighConfidenceSignals: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const sourceWeight = (source?: string) => {
  if (!source) return 0.9;
  const normalized = source.toLowerCase();
  if (
    normalized.includes('reuters') ||
    normalized.includes('wsj') ||
    normalized.includes('wall street journal') ||
    normalized.includes('ft') ||
    normalized.includes('financial times') ||
    normalized.includes('bloomberg')
  ) {
    return 1.2;
  }
  return 1.0;
};

const recencyWeight = (date?: string) => {
  if (!date) return 0.25;
  const eventDate = new Date(date);
  if (Number.isNaN(eventDate.getTime())) return 0.25;
  const diffDays = Math.max(0, (Date.now() - eventDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 2) return 1.0;
  if (diffDays <= 7) return 0.8;
  if (diffDays <= 30) return 0.5;
  return 0.25;
};

const recencyDays = (date?: string) => {
  if (!date) return 90;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return 90;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
};

const magnitudeWeight = (magnitude?: number) => {
  if (magnitude === null || magnitude === undefined || Number.isNaN(magnitude)) return 1.0;
  const normalized = magnitude > 1 ? magnitude / 100 : magnitude;
  return clamp(normalized, 0.5, 1.2);
};

const sentimentWeight = (tone?: string) => {
  if (tone === 'negative') return -1.0;
  if (tone === 'neutral') return 0.2;
  return 1.0;
};

const summarize = (
  sector: string,
  score: number,
  drivers: { label: string }[],
  drags: { label: string }[],
  hasHighConfidence: boolean,
  signalCount: number
) => {
  if (!hasHighConfidence) {
    return 'No high-confidence macro events detected in the last 7 days. Score is market-derived.';
  }

  const driverList = drivers.slice(0, 1).map((d) => d.label).join(', ');
  const dragList = drags.slice(0, 1).map((d) => d.label).join(', ');

  if (score > 15) {
    return `${sector} momentum rising; strongest driver: ${driverList || 'recent positive flow'} (${signalCount} signals).`;
  }
  if (score < -15) {
    return `${sector} momentum falling; strongest drag: ${dragList || 'recent negative flow'} (${signalCount} signals).`;
  }
  return `${sector} is flat with mixed signals (${signalCount} events).`;
};

const HIGH_CONFIDENCE_WINDOW_DAYS = 7;

const toSignal = (event: MacroEvent): SectorSignal | null => {
  if (!event.sector || !event.title) return null;
  const recency = recencyDays(event.date);
  const impact =
    sourceWeight(event.source) *
    recencyWeight(event.date) *
    magnitudeWeight(event.magnitude) *
    sentimentWeight(event.tone);

  return {
    sector: event.sector,
    title: event.title,
    source: event.source,
    date: event.date,
    url: event.url,
    tone: (event.tone as SectorSignal['tone']) ?? 'neutral',
    type: event.type,
    recencyDays: recency,
    impact,
  };
};

export function buildSectorMomentum(events: MacroEvent[]): SectorMomentum[] {
  if (!events || events.length === 0) return [];

  const signals = events
    .map(toSignal)
    .filter((s): s is SectorSignal => Boolean(s));

  const bySector = new Map<string, SectorSignal[]>();
  signals.forEach((signal) => {
    if (!bySector.has(signal.sector)) bySector.set(signal.sector, []);
    bySector.get(signal.sector)!.push(signal);
  });

  return Array.from(bySector.entries()).map(([sector, sectorEvents]) => {
    const recentSignals = sectorEvents.filter((s) => s.recencyDays <= 30);
    const highConfidenceSignals = sectorEvents.filter(
      (s) => s.recencyDays <= HIGH_CONFIDENCE_WINDOW_DAYS && Math.abs(s.impact) >= 0.25
    );

    const totalImpact = recentSignals.reduce((sum, comp) => sum + comp.impact, 0);
    const score = clamp(Math.round(totalImpact * 40), -100, 100);
    const direction = score > 15 ? 'up' : score < -15 ? 'down' : 'flat';

    const sorted = [...recentSignals].sort((a, b) => b.impact - a.impact);
    const drivers = sorted
      .filter((comp) => comp.impact > 0)
      .slice(0, 5)
      .map((comp) => ({
        label: `${comp.type ?? 'event'}: ${comp.title.slice(0, 80)}${comp.title.length > 80 ? '...' : ''}`,
        impact: comp.impact,
      }));
    const drags = sorted
      .filter((comp) => comp.impact < 0)
      .slice(0, 5)
      .map((comp) => ({
        label: `${comp.type ?? 'event'}: ${comp.title.slice(0, 80)}${comp.title.length > 80 ? '...' : ''}`,
        impact: comp.impact,
      }));

    const evidence = sorted
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
      .slice(0, 10)
      .map((comp) => ({
        title: comp.title,
        source: comp.source,
        date: comp.date,
        url: comp.url,
        impact: comp.impact,
        tone: comp.tone,
        type: comp.type,
      }));

    const hasHighConfidence = highConfidenceSignals.length > 0;
    const summary = summarize(sector, score, drivers, drags, hasHighConfidence, recentSignals.length);

    return {
      sector,
      score,
      direction,
      summary,
      drivers,
      drags,
      components: recentSignals.map(({ type, ...rest }) => rest),
      evidence,
      eventCount: recentSignals.length,
      hasHighConfidenceSignals: hasHighConfidence,
    };
  });
}

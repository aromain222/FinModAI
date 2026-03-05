import { createHash } from 'crypto';
import type { GatedCandidate, GateCategory } from '@/lib/events/gateScore';

export type EventCluster = {
  fingerprint: string;
  gateCategory: Exclude<GateCategory, 'REJECT'>;
  titleStem: string;
  canonicalTitle: string;
  keyEntities: string[];
  firstSeenAt: string;
  lastUpdatedAt: string;
  items: GatedCandidate[];
};

function stableHash(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function normalizeStem(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4)
    .slice(0, 12)
    .join(' ');
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function stemTokens(stem: string): Set<string> {
  return new Set(stem.split(/\s+/).filter(Boolean));
}

function buildFingerprint(gateCategory: Exclude<GateCategory, 'REJECT'>, titleStem: string, entities: string[]): string {
  const key = `${titleStem}|${entities.slice(0, 8).sort().join('|')}|${gateCategory}`;
  return stableHash(key);
}

function coalesceEntities(items: GatedCandidate[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    for (const entity of item.entities) {
      if (seen.has(entity)) continue;
      seen.add(entity);
      out.push(entity);
      if (out.length >= 10) return out;
    }
  }
  return out;
}

export function clusterCandidates(candidates: GatedCandidate[]): EventCluster[] {
  const sorted = candidates
    .slice()
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const clusters: EventCluster[] = [];

  for (const candidate of sorted) {
    const stem = normalizeStem(candidate.title);
    const fingerprint = buildFingerprint(candidate.gateCategory, stem, candidate.entities);

    let cluster = clusters.find((item) => item.fingerprint === fingerprint);

    if (!cluster) {
      const candidateTokens = stemTokens(stem);
      cluster = clusters.find((item) => {
        if (item.gateCategory !== candidate.gateCategory) return false;
        const score = jaccardSimilarity(candidateTokens, stemTokens(item.titleStem));
        return score >= 0.62;
      });
    }

    if (!cluster) {
      clusters.push({
        fingerprint,
        gateCategory: candidate.gateCategory,
        titleStem: stem,
        canonicalTitle: candidate.title,
        keyEntities: candidate.entities.slice(0, 10),
        firstSeenAt: candidate.publishedAt,
        lastUpdatedAt: candidate.publishedAt,
        items: [candidate],
      });
      continue;
    }

    cluster.items.push(candidate);
    if (new Date(candidate.publishedAt).getTime() < new Date(cluster.firstSeenAt).getTime()) {
      cluster.firstSeenAt = candidate.publishedAt;
    }
    if (new Date(candidate.publishedAt).getTime() > new Date(cluster.lastUpdatedAt).getTime()) {
      cluster.lastUpdatedAt = candidate.publishedAt;
      cluster.canonicalTitle = candidate.title;
    }
    cluster.keyEntities = coalesceEntities(cluster.items);
  }

  for (const cluster of clusters) {
    cluster.items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  }

  return clusters.sort(
    (a, b) =>
      new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime() ||
      b.items.length - a.items.length
  );
}

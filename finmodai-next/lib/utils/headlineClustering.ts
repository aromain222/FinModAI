/**
 * Headline Clustering for Market Brief
 * 
 * Avoids multiple cards describing the same underlying event by:
 * 1) Normalizing headlines (lowercase, strip punctuation, remove stopwords)
 * 2) Computing similarity using shared keyword overlap (≥60%)
 * 3) Clustering headlines into events
 * 4) Picking clearest headline per cluster + attaching related sources
 */

// Common English stopwords to filter out
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'by', 'for',
  'from', 'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that',
  'the', 'to', 'was', 'will', 'with', 'the', 'this', 'but', 'they',
  'have', 'had', 'what', 'said', 'each', 'which', 'their', 'time',
  'if', 'up', 'out', 'many', 'then', 'them', 'these', 'so', 'some',
  'her', 'would', 'make', 'like', 'into', 'him', 'has', 'two', 'more',
  'very', 'after', 'words', 'long', 'than', 'first', 'been', 'call',
  'who', 'oil', 'its', 'now', 'find', 'down', 'day', 'did', 'get',
  'come', 'made', 'may', 'part', 'new', 'year', 'over', 'take', 'say',
]);

/**
 * Normalize a headline for comparison:
 * - Lowercase
 * - Strip punctuation
 * - Remove stopwords
 * - Split into words
 */
function normalizeHeadline(headline: string): string[] {
  return headline
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word)); // Filter short words and stopwords
}

/**
 * Compute similarity between two normalized headline word arrays
 * Returns a value between 0 and 1 (1 = identical, 0 = no overlap)
 * Uses Jaccard similarity: intersection / union
 */
function computeSimilarity(words1: string[], words2: string[]): number {
  if (words1.length === 0 || words2.length === 0) {
    return 0;
  }

  const set1 = new Set(words1);
  const set2 = new Set(words2);

  // Intersection
  const intersection = new Set(Array.from(set1).filter((x) => set2.has(x)));

  // Union
  const union = new Set([...Array.from(set1), ...Array.from(set2)]);

  // Jaccard similarity
  return intersection.size / union.size;
}

/**
 * Determine which headline is "clearest" (best to use as primary)
 * Criteria (in order):
 * 1. Longest (more descriptive)
 * 2. Most recent (more timely)
 * 3. Contains key market terms (rates, oil, fed, earnings, etc.)
 */
function pickClearestHeadline(
  headlines: Array<{ title: string; publishedAt: string; index: number }>
): number {
  const MARKET_TERMS = [
    'rate', 'fed', 'fomc', 'cpi', 'inflation', 'oil', 'crude', 'earnings',
    'profit', 'revenue', 'geopolitical', 'war', 'sanction', 'trade',
  ];

  let bestIndex = 0;
  let bestScore = -1;

  headlines.forEach((h, idx) => {
    const titleLower = h.title.toLowerCase();
    let score = 0;

    // Length score (normalized, capped at 100 chars)
    score += Math.min(h.title.length / 100, 1) * 30;

    // Recency score (more recent = higher)
    const publishedDate = new Date(h.publishedAt);
    const now = new Date();
    const hoursAgo = (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60);
    score += Math.max(0, 1 - hoursAgo / 24) * 40; // Decay over 24 hours

    // Market terms score
    const marketTermCount = MARKET_TERMS.filter((term) =>
      titleLower.includes(term)
    ).length;
    score += (marketTermCount / MARKET_TERMS.length) * 30;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = idx;
    }
  });

  return bestIndex;
}

export type HeadlineInput = {
  title: string;
  source?: string;
  publishedAt: string;
  [key: string]: any; // Allow additional fields to pass through
};

export type ClusteredHeadline = {
  title: string;
  source?: string;
  publishedAt: string;
  relatedSources?: Array<{ source: string; publishedAt: string }>; // 2-5 related sources
  [key: string]: any; // Preserve other fields
};

/**
 * Cluster headlines to avoid duplicate events
 * 
 * @param headlines - Array of headline objects with at least title, source, publishedAt
 * @param similarityThreshold - Minimum similarity to cluster (default 0.6 = 60%)
 * @param maxClusters - Maximum number of clusters/cards (default 10)
 * @returns Clustered headlines with primary headline + related sources
 */
export function clusterHeadlines(
  headlines: HeadlineInput[],
  similarityThreshold: number = 0.6,
  maxClusters: number = 10
): ClusteredHeadline[] {
  if (headlines.length === 0) {
    return [];
  }

  // Normalize all headlines
  const normalized = headlines.map((h, idx) => ({
    original: h,
    words: normalizeHeadline(h.title),
    index: idx,
  }));

  // Find clusters using a simple greedy algorithm
  const clusters: Array<number[]> = [];
  const assigned = new Set<number>();

  for (let i = 0; i < normalized.length && clusters.length < maxClusters; i++) {
    if (assigned.has(i)) continue;

    // Start a new cluster
    const cluster: number[] = [i];
    assigned.add(i);

    // Find similar headlines
    for (let j = i + 1; j < normalized.length; j++) {
      if (assigned.has(j)) continue;

      const similarity = computeSimilarity(
        normalized[i].words,
        normalized[j].words
      );

      if (similarity >= similarityThreshold) {
        cluster.push(j);
        assigned.add(j);
      }
    }

    clusters.push(cluster);
  }

  // Build clustered headlines
  const result: ClusteredHeadline[] = clusters.map((clusterIndices) => {
    const clusterHeadlines = clusterIndices.map((idx) => ({
      title: headlines[idx].title,
      publishedAt: headlines[idx].publishedAt,
      source: headlines[idx].source,
      index: idx,
    }));

    // Pick clearest headline as primary
    const primaryIdx = pickClearestHeadline(clusterHeadlines);
    const primary = clusterHeadlines[primaryIdx];
    const others = clusterHeadlines.filter((_, idx) => idx !== primaryIdx);

    // Build related sources (2-5 max)
    const relatedSources = others
      .slice(0, 5)
      .filter((h) => h.source && h.source !== primary.source && h.source !== 'Unknown')
      .slice(0, 5)
      .map((h) => ({
        source: h.source || 'Unknown',
        publishedAt: h.publishedAt,
      }));

    // Preserve all fields from original primary headline
    const primaryOriginal = headlines[clusterIndices[primaryIdx]];
    const clustered: ClusteredHeadline = {
      ...primaryOriginal,
      title: primary.title,
      source: primary.source,
      publishedAt: primary.publishedAt,
    };

    // Add related sources if any
    if (relatedSources.length > 0) {
      clustered.relatedSources = relatedSources.slice(0, 5); // Max 5
    }

    return clustered;
  });

  return result;
}


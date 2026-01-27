/**
 * Headline Clustering
 * Groups similar headlines within a time window and picks representative headlines
 */

import type { NewsItem } from './types';

/**
 * Simple token-based similarity (Jaccard similarity on words)
 * Fallback when embeddings are not available
 */
function tokenSimilarity(text1: string, text2: string): number {
  const tokens1 = new Set(text1.toLowerCase().split(/\s+/).filter(t => t.length > 2));
  const tokens2 = new Set(text2.toLowerCase().split(/\s+/).filter(t => t.length > 2));
  
  if (tokens1.size === 0 && tokens2.size === 0) return 1.0;
  if (tokens1.size === 0 || tokens2.size === 0) return 0.0;
  
  const tokens1Array = Array.from(tokens1);
  const tokens2Array = Array.from(tokens2);
  const intersection = new Set(tokens1Array.filter(t => tokens2.has(t)));
  const union = new Set([...tokens1Array, ...tokens2Array]);
  
  return intersection.size / union.size;
}

/**
 * Cluster headlines by similarity within a time window
 */
export function clusterHeadlines(
  headlines: NewsItem[],
  timeWindowHours: number = 48,
  similarityThreshold: number = 0.3
): NewsItem[][] {
  if (headlines.length === 0) return [];
  
  // Sort by publishedAt
  const sorted = [...headlines].sort((a, b) => 
    new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
  );
  
  const clusters: NewsItem[][] = [];
  const used = new Set<number>();
  
  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    
    const cluster: NewsItem[] = [sorted[i]];
    used.add(i);
    
    const baseTime = new Date(sorted[i].publishedAt).getTime();
    const baseText = sorted[i].title + ' ' + (sorted[i].summary || '');
    
    // Find similar headlines within time window
    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(j)) continue;
      
      const candidateTime = new Date(sorted[j].publishedAt).getTime();
      const hoursDiff = (candidateTime - baseTime) / (1000 * 60 * 60);
      
      // Check time window
      if (hoursDiff > timeWindowHours) break; // Sorted, so can break early
      
      // Check similarity
      const candidateText = sorted[j].title + ' ' + (sorted[j].summary || '');
      const similarity = tokenSimilarity(baseText, candidateText);
      
      if (similarity >= similarityThreshold) {
        cluster.push(sorted[j]);
        used.add(j);
      }
    }
    
    clusters.push(cluster);
  }
  
  return clusters;
}

/**
 * Pick representative headline from a cluster
 * Prefers:
 * 1. Major sources (Reuters, Bloomberg, WSJ, etc.)
 * 2. Most recent
 * 3. Longest title (more descriptive)
 */
export function pickRepresentativeHeadline(cluster: NewsItem[]): NewsItem {
  if (cluster.length === 1) return cluster[0];
  
  const majorSources = ['reuters', 'bloomberg', 'wsj', 'wall street journal', 'ft', 'financial times', 'cnbc', 'marketwatch', 'yahoo finance'];
  
  // Try to find major source first
  for (const headline of cluster) {
    const sourceLower = headline.source.toLowerCase();
    if (majorSources.some(major => sourceLower.includes(major))) {
      return headline;
    }
  }
  
  // Otherwise, prefer most recent
  const sorted = [...cluster].sort((a, b) => 
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  
  // Among recent ones, prefer longer titles (more descriptive)
  const recent = sorted.filter(h => {
    const timeDiff = new Date(sorted[0].publishedAt).getTime() - new Date(h.publishedAt).getTime();
    return timeDiff < 6 * 60 * 60 * 1000; // Within 6 hours
  });
  
  if (recent.length > 0) {
    return recent.sort((a, b) => b.title.length - a.title.length)[0];
  }
  
  return sorted[0];
}

/**
 * Cluster and deduplicate headlines
 */
export function deduplicateHeadlines(headlines: NewsItem[]): NewsItem[] {
  const clusters = clusterHeadlines(headlines, 48, 0.3);
  return clusters.map(cluster => pickRepresentativeHeadline(cluster));
}


import type { RawDealArticle } from '@/lib/deal-intelligence/pipeline';

export type ArticleQueryWindow = {
  fromDate?: string; // ISO date
  toDate?: string; // ISO date
  limit?: number;
};

/**
 * Article ingestion boundary for Deal Intelligence.
 * Future implementations can read from Supabase, data lake tables, or ingestion queues.
 */
export interface DealIntelligenceArticleProvider {
  listRawArticles(window?: ArticleQueryWindow): Promise<RawDealArticle[]>;
}

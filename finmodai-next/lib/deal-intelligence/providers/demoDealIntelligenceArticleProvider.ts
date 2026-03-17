import type { RawDealArticle } from '@/lib/deal-intelligence/pipeline';
import type { ArticleQueryWindow, DealIntelligenceArticleProvider } from '@/lib/deal-intelligence/providers/articleProvider';

/**
 * Demo placeholder provider for article ingestion.
 * Returns no rows so the service keeps using curated demo weekly briefs.
 */
export class DemoDealIntelligenceArticleProvider implements DealIntelligenceArticleProvider {
  async listRawArticles(_window?: ArticleQueryWindow): Promise<RawDealArticle[]> {
    return [];
  }
}

export const demoDealIntelligenceArticleProvider = new DemoDealIntelligenceArticleProvider();

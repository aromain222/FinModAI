/**
 * Fetch Macro News
 */

export interface MacroNewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary?: string;
}

export async function fetchMacroNews(limit: number = 10): Promise<MacroNewsItem[]> {
  // Stub implementation - would fetch from news API
  return [
    {
      title: 'Fed Holds Rates Steady',
      source: 'Financial Times',
      url: '#',
      publishedAt: new Date().toISOString(),
      summary: 'Federal Reserve maintains current interest rate policy.'
    }
  ];
}

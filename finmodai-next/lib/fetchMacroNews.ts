type NewsResult = {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
};

export async function fetchMacroNews(query = 'global macroeconomy'): Promise<string | null> {
  const apiKey = process.env.NEWS_API_KEY || process.env.NEWSAPI_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const endpoint = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&pageSize=3&sortBy=publishedAt`;
    const res = await fetch(endpoint + `&apiKey=${apiKey}`, {
      next: {
        revalidate: 300
      }
    });

    if (!res.ok) {
      console.warn('NewsAPI request failed', await res.text());
      return null;
    }

    const payload = await res.json();
    if (!Array.isArray(payload?.articles) || payload.articles.length === 0) {
      return null;
    }

    const summaries: NewsResult[] = payload.articles.slice(0, 3).map((article: any) => ({
      title: String(article?.title ?? '').trim(),
      source: String(article?.source?.name ?? 'Unknown'),
      publishedAt: article?.publishedAt ?? '',
      url: article?.url ?? ''
    }));

    return summaries
      .map((item) => `• ${item.title} (${item.source}, ${new Date(item.publishedAt).toLocaleDateString()})`)
      .join('\n');
  } catch (error) {
    console.error('fetchMacroNews error', error);
    return null;
  }
}


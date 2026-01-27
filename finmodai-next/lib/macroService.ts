import { APP_NAME } from '@/lib/branding';

export type MacroSnapshot = {
  indices: Array<{ name: string; level: number; changePercent: number }>;
  yields: { tenYear: number };
  headlines: Array<{ title: string; source: string; url: string }>;
};

export async function fetchMacroSnapshot(): Promise<MacroSnapshot> {
  try {
    return await fetchLiveData();
  } catch (error) {
    console.error('Macro snapshot fallback', error);
    return getFallbackMacro();
  }
}

async function fetchLiveData(): Promise<MacroSnapshot> {
  const fmpKey = process.env.FMP_API_KEY;
  const newsKey = process.env.NEWSAPI_API_KEY;
  if (!fmpKey || !newsKey) throw new Error('Missing API keys');

  const [indicesRes, newsRes] = await Promise.all([
    fetch(`https://financialmodelingprep.com/api/v3/quote/%5EGSPC,%5EIXIC,%5EDJI?apikey=${fmpKey}`, { next: { revalidate: 300 } }),
    fetch(`https://newsapi.org/v2/top-headlines?category=business&pageSize=5&apiKey=${newsKey}`, { next: { revalidate: 300 } })
  ]);

  if (!indicesRes.ok || !newsRes.ok) throw new Error('Remote API failed');

  const indicesJson = await indicesRes.json();
  const newsJson = await newsRes.json();

  const indices = (indicesJson ?? []).map((item: any) => ({
    name: item.name ?? item.symbol,
    level: Number(item.price ?? 0),
    changePercent: Number(item.changesPercentage ?? 0)
  }));

  const headlines = (newsJson?.articles ?? []).slice(0, 5).map((article: any) => ({
    title: article.title,
    source: article.source?.name ?? 'News',
    url: article.url
  }));

  return { indices, yields: { tenYear: 0 }, headlines };
}

export function getFallbackMacro(): MacroSnapshot {
  return {
    indices: [
      { name: 'S&P 500', level: 5172, changePercent: 0.42 },
      { name: 'NASDAQ', level: 16325, changePercent: 0.55 },
      { name: 'Dow Jones', level: 39080, changePercent: -0.12 }
    ],
    yields: { tenYear: 4.25 },
    headlines: [
      { title: 'Energy names lead weekly gains as crude tightens', source: `${APP_NAME} Wire`, url: '#' },
      { title: 'IPO calendar restarts with mid-cap software listing', source: 'Deal Monitor', url: '#' },
      { title: 'Private credit spreads tighten further', source: 'Credit Journal', url: '#' }
    ]
  };
}

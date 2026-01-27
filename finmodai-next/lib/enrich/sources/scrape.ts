const USER_AGENT = 'CapitalBase/1.0 (enrichment; contact: dev@capitalbase.local)';

const clip = (text: string, max = 20000) => (text.length > max ? `${text.slice(0, max)}\n...[TRUNCATED]` : text);

const stripHtml = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/?[^>]+(>|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function fetchText(url: string) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.8',
    },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const body = await res.text();
  return { url, text: clip(stripHtml(body)) };
}

export async function fetchScrapeSources(ticker: string) {
  const lower = ticker.toLowerCase();
  const urls = [
    `https://stockanalysis.com/stocks/${lower}/`,
    `https://companiesmarketcap.com/${lower}/marketcap/`,
  ];
  const results = await Promise.all(urls.map((url) => fetchText(url)));
  return results.filter(Boolean) as Array<{ url: string; text: string }>;
}

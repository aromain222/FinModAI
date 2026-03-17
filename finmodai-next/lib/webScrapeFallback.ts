/**
 * Web Scraping Fallback with OpenAI Extraction
 * 
 * Uses Scrape.do and ScraperAPI for robust scraping
 * OpenAI extracts structured financial data from HTML
 */

import OpenAI from 'openai';
import { fetchWithRetry } from './apiClient';
import apiCache, { cacheKeys, TTL } from './apiCache';
import type { LTMFinancials } from './getLTMFinancials';

/**
 * Scrape using Scrape.do (preferred)
 */
async function scrapeWithScrapeDo(url: string): Promise<string | null> {
  const apiKey = process.env.SCRAPE_DO_API_KEY;
  if (!apiKey) {
    console.warn('[webScrape] SCRAPE_DO_API_KEY not configured');
    return null;
  }

  try {
    const scrapeDoUrl = `http://api.scrape.do?token=${apiKey}&url=${encodeURIComponent(url)}`;
    const response = await fetchWithRetry(scrapeDoUrl, {}, { maxRetries: 2 });

    if (!response.ok) {
      console.warn(`[webScrape] Scrape.do failed: ${response.status}`);
      return null;
    }

    const html = await response.text();
    return html;
  } catch (error: any) {
    console.error('[webScrape] Scrape.do error:', error.message);
    return null;
  }
}

/**
 * Scrape using ScraperAPI (fallback)
 */
async function scrapeWithScraperAPI(url: string): Promise<string | null> {
  const apiKey = process.env.SCRAPER_API_KEY;
  if (!apiKey) {
    console.warn('[webScrape] SCRAPER_API_KEY not configured');
    return null;
  }

  try {
    const scraperApiUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(url)}`;
    const response = await fetchWithRetry(scraperApiUrl, {}, { maxRetries: 2 });

    if (!response.ok) {
      console.warn(`[webScrape] ScraperAPI failed: ${response.status}`);
      return null;
    }

    const html = await response.text();
    return html;
  } catch (error: any) {
    console.error('[webScrape] ScraperAPI error:', error.message);
    return null;
  }
}

/**
 * Direct fetch (last resort)
 */
export async function scrapeDirect(url: string): Promise<string | null> {
  try {
    const response = await fetchWithRetry(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    }, { maxRetries: 1 });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    return html;
  } catch (error: any) {
    console.error('[webScrape] Direct fetch error:', error.message);
    return null;
  }
}

/**
 * Extract financial data from HTML using OpenAI
 */
async function extractFinancialsWithOpenAI(
  html: string,
  ticker: string
): Promise<Partial<LTMFinancials> | null> {
  const { getOpenAIKey } = await import('@/lib/openaiKey');
  const apiKey = getOpenAIKey('service');
  if (!apiKey) {
    console.warn('[webScrape] OpenAI key not configured (OPENAI_SERVICE_API_KEY or OPENAI_API_KEY)');
    return null;
  }

  try {
    const openai = new OpenAI({ apiKey });

    // Extract text content more intelligently - look for financial tables/sections
    // Remove script and style tags first
    const cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    // Look for financial keywords and extract surrounding context
    const financialKeywords = ['revenue', 'ebitda', 'net income', 'total debt', 'cash', 'shares outstanding', 'market cap', 'total assets'];
    let relevantText = '';
    
    for (const keyword of financialKeywords) {
      const regex = new RegExp(`[^.]{0,200}${keyword}[^.]{0,200}`, 'gi');
      const matches = cleanHtml.match(regex);
      if (matches) {
        relevantText += matches.slice(0, 3).join(' ') + '\n';
      }
    }
    
    // If we found relevant text, use it; otherwise use truncated HTML
    const textToAnalyze = relevantText.length > 100 ? relevantText.slice(0, 8000) : cleanHtml.slice(0, 10000);

    const prompt = `You are extracting financial data for ${ticker} from a financial website (Yahoo Finance, MarketWatch, etc.).

Extract the following financial metrics from the text/HTML below. All monetary values should be in MILLIONS (not billions or raw numbers).

Look for:
- Revenue (annual revenue, total revenue, net sales)
- EBITDA (earnings before interest, taxes, depreciation, amortization)
- Net Income (net earnings, profit)
- Total Debt (total liabilities, debt)
- Cash (cash and cash equivalents, cash on hand)
- Total Assets
- Total Liabilities
- Shares Outstanding (shares, outstanding shares, float)
- Market Cap (market capitalization, market value)

Return JSON ONLY with these fields (use null if not found, convert billions to millions):
{
  "revenue": number | null,
  "ebitda": number | null,
  "netIncome": number | null,
  "totalDebt": number | null,
  "cash": number | null,
  "totalAssets": number | null,
  "totalLiabilities": number | null,
  "sharesOutstanding": number | null,
  "marketCap": number | null,
  "beta": number | null
}

Text/HTML:
${textToAnalyze}`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-5.4',
      messages: [
        {
          role: 'system',
          content: 'You are a financial data extraction expert. Extract structured financial data from HTML/text. Convert all values to millions. Return valid JSON only. If a field cannot be found, use null.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.warn(`[webScrape] No content from OpenAI for ${ticker}`);
      return null;
    }

    const extracted = JSON.parse(content);
    
    // Validate that we got at least some data
    const hasData = Object.values(extracted).some(v => v !== null && typeof v === 'number' && v > 0);
    
    if (!hasData) {
      console.warn(`[webScrape] OpenAI extraction returned all nulls for ${ticker}`);
      return null;
    }
    
    console.log(`[webScrape] ✅ OpenAI extracted data for ${ticker}:`, Object.keys(extracted).filter(k => extracted[k] != null));

    return extracted;
  } catch (error: any) {
    console.error('[webScrape] OpenAI extraction error:', error.message);
    return null;
  }
}

/**
 * Scrape Yahoo Finance for ticker data
 */
export async function scrapeYahooFinance(ticker: string): Promise<string | null> {
  const url = `https://finance.yahoo.com/quote/${ticker}/financials`;
  console.log(`[webScrape] Scraping Yahoo Finance: ${url}`);

  // Check cache first
  const cacheKey = cacheKeys.scrapedData(url);
  const cached = apiCache.get<string>(cacheKey);
  if (cached) {
    console.log('[webScrape] Using cached Yahoo Finance HTML');
    return cached;
  }

  // Try Scrape.do first, then ScraperAPI, then direct
  let html = await scrapeWithScrapeDo(url);
  if (!html) {
    html = await scrapeWithScraperAPI(url);
  }
  if (!html) {
    html = await scrapeDirect(url);
  }

  if (html) {
    apiCache.set(cacheKey, html, TTL.ONE_HOUR);
  }

  return html;
}

/**
 * Scrape MarketWatch for ticker data
 */
export async function scrapeMarketWatch(ticker: string): Promise<string | null> {
  const url = `https://www.marketwatch.com/investing/stock/${ticker.toLowerCase()}/financials`;
  console.log(`[webScrape] Scraping MarketWatch: ${url}`);

  const cacheKey = cacheKeys.scrapedData(url);
  const cached = apiCache.get<string>(cacheKey);
  if (cached) {
    return cached;
  }

  let html = await scrapeWithScrapeDo(url);
  if (!html) {
    html = await scrapeWithScraperAPI(url);
  }
  if (!html) {
    html = await scrapeDirect(url);
  }

  if (html) {
    apiCache.set(cacheKey, html, TTL.ONE_HOUR);
  }

  return html;
}

/**
 * Scrape SEC EDGAR for ticker data
 */
export async function scrapeSECFiling(ticker: string): Promise<string | null> {
  // SEC doesn't require scraping service (public API)
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${ticker}&type=10-K&dateb=&owner=exclude&count=1`;
  console.log(`[webScrape] Scraping SEC EDGAR: ${url}`);

  const cacheKey = cacheKeys.scrapedData(url);
  const cached = apiCache.get<string>(cacheKey);
  if (cached) {
    return cached;
  }

  const html = await scrapeDirect(url);
  if (html) {
    apiCache.set(cacheKey, html, TTL.ONE_DAY);
  }

  return html;
}

// Global attempt tracker to prevent multiple calls for same ticker
const webScrapeAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_WEB_SCRAPE_ATTEMPTS = 1; // Only try once per ticker per session
const WEB_SCRAPE_COOLDOWN = 5 * 60 * 1000; // 5 minute cooldown

/**
 * Main function: Fetch financials via web scraping + OpenAI extraction
 */
export async function fetchFinancialsViaWebScraping(
  ticker: string
): Promise<Partial<LTMFinancials> | null> {
  const cleanTicker = ticker.toUpperCase().trim();
  
  // Check if we've already attempted for this ticker
  const attempt = webScrapeAttempts.get(cleanTicker);
  const now = Date.now();
  
  if (attempt) {
    if (attempt.count >= MAX_WEB_SCRAPE_ATTEMPTS) {
      console.log(`[webScrape] Skipping ${cleanTicker} - already attempted ${attempt.count} time(s)`);
      return null;
    }
    
    // Check cooldown
    if (now - attempt.lastAttempt < WEB_SCRAPE_COOLDOWN) {
      console.log(`[webScrape] Skipping ${cleanTicker} - in cooldown period`);
      return null;
    }
  }
  
  // Record attempt
  webScrapeAttempts.set(cleanTicker, {
    count: (attempt?.count || 0) + 1,
    lastAttempt: now
  });
  
  console.log(`[webScrape] Attempting web scrape for ${cleanTicker} (attempt ${webScrapeAttempts.get(cleanTicker)?.count})`);

  // Try Yahoo Finance first
  let html = await scrapeYahooFinance(cleanTicker);
  let source = 'Yahoo Finance';

  // Fallback to MarketWatch
  if (!html) {
    html = await scrapeMarketWatch(cleanTicker);
    source = 'MarketWatch';
  }

  // Fallback to SEC
  if (!html) {
    html = await scrapeSECFiling(cleanTicker);
    source = 'SEC EDGAR';
  }

  if (!html) {
    console.warn(`[webScrape] No HTML retrieved for ${cleanTicker}`);
    return null;
  }

  // Extract data using OpenAI
  const extracted = await extractFinancialsWithOpenAI(html, cleanTicker);
  if (!extracted) {
    console.warn(`[webScrape] OpenAI extraction returned null for ${cleanTicker}`);
    return null;
  }
  
  // Validate we got at least some data
  const hasAnyData = Object.values(extracted).some(v => 
    v !== null && 
    typeof v === 'number' && 
    isFinite(v) && 
    v > 0 &&
    !isNaN(v)
  );
  
  if (!hasAnyData) {
    console.warn(`[webScrape] OpenAI extraction returned all nulls/invalid for ${cleanTicker}`);
    return null;
  }

  // Add metadata
  return {
    ...extracted,
    ticker: cleanTicker,
    companyName: cleanTicker,
    dataSource: `Web Scrape (${source})`,
  } as Partial<LTMFinancials>;
}

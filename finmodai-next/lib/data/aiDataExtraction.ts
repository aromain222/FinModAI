/**
 * AI-Powered Data Extraction
 * Uses OpenAI to extract financial data from web pages, SEC filings, and unstructured text
 */

import OpenAI from 'openai';
import { fetchFinancialsViaWebScraping } from '../webScrapeFallback';
import apiCache, { cacheKeys, TTL } from '../apiCache';
import type { LTMFinancials } from '../getLTMFinancials';
import { getOpenAIKey } from '@/lib/openaiKey';

function getOpenAIClient(): OpenAI | null {
  const apiKey = getOpenAIKey('service');
  return apiKey ? new OpenAI({ apiKey }) : null;
}
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4';

export interface MissingFieldRequest {
  ticker: string;
  companyName?: string;
  sector?: string;
  missingFields: string[];
  context?: Record<string, any>; // Existing data for context
}

export interface ExtractedData {
  // Numeric fields are stored directly on this object by key (e.g. "revenue").
  // Metadata fields ("confidence", "source", "method") are also present.
  [field: string]: number | null | string;
  confidence: 'high' | 'medium' | 'low';
  source: string;
  method: 'web-scrape' | 'openai-extraction' | 'openai-inference';
}

// Track extraction attempts to prevent multiple calls for same ticker
const extractionAttempts = new Map<string, number>();
const MAX_EXTRACTION_ATTEMPTS = 1; // Only try once per ticker

/**
 * Extract missing financial data using AI + Web Scraping
 */
export async function extractMissingDataWithAI(
  request: MissingFieldRequest
): Promise<ExtractedData | null> {
  const { ticker, companyName, sector, missingFields, context = {} } = request;
  const openai = getOpenAIClient();
  if (!openai) {
    console.warn('[aiDataExtraction] OpenAI API key not configured (OPENAI_SERVICE_API_KEY or OPENAI_API_KEY)');
    return null;
  }
  
  // Prevent multiple extraction attempts for the same ticker
  const attemptKey = `extraction-${ticker}`;
  const attempts = extractionAttempts.get(attemptKey) || 0;
  if (attempts >= MAX_EXTRACTION_ATTEMPTS) {
    console.log(`[aiDataExtraction] Skipping extraction for ${ticker} (already attempted ${attempts} times)`);
    return null;
  }
  extractionAttempts.set(attemptKey, attempts + 1);
  
  const cacheKey = `ai-extraction:${ticker}:${missingFields.join(',')}`;
  const cached = apiCache.get<ExtractedData>(cacheKey);
  if (cached) {
    console.log(`[aiDataExtraction] Using cached extraction for ${ticker}`);
    return cached;
  }
  
  console.log(`[aiDataExtraction] Extracting ${missingFields.length} missing fields for ${ticker} (attempt ${attempts + 1})`);
  
  // Strategy 1: Web Scrape + OpenAI Extraction (skip if too many missing fields)
  if (missingFields.length <= 3) {
    const scrapedData = await extractViaWebScraping(ticker, companyName, missingFields);
    if (scrapedData && Object.keys(scrapedData).some(k => k !== 'confidence' && k !== 'source' && k !== 'method' && scrapedData[k] != null)) {
      apiCache.set(cacheKey, scrapedData, TTL.ONE_DAY);
      return scrapedData;
    }
  }
  
  // Strategy 2: OpenAI Inference (using context + sector knowledge)
  // Only if we have some context data
  if (Object.keys(context).length > 0) {
    const inferredData = await inferViaOpenAI(ticker, companyName, sector, missingFields, context);
    if (inferredData && Object.keys(inferredData).some(k => k !== 'confidence' && k !== 'source' && k !== 'method' && inferredData[k] != null)) {
      apiCache.set(cacheKey, inferredData, TTL.ONE_DAY);
      return inferredData;
    }
  }
  
  return null;
}

/**
 * Extract data via web scraping + OpenAI
 */
async function extractViaWebScraping(
  ticker: string,
  companyName: string | undefined,
  missingFields: string[]
): Promise<ExtractedData | null> {
  try {
    // Use existing web scraping infrastructure
    const scraped = await fetchFinancialsViaWebScraping(ticker);
    if (!scraped) {
      return null;
    }
    
    // Extract only the missing fields
    const extracted: ExtractedData = {
      confidence: 'medium',
      source: scraped.dataSource || 'web-scrape',
      method: 'web-scrape',
    };
    
    for (const field of missingFields) {
      const value = (scraped as any)[field];
      if (value != null && typeof value === 'number' && value > 0) {
        extracted[field] = value;
      } else {
        extracted[field] = null;
      }
    }
    
    // If we got at least one field, return it
    const hasData = missingFields.some(field => extracted[field] != null);
    return hasData ? extracted : null;
  } catch (error) {
    console.error('[aiDataExtraction] Web scraping extraction failed:', error);
    return null;
  }
}

/**
 * Infer missing data using OpenAI (when web scraping fails)
 */
async function inferViaOpenAI(
  ticker: string,
  companyName: string | undefined,
  sector: string | undefined,
  missingFields: string[],
  context: Record<string, any>
): Promise<ExtractedData | null> {
  const openai = getOpenAIClient();
  if (!openai) return null;
  
  try {
    const prompt = buildInferencePrompt(ticker, companyName, sector, missingFields, context);
    
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a financial data expert. Given company information and context, provide reasonable estimates for missing financial metrics. Return JSON only with numerical values (in millions) or null if impossible to estimate.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1, // Low temperature for accuracy
      max_tokens: 500,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    
    const parsed = JSON.parse(content);
    
    const extracted: ExtractedData = {
      confidence: 'low', // AI inference is lower confidence
      source: 'openai-inference',
      method: 'openai-inference',
    };
    
    for (const field of missingFields) {
      const value = parsed[field];
      if (value != null && typeof value === 'number' && isFinite(value)) {
        extracted[field] = value;
      } else {
        extracted[field] = null;
      }
    }
    
    return extracted;
  } catch (error) {
    console.error('[aiDataExtraction] OpenAI inference failed:', error);
    return null;
  }
}

/**
 * Build prompt for OpenAI inference
 */
function buildInferencePrompt(
  ticker: string,
  companyName: string | undefined,
  sector: string | undefined,
  missingFields: string[],
  context: Record<string, any>
): string {
  const name = companyName || ticker;
  const sectorInfo = sector ? `Sector: ${sector}` : 'Sector: Unknown';
  
  const contextStr = Object.keys(context).length > 0
    ? `\n\nAvailable Context:\n${JSON.stringify(context, null, 2)}`
    : '';
  
  return `Estimate missing financial metrics for ${name} (${ticker}).

${sectorInfo}${contextStr}

Missing Fields: ${missingFields.join(', ')}

Provide estimates based on:
1. Sector benchmarks
2. Available context data
3. Company size (if revenue is known)
4. Industry norms

Return JSON with these fields (all values in millions, use null if impossible to estimate):
${JSON.stringify(missingFields.reduce((acc, field) => ({ ...acc, [field]: null }), {}), null, 2)}

Be conservative and realistic. If you cannot make a reasonable estimate, use null.`;
}

/**
 * Extract data from company website using OpenAI
 */
export async function extractFromCompanyWebsite(
  ticker: string,
  companyName: string,
  websiteUrl?: string
): Promise<Partial<LTMFinancials> | null> {
  const openai = getOpenAIClient();
  if (!openai) return null;
  
  // Try to find company website if not provided
  let url = websiteUrl;
  if (!url) {
    // Common patterns for investor relations pages
    const patterns = [
      `https://investors.${companyName.toLowerCase().replace(/\s+/g, '')}.com`,
      `https://ir.${companyName.toLowerCase().replace(/\s+/g, '')}.com`,
      `https://www.${companyName.toLowerCase().replace(/\s+/g, '')}.com/investors`,
    ];
    
    // Try to find working URL (simplified - would need actual checking)
    url = patterns[0];
  }
  
  try {
    // Scrape the page
    const { scrapeDirect } = await import('../webScrapeFallback');
    const html = await scrapeDirect(url);
    
    if (!html) return null;
    
    // Extract with OpenAI
    const truncatedHtml = html.slice(0, 15000); // More context for company sites
    
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Extract financial data from company website HTML. Return JSON with numerical values (in millions) or null.',
        },
        {
          role: 'user',
          content: `Extract financial data for ${companyName} (${ticker}) from this HTML:

${truncatedHtml}

Return JSON with: revenue, ebitda, netIncome, totalDebt, cash, sharesOutstanding, marketCap (all in millions, null if not found).`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    
    const extracted = JSON.parse(content);
    return {
      ...extracted,
      ticker,
      companyName,
      dataSource: 'Company Website (AI Extraction)',
    } as Partial<LTMFinancials>;
  } catch (error) {
    console.error('[aiDataExtraction] Company website extraction failed:', error);
    return null;
  }
}

/**
 * Extract data from SEC filing text using OpenAI
 */
export async function extractFromSECFiling(
  ticker: string,
  filingText: string
): Promise<Partial<LTMFinancials> | null> {
  const openai = getOpenAIClient();
  if (!openai) return null;
  
  try {
    // Truncate to avoid token limits (focus on key sections)
    const sections = filingText.split(/\n\n+/);
    const relevantSections = sections
      .filter(s => 
        /revenue|ebitda|net income|financial|balance sheet|income statement/i.test(s)
      )
      .slice(0, 10)
      .join('\n\n');
    
    const truncated = relevantSections.slice(0, 20000);
    
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Extract financial data from SEC filing text. Return JSON with numerical values (in millions) or null.',
        },
        {
          role: 'user',
          content: `Extract financial data for ${ticker} from this SEC filing text:

${truncated}

Return JSON with: revenue, ebitda, netIncome, totalDebt, cash, sharesOutstanding, totalAssets, totalLiabilities (all in millions, null if not found).`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    
    const extracted = JSON.parse(content);
    return {
      ...extracted,
      ticker,
      dataSource: 'SEC Filing (AI Extraction)',
    } as Partial<LTMFinancials>;
  } catch (error) {
    console.error('[aiDataExtraction] SEC filing extraction failed:', error);
    return null;
  }
}

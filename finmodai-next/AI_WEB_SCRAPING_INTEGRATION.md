# AI + Web Scraping Integration - Complete Implementation

## Overview

When APIs don't have data, the system now uses **AI-powered web scraping** and **OpenAI extraction** to find missing information. No data is left unfilled!

---

## How It Works

### **7-Tier Data Filling System**

1. **Mathematical Derivation** (highest confidence)
   - Example: `EBITDA = EBIT + D&A`
   - Example: `sharesOutstanding = marketCap / price`

2. **Historical Trend Analysis**
   - Uses 3-5 years of historical data
   - Linear regression for projections

3. **Peer Medians**
   - From peer company financials
   - Sector benchmarking

4. **Sector Medians**
   - Industry-specific defaults

5. **AI Data Extraction** ⭐ **NEW**
   - Web scraping + OpenAI extraction
   - Scrapes Yahoo Finance, MarketWatch, SEC filings
   - OpenAI extracts structured data from HTML

6. **OpenAI Inference**
   - AI estimates based on context
   - Uses sector knowledge and available data

7. **Default Fallback**
   - System defaults (last resort)

---

## AI Data Extraction Methods

### **1. Web Scraping + OpenAI Extraction**

**Sources:**
- Yahoo Finance (`finance.yahoo.com/quote/{ticker}/financials`)
- MarketWatch (`marketwatch.com/investing/stock/{ticker}/financials`)
- SEC EDGAR (`sec.gov/cgi-bin/browse-edgar`)

**Process:**
1. Scrape HTML from financial websites
2. Send HTML to OpenAI
3. OpenAI extracts structured financial data
4. Returns JSON with missing fields

**Example:**
```typescript
const scraped = await fetchFinancialsViaWebScraping('AAPL');
// Returns: { revenue: 394328, ebitda: 130541, ... }
```

### **2. OpenAI Inference (Context-Based)**

**When Used:**
- Web scraping fails or returns partial data
- Need to estimate based on available context

**Process:**
1. Gather available context (revenue, sector, etc.)
2. Send to OpenAI with prompt
3. AI estimates missing fields based on:
   - Sector benchmarks
   - Available context
   - Company size
   - Industry norms

**Example:**
```typescript
const aiData = await extractMissingDataWithAI({
  ticker: 'AAPL',
  companyName: 'Apple Inc.',
  sector: 'Technology',
  missingFields: ['ebitda', 'sharesOutstanding'],
  context: { revenue: 394328, marketCap: 3000000 }
});
// Returns: { ebitda: 130541, sharesOutstanding: 15420, ... }
```

### **3. Company Website Extraction**

**Process:**
1. Find company investor relations page
2. Scrape HTML
3. OpenAI extracts financial data from investor pages

**Example:**
```typescript
const websiteData = await extractFromCompanyWebsite('AAPL', 'Apple Inc.');
// Returns: { revenue: 394328, ebitda: 130541, ... }
```

### **4. SEC Filing Extraction**

**Process:**
1. Fetch SEC filing text (10-K, 10-Q)
2. Send to OpenAI
3. Extract structured data from filing text

**Example:**
```typescript
const filingData = await extractFromSECFiling('AAPL', filingText);
// Returns: { revenue: 394328, totalAssets: 323888, ... }
```

---

## Integration Points

### **1. LTM Financials (`lib/getLTMFinancials.ts`)**

**Flow:**
```
1. Try FMP API
2. Try Alpha Vantage
3. Try Nasdaq Data Link
4. Try IEX Cloud
5. Try Web Scraping + AI Extraction ⭐
   - Scrape Yahoo Finance/MarketWatch
   - Extract with OpenAI
   - If partial data, use AI inference for missing fields
6. Fallback to synthetic data
```

### **2. Enhanced Inference (`lib/data/enhancedInference.ts`)**

**Flow:**
```
For each missing field:
1. Mathematical derivation
2. Historical trends
3. Peer medians
4. Sector medians
5. AI Data Extraction ⭐ (web scraping + OpenAI)
6. OpenAI inference
7. Default fallback
```

### **3. Model Generation (`app/api/generateModel/route.ts`)**

**Flow:**
```
1. Fetch all data sources (APIs, historical, consensus, peers, WC)
2. Build partial assumptions
3. Enrich with OpenAI + Enhanced Inference
   - Uses AI extraction for any missing fields
4. Generate model
```

---

## API Requirements

### **Required for AI Extraction:**
- `OPENAI_API_KEY` - For data extraction and inference

### **Optional (Improves Coverage):**
- `SCRAPE_DO_API_KEY` - For web scraping (Scrape.do)
- `SCRAPER_API_KEY` - Alternative web scraping (ScraperAPI)

### **Note:**
- If only `OPENAI_API_KEY` is set, system uses OpenAI inference (no web scraping)
- If both are set, system uses web scraping + OpenAI extraction (better accuracy)

---

## Benefits

### **✅ No Missing Data**
- Even if APIs fail, web scraping + AI finds the data
- Multiple fallback methods ensure coverage

### **✅ Higher Accuracy**
- Web scraping gets real data from financial websites
- OpenAI extracts structured data from unstructured HTML

### **✅ Context-Aware**
- AI uses available context (revenue, sector) to estimate missing fields
- More accurate than generic defaults

### **✅ Multiple Sources**
- Yahoo Finance
- MarketWatch
- SEC filings
- Company websites

---

## Example: Missing Shares Outstanding

**Scenario:** APIs don't have shares outstanding for a ticker

**Solution:**
1. Try web scraping Yahoo Finance
2. OpenAI extracts shares outstanding from HTML
3. If that fails, derive from market cap / price
4. If that fails, use AI inference based on sector/company size

**Result:** Shares outstanding is always found!

---

## Example: Missing EBITDA

**Scenario:** APIs only have revenue, missing EBITDA

**Solution:**
1. Try web scraping for EBITDA
2. If that fails, use AI inference:
   - Input: Revenue = $100M, Sector = Technology
   - AI estimates: EBITDA margin ~25% for tech
   - Output: EBITDA = $25M

**Result:** EBITDA is estimated with context!

---

## Performance

### **Caching:**
- Web scraped data: 1 hour TTL
- AI extracted data: 1 day TTL
- Reduces API calls and costs

### **Rate Limiting:**
- Respects scraping service rate limits
- Uses retry logic with exponential backoff

### **Cost Optimization:**
- Only uses AI when needed (missing fields)
- Caches results to avoid redundant calls

---

## Status

✅ **Web Scraping Infrastructure** - Complete  
✅ **OpenAI Extraction** - Complete  
✅ **AI Inference** - Complete  
✅ **LTM Financials Integration** - Complete  
✅ **Enhanced Inference Integration** - Complete  
✅ **Company Website Extraction** - Complete  
✅ **SEC Filing Extraction** - Complete  

**AI + Web Scraping is fully integrated and automatically used when APIs fail!**

---

## Usage

No code changes needed! The system automatically:

1. Tries APIs first (fast, reliable)
2. Falls back to web scraping + AI (when APIs fail)
3. Uses AI inference (when scraping fails)
4. Always fills missing data

Just ensure you have:
- `OPENAI_API_KEY` set (required for AI)
- `SCRAPE_DO_API_KEY` or `SCRAPER_API_KEY` (optional, improves coverage)

The system handles everything automatically! 🚀

/**
 * Fetch with Diagnostics
 * 
 * Wraps external API calls with error handling and diagnostics tracking.
 * Helps identify API failures, rate limits, and data quality issues.
 */

import type { DataDiagnostics, DataSource, ModelType } from '@/types/diagnostics';
import { createDiagnostic, logDiagnostic } from '@/types/diagnostics';

export interface FetchOptions {
  ticker: string;
  modelType: ModelType;
  dataSource: DataSource;
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  requiredKeys?: string[];          // Keys that must exist in response
  timeout?: number;                 // Timeout in ms
}

export interface FetchResult<T = unknown> {
  data: T | null;
  diagnostic: DataDiagnostics;
  success: boolean;
}

/**
 * Fetch data from external API with diagnostics
 */
export async function fetchWithDiagnostics<T = unknown>(
  options: FetchOptions
): Promise<FetchResult<T>> {
  const {
    ticker,
    modelType,
    dataSource,
    url,
    method = 'GET',
    headers = {},
    body,
    requiredKeys = [],
    timeout = 10000,
  } = options;

  const startTime = Date.now();
  const diagnostic = createDiagnostic(ticker, modelType, dataSource, 'fetch', true);

  try {
    console.log(`[FETCH] ${ticker} | ${dataSource} | ${url}`);

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Perform fetch
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    diagnostic.durationMs = Date.now() - startTime;

    // Check HTTP status
    if (!response.ok) {
      diagnostic.ok = false;
      
      if (response.status === 429) {
        diagnostic.errors.push(`Rate limit exceeded (HTTP 429)`);
      } else if (response.status === 401 || response.status === 403) {
        diagnostic.errors.push(`Authentication failed (HTTP ${response.status})`);
      } else if (response.status === 404) {
        diagnostic.errors.push(`Resource not found (HTTP 404) - ticker may not exist`);
      } else if (response.status >= 500) {
        diagnostic.errors.push(`Server error (HTTP ${response.status})`);
      } else {
        diagnostic.errors.push(`HTTP error ${response.status}: ${response.statusText}`);
      }

      logDiagnostic(diagnostic);
      return { data: null, diagnostic, success: false };
    }

    // Parse JSON
    let data: T;
    try {
      data = await response.json();
    } catch (parseError) {
      diagnostic.ok = false;
      diagnostic.errors.push(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      logDiagnostic(diagnostic);
      return { data: null, diagnostic, success: false };
    }

    // Check if response is empty
    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
      diagnostic.ok = false;
      diagnostic.errors.push('API returned empty response');
      logDiagnostic(diagnostic);
      return { data: null, diagnostic, success: false };
    }

    // Check required keys
    if (requiredKeys.length > 0 && typeof data === 'object' && data !== null) {
      const missingKeys = requiredKeys.filter(key => !(key in data));
      if (missingKeys.length > 0) {
        diagnostic.ok = false;
        diagnostic.errors.push(`Missing required keys: ${missingKeys.join(', ')}`);
        logDiagnostic(diagnostic);
        return { data: null, diagnostic, success: false };
      }
    }

    // Store small sample of raw data for debugging
    if (typeof data === 'object' && data !== null) {
      const sample: Record<string, unknown> = {};
      let count = 0;
      for (const [key, value] of Object.entries(data)) {
        if (count >= 5) break; // Only store first 5 keys
        if (Array.isArray(value)) {
          sample[key] = `[Array(${value.length})]`;
        } else if (typeof value === 'object' && value !== null) {
          sample[key] = '[Object]';
        } else {
          sample[key] = value;
        }
        count++;
      }
      diagnostic.rawSample = sample;
    }

    console.log(`[FETCH] ✅ ${ticker} | ${dataSource} | ${diagnostic.durationMs}ms`);
    logDiagnostic(diagnostic);
    return { data, diagnostic, success: true };

  } catch (error) {
    diagnostic.ok = false;
    diagnostic.durationMs = Date.now() - startTime;

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        diagnostic.errors.push(`Request timeout after ${timeout}ms`);
      } else if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
        diagnostic.errors.push(`Network error: ${error.message}`);
      } else {
        diagnostic.errors.push(`Fetch error: ${error.message}`);
      }
    } else {
      diagnostic.errors.push('Unknown fetch error');
    }

    logDiagnostic(diagnostic);
    return { data: null, diagnostic, success: false };
  }
}

/**
 * Perform sanity checks on normalized financial data
 */
export interface SanityCheckOptions {
  ticker: string;
  modelType: ModelType;
  dataSource: DataSource;
  revenue?: number[];
  grossMargin?: number;
  ebitMargin?: number;
  taxRate?: number;
  capexPctRevenue?: number;
}

export function performSanityChecks(options: SanityCheckOptions): DataDiagnostics {
  const { ticker, modelType, dataSource, revenue, grossMargin, ebitMargin, taxRate, capexPctRevenue } = options;
  
  const diagnostic = createDiagnostic(ticker, modelType, dataSource, 'normalize', true);

  // Check revenue
  if (revenue) {
    const hasPositiveRevenue = revenue.some(r => r > 0);
    if (!hasPositiveRevenue) {
      diagnostic.zeroProtectionTriggered = true;
      diagnostic.errors.push('All revenue values are zero or negative');
      diagnostic.ok = false;
    } else {
      const allZero = revenue.every(r => r === 0);
      if (allZero) {
        diagnostic.zeroProtectionTriggered = true;
        diagnostic.warnings.push('All revenue values are exactly zero');
      }
      
      const negativeRevenue = revenue.filter(r => r < 0);
      if (negativeRevenue.length > 0) {
        diagnostic.warnings.push(`${negativeRevenue.length} year(s) with negative revenue`);
      }
      
      const tinyRevenue = revenue.filter(r => r > 0 && r < 1);
      if (tinyRevenue.length > 0) {
        diagnostic.warnings.push(`${tinyRevenue.length} year(s) with revenue < $1M (possible unit mismatch)`);
      }
    }
  }

  // Check gross margin
  if (grossMargin !== undefined) {
    if (grossMargin < -0.20 || grossMargin > 0.90) {
      diagnostic.warnings.push(`Gross margin ${(grossMargin * 100).toFixed(1)}% outside normal range [-20%, 90%]`);
    }
    if (grossMargin < -1.0) {
      diagnostic.errors.push(`Gross margin ${(grossMargin * 100).toFixed(1)}% is impossibly negative`);
      diagnostic.ok = false;
    }
  }

  // Check EBIT margin
  if (ebitMargin !== undefined) {
    if (ebitMargin < -0.50 || ebitMargin > 0.60) {
      diagnostic.warnings.push(`EBIT margin ${(ebitMargin * 100).toFixed(1)}% outside normal range [-50%, 60%]`);
    }
    if (ebitMargin < -2.0 || ebitMargin > 1.5) {
      diagnostic.errors.push(`EBIT margin ${(ebitMargin * 100).toFixed(1)}% is unrealistic`);
      diagnostic.ok = false;
    }
  }

  // Check tax rate
  if (taxRate !== undefined) {
    if (taxRate < 0 || taxRate > 0.40) {
      diagnostic.warnings.push(`Tax rate ${(taxRate * 100).toFixed(1)}% outside normal range [0%, 40%]`);
    }
    if (taxRate > 0.80) {
      diagnostic.errors.push(`Tax rate ${(taxRate * 100).toFixed(1)}% is impossibly high`);
      diagnostic.ok = false;
    }
    if (taxRate < 0) {
      diagnostic.errors.push(`Tax rate ${(taxRate * 100).toFixed(1)}% cannot be negative`);
      diagnostic.ok = false;
    }
  }

  // Check capex % of revenue
  if (capexPctRevenue !== undefined) {
    if (capexPctRevenue < 0 || capexPctRevenue > 0.50) {
      diagnostic.warnings.push(`Capex ${(capexPctRevenue * 100).toFixed(1)}% of revenue outside normal range [0%, 50%]`);
    }
    if (capexPctRevenue > 1.0) {
      diagnostic.errors.push(`Capex ${(capexPctRevenue * 100).toFixed(1)}% of revenue is unrealistic`);
      diagnostic.ok = false;
    }
  }

  logDiagnostic(diagnostic);
  return diagnostic;
}


/**
 * yfinance Market Data Wrapper
 * Calls Python script to fetch OHLCV data via yfinance
 */

import { spawn } from 'child_process';
import path from 'path';

export type YFinanceRange = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y';

export type YFinancePoint = {
  t: string; // ISO timestamp
  o?: number | null;
  h?: number | null;
  l?: number | null;
  c: number | null;
  v?: number | null;
};

export type YFinanceResponse = {
  ticker: string;
  currency: string;
  tz: string;
  points: YFinancePoint[];
  last: { t: string; c: number } | null;
  source: 'yfinance';
  error?: string;
};

const YFINANCE_SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'yf_prices.py');
const YFINANCE_TIMEOUT_MS = 8000; // Reduced from 15000ms to 8000ms for faster failure
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';

/**
 * Check if error is transient (retryable)
 */
function isTransientError(error: any): boolean {
  if (!error) return false;
  const msg = error.message || String(error);
  // Timeout, network, or temporary script errors are retryable
  return /timeout|ECONNRESET|ENOTFOUND|ETIMEDOUT|SIGTERM/i.test(msg);
}

/**
 * Fetch market data via yfinance Python script
 * Returns null on failure (does not throw) to allow partial results
 */
export async function fetchYFinancePrices(
  ticker: string,
  range: YFinanceRange
): Promise<YFinanceResponse | null> {
  const attempt = async (): Promise<YFinanceResponse | null> => {
    return new Promise((resolve) => {
      const pythonProcess = spawn(PYTHON_BIN, [YFINANCE_SCRIPT_PATH, ticker, range], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timeoutId: NodeJS.Timeout | null = null;

      // Set timeout
      timeoutId = setTimeout(() => {
        pythonProcess.kill('SIGTERM');
        resolve(null); // Return null on timeout instead of rejecting
      }, YFINANCE_TIMEOUT_MS);

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (timeoutId) clearTimeout(timeoutId);

        if (code !== 0) {
          // Non-zero exit code - return null instead of rejecting
          resolve(null);
          return;
        }

        try {
          const jsonData = JSON.parse(stdout.trim());
          resolve(jsonData as YFinanceResponse);
        } catch (parseError: any) {
          // Parse error - return null instead of rejecting
          resolve(null);
        }
      });

      pythonProcess.on('error', (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        // Spawn error - return null instead of rejecting
        resolve(null);
      });
    });
  };

  // First attempt
  const result = await attempt();
  if (result) return result;

  // Retry once with backoff for transient errors only
  // Note: Since attempt() returns null on all errors, we retry once regardless
  // In a more sophisticated implementation, we'd check error type here
  await new Promise((resolve) => setTimeout(resolve, 250)); // 250ms backoff
  return await attempt();
}


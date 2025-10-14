"""
EDGAR Bulk Ingestion Pipeline - 1,000+ Tickers

Fetches 5 years of audited annual financials from SEC EDGAR for 1,000+ US tickers.
Implements polite concurrency, ETag-based caching, and normalizes data for DCF/LBO/Comps models.

Usage:
    python edgar_bulk_ingestion.py --max-tickers 1000 --concurrency 3 --jitter 1.0
    python edgar_bulk_ingestion.py --max-tickers 1000 --concurrency 3 --jitter 1.0 --force
"""

import argparse
import json
import logging
import random
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
import requests
from tqdm import tqdm

# ============================================================================
# Constants
# ============================================================================

USER_AGENT = "FinModAI/1.0 (kingromain23@gmail.com)"
SEC_TICKER_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_FACTS_BASE = "https://data.sec.gov/api/xbrl/companyfacts/"
CACHE_DIR = Path("cache/companyfacts")
OUTPUT_DIR = Path("dataset")
LOG_DIR = Path("logs")

# Tag priority mapping for XBRL extraction
TAG_PRIORITY = {
    'revenue': ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 
                'SalesRevenueNet'],
    'operating_income': ['OperatingIncomeLoss'],
    'interest_expense': ['InterestExpense', 'InterestExpenseDebt'],
    'tax_expense': ['IncomeTaxExpenseBenefit'],
    'net_income': ['NetIncomeLoss', 'ProfitLoss'],
    'd_and_a': ['DepreciationDepletionAndAmortization', 
                'DepreciationAndAmortization'],
    'capex': ['PaymentsToAcquirePropertyPlantAndEquipment'],
    'assets_current': ['AssetsCurrent'],
    'liabilities_current': ['LiabilitiesCurrent'],
    'cash': ['CashAndCashEquivalentsAtCarryingValue', 'Cash'],
    'short_term_debt': ['ShortTermBorrowings', 'DebtCurrent'],
    'long_term_debt': ['LongTermDebt', 'LongTermDebtNoncurrent'],
    'shares_outstanding': ['CommonStockSharesOutstanding', 
                          'CommonStockSharesIssued'],
}

# ============================================================================
# Logging Setup
# ============================================================================

logger = logging.getLogger(__name__)

def setup_logging():
    """Configure logging to file and console"""
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    log_file = LOG_DIR / f'edgar_ingestion_{timestamp}.log'
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s',
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler()
        ]
    )
    
    logger.info(f"Logging to: {log_file}")


# ============================================================================
# Custom Exceptions
# ============================================================================

class RateLimitError(Exception):
    """Raised when SEC rate limit (429) is hit"""
    pass


# ============================================================================
# Universe Builder
# ============================================================================

def load_sec_ticker_universe(max_tickers: int) -> pd.DataFrame:
    """
    Load SEC official ticker list, filter to US common stock
    
    Args:
        max_tickers: Maximum number of tickers to return
    
    Returns:
        DataFrame with columns: ticker, cik_str, title
    """
    logger.info(f"Fetching SEC ticker universe from {SEC_TICKER_URL}")
    
    response = requests.get(SEC_TICKER_URL, 
                           headers={'User-Agent': USER_AGENT},
                           timeout=30)
    response.raise_for_status()
    data = response.json()
    
    # SEC JSON format: {0: {cik_str, ticker, title}, 1: {...}, ...}
    df = pd.DataFrame.from_dict(data, orient='index')
    
    logger.info(f"Loaded {len(df)} total tickers from SEC")
    
    # Filter: primary US listings, exclude funds/ADRs/units
    # Basic heuristics: ticker length, exclude suffixes
    initial_count = len(df)
    
    df = df[~df['ticker'].str.contains(r'[.-]', regex=True, na=False)]  # Exclude -A, .PR, etc.
    df = df[df['ticker'].str.len() <= 5]  # Exclude long tickers
    
    logger.info(f"After filtering: {len(df)} tickers ({initial_count - len(df)} excluded)")
    
    # Sort alphabetically for consistency
    df = df.sort_values('ticker')
    
    # Take first max_tickers
    df = df.head(max_tickers)
    
    logger.info(f"Universe: {len(df)} tickers selected")
    return df[['ticker', 'cik_str', 'title']].reset_index(drop=True)


# ============================================================================
# Polite HTTP Client
# ============================================================================

class PoliteEdgarClient:
    """HTTP client with ETag caching and polite throttling"""
    
    def __init__(self, jitter_sec: float):
        self.session = requests.Session()
        self.session.headers.update({'User-Agent': USER_AGENT})
        self.jitter_sec = jitter_sec
        self.last_request_time = 0
    
    def get_companyfacts(self, cik: str, force: bool = False) -> Optional[dict]:
        """
        Fetch companyfacts JSON with ETag caching
        
        Args:
            cik: CIK string (will be zero-padded to 10 digits)
            force: Ignore cache and re-fetch
        
        Returns:
            Parsed JSON or None if fetch fails
        """
        cik_padded = f"CIK{str(cik).zfill(10)}"
        cache_file = CACHE_DIR / f"{cik_padded}.json"
        etag_file = CACHE_DIR / f"{cik_padded}.etag"
        
        # Check cache
        if not force and cache_file.exists():
            etag = etag_file.read_text().strip() if etag_file.exists() else None
            
            # Make conditional request with ETag
            headers = {}
            if etag:
                headers['If-None-Match'] = etag
            
            # Apply throttling
            self._throttle()
            
            url = f"{SEC_FACTS_BASE}{cik_padded}.json"
            try:
                response = self.session.get(url, headers=headers, timeout=30)
                
                if response.status_code == 304:
                    # Not modified - use cache
                    logger.debug(f"{cik}: Cache hit (304 Not Modified)")
                    return json.loads(cache_file.read_text())
                
                if response.status_code == 200:
                    # New data - update cache
                    data = response.json()
                    
                    cache_file.write_text(json.dumps(data, indent=2))
                    if 'ETag' in response.headers:
                        etag_file.write_text(response.headers['ETag'])
                    
                    logger.info(f"{cik}: Fetched and cached (updated)")
                    return data
                
                elif response.status_code == 429:
                    logger.warning(f"{cik}: Rate limited (429)")
                    raise RateLimitError("SEC rate limit hit")
                
                elif response.status_code == 404:
                    logger.warning(f"{cik}: Not found (404)")
                    return None
                
                else:
                    logger.warning(f"{cik}: HTTP {response.status_code}")
                    return None
                    
            except requests.RequestException as e:
                logger.error(f"{cik}: Request failed - {e}")
                # Try to use stale cache if available
                if cache_file.exists():
                    logger.info(f"{cik}: Using stale cache due to error")
                    return json.loads(cache_file.read_text())
                return None
        
        # No cache or force mode - fetch fresh
        self._throttle()
        url = f"{SEC_FACTS_BASE}{cik_padded}.json"
        
        try:
            response = self.session.get(url, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                
                # Save to cache
                cache_file.write_text(json.dumps(data, indent=2))
                if 'ETag' in response.headers:
                    etag_file.write_text(response.headers['ETag'])
                
                logger.info(f"{cik}: Fetched and cached")
                return data
            
            elif response.status_code == 429:
                logger.warning(f"{cik}: Rate limited (429)")
                raise RateLimitError("SEC rate limit hit")
            
            elif response.status_code == 404:
                logger.warning(f"{cik}: Not found (404)")
                return None
            
            else:
                logger.warning(f"{cik}: HTTP {response.status_code}")
                return None
                
        except requests.RequestException as e:
            logger.error(f"{cik}: Failed - {e}")
            return None
    
    def _throttle(self):
        """Apply jitter between requests"""
        now = time.time()
        elapsed = now - self.last_request_time
        
        # Random jitter between 0.5x and 1.5x the base jitter
        jitter = random.uniform(0.5, 1.5) * self.jitter_sec
        
        if elapsed < jitter:
            time.sleep(jitter - elapsed)
        
        self.last_request_time = time.time()


# ============================================================================
# Parser: Extract Audited Annuals
# ============================================================================

def parse_companyfacts(data: dict, ticker: str, cik: str) -> List[dict]:
    """
    Extract audited annual fundamentals from companyfacts JSON
    
    Args:
        data: Parsed companyfacts JSON
        ticker: Stock ticker symbol
        cik: Company CIK
    
    Returns:
        List of dicts, one per fiscal year (last 5 years)
    """
    facts = data.get('facts', {}).get('us-gaap', {})
    
    if not facts:
        logger.debug(f"{ticker}: No us-gaap facts found")
        return []
    
    results = {}  # fiscal_year -> {field: value}
    
    # Extract each field from priority tag list
    for field, tag_list in TAG_PRIORITY.items():
        for tag in tag_list:
            if tag not in facts:
                continue
            
            units = facts[tag].get('units', {})
            
            # Prefer USD units
            if 'USD' in units:
                for item in units['USD']:
                    # Filter: 10-K/20-F only (audited annuals)
                    if item.get('form') not in ['10-K', '20-F']:
                        continue
                    
                    # Filter: FY only (full year)
                    if item.get('fp') != 'FY':
                        continue
                    
                    fy = item.get('fy')
                    val = item.get('val')
                    
                    if fy and val is not None:
                        if fy not in results:
                            results[fy] = {
                                'ticker': ticker,
                                'cik': cik,
                                'fiscal_year': fy
                            }
                        
                        # Take first value found (most recent filing)
                        if field not in results[fy]:
                            results[fy][field] = val
            
            # For shares, also check 'shares' units
            elif field == 'shares_outstanding' and 'shares' in units:
                for item in units['shares']:
                    if item.get('form') not in ['10-K', '20-F']:
                        continue
                    if item.get('fp') != 'FY':
                        continue
                    
                    fy = item.get('fy')
                    val = item.get('val')
                    
                    if fy and val is not None:
                        if fy not in results:
                            results[fy] = {
                                'ticker': ticker,
                                'cik': cik,
                                'fiscal_year': fy
                            }
                        
                        if field not in results[fy]:
                            results[fy][field] = val
            
            break  # Found tag, move to next field
    
    # Convert to list and sort by year descending
    rows = list(results.values())
    rows.sort(key=lambda x: x['fiscal_year'], reverse=True)
    
    # Take last 5 years
    return rows[:5]


# ============================================================================
# Data Normalization
# ============================================================================

def normalize_and_derive(rows: List[dict]) -> pd.DataFrame:
    """
    Normalize units to millions, derive EBITDA/NWC/NetDebt
    
    Args:
        rows: List of dicts from parse_companyfacts
    
    Returns:
        DataFrame with normalized schema
    """
    df = pd.DataFrame(rows)
    
    if df.empty:
        return df
    
    # Convert to millions (SEC data in actual dollars)
    NUMERIC_COLS = [
        'revenue', 'operating_income', 'interest_expense', 
        'tax_expense', 'net_income', 'd_and_a', 'capex',
        'assets_current', 'liabilities_current', 'cash',
        'short_term_debt', 'long_term_debt'
    ]
    
    for col in NUMERIC_COLS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce') / 1_000_000
    
    # Derive EBIT (use operating_income as proxy)
    df['ebit'] = df.get('operating_income', pd.Series(dtype=float))
    
    # Derive EBITDA
    df['ebitda'] = df['ebit'].fillna(0) + df.get('d_and_a', pd.Series(dtype=float)).fillna(0)
    
    # Derive Gross Debt
    df['gross_debt'] = (
        df.get('short_term_debt', pd.Series(dtype=float)).fillna(0) + 
        df.get('long_term_debt', pd.Series(dtype=float)).fillna(0)
    )
    
    # Derive Net Debt
    df['net_debt'] = df['gross_debt'] - df.get('cash', pd.Series(dtype=float)).fillna(0)
    
    # Derive Operating NWC
    df['nwc'] = (
        df.get('assets_current', pd.Series(dtype=float)).fillna(0) - 
        df.get('liabilities_current', pd.Series(dtype=float)).fillna(0) - 
        df.get('cash', pd.Series(dtype=float)).fillna(0) - 
        df.get('short_term_debt', pd.Series(dtype=float)).fillna(0)
    )
    
    # Sort by ticker and year for delta calculation
    df = df.sort_values(['ticker', 'fiscal_year'])
    
    # Derive ΔNWC (year-over-year change)
    df['delta_nwc'] = df.groupby('ticker')['nwc'].diff()
    
    # Effective tax rate
    df['effective_tax_rate'] = np.where(
        df['ebit'].fillna(0) > 0,
        df['tax_expense'].fillna(0) / df['ebit'],
        np.nan
    )
    
    return df


# ============================================================================
# Quality Gates
# ============================================================================

def apply_quality_filters(df: pd.DataFrame) -> pd.DataFrame:
    """
    Require ≥3 years with revenue + EBIT for each ticker
    
    Args:
        df: DataFrame with all parsed data
    
    Returns:
        Filtered DataFrame
    """
    if df.empty:
        return df
    
    # Count valid years per ticker
    valid_mask = df['revenue'].notna() & df['ebit'].notna()
    valid_counts = df[valid_mask].groupby('ticker').size()
    
    # Keep tickers with ≥3 valid years
    good_tickers = valid_counts[valid_counts >= 3].index
    
    dropped = len(df['ticker'].unique()) - len(good_tickers)
    logger.info(f"Quality filter: Kept {len(good_tickers)} tickers, dropped {dropped} with <3 valid years")
    
    return df[df['ticker'].isin(good_tickers)]


# ============================================================================
# Summary Report
# ============================================================================

def print_summary_report(df: pd.DataFrame, failed: List[str], max_requested: int):
    """Print comprehensive summary statistics"""
    
    total_tickers = df['ticker'].nunique() if not df.empty else 0
    total_rows = len(df)
    median_years = df.groupby('ticker').size().median() if not df.empty else 0
    
    # Missing field rates
    field_coverage = {}
    if not df.empty:
        for col in df.columns:
            if col not in ['ticker', 'cik', 'fiscal_year']:
                coverage = df[col].notna().sum() / len(df) * 100
                field_coverage[col] = coverage
    
    print("\n" + "="*70)
    print("EDGAR BULK INGESTION - SUMMARY REPORT")
    print("="*70)
    print(f"Requested tickers:        {max_requested}")
    print(f"Successfully processed:   {total_tickers}")
    print(f"Failed to process:        {len(failed)}")
    print(f"Total rows (company-yrs): {total_rows}")
    print(f"Median years per company: {median_years:.0f}")
    
    if field_coverage:
        print("\nField Coverage:")
        for field, pct in sorted(field_coverage.items()):
            print(f"  {field:25s}: {pct:5.1f}%")
    
    if failed:
        print(f"\nFailed tickers ({len(failed)}): {', '.join(failed[:20])}")
        if len(failed) > 20:
            print(f"  ... and {len(failed) - 20} more")
    
    print("="*70)


# ============================================================================
# Worker Function
# ============================================================================

def process_ticker(client: PoliteEdgarClient, row: pd.Series, force: bool) -> List[dict]:
    """
    Process single ticker
    
    Args:
        client: HTTP client instance
        row: Universe row with ticker, cik_str, title
        force: Force re-fetch
    
    Returns:
        List of dicts with parsed data
    """
    ticker = row['ticker']
    cik = row['cik_str']
    
    try:
        data = client.get_companyfacts(str(cik), force)
        
        if not data:
            return []
        
        rows = parse_companyfacts(data, ticker, str(cik))
        return rows
        
    except RateLimitError:
        # Re-raise to let main handler deal with it
        raise
    except Exception as e:
        logger.error(f"{ticker}: Unexpected error - {e}")
        return []


# ============================================================================
# Main Pipeline
# ============================================================================

def main():
    """Main pipeline orchestration"""
    
    # Parse arguments
    parser = argparse.ArgumentParser(
        description='EDGAR bulk fundamentals ingestion',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python edgar_bulk_ingestion.py --max-tickers 1000 --concurrency 3 --jitter 1.0
  python edgar_bulk_ingestion.py --max-tickers 1000 --concurrency 3 --jitter 1.0 --force
        """
    )
    parser.add_argument('--max-tickers', type=int, required=True,
                       help='Maximum tickers to process (e.g., 1000)')
    parser.add_argument('--concurrency', type=int, required=True,
                       help='Max concurrent workers (2-4 recommended)')
    parser.add_argument('--jitter', type=float, required=True,
                       help='Average jitter between requests in seconds (0.5-1.5)')
    parser.add_argument('--force', action='store_true',
                       help='Force re-fetch all cached CIKs')
    args = parser.parse_args()
    
    # Setup logging
    setup_logging()
    
    logger.info("="*70)
    logger.info("EDGAR BULK INGESTION PIPELINE")
    logger.info("="*70)
    logger.info(f"Configuration:")
    logger.info(f"  Max tickers:  {args.max_tickers}")
    logger.info(f"  Concurrency:  {args.concurrency}")
    logger.info(f"  Jitter:       {args.jitter}s")
    logger.info(f"  Force mode:   {args.force}")
    logger.info("="*70)
    
    # Create directories
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"Cache dir:  {CACHE_DIR.absolute()}")
    logger.info(f"Output dir: {OUTPUT_DIR.absolute()}")
    
    # Load universe
    logger.info(f"\nLoading SEC ticker universe (max: {args.max_tickers})")
    universe = load_sec_ticker_universe(args.max_tickers)
    
    # Initialize client
    client = PoliteEdgarClient(args.jitter)
    
    # Process tickers with concurrency
    logger.info(f"\nProcessing {len(universe)} tickers with {args.concurrency} workers...")
    all_rows = []
    failed_tickers = []
    
    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        # Submit all tasks
        futures = {
            executor.submit(process_ticker, client, row, args.force): row
            for _, row in universe.iterrows()
        }
        
        # Collect results with progress bar
        for future in tqdm(as_completed(futures), total=len(futures),
                          desc="Processing tickers", unit="ticker"):
            row = futures[future]
            ticker = row['ticker']
            
            try:
                rows = future.result()
                if rows:
                    all_rows.extend(rows)
                else:
                    failed_tickers.append(ticker)
            except RateLimitError:
                logger.error(f"{ticker}: Rate limited - stopping")
                failed_tickers.append(ticker)
                # Cancel remaining futures
                for f in futures:
                    f.cancel()
                break
            except Exception as e:
                logger.error(f"{ticker}: Processing failed - {e}")
                failed_tickers.append(ticker)
    
    # Create DataFrame
    logger.info(f"\nCollected {len(all_rows)} raw rows")
    df = pd.DataFrame(all_rows)
    
    if df.empty:
        logger.error("No data collected - exiting")
        return
    
    # Normalize and derive
    logger.info("Normalizing data and deriving metrics...")
    df = normalize_and_derive(df)
    
    # Apply quality gates
    logger.info("Applying quality filters...")
    df = apply_quality_filters(df)
    
    if df.empty:
        logger.error("No data passed quality filters - exiting")
        return
    
    # Save outputs
    logger.info("\nSaving outputs...")
    parquet_path = OUTPUT_DIR / 'edgar_fundamentals.parquet'
    csv_path = OUTPUT_DIR / 'edgar_fundamentals.csv'
    
    df.to_parquet(parquet_path, index=False)
    logger.info(f"  Saved Parquet: {parquet_path} ({parquet_path.stat().st_size / 1024 / 1024:.1f} MB)")
    
    df.to_csv(csv_path, index=False)
    logger.info(f"  Saved CSV:     {csv_path} ({csv_path.stat().st_size / 1024 / 1024:.1f} MB)")
    
    # Summary report
    print_summary_report(df, failed_tickers, args.max_tickers)
    
    logger.info(f"\n✅ Pipeline complete: {len(df)} rows saved")
    logger.info(f"   Parquet: {parquet_path}")
    logger.info(f"   CSV:     {csv_path}")


if __name__ == '__main__':
    main()


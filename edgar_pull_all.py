#!/usr/bin/env python3
"""
SEC EDGAR Comprehensive Data Pipeline
Fetches ALL available financial data from SEC EDGAR
Options:
- S&P 500 (500 companies)
- Russell 1000 (1000 companies)
- Custom ticker list
- All years available (10-15 years per company)
"""

import requests
import json
import time
import csv
from typing import Dict, List, Optional, Any
from datetime import datetime
import os
import argparse

# Configuration
HEADERS = {
    "User-Agent": "FinModAI/1.0 (avery@example.com)",
    "Accept": "application/json"
}

RATE_LIMIT_DELAY = 0.6  # SEC requests ~10 requests per second max

# S&P 500 Major Companies (Top 100 by market cap for faster testing)
SP500_TOP100 = [
    # Mega Cap Tech
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'ORCL', 'ADBE',
    'CRM', 'CSCO', 'ACN', 'INTC', 'AMD', 'QCOM', 'TXN', 'NOW', 'INTU', 'IBM',
    
    # Financial Services
    'BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'C', 'SCHW',
    'AXP', 'BLK', 'SPGI', 'CB', 'PGR', 'MMC', 'ICE', 'CME', 'AON', 'TRV',
    
    # Healthcare
    'JNJ', 'UNH', 'LLY', 'MRK', 'ABBV', 'PFE', 'TMO', 'ABT', 'DHR', 'AMGN',
    'CVS', 'BMY', 'GILD', 'CI', 'ISRG', 'VRTX', 'ELV', 'ZTS', 'REGN', 'HCA',
    
    # Consumer
    'WMT', 'HD', 'MCD', 'NKE', 'COST', 'PEP', 'KO', 'SBUX', 'TGT', 'LOW',
    'MDLZ', 'CL', 'PG', 'PM', 'MO', 'EL', 'KMB', 'GIS', 'HSY', 'K',
    
    # Communication/Media
    'DIS', 'NFLX', 'CMCSA', 'T', 'VZ', 'TMUS', 'CHTR', 'EA', 'TTWO', 'ATVI',
    
    # Industrial/Energy
    'XOM', 'CVX', 'COP', 'SLB', 'MPC', 'PSX', 'VLO', 'EOG', 'PXD', 'OXY'
]

# All S&P 500 tickers (add more as needed)
SP500_ALL = SP500_TOP100  # Can be expanded to full 500

# XBRL tag mappings
TAG_MAPPINGS = {
    'revenue': [
        'Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax',
        'SalesRevenueNet', 'RevenuesNetOfInterestExpense'
    ],
    'ebit': [
        'OperatingIncomeLoss',
        'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest'
    ],
    'interest_expense': ['InterestExpense', 'InterestExpenseDebt'],
    'tax_expense': ['IncomeTaxExpenseBenefit', 'CurrentIncomeTaxExpenseBenefit'],
    'net_income': ['NetIncomeLoss', 'ProfitLoss'],
    'd_and_a': [
        'DepreciationDepletionAndAmortization', 'Depreciation',
        'DepreciationAndAmortization', 'AmortizationOfIntangibleAssets'
    ],
    'capex': ['PaymentsToAcquirePropertyPlantAndEquipment', 'CapitalExpendituresIncurredButNotYetPaid'],
    'assets_current': ['AssetsCurrent'],
    'cash': ['CashAndCashEquivalentsAtCarryingValue', 'Cash'],
    'liabilities_current': ['LiabilitiesCurrent'],
    'short_term_borrowings': ['ShortTermBorrowings', 'ShortTermDebt', 'DebtCurrent'],
    'long_term_debt_current': ['LongTermDebtCurrent', 'LongTermDebtAndCapitalLeaseObligationsCurrent'],
    'long_term_debt_noncurrent': ['LongTermDebtNoncurrent', 'LongTermDebt', 'LongTermDebtAndCapitalLeaseObligations'],
    'shares_out': ['CommonStockSharesOutstanding', 'CommonStockSharesIssued']
}

OUTPUT_SCHEMA = [
    'ticker', 'cik', 'fiscal_year', 'revenue', 'ebit', 'ebitda', 'interest_expense',
    'tax_expense', 'net_income', 'd_and_a', 'capex', 'assets_current', 'liabilities_current',
    'cash', 'short_term_borrowings', 'long_term_debt_current', 'long_term_debt_noncurrent',
    'gross_debt', 'net_debt', 'shares_out', 'nwc', 'delta_nwc', 'effective_tax_rate'
]


class SECDataFetcher:
    """Fetches financial data from SEC EDGAR API"""
    
    def __init__(self, max_years=None):
        self.ticker_to_cik = {}
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self.max_years = max_years  # None = all available years
        self.stats = {
            'total_companies': 0,
            'successful': 0,
            'failed': 0,
            'total_records': 0,
            'errors': []
        }
    
    def load_ticker_cik_mapping(self):
        """Load ticker to CIK mapping from SEC"""
        print("Loading ticker-to-CIK mapping from SEC...")
        try:
            response = self.session.get("https://www.sec.gov/files/company_tickers.json")
            response.raise_for_status()
            data = response.json()
            
            for entry in data.values():
                ticker = entry.get('ticker', '').upper()
                cik = str(entry.get('cik_str', '')).zfill(10)
                self.ticker_to_cik[ticker] = cik
            
            print(f"✓ Loaded {len(self.ticker_to_cik)} ticker-CIK mappings")
            return True
        
        except Exception as e:
            print(f"✗ Failed to load ticker mappings: {e}")
            return False
    
    def get_company_facts(self, cik: str) -> Optional[Dict]:
        """Fetch company facts from SEC EDGAR"""
        url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
        
        try:
            time.sleep(RATE_LIMIT_DELAY)
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            return response.json()
        
        except requests.HTTPError as e:
            if e.response.status_code == 404:
                return None
            return None
        
        except Exception as e:
            return None
    
    def extract_annual_facts(self, facts_data: Dict, metric: str) -> Dict[str, float]:
        """Extract annual (10-K) facts for a specific metric"""
        results = {}
        
        for taxonomy in ['us-gaap', 'ifrs-full']:
            facts = facts_data.get('facts', {}).get(taxonomy, {})
            
            for tag in TAG_MAPPINGS.get(metric, []):
                if tag not in facts:
                    continue
                
                units_data = facts[tag].get('units', {})
                usd_data = units_data.get('USD', [])
                
                if not usd_data:
                    continue
                
                for entry in usd_data:
                    form = entry.get('form', '')
                    if form not in ['10-K', '20-F']:
                        continue
                    
                    fiscal_year = entry.get('fy')
                    fiscal_period = entry.get('fp')
                    value = entry.get('val')
                    
                    if fiscal_period == 'FY' and fiscal_year and value is not None:
                        year_key = str(fiscal_year)
                        if year_key not in results:
                            results[year_key] = value
                
                if results:
                    break
            
            if results:
                break
        
        return results
    
    def process_ticker(self, ticker: str) -> List[Dict]:
        """Process a single ticker and return financial records"""
        cik = self.ticker_to_cik.get(ticker)
        if not cik:
            self.stats['errors'].append(f"{ticker}: CIK not found")
            return []
        
        facts_data = self.get_company_facts(cik)
        if not facts_data:
            self.stats['errors'].append(f"{ticker}: No data available")
            return []
        
        # Extract all metrics
        metric_data = {}
        for metric in TAG_MAPPINGS.keys():
            metric_data[metric] = self.extract_annual_facts(facts_data, metric)
        
        # Combine into records by fiscal year
        all_years = set()
        for metric_values in metric_data.values():
            all_years.update(metric_values.keys())
        
        # Sort years and apply limit if specified
        sorted_years = sorted(all_years, reverse=True)
        if self.max_years:
            sorted_years = sorted_years[:self.max_years]
        
        records = []
        prev_nwc = None
        
        for year in sorted(sorted_years):
            record = {
                'ticker': ticker,
                'cik': cik,
                'fiscal_year': int(year)
            }
            
            # Extract raw values
            for metric in TAG_MAPPINGS.keys():
                value = metric_data[metric].get(year)
                record[metric] = value if value is not None else None
            
            # Normalize CapEx as positive
            if record.get('capex'):
                record['capex'] = abs(record['capex'])
            
            # Compute EBITDA
            ebit = record.get('ebit')
            d_and_a = record.get('d_and_a')
            if ebit is not None and d_and_a is not None:
                record['ebitda'] = ebit + d_and_a
            else:
                record['ebitda'] = None
            
            # Compute Gross Debt
            st_borrowings = record.get('short_term_borrowings') or 0
            ltd_current = record.get('long_term_debt_current') or 0
            ltd_noncurrent = record.get('long_term_debt_noncurrent') or 0
            
            if any([st_borrowings, ltd_current, ltd_noncurrent]):
                record['gross_debt'] = st_borrowings + ltd_current + ltd_noncurrent
            else:
                record['gross_debt'] = None
            
            # Compute Net Debt
            gross_debt = record.get('gross_debt')
            cash = record.get('cash')
            if gross_debt is not None and cash is not None:
                record['net_debt'] = gross_debt - cash
            else:
                record['net_debt'] = None
            
            # Compute NWC
            ca = record.get('assets_current')
            cl = record.get('liabilities_current')
            cash = record.get('cash') or 0
            st_debt = (record.get('short_term_borrowings') or 0) + (record.get('long_term_debt_current') or 0)
            
            if ca is not None and cl is not None:
                record['nwc'] = ca - cl - cash - st_debt
            else:
                record['nwc'] = None
            
            # Compute ΔNWC
            current_nwc = record.get('nwc')
            if current_nwc is not None and prev_nwc is not None:
                record['delta_nwc'] = current_nwc - prev_nwc
            else:
                record['delta_nwc'] = None
            prev_nwc = current_nwc
            
            # Compute Effective Tax Rate
            tax_expense = record.get('tax_expense')
            net_income = record.get('net_income')
            if tax_expense is not None and net_income is not None and net_income != 0:
                pretax_income = net_income + tax_expense
                if pretax_income > 0:
                    record['effective_tax_rate'] = tax_expense / pretax_income
                else:
                    record['effective_tax_rate'] = None
            else:
                record['effective_tax_rate'] = None
            
            records.append(record)
        
        return records


def main():
    """Main execution"""
    parser = argparse.ArgumentParser(description='Fetch SEC EDGAR financial data')
    parser.add_argument('--dataset', choices=['top100', 'sp500', 'custom'], default='top100',
                        help='Dataset to fetch (default: top100)')
    parser.add_argument('--years', type=int, default=None,
                        help='Max years per company (default: all available)')
    parser.add_argument('--tickers', nargs='+',
                        help='Custom ticker list (space-separated)')
    parser.add_argument('--output', default='dataset/edgar_all_financials.csv',
                        help='Output CSV file path')
    
    args = parser.parse_args()
    
    # Determine ticker list
    if args.dataset == 'custom' and args.tickers:
        tickers = [t.upper() for t in args.tickers]
    elif args.dataset == 'sp500':
        tickers = SP500_ALL  # Expand this list for full S&P 500
    else:  # top100
        tickers = SP500_TOP100
    
    print("=" * 70)
    print("SEC EDGAR Comprehensive Data Pipeline")
    print("=" * 70)
    print(f"Dataset: {args.dataset}")
    print(f"Companies: {len(tickers)}")
    print(f"Max years per company: {args.years or 'All available'}")
    print(f"Output: {args.output}")
    print()
    
    # Create output directory
    os.makedirs(os.path.dirname(args.output) or '.', exist_ok=True)
    
    # Initialize fetcher
    fetcher = SECDataFetcher(max_years=args.years)
    
    # Load ticker-CIK mapping
    if not fetcher.load_ticker_cik_mapping():
        print("Failed to load ticker mappings. Exiting.")
        return
    
    print()
    print("=" * 70)
    print(f"Processing {len(tickers)} companies...")
    print("=" * 70)
    print()
    
    # Process all tickers with progress
    all_records = []
    start_time = time.time()
    
    for i, ticker in enumerate(tickers, 1):
        progress = f"[{i}/{len(tickers)}]"
        print(f"{progress} {ticker}...", end=" ", flush=True)
        
        records = fetcher.process_ticker(ticker)
        
        if records:
            all_records.extend(records)
            fetcher.stats['successful'] += 1
            print(f"✓ {len(records)} records")
        else:
            fetcher.stats['failed'] += 1
            print("✗ No data")
        
        # Show ETA
        if i % 10 == 0:
            elapsed = time.time() - start_time
            rate = i / elapsed
            remaining = (len(tickers) - i) / rate if rate > 0 else 0
            print(f"  → Progress: {i}/{len(tickers)} ({i/len(tickers)*100:.1f}%) | ETA: {remaining/60:.1f} min")
            print()
    
    # Write to CSV
    print()
    print("=" * 70)
    print("Writing results to CSV...")
    print("=" * 70)
    
    if not all_records:
        print("✗ No data collected. Exiting.")
        return
    
    with open(args.output, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_SCHEMA)
        writer.writeheader()
        
        for record in all_records:
            row = {field: record.get(field, None) for field in OUTPUT_SCHEMA}
            writer.writerow(row)
    
    # Summary
    elapsed_time = time.time() - start_time
    fetcher.stats['total_companies'] = len(tickers)
    fetcher.stats['total_records'] = len(all_records)
    
    print(f"✓ Wrote {len(all_records)} records to {args.output}")
    print()
    print("=" * 70)
    print("Summary")
    print("=" * 70)
    print(f"Total companies: {fetcher.stats['total_companies']}")
    print(f"  ✓ Successful: {fetcher.stats['successful']}")
    print(f"  ✗ Failed: {fetcher.stats['failed']}")
    print(f"Total records: {fetcher.stats['total_records']}")
    if fetcher.stats['successful'] > 0:
        print(f"Average records per company: {fetcher.stats['total_records'] / fetcher.stats['successful']:.1f}")
    print(f"Execution time: {elapsed_time/60:.1f} minutes")
    print(f"Records per second: {fetcher.stats['total_records'] / elapsed_time:.1f}")
    print()
    
    if fetcher.stats['errors']:
        print("Errors encountered:")
        for error in fetcher.stats['errors'][:10]:
            print(f"  - {error}")
        if len(fetcher.stats['errors']) > 10:
            print(f"  ... and {len(fetcher.stats['errors']) - 10} more")
        print()
    
    print("=" * 70)
    print("✓ Pipeline complete!")
    print("=" * 70)


if __name__ == '__main__':
    main()


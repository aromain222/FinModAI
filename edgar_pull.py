#!/usr/bin/env python3
"""
SEC EDGAR Financial Data Pipeline
Fetches 5 years of audited annual financials for 25 large-cap companies
No API key required - uses public SEC endpoints
"""

import requests
import json
import time
import csv
from typing import Dict, List, Optional, Any
from datetime import datetime
import os

# Configuration
TICKERS = [
    'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NVDA', 'TSLA', 'ORCL', 'INTC', 'CSCO',
    'NFLX', 'DIS', 'V', 'MA', 'JPM', 'BAC', 'WFC', 'PEP', 'KO', 'WMT',
    'COST', 'JNJ', 'PFE', 'XOM', 'CVX'
]

HEADERS = {
    "User-Agent": "FinModAI/1.0 (avery@example.com)",
    "Accept": "application/json"
}

RATE_LIMIT_DELAY = 0.6  # SEC requests ~10 requests per second max

# XBRL tag mappings (common tags across US-GAAP and IFRS-FULL taxonomies)
TAG_MAPPINGS = {
    # Income Statement
    'revenue': [
        'Revenues',
        'RevenueFromContractWithCustomerExcludingAssessedTax',
        'SalesRevenueNet',
        'RevenuesNetOfInterestExpense'
    ],
    'ebit': [
        'OperatingIncomeLoss',
        'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest'
    ],
    'interest_expense': [
        'InterestExpense',
        'InterestExpenseDebt'
    ],
    'tax_expense': [
        'IncomeTaxExpenseBenefit',
        'CurrentIncomeTaxExpenseBenefit'
    ],
    'net_income': [
        'NetIncomeLoss',
        'ProfitLoss'
    ],
    # Cash Flow Statement
    'd_and_a': [
        'DepreciationDepletionAndAmortization',
        'Depreciation',
        'DepreciationAndAmortization',
        'AmortizationOfIntangibleAssets'
    ],
    'capex': [
        'PaymentsToAcquirePropertyPlantAndEquipment',
        'CapitalExpendituresIncurredButNotYetPaid'
    ],
    # Balance Sheet - Assets
    'assets_current': [
        'AssetsCurrent'
    ],
    'cash': [
        'CashAndCashEquivalentsAtCarryingValue',
        'Cash'
    ],
    # Balance Sheet - Liabilities
    'liabilities_current': [
        'LiabilitiesCurrent'
    ],
    'short_term_borrowings': [
        'ShortTermBorrowings',
        'ShortTermDebt',
        'DebtCurrent'
    ],
    'long_term_debt_current': [
        'LongTermDebtCurrent',
        'LongTermDebtAndCapitalLeaseObligationsCurrent'
    ],
    'long_term_debt_noncurrent': [
        'LongTermDebtNoncurrent',
        'LongTermDebt',
        'LongTermDebtAndCapitalLeaseObligations'
    ],
    # Equity
    'shares_out': [
        'CommonStockSharesOutstanding',
        'CommonStockSharesIssued'
    ]
}

OUTPUT_SCHEMA = [
    'ticker', 'cik', 'fiscal_year',
    'revenue', 'ebit', 'ebitda', 'interest_expense', 'tax_expense', 'net_income',
    'd_and_a', 'capex', 'assets_current', 'liabilities_current', 'cash',
    'short_term_borrowings', 'long_term_debt_current', 'long_term_debt_noncurrent',
    'gross_debt', 'net_debt', 'shares_out', 'nwc', 'delta_nwc', 'effective_tax_rate'
]


class SECDataFetcher:
    """Fetches financial data from SEC EDGAR API"""
    
    def __init__(self):
        self.ticker_to_cik = {}
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
    
    def load_ticker_cik_mapping(self):
        """Load ticker to CIK mapping from SEC"""
        print("Loading ticker-to-CIK mapping from SEC...")
        try:
            response = self.session.get("https://www.sec.gov/files/company_tickers.json")
            response.raise_for_status()
            data = response.json()
            
            # Parse mapping
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
            time.sleep(RATE_LIMIT_DELAY)  # Rate limiting
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            return response.json()
        
        except requests.HTTPError as e:
            if e.response.status_code == 404:
                print(f"  ⚠ CIK {cik}: No data available (404)")
            else:
                print(f"  ✗ CIK {cik}: HTTP {e.response.status_code}")
            return None
        
        except Exception as e:
            print(f"  ✗ CIK {cik}: {str(e)}")
            return None
    
    def extract_annual_facts(self, facts_data: Dict, metric: str) -> Dict[str, float]:
        """Extract annual (10-K) facts for a specific metric"""
        results = {}
        
        # Try US-GAAP first, then IFRS-FULL
        for taxonomy in ['us-gaap', 'ifrs-full']:
            facts = facts_data.get('facts', {}).get(taxonomy, {})
            
            for tag in TAG_MAPPINGS.get(metric, []):
                if tag not in facts:
                    continue
                
                # Get USD values
                units_data = facts[tag].get('units', {})
                usd_data = units_data.get('USD', [])
                
                if not usd_data:
                    continue
                
                # Filter for annual filings (10-K, 20-F)
                for entry in usd_data:
                    form = entry.get('form', '')
                    if form not in ['10-K', '20-F']:
                        continue
                    
                    fiscal_year = entry.get('fy')
                    fiscal_period = entry.get('fp')
                    value = entry.get('val')
                    
                    # Only annual (FY) data
                    if fiscal_period == 'FY' and fiscal_year and value is not None:
                        # Keep most recent value for each fiscal year
                        filed_date = entry.get('filed', '')
                        year_key = str(fiscal_year)
                        
                        if year_key not in results:
                            results[year_key] = value
                        else:
                            # Keep more recent filing if duplicate
                            existing_value = results[year_key]
                            if filed_date:  # More recent filing
                                results[year_key] = value
                
                # If we found data, stop searching
                if results:
                    break
            
            if results:
                break
        
        return results
    
    def process_ticker(self, ticker: str) -> List[Dict]:
        """Process a single ticker and return financial records"""
        cik = self.ticker_to_cik.get(ticker)
        if not cik:
            print(f"✗ {ticker}: CIK not found")
            return []
        
        print(f"Fetching {ticker} (CIK: {cik})...")
        
        # Get company facts
        facts_data = self.get_company_facts(cik)
        if not facts_data:
            return []
        
        # Extract all metrics
        metric_data = {}
        for metric in TAG_MAPPINGS.keys():
            metric_data[metric] = self.extract_annual_facts(facts_data, metric)
        
        # Combine into records by fiscal year
        all_years = set()
        for metric_values in metric_data.values():
            all_years.update(metric_values.keys())
        
        # Keep only last 5 years
        sorted_years = sorted(all_years, reverse=True)[:5]
        
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
            
            # Normalize CapEx as positive outflow
            if record.get('capex'):
                record['capex'] = abs(record['capex'])
            
            # Compute EBITDA = EBIT + D&A
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
            
            # Compute Net Debt = Gross Debt - Cash
            gross_debt = record.get('gross_debt')
            cash = record.get('cash')
            if gross_debt is not None and cash is not None:
                record['net_debt'] = gross_debt - cash
            else:
                record['net_debt'] = None
            
            # Compute NWC = Current Assets - Current Liabilities - Cash - Short-term Debt
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
        
        print(f"  ✓ {ticker}: Extracted {len(records)} annual records")
        return records


def main():
    """Main execution"""
    print("=" * 70)
    print("SEC EDGAR Financial Data Pipeline")
    print("=" * 70)
    print()
    
    # Create output directory
    os.makedirs('dataset', exist_ok=True)
    output_path = 'dataset/edgar_financials.csv'
    
    # Initialize fetcher
    fetcher = SECDataFetcher()
    
    # Load ticker-CIK mapping
    if not fetcher.load_ticker_cik_mapping():
        print("Failed to load ticker mappings. Exiting.")
        return
    
    print()
    print("=" * 70)
    print(f"Processing {len(TICKERS)} tickers...")
    print("=" * 70)
    print()
    
    # Process all tickers
    all_records = []
    successful = 0
    failed = 0
    
    for i, ticker in enumerate(TICKERS, 1):
        print(f"[{i}/{len(TICKERS)}] ", end="")
        records = fetcher.process_ticker(ticker)
        
        if records:
            all_records.extend(records)
            successful += 1
        else:
            failed += 1
        
        print()
    
    # Write to CSV
    print("=" * 70)
    print("Writing results to CSV...")
    print("=" * 70)
    
    if not all_records:
        print("✗ No data collected. Exiting.")
        return
    
    with open(output_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_SCHEMA)
        writer.writeheader()
        
        for record in all_records:
            # Ensure all fields exist
            row = {field: record.get(field, None) for field in OUTPUT_SCHEMA}
            writer.writerow(row)
    
    print(f"✓ Wrote {len(all_records)} records to {output_path}")
    print()
    
    # Summary statistics
    print("=" * 70)
    print("Summary")
    print("=" * 70)
    print(f"Total tickers processed: {len(TICKERS)}")
    print(f"  ✓ Successful: {successful}")
    print(f"  ✗ Failed: {failed}")
    print(f"Total records: {len(all_records)}")
    print(f"Average records per ticker: {len(all_records) / successful:.1f}")
    print()
    
    # Sample data
    if all_records:
        print("Sample records (first 3):")
        for i, record in enumerate(all_records[:3], 1):
            print(f"\n{i}. {record['ticker']} FY{record['fiscal_year']}:")
            revenue = record.get('revenue')
            ebit = record.get('ebit')
            ebitda = record.get('ebitda')
            net_income = record.get('net_income')
            
            print(f"   Revenue: ${revenue:,.0f}" if revenue else "   Revenue: N/A")
            print(f"   EBIT: ${ebit:,.0f}" if ebit else "   EBIT: N/A")
            print(f"   EBITDA: ${ebitda:,.0f}" if ebitda else "   EBITDA: N/A")
            print(f"   Net Income: ${net_income:,.0f}" if net_income else "   Net Income: N/A")
    
    print()
    print("=" * 70)
    print("✓ Pipeline complete!")
    print("=" * 70)


if __name__ == '__main__':
    main()


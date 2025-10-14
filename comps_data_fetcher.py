"""
Trading Comparables Data Fetcher
Aggregates financial data from SEC EDGAR and Yahoo Finance to generate comps tables
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Any
import logging
from datetime import datetime

# Import existing providers
from sec_edgar_provider import get_sec_provider

# Try to import yfinance
try:
    import yfinance as yf
    YFINANCE_AVAILABLE = True
except ImportError:
    YFINANCE_AVAILABLE = False
    logging.warning("yfinance not available - market data will be limited")

logger = logging.getLogger(__name__)


class CompsDataFetcher:
    """
    Fetches and aggregates comparable company data
    Priority: SEC EDGAR (fundamentals) → Yahoo Finance (market data + fallback)
    """
    
    def __init__(self):
        self.sec_provider = get_sec_provider()
        logger.info("✓ CompsDataFetcher initialized")
    
    def fetch_company_data(self, ticker: str) -> Optional[Dict[str, Any]]:
        """
        Fetch comprehensive data for one company.
        
        Data Sources:
        - SEC EDGAR: Revenue, EBITDA, EBIT, Net Income, Cash, Debt (latest FY)
        - Yahoo Finance: Market Cap, Price, Shares Outstanding (real-time)
        
        Returns:
            Dict with all financial metrics or None if insufficient data
        """
        ticker = ticker.upper()
        logger.info(f"Fetching data for {ticker}...")
        
        data = {
            'ticker': ticker,
            'company_name': ticker,  # Will be updated if available
            'data_sources': []
        }
        
        # 1. Try SEC EDGAR for fundamentals
        sec_data = None
        if self.sec_provider.has_ticker(ticker):
            sec_data = self.sec_provider.get_latest_financials(ticker)
            if sec_data:
                data['data_sources'].append('SEC_EDGAR')
                data['revenue_ttm'] = sec_data.get('revenue')
                data['ebitda_ttm'] = sec_data.get('ebitda')
                data['ebit_ttm'] = sec_data.get('ebit')
                data['net_income_ttm'] = sec_data.get('net_income')
                data['cash'] = sec_data.get('cash')
                data['total_debt'] = sec_data.get('gross_debt')
                data['shares_out'] = sec_data.get('shares_out')
                data['fiscal_year'] = int(sec_data.get('fiscal_year', 0))
                logger.info(f"  ✓ SEC EDGAR: FY{data['fiscal_year']} data")
        
        # 2. Fetch Yahoo Finance for market data
        yf_data = None
        if YFINANCE_AVAILABLE:
            try:
                stock = yf.Ticker(ticker)
                info = stock.info
                
                if info:
                    data['data_sources'].append('Yahoo_Finance')
                    
                    # Company name
                    data['company_name'] = info.get('longName', ticker)
                    
                    # Market data
                    data['market_cap'] = info.get('marketCap')
                    data['price'] = info.get('currentPrice') or info.get('regularMarketPrice')
                    
                    # Fill in missing fundamentals from Yahoo if SEC doesn't have them
                    if not data.get('shares_out'):
                        data['shares_out'] = info.get('sharesOutstanding')
                    if not data.get('revenue_ttm'):
                        data['revenue_ttm'] = info.get('totalRevenue')
                    if not data.get('ebitda_ttm'):
                        data['ebitda_ttm'] = info.get('ebitda')
                    if not data.get('net_income_ttm'):
                        data['net_income_ttm'] = info.get('netIncomeToCommon')
                    if not data.get('cash'):
                        data['cash'] = info.get('totalCash')
                    if not data.get('total_debt'):
                        data['total_debt'] = info.get('totalDebt')
                    
                    # Beta for risk analysis
                    data['beta'] = info.get('beta')
                    
                    logger.info(f"  ✓ Yahoo Finance: Market cap ${data.get('market_cap', 0)/1e9:.1f}B")
                    
            except Exception as e:
                logger.warning(f"  ⚠ Yahoo Finance failed for {ticker}: {e}")
        
        # 3. Validate we have minimum required data
        required_fields = ['market_cap', 'revenue_ttm']
        missing = [f for f in required_fields if not data.get(f)]
        
        if missing:
            logger.warning(f"  ✗ {ticker}: Missing required fields: {missing}")
            return None
        
        # 4. Calculate enterprise value
        market_cap = data.get('market_cap', 0) or 0
        total_debt = data.get('total_debt', 0) or 0
        cash = data.get('cash', 0) or 0
        data['enterprise_value'] = market_cap + total_debt - cash
        
        # 5. Calculate Net Debt
        data['net_debt'] = total_debt - cash
        
        logger.info(f"  ✓ {ticker}: Complete ({', '.join(data['data_sources'])})")
        return data
    
    def fetch_comps_table(self, tickers: List[str]) -> pd.DataFrame:
        """
        Fetch data for multiple companies and return as DataFrame.
        
        Args:
            tickers: List of stock tickers
        
        Returns:
            DataFrame with rows=companies, columns=financial metrics
        """
        logger.info(f"Fetching comps data for {len(tickers)} companies...")
        
        results = []
        for ticker in tickers:
            data = self.fetch_company_data(ticker)
            if data:
                results.append(data)
            else:
                logger.warning(f"Skipping {ticker} due to insufficient data")
        
        if not results:
            logger.error("No valid company data fetched")
            return pd.DataFrame()
        
        df = pd.DataFrame(results)
        logger.info(f"✓ Successfully fetched {len(df)} companies")
        return df
    
    def calculate_multiples(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculate valuation multiples for the comps table.
        
        Multiples calculated:
        - EV/Revenue
        - EV/EBITDA
        - EV/EBIT
        - P/E (Price / EPS or Market Cap / Net Income)
        - Net Debt/EBITDA
        - Debt/Equity
        
        Args:
            df: DataFrame with company financial data
        
        Returns:
            DataFrame with additional multiple columns
        """
        if df.empty:
            return df
        
        df = df.copy()
        
        # EV/Revenue
        df['ev_revenue'] = np.where(
            (df['revenue_ttm'].notna()) & (df['revenue_ttm'] > 0),
            df['enterprise_value'] / df['revenue_ttm'],
            np.nan
        )
        
        # EV/EBITDA
        df['ev_ebitda'] = np.where(
            (df['ebitda_ttm'].notna()) & (df['ebitda_ttm'] > 0),
            df['enterprise_value'] / df['ebitda_ttm'],
            np.nan
        )
        
        # EV/EBIT
        df['ev_ebit'] = np.where(
            (df['ebit_ttm'].notna()) & (df['ebit_ttm'] > 0),
            df['enterprise_value'] / df['ebit_ttm'],
            np.nan
        )
        
        # P/E (Market Cap / Net Income)
        df['pe_ratio'] = np.where(
            (df['net_income_ttm'].notna()) & (df['net_income_ttm'] > 0),
            df['market_cap'] / df['net_income_ttm'],
            np.nan
        )
        
        # Net Debt/EBITDA (leverage ratio)
        df['net_debt_ebitda'] = np.where(
            (df['ebitda_ttm'].notna()) & (df['ebitda_ttm'] > 0),
            df['net_debt'] / df['ebitda_ttm'],
            np.nan
        )
        
        logger.info(f"✓ Calculated multiples for {len(df)} companies")
        return df
    
    def calculate_summary_stats(self, df: pd.DataFrame) -> Dict[str, Dict[str, float]]:
        """
        Calculate summary statistics for valuation multiples.
        
        Args:
            df: DataFrame with calculated multiples
        
        Returns:
            Dict with stats for each multiple: {'ev_revenue': {'mean': ..., 'median': ...}}
        """
        if df.empty:
            return {}
        
        multiple_cols = ['ev_revenue', 'ev_ebitda', 'ev_ebit', 'pe_ratio', 'net_debt_ebitda']
        stats = {}
        
        for col in multiple_cols:
            if col in df.columns:
                values = df[col].dropna()
                if len(values) > 0:
                    stats[col] = {
                        'mean': float(values.mean()),
                        'median': float(values.median()),
                        'percentile_25': float(values.quantile(0.25)),
                        'percentile_75': float(values.quantile(0.75)),
                        'min': float(values.min()),
                        'max': float(values.max()),
                        'count': int(len(values))
                    }
                else:
                    stats[col] = None
        
        logger.info(f"✓ Calculated summary statistics")
        return stats
    
    def format_for_display(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Format DataFrame for display (round values, convert to billions, etc.)
        
        Args:
            df: Raw DataFrame with financial data
        
        Returns:
            Formatted DataFrame
        """
        if df.empty:
            return df
        
        df = df.copy()
        
        # Select and order columns for display
        display_cols = [
            'ticker', 'company_name', 'market_cap', 'enterprise_value',
            'revenue_ttm', 'ebitda_ttm', 'ebit_ttm', 'net_income_ttm',
            'ev_revenue', 'ev_ebitda', 'ev_ebit', 'pe_ratio', 
            'net_debt_ebitda', 'beta', 'data_sources'
        ]
        
        # Only include columns that exist
        display_cols = [col for col in display_cols if col in df.columns]
        df = df[display_cols]
        
        # Round multiples to 1 decimal
        multiple_cols = ['ev_revenue', 'ev_ebitda', 'ev_ebit', 'pe_ratio', 'net_debt_ebitda', 'beta']
        for col in multiple_cols:
            if col in df.columns:
                df[col] = df[col].round(1)
        
        return df
    
    def generate_comps_analysis(self, ticker: str, peer_tickers: List[str] = None, 
                                limit: int = 10) -> Dict[str, Any]:
        """
        Complete comps analysis pipeline.
        
        Args:
            ticker: Primary company ticker
            peer_tickers: Optional list of peer tickers. If None, auto-discover.
            limit: Max number of peers if auto-discovering
        
        Returns:
            Complete analysis dict with table, stats, and metadata
        """
        from sector_mapping import find_peers, get_sector
        
        ticker = ticker.upper()
        logger.info(f"Starting comps analysis for {ticker}")
        
        # Get peer list
        if not peer_tickers:
            peer_tickers = find_peers(ticker, limit=limit)
            logger.info(f"Auto-discovered {len(peer_tickers)} peers")
        else:
            peer_tickers = [p.upper() for p in peer_tickers]
            logger.info(f"Using {len(peer_tickers)} manual peers")
        
        # Ensure primary ticker is included
        all_tickers = [ticker] + [p for p in peer_tickers if p != ticker]
        
        # Fetch data
        comps_df = self.fetch_comps_table(all_tickers)
        
        if comps_df.empty:
            return {
                'status': 'error',
                'message': 'No valid data fetched for any companies',
                'ticker': ticker
            }
        
        # Calculate multiples
        comps_with_multiples = self.calculate_multiples(comps_df)
        
        # Calculate summary stats
        summary_stats = self.calculate_summary_stats(comps_with_multiples)
        
        # Format for display
        display_df = self.format_for_display(comps_with_multiples)
        
        # Get sector info
        sector_info = get_sector(ticker)
        
        return {
            'status': 'success',
            'ticker': ticker,
            'sector': sector_info.get('sector') if sector_info else 'Unknown',
            'industry': sector_info.get('industry') if sector_info else 'Unknown',
            'num_comps': len(display_df),
            'comps_table': display_df.to_dict('records'),
            'summary_stats': summary_stats,
            'timestamp': datetime.now().isoformat(),
            'data_sources': list(set(
                source 
                for sources in comps_df['data_sources'] 
                for source in sources
            ))
        }


if __name__ == '__main__':
    # Test the fetcher
    print("=" * 70)
    print("Comps Data Fetcher Test")
    print("=" * 70)
    
    fetcher = CompsDataFetcher()
    
    # Test single company
    print("\nTest 1: Fetch single company (AAPL)")
    print("-" * 70)
    aapl_data = fetcher.fetch_company_data('AAPL')
    if aapl_data:
        print(f"✓ AAPL data fetched")
        print(f"  Market Cap: ${aapl_data.get('market_cap', 0)/1e9:.1f}B")
        print(f"  Revenue: ${aapl_data.get('revenue_ttm', 0)/1e9:.1f}B")
        print(f"  EV: ${aapl_data.get('enterprise_value', 0)/1e9:.1f}B")
        print(f"  Sources: {', '.join(aapl_data.get('data_sources', []))}")
    
    # Test comps analysis
    print("\nTest 2: Full comps analysis (AAPL vs peers)")
    print("-" * 70)
    analysis = fetcher.generate_comps_analysis('AAPL', limit=5)
    
    if analysis['status'] == 'success':
        print(f"✓ Analysis complete")
        print(f"  Primary: {analysis['ticker']}")
        print(f"  Sector: {analysis['sector']}")
        print(f"  Industry: {analysis['industry']}")
        print(f"  Comparables: {analysis['num_comps']}")
        print(f"  Data sources: {', '.join(analysis['data_sources'])}")
        
        if analysis['summary_stats'].get('ev_revenue'):
            ev_rev_stats = analysis['summary_stats']['ev_revenue']
            print(f"\n  EV/Revenue multiples:")
            print(f"    Mean: {ev_rev_stats['mean']:.1f}x")
            print(f"    Median: {ev_rev_stats['median']:.1f}x")
            print(f"    Range: {ev_rev_stats['min']:.1f}x - {ev_rev_stats['max']:.1f}x")
    
    print("\n" + "=" * 70)
    print("✓ Test Complete")
    print("=" * 70)


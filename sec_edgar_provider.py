"""
SEC EDGAR Data Provider
Uses local SEC EDGAR dataset as ultimate fallback for financial data
No API key required - uses locally cached data
"""

import pandas as pd
import os
from typing import Dict, Optional, List, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class SECEDGARProvider:
    """
    Provider that uses local SEC EDGAR data as fallback.
    Completely free, no API key required.
    """
    
    def __init__(self, data_path='dataset/edgar_top100_all_years.csv'):
        self.name = "SEC_EDGAR"
        self.data_path = data_path
        self.data = None
        self.available_tickers = set()
        self._load_data()
    
    def _load_data(self):
        """Load SEC EDGAR dataset"""
        try:
            if os.path.exists(self.data_path):
                self.data = pd.read_csv(self.data_path)
                self.available_tickers = set(self.data['ticker'].unique())
                logger.info(f"✓ SEC EDGAR: Loaded {len(self.data)} records for {len(self.available_tickers)} companies")
            else:
                logger.warning(f"⚠ SEC EDGAR: Data file not found at {self.data_path}")
        except Exception as e:
            logger.error(f"✗ SEC EDGAR: Failed to load data: {e}")
    
    def is_available(self) -> bool:
        """Check if provider has data loaded"""
        return self.data is not None and len(self.data) > 0
    
    def has_ticker(self, ticker: str) -> bool:
        """Check if ticker is available in dataset"""
        return ticker.upper() in self.available_tickers
    
    def get_company_data(self, ticker: str, years: int = 5) -> Optional[List[Dict]]:
        """
        Get historical financial data for a company
        
        Args:
            ticker: Stock ticker (e.g., 'AAPL')
            years: Number of years to retrieve (default: 5)
        
        Returns:
            List of financial records or None if not available
        """
        if not self.is_available():
            return None
        
        ticker = ticker.upper()
        if not self.has_ticker(ticker):
            return None
        
        # Get company data
        company_data = self.data[self.data['ticker'] == ticker].sort_values('fiscal_year', ascending=False)
        
        # Limit to requested years
        if years:
            company_data = company_data.head(years)
        
        # Convert to list of dicts
        records = company_data.to_dict('records')
        
        logger.info(f"SEC EDGAR: Retrieved {len(records)} years for {ticker}")
        return records
    
    def get_latest_financials(self, ticker: str) -> Optional[Dict]:
        """Get most recent financial data for a company"""
        records = self.get_company_data(ticker, years=1)
        return records[0] if records else None
    
    def calculate_assumptions(self, ticker: str, years: int = 5) -> Optional[Dict[str, Any]]:
        """
        Calculate financial assumptions from historical data
        Used for DCF, LBO, and other models
        """
        records = self.get_company_data(ticker, years=years)
        if not records or len(records) < 3:
            return None
        
        df = pd.DataFrame(records).sort_values('fiscal_year')
        
        # Calculate revenue growth rates
        revenues = df['revenue'].dropna()
        if len(revenues) >= 3:
            revenue_growth = []
            for i in range(1, len(revenues)):
                if revenues.iloc[i-1] > 0:
                    growth = (revenues.iloc[i] / revenues.iloc[i-1]) - 1
                    revenue_growth.append(growth)
            
            # Calculate CAGR
            if len(revenues) >= 2:
                first_rev = revenues.iloc[0]
                last_rev = revenues.iloc[-1]
                years_span = len(revenues) - 1
                cagr = (last_rev / first_rev) ** (1/years_span) - 1 if first_rev > 0 else 0
            else:
                cagr = 0
        else:
            revenue_growth = []
            cagr = 0.08  # Default
        
        # Calculate operating margin
        operating_margins = []
        for _, row in df.iterrows():
            if pd.notna(row['revenue']) and pd.notna(row['ebit']) and row['revenue'] > 0:
                margin = row['ebit'] / row['revenue']
                operating_margins.append(margin)
        
        avg_operating_margin = sum(operating_margins) / len(operating_margins) if operating_margins else 0.20
        
        # Calculate tax rate
        tax_rates = df['effective_tax_rate'].dropna()
        avg_tax_rate = tax_rates.mean() if len(tax_rates) > 0 else 0.21
        
        # Calculate CapEx as % of revenue
        capex_pct = []
        for _, row in df.iterrows():
            if pd.notna(row['revenue']) and pd.notna(row['capex']) and row['revenue'] > 0:
                pct = row['capex'] / row['revenue']
                capex_pct.append(pct)
        avg_capex_pct = sum(capex_pct) / len(capex_pct) if capex_pct else 0.06
        
        # Calculate D&A as % of revenue
        da_pct = []
        for _, row in df.iterrows():
            if pd.notna(row['revenue']) and pd.notna(row['d_and_a']) and row['revenue'] > 0:
                pct = row['d_and_a'] / row['revenue']
                da_pct.append(pct)
        avg_da_pct = sum(da_pct) / len(da_pct) if da_pct else 0.04
        
        # Get latest debt metrics
        latest = df.iloc[-1]
        
        # Build assumptions dict
        assumptions = {
            'ticker': ticker,
            'company_name': ticker,  # SEC data doesn't have company names
            'data_source': 'SEC_EDGAR',
            'years_available': len(df),
            'period': f"{int(df['fiscal_year'].min())}-{int(df['fiscal_year'].max())}",
            
            # Growth assumptions
            'revenue_cagr': cagr,
            'recent_revenue_growth': revenue_growth[-1] if revenue_growth else cagr,
            
            # Projected revenue growth (fade from recent to terminal)
            'revenue_growth_projection': [
                max(0.02, cagr * 0.9),
                max(0.02, cagr * 0.7),
                max(0.02, cagr * 0.5),
                max(0.02, cagr * 0.4),
                max(0.02, cagr * 0.3)
            ],
            
            # Margin assumptions
            'operating_margin': avg_operating_margin,
            'operating_margin_projection': [avg_operating_margin] * 5,
            
            # Tax and WACC
            'tax_rate': avg_tax_rate,
            'wacc': 0.10,  # Default, would need market data for precise calculation
            'terminal_growth': min(0.025, max(0.02, cagr * 0.3)),
            
            # Cash flow assumptions
            'capex_pct_revenue': avg_capex_pct,
            'da_pct_revenue': avg_da_pct,
            'nwc_pct_revenue': 0.03,  # Default
            
            # Latest balance sheet
            'cash': latest.get('cash'),
            'gross_debt': latest.get('gross_debt'),
            'net_debt': latest.get('net_debt'),
            'shares_outstanding': latest.get('shares_out'),
            
            # Historical data
            'historical': {
                'revenues': revenues.tolist() if len(revenues) > 0 else [],
                'operating_margins': operating_margins,
                'tax_rates': tax_rates.tolist() if len(tax_rates) > 0 else []
            },
            
            # Metadata
            'provenance': {
                'source': 'SEC EDGAR',
                'filing_type': '10-K/20-F',
                'last_updated': datetime.now().isoformat(),
                'years_of_data': len(df)
            }
        }
        
        return assumptions
    
    def get_comparables(self, ticker: str, sector: str = None, limit: int = 10) -> List[str]:
        """
        Get comparable companies from dataset
        Simple implementation - returns other companies with similar data availability
        """
        if not self.is_available():
            return []
        
        # For now, return other tickers with good data
        # In production, would use sector classification
        available = list(self.available_tickers)
        
        # Remove the query ticker
        if ticker.upper() in available:
            available.remove(ticker.upper())
        
        # Return up to limit
        return available[:limit]
    
    def get_status(self) -> Dict[str, Any]:
        """Get provider status for health checks"""
        return {
            'name': self.name,
            'available': self.is_available(),
            'companies': len(self.available_tickers),
            'total_records': len(self.data) if self.data is not None else 0,
            'data_path': self.data_path,
            'requires_api_key': False,
            'cost': 'Free',
            'coverage': list(self.available_tickers) if len(self.available_tickers) < 20 else f"{len(self.available_tickers)} companies"
        }


# Global instance
_sec_provider = None


def get_sec_provider() -> SECEDGARProvider:
    """Get or create global SEC EDGAR provider instance"""
    global _sec_provider
    if _sec_provider is None:
        _sec_provider = SECEDGARProvider()
    return _sec_provider


if __name__ == '__main__':
    # Test the provider
    print("="*70)
    print("SEC EDGAR Provider Test")
    print("="*70)
    
    provider = get_sec_provider()
    
    print("\nProvider Status:")
    status = provider.get_status()
    for key, value in status.items():
        print(f"  {key}: {value}")
    
    print("\n" + "="*70)
    print("Testing with AAPL")
    print("="*70)
    
    # Test getting data
    if provider.has_ticker('AAPL'):
        print("\n✓ AAPL is available")
        
        # Get latest
        latest = provider.get_latest_financials('AAPL')
        if latest:
            print(f"\nLatest financials (FY{int(latest['fiscal_year'])}):")
            print(f"  Revenue: ${latest.get('revenue', 0)/1e9:.1f}B")
            print(f"  Net Income: ${latest.get('net_income', 0)/1e9:.1f}B")
            print(f"  Cash: ${latest.get('cash', 0)/1e9:.1f}B")
        
        # Get assumptions
        assumptions = provider.calculate_assumptions('AAPL')
        if assumptions:
            print(f"\nCalculated Assumptions:")
            print(f"  Revenue CAGR: {assumptions['revenue_cagr']*100:.1f}%")
            print(f"  Operating Margin: {assumptions['operating_margin']*100:.1f}%")
            print(f"  Tax Rate: {assumptions['tax_rate']*100:.1f}%")
            print(f"  Years of data: {assumptions['years_available']}")
        
        # Get comparables
        comps = provider.get_comparables('AAPL', limit=5)
        print(f"\nComparable companies: {', '.join(comps[:5])}")
    
    print("\n" + "="*70)
    print("✓ Test Complete")
    print("="*70)


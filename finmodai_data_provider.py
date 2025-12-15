#!/usr/bin/env python3
"""
FINMODAI Data Provider Integration

Integrates FINMODAI with existing data sources:
- API providers (Polygon, FMP, IEX, etc.)
- Web scrapers
- SEC EDGAR filings
- Cached data
"""

import os
import logging
from typing import Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger('FINMODAI_DataProvider')


class FINMODAIDataProvider:
    """
    Unified data provider for FINMODAI
    
    Attempts to fetch real data from multiple sources,
    falls back to estimates if unavailable.
    """
    
    def __init__(self):
        """Initialize data provider with all available sources"""
        self.providers = []
        self._init_providers()
    
    def _init_providers(self):
        """Initialize all available data providers"""
        
        # Try to import existing providers
        try:
            from api.providers import ProviderManager
            self.provider_manager = ProviderManager()
            self.providers.append('provider_manager')
            logger.info("✅ ProviderManager initialized")
        except Exception as e:
            logger.warning(f"⚠️ ProviderManager not available: {e}")
            self.provider_manager = None
        
        # Try to import data fetcher
        try:
            from data_fetcher import DataFetcher
            self.data_fetcher = DataFetcher()
            self.providers.append('data_fetcher')
            logger.info("✅ DataFetcher initialized")
        except Exception as e:
            logger.warning(f"⚠️ DataFetcher not available: {e}")
            self.data_fetcher = None
        
        # Try to import financial data manager
        try:
            from financial_data_manager import FinancialDataManager
            self.financial_data_manager = FinancialDataManager()
            self.providers.append('financial_data_manager')
            logger.info("✅ FinancialDataManager initialized")
        except Exception as e:
            logger.warning(f"⚠️ FinancialDataManager not available: {e}")
            self.financial_data_manager = None
        
        if not self.providers:
            logger.warning("⚠️ No data providers available - will use estimates only")
    
    def get_company_data(self, ticker: str) -> Dict[str, Any]:
        """
        Get company financial data from available sources
        
        Args:
            ticker: Company ticker symbol
        
        Returns:
            Dict with financial data (real or estimated)
        """
        logger.info(f"📊 Fetching data for {ticker}")
        
        # Try each provider in order
        for provider_name in self.providers:
            try:
                data = self._fetch_from_provider(provider_name, ticker)
                if data and self._validate_data(data):
                    logger.info(f"✅ Got data from {provider_name}")
                    data['data_source'] = provider_name
                    data['source'] = 'real'
                    return data
            except Exception as e:
                logger.warning(f"⚠️ {provider_name} failed: {e}")
                continue
        
        # If all providers fail, return estimates
        logger.info(f"📊 Using estimates for {ticker}")
        return self._generate_estimates(ticker)
    
    def _fetch_from_provider(self, provider_name: str, ticker: str) -> Optional[Dict[str, Any]]:
        """Fetch data from specific provider"""
        
        if provider_name == 'provider_manager' and self.provider_manager:
            return self._fetch_from_provider_manager(ticker)
        
        elif provider_name == 'data_fetcher' and self.data_fetcher:
            return self._fetch_from_data_fetcher(ticker)
        
        elif provider_name == 'financial_data_manager' and self.financial_data_manager:
            return self._fetch_from_financial_data_manager(ticker)
        
        return None
    
    def _fetch_from_provider_manager(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Fetch from ProviderManager"""
        try:
            # Get company profile
            profile = self.provider_manager.get_company_profile(ticker)
            if not profile:
                return None
            
            # Get financial statements
            income_stmt = self.provider_manager.get_income_statement(ticker)
            balance_sheet = self.provider_manager.get_balance_sheet(ticker)
            cash_flow = self.provider_manager.get_cash_flow(ticker)
            
            # Extract key metrics
            data = {
                'ticker': ticker,
                'company_name': profile.get('companyName', ticker),
                'sector': profile.get('sector', 'Unknown'),
                'industry': profile.get('industry', 'Unknown'),
            }
            
            # Extract from income statement
            if income_stmt and len(income_stmt) > 0:
                latest = income_stmt[0]
                data['revenue'] = latest.get('revenue', 0) / 1_000_000  # Convert to millions
                data['ebitda'] = latest.get('ebitda', 0) / 1_000_000
                data['ebitda_margin'] = data['ebitda'] / data['revenue'] if data['revenue'] > 0 else 0.25
                data['net_income'] = latest.get('netIncome', 0) / 1_000_000
            
            # Extract from balance sheet
            if balance_sheet and len(balance_sheet) > 0:
                latest = balance_sheet[0]
                data['total_assets'] = latest.get('totalAssets', 0) / 1_000_000
                data['total_debt'] = latest.get('totalDebt', 0) / 1_000_000
                data['cash'] = latest.get('cashAndCashEquivalents', 0) / 1_000_000
                data['net_debt'] = data['total_debt'] - data['cash']
            
            # Extract from cash flow
            if cash_flow and len(cash_flow) > 0:
                latest = cash_flow[0]
                data['operating_cash_flow'] = latest.get('operatingCashFlow', 0) / 1_000_000
                data['capex'] = abs(latest.get('capitalExpenditure', 0)) / 1_000_000
                data['free_cash_flow'] = data['operating_cash_flow'] - data['capex']
            
            # Calculate derived metrics
            if 'revenue' in data and data['revenue'] > 0:
                if 'capex' in data:
                    data['capex_pct_revenue'] = data['capex'] / data['revenue']
            
            # Get market data
            quote = self.provider_manager.get_quote(ticker)
            if quote:
                data['market_cap'] = quote.get('marketCap', 0) / 1_000_000
                data['shares_outstanding'] = quote.get('sharesOutstanding', 0) / 1_000_000
                data['current_price'] = quote.get('price', 0)
                data['pe_ratio'] = quote.get('pe', 20.0)
            
            # Calculate valuation multiples
            if 'market_cap' in data and 'net_debt' in data:
                data['enterprise_value'] = data['market_cap'] + data['net_debt']
                if 'revenue' in data and data['revenue'] > 0:
                    data['ev_revenue_multiple'] = data['enterprise_value'] / data['revenue']
                if 'ebitda' in data and data['ebitda'] > 0:
                    data['ev_ebitda_multiple'] = data['enterprise_value'] / data['ebitda']
            
            # Estimate growth rate (simple)
            if income_stmt and len(income_stmt) >= 2:
                current_rev = income_stmt[0].get('revenue', 0)
                prior_rev = income_stmt[1].get('revenue', 1)
                if prior_rev > 0:
                    data['revenue_growth'] = (current_rev / prior_rev) - 1
            
            # Set default values for missing items
            data.setdefault('revenue_growth', 0.10)
            data.setdefault('wacc', 0.10)
            data.setdefault('terminal_growth', 0.025)
            data.setdefault('tax_rate', 0.21)
            data.setdefault('nwc_pct_revenue', 0.10)
            
            return data
        
        except Exception as e:
            logger.error(f"❌ ProviderManager fetch failed: {e}")
            return None
    
    def _fetch_from_data_fetcher(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Fetch from DataFetcher"""
        try:
            company_data = self.data_fetcher.fetch_company_data(ticker)
            if not company_data:
                return None
            
            # Transform to FINMODAI format
            data = {
                'ticker': ticker,
                'company_name': company_data.get('name', ticker),
                'revenue': company_data.get('revenue', 0),
                'ebitda_margin': company_data.get('ebitda_margin', 0.25),
                'revenue_growth': company_data.get('growth_rate', 0.10),
            }
            
            return data
        
        except Exception as e:
            logger.error(f"❌ DataFetcher fetch failed: {e}")
            return None
    
    def _fetch_from_financial_data_manager(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Fetch from FinancialDataManager"""
        try:
            financial_data = self.financial_data_manager.get_data(ticker)
            if not financial_data:
                return None
            
            # Transform to FINMODAI format
            data = {
                'ticker': ticker,
                'company_name': financial_data.get('company_name', ticker),
            }
            
            # Extract available fields
            for key in ['revenue', 'ebitda_margin', 'revenue_growth', 'net_debt', 
                       'shares_outstanding', 'market_cap', 'pe_ratio']:
                if key in financial_data:
                    data[key] = financial_data[key]
            
            return data
        
        except Exception as e:
            logger.error(f"❌ FinancialDataManager fetch failed: {e}")
            return None
    
    def _validate_data(self, data: Dict[str, Any]) -> bool:
        """Validate that data has minimum required fields"""
        required_fields = ['ticker']
        return all(field in data for field in required_fields)
    
    def _generate_estimates(self, ticker: str) -> Dict[str, Any]:
        """Generate reasonable estimates when real data unavailable"""
        
        # Industry-specific estimates
        estimates = {
            'ticker': ticker,
            'company_name': ticker,
            'revenue': 1000.0,  # $1B baseline
            'revenue_growth': 0.10,  # 10%
            'ebitda_margin': 0.25,  # 25%
            'capex_pct_revenue': 0.05,  # 5%
            'nwc_pct_revenue': 0.10,  # 10%
            'tax_rate': 0.21,  # 21%
            'wacc': 0.10,  # 10%
            'terminal_growth': 0.025,  # 2.5%
            'shares_outstanding': 100.0,  # 100M
            'net_debt': 200.0,  # $200M
            'ev_revenue_multiple': 3.0,  # 3x
            'ev_ebitda_multiple': 12.0,  # 12x
            'pe_multiple': 20.0,  # 20x
            'source': 'estimated',
            'data_source': 'industry_benchmarks'
        }
        
        # Adjust based on ticker patterns (simple heuristics)
        ticker_upper = ticker.upper()
        
        # Tech companies
        if any(tech in ticker_upper for tech in ['AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'NVDA']):
            estimates['revenue'] = 50000.0  # $50B
            estimates['revenue_growth'] = 0.15  # 15%
            estimates['ebitda_margin'] = 0.35  # 35%
            estimates['ev_revenue_multiple'] = 6.0
            estimates['ev_ebitda_multiple'] = 18.0
            estimates['pe_multiple'] = 25.0
        
        # Financial services
        elif any(fin in ticker_upper for fin in ['JPM', 'BAC', 'GS', 'MS', 'C']):
            estimates['revenue'] = 30000.0  # $30B
            estimates['revenue_growth'] = 0.05  # 5%
            estimates['ebitda_margin'] = 0.30  # 30%
            estimates['ev_revenue_multiple'] = 2.0
            estimates['ev_ebitda_multiple'] = 10.0
            estimates['pe_multiple'] = 12.0
        
        # Consumer/Retail
        elif any(retail in ticker_upper for tech in ['WMT', 'TGT', 'COST', 'HD', 'LOW']):
            estimates['revenue'] = 100000.0  # $100B
            estimates['revenue_growth'] = 0.06  # 6%
            estimates['ebitda_margin'] = 0.12  # 12%
            estimates['ev_revenue_multiple'] = 0.8
            estimates['ev_ebitda_multiple'] = 8.0
            estimates['pe_multiple'] = 18.0
        
        return estimates


# Convenience function
def create_finmodai_with_data_provider():
    """Create FINMODAI engine with integrated data provider"""
    from finmodai_engine import FINMODAIEngine
    
    provider = FINMODAIDataProvider()
    engine = FINMODAIEngine(data_provider=provider)
    
    return engine


if __name__ == "__main__":
    # Test the data provider
    print("🧪 Testing FINMODAI Data Provider")
    print("=" * 60)
    
    provider = FINMODAIDataProvider()
    
    # Test with a few tickers
    test_tickers = ['AAPL', 'MSFT', 'UNKNOWN']
    
    for ticker in test_tickers:
        print(f"\n📊 Testing {ticker}:")
        data = provider.get_company_data(ticker)
        print(f"  Source: {data.get('data_source', 'unknown')}")
        print(f"  Revenue: ${data.get('revenue', 0):.1f}M")
        print(f"  Growth: {data.get('revenue_growth', 0)*100:.1f}%")
        print(f"  EBITDA Margin: {data.get('ebitda_margin', 0)*100:.1f}%")


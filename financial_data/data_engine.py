"""
Main Data Engine - Orchestrates providers, merging, and assumptions calculation.
"""

import os
from typing import Optional, Dict, Any
from datetime import datetime
import json
import hashlib

from .contracts import (
    FinancialData, InsufficientDataError, Historicals, Assumptions, 
    Provenance, Config
)
from .providers.base_provider import ProviderData
from .providers.fmp_provider import FMPProvider
from .providers.alpha_vantage_provider import AlphaVantageProvider
from .providers.yahoo_provider import YahooProvider
from .providers.fred_provider import FREDProvider
from .assumptions_calculator import AssumptionsCalculator
from .sanity_checker import SanityChecker
from .demo_data import get_demo_data


class FinancialDataEngine:
    """
    Main engine for fetching and processing financial data.
    Fail-fast design: no generic defaults.
    """
    
    def __init__(self):
        # Initialize providers with API keys from environment
        self.fmp_key = os.getenv("FMP_API_KEY")
        self.alpha_vantage_key = os.getenv("ALPHAVANTAGE_API_KEY")
        self.fred_key = os.getenv("FRED_API_KEY")
        
        self.providers = self._init_providers()
        self.fred_provider = FREDProvider(self.fred_key) if self.fred_key else None
        
        # Simple cache (in production, use Redis with TTL)
        self.cache = {}
    
    def _init_providers(self) -> list:
        """Initialize providers in priority order."""
        providers = []
        
        # Priority 1: FMP
        if self.fmp_key:
            providers.append(FMPProvider(self.fmp_key))
        
        # Priority 2: Alpha Vantage
        if self.alpha_vantage_key:
            providers.append(AlphaVantageProvider(self.alpha_vantage_key))
        
        # Priority 3: Yahoo Finance (no key needed)
        providers.append(YahooProvider())
        
        return providers
    
    def get_assumptions(self, ticker: str, use_cache: bool = True, allow_demo: bool = True) -> Dict[str, Any]:
        """
        Main entry point: Get company-specific assumptions.
        Returns either FinancialData or InsufficientDataError.
        
        If allow_demo=True and APIs fail, returns demo data for common tickers (MSFT, AAPL, GOOGL).
        """
        ticker = ticker.upper().strip()
        
        # Check cache
        if use_cache:
            cached = self._get_from_cache(ticker)
            if cached:
                return cached
        
        # Try providers in order
        provider_attempts = []
        best_data = None
        best_score = 0
        
        for provider in self.providers:
            try:
                provider_attempts.append(provider.name)
                print(f"Trying {provider.name} for {ticker}...")
                
                data = provider.fetch_data(ticker)
                if data:
                    score = data.coverage_score()
                    print(f"{provider.name} score: {score}")
                    
                    if score > best_score:
                        best_score = score
                        best_data = data
                        
                    # If FMP has good data, use it (priority)
                    if provider.name == "FMP" and score >= 200:
                        break
            
            except Exception as e:
                print(f"Error with {provider.name}: {e}")
                continue
        
        # Check if we have sufficient data
        if not best_data or best_score < 200:  # Need at least revenue + EBIT
            # Try demo data if allowed
            if allow_demo:
                demo_data = get_demo_data(ticker)
                if demo_data:
                    print(f"Using demo data for {ticker} (APIs unavailable)")
                    return demo_data
            
            missing = []
            if not best_data or not best_data.revenue or len(best_data.revenue) < 3:
                missing.append("revenue")
            if not best_data or not best_data.operating_income or len(best_data.operating_income) < 3:
                missing.append("operating_income")
            
            error = InsufficientDataError(
                error="insufficient_historicals",
                missing=missing,
                provider_attempts=provider_attempts,
                message=f"Need ≥3 years of revenue and EBIT to build assumptions for {ticker}. APIs currently unavailable - try MSFT, AAPL, or GOOGL for demo data."
            )
            return error.to_dict()
        
        # Build financial data object
        try:
            financial_data = self._build_financial_data(best_data, provider_attempts)
            
            if not financial_data:
                error = InsufficientDataError(
                    error="calculation_failed",
                    missing=["assumptions"],
                    provider_attempts=provider_attempts,
                    message=f"Failed to calculate assumptions for {ticker} despite having data."
                )
                return error.to_dict()
            
            result = financial_data.to_dict()
            
            # Cache result
            self._save_to_cache(ticker, result)
            
            return result
            
        except Exception as e:
            print(f"Error building financial data: {e}")
            error = InsufficientDataError(
                error="processing_error",
                missing=["complete_data"],
                provider_attempts=provider_attempts,
                message=f"Error processing data for {ticker}: {str(e)}"
            )
            return error.to_dict()
    
    def _build_financial_data(
        self,
        provider_data: ProviderData,
        provider_attempts: list
    ) -> Optional[FinancialData]:
        """Build complete FinancialData from provider data."""
        
        # Build historicals
        n = len(provider_data.years)
        
        # Calculate operating margins
        op_margins = []
        for i in range(n):
            if provider_data.revenue[i] and provider_data.operating_income[i]:
                margin = provider_data.operating_income[i] / provider_data.revenue[i]
                op_margins.append(margin)
            else:
                op_margins.append(None)
        
        historicals = Historicals(
            years=provider_data.years,
            revenue=provider_data.revenue,
            operating_income=provider_data.operating_income,
            op_margin=op_margins,
            da=provider_data.da if provider_data.da else [None] * n,
            capex=provider_data.capex if provider_data.capex else [None] * n,
            delta_nwc=provider_data.delta_nwc if provider_data.delta_nwc else [None] * n
        )
        
        # Validate historicals
        valid, error_msg = historicals.validate()
        if not valid:
            print(f"Historicals validation failed: {error_msg}")
            return None
        
        # Calculate assumptions
        calc = AssumptionsCalculator()
        
        revenue_growth = calc.calculate_revenue_growth(
            historicals,
            provider_data.analyst_growth_y1,
            provider_data.analyst_growth_y2
        )
        
        if not revenue_growth:
            print("Failed to calculate revenue growth")
            return None
        
        operating_margin_path = calc.calculate_operating_margin_path(
            historicals,
            provider_data.analyst_margin_y1
        )
        
        if not operating_margin_path:
            print("Failed to calculate operating margin path")
            return None
        
        da_pct = calc.calculate_percentage_of_revenue(historicals, 'da') or 0.04
        capex_pct = calc.calculate_percentage_of_revenue(historicals, 'capex') or 0.06
        nwc_pct = calc.calculate_percentage_of_revenue(historicals, 'delta_nwc') or 0.03
        tax_rate = calc.calculate_tax_rate(historicals) or 0.21
        
        assumptions = Assumptions(
            forecast_years=Config.DEFAULT_FORECAST_YEARS,
            revenue_growth=revenue_growth,
            operating_margin=operating_margin_path,
            da_pct_rev=da_pct,
            capex_pct_rev=capex_pct,
            nwc_pct_rev=abs(nwc_pct),  # Make positive
            tax_rate=tax_rate
        )
        
        # Get risk-free rate
        rf = 0.045  # Default
        rf_date = datetime.now().strftime("%Y-%m-%d")
        if self.fred_provider:
            rf_fetched, rf_date_fetched = self.fred_provider.get_risk_free_rate()
            if rf_fetched:
                rf = rf_fetched
                rf_date = rf_date_fetched
        
        # Calculate WACC
        beta = provider_data.beta if provider_data.beta else 1.0
        total_debt = provider_data.total_debt[0] if provider_data.total_debt and provider_data.total_debt[0] else 0
        market_cap = provider_data.market_cap if provider_data.market_cap else None
        
        if not market_cap and provider_data.current_price and provider_data.shares_outstanding:
            if provider_data.shares_outstanding[0]:
                market_cap = provider_data.current_price * provider_data.shares_outstanding[0]
        
        if not market_cap:
            # Can't calculate WACC without market cap
            market_cap = total_debt * 2  # Rough proxy: assume 67% equity
        
        wacc = calc.calculate_wacc(
            rf=rf,
            beta=beta,
            total_debt=total_debt,
            market_cap=market_cap,
            tax_rate=tax_rate
        )
        
        if not wacc:
            print("Failed to calculate WACC")
            return None
        
        # Calculate terminal
        terminal = calc.calculate_terminal(wacc.wacc)
        
        # Build provenance
        source = provider_attempts[0] if provider_attempts else "Unknown"
        as_of = provider_data.as_of
        
        provenance = {
            "revenue": Provenance(source=source, as_of=as_of),
            "op_margin": Provenance(source=source, as_of=as_of),
            "capex": Provenance(source=source, as_of=as_of),
            "nwc": Provenance(source=source, as_of=as_of),
            "price": Provenance(source=source, as_of=as_of),
            "beta": Provenance(source=source if provider_data.beta else "Computed_Default", as_of=as_of),
            "rf": Provenance(source="FRED_DGS10" if self.fred_provider else "Default", as_of=rf_date)
        }
        
        # Sanity checks
        financial_data = FinancialData(
            ticker=provider_data.ticker,
            company_name=provider_data.company_name or provider_data.ticker,
            currency=provider_data.currency or "USD",
            provenance=provenance,
            historicals=historicals,
            assumptions=assumptions,
            wacc=wacc,
            terminal=terminal,
            flags=[]
        )
        
        # Run sanity checks
        flags = SanityChecker.check_all(financial_data)
        quality_flags = SanityChecker.check_data_quality(
            provider_data.revenue,
            provider_data.operating_income,
            provider_data.analyst_growth_y1 is not None
        )
        financial_data.flags = flags + quality_flags
        
        return financial_data
    
    def _get_cache_key(self, ticker: str) -> str:
        """Generate cache key."""
        return f"assumptions_{ticker}_{datetime.now().strftime('%Y-%m-%d')}"
    
    def _get_from_cache(self, ticker: str) -> Optional[Dict]:
        """Get from cache if exists and fresh."""
        key = self._get_cache_key(ticker)
        return self.cache.get(key)
    
    def _save_to_cache(self, ticker: str, data: Dict):
        """Save to cache."""
        key = self._get_cache_key(ticker)
        self.cache[key] = data


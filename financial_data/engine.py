"""
Main engine for building company-specific assumptions.
"""

from typing import Dict, List, Any, Optional, Union, TypedDict
from datetime import datetime

from .providers import (
    FinancialDataProvider,
    YahooFinanceProvider,
    AlphaVantageProvider,
    FMPProvider,
    GoogleSheetsProvider,
    DataNotAvailableError,
    IncompleteDataError,
)
from .data_merger import DataMerger, MergedData
from .assumptions_builder import AssumptionsBuilder, AssumptionSet
from .config import PROVIDER_PRIORITY

class FinancialDataEngine:
    """Engine for building company-specific assumptions."""
    
    def __init__(self):
        """Initialize the financial data engine."""
        # Create providers
        self.providers = [
            YahooFinanceProvider(),
            AlphaVantageProvider(),
            FMPProvider(),
            GoogleSheetsProvider()
        ]
        
        # Create data merger
        self.data_merger = DataMerger(self.providers, PROVIDER_PRIORITY)
        
        # Create assumptions builder
        self.assumptions_builder = AssumptionsBuilder()
    
    def build_company_assumptions(self, ticker: str, forecast_years: int = 5) -> Dict[str, Any]:
        """
        Build company-specific assumptions for financial models.
        
        Args:
            ticker: Company ticker symbol
            forecast_years: Number of years to forecast
            
        Returns:
            Dict with company-specific assumptions or error information
        """
        try:
            # Merge data from multiple providers
            merged_data = self.data_merger.merge_data(ticker)
            
            # Check if we have sufficient data
            if not merged_data["fundamentals"]:
                return {
                    "error": "insufficient_historicals",
                    "missing": ["revenue", "ebit"],
                    "provider_attempts": merged_data["provider_attempts"],
                    "message": "Need ≥3 years of revenue and EBIT to build assumptions."
                }
            
            # Build assumptions
            assumptions = self.assumptions_builder.build_assumptions(merged_data, forecast_years)
            
            if assumptions:
                return assumptions
            else:
                return {
                    "error": "insufficient_historicals",
                    "missing": ["revenue", "ebit"],
                    "provider_attempts": merged_data["provider_attempts"],
                    "message": "Need ≥3 years of revenue and EBIT to build assumptions."
                }
        except Exception as e:
            return {
                "error": "processing_error",
                "message": f"Error processing data for {ticker}: {e}"
            }

def build_company_assumptions(ticker: str, forecast_years: int = 5) -> Dict[str, Any]:
    """
    Build company-specific assumptions for financial models.
    
    Args:
        ticker: Company ticker symbol
        forecast_years: Number of years to forecast
        
    Returns:
        Dict with company-specific assumptions or error information
    """
    engine = FinancialDataEngine()
    return engine.build_company_assumptions(ticker, forecast_years)

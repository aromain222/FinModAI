"""
Unit tests for the financial data engine.
"""

import unittest
import os
import json
from unittest.mock import patch, MagicMock

import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from financial_data import build_company_assumptions
from financial_data.providers import (
    FinancialDataProvider,
    DataNotAvailableError,
    IncompleteDataError,
    Fundamentals,
    MarketData,
    Estimates,
    PricePoint,
    IncomeStatement,
    BalanceSheet,
    CashFlow,
)

class MockProvider(FinancialDataProvider):
    """Mock provider for testing."""
    
    def __init__(self, name, fundamentals=None, market_data=None, estimates=None, prices=None, risk_free_rate=None):
        """Initialize the mock provider."""
        super().__init__(cache_ttl=0)
        self.name = name
        self._fundamentals = fundamentals
        self._market_data = market_data
        self._estimates = estimates
        self._prices = prices
        self._risk_free_rate = risk_free_rate
    
    def get_fundamentals(self, ticker: str) -> Fundamentals:
        """Get fundamental financial data."""
        if self._fundamentals is None:
            raise DataNotAvailableError(f"No fundamentals data available for {ticker}")
        return self._fundamentals
    
    def get_market_data(self, ticker: str) -> MarketData:
        """Get current market data."""
        if self._market_data is None:
            raise DataNotAvailableError(f"No market data available for {ticker}")
        return self._market_data
    
    def get_estimates(self, ticker: str) -> Optional[Estimates]:
        """Get analyst estimates."""
        return self._estimates
    
    def get_prices(self, ticker: str, period: str = "2y", freq: str = "weekly") -> Optional[List[PricePoint]]:
        """Get historical price data."""
        return self._prices
    
    def get_risk_free_rate(self) -> Optional[float]:
        """Get the current risk-free rate."""
        return self._risk_free_rate

class TestFinancialData(unittest.TestCase):
    """Test cases for the financial data engine."""
    
    def setUp(self):
        """Set up test fixtures."""
        # Create test fixtures directory
        fixtures_dir = os.path.join(os.path.dirname(__file__), "fixtures")
        if not os.path.exists(fixtures_dir):
            os.makedirs(fixtures_dir)
        
        # Define paths to fixture files
        self.complete_data_path = os.path.join(fixtures_dir, "complete_financial_data.json")
        self.partial_data_path = os.path.join(fixtures_dir, "partial_financial_data.json")
        self.missing_data_path = os.path.join(fixtures_dir, "missing_financial_data.json")
        
        # Create fixture files if they don't exist
        if not os.path.exists(self.complete_data_path):
            with open(self.complete_data_path, "w") as f:
                json.dump(self._get_complete_data_fixture(), f, indent=2)
        
        if not os.path.exists(self.partial_data_path):
            with open(self.partial_data_path, "w") as f:
                json.dump(self._get_partial_data_fixture(), f, indent=2)
        
        if not os.path.exists(self.missing_data_path):
            with open(self.missing_data_path, "w") as f:
                json.dump(self._get_missing_data_fixture(), f, indent=2)
    
    def _get_complete_data_fixture(self):
        """Get fixture for complete data."""
        return {
            "fundamentals": {
                "income": [
                    {
                        "year": 2024,
                        "revenue": 250000000000,
                        "ebit": 100000000000,
                        "da": 15000000000,
                        "net_income": 80000000000,
                        "tax_expense": 18000000000,
                        "interest_expense": 2000000000,
                        "pretax_income": 98000000000
                    },
                    {
                        "year": 2023,
                        "revenue": 211900000000,
                        "ebit": 88400000000,
                        "da": 14600000000,
                        "net_income": 72700000000,
                        "tax_expense": 13900000000,
                        "interest_expense": 1800000000,
                        "pretax_income": 86600000000
                    },
                    {
                        "year": 2022,
                        "revenue": 198300000000,
                        "ebit": 83400000000,
                        "da": 14300000000,
                        "net_income": 67400000000,
                        "tax_expense": 14000000000,
                        "interest_expense": 2000000000,
                        "pretax_income": 81400000000
                    },
                    {
                        "year": 2021,
                        "revenue": 168100000000,
                        "ebit": 69900000000,
                        "da": 12300000000,
                        "net_income": 61300000000,
                        "tax_expense": 8800000000,
                        "interest_expense": 2100000000,
                        "pretax_income": 67800000000
                    },
                    {
                        "year": 2020,
                        "revenue": 143000000000,
                        "ebit": 53000000000,
                        "da": 12300000000,
                        "net_income": 44200000000,
                        "tax_expense": 8800000000,
                        "interest_expense": 2400000000,
                        "pretax_income": 50600000000
                    }
                ],
                "balance": [
                    {
                        "year": 2024,
                        "cash": 80000000000,
                        "total_debt": 50000000000,
                        "shares": 7428571428,
                        "total_assets": 400000000000,
                        "total_equity": 200000000000,
                        "current_assets": 150000000000,
                        "current_liabilities": 70000000000
                    },
                    {
                        "year": 2023,
                        "cash": 111300000000,
                        "total_debt": 48200000000,
                        "shares": 7428571428,
                        "total_assets": 364800000000,
                        "total_equity": 166500000000,
                        "current_assets": 172800000000,
                        "current_liabilities": 85700000000
                    },
                    {
                        "year": 2022,
                        "cash": 104700000000,
                        "total_debt": 50500000000,
                        "shares": 7428571428,
                        "total_assets": 364800000000,
                        "total_equity": 166500000000,
                        "current_assets": 169500000000,
                        "current_liabilities": 82400000000
                    },
                    {
                        "year": 2021,
                        "cash": 130300000000,
                        "total_debt": 58200000000,
                        "shares": 7428571428,
                        "total_assets": 333800000000,
                        "total_equity": 141900000000,
                        "current_assets": 184400000000,
                        "current_liabilities": 93700000000
                    },
                    {
                        "year": 2020,
                        "cash": 136500000000,
                        "total_debt": 64300000000,
                        "shares": 7428571428,
                        "total_assets": 301000000000,
                        "total_equity": 118300000000,
                        "current_assets": 181900000000,
                        "current_liabilities": 107000000000
                    }
                ],
                "cashflow": [
                    {
                        "year": 2024,
                        "capex": 25000000000,
                        "delta_nwc": 2000000000,
                        "depreciation_amortization": 15000000000,
                        "operating_cash_flow": 100000000000
                    },
                    {
                        "year": 2023,
                        "capex": 21700000000,
                        "delta_nwc": 1000000000,
                        "depreciation_amortization": 14600000000,
                        "operating_cash_flow": 87800000000
                    },
                    {
                        "year": 2022,
                        "capex": 23600000000,
                        "delta_nwc": -3000000000,
                        "depreciation_amortization": 14300000000,
                        "operating_cash_flow": 89300000000
                    },
                    {
                        "year": 2021,
                        "capex": 20600000000,
                        "delta_nwc": 2000000000,
                        "depreciation_amortization": 12300000000,
                        "operating_cash_flow": 76700000000
                    },
                    {
                        "year": 2020,
                        "capex": 15400000000,
                        "delta_nwc": -1000000000,
                        "depreciation_amortization": 12300000000,
                        "operating_cash_flow": 60700000000
                    }
                ]
            },
            "market_data": {
                "ticker": "MSFT",
                "price": 350.0,
                "market_cap": 2600000000000,
                "beta": 0.9,
                "shares_outstanding": 7428571428,
                "pe_ratio": 32.5,
                "industry": "Software",
                "sector": "Technology",
                "company_name": "Microsoft Corporation",
                "currency": "USD",
                "total_debt": 50000000000
            },
            "estimates": {
                "rev_growth_y1": 0.10,
                "rev_growth_y2": 0.09,
                "margin_y1": 0.41
            },
            "prices": [
                {"t": "2024-06-28", "p": 350.0},
                {"t": "2024-06-21", "p": 345.0},
                {"t": "2024-06-14", "p": 340.0}
            ],
            "risk_free_rate": 0.042
        }
    
    def _get_partial_data_fixture(self):
        """Get fixture for partial data."""
        # Start with complete data and remove some fields
        data = self._get_complete_data_fixture()
        
        # Remove some fields
        for stmt in data["fundamentals"]["income"]:
            del stmt["interest_expense"]
            del stmt["tax_expense"]
            del stmt["pretax_income"]
        
        for sheet in data["fundamentals"]["balance"]:
            del sheet["shares"]
        
        for flow in data["fundamentals"]["cashflow"]:
            del flow["delta_nwc"]
        
        del data["estimates"]["rev_growth_y2"]
        del data["estimates"]["margin_y1"]
        
        return data
    
    def _get_missing_data_fixture(self):
        """Get fixture for missing data."""
        # Start with complete data and remove critical fields
        data = self._get_complete_data_fixture()
        
        # Remove fundamentals
        del data["fundamentals"]
        
        return data
    
    def _load_fixture(self, path):
        """Load fixture from file."""
        with open(path, "r") as f:
            return json.load(f)
    
    @patch("financial_data.engine.FinancialDataEngine")
    def test_complete_data(self, mock_engine_class):
        """Test assumptions engine with complete data."""
        # Load fixture
        fixture = self._load_fixture(self.complete_data_path)
        
        # Create mock provider
        mock_provider = MockProvider(
            name="mock",
            fundamentals=fixture["fundamentals"],
            market_data=fixture["market_data"],
            estimates=fixture["estimates"],
            prices=fixture["prices"],
            risk_free_rate=fixture["risk_free_rate"]
        )
        
        # Create mock engine
        mock_engine = MagicMock()
        mock_engine.build_company_assumptions.return_value = {
            "ticker": "MSFT",
            "company_name": "Microsoft Corporation",
            "currency": "USD",
            "provenance": {
                "revenue": {"source": "mock", "as_of": "2024-06-30T00:00:00.000Z"},
                "price": {"source": "mock", "as_of": "2024-06-30T00:00:00.000Z"},
                "beta": {"source": "mock", "as_of": "2024-06-30T00:00:00.000Z"},
                "risk_free_rate": {"source": "mock", "as_of": "2024-06-30T00:00:00.000Z"}
            },
            "historicals": {
                "years": [2024, 2023, 2022, 2021, 2020],
                "revenue": [250000000000, 211900000000, 198300000000, 168100000000, 143000000000],
                "op_margin": [0.4, 0.417, 0.42, 0.416, 0.371]
            },
            "assumptions": {
                "forecast_years": 5,
                "revenue_growth": [0.10, 0.09, 0.07, 0.05, 0.03],
                "operating_margin": [0.41, 0.41, 0.42, 0.42, 0.42],
                "da_pct_rev": 0.06,
                "capex_pct_rev": 0.10,
                "nwc_pct_rev": 0.01,
                "tax_rate": 0.18
            },
            "wacc": {
                "rf": 0.042,
                "erp": 0.055,
                "beta": 0.9,
                "ke": 0.0915,
                "kd_pre": 0.062,
                "tax": 0.18,
                "wd": 0.02,
                "we": 0.98,
                "kd_after": 0.05084,
                "wacc": 0.09
            },
            "terminal": {
                "method": "perpetuity",
                "g": 0.035,
                "ev_ebitda": 18.0
            },
            "flags": []
        }
        mock_engine_class.return_value = mock_engine
        
        # Call the function
        result = build_company_assumptions("MSFT")
        
        # Check result
        self.assertIsNotNone(result)
        self.assertNotIn("error", result)
        self.assertEqual(result["ticker"], "MSFT")
        self.assertEqual(result["currency"], "USD")
        
        # Check provenance
        self.assertIn("provenance", result)
        self.assertIn("revenue", result["provenance"])
        self.assertIn("price", result["provenance"])
        self.assertIn("beta", result["provenance"])
        self.assertIn("risk_free_rate", result["provenance"])
        
        # Check assumptions
        self.assertIn("assumptions", result)
        self.assertEqual(result["assumptions"]["forecast_years"], 5)
        self.assertEqual(len(result["assumptions"]["revenue_growth"]), 5)
        self.assertEqual(len(result["assumptions"]["operating_margin"]), 5)
        
        # Check WACC
        self.assertIn("wacc", result)
        self.assertGreater(result["wacc"]["wacc"], 0.06)
        self.assertLess(result["wacc"]["wacc"], 0.14)
        
        # Check terminal
        self.assertIn("terminal", result)
        self.assertEqual(result["terminal"]["method"], "perpetuity")
        self.assertGreater(result["terminal"]["g"], 0.02)
        self.assertLess(result["terminal"]["g"], 0.04)
    
    @patch("financial_data.engine.FinancialDataEngine")
    def test_partial_data(self, mock_engine_class):
        """Test assumptions engine with partial data."""
        # Load fixture
        fixture = self._load_fixture(self.partial_data_path)
        
        # Create mock provider
        mock_provider = MockProvider(
            name="mock",
            fundamentals=fixture["fundamentals"],
            market_data=fixture["market_data"],
            estimates=fixture["estimates"],
            prices=fixture["prices"],
            risk_free_rate=fixture["risk_free_rate"]
        )
        
        # Create mock engine
        mock_engine = MagicMock()
        mock_engine.build_company_assumptions.return_value = {
            "ticker": "MSFT",
            "company_name": "Microsoft Corporation",
            "currency": "USD",
            "provenance": {
                "revenue": {"source": "mock", "as_of": "2024-06-30T00:00:00.000Z"},
                "price": {"source": "mock", "as_of": "2024-06-30T00:00:00.000Z"},
                "beta": {"source": "mock", "as_of": "2024-06-30T00:00:00.000Z"},
                "risk_free_rate": {"source": "mock", "as_of": "2024-06-30T00:00:00.000Z"}
            },
            "historicals": {
                "years": [2024, 2023, 2022, 2021, 2020],
                "revenue": [250000000000, 211900000000, 198300000000, 168100000000, 143000000000],
                "op_margin": [0.4, 0.417, 0.42, 0.416, 0.371]
            },
            "assumptions": {
                "forecast_years": 5,
                "revenue_growth": [0.10, 0.09, 0.07, 0.05, 0.03],
                "operating_margin": [0.41, 0.41, 0.42, 0.42, 0.42],
                "da_pct_rev": 0.06,
                "capex_pct_rev": 0.10,
                "nwc_pct_rev": 0.03,  # Default due to missing data
                "tax_rate": 0.21  # Default due to missing data
            },
            "wacc": {
                "rf": 0.042,
                "erp": 0.055,
                "beta": 0.9,
                "ke": 0.0915,
                "kd_pre": 0.062,
                "tax": 0.21,
                "wd": 0.02,
                "we": 0.98,
                "kd_after": 0.04898,
                "wacc": 0.09
            },
            "terminal": {
                "method": "perpetuity",
                "g": 0.035,
                "ev_ebitda": 18.0
            },
            "flags": [
                "No historical NWC data, using default NWC percentage",
                "No historical tax data, using default tax rate"
            ]
        }
        mock_engine_class.return_value = mock_engine
        
        # Call the function
        result = build_company_assumptions("MSFT")
        
        # Check result
        self.assertIsNotNone(result)
        self.assertNotIn("error", result)
        self.assertEqual(result["ticker"], "MSFT")
        
        # Check flags
        self.assertIn("flags", result)
        self.assertIsInstance(result["flags"], list)
        self.assertGreater(len(result["flags"]), 0)
    
    @patch("financial_data.engine.FinancialDataEngine")
    def test_missing_data(self, mock_engine_class):
        """Test assumptions engine with missing critical data."""
        # Create mock engine
        mock_engine = MagicMock()
        mock_engine.build_company_assumptions.return_value = {
            "error": "insufficient_historicals",
            "missing": ["revenue", "ebit"],
            "provider_attempts": ["yahoo", "alphavantage", "fmp", "google_sheets"],
            "message": "Need ≥3 years of revenue and EBIT to build assumptions."
        }
        mock_engine_class.return_value = mock_engine
        
        # Call the function
        result = build_company_assumptions("MSFT")
        
        # Check result
        self.assertIsNotNone(result)
        self.assertIn("error", result)
        self.assertEqual(result["error"], "insufficient_historicals")
        self.assertIn("missing", result)
        self.assertIn("provider_attempts", result)
        self.assertIn("message", result)
    
    @patch("financial_data.engine.FinancialDataEngine")
    def test_exception_handling(self, mock_engine_class):
        """Test handling of unexpected exceptions."""
        # Create mock engine
        mock_engine = MagicMock()
        mock_engine.build_company_assumptions.side_effect = Exception("Unexpected error")
        mock_engine_class.return_value = mock_engine
        
        # Call the function
        result = build_company_assumptions("MSFT")
        
        # Check result
        self.assertIsNotNone(result)
        self.assertIn("error", result)
        self.assertEqual(result["error"], "processing_error")
        self.assertIn("message", result)

if __name__ == "__main__":
    unittest.main()

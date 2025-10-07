"""
Unit tests for the assumptions engine.
"""

import unittest
import json
import os
from unittest.mock import patch, MagicMock

import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from assumptions_engine import build_company_assumptions
from assumptions_engine.providers import DataNotAvailableError

class TestAssumptionsEngine(unittest.TestCase):
    """Test cases for the assumptions engine."""
    
    def setUp(self):
        """Set up test fixtures."""
        # Load test fixtures
        fixtures_dir = os.path.join(os.path.dirname(__file__), "fixtures")
        
        # Create fixtures directory if it doesn't exist
        if not os.path.exists(fixtures_dir):
            os.makedirs(fixtures_dir)
        
        # Define paths to fixture files
        self.complete_data_path = os.path.join(fixtures_dir, "complete_data.json")
        self.partial_data_path = os.path.join(fixtures_dir, "partial_data.json")
        self.missing_data_path = os.path.join(fixtures_dir, "missing_data.json")
        
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
            "company_info": {
                "name": "Microsoft Corporation",
                "industry": "Software",
                "sector": "Technology",
                "description": "Microsoft Corporation develops, licenses, and supports software, services, devices, and solutions worldwide.",
                "currency": "USD",
                "country": "United States",
                "exchange": "NASDAQ",
                "market": "us_market",
                "ticker": "MSFT"
            },
            "income_statement": {
                "dates": ["2024-06-30", "2023-06-30", "2022-06-30", "2021-06-30", "2020-06-30"],
                "revenue": [250000000000, 211900000000, 198300000000, 168100000000, 143000000000],
                "operating_income": [100000000000, 88400000000, 83400000000, 69900000000, 53000000000],
                "ebit": [100000000000, 88400000000, 83400000000, 69900000000, 53000000000],
                "net_income": [80000000000, 72700000000, 67400000000, 61300000000, 44200000000],
                "eps": [10.75, 9.75, 8.97, 8.12, 5.82],
                "interest_expense": [2000000000, 1800000000, 2000000000, 2100000000, 2400000000],
                "income_tax_expense": [18000000000, 13900000000, 14000000000, 8800000000, 8800000000],
                "pretax_income": [98000000000, 86600000000, 81400000000, 67800000000, 50600000000]
            },
            "balance_sheet": {
                "dates": ["2024-06-30", "2023-06-30", "2022-06-30", "2021-06-30", "2020-06-30"],
                "cash": [80000000000, 111300000000, 104700000000, 130300000000, 136500000000],
                "total_assets": [400000000000, 364800000000, 364800000000, 333800000000, 301000000000],
                "short_term_debt": [5000000000, 2800000000, 2700000000, 8100000000, 3700000000],
                "long_term_debt": [45000000000, 45400000000, 47800000000, 50100000000, 60600000000],
                "total_debt": [50000000000, 48200000000, 50500000000, 58200000000, 64300000000],
                "total_equity": [200000000000, 166500000000, 166500000000, 141900000000, 118300000000],
                "working_capital": [80000000000, 87100000000, 87100000000, 90700000000, 74900000000],
                "current_assets": [150000000000, 172800000000, 169500000000, 184400000000, 181900000000],
                "current_liabilities": [70000000000, 85700000000, 82400000000, 93700000000, 107000000000]
            },
            "cash_flow": {
                "dates": ["2024-06-30", "2023-06-30", "2022-06-30", "2021-06-30", "2020-06-30"],
                "operating_cash_flow": [100000000000, 87800000000, 89300000000, 76700000000, 60700000000],
                "capital_expenditures": [-25000000000, -21700000000, -23600000000, -20600000000, -15400000000],
                "free_cash_flow": [75000000000, 66100000000, 65700000000, 56100000000, 45300000000],
                "change_in_working_capital": [2000000000, 1000000000, -3000000000, 2000000000, -1000000000],
                "depreciation_amortization": [15000000000, 14600000000, 14300000000, 12300000000, 12300000000]
            },
            "market_data": {
                "price": 350.0,
                "market_cap": 2600000000000,
                "beta": 0.9,
                "pe_ratio": 32.5,
                "dividend_yield": 0.8,
                "shares_outstanding": 7428571428,
                "52_week_high": 380.0,
                "52_week_low": 280.0,
                "volume": 20000000,
                "avg_volume": 25000000,
                "total_debt": 50000000000
            },
            "risk_metrics": {
                "beta": 0.9,
                "risk_free_rate": 0.042,
                "equity_risk_premium": 0.055
            },
            "analyst_estimates": {
                "revenue_estimates": [
                    {"period": "2025", "estimate": 275000000000},
                    {"period": "2026", "estimate": 302500000000}
                ],
                "eps_estimates": [
                    {"date": "2024-09-30", "estimate": 2.95, "actual": None},
                    {"date": "2024-12-31", "estimate": 3.05, "actual": None},
                    {"date": "2025-03-31", "estimate": 3.15, "actual": None},
                    {"date": "2025-06-30", "estimate": 3.25, "actual": None}
                ],
                "price_target": 400.0,
                "recommendation": "Buy",
                "growth_estimates": {
                    "revenue_growth": 0.10,
                    "earnings_growth": 0.12,
                    "next_quarter": 0.09,
                    "current_year": 0.10,
                    "next_year": 0.09,
                    "next_5_years": 0.08
                }
            }
        }
    
    def _get_partial_data_fixture(self):
        """Get fixture for partial data."""
        # Start with complete data and remove some fields
        data = self._get_complete_data_fixture()
        
        # Remove some fields
        del data["income_statement"]["interest_expense"]
        del data["income_statement"]["income_tax_expense"]
        del data["income_statement"]["pretax_income"]
        del data["balance_sheet"]["short_term_debt"]
        del data["balance_sheet"]["long_term_debt"]
        del data["cash_flow"]["change_in_working_capital"]
        del data["analyst_estimates"]["growth_estimates"]["revenue_growth"]
        
        return data
    
    def _get_missing_data_fixture(self):
        """Get fixture for missing data."""
        # Start with complete data and remove critical fields
        data = self._get_complete_data_fixture()
        
        # Remove critical fields
        del data["income_statement"]["revenue"]
        del data["income_statement"]["operating_income"]
        del data["balance_sheet"]["total_debt"]
        del data["cash_flow"]["operating_cash_flow"]
        del data["market_data"]["market_cap"]
        
        return data
    
    def _load_fixture(self, path):
        """Load fixture from file."""
        with open(path, "r") as f:
            return json.load(f)
    
    @patch("assumptions_engine.providers.ProviderFactory.get_default_provider")
    def test_complete_data(self, mock_get_provider):
        """Test assumptions engine with complete data."""
        # Load fixture
        fixture = self._load_fixture(self.complete_data_path)
        
        # Create mock provider
        mock_provider = MagicMock()
        mock_provider.get_company_info.return_value = fixture["company_info"]
        mock_provider.get_income_statement.return_value = fixture["income_statement"]
        mock_provider.get_balance_sheet.return_value = fixture["balance_sheet"]
        mock_provider.get_cash_flow.return_value = fixture["cash_flow"]
        mock_provider.get_market_data.return_value = fixture["market_data"]
        mock_provider.get_risk_metrics.return_value = fixture["risk_metrics"]
        mock_provider.get_analyst_estimates.return_value = fixture["analyst_estimates"]
        
        # Set mock provider as default
        mock_get_provider.return_value = mock_provider
        
        # Call the function
        result = build_company_assumptions("MSFT")
        
        # Check result
        self.assertIsNotNone(result)
        self.assertNotIn("error", result)
        self.assertEqual(result["ticker"], "MSFT")
        self.assertEqual(result["currency"], "USD")
        
        # Check forecast
        self.assertIn("forecast", result)
        self.assertEqual(result["forecast"]["years"], 5)
        self.assertEqual(len(result["forecast"]["revenue_growth"]), 5)
        self.assertEqual(len(result["forecast"]["operating_margin"]), 5)
        
        # Check WACC
        self.assertIn("wacc", result)
        self.assertGreater(result["wacc"]["wacc"], 0.06)
        self.assertLess(result["wacc"]["wacc"], 0.14)
        
        # Check terminal
        self.assertIn("terminal", result)
        self.assertEqual(result["terminal"]["method"], "perpetuity")
        self.assertGreater(result["terminal"]["g"], 0.02)
        self.assertLess(result["terminal"]["g"], 0.04)
        
        # Check summary
        self.assertIn("summary", result)
        self.assertIsInstance(result["summary"], str)
        self.assertIn("MSFT", result["summary"])
    
    @patch("assumptions_engine.providers.ProviderFactory.get_default_provider")
    def test_partial_data(self, mock_get_provider):
        """Test assumptions engine with partial data."""
        # Load fixture
        fixture = self._load_fixture(self.partial_data_path)
        
        # Create mock provider
        mock_provider = MagicMock()
        mock_provider.get_company_info.return_value = fixture["company_info"]
        mock_provider.get_income_statement.return_value = fixture["income_statement"]
        mock_provider.get_balance_sheet.return_value = fixture["balance_sheet"]
        mock_provider.get_cash_flow.return_value = fixture["cash_flow"]
        mock_provider.get_market_data.return_value = fixture["market_data"]
        mock_provider.get_risk_metrics.return_value = fixture["risk_metrics"]
        mock_provider.get_analyst_estimates.return_value = fixture["analyst_estimates"]
        
        # Set mock provider as default
        mock_get_provider.return_value = mock_provider
        
        # Call the function
        result = build_company_assumptions("MSFT")
        
        # Check result
        self.assertIsNotNone(result)
        self.assertNotIn("error", result)
        self.assertEqual(result["ticker"], "MSFT")
        
        # Check flags
        self.assertIn("flags", result)
        self.assertIsInstance(result["flags"], list)
        
        # Check forecast (should still work with partial data)
        self.assertIn("forecast", result)
        self.assertEqual(len(result["forecast"]["revenue_growth"]), 5)
        self.assertEqual(len(result["forecast"]["operating_margin"]), 5)
    
    @patch("assumptions_engine.providers.ProviderFactory.get_default_provider")
    def test_missing_data(self, mock_get_provider):
        """Test assumptions engine with missing critical data."""
        # Load fixture
        fixture = self._load_fixture(self.missing_data_path)
        
        # Create mock provider
        mock_provider = MagicMock()
        mock_provider.get_company_info.return_value = fixture["company_info"]
        
        # Make get_income_statement raise DataNotAvailableError
        mock_provider.get_income_statement.side_effect = DataNotAvailableError("Could not retrieve income statement for MSFT: No revenue data")
        
        # Other methods return partial data
        mock_provider.get_balance_sheet.return_value = fixture["balance_sheet"]
        mock_provider.get_cash_flow.return_value = fixture["cash_flow"]
        mock_provider.get_market_data.return_value = fixture["market_data"]
        mock_provider.get_risk_metrics.return_value = fixture["risk_metrics"]
        mock_provider.get_analyst_estimates.return_value = fixture["analyst_estimates"]
        
        # Set mock provider as default
        mock_get_provider.return_value = mock_provider
        
        # Call the function
        result = build_company_assumptions("MSFT")
        
        # Check result
        self.assertIsNotNone(result)
        self.assertIn("error", result)
        self.assertEqual(result["error"], "data_unavailable")
        self.assertIn("missing", result)
        self.assertIn("message", result)
    
    @patch("assumptions_engine.providers.ProviderFactory.get_default_provider")
    def test_exception_handling(self, mock_get_provider):
        """Test handling of unexpected exceptions."""
        # Create mock provider
        mock_provider = MagicMock()
        
        # Make get_company_info raise an unexpected exception
        mock_provider.get_company_info.side_effect = Exception("Unexpected error")
        
        # Set mock provider as default
        mock_get_provider.return_value = mock_provider
        
        # Call the function
        result = build_company_assumptions("MSFT")
        
        # Check result
        self.assertIsNotNone(result)
        self.assertIn("error", result)
        self.assertEqual(result["error"], "processing_error")
        self.assertIn("message", result)

if __name__ == "__main__":
    unittest.main()

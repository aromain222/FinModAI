"""
Integration test for the Data Router.
"""
import unittest
import os
import pytest

from backend.market.data_router import get_router

# --- Test Configuration ---
TICKER_TO_TEST = "AAPL"
# This test makes live API calls and will be skipped if required API keys are not set.
# To run, ensure you have a .env file with your API keys.
LIVE_PROBES_ENABLED = os.getenv("DISABLE_LIVE_PROBES", "false").lower() != "true"

@pytest.mark.skipif(not LIVE_PROBES_ENABLED, reason="Live API probes are disabled")
class TestDataRouterIntegration(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        """Initialize the data router."""
        cls.router = get_router()
        cls.assertIsNotNone(cls.router, "Data router could not be initialized.")

    def test_get_bundle_happy_path(self):
        """
        Test the full data fetching pipeline for a major ticker.
        This makes live network calls.
        """
        bundle, status_code = self.router.get_bundle(TICKER_TO_TEST)
        
        # 1. Check for successful response
        self.assertEqual(status_code, 200)
        self.assertNotIn("error", bundle)
        
        # 2. Check for critical fields
        fields = bundle.get("fields", {})
        self.assertTrue(fields.get("revenue"))
        self.assertTrue(fields.get("net_income"))
        self.assertTrue(fields.get("price"))
        
        # 3. Check for multi-provider provenance
        provenance = bundle.get("provenance", {})
        self.assertTrue(len(provenance) > 1)
        
        providers = {p['provider'] for p in provenance.values()}
        self.assertTrue(len(providers) >= 2, f"Expected data from at least 2 providers, got {providers}")
        self.assertIn("EDGAR", providers)
        self.assertIn("YahooFinance", providers)
        
        # 4. Check for no quarantine
        self.assertFalse(bundle.get("quarantined"))

if __name__ == '__main__':
    unittest.main()

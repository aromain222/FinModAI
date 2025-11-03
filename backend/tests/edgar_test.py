"""
Unit tests for the EDGAR data provider.
"""
import unittest
import json
from pathlib import Path

from backend.providers.edgar import EdgarProvider

# --- Test Data ---
# A sample of a real SEC company facts JSON response
SAMPLE_FACTS_PATH = Path(__file__).parent / "data/edgar/sample_aapl_facts.json"

class TestEdgarProvider(unittest.TestCase):
    
    @classmethod
    def setUpClass(cls):
        """Load sample data once for all tests."""
        with open(SAMPLE_FACTS_PATH, 'r') as f:
            cls.sample_facts = json.load(f)
        
        # Mock the exchange directory to avoid network calls
        class MockDirectory:
            def resolve(self, identifier):
                if identifier == "AAPL":
                    return {"cik": "0000320193"}
                return None
        
        cls.provider = EdgarProvider()
        cls.provider.dir = MockDirectory()

    def test_resolve_cik(self):
        """Test CIK resolution."""
        self.assertEqual(self.provider._resolve_cik("AAPL"), "0000320193")
        with self.assertRaises(ValueError):
            self.provider._resolve_cik("UNKNOWN")

    def test_parse_fundamentals(self):
        """Test parsing of company facts to normalized fundamentals."""
        fundamentals = self.provider.parse_fundamentals(self.sample_facts)
        
        # Check for critical fields
        self.assertIn("revenue", fundamentals)
        self.assertIn("net_income", fundamentals)
        self.assertIn("shares_outstanding", fundamentals)
        
        # Check that we have multiple years of data
        self.assertTrue(len(fundamentals["revenue"]) > 3)
        
        # Check a specific value (example: revenue for a specific period)
        # Note: This will depend on the exact content of your sample file
        # Example check:
        # self.assertEqual(fundamentals["revenue"][0], 383285000000)
        
        # Check provenance
        self.assertIn("provenance", fundamentals)
        self.assertTrue(len(fundamentals["provenance"]) > 0)
        a_key = list(fundamentals['provenance'].keys())[0]
        self.assertEqual(fundamentals['provenance'][a_key]['provider'], 'EDGAR')


if __name__ == '__main__':
    unittest.main()

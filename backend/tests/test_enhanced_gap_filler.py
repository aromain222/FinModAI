"""
Test suite for enhanced gap filling
"""

import pytest
from unittest.mock import Mock, patch
from datetime import datetime, timedelta
import numpy as np

from backend.models_data.enhanced_gap_filler import EnhancedGapFiller
from backend.models_data.financial_calculator import FinancialMetrics

# Test data fixtures
@pytest.fixture
def sample_data():
    return {
        "revenue_ltm": 1_800_000_000,
        "ebit_ltm": 400_000_000,
        "depreciation_amortization_ltm": 100_000_000,
        "net_income_ltm": 300_000_000,
        "total_debt": 3_500_000_000,
        "cash": 1_000_000_000
    }

@pytest.fixture
def sample_historical_data():
    return [
        {"value": 1_800_000_000, "date": "2025-Q1"},
        {"value": 1_700_000_000, "date": "2024-Q4"},
        {"value": 1_600_000_000, "date": "2024-Q3"},
        {"value": 1_500_000_000, "date": "2024-Q2"}
    ]

@pytest.fixture
def sample_peer_data():
    return [
        {
            "revenue_ltm": 1_200_000_000,
            "ebitda_ltm": 300_000_000,
            "ebitda_margin": 0.25,
            "revenue_growth": 0.20
        },
        {
            "revenue_ltm": 2_400_000_000,
            "ebitda_ltm": 600_000_000,
            "ebitda_margin": 0.25,
            "revenue_growth": 0.15
        }
    ]

@pytest.fixture
def sample_company_profile():
    return {
        "Symbol": "SOFI",
        "Name": "SoFi Technologies",
        "Description": "Financial technology company",
        "Sector": "Financial Technology",
        "Industry": "Consumer Finance"
    }

class TestFinancialCalculator:
    """Test FinancialCalculator class"""
    
    def test_derive_ebitda(self, sample_data):
        """Test EBITDA derivation"""
        calculator = EnhancedGapFiller().calculator
        
        result = calculator.derive_metric("ebitda", sample_data)
        
        assert result is not None
        assert result.value == 500_000_000  # EBIT + D&A
        assert result.confidence >= 0.9
        assert "ebit" in result.inputs
        assert "depreciation_amortization" in result.inputs
        
    def test_derive_growth_rate(self, sample_data):
        """Test growth rate calculation"""
        calculator = EnhancedGapFiller().calculator
        
        growth = calculator._calculate_growth_rate(
            current=1_800_000_000,
            previous=1_500_000_000
        )
        
        assert growth == pytest.approx(0.20)
        
    def test_derive_margin(self, sample_data):
        """Test margin calculation"""
        calculator = EnhancedGapFiller().calculator
        
        margin = calculator._calculate_margin(
            numerator=500_000_000,
            denominator=1_800_000_000
        )
        
        assert margin == pytest.approx(0.2778, rel=1e-4)
        
    def test_validate_metrics(self, sample_data):
        """Test metrics validation"""
        calculator = EnhancedGapFiller().calculator
        
        validations = calculator.validate_metrics({
            **sample_data,
            "ebitda_margin": 0.25,
            "revenue_growth": 0.15
        })
        
        assert validations["positive_revenue"]
        assert validations["margin_range"]
        assert validations["reasonable_growth"]

class TestEnhancedGapFiller:
    """Test EnhancedGapFiller class"""
    
    @pytest.mark.asyncio
    async def test_fill_gaps_financial_calc(self, sample_data):
        """Test gap filling using financial calculations"""
        filler = EnhancedGapFiller()
        
        result = await filler.fill_gaps(
            ticker="SOFI",
            data=sample_data,
            missing_fields=["ebitda_ltm"]
        )
        
        filled = result["filled_data"]
        metadata = result["metadata"]
        
        assert "ebitda_ltm" in filled
        assert filled["ebitda_ltm"] == 500_000_000
        assert metadata["ebitda_ltm"]["method"].startswith("derived_from")
        assert metadata["ebitda_ltm"]["confidence"] >= 0.9
        
    @pytest.mark.asyncio
    async def test_fill_gaps_historical(self, sample_data, sample_historical_data):
        """Test gap filling using historical analysis"""
        with patch("backend.providers.polygon_provider.PolygonProvider.get_financial_history") as mock_history:
            mock_history.return_value = sample_historical_data
            
            filler = EnhancedGapFiller()
            result = await filler.fill_gaps(
                ticker="SOFI",
                data=sample_data,
                missing_fields=["revenue_ntm"]
            )
            
            filled = result["filled_data"]
            metadata = result["metadata"]
            
            assert "revenue_ntm" in filled
            assert metadata["revenue_ntm"]["method"] == "historical_trend"
            assert metadata["revenue_ntm"]["confidence"] >= 0.6
            
    @pytest.mark.asyncio
    async def test_fill_gaps_peer_analysis(self, sample_data, sample_peer_data):
        """Test gap filling using peer analysis"""
        filler = EnhancedGapFiller()
        
        result = await filler.fill_gaps(
            ticker="SOFI",
            data=sample_data,
            missing_fields=["ebitda_margin"],
            peer_data=sample_peer_data
        )
        
        filled = result["filled_data"]
        metadata = result["metadata"]
        
        assert "ebitda_margin" in filled
        assert filled["ebitda_margin"] == pytest.approx(0.25)  # Median of peers
        assert metadata["ebitda_margin"]["method"] == "peer_analysis"
        
    @pytest.mark.asyncio
    async def test_fill_gaps_ai_assistance(self, sample_data, sample_company_profile):
        """Test gap filling using AI assistance"""
        with patch("backend.providers.alpha_vantage_provider.AlphaVantageProvider.get_company_overview") as mock_profile:
            mock_profile.return_value = sample_company_profile
            
            with patch("backend.gap_filler_agent.GapFillerAgent.suggest_value") as mock_ai:
                mock_ai.return_value = {
                    "value": 550_000_000,
                    "confidence": 0.5,
                    "reasoning_chain": ["historical_analysis", "peer_comparison"]
                }
                
                filler = EnhancedGapFiller()
                result = await filler.fill_gaps(
                    ticker="SOFI",
                    data=sample_data,
                    missing_fields=["ebitda_ntm"]
                )
                
                filled = result["filled_data"]
                metadata = result["metadata"]
                
                assert "ebitda_ntm" in filled
                assert metadata["ebitda_ntm"]["method"] == "ai_assisted"
                assert metadata["ebitda_ntm"]["confidence"] == 0.5
                
    def test_validate_ai_suggestion(self):
        """Test AI suggestion validation"""
        filler = EnhancedGapFiller()
        
        # Test valid suggestions
        assert filler._validate_ai_suggestion(
            value=500_000_000,
            field="revenue_ltm",
            data={"ebitda_ltm": 100_000_000}
        )
        
        assert filler._validate_ai_suggestion(
            value=0.25,
            field="ebitda_margin",
            data={}
        )
        
        # Test invalid suggestions
        assert not filler._validate_ai_suggestion(
            value=-1_000_000,
            field="revenue_ltm",
            data={}
        )
        
        assert not filler._validate_ai_suggestion(
            value=1.5,
            field="ebitda_margin",
            data={}
        )
        
        assert not filler._validate_ai_suggestion(
            value=90_000_000,
            field="ebitda_ltm",
            data={"ebit_ltm": 100_000_000}
        )

if __name__ == "__main__":
    pytest.main(["-v"])

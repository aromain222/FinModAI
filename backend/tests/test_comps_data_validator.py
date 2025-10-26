"""
Test suite for Trading Comps data validation
"""

import pytest
import pandas as pd
import numpy as np
from unittest.mock import Mock, patch
from datetime import datetime

from backend.models_data.comps_data_validator import CompsDataValidator
from backend.models_data.comps_model import CompanyMetrics

# Test data fixtures
@pytest.fixture
def incomplete_market_data():
    return {
        "share_price": 8.50,
        "shares_outstanding": 1_000_000_000,
        # Missing market_cap
    }

@pytest.fixture
def incomplete_financial_data():
    return {
        "revenue_ltm": 1_800_000_000,
        "ebit_ltm": 400_000_000,
        # Missing ebitda_ltm
        "depreciation_amortization_ltm": 100_000_000,
        "total_debt": 3_500_000_000,
        "cash": 1_000_000_000
    }

@pytest.fixture
def incomplete_estimates():
    return {
        "revenue_ntm": 2_200_000_000,
        # Missing ebitda_ntm
        "revenue_growth_rate": 0.22,
        "ebitda_margin_ltm": 0.28
    }

@pytest.fixture
def sample_target():
    return CompanyMetrics(
        ticker="SOFI",
        name="SoFi Technologies",
        share_price=8.50,
        shares_outstanding=1_000_000_000,
        total_debt=3_500_000_000,
        cash=1_000_000_000,
        revenue_ltm=1_800_000_000,
        revenue_ntm=2_200_000_000,
        ebitda_ltm=500_000_000,
        ebitda_ntm=650_000_000,
        ebit_ltm=400_000_000,
        ebit_ntm=520_000_000,
        net_income_ltm=300_000_000,
        net_income_ntm=390_000_000,
        eps_ltm=0.30,
        eps_ntm=0.39,
        book_value=5_000_000_000
    )

@pytest.fixture
def sample_peers():
    return [
        CompanyMetrics(  # Similar size
            ticker="UPST",
            name="Upstart Holdings",
            share_price=26.00,
            shares_outstanding=800_000_000,
            total_debt=1_200_000_000,
            cash=800_000_000,
            revenue_ltm=1_200_000_000,
            revenue_ntm=1_500_000_000,
            ebitda_ltm=300_000_000,
            ebitda_ntm=375_000_000,
            ebit_ltm=240_000_000,
            ebit_ntm=300_000_000,
            net_income_ltm=180_000_000,
            net_income_ntm=225_000_000,
            eps_ltm=0.225,
            eps_ntm=0.28,
            book_value=3_000_000_000
        ),
        CompanyMetrics(  # Too large
            ticker="PYPL",
            name="PayPal Holdings",
            share_price=61.00,
            shares_outstanding=10_000_000_000,
            total_debt=10_000_000_000,
            cash=8_000_000_000,
            revenue_ltm=28_000_000_000,
            revenue_ntm=30_000_000_000,
            ebitda_ltm=7_000_000_000,
            ebitda_ntm=7_500_000_000,
            ebit_ltm=5_600_000_000,
            ebit_ntm=6_000_000_000,
            net_income_ltm=4_200_000_000,
            net_income_ntm=4_500_000_000,
            eps_ltm=0.42,
            eps_ntm=0.45,
            book_value=40_000_000_000
        ),
        CompanyMetrics(  # Too small
            ticker="SMALL",
            name="Small Corp",
            share_price=5.00,
            shares_outstanding=100_000_000,
            total_debt=100_000_000,
            cash=50_000_000,
            revenue_ltm=100_000_000,
            revenue_ntm=120_000_000,
            ebitda_ltm=20_000_000,
            ebitda_ntm=24_000_000,
            ebit_ltm=15_000_000,
            ebit_ntm=18_000_000,
            net_income_ltm=12_000_000,
            net_income_ntm=14_400_000,
            eps_ltm=0.12,
            eps_ntm=0.144,
            book_value=200_000_000
        )
    ]

class TestCompsDataValidator:
    """Test CompsDataValidator class"""
    
    @pytest.mark.asyncio
    async def test_market_data_validation(self, incomplete_market_data):
        """Test market data validation and gap filling"""
        validator = CompsDataValidator()
        
        # Mock gap filler
        with patch("backend.gap_filler_agent.GapFillerAgent.fill_fields") as mock_fill:
            mock_fill.return_value = {"market_cap": 8_500_000_000}
            
            validated = await validator.validate_market_data(incomplete_market_data, "SOFI")
            
            assert "market_cap" in validated
            assert validated["market_cap"] == 8_500_000_000
            
    @pytest.mark.asyncio
    async def test_financial_data_validation(self, incomplete_financial_data):
        """Test financial data validation and derivation"""
        validator = CompsDataValidator()
        
        validated = await validator.validate_financial_data(incomplete_financial_data, "SOFI")
        
        # Should derive EBITDA from EBIT + D&A
        assert "ebitda_ltm" in validated
        assert validated["ebitda_ltm"] == 500_000_000  # 400M + 100M
        
    @pytest.mark.asyncio
    async def test_estimates_validation(self, incomplete_estimates):
        """Test estimates validation and derivation"""
        validator = CompsDataValidator()
        
        validated = await validator.validate_estimates(incomplete_estimates, "SOFI")
        
        # Should derive EBITDA NTM from Revenue NTM * margin
        assert "ebitda_ntm" in validated
        assert validated["ebitda_ntm"] == pytest.approx(2_200_000_000 * 0.28)
        
    def test_peer_selection_validation(self, sample_target, sample_peers):
        """Test peer group validation and filtering"""
        validator = CompsDataValidator()
        
        valid_peers = validator.validate_peer_selection(sample_target, sample_peers)
        
        # Should only keep peers of similar size
        assert len(valid_peers) < len(sample_peers)
        assert any(p.ticker == "UPST" for p in valid_peers)  # Similar size
        assert not any(p.ticker == "PYPL" for p in valid_peers)  # Too large
        assert not any(p.ticker == "SMALL" for p in valid_peers)  # Too small
        
    @pytest.mark.asyncio
    async def test_complete_metrics_validation(self, sample_target):
        """Test complete CompanyMetrics validation"""
        validator = CompsDataValidator()
        
        # Create incomplete metrics
        incomplete = CompanyMetrics(
            ticker="TEST",
            name="Test Corp",
            share_price=10.00,
            shares_outstanding=1_000_000_000,
            total_debt=1_000_000_000,
            cash=500_000_000,
            revenue_ltm=1_000_000_000,
            ebit_ltm=200_000_000,
            depreciation_amortization_ltm=50_000_000,
            book_value=2_000_000_000,
            # Missing several fields
            revenue_ntm=None,
            ebitda_ltm=None,
            ebitda_ntm=None,
            ebit_ntm=None,
            net_income_ltm=None,
            net_income_ntm=None,
            eps_ltm=None,
            eps_ntm=None
        )
        
        # Mock gap filler
        with patch("backend.gap_filler_agent.GapFillerAgent.fill_fields") as mock_fill:
            mock_fill.return_value = {
                "revenue_ntm": 1_200_000_000,
                "net_income_ltm": 150_000_000
            }
            
            validated = await validator.validate_and_fill_company_metrics(incomplete)
            
            # Check derived fields
            assert validated.ebitda_ltm == 250_000_000  # EBIT + D&A
            
            # Check gap-filled fields
            assert validated.revenue_ntm == 1_200_000_000
            assert validated.net_income_ltm == 150_000_000
            
    @pytest.mark.asyncio
    async def test_complete_comps_validation(self, sample_target, sample_peers):
        """Test complete comps dataset validation"""
        validator = CompsDataValidator()
        
        validated_target, validated_peers = await validator.validate_comps_data(
            sample_target,
            sample_peers
        )
        
        # Target should be fully validated
        assert validated_target is not None
        assert all(hasattr(validated_target, field) for field in CompanyMetrics.__annotations__)
        
        # Peers should be filtered
        assert len(validated_peers) < len(sample_peers)
        assert all(isinstance(p, CompanyMetrics) for p in validated_peers)
        
        # Check peer filtering
        peer_tickers = [p.ticker for p in validated_peers]
        assert "UPST" in peer_tickers  # Similar size kept
        assert "PYPL" not in peer_tickers  # Too large removed

if __name__ == "__main__":
    pytest.main(["-v"])

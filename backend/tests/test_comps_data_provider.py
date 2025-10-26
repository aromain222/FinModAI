"""
Test suite for Trading Comps data provider integration
"""

import pytest
import asyncio
from unittest.mock import Mock, patch
from datetime import datetime

from backend.models_data.comps_data_provider import CompsDataProvider, run_comps_analysis

# Mock data fixtures
@pytest.fixture
def mock_polygon_market_data():
    return {
        "last_price": 8.50,
        "shares_outstanding": 1_000_000_000,
        "market_cap": 8_500_000_000
    }

@pytest.fixture
def mock_polygon_financials():
    return {
        "results": [{
            "revenues": 1_800_000_000,
            "ebitda": 500_000_000,
            "operating_income": 400_000_000,
            "net_income": 300_000_000,
            "total_debt": 3_500_000_000,
            "cash_and_equivalents": 1_000_000_000,
            "total_equity": 5_000_000_000
        }]
    }

@pytest.fixture
def mock_polygon_estimates():
    return {
        "revenue": {"mean": 2_200_000_000},
        "ebitda": {"mean": 650_000_000},
        "ebit": {"mean": 520_000_000},
        "eps": {"mean": 0.39}
    }

@pytest.fixture
def mock_polygon_peers():
    return ["UPST", "PYPL", "AFRM", "HOOD"]

@pytest.fixture
def mock_company_info():
    return {
        "name": "SoFi Technologies",
        "sector": "Financial Technology",
        "industry": "Consumer Finance"
    }

class TestCompsDataProvider:
    """Test CompsDataProvider class"""
    
    @pytest.mark.asyncio
    async def test_get_market_data_polygon(self, mock_polygon_market_data):
        """Test market data fetch from Polygon"""
        with patch("backend.providers.polygon_provider.PolygonProvider.get_ticker_details") as mock_get:
            mock_get.return_value = mock_polygon_market_data
            
            provider = CompsDataProvider()
            data = await provider.get_market_data("SOFI")
            
            assert data["share_price"] == 8.50
            assert data["shares_outstanding"] == 1_000_000_000
            assert data["market_cap"] == 8_500_000_000
            
    @pytest.mark.asyncio
    async def test_get_market_data_fallback(self, mock_polygon_market_data):
        """Test market data fallback to other providers"""
        with patch("backend.providers.polygon_provider.PolygonProvider.get_ticker_details") as mock_polygon:
            mock_polygon.side_effect = Exception("Polygon error")
            
            with patch("backend.providers.finnhub_provider.FinnhubProvider.get_quote") as mock_finnhub:
                mock_finnhub.return_value = {"c": 8.50}  # Current price
                
                with patch("backend.providers.finnhub_provider.FinnhubProvider.get_company_profile") as mock_profile:
                    mock_profile.return_value = {"shareOutstanding": 1_000_000_000}
                    
                    provider = CompsDataProvider()
                    data = await provider.get_market_data("SOFI")
                    
                    assert data["share_price"] == 8.50
                    assert data["shares_outstanding"] == 1_000_000_000
                    
    @pytest.mark.asyncio
    async def test_get_financial_data_polygon(self, mock_polygon_financials):
        """Test financial data fetch from Polygon"""
        with patch("backend.providers.polygon_provider.PolygonProvider.get_financials") as mock_get:
            mock_get.return_value = mock_polygon_financials
            
            provider = CompsDataProvider()
            data = await provider.get_financial_data("SOFI")
            
            assert data["revenue_ltm"] == 1_800_000_000
            assert data["ebitda_ltm"] == 500_000_000
            assert data["total_debt"] == 3_500_000_000
            
    @pytest.mark.asyncio
    async def test_get_estimates(self, mock_polygon_estimates):
        """Test analyst estimates fetch"""
        with patch("backend.providers.polygon_provider.PolygonProvider.get_estimates") as mock_get:
            mock_get.return_value = mock_polygon_estimates
            
            provider = CompsDataProvider()
            data = await provider.get_estimates("SOFI")
            
            assert data["revenue_ntm"] == 2_200_000_000
            assert data["ebitda_ntm"] == 650_000_000
            assert data["eps_ntm"] == 0.39
            
    @pytest.mark.asyncio
    async def test_get_peer_group(self, mock_polygon_peers):
        """Test peer group fetch"""
        with patch("backend.providers.polygon_provider.PolygonProvider.get_peers") as mock_get:
            mock_get.return_value = mock_polygon_peers
            
            provider = CompsDataProvider()
            peers = await provider.get_peer_group("SOFI")
            
            assert len(peers) <= 10  # Should limit to 10 peers
            assert "UPST" in peers
            assert "PYPL" in peers
            
    @pytest.mark.asyncio
    async def test_build_company_metrics(self, mock_polygon_market_data, mock_polygon_financials, 
                                      mock_polygon_estimates, mock_company_info):
        """Test complete company metrics build"""
        with patch.multiple("backend.providers.polygon_provider.PolygonProvider",
                          get_ticker_details=Mock(return_value=mock_polygon_market_data),
                          get_financials=Mock(return_value=mock_polygon_financials),
                          get_estimates=Mock(return_value=mock_polygon_estimates),
                          get_company_info=Mock(return_value=mock_company_info)):
            
            provider = CompsDataProvider()
            metrics = await provider.build_company_metrics("SOFI")
            
            assert metrics.ticker == "SOFI"
            assert metrics.name == "SoFi Technologies"
            assert metrics.share_price == 8.50
            assert metrics.revenue_ltm == 1_800_000_000
            assert metrics.revenue_ntm == 2_200_000_000
            
    @pytest.mark.asyncio
    async def test_build_comps_model(self, mock_polygon_peers):
        """Test complete comps model build"""
        with patch("backend.models_data.comps_data_provider.CompsDataProvider.get_peer_group") as mock_peers:
            mock_peers.return_value = mock_polygon_peers[:2]  # Limit to 2 peers for test
            
            with patch("backend.models_data.comps_data_provider.CompsDataProvider.build_company_metrics") as mock_build:
                # Mock different metrics for target and peers
                mock_build.side_effect = [
                    Mock(ticker="SOFI", revenue_ltm=1_800_000_000),  # Target
                    Mock(ticker="UPST", revenue_ltm=1_200_000_000),  # Peer 1
                    Mock(ticker="PYPL", revenue_ltm=28_000_000_000)  # Peer 2
                ]
                
                provider = CompsDataProvider()
                target, peers = await provider.build_comps_model("SOFI")
                
                assert target.ticker == "SOFI"
                assert len(peers) == 2
                assert peers[0].ticker == "UPST"
                assert peers[1].ticker == "PYPL"
                
    @pytest.mark.asyncio
    async def test_run_comps_analysis(self, tmp_path):
        """Test complete analysis run"""
        with patch("backend.models_data.comps_data_provider.CompsDataProvider.build_comps_model") as mock_build:
            # Mock target and peers
            mock_build.return_value = (
                Mock(ticker="SOFI", revenue_ltm=1_800_000_000),  # Target
                [Mock(ticker="UPST", revenue_ltm=1_200_000_000)]  # One peer for simplicity
            )
            
            output_file = tmp_path / "test_analysis.xlsx"
            analysis = await run_comps_analysis("SOFI", str(output_file))
            
            assert "peer_data" in analysis
            assert "summary_stats" in analysis
            assert "implied_valuation" in analysis
            assert output_file.exists()

if __name__ == "__main__":
    pytest.main(["-v"])

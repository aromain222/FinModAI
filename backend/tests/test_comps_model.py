"""
Test suite for Trading Comparables model
"""

import pytest
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime

from backend.models_data.comps_model import CompanyMetrics, CompsModel
from backend.exports.comps_excel import export_comps_to_excel

# Test data fixtures
@pytest.fixture
def sample_target():
    return CompanyMetrics(
        ticker="SOFI",
        name="SoFi Technologies",
        share_price=8.50,
        shares_outstanding=1_000_000_000,  # 1B shares
        total_debt=3_500_000_000,  # $3.5B
        cash=1_000_000_000,  # $1B
        revenue_ltm=1_800_000_000,  # $1.8B
        revenue_ntm=2_200_000_000,  # $2.2B
        ebitda_ltm=500_000_000,  # $500M
        ebitda_ntm=650_000_000,  # $650M
        ebit_ltm=400_000_000,  # $400M
        ebit_ntm=520_000_000,  # $520M
        net_income_ltm=300_000_000,  # $300M
        net_income_ntm=390_000_000,  # $390M
        eps_ltm=0.30,
        eps_ntm=0.39,
        book_value=5_000_000_000,  # $5B
    )

@pytest.fixture
def sample_peers():
    peers = [
        CompanyMetrics(  # UPST
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
            book_value=3_000_000_000,
        ),
        CompanyMetrics(  # PYPL
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
            book_value=40_000_000_000,
        ),
    ]
    return peers

class TestCompanyMetrics:
    """Test CompanyMetrics class"""
    
    def test_market_cap_calculation(self, sample_target):
        """Test market cap calculation"""
        expected = 8.50 * 1_000_000_000  # price * shares
        assert sample_target.market_cap == expected
        
    def test_enterprise_value_calculation(self, sample_target):
        """Test enterprise value calculation"""
        expected = (
            sample_target.market_cap +
            sample_target.total_debt -
            sample_target.cash +
            sample_target.minority_interest +
            sample_target.preferred_stock -
            sample_target.investments
        )
        assert sample_target.enterprise_value == expected
        
    def test_multiples_calculation(self, sample_target):
        """Test multiple calculations"""
        multiples = sample_target.calculate_multiples()
        
        # Test EV/EBITDA
        expected_ev_ebitda = sample_target.enterprise_value / sample_target.ebitda_ltm
        assert multiples["ev_ebitda_ltm"] == pytest.approx(expected_ev_ebitda)
        
        # Test P/E
        expected_pe = sample_target.share_price / sample_target.eps_ltm
        assert multiples["pe_ltm"] == pytest.approx(expected_pe)

class TestCompsModel:
    """Test CompsModel class"""
    
    def test_peer_data_preparation(self, sample_target, sample_peers):
        """Test peer data preparation"""
        model = CompsModel(sample_target, sample_peers)
        model._prepare_peer_data()
        
        assert len(model.peer_data) == len(sample_peers)
        assert "ev_ebitda_ltm" in model.peer_data.columns
        assert "pe_ltm" in model.peer_data.columns
        
    def test_summary_stats_calculation(self, sample_target, sample_peers):
        """Test summary statistics calculation"""
        model = CompsModel(sample_target, sample_peers)
        model._prepare_peer_data()
        model._calculate_summary_stats()
        
        assert "mean" in model.summary_stats
        assert "median" in model.summary_stats
        assert "p25" in model.summary_stats
        assert "p75" in model.summary_stats
        
    def test_outlier_removal(self, sample_target, sample_peers):
        """Test outlier removal"""
        # Add an outlier peer
        outlier = CompanyMetrics(
            ticker="OUTLIER",
            name="Outlier Corp",
            share_price=1000.00,  # Extremely high
            shares_outstanding=100_000_000,
            total_debt=1_000_000_000,
            cash=100_000_000,
            revenue_ltm=50_000_000,
            revenue_ntm=60_000_000,
            ebitda_ltm=10_000_000,
            ebitda_ntm=12_000_000,
            ebit_ltm=8_000_000,
            ebit_ntm=9_600_000,
            net_income_ltm=6_000_000,
            net_income_ntm=7_200_000,
            eps_ltm=0.06,
            eps_ntm=0.072,
            book_value=500_000_000,
        )
        peers_with_outlier = sample_peers + [outlier]
        
        model = CompsModel(sample_target, peers_with_outlier)
        model._prepare_peer_data()
        
        # Record length before outlier removal
        initial_length = len(model.peer_data)
        
        # Remove outliers
        model._remove_outliers("ev_ebitda_ltm")
        
        # Should have removed the outlier
        assert len(model.peer_data) < initial_length
        
    def test_implied_valuation(self, sample_target, sample_peers):
        """Test implied valuation calculation"""
        model = CompsModel(sample_target, sample_peers)
        model._prepare_peer_data()
        model._calculate_summary_stats()
        
        implied_values = model.calculate_implied_valuation()
        
        assert "enterprise_value" in implied_values
        assert "equity_value" in implied_values
        assert "share_price" in implied_values
        
        # Test logical relationships
        ev_ebitda_median = implied_values["enterprise_value"]["ev_ebitda_ltm_median"]
        equity_value_median = implied_values["equity_value"]["ev_ebitda_ltm_median"]
        share_price_median = implied_values["share_price"]["ev_ebitda_ltm_median"]
        
        # Equity value should be EV - net debt
        assert equity_value_median == pytest.approx(ev_ebitda_median - sample_target.net_debt)
        
        # Share price should be equity value / shares outstanding
        assert share_price_median == pytest.approx(equity_value_median / sample_target.shares_outstanding)
        
    def test_sensitivity_table(self, sample_target, sample_peers):
        """Test sensitivity table generation"""
        model = CompsModel(sample_target, sample_peers)
        model._prepare_peer_data()
        model._calculate_summary_stats()
        
        sensitivity = model.generate_sensitivity_table()
        
        assert isinstance(sensitivity, pd.DataFrame)
        assert not sensitivity.empty
        assert sensitivity.shape == (5, 5)  # Default steps = 5

class TestCompsExport:
    """Test Trading Comps Excel export"""
    
    def test_excel_export(self, sample_target, sample_peers, tmp_path):
        """Test Excel export functionality"""
        # Run analysis
        model = CompsModel(sample_target, sample_peers)
        analysis_data = model.run_analysis()
        
        # Export to Excel
        output_file = tmp_path / "test_comps.xlsx"
        export_comps_to_excel(analysis_data, str(output_file))
        
        # Verify file exists
        assert output_file.exists()
        
        # Verify Excel structure using pandas
        excel_file = pd.ExcelFile(output_file)
        
        # Check required sheets exist
        required_sheets = {
            'Universe & Summary',
            'Market Data',
            'Operating Data',
            'Valuation Output',
            'Implied Valuation',
            'Sensitivity'
        }
        assert set(excel_file.sheet_names) == required_sheets
        
        # Check content of Universe & Summary sheet
        summary = pd.read_excel(excel_file, 'Universe & Summary')
        assert not summary.empty
        assert 'Ticker' in summary.columns
        assert 'EV/EBITDA' in summary.columns
        
    @pytest.mark.benchmark
    def test_export_performance(self, sample_target, sample_peers, benchmark, tmp_path):
        """Test Excel export performance"""
        model = CompsModel(sample_target, sample_peers)
        analysis_data = model.run_analysis()
        
        def export_func():
            output_file = tmp_path / f"test_perf_{datetime.now().timestamp()}.xlsx"
            export_comps_to_excel(analysis_data, str(output_file))
            return output_file
        
        result = benchmark(export_func)
        assert Path(result).exists()

if __name__ == "__main__":
    pytest.main(["-v", "--benchmark-only"])

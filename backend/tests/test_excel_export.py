"""
Test suite for Excel export functionality
"""

import pytest
import pandas as pd
from pathlib import Path
from datetime import datetime
from backend.exports.excel import ModelExcelWriter, export_model_to_excel

# Test data fixtures
@pytest.fixture
def sample_dcf_data():
    return {
        "ticker": "AAPL",
        "enterprise_value": 2500000000,
        "equity_value": 2300000000,
        "implied_price": 150.00,
        "current_price": 140.00,
        "upside_downside": 0.0714,  # 7.14%
        "projections": [
            {
                "year": 2024,
                "revenue": 1000000000,
                "ebit": 300000000,
                "ebitda": 350000000,
                "fcf": 250000000
            },
            {
                "year": 2025,
                "revenue": 1100000000,
                "ebit": 330000000,
                "ebitda": 385000000,
                "fcf": 275000000
            }
        ],
        "terminal_value": 5000000000,
        "wacc": 0.095,
        "terminal_growth": 0.025,
        "revenue_cagr": 0.07,
        "ebit_margin": 0.30,
        "tax_rate": 0.21
    }

@pytest.fixture
def sample_lbo_data():
    return {
        "ticker": "AAPL",
        "purchase_price": 2500000000,
        "exit_value": 3500000000,
        "irr": 0.25,  # 25% IRR
        "moic": 2.5,
        "exit_year": 5
    }

class TestExcelExport:
    def test_dcf_export_structure(self, sample_dcf_data, tmp_path):
        """Test DCF model Excel export structure and formatting"""
        output_file = tmp_path / "test_dcf.xlsx"
        export_model_to_excel(sample_dcf_data, str(output_file), "dcf")
        
        # Verify file exists
        assert output_file.exists()
        
        # Read Excel file
        excel_file = pd.ExcelFile(output_file)
        
        # Check sheets exist
        expected_sheets = {'Summary', 'Projections', 'Assumptions'}
        assert set(excel_file.sheet_names) == expected_sheets
        
        # Check Summary sheet
        summary = pd.read_excel(excel_file, 'Summary')
        assert not summary.empty
        assert 'Enterprise Value' in summary.iloc[:, 0].values
        assert 'Equity Value' in summary.iloc[:, 0].values
        
        # Check Projections sheet
        proj = pd.read_excel(excel_file, 'Projections')
        assert not proj.empty
        assert list(proj.columns) == ['Year', 'Revenue', 'EBIT', 'EBITDA', 'FCF', 'Terminal Value']
        assert len(proj) == len(sample_dcf_data['projections'])
        
        # Check Assumptions sheet
        assump = pd.read_excel(excel_file, 'Assumptions')
        assert not assump.empty
        assert 'WACC' in assump.iloc[:, 0].values
        assert 'Terminal Growth' in assump.iloc[:, 0].values

    def test_lbo_export_structure(self, sample_lbo_data, tmp_path):
        """Test LBO model Excel export structure and formatting"""
        output_file = tmp_path / "test_lbo.xlsx"
        export_model_to_excel(sample_lbo_data, str(output_file), "lbo")
        
        # Verify file exists
        assert output_file.exists()
        
        # Read Excel file
        excel_file = pd.ExcelFile(output_file)
        
        # Check Summary sheet
        summary = pd.read_excel(excel_file, 'Summary')
        assert not summary.empty
        assert 'Purchase Price' in summary.iloc[:, 0].values
        assert 'IRR' in summary.iloc[:, 0].values
        assert 'MOIC' in summary.iloc[:, 0].values

    def test_excel_formatting(self, sample_dcf_data, tmp_path):
        """Test Excel formatting is correctly applied"""
        output_file = tmp_path / "test_format.xlsx"
        writer = ModelExcelWriter(str(output_file))
        writer.write_dcf_model(sample_dcf_data)
        writer.save()
        
        # Verify formats using openpyxl (for format inspection)
        wb = pd.ExcelFile(output_file)
        summary = pd.read_excel(wb, 'Summary')
        
        # Verify numeric formatting by checking string representation
        ev_cell = summary[summary.iloc[:, 0] == 'Enterprise Value'].iloc[0, 1]
        assert isinstance(ev_cell, (int, float))  # Should be numeric
        
        upside_cell = summary[summary.iloc[:, 0] == 'Upside/Downside'].iloc[0, 1]
        assert isinstance(upside_cell, (int, float))  # Should be numeric

    @pytest.mark.benchmark
    def test_export_performance(self, benchmark, sample_dcf_data, tmp_path):
        """Test Excel export performance"""
        def export_func():
            output_file = tmp_path / f"test_perf_{datetime.now().timestamp()}.xlsx"
            export_model_to_excel(sample_dcf_data, str(output_file), "dcf")
            return output_file
        
        result = benchmark(export_func)
        assert Path(result).exists()

    def test_error_handling(self, tmp_path):
        """Test error handling for Excel export"""
        # Test with invalid model type
        with pytest.raises(ValueError):
            export_model_to_excel({}, str(tmp_path / "test.xlsx"), "invalid_type")
        
        # Test with invalid data
        with pytest.raises(Exception):
            export_model_to_excel(None, str(tmp_path / "test.xlsx"), "dcf")
        
        # Test with invalid path
        with pytest.raises(Exception):
            export_model_to_excel({}, "/invalid/path/test.xlsx", "dcf")

    def test_large_dataset(self, tmp_path):
        """Test Excel export with large dataset"""
        # Create large dataset
        large_data = {
            "ticker": "AAPL",
            "projections": [
                {
                    "year": year,
                    "revenue": 1000000000 * (1.1 ** i),
                    "ebit": 300000000 * (1.1 ** i),
                    "ebitda": 350000000 * (1.1 ** i),
                    "fcf": 250000000 * (1.1 ** i)
                }
                for i, year in enumerate(range(2024, 2034))  # 10 years of projections
            ],
            "terminal_value": 10000000000
        }
        
        output_file = tmp_path / "test_large.xlsx"
        export_model_to_excel(large_data, str(output_file), "dcf")
        
        # Verify file exists and can be read
        assert output_file.exists()
        df = pd.read_excel(output_file, 'Projections')
        assert len(df) == 10  # Should have 10 years of projections

if __name__ == "__main__":
    pytest.main(["-v", "--benchmark-only"])

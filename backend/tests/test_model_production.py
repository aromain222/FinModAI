"""
Test suite for model production and Google Sheets integration
"""

import pytest
import pandas as pd
import numpy as np
from datetime import datetime
from unittest.mock import Mock, patch

from backend.models_data.generate import generate_dcf_model, generate_lbo_model
from backend.exports.excel import export_to_excel
from backend.exports.google_sheets import export_to_google_sheets

# Test data
@pytest.fixture
def sample_model_inputs():
    return {
        "ticker": "AAPL",
        "model_type": "dcf",
        "custom_assumptions": {
            "wacc": 0.095,
            "terminal_growth": 0.025,
            "revenue_cagr_1_5": 0.07
        }
    }

@pytest.fixture
def sample_financial_data():
    return {
        "revenue": [100.0, 110.0, 121.0],
        "ebit": [20.0, 22.0, 24.2],
        "fcf": [15.0, 16.5, 18.15],
        "years": [2023, 2024, 2025]
    }

# Model Generation Tests
class TestModelGeneration:
    @pytest.mark.asyncio
    async def test_dcf_model_generation(self, sample_model_inputs, sample_financial_data):
        """Test DCF model generation with sample data"""
        with patch("backend.models_data.generate.fetch_financial_data") as mock_fetch:
            mock_fetch.return_value = sample_financial_data
            
            result = await generate_dcf_model(sample_model_inputs)
            
            assert result is not None
            assert "enterprise_value" in result
            assert "equity_value" in result
            assert result["equity_value"] > 0

    @pytest.mark.asyncio
    async def test_lbo_model_generation(self, sample_model_inputs, sample_financial_data):
        """Test LBO model generation with sample data"""
        with patch("backend.models_data.generate.fetch_financial_data") as mock_fetch:
            mock_fetch.return_value = sample_financial_data
            
            result = await generate_lbo_model(sample_model_inputs)
            
            assert result is not None
            assert "irr" in result
            assert "moic" in result
            assert result["irr"] > 0

    @pytest.mark.benchmark
    def test_model_generation_performance(self, benchmark, sample_model_inputs):
        """Test model generation performance"""
        result = benchmark(generate_dcf_model, sample_model_inputs)
        assert result is not None

# Excel Export Tests
class TestExcelExport:
    def test_excel_export_format(self, sample_model_inputs, tmp_path):
        """Test Excel export formatting"""
        output_file = tmp_path / "test_model.xlsx"
        result = export_to_excel(sample_model_inputs, str(output_file))
        
        assert output_file.exists()
        # Verify Excel structure using pandas
        df = pd.read_excel(output_file, sheet_name="Model")
        assert not df.empty
        assert "Year" in df.columns

    @pytest.mark.benchmark
    def test_excel_export_performance(self, benchmark, sample_model_inputs, tmp_path):
        """Test Excel export performance"""
        output_file = tmp_path / "test_model.xlsx"
        benchmark(export_to_excel, sample_model_inputs, str(output_file))

# Google Sheets Integration Tests
class TestGoogleSheetsIntegration:
    @pytest.fixture
    def mock_google_creds(self):
        return Mock()

    @pytest.mark.asyncio
    async def test_google_sheets_export(self, sample_model_inputs, mock_google_creds):
        """Test Google Sheets export functionality"""
        with patch("backend.exports.google_sheets.build_service") as mock_build:
            mock_service = Mock()
            mock_build.return_value = mock_service
            
            result = await export_to_google_sheets(
                sample_model_inputs,
                "Test Model",
                mock_google_creds
            )
            
            assert result is not None
            assert "spreadsheet_id" in result
            mock_service.spreadsheets().create.assert_called_once()

    @pytest.mark.asyncio
    async def test_google_sheets_update(self, sample_model_inputs, mock_google_creds):
        """Test Google Sheets update functionality"""
        with patch("backend.exports.google_sheets.build_service") as mock_build:
            mock_service = Mock()
            mock_build.return_value = mock_service
            
            spreadsheet_id = "test_id"
            result = await export_to_google_sheets(
                sample_model_inputs,
                "Test Model",
                mock_google_creds,
                spreadsheet_id=spreadsheet_id
            )
            
            assert result is not None
            assert result["spreadsheet_id"] == spreadsheet_id
            mock_service.spreadsheets().values().update.assert_called()

    @pytest.mark.timeout(5)
    @pytest.mark.asyncio
    async def test_google_sheets_timeout(self, sample_model_inputs, mock_google_creds):
        """Test Google Sheets timeout handling"""
        with patch("backend.exports.google_sheets.build_service") as mock_build:
            mock_service = Mock()
            mock_build.return_value = mock_service
            mock_service.spreadsheets().create.side_effect = TimeoutError()
            
            with pytest.raises(TimeoutError):
                await export_to_google_sheets(
                    sample_model_inputs,
                    "Test Model",
                    mock_google_creds
                )

# Integration Tests
class TestEndToEnd:
    @pytest.mark.asyncio
    async def test_model_to_sheets_flow(self, sample_model_inputs, mock_google_creds):
        """Test complete flow from model generation to Google Sheets export"""
        # 1. Generate model
        model_result = await generate_dcf_model(sample_model_inputs)
        assert model_result is not None

        # 2. Export to Google Sheets
        with patch("backend.exports.google_sheets.build_service") as mock_build:
            mock_service = Mock()
            mock_build.return_value = mock_service
            
            sheets_result = await export_to_google_sheets(
                model_result,
                "Test Model",
                mock_google_creds
            )
            
            assert sheets_result is not None
            assert "spreadsheet_id" in sheets_result

    @pytest.mark.asyncio
    async def test_error_handling(self, sample_model_inputs):
        """Test error handling in the complete flow"""
        # Test with invalid inputs
        with pytest.raises(ValueError):
            invalid_inputs = {**sample_model_inputs, "wacc": -1}
            await generate_dcf_model(invalid_inputs)

        # Test with missing data
        with patch("backend.models_data.generate.fetch_financial_data") as mock_fetch:
            mock_fetch.return_value = None
            with pytest.raises(ValueError):
                await generate_dcf_model(sample_model_inputs)

if __name__ == "__main__":
    pytest.main(["-v", "--benchmark-only"])

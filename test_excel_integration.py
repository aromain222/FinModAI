#!/usr/bin/env python3
"""
Test script for Excel integration
Run this script to verify Excel export functionality
"""

import os
import sys
import pytest
import logging
from pathlib import Path
from datetime import datetime

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

def run_excel_tests():
    """Run Excel integration tests"""
    logger.info("Running Excel integration tests...")
    
    # Create test output directory
    test_output = Path("test_output")
    test_output.mkdir(exist_ok=True)
    
    # Run pytest with benchmark
    args = [
        "-v",
        "--benchmark-only",
        "backend/tests/test_excel_export.py",
        "-k", "test_excel",
        "--benchmark-json", str(test_output / "excel_benchmark.json")
    ]
    
    result = pytest.main(args)
    
    if result == 0:
        logger.info("✅ Excel integration tests passed!")
    else:
        logger.error("❌ Excel integration tests failed!")
        sys.exit(1)

def verify_excel_output():
    """Verify Excel output manually"""
    logger.info("Verifying Excel output...")
    
    from backend.exports.excel import export_model_to_excel
    
    # Test data
    test_data = {
        "ticker": "AAPL",
        "enterprise_value": 2500000000000,  # $2.5T
        "equity_value": 2300000000000,
        "implied_price": 150.00,
        "current_price": 140.00,
        "upside_downside": 0.0714,
        "projections": [
            {
                "year": 2024,
                "revenue": 383000000000,  # $383B
                "ebit": 114900000000,     # $114.9B
                "ebitda": 129500000000,   # $129.5B
                "fcf": 96180000000        # $96.18B
            },
            {
                "year": 2025,
                "revenue": 409810000000,  # $409.81B (7% growth)
                "ebit": 122943000000,    # $122.94B
                "ebitda": 138565000000,  # $138.57B
                "fcf": 102912600000      # $102.91B
            }
        ],
        "terminal_value": 5000000000000,  # $5T
        "wacc": 0.095,
        "terminal_growth": 0.025,
        "revenue_cagr": 0.07,
        "ebit_margin": 0.30,
        "tax_rate": 0.21
    }
    
    # Export to Excel
    output_file = "test_output/apple_dcf_test.xlsx"
    try:
        export_model_to_excel(test_data, output_file, "dcf")
        logger.info(f"✅ Excel file created successfully: {output_file}")
        
        # Verify file exists and size
        file_size = Path(output_file).stat().st_size
        logger.info(f"File size: {file_size / 1024:.1f} KB")
        
        if file_size < 100:
            logger.warning("⚠️ File size seems too small!")
        
    except Exception as e:
        logger.error(f"❌ Error creating Excel file: {e}")
        sys.exit(1)

def main():
    """Main test function"""
    logger.info("Starting Excel integration verification...")
    
    # Run tests
    run_excel_tests()
    
    # Verify output
    verify_excel_output()
    
    logger.info("✅ Excel integration verification complete!")

if __name__ == "__main__":
    main()

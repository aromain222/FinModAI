#!/usr/bin/env python3
"""
Update comprehensive demo data with 100+ companies
"""

from generate_100_plus_companies import generate_100_plus_companies
from datetime import datetime

def update_comprehensive_demo_data():
    """Update the comprehensive demo data file with 100+ companies."""
    
    # Generate all companies
    all_companies = generate_100_plus_companies()
    
    # Create the file content
    file_content = '''"""
Comprehensive Demo Data - 118+ companies with realistic financial data
This provides fallback data for virtually any major company ticker.
"""

from datetime import datetime
from typing import Dict, Any

def get_comprehensive_demo_data() -> Dict[str, Dict[str, Any]]:
    """
    Get comprehensive demo data for 118+ major companies.
    Each company has realistic financial data based on their sector and business model.
    """
    
    return {'''
    
    # Add each company
    for ticker, data in all_companies.items():
        file_content += f'        "{ticker}": {data},\n'
    
    file_content += '''    }

def get_demo_data(ticker: str) -> dict:
    """Get demo data for a ticker if available."""
    ticker = ticker.upper()
    data = get_comprehensive_demo_data()
    if ticker in data:
        return data[ticker]
    return None
'''
    
    # Write to file
    with open('financial_data/comprehensive_demo_data.py', 'w') as f:
        f.write(file_content)
    
    print(f"Updated comprehensive_demo_data.py with {len(all_companies)} companies")

if __name__ == "__main__":
    update_comprehensive_demo_data()

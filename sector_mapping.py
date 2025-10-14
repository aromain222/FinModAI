"""
Sector and Industry Mapping for SEC EDGAR Dataset Companies
Maps 97 tickers to their respective sectors and industries for peer discovery
"""

from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)

# Comprehensive sector/industry mapping for all 97 companies
SECTOR_MAPPING = {
    # Technology - Software
    'MSFT': {'sector': 'Technology', 'industry': 'Software - Infrastructure'},
    'ORCL': {'sector': 'Technology', 'industry': 'Software - Infrastructure'},
    'CRM': {'sector': 'Technology', 'industry': 'Software - Application'},
    'ADBE': {'sector': 'Technology', 'industry': 'Software - Application'},
    'INTU': {'sector': 'Technology', 'industry': 'Software - Application'},
    'NOW': {'sector': 'Technology', 'industry': 'Software - Application'},
    'ACN': {'sector': 'Technology', 'industry': 'Information Technology Services'},
    
    # Technology - Hardware & Semiconductors
    'AAPL': {'sector': 'Technology', 'industry': 'Consumer Electronics'},
    'NVDA': {'sector': 'Technology', 'industry': 'Semiconductors'},
    'AMD': {'sector': 'Technology', 'industry': 'Semiconductors'},
    'INTC': {'sector': 'Technology', 'industry': 'Semiconductors'},
    'QCOM': {'sector': 'Technology', 'industry': 'Semiconductors'},
    'TXN': {'sector': 'Technology', 'industry': 'Semiconductors'},
    'AVGO': {'sector': 'Technology', 'industry': 'Semiconductors'},
    'IBM': {'sector': 'Technology', 'industry': 'Information Technology Services'},
    
    # Communication Services
    'GOOGL': {'sector': 'Communication Services', 'industry': 'Internet Content & Information'},
    'META': {'sector': 'Communication Services', 'industry': 'Internet Content & Information'},
    'NFLX': {'sector': 'Communication Services', 'industry': 'Entertainment'},
    'DIS': {'sector': 'Communication Services', 'industry': 'Entertainment'},
    'CMCSA': {'sector': 'Communication Services', 'industry': 'Entertainment'},
    'CHTR': {'sector': 'Communication Services', 'industry': 'Entertainment'},
    'T': {'sector': 'Communication Services', 'industry': 'Telecom Services'},
    'VZ': {'sector': 'Communication Services', 'industry': 'Telecom Services'},
    'TMUS': {'sector': 'Communication Services', 'industry': 'Telecom Services'},
    'EA': {'sector': 'Communication Services', 'industry': 'Electronic Gaming & Multimedia'},
    'TTWO': {'sector': 'Communication Services', 'industry': 'Electronic Gaming & Multimedia'},
    
    # Consumer Cyclical
    'AMZN': {'sector': 'Consumer Cyclical', 'industry': 'Internet Retail'},
    'TSLA': {'sector': 'Consumer Cyclical', 'industry': 'Auto Manufacturers'},
    'HD': {'sector': 'Consumer Cyclical', 'industry': 'Home Improvement Retail'},
    'LOW': {'sector': 'Consumer Cyclical', 'industry': 'Home Improvement Retail'},
    'NKE': {'sector': 'Consumer Cyclical', 'industry': 'Footwear & Accessories'},
    'SBUX': {'sector': 'Consumer Cyclical', 'industry': 'Restaurants'},
    'MCD': {'sector': 'Consumer Cyclical', 'industry': 'Restaurants'},
    'TGT': {'sector': 'Consumer Cyclical', 'industry': 'Discount Stores'},
    
    # Consumer Defensive
    'WMT': {'sector': 'Consumer Defensive', 'industry': 'Discount Stores'},
    'COST': {'sector': 'Consumer Defensive', 'industry': 'Discount Stores'},
    'PG': {'sector': 'Consumer Defensive', 'industry': 'Household & Personal Products'},
    'KO': {'sector': 'Consumer Defensive', 'industry': 'Beverages - Non-Alcoholic'},
    'PEP': {'sector': 'Consumer Defensive', 'industry': 'Beverages - Non-Alcoholic'},
    'PM': {'sector': 'Consumer Defensive', 'industry': 'Tobacco'},
    'MO': {'sector': 'Consumer Defensive', 'industry': 'Tobacco'},
    'CL': {'sector': 'Consumer Defensive', 'industry': 'Household & Personal Products'},
    'KMB': {'sector': 'Consumer Defensive', 'industry': 'Household & Personal Products'},
    'GIS': {'sector': 'Consumer Defensive', 'industry': 'Packaged Foods'},
    'K': {'sector': 'Consumer Defensive', 'industry': 'Packaged Foods'},
    'HSY': {'sector': 'Consumer Defensive', 'industry': 'Confectioners'},
    'MDLZ': {'sector': 'Consumer Defensive', 'industry': 'Confectioners'},
    'EL': {'sector': 'Consumer Defensive', 'industry': 'Household & Personal Products'},
    
    # Healthcare
    'UNH': {'sector': 'Healthcare', 'industry': 'Healthcare Plans'},
    'JNJ': {'sector': 'Healthcare', 'industry': 'Drug Manufacturers - General'},
    'LLY': {'sector': 'Healthcare', 'industry': 'Drug Manufacturers - General'},
    'ABBV': {'sector': 'Healthcare', 'industry': 'Drug Manufacturers - General'},
    'MRK': {'sector': 'Healthcare', 'industry': 'Drug Manufacturers - General'},
    'PFE': {'sector': 'Healthcare', 'industry': 'Drug Manufacturers - General'},
    'TMO': {'sector': 'Healthcare', 'industry': 'Diagnostics & Research'},
    'ABT': {'sector': 'Healthcare', 'industry': 'Medical Devices'},
    'DHR': {'sector': 'Healthcare', 'industry': 'Diagnostics & Research'},
    'BMY': {'sector': 'Healthcare', 'industry': 'Drug Manufacturers - General'},
    'AMGN': {'sector': 'Healthcare', 'industry': 'Biotechnology'},
    'GILD': {'sector': 'Healthcare', 'industry': 'Biotechnology'},
    'REGN': {'sector': 'Healthcare', 'industry': 'Biotechnology'},
    'VRTX': {'sector': 'Healthcare', 'industry': 'Biotechnology'},
    'CI': {'sector': 'Healthcare', 'industry': 'Healthcare Plans'},
    'CVS': {'sector': 'Healthcare', 'industry': 'Healthcare Plans'},
    'ELV': {'sector': 'Healthcare', 'industry': 'Healthcare Plans'},
    'HCA': {'sector': 'Healthcare', 'industry': 'Medical Care Facilities'},
    'ISRG': {'sector': 'Healthcare', 'industry': 'Medical Instruments & Supplies'},
    'ZTS': {'sector': 'Healthcare', 'industry': 'Drug Manufacturers - Specialty & Generic'},
    
    # Financial Services
    'JPM': {'sector': 'Financial Services', 'industry': 'Banks - Diversified'},
    'BAC': {'sector': 'Financial Services', 'industry': 'Banks - Diversified'},
    'WFC': {'sector': 'Financial Services', 'industry': 'Banks - Diversified'},
    'C': {'sector': 'Financial Services', 'industry': 'Banks - Diversified'},
    'GS': {'sector': 'Financial Services', 'industry': 'Capital Markets'},
    'MS': {'sector': 'Financial Services', 'industry': 'Capital Markets'},
    'BLK': {'sector': 'Financial Services', 'industry': 'Asset Management'},
    'SCHW': {'sector': 'Financial Services', 'industry': 'Capital Markets'},
    'SPGI': {'sector': 'Financial Services', 'industry': 'Financial Data & Stock Exchanges'},
    'CME': {'sector': 'Financial Services', 'industry': 'Financial Data & Stock Exchanges'},
    'ICE': {'sector': 'Financial Services', 'industry': 'Financial Data & Stock Exchanges'},
    'AON': {'sector': 'Financial Services', 'industry': 'Insurance Brokers'},
    'MMC': {'sector': 'Financial Services', 'industry': 'Insurance Brokers'},
    'AXP': {'sector': 'Financial Services', 'industry': 'Credit Services'},
    'V': {'sector': 'Financial Services', 'industry': 'Credit Services'},
    'MA': {'sector': 'Financial Services', 'industry': 'Credit Services'},
    'CB': {'sector': 'Financial Services', 'industry': 'Insurance - Property & Casualty'},
    'PGR': {'sector': 'Financial Services', 'industry': 'Insurance - Property & Casualty'},
    'TRV': {'sector': 'Financial Services', 'industry': 'Insurance - Property & Casualty'},
    
    # Energy
    'XOM': {'sector': 'Energy', 'industry': 'Oil & Gas Integrated'},
    'CVX': {'sector': 'Energy', 'industry': 'Oil & Gas Integrated'},
    'COP': {'sector': 'Energy', 'industry': 'Oil & Gas Exploration & Production'},
    'EOG': {'sector': 'Energy', 'industry': 'Oil & Gas Exploration & Production'},
    'OXY': {'sector': 'Energy', 'industry': 'Oil & Gas Exploration & Production'},
    'SLB': {'sector': 'Energy', 'industry': 'Oil & Gas Equipment & Services'},
    'PSX': {'sector': 'Energy', 'industry': 'Oil & Gas Refining & Marketing'},
    'VLO': {'sector': 'Energy', 'industry': 'Oil & Gas Refining & Marketing'},
    'MPC': {'sector': 'Energy', 'industry': 'Oil & Gas Refining & Marketing'},
}


def get_sector(ticker: str) -> Optional[Dict[str, str]]:
    """
    Get sector and industry for a ticker.
    
    Args:
        ticker: Stock ticker (e.g., 'AAPL')
    
    Returns:
        Dict with 'sector' and 'industry' keys, or None if not found
    """
    ticker = ticker.upper()
    return SECTOR_MAPPING.get(ticker)


def find_peers(ticker: str, limit: int = 10, same_industry: bool = True) -> List[str]:
    """
    Find peer companies for a given ticker.
    
    Args:
        ticker: Primary ticker to find peers for
        limit: Maximum number of peers to return
        same_industry: If True, match by industry; if False, match by sector
    
    Returns:
        List of peer tickers (excludes the input ticker)
    """
    ticker = ticker.upper()
    
    # Get the ticker's sector/industry
    ticker_info = get_sector(ticker)
    if not ticker_info:
        logger.warning(f"Ticker {ticker} not found in sector mapping")
        return []
    
    # Determine matching criteria
    match_field = 'industry' if same_industry else 'sector'
    target_value = ticker_info[match_field]
    
    # Find all tickers with matching sector/industry
    peers = []
    for t, info in SECTOR_MAPPING.items():
        if t != ticker and info[match_field] == target_value:
            peers.append(t)
    
    # If we have too few peers from industry, expand to sector
    if same_industry and len(peers) < limit:
        logger.info(f"Only {len(peers)} industry peers for {ticker}, expanding to sector")
        sector_peers = find_peers(ticker, limit=limit, same_industry=False)
        # Combine, with industry peers first
        peers = peers + [p for p in sector_peers if p not in peers]
    
    # Return up to limit
    result = peers[:limit]
    logger.info(f"Found {len(result)} peers for {ticker} in {target_value}")
    return result


def get_all_tickers() -> List[str]:
    """Get all tickers in the mapping"""
    return sorted(SECTOR_MAPPING.keys())


def get_sectors() -> List[str]:
    """Get unique list of sectors"""
    return sorted(set(info['sector'] for info in SECTOR_MAPPING.values()))


def get_industries() -> List[str]:
    """Get unique list of industries"""
    return sorted(set(info['industry'] for info in SECTOR_MAPPING.values()))


def get_tickers_by_sector(sector: str) -> List[str]:
    """Get all tickers in a specific sector"""
    return [ticker for ticker, info in SECTOR_MAPPING.items() if info['sector'] == sector]


def get_tickers_by_industry(industry: str) -> List[str]:
    """Get all tickers in a specific industry"""
    return [ticker for ticker, info in SECTOR_MAPPING.items() if info['industry'] == industry]


def get_sector_summary() -> Dict[str, int]:
    """Get count of companies by sector"""
    summary = {}
    for info in SECTOR_MAPPING.values():
        sector = info['sector']
        summary[sector] = summary.get(sector, 0) + 1
    return summary


if __name__ == '__main__':
    print("=" * 70)
    print("SEC EDGAR Sector Mapping Summary")
    print("=" * 70)
    
    print(f"\nTotal companies: {len(SECTOR_MAPPING)}")
    print(f"Total sectors: {len(get_sectors())}")
    print(f"Total industries: {len(get_industries())}")
    
    print("\nCompanies by Sector:")
    for sector, count in sorted(get_sector_summary().items(), key=lambda x: -x[1]):
        print(f"  {sector}: {count} companies")
    
    print("\n" + "=" * 70)
    print("Testing Peer Discovery")
    print("=" * 70)
    
    # Test with a few examples
    test_tickers = ['AAPL', 'JPM', 'XOM', 'UNH']
    
    for ticker in test_tickers:
        info = get_sector(ticker)
        if info:
            print(f"\n{ticker}:")
            print(f"  Sector: {info['sector']}")
            print(f"  Industry: {info['industry']}")
            
            peers = find_peers(ticker, limit=5)
            print(f"  Peers (top 5): {', '.join(peers)}")
    
    print("\n" + "=" * 70)
    print("✓ Sector Mapping Test Complete")
    print("=" * 70)


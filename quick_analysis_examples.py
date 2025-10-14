#!/usr/bin/env python3
"""
Quick Analysis Examples - Copy/paste these into Python!
"""

import pandas as pd
import numpy as np

# Load the data
df = pd.read_csv('dataset/edgar_top100_all_years.csv')

# ============================================================================
# EXAMPLE 1: Find fastest growing companies
# ============================================================================
def find_fastest_growers():
    """Find companies with highest revenue CAGR"""
    print("="*70)
    print("FASTEST GROWING COMPANIES (by Revenue CAGR)")
    print("="*70)
    
    growth_rates = []
    for ticker in df['ticker'].unique():
        company = df[df['ticker'] == ticker].sort_values('fiscal_year')
        revenues = company['revenue'].dropna()
        
        if len(revenues) >= 5:  # Need at least 5 years
            first_rev = revenues.iloc[0]
            last_rev = revenues.iloc[-1]
            years = len(revenues) - 1
            cagr = (last_rev / first_rev) ** (1/years) - 1
            growth_rates.append({
                'ticker': ticker,
                'cagr': cagr,
                'years': years,
                'first_revenue': first_rev / 1e9,
                'last_revenue': last_rev / 1e9
            })
    
    growth_df = pd.DataFrame(growth_rates).sort_values('cagr', ascending=False)
    
    print("\nTop 10:")
    for i, row in growth_df.head(10).iterrows():
        print(f"{row['ticker']:6s}: {row['cagr']*100:5.1f}% CAGR "
              f"(${row['first_revenue']:6.1f}B → ${row['last_revenue']:7.1f}B over {int(row['years'])} years)")

# ============================================================================
# EXAMPLE 2: Most profitable companies
# ============================================================================
def find_most_profitable():
    """Find companies with highest net margins"""
    print("\n" + "="*70)
    print("MOST PROFITABLE COMPANIES (by Net Margin)")
    print("="*70)
    
    # Get latest year for each company
    latest = df.loc[df.groupby('ticker')['fiscal_year'].idxmax()]
    
    # Calculate net margin
    latest['net_margin'] = (latest['net_income'] / latest['revenue']) * 100
    
    profitable = latest[['ticker', 'net_margin', 'revenue', 'net_income']].dropna()
    profitable = profitable.sort_values('net_margin', ascending=False)
    
    print("\nTop 10:")
    for _, row in profitable.head(10).iterrows():
        print(f"{row['ticker']:6s}: {row['net_margin']:5.1f}% margin "
              f"(${row['net_income']/1e9:5.1f}B income on ${row['revenue']/1e9:6.1f}B revenue)")

# ============================================================================
# EXAMPLE 3: Companies with most cash
# ============================================================================
def find_cash_rich():
    """Find companies with most cash"""
    print("\n" + "="*70)
    print("CASH-RICH COMPANIES")
    print("="*70)
    
    latest = df.loc[df.groupby('ticker')['fiscal_year'].idxmax()]
    cash_rich = latest[['ticker', 'cash', 'gross_debt', 'net_debt']].dropna()
    cash_rich = cash_rich.sort_values('cash', ascending=False)
    
    print("\nTop 10 by Cash Position:")
    for _, row in cash_rich.head(10).iterrows():
        net_debt = row['net_debt']
        if net_debt < 0:
            status = f"Net Cash: ${-net_debt/1e9:.1f}B"
        else:
            status = f"Net Debt: ${net_debt/1e9:.1f}B"
        print(f"{row['ticker']:6s}: ${row['cash']/1e9:6.1f}B cash ({status})")

# ============================================================================
# EXAMPLE 4: COVID-19 impact analysis
# ============================================================================
def analyze_covid_impact():
    """Compare 2019 vs 2020 to see COVID impact"""
    print("\n" + "="*70)
    print("COVID-19 IMPACT ANALYSIS (2019 vs 2020)")
    print("="*70)
    
    pre_covid = df[df['fiscal_year'] == 2019][['ticker', 'revenue', 'net_income']]
    covid = df[df['fiscal_year'] == 2020][['ticker', 'revenue', 'net_income']]
    
    merged = pre_covid.merge(covid, on='ticker', suffixes=('_2019', '_2020'))
    merged['revenue_change'] = ((merged['revenue_2020'] - merged['revenue_2019']) / merged['revenue_2019']) * 100
    merged['income_change'] = ((merged['net_income_2020'] - merged['net_income_2019']) / merged['net_income_2019']) * 100
    
    print("\nBiggest Winners (Revenue Growth):")
    winners = merged.sort_values('revenue_change', ascending=False).head(5)
    for _, row in winners.iterrows():
        print(f"{row['ticker']:6s}: +{row['revenue_change']:5.1f}% revenue growth")
    
    print("\nBiggest Losers (Revenue Decline):")
    losers = merged.sort_values('revenue_change', ascending=True).head(5)
    for _, row in losers.iterrows():
        print(f"{row['ticker']:6s}: {row['revenue_change']:5.1f}% revenue decline")

# ============================================================================
# EXAMPLE 5: Sector performance over time
# ============================================================================
def sector_performance():
    """Compare sector performance 2020-2024"""
    print("\n" + "="*70)
    print("SECTOR PERFORMANCE (2020-2024)")
    print("="*70)
    
    sectors = {
        'Tech': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META'],
        'Finance': ['JPM', 'BAC', 'GS', 'MS', 'V', 'MA'],
        'Healthcare': ['JNJ', 'UNH', 'LLY', 'MRK', 'PFE'],
        'Energy': ['XOM', 'CVX', 'COP', 'SLB']
    }
    
    recent = df[df['fiscal_year'] >= 2020]
    
    for sector, tickers in sectors.items():
        sector_data = recent[recent['ticker'].isin(tickers)]
        if len(sector_data) == 0:
            continue
        
        yearly = sector_data.groupby('fiscal_year')['net_income'].sum()
        total_income = yearly.sum() / 1e9
        
        print(f"\n{sector}:")
        print(f"  Total net income (2020-2024): ${total_income:.0f}B")
        print(f"  Companies: {', '.join(tickers[:3])}...")

# ============================================================================
# RUN ALL EXAMPLES
# ============================================================================
if __name__ == '__main__':
    print("\n" + "="*70)
    print("  QUICK ANALYSIS EXAMPLES")
    print("  Copy/paste any function into Python to run!")
    print("="*70)
    
    find_fastest_growers()
    find_most_profitable()
    find_cash_rich()
    analyze_covid_impact()
    sector_performance()
    
    print("\n" + "="*70)
    print("  ✓ All Examples Complete!")
    print("="*70)
    print("\n💡 Pro Tip: Import this file and run individual functions:")
    print("   >>> from quick_analysis_examples import find_fastest_growers")
    print("   >>> find_fastest_growers()")


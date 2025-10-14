# SEC EDGAR Comprehensive Data Guide

## 🚀 Quick Start

### Option 1: Top 100 Companies (Fast - ~2 minutes)
```bash
python edgar_pull_all.py --dataset top100 --years 5
```
**Result**: ~500 records (100 companies × 5 years)

### Option 2: Top 100 with ALL Years (Comprehensive - ~3 minutes)
```bash
python edgar_pull_all.py --dataset top100
```
**Result**: ~1,000-1,500 records (100 companies × 10-15 years each)

### Option 3: Custom Ticker List
```bash
python edgar_pull_all.py --dataset custom --tickers AAPL MSFT GOOGL AMZN --years 10
```
**Result**: 40 records (4 companies × 10 years)

### Option 4: Full S&P 500 (Long - ~30 minutes)
```bash
# First expand SP500_ALL list in the script to all 500 tickers
python edgar_pull_all.py --dataset sp500
```
**Result**: ~5,000-7,500 records (500 companies × 10-15 years)

## 📊 What You Get

### Datasets Available

| Dataset | Companies | Est. Records | Time | Best For |
|---------|-----------|--------------|------|----------|
| Top 100 (5yr) | 100 | ~500 | 2 min | Quick testing |
| Top 100 (all) | 100 | ~1,500 | 3 min | Good coverage |
| Custom tickers | Variable | Variable | <1 min | Specific companies |
| S&P 500 (5yr) | 500 | ~2,500 | 30 min | Comprehensive |
| S&P 500 (all) | 500 | ~7,500 | 35 min | Maximum data |

### Sectors Covered (Top 100)

- **Technology**: 20 companies (AAPL, MSFT, GOOGL, NVDA, etc.)
- **Financial Services**: 20 companies (JPM, BAC, V, MA, etc.)
- **Healthcare**: 20 companies (JNJ, UNH, LLY, etc.)
- **Consumer**: 20 companies (WMT, HD, MCD, COST, etc.)
- **Communication**: 10 companies (DIS, NFLX, CMCSA, etc.)
- **Energy**: 10 companies (XOM, CVX, COP, etc.)

## 🔧 Command Options

### Basic Usage
```bash
python edgar_pull_all.py [OPTIONS]
```

### All Options

```bash
--dataset {top100|sp500|custom}
    Choose dataset (default: top100)
    
--years NUMBER
    Max years per company (default: all available)
    Example: --years 5 (gets last 5 years only)
    
--tickers TICKER1 TICKER2 ...
    Custom ticker list (only with --dataset custom)
    Example: --tickers AAPL MSFT GOOGL
    
--output PATH
    Output CSV file path
    Default: dataset/edgar_all_financials.csv
```

### Examples

**Get last 3 years for 10 custom tickers:**
```bash
python edgar_pull_all.py \
    --dataset custom \
    --tickers AAPL MSFT GOOGL AMZN NVDA META TSLA NFLX DIS V \
    --years 3 \
    --output my_data.csv
```

**Get all data for tech sector:**
```bash
python edgar_pull_all.py \
    --dataset custom \
    --tickers AAPL MSFT GOOGL AMZN NVDA META TSLA ORCL INTC AMD QCOM AVGO ADBE CRM CSCO \
    --output tech_sector.csv
```

**Get 10 years for Top 100:**
```bash
python edgar_pull_all.py \
    --dataset top100 \
    --years 10 \
    --output top100_10yr.csv
```

## 📈 Expected Output

### Progress Display
```
======================================================================
SEC EDGAR Comprehensive Data Pipeline
======================================================================
Dataset: top100
Companies: 100
Max years per company: All available
Output: dataset/edgar_all_financials.csv

Loading ticker-to-CIK mapping from SEC...
✓ Loaded 10142 ticker-CIK mappings

======================================================================
Processing 100 companies...
======================================================================

[1/100] AAPL... ✓ 15 records
[2/100] MSFT... ✓ 14 records
[3/100] GOOGL... ✓ 12 records
...
[10/100] CSCO... ✓ 13 records
  → Progress: 10/100 (10.0%) | ETA: 2.7 min

...

======================================================================
Summary
======================================================================
Total companies: 100
  ✓ Successful: 98
  ✗ Failed: 2
Total records: 1,423
Average records per company: 14.5
Execution time: 3.2 minutes
Records per second: 7.4
```

### CSV Output
Same 27-field schema as before:
- ticker, cik, fiscal_year
- revenue, ebit, ebitda, net_income
- debt metrics, working capital
- computed ratios

## 🎯 Use Cases

### 1. Build Training Dataset for Models
```bash
# Get comprehensive data for model training
python edgar_pull_all.py --dataset top100 --output training_data.csv
```

### 2. Sector Analysis
```bash
# Compare all tech companies
python edgar_pull_all.py \
    --dataset custom \
    --tickers AAPL MSFT GOOGL AMZN META NVDA TSLA ORCL INTC AMD \
    --output tech_comparison.csv
```

### 3. Historical Trend Analysis
```bash
# Get maximum history for 10 key companies
python edgar_pull_all.py \
    --dataset custom \
    --tickers AAPL MSFT GOOGL AMZN JPM BAC WMT JNJ XOM CVX \
    --output long_term_trends.csv
```

### 4. Quick Update
```bash
# Get last 2 years for Top 100 (for recent data only)
python edgar_pull_all.py --dataset top100 --years 2 --output recent_data.csv
```

## ⚡ Performance

### Execution Time
- **Rate limit**: 0.6 seconds per company
- **Overhead**: ~0.2 seconds per company for processing
- **Total**: ~0.8 seconds per company average

**Time Estimates**:
- 25 companies: ~20 seconds
- 100 companies: ~2 minutes
- 500 companies: ~10 minutes
- 1000 companies: ~20 minutes

### Data Size
- **CSV size**: ~200 KB per 100 records
- **Memory usage**: <100 MB for any size
- **Disk space**: ~2 MB per 1,000 records

## 🔍 Data Quality

### Expected Completeness (Top 100 companies)

| Field | Completeness |
|-------|--------------|
| Revenue | 98%+ |
| Net Income | 98%+ |
| EBIT | 90-95% |
| Cash | 95%+ |
| Total Debt | 85-90% |
| Shares Outstanding | 90%+ |
| CapEx | 80-85% |
| D&A | 75-85% |

### Years Available by Company Age
- **Pre-2010 companies**: 12-15 years typical
- **2010-2015 companies**: 8-12 years
- **Post-2015 companies**: 5-8 years

### Missing Data Patterns
- **Banks**: May have different financial structure
- **New IPOs**: Limited historical data (<5 years)
- **Special industries**: Insurance, REITs may have gaps

## 🛠️ Expanding the Dataset

### Add More Companies to Top 100

Edit `edgar_pull_all.py` line 20-60:

```python
SP500_TOP100 = [
    # Add more tickers here
    'SHOP', 'SQ', 'UBER', 'LYFT', 'ABNB', 'COIN', 'RBLX',
    # ... up to any number
]
```

### Add Full S&P 500 List

```python
SP500_ALL = [
    # Paste full S&P 500 ticker list here
    # You can get this from Wikipedia or other sources
]
```

Then run:
```bash
python edgar_pull_all.py --dataset sp500
```

## 📊 Integration with FinModAI

### Load in Python
```python
import pandas as pd

# Load all data
df = pd.read_csv('dataset/edgar_all_financials.csv')

# Filter and analyze
tech_companies = df[df['ticker'].isin(['AAPL', 'MSFT', 'GOOGL'])]
recent_years = df[df['fiscal_year'] >= 2020]

# Calculate metrics
df['revenue_growth'] = df.groupby('ticker')['revenue'].pct_change()
df['operating_margin'] = df['ebit'] / df['revenue']
df['leverage'] = df['gross_debt'] / df['ebitda']
```

### Use as Provider Fallback

Add to your provider chain in `data_fetcher.py`:

```python
class SECEDGARProvider:
    """Use local SEC data as ultimate fallback"""
    
    def __init__(self):
        self.data = pd.read_csv('dataset/edgar_all_financials.csv')
    
    def get_data(self, ticker, years=5):
        ticker_data = self.data[
            (self.data['ticker'] == ticker) & 
            (self.data['fiscal_year'] >= datetime.now().year - years)
        ]
        return ticker_data.to_dict('records')
```

## 💡 Tips

### 1. Start Small
Test with a few companies first:
```bash
python edgar_pull_all.py --dataset custom --tickers AAPL MSFT GOOGL --years 3
```

### 2. Use Years Limit for Speed
Getting all years is comprehensive but slower:
```bash
# Fast: ~2 min for 100 companies
python edgar_pull_all.py --dataset top100 --years 5

# Slower but more data: ~3 min
python edgar_pull_all.py --dataset top100
```

### 3. Multiple Smaller Runs
Instead of one huge run, do multiple targeted runs:
```bash
# Tech sector
python edgar_pull_all.py --dataset custom --tickers [TECH_LIST] --output tech.csv

# Finance sector  
python edgar_pull_all.py --dataset custom --tickers [FINANCE_LIST] --output finance.csv

# Combine later
cat tech.csv finance.csv > combined.csv
```

### 4. Schedule Regular Updates
Create a cron job to fetch monthly:
```bash
# Add to crontab: run 1st of every month
0 0 1 * * cd /path/to/Scraper && python edgar_pull_all.py --dataset top100 --years 2
```

## 🆘 Troubleshooting

### "Rate limit exceeded"
Increase delay in script:
```python
RATE_LIMIT_DELAY = 1.0  # Slower but safer
```

### "Some companies failed"
Normal - not all companies have complete data. Check errors:
```
Errors encountered:
  - TICKER1: CIK not found
  - TICKER2: No data available
```

### "Takes too long"
Use `--years` limit:
```bash
python edgar_pull_all.py --dataset top100 --years 3  # Much faster
```

## 📦 Output Files

All outputs go to `dataset/` directory:
- `edgar_financials.csv` - Original 25 companies
- `edgar_all_financials.csv` - Comprehensive dataset
- `tech_sector.csv` - Custom sector datasets
- Any `--output` specified file

## ✅ Summary

You now have a script that can fetch:
- ✅ **ANY number of companies** (limited only by time)
- ✅ **ALL available years** (10-15 years per company)
- ✅ **Custom ticker lists** (sector-specific, etc.)
- ✅ **Flexible output** (name files whatever you want)
- ✅ **Progress tracking** (see ETA in real-time)
- ✅ **Error handling** (gracefully skips failed companies)

**Maximum dataset size**: ~10,000+ records across all US publicly traded companies!


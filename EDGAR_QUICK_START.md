# EDGAR Bulk Pipeline - Quick Start

## Run the Pipeline

### Option 1: Standard Run (1000 tickers)
```bash
python edgar_bulk_ingestion.py --max-tickers 1000 --concurrency 3 --jitter 1.0
```

**Estimated time**: 15-20 minutes  
**Expected output**: 700-900 companies, ~3,500-4,500 rows

### Option 2: Test Run (10 tickers)
```bash
python edgar_bulk_ingestion.py --max-tickers 10 --concurrency 2 --jitter 1.0
```

**Estimated time**: 10 seconds  
**Expected output**: 1-3 companies, ~5-15 rows

### Option 3: Force Refresh
```bash
python edgar_bulk_ingestion.py --max-tickers 1000 --concurrency 3 --jitter 1.0 --force
```

## Load the Data

### Python (Pandas)
```python
import pandas as pd

# Load Parquet (recommended - faster, smaller)
df = pd.read_parquet('dataset/edgar_fundamentals.parquet')

# Or load CSV
df = pd.read_csv('dataset/edgar_fundamentals.csv')

# Explore
print(df.head())
print(df.columns)
print(df['ticker'].unique())
```

### Use in DCF Model
```python
from finmath import ufcf, npv

# Get Apple data
aapl = df[df['ticker'] == 'AAPL'].sort_values('fiscal_year', ascending=False)

# Calculate FCF for latest year
latest = aapl.iloc[0]
fcf = ufcf(
    ebit=latest['ebit'],
    tax_rate=latest['effective_tax_rate'],
    d_and_a=latest['d_and_a'],
    capex=latest['capex'],
    delta_nwc=latest['delta_nwc']
)

print(f"AAPL Latest FCF: ${fcf:.1f}M")
```

## Output Files

- **Primary**: `dataset/edgar_fundamentals.parquet` (5-10 MB)
- **Backup**: `dataset/edgar_fundamentals.csv` (20-30 MB)
- **Cache**: `cache/companyfacts/*.json` (1-2 GB)
- **Logs**: `logs/edgar_ingestion_*.log`

## Troubleshooting

**Rate limited (429)?**
```bash
# Increase jitter, decrease concurrency
python edgar_bulk_ingestion.py --max-tickers 1000 --concurrency 2 --jitter 1.5
```

**Want fresh data?**
```bash
# Add --force flag
python edgar_bulk_ingestion.py --max-tickers 1000 --concurrency 3 --jitter 1.0 --force
```

**Check cache size?**
```bash
du -sh cache/companyfacts/
```

## Data Schema (21 columns)

**Identifiers**: ticker, cik, fiscal_year  
**Income Statement**: revenue, ebit, ebitda, interest_expense, tax_expense, net_income  
**Cash Flow**: d_and_a, capex  
**Balance Sheet**: assets_current, liabilities_current, cash, short_term_debt, long_term_debt  
**Derived**: gross_debt, net_debt, shares_outstanding, nwc, delta_nwc, effective_tax_rate  

**All financial values in $ millions**

## Performance

| Tickers | Workers | Jitter | Time | Expected Rows |
|---------|---------|--------|------|---------------|
| 10 | 2 | 1.0s | 10s | 5-15 |
| 100 | 3 | 1.0s | 2min | 350-450 |
| 1000 | 3 | 1.0s | 15-20min | 3,500-4,500 |
| 1500 | 2 | 1.5s | 40-50min | 5,250-6,750 |

## Integration

### Add to sec_edgar_provider.py
```python
import pandas as pd

class BulkEdgarProvider:
    def __init__(self):
        self.df = pd.read_parquet('dataset/edgar_fundamentals.parquet')
    
    def get_company_data(self, ticker):
        return self.df[self.df['ticker'] == ticker.upper()]
```

### Use in Comps Model
```python
# Update comps_data_fetcher.py
provider = BulkEdgarProvider()
data = provider.get_company_data('AAPL')
```

Built for FinModAI | October 2025

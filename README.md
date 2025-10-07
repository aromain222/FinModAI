# Company-Specific Financial Assumptions Engine

A data-driven financial assumptions engine that fetches historical data and forward estimates from multiple providers to produce realistic, company-specific model assumptions for DCF, LBO, and Three-Statement models.

## Features

- **Multiple Data Sources**: Fetches data from Yahoo Finance, Alpha Vantage, Financial Modeling Prep, and Google Finance
- **Fallback Mechanism**: Tries multiple providers in priority order with graceful degradation
- **Comprehensive Calculations**:
  - Revenue Growth Path: Based on historical CAGR and analyst estimates with a fade to steady-state
  - Margins: Derived from historical trends with reasonable drift limits
  - Capital Structure: Uses actual market D/E ratios for WACC calculation
  - WACC: Calculated using CAPM with real beta, risk-free rate, and ERP
  - Terminal Value: Industry-specific growth rates and exit multiples
- **Data Provenance**: Tracks the source and timestamp for each data point
- **Sanity Checks**: Built-in quality checks for unreasonable assumptions
- **Error Handling**: Explicit error messages for insufficient data

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/financial-assumptions-engine.git
cd financial-assumptions-engine

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys
```

## Usage

```python
from financial_data import build_company_assumptions

# Generate assumptions for a company
assumptions = build_company_assumptions("MSFT")

# Check for errors
if "error" in assumptions:
    print(f"Error: {assumptions['message']}")
    print(f"Provider attempts: {assumptions['provider_attempts']}")
else:
    # Access assumptions
    print(f"Ticker: {assumptions['ticker']}")
    print(f"Company: {assumptions['company_name']}")
    print(f"Revenue Growth Y1: {assumptions['assumptions']['revenue_growth'][0]:.1%}")
    print(f"Operating Margin Y1: {assumptions['assumptions']['operating_margin'][0]:.1%}")
    print(f"WACC: {assumptions['wacc']['wacc']:.2%}")
    print(f"Terminal Growth: {assumptions['terminal']['g']:.2%}")
```

### Example Output

```
Ticker: MSFT
Company: Microsoft Corporation
Revenue Growth Y1: 10.0%
Operating Margin Y1: 41.0%
WACC: 9.00%
Terminal Growth: 3.50%
```

## Data Providers

The engine uses the following data providers in priority order:

1. **Yahoo Finance** (`yfinance`): Comprehensive financial data
2. **Alpha Vantage**: Alternative source for financial statements and market data
3. **Financial Modeling Prep (FMP)**: Additional source for financial data
4. **Google Finance** (via Google Sheets): Fallback for market data and prices

## Configuration

Configuration constants are defined in `financial_data/config.py`. You can modify these to adjust the behavior of the engine.

API keys are loaded from environment variables:

- `ALPHAVANTAGE_API_KEY`: Alpha Vantage API key
- `FMP_API_KEY`: Financial Modeling Prep API key
- `GOOGLE_SHEETS_CREDENTIALS`: Google Sheets credentials (JSON)
- `GOOGLE_SHEETS_SPREADSHEET_ID`: Google Sheets spreadsheet ID

## Running Tests

```bash
python -m unittest discover tests
```

## Project Structure

```
financial_data/
├── __init__.py
├── config.py
├── engine.py
├── assumptions_builder.py
├── data_merger.py
├── providers/
│   ├── __init__.py
│   ├── base.py
│   ├── yahoo_provider.py
│   ├── alpha_vantage_provider.py
│   ├── fmp_provider.py
│   └── google_sheets_provider.py
tests/
├── __init__.py
├── test_financial_data.py
└── fixtures/
    ├── complete_financial_data.json
    ├── partial_financial_data.json
    └── missing_financial_data.json
```

## License

MIT
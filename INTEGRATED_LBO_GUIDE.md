# Integrated LBO Model - Complete Guide

## 🎯 Overview

The integrated LBO model (`goos_lbo_integrated.py`) is now fully connected to your existing data infrastructure. It pulls real data from:

- ✅ **SEC EDGAR** - Historical financials (10-K, 10-Q)
- ✅ **Alpha Vantage** - Market data, quotes, time series
- ✅ **Finnhub** - Real-time quotes
- ✅ **Polygon.io** - Comprehensive market data

## 🚀 How to Use

### Basic Usage

```python
from goos_lbo_integrated import generate_goos_lbo_model_integrated, print_integrated_goos_lbo_summary

# Generate LBO model for any ticker
model = generate_goos_lbo_model_integrated('AAPL')

# Print formatted summary
print_integrated_goos_lbo_summary('AAPL')
```

### Command Line

```bash
# Test with AAPL (has real data in SEC EDGAR)
python -c "from goos_lbo_integrated import print_integrated_goos_lbo_summary; print_integrated_goos_lbo_summary('AAPL')"

# Test with any ticker
python -c "from goos_lbo_integrated import print_integrated_goos_lbo_summary; print_integrated_goos_lbo_summary('MSFT')"
```

## 📊 What Data It Pulls

### 1. Real Market Data
- Current stock price
- Market capitalization
- Shares outstanding
- Enterprise value
- Real-time quotes

### 2. Historical Financials (from SEC EDGAR)
- Revenue (3-5 years)
- EBIT (3-5 years)
- EBITDA (3-5 years)
- Free Cash Flow (3-5 years)
- CapEx (3-5 years)

### 3. Balance Sheet Data
- Cash and cash equivalents
- Gross debt
- Net debt
- Working capital

### 4. Valuation Metrics
- EV/Revenue
- EV/EBITDA
- P/E ratio
- Debt/EBITDA
- Interest coverage

## 🔄 Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    User Requests LBO Model                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              goos_lbo_integrated.py                          │
│                                                              │
│  generate_goos_lbo_model_integrated(ticker)                 │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              minimal_app.py                                  │
│                                                              │
│  get_company_data(ticker)                                    │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ├─────────────────┬───────────────┐
                            ▼                 ▼               ▼
                ┌──────────────┐   ┌──────────────┐  ┌──────────────┐
                │  SEC EDGAR   │   │Alpha Vantage │  │   Finnhub    │
                │              │   │              │  │              │
                │ • 10-K       │   │ • Quotes     │  │ • Quotes     │
                │ • 10-Q       │   │ • Time Series│  │ • Real-time  │
                │ • Financials │   │ • Historical │  │ • Market Data│
                └──────────────┘   └──────────────┘  └──────────────┘
                            │                 │               │
                            └─────────────────┴───────────────┘
                            │
                            ▼
                ┌──────────────────────────────┐
                │   Company Data Dictionary     │
                │                               │
                │ • Market Data                 │
                │ • Historical Financials       │
                │ • Balance Sheet               │
                │ • Capital Structure           │
                └───────────────┬───────────────┘
                                │
                                ▼
                ┌──────────────────────────────┐
                │   LBO Model Generation        │
                │                               │
                │ • Transaction Structure       │
                │ • Financial Projections       │
                │ • Debt Schedule               │
                │ • Cash Flow Waterfall         │
                │ • Exit Analysis               │
                │ • Returns Analysis            │
                │ • Sensitivity Analysis        │
                │ • Risk Assessment             │
                └───────────────┬───────────────┘
                                │
                                ▼
                ┌──────────────────────────────┐
                │   Comprehensive LBO Model     │
                │   (JSON Output)               │
                └──────────────────────────────┘
```

## 📈 Model Outputs

### 1. Transaction Summary
- Transaction size
- Purchase price
- Transaction fees
- Sources and uses of funds

### 2. Capital Structure
- Senior debt (Term Loan B + Revolver)
- Subordinated debt (Mezzanine)
- Sponsor equity
- Management rollover
- Leverage ratios

### 3. Financial Projections (5 Years)
- Revenue growth (CAGR)
- EBITDA growth (CAGR)
- FCF growth (CAGR)
- Margin expansion

### 4. Debt Schedule
- Principal amortization
- Interest expense
- Debt service coverage

### 5. Cash Flow Waterfall
- Operating cash flow
- Financing cash flow
- Debt drawdown
- Equity contribution

### 6. Exit Analysis
- Base case (10.0x EBITDA)
- Upside case (12.0x EBITDA)
- Downside case (8.0x EBITDA)
- IRR and MOIC for each scenario

### 7. Returns Analysis
- Sponsor IRR
- Sponsor MOIC
- Payback period
- Equity value at exit

### 8. Sensitivity Analysis
- IRR sensitivity matrix
- Key value drivers
- Scenario analysis

### 9. Risk Assessment
- Operational risks
- Financial risks
- Mitigation strategies

## 🎨 Example Output

```python
from goos_lbo_integrated import print_integrated_goos_lbo_summary

# Generate for AAPL
print_integrated_goos_lbo_summary('AAPL')
```

**Output:**
```
======================================================================
APPLE INC. (AAPL) - INTEGRATED LBO MODEL
======================================================================

📊 DATA SOURCES
----------------------------------------------------------------------
  ✅ SEC EDGAR
  ✅ Alpha Vantage
  ✅ Finnhub
  ✅ Polygon.io

📊 TRANSACTION SUMMARY
----------------------------------------------------------------------
Target: Apple Inc.
Ticker: AAPL
Transaction Date: 2025-10-19
Transaction Size: $3850.00B
Market Cap: $3850.00B
Current Price: $249.75

💰 CAPITAL STRUCTURE
----------------------------------------------------------------------
Total Debt: $3080.00B
  - Senior Debt: $2156.00B
  - Subordinated Debt: $924.00B
Sponsor Equity: $616.00B
Management Rollover: $154.00B
Total Equity: $770.00B
Debt/EBITDA: 25.0x
Debt/Equity: 4.0x
Interest Coverage: 0.5x

📈 FINANCIAL PROJECTIONS (5 Years)
----------------------------------------------------------------------
Revenue CAGR: -0.9%
EBITDA CAGR: 0.0%
FCF CAGR: 0.0%

Year 1 EBITDA: $123136M
Year 5 EBITDA: $123136M
Year 1 EBITDA Margin: 32.4%
Year 5 EBITDA Margin: 33.7%

🚪 EXIT ANALYSIS (Year 5)
----------------------------------------------------------------------

Base Case:
  EBITDA: $247670M
  Exit Multiple: 10.0x
  Enterprise Value: $2476.70B
  Sponsor Equity Value: $2033M
  IRR: 13.9%
  MOIC: 1.9x

Upside Case:
  EBITDA: $297205M
  Exit Multiple: 12.0x
  Enterprise Value: $3566.45B
  Sponsor Equity Value: $176393M
  IRR: 24.6%
  MOIC: 3.0x

Downside Case:
  EBITDA: $210520M
  Exit Multiple: 8.0x
  Enterprise Value: $1684.16B
  Sponsor Equity Value: $-124775M
  IRR: 1.7%
  MOIC: 1.1x

⚠️ KEY RISKS
----------------------------------------------------------------------
Operational Risks:
  • Market Competition: High - Intense competition in consumer discretionary sector
  • Economic Sensitivity: High - Consumer spending sensitive to economic cycles

Financial Risks:
  • Interest Rate Risk: High - High leverage increases interest rate sensitivity
  • Refinancing Risk: Medium - Need to refinance debt in 7 years

💡 KEY OPPORTUNITIES
----------------------------------------------------------------------
  • Market expansion
  • Product diversification
  • Digital growth
  • Operating leverage
======================================================================
✅ INTEGRATED LBO MODEL COMPLETE
======================================================================
```

## 🔧 Configuration

### Environment Variables

Make sure you have these API keys set in your `.env` file:

```bash
# Alpha Vantage
ALPHAVANTAGE_API_KEY=your_key_here

# Finnhub
FINNHUB_API_KEY=your_key_here

# Polygon.io
POLYGON_API_KEY=your_key_here

# Anthropic (for AI features - requires Python 3.10+)
ANTHROPIC_API_KEY=your_key_here
```

### SEC EDGAR Data

The SEC EDGAR provider loads data from `financial_data/sec_edgar_data.parquet`. Currently includes 97 companies with 1,455 records.

## 📝 JSON Output

The model is also saved as JSON:

```python
from goos_lbo_integrated import generate_goos_lbo_model_integrated
import json

model = generate_goos_lbo_model_integrated('AAPL')

# Save to file
with open('lbo_model.json', 'w') as f:
    json.dump(model, f, indent=2)

# Access specific data
print(f"Transaction Size: ${model['lbo_structure']['transaction_summary']['enterprise_value']/1e9:.2f}B")
print(f"Base Case IRR: {model['exit_analysis']['scenarios']['base_case']['irr']:.1f}%")
print(f"Upside Case MOIC: {model['exit_analysis']['scenarios']['upside_case']['moic']:.1f}x")
```

## 🎯 Use Cases

### 1. Investment Analysis
- Evaluate potential LBO targets
- Assess leverage capacity
- Model returns under different scenarios

### 2. Due Diligence
- Understand capital structure
- Analyze cash flow generation
- Assess risk factors

### 3. Portfolio Management
- Compare LBO opportunities
- Monitor portfolio companies
- Track performance vs. projections

### 4. Financial Modeling
- Build custom LBO models
- Stress test assumptions
- Optimize capital structure

## 🔄 Integration with Your App

### Flask API Endpoint

Add this to your `minimal_app.py`:

```python
@app.route('/api/v1/lbo-model/<ticker>', methods=['GET'])
def get_lbo_model(ticker):
    """Get integrated LBO model for a ticker."""
    try:
        from goos_lbo_integrated import generate_goos_lbo_model_integrated
        
        model = generate_goos_lbo_model_integrated(ticker)
        
        if not model:
            return jsonify({'error': f'Could not generate LBO model for {ticker}'}), 404
        
        return jsonify(model), 200
        
    except Exception as e:
        print(f"Error generating LBO model for {ticker}: {e}")
        return jsonify({'error': str(e)}), 500
```

### Frontend Integration

```javascript
// In your React app
const generateLBOModel = async (ticker) => {
  try {
    const response = await axios.get(`/api/v1/lbo-model/${ticker}`);
    const model = response.data;
    
    console.log('Transaction Size:', model.lbo_structure.transaction_summary.enterprise_value);
    console.log('Base Case IRR:', model.exit_analysis.scenarios.base_case.irr);
    console.log('Upside Case MOIC:', model.exit_analysis.scenarios.upside_case.moic);
    
    return model;
  } catch (error) {
    console.error('Error generating LBO model:', error);
    throw error;
  }
};
```

## 🚨 Limitations & Considerations

### 1. Data Availability
- **SEC EDGAR**: Only U.S. companies, quarterly/annual filings
- **Alpha Vantage**: Rate-limited (5 calls/min, 500/day free tier)
- **Finnhub**: Rate-limited (60 calls/min free tier)
- **Polygon.io**: Requires paid plan for real-time data

### 2. Canadian Companies
- GOOS (Canada Goose) is a Canadian company
- Not in SEC EDGAR database
- Need to use Alpha Vantage/Finnhub for market data
- May need manual financial data entry

### 3. Data Quality
- Historical data depends on SEC EDGAR completeness
- Market data depends on API availability
- Estimates used when real data unavailable

### 4. Assumptions
- LBO structure assumptions (debt/equity split)
- Growth projections based on historical trends
- Exit multiples based on sector averages
- Interest rates based on current market conditions

## 🎓 Next Steps

### 1. Enhance Data Sources
- Add more international exchanges
- Integrate Bloomberg/Capital IQ
- Add ESG data
- Include management guidance

### 2. Improve Projections
- Use AI for growth forecasting
- Incorporate management guidance
- Add scenario modeling
- Include sensitivity analysis

### 3. Add AI Features (Requires Python 3.10+)
- AI-enhanced data gathering
- Intelligent gap filling
- Peer comparison analysis
- Model interpretation

### 4. UI Integration
- Add LBO model builder to web app
- Create interactive charts
- Enable custom assumptions
- Export to Excel/PDF

## 📚 Related Files

- `goos_lbo_integrated.py` - Main LBO model generator
- `goos_lbo_model_integrated.json` - JSON output
- `minimal_app.py` - Data fetching infrastructure
- `sec_edgar_provider.py` - SEC EDGAR data provider
- `financial_data/assumptions_builder.py` - Financial assumptions
- `financial_data/contracts.py` - Data contracts
- `financial_data/engine.py` - Financial modeling engine

## 🤝 Contributing

To add new features:

1. **Add new data sources**: Update `minimal_app.py` with new API integrations
2. **Enhance projections**: Modify `_calculate_projections()` in `goos_lbo_integrated.py`
3. **Add new metrics**: Extend the model output dictionary
4. **Improve UI**: Update `templates/professional_ui.html`

## 📞 Support

For questions or issues:
- Check the logs for API errors
- Verify API keys are set correctly
- Test with AAPL first (has complete data)
- Check SEC EDGAR data availability

---

**Built with ❤️ for FinModAI**


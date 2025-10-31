# Financial Models Documentation

## Overview

This document describes the financial modeling framework, focusing on LBO (Leveraged Buyout) analysis. The framework is designed to be accurate, validated, and production-ready.

## Components

### 1. Data Validation (`lbo_validator.py`)

The validation framework ensures all inputs are realistic and consistent:

```python
from backend.models_data.lbo_validator import CompanyMetrics, MarketConditions

# Create validated company metrics
company = CompanyMetrics(
    ticker="GOOS",
    revenue_ltm=1428.0e6,   # $1.428B
    ebitda_ltm=106.8e6,     # $106.8M
    total_debt=374.8e6,     # $374.8M
    cash=287.7e6,           # $287.7M
    market_cap=1350.0e6,    # $1.35B
    current_price=13.54,
    shares_outstanding=104.83e6
)

# Create market conditions
market = MarketConditions(
    risk_free_rate=0.0525,  # 5.25%
    market_risk_premium=0.06,
    high_yield_spread=0.05,
    leverage_loan_spread=0.0425,
    typical_leverage=4.5,
    typical_equity_portion=0.45
)
```

### 2. Data Providers (`lbo_data_provider.py`)

Multi-source data fetching with fallbacks:

```python
from backend.models_data.lbo_data_provider import LBODataProvider

# Initialize provider
provider = LBODataProvider(
    polygon_key="your_polygon_key",
    alpha_vantage_key="your_av_key",
    finnhub_key="your_finnhub_key"
)

# Fetch company data
company = await provider.get_company_metrics("GOOS")
```

### 3. Enhanced LBO Model (`lbo_model.py`)

Production-grade LBO analysis:

```python
from backend.models_data.lbo_model import LBOModelInputs, EnhancedLBOModel

# Create model inputs
inputs = LBOModelInputs(
    company=company,
    market=market,
    purchase_multiple=9.0,
    revenue_growth=0.06,
    ebitda_margin=0.115,
    exit_multiple=8.5
)

# Run model
model = EnhancedLBOModel(inputs)
results = model.run_model()
```

## Validation Rules

### Company Metrics
- Revenue must be positive
- EBITDA must be positive
- Market cap must match price × shares
- EBITDA margin must be realistic (0-50%)
- Debt and cash must be non-negative

### Market Conditions
- Risk-free rate: 0-15%
- Market risk premium: 4-12%
- Spreads: 2-15%
- Typical leverage: 3-7x
- Equity portion: 30-70%

### Model Assumptions
- Purchase multiple vs. current trading
- Growth vs. historical/industry
- Margins vs. peer group
- Leverage and coverage ratios

## Data Sources

### Primary Sources
1. **Polygon.io**
   - Financial statements
   - Real-time quotes
   - Company metrics
   - Rate limit: 30/min, 5000/day

2. **Alpha Vantage**
   - Historical data
   - Company overviews
   - Rate limit: 5/min, 500/day

3. **Finnhub**
   - Real-time data
   - Peer groups
   - Rate limit: 30/min, 60000/day

### Fallback Logic
1. Try Polygon.io first
2. Fallback to Alpha Vantage
3. Use Finnhub as last resort
4. Use cached data if all fail

## Model Outputs

### 1. Purchase Price
- Enterprise value
- Sources and uses
- Fee assumptions

### 2. Projections
- Income statement
- Cash flow
- Working capital

### 3. Debt Schedule
- Term loan amortization
- Revolver usage
- Interest calculations

### 4. Returns
- Exit value
- Equity multiple
- IRR
- Leverage metrics

### 5. Sensitivity Analysis
- Exit multiple
- EBITDA margin
- Revenue growth

## Error Handling

### Data Validation Errors
```python
try:
    company = CompanyMetrics(...)
except ValueError as e:
    logger.error(f"Invalid metrics: {e}")
```

### API Errors
```python
try:
    data = await provider.get_company_metrics(ticker)
except DataProviderError as e:
    logger.error(f"Data fetch failed: {e}")
```

### Model Errors
```python
try:
    results = model.run_model()
except ValueError as e:
    logger.error(f"Model error: {e}")
```

## Testing

### Unit Tests
```bash
pytest backend/tests/test_lbo_model.py -v
```

### Integration Tests
```bash
pytest backend/tests/test_integration.py -v
```

### Coverage
```bash
pytest --cov=backend/models_data
```

## CI/CD Integration

### GitHub Actions
```yaml
name: Model Validation
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: pytest
```

## Best Practices

1. **Data Validation**
   - Always validate inputs
   - Check for realistic ranges
   - Compare to industry metrics

2. **Error Handling**
   - Use specific exceptions
   - Provide clear error messages
   - Log all failures

3. **Performance**
   - Cache API responses
   - Use async where possible
   - Monitor rate limits

4. **Testing**
   - Write comprehensive tests
   - Include edge cases
   - Maintain high coverage

5. **Documentation**
   - Document assumptions
   - Explain calculations
   - Provide examples

## Example Usage

```python
async def run_lbo_analysis(ticker: str):
    # Initialize providers
    provider = LBODataProvider(...)
    
    try:
        # Fetch company data
        company = await provider.get_company_metrics(ticker)
        
        # Get market conditions
        market = MarketConditions(...)
        
        # Create model inputs
        inputs = LBOModelInputs(
            company=company,
            market=market,
            purchase_multiple=9.0,
            revenue_growth=0.06,
            ebitda_margin=0.115,
            exit_multiple=8.5
        )
        
        # Run model
        model = EnhancedLBOModel(inputs)
        results = model.run_model()
        
        # Print results
        print(f"IRR: {results['returns']['irr']:.1%}")
        print(f"Multiple: {results['returns']['equity_multiple']:.2f}x")
        
    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        
    finally:
        await provider.close()
```

## Troubleshooting

### Common Issues

1. **Invalid Data**
   - Check API responses
   - Verify calculation inputs
   - Validate assumptions

2. **Rate Limits**
   - Monitor API usage
   - Implement backoff
   - Use caching

3. **Performance**
   - Profile slow operations
   - Optimize calculations
   - Cache results

### Debug Tools

1. **Logging**
   ```python
   logging.basicConfig(level=logging.DEBUG)
   ```

2. **API Stats**
   ```python
   stats = provider.get_usage_stats()
   ```

3. **Model Validation**
   ```python
   is_valid, messages, suggestions = validate_lbo_model(...)
   ```

# FinMath - Production Finance Mathematics Library

A pure-function library for financial modeling, valuation, and analysis.

## Features

- **Pure Functions**: No side effects, deterministic, testable
- **Unit-Aware**: Consistent scaling (e.g., millions in, millions out)
- **Vectorized**: NumPy-powered for performance
- **Well-Tested**: 36+ unit and integration tests
- **Formula Registry**: Introspection for UI builders

## Installation

```bash
pip install -e .
```

## Quick Start

```python
from finmath import npv, irr, wacc, enterprise_value, cagr

# DCF Valuation
cash_flows = [-1000, 200, 250, 300, 350, 400]
discount_rate = 0.10

pv = npv(discount_rate, cash_flows)
deal_irr = irr(cash_flows)

# WACC Calculation
wacc_rate = wacc(
    ke=0.12,  # Cost of equity
    kd_after_tax=0.045,  # After-tax cost of debt
    we=0.7,  # Weight of equity
    wd=0.3   # Weight of debt
)

# Returns Analysis
begin_value = 1000
end_value = 2500
years = 5
growth = cagr(begin_value, end_value, years)  # ~20.11%
```

## Formula Reference

### Time Value Functions (`finmath.timevalue`)

| Function | Description | Example |
|----------|-------------|---------|
| `npv(rate, cash_flows)` | Net Present Value | `npv(0.10, [-100, 50, 60])` |
| `irr(cash_flows)` | Internal Rate of Return | `irr([-100, 40, 40, 40])` |
| `xirr(cash_flows, dates)` | IRR for irregular dates | `xirr(cfs, [date(...), ...])` |
| `mirr(cfs, fin_rate, reinv_rate)` | Modified IRR | `mirr([-100, 50, 60], 0.10, 0.12)` |
| `pv_annuity(pmt, rate, periods)` | PV of annuity | `pv_annuity(100, 0.10, 5)` |
| `fv_annuity(pmt, rate, periods)` | FV of annuity | `fv_annuity(100, 0.10, 5)` |

### Valuation Functions (`finmath.valuation`)

| Function | Description | Example |
|----------|-------------|---------|
| `perpetuity_pv(cf, r, g)` | Gordon Growth Model | `perpetuity_pv(100, 0.10, 0.02)` |
| `tv_perpetuity(ufcf, wacc, g)` | Terminal value (perpetuity) | `tv_perpetuity(200, 0.10, 0.02)` |
| `tv_exit_multiple(metric, mult)` | Terminal value (multiple) | `tv_exit_multiple(150, 10.0)` |
| `enterprise_value(pv_exp, pv_tv)` | EV from DCF components | `enterprise_value(500, 2000)` |
| `equity_value(ev, net_debt)` | Equity from EV bridge | `equity_value(2500, 500)` |
| `ev_to_ebitda(ev, ebitda)` | EV/EBITDA multiple | `ev_to_ebitda(2500, 250)` |
| `p_to_e(price, eps)` | P/E ratio | `p_to_e(50, 2.5)` |

### Returns & Growth (`finmath.returns`)

| Function | Description | Example |
|----------|-------------|---------|
| `cagr(begin, end, years)` | Compound annual growth | `cagr(100, 150, 3)` |
| `moic(distributions, invested)` | Multiple on invested capital | `moic(2500, 1000)` |
| `payback_period(cash_flows)` | Payback in years | `payback_period([-100, 30, 40, 50])` |
| `dpi(distributions, invested)` | Distributions to paid-in | `dpi(500, 1000)` |
| `tvpi(dist, resid, inv)` | Total value to paid-in | `tvpi(500, 1500, 1000)` |

### WACC & Cost of Capital (`finmath.wacc`)

| Function | Description | Example |
|----------|-------------|---------|
| `cost_of_equity_capm(rf, beta, erp)` | CAPM cost of equity | `cost_of_equity_capm(0.03, 1.2, 0.06)` |
| `after_tax_cost_of_debt(kd, tax)` | After-tax Kd | `after_tax_cost_of_debt(0.06, 0.25)` |
| `weights_from_de(equity, debt)` | Capital structure weights | `weights_from_de(800, 200)` |
| `wacc(ke, kd, we, wd)` | Weighted avg cost of capital | `wacc(0.12, 0.045, 0.7, 0.3)` |
| `unlevered_beta(bl, tax, de)` | Unlever equity beta | `unlevered_beta(1.2, 0.25, 0.5)` |
| `levered_beta(bu, tax, de)` | Lever asset beta | `levered_beta(1.0, 0.25, 0.5)` |

### Operating FCF (`finmath.ops_wc`)

| Function | Description | Example |
|----------|-------------|---------|
| `operating_nwc(ca, cl, cash, std)` | Operating NWC | `operating_nwc(500, 300, 100, 50)` |
| `delta_nwc(nwc_t, nwc_t1)` | Change in NWC | `delta_nwc(150, 100)` |
| `ufcf(ebit, tax, da, capex, dnwc)` | Unlevered free cash flow | `ufcf(1000, 0.25, 100, 150, 50)` |
| `nopat(ebit, tax_rate)` | Net operating profit after tax | `nopat(1000, 0.25)` |
| `roic(nopat, invested_capital)` | Return on invested capital | `roic(750, 4000)` |

### Debt Functions (`finmath.debt`)

| Function | Description | Example |
|----------|-------------|---------|
| `amortize(principal, rate, years)` | Amortization schedule | `amortize(1000, 0.06, 3)` |
| `interest_expense(bal, rate)` | Interest expense | `interest_expense(1000, 0.06)` |
| `pik_interest(balance, pik_rate)` | PIK interest | `pik_interest(1000, 0.12)` |
| `revolver_sweep(fcf, rev_bal)` | Cash sweep to revolver | `revolver_sweep(100, 300)` |
| `net_debt_to_ebitda(debt, cash, ebitda)` | Leverage ratio | `net_debt_to_ebitda(1000, 200, 250)` |
| `interest_coverage(ebitda, interest)` | Coverage ratio | `interest_coverage(300, 50)` |

### Equity & Dilution (`finmath.equity`)

| Function | Description | Example |
|----------|-------------|---------|
| `treasury_stock_method(opts, strike, price)` | TSM for options | `treasury_stock_method(100, 10, 20)` |
| `diluted_eps(ni, shares_diluted)` | Diluted EPS | `diluted_eps(1000, 500)` |
| `basic_eps(ni, shares_basic)` | Basic EPS | `basic_eps(1000, 500)` |
| `payout_ratio(divs, ni)` | Dividend payout % | `payout_ratio(300, 1000)` |

### Statistics (`finmath.stats`)

| Function | Description | Example |
|----------|-------------|---------|
| `beta_ols(asset_ret, mkt_ret)` | OLS beta regression | `beta_ols(stock_returns, sp500_returns)` |
| `winsorize_array(data, limits)` | Winsorize outliers | `winsorize_array(data, (0.01, 0.99))` |
| `sharpe_ratio(returns, rf)` | Sharpe ratio | `sharpe_ratio(returns, 0.02)` |
| `max_drawdown(cum_returns)` | Maximum drawdown | `max_drawdown(cum_returns)` |
| `var_historical(returns, conf)` | Value at Risk | `var_historical(returns, 0.95)` |

## Error Handling

All functions raise typed exceptions:

- `InvalidInputError`: Invalid parameters (e.g., negative values, out of range)
- `NoSignChangeError`: IRR/XIRR requires cash flow sign changes
- `NonConvergenceError`: Iterative method failed to converge

```python
from finmath import irr, NoSignChangeError

try:
    result = irr([100, 200, 300])  # All positive
except NoSignChangeError as e:
    print(f"Error: {e}")
```

## Formula Registry

Introspect all formulas programmatically:

```python
from finmath import list_formulas, describe, get_formulas_by_category

# List all formulas
all_formulas = list_formulas()

# Get formulas by category
timevalue_formulas = list_formulas(category='timevalue')

# Get formula metadata
meta = describe('npv')
print(meta['signature'])  # (rate: float, cash_flows: CashFlows) -> float
print(meta['docstring'])  # Full documentation

# Group by category
by_category = get_formulas_by_category()
# {'timevalue': ['npv', 'irr', ...], 'valuation': [...], ...}
```

## Unit Conventions

- **Rates**: Decimal format (0.10 = 10%)
- **Currency**: Use consistent units (e.g., all in millions)
- **Time**: Years (use fractions for partial years)
- **Returns**: Functions return same scale as inputs

## Testing

Run comprehensive test suite:

```bash
pytest tests/ -v
```

All tests pass (36/36) with real-world scenarios including:
- DCF valuation workflows
- LBO return calculations
- WACC from components
- FCF from financial statements
- Dilution analysis

## Integration Example

Complete DCF model:

```python
from finmath import (
    cost_of_equity_capm, after_tax_cost_of_debt, weights_from_de, wacc,
    ufcf, operating_nwc, delta_nwc, nopat,
    npv, perpetuity_pv, enterprise_value, equity_value
)

# 1. Calculate WACC
ke = cost_of_equity_capm(rf=0.03, beta=1.2, erp=0.06)
kd = after_tax_cost_of_debt(0.06, 0.25)
we, wd = weights_from_de(equity_value=2000, net_debt=500)
wacc_rate = wacc(ke, kd, we, wd)

# 2. Project FCF
years = range(1, 6)
fcf_list = []
for year in years:
    ebit = 1000 * (1.05 ** year)  # 5% growth
    fcf = ufcf(ebit, tax_rate=0.25, d_and_a=100, capex=150, delta_nwc=20)
    fcf_list.append(fcf)

# 3. Calculate terminal value
terminal_fcf = fcf_list[-1] * 1.02
tv = perpetuity_pv(terminal_fcf, wacc_rate, g=0.02)

# 4. DCF valuation
pv_fcf = npv(wacc_rate, [0] + fcf_list)
pv_tv = tv / (1 + wacc_rate) ** len(fcf_list)
ev = enterprise_value(pv_fcf, pv_tv)
equity_val = equity_value(ev, net_debt=500)

print(f"Equity Value: ${equity_val:,.0f}M")
```

## License

MIT

## Authors

Built for FinModAI - Production financial modeling platform


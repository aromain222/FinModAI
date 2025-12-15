# Manual DCF Verification

## MSFT Example (All values in millions)

### Assumptions
- Revenue Year 1: **211,000** ($211B)
- EBIT Margin: **42%** (0.42)
- Tax Rate: **21%** (0.21)
- D&A % Revenue: **3%** (0.03)
- ΔWC % Revenue: **2%** (0.02)
- Capex % Revenue: **6%** (0.06)
- WACC: **10%** (0.10)
- Terminal Growth: **2.5%** (0.025)
- Net Debt: **50,000** ($50B)
- Shares Outstanding: **7,430** (7.43B shares)

### Year 1 Calculations

#### 1. EBIT
```
EBIT = Revenue × EBIT Margin
     = 211,000 × 0.42
     = 88,620 million
```

#### 2. Taxes
```
Taxes = -EBIT × Tax Rate
      = -88,620 × 0.21
      = -18,610 million (negative = cash outflow)
```

#### 3. NOPAT (Net Operating Profit After Tax)
```
NOPAT = EBIT + Taxes
      = 88,620 + (-18,610)
      = 70,010 million
```

#### 4. D&A (Depreciation & Amortization)
```
D&A = Revenue × D&A %
    = 211,000 × 0.03
    = 6,330 million (positive = non-cash add-back)
```

#### 5. ΔWC (Change in Working Capital)
```
ΔWC = -Revenue × ΔWC %
    = -211,000 × 0.02
    = -4,220 million (negative = investment)
```

#### 6. Capex (Capital Expenditures)
```
Capex = -Revenue × Capex %
      = -211,000 × 0.06
      = -12,660 million (negative = cash outflow)
```

#### 7. UFCF (Unlevered Free Cash Flow)
```
UFCF = NOPAT + D&A + ΔWC + Capex
     = 70,010 + 6,330 + (-4,220) + (-12,660)
     = 59,460 million
```

### Multi-Year Projection (Simplified)

Assuming revenue grows to 225,000, 240,000, 255,000, 270,000, 285,000 over years 2-6:

| Year | Revenue | EBIT   | NOPAT  | D&A   | ΔWC    | Capex   | UFCF   |
|------|---------|--------|--------|-------|--------|---------|--------|
| 1    | 211,000 | 88,620 | 70,010 | 6,330 | -4,220 | -12,660 | 59,460 |
| 2    | 225,000 | 94,500 | 74,655 | 6,750 | -4,500 | -13,500 | 63,405 |
| 3    | 240,000 | 100,800| 79,632 | 7,200 | -4,800 | -14,400 | 67,632 |
| 4    | 255,000 | 107,100| 84,609 | 7,650 | -5,100 | -15,300 | 71,859 |
| 5    | 270,000 | 113,400| 89,586 | 8,100 | -5,400 | -16,200 | 76,086 |
| 6    | 285,000 | 119,700| 94,563 | 8,550 | -5,700 | -17,100 | 80,313 |

### Discounting

| Year | UFCF   | Discount Factor | PV of UFCF |
|------|--------|-----------------|------------|
| 1    | 59,460 | 1/(1.10)¹ = 0.909 | 54,055   |
| 2    | 63,405 | 1/(1.10)² = 0.826 | 52,373   |
| 3    | 67,632 | 1/(1.10)³ = 0.751 | 50,792   |
| 4    | 71,859 | 1/(1.10)⁴ = 0.683 | 49,080   |
| 5    | 76,086 | 1/(1.10)⁵ = 0.621 | 47,249   |
| 6    | 80,313 | 1/(1.10)⁶ = 0.564 | 45,297   |

**PV of Explicit FCF = 298,846 million (~$299B)**

### Terminal Value

```
Terminal Value = Last UFCF × (1 + g) / (WACC - g)
               = 80,313 × (1 + 0.025) / (0.10 - 0.025)
               = 80,313 × 1.025 / 0.075
               = 82,321 / 0.075
               = 1,097,613 million (~$1.1T)
```

```
PV of Terminal Value = Terminal Value × Discount Factor₆
                     = 1,097,613 × 0.564
                     = 619,054 million (~$619B)
```

### Enterprise Value

```
Enterprise Value = PV of Explicit FCF + PV of Terminal Value
                 = 298,846 + 619,054
                 = 917,900 million (~$918B)
```

### Equity Value

```
Equity Value = Enterprise Value - Net Debt
             = 917,900 - 50,000
             = 867,900 million (~$868B)
```

### Price Per Share

```
Price Per Share = Equity Value / Shares Outstanding
                = 867,900 / 7,430
                = $116.83
```

## Sanity Checks

✅ **EBIT is positive**: 88,620 million
✅ **EBIT margin is correct**: 88,620 / 211,000 = 42% ✓
✅ **UFCF is positive**: 59,460 million
✅ **Enterprise Value is reasonable**: ~$918B (MSFT actual ~$3T, but depends on assumptions)
✅ **Price per share is reasonable**: $116.83 (actual MSFT ~$400, but depends on growth assumptions)

## Notes

1. **All calculations in millions**: Revenue of 211,000 means $211 billion
2. **No division by 1,000,000 in Excel**: Values are already in millions
3. **Excel formatting**: Use `$#,##0` to display as thousands (representing millions)
4. **Negative values**: Taxes, ΔWC, and Capex are negative (cash outflows)
5. **Positive add-backs**: D&A is positive (non-cash expense)

## Actual MSFT Comparison

Our simplified model gives ~$117/share. Actual MSFT trades at ~$400/share because:
- Higher revenue growth assumptions (we used conservative projections)
- Lower WACC (MSFT likely has lower cost of capital)
- Higher terminal growth rate
- Different margin assumptions
- Market includes intangible value (brand, ecosystem, etc.)

**The math is correct** - the difference is in assumptions, which is expected.

## Code Verification

Our TypeScript implementation in `lib/dcfGenerator.ts`:

```typescript
// Year 1 calculation
const rev = revenueByYear[0];                    // 211,000
const ebit = rev * ebitMargin;                   // 211,000 × 0.42 = 88,620
const taxes = -ebit * taxRate;                   // -88,620 × 0.21 = -18,610
const nopat = ebit + taxes;                      // 88,620 + (-18,610) = 70,010
const dAndA = rev * daPercentOfRevenue;          // 211,000 × 0.03 = 6,330
const deltaWC = -rev * changeInWCPercentOfRevenue; // -211,000 × 0.02 = -4,220
const capex = -rev * capexPercentOfRevenue;      // -211,000 × 0.06 = -12,660
const ufcf = nopat + dAndA + deltaWC + capex;    // 70,010 + 6,330 - 4,220 - 12,660 = 59,460
```

✅ **Math matches manual calculation exactly**


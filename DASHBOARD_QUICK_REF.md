# Dashboard Quick Reference

## URLs

**Landing Page**: http://localhost:5000/#/  
**With Model**: http://localhost:5000/#/dcf?ticker=AAPL

## Component Props

### MarketPulse
```javascript
{
  totalMktCap: number,           // 45300000000000 → $45.3T
  advDec: { advancers, decliners },
  topSector: { name, change1dPct },
  volProxy: { label, value },
  isLoading: boolean
}
```

### SectorCard
```javascript
{
  sector: string,                // "Technology"
  totalMktCap: number,           // 14200000000000
  leaders: CompanyLite[],        // 1-3 companies
  isLoading: boolean,
  onCompanyAction: (ticker, action) => void,
  onViewComps: () => void
}
```

### CompanyRow
```javascript
{
  company: {
    ticker: string,              // "AAPL"
    name: string,                // "Apple Inc."
    price: number,               // 178.72
    change1dPct: number,         // 1.23 or -0.34
    pe: number,                  // 29.5
    evToEbitda: number,          // 22.1
    sparkline: number[]          // [0.3, 0.35, 0.4, ...]
  },
  onAction: (ticker, action) => void
}
```

## Mock Data Updates

### Add New Sector
```javascript
MOCK_SECTOR_DATA['Energy'] = {
  sector: 'Energy',
  totalMktCap: 2500000000000,
  leaders: [
    { ticker: 'XOM', name: 'Exxon Mobil', price: 108.45, ... },
    { ticker: 'CVX', name: 'Chevron', price: 145.23, ... },
    { ticker: 'COP', name: 'ConocoPhillips', price: 112.87, ... }
  ]
};
```

### Update Market Pulse
```javascript
MOCK_MARKET_PULSE.totalMktCap = 46500000000000; // $46.5T
MOCK_MARKET_PULSE.topSector.name = 'Healthcare';
MOCK_MARKET_PULSE.topSector.change1dPct = 2.15;
```

## Styling Tokens

### Colors
```css
--bg-primary:    #0B0E11  /* body */
--bg-card:       #12161C  /* cards */
--bg-hover:      #1C2430  /* hover states */
--text-primary:  #E6EDF3  /* main text */
--text-secondary:#9FB0C3  /* labels */
--text-positive: #34D399  /* emerald-400 */
--text-negative: #F87171  /* rose-400 */
--text-neutral:  #7DD3FC  /* sky-300 */
--border:        #1C2430  /* borders */
```

### Shadows
```css
--shadow-card: 0 6px 24px rgba(0,0,0,0.25)
--shadow-menu: 0 6px 24px rgba(0,0,0,0.35)
```

### Focus Ring
```css
focus:outline-none focus:ring-2 focus:ring-sky-400/70
```

## Responsive Breakpoints

| Size | Width | Layout |
|------|-------|--------|
| Mobile | <768px | 1 column, chips scroll |
| Tablet | 768-1279px | 2 columns, inline launcher |
| Desktop | ≥1280px | 3 columns, sticky launcher |

## Test Locally

1. **Start server**:
   ```bash
   python minimal_app.py
   ```

2. **Open browser**:
   ```
   http://localhost:5000/#/
   ```

3. **Test flows**:
   - Click sector chips → filters cards
   - Click company row → opens menu
   - Click DCF → routes to /dcf?ticker=AAPL
   - Use Quick Start → routes with ticker

4. **Test responsive**:
   - Resize browser width
   - Verify 3-col → 2-col → 1-col
   - Check sticky launcher on desktop
   - Verify chip scrolling on mobile

## Key Files

- `templates/professional_ui.html` - Main UI (1,549 lines)
- `DASHBOARD_LANDING_PAGE.md` - Full documentation
- `DASHBOARD_QUICK_REF.md` - This file

---

**Built for FinModAI** | October 2025

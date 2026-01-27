# Test Checklist: Report & Macro Upgrades

## Quick Start

```bash
cd /Users/averyromain/Scraper/finmodai-next
npm run dev
```

---

## PART 1: Report Testing

### Test Each Model Type

#### DCF Report
1. Navigate to `/models/create`
2. Create a DCF model for a ticker (e.g., AAPL, MSFT, NVDA)
3. Click "Download Report"
4. Open the PDF and verify:
   - [ ] **Assumptions Snapshot** section exists with WACC, terminal growth, revenue, shares
   - [ ] **Valuation Summary** section shows EV, equity value, implied PPS
   - [ ] **Sensitivity Analysis & Model Fragility** section quantifies WACC/terminal growth impact
   - [ ] **What Would Need to Be True** section reverse-engineers valuation
   - [ ] **Bull / Base / Bear Interpretation** section provides framework
   - [ ] **Sector Context & Comparables** section mentions industry (or "—" if missing)
   - [ ] **Limitations & Caveats** section is concise (3-4 sentences)
   - [ ] All sections have non-empty content
   - [ ] Report is analytical, not marketing fluff

#### LBO Report
1. Navigate to `/models/create`
2. Create an LBO model for a ticker
3. Click "Download Report"
4. Open the PDF and verify:
   - [ ] **Assumptions Snapshot** section shows entry/exit multiples, leverage
   - [ ] **Returns Summary** section shows IRR and MOIC
   - [ ] **Sources & Uses of Funds** section (if data available)
   - [ ] **Debt Paydown Profile & Coverage** section shows schedule
   - [ ] **Return Drivers & Sensitivity** section breaks down what drives IRR
   - [ ] **Risk Factors & Covenants** section identifies risks
   - [ ] **Sector Context & Exit Market** section mentions typical exit paths
   - [ ] **Limitations & Caveats** section is concise
   - [ ] All sections have non-empty content

#### Comps Report
1. Navigate to `/models/create`
2. Create a Comps model for a ticker
3. Click "Download Report"
4. Open the PDF and verify:
   - [ ] **Company Metrics Snapshot** section shows LTM financials
   - [ ] **Valuation Summary** section shows implied price range
   - [ ] **Peer Group Selection & Comparability** section explains peer selection
   - [ ] **Peer Multiple Analysis** section shows peer-by-peer comparison
   - [ ] **Rich or Cheap? The Comp Screen** section analyzes premium/discount
   - [ ] **Growth vs Margins vs Sector Norms** section compares to sector
   - [ ] **Multiple Sensitivity & Valuation Range** section shows 25th/75th percentile impact
   - [ ] **Sector Context & Market Positioning** section mentions sector multiples
   - [ ] **Limitations & Caveats** section is concise
   - [ ] All sections have non-empty content

#### Three-Statement Report
1. Navigate to `/models/create`
2. Create a Three-Statement model for a ticker
3. Click "Download Report"
4. Verify:
   - [ ] Report structure unchanged (already comprehensive)
   - [ ] All sections render correctly
   - [ ] Executive Summary is 2-3 sentences

---

## PART 2: Macro IQ Testing

### Navigate to Macro News Page
```
URL: /macro/news
```

### Accessibility Testing

#### Keyboard Navigation
1. Press `Tab` to navigate through elements
2. Verify:
   - [ ] Focus rings visible on all interactive elements
   - [ ] Time window buttons receive focus
   - [ ] Sentiment filter buttons receive focus
   - [ ] Refresh button receives focus
   - [ ] Article links receive focus

#### Sentiment Tab Keyboard Control
1. Tab to sentiment filter buttons
2. Press `Enter` or `Space` to activate
3. Verify:
   - [ ] Sentiment filter changes
   - [ ] Active state updates
   - [ ] Articles filter correctly

### UI Testing

#### Layout
- [ ] Two-column layout on desktop (articles left, sidebar right)
- [ ] Single column on mobile (stacks vertically)
- [ ] Max width is 7xl (wider than before)
- [ ] Sidebar is sticky on scroll

#### Filters
- [ ] Time window buttons show "Today", "1W", "1M"
- [ ] Active time window has primary background
- [ ] Sentiment buttons show "all", "bullish", "neutral", "bearish"
- [ ] Sentiment buttons show counts (e.g., "bullish (3)")
- [ ] Active sentiment has primary background
- [ ] Refresh button shows loading spinner when clicked

#### Article Display
- [ ] Articles render in cards
- [ ] Sentiment badges show correct color (green/red/gray)
- [ ] Sentiment badges show correct icon (↑/↓/—)
- [ ] Article titles are clickable links
- [ ] Links open in new tab
- [ ] Tags display below title
- [ ] AI Insight has blue left border
- [ ] Hover effect on cards (shadow)

### Article Rotation Testing

#### Same Day Test
1. Load the page
2. Note the order of articles
3. Refresh the page (Cmd+R or Ctrl+R)
4. Verify:
   - [ ] Articles appear in **same order** after refresh
   - [ ] No random reshuffling

#### Next Day Test (Mock)
1. Open browser dev tools
2. Mock the date to tomorrow (change system clock or modify code temporarily)
3. Reload the page
4. Verify:
   - [ ] Articles appear in **different order** than today
   - [ ] Order is still stable within the "tomorrow" session

#### Visual Indicator
- [ ] "Rotated daily" text visible with sparkle icon
- [ ] Appears next to subtitle

### Market Pulse Testing

#### Component Renders
- [ ] Market Pulse card appears in sidebar
- [ ] Shows 5 indices: S&P 500, Dow Jones, Nasdaq, 10Y Treasury, VIX
- [ ] Each index shows name, value, change, change %
- [ ] Trend icons correct (↑ green, ↓ red, — gray)
- [ ] Values formatted correctly (commas for large numbers, % for yields)

#### Refresh Functionality
1. Click refresh button in Market Pulse
2. Verify:
   - [ ] Button shows loading spinner
   - [ ] Values update after ~500ms
   - [ ] Last updated timestamp updates

#### Error Handling
- [ ] If fetch fails, shows error message
- [ ] Gracefully degrades (shows "—" for missing values)

### Sentiment Rankings Testing

#### Sector Sentiment Trends
- [ ] Card appears in sidebar below Market Pulse
- [ ] Shows top 5 sectors
- [ ] Each sector shows: rank, icon, name, bullish/neutral/bearish counts, net sentiment
- [ ] Net sentiment is color-coded (green=positive, red=negative, gray=neutral)
- [ ] Sorted by absolute sentiment strength

#### Hottest Macro Themes
- [ ] Card appears below Sector Sentiment
- [ ] Shows top 5 themes
- [ ] Each theme shows: rank, #, name, mention count, sentiment badge
- [ ] Sentiment badge is color-coded
- [ ] Sorted by frequency

#### Dynamic Updates
1. Change time window filter
2. Verify:
   - [ ] Rankings update based on new article set
   - [ ] Counts recalculate correctly

---

## Edge Cases

### Reports
- [ ] Report generation works with missing sector data (shows "—")
- [ ] Report generation works with minimal assumptions
- [ ] PDF renders correctly with long company names
- [ ] PDF renders correctly with special characters

### Macro Page
- [ ] Page works with 0 articles (shows "No articles found")
- [ ] Page works with 1 article (rankings still render)
- [ ] Page works with articles missing tags (rankings handle gracefully)
- [ ] Sentiment filter shows 0 count if no articles match
- [ ] Market Pulse handles fetch failure gracefully

---

## Performance Testing

### Reports
- [ ] Report generation completes in <10 seconds
- [ ] PDF download starts immediately
- [ ] No console errors during generation

### Macro Page
- [ ] Page loads in <2 seconds
- [ ] Article rotation calculation is instant (no lag)
- [ ] Sentiment filter changes are instant
- [ ] No console errors on load
- [ ] No memory leaks on repeated filter changes

---

## Browser Compatibility

Test in:
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (if on Mac)

Verify:
- [ ] All features work
- [ ] Styling is consistent
- [ ] Keyboard navigation works
- [ ] Focus rings visible

---

## Success Criteria

### Reports
✅ Each model type has unique, tailored content
✅ Sensitivity analysis is quantified, not vague
✅ Sector context appears (or gracefully degrades)
✅ Reports are analytical, not marketing
✅ All sections have meaningful content
✅ Limitations are concise (3-4 sentences)

### Macro Page
✅ Keyboard accessible (Tab, Enter, Space work)
✅ Market Pulse renders with 5 indices
✅ Rankings show sector sentiment + themes
✅ Articles rotate deterministically (same order per day)
✅ Bull/bear/neutral tabs work with counts
✅ Layout is scannable and engaging
✅ No breaking changes to existing functionality

---

## Rollback Plan

If issues arise:

```bash
# Revert report prompts
git checkout HEAD -- lib/reportPrompts.ts

# Revert macro page
git checkout HEAD -- app/\(app\)/macro/news/page.tsx
git checkout HEAD -- components/macro/MacroNewsPage.tsx

# Remove new components
rm components/macro/MarketPulse.tsx
rm components/macro/SentimentRankings.tsx
rm components/macro/MacroNewsPageEnhanced.tsx
```

---

## Notes

- All changes are backward compatible
- No new dependencies added
- Existing report download flow unchanged
- Mock data ready for real API integration
- Graceful degradation throughout


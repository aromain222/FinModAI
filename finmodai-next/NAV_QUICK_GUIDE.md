# Navigation Quick Guide

## What Changed?

Two new navigation items were added to the sidebar:

### 1. Startups 🚀
- **Location:** Workspace section (below "Models")
- **Route:** `/startups`
- **What it does:** Opens the Startups analysis page

### 2. Market Pulse 📈
- **Location:** Tools section (below "Macro IQ")
- **Route:** `/macro/news`
- **What it does:** Opens the Macro News page with Market Pulse and Rankings

---

## Sidebar Layout (After Update)

```
┌─────────────────────────────────┐
│  CapitalBase Logo               │
│  FinModAI                        │
│  Console                         │
├─────────────────────────────────┤
│  WORKSPACE                       │
│  ├─ Overview                     │
│  ├─ Models                       │
│  └─ Startups          🚀 NEW!   │
├─────────────────────────────────┤
│  TOOLS                           │
│  ├─ Scenario Engine              │
│  ├─ Macro IQ                     │
│  ├─ Market Pulse      📈 NEW!   │
│  ├─ Reports                      │
│  └─ Analyst Chat                 │
├─────────────────────────────────┤
│  SETTINGS                        │
│  └─ Settings                     │
└─────────────────────────────────┘
```

---

## How to Use

### Access Startups Page:
1. Open the app: http://localhost:3000/app
2. Look at the sidebar (left side)
3. Find "WORKSPACE" section
4. Click **"Startups"** (with rocket icon 🚀)
5. You'll be taken to `/startups`

### Access Market Pulse:
1. Look at the sidebar
2. Find "TOOLS" section
3. Click **"Market Pulse"** (with trending up icon 📈)
4. You'll be taken to `/macro/news`
5. This page includes:
   - Market Pulse component (live indices)
   - Sentiment Rankings
   - Macro news articles

---

## Visual Indicators

### Active State:
When you're on a page, the nav item shows:
- ✅ Green vertical bar on the left
- ✅ Green icon color
- ✅ Highlighted background
- ✅ Bold text

### Hover State:
When you hover over a nav item:
- ✅ Background color changes
- ✅ Icon color brightens
- ✅ Smooth transition

---

## Quick Test

```bash
# 1. Start the dev server
npm run dev

# 2. Open browser
# http://localhost:3000/app

# 3. Look at the sidebar - you should see:
#    - "Startups" in Workspace section
#    - "Market Pulse" in Tools section

# 4. Click "Startups"
#    - URL changes to /startups
#    - "Startups" nav item is highlighted

# 5. Click "Market Pulse"
#    - URL changes to /macro/news
#    - "Market Pulse" nav item is highlighted
#    - Page shows market data and news
```

---

## Troubleshooting

### Issue: "I don't see the new nav items"

**Solution:**
1. Make sure dev server is running: `npm run dev`
2. Hard refresh the browser: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
3. Clear browser cache if needed

### Issue: "Clicking the nav item gives 404"

**Solution:**
1. Check that the routes exist:
   - `/app/(app)/startups/page.tsx` should exist
   - `/app/(app)/macro/news/page.tsx` should exist
2. Restart the dev server: `npm run dev`

### Issue: "I get redirected to /auth"

**Solution:**
1. Make sure you're signed in
2. Check that middleware is updated (should include `/startups` in auth check)
3. Clear cookies and sign in again

---

## Direct URLs

You can also navigate directly by typing in the browser:

- **Startups:** http://localhost:3000/startups
- **Market Pulse:** http://localhost:3000/macro/news

Both require authentication (will redirect to `/auth` if not signed in).

---

## What's on Each Page?

### Startups Page (`/startups`):
- Startup-specific financial analysis
- Model generation for early-stage companies
- Custom assumptions for startups

### Market Pulse Page (`/macro/news`):
- **Market Pulse component:**
  - S&P 500, Dow, Nasdaq indices
  - 10Y Treasury Yield
  - VIX (volatility index)
  - Real-time or cached data
  
- **Sentiment Rankings:**
  - Most bullish sectors
  - Hottest macro themes
  
- **Macro News:**
  - Recent headlines
  - Sentiment classification (bullish/bearish/neutral)
  - AI-generated insights
  - Deterministic daily rotation

---

## Summary

✅ Two new navigation items added
✅ Both routes are auth-protected
✅ Active state highlighting works
✅ Icons match existing style
✅ Prefetching enabled for instant navigation

**Just click and go!** 🚀📈


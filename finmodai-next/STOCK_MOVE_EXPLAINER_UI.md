# Stock Move Explainer UI - Implementation Summary

## Overview

Implemented a polished Stock Move Explainer UI matching "Macro IQ quality" with comprehensive features for analyzing stock price movements and their catalysts.

## Features

### 1. PriceChart Component
- **Line Chart**: Clean price line with Recharts
- **Move Markers**: Color-coded reference lines (green for up, red for down)
- **Rich Tooltip**: Shows on hover:
  - Date
  - Closing price
  - Return percentage
  - Benchmark return (if available)
  - Excess return (if available)
- **Responsive**: Adapts to container size

### 2. MoveTimeline Component
- **Grouped by Week/Month**: When `interval=weekly`, groups moves by week
- **Each Item Shows**:
  - Date (formatted)
  - Return percentage (badge, color-coded)
  - Catalyst label (truncated if long)
  - Confidence badge
  - Move class (idiosyncratic/market-driven)
  - Benchmark comparison
- **Interactive**: Click to select move and see details
- **Visual Feedback**: Selected move highlighted with ring

### 3. MoveDetail Component
- **Big Title**: "Why it moved"
- **AI Explanation**: If available:
  - Headline
  - Explanation paragraph (3-6 sentences)
  - Key drivers (bullet list)
  - Evidence citations (clickable links)
- **Fallback Display**: Shows catalyst label if no AI explanation
- **No Catalyst State**: Shows "No dominant catalyst" message with market-driven explanation
- **Benchmark Context**: Shows comparison at bottom

### 4. Ticker Search
- **Autocomplete**: Basic suggestions from popular tickers
- **Saved Tickers**: 
  - Star button to save
  - Saved tickers shown below search
  - localStorage persistence (max 10 saved)
- **Navigation**: Auto-navigates to ticker page on search

### 5. Loading States
- **Skeleton Loaders**: 
  - Chart skeleton
  - Timeline skeleton
  - Detail skeleton
- **Loading Query**: Uses React Query for async state

### 6. Empty States
- **No Ticker**: Prompts user to search
- **Error State**: Shows error message with retry option
- **No Moves**: Explains no significant movements found
- **No Selection**: Prompts to select a move

## UI/UX Features

### Visual Design
- **Dark Theme**: Matches Macro IQ aesthetic
- **Card-Based Layout**: Clean separation of sections
- **Color Coding**:
  - Green: Positive moves
  - Red: Negative moves
  - Emerald: Selected items
  - Slate: Neutral text
- **Responsive**: Works on mobile and desktop

### Interactions
- **Click to Select**: Click move in timeline to see details
- **Hover Tooltips**: Rich information on chart hover
- **Quick Navigation**: Saved tickers for quick access
- **Interval Toggle**: Switch between daily/weekly views

## Technical Implementation

### Components
- `PriceChart`: Recharts-based price chart with markers
- `MoveTimeline`: Scrollable list of moves with grouping
- `MoveDetail`: Detailed explanation panel
- `TickerSearch`: Search input with autocomplete
- `MoveExplainerSkeleton`: Loading skeleton

### State Management
- React Query for data fetching
- Local state for UI (selected move, interval, saved tickers)
- localStorage for saved tickers persistence

### API Integration
- `/api/stocks/catalysts` endpoint
- Parameters:
  - `ticker`: Stock symbol
  - `start`/`end`: Date range (last 3 months)
  - `interval`: daily/weekly
  - `includeAI`: true
  - `useStrictAI`: true
  - `includeBenchmark`: true

## Route

The page is accessible at:
```
/stocks/[ticker]
```

Example:
- `/stocks/AAPL`
- `/stocks/NVDA`

## Demo Features

✅ **Complete UI**: All components implemented
✅ **Loading States**: Skeleton loaders
✅ **Empty States**: Handled gracefully
✅ **Error Handling**: User-friendly error messages
✅ **Responsive**: Works on all screen sizes
✅ **Interactive**: Click, hover, search all work
✅ **Polished**: Matches Macro IQ quality

## Future Enhancements

1. **Date Range Picker**: Allow custom date ranges
2. **Export Options**: Download chart or summary
3. **Comparison Mode**: Compare multiple tickers
4. **Advanced Filters**: Filter by move size, type, etc.
5. **Embedded Charts**: Shareable chart links


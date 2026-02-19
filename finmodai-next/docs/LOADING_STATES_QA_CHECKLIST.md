# Loading States QA Checklist (CapitalBase)

Use this checklist to verify tab-specific loading screens, status copy, and empty/error states.

## 1. No blank states

- [ ] **Market Brief** (`/market-brief`): On initial load, a full `LoadingPanel` appears immediately (title "Market Brief", steps cycling). No blank flash.
- [ ] **Macro Dashboard** (`/macro`): On initial load, `LoadingPanel` appears with "Macro Dashboard" and steps. No blank flash.
- [ ] **Model detail** (`/models/[modelId]`): While fetching model, `LoadingPanel` with "Loading Model" and steps. No blank flash.
- [ ] **Create model** (`/models/create`): After clicking "Generate Model", a `LoadingPanel` appears below the form ("Building Model Preview" + steps). No blank content.
- [ ] **Excel download**: Button label cycles through "Formatting workbook…", "Styling statements…", etc. No generic "Loading…" only.

## 2. Correct copy per tab

- [ ] **Market Brief**: Steps include "Connecting to market data…", "Fetching latest headlines…", "Calculating rising and falling sectors…", "Generating AI impact summaries…", "Finalizing today's brief…".
- [ ] **Macro Dashboard**: Steps include "Connecting to macro data…", "Loading time series…", "Computing metrics…", "Finalizing snapshot…".
- [ ] **Sector / News sections**: When used as inline sections, labels and steps match `LOADING_SECTIONS` (e.g. "Sector rotation", "Market news").
- [ ] **Company model (create)**: Steps include "Loading company financials…", "Normalizing line items…", "Projecting statements…", "Running consistency checks…", "Rendering preview…".
- [ ] **Excel export**: Steps include "Formatting workbook…", "Styling statements…", "Applying checks and totals…", "Packaging download…".
- [ ] **Model detail**: Steps include "Loading model metadata…", "Fetching results…", "Rendering view…".

## 3. Switching tabs works (no blocking)

- [ ] From Market Brief, user can navigate away while data is loading; no modal or full-page block.
- [ ] From Macro Dashboard, user can navigate away while loading.
- [ ] From Create Model, user can click "Cancel" or navigate away while "Generating Model…"; loading state does not block navigation.
- [ ] Sidebar and top bar remain usable during any tab load.

## 4. Accessibility

- [ ] `LoadingPanel` and `LoadingInline` use `role="status"`, `aria-busy="true"`, `aria-live="polite"`.
- [ ] Loading panels have an `aria-label` that includes title and current step (e.g. "Loading: Market Brief. Fetching latest headlines…").
- [ ] Error state "Retry" buttons are focusable and actionable via keyboard.
- [ ] Progress bar (when `showProgress` is true) is present and does not rely on color alone.

## 5. Empty and error states

- [ ] **Market Brief – no news**: Shows "No results yet" with hint "Try widening the date range or refresh in a moment." (from `EmptyState`).
- [ ] **Market Brief – error**: Shows "Couldn't load market brief" and a "Retry" button (from `ErrorState`).
- [ ] **Macro – error**: Shows error message and "Retry" button; "Back to Dashboard" link still present.
- [ ] **Excel download – error**: Shows "Couldn't load Excel" and "Try again" button.
- [ ] **Model detail – not found**: Existing error UI unchanged; no regression.

## 6. Last updated

- [ ] **Market Brief**: Once data is loaded, "Last updated X:XX PM ET" appears next to the Refresh button when `performanceMeta?.asOf` is set.
- [ ] Other tabs show "Last updated" only where data supports it (e.g. macro snapshot timestamp if exposed).

## 7. Skeletons and layout

- [ ] Table skeleton: header row + 6–10 body rows; no layout shift when real table loads.
- [ ] Card skeleton: 3–6 cards with title + 2 lines; matches card grid layout.
- [ ] Chart skeleton: placeholder axes + bar area; similar height to real chart.
- [ ] Model skeleton: statement-like rows with indents and totals-style rows.

## Files touched

- **Copy**: `lib/loadingCopy.ts` – tab/section message map, empty/error copy.
- **Components**: `components/loading/LoadingPanel.tsx`, `LoadingInline.tsx`, `skeletons.tsx`, `EmptyErrorStates.tsx`, `index.ts`.
- **Integration**: `components/market-brief/MarketBriefPage.tsx`, `components/macro/MacroDashboard.tsx`, `components/macro/MarketBrief.tsx`, `app/(app)/models/[modelId]/page.tsx`, `app/(app)/models/create/page.tsx`, `components/models/DownloadWorkbookButton.tsx`.

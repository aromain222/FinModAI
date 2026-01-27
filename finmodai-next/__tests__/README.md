# Frontend Contract Tests

Lightweight UI regression protection for Market Brief and Macro IQ pages.

## Setup

Install required dependencies:

```bash
npm install --save-dev @testing-library/react @testing-library/jest-dom @vitejs/plugin-react jsdom
```

## Running Tests

```bash
# Run all smoke tests
npm run test:smoke

# Run specific page test
npm run test __tests__/pages/market-brief.test.tsx
npm run test __tests__/pages/macro-iq.test.tsx
```

## What's Tested

- Pages render main containers without crashing
- Pages handle empty API responses gracefully
- Key sections (KPIs, charts, headlines) render even with empty data
- No JavaScript errors when APIs return empty arrays

## Contract Guards

The `ContractGuard` component wraps critical sections and:
- Soft-fails with Alert instead of throwing
- Logs warnings with traceId in dev mode
- Validates required fields before rendering


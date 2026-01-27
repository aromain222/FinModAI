# Input Metadata Auto-Defaults & Formatting Improvements

## Summary

Implemented intelligent auto-defaults for input min/max/step values and enhanced number formatting throughout the application.

## Features

### 1. Input Metadata Auto-Defaults (`lib/modeling/inputMetadata.ts`)

**Rules:**
- **Percent Controls:**
  - Auto-detects 0-1 (decimal) or 0-100 (percent) scale based on value
  - Step: 0.01 for decimal scale, 1 for percent scale
  - Min/max within appropriate bounds (e.g., -50% to +50% for growth)
  
- **Currency:**
  - Step based on magnitude (e.g., 1M for values >= 1B, 100K for values >= 1M)
  - Auto-detects non-negative bounds for revenue/price/value inputs
  
- **Counts:**
  - Integers only (step = 1)
  - Non-negative bounds (min >= 0)
  
- **Default Bounds:**
  - If no specific bounds: +/- 30% of default value
  - Clamped to >= 0 for non-negative economics
  - Smart bounds for specific input types (WACC, growth, margins, etc.)

**Key Functions:**
- `getInputMetadata(key, unit, defaultValue)`: Generates intelligent metadata
- `formatNumberWithAbbreviation(value, decimals)`: Formats with K/M/B abbreviations

### 2. Enhanced Formatting Utilities (`lib/format/number.ts`)

**New/Enhanced Functions:**
- `formatCurrencyCompact(value, decimals)`: Currency with K/M/B abbreviations
- `formatPercentWithCommas(value, decimals)`: Percent with commas for large values
- `formatNumber(value, decimals, useAbbreviation)`: Smart number formatting with optional abbreviations

**Features:**
- Currency: Commas + K/M/B abbreviations for large values
- Percent: 1 decimal place by default
- Large numbers: K/M/B abbreviations (e.g., 1.5B, 250M, 3.2K)

### 3. Updated DebouncedSlider (`components/agent/DebouncedSlider.tsx`)

**Changes:**
- Auto-detects min/max/step if not provided
- Uses `inputKey` and `defaultValue` for intelligent defaults
- Enhanced formatting for currency, percent, and large numbers
- Formatted min/max labels (e.g., "$1.5B" instead of "1500000")

**Usage:**
```tsx
<DebouncedSlider
  label="Revenue Growth"
  inputKey="revenueGrowth" // Auto-detects metadata
  value={revenueGrowth}
  defaultValue={10} // Used for calculating default bounds
  // min/max/step auto-detected
  onChange={handleChange}
/>
```

### 4. Updated Table/Chart Formatting

**BlockRenderer (`components/agent/BlockRenderer.tsx`):**
- Enhanced `renderCell` to detect column type from key
- Currency: Uses `formatCurrencyCompact` (K/M/B)
- Percent: Uses `formatPercent` (1 decimal)
- Counts: Integer formatting with commas
- Large numbers: Abbreviations when >= 1000

**SensitivityResultsTable (`components/agent/SensitivityResultsTable.tsx`):**
- Consistent currency formatting with `formatCurrencyCompact`
- Percent formatting with `formatPercent`
- Removed duplicate formatting code

## Implementation Details

### Auto-Detection Logic

1. **Input Type Detection:**
   - Percentage: Detects from key (contains "pct", "percent", "rate", "margin", "growth", "wacc") or unit (%)
   - Currency: Detects from key (contains "revenue", "price", "value", "$") or unit ($, USD, M)
   - Count: Detects from key (contains "shares", "count", "units") or unit (units, count)

2. **Scale Detection (Percent):**
   - If unit is "%" → 0-100 scale
   - If default value > 1 → 0-100 scale
   - Otherwise → 0-1 scale

3. **Step Calculation:**
   - Percent (decimal): 0.01
   - Percent (0-100): 1
   - Currency: Based on magnitude (1B, 1M, 100K, 100, 10, 1)
   - Count: 1 (integer)

4. **Bounds Calculation:**
   - Specific inputs: Use predefined bounds (e.g., WACC: 5-25%, Growth: -50% to +50%)
   - Generic: +/- 30% of default value
   - Non-negative: Clamp min to >= 0

### Formatting Examples

**Currency:**
- `1500000000` → `$1.5B`
- `250000000` → `$250M`
- `3200` → `$3.2K`
- `500` → `$500`

**Percent:**
- `0.15` → `15.0%`
- `25` → `25.0%`
- `150.5` → `150.5%` (with commas if >= 100)

**Numbers:**
- `1500000` → `1.5M`
- `2500` → `2.5K`
- `500` → `500`

## Files Changed

### New Files
- `lib/modeling/inputMetadata.ts` - Input metadata utilities
- `INPUT_METADATA_AUTO_DEFAULTS.md` - This documentation

### Modified Files
- `lib/format/number.ts` - Enhanced formatting utilities
- `components/agent/DebouncedSlider.tsx` - Auto-defaults and enhanced formatting
- `components/agent/BlockRenderer.tsx` - Enhanced table cell formatting
- `components/agent/SensitivityResultsTable.tsx` - Consistent formatting

## Usage Examples

### Using DebouncedSlider with Auto-Defaults

```tsx
// Auto-detects min/max/step for revenue growth
<DebouncedSlider
  label="Revenue Growth"
  inputKey="revenueGrowth"
  value={revenueGrowth}
  defaultValue={10}
  unit="%"
  onChange={handleChange}
/>

// Explicitly override if needed
<DebouncedSlider
  label="Custom Input"
  value={value}
  min={0}
  max={100}
  step={1}
  onChange={handleChange}
/>
```

### Manual Metadata Generation

```tsx
import { getInputMetadata } from '@/lib/modeling/inputMetadata';

const metadata = getInputMetadata('revenueGrowth', '%', 10);
// Returns: { min: -20, max: 40, step: 1, unit: '%', ... }
```

### Formatting Numbers

```tsx
import { formatCurrencyCompact, formatPercent, formatNumberWithAbbreviation } from '@/lib/format/number';

formatCurrencyCompact(1500000000, 1); // "$1.5B"
formatPercent(0.15, 1); // "15.0%"
formatNumberWithAbbreviation(2500000, 1); // "2.5M"
```

## Benefits

1. **Consistent Defaults**: All sliders have appropriate bounds and steps
2. **Better UX**: Users see properly formatted numbers everywhere
3. **Less Boilerplate**: No need to manually specify min/max/step for common inputs
4. **Smart Detection**: Automatically handles percentage scales (0-1 vs 0-100)
5. **Readable Numbers**: K/M/B abbreviations make large numbers readable

## Future Enhancements

- Support for more input types (multiples, ratios, etc.)
- Custom formatting per input type
- User preferences for formatting style
- Localization support for number formatting


# Frontend Migration Summary - Standardized Preview Format

## ✅ Completed

### 1. New Standardized Preview Component
- **File**: `components/models/previews/StandardizedPreview.tsx`
- **Purpose**: Displays model previews using the standardized format
- **Features**:
  - KPIs display (formatted by type: currency, percent, multiple, number, text)
  - Assumptions panel (grouped by category: Operating, Capital Structure, Valuation)
  - Charts (Recharts integration via PreviewChartsPanel)
  - Checks (validation results with severity indicators)

### 2. Updated Preview Router
- **File**: `components/models/previews/PreviewForModelType.tsx`
- **Changes**:
  - Added `isStandardizedPreview()` detection function
  - Routes to `StandardizedPreview` when format matches (has kpis, assumptions, charts, checks)
  - Falls back to legacy preview components for backward compatibility

### 3. Backward Compatibility
- ✅ Legacy preview components still work (LboPreview, CompsPreview, MergerPreview)
- ✅ Automatic detection of standardized vs legacy format
- ✅ Graceful fallback if standardized preview fails

## 📋 Standardized Preview Format

The new preview format includes:

```typescript
{
  kpis: Array<{
    label: string;
    value: string | number;
    format: 'currency' | 'percent' | 'multiple' | 'number' | 'text';
    unit?: string;
  }>;
  assumptions: Array<{
    key: string;
    label: string;
    value: string | number | boolean;
    unit?: string;
    category?: 'Operating' | 'Capital Structure' | 'Valuation';
    isDerived?: boolean;
  }>;
  charts: Array<{
    type: 'line' | 'bar' | 'area' | 'scatter';
    title: string;
    data: Record<string, any>[];
    xKey: string;
    yKey?: string;
    yKeys?: string[];
  }>;
  checks: Array<{
    name: string;
    passed: boolean;
    message?: string;
    severity?: 'error' | 'warning' | 'info';
  }>;
  summary?: string;
  keyMetrics?: Record<string, string | number>;
}
```

## 🎨 UI Components Used

- **shadcn/ui**: Card, Badge, Accordion
- **Recharts**: LineChart, BarChart (via PreviewChartsPanel)
- **Lucide-react**: Icons (CheckCircle2, XCircle, AlertTriangle, Info)
- **Tailwind CSS**: Styling with CSS variables

## 🔄 How It Works

1. **Detection**: `PreviewForModelType` checks if output has standardized format
2. **Routing**: If standardized format detected, routes to `StandardizedPreview`
3. **Rendering**: `StandardizedPreview` renders KPIs, assumptions, charts, checks
4. **Fallback**: If not standardized or error occurs, falls back to legacy previews

## 📝 Example Usage

When the API returns a standardized preview:

```json
{
  "preview": {
    "kpis": [
      { "label": "IRR", "value": 0.25, "format": "percent", "unit": "%" },
      { "label": "MOIC", "value": 2.5, "format": "multiple", "unit": "x" }
    ],
    "assumptions": [
      { "key": "entryMultiple", "label": "Entry Multiple", "value": 8.0, "unit": "x", "category": "Capital Structure" },
      { "key": "irr", "label": "IRR", "value": 0.25, "unit": "%", "category": "Valuation", "isDerived": true }
    ],
    "charts": [
      { "type": "line", "title": "Debt Paydown Over Time", "data": [...], "xKey": "year", "yKey": "netDebt" }
    ],
    "checks": [
      { "name": "Model Validation", "passed": true, "message": "All model checks passed", "severity": "info" }
    ],
    "summary": "LBO model: AAPL - 25% IRR, 2.5x MOIC"
  }
}
```

The frontend automatically detects and renders it using `StandardizedPreview`.

## ✅ Files Created/Modified

### Created
- `components/models/previews/StandardizedPreview.tsx` - New standardized preview component

### Modified
- `components/models/previews/PreviewForModelType.tsx` - Added standardized preview detection and routing

## 🚀 Next Steps

1. **Test with API**: Verify standardized previews render correctly when API returns new format
2. **Gradual Migration**: API can gradually start returning standardized format for new model runs
3. **Legacy Support**: Legacy format continues to work during migration period
4. **Remove Legacy**: Once fully migrated, can remove legacy preview components (optional)

## 🎯 Benefits

- ✅ **Consistent UI**: All models use the same preview structure
- ✅ **Better UX**: Grouped assumptions, clear KPIs, validation checks
- ✅ **Backward Compatible**: Legacy previews still work
- ✅ **Type Safe**: TypeScript types ensure correct format
- ✅ **Reusable**: Single component handles all three model types

# Literal Excel Preview System

## Core Principle

**The preview is a literal, read-only rendering of the Excel file. If it doesn't exist in Excel, it doesn't appear in the preview.**

## Architecture

### Components

1. **ExcelTable** (`ExcelTable.tsx`)
   - Renders spreadsheet-like tables
   - Matches Excel formatting (borders, alignment, row shading)
   - Handles truncation with clear indicators
   - No transformations, no calculations

2. **ExcelPreviewShell** (`ExcelPreviewShell.tsx`)
   - Container for Excel previews
   - Provides header, notes, assumptions, download CTA
   - Only shows what exists in Excel

3. **Literal Model Previews** (`Literal*Preview.tsx`)
   - Model-specific previews that use ExcelTable
   - Extract data from `WorkbookPreview` structure
   - No additional calculations or transformations

### Data Flow

```
Excel Workbook (ExcelJS)
  ↓
generatePreviewFromWorkbook()
  ↓
WorkbookPreview { sheetName, columns, rows }
  ↓
Literal*Preview Component
  ↓
ExcelPreviewShell + ExcelTable
  ↓
Browser Rendering (matches Excel exactly)
```

## Rules

### ✅ Allowed

- Rendering exact Excel cell values
- Showing same column order as Excel
- Showing same row order as Excel
- Truncating rows with clear indicator
- Showing notes/assumptions from Excel
- Matching Excel formatting (borders, alignment)

### ❌ Forbidden

- Adding KPI tiles not in Excel
- Adding charts not in Excel
- Adding filters, sliders, toggles
- Transforming or summarizing values
- Adding "insights" or interpretations
- Calculating new values
- Reordering columns or rows
- Hiding data without indication

## Implementation Checklist

For each model preview:

- [ ] Uses `ExcelTable` component
- [ ] Uses `ExcelPreviewShell` container
- [ ] Extracts data from `WorkbookPreview` only
- [ ] No additional calculations
- [ ] No KPI tiles or dashboards
- [ ] No charts unless in Excel
- [ ] Truncation clearly indicated
- [ ] Values match Excel exactly
- [ ] Missing values shown same as Excel (blank or em dash)

## Testing

To verify a preview is correct:

1. Generate Excel model
2. Open Excel file
3. Compare preview to Excel:
   - Same columns? ✅
   - Same rows? ✅
   - Same values? ✅
   - Same order? ✅
   - Same formatting hierarchy? ✅
4. If preview has something Excel doesn't → ❌
5. If Excel has something preview doesn't → ⚠️ (may be truncated, must be indicated)

## Success Criteria

The preview is correct if:
- ✅ It looks like a spreadsheet rendered in the browser
- ✅ Users immediately understand what Excel will contain
- ✅ Excel feels like natural continuation, not a surprise
- ✅ Removing all UI chrome leaves a usable document
- ✅ Fidelity over flair

# Literal Excel Preview System - Implementation Summary

## Overview

Redesigned CapitalBase's model preview system to be **literal, read-only renderings of Excel models** - not dashboards, not visualizations, not interpretations.

## Core Principle

> **If something does not exist in the Excel file, it must not appear in the preview.**

The preview is a UI representation of the spreadsheet, not an analysis surface.

## Components Created

### 1. ExcelTable (`ExcelTable.tsx`)
- Spreadsheet-like table component
- Renders exact Excel cell values
- Matches Excel formatting (borders, alignment, row shading)
- Handles truncation with clear indicators
- No transformations, no calculations

**Features**:
- Frozen columns support
- Multi-row headers
- Total/subtotal row detection
- Empty row filtering
- Truncation indicators

### 2. ExcelPreviewShell (`ExcelPreviewShell.tsx`)
- Container for Excel previews
- Provides:
  - Model header (title, as-of date, currency, units)
  - Data coverage notes
  - Primary tables
  - Supporting tables (if in Excel)
  - Notes/Assumptions (exactly as in Excel)
  - Download CTA

**Features**:
- Only shows what exists in Excel
- No KPI tiles
- No dashboards
- No charts (unless in Excel)

### 3. LiteralCompsPreview (`LiteralCompsPreview.tsx`)
- Literal rendering of Trading Comps Excel model
- Uses `ExcelPreviewShell` + `ExcelTable`
- Extracts data from `WorkbookPreview` structure
- No additional calculations

**Data Flow**:
```
Excel Workbook → generatePreviewFromWorkbook() → WorkbookPreview → LiteralCompsPreview → ExcelPreviewShell → ExcelTable → Browser
```

## Integration

### Updated PreviewForModelType
- Checks for `rawOutput.preview` (from `generatePreviewFromWorkbook`)
- Uses `LiteralCompsPreview` if preview data available
- Falls back to legacy preview if not

### Preview Data Structure
```typescript
interface WorkbookPreview {
  sheetName: string;
  columns: string[];
  rows: (string | number | null)[][];
  rowCount: number;
  columnCount: number;
}
```

## Rules Enforced

### ✅ Allowed
- Rendering exact Excel cell values
- Same column/row order as Excel
- Truncation with clear indicators
- Notes/assumptions from Excel
- Matching Excel formatting

### ❌ Forbidden
- KPI tiles not in Excel
- Charts not in Excel
- Filters, sliders, toggles
- Value transformations
- "Insights" or interpretations
- New calculations
- Reordering data
- Hiding data without indication

## Visual Style

- **Spreadsheet-first layout**: Tables, not cards
- **Tight row spacing**: Matches Excel density
- **Column headers**: Clear, Excel-like
- **Subtle gridlines**: Or row shading
- **No dashboards**: No tiles, no KPI cards (unless in Excel)

## Success Criteria

Preview is correct if:
- ✅ Looks like spreadsheet rendered in browser
- ✅ Users understand what Excel will contain
- ✅ Excel feels like natural continuation
- ✅ Removing UI chrome leaves usable document
- ✅ Fidelity over flair

## Next Steps

1. **Create literal previews for other models**:
   - `LiteralDcfPreview.tsx`
   - `LiteralThreeStatementPreview.tsx`
   - `LiteralLboPreview.tsx`
   - `LiteralMergerPreview.tsx`

2. **Enhance generatePreviewFromWorkbook**:
   - Capture header sections (rows 1-4)
   - Capture notes sections
   - Capture multiple sheets
   - Preserve formatting metadata

3. **Improve ExcelTable**:
   - Better number formatting (match Excel formats)
   - Currency formatting
   - Percentage formatting
   - Date formatting

4. **Testing**:
   - Compare preview to Excel side-by-side
   - Verify no extra content
   - Verify all Excel content appears (or is truncated with indicator)

## Files Created

- `components/models/previews/ExcelTable.tsx`
- `components/models/previews/ExcelPreviewShell.tsx`
- `components/models/previews/LiteralCompsPreview.tsx`
- `components/models/previews/LITERAL_PREVIEW_GUIDE.md`
- `components/models/previews/LITERAL_PREVIEW_SUMMARY.md`

## Files Updated

- `components/models/previews/PreviewForModelType.tsx` - Added literal preview support

## Status

✅ **Core system implemented**
✅ **Comps preview converted to literal**
✅ **Rules and guidelines documented**
⏳ **Other model previews pending** (DCF, 3-Statement, LBO, M&A)

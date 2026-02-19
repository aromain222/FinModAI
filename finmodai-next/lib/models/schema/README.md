# ModelDocument Schema System

## Overview

**Single source of truth** for all financial models. Both Excel generation and UI preview use the same `ModelDocument` schema.

## Core Principle

> **No duplicate formatting logic. No new calculations in UI. Truncation is rendering-only.**

## Architecture

```
ModelDocument (Schema)
    ↓
    ├─→ Excel Generation (mapDocumentToExcel)
    │   └─→ Excel Workbook
    │
    └─→ UI Preview (getTruncatedRows/Columns)
        └─→ Browser Rendering
```

## Schema Structure

### ModelDocument (Root)
```typescript
{
  meta: ModelMeta,        // Model type, company, date, currency
  sections: Section[],    // Ordered list of sections
  globalStyles?: StyleTokens
}
```

### Section
- Visual block (e.g., "Key Outputs", "Trading Comps Table")
- Contains ordered list of `Block`s
- Has layout: `fullWidth`, `twoColumn`, `grid`, `stacked`

### Block (Union Type)
- `TableBlock` - Data tables
- `TextBlock` - Text content
- `SpacerBlock` - Spacing
- `ChartBlock` - Charts (ONLY if Excel contains chart)
- `CalloutBlock` - Notes/disclaimers

### TableBlock
- `columns`: Column definitions (key, label, type, format, align, width, group)
- `rows`: Row definitions (rowKey, labelCell, cells, rowType, indentLevel)
- `grid`: Freeze panes, column widths, hide gridlines
- `footnotes`: Optional footnotes

### Cell
- `value`: string | number | null
- `display`: Optional preformatted string
- `formula`: Excel formula (UI ignores, uses value)
- `meta`: Provenance metadata (status, method, inputs_used, confidence, warnings)

## Style Tokens

Shared style definitions that both Excel and UI interpret:

- **Typography**: Font family, sizes, weights
- **Colors**: Background, borders, text (CapitalBase palette)
- **Spacing**: Padding, row height
- **Borders**: Thin/thick, section dividers

**Conventions**:
- Inputs = Blue text, italic
- Formulas = Black text
- Links = Green text
- Checks/Errors = Red text

## Excel Mapping Rules

### Section → Excel
- Sections map to vertical blocks on sheet
- Section titles become merged header cells

### TableBlock → Excel
- Maps to rectangular cell region
- Column headers → Excel header row
- Group headers → Merged group header row (if `column.group` exists)
- `rowType` controls borders (thick on totals)
- `column.format` maps to Excel number formats
- `grid.freezePanes` defines freeze panes
- `grid.columnWidths` maps to Excel column widths
- `cell.formula` written to Excel (UI uses `value`)

### Cell Meta → Excel
- `status: 'user_provided'` → Blue italic text
- `status: 'derived'` → Black text
- `warnings` → Can be added as notes

## UI Preview Mapping Rules

### Rendering
- Render sections in order
- Render tables with same headers and values
- Use style tokens to match Excel-like appearance

### Truncation
- **Rows**: Can truncate with "More in Excel" indicator
- **Years**: Can show first + last + middle (if many years)
- **Truncation never changes ModelDocument** - schema always has full data

### Cell Display
- Use `cell.display` if provided
- Otherwise format based on `column.type`:
  - `currency` → `$#,##0`
  - `percent` → `0.0%`
  - `multiple` → `#,##0.0x`
- Null values → blank (not "N/A" or "—")

### Style Application
- Apply style tokens based on `cell.meta.status`
- Apply row type styles (bold for totals, background for headers)
- Match Excel formatting hierarchy

## Examples

See `examples.ts` for complete examples:

1. **Trading Comps**: Table with comps data, summary stats, derived shares, missing P/E, total row
2. **DCF Summary**: Valuation bridge table, assumptions table, derived EV, missing per-share
3. **3-Statement**: Income statement with multiple years, subtotals, total row

Each example includes:
- ✅ Derived value with provenance metadata
- ✅ Missing value
- ✅ Total/subtotal row with thick border rules

## Guardrails

### ✅ Allowed
- Representable in Excel tables and notes
- Charts if they correspond to Excel chart objects
- Provenance metadata for all values

### ❌ Forbidden
- Dashboard-only constructs (cards, tiles)
- Charts not in Excel
- UI calculations or inferences
- Duplicate formatting logic

## Usage

### Generating Excel
```typescript
import { mapDocumentToExcel } from '@/lib/models/schema';
import { EXAMPLE_TRADING_COMPS } from '@/lib/models/schema/examples';

const workbook = await mapDocumentToExcel(EXAMPLE_TRADING_COMPS);
```

### Rendering UI Preview
```typescript
import { getTruncatedRows, formatCellForUI } from '@/lib/models/schema';

const { visible, hidden } = getTruncatedRows(table.rows, { maxRows: 50 });
// Render visible rows, show "X more rows in Excel" if hidden > 0
```

## Success Criteria

✅ Excel generation and UI preview cannot diverge without schema changes
✅ Preview looks like the spreadsheet
✅ Every number can be traced back to provenance metadata
✅ Extensible across all model types

## Files

- `ModelDocument.ts` - Core schema definitions
- `StyleTokens.ts` - Shared style system
- `mappings.ts` - Excel and UI mapping functions
- `examples.ts` - Example ModelDocuments
- `index.ts` - Public API exports

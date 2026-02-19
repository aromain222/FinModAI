# CapitalBase Model Aesthetics Spec

## Objective

Demo and production three-statement models must **look** like real IB/PE models: clean hierarchy, consistent decimals, no "—" in numeric cells, finance-standard sign conventions, and printable Excel. The preview UI must mirror Excel structure (same section order, labels, year columns, totals).

---

## Part 1 — Excel Aesthetics (Mandatory)

### Tabs (minimum)

| Tab | Content |
|-----|---------|
| **Summary** | Key metrics + small projection table (Revenue, EBITDA, Net Income); no charts required |
| **IS** | Income Statement |
| **BS** | Balance Sheet |
| **CF** | Cash Flow Statement |
| **Assumptions** | Drivers table + scenario selector |
| **Checks** | BS balance check, cash reconcile, sanity checks |

### Styling Rules

- **Font:** Calibri (or workbook default), base size **10**, section headers **12** bold.
- **Section headers:** Size 12 bold, thick bottom border.
- **Subheaders:** Size 10 bold, light fill (e.g. grey).
- **Year columns:** Right-aligned, consistent width **12–14**.
- **Label column:** Left-aligned, width **35–45**.
- **Indentation:** Indent levels for hierarchy (Revenue 0, (-) COGS 1, = Gross Profit 1, etc.).
- **Borders:** Thin inner grid for statement body; **thicker borders for totals** (top thin line).
- **Number formats:**
  - Currency: `#,##0` or `#,##0.0`; **negatives in parentheses** `(#,##0)`.
  - Percentages: `0.0%`.
  - Shares: `#,##0.0`.
  - Avoid excessive decimals.
- **Sign conventions:**
  - Expenses **positive** on IS (display as positive costs).
  - **Capex negative** (outflow).
  - **Debt repayment negative**, issuance positive.
  - D&A on CF: **positive** add-back.
- **Rows:** Blank spacer between major sections; **totals: bold + top border**.
- **Freeze panes:** Freeze first column + header rows.
- **Print setup:** Fit to 1 page wide; repeat top header rows; set margins for print.

### Mandatory Statement Structure (visual)

**Income Statement:**  
Revenue → (-) COGS → = Gross Profit → (-) OpEx → = EBITDA → (-) D&A → = EBIT → (-) Interest → = Pre-Tax Income → (-) Taxes → = Net Income

**Balance Sheet:**  
Assets: Cash, Current Assets, PP&E, Total Assets  
Liabilities: Current Liabilities, Debt, Total Liabilities  
Equity: Equity / Retained Earnings (or Total Equity)  
Total Liabilities + Equity

**Cash Flow:**  
Net Income → + D&A → ± Change in NWC → = Cash From Operations → (-) Capex → = Cash From Investing → ± Debt/Equity flows → = Cash From Financing → Net Change in Cash → Beginning Cash → Ending Cash

---

## Part 2 — In-App Preview UI (Mandatory)

- **Finance-grade table:** Sticky first column (line items), sticky header row (years).
- **Section headers** as distinct rows (bold, background).
- **Totals** bold with separators (top border).
- **Hover:** Tooltip with definition + source (demo = "Demo assumption").
- **Toggle:** $ vs % of revenue (optional).
- **Compact vs expanded** view (optional).
- **Same as Excel:** Same row order, same labels, same year columns, same sign conventions.
- **No "—" in numeric cells:** Use blank or 0 or N/A only when finance-standard; prefer blank for N/A.

---

## Part 3 — Template Implementation

- **Shared formatter:** `lib/modelFormat.ts` — `applyHeaderStyle`, `applySectionStyle`, `applyTotalStyle`, `formatNumberCell`.
- **Row schema:** `{ key, label, kind: 'section' | 'line' | 'total' | 'spacer', indent, format: 'currency' | 'percent' | 'number', tooltip? }`.
- **Excel:** `renderStatementSheet(sheet, statementData, styleConfig)` — one config controls fonts, borders, widths, formats.
- **UI:** Same row schema drives both preview and Excel so they stay consistent.

---

## Part 4 — Checklist: "Looks Real"

- [ ] All tabs present: Summary, IS, BS, CF, Assumptions, Checks.
- [ ] Section headers: 12pt bold, thick bottom border.
- [ ] Year columns: fixed width, right-aligned; label column 35–45 width.
- [ ] No "—" in numeric cells; use blank or parentheses for negative.
- [ ] Totals rows: bold + top border.
- [ ] Sign conventions: Capex negative, D&A add-back positive, debt paydown negative.
- [ ] Freeze panes: first column + header rows.
- [ ] Print: fit to 1 page wide, repeat header rows, margins set.
- [ ] Preview: same row order and labels as Excel; sticky column + header; totals visually distinct.
- [ ] Demo mode: footnote/source panel shows "Demo assumptions" (no change to structure).

---

## Pro vs Demo Toggle (Optional)

- **Pro:** Labels/sources show "Reported" / filing source.
- **Demo:** Labels/sources show "Demo assumption".
- Structure and layout identical; only labels/footnotes change.

---

## Implementation Plan (Files Changed)

| Item | File(s) | Change |
|------|---------|--------|
| Row schema + style config | `lib/modelFormat.ts` | New: StatementRowSchema, ModelStyleConfig, INCOME_STATEMENT_ROW_SCHEMA, BALANCE_SHEET_ROW_SCHEMA, CASH_FLOW_ROW_SCHEMA, applyHeaderStyle, applySectionStyle, applyTotalStyle, formatNumberCell, formatCellDisplay |
| Excel template | `lib/modelTemplate.ts` | New: renderStatementSheet(), freezeFirstColumnAndHeader(), applyPrintSetup() |
| Excel generator | `lib/models/threeStatement/excel.ts` | Use renderStatementSheet for IS/BS/CF; tabs named Summary, IS, BS, CF, Assumptions, Checks; freeze + print setup |
| Preview UI | `components/models/previews/FinanceStatementTable.tsx` | New: sticky column + header, section/line/total rows, tooltips, $ / % of revenue toggle |
| Preview wiring | `components/models/previews/ThreeStatementPreview.tsx` | Prefer output.years + incomeStatement/balanceSheet/cashFlow; render three FinanceStatementTable; sourceLabel prop; no "—" in fallback table |

---

## TypeScript Interfaces (Row Schema + Style Config)

```ts
type RowKind = 'section' | 'line' | 'total' | 'spacer';
type CellFormat = 'currency' | 'percent' | 'number' | 'integer' | 'text';

interface StatementRowSchema {
  key: string;
  label: string;
  kind: RowKind;
  indent?: number;
  format?: CellFormat;
  tooltip?: string;
  displayNegative?: boolean;
}

interface ModelStyleConfig {
  fontName: string;
  baseFontSize: number;
  headerFontSize: number;
  sectionHeaderFontSize: number;
  labelColumnWidth: number;
  yearColumnWidth: number;
  currencyFormat: string;
  currencyNegativeFormat: string;
  percentFormat: string;
  sectionFillArgb: string;
  borderArgb: string;
}
```

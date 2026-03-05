/**
 * FormulaLinkedBuilder
 *
 * The engine that turns a FormulaLinkedModelDef into a fully formula-linked
 * ExcelJS workbook. Handles:
 *   - Sheet creation with styleKit formatting
 *   - Named range registration for all inputs and line items
 *   - Formula template resolution ({Revenue} → $D$5 or named range)
 *   - Per-period formula replication across time-series columns
 *   - Input cell styling (blue font, light fill, unlocked)
 *   - Output cell styling (black font, locked)
 *   - Equations tab auto-generation
 *   - Model checks tab
 *   - Sheet protection (inputs editable, everything else locked)
 */

import ExcelJS from 'exceljs';
import type {
  FormulaLinkedModelDef,
  InputSpec,
  LineItemSpec,
  CheckSpec,
  PeriodDef,
  ResolvedAddress,
  EquationsRow,
  CellFormat,
  CellRole,
  SectionSpec,
  SheetSpec,
} from './types';
import {
  applyWorkbookDefaults,
  applySheetDefaults,
  setColumnWidths,
  hideUnusedArea,
  titleBar,
  sectionHeader,
  tableHeader,
  borderBox,
  inputCell as styleKitInputCell,
  outputCell as styleKitOutputCell,
  bodyCell as styleKitBodyCell,
  colLetter,
  NUM_FMT,
  COLORS,
} from '../styleKit';
import { toUniqueWorksheetName } from '../safeSheetName';

/* ────────── Constants ────────── */

const FONT = 'Calibri';
const LABEL_COL = 1;
const DEFAULT_DATA_START_COL = 2;
const DEFAULT_LABEL_WIDTH = 34;
const DEFAULT_DATA_WIDTH = 16;
const EQUATIONS_SHEET = 'Equations';
const CHECKS_SHEET = 'Checks';

/* ────────── Format Mapping ────────── */

const FORMAT_MAP: Record<CellFormat, string> = {
  money0: NUM_FMT.fmtMoney0,
  money1: NUM_FMT.fmtMoney1,
  money2: NUM_FMT.fmtMoney2,
  pct1: NUM_FMT.fmtPercent1,
  pct2: NUM_FMT.fmtPercent2,
  number0: NUM_FMT.fmtNumber0,
  number2: NUM_FMT.fmtNumber2,
  multiple: NUM_FMT.fmtMultiple2,
  date: NUM_FMT.fmtDate,
  text: '@',
  integer: '#,##0',
};

function numFmt(format: CellFormat): string {
  return FORMAT_MAP[format] ?? NUM_FMT.fmtNumber0;
}

/* ────────── Named Range Helpers ────────── */

function sanitizeRangeName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1');
}

function periodLabel(year: number, suffix: 'A' | 'E' | 'TV'): string {
  if (suffix === 'TV') return 'TV';
  return `FY${year}${suffix}`;
}

function periodRangeName(baseName: string, year: number, suffix: 'A' | 'E' | 'TV'): string {
  if (suffix === 'TV') return sanitizeRangeName(`${baseName}_TV`);
  return sanitizeRangeName(`${baseName}_${year}${suffix}`);
}

/* ────────── Builder Class ────────── */

export class FormulaLinkedBuilder {
  private wb: ExcelJS.Workbook;
  private def: FormulaLinkedModelDef;
  private periods: PeriodDef[] = [];
  private sheets = new Map<string, ExcelJS.Worksheet>();
  private sheetRows = new Map<string, number>();
  private resolved = new Map<string, ResolvedAddress>();
  private equationsRows: EquationsRow[] = [];
  private dataStartCol: number;
  private lastDataCol: number;

  constructor(def: FormulaLinkedModelDef) {
    this.def = def;
    this.wb = new ExcelJS.Workbook();
    this.dataStartCol = DEFAULT_DATA_START_COL;
    this.lastDataCol = DEFAULT_DATA_START_COL;
  }

  /**
   * Build the complete workbook from the model definition.
   * Call this once; it returns the finished Workbook.
   */
  async build(): Promise<ExcelJS.Workbook> {
    applyWorkbookDefaults(this.wb, { company: this.def.companyName ?? 'CapitalBase' });

    this.buildPeriods();
    this.createSheets();
    this.layoutAllItems();
    this.writeAllInputs();
    this.writeAllFormulas();
    this.writeChecksSheet();
    this.writeEquationsSheet();
    this.applyProtection();
    this.finalizeSheets();

    return this.wb;
  }

  /* ════════════════════════════════════════════════════════
   *  1. PERIODS
   * ════════════════════════════════════════════════════════ */

  private buildPeriods(): void {
    const { actuals, estimates, includeTerminal } = this.def.periods;
    let col = this.dataStartCol;

    for (const year of actuals) {
      this.periods.push({ col, year, suffix: 'A', label: periodLabel(year, 'A') });
      col++;
    }
    for (const year of estimates) {
      this.periods.push({ col, year, suffix: 'E', label: periodLabel(year, 'E') });
      col++;
    }
    if (includeTerminal) {
      const tvYear = estimates.length > 0 ? estimates[estimates.length - 1] + 1 : new Date().getFullYear() + 1;
      this.periods.push({ col, year: tvYear, suffix: 'TV', label: 'TV' });
      col++;
    }
    this.lastDataCol = Math.max(col - 1, this.dataStartCol);
  }

  /* ════════════════════════════════════════════════════════
   *  2. SHEET CREATION
   * ════════════════════════════════════════════════════════ */

  private createSheets(): void {
    for (const sheetDef of this.def.sheets) {
      const ws = this.wb.addWorksheet(toUniqueWorksheetName(this.wb, sheetDef.name));
      this.sheets.set(sheetDef.name, ws);
      this.sheetRows.set(sheetDef.name, 1);
    }
  }

  private getSheet(name: string): ExcelJS.Worksheet {
    const ws = this.sheets.get(name);
    if (!ws) throw new Error(`Sheet "${name}" not defined in model.`);
    return ws;
  }

  private currentRow(sheet: string): number {
    return this.sheetRows.get(sheet) ?? 1;
  }

  private advanceRow(sheet: string, count = 1): number {
    const current = this.currentRow(sheet);
    this.sheetRows.set(sheet, current + count);
    return current;
  }

  /* ════════════════════════════════════════════════════════
   *  3. LAYOUT — assign rows to all inputs and line items
   * ════════════════════════════════════════════════════════ */

  private layoutAllItems(): void {
    for (const sheetDef of this.def.sheets) {
      const ws = this.getSheet(sheetDef.name);
      const colSpan = this.lastDataCol;

      const headerRow = titleBar(ws, this.buildSheetTitle(sheetDef), colSpan);
      this.sheetRows.set(sheetDef.name, headerRow + 1);

      if (sheetDef.hasTimeSeries) {
        this.writePeriodHeaders(ws, sheetDef.name);
      }

      for (const section of sheetDef.sections) {
        this.layoutSection(section, sheetDef);
      }
    }
  }

  private buildSheetTitle(sheetDef: SheetSpec): string {
    const company = this.def.companyName ?? this.def.ticker ?? '';
    const base = sheetDef.name;
    return company ? `${company} — ${base}` : base;
  }

  private writePeriodHeaders(ws: ExcelJS.Worksheet, sheetName: string): void {
    const row = this.advanceRow(sheetName);
    ws.getCell(row, LABEL_COL).value = '';
    for (const p of this.periods) {
      const cell = ws.getCell(row, p.col);
      cell.value = p.label;
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: COLORS.text } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.sectionFill } };
      cell.border = {
        bottom: { style: 'thin', color: { argb: COLORS.border } },
      };
    }
    tableHeader(ws, row, this.dataStartCol, this.lastDataCol);
    this.advanceRow(sheetName);
  }

  private layoutSection(section: SectionSpec, sheetDef: SheetSpec): void {
    const sheetName = section.sheet;
    const ws = this.getSheet(sheetName);
    const colSpan = this.lastDataCol;

    const sectionRow = this.advanceRow(sheetName);
    sectionHeader(ws, sectionRow, section.title, colSpan);
    this.advanceRow(sheetName);

    for (const itemKey of section.items) {
      const input = this.def.inputs.find((i) => i.key === itemKey);
      if (input) {
        input.row = this.advanceRow(input.sheet);
        this.registerAddress(input);
        continue;
      }
      const lineItem = this.def.lineItems.find((li) => li.key === itemKey);
      if (lineItem) {
        if (lineItem.isSpacer) {
          this.advanceRow(sheetName);
          continue;
        }
        lineItem.row = this.advanceRow(lineItem.sheet);
        this.registerAddress(lineItem);
        continue;
      }
    }

    this.advanceRow(sheetName);
  }

  private registerAddress(spec: InputSpec | LineItemSpec): void {
    const isInput = 'defaultValue' in spec;
    const row = spec.row!;
    const sheet = spec.sheet;
    const columns = new Map<string, number>();
    const namedRanges: string[] = [];

    if (spec.perPeriod) {
      for (const p of this.periods) {
        const pLabel = p.label;
        columns.set(pLabel, p.col);
        const rangeName = periodRangeName(spec.namedRange, p.year, p.suffix);
        namedRanges.push(rangeName);
        this.defineNamedRange(rangeName, sheet, row, p.col);
      }
    } else {
      columns.set('scalar', this.dataStartCol);
      const rangeName = sanitizeRangeName(spec.namedRange);
      namedRanges.push(rangeName);
      this.defineNamedRange(rangeName, sheet, row, this.dataStartCol);
    }

    this.resolved.set(spec.key, { key: spec.key, sheet, row, columns, namedRanges });
  }

  private defineNamedRange(name: string, sheet: string, row: number, col: number): void {
    const cellRef = `'${sheet}'!$${colLetter(col)}$${row}`;
    try {
      (this.wb as any).definedNames?.add(cellRef, name);
    } catch {
      // ExcelJS named ranges can fail silently; fallback is cell-ref resolution
    }
  }

  /* ════════════════════════════════════════════════════════
   *  4. WRITE INPUTS
   * ════════════════════════════════════════════════════════ */

  private writeAllInputs(): void {
    for (const input of this.def.inputs) {
      if (input.row == null) continue;
      const ws = this.getSheet(input.sheet);
      this.writeLabel(ws, input.row, input.label, 0);

      if (input.perPeriod) {
        this.writePerPeriodInput(ws, input);
      } else {
        this.writeScalarInput(ws, input);
      }

      this.recordEquation(input);
    }
  }

  private writeScalarInput(ws: ExcelJS.Worksheet, input: InputSpec): void {
    const cell = ws.getCell(input.row!, this.dataStartCol);
    const value = typeof input.defaultValue === 'number' ? input.defaultValue
      : typeof input.defaultValue === 'string' ? input.defaultValue
      : null;
    cell.value = value;
    cell.numFmt = numFmt(input.format);
    this.applyInputStyle(cell, input.role ?? 'input');
  }

  private writePerPeriodInput(ws: ExcelJS.Worksheet, input: InputSpec): void {
    const defaults = Array.isArray(input.defaultValue)
      ? input.defaultValue
      : typeof input.defaultValue === 'number'
        ? Array(this.periods.length).fill(input.defaultValue)
        : [];

    for (let i = 0; i < this.periods.length; i++) {
      const p = this.periods[i];
      const cell = ws.getCell(input.row!, p.col);
      const value = defaults[i] ?? 0;
      cell.value = typeof value === 'number' ? value : null;
      cell.numFmt = numFmt(input.format);

      const role = p.suffix === 'A' ? (input.role ?? 'hardcodedActual') : (input.role ?? 'input');
      this.applyInputStyle(cell, role);
    }
  }

  /* ════════════════════════════════════════════════════════
   *  5. WRITE FORMULAS
   * ════════════════════════════════════════════════════════ */

  private writeAllFormulas(): void {
    for (const li of this.def.lineItems) {
      if (li.row == null || li.isSpacer) continue;
      const ws = this.getSheet(li.sheet);
      this.writeLabel(ws, li.row, li.label, li.indent ?? 0);

      if (li.perPeriod) {
        this.writePerPeriodFormula(ws, li);
      } else {
        this.writeScalarFormula(ws, li);
      }

      this.recordEquation(li);
    }
  }

  private writeScalarFormula(ws: ExcelJS.Worksheet, li: LineItemSpec): void {
    const formula = this.resolveFormulaTemplate(li.formulaTemplate, 'scalar');
    const cell = ws.getCell(li.row!, this.dataStartCol);
    cell.value = { formula } as any;
    cell.numFmt = numFmt(li.format);
    this.applyDerivedStyle(cell, li.role ?? 'derived');
  }

  private writePerPeriodFormula(ws: ExcelJS.Worksheet, li: LineItemSpec): void {
    for (const p of this.periods) {
      const formula = this.resolveFormulaTemplate(li.formulaTemplate, p.label);
      const cell = ws.getCell(li.row!, p.col);
      cell.value = { formula } as any;
      cell.numFmt = numFmt(li.format);
      this.applyDerivedStyle(cell, li.role ?? 'derived');
    }
  }

  /**
   * Resolve a formula template like "{Revenue} * {EBITDAMargin}"
   * into actual cell references for the given period.
   *
   * Supports:
   *   {Key}        → same-period cell ref (or scalar ref)
   *   {Key.prev}   → previous period cell ref
   *   {Key.next}   → next period cell ref
   *   {Sheet!Key}  → cross-sheet reference
   */
  private resolveFormulaTemplate(template: string, periodLabel: string): string {
    return template.replace(/\{([^}]+)\}/g, (_match, token: string) => {
      let key = token.trim();
      let targetPeriod = periodLabel;
      let crossSheet: string | null = null;

      if (key.includes('!')) {
        const parts = key.split('!');
        crossSheet = parts[0];
        key = parts[1];
      }

      if (key.endsWith('.prev')) {
        key = key.slice(0, -5);
        targetPeriod = this.adjacentPeriod(periodLabel, -1);
      } else if (key.endsWith('.next')) {
        key = key.slice(0, -5);
        targetPeriod = this.adjacentPeriod(periodLabel, 1);
      }

      const addr = this.resolved.get(key);
      if (!addr) return `#REF_${key}`;

      const col = addr.columns.get(targetPeriod) ?? addr.columns.get('scalar');
      if (col == null) return `#REF_${key}_${targetPeriod}`;

      const sheetName = crossSheet ?? addr.sheet;
      const ws = this.sheets.get(sheetName);
      if (!ws) return `#REF_SHEET_${sheetName}`;

      const cellRef = `$${colLetter(col)}$${addr.row}`;

      if (sheetName !== addr.sheet || crossSheet) {
        return `'${sheetName}'!${cellRef}`;
      }
      return cellRef;
    });
  }

  private adjacentPeriod(current: string, offset: number): string {
    const idx = this.periods.findIndex((p) => p.label === current);
    if (idx < 0) return current;
    const target = idx + offset;
    if (target < 0 || target >= this.periods.length) return current;
    return this.periods[target].label;
  }

  /* ════════════════════════════════════════════════════════
   *  6. CHECKS SHEET
   * ════════════════════════════════════════════════════════ */

  private writeChecksSheet(): void {
    if (this.def.checks.length === 0) return;

    const ws = this.wb.addWorksheet(toUniqueWorksheetName(this.wb, CHECKS_SHEET));
    this.sheets.set(CHECKS_SHEET, ws);

    const colSpan = 5;
    let row = titleBar(ws, `${this.def.name} — Model Checks`, colSpan);
    row++;

    const headers = ['Check', 'Description', 'Formula', 'Result', 'Status'];
    for (let c = 0; c < headers.length; c++) {
      const cell = ws.getCell(row, c + 1);
      cell.value = headers[c];
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: COLORS.white } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.tableHeader } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    tableHeader(ws, row, 1, colSpan);
    row++;

    for (const check of this.def.checks) {
      if (check.perPeriod) {
        for (const p of this.periods) {
          this.writeCheckRow(ws, row, check, p.label);
          this.recordCheckEquation(check, p.label);
          row++;
        }
      } else {
        this.writeCheckRow(ws, row, check, 'scalar');
        this.recordCheckEquation(check, 'scalar');
        row++;
      }
    }

    setColumnWidths(ws, { 1: 28, 2: 36, 3: 40, 4: 14, 5: 12 });
    borderBox(ws, 3, row - 1, 1, colSpan);
    applySheetDefaults(ws, { freezeRow: 3, freezeCol: 1, lastCol: colSpan, lastRow: row });
    hideUnusedArea(ws, colSpan, row);
  }

  private writeCheckRow(
    ws: ExcelJS.Worksheet,
    row: number,
    check: CheckSpec,
    periodLabel: string
  ): void {
    const suffix = periodLabel !== 'scalar' ? ` (${periodLabel})` : '';

    ws.getCell(row, 1).value = check.key + suffix;
    ws.getCell(row, 1).font = { name: FONT, size: 10, color: { argb: COLORS.text } };

    ws.getCell(row, 2).value = check.equationText;
    ws.getCell(row, 2).font = { name: FONT, size: 10, color: { argb: COLORS.muted } };
    ws.getCell(row, 2).alignment = { wrapText: true };

    const resolvedFormula = this.resolveFormulaTemplate(check.formulaTemplate, periodLabel);
    ws.getCell(row, 3).value = resolvedFormula;
    ws.getCell(row, 3).font = { name: FONT, size: 9, color: { argb: COLORS.muted } };

    const resultFormula = resolvedFormula;
    ws.getCell(row, 4).value = { formula: resultFormula } as any;
    ws.getCell(row, 4).font = { name: FONT, size: 10, bold: true };

    const resultCell = colLetter(4) + row;
    const statusFormula = `=IF(${resultCell}=TRUE,"PASS",IF(${resultCell}=0,"PASS","FAIL"))`;
    const statusCell = ws.getCell(row, 5);
    statusCell.value = { formula: statusFormula } as any;
    statusCell.font = { name: FONT, size: 10, bold: true };
  }

  /* ════════════════════════════════════════════════════════
   *  7. EQUATIONS SHEET
   * ════════════════════════════════════════════════════════ */

  private writeEquationsSheet(): void {
    const ws = this.wb.addWorksheet(toUniqueWorksheetName(this.wb, EQUATIONS_SHEET));
    this.sheets.set(EQUATIONS_SHEET, ws);

    const colSpan = 6;
    let row = titleBar(ws, `${this.def.name} — Equation Reference`, colSpan);
    row++;

    const headers = ['Item', 'Equation (Human-Readable)', 'Excel Formula', 'Dependencies', 'Location(s)', 'Role'];
    for (let c = 0; c < headers.length; c++) {
      const cell = ws.getCell(row, c + 1);
      cell.value = headers[c];
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: COLORS.white } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.tableHeader } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    tableHeader(ws, row, 1, colSpan);
    row++;

    const dataStart = row;
    for (const eq of this.equationsRows) {
      ws.getCell(row, 1).value = eq.itemName;
      ws.getCell(row, 1).font = { name: FONT, size: 10, bold: true, color: { argb: COLORS.text } };

      ws.getCell(row, 2).value = eq.equationText;
      ws.getCell(row, 2).font = { name: FONT, size: 10, color: { argb: COLORS.text } };
      ws.getCell(row, 2).alignment = { wrapText: true };

      ws.getCell(row, 3).value = eq.excelFormula;
      ws.getCell(row, 3).font = { name: FONT, size: 9, color: { argb: COLORS.muted } };
      ws.getCell(row, 3).alignment = { wrapText: true };

      ws.getCell(row, 4).value = eq.dependencies;
      ws.getCell(row, 4).font = { name: FONT, size: 9, color: { argb: COLORS.muted } };

      ws.getCell(row, 5).value = eq.locations;
      ws.getCell(row, 5).font = { name: FONT, size: 9, color: { argb: COLORS.muted } };

      ws.getCell(row, 6).value = eq.role;
      ws.getCell(row, 6).font = {
        name: FONT,
        size: 9,
        color: {
          argb: eq.role === 'input' ? 'FF0066CC'
            : eq.role === 'check' ? 'FF008000'
            : eq.role === 'total' ? 'FF333333'
            : COLORS.muted,
        },
      };
      ws.getCell(row, 6).alignment = { horizontal: 'center' };

      row++;
    }

    if (dataStart < row) {
      borderBox(ws, dataStart, row - 1, 1, colSpan);
    }

    setColumnWidths(ws, { 1: 24, 2: 38, 3: 44, 4: 28, 5: 26, 6: 12 });
    applySheetDefaults(ws, { freezeRow: 3, freezeCol: 1, lastCol: colSpan, lastRow: row });
    hideUnusedArea(ws, colSpan, row);
  }

  /* ════════════════════════════════════════════════════════
   *  8. SHEET PROTECTION
   * ════════════════════════════════════════════════════════ */

  private applyProtection(): void {
    const password = process.env.EXCEL_PROTECTION_PASSWORD;

    for (const [, ws] of this.sheets) {
      ws.protect(password ?? '', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertColumns: false,
        insertRows: false,
        insertHyperlinks: false,
        deleteColumns: false,
        deleteRows: false,
        sort: true,
        autoFilter: true,
      });
    }

    for (const input of this.def.inputs) {
      if (input.row == null) continue;
      const ws = this.getSheet(input.sheet);
      if (input.perPeriod) {
        for (const p of this.periods) {
          const cell = ws.getCell(input.row, p.col);
          cell.protection = { locked: false };
        }
      } else {
        const cell = ws.getCell(input.row, this.dataStartCol);
        cell.protection = { locked: false };
      }
    }
  }

  /* ════════════════════════════════════════════════════════
   *  9. FINALIZE — column widths, freeze panes, hide unused
   * ════════════════════════════════════════════════════════ */

  private finalizeSheets(): void {
    for (const sheetDef of this.def.sheets) {
      const ws = this.getSheet(sheetDef.name);
      const lastRow = this.currentRow(sheetDef.name);

      const widths: Record<number, number> = { [LABEL_COL]: DEFAULT_LABEL_WIDTH };
      for (let c = this.dataStartCol; c <= this.lastDataCol; c++) {
        widths[c] = DEFAULT_DATA_WIDTH;
      }
      setColumnWidths(ws, widths);

      applySheetDefaults(ws, {
        freezeRow: sheetDef.freezeRow ?? 3,
        freezeCol: sheetDef.freezeCol ?? 1,
        headerRowCount: 3,
        lastCol: this.lastDataCol,
        lastRow,
      });

      hideUnusedArea(ws, this.lastDataCol, lastRow);
    }
  }

  /* ════════════════════════════════════════════════════════
   *  HELPERS — styling, labels, equations recording
   * ════════════════════════════════════════════════════════ */

  private writeLabel(ws: ExcelJS.Worksheet, row: number, label: string, indent: number): void {
    const cell = ws.getCell(row, LABEL_COL);
    cell.value = label;
    cell.font = { name: FONT, size: 11, color: { argb: COLORS.text } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: indent > 0 ? indent : undefined };
  }

  private applyInputStyle(cell: ExcelJS.Cell, role: CellRole): void {
    if (role === 'hardcodedActual') {
      cell.font = { name: FONT, size: 11, color: { argb: COLORS.text } };
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
      return;
    }
    styleKitInputCell(cell);
    if (role === 'constant') {
      cell.font = { ...cell.font, italic: true };
    }
  }

  private applyDerivedStyle(cell: ExcelJS.Cell, role: CellRole): void {
    if (role === 'total') {
      styleKitOutputCell(cell);
      cell.font = { ...cell.font, bold: true };
      cell.border = {
        top: { style: 'thin', color: { argb: COLORS.border } },
        bottom: { style: 'double', color: { argb: COLORS.border } },
      };
    } else {
      styleKitBodyCell(cell);
    }
  }

  private recordEquation(spec: InputSpec | LineItemSpec): void {
    const isInput = 'defaultValue' in spec;
    const addr = this.resolved.get(spec.key);
    if (!addr) return;

    const locations = addr.namedRanges.map((rn) => {
      const col = addr.columns.values().next().value;
      return `${addr.sheet}!${colLetter(col as number)}${addr.row}`;
    }).join(', ');

    if (isInput) {
      const input = spec as InputSpec;
      this.equationsRows.push({
        itemName: input.label,
        equationText: input.description ?? `User input: ${input.label}`,
        excelFormula: `Named range: ${addr.namedRanges.join(', ')}`,
        dependencies: '(none — raw input)',
        locations,
        role: input.role ?? 'input',
      });
    } else {
      const li = spec as LineItemSpec;
      const sampleFormula = li.perPeriod
        ? this.resolveFormulaTemplate(li.formulaTemplate, this.periods[0]?.label ?? 'scalar')
        : this.resolveFormulaTemplate(li.formulaTemplate, 'scalar');

      this.equationsRows.push({
        itemName: li.label,
        equationText: li.equationText,
        excelFormula: sampleFormula,
        dependencies: li.deps.join(', '),
        locations,
        role: li.role ?? 'derived',
      });
    }
  }

  private recordCheckEquation(check: CheckSpec, periodLabel: string): void {
    const suffix = periodLabel !== 'scalar' ? ` (${periodLabel})` : '';
    const resolvedFormula = this.resolveFormulaTemplate(check.formulaTemplate, periodLabel);

    this.equationsRows.push({
      itemName: `CHECK: ${check.label}${suffix}`,
      equationText: check.equationText,
      excelFormula: resolvedFormula,
      dependencies: check.deps.join(', '),
      locations: `${CHECKS_SHEET}`,
      role: 'check',
    });
  }

  /* ════════════════════════════════════════════════════════
   *  PUBLIC ACCESSORS (for advanced use / model extensions)
   * ════════════════════════════════════════════════════════ */

  /** Get the resolved address map (key → {sheet, row, columns}). */
  getResolvedAddresses(): Map<string, ResolvedAddress> {
    return new Map(this.resolved);
  }

  /** Get the period definitions. */
  getPeriods(): PeriodDef[] {
    return [...this.periods];
  }

  /** Get the underlying workbook (before build completes). */
  getWorkbook(): ExcelJS.Workbook {
    return this.wb;
  }

  /** Get a sheet by definition name. */
  getSheetByName(name: string): ExcelJS.Worksheet | undefined {
    return this.sheets.get(name);
  }

  /** Resolve a single formula template for a given period (for external use). */
  resolveFormula(template: string, period: string): string {
    return this.resolveFormulaTemplate(template, period);
  }
}

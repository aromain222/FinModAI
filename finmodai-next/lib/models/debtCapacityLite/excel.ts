import ExcelJS from 'exceljs';
import type { DebtCapacityLiteSummary } from '@/lib/models/debtCapacityLite';
import {
  applyWorkbookDefaults,
  applySheetDefaults,
  setColumnWidths,
  hideUnusedArea,
  titleBar,
  sectionHeader,
  tableHeader,
  inputCell,
  outputCell,
  bodyCell,
  applyNumFmt,
  borderBox,
  NUM_FMT,
} from '@/lib/excel/styleKit';

type GenerateDebtCapacityLiteWorkbookParams = {
  ticker: string;
  summary: DebtCapacityLiteSummary;
  asOfDate?: string;
};

const formatDate = (value?: string): string => {
  if (!value) return new Date().toISOString().slice(0, 10);
  return value;
};

const setLeftLabelCell = (cell: ExcelJS.Cell): void => {
  bodyCell(cell);
  cell.alignment = { ...(cell.alignment || {}), horizontal: 'left' };
};

const writeTableRow = (
  sheet: ExcelJS.Worksheet,
  row: number,
  label: string,
  value: number | string | null | undefined,
  format: 'money' | 'percent' | 'multiple' | 'number' | 'text',
  style: 'input' | 'output' | 'body'
) => {
  const labelCell = sheet.getCell(row, 1);
  labelCell.value = label;
  setLeftLabelCell(labelCell);

  const valueCell = sheet.getCell(row, 2);
  const styleFn = style === 'input' ? inputCell : style === 'output' ? outputCell : bodyCell;
  styleFn(valueCell);
  valueCell.alignment = { ...(valueCell.alignment || {}), horizontal: 'right' };

  if (value === null || value === undefined) {
    valueCell.value = 'N/A';
    valueCell.alignment = { ...(valueCell.alignment || {}), horizontal: 'left' };
    return;
  }

  if (typeof value === 'string') {
    valueCell.value = value;
    valueCell.alignment = { ...(valueCell.alignment || {}), horizontal: 'left' };
    return;
  }

  valueCell.value = value;
  if (format === 'money') {
    valueCell.numFmt = NUM_FMT.fmtMoney1;
  } else if (format === 'percent') {
    applyNumFmt(valueCell, 'fmtPercent2');
  } else if (format === 'multiple') {
    applyNumFmt(valueCell, 'fmtMultiple2');
  } else if (format === 'number') {
    applyNumFmt(valueCell, 'fmtNumber2');
  }
};

export async function generateDebtCapacityLiteWorkbook(
  params: GenerateDebtCapacityLiteWorkbookParams
): Promise<ExcelJS.Workbook> {
  const { ticker, summary } = params;
  const asOfDate = formatDate(params.asOfDate);

  const workbook = new ExcelJS.Workbook();
  applyWorkbookDefaults(workbook, { company: 'CapitalBase' });

  const sheet = workbook.addWorksheet('Debt Capacity');
  setColumnWidths(sheet, [36, 22, 24]);
  let row = titleBar(sheet, `${ticker} - Debt Capacity Lite`, 3);

  sheet.mergeCells(row, 1, row, 3);
  const asOfCell = sheet.getCell(row, 1);
  asOfCell.value = `As of ${asOfDate} | ${summary.label}`;
  asOfCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF4B5563' } };
  asOfCell.alignment = { horizontal: 'left', vertical: 'middle' };
  row += 2;

  sectionHeader(sheet, row, 'Inputs', 3);
  row += 1;
  sheet.getCell(row, 1).value = 'Assumption';
  sheet.getCell(row, 2).value = 'Value';
  sheet.getCell(row, 3).value = 'Notes';
  tableHeader(sheet, row, 1, 3);
  row += 1;

  writeTableRow(sheet, row, 'EBITDA', summary.inputs.ebitda, 'money', 'input');
  sheet.getCell(row, 3).value = 'Demo LTM EBITDA';
  setLeftLabelCell(sheet.getCell(row, 3));
  row += 1;

  writeTableRow(sheet, row, 'Max Leverage', summary.inputs.maxLeverage, 'multiple', 'input');
  sheet.getCell(row, 3).value = 'Constraint 1';
  setLeftLabelCell(sheet.getCell(row, 3));
  row += 1;

  writeTableRow(sheet, row, 'Min Interest Coverage', summary.inputs.minInterestCoverage, 'multiple', 'input');
  sheet.getCell(row, 3).value = 'Constraint 2';
  setLeftLabelCell(sheet.getCell(row, 3));
  row += 1;

  writeTableRow(sheet, row, 'Interest Rate', summary.inputs.interestRate, 'percent', 'input');
  sheet.getCell(row, 3).value = 'Annualized rate';
  setLeftLabelCell(sheet.getCell(row, 3));
  row += 1;

  writeTableRow(sheet, row, 'Current Net Debt', summary.currentNetDebt, 'money', 'input');
  sheet.getCell(row, 3).value = 'If available';
  setLeftLabelCell(sheet.getCell(row, 3));
  row += 2;

  sectionHeader(sheet, row, 'Debt Capacity Outputs', 3);
  row += 1;
  sheet.getCell(row, 1).value = 'Metric';
  sheet.getCell(row, 2).value = 'Value';
  sheet.getCell(row, 3).value = 'Definition';
  tableHeader(sheet, row, 1, 3);
  row += 1;

  writeTableRow(sheet, row, 'Leverage-Based Cap', summary.leverageCap, 'money', 'output');
  sheet.getCell(row, 3).value = 'EBITDA × max leverage';
  setLeftLabelCell(sheet.getCell(row, 3));
  row += 1;

  writeTableRow(sheet, row, 'Coverage-Based Cap', summary.coverageCap, 'money', 'output');
  sheet.getCell(row, 3).value = 'EBITDA ÷ min coverage ÷ interest rate';
  setLeftLabelCell(sheet.getCell(row, 3));
  row += 1;

  writeTableRow(sheet, row, 'Selected Max Debt', summary.maxDebt, 'money', 'output');
  sheet.getCell(row, 3).value = 'Lower of leverage/coverage caps';
  setLeftLabelCell(sheet.getCell(row, 3));
  row += 1;

  writeTableRow(
    sheet,
    row,
    'Binding Constraint',
    summary.bindingConstraint === 'leverage' ? 'Leverage' : 'Coverage',
    'text',
    'output'
  );
  sheet.getCell(row, 3).value = 'Constraint driving max debt';
  setLeftLabelCell(sheet.getCell(row, 3));
  row += 1;

  writeTableRow(sheet, row, 'Headroom vs Net Debt', summary.headroomVsNetDebt, 'money', 'output');
  sheet.getCell(row, 3).value = 'Selected max debt minus current net debt';
  setLeftLabelCell(sheet.getCell(row, 3));
  row += 2;

  sectionHeader(sheet, row, 'Model Notes', 3);
  row += 1;
  sheet.mergeCells(row, 1, row, 3);
  const notesCell = sheet.getCell(row, 1);
  notesCell.value =
    'Demo assumptions only. Use this as a quick screen before full capital structure or covenant modeling.';
  notesCell.font = { name: 'Calibri', size: 10, color: { argb: 'FF4B5563' } };
  notesCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  sheet.getRow(row).height = 28;

  borderBox(sheet, 7, 1, row - 1, 3);
  applySheetDefaults(sheet, { freezeRow: 6, freezeCol: 1, headerRowCount: 6, lastCol: 3, lastRow: row });
  hideUnusedArea(sheet, 3, row + 1);

  return workbook;
}

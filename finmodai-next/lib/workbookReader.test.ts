import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { readNamedNumber } from '@/lib/workbookReader';

describe('readNamedNumber', () => {
  it('returns missing reason when named range is absent', () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Sheet1');

    const result = readNamedNumber(workbook, 'CB_OUT_SHARES_OUT');

    expect(result.value).toBeUndefined();
    expect(result.missing).toMatch(/does not exist/);
  });
});

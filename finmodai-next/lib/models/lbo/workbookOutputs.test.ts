import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { readLboValuationOutputs } from '@/lib/models/lbo/workbookOutputs';
import { addNamedRangeSafe } from '@/lib/excel/namedRanges';

describe('readLboValuationOutputs', () => {
  it('reads named ranges and computes price per share', () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('LBO');

    sheet.getCell('B2').value = 500;
    sheet.getCell('B3').value = 200;
    sheet.getCell('B4').value = 300;
    sheet.getCell('B5').value = 100;
    sheet.getCell('B6').value = 25;
    sheet.getCell('B7').value = 2.5;
    sheet.getCell('B8').value = 'mm';

    addNamedRangeSafe(workbook, { name: 'CB_OUT_ENTERPRISE_VALUE', ref: 'LBO!$B$2' });
    addNamedRangeSafe(workbook, { name: 'CB_OUT_NET_DEBT', ref: 'LBO!$B$3' });
    addNamedRangeSafe(workbook, { name: 'CB_OUT_EQUITY_VALUE', ref: 'LBO!$B$4' });
    addNamedRangeSafe(workbook, { name: 'CB_OUT_SHARES_OUT', ref: 'LBO!$B$5' });
    addNamedRangeSafe(workbook, { name: 'CB_OUT_IRR', ref: 'LBO!$B$6' });
    addNamedRangeSafe(workbook, { name: 'CB_OUT_MOIC', ref: 'LBO!$B$7' });
    addNamedRangeSafe(workbook, { name: 'CB_META_UNITS', ref: 'LBO!$B$8' });

    

    const outputs = readLboValuationOutputs(workbook);

    expect(outputs.enterpriseValue.value).toBe(500);
    expect(outputs.equityValue.value).toBe(300);
    expect(outputs.pricePerShare.value).toBe(3);
    expect(outputs.units.value).toBe('mm');
  });
});

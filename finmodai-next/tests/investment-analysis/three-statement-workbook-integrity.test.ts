import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkbook } from '@/lib/model-generator/templates/threeStatement';

test('three-statement workbook uses direct resolving formulas for hardcoded company runs', async () => {
  const workbook = await buildWorkbook({
    modelType: 'THREE_STATEMENT',
    companyName: 'Micron Technologies',
    ticker: 'MU',
    source: 'catalog_company',
    years: 5,
    baseRevenue: 30_000,
    revenueGrowth: [0.1, 0.09, 0.08, 0.07, 0.06],
    grossMargin: 0.38,
    opexPctRevenue: 0.19,
    taxRate: 0.21,
    capexPctRevenue: 0.08,
    daPctRevenue: 0.05,
    debt: 5_000,
    cash: 3_000,
  });

  assert.equal(workbook.model.definedNames?.length ?? 0, 0);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), [
    'Control Panel',
    'Income Statement',
    'Balance Sheet',
    'Cash Flow',
    'Working Capital Schedule',
    'PP&E & Depreciation',
    'Debt Schedule',
    'Checks',
    'Equations',
  ]);

  const incomeStatement = workbook.getWorksheet('Income Statement');
  const balanceSheet = workbook.getWorksheet('Balance Sheet');
  const cashFlow = workbook.getWorksheet('Cash Flow');
  if (!incomeStatement || !balanceSheet || !cashFlow) assert.fail('expected core statements');
  assert.equal(
    (incomeStatement.getCell('C5').value as { formula: string }).formula,
    "='Working Capital Schedule'!$C$5",
  );
  assert.equal(
    (balanceSheet.getCell('B19').value as { formula: string }).formula,
    "='Control Panel'!$B$28+'Income Statement'!$B$16",
  );
  assert.equal(
    (balanceSheet.getCell('C19').value as { formula: string }).formula,
    "='Balance Sheet'!$B$19+'Income Statement'!$C$16",
  );
  assert.equal(
    (cashFlow.getCell('B13').value as { formula: string }).formula,
    "='Control Panel'!$B$13+B12",
  );
  assert.equal(
    (cashFlow.getCell('C13').value as { formula: string }).formula,
    '=B13+C12',
  );

  const buffer = await workbook.xlsx.writeBuffer();
  assert.ok((buffer as ArrayBuffer | Uint8Array).byteLength > 0);
});

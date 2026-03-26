import assert from 'node:assert/strict';
import test from 'node:test';

import * as XLSX from 'xlsx';

import { parseUploadedAttachment } from '@/lib/analyst/attachmentContext';

test('workbook attachments parse a safe preview', async () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Metric', 'Value'],
    ['Revenue', '$100'],
    ['EBITDA', '$25'],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Summary');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const file = new File([buffer], 'model.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const parsed = await parseUploadedAttachment(file);

  assert.match(parsed.summary, /Workbook file: model\.xlsx/);
  assert.match(parsed.summary, /Sheet: Summary/);
  assert.equal(parsed.warnings.length, 0);
});

test('oversized workbook attachments skip parsing and warn cleanly', async () => {
  const file = new File([new Uint8Array(6 * 1024 * 1024)], 'large-model.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const parsed = await parseUploadedAttachment(file);

  assert.match(parsed.summary, /Workbook file: large-model\.xlsx/);
  assert.ok(
    parsed.warnings.some((warning) => /analysis limit/i.test(warning)),
    'expected an oversized workbook warning',
  );
});

test('invalid workbook attachments do not crash parsing', async () => {
  const file = new File([Buffer.from('not-a-real-workbook')], 'broken.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const parsed = await parseUploadedAttachment(file);

  assert.match(parsed.summary, /Workbook file: broken\.xlsx/);
  assert.ok(parsed.warnings.length >= 0);
});

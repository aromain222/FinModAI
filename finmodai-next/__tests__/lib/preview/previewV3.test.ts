import { describe, it, expect } from 'vitest';
import { buildPreviewV3FromUnknown } from '@/lib/preview/previewV3';

describe('buildPreviewV3FromUnknown with workbook shapes', () => {
  it('skips drawings/shapes and still returns preview for workbook sheets', () => {
    const mockWorkbook = {
      sheets: [
        {
          name: 'LBO Model',
          rows: [
            ['Label', 'Value'],
            ['Enterprise Value', 1200],
            ['Net Debt', 400],
          ],
          drawings: [{ type: 'shape' }, { type: 'chart' }],
        },
      ],
    };

    const result = buildPreviewV3FromUnknown(mockWorkbook);
    expect(result.preview).toBeTruthy();
    expect(result.preview?.columns.length).toBeGreaterThan(0);
    expect(result.preview?.rows.length).toBeGreaterThan(0);
    expect(result.reason).toBeUndefined();
  });
});

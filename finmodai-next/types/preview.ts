export type PreviewV2 = {
  version: 2;
  sheetName: string;
  columns: string[];
  rows: (string | number | null)[][];
  meta?: { generatedAt?: string; note?: string };
};

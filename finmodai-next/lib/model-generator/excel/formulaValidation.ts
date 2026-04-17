import ExcelJS from 'exceljs';

const DEFAULT_ALLOWED_FUNCTIONS = new Set([
  'ABS',
  'AND',
  'AVERAGE',
  'COUNTA',
  'IF',
  'MAX',
  'MEDIAN',
  'MIN',
  'OR',
  'ROUND',
  'SUM',
]);

export function validateWorkbookFormulaTokens(
  workbook: ExcelJS.Workbook,
  options?: { allowedFunctions?: string[] }
): void {
  const allowedFunctions = new Set(
    (options?.allowedFunctions ?? []).map((token) => token.toUpperCase())
  );
  for (const token of DEFAULT_ALLOWED_FUNCTIONS) {
    allowedFunctions.add(token);
  }

  const definedNames = new Set(
    ((workbook.model.definedNames ?? []) as Array<{ name?: string }>).flatMap((entry) =>
      entry?.name ? [String(entry.name)] : []
    )
  );

  const unresolved: string[] = [];
  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const value = cell.value;
        if (!value || typeof value !== 'object' || !('formula' in value) || typeof value.formula !== 'string') {
          return;
        }

        const stripped = value.formula
          .replace(/^=/, '')
          .replace(/'[^']+'!/g, '')
          .replace(/\$?[A-Z]{1,3}\$?\d+/g, ' ')
          .replace(/"[^"]*"/g, ' ');
        const tokens = stripped.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) ?? [];
        for (const token of tokens) {
          const upper = token.toUpperCase();
          if (allowedFunctions.has(upper) || definedNames.has(token)) continue;
          unresolved.push(`${sheet.name}!${cell.address}:${token}`);
        }
      });
    });
  });

  if (unresolved.length > 0) {
    throw new Error(`Workbook contains unresolved formula tokens: ${unresolved.slice(0, 10).join(', ')}`);
  }
}

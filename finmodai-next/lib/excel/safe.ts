// src/lib/excel/safe.ts
import type ExcelJS from "exceljs";
import {
  assertValidA1Address,
  assertValidA1Range,
  assertValidNamedRangeName,
  assertValidDefinedNameRef,
  toExcelJSRef,
} from "./address";

export function safeGetCell(ws: ExcelJS.Worksheet, a1: string, ctx?: string) {
  const addr = assertValidA1Address(a1, ctx);
  return ws.getCell(addr);
}

/**
 * @deprecated Use addNamedRangeSafe from lib/excel/namedRanges.ts with named params instead
 * Thin wrapper for backward compatibility
 */
export function safeAddDefinedName(
  wb: ExcelJS.Workbook,
  name: string,
  ref: string, // A1 or A1:B2 or Sheet!$A$1 or 'DCF Model'!$A$1
  ctx?: string
) {
  // Import the new API
  const { addNamedRangeSafe: addNamedRangeSafeNew } = require('@/lib/excel/namedRanges');
  
  // Call with named params
  addNamedRangeSafeNew(wb, {
    name,
    ref,
    context: ctx ? { ctx } : undefined
  });
}

/**
 * Formula-Linking Standard — Public API
 *
 * Usage:
 *   import { FormulaLinkedBuilder, validateModelDefinition } from '@/lib/excel/formulaLinking';
 *
 *   const errors = validateModelDefinition(myModelDef);
 *   if (errors.some(e => e.severity === 'error')) throw new Error('Invalid model');
 *
 *   const builder = new FormulaLinkedBuilder(myModelDef);
 *   const workbook = await builder.build();
 */

export { FormulaLinkedBuilder } from './builder';
export { validateModelDefinition, getPostBuildChecklist } from './validate';
export type {
  FormulaLinkedModelDef,
  InputSpec,
  LineItemSpec,
  CheckSpec,
  SectionSpec,
  SheetSpec,
  PeriodDef,
  ResolvedAddress,
  EquationsRow,
  CellFormat,
  CellRole,
  PeriodSuffix,
} from './types';
export type { ValidationError, PostBuildCheck } from './validate';

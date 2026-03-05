import type { Workbook } from 'exceljs';
import type { ZodTypeAny } from 'zod';
import type { UISchema } from '@/lib/models/core/uiSchema';

export type ModelCategory = 'Accounting' | 'Corporate Finance' | 'VC' | 'Banking';

export type ModelDef<TInput = unknown, TOutput = unknown> = {
  slug: string;
  name: string;
  category: ModelCategory;
  description: string;
  inputSchema: ZodTypeAny;
  uiSchema: UISchema;
  compute: (input: TInput) => TOutput;
  buildWorkbook: (input: TInput, output: TOutput) => Promise<Workbook>;
  filename: (input: TInput) => string;
};

export type AnyModelDef = ModelDef<any, any>;

export type ModelMeta = Pick<ModelDef, 'slug' | 'name' | 'category' | 'description'>;

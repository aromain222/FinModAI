export type FieldType = 'text' | 'number' | 'currency' | 'percent' | 'select' | 'repeatableRows';

export type SelectOption = {
  label: string;
  value: string;
};

type ScalarFieldType = Exclude<FieldType, 'repeatableRows'>;

export type ScalarFieldDef = {
  key: string;
  label: string;
  type: ScalarFieldType;
  helpText?: string;
  required?: boolean;
  options?: SelectOption[];
  defaultValue?: string | number;
};

export type RepeatableColumnDef = {
  key: string;
  label: string;
  type: ScalarFieldType;
  helpText?: string;
  required?: boolean;
  options?: SelectOption[];
  defaultValue?: string | number;
};

export type RepeatableRowsFieldDef = {
  key: string;
  label: string;
  type: 'repeatableRows';
  helpText?: string;
  required?: boolean;
  minRows?: number;
  maxRows?: number;
  rowsSpec: RepeatableColumnDef[];
  defaultRows?: Array<Record<string, string | number>>;
};

export type FieldDef = ScalarFieldDef | RepeatableRowsFieldDef;

export type UISection = {
  title: string;
  description?: string;
  fields: FieldDef[];
};

export type UISchema = {
  sections: UISection[];
};

function coerceDefault(value: string | number | undefined): string {
  if (value === undefined || value === null) return '';
  return String(value);
}

export function buildDefaultFormState(schema: UISchema): Record<string, unknown> {
  const state: Record<string, unknown> = {};

  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (field.type === 'repeatableRows') {
        if (field.defaultRows && field.defaultRows.length > 0) {
          state[field.key] = field.defaultRows.map((row) => {
            const next: Record<string, string> = {};
            for (const col of field.rowsSpec) {
              next[col.key] = coerceDefault(row[col.key] as string | number | undefined);
            }
            return next;
          });
        } else {
          const min = Math.max(field.minRows ?? 0, field.required ? 1 : 0);
          state[field.key] = Array.from({ length: min }, () => {
            const next: Record<string, string> = {};
            for (const col of field.rowsSpec) {
              next[col.key] = coerceDefault(col.defaultValue);
            }
            return next;
          });
        }
      } else {
        state[field.key] = coerceDefault(field.defaultValue);
      }
    }
  }

  return state;
}

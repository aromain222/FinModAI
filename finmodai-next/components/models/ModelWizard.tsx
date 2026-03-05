'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
  FieldDef,
  RepeatableColumnDef,
  RepeatableRowsFieldDef,
  ScalarFieldDef,
  UISchema,
} from '@/lib/models/core/uiSchema';
import { buildDefaultFormState } from '@/lib/models/core/uiSchema';

type ModelWizardProps = {
  slug: string;
  name: string;
  description: string;
  uiSchema: UISchema;
};

type FormState = Record<string, unknown>;
type FieldErrorMap = Record<string, string>;

type DownloadState = {
  fileUrl: string;
  filename: string;
};

function toPathSegments(path: string): string[] {
  return path.split('.').filter(Boolean);
}

function setDeep(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = toPathSegments(path);
  if (segments.length === 0) return;

  let cursor: Record<string, unknown> = target;

  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    const existing = cursor[segment];

    if (typeof existing === 'object' && existing !== null && !Array.isArray(existing)) {
      cursor = existing as Record<string, unknown>;
    } else {
      const next: Record<string, unknown> = {};
      cursor[segment] = next;
      cursor = next;
    }
  }

  cursor[segments[segments.length - 1]] = value;
}

function parseNumberLike(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseScalarValue(field: ScalarFieldDef, raw: string): string | number | undefined {
  if (field.type === 'text' || field.type === 'select') {
    const trimmed = raw.trim();
    return trimmed ? trimmed : undefined;
  }

  const parsed = parseNumberLike(raw);
  return parsed === null ? undefined : parsed;
}

function defaultRepeatRow(field: RepeatableRowsFieldDef): Record<string, string> {
  const row: Record<string, string> = {};
  for (const col of field.rowsSpec) {
    if (col.defaultValue === undefined || col.defaultValue === null) {
      row[col.key] = '';
    } else {
      row[col.key] = String(col.defaultValue);
    }
  }
  return row;
}

function parseContentDispositionFilename(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? null;
}

function validateScalarField(field: ScalarFieldDef, value: string): string | null {
  const trimmed = value.trim();

  if (field.required && !trimmed) {
    return `${field.label} is required`;
  }

  if (!trimmed) {
    return null;
  }

  if (field.type === 'number' || field.type === 'currency' || field.type === 'percent') {
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return `${field.label} must be numeric`;
    }
  }

  if (field.type === 'select' && field.options && field.options.length > 0) {
    const valid = field.options.some((option) => option.value === trimmed);
    if (!valid) {
      return `${field.label} has an invalid option`;
    }
  }

  return null;
}

function validateRepeatableField(field: RepeatableRowsFieldDef, rows: Array<Record<string, string>>, errors: FieldErrorMap): void {
  const minRows = Math.max(field.minRows ?? 0, field.required ? 1 : 0);
  if (rows.length < minRows) {
    errors[field.key] = `${field.label} requires at least ${minRows} row${minRows === 1 ? '' : 's'}`;
    return;
  }

  rows.forEach((row, rowIndex) => {
    field.rowsSpec.forEach((col) => {
      const raw = String(row[col.key] ?? '');
      const key = `${field.key}.${rowIndex}.${col.key}`;

      if (col.required && !raw.trim()) {
        errors[key] = `${col.label} is required`;
        return;
      }

      if (!raw.trim()) return;

      if (col.type === 'number' || col.type === 'currency' || col.type === 'percent') {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) {
          errors[key] = `${col.label} must be numeric`;
          return;
        }
      }

      if (col.type === 'select' && col.options && col.options.length > 0) {
        const valid = col.options.some((option) => option.value === raw.trim());
        if (!valid) {
          errors[key] = `${col.label} has an invalid option`;
        }
      }
    });
  });
}

function fieldInputStep(type: ScalarFieldDef['type']): string | undefined {
  if (type === 'number') return '1';
  if (type === 'currency') return '0.01';
  if (type === 'percent') return '0.0001';
  return undefined;
}

function coerceRepeatableCell(column: RepeatableColumnDef, raw: string): string | number | undefined {
  if (column.type === 'text' || column.type === 'select') {
    const trimmed = raw.trim();
    return trimmed ? trimmed : undefined;
  }

  const parsed = parseNumberLike(raw);
  return parsed === null ? undefined : parsed;
}

export function ModelWizard({ slug, name, description, uiSchema }: ModelWizardProps) {
  const [formState, setFormState] = useState<FormState>(() => buildDefaultFormState(uiSchema));
  const [companyName, setCompanyName] = useState('');
  const [workbookAccent, setWorkbookAccent] = useState<'slate' | 'emerald' | 'blue' | 'amber' | 'rose'>('slate');
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [download, setDownload] = useState<DownloadState | null>(null);

  useEffect(() => {
    return () => {
      if (download?.fileUrl) {
        URL.revokeObjectURL(download.fileUrl);
      }
    };
  }, [download?.fileUrl]);

  const sectionCount = useMemo(() => uiSchema.sections.length, [uiSchema.sections.length]);

  const setScalarValue = (key: string, value: string) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const getRepeatableRows = (fieldKey: string): Array<Record<string, string>> => {
    const value = formState[fieldKey];
    if (!Array.isArray(value)) return [];
    return value.map((row) => {
      if (typeof row === 'object' && row !== null && !Array.isArray(row)) {
        const converted: Record<string, string> = {};
        Object.entries(row).forEach(([k, v]) => {
          converted[k] = String(v ?? '');
        });
        return converted;
      }
      return {};
    });
  };

  const setRepeatableRows = (fieldKey: string, rows: Array<Record<string, string>>) => {
    setFormState((prev) => ({ ...prev, [fieldKey]: rows }));
    setFieldErrors((prev) => {
      const next: FieldErrorMap = {};
      Object.entries(prev).forEach(([errorKey, message]) => {
        if (!(errorKey === fieldKey || errorKey.startsWith(`${fieldKey}.`))) {
          next[errorKey] = message;
        }
      });
      return next;
    });
  };

  const buildPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {};

    const trimmedCompanyName = companyName.trim();
    if (trimmedCompanyName.length > 0) {
      payload.companyName = trimmedCompanyName;
    }
    payload.workbookAccent = workbookAccent;

    uiSchema.sections.forEach((section) => {
      section.fields.forEach((field) => {
        if (field.type === 'repeatableRows') {
          const rows = getRepeatableRows(field.key);
          const parsedRows = rows.map((row) => {
            const nextRow: Record<string, unknown> = {};
            field.rowsSpec.forEach((column) => {
              const coerced = coerceRepeatableCell(column, String(row[column.key] ?? ''));
              if (coerced !== undefined) {
                nextRow[column.key] = coerced;
              }
            });
            return nextRow;
          });
          setDeep(payload, field.key, parsedRows);
        } else {
          const raw = String(formState[field.key] ?? '');
          const parsed = parseScalarValue(field, raw);
          if (parsed !== undefined) {
            setDeep(payload, field.key, parsed);
          }
        }
      });
    });

    return payload;
  };

  const runLocalValidation = (): boolean => {
    const nextErrors: FieldErrorMap = {};

    uiSchema.sections.forEach((section) => {
      section.fields.forEach((field) => {
        if (field.type === 'repeatableRows') {
          validateRepeatableField(field, getRepeatableRows(field.key), nextErrors);
        } else {
          const raw = String(formState[field.key] ?? '');
          const error = validateScalarField(field, raw);
          if (error) {
            nextErrors[field.key] = error;
          }
        }
      });
    });

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    setGlobalError(null);

    const trimmedCompanyName = companyName.trim();
    if (trimmedCompanyName.length > 160) {
      setGlobalError('Company name must be 160 characters or fewer');
      return;
    }

    if (!runLocalValidation()) {
      return;
    }

    setLoading(true);
    try {
      const payload = buildPayload();
      const requestOptions: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        body: JSON.stringify(payload),
      };
      // Primary endpoint for workbook generation.
      let response = await fetch(
        `/api/models/${encodeURIComponent(slug)}/generate?format=xlsx`,
        requestOptions,
      );

      // Compatibility fallback for deployments that still expose
      // direct workbook generation on `/api/models/[modelId]`.
      if (response.status === 404) {
        response = await fetch(`/api/models/${encodeURIComponent(slug)}`, requestOptions);
      }

      if (!response.ok) {
        const rawErrorBody = await response.text().catch(() => '');
        const errorBody = (() => {
          try {
            return JSON.parse(rawErrorBody) as
              | { error?: string; message?: string; fieldErrors?: FieldErrorMap }
              | null;
          } catch {
            return null;
          }
        })();
        const parsedErrorBody = errorBody as
          | { error?: string; fieldErrors?: FieldErrorMap }
          | null;

        if (parsedErrorBody?.fieldErrors) {
          setFieldErrors(parsedErrorBody.fieldErrors);
        }

        const fallbackText =
          rawErrorBody && !rawErrorBody.trim().startsWith('<')
            ? rawErrorBody.trim().slice(0, 240)
            : null;

        throw new Error(
          errorBody?.error ||
            errorBody?.message ||
            fallbackText ||
            `Failed to generate workbook (HTTP ${response.status})`
        );
      }

      const blob = await response.blob();
      const fileUrl = URL.createObjectURL(blob);
      const filename =
        parseContentDispositionFilename(response.headers.get('Content-Disposition')) ||
        `CapitalBase_${slug}.xlsx`;

      if (download?.fileUrl) {
        URL.revokeObjectURL(download.fileUrl);
      }

      setDownload({ fileUrl, filename });
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'Failed to generate workbook');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-3xl border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] shadow-none">
        <div className="h-1 w-full bg-gradient-to-r from-[var(--cb-green)]/80 via-[var(--cb-green)]/30 to-transparent" />
        <CardHeader className="space-y-3 border-b border-[var(--cb-border-subtle)] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.005))]">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="inline-flex w-fit items-center rounded-full border border-[var(--cb-border-subtle)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">
                Template Wizard
              </div>
              <CardTitle className="text-2xl text-[var(--cb-text-primary)]">{name}</CardTitle>
              <CardDescription className="max-w-3xl text-sm leading-6">{description}</CardDescription>
            </div>
            <div className="inline-flex w-fit items-center rounded-full border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] px-3 py-1 text-xs font-medium text-[var(--cb-text-secondary)]">
              {sectionCount} section{sectionCount === 1 ? '' : 's'}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 p-5 md:p-6">
          <section className="grid gap-4 rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="company-name-input">Company Name (optional)</Label>
              <Input
                id="company-name-input"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="e.g., SoFi Technologies"
                maxLength={160}
              />
              <p className="text-xs text-[var(--cb-text-secondary)]">
                Used for workbook labeling and download filename. Models still run without it.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="workbook-accent-select">Workbook Accent</Label>
              <select
                id="workbook-accent-select"
                value={workbookAccent}
                onChange={(event) =>
                  setWorkbookAccent(event.target.value as 'slate' | 'emerald' | 'blue' | 'amber' | 'rose')
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="slate">Slate (Default)</option>
                <option value="emerald">Emerald</option>
                <option value="blue">Blue</option>
                <option value="amber">Amber</option>
                <option value="rose">Rose</option>
              </select>
              <p className="text-xs text-[var(--cb-text-secondary)]">
                Applies header/input styling accent in the downloaded workbook.
              </p>
            </div>
          </section>

          {uiSchema.sections.map((section) => (
            <section
              key={section.title}
              className="space-y-4 rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4 md:p-5"
            >
              <div className="border-b border-[var(--cb-border-subtle)] pb-3">
                <h3 className="text-base font-semibold text-[var(--cb-text-primary)]">{section.title}</h3>
                {section.description && (
                  <p className="mt-1 text-sm leading-6 text-[var(--cb-text-secondary)]">{section.description}</p>
                )}
              </div>

              <div className="space-y-4">
                {section.fields.map((field) =>
                  field.type === 'repeatableRows' ? (
                    <RepeatableRowsField
                      key={field.key}
                      field={field}
                      rows={getRepeatableRows(field.key)}
                      errors={fieldErrors}
                      onChange={(rows) => setRepeatableRows(field.key, rows)}
                    />
                  ) : (
                    <ScalarField
                      key={field.key}
                      field={field}
                      value={String(formState[field.key] ?? '')}
                      error={fieldErrors[field.key]}
                      onChange={(value) => setScalarValue(field.key, value)}
                    />
                  ),
                )}
              </div>
            </section>
          ))}

          <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button onClick={handleSubmit} disabled={loading} className="sm:min-w-[220px]">
              {loading ? 'Generating Workbook...' : 'Generate Workbook'}
              </Button>
              <p className="text-xs text-[var(--cb-text-secondary)]">
                CapitalBase will generate a deterministic `.xlsx` workbook from these inputs.
              </p>
            </div>
            {globalError && <p className="mt-3 text-sm text-red-500">{globalError}</p>}
          </div>
        </CardContent>
      </Card>

      {download && (
        <Card className="rounded-3xl border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] shadow-none">
          <CardHeader>
            <CardTitle>Workbook Ready</CardTitle>
            <CardDescription>Your deterministic model workbook has been generated and is ready to download.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[var(--cb-text-secondary)]">{download.filename}</p>
            <Button asChild>
              <a href={download.fileUrl} download={download.filename}>
                Download .xlsx
              </a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type ScalarFieldProps = {
  field: ScalarFieldDef;
  value: string;
  error?: string;
  onChange: (value: string) => void;
};

function ScalarField({ field, value, error, onChange }: ScalarFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={field.key}>{field.label}</Label>
      {field.type === 'select' ? (
        <select
          id={field.key}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Select...</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={field.key}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={field.type === 'text' ? 'text' : 'number'}
          step={fieldInputStep(field.type)}
        />
      )}
      {field.helpText && <p className="text-xs text-[var(--cb-text-secondary)]">{field.helpText}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

type RepeatableRowsFieldProps = {
  field: RepeatableRowsFieldDef;
  rows: Array<Record<string, string>>;
  errors: FieldErrorMap;
  onChange: (rows: Array<Record<string, string>>) => void;
};

function RepeatableRowsField({ field, rows, errors, onChange }: RepeatableRowsFieldProps) {
  const addRow = () => {
    const maxRows = field.maxRows ?? Number.POSITIVE_INFINITY;
    if (rows.length >= maxRows) return;
    onChange([...rows, defaultRepeatRow(field)]);
  };

  const removeRow = (index: number) => {
    const minRows = Math.max(field.minRows ?? 0, field.required ? 1 : 0);
    if (rows.length <= minRows) return;
    onChange(rows.filter((_, i) => i !== index));
  };

  const updateCell = (rowIndex: number, colKey: string, value: string) => {
    const nextRows = rows.map((row, index) => (index === rowIndex ? { ...row, [colKey]: value } : row));
    onChange(nextRows);
  };

  return (
    <div className="space-y-3">
      <div>
        <Label>{field.label}</Label>
        {field.helpText && <p className="text-xs text-[var(--cb-text-secondary)]">{field.helpText}</p>}
      </div>

      <div className="overflow-x-auto rounded-md border border-[var(--cb-border-subtle)]">
        <table className="min-w-full text-sm">
          <thead className="bg-[var(--cb-surface-alt)] text-[var(--cb-text-secondary)]">
            <tr>
              {field.rowsSpec.map((col) => (
                <th key={col.key} className="px-3 py-2 text-left font-semibold">
                  {col.label}
                </th>
              ))}
              <th className="px-3 py-2 text-left font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`} className="border-t border-[var(--cb-border-subtle)]">
                {field.rowsSpec.map((col) => {
                  const errorKey = `${field.key}.${rowIndex}.${col.key}`;
                  const error = errors[errorKey];

                  return (
                    <td key={col.key} className="px-3 py-2 align-top">
                      {col.type === 'select' ? (
                        <select
                          value={row[col.key] ?? ''}
                          onChange={(event) => updateCell(rowIndex, col.key, event.target.value)}
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="">Select...</option>
                          {(col.options ?? []).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          value={row[col.key] ?? ''}
                          onChange={(event) => updateCell(rowIndex, col.key, event.target.value)}
                          type={col.type === 'text' ? 'text' : 'number'}
                          step={fieldInputStep(col.type)}
                        />
                      )}
                      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
                    </td>
                  );
                })}
                <td className="px-3 py-2 align-top">
                  <Button type="button" variant="outline" size="sm" onClick={() => removeRow(rowIndex)}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          Add Row
        </Button>
        {errors[field.key] && <p className="text-xs text-red-500">{errors[field.key]}</p>}
      </div>
    </div>
  );
}

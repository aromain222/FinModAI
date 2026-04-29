import type { StatementExtractionStatus } from '@/lib/analyst/pdfModelSeeding';
import type { AttachmentStatementSnapshot, PdfStatementPackage } from '@/lib/analyst/pdfFinancialStatements';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';

export type CompletionFieldType = 'string' | 'number';

export type MissingFieldSchema = {
  field: keyof AttachmentStatementSnapshot;
  type: CompletionFieldType;
  description: string;
  required?: boolean;
  anyOfGroup?: string;
  allowOverwriteTrustedDeterministic?: boolean;
};

export type AiCompletionSourceTag = 'claude_pdf_extraction' | 'ai_pdf_completion';

export type AiStatementCompletionCandidate = {
  field: keyof AttachmentStatementSnapshot;
  value: string | number;
  confidence: number;
  sourceTag: AiCompletionSourceTag;
  note?: string;
};

export type AiStatementFieldProvenance = {
  sourceTag: 'deterministic_pdf' | AiCompletionSourceTag;
  confidence: number;
  applied: boolean;
  note?: string;
};

export type AiStatementCompletionResult = {
  sourceTag: AiCompletionSourceTag;
  schema: MissingFieldSchema[];
  missingFields: string[];
  candidates: AiStatementCompletionCandidate[];
  fieldProvenance: Partial<Record<keyof AttachmentStatementSnapshot, AiStatementFieldProvenance>>;
  mergedSnapshot: AttachmentStatementSnapshot | null;
  warnings: string[];
};

function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;
  return text.slice(firstBrace, lastBrace + 1);
}

function fieldHasValue(snapshot: AttachmentStatementSnapshot | null | undefined, field: keyof AttachmentStatementSnapshot): boolean {
  if (!snapshot) return false;
  const value = snapshot[field];
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' ? value.trim().length > 0 && value !== 'unknown' : value !== null && value !== undefined;
}

function computeMissingFields(snapshot: AttachmentStatementSnapshot | null | undefined, schema: MissingFieldSchema[]): string[] {
  const missing = new Set<string>();
  const grouped = new Map<string, MissingFieldSchema[]>();

  for (const item of schema) {
    if (item.anyOfGroup) {
      const entries = grouped.get(item.anyOfGroup) ?? [];
      entries.push(item);
      grouped.set(item.anyOfGroup, entries);
      continue;
    }
    if (item.required && !fieldHasValue(snapshot, item.field)) {
      missing.add(String(item.field));
    }
  }

  for (const [groupName, entries] of grouped.entries()) {
    const requiredEntries = entries.filter((entry) => entry.required);
    if (requiredEntries.length === 0) continue;
    const hasAny = requiredEntries.some((entry) => fieldHasValue(snapshot, entry.field));
    if (!hasAny) missing.add(groupName);
  }

  return Array.from(missing);
}

function normalizeCandidateValue(type: CompletionFieldType, value: unknown): string | number | null {
  if (type === 'string') {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,\s]/g, '').trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function shouldRunCompletion(params: {
  status: StatementExtractionStatus | undefined;
  snapshot: AttachmentStatementSnapshot | null;
  schema: MissingFieldSchema[];
}): { run: boolean; missingFields: string[] } {
  const missingFields = computeMissingFields(params.snapshot, params.schema);
  if (params.status !== 'trusted') {
    return { run: true, missingFields };
  }
  return { run: missingFields.length > 0, missingFields };
}

type RawAiPayload = {
  candidates?: Array<{ field?: string; value?: string | number; confidence?: number; note?: string }>;
  warnings?: string[];
  sourceTag?: string;
};

export async function runAiStatementCompletion(params: {
  extractedText: string;
  statementPackage: PdfStatementPackage | undefined;
  statementExtractionStatus: StatementExtractionStatus | undefined;
  missingFieldSchema: MissingFieldSchema[];
  allowOverwriteTrustedDeterministic?: boolean;
}): Promise<AiStatementCompletionResult | null> {
  const snapshot = params.statementPackage?.snapshot ?? null;
  const decision = shouldRunCompletion({
    status: params.statementExtractionStatus,
    snapshot,
    schema: params.missingFieldSchema,
  });
  if (!decision.run) return null;

  const sourceText = params.extractedText.trim();
  if (!sourceText) {
    return {
      sourceTag: 'claude_pdf_extraction',
      schema: params.missingFieldSchema,
      missingFields: decision.missingFields,
      candidates: [],
      fieldProvenance: {},
      mergedSnapshot: snapshot,
      warnings: ['AI completion skipped because no extracted PDF text was available.'],
    };
  }

  const schemaText = params.missingFieldSchema
    .map((item) => `- ${String(item.field)} (${item.type}) required=${item.required ? 'true' : 'false'}${item.anyOfGroup ? ` any_of=${item.anyOfGroup}` : ''}: ${item.description}`)
    .join('\n');

  let rawPayload: RawAiPayload | null = null;
  try {
    const result = await generateTextWithProviderFallback({
      preferredProvider: 'anthropic',
      clientType: 'service',
      temperature: 0,
      maxTokens: 1400,
      messages: [
        {
          role: 'system',
          content:
            'You extract missing financial statement fields from PDF text. Respond with JSON only. Never hallucinate values. Use absolute numbers for monetary and share values.',
        },
        {
          role: 'user',
          content: [
            'Return JSON with shape {"sourceTag":"claude_pdf_extraction","candidates":[{"field":"...","value":...,"confidence":0-1,"note":"..."}],"warnings":["..."]}.',
            `Schema:\n${schemaText}`,
            `Current structured snapshot:\n${JSON.stringify(snapshot ?? null)}`,
            `Missing groups/fields:\n${decision.missingFields.join(', ') || 'none'}`,
            `PDF text excerpt:\n${sourceText.slice(0, 60000)}`,
          ].join('\n\n'),
        },
      ],
    });
    const json = result?.text ? extractJsonObject(result.text) : null;
    rawPayload = json ? (JSON.parse(json) as RawAiPayload) : null;
  } catch {
    rawPayload = null;
  }

  const candidates: AiStatementCompletionCandidate[] = [];
  const fieldProvenance: Partial<Record<keyof AttachmentStatementSnapshot, AiStatementFieldProvenance>> = {};
  const warnings = Array.isArray(rawPayload?.warnings) ? rawPayload!.warnings.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
  const sourceTag: AiCompletionSourceTag = rawPayload?.sourceTag === 'ai_pdf_completion' ? 'ai_pdf_completion' : 'claude_pdf_extraction';

  for (const fieldSchema of params.missingFieldSchema) {
    if (fieldHasValue(snapshot, fieldSchema.field)) {
      fieldProvenance[fieldSchema.field] = {
        sourceTag: 'deterministic_pdf',
        confidence: 1,
        applied: true,
      };
    }
  }

  for (const raw of rawPayload?.candidates ?? []) {
    const fieldSchema = params.missingFieldSchema.find((item) => item.field === raw.field);
    if (!fieldSchema) continue;
    const normalizedValue = normalizeCandidateValue(fieldSchema.type, raw.value);
    if (normalizedValue === null) continue;
    const confidence = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
      ? Math.min(1, Math.max(0, raw.confidence))
      : 0.55;
    candidates.push({
      field: fieldSchema.field,
      value: normalizedValue,
      confidence,
      sourceTag,
      ...(typeof raw.note === 'string' && raw.note.trim() ? { note: raw.note.trim() } : {}),
    });
  }

  if (!snapshot) {
    return {
      sourceTag,
      schema: params.missingFieldSchema,
      missingFields: decision.missingFields,
      candidates,
      fieldProvenance,
      mergedSnapshot: null,
      warnings: [...warnings, 'No deterministic snapshot was available to merge AI candidates into.'],
    };
  }

  const mergedSnapshot: AttachmentStatementSnapshot = {
    ...snapshot,
    warnings: [...snapshot.warnings],
  };

  for (const candidate of candidates) {
    const schema = params.missingFieldSchema.find((item) => item.field === candidate.field);
    if (!schema) continue;
    const hasExisting = fieldHasValue(mergedSnapshot, candidate.field);

    const overwriteTrustedBlocked =
      params.statementExtractionStatus === 'trusted' &&
      hasExisting &&
      !params.allowOverwriteTrustedDeterministic &&
      !schema.allowOverwriteTrustedDeterministic;

    if (overwriteTrustedBlocked) {
      fieldProvenance[candidate.field] = {
        sourceTag: 'deterministic_pdf',
        confidence: 1,
        applied: false,
        note: 'Skipped AI overwrite because deterministic trusted value already exists.',
      };
      continue;
    }

    if (!hasExisting || schema.allowOverwriteTrustedDeterministic || params.allowOverwriteTrustedDeterministic) {
      (mergedSnapshot as Record<string, unknown>)[candidate.field] = candidate.value;
      fieldProvenance[candidate.field] = {
        sourceTag: candidate.sourceTag,
        confidence: candidate.confidence,
        applied: true,
        ...(candidate.note ? { note: candidate.note } : {}),
      };
    }
  }

  return {
    sourceTag,
    schema: params.missingFieldSchema,
    missingFields: decision.missingFields,
    candidates,
    fieldProvenance,
    mergedSnapshot,
    warnings,
  };
}

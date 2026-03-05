export interface ModelReport {
  id: string;
  modelId: string;
  modelType: string;
  ticker: string;
  title: string;
  // Legacy reports are stored as markdown in `content`. Newer report UIs may
  // provide structured fields in addition to (or instead of) markdown.
  content: string;
  format: 'markdown' | 'html' | 'pdf';
  createdAt: string;

  // Optional structured report fields (used by CapitalBaseReportView).
  generatedAt?: string;
  subtitle?: string;
  oneLineSummary?: string;
  keyTakeaways?: string[];
  companySnapshot?: {
    businessModel?: string;
    revenueDrivers?: string[];
    marginProfile?: string;
    capitalStructure?: string;
  };
  valuationSummary?: {
    headline?: string;
    baseCase?: string;
    bullCase?: string;
    bearCase?: string;
    upsideDownsideCommentary?: string;
  };
  macroContext?: {
    regimeLabel?: string;
    themes?: string[];
  };
  riskAndMitigants?: {
    risks?: string[];
    mitigants?: string[];
  };
  processNotes?: string;
}

export interface ReportPayloadSection {
  title: string;
  body: string;
}

export interface StructuredReportPayload {
  title: string;
  summaryText: string;
  generatedAt?: string;
  subtitle?: string;
  oneLineSummary?: string;
  keyTakeaways?: string[];
  sections: ReportPayloadSection[];
}

function normalizeString(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

export function normalizeReportPayload(value: unknown): StructuredReportPayload {
  const payload = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const rawSections = Array.isArray(payload.sections) ? payload.sections : [];

  const sections = rawSections
    .map((section) => {
      const candidate = section && typeof section === 'object' ? (section as Record<string, unknown>) : {};
      const title = normalizeString(candidate.title, 'Untitled Section');
      const body = normalizeString(candidate.body, 'Content unavailable.');
      return { title, body };
    })
    .filter((section) => section.title.length > 0 && section.body.length > 0);

  const title = normalizeString(payload.title, 'CapitalBase Analyst Report');
  const summaryText = normalizeString(payload.summaryText, sections[0]?.body ?? 'Summary unavailable.');

  return {
    title,
    summaryText,
    generatedAt: normalizeString(payload.generatedAt) || undefined,
    subtitle: normalizeString(payload.subtitle) || undefined,
    oneLineSummary: normalizeString(payload.oneLineSummary) || undefined,
    keyTakeaways: normalizeStringArray(payload.keyTakeaways),
    sections: sections.length > 0 ? sections : [{ title: 'Summary', body: summaryText }],
  };
}

export function validateReportPayload(value: unknown): value is StructuredReportPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  if (typeof payload.title !== 'string' || payload.title.trim().length === 0) return false;
  if (typeof payload.summaryText !== 'string' || payload.summaryText.trim().length === 0) return false;
  if (!Array.isArray(payload.sections) || payload.sections.length === 0) return false;

  return payload.sections.every((section) => {
    if (!section || typeof section !== 'object') return false;
    const candidate = section as Record<string, unknown>;
    return (
      typeof candidate.title === 'string' &&
      candidate.title.trim().length > 0 &&
      typeof candidate.body === 'string' &&
      candidate.body.trim().length > 0
    );
  });
}

/**
 * Canonical report structure - all reports must conform to this shape
 */

export type ReportModelType = 'DCF' | 'LBO' | 'ThreeStatement' | 'COMPS';

export interface ReportSection {
  title: string;
  body: string;
}

export interface ReportPayload {
  ticker: string;
  modelType: ReportModelType;
  sections: ReportSection[];
}

/**
 * Validates that a report payload has the required structure and non-empty content
 */
export function validateReportPayload(payload: unknown): payload is ReportPayload {
  if (!payload || typeof payload !== 'object') return false;
  
  const p = payload as any;
  
  // Check required fields
  if (!p.ticker || typeof p.ticker !== 'string') return false;
  if (!p.modelType || typeof p.modelType !== 'string') return false;
  if (!Array.isArray(p.sections)) return false;
  
  // Validate sections
  if (p.sections.length < 3) return false;
  
  for (const section of p.sections) {
    if (!section || typeof section !== 'object') return false;
    if (!section.title || typeof section.title !== 'string' || section.title.trim().length === 0) return false;
    if (!section.body || typeof section.body !== 'string' || section.body.trim().length === 0) return false;
  }
  
  return true;
}

/**
 * Normalizes a report payload, ensuring all sections have non-empty bodies
 */
export function normalizeReportPayload(payload: Partial<ReportPayload>): ReportPayload {
  const sections: ReportSection[] = (payload.sections || []).map((section, index) => {
    const title = section?.title?.trim() || `Section ${index + 1}`;
    let body = section?.body?.trim() || '';
    
    // If body is empty, provide a fallback message
    if (body.length === 0) {
      body = `Content for "${title}" is unavailable. This section requires model data that was not provided.`;
    }
    
    return { title, body };
  });
  
  // Ensure minimum 3 sections
  while (sections.length < 3) {
    sections.push({
      title: `Section ${sections.length + 1}`,
      body: 'This section requires additional model data to generate content.',
    });
  }
  
  return {
    ticker: payload.ticker || 'UNKNOWN',
    modelType: payload.modelType || 'DCF',
    sections,
  };
}

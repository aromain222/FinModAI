import OpenAI from 'openai';

import type { ReportContext, ReportModelType } from './reportPrompts';
import { buildReportPrompt } from './reportPrompts';
import type { ReportPayload } from './reportTypes';
import { validateReportPayload, normalizeReportPayload } from './reportTypes';

export interface GeneratedReport {
  title: string;
  summaryText: string;
  markdownBody: string;
  reportPayload?: ReportPayload; // Canonical structure
}

export async function generateModelReport(ctx: ReportContext): Promise<GeneratedReport> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY');
  }

  const { system, user } = buildReportPrompt(ctx);
  const client = new OpenAI({ apiKey });

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      temperature: 0.2, // Lower temperature for more decisive, consistent output
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
  } catch (err) {
    throw new Error(`OpenAI report generation failed: ${(err as Error)?.message ?? 'unknown error'}`);
  }

  let rawContent = completion.choices[0]?.message?.content?.trim();
  if (!rawContent) {
    throw new Error('Report generation returned empty content');
  }

  // Try to parse as JSON first
  let reportPayload: ReportPayload | null = null;
  try {
    // Remove markdown code blocks if present
    const jsonMatch = rawContent.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || 
                      rawContent.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1] : rawContent;
    
    const parsed = JSON.parse(jsonStr);
    
    // Validate and normalize
    if (validateReportPayload(parsed)) {
      reportPayload = parsed;
    } else {
      // Try to normalize and validate again
      const normalized = normalizeReportPayload(parsed);
      if (validateReportPayload(normalized)) {
        reportPayload = normalized;
      }
    }
  } catch (parseError) {
    console.warn('[reportGenerator] Failed to parse JSON, falling back to markdown parsing', {
      error: (parseError as Error)?.message,
      contentPreview: rawContent.slice(0, 200),
    });
  }

  // If JSON parsing failed, fall back to markdown parsing (backward compatibility)
  let markdownBody: string;
  let title: string;
  let summaryText: string;

  if (reportPayload) {
    // Convert canonical structure to markdown for backward compatibility
    markdownBody = convertPayloadToMarkdown(reportPayload);
    title = `${reportPayload.ticker} — ${reportPayload.modelType} Report`;
    summaryText = reportPayload.sections[0]?.body?.slice(0, 600) || '';
  } else {
    // Legacy markdown path
    markdownBody = sanitizeReportText(rawContent);
    
    // For 3-statement reports, validate Executive Summary length
    if (ctx.modelType === 'three_statement') {
      markdownBody = validateThreeStatementStructure(markdownBody);
    }
    
    title = extractTitle(markdownBody, ctx.ticker, ctx.modelType);
    summaryText = extractSummary(markdownBody);
    
    // Try to convert markdown to canonical structure
    try {
      reportPayload = convertMarkdownToPayload(markdownBody, ctx.ticker, ctx.modelType);
    } catch (err) {
      console.warn('[reportGenerator] Failed to convert markdown to payload', err);
    }
  }

  return {
    title,
    summaryText,
    markdownBody,
    reportPayload: reportPayload || undefined,
  };
}

function convertPayloadToMarkdown(payload: ReportPayload): string {
  return payload.sections
    .map(section => `## ${section.title}\n\n${section.body}`)
    .join('\n\n');
}

function convertMarkdownToPayload(markdown: string, ticker: string, modelType: ReportModelType): ReportPayload {
  const sections = markdown
    .split(/\n(?=##\s+)/g)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return null;
      if (trimmed.startsWith('## ')) {
        const [firstLine, ...rest] = trimmed.split('\n');
        const title = firstLine.replace(/^##\s*/, '').trim();
        const body = rest.join('\n').trim();
        return { title, body };
      }
      return { title: 'Introduction', body: trimmed };
    })
    .filter((s): s is { title: string; body: string } => 
      s !== null && s.title.length > 0 && s.body.length > 0
    );

  const normalized = normalizeReportPayload({
    ticker,
    modelType: formatModelTypeForPayload(modelType),
    sections,
  });

  return normalized;
}

function formatModelTypeForPayload(modelType: ReportModelType): 'DCF' | 'LBO' | 'ThreeStatement' | 'COMPS' {
  switch (modelType) {
    case 'lbo':
      return 'LBO';
    case 'comps':
      return 'COMPS';
    case 'three_statement':
      return 'ThreeStatement';
    case 'dcf':
    default:
      return 'DCF';
  }
}

function sanitizeReportText(text: string): string {
  const prohibitedPhrases = [
    /has not been specified/gi,
    /it is important to consider/gi,
    /should be analyzed/gi,
    /likely involves/gi,
    /will be crucial/gi,
    /it is important to/gi,
    /should be noted/gi,
    /may be/gi,
    /could be/gi,
    /limited data/gi,
    /not specified/gi,
    /moderate opportunity/gi,
    /this model suggests/gi,
    /the model indicates/gi,
    // Remove all confidence score references
    /confidence score/gi,
    /model confidence score/gi,
    /\d+\s*\/\s*100\s*confidence/gi,
    /\d+\s*\/\s*100/gi, // Any X / 100 pattern that might be confidence
    /directional confidence/gi,
    /moderate confidence/gi,
    /high confidence/gi,
    /low confidence/gi,
    /confidence driven by/gi,
    /confidence.*drivers/gi,
    /confidence.*driven/gi,
    // Generic 3-statement phrases
    /demand remains robust/gi,
    /the company benefits from growth trends/gi,
    /margins are expected to improve/gi,
    /operating efficiency increases/gi,
    /cash flow remains strong/gi,
    /the balance sheet remains healthy/gi,
    /macroeconomic uncertainty/gi,
    /strong market position/gi,
    /favorable industry dynamics/gi,
    /healthy cash generation/gi,
    /positive cash flow/gi,
    /cash flow improves/gi,
    /working capital management/gi,
    /strong balance sheet position/gi,
    /financial flexibility/gi,
    /balance sheet strength/gi,
    /margin expansion is driven by scale/gi,
    /cost management initiatives/gi,
    /improved profitability/gi,
    /competitive pressures/gi, // Only if used without mechanics
  ];

  let sanitized = text;
  for (const pattern of prohibitedPhrases) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Remove lines that start with confidence score patterns
  const lines = sanitized.split('\n');
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();
    return !/^model confidence score/i.test(trimmed) &&
           !/^\d+\s*\/\s*100/i.test(trimmed) &&
           !/confidence.*score/i.test(trimmed.toLowerCase());
  });
  sanitized = filteredLines.join('\n');

  // Remove double spaces and clean up
  sanitized = sanitized.replace(/\s+/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n').trim();

  return sanitized;
}

function extractTitle(markdown: string, ticker: string, modelType: ReportModelType): string {
  const titleLine = markdown
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('# '));
  if (titleLine) {
    return titleLine.replace(/^#\s*/, '').trim();
  }
  return `${ticker} — ${modelType.toUpperCase()} Valuation Report`;
}

function validateThreeStatementStructure(markdown: string): string {
  // Find Executive Summary section
  const lines = markdown.split('\n');
  const execStart = lines.findIndex((line) => /^##\s+Executive\s+Summary/i.test(line.trim()));
  
  if (execStart !== -1) {
    // Extract Executive Summary content
    const summaryLines: string[] = [];
    for (let i = execStart + 1; i < lines.length; i += 1) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('## ')) break;
      if (trimmed) summaryLines.push(trimmed);
    }
    
    // Count sentences in Executive Summary
    const summaryText = summaryLines.join(' ');
    const sentences = summaryText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    // If Executive Summary has more than 3 sentences, truncate to first 3
    if (sentences.length > 3) {
      const firstThreeSentences = sentences.slice(0, 3).join('. ').trim();
      const newSummaryText = firstThreeSentences + (firstThreeSentences.match(/[.!?]$/) ? '' : '.');
      
      // Reconstruct markdown with corrected Executive Summary
      const beforeSummary = lines.slice(0, execStart + 1).join('\n');
      const afterSummary = lines.slice(execStart + 1 + summaryLines.length).join('\n');
      return `${beforeSummary}\n${newSummaryText}\n${afterSummary}`;
    }
  }
  
  return markdown;
}

function extractSummary(markdown: string): string {
  const lines = markdown.split('\n');
  const execStart = lines.findIndex((line) => /^##\s+Executive/i.test(line.trim()));
  if (execStart !== -1) {
    const summaryLines: string[] = [];
    for (let i = execStart + 1; i < lines.length; i += 1) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('## ')) break;
      if (trimmed) summaryLines.push(trimmed);
      if (summaryLines.join(' ').length > 400) break;
    }
    if (summaryLines.length) {
      return summaryLines.join(' ').slice(0, 600);
    }
  }

  const paragraphs = markdown.split(/\n\s*\n/).map((p) => p.replace(/^#\s*/g, '').trim()).filter(Boolean);
  return paragraphs[0]?.slice(0, 600) ?? '';
}

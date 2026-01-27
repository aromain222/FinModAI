import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

import type { ReportModelType } from './reportPrompts';
import type { GeneratedReport } from './reportGenerator';

export interface ReportPdfOptions {
  ticker: string;
  companyName?: string;
  modelType: ReportModelType;
  asOfDate?: string;
}

const COLORS = {
  navy: rgb(0.054, 0.114, 0.204),
  ink: rgb(0.102, 0.122, 0.169),
  slate: rgb(0.41, 0.45, 0.52),
  blue: rgb(0.168, 0.455, 1),
  gold: rgb(0.773, 0.643, 0.353),
  soft: rgb(0.957, 0.965, 0.98),
  line: rgb(0.886, 0.902, 0.933),
  white: rgb(1, 1, 1),
};

const PAGE = { width: 612, height: 792, margin: 48 };
const STRUCTURED_HEADERS = [
  // 3-Statement structure (no lettered sections)
  'Executive Summary',
  'Business Model & Revenue Engine',
  'Margin & Operating Structure',
  'Cash Flow Dynamics',
  'Balance Sheet Evolution',
  'Stress Points & Breakpoints',
  // Other model structures (A-E format)
  'A. Business Model & Economic Drivers',
  'B. Core Modeling Assumptions',
  'C. Financial Output Interpretation',
  'D. Risks & Sensitivities',
  'E. Bottom-Line Insight',
  // Legacy headers (for backward compatibility)
  'Business Overview',
  'Key Modeling Assumptions',
  'Valuation Output',
  'Macro and Sector Context',
  'Risks and Sensitivities',
  'Takeaways and Insight Summary',
];

export async function createReportPdf(report: GeneratedReport, opts: ReportPdfOptions): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const safeTitle = (report.title?.trim() || 'CapitalBase Analyst Report').slice(0, 200);
  const safeCompany = (opts.companyName ?? opts.ticker ?? 'CapitalBase').toString();
  const safeModel = opts.modelType?.toUpperCase?.() ?? 'DCF';
  const safeDate = opts.asOfDate ?? new Date().toISOString().slice(0, 10);

  // Cover page
  const cover = pdfDoc.addPage([PAGE.width, PAGE.height]);
  cover.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE.width,
    height: PAGE.height,
    color: COLORS.navy,
  });
  cover.drawText('CapitalBase', {
    x: PAGE.margin,
    y: PAGE.height - 120,
    size: 32,
    font: boldFont,
    color: COLORS.white,
  });
  cover.drawText(safeTitle, {
    x: PAGE.margin,
    y: PAGE.height - 200,
    size: 20,
    font: boldFont,
    color: COLORS.white,
  });
  cover.drawText(safeCompany, {
    x: PAGE.margin,
    y: PAGE.height - 240,
    size: 14,
    font: regularFont,
    color: COLORS.white,
  });
  cover.drawText(`${safeModel} Report`, {
    x: PAGE.margin,
    y: PAGE.height - 270,
    size: 12,
    font: regularFont,
    color: COLORS.gold,
  });
  cover.drawText(`Prepared ${safeDate}`, {
    x: PAGE.margin,
    y: 80,
    size: 10,
    font: regularFont,
    color: COLORS.white,
  });

  // Body pages
  const sections = parseReportSections(report.markdownBody ?? '');
  let page = pdfDoc.addPage([PAGE.width, PAGE.height]);
  let cursorY = PAGE.height - PAGE.margin;

  const ensureSpace = (height: number) => {
    if (cursorY - height < PAGE.margin) {
      drawFooter(page, boldFont, regularFont);
      page = pdfDoc.addPage([PAGE.width, PAGE.height]);
      cursorY = PAGE.height - PAGE.margin;
    }
  };

  sections.forEach((section) => {
    ensureSpace(40);
    page.drawText(section.title, {
      x: PAGE.margin,
      y: cursorY,
      size: 14,
      font: boldFont,
      color: COLORS.blue,
    });
    cursorY -= 20;

    section.paragraphs.forEach((paragraph) => {
      const lines = wrapText(paragraph, PAGE.width - PAGE.margin * 2, regularFont, 11);
      lines.forEach((line) => {
        ensureSpace(16);
        page.drawText(line, {
          x: PAGE.margin,
          y: cursorY,
          size: 11,
          font: regularFont,
          color: COLORS.ink,
        });
        cursorY -= 14;
      });
      cursorY -= 10;
    });
    cursorY -= 6;
  });

  drawFooter(page, boldFont, regularFont);
  const uint8 = await pdfDoc.save();
  return Buffer.from(uint8);
}

type ParsedSection = { title: string; paragraphs: string[] };

function parseReportSections(text: string): ParsedSection[] {
  const safe = typeof text === 'string' ? text : '';
  
  // Remove confidence score lines if present
  const cleaned = safe
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return !/^model confidence score/i.test(trimmed) &&
             !/^\d+\s*\/\s*100/i.test(trimmed) &&
             !/confidence.*score/i.test(trimmed.toLowerCase());
    })
    .join('\n');
  
  const lines = cleaned.split(/\r?\n/);
  const sections: ParsedSection[] = [];
  let currentTitle: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!currentTitle) return;
    const content = buffer.join('\n').trim();
    const paragraphs = content
      ? content.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
      : [];
    if (paragraphs.length > 0) {
      sections.push({ title: currentTitle, paragraphs });
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    // Check for structured headers (exact match or starts with)
    const matchedHeader = STRUCTURED_HEADERS.find(header => 
      trimmed === header || trimmed.startsWith(header)
    );
    
    if (matchedHeader) {
      flush();
      currentTitle = matchedHeader;
      buffer = [];
    } else if (trimmed) {
      buffer.push(trimmed);
    } else {
      buffer.push('');
    }
  });
  flush();

  if (sections.length) {
    return sections;
  }

  return parseLegacyMarkdownSections(cleaned);
}

function parseLegacyMarkdownSections(markdown: string): ParsedSection[] {
  const safeMarkdown = typeof markdown === 'string' ? markdown : '';
  const sections: ParsedSection[] = [];
  const blocks = safeMarkdown.split(/\n(?=##\s+)/g);
  blocks.forEach((block, idx) => {
    const trimmed = block.trim();
    if (!trimmed) return;
    const titleMatch = trimmed.match(/^##\s+(.*)/);
    const title = titleMatch ? titleMatch[1].trim() : idx === 0 ? 'Executive Summary' : `Section ${idx + 1}`;
    const body = titleMatch ? trimmed.replace(/^##\s+.*$/, '').trim() : trimmed;
    const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    sections.push({ title, paragraphs });
  });

  if (!sections.length) {
    sections.push({
      title: 'CapitalBase Commentary',
      paragraphs: safeMarkdown.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
    });
  }

  return sections;
}

function wrapText(text: string, width: number, font: PDFFont, fontSize: number): string[] {
  const safe = typeof text === 'string' ? text : '';
  const words = safe.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    const attempt = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(attempt, fontSize) > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = attempt;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function drawFooter(page: any, boldFont: PDFFont, regularFont: PDFFont) {
  page.drawLine({
    start: { x: PAGE.margin, y: PAGE.margin - 15 },
    end: { x: PAGE.width - PAGE.margin, y: PAGE.margin - 15 },
    color: COLORS.line,
    thickness: 1,
  });
  page.drawText('Generated by CapitalBase — Modern Modeling Infrastructure', {
    x: PAGE.margin,
    y: PAGE.margin - 32,
    font: regularFont,
    size: 10,
    color: COLORS.slate,
  });
}

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { GeneratedModelReport } from '@/lib/reportGenerator';
import { normalizeReportPayload } from '@/lib/reportTypes';

type PdfOptions = {
  ticker?: string;
  companyName?: string;
  modelType?: string;
  asOfDate?: string;
};

type PdfBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] };

function normalizeContent(content: string | GeneratedModelReport, options?: PdfOptions) {
  if (typeof content === 'string') {
    const title = `${options?.companyName || options?.ticker || 'CapitalBase'} Report`;
    return normalizeReportPayload({
      title,
      summaryText: content.trim(),
      subtitle: options?.asOfDate ? `As of ${options.asOfDate}` : undefined,
      sections: [{ title: 'Summary', body: content.trim() || 'Summary unavailable.' }],
    });
  }

  return normalizeReportPayload(
    content.reportPayload || {
      title: content.title || `${options?.companyName || options?.ticker || 'CapitalBase'} Report`,
      summaryText: content.summaryText || '',
      subtitle: options?.asOfDate ? `As of ${options.asOfDate}` : undefined,
      sections: [],
    }
  );
}

function parseSectionBody(body: string): PdfBlock[] {
  const chunks = body
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);

  const blocks: PdfBlock[] = [];

  for (const chunk of chunks) {
    const lines = chunk
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    let paragraphLines: string[] = [];
    let bulletLines: string[] = [];

    const flushParagraph = () => {
      if (!paragraphLines.length) return;
      blocks.push({ type: 'paragraph', text: paragraphLines.join(' ') });
      paragraphLines = [];
    };

    const flushBullets = () => {
      if (!bulletLines.length) return;
      blocks.push({
        type: 'bullets',
        items: bulletLines.map((line) => line.replace(/^[•*-]\s+/, '').trim()),
      });
      bulletLines = [];
    };

    for (const line of lines) {
      if (/^[•*-]\s+/.test(line)) {
        flushParagraph();
        bulletLines.push(line);
      } else {
        flushBullets();
        paragraphLines.push(line);
      }
    }

    flushParagraph();
    flushBullets();
  }

  return blocks;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

export async function createReportPdf(
  content: string | GeneratedModelReport,
  options?: PdfOptions
): Promise<Buffer> {
  const payload = normalizeContent(content, options);
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 52;
  const topMargin = 54;
  const bottomMargin = 52;
  const contentWidth = pageWidth - marginX * 2;
  const lineGap = 4;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - topMargin;

  const ensureSpace = (requiredHeight: number) => {
    if (y - requiredHeight >= bottomMargin) return;
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    y = pageHeight - topMargin;
  };

  const drawWrappedLines = (
    lines: string[],
    size: number,
    activeFont: PDFFont,
    x: number,
    color = rgb(0.08, 0.1, 0.14)
  ) => {
    const lineHeight = size + lineGap;
    ensureSpace(lines.length * lineHeight);
    for (const line of lines) {
      (page as PDFPage).drawText(line, {
        x,
        y,
        size,
        font: activeFont,
        color,
      });
      y -= lineHeight;
    }
  };

  const drawParagraph = (text: string, size = 10, color = rgb(0.1, 0.12, 0.16)) => {
    const lines = wrapText(text, font, size, contentWidth);
    drawWrappedLines(lines, size, font, marginX, color);
  };

  const drawBullets = (items: string[], size = 10) => {
    for (const item of items) {
      const bulletX = marginX + 4;
      const textX = marginX + 18;
      const lines = wrapText(item, font, size, contentWidth - 18);
      ensureSpace(lines.length * (size + lineGap));
      (page as PDFPage).drawText('•', {
        x: bulletX,
        y,
        size,
        font: boldFont,
        color: rgb(0.12, 0.18, 0.28),
      });
      drawWrappedLines(lines, size, font, textX, rgb(0.1, 0.12, 0.16));
      y -= 3;
    }
  };

  const drawDivider = () => {
    ensureSpace(12);
    (page as PDFPage).drawLine({
      start: { x: marginX, y },
      end: { x: pageWidth - marginX, y },
      thickness: 0.8,
      color: rgb(0.85, 0.88, 0.92),
    });
    y -= 12;
  };

  const drawMetaLine = (text: string) => {
    if (!text.trim()) return;
    const lines = wrapText(text, font, 9, contentWidth);
    drawWrappedLines(lines, 9, font, marginX, rgb(0.42, 0.46, 0.52));
  };

  const drawSection = (title: string, body: string) => {
    drawDivider();
    drawWrappedLines(wrapText(title, boldFont, 12, contentWidth), 12, boldFont, marginX, rgb(0.08, 0.1, 0.14));
    y -= 2;

    const blocks = parseSectionBody(body);
    for (const block of blocks) {
      if (block.type === 'paragraph') {
        drawParagraph(block.text, 10);
      } else {
        drawBullets(block.items, 10);
      }
      y -= 4;
    }
  };

  drawWrappedLines(wrapText(payload.title, boldFont, 22, contentWidth), 22, boldFont, marginX, rgb(0.06, 0.08, 0.12));
  y -= 4;

  drawMetaLine(payload.subtitle || '');
  drawMetaLine(
    payload.generatedAt
      ? `Generated ${new Date(payload.generatedAt).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}`
      : options?.asOfDate
        ? `As of ${options.asOfDate}`
        : ''
  );
  y -= 10;

  if (payload.summaryText) {
    const summaryLines = wrapText(payload.summaryText, font, 10.5, contentWidth - 20);
    const summaryLineHeight = 10.5 + lineGap;
    const summaryHeight = summaryLines.length * summaryLineHeight + 16;
    ensureSpace(summaryHeight + 8);
    (page as PDFPage).drawRectangle({
      x: marginX,
      y: y - summaryHeight + 6,
      width: contentWidth,
      height: summaryHeight,
      color: rgb(0.96, 0.97, 0.99),
      borderColor: rgb(0.87, 0.9, 0.94),
      borderWidth: 1,
    });
    y -= 10;
    drawWrappedLines(summaryLines, 10.5, font, marginX + 10, rgb(0.12, 0.15, 0.2));
    y -= 8;
  }

  if (payload.keyTakeaways && payload.keyTakeaways.length > 0) {
    drawWrappedLines(['Key Takeaways'], 11, boldFont, marginX, rgb(0.08, 0.1, 0.14));
    y -= 2;
    drawBullets(payload.keyTakeaways.slice(0, 3), 10);
    y -= 4;
  }

  for (const section of payload.sections) {
    drawSection(section.title, section.body);
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

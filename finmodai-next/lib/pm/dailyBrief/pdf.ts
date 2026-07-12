/**
 * Renders a DailyPortfolioBrief as a downloadable PDF memo using pdf-lib.
 * Layout is deliberately plain — an institutional one-pager style: header,
 * snapshot numbers, market state, the memo sections, then a per-position run-down.
 */

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { DailyPortfolioBrief } from '@/lib/pm/dailyBrief/generator';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const BODY_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK = rgb(0.12, 0.13, 0.15);
const MUTED = rgb(0.42, 0.44, 0.48);
const RULE = rgb(0.85, 0.86, 0.88);

type Writer = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
};

function money(value: number | null): string {
  if (value === null) return '—';
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function pct(value: number | null, signed = true): string {
  if (value === null) return '—';
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

// Standard fonts only encode WinAnsi — LLM-written memo text can carry emoji,
// arrows, or other unicode that would throw at draw time. Map the common ones
// to ASCII and drop the rest rather than failing the whole download.
function sanitizeWinAnsi(text: string): string {
  const mapped = text
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/…/g, '...')
    .replace(/[→➡]/g, '->')
    .replace(/[←]/g, '<-')
    .replace(/[↑⬆]/g, '+')
    .replace(/[↓⬇]/g, '-')
    .replace(/[−]/g, '-')
    .replace(/[   ]/g, ' ');
  return [...mapped]
    .map(char => (char.charCodeAt(0) <= 0xFF ? char : ''))
    .join('')
    .replace(/ {2,}/g, ' ');
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = sanitizeWinAnsi(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function ensureRoom(w: Writer, needed: number): void {
  if (w.y - needed < MARGIN) {
    w.page = w.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    w.y = PAGE_HEIGHT - MARGIN;
  }
}

function drawText(w: Writer, text: string, options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; gapAfter?: number } = {}): void {
  const size = options.size ?? 9.5;
  const font = options.bold ? w.bold : w.font;
  const indent = options.indent ?? 0;
  const lines = wrap(text, font, size, BODY_WIDTH - indent);
  for (const line of lines) {
    ensureRoom(w, size + 3);
    w.page.drawText(line, { x: MARGIN + indent, y: w.y - size, size, font, color: options.color ?? INK });
    w.y -= size + 3;
  }
  w.y -= options.gapAfter ?? 0;
}

function drawBullets(w: Writer, items: string[], gapAfter = 6): void {
  for (const item of items) {
    const size = 9.5;
    const lines = wrap(item, w.font, size, BODY_WIDTH - 14);
    lines.forEach((line, index) => {
      ensureRoom(w, size + 3);
      if (index === 0) w.page.drawText('•', { x: MARGIN + 2, y: w.y - size, size, font: w.font, color: INK });
      w.page.drawText(line, { x: MARGIN + 14, y: w.y - size, size, font: w.font, color: INK });
      w.y -= size + 3;
    });
    w.y -= 2;
  }
  w.y -= gapAfter;
}

function drawHeading(w: Writer, text: string): void {
  ensureRoom(w, 30);
  w.y -= 8;
  w.page.drawText(text.toUpperCase(), { x: MARGIN, y: w.y - 10, size: 10, font: w.bold, color: INK });
  w.y -= 15;
  w.page.drawLine({ start: { x: MARGIN, y: w.y }, end: { x: PAGE_WIDTH - MARGIN, y: w.y }, thickness: 0.7, color: RULE });
  w.y -= 8;
}

export async function renderDailyBriefPdf(brief: DailyPortfolioBrief): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w: Writer = { doc, page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), y: PAGE_HEIGHT - MARGIN, font, bold };

  // Header
  w.page.drawText('CapitalBase', { x: MARGIN, y: w.y - 14, size: 15, font: bold, color: INK });
  w.page.drawText('Daily Portfolio Brief', { x: MARGIN, y: w.y - 30, size: 11, font, color: MUTED });
  const dateLabel = `${brief.tradingDate}  ·  ${brief.runLabel === 'post_close' ? 'Post-close' : 'Manual run'}`;
  w.page.drawText(dateLabel, { x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(dateLabel, 9.5), y: w.y - 14, size: 9.5, font, color: MUTED });
  w.y -= 44;

  // Snapshot
  drawHeading(w, 'Portfolio snapshot');
  const p = brief.portfolio;
  drawText(w, `Market value ${money(p.marketValue)}   ·   Day P&L ${money(p.dayPnl)} (${pct(p.dayReturnPct)})   ·   ${p.activePositions} active positions   ·   ${p.strengthening} strengthening / ${p.weakeningOrBroken} weakening or broken`, { gapAfter: 4 });

  // Market state
  drawHeading(w, 'Market state');
  const m = brief.market;
  drawText(w, `Regime: ${m.regime.replace(/_/g, ' ')} (${m.regimeConfidence}% confidence)   ·   SPY ${pct(m.spyChangePct)}   ·   VIX ${m.vix ?? '—'}   ·   10Y ${m.us10y ?? '—'}   ·   Breadth ${pct(m.breadthNetPct)}`, { gapAfter: 2 });
  if (m.sectorLeaders.length > 0) drawText(w, `Leaders: ${m.sectorLeaders.map(s => `${s.name} ${pct(s.changePct)}`).join(', ')}`, { color: MUTED, gapAfter: 0 });
  if (m.sectorLaggards.length > 0) drawText(w, `Laggards: ${m.sectorLaggards.map(s => `${s.name} ${pct(s.changePct)}`).join(', ')}`, { color: MUTED, gapAfter: 4 });

  // Memo
  drawHeading(w, 'Executive summary');
  drawBullets(w, brief.analysis.executiveSummary);
  drawHeading(w, 'Portfolio read');
  drawText(w, brief.analysis.portfolioRead, { gapAfter: 4 });
  drawHeading(w, 'What changed');
  drawBullets(w, brief.analysis.whatChanged);
  drawHeading(w, 'Looking ahead');
  drawBullets(w, brief.analysis.lookingAhead);

  // Positions
  drawHeading(w, 'Positions');
  const views = new Map(brief.analysis.positionViews.map(view => [view.ticker, view]));
  for (const position of brief.positions) {
    ensureRoom(w, 60);
    const title = `${position.ticker}${position.companyName ? ` — ${position.companyName}` : ''}`;
    drawText(w, title, { bold: true, size: 10, gapAfter: 1 });
    drawText(w, `Weight ${pct(position.weightPct, false)}   ·   Day ${pct(position.dayChangePct)} (${money(position.dayPnl)})   ·   Price ${position.price === null ? '—' : `$${position.price.toFixed(2)}`}   ·   Target upside ${pct(position.upsideToTargetPct)}   ·   Stop downside ${pct(position.downsideToStopPct)}   ·   Conviction ${position.conviction ?? '—'}${position.thesisStatus ? `   ·   Thesis ${position.thesisStatus}` : ''}`, { color: MUTED, size: 8.5, gapAfter: 2 });
    const view = views.get(position.ticker);
    if (view) {
      drawText(w, `${view.action.toUpperCase()} — ${view.thesisUpdate}`, { indent: 10, gapAfter: 1 });
      if (view.thesisPerformance) drawText(w, `Thesis performance: ${view.thesisPerformance}`, { indent: 10, size: 8.5, color: MUTED, gapAfter: 1 });
      if (view.macroImpact) drawText(w, `Macro link: ${view.macroImpact}`, { indent: 10, size: 8.5, color: MUTED, gapAfter: 1 });
      if (view.pricePlan) drawText(w, `Price / sizing plan: ${view.pricePlan}`, { indent: 10, size: 8.5, color: MUTED, gapAfter: 1 });
      drawText(w, `Why now: ${view.whyNow}`, { indent: 10, size: 8.5, color: MUTED, gapAfter: 1 });
      drawText(w, `Next catalyst: ${view.nextCatalyst}   ·   Main risk: ${view.mainRisk}   ·   Invalidation: ${view.invalidation}`, { indent: 10, size: 8.5, color: MUTED, gapAfter: 4 });
    } else {
      w.y -= 4;
    }
  }

  // Footer: provenance
  drawHeading(w, 'Coverage & caveats');
  drawText(w, `Quotes for ${brief.source.quotesAvailable} tickers · ${brief.source.positionsCovered} positions covered · market-state coverage ${brief.source.marketStateCoveragePct}%${brief.source.marketStateFallback ? ' (fallback data)' : ''} · macro sources ${brief.source.macroSources?.join(', ') || 'none'} · generated ${brief.asOf}`, { size: 8.5, color: MUTED, gapAfter: 2 });
  if (brief.source.warnings.length > 0) {
    drawBullets(w, brief.source.warnings.map(warning => `Warning: ${warning}`));
  }

  return doc.save();
}

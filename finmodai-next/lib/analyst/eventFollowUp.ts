import * as cheerio from 'cheerio';
import type { EventLinkedModelEventSource } from '@/lib/model-events/types';

export function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s)]+/i);
  return match ? match[0] : null;
}

function sourceLabelFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
}

export function looksLikeEventLinkedModelFollowUp(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;

  const hasUrl = /https?:\/\/[^\s)]+/i.test(text);
  const asksImpact =
    /\b(affect|effect|impact|implication|implications|how does this|what does this do to|what happens to|what would this do to)\b/i.test(
      text,
    );
  const eventLike =
    /\b(imf|fed|fomc|ecb|boj|inflation|cpi|pce|rates?|yield|tariff|oil|war|conflict|sanction|policy|guidance|outlook|stimulus|recession|growth downgrade|macro|event)\b/i.test(
      text,
    );
  const modelLike =
    /\b(dcf|valuation|wacc|terminal growth|terminal growth rate|multiple|revenue growth|margin|assumption|model)\b/i.test(
      text,
    );

  return (hasUrl || eventLike) && (asksImpact || modelLike);
}

export async function buildEventContextFromPrompt(message: string): Promise<EventLinkedModelEventSource> {
  const sourceUrl = extractFirstUrl(message);
  const promptWithoutUrl = sourceUrl ? message.replace(sourceUrl, ' ').replace(/\s+/g, ' ').trim() : message.trim();

  let title: string | null = null;
  let description: string | null = null;
  let articleSnippet: string | null = null;

  if (sourceUrl) {
    try {
      const response = await fetch(sourceUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(4000),
        headers: {
          'User-Agent': 'CapitalBase/1.0 (+event-context)',
          Accept: 'text/html,application/xhtml+xml',
        },
        cache: 'no-store',
      });

      const contentType = response.headers.get('content-type') ?? '';
      if (response.ok && /text\/html|application\/xhtml\+xml/i.test(contentType)) {
        const html = await response.text();
        const $ = cheerio.load(html);
        title =
          $('meta[property="og:title"]').attr('content')?.trim() ||
          $('meta[name="twitter:title"]').attr('content')?.trim() ||
          $('title').first().text().trim() ||
          null;
        description =
          $('meta[name="description"]').attr('content')?.trim() ||
          $('meta[property="og:description"]').attr('content')?.trim() ||
          $('meta[name="twitter:description"]').attr('content')?.trim() ||
          null;
        articleSnippet =
          $('article p, main p, p')
            .toArray()
            .map((node) => $(node).text().replace(/\s+/g, ' ').trim())
            .filter((paragraph) => paragraph.length >= 60)
            .slice(0, 3)
            .join(' ') || null;
      }
    } catch {
      // Best-effort enrichment only.
    }
  }

  const enrichedText = [
    promptWithoutUrl,
    title ? `Article title: ${title}` : null,
    description ? `Summary: ${description}` : null,
    articleSnippet ? `Key article text: ${articleSnippet}` : null,
  ]
    .filter((item): item is string => Boolean(item))
    .join('\n');

  return {
    sourceType: 'pasted_text',
    title,
    rawEventText: enrichedText || message.trim(),
    sourceUrl,
    sourceLabel: sourceLabelFromUrl(sourceUrl),
  };
}

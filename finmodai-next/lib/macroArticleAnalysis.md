# Macro IQ Article Analysis - Implementation Guide

## Overview

Macro IQ now includes article summaries and market impact analysis for every news item, matching Market Brief functionality but tailored for macro/geopolitical context.

## Schema

### MacroArticleAnalysis

```typescript
interface MacroArticleAnalysis {
  summary_bullets: string[];        // 2-3 bullets, max ~45 words total
  impact_bullets: string[];         // 2 bullets, max ~35 words total
  impact_channels: string[];         // 1-4 tags from allowed list
  sentiment_by_asset: {
    equities?: 'up' | 'down' | 'mixed';
    rates?: 'up' | 'down' | 'mixed';
    usd?: 'up' | 'down' | 'mixed';
    oil?: 'up' | 'down' | 'mixed';
    credit?: 'up' | 'down' | 'mixed';
    commodities?: 'up' | 'down' | 'mixed';
    fx?: 'up' | 'down' | 'mixed';
  };
  confidence: 'low' | 'medium' | 'high';
  key_numbers?: Array<{ label: string; value: string }>; // Optional
  reasoning_short: string;          // 1 sentence internal or tooltip
}
```

## UI Display Order

Each article card displays:

1. **Headline** (clickable, opens in new tab)
2. **Source + published time** (relative time: "2h ago", "1d ago")
3. **Summary** (2-3 bullets, max ~45 words total)
4. **Potential Market Impact** (2 bullets, max ~35 words total)
5. **Channels** (chips/tags): Rates, USD, Oil, Credit, Equities, FX, Geopolitics, Supply Chain, Inflation
6. **Confidence + caveat** (small text): "Directional, depends on follow-through." with tooltip for reasoning
7. **Key numbers** (optional, 1 line): CPI, yields, oil price, etc.

## Summarization Prompt

**System Style:**
```
You are a macro news analyst. Be concise, factual, and avoid hype. Do not invent data.
```

**User Prompt:**
```
Analyze this macro news article:
[Title, Source, Published, Summary/Content/Snippet]

Produce:
1. Summary bullets (2-3): what happened, what changed, why it matters (max 45 words total)
2. Potential market impact (2 bullets): which assets could react and why (max 35 words total)
3. 1-4 impact channel tags from: Rates, USD, Equities, Credit, Oil, Commodities, FX, Inflation, Growth, Geopolitics, Supply Chain
4. Sentiment by asset: up/down/mixed for relevant assets
5. Confidence: low/medium/high (based on specificity + source + clarity)
6. Key numbers mentioned (if present)
7. Reasoning (1 sentence): why this confidence level

Constraints:
- No more than 45 words for Summary
- No more than 35 words for Impact
- Do not quote the article
- If information is missing, say so implicitly and lower confidence
- Do not reference model drivers or company-specific valuation assumptions
- Never say "will." Use "could/may/likely if..."

Return valid JSON.
```

## Confidence Rules

### Low Confidence
- Vague or speculative articles
- Paywall snippets only (no full content)
- Missing key information
- Unclear source or timing

### Medium Confidence
- Some specifics provided
- Official but preliminary statements
- Clear source but limited detail

### High Confidence
- Official releases (Fed/CPI/jobs/geopolitical official statements)
- Clear data and specific numbers
- Authoritative sources with full context

## Caching Strategy

### Cache Key
```
macro-analysis:{article.url}:{article.publishedAt}
```

### Cache Behavior
- **Generate on ingestion** (server-side) OR on first view, then cache
- **Cache indefinitely** unless article content changes
- **If snippet only** (paywall): Still generate but `confidence = low` and add impact bullet reflecting uncertainty
- **Failure mode**: Show "Summary unavailable" and keep rest of card intact

### Implementation
Currently using in-memory cache in API route. For production:
- Use Redis or similar persistent cache
- Cache by `article_url + published_at`
- Invalidate if article content changes (detect via content hash)

## Engineering Behavior

### When to Generate
1. **On ingestion** (preferred): Generate when article is first fetched
2. **On first view** (fallback): Generate when user first views article, then cache

### Failure Handling
If summarization fails:
- Show "Summary unavailable" in summary_bullets
- Show "Market impact analysis unavailable" in impact_bullets
- Keep confidence = 'low'
- Keep rest of card intact (don't break layout)

### Paywall Handling
If only snippet exists:
- Still generate analysis
- Set `confidence = 'low'`
- Add impact bullet: "Limited content available - analysis may be incomplete"

## Allowed Impact Channels

- Rates
- USD
- Equities
- Credit
- Oil
- Commodities
- FX
- Inflation
- Growth
- Geopolitics
- Supply Chain

## Guardrails

1. **Never say "will"** - Use "could/may/likely if..."
2. **No model driver references** - Macro IQ is not mapped to drivers
3. **No company-specific assumptions** - Keep macro-focused
4. **Word limits enforced** - 45 words summary, 35 words impact
5. **Confidence must be meaningful** - Low for vague/speculative, high for official releases

## Acceptance Criteria

✅ Every article shows Summary + Potential Market Impact
✅ Output is short, scannable, and non-hype
✅ Confidence is present and meaningful
✅ Matches Market Brief quality but stays macro-focused
✅ No layout breaks on failure
✅ Caching prevents redundant API calls

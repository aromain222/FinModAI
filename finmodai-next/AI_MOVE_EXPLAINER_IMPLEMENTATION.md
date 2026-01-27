# AI Move Explainer - Non-Hallucinating Implementation

## Summary

Implemented a strict, non-hallucinating AI explainer for stock moves that validates all facts come from provided evidence and cannot invent numbers or details.

## Features

### 1. Strict Evidence-Only Generation (`lib/ai/move_explainer.ts`)

**Input:**
- `ticker`: Stock ticker
- `move`: MoveEvent with date/return
- `benchmarkComparison`: Optional benchmark context
- `evidence`: Array of CatalystEvidence (news + events)
- `eventItems`: Optional EventItem titles

**Output (strict JSON):**
```typescript
{
  headline: string;        // Max 80 chars, factual only
  explanation: string;     // 3-6 sentences, evidence-only
  drivers: string[];       // Bullet points
  certainty: "high"|"med"|"low";
  citations: Array<{
    title: string;
    url?: string;
    source?: string;
    publishedAt?: string;
  }>;
}
```

### 2. Validation System

**Checks:**
- Citations non-empty when `certainty != "low"`
- Citations match provided evidence exactly
- No forbidden phrases (specific numbers/details) unless they appear in evidence
- Drivers don't contain unsupported claims

**Forbidden Phrases Detected:**
- `reported earnings of $X`
- `revenue of $X`
- `EPS of X`
- `beat by X%`
- `missed by X%`
- `raised guidance to $X`
- `filed X-K / X-Q`
- `price target of $X`
- `downgraded/upgraded to X`

### 3. Retry Mechanism

1. Generate explanation with strict prompt
2. Validate output
3. If validation fails, retry once with "evidence-only, no new facts" instruction
4. If retry also fails, fall back to deterministic rationale

### 4. Deterministic Fallback

When AI fails or validation fails:
- Generates rationale from evidence titles
- Includes benchmark context if available
- Uses generic language (no invented numbers)
- Always returns valid output

## Integration

### API Route (`/api/stocks/catalysts`)

**Query Parameter:**
- `useStrictAI` (default: `true`) - Use non-hallucinating explainer
- `includeAI` (default: `false`) - Enable AI explanations

**Usage:**
```
GET /api/stocks/catalysts?ticker=NVDA&start=2024-11-01&end=2024-11-30&includeAI=true&useStrictAI=true
```

### Main Function (`explainStockMoves`)

Now accepts `useStrictAI` parameter:
- `true` (default): Use strict explainer
- `false`: Use legacy explainer (if needed for comparison)

## Example Output

### Valid Explanation
```json
{
  "headline": "NVDA rises on earnings beat",
  "explanation": "NVDA increased 8.4% on November 18, 2024, following strong quarterly earnings results. The company reported earnings that exceeded analyst expectations. Multiple sources reported on the earnings announcement and guidance update.",
  "drivers": [
    "Strong quarterly earnings results",
    "Earnings exceeded expectations",
    "Guidance update"
  ],
  "certainty": "high",
  "citations": [
    {
      "title": "NVDA beats earnings expectations",
      "url": "https://reuters.com/nvda-earnings",
      "source": "Reuters",
      "publishedAt": "2024-11-18T16:00:00Z"
    }
  ]
}
```

### Fallback (Deterministic)
```json
{
  "headline": "NVDA increased 8.4%",
  "explanation": "On 2024-11-18, NVDA increased 8.4% while QQQ increased 0.4%. This move appears to be stock-specific rather than market-driven. Available evidence includes news and events from this period. Multiple sources (3) reported on this move.",
  "drivers": [
    "NVDA beats earnings expectations",
    "NVIDIA Q3 results strong",
    "NVDA guidance raised"
  ],
  "certainty": "med",
  "citations": [...]
}
```

## Tests

### Unit Tests (`lib/ai/move_explainer.test.ts`)

**Validation Tests:**
- ✓ Citations required when certainty != "low"
- ✓ Empty citations allowed when certainty is "low"
- ✓ Detects forbidden phrases with invented numbers
- ✓ Passes when forbidden phrase appears in evidence
- ✓ Validates citations match evidence
- ✓ Validates drivers don't contain forbidden phrases

**Fallback Tests:**
- ✓ Generates rationale with evidence
- ✓ Generates rationale without evidence
- ✓ Includes benchmark context when provided

Run tests:
```bash
cd finmodai-next && npm run test -- lib/ai/move_explainer.test.ts
```

## Files Created/Modified

### New Files
- `lib/ai/move_explainer.ts` - Non-hallucinating explainer with validation
- `lib/ai/move_explainer.test.ts` - Comprehensive tests

### Modified Files
- `lib/analytics/moveExplainer/index.ts` - Integrated strict explainer
- `app/api/stocks/catalysts/route.ts` - Added `useStrictAI` feature flag

## Hard Rules Enforced

1. **Evidence-Only**: AI may ONLY mention facts from provided evidence
2. **No Numbers**: Cannot invent specific numbers unless in evidence
3. **Uncertainty Forward**: Low confidence → use "likely" and note uncertainty
4. **Citations Required**: Every factual claim (beyond "price moved") must be cited
5. **Validation**: All outputs validated before returning
6. **Fallback**: Always returns valid output (deterministic if AI fails)

## Next Steps

1. **Monitor**: Track validation failure rates in production
2. **Refine**: Adjust forbidden phrases based on real-world examples
3. **Embeddings**: Consider using embeddings for better evidence matching (future)
4. **UI**: Display validation warnings if fallback used


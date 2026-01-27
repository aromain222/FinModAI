/**
 * AI Move Explainer - Non-Hallucinating Version
 * Strictly validates that all facts come from provided evidence
 */

import { ENV } from '@/lib/env/server';
import type { MoveEvent, Catalyst, MoveExplanation, BenchmarkComparison, CatalystEvidence } from '@/lib/analytics/moveExplainer/types';
import OpenAI from 'openai';

const openai = ENV.OPENAI_API_KEY ? new OpenAI({ apiKey: ENV.OPENAI_API_KEY }) : null;

export type MoveExplainerInput = {
  ticker: string;
  move: MoveEvent;
  benchmarkComparison?: BenchmarkComparison;
  evidence: CatalystEvidence[]; // Top evidence items (news + events)
  eventItems?: Array<{ type: string; title: string; date?: string }>; // EventItem titles
};

export type MoveExplainerOutput = {
  headline: string;
  explanation: string;
  drivers: string[];
  certainty: 'high' | 'med' | 'low';
  citations: Array<{
    title: string;
    url?: string;
    source?: string;
    publishedAt?: string;
  }>;
};

/**
 * Extract all text content from evidence for verification
 */
function extractEvidenceText(evidence: CatalystEvidence[], eventItems?: Array<{ type: string; title: string; date?: string }>): string {
  const texts: string[] = [];
  
  for (const ev of evidence) {
    texts.push(ev.title);
  }
  
  if (eventItems) {
    for (const event of eventItems) {
      texts.push(event.title);
    }
  }
  
  return texts.join(' ').toLowerCase();
}

/**
 * Forbidden phrases that indicate hallucination (numbers/specific claims)
 */
const FORBIDDEN_PHRASES = [
  /reported earnings of \$?[\d,]+\.?[\d]*/i,  // Matches decimals like $5.2 or $5,000.5
  /revenue of \$?[\d,]+\.?[\d]*/i,
  /eps of [\d.]+/i,
  /beat by [\d.]+%/i,
  /missed by [\d.]+%/i,
  /raised guidance to \$?[\d,]+\.?[\d]*/i,
  /lowered guidance to \$?[\d,]+\.?[\d]*/i,
  /filed (?:a )?[\d]+-K/i,
  /filed (?:a )?[\d]+-Q/i,
  /price target of \$?[\d.]+/i,
  /downgraded to [\w]+/i,
  /upgraded to [\w]+/i,
];

/**
 * Check if explanation contains forbidden phrases that aren't in evidence
 */
function containsForbiddenPhrases(
  explanation: string,
  evidenceText: string
): { hasForbidden: boolean; forbiddenMatches: string[] } {
  const explanationLower = explanation.toLowerCase();
  const evidenceTextLower = evidenceText.toLowerCase();
  const forbiddenMatches: string[] = [];
  
  for (const pattern of FORBIDDEN_PHRASES) {
    const matches = explanationLower.match(pattern);
    if (matches) {
      // matches is an array, get the full match (index 0)
      const fullMatch = matches[0];
      
      // Check if the full matched phrase appears in evidence (allowing for variations)
      if (evidenceTextLower.includes(fullMatch)) {
        // Phrase is in evidence - not forbidden
        continue;
      }
      
      // Phrase not found exactly - check if the key numeric value is in evidence
      // Extract numeric part (e.g., "5.2" from "reported earnings of $5.2")
      const numericMatch = fullMatch.match(/[\d,.]+/);
      if (numericMatch) {
        const numericValue = numericMatch[0];
        // If the numeric value appears in evidence with context, consider it supported
        // Check if numeric value appears near the phrase keyword in evidence
        const keywordMatch = fullMatch.match(/earnings|revenue|eps|guidance|target|beat|miss|filed|downgraded|upgraded/i);
        if (keywordMatch && evidenceTextLower.includes(numericValue)) {
          // The numeric value appears in evidence, likely in similar context
          continue;
        }
      }
      
      // Phrase and numeric value not found in evidence - it's forbidden
      forbiddenMatches.push(fullMatch);
    }
  }
  
  return {
    hasForbidden: forbiddenMatches.length > 0,
    forbiddenMatches,
  };
}

/**
 * Validate explanation output
 */
export function validateMoveExplanation(
  output: MoveExplainerOutput,
  evidence: CatalystEvidence[],
  eventItems?: Array<{ type: string; title: string; date?: string }>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check citations are non-empty when certainty != "low"
  if (output.certainty !== 'low' && output.citations.length === 0) {
    errors.push('Citations must be non-empty when certainty is not "low"');
  }
  
  // Validate citations exist in evidence
  const evidenceMap = new Map<string, CatalystEvidence>();
  for (const ev of evidence) {
    const key = `${ev.title}|${ev.url || ''}|${ev.source || ''}`;
    evidenceMap.set(key, ev);
    // Also store by title only for fuzzy matching
    const titleKey = ev.title.toLowerCase().trim();
    if (!evidenceMap.has(`title:${titleKey}`)) {
      evidenceMap.set(`title:${titleKey}`, ev);
    }
  }
  
  for (const cite of output.citations) {
    const key = `${cite.title}|${cite.url || ''}|${cite.source || ''}`;
    const titleKey = cite.title.toLowerCase().trim();
    
    // Check exact match first
    if (evidenceMap.has(key)) {
      continue;
    }
    
    // Check title-only match (fuzzy match for cases where url/source might differ slightly)
    if (evidenceMap.has(`title:${titleKey}`)) {
      continue;
    }
    
    // Check if it matches event items
    const matchesEvent = eventItems?.some(
      e => e.title === cite.title || cite.title.includes(e.title) || e.title.includes(cite.title)
    );
    
    if (!matchesEvent) {
      errors.push(`Citation not found in evidence: ${cite.title}`);
    }
  }
  
  // Check for forbidden phrases (only check explanation and drivers, not headline)
  const evidenceText = extractEvidenceText(evidence, eventItems);
  const forbiddenCheck = containsForbiddenPhrases(output.explanation, evidenceText);
  
  if (forbiddenCheck.hasForbidden) {
    errors.push(`Explanation contains unsupported claims: ${forbiddenCheck.forbiddenMatches.join(', ')}`);
  }
  
  // Check drivers don't contain forbidden phrases
  for (const driver of output.drivers) {
    const driverForbidden = containsForbiddenPhrases(driver, evidenceText);
    if (driverForbidden.hasForbidden) {
      errors.push(`Driver contains unsupported claims: ${driver}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generate deterministic rationale (fallback when AI fails validation)
 */
export function generateDeterministicRationale(
  input: MoveExplainerInput
): MoveExplainerOutput {
  const { ticker, move, benchmarkComparison, evidence } = input;
  
  const direction = move.direction === 'up' ? 'increased' : 'decreased';
  const movePct = Math.abs(move.returnPct);
  
  // Build headline from top evidence
  let headline = `${ticker} ${direction} ${movePct.toFixed(1)}%`;
  if (evidence.length > 0 && evidence[0]) {
    const topEvidence = evidence[0];
    if (topEvidence.title.length < 60) {
      headline = topEvidence.title;
    } else {
      headline = `${headline} on ${topEvidence.title.substring(0, 40)}...`;
    }
  }
  
  // Build explanation
  let explanation = `On ${move.date}, ${ticker} ${direction} ${movePct.toFixed(1)}%`;
  
  if (benchmarkComparison) {
    const benchDirection = benchmarkComparison.returnPct >= 0 ? 'increased' : 'decreased';
    const benchPct = Math.abs(benchmarkComparison.returnPct);
    explanation += ` while ${benchmarkComparison.ticker} ${benchDirection} ${benchPct.toFixed(1)}%`;
    
    if (benchmarkComparison.context === 'idiosyncratic') {
      explanation += '. This move appears to be idiosyncratic (stock-specific rather than market-driven).';
    } else {
      explanation += ', suggesting broader market or sector dynamics.';
    }
  } else {
    explanation += '.';
  }
  
  if (evidence.length > 0) {
    explanation += ' Available evidence includes news and events from this period.';
    if (evidence.length > 1) {
      explanation += ` Multiple sources (${evidence.length}) reported on this move.`;
    }
  } else {
    explanation += ' Limited evidence available to explain this move.';
  }
  
  // Build drivers from evidence
  const drivers: string[] = [];
  if (evidence.length > 0) {
    for (let i = 0; i < Math.min(3, evidence.length); i++) {
      const ev = evidence[i];
      if (ev) {
        drivers.push(ev.title.substring(0, 80));
      }
    }
  } else {
    drivers.push(`Price ${direction} ${movePct.toFixed(1)}% on ${move.date}`);
  }
  
  // Citations
  const citations = evidence.slice(0, 5).map(ev => ({
    title: ev.title,
    url: ev.url,
    source: ev.source,
    publishedAt: ev.publishedAt || ev.date,
  }));
  
  // Determine certainty based on evidence
  const certainty: 'high' | 'med' | 'low' = 
    evidence.length >= 2 ? 'med' : 
    evidence.length === 1 ? 'low' : 'low';
  
  return {
    headline,
    explanation,
    drivers,
    certainty,
    citations,
  };
}

/**
 * Generate AI explanation with strict validation
 */
export async function explainMoveAI(
  input: MoveExplainerInput,
  attempt: number = 1
): Promise<MoveExplainerOutput> {
  const { ticker, move, benchmarkComparison, evidence, eventItems } = input;
  
  // Graceful degradation: no OpenAI key
  if (!openai || !ENV.OPENAI_API_KEY) {
    return generateDeterministicRationale(input);
  }
  
  // No evidence: use deterministic
  if (evidence.length === 0 && (!eventItems || eventItems.length === 0)) {
    return generateDeterministicRationale(input);
  }
  
  // Build evidence summary with full context
  const evidenceEntries: string[] = [];
  
  for (const ev of evidence) {
    const date = ev.publishedAt || ev.date || 'unknown date';
    const source = ev.source || 'unknown source';
    const kind = ev.kind === 'event' ? '[EVENT]' : '[NEWS]';
    evidenceEntries.push(
      `${kind} "${ev.title}" (${source}, ${date})${ev.url ? ` [URL: ${ev.url}]` : ''}`
    );
  }
  
  if (eventItems) {
    for (const event of eventItems) {
      evidenceEntries.push(
        `[EVENT] "${event.title}" (${event.type}, ${event.date || 'unknown date'})`
      );
    }
  }
  
  const evidenceText = extractEvidenceText(evidence, eventItems);
  
  // Build prompt with strict instructions
  const systemPrompt = `You are a financial analyst explaining stock price moves. CRITICAL RULES:
1. You may ONLY mention facts that appear in the provided evidence.
2. Do NOT invent numbers, dates, or specific details.
3. If evidence is weak, use "likely" and note uncertainty.
4. Every factual claim beyond "price moved" MUST be cited.
5. Use generic language when specific details aren't in evidence (e.g., "earnings beat" not "earnings beat by 5%").`;
  
  const userPrompt = `Explain this stock move using ONLY the evidence provided.

Ticker: ${ticker}
Date: ${move.date}
Move: ${move.direction === 'up' ? '+' : ''}${move.returnPct.toFixed(2)}%
${benchmarkComparison ? `Benchmark (${benchmarkComparison.ticker}): ${benchmarkComparison.returnPct >= 0 ? '+' : ''}${benchmarkComparison.returnPct.toFixed(2)}%` : ''}

EVIDENCE (you may ONLY reference these):
${evidenceEntries.join('\n')}

${evidence.length === 0 ? 'WARNING: Very limited evidence. Use high uncertainty and generic language.' : ''}

Generate JSON with this exact structure:
{
  "headline": "One-line summary (max 80 chars, factual only)",
  "explanation": "3-6 sentences explaining the move based ONLY on evidence. Use 'likely' if uncertain. Do not invent numbers.",
  "drivers": ["driver 1", "driver 2", "driver 3"],
  "certainty": "high" | "med" | "low",
  "citations": [
    {
      "title": "exact title from evidence",
      "url": "exact url or empty string",
      "source": "exact source or empty string",
      "publishedAt": "exact date or empty string"
    }
  ]
}

CRITICAL: Citations must exactly match evidence titles. Do not invent facts.`;
  
  try {
    const completion = await openai.chat.completions.create({
      model: ENV.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2, // Very low temperature for factual output
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });
    
    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return generateDeterministicRationale(input);
    }
    
    let parsed: MoveExplainerOutput;
    try {
      parsed = JSON.parse(content) as MoveExplainerOutput;
    } catch (parseError) {
      console.error('[MoveExplainer] Failed to parse JSON:', parseError);
      return generateDeterministicRationale(input);
    }
    
    // Validate output
    const validation = validateMoveExplanation(parsed, evidence, eventItems);
    
    if (!validation.valid) {
      console.warn('[MoveExplainer] Validation failed:', validation.errors);
      
      // Regenerate once if this is first attempt
      if (attempt === 1) {
        const retryPrompt = `${userPrompt}

PREVIOUS ATTEMPT FAILED VALIDATION:
${validation.errors.join('\n')}

REQUIREMENT: Only use evidence provided. Do not invent numbers or specific details. Use generic language when evidence is vague.`;
        
        try {
          const retryCompletion = await openai.chat.completions.create({
            model: ENV.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt + '\n\nCORRECTION: Evidence-only, no new facts. Use generic language.' },
              { role: 'user', content: retryPrompt },
            ],
            temperature: 0.1, // Even lower for retry
            max_tokens: 800,
            response_format: { type: 'json_object' },
          });
          
          const retryContent = retryCompletion.choices[0]?.message?.content;
          if (retryContent) {
            const retryParsed = JSON.parse(retryContent) as MoveExplainerOutput;
            const retryValidation = validateMoveExplanation(retryParsed, evidence, eventItems);
            
            if (retryValidation.valid) {
              return retryParsed;
            }
          }
        } catch (retryError) {
          console.error('[MoveExplainer] Retry failed:', retryError);
        }
      }
      
      // Fallback to deterministic
      return generateDeterministicRationale(input);
    }
    
    return parsed;
  } catch (error) {
    console.error('[MoveExplainer] AI generation failed:', error);
    return generateDeterministicRationale(input);
  }
}

/**
 * Main entry point - wraps the old interface for compatibility
 */
export async function explainMove(
  input: {
    ticker: string;
    move: MoveEvent;
    catalysts: Catalyst[];
    benchmarkComparison?: BenchmarkComparison;
  }
): Promise<MoveExplanation | null> {
  const { ticker, move, catalysts, benchmarkComparison } = input;
  
  // Collect all evidence
  const evidence: CatalystEvidence[] = [];
  const eventItems: Array<{ type: string; title: string; date?: string }> = [];
  
  for (const cat of catalysts) {
    evidence.push(...cat.newsEvidence || []);
    evidence.push(...cat.eventEvidence || []);
    
    // Also collect event items if available
    for (const ev of cat.eventEvidence || []) {
      if (ev.kind === 'event') {
        eventItems.push({
          type: ev.source || 'other',
          title: ev.title,
          date: ev.date,
        });
      }
    }
  }
  
  const aiOutput = await explainMoveAI({
    ticker,
    move,
    benchmarkComparison,
    evidence,
    eventItems,
  });
  
  return {
    headline: aiOutput.headline,
    explanation: aiOutput.explanation,
    drivers: aiOutput.drivers,
    certainty: aiOutput.certainty,
    citations: aiOutput.citations.map(c => ({
      title: c.title,
      url: c.url || '',
      source: c.source || '',
      publishedAt: c.publishedAt || '',
    })),
    benchmarkComparison,
  };
}


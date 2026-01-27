import type { ModelAndVizArtifact } from '@/lib/ai/schemas';
import type { AgentOutput } from '@/lib/ai/schemas';
import { getObjectiveMetric } from './objectiveMetric';
import type { OneWaySensitivityResult } from './sensitivity';

export type SlideSummaryData = {
  decisionQuestion?: string;
  objectiveMetric: string;
  objectiveMetricLabel: string;
  baseValue: string;
  upsideDelta?: string;
  downsideDelta?: string;
  topDrivers: Array<{ driver: string; impact: string }>;
  keyAssumptions: Array<{ assumption: string; confidence: 'user' | 'inferred' | 'placeholder'; value?: string }>;
  nextDataRequests: string[];
};

/**
 * Extract decision question from prompt or output summary
 */
function extractDecisionQuestion(output: AgentOutput): string | undefined {
  // Check if there's a decision question in the summary or context
  const summary = output.summary || '';
  
  // Look for decision question patterns
  const decisionPatterns = [
    /should we (invest|buy|acquire|launch|proceed|expand|hire|build)/i,
    /(invest|buy|acquire|launch|proceed|expand|hire|build)\?/i,
    /decision: (.+)/i,
    /question: (.+)/i,
    /key question: (.+)/i,
  ];

  for (const pattern of decisionPatterns) {
    const match = summary.match(pattern);
    if (match && match[0]) {
      return match[0].trim();
    }
  }

  return undefined;
}

/**
 * Extract upside/downside deltas from summary or rows
 */
function extractUpsideDownside(
  artifact: ModelAndVizArtifact,
  objectiveMetricKey: string
): { upside?: string; downside?: string } {
  const summary = artifact.evaluation?.summary || [];
  const rows = artifact.evaluation?.rows || [];

  // Look for scenario values in summary
  const upsideItem = summary.find((s) => 
    s.key.toLowerCase().includes('upside') || 
    s.key.toLowerCase().includes('up') ||
    s.label.toLowerCase().includes('upside')
  );
  const downsideItem = summary.find((s) => 
    s.key.toLowerCase().includes('downside') || 
    s.key.toLowerCase().includes('down') ||
    s.label.toLowerCase().includes('downside')
  );

  // Get base value
  const baseItem = summary.find((s) => s.key === objectiveMetricKey);
  const baseValue = typeof baseItem?.value === 'number' ? baseItem.value : null;

  const formatDelta = (value: number | string | null, base: number | null): string | undefined => {
    if (value === null || base === null) return undefined;
    const numValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/,/g, '')) : null;
    if (numValue === null || !Number.isFinite(numValue) || !Number.isFinite(base) || base === 0) return undefined;
    
    const delta = numValue - base;
    const deltaPct = (delta / Math.abs(base)) * 100;
    const sign = delta >= 0 ? '+' : '';
    
    // Format based on magnitude
    if (Math.abs(delta) >= 1_000_000_000) {
      return `${sign}$${(delta / 1_000_000_000).toFixed(1)}B (${sign}${deltaPct.toFixed(1)}%)`;
    }
    if (Math.abs(delta) >= 1_000_000) {
      return `${sign}$${(delta / 1_000_000).toFixed(1)}M (${sign}${deltaPct.toFixed(1)}%)`;
    }
    if (Math.abs(delta) >= 1_000) {
      return `${sign}$${(delta / 1_000).toFixed(1)}K (${sign}${deltaPct.toFixed(1)}%)`;
    }
    return `${sign}${delta.toFixed(2)} (${sign}${deltaPct.toFixed(1)}%)`;
  };

  return {
    upside: upsideItem?.value !== undefined ? formatDelta(upsideItem.value, baseValue) : undefined,
    downside: downsideItem?.value !== undefined ? formatDelta(downsideItem.value, baseValue) : undefined,
  };
}

/**
 * Get top drivers from sensitivity results
 */
function getTopDrivers(sensitivityResult: OneWaySensitivityResult | null, topN: number = 3): Array<{ driver: string; impact: string }> {
  if (!sensitivityResult || !sensitivityResult.impacts || sensitivityResult.impacts.length === 0) {
    return [];
  }

  return sensitivityResult.impacts.slice(0, topN).map((impact) => {
    const maxImpact = Math.max(Math.abs(impact.delta_down), Math.abs(impact.delta_up));
    const maxPct = Math.max(Math.abs(impact.impact_down_pct), Math.abs(impact.impact_up_pct));
    
    // Format impact
    let impactStr: string;
    if (maxImpact >= 1_000_000_000) {
      impactStr = `±$${(maxImpact / 1_000_000_000).toFixed(1)}B`;
    } else if (maxImpact >= 1_000_000) {
      impactStr = `±$${(maxImpact / 1_000_000).toFixed(1)}M`;
    } else if (maxImpact >= 1_000) {
      impactStr = `±$${(maxImpact / 1_000).toFixed(1)}K`;
    } else {
      impactStr = `±${maxImpact.toFixed(2)}`;
    }
    
    if (maxPct > 0.1) {
      impactStr += ` (±${maxPct.toFixed(1)}%)`;
    }

    return {
      driver: impact.input_label,
      impact: impactStr,
    };
  });
}

/**
 * Get key assumptions with confidence tags
 */
function getKeyAssumptions(artifact: ModelAndVizArtifact, topN: number = 5): Array<{ assumption: string; confidence: 'user' | 'inferred' | 'placeholder'; value?: string }> {
  const inputs = artifact.model.inputs || [];
  
  // Sort by importance (prioritize non-placeholders, then by relevance to outputs)
  const sortedInputs = [...inputs].sort((a, b) => {
    const aSource = (a as any).source || 'user';
    const bSource = (b as any).source || 'user';
    
    // Prioritize user > inferred > placeholder
    const sourcePriority: Record<string, number> = { user: 3, inferred: 2, placeholder: 1 };
    if (sourcePriority[aSource] !== sourcePriority[bSource]) {
      return sourcePriority[bSource] - sourcePriority[aSource];
    }
    
    return 0;
  });

  return sortedInputs.slice(0, topN).map((input) => {
    const source = (input as any).source || 'user';
    const value = input.value !== null && input.value !== undefined 
      ? typeof input.value === 'number' 
        ? input.value.toLocaleString(undefined, { maximumFractionDigits: 2 })
        : String(input.value)
      : undefined;

    return {
      assumption: input.label,
      confidence: source as 'user' | 'inferred' | 'placeholder',
      value,
    };
  });
}

/**
 * Generate next data requests based on placeholders and low-confidence assumptions
 */
function generateNextDataRequests(artifact: ModelAndVizArtifact, assumptionsSummary: any, topN: number = 3): string[] {
  const requests: string[] = [];
  
  // Check assumptions summary for placeholders
  if (assumptionsSummary?.high_impact_placeholders && assumptionsSummary.high_impact_placeholders.length > 0) {
    assumptionsSummary.high_impact_placeholders.slice(0, topN).forEach((placeholder: string) => {
      requests.push(`Provide ${placeholder} (currently using placeholder value)`);
    });
  }

  // Check inputs for placeholder or inferred sources
  const inputs = artifact.model.inputs || [];
  const placeholderInputs = inputs
    .filter((inp) => {
      const source = (inp as any).source;
      return source === 'placeholder' || source === 'inferred';
    })
    .slice(0, topN - requests.length);

  placeholderInputs.forEach((input) => {
    const source = (input as any).source;
    const label = source === 'placeholder' ? input.label : `${input.label} (verify inferred value)`;
    if (!requests.some((r) => r.includes(label))) {
      requests.push(`Confirm ${label}`);
    }
  });

  return requests.slice(0, topN);
}

/**
 * Format value for slide summary
 */
function formatValueForSlide(value: number | string | null, unit?: string): string {
  if (value === null || value === undefined) return '—';
  
  if (typeof value === 'number') {
    if (Math.abs(value) >= 1_000_000_000) {
      return `$${(value / 1_000_000_000).toFixed(2)}B${unit ? ` ${unit}` : ''}`;
    }
    if (Math.abs(value) >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(2)}M${unit ? ` ${unit}` : ''}`;
    }
    if (Math.abs(value) >= 1_000) {
      return `$${(value / 1_000).toFixed(2)}K${unit ? ` ${unit}` : ''}`;
    }
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`;
  }
  
  return `${value}${unit ? ` ${unit}` : ''}`;
}

/**
 * Generate slide-ready summary (plain text, no markdown)
 */
export function generateSlideSummary(
  output: AgentOutput,
  artifact: ModelAndVizArtifact,
  sensitivityResult: OneWaySensitivityResult | null = null
): string {
  if (output.type !== 'MODEL_AND_VIZ') {
    return 'Slide summary only available for MODEL_AND_VIZ artifacts.';
  }

  const objectiveMetric = getObjectiveMetric(artifact);
  const summary = artifact.evaluation?.summary || [];
  const baseItem = summary.find((s) => s.key === objectiveMetric.key);
  const baseValue = formatValueForSlide(baseItem?.value ?? null, baseItem?.unit);

  const decisionQuestion = extractDecisionQuestion(output);
  const { upside, downside } = extractUpsideDownside(artifact, objectiveMetric.key);
  const topDrivers = getTopDrivers(sensitivityResult, 3);
  const keyAssumptions = getKeyAssumptions(artifact, 5);
  const assumptionsSummary = output.assumptions_summary;
  const nextDataRequests = generateNextDataRequests(artifact, assumptionsSummary, 3);

  // Build plain text summary
  const lines: string[] = [];

  if (decisionQuestion) {
    lines.push(`DECISION QUESTION`);
    lines.push(decisionQuestion);
    lines.push('');
  }

  lines.push(`OBJECTIVE METRIC`);
  lines.push(`${objectiveMetric.label}: ${baseValue}`);
  lines.push('');

  if (upside || downside) {
    lines.push(`SCENARIO DELTAS`);
    if (upside) {
      lines.push(`Upside: ${upside}`);
    }
    if (downside) {
      lines.push(`Downside: ${downside}`);
    }
    lines.push('');
  }

  if (topDrivers.length > 0) {
    lines.push(`TOP 3 DRIVERS (from sensitivity analysis)`);
    topDrivers.forEach((driver, idx) => {
      lines.push(`${idx + 1}. ${driver.driver}: ${driver.impact}`);
    });
    lines.push('');
  }

  if (keyAssumptions.length > 0) {
    lines.push(`KEY ASSUMPTIONS`);
    keyAssumptions.forEach((assumption) => {
      const confidenceTag = assumption.confidence === 'user' 
        ? '[USER]' 
        : assumption.confidence === 'inferred' 
        ? '[INFERRED]' 
        : '[PLACEHOLDER]';
      const valueStr = assumption.value ? ` = ${assumption.value}` : '';
      lines.push(`${assumption.assumption}${valueStr} ${confidenceTag}`);
    });
    lines.push('');
  }

  if (nextDataRequests.length > 0) {
    lines.push(`NEXT DATA TO REQUEST`);
    nextDataRequests.forEach((request, idx) => {
      lines.push(`${idx + 1}. ${request}`);
    });
  }

  return lines.join('\n');
}


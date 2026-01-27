import type { ModelAndVizArtifact } from '@/lib/ai/schemas';

export type ObjectiveMetricResult = {
  key: string;
  label: string;
  confidence: 'high' | 'medium' | 'low';
};

/**
 * Infer the objective metric from prompt text based on business intent
 */
export function inferObjectiveMetricFromPrompt(
  prompt: string,
  availableOutputs: Array<{ key: string; label: string }>
): ObjectiveMetricResult {
  const p = (prompt ?? '').toLowerCase();

  // Profit/Margin/Cash indicators
  const profitIndicators = [
    /\bprofit\b/,
    /\bprofitability\b/,
    /\bmargin\b/,
    /\bebitda\b/,
    /\bebit\b/,
    /\bnet income\b/,
    /\boperating income\b/,
    /\bcash flow\b/,
    /\bfree cash flow\b/,
    /\bfcf\b/,
    /\bunlevered fcf\b/,
    /\blevered fcf\b/,
    /\bcash generation\b/,
    /\boperating profit\b/,
    /\bgross profit\b/,
  ];

  // Growth indicators
  const growthIndicators = [
    /\bgrowth\b/,
    /\bexpand\b/,
    /\bscal\w+\b/,
    /\brevenue\b/,
    /\barr\b/,
    /\bmrr\b/,
    /\bannual recurring revenue\b/,
    /\bmonthly recurring revenue\b/,
    /\bsales\b/,
    /\bunits?\b/,
    /\bvolume\b/,
  ];

  // Retention/Churn indicators
  const retentionIndicators = [
    /\bretention\b/,
    /\bchurn\b/,
    /\bretained\b/,
    /\bcustomer retention\b/,
    /\bretention rate\b/,
    /\bchurn rate\b/,
    /\bnet revenue retention\b/,
    /\bnrr\b/,
    /\bgross revenue retention\b/,
    /\bgrr\b/,
  ];

  // Count matches
  const profitMatches = profitIndicators.filter((re) => re.test(p)).length;
  const growthMatches = growthIndicators.filter((re) => re.test(p)).length;
  const retentionMatches = retentionIndicators.filter((re) => re.test(p)).length;

  // Priority order: profit > retention > growth > revenue (default)

  // Profit/Margin/Cash priority
  if (profitMatches > 0) {
    // Try to find matching output keys (case-insensitive)
    const profitKeys = ['operating_profit', 'operatingprofit', 'ebit', 'ebitda', 'net_income', 'netincome', 'fcf', 'free_cash_flow', 'unlevered_fcf', 'ufcf', 'operating_profit', 'profit'];
    const matchingOutput = availableOutputs.find((out) => 
      profitKeys.some((key) => out.key.toLowerCase().includes(key.toLowerCase()))
    );
    
    if (matchingOutput) {
      return {
        key: matchingOutput.key,
        label: matchingOutput.label,
        confidence: profitMatches >= 2 ? 'high' : 'medium',
      };
    }

    // Fallback to first profit-related output or first output
    const profitOutput = availableOutputs.find((out) => 
      out.key.toLowerCase().includes('profit') || 
      out.key.toLowerCase().includes('ebit') ||
      out.key.toLowerCase().includes('fcf') ||
      out.key.toLowerCase().includes('cash')
    );
    
    if (profitOutput) {
      return {
        key: profitOutput.key,
        label: profitOutput.label,
        confidence: 'medium',
      };
    }
  }

  // Retention/Churn priority
  if (retentionMatches > 0) {
    const retentionKeys = ['churn_rate', 'churnrate', 'retention_rate', 'retentionrate', 'retained_arr', 'retainedarr', 'nrr', 'grr'];
    const matchingOutput = availableOutputs.find((out) =>
      retentionKeys.some((key) => out.key.toLowerCase().includes(key.toLowerCase()))
    );

    if (matchingOutput) {
      return {
        key: matchingOutput.key,
        label: matchingOutput.label,
        confidence: retentionMatches >= 2 ? 'high' : 'medium',
      };
    }

    const retentionOutput = availableOutputs.find((out) =>
      out.key.toLowerCase().includes('churn') ||
      out.key.toLowerCase().includes('retention') ||
      out.key.toLowerCase().includes('retained')
    );

    if (retentionOutput) {
      return {
        key: retentionOutput.key,
        label: retentionOutput.label,
        confidence: 'medium',
      };
    }
  }

  // Growth priority
  if (growthMatches > 0) {
    const growthKeys = ['revenue', 'arr', 'mrr', 'sales', 'units'];
    const matchingOutput = availableOutputs.find((out) =>
      growthKeys.some((key) => out.key.toLowerCase() === key.toLowerCase() || out.key.toLowerCase().includes(key.toLowerCase()))
    );

    if (matchingOutput) {
      return {
        key: matchingOutput.key,
        label: matchingOutput.label,
        confidence: growthMatches >= 2 ? 'high' : 'medium',
      };
    }

    const revenueOutput = availableOutputs.find((out) =>
      out.key.toLowerCase().includes('revenue') ||
      out.key.toLowerCase().includes('arr') ||
      out.key.toLowerCase().includes('mrr') ||
      out.key.toLowerCase().includes('sales')
    );

    if (revenueOutput) {
      return {
        key: revenueOutput.key,
        label: revenueOutput.label,
        confidence: 'medium',
      };
    }
  }

  // Default: revenue or first output
  const revenueOutput = availableOutputs.find((out) =>
    out.key.toLowerCase() === 'revenue' ||
    out.key.toLowerCase().includes('revenue')
  );

  if (revenueOutput) {
    return {
      key: revenueOutput.key,
      label: revenueOutput.label,
      confidence: 'low',
    };
  }

  // Final fallback: first output
  if (availableOutputs.length > 0) {
    return {
      key: availableOutputs[0].key,
      label: availableOutputs[0].label,
      confidence: 'low',
    };
  }

  // No outputs available
  return {
    key: 'unknown',
    label: 'Unknown',
    confidence: 'low',
  };
}

/**
 * Get the objective metric from an artifact (with fallback)
 */
export function getObjectiveMetric(artifact: ModelAndVizArtifact): ObjectiveMetricResult {
  const { model } = artifact;

  // If explicitly set, use it
  if (model.objective_metric_key && model.objective_metric_label) {
    return {
      key: model.objective_metric_key,
      label: model.objective_metric_label,
      confidence: 'high',
    };
  }

  // Fallback to first output
  if (model.outputs.length > 0) {
    return {
      key: model.outputs[0].key,
      label: model.outputs[0].label,
      confidence: 'low',
    };
  }

  return {
    key: 'unknown',
    label: 'Unknown',
    confidence: 'low',
  };
}

/**
 * Find an output by key (case-insensitive partial match)
 */
export function findOutputByKey(
  outputs: Array<{ key: string; label: string }>,
  targetKey: string
): { key: string; label: string } | null {
  const targetLower = targetKey.toLowerCase();
  
  // Exact match
  const exact = outputs.find((out) => out.key.toLowerCase() === targetLower);
  if (exact) return exact;

  // Partial match
  const partial = outputs.find((out) => out.key.toLowerCase().includes(targetLower) || targetLower.includes(out.key.toLowerCase()));
  if (partial) return partial;

  return null;
}


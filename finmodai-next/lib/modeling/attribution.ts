import type { ModelAndVizArtifact } from '@/lib/ai/schemas';

export type DriverContribution = {
  driver: string;
  direction: 'positive' | 'negative';
  magnitude: string;
  explanation: string;
};

export type ExplainabilityResult = {
  primary_metric: string;
  contributions: DriverContribution[];
};

/**
 * Computes driver attribution for the primary output metric.
 * For each key driver, estimates its contribution by comparing
 * base case to a scenario where that driver is held constant.
 */
export function computeAttribution(artifact: ModelAndVizArtifact): ExplainabilityResult {
  const { model, evaluation } = artifact;
  const { inputs, outputs } = model;
  const { rows } = evaluation;

  // Identify primary metric (first output, or one with highest absolute value)
  const primaryOutput = outputs[0];
  if (!primaryOutput) {
    return {
      primary_metric: 'unknown',
      contributions: [],
    };
  }

  const primaryMetric = primaryOutput.key;
  const primaryLabel = primaryOutput.label;

  // Extract base case value (last period, or average of last 3 periods)
  const getBaseValue = (): number | null => {
    if (rows.length === 0) return null;
    const lastPeriods = rows.slice(-3);
    const values = lastPeriods
      .map((r) => {
        const val = r[primaryMetric];
        if (typeof val === 'number' && Number.isFinite(val)) return val;
        if (typeof val === 'string') {
          const parsed = Number(val.replace(/,/g, ''));
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      })
      .filter((v): v is number => v !== null);

    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  };

  const baseValue = getBaseValue();
  if (baseValue === null) {
    return {
      primary_metric: primaryLabel,
      contributions: [],
    };
  }

  // Identify key drivers (inputs that are numbers and not placeholders)
  const keyDrivers = inputs
    .filter((inp) => {
      const val = typeof inp.value === 'number' ? inp.value : typeof inp.value === 'string' ? Number(inp.value) : null;
      const isNumeric = val !== null && Number.isFinite(val);
      const isPlaceholder = inp.source === 'placeholder' || inp.notes?.toLowerCase().includes('placeholder');
      const isRelevant =
        !inp.key.toLowerCase().includes('index') &&
        !inp.key.toLowerCase().includes('baseline') &&
        !inp.key.toLowerCase().includes('period');

      return isNumeric && !isPlaceholder && isRelevant && Math.abs(val) > 0.01;
    })
    .slice(0, 10) // Limit to top 10 drivers for performance
    .map((inp) => inp.key);

  if (keyDrivers.length === 0) {
    return {
      primary_metric: primaryLabel,
      contributions: [],
    };
  }

  // For each driver, estimate contribution using sensitivity analysis
  // We approximate by looking at the relationship between the driver and the output
  const contributions: DriverContribution[] = [];

  for (const driverKey of keyDrivers) {
    const driverInput = inputs.find((inp) => inp.key === driverKey);
    if (!driverInput) continue;

    const driverValue = typeof driverInput.value === 'number' ? driverInput.value : typeof driverInput.value === 'string' ? Number(driverInput.value) : null;
    if (driverValue === null || !Number.isFinite(driverValue)) continue;

    // Estimate contribution by analyzing correlation between driver and output across periods
    // This is a simplified approach - in a real model, we'd re-run with driver held constant
    const driverValues: number[] = [];
    const outputValues: number[] = [];

    for (const row of rows) {
      const dv = typeof row[driverKey] === 'number' ? row[driverKey] : typeof row[driverKey] === 'string' ? Number(row[driverKey]) : null;
      const ov = typeof row[primaryMetric] === 'number' ? row[primaryMetric] : typeof row[primaryMetric] === 'string' ? Number(row[primaryMetric]) : null;

      if (dv !== null && Number.isFinite(dv) && ov !== null && Number.isFinite(ov)) {
        driverValues.push(dv);
        outputValues.push(ov);
      }
    }

    if (driverValues.length < 2) continue;

    // Compute simple correlation/slope
    const n = driverValues.length;
    const sumX = driverValues.reduce((a, b) => a + b, 0);
    const sumY = outputValues.reduce((a, b) => a + b, 0);
    const sumXY = driverValues.reduce((sum, x, i) => sum + x * outputValues[i], 0);
    const sumX2 = driverValues.reduce((sum, x) => sum + x * x, 0);
    const sumY2 = outputValues.reduce((sum, y) => sum + y * y, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const correlation = (n * sumXY - sumX * sumY) / Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    // Estimate contribution as: slope * (driver_value / base_output) * 100
    // This gives us the approximate percentage contribution
    if (Number.isFinite(slope) && Number.isFinite(correlation) && Math.abs(correlation) > 0.1) {
      const contributionPct = (slope * driverValue) / Math.abs(baseValue);
      const absContribution = Math.abs(contributionPct * 100);
      const direction = contributionPct > 0 ? 'positive' : 'negative';

      // Format magnitude
      let magnitude: string;
      if (absContribution >= 50) {
        magnitude = 'High';
      } else if (absContribution >= 20) {
        magnitude = 'Moderate';
      } else if (absContribution >= 5) {
        magnitude = 'Low';
      } else {
        magnitude = 'Minimal';
      }

      // Build explanation
      const driverLabel = driverInput.label || driverKey;
      const pctStr = absContribution.toFixed(1);
      const explanation = `${driverLabel} has a ${direction} impact of approximately ${pctStr}% on ${primaryLabel}. ${correlation > 0 ? 'Increases' : 'Decreases'} in ${driverLabel} ${correlation > 0 ? 'drive' : 'reduce'} ${primaryLabel}.`;

      contributions.push({
        driver: driverLabel,
        direction,
        magnitude,
        explanation,
      });
    }
  }

  // Sort by absolute contribution magnitude
  contributions.sort((a, b) => {
    const aMag = a.magnitude === 'High' ? 3 : a.magnitude === 'Moderate' ? 2 : a.magnitude === 'Low' ? 1 : 0;
    const bMag = b.magnitude === 'High' ? 3 : b.magnitude === 'Moderate' ? 2 : b.magnitude === 'Low' ? 1 : 0;
    return bMag - aMag;
  });

  return {
    primary_metric: primaryLabel,
    contributions: contributions.slice(0, 8), // Return top 8 drivers
  };
}


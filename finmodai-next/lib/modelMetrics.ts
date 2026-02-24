/**
 * Model Metrics
 * Track and analyze model generation metrics
 */

export type ModelType =
  | 'dcf'
  | 'debt-capacity-lite'
  | 'lbo'
  | 'comps'
  | 'merger'
  | 'operating'
  | 'three-statement'
  | 'scorecard';

export interface ModelStats {
  totalModels: number;
  byType: Record<ModelType, number>;
  byStatus: Record<string, number>;
  avgGenerationTime?: number;
  successRate?: number;
}

export interface ModelMetrics {
  modelId: string;
  modelType: ModelType;
  ticker: string;
  generationTimeMs: number;
  success: boolean;
  error?: string;
  timestamp: string;
}

// In-memory metrics store (in production, this would be a database)
const metricsStore: ModelMetrics[] = [];

/**
 * Log a model run
 */
export function logModelRun(metrics: Omit<ModelMetrics, 'timestamp'>): void {
  metricsStore.push({
    ...metrics,
    timestamp: new Date().toISOString()
  });
  
  // Keep only last 1000 metrics
  if (metricsStore.length > 1000) {
    metricsStore.shift();
  }
}

/**
 * Get model statistics
 */
export function getModelStats(): ModelStats {
  const totalModels = metricsStore.length;
  
  const byType: Record<ModelType, number> = {
    'dcf': 0,
    'debt-capacity-lite': 0,
    'lbo': 0,
    'comps': 0,
    'merger': 0,
    'operating': 0,
    'three-statement': 0,
    'scorecard': 0,
  };
  
  const byStatus: Record<string, number> = {
    'success': 0,
    'error': 0
  };
  
  let totalGenerationTime = 0;
  let successCount = 0;
  
  for (const metric of metricsStore) {
    byType[metric.modelType] = (byType[metric.modelType] || 0) + 1;
    
    if (metric.success) {
      byStatus['success']++;
      successCount++;
    } else {
      byStatus['error']++;
    }
    
    totalGenerationTime += metric.generationTimeMs;
  }
  
  const avgGenerationTime = totalModels > 0 ? totalGenerationTime / totalModels : undefined;
  const successRate = totalModels > 0 ? successCount / totalModels : undefined;
  
  return {
    totalModels,
    byType,
    byStatus,
    avgGenerationTime,
    successRate
  };
}

/**
 * Get metrics for a specific model type
 */
export function getMetricsByType(modelType: ModelType): ModelMetrics[] {
  return metricsStore.filter(m => m.modelType === modelType);
}

/**
 * Get recent metrics
 */
export function getRecentMetrics(limit: number = 10): ModelMetrics[] {
  return metricsStore.slice(-limit).reverse();
}

/**
 * Clear all metrics
 */
export function clearMetrics(): void {
  metricsStore.length = 0;
}

/**
 * Map model type string to metrics model type
 */
export function mapModelTypeToMetrics(modelType: string): ModelType {
  const normalized = modelType.toLowerCase().replace(/[-_\s]/g, '');
  
  switch (normalized) {
    case 'dcf':
    case 'reversedcf':
      return 'dcf';
    case 'debtcapacitylite':
      return 'debt-capacity-lite';
    case 'lbo':
      return 'lbo';
    case 'comps':
    case 'tradingcomps':
      return 'comps';
    case 'merger':
    case 'ma':
    case 'accretiondilution':
      return 'merger';
    case 'operating':
    case 'operatingmodel':
      return 'operating';
    case 'threestatement':
    case '3statement':
      return 'three-statement';
    case 'scorecard':
    case 'fundamentalsscorecard':
      return 'scorecard';
    default:
      return 'dcf'; // Default fallback
  }
}

/**
 * Calculate percentile for generation time
 */
export function getGenerationTimePercentile(percentile: number): number | undefined {
  if (metricsStore.length === 0) return undefined;
  
  const times = metricsStore
    .filter(m => m.success)
    .map(m => m.generationTimeMs)
    .sort((a, b) => a - b);
  
  if (times.length === 0) return undefined;
  
  const index = Math.ceil((percentile / 100) * times.length) - 1;
  return times[Math.max(0, index)];
}

/**
 * Get error rate by model type
 */
export function getErrorRateByType(): Record<ModelType, number> {
  const errorRates: Record<ModelType, number> = {
    'dcf': 0,
    'debt-capacity-lite': 0,
    'lbo': 0,
    'comps': 0,
    'merger': 0,
    'operating': 0,
    'three-statement': 0,
    'scorecard': 0,
  };
  
  const countsByType: Record<ModelType, { total: number; errors: number }> = {
    'dcf': { total: 0, errors: 0 },
    'debt-capacity-lite': { total: 0, errors: 0 },
    'lbo': { total: 0, errors: 0 },
    'comps': { total: 0, errors: 0 },
    'merger': { total: 0, errors: 0 },
    'operating': { total: 0, errors: 0 },
    'three-statement': { total: 0, errors: 0 },
    'scorecard': { total: 0, errors: 0 },
  };
  
  for (const metric of metricsStore) {
    countsByType[metric.modelType].total++;
    if (!metric.success) {
      countsByType[metric.modelType].errors++;
    }
  }
  
  for (const type of Object.keys(countsByType) as ModelType[]) {
    const { total, errors } = countsByType[type];
    errorRates[type] = total > 0 ? errors / total : 0;
  }
  
  return errorRates;
}

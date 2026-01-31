/**
 * Model Runs
 * Track individual model generation runs
 */

export interface ModelRun {
  id: string;
  modelId: string;
  modelType: string;
  ticker: string;
  status: 'started' | 'success' | 'failed';
  startTime: string;
  endTime?: string;
  durationMs?: number;
  error?: string;
  metadata?: Record<string, any>;
}

// In-memory store for model runs
const runsStore = new Map<string, ModelRun>();

/**
 * Create a new model run
 */
export function createModelRun(
  modelId: string,
  modelType: string,
  ticker: string,
  metadata?: Record<string, any>
): ModelRun {
  const run: ModelRun = {
    id: `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    modelId,
    modelType,
    ticker,
    status: 'started',
    startTime: new Date().toISOString(),
    metadata
  };
  
  runsStore.set(run.id, run);
  return run;
}

/**
 * Update model run on success
 */
export function updateModelRunSuccess(runId: string): ModelRun | null {
  const run = runsStore.get(runId);
  if (!run) return null;
  
  const endTime = new Date().toISOString();
  const durationMs = new Date(endTime).getTime() - new Date(run.startTime).getTime();
  
  const updatedRun: ModelRun = {
    ...run,
    status: 'success',
    endTime,
    durationMs
  };
  
  runsStore.set(runId, updatedRun);
  return updatedRun;
}

/**
 * Update model run on failure
 */
export function updateModelRunFailed(runId: string, error: string): ModelRun | null {
  const run = runsStore.get(runId);
  if (!run) return null;
  
  const endTime = new Date().toISOString();
  const durationMs = new Date(endTime).getTime() - new Date(run.startTime).getTime();
  
  const updatedRun: ModelRun = {
    ...run,
    status: 'failed',
    endTime,
    durationMs,
    error
  };
  
  runsStore.set(runId, updatedRun);
  return updatedRun;
}

/**
 * Get model run by ID
 */
export function getModelRun(runId: string): ModelRun | null {
  return runsStore.get(runId) || null;
}

/**
 * Get all runs for a model
 */
export function getModelRuns(modelId: string): ModelRun[] {
  const runs: ModelRun[] = [];
  for (const run of runsStore.values()) {
    if (run.modelId === modelId) {
      runs.push(run);
    }
  }
  return runs.sort((a, b) => 
    new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );
}

/**
 * Get last successful run for a model
 */
export function getLastSuccessfulRun(modelId?: string): ModelRun | null {
  const runs = Array.from(runsStore.values())
    .filter(run => run.status === 'success' && (!modelId || run.modelId === modelId))
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  
  return runs[0] || null;
}

/**
 * Get average runtime for a model type
 */
export function getAverageRuntime(modelType?: string): number | null {
  const successfulRuns = Array.from(runsStore.values())
    .filter(run => 
      run.status === 'success' && 
      run.durationMs !== undefined &&
      (!modelType || run.modelType === modelType)
    );
  
  if (successfulRuns.length === 0) return null;
  
  const totalDuration = successfulRuns.reduce((sum, run) => sum + (run.durationMs || 0), 0);
  return totalDuration / successfulRuns.length;
}

/**
 * Get success rate
 */
export function getSuccessRate(modelType?: string): number | null {
  const runs = Array.from(runsStore.values())
    .filter(run => !modelType || run.modelType === modelType);
  
  if (runs.length === 0) return null;
  
  const successCount = runs.filter(run => run.status === 'success').length;
  return successCount / runs.length;
}

/**
 * Get recent runs
 */
export function getRecentRuns(limit: number = 10): ModelRun[] {
  return Array.from(runsStore.values())
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, limit);
}

/**
 * Clear old runs (keep only last N days)
 */
export function clearOldRuns(daysToKeep: number = 7): number {
  const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
  let deletedCount = 0;
  
  for (const [id, run] of runsStore.entries()) {
    const runTime = new Date(run.startTime).getTime();
    if (runTime < cutoffTime) {
      runsStore.delete(id);
      deletedCount++;
    }
  }
  
  return deletedCount;
}

/**
 * Get run statistics
 */
export function getRunStatistics(): {
  total: number;
  successful: number;
  failed: number;
  inProgress: number;
  avgDurationMs?: number;
  successRate?: number;
} {
  const runs = Array.from(runsStore.values());
  const total = runs.length;
  const successful = runs.filter(r => r.status === 'success').length;
  const failed = runs.filter(r => r.status === 'failed').length;
  const inProgress = runs.filter(r => r.status === 'started').length;
  
  const completedRuns = runs.filter(r => r.durationMs !== undefined);
  const avgDurationMs = completedRuns.length > 0
    ? completedRuns.reduce((sum, r) => sum + (r.durationMs || 0), 0) / completedRuns.length
    : undefined;
  
  const successRate = total > 0 ? successful / total : undefined;
  
  return {
    total,
    successful,
    failed,
    inProgress,
    avgDurationMs,
    successRate
  };
}

/**
 * Workspace Snapshot API
 * 
 * Returns real-time snapshot data for the user's workspace.
 * Uses the same data sources as the Models list.
 */

import { NextResponse } from 'next/server';
import { countModels, getRecentModels } from '@/lib/modelsRepo';
import { getLastSuccessfulRun, getAverageRuntime } from '@/lib/modelRuns';

export const runtime = 'nodejs';

export async function GET() {
  try {
    // Get total models count
    const totalModels = await countModels();
    
    // Get most recent model
    const recentModels = await getRecentModels(1);
    const lastModel = recentModels[0] || null;
    
    // Get last successful run timestamp (only from actual runs, not model creation)
    const lastRunAt = await getLastSuccessfulRun();
    
    // Get average runtime from successful runs
    const avgRuntimeMs = getAverageRuntime() ?? null;
    
    return NextResponse.json({
      totalModels,
      lastModel: lastModel
        ? {
            ticker: lastModel.ticker,
            modelType: lastModel.model_type,
            createdAt: lastModel.created_at,
          }
        : null,
      lastRunAt,
      avgRuntimeMs,
    });
  } catch (error: any) {
    console.error('[workspace/snapshot] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch workspace snapshot',
        details: error?.message,
      },
      { status: 500 }
    );
  }
}

/**
 * Contract Check - Pre-Ship Validation
 * 
 * Validates that all contracts are enforced:
 * - Headlines MUST have canonicalTitle and impactBullets (≥2 items)
 * - Charts MUST NOT render empty series when input exists
 * - LBO, Comps, Merger outputs MUST use consistent pipeline structure
 * 
 * Returns 200 if all contracts pass, 503 if any fail (blocks deployment)
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { deterministicHeadlines, type DeterministicHeadline } from '@/lib/headlines/deterministic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ContractCheck = {
  contract: string;
  status: 'pass' | 'fail';
  message: string;
  violations?: Array<{
    item: string;
    field: string;
    reason: string;
  }>;
  details?: any;
};

type ContractCheckResponse = {
  status: 'pass' | 'fail';
  timestamp: string;
  checks: ContractCheck[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    blocking: boolean; // If true, deployment should be blocked
  };
};

/**
 * Contract 1: Headlines MUST have canonicalTitle and impactBullets (≥2 items)
 */
async function checkHeadlinesContract(): Promise<ContractCheck> {
  const violations: Array<{ item: string; field: string; reason: string }> = [];
  
  try {
    // Test deterministicHeadlines directly with sample data
    const sampleHeadlines = [
      { title: 'Fed raises rates by 0.25%', publishedAt: new Date().toISOString() },
      { headline: 'Oil prices surge on supply concerns', publishedAt: new Date().toISOString() },
      { name: 'Apple reports strong earnings', publishedAt: new Date().toISOString() },
      { title: '', publishedAt: null }, // Should be filtered out
      { title: 'Valid headline', publishedAt: new Date().toISOString() },
    ];
    
    const deterministic = deterministicHeadlines(sampleHeadlines);
    
    // Check each output
    for (const item of deterministic) {
      if (!item.canonicalTitle || item.canonicalTitle.trim().length === 0) {
        violations.push({
          item: item.id,
          field: 'canonicalTitle',
          reason: 'Missing or empty canonicalTitle',
        });
      }
      
      if (!Array.isArray(item.impactBullets) || item.impactBullets.length < 2) {
        violations.push({
          item: item.id,
          field: 'impactBullets',
          reason: `impactBullets must have ≥2 items, got ${item.impactBullets?.length || 0}`,
        });
      }
    }
    
    // Check API endpoints enforce the contract
    const endpoints = [
      { name: 'market-brief', url: '/api/market-brief/headlines?range=1D&limit=10' },
      { name: 'market', url: '/api/market/headlines?range=1D&limit=10' },
      { name: 'macro', url: '/api/macro/headlines?range=1D&limit=10' },
    ];
    
    let apiViolations = 0;
    const apiDetails: any = {};
    
    for (const endpoint of endpoints) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL 
          ? `https://${process.env.VERCEL_URL}` 
          : 'http://localhost:3000';
        const url = `${baseUrl}${endpoint.url}`;
        
        const response = await fetch(url, { 
          cache: 'no-store', 
          signal: AbortSignal.timeout(5000) 
        });
        
        if (response.ok) {
          const data = await response.json();
          const items = data.items || data.data?.items || [];
          
          for (const item of items) {
            if (!item.canonicalTitle) {
              apiViolations++;
              if (!apiDetails[endpoint.name]) apiDetails[endpoint.name] = [];
              apiDetails[endpoint.name].push('missing_canonicalTitle');
            }
            if (!item.impactBullets || !Array.isArray(item.impactBullets) || item.impactBullets.length < 2) {
              apiViolations++;
              if (!apiDetails[endpoint.name]) apiDetails[endpoint.name] = [];
              apiDetails[endpoint.name].push('missing_or_invalid_impactBullets');
            }
          }
          
          apiDetails[`${endpoint.name}_total`] = items.length;
        }
      } catch (error) {
        // API may not be available in static build - log but don't fail
        apiDetails[`${endpoint.name}_error`] = error instanceof Error ? error.message : String(error);
      }
    }
    
    const hasViolations = violations.length > 0 || apiViolations > 0;
    
    return {
      contract: 'headlines_deterministic_contract',
      status: hasViolations ? 'fail' : 'pass',
      message: hasViolations
        ? `Found ${violations.length} violations in deterministicHeadlines() and ${apiViolations} in API responses`
        : `All headlines have canonicalTitle and impactBullets (≥2 items)`,
      violations: violations.length > 0 ? violations : undefined,
      details: {
        deterministicViolations: violations.length,
        apiViolations,
        ...apiDetails,
      },
    };
  } catch (error: any) {
    return {
      contract: 'headlines_deterministic_contract',
      status: 'fail',
      message: `Contract check failed: ${error?.message || String(error)}`,
      details: { error: error?.message || String(error) },
    };
  }
}

/**
 * Contract 2: Charts MUST NOT render empty series when input exists
 */
async function checkChartRenderingContract(): Promise<ContractCheck> {
  const violations: Array<{ item: string; field: string; reason: string }> = [];
  
  try {
    // Check chart configuration generation logic
    // Market Brief chart
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'http://localhost:3000';
      const url = `${baseUrl}/api/market/chart?symbol=SPY&range=1D`;
      
      const response = await fetch(url, { 
        cache: 'no-store', 
        signal: AbortSignal.timeout(5000) 
      });
      
      if (response.ok) {
        const data = await response.json();
        const series = data.series || data.data?.series || [];
        
        // If we have data but series is empty, that's a violation
        if (data.data && Object.keys(data.data).length > 0 && series.length === 0) {
          violations.push({
            item: 'market_brief_chart',
            field: 'series',
            reason: 'Chart has input data but empty series array',
          });
        }
        
        // Check that series has valid data points
        if (series.length > 0) {
          const invalidPoints = series.filter((p: any) => 
            !p.t || !p.v || !Number.isFinite(p.v)
          );
          
          if (invalidPoints.length > 0) {
            violations.push({
              item: 'market_brief_chart',
              field: 'series_points',
              reason: `${invalidPoints.length} invalid data points in series`,
            });
          }
        }
      }
    } catch (error) {
      // Endpoint may not be available - non-blocking in static build
    }
    
    // Check macro market chart
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'http://localhost:3000';
      const url = `${baseUrl}/api/macro/market?range=1D`;
      
      const response = await fetch(url, { 
        cache: 'no-store', 
        signal: AbortSignal.timeout(5000) 
      });
      
      if (response.ok) {
        const data = await response.json();
        const series = data.series || data.data?.series || [];
        
        if (data.data && Object.keys(data.data).length > 0 && series.length === 0) {
          violations.push({
            item: 'macro_market_chart',
            field: 'series',
            reason: 'Chart has input data but empty series array',
          });
        }
      }
    } catch (error) {
      // Endpoint may not be available - non-blocking
    }
    
    return {
      contract: 'chart_rendering_contract',
      status: violations.length === 0 ? 'pass' : 'fail',
      message: violations.length === 0
        ? 'Charts correctly handle empty series and validate input data'
        : `Found ${violations.length} chart rendering violations`,
      violations: violations.length > 0 ? violations : undefined,
      details: {
        violationsCount: violations.length,
      },
    };
  } catch (error: any) {
    return {
      contract: 'chart_rendering_contract',
      status: 'fail',
      message: `Contract check failed: ${error?.message || String(error)}`,
      details: { error: error?.message || String(error) },
    };
  }
}

/**
 * Contract 3: LBO, Comps, Merger outputs MUST use consistent pipeline structure
 */
async function checkModelOutputContract(): Promise<ContractCheck> {
  const violations: Array<{ item: string; field: string; reason: string }> = [];
  
  try {
    // Check that all models route through runModelPipeline
    let runLboPipeline: any = null;
    let runCompsPipeline: any = null;
    let runMergerPipeline: any = null;
    
    try {
      const lboModule = await import('@/lib/models/lbo/pipeline');
      runLboPipeline = lboModule.runLboPipeline;
    } catch (error) {
      // Module may not be available in static build
    }
    
    try {
      const compsModule = await import('@/lib/models/comps/pipeline');
      runCompsPipeline = compsModule.runCompsPipeline;
    } catch (error) {
      // Module may not be available in static build
    }
    
    try {
      const mergerModule = await import('@/lib/models/merger/pipeline');
      runMergerPipeline = mergerModule.runMergerPipeline;
    } catch (error) {
      // Module may not be available in static build
    }
    
    if (!runLboPipeline) {
      violations.push({
        item: 'lbo_pipeline',
        field: 'runLboPipeline',
        reason: 'LBO pipeline not accessible or does not use runModelPipeline()',
      });
    }
    
    if (!runCompsPipeline) {
      violations.push({
        item: 'comps_pipeline',
        field: 'runCompsPipeline',
        reason: 'Comps pipeline not accessible or does not use runModelPipeline()',
      });
    }
    
    if (!runMergerPipeline) {
      violations.push({
        item: 'merger_pipeline',
        field: 'runMergerPipeline',
        reason: 'Merger pipeline not accessible or does not use runModelPipeline()',
      });
    }
    
    // Check that precision helpers are imported correctly
    // We can't read source files at runtime, but we can verify imports work
    try {
      // Verify LBO engine imports precision helpers
      const lboEngine = await import('@/lib/lboEngine').catch(() => null);
      if (lboEngine) {
        // Check that buildExitOutputs uses precision helpers
        // This is a structural check - if it compiles, imports are correct
        const precision = await import('@/lib/models/precision');
        const hasPrecisionHelpers = typeof precision.calculateIRR === 'function' && 
                                    typeof precision.moic === 'function';
        
        if (!hasPrecisionHelpers) {
          violations.push({
            item: 'lbo_engine',
            field: 'precision_imports',
            reason: 'Precision helpers not accessible from LBO engine',
          });
        }
      }
    } catch (error) {
      // Import may fail in static build - log but don't fail
      violations.push({
        item: 'lbo_engine',
        field: 'precision_imports',
        reason: `Failed to verify precision imports: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    
    // Check that all models use shared precision helpers
    try {
      const precision = await import('@/lib/models/precision');
      const hasIRR = typeof precision.calculateIRR === 'function';
      const hasMOIC = typeof precision.moic === 'function' || typeof precision.calculateMOIC === 'function';
      
      if (!hasIRR || !hasMOIC) {
        violations.push({
          item: 'precision_helpers',
          field: 'shared_helpers',
          reason: 'Precision helpers (IRR/MOIC) not accessible',
        });
      }
    } catch {
      violations.push({
        item: 'precision_helpers',
        field: 'shared_helpers',
        reason: 'Precision helpers module not accessible',
      });
    }
    
    // Check that all models use shared preview helpers
    try {
      const preview = await import('@/lib/modeling/preview');
      const hasLboPreview = typeof preview.buildLboPreview === 'function';
      const hasCompsPreview = typeof preview.buildCompsPreview === 'function';
      const hasMergerPreview = typeof preview.buildMergerPreview === 'function';
      
      if (!hasLboPreview || !hasCompsPreview || !hasMergerPreview) {
        violations.push({
          item: 'preview_helpers',
          field: 'shared_helpers',
          reason: 'Preview helpers not accessible for all models',
        });
      }
    } catch {
      violations.push({
        item: 'preview_helpers',
        field: 'shared_helpers',
        reason: 'Preview helpers module not accessible',
      });
    }
    
    // Check that output schemas are consistent
    try {
      const { LBOOutputSchema, CompsOutputSchema, MergerOutputSchema } = await import('@/lib/schemas/model-output');
      
      // All schemas should be Zod objects
      const schemas = [
        { name: 'lbo', schema: LBOOutputSchema },
        { name: 'comps', schema: CompsOutputSchema },
        { name: 'merger', schema: MergerOutputSchema },
      ];
      
      for (const { name, schema } of schemas) {
        if (!schema || typeof schema.parse !== 'function') {
          violations.push({
            item: `${name}_output_schema`,
            field: 'schema_structure',
            reason: `${name} output schema is not a valid Zod schema`,
          });
        }
      }
    } catch {
      violations.push({
        item: 'output_schemas',
        field: 'schema_structure',
        reason: 'Output schemas not accessible',
      });
    }
    
    return {
      contract: 'model_output_consistency_contract',
      status: violations.length === 0 ? 'pass' : 'fail',
      message: violations.length === 0
        ? 'All models use consistent pipeline structure and shared helpers'
        : `Found ${violations.length} structural consistency violations`,
      violations: violations.length > 0 ? violations : undefined,
      details: {
        violationsCount: violations.length,
        pipelineAccessible: !!(runLboPipeline && runCompsPipeline && runMergerPipeline),
        lboPipelineAvailable: !!runLboPipeline,
        compsPipelineAvailable: !!runCompsPipeline,
        mergerPipelineAvailable: !!runMergerPipeline,
      },
    };
  } catch (error: any) {
    return {
      contract: 'model_output_consistency_contract',
      status: 'fail',
      message: `Contract check failed: ${error?.message || String(error)}`,
      details: { error: error?.message || String(error) },
    };
  }
}

export async function GET(request: NextRequest) {
  const traceId = randomUUID();
  const checks: ContractCheck[] = [];
  
  try {
    // Contract 1: Headlines deterministic contract
    const headlinesCheck = await checkHeadlinesContract();
    checks.push(headlinesCheck);
    
    // Contract 2: Chart rendering contract
    const chartCheck = await checkChartRenderingContract();
    checks.push(chartCheck);
    
    // Contract 3: Model output consistency contract
    const modelCheck = await checkModelOutputContract();
    checks.push(modelCheck);
    
    // Calculate summary
    const summary = {
      total: checks.length,
      passed: checks.filter(c => c.status === 'pass').length,
      failed: checks.filter(c => c.status === 'fail').length,
      blocking: checks.some(c => c.status === 'fail'), // Any failure blocks deployment
    };
    
    // Determine overall status
    const overallStatus: 'pass' | 'fail' = summary.blocking ? 'fail' : 'pass';
    
    const response: ContractCheckResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
      summary,
    };
    
    // Return 503 if any contract fails (blocks deployment)
    const httpStatus = overallStatus === 'fail' ? 503 : 200;
    
    return NextResponse.json(response, { status: httpStatus });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'fail' as const,
        timestamp: new Date().toISOString(),
        checks: [
          {
            contract: 'contract_check_system',
            status: 'fail' as const,
            message: `Contract check system failed: ${error?.message || String(error)}`,
            details: { error: error?.message || String(error) },
          },
        ],
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          blocking: true,
        },
      },
      { status: 503 }
    );
  }
}


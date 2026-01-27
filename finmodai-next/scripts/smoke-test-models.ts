/**
 * Smoke Tests for Model Pipelines
 * 
 * Validates that LBO, Comps, and Merger models:
 * 1. Run successfully
 * 2. Return non-empty preview contract
 * 3. Generate valid artifact download URL (R2 or local)
 * 
 * Usage:
 *   npm run smoke-test-models
 *   # or
 *   tsx scripts/smoke-test-models.ts
 */

import { randomUUID } from 'node:crypto';
import { runLboPipeline } from '@/lib/models/lbo/pipeline';
import { runCompsPipeline } from '@/lib/models/comps/pipeline';
import { runMergerPipeline } from '@/lib/models/merger/pipeline';
import { getLTMFinancials } from '@/lib/getLTMFinancials';
import type { ScaledFinancials } from '@/lib/financials';
import type { LboDealInputs } from '@/lib/models/lbo/dealInputs';
import type { CanonicalPipelineInput } from '@/lib/models/runModelPipeline';

const TEST_TICKERS = {
  lbo: 'AAPL',
  comps: 'AAPL',
  merger: {
    acquirer: 'AAPL',
    target: 'MSFT',
  },
};

interface TestResult {
  modelType: string;
  success: boolean;
  error?: string;
  preview?: any;
  artifact?: {
    provider: string;
    downloadUrl: string;
    fileName: string;
  };
  warnings: string[];
}

async function testLbo(): Promise<TestResult> {
  const traceId = randomUUID();
  const modelId = randomUUID();
  
  try {
    const dealInputs: LboDealInputs = {
      company: {
        name: 'Apple Inc.',
        ticker: TEST_TICKERS.lbo,
      },
      entry: {
        ebitdaMultiple: 8.0,
        offerPremiumPct: 30,
      },
      exit: {
        ebitdaMultiple: 10.0,
        holdPeriodYears: 5,
      },
      leverage: {
        targetDebtToEbitda: 4.5,
      },
      debtPricing: {
        termLoanBRatePct: 6.5,
        revolverRatePct: 5.0,
      },
      fees: {
        transactionFeePct: 2.0,
        financingFeePct: 3.0,
      },
      liquidity: {
        minimumCashMm: 50,
      },
    };

    const ltm = await getLTMFinancials(TEST_TICKERS.lbo);
    const normalizedFinancials: ScaledFinancials = {
      revenueM: ltm.revenue,
      ebitdaM: ltm.ebitda,
      ebitM: ltm.ebit,
      fcfM: ltm.netIncome,
      netDebtM: ltm.netDebt,
      sharesOutstandingM: ltm.sharesOutstanding,
      marketCapM: ltm.marketCap,
    };
    
    const result = await runLboPipeline(dealInputs, {
      traceId,
      modelId,
      normalizedFinancials,
      operatingAssumptions: {
        revenueGrowth: 0.05,
        ebitdaMargin: 0.25,
        capexPercent: 0.04,
        daPercent: 0.04,
        nwcPercent: 0.02,
        taxRate: 0.21,
      },
    });
    
    return {
      modelType: 'lbo',
      success: result.status === 'success' || result.status === 'partial',
      preview: result.preview,
      artifact: result.artifact,
      warnings: result.warnings,
    };
  } catch (error: any) {
    return {
      modelType: 'lbo',
      success: false,
      error: error?.message || String(error),
      warnings: [],
    };
  }
}

async function testComps(): Promise<TestResult> {
  const traceId = randomUUID();
  const modelId = randomUUID();
  
  try {
    const input: CanonicalPipelineInput = {
      modelType: 'comps',
      tickers: [TEST_TICKERS.comps],
      assumptions: {
        useOnlyCustom: false,
      },
      options: {
        includeExcel: true,
        includePreview: true,
      },
    };
    
    const result = await runCompsPipeline(input, {
      traceId,
      modelId,
    });
    
    return {
      modelType: 'comps',
      success: result.status === 'success' || result.status === 'partial',
      preview: result.preview,
      artifact: result.artifact,
      warnings: result.warnings,
    };
  } catch (error: any) {
    return {
      modelType: 'comps',
      success: false,
      error: error?.message || String(error),
      warnings: [],
    };
  }
}

async function testMerger(): Promise<TestResult> {
  const traceId = randomUUID();
  const modelId = randomUUID();
  
  try {
    const input: CanonicalPipelineInput = {
      modelType: 'merger',
      tickers: [TEST_TICKERS.merger.acquirer, TEST_TICKERS.merger.target],
      merger: {
        acquirer: TEST_TICKERS.merger.acquirer,
        target: TEST_TICKERS.merger.target,
      },
      assumptions: {
        dealStructure: 'stock',
        offerPrice: 100,
        forecastYears: 5,
      },
      options: {
        includeExcel: true,
        includePreview: true,
      },
    };
    
    const result = await runMergerPipeline(input, {
      traceId,
      modelId,
    });
    
    return {
      modelType: 'merger',
      success: result.status === 'success' || result.status === 'partial',
      preview: result.preview,
      artifact: result.artifact,
      warnings: result.warnings,
    };
  } catch (error: any) {
    return {
      modelType: 'merger',
      success: false,
      error: error?.message || String(error),
      warnings: [],
    };
  }
}

function validatePreview(preview: any, modelType: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  if (!preview) {
    issues.push('Preview is missing');
    return { valid: false, issues };
  }
  
  // CRITICAL: Must have assumptions
  if (!preview.assumptions || !Array.isArray(preview.assumptions)) {
    issues.push('Preview.assumptions is missing or not an array');
  } else if (preview.assumptions.length === 0) {
    issues.push('Preview.assumptions is empty');
  }
  
  // CRITICAL: Must have at least 2 charts
  if (!preview.charts || !Array.isArray(preview.charts)) {
    issues.push('Preview.charts is missing or not an array');
  } else if (preview.charts.length < 2) {
    issues.push(`Preview.charts has ${preview.charts.length} chart(s), requires at least 2`);
  }
  
  // CRITICAL: Must have KPIs
  if (!preview.kpis || !Array.isArray(preview.kpis)) {
    issues.push('Preview.kpis is missing or not an array');
  } else if (preview.kpis.length === 0) {
    issues.push('Preview.kpis is empty');
  }
  
  // CRITICAL: Must have checks
  if (!preview.checks || !Array.isArray(preview.checks)) {
    issues.push('Preview.checks is missing or not an array');
  } else if (preview.checks.length === 0) {
    issues.push('Preview.checks is empty');
  }
  
  // Model-specific validations
  if (modelType === 'lbo') {
    const hasIrr = preview.kpis?.some((k: any) => k.label === 'IRR');
    const hasMoic = preview.kpis?.some((k: any) => k.label === 'MOIC');
    if (!hasIrr) issues.push('LBO preview missing IRR KPI');
    if (!hasMoic) issues.push('LBO preview missing MOIC KPI');
  }
  
  if (modelType === 'comps') {
    const hasImpliedValuation = preview.kpis?.some((k: any) => k.label?.includes('Implied'));
    if (!hasImpliedValuation) issues.push('Comps preview missing implied valuation KPIs');
  }
  
  if (modelType === 'merger') {
    const hasDealValue = preview.kpis?.some((k: any) => k.label?.includes('Deal Value'));
    if (!hasDealValue) issues.push('Merger preview missing deal value KPI');
  }
  
  return { valid: issues.length === 0, issues };
}

function validateArtifact(artifact: any): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  if (!artifact) {
    issues.push('Artifact is missing');
    return { valid: false, issues };
  }
  
  if (!artifact.provider || !['r2', 'local'].includes(artifact.provider)) {
    issues.push(`Invalid artifact provider: ${artifact.provider}`);
  }
  
  if (!artifact.downloadUrl || typeof artifact.downloadUrl !== 'string') {
    issues.push('Artifact.downloadUrl is missing or invalid');
  } else {
    try {
      new URL(artifact.downloadUrl);
    } catch {
      issues.push('Artifact.downloadUrl is not a valid URL');
    }
  }
  
  if (!artifact.fileName || typeof artifact.fileName !== 'string') {
    issues.push('Artifact.fileName is missing or invalid');
  }
  
  return { valid: issues.length === 0, issues };
}

async function runSmokeTests() {
  console.log('🧪 Running Model Pipeline Smoke Tests\n');
  console.log('=' .repeat(60));
  
  const results: TestResult[] = [];
  
  // Test LBO
  console.log('\n📊 Testing LBO Model...');
  const lboResult = await testLbo();
  results.push(lboResult);
  console.log(lboResult.success ? '✅ LBO: PASSED' : `❌ LBO: FAILED - ${lboResult.error}`);
  
  // Test Comps
  console.log('\n📊 Testing Comps Model...');
  const compsResult = await testComps();
  results.push(compsResult);
  console.log(compsResult.success ? '✅ Comps: PASSED' : `❌ Comps: FAILED - ${compsResult.error}`);
  
  // Test Merger
  console.log('\n📊 Testing Merger Model...');
  const mergerResult = await testMerger();
  results.push(mergerResult);
  console.log(mergerResult.success ? '✅ Merger: PASSED' : `❌ Merger: FAILED - ${mergerResult.error}`);
  
  // Validate results
  console.log('\n' + '='.repeat(60));
  console.log('\n📋 Validation Results:\n');
  
  let allPassed = true;
  
  for (const result of results) {
    console.log(`\n${result.modelType.toUpperCase()}:`);
    
    if (!result.success) {
      console.log(`  ❌ Model execution failed: ${result.error}`);
      allPassed = false;
      continue;
    }
    
    // Validate preview
    const previewValidation = validatePreview(result.preview, result.modelType);
    if (previewValidation.valid) {
      console.log('  ✅ Preview contract is valid');
      console.log(`     - Assumptions: ${result.preview?.assumptions?.length || 0} items`);
      console.log(`     - KPIs: ${result.preview?.kpis?.length || 0} items`);
      console.log(`     - Charts: ${result.preview?.charts?.length || 0} items`);
      console.log(`     - Checks: ${result.preview?.checks?.length || 0} items`);
    } else {
      console.log(`  ❌ Preview contract invalid:`);
      previewValidation.issues.forEach(issue => console.log(`     - ${issue}`));
      allPassed = false;
    }
    
    // Validate artifact
    const artifactValidation = validateArtifact(result.artifact);
    if (artifactValidation.valid) {
      console.log('  ✅ Artifact is valid');
      console.log(`     - Provider: ${result.artifact?.provider}`);
      console.log(`     - Download URL: ${result.artifact?.downloadUrl?.substring(0, 60)}...`);
      console.log(`     - File name: ${result.artifact?.fileName}`);
    } else {
      console.log(`  ❌ Artifact invalid:`);
      artifactValidation.issues.forEach(issue => console.log(`     - ${issue}`));
      allPassed = false;
    }
    
    // Show warnings
    if (result.warnings.length > 0) {
      console.log(`  ⚠️  Warnings (${result.warnings.length}):`);
      result.warnings.slice(0, 3).forEach(warning => console.log(`     - ${warning}`));
      if (result.warnings.length > 3) {
        console.log(`     ... and ${result.warnings.length - 3} more`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  
  // Final validation summary
  console.log('\n📊 Validation Summary:');
  const passedTests = results.filter(r => r.success).length;
  const failedTests = results.filter(r => !r.success).length;
  console.log(`  - Passed: ${passedTests}/${results.length}`);
  console.log(`  - Failed: ${failedTests}/${results.length}`);
  
  if (allPassed) {
    console.log('\n✅ All smoke tests PASSED!');
    console.log('\n✓ All models execute successfully');
    console.log('✓ All previews have KPIs, assumptions, charts (≥2), checks');
    console.log('✓ All artifacts have valid download URLs');
    process.exit(0);
  } else {
    console.log('\n❌ Some smoke tests FAILED');
    console.log('\nThis indicates the model system foundation is not stable.');
    console.log('Fix these issues before adding new features.');
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runSmokeTests().catch((error) => {
    console.error('Fatal error running smoke tests:', error);
    process.exit(1);
  });
}

export { runSmokeTests, testLbo, testComps, testMerger };

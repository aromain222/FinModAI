/**
 * Comps Model Pipeline Integration
 * 
 * Wraps Comps model generation to use runModelPipeline()
 */

import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { runModelPipeline, toCanonicalOutput, type CanonicalPipelineInput, type CanonicalPipelineOutput } from '@/lib/models/runModelPipeline';
import { buildCompsPreview } from '@/lib/modeling/preview';
import { buildCompsModel } from '@/lib/compsCalculator';
import { generateCompsExcel } from '@/lib/compsExcelGenerator';
import { uploadXlsxToR2, checkR2Env } from '@/lib/r2';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { identifyPeers, mergePeerSets, cleanTickerArray } from '@/lib/identifyPeers';
import { fetchAndEnrichBatch } from '@/lib/financialDataFetcher';
import type { CompanyFinancials, TargetCompany } from '@/types/compsModel';
import type { ScaledFinancials } from '@/lib/financials';

const LOCAL_EXPORT_DIR = '.local-model-exports';

/**
 * Run Comps model using standardized pipeline
 */
export async function runCompsPipeline(
  input: CanonicalPipelineInput,
  options: {
    traceId: string;
    modelId?: string;
    normalizedFinancials?: ScaledFinancials | null;
    requestBody?: any;
  }
): Promise<CanonicalPipelineOutput> {
  const { traceId, modelId, normalizedFinancials, requestBody } = options;
  
  // Extract ticker from input
  const ticker = input.tickers[0];
  if (!ticker) {
    throw new Error('Comps requires at least one ticker');
  }
  
  // Merge assumptions
  const mergedAssumptions = {
    ...input.assumptions,
    ...(requestBody || {}),
  };
  
  const useOnlyCustom = Boolean(
    mergedAssumptions.useOnlyCustom ??
    mergedAssumptions.comps?.useOnlyCustom ??
    false
  );
  
  // Run pipeline
  const result = await runModelPipeline({
    modelType: 'comps',
    traceId,
    modelId: modelId || randomUUID(),
    input,
    compute: async (validatedInput: any) => {
      // Get custom comps
      const customComps = cleanTickerArray(
        (mergedAssumptions.customComps || mergedAssumptions.symbols || [])
          .map((peer: any) => String(peer || '').trim().toUpperCase())
          .filter((peer: string) => peer && peer !== ticker)
      );
      
      // Identify peers
      let autoPeers: string[] = [];
      if (!useOnlyCustom) {
        const peerSelection = await identifyPeers(ticker);
        autoPeers = peerSelection.peers;
      }
      
      const mergedPeers = mergePeerSets(autoPeers, customComps, useOnlyCustom);
      
      if (mergedPeers.length === 0) {
        throw new Error('No comparable companies found');
      }
      
      // Fetch peer data
      const batchTickers = [{ ticker, source: 'auto' as const }, ...mergedPeers];
      const companyData = await fetchAndEnrichBatch(batchTickers);
      
      const [targetCompany, ...peerCompanies] = companyData;
      if (!targetCompany) {
        throw new Error('Failed to fetch target company financials');
      }
      
      const target: TargetCompany = {
        ticker: targetCompany.ticker,
        name: targetCompany.name,
        revenue: normalizedFinancials?.revenueM ?? targetCompany.revenue,
        ebitda: normalizedFinancials?.ebitdaM ?? targetCompany.ebitda,
        ebit: normalizedFinancials?.ebitM ?? targetCompany.ebit,
        netIncome: targetCompany.netIncome,
        shares: normalizedFinancials?.sharesOutstandingM ?? targetCompany.shares,
        netDebt: normalizedFinancials?.netDebtM ?? targetCompany.netDebt,
        price: targetCompany.price,
      };
      
      // Build comps model
      const compsModel = buildCompsModel(target, peerCompanies as CompanyFinancials[]);
      
      // Transform CompsModel to match CompsOutputSchema
      // CompsModel has 'comps' field, but schema expects 'peers'
      const compsOutput = {
        target: {
          ticker: compsModel.target.ticker,
          name: compsModel.target.name,
          revenue: compsModel.target.revenue,
          ebitda: compsModel.target.ebitda,
          ebit: compsModel.target.ebit,
          netIncome: compsModel.target.netIncome,
        },
        peers: Array.isArray(compsModel.comps) ? compsModel.comps.map(comp => ({
          ticker: comp.ticker,
          name: comp.name,
          evToRevenue: comp.evToRevenue,
          evToEBITDA: comp.evToEbitda,
          evToEBIT: comp.evToEbit,
          pe: comp.pe,
        })) : [],
        multiplesDistribution: {
          evToRevenue: {
            min: compsModel.stats.evRevenue.min,
            median: compsModel.stats.evRevenue.median,
            max: compsModel.stats.evRevenue.max,
            mean: compsModel.stats.evRevenue.mean,
          },
          evToEBITDA: {
            min: compsModel.stats.evEbitda.min,
            median: compsModel.stats.evEbitda.median,
            max: compsModel.stats.evEbitda.max,
            mean: compsModel.stats.evEbitda.mean,
          },
          pe: {
            min: compsModel.stats.pe.min,
            median: compsModel.stats.pe.median,
            max: compsModel.stats.pe.max,
            mean: compsModel.stats.pe.mean,
          },
        },
        impliedValuation: {
          evToRevenue: compsModel.impliedValuation.evRevenueMedian,
          evToEBITDA: compsModel.impliedValuation.evEbitdaMedian,
          evToEBIT: compsModel.impliedValuation.evEbitMedian,
          pe: compsModel.impliedValuation.peMedian,
        },
      };
      
      return {
        output: compsOutput,
        warnings: [],
      };
    },
    generatePreview: (validatedInput: any, output: any) => {
      return buildCompsPreview(output, mergedAssumptions);
    },
    generateExcel: async (validatedInput: any, output: any) => {
      // Guard: workbook generation never runs during static export
      const isStaticExport = process.env.NEXT_PHASE === 'phase-production-build' || 
                            process.env.NEXT_EXPORT === 'true' ||
                            (typeof window === 'undefined' && process.env.NODE_ENV === 'production' && !process.env.VERCEL);
      
      if (isStaticExport) {
        throw new Error('Workbook generation is disabled during static export');
      }
      
      // Generate Excel
      const compsWorkbook = await generateCompsExcel(ticker, output);
      
      // Generate buffer
      const buffer = await compsWorkbook.xlsx.writeBuffer();
      const workbookBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      
      // Upload to R2 or local
      const missingR2Env = checkR2Env();
      const canUseLocalExport = process.env.NODE_ENV !== 'production';
      const effectiveModelId = modelId || randomUUID();
      const safeKeyTicker = ticker.replace(/[^A-Z0-9]+/gi, '').toUpperCase() || 'MODEL';
      const filename = `${ticker}-comps.xlsx`;
      const r2Key = `models/${effectiveModelId}/${safeKeyTicker}-comps.xlsx`;
      
      let downloadUrl: string;
      let filePath: string | undefined;
      
      if (missingR2Env.length > 0) {
        if (!canUseLocalExport) {
          throw new Error(`R2 env missing: ${missingR2Env.join(', ')}`);
        }
        
        const localDir = path.resolve(process.cwd(), LOCAL_EXPORT_DIR, effectiveModelId);
        await mkdir(localDir, { recursive: true });
        filePath = path.join(localDir, filename);
        await writeFile(filePath, workbookBuffer);
        
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        downloadUrl = new URL(`/api/models/${encodeURIComponent(effectiveModelId)}/download-local`, baseUrl).toString();
      } else {
        downloadUrl = await uploadXlsxToR2({
          key: r2Key,
          buffer: workbookBuffer,
          filename,
        });
      }
      
      return {
        workbook: compsWorkbook,
        filePath,
        downloadUrl,
      };
    },
    skipPreview: !input.options?.includePreview,
    skipExcel: !input.options?.includeExcel,
  });
  
  return toCanonicalOutput(result);
}

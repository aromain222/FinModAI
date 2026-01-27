/**
 * Merger Model Pipeline Integration
 * 
 * Wraps Merger model generation to use runModelPipeline()
 * All models must route through runModelPipeline() for consistency
 */

import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { runModelPipeline, toCanonicalOutput, type CanonicalPipelineInput, type CanonicalPipelineOutput } from '@/lib/models/runModelPipeline';
import { validateModelInput } from '@/lib/schemas/model-input';
import { buildMergerPreview } from '@/lib/modeling/preview';
import { generateMergerWorkbook } from '@/lib/models/merger/excel';
import { computeMergerModel } from '@/lib/models/merger/compute';
import { MergerModelInputSchema, getMissingMergerInputs } from '@/lib/models/merger/schema';
import { getModelData } from '@/lib/modeling/getModelData';
import { applyDefaultsToModelInputs } from '@/lib/models/shared/applyDefaults';
import { getCurrentUserSettings } from '@/lib/settings/store';
import { uploadXlsxToR2, checkR2Env } from '@/lib/r2';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ModelRunError } from '@/lib/modeling/runModel';

const LOCAL_EXPORT_DIR = '.local-model-exports';

/**
 * Run Merger model using standardized pipeline
 * All models must route through runModelPipeline()
 */
export async function runMergerPipeline(
  input: CanonicalPipelineInput,
  options: {
    traceId: string;
    modelId?: string;
  }
): Promise<CanonicalPipelineOutput> {
  const { traceId, modelId } = options;
  
  // Extract merger tickers
  if (!input.merger || !input.merger.acquirer || !input.merger.target) {
    throw new Error('Merger requires both acquirer and target tickers');
  }
  
  const acquirer = input.merger.acquirer;
  const target = input.merger.target;
  
  // Run pipeline
  const result = await runModelPipeline({
    modelType: 'merger',
    traceId,
    modelId: modelId || randomUUID(),
    input,
    compute: async (validatedInput: any) => {
      // Merge assumptions
      const body = {
        ...input.assumptions,
        buyerTicker: acquirer,
        targetTicker: target,
        merger: input.merger,
      };
      
      // Fetch financial data
      const modelData = await getModelData({
        modelType: 'merger',
        primaryTicker: acquirer,
        tickers: [acquirer, target],
        traceId,
      });
      
      const buyerLTM = modelData.financials[acquirer];
      const targetLTM = modelData.financials[target];
      
      if (!buyerLTM || !targetLTM) {
        throw new ModelRunError({
          code: 'DATA_FETCH_FAILED',
          message: 'Unable to load merger company data',
          traceId,
          stage: 'fetch_data',
          step: 'load_financials',
          httpStatus: 500,
        });
      }
      
      const pulledData = {
        buyer: {
          price: buyerLTM.price,
          shares: buyerLTM.shares,
          cash: buyerLTM.cash,
          taxRate: undefined,
        },
        target: {
          price: targetLTM.price,
          shares: targetLTM.shares,
          cash: targetLTM.cash,
          debt: Math.max(0, (targetLTM.netDebt ?? 0) + (targetLTM.cash ?? 0)),
          taxRate: undefined,
        },
      };
      
      // Validate inputs
      const missing = getMissingMergerInputs(body, pulledData);
      if (missing.length > 0) {
        throw new ModelRunError({
          code: 'MISSING_REQUIRED_INPUTS',
          message: `Missing required inputs: ${missing.join(', ')}`,
          traceId,
          stage: 'validate',
          step: 'missing_required',
          httpStatus: 400,
        });
      }
      
      const parseResult = MergerModelInputSchema.safeParse(body);
      if (!parseResult.success) {
        throw new ModelRunError({
          code: 'INVALID_INPUT',
          message: 'Invalid merger inputs',
          traceId,
          stage: 'validate',
          step: 'schema',
          httpStatus: 400,
          cause: parseResult.error,
        });
      }
      
      // Apply defaults
      const settings = await getCurrentUserSettings();
      const { effectiveInputs, appliedDefaults } = applyDefaultsToModelInputs('merger', parseResult.data, settings);
      
      const finalParseResult = MergerModelInputSchema.safeParse(effectiveInputs);
      if (!finalParseResult.success) {
        throw new ModelRunError({
          code: 'INVALID_INPUT_AFTER_DEFAULTS',
          message: 'Invalid merger inputs after applying defaults',
          traceId,
          stage: 'normalize',
          step: 'apply_defaults',
          httpStatus: 400,
          cause: finalParseResult.error,
        });
      }
      
      // Compute merger model
      const mergerOutput = computeMergerModel(finalParseResult.data, pulledData);
      
      return {
        output: {
          mergerInputs: finalParseResult.data,
          mergerOutput,
          pulledData,
        },
        warnings: [],
        appliedDefaults,
      };
    },
    generatePreview: (validatedInput: any, output: any) => {
      return buildMergerPreview(
        {
          mergerInputs: output.mergerInputs,
          mergerOutput: output.mergerOutput,
          pulledData: output.pulledData,
        },
        input.assumptions
      );
    },
    generateExcel: async (validatedInput: any, output: any) => {
      // Guard: workbook generation never runs during static export
      const isStaticExport = process.env.NEXT_PHASE === 'phase-production-build' || 
                            process.env.NEXT_EXPORT === 'true' ||
                            (typeof window === 'undefined' && process.env.NODE_ENV === 'production' && !process.env.VERCEL);
      
      if (isStaticExport) {
        throw new Error('Workbook generation is disabled during static export');
      }
      
      // Generate Excel workbook
      const workbook = await generateMergerWorkbook(
        output.mergerInputs,
        output.mergerOutput,
        output.pulledData
      );
      
      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      const workbookBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      
      // Upload to R2 or local
      const missingR2Env = checkR2Env();
      const canUseLocalExport = process.env.NODE_ENV !== 'production';
      const effectiveModelId = modelId || randomUUID();
      const safeKeyAcquirer = acquirer.replace(/[^A-Z0-9]+/gi, '').toUpperCase() || 'BUYER';
      const safeKeyTarget = target.replace(/[^A-Z0-9]+/gi, '').toUpperCase() || 'TARGET';
      const filename = `${acquirer}-${target}-merger.xlsx`;
      const r2Key = `models/${effectiveModelId}/${safeKeyAcquirer}-${safeKeyTarget}-merger.xlsx`;
      
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
        workbook,
        filePath,
        downloadUrl,
      };
    },
    skipPreview: !input.options?.includePreview,
    skipExcel: !input.options?.includeExcel,
  });
  
  return toCanonicalOutput(result);
}

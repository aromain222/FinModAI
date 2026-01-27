/**
 * Model Agent
 * 
 * First-class abstraction for converting a user prompt + routing decision
 * into a validated MODEL_AND_VIZ output.
 * 
 * Responsibilities (STRICT ORDER):
 * 1. Select model skeleton using keywords from prompt
 * 2. Call LLM to fill ModelSpec fields (inputs, equations, outputs, assumptions)
 * 3. Validate ModelSpec (no missing references, no circular dependencies)
 * 4. Run evaluator to generate EvaluationOutput
 * 5. Apply sanity checks + clamping
 * 6. Generate Base/Upside/Downside scenarios automatically
 * 7. Select default charts
 * 8. Generate decision_signal summary
 * 9. Return AgentOutput with type = MODEL_AND_VIZ
 */

import 'server-only';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AgentOutput } from '@/lib/ai/schemas';
import { AgentOutputSchema, ModelAndVizArtifactSchema, type ModelAndVizArtifact } from '@/lib/ai/schemas';
import { callLLM, parseJSONResponse } from '@/lib/ai/llm';
import { MODEL_BUILDER_PROMPT } from '@/lib/ai/prompts';
import { logger } from '@/lib/api/logger';
import { selectSkeleton, buildModelFromSkeleton, MODEL_SKELETONS, type ModelSkeleton } from '@/lib/modeling/skeletons';
import { evaluateModel, type EvaluationOutput } from '@/lib/modeling/evaluator';
import { validateModel as validateModelStructure, type ValidationResult as StructuralValidationResult } from '@/lib/modeling/validate';
import { checkModelSanity, applyClampedInputs, computeDecisionSignal, type SanityResult } from '@/lib/modeling/sanity';
import { generateScenarios } from '@/lib/modeling/scenarios';
import { buildDependencyGraph } from '@/lib/modeling/graph';
import { inferObjectiveMetricFromPrompt } from '@/lib/modeling/objectiveMetric';

export interface ModelAgentInput {
  prompt: string;
  routing: {
    buildModel: boolean;
    reason: string;
    assumptions_level: 'low' | 'med' | 'high';
  };
  context?: any;
  traceId?: string;
}

/**
 * Validates ModelSpec for structural issues (missing references, circular dependencies)
 * This runs BEFORE evaluation
 * Returns validation result compatible with AgentOutput schema
 */
function validateModelSpec(artifact: ModelAndVizArtifact, traceId: string): { passed: boolean; issues: string[]; warnings: Array<{ code: string; message: string; affected_keys: string[] }> } {
  try {
    const validation = validateModelStructure(artifact);
    
    if (!validation.passed) {
      const issues = validation.issues.map(i => `${i.code}: ${i.message}`);
      logger.warn({ traceId, issues }, 'modelAgent:validation_failed');
      return { 
        passed: false, 
        issues,
        warnings: validation.issues.map(i => ({
          code: i.code,
          message: i.message,
          affected_keys: i.affected_keys,
        })),
      };
    }
    
    return { passed: true, issues: [], warnings: [] };
  } catch (error: any) {
    logger.error({ traceId, error: error?.message }, 'modelAgent:validation_error');
    return { 
      passed: false, 
      issues: [`Validation error: ${error?.message}`],
      warnings: [{ code: 'validation_error', message: error?.message || 'Unknown error', affected_keys: [] }],
    };
  }
}

/**
 * Selects default charts based on model outputs
 * Simple heuristic: select top 4 outputs as line charts
 */
function selectDefaultCharts(
  model: ModelAndVizArtifact['model'],
  evaluationOutput: EvaluationOutput
): ModelAndVizArtifact['charts'] {
  // If evaluator already generated charts, use those (adapting to schema if needed)
  if (evaluationOutput.charts && evaluationOutput.charts.length > 0) {
    return evaluationOutput.charts.map(chart => {
      // Schema requires yKey to be string, but evaluator may return array for multi-line
      // For now, use first key or join keys as a string identifier
      const yKeyStr = Array.isArray(chart.yKey) 
        ? chart.yKey[0] // Use first key (Base scenario typically)
        : (typeof chart.yKey === 'string' ? chart.yKey : String(chart.yKey));
      
      return {
        name: chart.name,
        chartType: chart.chartType,
        xKey: chart.xKey,
        yKey: yKeyStr,
        data: chart.data,
      };
    });
  }

  // Otherwise, create default charts from top outputs
  const topOutputs = model.outputs.slice(0, 4);
  return topOutputs.map(output => ({
    name: output.label || output.key,
    chartType: 'line' as const,
    xKey: 'period',
    yKey: output.key,
    data: evaluationOutput.rows || [],
  }));
}

/**
 * Calls LLM to fill in ModelSpec fields from skeleton
 * LLM can ONLY modify: inputs (labels, values, notes, source), equations (labels, definitions), outputs (labels, units), title
 */
async function fillModelSpecWithLLM(
  prompt: string,
  skeleton: ModelSkeleton,
  traceId: string
): Promise<Partial<ModelAndVizArtifact> | null> {
  try {
    const userPrompt = MODEL_BUILDER_PROMPT.buildUser(prompt, skeleton);
    
    const response = await callLLM({
      traceId,
      systemPrompt: MODEL_BUILDER_PROMPT.system,
      userPrompt,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.3, // Lower temperature for more consistent formulas
      maxTokens: 3000, // Enough for full model spec
      responseFormat: { type: 'json_object' },
    });

    const rawModel = parseJSONResponse<{ model: any }>(response.content, traceId);
    
    // Validate structure matches ModelAndVizArtifact.model schema
    const validated = z.object({
      model: z.object({
        kind: z.enum(['forecast', 'sensitivity', 'dcf', 'generic']),
        title: z.string().min(1),
        index: z.object({
          frequency: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']),
          periods: z.array(z.string().min(1)).min(1),
        }),
        inputs: z.array(z.object({
          key: z.string().min(1),
          label: z.string().min(1),
          value: z.number(),
          unit: z.string().optional(),
          notes: z.string().optional(),
          source: z.enum(['user', 'inferred', 'placeholder']).optional(),
        })),
        equations: z.array(z.object({
          key: z.string().min(1),
          label: z.string().min(1),
          definition: z.string().min(1),
        })).optional(),
        outputs: z.array(z.object({
          key: z.string().min(1),
          label: z.string().min(1),
          unit: z.string().optional(),
        })),
        objective_metric_key: z.string().optional(),
        objective_metric_label: z.string().optional(),
      }),
    }).parse(rawModel);

    // Build complete artifact (LLM only fills model, we add evaluation/charts later)
    return {
      model: validated.model,
      evaluation: {
        asOf: new Date().toISOString(),
        rows: [],
        summary: [],
      },
      charts: [],
    };
  } catch (error: any) {
    logger.error({ traceId, error: error?.message }, 'modelAgent:llm_fill_failed');
    return null;
  }
}

/**
 * Main Model Agent function
 * Converts prompt + routing decision into validated MODEL_AND_VIZ output
 */
export async function runModelAgent(input: ModelAgentInput): Promise<AgentOutput> {
  const traceId = input.traceId || randomUUID();
  const { prompt, routing, context } = input;

  try {
    logger.info({ traceId, prompt: prompt.substring(0, 100), assumptionsLevel: routing.assumptions_level }, 'modelAgent:start');

    // Step 1: Select model skeleton using keywords from prompt
    let skeleton = selectSkeleton(prompt);
    let skeletonFallback = false;

    if (!skeleton) {
      // Fallback to simplest skeleton if no match
      logger.warn({ traceId }, 'modelAgent:no_skeleton_match_using_fallback');
      skeleton = MODEL_SKELETONS[0]; // Use first skeleton as fallback
      skeletonFallback = true;
    }

    // Step 2: Call LLM to fill ModelSpec fields
    // LLM can ONLY modify: inputs (labels, values, notes, source), equations (labels, definitions), outputs (labels, units), title
    const llmFilledArtifact = await fillModelSpecWithLLM(prompt, skeleton, traceId);
    
    let artifact: ModelAndVizArtifact;
    
    if (llmFilledArtifact && llmFilledArtifact.model) {
      // Use LLM-filled artifact, but ensure we have a complete structure
      artifact = {
        model: llmFilledArtifact.model,
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
          summary: [],
        },
        charts: [],
      } as ModelAndVizArtifact;
    } else {
      // LLM failed or returned invalid - use skeleton template
      logger.warn({ traceId }, 'modelAgent:llm_failed_using_skeleton');
      const skeletonArtifact = buildModelFromSkeleton(skeleton);
      artifact = {
        ...skeletonArtifact,
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
          summary: [],
        },
        charts: skeletonArtifact.charts || [],
      } as ModelAndVizArtifact;
    }

    // Infer objective metric if not set
    if (!artifact.model.objective_metric_key && artifact.model.outputs.length > 0) {
      const objectiveMetric = inferObjectiveMetricFromPrompt(prompt, artifact.model.outputs);
      artifact.model.objective_metric_key = objectiveMetric.key;
      artifact.model.objective_metric_label = objectiveMetric.label;
    }

    // Step 3: Validate ModelSpec (structural validation - missing refs, cycles)
    let specValidation = validateModelSpec(artifact, traceId);
    
    // If validation failed, retry once with "fix schema" instruction
    if (!specValidation.passed && !skeletonFallback) {
      logger.warn({ traceId, issues: specValidation.issues }, 'modelAgent:spec_validation_failed_retrying');
      
      // Retry LLM with fix instruction
      const fixUserPrompt = `${MODEL_BUILDER_PROMPT.buildUser(prompt, skeleton)}

VALIDATION ERRORS FOUND:
${specValidation.issues.join('\n')}

Fix the model to resolve these errors. Ensure all formula references exist and there are no circular dependencies.`;
      
      try {
        const fixResponse = await callLLM({
          traceId,
          systemPrompt: MODEL_BUILDER_PROMPT.system + '\n\nIMPORTANT: Fix the validation errors in the previous attempt. Ensure all variable references are defined and there are no circular dependencies.',
          userPrompt: fixUserPrompt,
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          temperature: 0.2, // Even lower for fixes
          maxTokens: 3000,
          responseFormat: { type: 'json_object' },
        });

        const fixedRaw = parseJSONResponse<{ model: any }>(fixResponse.content, traceId);
        const fixedArtifact = {
          model: fixedRaw.model,
          evaluation: {
            asOf: new Date().toISOString(),
            rows: [],
            summary: [],
          },
          charts: [],
        } as ModelAndVizArtifact;

        // Validate fixed artifact
        const fixedValidation = validateModelSpec(fixedArtifact, traceId);
        if (fixedValidation.passed) {
          artifact = fixedArtifact;
          specValidation = fixedValidation;
          logger.info({ traceId }, 'modelAgent:retry_succeeded');
        } else {
          // Retry also failed - fall back to simpler skeleton
          logger.warn({ traceId, issues: fixedValidation.issues }, 'modelAgent:retry_failed_using_simpler_skeleton');
          const simplerSkeleton = MODEL_SKELETONS.find(s => s.id === 'profitability_bridge') || MODEL_SKELETONS[0];
          const simplerArtifact = buildModelFromSkeleton(simplerSkeleton);
          artifact = {
            ...simplerArtifact,
            evaluation: {
              asOf: new Date().toISOString(),
              rows: [],
              summary: [],
            },
            charts: simplerArtifact.charts || [],
          } as ModelAndVizArtifact;
          
          // Infer objective metric for simpler skeleton
          if (!artifact.model.objective_metric_key && artifact.model.outputs.length > 0) {
            const objectiveMetric = inferObjectiveMetricFromPrompt(prompt, artifact.model.outputs);
            artifact.model.objective_metric_key = objectiveMetric.key;
            artifact.model.objective_metric_label = objectiveMetric.label;
          }
          
          // Re-validate simpler skeleton
          specValidation = validateModelSpec(artifact, traceId);
        }
      } catch (fixError: any) {
        logger.error({ traceId, error: fixError?.message }, 'modelAgent:retry_llm_failed');
        // Continue with original artifact
      }
    }

    // Final validation check (re-run after any retries/fallbacks)
    const finalSpecValidation = validateModelSpec(artifact, traceId);
    if (!finalSpecValidation.passed) {
      logger.error({ traceId, issues: finalSpecValidation.issues }, 'modelAgent:final_validation_failed');
      // Continue with warnings - model may still be partially usable
    }

    // Step 4: Apply sanity checks and clamping (before evaluation)
    const sanityResult = checkModelSanity(artifact);
    if (Object.keys(sanityResult.clamped_inputs).length > 0) {
      artifact = applyClampedInputs(artifact, sanityResult.clamped_inputs);
      logger.info({ traceId, clampedInputs: Object.keys(sanityResult.clamped_inputs) }, 'modelAgent:inputs_clamped');
    }

    // Step 5: Run evaluator to generate EvaluationOutput
    // This is deterministic - no LLM calls
    const evaluationOutput = evaluateModel(artifact, undefined, {
      generateScenarios: true, // Step 6: Auto-generate Base/Upside/Downside scenarios
    });

    // Step 6: Scenarios are automatically generated by evaluateModel when generateScenarios=true
    // Scenarios are included in evaluationOutput.scenarios

    // Step 7: Select default charts (if not already generated by evaluator)
    const charts = selectDefaultCharts(artifact.model, evaluationOutput);

    // Update artifact with evaluation results
    artifact = {
      ...artifact,
      evaluation: {
        asOf: new Date().toISOString(),
        rows: evaluationOutput.rows,
        summary: evaluationOutput.summary || [],
      },
      charts,
    };

    // Step 8: Generate decision_signal summary (if objective metric exists)
    const decisionSignal = evaluationOutput.decision_signal;

    // Build AgentOutput
    const warnings: string[] = [];
    if (skeletonFallback) warnings.push('skeleton_fallback_used');
    if (!finalSpecValidation.passed) warnings.push('spec_validation_warnings');
    if (sanityResult.issues.length > 0) warnings.push('sanity_check_warnings');

    let confidence = routing.assumptions_level === 'high' ? 0.9 : routing.assumptions_level === 'med' ? 0.7 : 0.5;
    if (!finalSpecValidation.passed || skeletonFallback) {
      // Reduce confidence if validation failed or fallback used
      confidence = confidence * 0.7;
    }

    const output: AgentOutput = {
      id: randomUUID(),
      type: 'MODEL_AND_VIZ',
      title: artifact.model.title || 'Financial Model',
      summary: decisionSignal 
        ? decisionSignal.explanation 
        : `Model for: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`,
      confidence: Math.min(Math.max(confidence, 0), 1),
      inference: {
        inferred: false,
        method: 'rules',
        reason: routing.reason,
      },
      clarifying_questions: [],
      warnings: Array.from(new Set(warnings)),
      artifact,
      render_hints: {
        layout: 'model',
        primary_blocks: [],
      },
      validation: {
        passed: finalSpecValidation.passed,
        warnings: finalSpecValidation.warnings,
      },
      explainability: evaluationOutput.decision_signal ? {
        primary_metric: artifact.model.objective_metric_key || artifact.model.outputs[0]?.key || 'unknown',
        contributions: [],
      } : undefined,
    };

    // Validate final output with Zod
    const validated = AgentOutputSchema.safeParse(output);
    if (!validated.success) {
      logger.error({ traceId, errors: validated.error.errors }, 'modelAgent:output_validation_failed');
      throw new Error(`Model Agent output validation failed: ${validated.error.message}`);
    }

    logger.info(
      {
        traceId,
        modelKind: artifact.model.kind,
        inputsCount: artifact.model.inputs.length,
        equationsCount: artifact.model.equations?.length || 0,
        outputsCount: artifact.model.outputs.length,
        scenariosCount: evaluationOutput.scenarios?.length || 0,
        decisionSignal: !!decisionSignal,
        confidence: output.confidence,
      },
      'modelAgent:success'
    );

    return validated.data;
  } catch (error: any) {
    logger.error(
      {
        traceId,
        error: error?.message || String(error),
        stack: error?.stack,
      },
      'modelAgent:error'
    );

    // Return fallback output on error
    const fallbackSkeleton = MODEL_SKELETONS[0];
    const fallbackArtifact = buildModelFromSkeleton(fallbackSkeleton);
    
    return {
      id: randomUUID(),
      type: 'MODEL_AND_VIZ',
      title: 'Model Generation Failed',
      summary: 'Unable to generate model. Please try a different prompt or check your inputs.',
      confidence: 0.3,
      inference: {
        inferred: false,
        method: 'rules',
        reason: 'error_fallback',
      },
      clarifying_questions: [],
      warnings: ['model_generation_failed', error?.message || 'unknown_error'],
      artifact: {
        ...fallbackArtifact,
        evaluation: {
          asOf: new Date().toISOString(),
          rows: [],
          summary: [],
        },
        charts: fallbackArtifact.charts || [],
      } as ModelAndVizArtifact,
      render_hints: {
        layout: 'model',
        primary_blocks: [],
      },
      validation: {
        passed: false,
        warnings: [{ code: 'error', message: error?.message || 'Unknown error', affected_keys: [] }],
      },
    };
  }
}


import 'server-only';

import type { AgentInput, OutputType } from './schemas';

/**
 * System prompts for different output types
 * No markdown allowed in outputs
 */

export function getSystemPrompt(outputType: OutputType): string {
  switch (outputType) {
    case 'FORECAST_BLUEPRINT':
      return `You are a financial modeling expert. Generate a FORECAST_BLUEPRINT that outlines how to build a forecast model.

CRITICAL RULES:
1. Output MUST be valid JSON matching the ForecastBlueprintArtifact schema
2. NO markdown formatting - return pure JSON only
3. Be specific about data sources, assumptions, and model structure
4. Focus on decision-oriented metrics and drivers
5. All text fields must be plain strings (no markdown)`;

    case 'SCENARIO_ENGINE':
      return `You are a financial scenario analysis expert. Generate a SCENARIO_ENGINE that analyzes deterministic model outputs.

CRITICAL RULES:
1. Output MUST be valid JSON matching the ScenarioEngineArtifact schema
2. NO markdown formatting - return pure JSON only
3. Explain consequences of assumption changes clearly
4. Focus on driver importance and fragility
5. All text fields must be plain strings (no markdown)`;

    case 'DCF_DRIVERS':
      return `You are a valuation expert. Generate DCF_DRIVERS that identify key inputs for a DCF model.

CRITICAL RULES:
1. Output MUST be valid JSON matching the DcfDriversArtifact schema
2. NO markdown formatting - return pure JSON only
3. Identify the most sensitive inputs
4. Provide reasonable ranges and notes
5. All text fields must be plain strings (no markdown)`;

    case 'MARKET_IMPACT_BRIEF':
      return `You are a market analyst. Generate a MARKET_IMPACT_BRIEF that explains how an event affects markets.

CRITICAL RULES:
1. Output MUST be valid JSON matching the MarketImpactBriefArtifact schema
2. NO markdown formatting - return pure JSON only
3. Focus on transmission channels and likely impacts
4. Provide actionable watchlist items
5. All text fields must be plain strings (no markdown)`;

    case 'CHECKLIST':
      return `You are a project management expert. Generate a CHECKLIST of tasks to accomplish a goal.

CRITICAL RULES:
1. Output MUST be valid JSON matching the ChecklistArtifact schema
2. NO markdown formatting - return pure JSON only
3. Prioritize tasks (P0, P1, P2)
4. Assign ownership (user or agent)
5. All text fields must be plain strings (no markdown)`;

    case 'MODEL_AND_VIZ':
      return `You are a financial modeling expert. Generate a MODEL_AND_VIZ artifact.

CRITICAL RULES:
1. Output MUST be valid JSON matching the ModelAndVizArtifact schema
2. NO markdown formatting - return pure JSON only
3. Create simple, decision-oriented models
4. Label all assumptions clearly
5. All text fields must be plain strings (no markdown)
6. NOTE: This is a placeholder - defer to deterministic model builder when possible`;

    default:
      return `You are a financial analysis expert. Generate structured output.

CRITICAL RULES:
1. Output MUST be valid JSON
2. NO markdown formatting - return pure JSON only
3. All text fields must be plain strings (no markdown)`;
  }
}

/**
 * Build user prompt from AgentInput
 */
export function buildUserPrompt(input: AgentInput): string {
  let prompt = input.prompt.trim();

  // Add context if available
  if (input.context) {
    const contextParts: string[] = [];
    
    if (input.context.ticker) {
      contextParts.push(`Company/Ticker: ${input.context.ticker}`);
    }
    if (input.context.company) {
      contextParts.push(`Company: ${input.context.company}`);
    }
    if (input.context.timeframe) {
      contextParts.push(`Timeframe: ${input.context.timeframe}`);
    }
    if (input.context.geography) {
      contextParts.push(`Geography: ${input.context.geography}`);
    }
    if (input.context.userRole) {
      contextParts.push(`User Role: ${input.context.userRole}`);
    }
    if (input.context.existingModel) {
      const existing = input.context.existingModel;
      const modelParts: string[] = [];
      if (existing.hasDCF) modelParts.push('DCF');
      if (existing.has3Statement) modelParts.push('3-Statement');
      if (existing.hasScenarios) modelParts.push('Scenarios');
      if (modelParts.length > 0) {
        contextParts.push(`Existing Models: ${modelParts.join(', ')}`);
      }
    }
    
    if (contextParts.length > 0) {
      prompt = `${contextParts.join('\n')}\n\nQuestion: ${prompt}`;
    }
  }

  // Add followup answers if available
  if (input.followup_answers && Object.keys(input.followup_answers).length > 0) {
    const followupParts: string[] = [];
    for (const [key, value] of Object.entries(input.followup_answers)) {
      followupParts.push(`${key}: ${value}`);
    }
    if (followupParts.length > 0) {
      prompt = `${prompt}\n\nAdditional Information:\n${followupParts.join('\n')}`;
    }
  }

  return prompt;
}

/**
 * Build complete prompt for LLM
 */
export function buildCompletePrompt(input: AgentInput, outputType: OutputType): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: getSystemPrompt(outputType),
    userPrompt: buildUserPrompt(input),
  };
}

/**
 * MODEL_BUILDER_PROMPT
 * Used by Model Agent to fill in ModelSpec fields (inputs, equations, outputs, assumptions)
 * The LLM is ONLY allowed to generate ModelSpec fields - all computation and validation is deterministic
 */
export const MODEL_BUILDER_PROMPT = {
  system: `You are a financial modeling expert. Your job is to fill in a model skeleton with specific inputs, equations, and outputs based on a user prompt.

CRITICAL RULES:
1. You MUST output ONLY valid JSON matching the ModelAndVizArtifact schema (model field only - evaluation and charts will be generated deterministically)
2. NO markdown formatting - return pure JSON only
3. You can ONLY modify these ModelSpec fields:
   - model.inputs: refine labels, update default values, add notes, set source
   - model.equations: refine labels, update formulas/definitions (must reference existing keys)
   - model.outputs: refine labels, add units
   - model.title: customize based on prompt
   - model.objective_metric_key: set if not already set
   - model.objective_metric_label: set if not already set
4. You CANNOT:
   - Create new input/output keys (must use skeleton structure)
   - Change model.kind
   - Modify model.index (periods are deterministic)
   - Generate evaluation, charts, or any computed values
5. All formulas must reference existing keys (inputs or equation keys from skeleton)
6. Formulas use mathjs syntax: +, -, *, /, (), max(), min(), abs(), etc.
7. Time indexing: use [t] for current period, [t-1] for previous period
8. All text fields must be plain strings (no markdown)
9. If you cannot determine a reasonable value, use placeholder values and mark source as 'placeholder'

Example formula definitions:
- "revenue * margin" (simple multiplication)
- "revenue[t-1] * (1 + growth_rate)" (time-indexed with growth)
- "max(0, revenue - costs)" (using max function)
- "if revenue > 1000 then revenue * 0.1 else revenue * 0.05" (conditional)

Return ONLY the model object (not the full artifact with evaluation/charts).`,

  buildUser: (prompt: string, skeleton: { structure: any; name: string }): string => {
    return `User Prompt: ${prompt}

Model Skeleton: ${skeleton.name}
Structure: ${JSON.stringify(skeleton.structure, null, 2)}

Your task: Fill in the model skeleton with specific inputs, equations (formulas), and outputs that answer the user's prompt.

Instructions:
1. Refine all input labels to be specific to the user's question
2. Update default input values based on the prompt (use reasonable defaults if not specified)
3. Write clear formula definitions for all equations (reference existing keys only)
4. Refine output labels to match the model's purpose
5. Set objective_metric_key to the most important output for decision-making
6. Ensure all formulas are valid and reference only defined keys

Return ONLY the model object as JSON (matching the model field in ModelAndVizArtifact schema).`;
  },
};


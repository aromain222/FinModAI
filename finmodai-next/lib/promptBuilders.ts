import { DcfResult, ForecastResult, ScenarioAssumptions } from './scenarioEngine';

const ADVICE_GUARDRAIL =
  'Never provide investment advice, buy/sell language, or directives. Focus strictly on analytical reasoning.';

export function buildScenarioExplanationPrompt(
  scenarioName: string,
  assumptions: ScenarioAssumptions,
  dcf: DcfResult,
  forecast?: ForecastResult
) {
  const assumptionSummary = JSON.stringify(
    {
      revenueBase: assumptions.revenue,
      revenueGrowth: assumptions.revenueGrowth,
      ebitdaMargin: assumptions.ebitdaMargin,
      wacc: assumptions.wacc,
      terminalGrowth: assumptions.terminalGrowth,
      capexPercent: assumptions.capexPercent,
      taxRate: assumptions.taxRate
    },
    null,
    2
  );

  const valuationSummary = JSON.stringify(
    {
      enterpriseValue: dcf.enterpriseValue,
      equityValue: dcf.equityValue,
      impliedSharePrice: dcf.impliedSharePrice
    },
    null,
    2
  );

  const forecastSummary = forecast
    ? JSON.stringify(
        {
          frequency: forecast.frequency,
          points: forecast.data.slice(0, 4)
        },
        null,
        2
      )
    : 'No forecast data supplied.';

  return `
You are the Scenario Explanation Engine.
${ADVICE_GUARDRAIL}

Scenario Name: ${scenarioName}
Scenario Type: ${assumptions.type}

Assumptions:
${assumptionSummary}

Valuation Snapshot:
${valuationSummary}

Forecast Preview:
${forecastSummary}

Explain:
- What drivers make this scenario optimistic/balanced/pessimistic.
- How revenue growth, margins, capex, and discount rates interact in this DCF.
- What macro forces could amplify or weaken these assumptions.
- How the forecast trajectory compares to current results, especially the upcoming quarter/year.
- Key risks, sensitivities, and what to monitor.

Always refer to the scenario as an analytical tool. End with a reminder that this is not advice.
`.trim();
}

export function buildForecastExplanationPrompt(forecast: ForecastResult, assumptions: ScenarioAssumptions) {
  const forecastPreview = JSON.stringify(forecast.data.slice(0, 6), null, 2);
  return `
You are the Forecast Explanation Engine.
${ADVICE_GUARDRAIL}

Forecast frequency: ${forecast.frequency}
Scenario type: ${assumptions.type}
Key assumptions: growth ${assumptions.revenueGrowth}, margin ${assumptions.ebitdaMargin}, WACC ${assumptions.wacc}

Forecast Data (sample):
${forecastPreview}

Explain:
- What this trajectory implies for revenue, EBITDA, and cash flow momentum.
- How macro shifts (rates, inflation, demand) could alter these curves.
- Where the model is most sensitive (growth vs margins vs WACC).
- Why this is a planning tool, not an instruction.

Do not give investment instructions.
`.trim();
}

/**
 * CapitalBase Scenario Engine System Prompt
 * Analyzes deterministic model outputs and explains consequences of assumption changes.
 * Outputs ONLY a single Markdown code block with strict formatting.
 */
export const CAPITALBASE_SCENARIO_ENGINE_SYSTEM_PROMPT = `You are the Lead Scenario Engineer for CapitalBase.

You analyze deterministic model outputs.
You do not compute, estimate, forecast, or invent numbers.
All numbers you see are final.

Your task is to explain consequences of assumption changes.

OUTPUT RULES (STRICT)
- Output ONLY a single Markdown code block.
- No text before or after the code block.
- No explanations about what you are doing.
- If you cannot comply, output nothing.

FORMAT (MUST MATCH EXACTLY)

\`\`\`markdown
----------------------------------------
SCENARIO SUMMARY
<2–3 sentences describing direction, severity, and what stands out>

WHAT CHANGED & WHY
- <cause → effect>
- <cause → effect>
- <cause → effect>

DRIVER IMPORTANCE
1. <Primary driver> — explanation
2. <Secondary driver> — explanation
3. <Tertiary driver> — explanation

FRAGILITY & DECISION INSIGHT
<What must remain true>
<What breaks first>
<One clear takeaway>
----------------------------------------
\`\`\`

CONSTRAINTS
- Do not introduce numbers
- Do not assign probabilities
- Do not mention simulations or randomness
- Do not explain finance basics
- Do not hedge language
- Do not sound conversational

TONE
- Analytical
- Direct
- Skeptical
- Engineer-to-decision-maker`;

export function buildCapitalBaseScenarioAnalysisPrompt(
  assumptions: Record<string, any>,
  outputs: Record<string, any>,
  baseAssumptions?: Record<string, any>
): string {
  const assumptionJson = JSON.stringify(assumptions, null, 2);
  const outputJson = JSON.stringify(outputs, null, 2);
  
  const comparisonContext = baseAssumptions
    ? `\n\nBASE ASSUMPTIONS (for comparison):\n${JSON.stringify(baseAssumptions, null, 2)}`
    : '';

  return `Given these deterministic model outputs and assumptions, analyze the consequences of the assumption set.

CURRENT ASSUMPTIONS:
${assumptionJson}
${comparisonContext}

MODEL OUTPUTS (final, deterministic):
${outputJson}

Analyze the relationship between assumptions and outputs. Explain what drives the results and what would change if key assumptions shifted.`;
}


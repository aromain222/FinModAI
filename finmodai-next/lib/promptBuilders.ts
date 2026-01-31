export function buildScenarioExplanationPrompt(
  scenario: string,
  assumptions: Record<string, any>
): string {
  return `Explain the following financial scenario:

Scenario: ${scenario}

Key Assumptions:
${Object.entries(assumptions).map(([key, value]) => `- ${key}: ${value}`).join('\n')}

Provide a brief, clear explanation of what this scenario means and its implications.`;
}

export function buildForecastExplanationPrompt(
  forecast: Record<string, any>
): string {
  return `Explain this financial forecast:

${JSON.stringify(forecast, null, 2)}

Provide a brief, clear explanation.`;
}

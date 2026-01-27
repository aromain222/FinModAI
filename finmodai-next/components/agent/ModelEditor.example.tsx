/**
 * Example usage of ModelEditor component
 * 
 * This demonstrates how to use the ModelEditor with a MODEL_AND_VIZ artifact
 */

import { ModelEditor } from './ModelEditor';
import type { ModelAndVizArtifact } from '@/lib/ai/schemas';

export function ModelEditorExample() {
  // Example artifact (in real usage, this would come from AgentOutput)
  const exampleArtifact: ModelAndVizArtifact = {
    model: {
      kind: 'forecast',
      title: 'Revenue Growth Model',
      index: {
        frequency: 'quarterly',
        periods: ['2024 Q1', '2024 Q2', '2024 Q3', '2024 Q4'],
      },
      inputs: [
        {
          key: 'starting_revenue',
          label: 'Starting Revenue',
          value: 1000000,
          unit: '$',
          source: 'user',
        },
        {
          key: 'revenue_growth',
          label: 'Revenue Growth Rate',
          value: 0.1,
          unit: '%',
          source: 'inferred', // Low confidence
        },
        {
          key: 'margin',
          label: 'Gross Margin',
          value: 0.3,
          unit: '%',
          source: 'placeholder', // Low confidence - will be highlighted
        },
      ],
      equations: [
        {
          key: 'revenue',
          label: 'Revenue',
          definition: 'if(t == 0, starting_revenue, revenue[t-1] * (1 + revenue_growth))',
        },
        {
          key: 'gross_profit',
          label: 'Gross Profit',
          definition: 'revenue * margin',
        },
      ],
      outputs: [
        { key: 'revenue', label: 'Revenue', unit: '$' },
        { key: 'gross_profit', label: 'Gross Profit', unit: '$' },
      ],
      objective_metric_key: 'gross_profit',
      objective_metric_label: 'Gross Profit',
    },
    evaluation: {
      asOf: new Date().toISOString(),
      rows: [],
    },
    charts: [],
  };

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-bold text-white">Model Editor Example</h1>
      <ModelEditor
        artifact={exampleArtifact}
        onEvaluationUpdate={(output) => {
          console.log('Evaluation updated:', output);
        }}
      />
    </div>
  );
}


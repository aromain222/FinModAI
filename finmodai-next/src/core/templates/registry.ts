import type { ModelInputs } from '@/src/core/contracts/modelInputs';
import type { ModelOutputs } from '@/src/core/contracts/modelOutputs';
import { runDcfTemplate } from '@/src/core/templates/dcf';
import { ENGINE_VERSION } from '@/src/core/engine/version';

export type TemplateDefinition = {
  id: string;
  name: string;
  requiredInputs: string[];
  run: (inputs: ModelInputs) => ModelOutputs;
};

const reverseDcfStub: TemplateDefinition = {
  id: 'reverse-dcf',
  name: 'Reverse DCF',
  requiredInputs: ['pricingAnchor.marketCap|pricingAnchor.sharePrice+pricingAnchor.sharesOutstanding'],
  run: (inputs) => ({
    templateId: 'reverse-dcf',
    summary: {
      enterpriseValue: 0,
      equityValue: 0,
      wacc: inputs.assumptions.wacc ?? 0.1,
      terminalValueShare: 0,
      notes: ['Reverse DCF template scaffold is registered; deterministic solver wiring is pending.'],
    },
    audit: {
      inputsHash: '',
      timestamp: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
      warnings: ['Template is running in scaffold mode.'],
      assumptionsUsed: {
        wacc: inputs.assumptions.wacc ?? null,
        terminalGrowth: inputs.assumptions.terminalGrowth ?? null,
      },
    },
  }),
};

export const templateRegistry: Record<string, TemplateDefinition> = {
  dcf: {
    id: 'dcf',
    name: 'DCF',
    requiredInputs: ['historicals.revenue', 'assumptions.growth', 'assumptions.margins'],
    run: runDcfTemplate,
  },
  'reverse-dcf': reverseDcfStub,
};

export function getTemplate(templateId: string): TemplateDefinition | null {
  return templateRegistry[templateId] || null;
}

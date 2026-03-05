import type { ModelOutputs } from '@/src/core/contracts/modelOutputs';
import type { ScenarioComparison } from '@/src/core/engine/compare';
import { createReportPdf } from '@/lib/reportPdf';

export async function buildPdfFromModelOutputs(params: {
  templateId: string;
  modelOutputs: ModelOutputs;
  companyName: string;
  scenarioComparison?: ScenarioComparison | null;
  sensitivity?: {
    rows?: number[];
    cols?: number[];
    values?: Array<Array<number | null>>;
    base?: {
      wacc?: number;
      terminalGrowth?: number;
      pricePerShare?: number | null;
    };
  } | null;
}): Promise<Uint8Array> {
  const { templateId, modelOutputs, companyName, scenarioComparison, sensitivity } = params;

  const lines: string[] = [];
  lines.push(`${companyName}`);
  lines.push(`Template: ${templateId}`);
  lines.push(`Generated: ${modelOutputs.audit.generatedAt || modelOutputs.audit.timestamp}`);
  lines.push('');
  lines.push(`Enterprise Value: ${modelOutputs.summary.enterpriseValue.toFixed(2)}`);
  if (typeof modelOutputs.summary.equityValue === 'number') {
    lines.push(`Equity Value: ${modelOutputs.summary.equityValue.toFixed(2)}`);
  }
  if (typeof modelOutputs.summary.impliedSharePrice === 'number') {
    lines.push(`Implied Share Price: ${modelOutputs.summary.impliedSharePrice.toFixed(4)}`);
  }
  lines.push(`WACC: ${(modelOutputs.summary.wacc * 100).toFixed(2)}%`);
  lines.push(`Terminal Value Share: ${(modelOutputs.summary.terminalValueShare * 100).toFixed(2)}%`);

  if (scenarioComparison && Array.isArray(scenarioComparison.rows) && scenarioComparison.rows.length > 0) {
    lines.push('');
    lines.push('Scenario Comparison');
    lines.push('Scenario | Enterprise Value | EV Delta vs Base | EV % vs Base | Implied Price | Price Delta | Price %');
    for (const row of scenarioComparison.rows) {
      lines.push(
        `${row.scenarioName} | ${row.enterpriseValue.toFixed(2)} | ${row.enterpriseValueDeltaVsBase.toFixed(2)} | ${(row.enterpriseValuePctVsBase * 100).toFixed(2)}% | ${
          row.impliedSharePrice === null ? '—' : row.impliedSharePrice.toFixed(4)
        } | ${
          row.impliedSharePriceDeltaVsBase === null ? '—' : row.impliedSharePriceDeltaVsBase.toFixed(4)
        } | ${
          row.impliedSharePricePctVsBase === null ? '—' : `${(row.impliedSharePricePctVsBase * 100).toFixed(2)}%`
        }`
      );
    }
  }

  if (sensitivity?.rows && sensitivity?.cols && sensitivity?.values) {
    lines.push('');
    lines.push('Sensitivity Table (rows=WACC, cols=Terminal Growth)');
    if (sensitivity.base) {
      lines.push(
        `Base: WACC=${((sensitivity.base.wacc || 0) * 100).toFixed(2)}%, TG=${(
          (sensitivity.base.terminalGrowth || 0) * 100
        ).toFixed(2)}%, Value/Share=${sensitivity.base.pricePerShare == null ? '—' : sensitivity.base.pricePerShare.toFixed(2)}`
      );
    }
    lines.push(
      `WACC \\ TG | ${sensitivity.cols.map((value) => `${(value * 100).toFixed(2)}%`).join(' | ')}`
    );
    sensitivity.rows.forEach((rowValue, rowIndex) => {
      const values = (sensitivity.values?.[rowIndex] || []).map((cell) =>
        typeof cell === 'number' && Number.isFinite(cell) ? cell.toFixed(2) : '—'
      );
      lines.push(`${(rowValue * 100).toFixed(2)}% | ${values.join(' | ')}`);
    });
  }

  if (Array.isArray(modelOutputs.summary.notes) && modelOutputs.summary.notes.length > 0) {
    lines.push('');
    lines.push('Notes:');
    for (const note of modelOutputs.summary.notes) {
      lines.push(`- ${note}`);
    }
  }

  if (Array.isArray(modelOutputs.audit.warnings) && modelOutputs.audit.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of modelOutputs.audit.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  const buffer = await createReportPdf(lines.join('\n'));
  return new Uint8Array(buffer);
}

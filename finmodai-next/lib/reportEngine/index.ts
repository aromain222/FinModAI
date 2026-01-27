/**
 * Report Engine
 * 
 * Main entry point for generating analytical reports for all model types.
 */

import { ModelReport, ReportContext, ModelType } from './types';
import { generateDcfReport } from './dcfReport';

export { ModelReport, ReportContext, ModelType };

export function generateReport(
  modelType: ModelType,
  context: ReportContext
): ModelReport {
  switch (modelType) {
    case 'dcf':
      return generateDcfReport(context);
    
    case 'lbo':
      return generateLboReport(context);
    
    case 'comps':
      return generateCompsReport(context);
    
    case 'three-statement':
      return generateThreeStatementReport(context);
    
    default:
      throw new Error(`Unsupported model type: ${modelType}`);
  }
}

// Placeholder generators (implement later)
function generateLboReport(context: ReportContext): ModelReport {
  return {
    companyName: context.companyName,
    ticker: context.ticker,
    modelType: 'lbo',
    generatedAt: new Date().toISOString(),
    asOfDate: new Date().toISOString().slice(0, 10),
    summary: `LBO analysis for ${context.companyName} (${context.ticker}). Entry multiple: ${context.keyOutputs.entryMultiple?.toFixed(1)}x, Target IRR: ${context.keyOutputs.irr?.toFixed(1)}%, MoIC: ${context.keyOutputs.moic?.toFixed(1)}x.`,
    sections: [
      {
        title: 'Transaction Summary',
        content: [
          `Entry Multiple: ${context.keyOutputs.entryMultiple?.toFixed(1)}x EBITDA`,
          `Exit Multiple: ${context.keyOutputs.exitMultiple?.toFixed(1)}x EBITDA`,
          `Target IRR: ${context.keyOutputs.irr?.toFixed(1)}%`,
          `MoIC: ${context.keyOutputs.moic?.toFixed(1)}x`,
        ],
      },
      {
        title: 'Key Levers',
        content: [
          '• EBITDA growth and margin expansion',
          '• Debt paydown and deleveraging',
          '• Multiple expansion on exit',
          '• Working capital optimization',
        ],
      },
    ],
    triggers: [
      'EBITDA falls below debt service coverage requirements',
      'Exit multiples compress due to market conditions',
      'Unable to achieve target leverage reduction',
    ],
    dataQuality: ['LBO report generator in development - showing placeholder data'],
  };
}

function generateCompsReport(context: ReportContext): ModelReport {
  return {
    companyName: context.companyName,
    ticker: context.ticker,
    modelType: 'comps',
    generatedAt: new Date().toISOString(),
    asOfDate: new Date().toISOString().slice(0, 10),
    summary: `Comparable company analysis for ${context.companyName} (${context.ticker}). Median multiple: ${context.keyOutputs.medianMultiple?.toFixed(1)}x.`,
    sections: [
      {
        title: 'Peer Set Analysis',
        content: [
          `Median Multiple: ${context.keyOutputs.medianMultiple?.toFixed(1)}x`,
          'Peer selection based on sector, size, and business model similarity',
        ],
      },
      {
        title: 'Valuation Range',
        content: [
          context.keyOutputs.impliedValuationRange
            ? `Implied Range: $${context.keyOutputs.impliedValuationRange[0].toFixed(2)} - $${context.keyOutputs.impliedValuationRange[1].toFixed(2)}`
            : 'Valuation range not available',
        ],
      },
    ],
    triggers: [
      'Peer multiples compress due to sector rotation',
      'Company-specific issues cause discount to peers',
      'Market conditions change valuation framework',
    ],
    dataQuality: ['Comps report generator in development - showing placeholder data'],
  };
}

function generateThreeStatementReport(context: ReportContext): ModelReport {
  return {
    companyName: context.companyName,
    ticker: context.ticker,
    modelType: 'three-statement',
    generatedAt: new Date().toISOString(),
    asOfDate: new Date().toISOString().slice(0, 10),
    summary: `Three-statement model for ${context.companyName} (${context.ticker}). Revenue growth: ${context.keyOutputs.revenueGrowth?.toFixed(1)}%, EBITDA margin: ${context.keyOutputs.ebitdaMargin?.toFixed(1)}%.`,
    sections: [
      {
        title: 'Growth & Profitability',
        content: [
          `Revenue Growth: ${context.keyOutputs.revenueGrowth?.toFixed(1)}%`,
          `EBITDA Margin: ${context.keyOutputs.ebitdaMargin?.toFixed(1)}%`,
          `FCF Conversion: ${context.keyOutputs.fcfConversion?.toFixed(1)}%`,
        ],
      },
      {
        title: 'Key Trends',
        content: [
          '• Revenue trajectory and market share',
          '• Margin expansion or compression drivers',
          '• Working capital efficiency',
          '• Cash conversion quality',
        ],
      },
    ],
    triggers: [
      'Revenue growth decelerates significantly',
      'Margins compress due to competitive pressure',
      'Working capital deteriorates',
      'Cash conversion weakens',
    ],
    dataQuality: ['3-Statement report generator in development - showing placeholder data'],
  };
}

/**
 * Export report as markdown string
 */
export function exportReportAsMarkdown(report: ModelReport): string {
  const lines: string[] = [];
  
  lines.push(`# ${report.companyName} (${report.ticker}) - ${report.modelType.toUpperCase()} Analysis`);
  lines.push('');
  lines.push(`**Generated:** ${new Date(report.generatedAt).toLocaleString()}`);
  lines.push(`**As of:** ${report.asOfDate}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(report.summary);
  lines.push('');
  
  for (const section of report.sections) {
    lines.push(`## ${section.title}`);
    lines.push('');
    for (const item of section.content) {
      lines.push(item);
    }
    lines.push('');
  }
  
  lines.push('## What Would Change the Conclusion');
  lines.push('');
  for (const trigger of report.triggers) {
    lines.push(`- ${trigger}`);
  }
  lines.push('');
  
  lines.push('## Data Quality Notes');
  lines.push('');
  for (const note of report.dataQuality) {
    lines.push(`- ${note}`);
  }
  lines.push('');
  
  return lines.join('\n');
}


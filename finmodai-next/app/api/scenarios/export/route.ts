import { NextRequest, NextResponse } from 'next/server';
import { buildScenarioBaselineFromDemo } from '@/lib/scenarios/demoBaseline';
import { standardScenarioTemplate } from '@/lib/scenarios/templates';
import { computeDeltaVsBase, runDcf, type ScenarioAssumptions } from '@/lib/scenarioEngine';
import { buildScenarioEngineWorkbook } from '@/lib/excel/scenarioExport';

export async function GET(req: NextRequest) {
  try {
    const tickerRaw = req.nextUrl.searchParams.get('ticker') || '';
    const ticker = tickerRaw.trim().toUpperCase();
    if (!ticker) {
      return NextResponse.json({ error: 'ticker required' }, { status: 400 });
    }

    const baseline = await buildScenarioBaselineFromDemo(ticker);
    const scenarios: ScenarioAssumptions[] = standardScenarioTemplate(baseline.sector);

    const baseDcf = await runDcf(baseline.base, { name: 'Base Case' }, 5);
    const rows = [];
    for (const scenario of scenarios) {
      const dcf = await runDcf(baseline.base, scenario, 5);
      const deltaVsBase = computeDeltaVsBase(baseDcf, dcf, baseline.base, scenario);
      const drivers = {
        revenueGrowth: baseline.base.revenueGrowth + (scenario.revenueGrowthDelta || 0),
        ebitdaMargin: baseline.base.ebitdaMargin + (scenario.ebitdaMarginDelta || 0),
        wacc: (baseline.base.wacc ?? 0.1) + (scenario.waccDelta || 0),
        terminalGrowth: (baseline.base.terminalGrowth ?? 0.025) + (scenario.terminalGrowthDelta || 0),
        taxRate: (baseline.base.taxRate ?? 0.25) + (scenario.taxRateDelta || 0),
        capexPctRevenue: (baseline.base.capexPctRevenue ?? 0.04) + (scenario.capexPctRevenueDelta || 0),
        nwcPctRevenue: (baseline.base.nwcPctRevenue ?? 0.1) + (scenario.nwcPctRevenueDelta || 0),
        daPctRevenue: (baseline.base.daPctRevenue ?? 0.05) + (scenario.daPctRevenueDelta || 0),
      };
      rows.push({ scenario, dcf, deltaVsBase, drivers });
    }

    const workbook = await buildScenarioEngineWorkbook({
      base: baseline.base,
      rows,
      asOfUtc: new Date().toISOString(),
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const res = new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${ticker}_scenario_engine.xlsx"`,
      },
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to export scenario workbook';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

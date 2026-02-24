import { NextRequest, NextResponse } from 'next/server';
import { getDemoFundamentals, getDemoQuote } from '@/lib/data/providers/demoProvider';
import { isDemoMode, isDemoModeFromRequest } from '@/lib/demo/isDemoMode';
import { solveDcfBreakEven, solveLboBreakEven } from '@/lib/models/breakEven';

const parseNumeric = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.replace(/[$,%\s,]/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const cleanObject = (input: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(input).filter(
      ([, value]) => value !== null && value !== undefined && !(typeof value === 'number' && !Number.isFinite(value))
    )
  );

const nonConvergenceMessage = (reason?: string): string => {
  switch (reason) {
    case 'target_out_of_bounds':
      return 'No solution in solver bounds for selected target.';
    case 'invalid_bounds':
      return 'Solver bounds are invalid for the selected problem.';
    case 'iteration_limit':
    default:
      return 'Solver did not converge within iteration limit.';
  }
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const demoEnabled = isDemoModeFromRequest(req) || isDemoMode();
    if (!demoEnabled) {
      return NextResponse.json(
        {
          ok: false,
          code: 'demo_mode_required',
          message: 'Break-even solver is demo-only.',
        },
        { status: 400 }
      );
    }

    const ticker = String(body?.ticker || '').trim().toUpperCase();
    const modelType = String(body?.modelType || '').trim().toLowerCase();
    if (!ticker) {
      return NextResponse.json(
        { ok: false, code: 'invalid_input', message: 'Ticker is required.' },
        { status: 400 }
      );
    }

    if (modelType === 'dcf') {
      const solveFor = body?.solveFor === 'ebitdaMargin' ? 'ebitdaMargin' : body?.solveFor === 'revenueGrowth' ? 'revenueGrowth' : null;
      if (!solveFor) {
        return NextResponse.json(
          { ok: false, code: 'invalid_input', message: 'DCF solveFor must be revenueGrowth or ebitdaMargin.' },
          { status: 400 }
        );
      }

      const dcfContext = body?.dcfContext && typeof body.dcfContext === 'object' ? body.dcfContext : {};
      const fundamentals = await getDemoFundamentals(ticker);
      const quote = await getDemoQuote(ticker);

      const marketPrice = parseNumeric(body?.targetPrice) ?? parseNumeric(dcfContext?.marketPrice) ?? quote?.price ?? undefined;
      if (!marketPrice || marketPrice <= 0) {
        return NextResponse.json(
          { ok: false, code: 'invalid_target', message: 'Target price is required or demo market price must be available.' },
          { status: 400 }
        );
      }

      const revenue = parseNumeric(dcfContext?.revenue) ?? fundamentals?.revenueLTM ?? undefined;
      const sharesOutstanding =
        parseNumeric(dcfContext?.sharesOutstanding) ??
        (typeof fundamentals?.sharesOutstanding === 'number' && Number.isFinite(fundamentals.sharesOutstanding)
          ? fundamentals.sharesOutstanding
          : undefined);
      const netDebt =
        parseNumeric(dcfContext?.netDebt) ??
        (typeof fundamentals?.totalDebt === 'number' && typeof fundamentals?.cash === 'number'
          ? fundamentals.totalDebt - fundamentals.cash
          : 0);

      const targetPrice = parseNumeric(body?.targetPrice) ?? marketPrice;
      const solved = solveDcfBreakEven({
        ticker,
        solveFor,
        targetPrice,
        revenue: revenue ?? 0,
        revenueGrowth: parseNumeric(dcfContext?.revenueGrowth) ?? 0.06,
        ebitdaMargin: parseNumeric(dcfContext?.ebitdaMargin) ?? 0.25,
        taxRate: parseNumeric(dcfContext?.taxRate) ?? 0.25,
        capexPctRevenue: parseNumeric(dcfContext?.capexPctRevenue) ?? 0.04,
        nwcPctRevenue: parseNumeric(dcfContext?.nwcPctRevenue) ?? 0.02,
        netDebt: netDebt ?? 0,
        sharesOutstanding: sharesOutstanding ?? 0,
        wacc: parseNumeric(dcfContext?.wacc) ?? 0.1,
        terminalGrowth: parseNumeric(dcfContext?.terminalGrowth) ?? 0.025,
        projectionYears: Math.round(parseNumeric(dcfContext?.projectionYears) ?? 5),
        marketPrice,
      });

      if (!solved.converged) {
        return NextResponse.json(
          {
            ok: false,
            code: 'break_even_no_convergence',
            message: nonConvergenceMessage(solved.reason),
            result: {
              ...solved,
              fixedAssumptions: cleanObject(solved.fixedAssumptions),
            },
          },
          { status: 422 }
        );
      }

      return NextResponse.json({
        ok: true,
        result: {
          ...solved,
          fixedAssumptions: cleanObject(solved.fixedAssumptions),
        },
      });
    }

    if (modelType === 'lbo') {
      const solveFor = body?.solveFor === 'entryMultiple' ? 'entryMultiple' : body?.solveFor === 'exitMultiple' ? 'exitMultiple' : null;
      if (!solveFor) {
        return NextResponse.json(
          { ok: false, code: 'invalid_input', message: 'LBO solveFor must be entryMultiple or exitMultiple.' },
          { status: 400 }
        );
      }

      const targetIrrPct = parseNumeric(body?.targetIRR ?? body?.targetIrrPct);
      if (targetIrrPct === undefined) {
        return NextResponse.json(
          { ok: false, code: 'invalid_target', message: 'targetIRR (%) is required for LBO break-even solver.' },
          { status: 400 }
        );
      }

      const lboInputs = body?.lboInputs && typeof body.lboInputs === 'object' ? body.lboInputs : null;
      if (!lboInputs) {
        return NextResponse.json(
          { ok: false, code: 'invalid_input', message: 'lboInputs are required for LBO break-even solver.' },
          { status: 400 }
        );
      }

      const solved = solveLboBreakEven({
        ticker,
        solveFor,
        targetIrr: targetIrrPct / 100,
        lboInputs,
      });

      if (!solved.converged) {
        return NextResponse.json(
          {
            ok: false,
            code: 'break_even_no_convergence',
            message: nonConvergenceMessage(solved.reason),
            result: {
              ...solved,
              fixedAssumptions: cleanObject(solved.fixedAssumptions),
            },
          },
          { status: 422 }
        );
      }

      return NextResponse.json({
        ok: true,
        result: {
          ...solved,
          fixedAssumptions: cleanObject(solved.fixedAssumptions),
        },
      });
    }

    return NextResponse.json(
      { ok: false, code: 'invalid_input', message: 'modelType must be dcf or lbo.' },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        code: 'break_even_failed',
        message: err?.message || 'Break-even solver failed.',
      },
      { status: 400 }
    );
  }
}

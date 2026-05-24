import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { agentViewSchema, tickerQuerySchema } from '@/lib/pm/schemas';
import { readJson, jsonError } from '@/lib/pm/api/http';
import { getLatestAgentView, listAgentViews, saveAgentView } from '@/lib/pm/memory/agentViewStore';
import { hedgeFundToAgentView, hedgeFundToDecision } from '@/lib/pm/adapters/hedgeFund';
import { tradingAgentsToAgentView, tradingAgentsToDecision } from '@/lib/pm/adapters/tradingAgents';
import { saveDecision } from '@/lib/pm/decisions/decisionStore';
import { ingestAgentView } from '@/lib/pm/decisions/pmBrain';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const adaptedAgentViewRequest = z.object({
  adapter: z.enum(['hedge_fund', 'tradingagents']).optional(),
  output: z.record(z.unknown()).optional(),
  createDecision: z.boolean().optional().default(false),
  ingest: z.boolean().optional().default(true),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const parsed = tickerQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const agentViews = await listAgentViews(parsed);
    return NextResponse.json({ agentViews });
  } catch (err) {
    return jsonError(err, 'Could not load agent views');
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await readJson(req);
    const adapted = adaptedAgentViewRequest.safeParse(body);
    if (adapted.success && adapted.data.adapter && adapted.data.output) {
      const ticker = typeof adapted.data.output.ticker === 'string' ? adapted.data.output.ticker : '';
      const previous = ticker ? await getLatestAgentView(ticker) : null;
      const view = adapted.data.adapter === 'hedge_fund'
        ? hedgeFundToAgentView(adapted.data.output, previous)
        : tradingAgentsToAgentView(adapted.data.output, previous);
      if (adapted.data.ingest) {
        const result = await ingestAgentView(view);
        return NextResponse.json(result, { status: 201 });
      }
      const agentView = await saveAgentView(view);
      const decisionPayload = adapted.data.adapter === 'hedge_fund'
        ? hedgeFundToDecision(adapted.data.output)
        : tradingAgentsToDecision(adapted.data.output);
      const decision = adapted.data.createDecision && decisionPayload
        ? await saveDecision(decisionPayload)
        : null;
      return NextResponse.json({ agentView, decision }, { status: 201 });
    }
    const bodyRecord = body as Record<string, unknown>;
    if (bodyRecord.ingest === true && typeof bodyRecord.agentView === 'object' && bodyRecord.agentView !== null) {
      const result = await ingestAgentView(agentViewSchema.parse(bodyRecord.agentView));
      return NextResponse.json(result, { status: 201 });
    }
    const agentView = await saveAgentView(body);
    return NextResponse.json({ agentView }, { status: 201 });
  } catch (err) {
    return jsonError(err, 'Could not save agent view');
  }
}

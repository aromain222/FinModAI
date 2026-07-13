/**
 * CapitalBase MCP server (stdio) — lets any MCP client (Claude Code, etc.)
 * talk to the deployed CapitalBase PM OS the way the Robinhood MCP exposes
 * brokerage data. Zero dependencies: newline-delimited JSON-RPC 2.0 on stdio.
 *
 * Register:
 *   claude mcp add capitalbase -s user -- npx tsx /Users/averyromain/FinModAI/finmodai-next/scripts/capitalbase-mcp.ts
 *
 * Auth: reads EXECUTION_CRON_SECRET from finmodai-next/.env.local (or env)
 * for write/generate endpoints. Base URL override: CAPITALBASE_URL.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const BASE = process.env.CAPITALBASE_URL?.replace(/\/+$/, '') || 'https://capitalbase1.vercel.app';

function loadSecret(): string | null {
  if (process.env.EXECUTION_CRON_SECRET) return process.env.EXECUTION_CRON_SECRET;
  try {
    const envFile = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '.env.local');
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const match = line.match(/^EXECUTION_CRON_SECRET=(.+)$/);
      if (match) return match[1].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* no local env file */ }
  return null;
}
const SECRET = loadSecret();

async function api(method: 'GET' | 'POST', route: string, body?: unknown, timeoutMs = 30_000): Promise<unknown> {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(SECRET ? { Authorization: `Bearer ${SECRET}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`CapitalBase ${route} responded ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
}

type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>) => Promise<unknown>;
};

const tickerArg = {
  type: 'object',
  properties: { ticker: { type: 'string', description: 'Stock ticker, e.g. NVDA' } },
  required: ['ticker'],
} as const;

const TOOLS: ToolDef[] = [
  {
    name: 'get_positions',
    description: 'List the portfolio positions in the PM OS (real Robinhood holdings plus watchlist), with cost basis, targets, stops, conviction, and thesis status.',
    inputSchema: { type: 'object', properties: {} },
    run: () => api('GET', '/api/pm/positions'),
  },
  {
    name: 'get_theses',
    description: 'Get stored position theses. Optionally filter by ticker.',
    inputSchema: { type: 'object', properties: { ticker: { type: 'string' } } },
    run: args => api('GET', `/api/pm/theses${typeof args.ticker === 'string' ? `?ticker=${encodeURIComponent(args.ticker.toUpperCase())}` : ''}`),
  },
  {
    name: 'get_latest_brief',
    description: 'Get the most recent Daily Portfolio Brief (post-close PM memo: P&L, market state, executive summary, per-position views).',
    inputSchema: { type: 'object', properties: {} },
    run: async () => {
      const data = await api('GET', '/api/pm/daily-portfolio-brief') as { latest?: unknown };
      return data.latest ?? data;
    },
  },
  {
    name: 'generate_brief',
    description: 'Generate a fresh Daily Portfolio Brief right now (takes ~2 minutes; runs the full memo LLM). Returns the new brief.',
    inputSchema: { type: 'object', properties: {} },
    run: () => api('POST', '/api/pm/daily-portfolio-brief', {}, 290_000),
  },
  {
    name: 'get_committee_view',
    description: 'Get the latest Senior Investment Committee debate for a ticker (memos, cross-exam rebuttals, adjudication, surviving claims).',
    inputSchema: tickerArg,
    run: args => api('GET', `/api/pm/committee?ticker=${encodeURIComponent(String(args.ticker).toUpperCase())}`),
  },
  {
    name: 'run_committee',
    description: 'Run a fresh Senior Investment Committee debate on a ticker (6 desks -> cross-exam -> PM adjudication; takes ~1-2 minutes).',
    inputSchema: tickerArg,
    run: args => api('POST', '/api/pm/investment-committee', { ticker: String(args.ticker).toUpperCase() }, 290_000),
  },
  {
    name: 'run_research',
    description: 'Run the Idea Lab research flow on a ticker: builds an evidence packet, runs the quant scan, writes a PM thesis (takes ~1-2 minutes).',
    inputSchema: tickerArg,
    run: args => api('POST', '/api/pm/research', { ticker: String(args.ticker).toUpperCase() }, 290_000),
  },
  {
    name: 'get_alerts',
    description: 'List recent PM alerts (score changes, position monitor events, thesis escalations).',
    inputSchema: { type: 'object', properties: {} },
    run: () => api('GET', '/api/pm/alerts'),
  },
];

function reply(id: unknown, result: unknown): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function replyError(id: unknown, message: string, code = -32000): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`);
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', line => {
  const trimmed = line.trim();
  if (!trimmed) return;
  void (async () => {
    let msg: { id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
    try { msg = JSON.parse(trimmed); } catch { return; }
    const { id, method, params } = msg;
    if (method === 'initialize') {
      reply(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'capitalbase', version: '1.0.0' },
      });
    } else if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
      // notifications carry no id and expect no response
    } else if (method === 'ping') {
      reply(id, {});
    } else if (method === 'tools/list') {
      reply(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    } else if (method === 'tools/call') {
      const tool = TOOLS.find(item => item.name === params?.name);
      if (!tool) return replyError(id, `Unknown tool: ${params?.name}`);
      try {
        const result = await tool.run(params?.arguments ?? {});
        reply(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2).slice(0, 100_000) }] });
      } catch (error) {
        reply(id, { content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true });
      }
    } else if (id !== undefined) {
      replyError(id, `Method not supported: ${method}`, -32601);
    }
  })();
});

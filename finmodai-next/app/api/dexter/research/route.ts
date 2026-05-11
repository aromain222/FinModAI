import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import {
  getIncomeStatements, getCashFlowStatements,
  getKeyMetrics, getFilings, getInsiderTransactions,
} from '@/lib/dexter/client';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 90;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_income_statements',
      description: 'Retrieve annual income statements (revenue, gross profit, net income, EPS).',
      parameters: {
        type: 'object',
        properties: {
          ticker: { type: 'string' },
          limit:  { type: 'number', default: 4 },
        },
        required: ['ticker'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cash_flow',
      description: 'Retrieve cash flow statements (operating cash flow, capex, free cash flow).',
      parameters: {
        type: 'object',
        properties: {
          ticker: { type: 'string' },
          limit:  { type: 'number', default: 4 },
        },
        required: ['ticker'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_key_metrics',
      description: 'Retrieve key financial ratios: P/E, P/B, EV/EBITDA, margins, ROE, debt/equity.',
      parameters: {
        type: 'object',
        properties: {
          ticker: { type: 'string' },
          limit:  { type: 'number', default: 4 },
        },
        required: ['ticker'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_sec_filings',
      description: 'Retrieve recent SEC filings (10-K, 10-Q, 8-K).',
      parameters: {
        type: 'object',
        properties: {
          ticker:    { type: 'string' },
          form_type: { type: 'string', enum: ['10-K', '10-Q', '8-K'] },
          limit:     { type: 'number', default: 5 },
        },
        required: ['ticker'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_insider_trades',
      description: 'Retrieve recent insider transactions — buys, sells, and exercise activity.',
      parameters: {
        type: 'object',
        properties: {
          ticker: { type: 'string' },
          limit:  { type: 'number', default: 10 },
        },
        required: ['ticker'],
      },
    },
  },
];

async function dispatchTool(name: string, args: Record<string, unknown>): Promise<string> {
  const ticker = String(args.ticker ?? '').toUpperCase();
  const limit  = Number(args.limit ?? 4);
  switch (name) {
    case 'get_income_statements':
      return JSON.stringify(await getIncomeStatements(ticker, limit));
    case 'get_cash_flow':
      return JSON.stringify(await getCashFlowStatements(ticker, limit));
    case 'get_key_metrics':
      return JSON.stringify(await getKeyMetrics(ticker, limit));
    case 'get_sec_filings':
      return JSON.stringify(await getFilings(ticker, String(args.form_type ?? ''), limit));
    case 'get_insider_trades':
      return JSON.stringify(await getInsiderTransactions(ticker, limit));
    default:
      return JSON.stringify({ error: `unknown tool ${name}` });
  }
}

const SYSTEM = `You are Dexter, an autonomous financial research assistant inspired by value investing principles (Buffett/Munger). You have access to real financial data tools.

When answering, always:
1. Use your tools to pull actual data before drawing conclusions.
2. Ground every claim in numbers from the data.
3. Be honest about uncertainty — distinguish what the data shows vs. what requires judgment.
4. Keep responses concise but data-rich. Use markdown tables for financial figures.
5. Apply a margin-of-safety lens: focus on downside risks as much as upside.`;

export async function POST(req: NextRequest) {
  const { question, ticker } = await req.json() as { question: string; ticker?: string };

  if (!question) return new Response('question required', { status: 400 });

  const userMsg = ticker
    ? `[Context: analyzing ${ticker}]\n\n${question}`
    : question;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system',  content: SYSTEM },
    { role: 'user',    content: userMsg },
  ];

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (text: string) => controller.enqueue(encoder.encode(text));

      try {
        let iterations = 0;
        while (iterations < 8) {
          iterations++;

          const completion = await openai.chat.completions.create({
            model:    process.env.OPENAI_MODEL ?? 'gpt-4o',
            messages,
            tools:    TOOLS,
            stream:   false,
          });

          const choice = completion.choices[0];
          if (!choice) break;

          messages.push({ role: 'assistant', content: choice.message.content, tool_calls: choice.message.tool_calls });

          if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
            for (const call of choice.message.tool_calls) {
              let args: Record<string, unknown> = {};
              try { args = JSON.parse(call.function.arguments); } catch { /* ignore */ }

              let result: string;
              try {
                result = await dispatchTool(call.function.name, args);
              } catch (err) {
                result = JSON.stringify({ error: err instanceof Error ? err.message : 'tool error' });
              }

              messages.push({ role: 'tool', tool_call_id: call.id, content: result });
            }
            continue; // loop to get next LLM response
          }

          // Final answer — stream it
          const finalText = choice.message.content ?? '';
          if (finalText) {
            const words = finalText.split(/(?<=\s)/);
            for (const word of words) send(word);
          }
          break;
        }
      } catch (err) {
        send(`\n[Error: ${err instanceof Error ? err.message : 'unknown'}]`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

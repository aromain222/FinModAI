import 'server-only';

import { APP_NAME } from '@/lib/branding';
import { getOpenAIKey } from '@/lib/openaiKey';

type LangChainMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type LangChainAgentOptions = {
  message: string;
  messages?: LangChainMessage[];
  contextBlocks?: string[];
  forceLiveFacts?: boolean;
  wantsModelPackage?: boolean;
};

type LangChainRuntime = {
  ChatOpenAI: new (config: Record<string, unknown>) => any;
  DynamicStructuredTool: new (config: Record<string, unknown>) => any;
  AgentExecutor: new (config: Record<string, unknown>) => { invoke: (input: Record<string, unknown>) => Promise<any> };
  createOpenAIToolsAgent: (config: Record<string, unknown>) => Promise<any>;
  ChatPromptTemplate: { fromMessages: (messages: unknown[]) => any };
  MessagesPlaceholder: new (config: Record<string, unknown>) => any;
  z: typeof import('zod');
};

const SYSTEM_PROMPT = `You are ${APP_NAME}, an institutional finance assistant operating through a LangChain agent.
Be concise, numerate, and factual.
Prefer tool-backed context over unsupported claims.
If provided context is insufficient, say so directly.
Output plain text only.`;

async function loadModule(path: string): Promise<any> {
  const loader = new Function('modulePath', 'return import(modulePath);') as (modulePath: string) => Promise<any>;
  return loader(path);
}

async function loadLangChainRuntime(): Promise<LangChainRuntime> {
  try {
    const [{ ChatOpenAI }, { DynamicStructuredTool }, { AgentExecutor, createOpenAIToolsAgent }, { ChatPromptTemplate, MessagesPlaceholder }, { z }] =
      await Promise.all([
        loadModule('@langchain/openai'),
        loadModule('@langchain/core/tools'),
        loadModule('langchain/agents'),
        loadModule('@langchain/core/prompts'),
        loadModule('zod'),
      ]);

    return {
      ChatOpenAI,
      DynamicStructuredTool,
      AgentExecutor,
      createOpenAIToolsAgent,
      ChatPromptTemplate,
      MessagesPlaceholder,
      z,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `LangChain runtime is unavailable. Install langchain, @langchain/core, and @langchain/openai before enabling USE_LANGCHAIN_AGENT. (${message})`
    );
  }
}

function buildConversation(messages: LangChainMessage[] | undefined, fallbackUserMessage: string): string {
  const safeMessages = (messages ?? []).filter((message) => typeof message.content === 'string' && message.content.trim().length > 0);
  const transcript = safeMessages
    .slice(-10)
    .map((message) => `${message.role.toUpperCase()}: ${message.content.trim()}`)
    .join('\n');

  if (transcript) return transcript;
  return `USER: ${fallbackUserMessage}`;
}

export async function runLangChainAgent(options: LangChainAgentOptions): Promise<string> {
  const apiKey = getOpenAIKey('user') || getOpenAIKey('service');
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured.');
  }

  const runtime = await loadLangChainRuntime();
  const { ChatOpenAI, DynamicStructuredTool, AgentExecutor, createOpenAIToolsAgent, ChatPromptTemplate, MessagesPlaceholder, z } = runtime;

  const llm = new ChatOpenAI({
    apiKey,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0,
  });

  const contextBlocks = (options.contextBlocks ?? []).filter((block) => block.trim().length > 0);
  const contextText = contextBlocks.length > 0 ? contextBlocks.join('\n\n') : 'No additional context is available.';

  const contextTool = new DynamicStructuredTool({
    name: 'capitalbase_context',
    description:
      'Returns the current CapitalBase context package, including market snapshot, retrieval context, recent cached headlines, and uploaded memo excerpts.',
    schema: z.object({
      focus: z.string().optional().describe('Optional note describing what context you want to inspect.'),
    }),
    func: async ({ focus }: { focus?: string }) => {
      if (focus && focus.trim()) {
        return `Requested focus: ${focus.trim()}\n\n${contextText}`;
      }
      return contextText;
    },
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', SYSTEM_PROMPT],
    ...(options.forceLiveFacts
      ? [
          [
            'system',
            'When the user asks for latest or current facts, call the capitalbase_context tool before answering and rely on those facts. Do not invent live values.',
          ] as const,
        ]
      : []),
    ...(options.wantsModelPackage
      ? [
          [
            'system',
            'If the user requests a financial model package, keep the answer structured and internally consistent. Do not provide vague commentary.',
          ] as const,
        ]
      : []),
    ['system', 'Use the tool when it will materially improve accuracy.'],
    ['human', '{input}'],
    new MessagesPlaceholder({ variableName: 'agent_scratchpad' }),
  ]);

  const agent = await createOpenAIToolsAgent({
    llm,
    tools: [contextTool],
    prompt,
  });

  const executor = new AgentExecutor({
    agent,
    tools: [contextTool],
    verbose: process.env.NODE_ENV !== 'production',
  });

  const conversation = buildConversation(options.messages, options.message);
  const result = await executor.invoke({
    input: conversation,
  });

  const output =
    typeof result?.output === 'string'
      ? result.output.trim()
      : typeof result?.finalOutput === 'string'
        ? result.finalOutput.trim()
        : '';

  if (!output) {
    throw new Error('LangChain agent returned no output.');
  }

  return output;
}

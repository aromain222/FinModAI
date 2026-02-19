import { z } from 'zod';

export const chatWindowSchema = z.enum(['1d', '3d', '1w', '1m']);
export type ChatWindow = z.infer<typeof chatWindowSchema>;

export const chatIntentSchema = z.enum([
  'company_model',
  'market_live',
  'news_recent',
  'general_finance',
]);
export type ChatIntent = z.infer<typeof chatIntentSchema>;

export const marketSnapshotSchema = z.object({
  asOf: z.string().datetime(),
  spy: z.object({
    price: z.number(),
    changePct: z.number(),
    dayHigh: z.number(),
    dayLow: z.number(),
  }),
  vix: z.object({
    value: z.number(),
    changePct: z.number(),
  }),
  rates: z.object({
    us2y: z.number(),
    us10y: z.number(),
  }),
  fx: z.object({
    dxy: z.number(),
  }),
  commodities: z.object({
    wti: z.number(),
    gold: z.number(),
  }),
  topMovers: z.array(
    z.object({
      ticker: z.string().min(1),
      price: z.number(),
      changePct: z.number(),
    })
  ),
  sectors: z.array(
    z.object({
      name: z.string().min(1),
      changePct: z.number(),
    })
  ),
});
export type MarketSnapshot = z.infer<typeof marketSnapshotSchema>;

export const newsHeadlineSchema = z.object({
  title: z.string().min(1),
  source: z.string().min(1),
  publishedAt: z.string().datetime(),
  url: z.string().url(),
});
export type NewsHeadline = z.infer<typeof newsHeadlineSchema>;

const directionSchema = z.enum(['up', 'down', 'mixed']);

export const macroEventSchema = z.object({
  title: z.string().min(1),
  bias: z.enum(['Risk-On', 'Risk-Off', 'Hawkish', 'Dovish', 'Neutral']),
  confidence: z.enum(['low', 'medium', 'high']),
  oneLine: z.string().min(1),
  whatHappened: z.array(z.string().min(1)).length(2),
  whyItMatters: z.string().min(1),
  impactedAssets: z.array(z.object({ label: z.string().min(1), dir: directionSchema })),
  impactedSectors: z.array(z.object({ label: z.string().min(1), dir: directionSchema })),
  sourceUrls: z.array(z.string().url()),
});
export type MacroEvent = z.infer<typeof macroEventSchema>;

export const companySnapshotSchema = z.object({
  ticker: z.string().min(1),
  company_name: z.string().nullable().optional(),
  sector: z.string().nullable().optional(),
  as_of_date: z.string().nullable().optional(),
  revenue_ltm: z.number().nullable().optional(),
  ebitda_ltm: z.number().nullable().optional(),
  net_income_ltm: z.number().nullable().optional(),
  cash: z.number().nullable().optional(),
  total_debt: z.number().nullable().optional(),
  shares_outstanding: z.number().nullable().optional(),
  share_price: z.number().nullable().optional(),
  market_cap: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  units: z.string().nullable().optional(),
});
export type CompanySnapshot = z.infer<typeof companySnapshotSchema>;

export const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1),
});

export const chatRequestSchema = z
  .object({
    message: z.string().min(1).optional(),
    messages: z.array(chatMessageSchema).optional(),
    window: chatWindowSchema.optional(),
  })
  .refine((value) => Boolean(value.message) || Boolean(value.messages?.length), {
    message: 'Provide `message` or `messages`.',
  });
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatTableSchema = z.object({
  title: z.string().min(1),
  columns: z.array(z.string().min(1)).min(1),
  rows: z.array(z.array(z.union([z.string(), z.number()]))),
});

export const chatSourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  source: z.string().min(1),
});

export const chatModelOutputSchema = z.object({
  answer: z.string().min(1),
  bullets: z.array(z.string().min(1)).min(3).max(7),
  tables: z.array(chatTableSchema).optional(),
  sources: z.array(chatSourceSchema).optional(),
});
export type ChatModelOutput = z.infer<typeof chatModelOutputSchema>;

export const chatModelJsonSchema = {
  name: 'capitalbase_chat_output',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      answer: { type: 'string' },
      bullets: {
        type: 'array',
        minItems: 3,
        maxItems: 7,
        items: { type: 'string' },
      },
      tables: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            columns: { type: 'array', minItems: 1, items: { type: 'string' } },
            rows: {
              type: 'array',
              items: {
                type: 'array',
                items: { anyOf: [{ type: 'string' }, { type: 'number' }] },
              },
            },
          },
          required: ['title', 'columns', 'rows'],
        },
      },
      sources: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            url: { type: 'string' },
            source: { type: 'string' },
          },
          required: ['title', 'url', 'source'],
        },
      },
    },
    required: ['answer', 'bullets'],
  },
} as const;


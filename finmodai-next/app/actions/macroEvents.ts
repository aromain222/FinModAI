'use server';

import { z } from 'zod';
import { NewsItemSchema } from '@/lib/schemas/news';
import { transformNewsToEvents } from '@/lib/macro/events/transform';

const InputSchema = z.object({
  items: z.array(NewsItemSchema),
  marketData: z
    .object({
      changePct: z.number().nullable().optional(),
      points: z.array(z.object({ t: z.string(), close: z.number() })).optional(),
    })
    .optional(),
});

export async function transformMacroEventsAction(input: unknown) {
  const parsed = InputSchema.parse(input);
  return await transformNewsToEvents(parsed.items, parsed.marketData);
}


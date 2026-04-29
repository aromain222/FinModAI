# ShopAI MVP

ShopAI is a responsive Next.js MVP for an AI-powered shopping assistant. Users can describe what they want in natural language, get ranked recommendations with short reasoning, refine results conversationally, and save products to revisit later.

## What is included

- Next.js App Router project structure
- Natural-language search flow backed by `/api/search`
- Deterministic query parsing and ranking layer for demo use
- Responsive homepage, results workspace, product page, and saved page
- Seeded product catalog with images, pricing, ratings, and retailer links
- Supabase/Postgres schema and seed SQL for the core data model

## MVP architecture

1. The homepage captures a natural-language shopping request.
2. The results page posts the query plus conversation history to `/api/search`.
3. The API route parses the prompt into structured attributes in [`lib/shopping/parser.ts`](/Users/averyromain/FinModAI/shopai-mvp/lib/shopping/parser.ts).
4. The retrieval/ranking engine scores catalog items in [`lib/shopping/ranker.ts`](/Users/averyromain/FinModAI/shopai-mvp/lib/shopping/ranker.ts).
5. The UI renders recommendation cards with explanations, filter controls, and saved-item actions.
6. Saved items are exposed through `/api/saved` for the MVP, with the production table design in [`supabase/schema.sql`](/Users/averyromain/FinModAI/shopai-mvp/supabase/schema.sql).

## Run locally

```bash
cd /Users/averyromain/FinModAI/shopai-mvp
npm install
npm run dev
```

## Key files

- [`app/page.tsx`](/Users/averyromain/FinModAI/shopai-mvp/app/page.tsx): marketing-style homepage with the main AI search bar
- [`app/results/page.tsx`](/Users/averyromain/FinModAI/shopai-mvp/app/results/page.tsx): main conversational shopping workspace
- [`app/api/search/route.ts`](/Users/averyromain/FinModAI/shopai-mvp/app/api/search/route.ts): query understanding + ranking API
- [`app/product/[id]/page.tsx`](/Users/averyromain/FinModAI/shopai-mvp/app/product/[id]/page.tsx): product detail page with similar items
- [`app/saved/page.tsx`](/Users/averyromain/FinModAI/shopai-mvp/app/saved/page.tsx): saved shortlist view
- [`lib/data/products.ts`](/Users/averyromain/FinModAI/shopai-mvp/lib/data/products.ts): example product dataset

## Notes on AI integration

The current MVP uses a deterministic parser and scorer so it works without external credentials. The prompt template for swapping in OpenAI or Gemini later is stored in [`lib/ai/prompts.ts`](/Users/averyromain/FinModAI/shopai-mvp/lib/ai/prompts.ts), and the ranking entry point is isolated in [`lib/shopping/engine.ts`](/Users/averyromain/FinModAI/shopai-mvp/lib/shopping/engine.ts).

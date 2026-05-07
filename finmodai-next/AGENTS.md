# AGENTS.md — CapitalBase / FinModAI

## Product Direction

CapitalBase is being redesigned from a heavy financial modeling app into a ranked stock opportunity + Analyst Chat system.

Core loop:

Rank → Click → Understand → Ask → Pitch

The product should help users find, evaluate, challenge, and pitch 1–3 month stock ideas. Do not rebuild CapitalBase as a traditional financial modeling platform.

## What to Build Toward

Primary experience:
- Ranked stock board
- Opportunity Score
- Green / Yellow / Red signal
- 1–3 month horizon
- Analyst Chat as the main interface
- Dynamic assumption updates
- Pitch generation
- Pitch Queue / voting workflow

The user should be able to see ranked stocks, click one, understand why it is ranked there, ask questions in Analyst Chat, make assumptions that update the score, generate a pitch, and add it to Pitch Queue.

## What to Keep

Keep and repurpose:
- TimesFM forecasting as Forecast Signal
- Event/news system as Catalyst/Event Signal
- DCF and reverse DCF as compressed Valuation Signal
- Analyst Chat as the central interface
- Existing shared utilities if still useful

DCF/reverse DCF should answer: “Is this stock mispriced relative to expectations?”

Only expose implied upside/downside %, market-implied growth, and a one-line valuation takeaway. Do not expose full DCF builders, assumption tables, or large valuation screens.

## What to Remove or Avoid

Avoid full 3-statement modeling UI, full DCF workflows, large valuation tables, dense dashboards, generic ChatGPT-style stock summaries, tabs/panels that do not support the core loop, and features unrelated to ranking, chat, assumptions, or pitch.

Do not delete shared logic unless it is clearly unused and safe to remove.

## Opportunity Score

Opportunity Score should be based on:
- Forecast Signal
- Catalyst/Event Strength
- Momentum
- Earnings Setup
- Valuation Signal
- Risk Adjustment

Each factor should be scored 0–10. Scores should vary meaningfully. Do not default everything to 5.0.

Every ranked stock should have ticker, score, signal, horizon, primary reason, main risk, and factor breakdown.

## Analyst Chat Behavior

Analyst Chat should be concise, decision-oriented, and grounded in the selected stock context.

It should support:
- Explain ranking
- Evaluate buy / wait / avoid
- Challenge assumptions
- Compare stocks
- Generate pitch
- Update score based on assumptions

Always anchor answers in the 1–3 month horizon, catalyst, expected movement, risk, and valuation context when useful. Avoid generic explanations.

## Assumption Updates

When a user makes an assumption, the system should parse the assumption, identify affected factors, evaluate plausibility, apply score impact with scaling, update adjusted score and factor breakdown, and explain what changed.

Plausibility scaling:
- High = 100%
- Medium = 70%
- Low = 30%
- Extreme = 10%

Push back on unrealistic assumptions, but still update the score with an appropriate discount.

Example:
“Adjusted Score: 7.4 → 8.1. Plausibility: Medium. Earnings and catalyst strength improved, but the thesis still depends on guidance.”

## Pitch Format

Pitch output should be short and presentation-ready:

```text
TICKER — Weekly Pitch
Signal:
Confidence:
Why Now:
Market Miss:
Key Catalyst:
Risk:
Trade:
Trigger:
```

No fluff. Max 8–10 lines.

## UI Principles

The app should feel alive, reactive, clean, pitch-driven, and fund-ready.

Prioritize score movement, factor changes, clear trade snapshots, suggested chat prompts, and Pitch Queue.

Avoid static dashboard feel, clutter, heavy modeling screens, and long text blocks.

## Technical Stack

- Next.js 14 App Router
- TypeScript strict
- Tailwind CSS
- Supabase where already used
- Vercel deployment

Use existing patterns before introducing new ones.

## Commands

Use these when validating:

```bash
npm run build
npm run lint
npx tsc --noEmit
npm run test:investment-analysis
npx tsx --test lib/assumptions/engine.test.ts
```

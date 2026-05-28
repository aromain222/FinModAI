/**
 * Eval harness — tests the intent-parsing and validation contract for
 * representative user prompts. These run on every PR without live API calls.
 *
 * Each fixture has:
 *   prompt     — the raw user message
 *   expect     — assertions against parseUserIntent() output
 *
 * Full pipeline evals (positions, tickers, beta) require API keys and are
 * intentionally out of scope for this pure-function harness.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { parseUserIntent } from '@/lib/execution/userIntent';

// ── Fixture type ──────────────────────────────────────────────────────────────

type Fixture = {
  id:     string;
  prompt: string;
  expect: {
    position_count?:      number | null;
    themes_include?:      string[];
    risk_profile?:        'aggressive' | 'balanced' | 'conservative';
    capital_usd?:         number | null;
    asset_class?:         'common_stock' | 'any';
  };
};

const FIXTURES: Fixture[] = [
  {
    id:     'aggressive-ai-space',
    prompt: 'make a 15 stock portfolio with aggressive ai and space stocks',
    expect: {
      position_count: 15,
      themes_include: ['ai', 'space'],
      risk_profile:   'aggressive',
    },
  },
  {
    id:     'dividend-retirement',
    prompt: '5 dividend stocks for retirement',
    expect: {
      position_count: 5,
      risk_profile:   'conservative',
    },
  },
  {
    id:     'biotech-moonshots',
    prompt: 'best biotech moonshots, 10 names, $100k',
    expect: {
      position_count: 10,
      capital_usd:    100_000,
      themes_include: ['biotech'],
    },
  },
  {
    id:     'etf-diversification',
    prompt: "I'd like some etfs for diversified exposure",
    expect: {
      asset_class: 'any',
    },
  },
  {
    id:     'balanced-default',
    prompt: 'build me a diversified 8 stock portfolio',
    expect: {
      position_count: 8,
      risk_profile:   'balanced',
    },
  },
  {
    id:     'semis-aggressive',
    prompt: '10 aggressive semiconductor picks, $50k',
    expect: {
      position_count: 10,
      risk_profile:   'aggressive',
      capital_usd:    50_000,
      themes_include: ['semis'],
    },
  },
  {
    id:     'conservative-no-count',
    prompt: 'conservative healthcare portfolio',
    expect: {
      risk_profile:   'conservative',
      themes_include: ['healthcare'],
    },
  },
  {
    id:     'capital-1m',
    prompt: 'deploy $1m into tech growth stocks, 12 positions',
    expect: {
      position_count: 12,
      capital_usd:    1_000_000,
      themes_include: ['tech'],
    },
  },
];

// ── Run fixtures ──────────────────────────────────────────────────────────────

for (const fixture of FIXTURES) {
  test(`eval[${fixture.id}]: "${fixture.prompt}"`, () => {
    const intent = parseUserIntent(fixture.prompt);
    const e = fixture.expect;

    if (e.position_count !== undefined) {
      assert.equal(
        intent.position_count, e.position_count,
        `position_count: expected ${e.position_count}, got ${intent.position_count}`,
      );
    }

    if (e.themes_include) {
      for (const theme of e.themes_include) {
        assert.ok(
          intent.themes.includes(theme),
          `Expected theme "${theme}" in [${intent.themes.join(', ')}]`,
        );
      }
    }

    if (e.risk_profile !== undefined) {
      assert.equal(
        intent.risk_profile, e.risk_profile,
        `risk_profile: expected ${e.risk_profile}, got ${intent.risk_profile}`,
      );
    }

    if (e.capital_usd !== undefined) {
      assert.equal(
        intent.capital_usd, e.capital_usd,
        `capital_usd: expected ${e.capital_usd}, got ${intent.capital_usd}`,
      );
    }

    if (e.asset_class !== undefined) {
      assert.equal(
        intent.asset_class, e.asset_class,
        `asset_class: expected ${e.asset_class}, got ${intent.asset_class}`,
      );
    }
  });
}

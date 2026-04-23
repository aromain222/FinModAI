import * as cheerio from 'cheerio';

import { fetchJsonWithRetry, sleep } from '@/lib/data/providers/shared';
import { serverEnv } from '@/lib/env/server';
import type {
  StrictPipelineArtifactBundle,
  StrictPipelineFailure,
  StrictSourceDiscoveryPlan,
  StrictSourceArtifact,
} from '@/lib/data/financial-extraction/strict/types';

function nowIso(): string {
  return new Date().toISOString();
}

function secHeaders(): HeadersInit {
  return {
    'User-Agent': serverEnv.SEC_UA_EMAIL || 'capitalbase/unknown',
    Accept: 'application/json,text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  };
}

async function fetchTextWithRetry(
  url: string,
  headers?: HeadersInit,
  maxRetries = 2,
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const response = await fetch(url, { headers });
      if ((response.status === 429 || response.status === 503) && attempt < maxRetries) {
        await sleep(500 * Math.pow(2, attempt));
        attempt += 1;
        continue;
      }
      if (!response.ok) {
        return { ok: false, reason: `HTTP ${response.status} for ${url}` };
      }
      return { ok: true, text: await response.text() };
    } catch (error) {
      if (attempt < maxRetries) {
        await sleep(500 * Math.pow(2, attempt));
        attempt += 1;
        continue;
      }
      return {
        ok: false,
        reason: error instanceof Error ? error.message : `Failed to fetch ${url}`,
      };
    }
  }

  return { ok: false, reason: `Rate limited while fetching ${url}` };
}

async function fetchRobotsStatus(
  targetUrl: string,
): Promise<{ robotsUrl: string | null; allowed: boolean | null }> {
  try {
    const origin = new URL(targetUrl).origin;
    const robotsUrl = `${origin}/robots.txt`;
    const robots = await fetchTextWithRetry(robotsUrl, undefined, 1);
    if (!robots.ok) {
      return { robotsUrl, allowed: null };
    }
    const text = robots.text.toLowerCase();
    const blockedAll = /user-agent:\s*\*\s*disallow:\s*\/\s*/i.test(text);
    return { robotsUrl, allowed: !blockedAll };
  } catch {
    return { robotsUrl: null, allowed: null };
  }
}

function discoverTermsUrl(html: string, sourceUrl: string): string | null {
  try {
    const $ = cheerio.load(html);
    const hrefs = $('a[href]')
      .map((_, anchor) => {
        const text = $(anchor).text().replace(/\s+/g, ' ').trim().toLowerCase();
        if (!/\bterms\b|\bterms of use\b|\bterms & conditions\b|\blegal\b|\bprivacy\b/i.test(text)) {
          return null;
        }
        try {
          return new URL(String($(anchor).attr('href') ?? ''), sourceUrl).toString();
        } catch {
          return null;
        }
      })
      .get()
      .find(Boolean);
    return hrefs ?? null;
  } catch {
    return null;
  }
}

function buildArtifact(params: {
  artifact: StrictSourceArtifact;
  raw: unknown;
}): StrictPipelineArtifactBundle {
  return {
    artifact: params.artifact,
    raw: params.raw,
  };
}

export const strictSourceFetchExecutorDeps = {
  fetchJsonWithRetry,
  fetchTextWithRetry,
  fetchRobotsStatus,
};

export async function executeSourceFetchPlan(params: {
  plan: StrictSourceDiscoveryPlan;
}):
  Promise<
    | { ok: true; artifacts: StrictPipelineArtifactBundle[] }
    | { ok: false; failure: StrictPipelineFailure }
  > {
  const artifacts: StrictPipelineArtifactBundle[] = [];

  for (const source of params.plan.chosen_sources) {
    const fetchedAt = nowIso();

    if (source.provider === 'sec_edgar' && source.source_url.endsWith('.json')) {
      const result = await strictSourceFetchExecutorDeps.fetchJsonWithRetry({
        provider: 'sec_edgar',
        url: source.source_url,
        cacheKey: `strict_web_fetch:${source.source_id}`,
        ttlMs: 15 * 60 * 1000,
        options: { headers: secHeaders() },
      });
      if (!result.ok) continue;
      artifacts.push(
        buildArtifact({
          artifact: {
            source_id: source.source_id,
            provider: 'sec_edgar',
            artifact_type: 'api_response',
            source_url: source.source_url,
            fetched_at: fetchedAt,
            as_of_date: null,
            period_type: params.plan.requested_period,
            robots_url: null,
            robots_allowed: null,
            terms_url: null,
          },
          raw: result.data,
        }),
      );
      continue;
    }

    let robotsUrl: string | null = null;
    let robotsAllowed: boolean | null = null;
    if (source.requires_robots_check) {
      const robots = await strictSourceFetchExecutorDeps.fetchRobotsStatus(source.source_url);
      robotsUrl = robots.robotsUrl;
      robotsAllowed = robots.allowed;
      if (robots.allowed === false) {
        continue;
      }
    }

    const html = await strictSourceFetchExecutorDeps.fetchTextWithRetry(
      source.source_url,
      source.provider === 'sec_edgar' ? secHeaders() : undefined,
    );
    if (!html.ok) continue;

    artifacts.push(
      buildArtifact({
        artifact: {
          source_id: source.source_id,
          provider: source.provider,
          artifact_type: source.provider === 'sec_edgar' ? 'filing' : 'html_page',
          source_url: source.source_url,
          fetched_at: fetchedAt,
          as_of_date: null,
          period_type: params.plan.requested_period,
          robots_url: robotsUrl,
          robots_allowed: robotsAllowed,
          terms_url: source.provider === 'company_ir' ? discoverTermsUrl(html.text, source.source_url) : null,
        },
        raw: html.text,
      }),
    );
  }

  if (!artifacts.length) {
    return {
      ok: false,
      failure: {
        status: 'FAILURE',
        step: 'SOURCE_FETCHER',
        reason: 'No usable official-source artifacts were fetched from the discovery plan.',
        missing_fields: ['revenue', 'ebitda', 'net_income', 'free_cash_flow', 'debt', 'cash'],
        conflicts: [],
      },
    };
  }

  return { ok: true, artifacts };
}

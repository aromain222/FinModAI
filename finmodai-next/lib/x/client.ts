/**
 * Minimal READ-ONLY X (Twitter) API v2 client — used to browse X for financial
 * content (ticker chatter, positioning texture), never to post. Search uses an
 * app-only bearer token derived from the consumer keys; the OAuth 1.0a signer
 * (node:crypto HMAC-SHA1, no SDK) exists only for the credential check.
 *
 *   X_CONSUMER_KEY / X_CONSUMER_SECRET        — app credentials (search)
 *   X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET    — user credentials (auth check only)
 */

import crypto from 'node:crypto';

type XCredentials = {
  consumerKey:       string;
  consumerSecret:    string;
  accessToken:       string;
  accessTokenSecret: string;
};

export function getXCredentials(): XCredentials | null {
  const consumerKey       = process.env.X_CONSUMER_KEY?.trim();
  const consumerSecret    = process.env.X_CONSUMER_SECRET?.trim();
  const accessToken       = process.env.X_ACCESS_TOKEN?.trim();
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET?.trim();
  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) return null;
  return { consumerKey, consumerSecret, accessToken, accessTokenSecret };
}

/** What is missing, for actionable error messages without leaking values. */
export function missingXCredentials(): string[] {
  return ['X_CONSUMER_KEY', 'X_CONSUMER_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET']
    .filter(name => !process.env[name]?.trim());
}

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * OAuth 1.0a Authorization header. JSON request bodies are NOT part of the
 * signature base string — only the oauth_* params (plus query params, which
 * the tweets endpoint does not use here).
 */
function oauthHeader(credentials: XCredentials, method: 'POST' | 'GET', url: string): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key:     credentials.consumerKey,
    oauth_nonce:            crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        String(Math.floor(Date.now() / 1000)),
    oauth_token:            credentials.accessToken,
    oauth_version:          '1.0',
  };
  const paramString = Object.keys(oauthParams)
    .sort()
    .map(key => `${rfc3986(key)}=${rfc3986(oauthParams[key])}`)
    .join('&');
  const baseString = [method, rfc3986(url), rfc3986(paramString)].join('&');
  const signingKey = `${rfc3986(credentials.consumerSecret)}&${rfc3986(credentials.accessTokenSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
  const header: Record<string, string> = { ...oauthParams, oauth_signature: signature };
  return `OAuth ${Object.keys(header)
    .sort()
    .map(key => `${rfc3986(key)}="${rfc3986(header[key])}"`)
    .join(', ')}`;
}

export type RecentTweet = {
  id:        string;
  text:      string;
  createdAt: string | null;
  author:    string | null;
  likes:     number;
  reposts:   number;
  replies:   number;
};

// App-only bearer token derived from consumer key/secret — the right auth for
// read/search endpoints. Cached per lambda instance; X does not expire these
// unless regenerated, so a simple module cache is safe.
let bearerCache: string | null = null;

async function getAppBearerToken(): Promise<string | null> {
  if (bearerCache) return bearerCache;
  const consumerKey = process.env.X_CONSUMER_KEY?.trim();
  const consumerSecret = process.env.X_CONSUMER_SECRET?.trim();
  if (!consumerKey || !consumerSecret) return null;
  try {
    const basic = Buffer.from(`${rfc3986(consumerKey)}:${rfc3986(consumerSecret)}`).toString('base64');
    const res = await fetch('https://api.x.com/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token?: string };
    bearerCache = data.access_token ?? null;
    return bearerCache;
  } catch {
    return null;
  }
}

/** Recent-search (last 7 days). Throws with status context so callers can degrade. */
export async function searchRecentTweets(query: string, maxResults = 25): Promise<RecentTweet[]> {
  const bearer = await getAppBearerToken();
  if (!bearer) throw new Error('X bearer token unavailable — check X_CONSUMER_KEY/X_CONSUMER_SECRET');
  const params = new URLSearchParams({
    query,
    max_results: String(Math.min(100, Math.max(10, maxResults))),
    'tweet.fields': 'created_at,public_metrics,author_id',
    expansions: 'author_id',
    'user.fields': 'username',
  });
  const res = await fetch(`https://api.x.com/2/tweets/search/recent?${params}`, {
    headers: { Authorization: `Bearer ${bearer}` },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`X search ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const payload = await res.json() as {
    data?: Array<{ id: string; text: string; created_at?: string; author_id?: string; public_metrics?: { like_count?: number; retweet_count?: number; reply_count?: number } }>;
    includes?: { users?: Array<{ id: string; username: string }> };
  };
  const usernames = new Map((payload.includes?.users ?? []).map(user => [user.id, user.username]));
  return (payload.data ?? []).map(tweet => ({
    id: tweet.id,
    text: tweet.text,
    createdAt: tweet.created_at ?? null,
    author: tweet.author_id ? usernames.get(tweet.author_id) ?? null : null,
    likes: tweet.public_metrics?.like_count ?? 0,
    reposts: tweet.public_metrics?.retweet_count ?? 0,
    replies: tweet.public_metrics?.reply_count ?? 0,
  }));
}

/** Read-only auth check: resolves the authenticated account without posting. */
export async function verifyXCredentials(): Promise<{ id: string; username: string }> {
  const credentials = getXCredentials();
  if (!credentials) {
    throw new Error(`X credentials incomplete — missing: ${missingXCredentials().join(', ')}`);
  }
  const url = 'https://api.x.com/2/users/me';
  const res = await fetch(url, {
    headers: { Authorization: oauthHeader(credentials, 'GET', url) },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`X auth check failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json() as { data?: { id?: string; username?: string } };
  if (!data.data?.id || !data.data.username) throw new Error('X auth check returned no user');
  return { id: data.data.id, username: data.data.username };
}

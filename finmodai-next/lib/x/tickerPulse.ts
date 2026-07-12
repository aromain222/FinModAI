/**
 * Pulls a per-ticker social pulse from X recent search: post volume, engagement,
 * and the highest-engagement posts. Feeds the ResearchPacket as positioning
 * texture — unverified crowd opinion, never treated as factual evidence.
 * Strictly best-effort: returns null on any failure (no search entitlement,
 * rate limit, network) and the packet marks the evidence missing.
 */

import { searchRecentTweets, type RecentTweet } from '@/lib/x/client';

export type XSocialPost = {
  text:      string;
  author:    string | null;
  likes:     number;
  reposts:   number;
  createdAt: string | null;
};

export type XSocialPulse = {
  source:          'x_recent_search';
  query:           string;
  observedAt:      string;
  postCount:       number;
  spamFiltered:    number;
  totalEngagement: number;
  topPosts:        XSocialPost[];
};

// Cashtag searches are saturated with pump-promo bots ("his picks are fire",
// "join my telegram"). These never carry positioning signal — drop them before
// engagement ranking so bot amplification can't crowd out real chatter.
const SPAM_PATTERNS = [
  /\b(his|her|their) (picks|calls|signals|trades) (are|is)\b/i,
  /\bcheck (him|her|them) out\b/i,
  /\b(join|dm) (me|my|our|the)\b/i,
  /\b(telegram|whatsapp) (group|channel)\b/i,
  /\bstacking wins\b/i,
  /\bserious (cash|money|gains)\b/i,
  /\bguaranteed (returns|profits)\b/i,
  /\bfollow @\w+\b/i,
  /\b(trade|stock) ideas? from (him|her|them)\b/i,
  /\bblew my expectations\b/i,
];

function isSpam(text: string): boolean {
  return SPAM_PATTERNS.some(pattern => pattern.test(text));
}

function toPulse(query: string, tweets: RecentTweet[]): XSocialPulse {
  const engagement = (tweet: RecentTweet) => tweet.likes + tweet.reposts * 2 + tweet.replies;
  // Collapse near-duplicate copypasta (bot fleets post the same text with emoji variants).
  const seen = new Set<string>();
  const kept = tweets.filter(tweet => {
    if (tweet.text.length < 30 || isSpam(tweet.text)) return false;
    const key = tweet.text.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const topPosts = [...kept]
    .sort((a, b) => engagement(b) - engagement(a))
    .slice(0, 3)
    .map(tweet => ({
      text: tweet.text.replace(/\s+/g, ' ').slice(0, 240),
      author: tweet.author,
      likes: tweet.likes,
      reposts: tweet.reposts,
      createdAt: tweet.createdAt,
    }));
  return {
    source: 'x_recent_search',
    query,
    observedAt: new Date().toISOString(),
    postCount: kept.length,
    spamFiltered: tweets.length - kept.length,
    totalEngagement: kept.reduce((sum, tweet) => sum + engagement(tweet), 0),
    topPosts,
  };
}

export async function fetchXTickerPulse(ticker: string): Promise<XSocialPulse | null> {
  const symbol = ticker.trim().toUpperCase();
  if (!symbol) return null;
  // Cashtag operator is the precise query but needs elevated access on some
  // tiers — fall back to a plain keyword query if X rejects it.
  const cashtagQuery = `$${symbol} -is:retweet lang:en`;
  const keywordQuery = `"${symbol}" stock -is:retweet lang:en`;
  try {
    return toPulse(cashtagQuery, await searchRecentTweets(cashtagQuery, 25));
  } catch (primaryError) {
    const message = primaryError instanceof Error ? primaryError.message : '';
    // 400 = operator not permitted on this tier; anything else (401/402/403/429) means
    // search itself is unavailable right now — degrade to null either way after one retry.
    if (!message.includes('X search 400')) return null;
    try {
      return toPulse(keywordQuery, await searchRecentTweets(keywordQuery, 25));
    } catch {
      return null;
    }
  }
}

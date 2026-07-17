/**
 * rateLimit.ts
 * Per-IP rate limiting for the endpoints that do real work per request
 * (sponsor lookups, AI text simplification) — relevant once this app has
 * public, unpredictable traffic rather than just its own testing.
 *
 * Backed by the same Upstash Redis instance as cache.ts, so limits are
 * enforced consistently across all serverless function instances. Falls
 * back to allowing all requests when Redis isn't configured (local dev),
 * matching the fallback pattern already used elsewhere in this codebase.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { getRedisClient } from './cache.js';

const redis = getRedisClient();

// 20 requests per minute per IP is generous for a human using the search
// UI, but bounds the cost/abuse surface of endpoints that call a paid AI
// API or do CSV/register lookups per request.
const defaultLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, '60 s'),
      prefix: 'ratelimit',
    })
  : null;

// Looser limit for interactive browsing (pill clicks, debounced typing,
// "Load more") that can legitimately fire more requests per minute than a
// one-shot lookup, without doing any AI or per-company external calls.
const browseLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, '60 s'),
      prefix: 'ratelimit-browse',
    })
  : null;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export async function checkRateLimit(key: string, preset: 'default' | 'browse' = 'default'): Promise<RateLimitResult> {
  const limiter = preset === 'browse' ? browseLimiter : defaultLimiter;
  if (!limiter) return { allowed: true, remaining: Infinity };
  const { success, remaining } = await limiter.limit(key);
  return { allowed: success, remaining };
}

// Vercel sets x-forwarded-for on every request; local/non-Vercel hosting
// falls back to a constant key (single-process rate limiting isn't the
// point of local dev anyway).
export function clientKey(req: { headers: Record<string, string | string[] | undefined> }): string {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return ip?.split(',')[0].trim() || 'local';
}

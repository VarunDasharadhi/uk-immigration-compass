import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'crypto';
import { refreshIndustryMap } from '../../services/industryMapRefresh.js';

if (!process.env.CRON_SECRET) {
  console.warn('[Cron] CRON_SECRET is not set — /api/cron/industry-map will reject all requests until it is configured.');
}

// Same constant-time check as /api/cron/refresh; fails closed.
function isAuthorized(header: string | undefined, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Monthly industry-map refresh. Scheduled daily (Vercel Hobby allows daily
 * crons only) but the refresh itself self-throttles: it no-ops unless the
 * stored map is older than 28 days, so the actual Companies House bulk
 * download happens roughly once a month.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req.headers.authorization, process.env.CRON_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const result = await refreshIndustryMap();
    console.log('[/api/cron/industry-map]', result);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('[/api/cron/industry-map]', err);
    // Non-fatal: the committed data/sponsor-industry-map.json remains in effect.
    return res.status(500).json({ error: 'Industry map refresh failed; the previous map remains in effect.' });
  }
}

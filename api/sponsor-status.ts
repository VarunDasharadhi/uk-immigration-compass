import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as aiService from '../services/aiService.js';
import { checkRateLimit, clientKey } from '../services/rateLimit.js';

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const companyName = String(req.query.companyName || '').trim();
  if (!companyName) {
    return res.status(400).json({ error: 'companyName query param is required' });
  }
  const { allowed } = await checkRateLimit(`sponsor-status:${clientKey(req)}`);
  if (!allowed) {
    return res.status(429).json({ error: 'Too many requests. Please try again in a minute.' });
  }
  try {
    // Register/revoked-index are in-memory only and this function runs
    // isolated from the cron job that normally populates them — load them
    // into this instance first if they aren't here yet.
    await aiService.ensureSponsorDataLoaded();
    const data = await aiService.checkSponsor(companyName);
    // Cache per-company results. Was s-maxage=3600, the only endpoint left on
    // an hourly edge TTL: the revalidation blocked instead of serving stale, so
    // the first visitor after every hour paid the full register download (8.5s
    // measured in production). The register only refreshes nightly, so an
    // answer cannot be fresher than a day regardless; this now matches every
    // other read endpoint.
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json(data);
  } catch (err) {
    console.error('[/api/sponsor-status]', err);
    res.status(500).json({ error: 'Something went wrong checking sponsor status.' });
  }
}

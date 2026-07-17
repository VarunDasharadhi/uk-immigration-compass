import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as aiService from '../services/aiService.js';
import { queryDirectory, isValidIndustryId } from '../services/sponsorDirectory.js';
import { checkRateLimit, clientKey } from '../services/rateLimit.js';

export const config = { maxDuration: 60 };

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 24;
const MAX_QUERY_LENGTH = 100;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const industry = String(req.query.industry || 'all').trim();
  if (!isValidIndustryId(industry)) {
    return res.status(400).json({ error: 'Invalid industry parameter.' });
  }

  const route = req.query.route ? String(req.query.route).trim() : 'all';
  const q = String(req.query.q || '').trim().slice(0, MAX_QUERY_LENGTH);

  const page = parseInt(String(req.query.page || '1'), 10);
  if (!Number.isFinite(page) || page < 1) {
    return res.status(400).json({ error: 'Invalid page parameter.' });
  }

  const rawPageSize = parseInt(String(req.query.pageSize || String(DEFAULT_PAGE_SIZE)), 10);
  if (!Number.isFinite(rawPageSize) || rawPageSize < 1) {
    return res.status(400).json({ error: 'Invalid pageSize parameter.' });
  }
  const pageSize = Math.min(rawPageSize, MAX_PAGE_SIZE);

  let allowed = true;
  try {
    ({ allowed } = await checkRateLimit(`sponsor-directory:${clientKey(req)}`, 'browse'));
  } catch (err) {
    // Rate limiter itself failing (e.g. Redis outage) must not block
    // browsing — fail open, same pattern as /api/company-lookup.
    console.error('[/api/sponsor-directory] rate limit check failed, failing open', err);
  }
  if (!allowed) {
    return res.status(429).json({ error: 'Too many requests. Please try again in a minute.' });
  }

  try {
    await aiService.ensureSponsorDataLoaded();
    const data = queryDirectory({ industry, route, q, page, pageSize });
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json(data);
  } catch (err) {
    console.error('[/api/sponsor-directory]', err);
    res.status(500).json({ error: 'Something went wrong loading the sponsor directory.' });
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as companiesHouse from '../services/companiesHouse.js';
import { checkRateLimit, clientKey } from '../services/rateLimit.js';

export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const companyName = String(req.query.companyName || '').trim();
  if (!companyName) {
    return res.status(400).json({ error: 'companyName query param is required' });
  }
  let allowed = true;
  try {
    ({ allowed } = await checkRateLimit(`company-lookup:${clientKey(req)}`));
  } catch (err) {
    // Rate limiter itself failing (e.g. Redis outage) must not turn this
    // best-effort enrichment endpoint into a hard error — fail open.
    console.error('[/api/company-lookup] rate limit check failed, failing open', err);
  }
  if (!allowed) {
    return res.status(429).json({ error: 'Too many requests. Please try again in a minute.' });
  }
  try {
    const data = await companiesHouse.lookupCompany(companyName);
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json(data);
  } catch (err) {
    console.error('[/api/company-lookup]', err);
    // Best-effort enrichment — degrade to the no-match shape, never a 500.
    res.status(200).json({ companiesHouseUrl: null, natureOfBusiness: null });
  }
}

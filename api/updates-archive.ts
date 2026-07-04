import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as aiService from '../services/aiService.js';

// Reads a pre-built cache entry; no live AI call, so no timeout concerns.
export const config = { maxDuration: 30 };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const items = await aiService.getUpdatesArchive();
    // CDN caches for 24h; serves stale while revalidating for 7d — matches
    // /api/updates, since both are refreshed by the same nightly cron.
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json({ items });
  } catch (err) {
    console.error('[/api/updates-archive]', err);
    res.status(500).json({ error: 'Something went wrong fetching the update archive.' });
  }
}

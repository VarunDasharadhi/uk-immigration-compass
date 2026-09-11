import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'crypto';
import { refreshUpdates, backfillThinCategories, refreshPetitions, refreshSponsorNews, refreshSponsorRegister, refreshAllHistoryBuckets } from '../../services/aiService.js';
import { sendDigestIfDue } from '../../services/alerts.js';

if (!process.env.CRON_SECRET) {
  console.warn('[Cron] CRON_SECRET is not set — /api/cron/refresh will reject all requests until it is configured.');
}

// Constant-time comparison so response timing can't be used to guess the
// secret byte-by-byte; also fails closed (missing/misconfigured secret means
// deny, not skip the check).
function isAuthorized(header: string | undefined, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req.headers['authorization'], process.env.CRON_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // backfillThinCategories reads the archive that refreshUpdates just
    // wrote, so it must run after — everything else is independent.
    await refreshUpdates();
    await Promise.all([backfillThinCategories(), refreshPetitions(), refreshSponsorNews(), refreshSponsorRegister(), refreshAllHistoryBuckets()]);
    // Digest last so it sees the feeds this run just refreshed. A digest
    // failure must not fail the whole cron, so it is caught here.
    const digest = await sendDigestIfDue().catch(err => {
      console.error('[Cron] Email digest failed:', err);
      return null;
    });
    res.json({ ok: true, ts: new Date().toISOString(), digest });
  } catch (err) {
    console.error('[Cron] Refresh failed:', err);
    res.status(500).json({ error: 'Refresh failed', detail: String(err) });
  }
}

/**
 * Maps Companies House SIC codes (e.g. "62020") to their official
 * description (e.g. "Information technology consultancy activities"),
 * fetched once from Companies House's own published condensed SIC 2007
 * list and cached indefinitely — this is a static reference table, not
 * live data, so there's no meaningful TTL to expire it on.
 */

import * as cache from './cache.js';

const SIC_CODES_URL =
  'https://raw.githubusercontent.com/companieshouse/sic-code-data/master/src/source_datafiles/condensed_sic_codes.csv';
const SIC_CACHE_KEY = 'sic-codes:v1';

let sicMap: Map<string, string> | null = null;

function parseSicCsv(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = text.split('\n');
  for (const line of lines.slice(1)) { // skip header row
    const trimmed = line.trim();
    if (!trimmed) continue;
    const commaIdx = trimmed.indexOf(',');
    if (commaIdx === -1) continue;
    // Only the first comma separates code from description — the
    // description itself is allowed to contain further commas (it does,
    // in the real published data), so everything after the first comma
    // belongs to the description.
    const code = trimmed.slice(0, commaIdx).trim();
    const description = trimmed.slice(commaIdx + 1).trim();
    if (code && description) map.set(code, description);
  }
  return map;
}

async function ensureSicCodesLoaded(): Promise<void> {
  if (sicMap) return;
  const cached = await cache.get(SIC_CACHE_KEY);
  if (cached && typeof cached === 'object') {
    sicMap = new Map(Object.entries(cached as Record<string, string>));
    return;
  }
  const resp = await fetch(SIC_CODES_URL);
  if (!resp.ok) {
    sicMap = new Map();
    return;
  }
  const text = await resp.text();
  sicMap = parseSicCsv(text);
  await cache.set(SIC_CACHE_KEY, Object.fromEntries(sicMap));
}

export async function getSicDescription(code: string): Promise<string | null> {
  await ensureSicCodesLoaded();
  return sicMap?.get(code) ?? null;
}

/**
 * canonicalName.ts
 * Shared company-name canonicalization, safe to use in both Node and browser.
 * Used to line up the same legal entity across sources that spell its name
 * differently (GOV.UK sponsor register, Companies House, the sponsor
 * industry map) — e.g. "Tesco Stores Ltd." and "TESCO STORES LIMITED" both
 * canonicalize to "tesco stores".
 */

function stripLegalSuffix(s: string): string {
  return s
    .replace(/\b(ltd|limited|llp|plc|inc|corp|group|holdings?|uk|international|services?|solutions?|consulting|consultants?|consultancy)\b/gi, '')
    .replace(/\s+/g, ' ').trim();
}

// Lowercase, strip punctuation (&, ., ', -, etc.) and collapse whitespace, so
// "M&S", "M & S" and "M and S"-style variants line up for comparison.
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Pure function of `s`, called on every register/ledger entry across up to 4
// candidate-search tiers per query — memoized so a 142k-row scan doesn't
// recompute the same regex work 4x over. Bounded by register size (~160k
// entries total across current + revoked pools), not by query volume.
const canonicalNameCache = new Map<string, string>();
export function canonicalName(s: string): string {
  const cached = canonicalNameCache.get(s);
  if (cached !== undefined) return cached;
  const result = stripLegalSuffix(normalizeName(s));
  canonicalNameCache.set(s, result);
  return result;
}

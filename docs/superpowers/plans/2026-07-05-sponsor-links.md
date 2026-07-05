# Sponsor Checker: Real Nature-of-Business Data + External Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill in the Sponsor Checker's always-`'Unknown'` "Nature of business" field with real data from Companies House, and add a "Find out more" section of constructed search links (company details + open roles) to every confirmed sponsor result.

**Architecture:** A new, fully separate server module (`services/companiesHouse.ts`) does a cached (~90 day) live lookup against the free official Companies House API for a confirmed company match, resolving both a real profile link and a SIC-code-derived nature of business (via a locally-cached copy of Companies House's own published SIC code table, `services/sicCodes.ts`). This is exposed via a new endpoint (`/api/company-lookup`) that the frontend calls *after* a sponsor result renders — it never blocks or touches `checkSponsor`/`/api/sponsor-status`, which keeps its existing "never makes a live call" guarantee. Seven additional links (Google/LinkedIn/Facebook/Companies House for "Company", LinkedIn Jobs/Indeed/Google for "Open roles") are pure client-side URL templates built by a new `utils/companyLinks.ts`, needing no network call at all.

**Tech Stack:** TypeScript, Vercel serverless functions + Express (`server.js`) for local dev, Redis-backed `cache.ts`, Jest + ts-jest + Testing Library (React).

## Global Constraints

- `checkSponsor()` / `/api/sponsor-status` must never make a live network call — this feature's live call (Companies House) lives entirely in the new, separate `/api/company-lookup` endpoint, fired independently by the frontend.
- Non-exact company-name matches are never auto-resolved to a confirmed identity — the Companies House lookup only trusts an exact/normalised (`canonicalName`) match; anything else silently falls back to a search link, no picker UI for this feature.
- Companies House lookup results are cached per company for ~90 days (`ch-lookup:v1:{canonicalName}` in the shared `cache` service).
- The SIC code → description table is fetched once from `https://raw.githubusercontent.com/companieshouse/sic-code-data/master/src/source_datafiles/condensed_sic_codes.csv` and cached indefinitely (`sic-codes:v1`) — it is static reference data, not live data.
- This feature must degrade silently: missing API key, rate limiting, no match, or any Companies House API failure all resolve to `{ companiesHouseUrl: null, natureOfBusiness: null }` — never a thrown error or a broken UI state.
- New search links open in a new tab (`target="_blank" rel="noopener noreferrer"`).
- Applies only to confirmed results (`Licensed` / `Revoked` statuses) — not the `Not Found` / candidate-picker state.

---

### Task 1: SIC code lookup table

**Files:**
- Create: `services/sicCodes.ts`
- Test: `services/sicCodes.test.ts`

**Interfaces:**
- Produces: `getSicDescription(code: string): Promise<string | null>` — used by Task 2.

- [ ] **Step 1: Write the failing tests**

```typescript
// services/sicCodes.test.ts
const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();

jest.mock('./cache.js', () => ({
  get: (...args: any[]) => mockCacheGet(...args),
  set: (...args: any[]) => mockCacheSet(...args),
}));

const SAMPLE_CSV =
  'sic_code.string(),sic_description.string()\n' +
  '62020,Information technology consultancy activities\n' +
  '01110,Growing of cereals (except rice), leguminous crops and oil seeds\n';

describe('sicCodes', () => {
  beforeEach(() => {
    jest.resetModules();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    (global as any).fetch = jest.fn();
  });

  it('fetches and parses the CSV on a cache miss, then caches the parsed map', async () => {
    mockCacheGet.mockResolvedValue(undefined);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, text: async () => SAMPLE_CSV });

    const { getSicDescription } = await import('./sicCodes.js');
    const result = await getSicDescription('62020');

    expect(result).toBe('Information technology consultancy activities');
    expect(mockCacheSet).toHaveBeenCalledWith(
      'sic-codes:v1',
      expect.objectContaining({ '62020': 'Information technology consultancy activities' })
    );
  });

  it('correctly parses a description that itself contains a comma', async () => {
    mockCacheGet.mockResolvedValue(undefined);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, text: async () => SAMPLE_CSV });

    const { getSicDescription } = await import('./sicCodes.js');
    const result = await getSicDescription('01110');

    expect(result).toBe('Growing of cereals (except rice), leguminous crops and oil seeds');
  });

  it('returns null for a code not in the table', async () => {
    mockCacheGet.mockResolvedValue(undefined);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, text: async () => SAMPLE_CSV });

    const { getSicDescription } = await import('./sicCodes.js');
    const result = await getSicDescription('99999');

    expect(result).toBeNull();
  });

  it('uses the cached map and never calls fetch on a cache hit', async () => {
    mockCacheGet.mockResolvedValue({ '62020': 'Information technology consultancy activities' });

    const { getSicDescription } = await import('./sicCodes.js');
    const result = await getSicDescription('62020');

    expect(result).toBe('Information technology consultancy activities');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest services/sicCodes.test.ts`
Expected: FAIL — `Cannot find module './sicCodes.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// services/sicCodes.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest services/sicCodes.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add services/sicCodes.ts services/sicCodes.test.ts
git commit -m "feat: add Companies House SIC code lookup table"
```

---

### Task 2: Companies House client + lookupCompany orchestration

**Files:**
- Create: `services/companiesHouse.ts`
- Modify: `services/aiService.ts:226` (export the existing private `canonicalName` function so it can be reused here)
- Modify: `types.ts` (add `CompanyLookupResult`)
- Test: `services/companiesHouse.test.ts`

**Interfaces:**
- Consumes: `getSicDescription(code: string): Promise<string | null>` from Task 1; `canonicalName(s: string): string` from `aiService.ts` (newly exported).
- Produces: `lookupCompany(companyName: string): Promise<CompanyLookupResult>` — used by Task 3. `CompanyLookupResult = { companiesHouseUrl: string | null; natureOfBusiness: string | null }`.

- [ ] **Step 1: Export `canonicalName` from aiService.ts**

In `services/aiService.ts`, change line 226 from:

```typescript
function canonicalName(s: string): string {
```

to:

```typescript
export function canonicalName(s: string): string {
```

- [ ] **Step 2: Add `CompanyLookupResult` to types.ts**

Append to the end of `types.ts`:

```typescript
export interface CompanyLookupResult {
  companiesHouseUrl: string | null;
  natureOfBusiness: string | null;
}
```

- [ ] **Step 3: Write the failing tests**

```typescript
// services/companiesHouse.test.ts
const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
const mockAgeMs = jest.fn();

jest.mock('./cache.js', () => ({
  get: (...args: any[]) => mockCacheGet(...args),
  set: (...args: any[]) => mockCacheSet(...args),
  ageMs: (...args: any[]) => mockAgeMs(...args),
}));

jest.mock('./aiService.js', () => ({
  canonicalName: (s: string) => s.toLowerCase().trim(),
}));

const mockGetSicDescription = jest.fn();
jest.mock('./sicCodes.js', () => ({
  getSicDescription: (...args: any[]) => mockGetSicDescription(...args),
}));

describe('companiesHouse.lookupCompany', () => {
  const originalKey = process.env.COMPANIES_HOUSE_API_KEY;

  beforeEach(() => {
    jest.resetModules();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockAgeMs.mockReset();
    mockGetSicDescription.mockReset();
    process.env.COMPANIES_HOUSE_API_KEY = 'test-key';
    (global as any).fetch = jest.fn();
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.COMPANIES_HOUSE_API_KEY;
    else process.env.COMPANIES_HOUSE_API_KEY = originalKey;
  });

  it('returns the cached result without calling fetch when the cache is fresh', async () => {
    mockCacheGet.mockResolvedValue({ companiesHouseUrl: 'https://cached', natureOfBusiness: 'Cached business' });
    mockAgeMs.mockReturnValue(1000);

    const { lookupCompany } = await import('./companiesHouse.js');
    const result = await lookupCompany('Acme Ltd');

    expect(result).toEqual({ companiesHouseUrl: 'https://cached', natureOfBusiness: 'Cached business' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns no match without calling fetch when no API key is configured', async () => {
    delete process.env.COMPANIES_HOUSE_API_KEY;
    mockCacheGet.mockResolvedValue(undefined);

    const { lookupCompany } = await import('./companiesHouse.js');
    const result = await lookupCompany('Acme Ltd');

    expect(result).toEqual({ companiesHouseUrl: null, natureOfBusiness: null });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns no match and caches it when the search finds no exact name match', async () => {
    mockCacheGet.mockResolvedValue(undefined);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ title: 'Acme Holdings Ltd', company_number: '00000001' }] }),
    });

    const { lookupCompany } = await import('./companiesHouse.js');
    const result = await lookupCompany('Acme Ltd');

    expect(result).toEqual({ companiesHouseUrl: null, natureOfBusiness: null });
    expect(mockCacheSet).toHaveBeenCalledWith(
      expect.stringContaining('ch-lookup:v1:'),
      { companiesHouseUrl: null, natureOfBusiness: null }
    );
  });

  it('resolves the company profile and SIC description on an exact match, and caches it', async () => {
    mockCacheGet.mockResolvedValue(undefined);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ title: 'acme ltd', company_number: '01234567' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sic_codes: ['62020'] }),
      });
    mockGetSicDescription.mockResolvedValue('Information technology consultancy activities');

    const { lookupCompany } = await import('./companiesHouse.js');
    const result = await lookupCompany('Acme Ltd');

    expect(result).toEqual({
      companiesHouseUrl: 'https://find-and-update.company-information.service.gov.uk/company/01234567',
      natureOfBusiness: 'Information technology consultancy activities',
    });
    expect(mockGetSicDescription).toHaveBeenCalledWith('62020');
    expect(mockCacheSet).toHaveBeenCalledWith(expect.stringContaining('ch-lookup:v1:'), result);
  });

  it('returns no match without caching when the search call throws', async () => {
    mockCacheGet.mockResolvedValue(undefined);
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network down'));

    const { lookupCompany } = await import('./companiesHouse.js');
    const result = await lookupCompany('Acme Ltd');

    expect(result).toEqual({ companiesHouseUrl: null, natureOfBusiness: null });
    expect(mockCacheSet).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx jest services/companiesHouse.test.ts`
Expected: FAIL — `Cannot find module './companiesHouse.js'`

- [ ] **Step 5: Write the implementation**

```typescript
// services/companiesHouse.ts
/**
 * Best-effort enrichment for a confirmed sponsor result: the real
 * Companies House profile link and nature-of-business (via SIC code),
 * looked up from the free official Companies House API. Kept fully
 * separate from checkSponsor()/sponsor-status, which must never make a
 * live network call — this is a second, independent, cached lookup the
 * frontend fires after a confirmed sponsor result comes back.
 */

import * as cache from './cache.js';
import { canonicalName } from './aiService.js';
import { getSicDescription } from './sicCodes.js';
import type { CompanyLookupResult } from '../types.js';

const getApiKey = () => process.env.COMPANIES_HOUSE_API_KEY || '';

const CH_LOOKUP_CACHE_VERSION = 'v1';
const CH_LOOKUP_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days — company details rarely change

const NO_MATCH: CompanyLookupResult = { companiesHouseUrl: null, natureOfBusiness: null };

interface ChSearchItem {
  title: string;
  company_number: string;
}

interface ChSearchResponse {
  items?: ChSearchItem[];
}

interface ChProfile {
  sic_codes?: string[];
}

function authHeader(): string {
  return 'Basic ' + Buffer.from(`${getApiKey()}:`).toString('base64');
}

async function searchCompanies(companyName: string): Promise<ChSearchItem[]> {
  const resp = await fetch(
    `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(companyName)}`,
    { headers: { Authorization: authHeader() } }
  );
  if (!resp.ok) return [];
  const json = (await resp.json()) as ChSearchResponse;
  return json.items || [];
}

async function getCompanyProfile(companyNumber: string): Promise<ChProfile | null> {
  const resp = await fetch(
    `https://api.company-information.service.gov.uk/company/${companyNumber}`,
    { headers: { Authorization: authHeader() } }
  );
  if (!resp.ok) return null;
  return (await resp.json()) as ChProfile;
}

export async function lookupCompany(companyName: string): Promise<CompanyLookupResult> {
  const cacheKey = `ch-lookup:${CH_LOOKUP_CACHE_VERSION}:${canonicalName(companyName)}`;
  const cached = await cache.get(cacheKey);
  if (cached && cache.ageMs(cacheKey) < CH_LOOKUP_TTL_MS) return cached;

  if (!getApiKey()) return NO_MATCH;

  let items: ChSearchItem[];
  try {
    items = await searchCompanies(companyName);
  } catch (err) {
    console.error('[companiesHouse] search failed:', err);
    return NO_MATCH;
  }

  const qCanon = canonicalName(companyName);
  const match = items.find(item => canonicalName(item.title) === qCanon);
  if (!match) {
    await cache.set(cacheKey, NO_MATCH);
    return NO_MATCH;
  }

  const profile = await getCompanyProfile(match.company_number).catch(() => null);
  const sicCode = profile?.sic_codes?.[0];
  const natureOfBusiness = sicCode ? await getSicDescription(sicCode) : null;

  const result: CompanyLookupResult = {
    companiesHouseUrl: `https://find-and-update.company-information.service.gov.uk/company/${match.company_number}`,
    natureOfBusiness,
  };
  await cache.set(cacheKey, result);
  return result;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest services/companiesHouse.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 7: Run the full test suite to check for regressions from the `canonicalName` export**

Run: `npx jest`
Expected: PASS (no existing test touches `canonicalName`'s export status)

- [ ] **Step 8: Commit**

```bash
git add services/companiesHouse.ts services/companiesHouse.test.ts services/aiService.ts types.ts
git commit -m "feat: add Companies House lookup with cached exact-match-only resolution"
```

---

### Task 3: `/api/company-lookup` endpoint (Vercel + local Express)

**Files:**
- Create: `api/company-lookup.ts`
- Modify: `server.js` (add matching local-dev route)
- Modify: `.env.example` (document the new optional env var)
- Test: `api/company-lookup.test.ts`

**Interfaces:**
- Consumes: `lookupCompany(companyName: string): Promise<CompanyLookupResult>` from Task 2; `checkRateLimit(key: string): Promise<{allowed: boolean; remaining: number}>` and `clientKey(req): string` from `services/rateLimit.ts` (existing).
- Produces: `GET /api/company-lookup?companyName=X` → `200 CompanyLookupResult` (always 200; errors degrade to the no-match shape) or `400`/`429` for bad request / rate limit.

- [ ] **Step 1: Write the failing tests**

```typescript
// api/company-lookup.test.ts
const mockLookupCompany = jest.fn();
jest.mock('../services/companiesHouse.js', () => ({
  lookupCompany: (...args: any[]) => mockLookupCompany(...args),
}));

const mockCheckRateLimit = jest.fn();
jest.mock('../services/rateLimit.js', () => ({
  checkRateLimit: (...args: any[]) => mockCheckRateLimit(...args),
  clientKey: () => 'test-ip',
}));

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  return res;
}

describe('/api/company-lookup', () => {
  beforeEach(() => {
    mockLookupCompany.mockReset();
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 10 });
  });

  it('returns 400 when companyName is missing', async () => {
    const { default: handler } = await import('./company-lookup.js');
    const req: any = { query: {} };
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    const { default: handler } = await import('./company-lookup.js');
    const req: any = { query: { companyName: 'Acme Ltd' } };
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(mockLookupCompany).not.toHaveBeenCalled();
  });

  it('returns the lookup result on success', async () => {
    mockLookupCompany.mockResolvedValue({ companiesHouseUrl: 'https://x', natureOfBusiness: 'IT' });
    const { default: handler } = await import('./company-lookup.js');
    const req: any = { query: { companyName: 'Acme Ltd' } };
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ companiesHouseUrl: 'https://x', natureOfBusiness: 'IT' });
  });

  it('falls back to a no-match shape (200) instead of a 500 if lookupCompany throws', async () => {
    mockLookupCompany.mockRejectedValue(new Error('boom'));
    const { default: handler } = await import('./company-lookup.js');
    const req: any = { query: { companyName: 'Acme Ltd' } };
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ companiesHouseUrl: null, natureOfBusiness: null });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest api/company-lookup.test.ts`
Expected: FAIL — `Cannot find module './company-lookup.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// api/company-lookup.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as companiesHouse from '../services/companiesHouse.js';
import { checkRateLimit, clientKey } from '../services/rateLimit.js';

export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const companyName = String(req.query.companyName || '').trim();
  if (!companyName) {
    return res.status(400).json({ error: 'companyName query param is required' });
  }
  const { allowed } = await checkRateLimit(`company-lookup:${clientKey(req)}`);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest api/company-lookup.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Add the local-dev Express route**

In `server.js`, add near the existing `/api/sponsor-news` route:

```javascript
app.get('/api/company-lookup', async (req, res) => {
  const companyName = String(req.query.companyName || '').trim();
  if (!companyName) {
    return res.status(400).json({ error: 'companyName query param is required' });
  }
  try {
    const data = await companiesHouse.lookupCompany(companyName);
    res.json(data);
  } catch (err) {
    console.error('[/api/company-lookup]', err);
    res.json({ companiesHouseUrl: null, natureOfBusiness: null });
  }
});
```

And add the import near the top of `server.js`, alongside the existing `aiService` import:

```javascript
import * as companiesHouse from './services/companiesHouse.js';
```

- [ ] **Step 6: Document the new env var**

Append to `.env.example`:

```
# ── Companies House (optional) ───────────────────────────────────────────────
# Enables real "nature of business" data and a confirmed Companies House
# profile link on the Sponsor Checker. Get a free key at
# https://developer.company-information.service.gov.uk/
# Without this set, the Sponsor Checker's "Find out more" links still work
# (search links only) — Companies House data is just skipped.
# COMPANIES_HOUSE_API_KEY=your_companies_house_api_key_here
```

- [ ] **Step 7: Commit**

```bash
git add api/company-lookup.ts api/company-lookup.test.ts server.js .env.example
git commit -m "feat: add /api/company-lookup endpoint for Companies House enrichment"
```

---

### Task 4: Pure external-link builders

**Files:**
- Create: `utils/companyLinks.ts`
- Test: `utils/companyLinks.test.ts`

**Interfaces:**
- Produces: `CompanyLink = { label: string; url: string }`; `buildCompanyDetailsLinks(companyName: string): CompanyLink[]`; `buildOpenRolesLinks(companyName: string): CompanyLink[]` — both used by Task 5.

- [ ] **Step 1: Write the failing tests**

```typescript
// utils/companyLinks.test.ts
import { buildCompanyDetailsLinks, buildOpenRolesLinks } from './companyLinks';

describe('buildCompanyDetailsLinks', () => {
  it('returns Google, LinkedIn, Facebook, and Companies House links with the company name encoded', () => {
    const links = buildCompanyDetailsLinks('Acme Solutions Ltd');
    const byLabel = Object.fromEntries(links.map(l => [l.label, l.url]));

    expect(links).toHaveLength(4);
    expect(byLabel['Google']).toBe('https://www.google.co.uk/search?q=Acme%20Solutions%20Ltd');
    expect(byLabel['LinkedIn']).toBe(
      'https://www.linkedin.com/search/results/companies/?keywords=Acme%20Solutions%20Ltd'
    );
    expect(byLabel['Facebook']).toBe('https://www.facebook.com/search/top?q=Acme%20Solutions%20Ltd');
    expect(byLabel['Companies House']).toBe(
      'https://find-and-update.company-information.service.gov.uk/search/companies?q=Acme%20Solutions%20Ltd'
    );
  });

  it('URL-encodes special characters like "&" in the company name', () => {
    const links = buildCompanyDetailsLinks('M&S');
    const google = links.find(l => l.label === 'Google')!;

    expect(google.url).toBe('https://www.google.co.uk/search?q=M%26S');
  });
});

describe('buildOpenRolesLinks', () => {
  it('returns LinkedIn Jobs, Indeed UK, and a careers-focused Google search', () => {
    const links = buildOpenRolesLinks('Acme Solutions Ltd');
    const byLabel = Object.fromEntries(links.map(l => [l.label, l.url]));

    expect(links).toHaveLength(3);
    expect(byLabel['LinkedIn Jobs']).toBe(
      'https://www.linkedin.com/jobs/search/?keywords=Acme%20Solutions%20Ltd'
    );
    expect(byLabel['Indeed UK']).toBe('https://uk.indeed.com/jobs?q=Acme%20Solutions%20Ltd');
    expect(byLabel['Google']).toBe(
      'https://www.google.co.uk/search?q=Acme%20Solutions%20Ltd%20careers'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest utils/companyLinks.test.ts`
Expected: FAIL — `Cannot find module './companyLinks'`

- [ ] **Step 3: Write the implementation**

```typescript
// utils/companyLinks.ts
/**
 * companyLinks.ts
 * Pure URL builders for the Sponsor Checker's "Find out more" section —
 * constructed search-query links, not resolved/guessed exact URLs.
 */

export interface CompanyLink {
  label: string;
  url: string;
}

function q(value: string): string {
  return encodeURIComponent(value);
}

export function buildCompanyDetailsLinks(companyName: string): CompanyLink[] {
  const name = q(companyName);
  return [
    { label: 'Google', url: `https://www.google.co.uk/search?q=${name}` },
    { label: 'LinkedIn', url: `https://www.linkedin.com/search/results/companies/?keywords=${name}` },
    { label: 'Facebook', url: `https://www.facebook.com/search/top?q=${name}` },
    {
      label: 'Companies House',
      url: `https://find-and-update.company-information.service.gov.uk/search/companies?q=${name}`,
    },
  ];
}

export function buildOpenRolesLinks(companyName: string): CompanyLink[] {
  const name = q(companyName);
  const careers = q(`${companyName} careers`);
  return [
    { label: 'LinkedIn Jobs', url: `https://www.linkedin.com/jobs/search/?keywords=${name}` },
    { label: 'Indeed UK', url: `https://uk.indeed.com/jobs?q=${name}` },
    { label: 'Google', url: `https://www.google.co.uk/search?q=${careers}` },
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest utils/companyLinks.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add utils/companyLinks.ts utils/companyLinks.test.ts
git commit -m "feat: add pure URL builders for sponsor company/open-roles links"
```

---

### Task 5: Sponsor Checker UI integration

**Files:**
- Modify: `services/apiClient.ts` (add `lookupCompany` method)
- Modify: `components/SponsorChecker.tsx`
- Test: `components/SponsorChecker.findOutMore.test.tsx`

**Interfaces:**
- Consumes: `buildCompanyDetailsLinks`/`buildOpenRolesLinks` from Task 4; `CompanyLookupResult` type from Task 2; `GET /api/company-lookup` contract from Task 3.

- [ ] **Step 1: Add `lookupCompany` to the API client**

In `services/apiClient.ts`, add `CompanyLookupResult` to the type import at the top:

```typescript
import { UpdatesResponse, NewsItem, SponsorCheckResult, SponsorNewsItem, PetitionsResult, CompanyLookupResult } from '../types';
```

Add a new method, directly after `checkSponsor`:

```typescript
  /**
   * Best-effort lookup of a confirmed company's Companies House profile
   * and nature of business. Returns nulls (never throws) when there's no
   * confident match.
   */
  async lookupCompany(companyName: string): Promise<CompanyLookupResult> {
    return this.fetch<CompanyLookupResult>(
      `/api/company-lookup?companyName=${encodeURIComponent(companyName)}`,
      { method: 'GET' },
      `company-lookup:${companyName}`
    );
  }
```

- [ ] **Step 2: Write the failing component tests**

```typescript
// components/SponsorChecker.findOutMore.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SponsorChecker } from './SponsorChecker';
import { apiClient } from '../services/apiClient';

jest.mock('../services/apiClient', () => ({
  apiClient: {
    checkSponsor: jest.fn(),
    fetchSponsorNews: jest.fn(),
    lookupCompany: jest.fn(),
  },
}));

const LICENSED_RESULT = {
  companyName: 'Acme Solutions Ltd',
  town: 'London',
  rating: 'Grade A',
  routes: ['Skilled Worker'],
  status: 'Licensed',
  natureOfBusiness: 'Unknown',
  dateGranted: '2020-01-01',
  sponsorType: 'Worker',
  notes: 'Confirmed in the current UK Register of Licensed Sponsors (GOV.UK).',
  history: [],
};

async function searchFor(name: string) {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText(/Acme Solutions Ltd/i), name);
  await user.click(screen.getByRole('button', { name: /Verify License Status/i }));
}

describe('SponsorChecker - Find out more links', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiClient.fetchSponsorNews as jest.Mock).mockResolvedValue([]);
  });

  it('renders company and open-roles search links after a confirmed result', async () => {
    (apiClient.checkSponsor as jest.Mock).mockResolvedValue(LICENSED_RESULT);
    (apiClient.lookupCompany as jest.Mock).mockResolvedValue({ companiesHouseUrl: null, natureOfBusiness: null });

    render(<SponsorChecker />);
    await searchFor('Acme Solutions Ltd');

    await waitFor(() => expect(screen.getByText('Acme Solutions Ltd (London)')).toBeInTheDocument());

    const googleLinks = screen.getAllByRole('link', { name: 'Google' });
    expect(googleLinks).toHaveLength(2); // one in "Company", one in "Open roles"
    expect(googleLinks[0]).toHaveAttribute('href', expect.stringContaining('search?q=Acme%20Solutions%20Ltd'));
    expect(googleLinks[1]).toHaveAttribute('href', expect.stringContaining('careers'));

    expect(screen.getByRole('link', { name: 'LinkedIn Jobs' })).toHaveAttribute(
      'href',
      expect.stringContaining('linkedin.com/jobs/search')
    );
    expect(screen.getByRole('link', { name: 'Indeed UK' })).toHaveAttribute(
      'href',
      expect.stringContaining('uk.indeed.com/jobs?q=')
    );
  });

  it('swaps in the confirmed Companies House profile link and real nature of business once the lookup resolves', async () => {
    (apiClient.checkSponsor as jest.Mock).mockResolvedValue(LICENSED_RESULT);
    (apiClient.lookupCompany as jest.Mock).mockResolvedValue({
      companiesHouseUrl: 'https://find-and-update.company-information.service.gov.uk/company/01234567',
      natureOfBusiness: 'Information technology consultancy activities',
    });

    render(<SponsorChecker />);
    await searchFor('Acme Solutions Ltd');

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Companies House' })).toHaveAttribute(
        'href',
        'https://find-and-update.company-information.service.gov.uk/company/01234567'
      )
    );
    expect(await screen.findByText('Information technology consultancy activities')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest components/SponsorChecker.findOutMore.test.tsx`
Expected: FAIL — no "Find out more" links exist yet in the component

- [ ] **Step 4: Update the component**

In `components/SponsorChecker.tsx`:

Change the React import to include `useMemo`:

```typescript
import React, { useState, useEffect, useMemo } from 'react';
```

Add new imports directly below the existing `lucide-react` import line:

```typescript
import { buildCompanyDetailsLinks, buildOpenRolesLinks } from '../utils/companyLinks';
import { CompanyLookupResult } from '../types';
```

Add new state, directly after the existing `news`/`newsLoading` state declarations:

```typescript
  const [companyLookup, setCompanyLookup] = useState<CompanyLookupResult | null>(null);
  const [companyLookupLoading, setCompanyLookupLoading] = useState(false);
```

Add a new effect, directly after the existing news-loading `useEffect`:

```typescript
  useEffect(() => {
    if (!result || (result.status !== 'Licensed' && result.status !== 'Revoked')) {
      setCompanyLookup(null);
      setCompanyLookupLoading(false);
      return;
    }
    let cancelled = false;
    setCompanyLookup(null);
    setCompanyLookupLoading(true);
    apiClient.lookupCompany(result.companyName)
      .then((data) => { if (!cancelled) setCompanyLookup(data); })
      .catch(() => { if (!cancelled) setCompanyLookup(null); })
      .finally(() => { if (!cancelled) setCompanyLookupLoading(false); });
    return () => { cancelled = true; };
  }, [result]);
```

Add computed link lists, directly after that effect:

```typescript
  const companyDetailsLinks = useMemo(() => {
    if (!result) return [];
    const links = buildCompanyDetailsLinks(result.companyName);
    if (!companyLookup?.companiesHouseUrl) return links;
    return links.map(link =>
      link.label === 'Companies House' ? { ...link, url: companyLookup.companiesHouseUrl! } : link
    );
  }, [result, companyLookup]);

  const openRolesLinks = useMemo(() => {
    if (!result) return [];
    return buildOpenRolesLinks(result.companyName);
  }, [result]);
```

Update the "Nature of business" block's displayed value — change:

```tsx
                <div className="mb-8">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">Nature of business</h4>
                  <div className="p-4 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {result.natureOfBusiness || 'Information unavailable'}
                  </div>
                </div>
```

to:

```tsx
                <div className="mb-8">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">Nature of business</h4>
                  <div className="p-4 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {companyLookupLoading && !companyLookup ? (
                      <span className="inline-block h-4 w-40 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                    ) : (
                      companyLookup?.natureOfBusiness || result.natureOfBusiness || 'Information unavailable'
                    )}
                  </div>
                </div>

                {/* Find out more — constructed search links, not guessed exact
                    URLs; the Companies House entry swaps in a real profile
                    link once /api/company-lookup resolves a confident match. */}
                <div className="mb-8">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                    <ExternalLink className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                    Find out more
                  </h4>
                  <div className="space-y-4">
                    <div>
                      <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">Company</span>
                      <div className="flex flex-wrap gap-2">
                        {companyDetailsLinks.map((link) => (
                          <a
                            key={link.label}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-indigo-950/30 dark:hover:border-indigo-700 dark:hover:text-indigo-300"
                          >
                            {link.label}
                          </a>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">Open roles</span>
                      <div className="flex flex-wrap gap-2">
                        {openRolesLinks.map((link) => (
                          <a
                            key={link.label}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-indigo-950/30 dark:hover:border-indigo-700 dark:hover:text-indigo-300"
                          >
                            {link.label}
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
```

Add `ExternalLink` to the existing `lucide-react` import line (currently `Search, Building2, AlertTriangle, CheckCircle, XCircle, ShieldAlert, Loader2, RefreshCcw, AlertCircle, Clock, ChevronRight`):

```typescript
import { Search, Building2, AlertTriangle, CheckCircle, XCircle, ShieldAlert, Loader2, RefreshCcw, AlertCircle, Clock, ChevronRight, ExternalLink } from 'lucide-react';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest components/SponsorChecker.findOutMore.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Run the full test suite**

Run: `npx jest`
Expected: PASS (no regressions)

- [ ] **Step 7: Type-check**

Run: `npm run type-check`
Expected: no errors

- [ ] **Step 8: Manual verification in the browser**

Run: `npm run server:dev` (needs `.env.local` with a real `COMPANIES_HOUSE_API_KEY` to see live data; without it, the "Find out more" links still render, Companies House falls back to its search link, and Nature of business stays "Unknown")

Search for a well-known licensed sponsor (e.g. "Deloitte") and confirm:
- The "Find out more" section renders with 4 Company links and 3 Open roles links, all opening in a new tab.
- With a real API key configured: the Companies House link points at a real profile page, and Nature of business shows a real description instead of "Unknown".
- Without a key (or for a company with no confident match): Companies House falls back to its search link, Nature of business stays "Unknown" — no error shown to the user.

- [ ] **Step 9: Commit**

```bash
git add services/apiClient.ts components/SponsorChecker.tsx components/SponsorChecker.findOutMore.test.tsx
git commit -m "feat: add Find out more links and real nature-of-business to Sponsor Checker"
```

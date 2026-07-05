# Sponsor Checker: Real Nature-of-Business Data + External Links

## Goal

Sponsor Checker results currently show `natureOfBusiness` as a hardcoded
`'Unknown'` for every result, because GOV.uk's sponsor register CSV never
contains that field. Add a real source for it, plus a set of external links
so a user checking a sponsor can quickly find the company itself and its open
roles, without the app guessing or fabricating exact URLs.

Scope: applies to confirmed results only (`Licensed` and `Revoked` statuses,
i.e. whenever `result` is a resolved company). Does not apply to the
`Not Found` / candidate-picker state, since there's no confirmed company to
look anything up for.

## Companies House lookup (nature of business)

- New endpoint `GET /api/company-lookup?companyName=X`, calling the free,
  official Companies House search API
  (`api.company-information.service.gov.uk`). Requires a new env var,
  `COMPANIES_HOUSE_API_KEY` (free key from Companies House's developer hub).
- **Trust only exact matches.** The top search result is only used if its
  company name is an exact/normalised match to the query (same
  Ltd/LLP/plc-stripping, case-insensitive normalisation already used for the
  sponsor register). No fuzzy picker for this — consistent with the existing
  rule elsewhere in this codebase that a non-exact identity match is never
  auto-resolved. If there's no confident match, the lookup simply returns
  nothing and the UI falls back to a Companies House *search* link instead of
  a confirmed profile link.
- On a confident match: the real company number gives a direct
  `find-and-update.company-information.service.gov.uk/company/{number}` link,
  and the SIC code description becomes the real `natureOfBusiness` value,
  replacing the hardcoded `'Unknown'`.
- **Cached in Redis per company, ~90 day TTL** (new key namespace
  `ch-lookup:v1:{name}`), using the existing `cache` service. Company details
  and SIC codes rarely change, and this keeps the live API call rare in
  practice: only the first search for a given company (or the first search
  after the cache expires) makes a live call; every other search for that
  same company, by anyone, hits the cache instantly.
- **Kept fully separate from `checkSponsor`/`/api/sponsor-status`**, which
  must keep its existing guarantee of never making a live network call. The
  frontend fires `/api/company-lookup` as a second, independent request once
  a confirmed sponsor result is in, and the enrichment section renders a
  brief loading state until it resolves. If Companies House is down,
  rate-limited, or returns no confident match, that section just falls back
  to search-links only — it never blocks or breaks the core sponsor check.

## External links

Rendered client-side the instant a confirmed result exists — pure URL
templates built from the company name, no request needed except for the
Companies House row (see above).

| Group | Site | Purpose |
|---|---|---|
| Company | Google | Broadest catch-all; usually surfaces the real company website too |
| Company | LinkedIn | Primary professional-presence signal |
| Company | Facebook | Common fallback presence for smaller sponsors (cafes, care homes, local retail) that don't have a real corporate website |
| Company | Companies House (GOV.uk) | The one authoritative official link; real profile link on a confident match, else a name-search link |
| Open roles | LinkedIn Jobs | Primary professional job board |
| Open roles | Indeed UK | Largest general UK job aggregator |
| Open roles | Google (`"{company} careers"`) | Usually surfaces the company's own careers page directly |

Deliberately excluded to avoid redundancy/dead ends: Bing (near-total overlap
with Google for a UK user), Reed/Totaljobs/Jobsite (three more overlapping
general UK job boards once Indeed + LinkedIn + a careers-focused Google
search already cover this), Facebook Jobs (Meta discontinued the standalone
product in most regions), Companies House under "open roles" (it has no
jobs listings).

Facebook and LinkedIn links point straight at `facebook.com/search` and
`linkedin.com/search` (not a Google `site:` search) — by explicit choice,
accepting that a logged-out visitor may see a login wall instead of results.

## UI placement

A new "Find out more" section in the result card, directly after "Nature of
business", with two rows of pill/button-style links (Company / Open roles),
each opening in a new tab (`target="_blank" rel="noopener noreferrer"`).
Shown for both `Licensed` and `Revoked` results. The Companies House link and
`natureOfBusiness` value show a small skeleton placeholder while
`/api/company-lookup` is in flight, then swap to real data or the
search-link/`'Unknown'` fallback.

## Data flow summary

1. User searches a company → `/api/sponsor-status` returns instantly from
   local register + ledger data, as today (no change to this path).
2. If the result is `Licensed` or `Revoked`, the frontend immediately renders
   the 6 non-Companies-House search links (pure client-side templates) and
   fires `/api/company-lookup?companyName=...` in the background.
3. `/api/company-lookup` checks the 90-day Redis cache; on a miss, calls
   Companies House live, caches the result (or a "no confident match"
   marker, to avoid re-querying a genuine miss every time), and returns.
4. The UI swaps in the real `natureOfBusiness` and Companies House profile
   link when that resolves, or falls back to `'Unknown'` and a Companies
   House search link if there's no confident match or the call fails.

## Error handling

- Companies House API down, rate-limited, or errors: `/api/company-lookup`
  catches and returns a "no match" shape; UI shows the fallback state, same
  as a genuine no-match. No error surfaces to the user for this
  best-effort enrichment.
- Missing `COMPANIES_HOUSE_API_KEY`: endpoint returns the "no match" shape
  immediately without attempting a call, same pattern as `getApiKey()` checks
  elsewhere in `aiService.ts`.

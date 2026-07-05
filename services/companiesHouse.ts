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
  // A non-ok response (rate limit, outage, etc.) is a failed search, not a
  // successful search that happened to find nothing — throw so the caller
  // treats it as transient and doesn't cache a false "no match".
  if (!resp.ok) throw new Error(`Companies House search failed: ${resp.status}`);
  const json = (await resp.json()) as ChSearchResponse;
  return json.items || [];
}

async function getCompanyProfile(companyNumber: string): Promise<ChProfile> {
  const resp = await fetch(
    `https://api.company-information.service.gov.uk/company/${companyNumber}`,
    { headers: { Authorization: authHeader() } }
  );
  // Same reasoning as searchCompanies: a non-ok response must not be treated
  // as "profile fetched, it just has no sic_codes".
  if (!resp.ok) throw new Error(`Companies House profile fetch failed: ${resp.status}`);
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

  // The company match itself is confirmed at this point (exact name match on
  // a real search result), so a profile-fetch failure only means we couldn't
  // resolve the nature-of-business — it doesn't invalidate the match. Return
  // the partial result but skip caching, so a transient failure (rate limit,
  // outage) gets retried on the next lookup instead of being locked in for
  // 90 days as "no nature of business".
  let profile: ChProfile | null = null;
  let profileFetchFailed = false;
  try {
    profile = await getCompanyProfile(match.company_number);
  } catch (err) {
    console.error('[companiesHouse] profile fetch failed:', err);
    profileFetchFailed = true;
  }
  const sicCode = profile?.sic_codes?.[0];
  const natureOfBusiness = sicCode ? await getSicDescription(sicCode) : null;

  const result: CompanyLookupResult = {
    companiesHouseUrl: `https://find-and-update.company-information.service.gov.uk/company/${match.company_number}`,
    natureOfBusiness,
  };
  if (!profileFetchFailed) {
    await cache.set(cacheKey, result);
  }
  return result;
}

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

// Affiliate routing for the Adzuna link. Adzuna runs its affiliate programme
// through AWIN, whose standard deep-link format is
// awin1.com/cread.php?awinmid=<merchant>&awinaffid=<publisher>&ued=<target>.
// Fill in both IDs once the AWIN publisher account is approved (awinmid is
// Adzuna's merchant ID on AWIN, awinaffid is the publisher ID); with either
// empty the Adzuna link stays a plain, untracked search URL. These are
// source constants rather than build-time env vars on purpose: they change
// about as rarely as this file, and keeping them here avoids dragging
// import.meta into a module that jest tests directly. LinkedIn and Google
// have no affiliate programmes, and Indeed's is invite-only with a
// publisher-specific link format, so those three are deliberately plain.
const AWIN_MERCHANT_ID = '';
const AWIN_AFFILIATE_ID = '';

export function awinDeepLink(merchantId: string, affiliateId: string, targetUrl: string): string {
  const ued = encodeURIComponent(targetUrl);
  return `https://www.awin1.com/cread.php?awinmid=${merchantId}&awinaffid=${affiliateId}&ued=${ued}`;
}

function adzunaJobsUrl(encodedQuery: string): string {
  const url = `https://www.adzuna.co.uk/jobs/search?q=${encodedQuery}`;
  if (!AWIN_MERCHANT_ID || !AWIN_AFFILIATE_ID) return url;
  return awinDeepLink(AWIN_MERCHANT_ID, AWIN_AFFILIATE_ID, url);
}

export function buildCompanyDetailsLinks(companyName: string): CompanyLink[] {
  const name = q(companyName);
  return [
    { label: 'Google', url: `https://www.google.co.uk/search?q=${name}` },
    { label: 'LinkedIn', url: `https://www.linkedin.com/search/results/companies/?keywords=${name}` },
    { label: 'Facebook', url: `https://www.facebook.com/search/top?q=${name}` },
    {
      // Labelled "GOV.UK" rather than "Companies House" — more recognisable
      // to laypeople, even though the link itself is the Companies House
      // register (a GOV.UK service).
      label: 'GOV.UK',
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
    { label: 'Adzuna', url: adzunaJobsUrl(name) },
    { label: 'Google', url: `https://www.google.co.uk/search?q=${careers}` },
  ];
}

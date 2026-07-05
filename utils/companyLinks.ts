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

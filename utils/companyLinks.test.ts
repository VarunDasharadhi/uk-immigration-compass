import { buildCompanyDetailsLinks, buildOpenRolesLinks } from './companyLinks';

describe('buildCompanyDetailsLinks', () => {
  it('returns Google, LinkedIn, Facebook, and GOV.UK links with the company name encoded', () => {
    const links = buildCompanyDetailsLinks('Acme Solutions Ltd');
    const byLabel = Object.fromEntries(links.map(l => [l.label, l.url]));

    expect(links).toHaveLength(4);
    expect(byLabel['Google']).toBe('https://www.google.co.uk/search?q=Acme%20Solutions%20Ltd');
    expect(byLabel['LinkedIn']).toBe(
      'https://www.linkedin.com/search/results/companies/?keywords=Acme%20Solutions%20Ltd'
    );
    expect(byLabel['Facebook']).toBe('https://www.facebook.com/search/top?q=Acme%20Solutions%20Ltd');
    expect(byLabel['GOV.UK']).toBe(
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

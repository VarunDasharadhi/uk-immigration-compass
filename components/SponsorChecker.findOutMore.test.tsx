// components/SponsorChecker.findOutMore.test.tsx
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

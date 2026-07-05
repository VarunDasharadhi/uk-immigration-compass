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

const NOT_FOUND_RESULT = {
  companyName: 'Nonexistent Widgets Ltd',
  town: 'Unknown',
  rating: 'Unknown',
  routes: [],
  status: 'Not Found',
  natureOfBusiness: 'Unknown',
  dateGranted: 'Unknown',
  sponsorType: 'Unknown',
  notes: 'No matching entry was found in the register.',
  history: [],
  candidates: [],
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
    (apiClient.lookupCompany as jest.Mock).mockResolvedValue({
      companiesHouseUrl: null,
      natureOfBusiness: null,
      registeredOfficeAddress: null,
    });

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

  it('swaps in the confirmed GOV.UK profile link, real nature of business, and full registered address once the lookup resolves', async () => {
    (apiClient.checkSponsor as jest.Mock).mockResolvedValue(LICENSED_RESULT);
    (apiClient.lookupCompany as jest.Mock).mockResolvedValue({
      companiesHouseUrl: 'https://find-and-update.company-information.service.gov.uk/company/01234567',
      natureOfBusiness: ['Information technology consultancy activities'],
      registeredOfficeAddress: '1 New Street Square, London, EC4A 3HQ',
    });

    render(<SponsorChecker />);
    await searchFor('Acme Solutions Ltd');

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'GOV.UK' })).toHaveAttribute(
        'href',
        'https://find-and-update.company-information.service.gov.uk/company/01234567'
      )
    );
    expect(await screen.findByText('Information technology consultancy activities')).toBeInTheDocument();
    expect(screen.getByText('1 New Street Square, London, EC4A 3HQ')).toBeInTheDocument();
    // The bare town from the sponsor register is no longer shown once the
    // full address has resolved — it would just repeat what's in the heading.
    expect(screen.queryByText('London', { selector: 'span' })).not.toBeInTheDocument();
  });

  it('shows just the town until the registered address lookup resolves', async () => {
    (apiClient.checkSponsor as jest.Mock).mockResolvedValue(LICENSED_RESULT);
    (apiClient.lookupCompany as jest.Mock).mockResolvedValue({
      companiesHouseUrl: null,
      natureOfBusiness: null,
      registeredOfficeAddress: null,
    });

    render(<SponsorChecker />);
    await searchFor('Acme Solutions Ltd');

    await waitFor(() => expect(screen.getByText('Acme Solutions Ltd (London)')).toBeInTheDocument());
    expect(screen.getByText('London', { selector: 'span' })).toBeInTheDocument();
  });

  it('renders every resolved SIC code description as a bulleted line when a company has more than one', async () => {
    (apiClient.checkSponsor as jest.Mock).mockResolvedValue(LICENSED_RESULT);
    (apiClient.lookupCompany as jest.Mock).mockResolvedValue({
      companiesHouseUrl: 'https://find-and-update.company-information.service.gov.uk/company/01234567',
      natureOfBusiness: [
        'Information technology consultancy activities',
        'Management consultancy activities other than financial management',
      ],
    });

    render(<SponsorChecker />);
    await searchFor('Acme Solutions Ltd');

    expect(await screen.findByText('Information technology consultancy activities')).toBeInTheDocument();
    expect(screen.getByText('Management consultancy activities other than financial management')).toBeInTheDocument();
  });

  it('does not render the Find out more section for a Not Found result', async () => {
    (apiClient.checkSponsor as jest.Mock).mockResolvedValue(NOT_FOUND_RESULT);

    render(<SponsorChecker />);
    await searchFor('Nonexistent Widgets Ltd');

    await waitFor(() => expect(screen.getByText('Nonexistent Widgets Ltd (Unknown)')).toBeInTheDocument());

    expect(screen.queryByText('Find out more')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Google' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'GOV.UK' })).not.toBeInTheDocument();
    expect(apiClient.lookupCompany).not.toHaveBeenCalled();
  });
});

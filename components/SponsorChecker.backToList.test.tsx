// components/SponsorChecker.backToList.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SponsorChecker } from './SponsorChecker';
import { apiClient } from '../services/apiClient';
import { pageview } from '@vercel/analytics';

jest.mock('@vercel/analytics', () => ({
  pageview: jest.fn(),
}));

jest.mock('../services/apiClient', () => ({
  apiClient: {
    checkSponsor: jest.fn(),
    fetchSponsorNews: jest.fn().mockResolvedValue([]),
    fetchSponsorDirectory: jest.fn().mockResolvedValue({
      total: 2,
      page: 1,
      pageSize: 24,
      items: [
        { name: 'Tesco Stores Ltd', town: 'Welwyn Garden City', routes: ['Skilled Worker'], rating: 'Grade A', industry: 'J', industryLabel: 'Information & Communication' },
        { name: 'Deloitte LLP', town: 'London', routes: ['Skilled Worker'], rating: 'Grade A', industry: 'M', industryLabel: 'Professional, Scientific & Technical' },
      ],
      industries: [
        { id: 'all', label: 'All industries', count: 2 },
        { id: 'J', label: 'Information & Communication', count: 1 },
        { id: 'M', label: 'Professional, Scientific & Technical', count: 1 },
        { id: 'unknown', label: 'Other / Unknown', count: 0 },
      ],
      routes: [
        { id: 'all', label: 'All routes', count: 2 },
        { id: 'Skilled Worker', label: 'Skilled Worker', count: 2 },
      ],
      mapGeneratedAt: null,
    }),
    fetchSponsorChanges: jest.fn().mockResolvedValue([]),
    lookupCompany: jest.fn().mockResolvedValue({ companiesHouseUrl: null, natureOfBusiness: null, registeredOfficeAddress: null }),
  },
}));

const LICENSED_RESULT = {
  companyName: 'Tesco Stores Ltd',
  town: 'Welwyn Garden City',
  rating: 'Grade A',
  routes: ['Skilled Worker'],
  status: 'Licensed',
  natureOfBusiness: 'Unknown',
  dateGranted: '2020-01-01',
  sponsorType: 'Worker',
  notes: 'Confirmed in the current UK Register of Licensed Sponsors (GOV.UK).',
  history: [],
};

describe('SponsorChecker - back to the sponsor list', () => {
  beforeEach(() => {
    // jsdom carries the URL hash between tests in this file, and the
    // component reads it to pick its initial view.
    window.history.replaceState(null, '', '/');
    jest.clearAllMocks();
    (apiClient.checkSponsor as jest.Mock).mockResolvedValue(LICENSED_RESULT);
  });

  it('opens a directory sponsor in the check view and Back restores the filtered list', async () => {
    const user = userEvent.setup();
    render(<SponsorChecker />);

    // Switch to the directory and filter to one industry.
    await user.click(screen.getByRole('tab', { name: /Browse Sponsors/i }));
    expect(await screen.findByText('Tesco Stores Ltd')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Information & Communication/i }));
    await waitFor(() =>
      expect(apiClient.fetchSponsorDirectory).toHaveBeenLastCalledWith(
        expect.objectContaining({ industry: 'J' })
      )
    );

    // Opening a sponsor takes over the panel with a Back button.
    await user.click(screen.getByRole('button', { name: 'Check Tesco Stores Ltd' }));
    expect(await screen.findByText('Tesco Stores Ltd (Welwyn Garden City)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to sponsor list/i })).toBeInTheDocument();
    expect(pageview).toHaveBeenCalledWith({ route: '/sponsors/check', path: '/sponsors/check' });

    // Back returns to the list with the industry filter still applied.
    await user.click(screen.getByRole('button', { name: /Back to sponsor list/i }));
    expect(await screen.findByText('Tesco Stores Ltd')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Information & Communication/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Tesco Stores Ltd (Welwyn Garden City)')).not.toBeInTheDocument();
    expect(pageview).toHaveBeenLastCalledWith({ route: '/sponsors/browse', path: '/sponsors/browse' });
  });

  it('does not show the Back button for a search typed directly on the check tab', async () => {
    const user = userEvent.setup();
    render(<SponsorChecker />);

    await user.type(screen.getByPlaceholderText(/Acme Solutions Ltd/i), 'Tesco Stores Ltd');
    await user.click(screen.getByRole('button', { name: /Verify Licence Status/i }));
    expect(await screen.findByText('Tesco Stores Ltd (Welwyn Garden City)')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /Back to sponsor list/i })).not.toBeInTheDocument();
    expect(pageview).not.toHaveBeenCalled();
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SponsorDirectory } from './SponsorDirectory';
import { apiClient } from '../services/apiClient';

jest.mock('../services/apiClient', () => ({
  apiClient: {
    fetchSponsorDirectory: jest.fn(),
  },
}));

const mockFetchSponsorDirectory = apiClient.fetchSponsorDirectory as jest.Mock;

const SAMPLE_RESPONSE = {
  total: 2,
  page: 1,
  pageSize: 24,
  items: [
    { name: 'Tesco Stores Ltd', town: 'Welwyn Garden City', routes: ['Skilled Worker'], rating: 'Grade A', industry: 'J', industryLabel: 'Information & Communication' },
    { name: 'Deloitte LLP', town: 'London', routes: ['Skilled Worker', 'Graduate Trainee'], rating: 'Grade A', industry: 'M', industryLabel: 'Professional, Scientific & Technical' },
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
  mapGeneratedAt: '2026-07-01T00:00:00.000Z',
};

describe('SponsorDirectory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchSponsorDirectory.mockResolvedValue(SAMPLE_RESPONSE);
  });

  it('loads and renders sponsor cards from the directory endpoint', async () => {
    render(<SponsorDirectory onSelectCompany={jest.fn()} />);

    expect(await screen.findByText('Tesco Stores Ltd')).toBeInTheDocument();
    expect(screen.getByText('Deloitte LLP')).toBeInTheDocument();
    expect(screen.getByText('2 sponsors')).toBeInTheDocument();
    expect(mockFetchSponsorDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ industry: 'all', route: 'all', page: 1, pageSize: 24 })
    );
  });

  it('shows the empty state when no sponsors match', async () => {
    mockFetchSponsorDirectory.mockResolvedValue({ ...SAMPLE_RESPONSE, total: 0, items: [] });
    render(<SponsorDirectory onSelectCompany={jest.fn()} />);

    expect(await screen.findByText('No sponsors match')).toBeInTheDocument();
  });

  it('shows an error banner when the fetch fails', async () => {
    mockFetchSponsorDirectory.mockRejectedValue(new Error('network down'));
    render(<SponsorDirectory onSelectCompany={jest.fn()} />);

    expect(await screen.findByText(/Unable to load the sponsor directory/i)).toBeInTheDocument();
  });

  it('clicking an industry pill refetches filtered by that industry', async () => {
    const user = userEvent.setup();
    render(<SponsorDirectory onSelectCompany={jest.fn()} />);
    await screen.findByText('Tesco Stores Ltd');

    await user.click(screen.getByRole('button', { name: /Information & Communication/i }));

    await waitFor(() =>
      expect(mockFetchSponsorDirectory).toHaveBeenLastCalledWith(
        expect.objectContaining({ industry: 'J' })
      )
    );
  });

  it('clicking a sponsor card calls onSelectCompany with its name', async () => {
    const user = userEvent.setup();
    const onSelectCompany = jest.fn();
    render(<SponsorDirectory onSelectCompany={onSelectCompany} />);
    await screen.findByText('Tesco Stores Ltd');

    await user.click(screen.getByRole('button', { name: 'Check Tesco Stores Ltd' }));

    expect(onSelectCompany).toHaveBeenCalledWith('Tesco Stores Ltd');
  });

  it('debounces the search box before refetching with the query', async () => {
    const user = userEvent.setup();
    render(<SponsorDirectory onSelectCompany={jest.fn()} />);
    await screen.findByText('Tesco Stores Ltd');
    mockFetchSponsorDirectory.mockClear();

    await user.type(screen.getByLabelText(/Search by name or town/i), 'tesco');

    // Not fired on every keystroke — only after the debounce settles.
    expect(mockFetchSponsorDirectory).not.toHaveBeenCalled();

    await waitFor(
      () => expect(mockFetchSponsorDirectory).toHaveBeenCalledWith(expect.objectContaining({ q: 'tesco' })),
      { timeout: 2000 }
    );
  });

  it('shows a "Load more" button when more results remain, and appends the next page on click', async () => {
    mockFetchSponsorDirectory.mockResolvedValueOnce({ ...SAMPLE_RESPONSE, total: 3 });
    const user = userEvent.setup();
    render(<SponsorDirectory onSelectCompany={jest.fn()} />);
    await screen.findByText('Tesco Stores Ltd');

    const loadMoreButton = screen.getByRole('button', { name: /Load more/i });
    mockFetchSponsorDirectory.mockResolvedValueOnce({
      ...SAMPLE_RESPONSE,
      total: 3,
      page: 2,
      items: [{ name: 'Third Company Ltd', town: 'Bristol', routes: ['Skilled Worker'], rating: 'Unknown', industry: 'unknown', industryLabel: 'Other / Unknown' }],
    });

    await user.click(loadMoreButton);

    expect(await screen.findByText('Third Company Ltd')).toBeInTheDocument();
    // Previously loaded items stay on screen — Load more appends, not replaces.
    expect(screen.getByText('Tesco Stores Ltd')).toBeInTheDocument();
  });
});

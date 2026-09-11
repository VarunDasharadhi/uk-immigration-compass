// components/PetitionTracker.pagination.test.tsx
// The petitions page must expose its whole stored set (up to 100), not just
// the first screenful: reveal 12 at a time behind "Show more petitions".
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PetitionTracker } from './PetitionTracker';
import { apiClient } from '../services/apiClient';

jest.mock('../services/apiClient', () => ({
  apiClient: {
    fetchPetitions: jest.fn(),
  },
}));

const fetchPetitionsMock = apiClient.fetchPetitions as jest.Mock;

function makePetitions(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `pet-${i + 1}`,
    title: `Petition ${i + 1}`,
    summary: `Summary ${i + 1}`,
    signatures: 5000 - i,
    status: 'Open',
    isActive: true,
    url: `https://petition.parliament.uk/petitions/${i + 1}`,
  }));
}

describe('PetitionTracker progressive reveal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the first twelve with a count line and a Show more control', async () => {
    fetchPetitionsMock.mockResolvedValue({ petitions: makePetitions(30), sources: [], signatureHistory: [] });
    render(<PetitionTracker />);

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Open details for/ })).toHaveLength(12)
    );
    expect(screen.getByText('Showing 12 of 30 tracked petitions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show more petitions' })).toBeInTheDocument();
  });

  it('reveals the rest across clicks and removes the control when everything is shown', async () => {
    fetchPetitionsMock.mockResolvedValue({ petitions: makePetitions(30), sources: [], signatureHistory: [] });
    const user = userEvent.setup();
    render(<PetitionTracker />);

    await screen.findByRole('button', { name: 'Show more petitions' });
    await user.click(screen.getByRole('button', { name: 'Show more petitions' }));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Open details for/ })).toHaveLength(24)
    );
    expect(screen.getByText('Showing 24 of 30 tracked petitions')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show more petitions' }));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Open details for/ })).toHaveLength(30)
    );
    // Everything is visible: both the button and the counter go away
    expect(screen.queryByRole('button', { name: 'Show more petitions' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Showing \d+ of/)).not.toBeInTheDocument();
  });

  it('renders no reveal controls when the set fits on one screen', async () => {
    fetchPetitionsMock.mockResolvedValue({ petitions: makePetitions(6), sources: [], signatureHistory: [] });
    render(<PetitionTracker />);

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Open details for/ })).toHaveLength(6)
    );
    expect(screen.queryByRole('button', { name: 'Show more petitions' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Showing \d+ of/)).not.toBeInTheDocument();
  });
});

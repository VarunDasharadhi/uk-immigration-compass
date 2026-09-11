// components/AlertsSignup.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertsSignup } from './AlertsSignup';
import { apiClient } from '../services/apiClient';

jest.mock('../services/apiClient', () => ({
  apiClient: {
    subscribeToAlerts: jest.fn(),
  },
}));

const subscribeMock = apiClient.subscribeToAlerts as jest.Mock;

describe('AlertsSignup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the heading, an email field, and a submit button', () => {
    render(<AlertsSignup />);
    expect(screen.getByRole('heading', { name: 'Email alerts' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get email alerts' })).toBeInTheDocument();
  });

  it('does not call the API when the email field is empty', async () => {
    const user = userEvent.setup();
    render(<AlertsSignup />);
    await user.click(screen.getByRole('button', { name: 'Get email alerts' }));
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it('shows the confirmation message after a successful signup', async () => {
    subscribeMock.mockResolvedValue({ ok: true, message: 'Check your inbox and click the confirm link.' });
    const user = userEvent.setup();
    render(<AlertsSignup />);
    await user.type(screen.getByLabelText('Email address'), 'reader@example.com');
    await user.click(screen.getByRole('button', { name: 'Get email alerts' }));

    expect(subscribeMock).toHaveBeenCalledWith('reader@example.com');
    await waitFor(() =>
      expect(screen.getByText('Check your inbox and click the confirm link.')).toBeInTheDocument()
    );
    // Success replaces the form rather than leaving a second submit path
    expect(screen.queryByRole('button', { name: 'Get email alerts' })).not.toBeInTheDocument();

    // ...but a mistyped address is recoverable without a page reload
    await user.click(screen.getByRole('button', { name: 'Use a different address' }));
    expect(screen.getByRole('button', { name: 'Get email alerts' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveValue('');
  });

  it('shows the server error message when signup fails', async () => {
    subscribeMock.mockRejectedValue({ message: 'Too many requests. Please try again in a minute.' });
    const user = userEvent.setup();
    render(<AlertsSignup />);
    await user.type(screen.getByLabelText('Email address'), 'reader@example.com');
    await user.click(screen.getByRole('button', { name: 'Get email alerts' }));

    await waitFor(() =>
      expect(screen.getByText('Too many requests. Please try again in a minute.')).toBeInTheDocument()
    );
    // The form stays usable so the visitor can retry
    expect(screen.getByRole('button', { name: 'Get email alerts' })).toBeInTheDocument();
  });

  it('shows a fallback error message when the failure has no message', async () => {
    subscribeMock.mockRejectedValue(undefined);
    const user = userEvent.setup();
    render(<AlertsSignup />);
    await user.type(screen.getByLabelText('Email address'), 'reader@example.com');
    await user.click(screen.getByRole('button', { name: 'Get email alerts' }));

    await waitFor(() => expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument());
  });

  it('disables the button while a signup request is in flight', async () => {
    let resolveSignup: (value: { ok: boolean }) => void = () => {};
    subscribeMock.mockReturnValue(new Promise(resolve => { resolveSignup = resolve; }));
    const user = userEvent.setup();
    render(<AlertsSignup />);
    await user.type(screen.getByLabelText('Email address'), 'reader@example.com');
    await user.click(screen.getByRole('button', { name: 'Get email alerts' }));

    expect(screen.getByRole('button', { name: /Signing you up/ })).toBeDisabled();

    resolveSignup({ ok: true });
    await waitFor(() => expect(screen.getByText(/confirm link/i)).toBeInTheDocument());
  });
});

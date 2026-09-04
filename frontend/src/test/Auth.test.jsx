import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../App';

const user = { name: 'Test Analyst', email: 'analyst@example.com' };
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
async function openAuth() {
  const fetchMock = vi.fn().mockResolvedValueOnce(response({ user: null }));
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  await screen.findByLabelText('Email address');
  return fetchMock;
}
function enterAccount() {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: user.email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'example-password' } });
}

describe('Account authentication', () => {
  it('registers and uses an HttpOnly session without browser credential storage', async () => {
    const fetchMock = await openAuth();
    fetchMock.mockResolvedValueOnce(response({ user }));
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: user.name } });
    enterAccount();
    fireEvent.click(screen.getByRole('button', { name: /Create account/ }));
    await screen.findByRole('heading', { name: 'Conversation text' });
    const request = fetchMock.mock.calls[1][1];
    expect(JSON.parse(request.body)).toEqual({ action: 'register', name: user.name, email: user.email, password: 'example-password' });
    expect(request.credentials).toBe('same-origin');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('switches to login, clears passwords, and signs in', async () => {
    const fetchMock = await openAuth();
    enterAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('');
    enterAccount();
    fetchMock.mockResolvedValueOnce(response({ user }));
    fireEvent.click(screen.getByRole('button', { name: /Sign in to workspace/ }));
    await screen.findByRole('heading', { name: 'Conversation text' });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).action).toBe('login');
  });

  it('allows showing and hiding the password', async () => {
    await openAuth();
    enterAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Password')).toHaveValue('example-password');
  });

  it('shows duplicate account feedback and clears it on editing', async () => {
    const fetchMock = await openAuth();
    fetchMock.mockResolvedValueOnce(response({ detail: 'An account already exists for this email.' }, 409));
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: user.name } });
    enterAccount();
    fireEvent.click(screen.getByRole('button', { name: /Create account/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'other@example.com' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('restores sessions and only signs out after server confirmation', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ user }))
      .mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(response({ user: null }));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await screen.findByRole('heading', { name: 'Conversation text' });
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach');
    expect(screen.getByRole('heading', { name: 'Conversation text' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByLabelText('Email address');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).action).toBe('logout');
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('loads sample text and clears it without an analysis request', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ user }));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Load sample call' }));
    expect(screen.getByLabelText('Conversation transcript').value).toContain('Customer:');
    expect(screen.getByRole('button', { name: 'Analyze conversation' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear text' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Analyze conversation' })).toBeDisabled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

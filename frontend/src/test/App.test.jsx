import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../App';
import ResultDashboard from '../components/Results';
import fixtures from './fixtures.json';

const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });

async function login(fetchMock = vi.fn()) {
  fetchMock.mockResolvedValueOnce(response({ username: 'analyst' }));
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'analyst' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'demo-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('heading', { name: 'Upload transcript' });
  return fetchMock;
}

function upload(content = 'Good service.', name = 'demo.txt') {
  fireEvent.change(screen.getByLabelText('Choose a transcript file'), { target: { files: [new File([content], name, { type: 'text/plain' })] } });
}

describe('Login and session', () => {
  it('supports password visibility without changing the password', () => {
    render(<App />);
    const input = screen.getByLabelText('Password');
    fireEvent.change(input, { target: { value: 'example' } });
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveValue('example');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('explains rejected credentials and clears the error on editing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ detail: 'Incorrect credentials' }, 401)));
    render(<App />);
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'wrong' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('do not match this workspace');
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'analyst' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('signs in with Basic auth and signs out without persisting credentials', async () => {
    const fetchMock = await login();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Basic ${btoa('analyst:demo-password')}`);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });
});

describe('Upload and API states', () => {
  it.each([
    ['', 'empty.txt', 'This file is empty'],
    ['text', 'bad.pdf', 'Please choose a .txt file'],
    ['a'.repeat(100001), 'large.txt', 'no larger than 100 KB'],
  ])('rejects invalid file %s / %s', async (content, name, message) => {
    const fetchMock = await login();
    upload(content, name);
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'Analyze conversation' })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects whitespace content before sending an analysis request', async () => {
    const fetchMock = await login();
    upload(' \n\t');
    fireEvent.click(screen.getByRole('button', { name: 'Analyze conversation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('empty');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('sends the explicit AI opt-in flag (%s) and displays results', async enabled => {
    const fetchMock = await login();
    fetchMock.mockResolvedValueOnce(response(enabled ? fixtures.hybrid : fixtures.local));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    if (enabled) fireEvent.click(screen.getByRole('checkbox'));
    upload();
    fireEvent.click(screen.getByRole('button', { name: 'Analyze conversation' }));
    await screen.findByRole('heading', { name: 'Conversation overview' });
    const body = fetchMock.mock.calls[1][1].body;
    expect(body.get('include_insights')).toBe(String(enabled));
    expect(body.get('file').name).toBe('demo.txt');
    expect(Boolean(screen.queryByRole('heading', { name: 'Beyond the sentiment' }))).toBe(enabled);
    expect(screen.getByRole('columnheader', { name: 'VADER score' })).toBeInTheDocument();
  });

  it('locks the form while analysis is pending', async () => {
    const fetchMock = await login();
    let finish;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    upload();
    fireEvent.click(screen.getByRole('button', { name: 'Analyze conversation' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Analyzing…' })).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    finish(response(fixtures.local));
    await screen.findByRole('heading', { name: 'Conversation overview' });
  });

  it.each(['Missing NVIDIA API key.', 'AI insights are temporarily unavailable.'])('keeps the dashboard on AI fallback: %s', async notice => {
    const fetchMock = await login();
    fetchMock.mockResolvedValueOnce(response({ ...fixtures.local, insights_notice: notice }));
    upload();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Analyze conversation' }));
    await screen.findByRole('heading', { name: 'Conversation overview' });
    expect(screen.getByText(notice)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Beyond the sentiment' })).not.toBeInTheDocument();
  });

  it('allows retry after a network error', async () => {
    const fetchMock = await login();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(response(fixtures.local));
    upload();
    fireEvent.click(screen.getByRole('button', { name: 'Analyze conversation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach');
    fireEvent.click(screen.getByRole('button', { name: 'Analyze conversation' }));
    await screen.findByRole('heading', { name: 'Conversation overview' });
  });

  it('returns to login when analysis credentials expire', async () => {
    const fetchMock = await login();
    fetchMock.mockResolvedValueOnce(response({ detail: 'Unauthorized' }, 401));
    upload();
    fireEvent.click(screen.getByRole('button', { name: 'Analyze conversation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no longer valid');
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });
});

describe('Results and evidence', () => {
  it('renders distribution, original scores, trend and calculated KPIs', () => {
    render(<ResultDashboard result={fixtures.local} />);
    expect(screen.getByRole('img', { name: /Positive:.*Negative:.*Neutral:/ })).toBeInTheDocument();
    for (const name of ['Beginning', 'Middle', 'End', 'Sentiment volatility', 'Compound score · VADER']) expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('+0.6249');
    expect(screen.queryByRole('heading', { name: 'Beyond the sentiment' })).not.toBeInTheDocument();
  });

  it('filters final contextual labels while preserving full conversation KPIs', () => {
    render(<ResultDashboard result={fixtures.hybrid} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Negative' } });
    expect(screen.getByRole('table')).toHaveTextContent("Great, I've been waiting for three hours.");
    expect(screen.getByRole('table')).not.toHaveTextContent('Your appointment');
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing phrase' } });
    expect(screen.getByText(/No sentences match/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Calculated conversation KPIs' })).getByText('3')).toBeInTheDocument();
  });

  it('shows contextual reasoning, baseline label and unchanged polarity', () => {
    render(<ResultDashboard result={fixtures.hybrid} />);
    const table = screen.getByRole('table');
    fireEvent.click(within(table).getByText('Context reviewed · label changed'));
    expect(table).toHaveTextContent('Praise contrasts with a three-hour waiting complaint.');
    expect(table).toHaveTextContent('Original VADER label: Positive');
    expect(table).toHaveTextContent('+0.6249');
    expect(screen.getByText('Customer emotion')).toBeInTheDocument();
    expect(screen.getByText('Agent emotion')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText('Contextual reasoning')).toBeInTheDocument();
  });

  it('explains short input and absent speaker evidence', () => {
    render(<ResultDashboard result={{ ...fixtures.local, notices: ['Very short transcript.'], kpis: { ...fixtures.local.kpis, trend: [], customer_sentiment: null, customer_sentence_count: 0, customer_negative_percentage: null } }} />);
    expect(screen.getByText('Very short transcript.')).toBeInTheDocument();
    expect(screen.getByText(/At least three sentences/)).toBeInTheDocument();
    expect(screen.getByText('Requires Customer: labels')).toBeInTheDocument();
  });
});

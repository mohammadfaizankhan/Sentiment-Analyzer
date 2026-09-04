import { useRef, useState } from 'react';
import './styles.css';
import Badge from './components/Badge';
import ResultDashboard from './components/Results';

const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const MAX_FILE_BYTES = 100_000;

function Logo() {
  return <div className="brand"><svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" /><path d="M7 17h4l3-7 4 13 3-6h4" /></svg><span>Sentiment<span className="brand-light"> / Analyzer</span></span></div>;
}

async function apiRequest(path, authorization, body, timeout = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: 'POST', headers: { Authorization: authorization }, body, signal: controller.signal,
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('The server returned an unreadable response. Please try again.'); }
    if (!response.ok) {
      const error = new Error(typeof data.detail === 'string' ? data.detail : 'The request could not be completed.');
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request took too long. Please try again.');
    if (error instanceof TypeError) throw new Error('Cannot reach the analysis server. Check that it is running and try again.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function Login({ onLogin, message }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(message || '');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [invalidCredentials, setInvalidCredentials] = useState(false);
  const passwordRef = useRef(null);
  const localDemo = import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(window.location.hostname);

  function clearError() { setError(''); setInvalidCredentials(false); }

  function fillDemo() {
    setUsername('analyst'); setPassword('read-conversations');
    setShowPassword(false); clearError(); passwordRef.current?.focus();
  }

  async function submit(event) {
    event.preventDefault();
    clearError();
    if (!username.trim() || !password) { setError('Enter your username and password.'); return; }
    // HTTP Basic uses ASCII credentials; passwords stay only in component memory.
    if (!/^[\x20-\x7E]+$/.test(username) || !/^[\x20-\x7E]+$/.test(password) || username.includes(':')) {
      setError('Use ASCII credentials. The username cannot contain a colon.'); return;
    }
    setBusy(true);
    try {
      const authorization = `Basic ${btoa(`${username.trim()}:${password}`)}`;
      const result = await apiRequest('/api/login', authorization);
      onLogin({ username: result.username, authorization });
    } catch (err) {
      setInvalidCredentials(err.status === 401);
      setError(err.status === 401 ? 'Those credentials do not match this workspace. Use the configured account or check the sign-in help below.' : err.message);
    }
    finally { setBusy(false); }
  }

  return <div className="login-page">
    <header className="login-header"><Logo /><span className="eyebrow">Conversation insights</span></header>
    <main className="login-main">
      <div className="login-intro"><span className="eyebrow">A little more understanding</span><h1>Every conversation<br />has a tone.</h1><p>Explore sentiment, sentence by sentence.</p><div className="tone-line" aria-hidden="true"><i /><i /><i /></div></div>
      <section className="login-card" aria-labelledby="login-title">
        <span className="section-number">WORKSPACE ACCESS</span><h2 id="login-title">Sign in to your workspace</h2><p>Use your workspace account to analyze a transcript.</p>
        <form onSubmit={submit} aria-busy={busy}>
          <label htmlFor="username">Username</label><input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={e => { setUsername(e.target.value); clearError(); }} disabled={busy} aria-invalid={invalidCredentials} aria-describedby={error ? 'login-error' : undefined} required />
          <label htmlFor="password">Password</label><div className="password-field"><input ref={passwordRef} id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => { setPassword(e.target.value); clearError(); }} onKeyDown={e => setCapsLock(e.getModifierState('CapsLock'))} onKeyUp={e => setCapsLock(e.getModifierState('CapsLock'))} onBlur={() => setCapsLock(false)} disabled={busy} aria-invalid={invalidCredentials} aria-describedby={error ? 'login-error' : capsLock ? 'caps-lock-note' : undefined} required /><button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} disabled={busy}>{showPassword ? 'Hide' : 'Show'}</button></div>
          {capsLock && <p id="caps-lock-note" className="caps-note" role="status">Caps Lock is on.</p>}
          {error && <p id="login-error" className="error" role="alert">{error}</p>}
          <button className="primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<span aria-hidden="true">→</span></button>
        </form>
        {localDemo && <div className="demo-access"><div><strong>Trying the local demo?</strong><span>Use the default demo account.</span></div><button type="button" onClick={fillDemo} disabled={busy}>Fill demo login</button></div>}
        <details className="signin-help"><summary>Which account should I use?</summary><p>This app uses one configured workspace account. Personal usernames and passwords are not connected.</p><p>For your own local account, set <code>APP_USERNAME</code> and <code>APP_PASSWORD</code> in <code>backend/.env</code>, then restart the backend.{localDemo && ' The demo button only works with the default demo credentials.'}</p></details>
      </section>
    </main>
    <footer className="login-footer">Sentiment Analyzer<span>Positive. Negative. Neutral.</span></footer>
  </div>;
}

function Workspace({ session, onLogout }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [includeInsights, setIncludeInsights] = useState(false);
  const inputRef = useRef(null);

  function selectFile(candidate) {
    setError(''); setResult(null); setFile(null);
    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith('.txt')) { setError('Please choose a .txt file.'); return; }
    if (candidate.size > MAX_FILE_BYTES) { setError('Choose a file no larger than 100 KB.'); return; }
    if (candidate.size === 0) { setError('This file is empty. Add conversation text and try again.'); return; }
    setFile(candidate);
  }

  async function analyze(event) {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const text = await file.text();
      if (!text.replace(/^\uFEFF/, '').trim()) throw new Error('This file is empty. Add conversation text and try again.');
      const form = new FormData(); form.append('file', file);
      form.append('include_insights', String(includeInsights));
      setResult(await apiRequest('/api/analyze', session.authorization, form, includeInsights ? 65_000 : 30_000));
    } catch (err) {
      if (err.status === 401) { onLogout('Your credentials are no longer valid. Please sign in again.'); return; }
      setError(err.message);
    } finally { setBusy(false); }
  }

  return <div className="workspace">
    <header className="topbar"><Logo /><div className="account"><span className="account-dot" aria-hidden="true" /><span>{session.username}</span><button className="text-button" onClick={() => onLogout()} disabled={busy}>Sign out</button></div></header>
    <main className="workspace-main"><div className="page-heading"><div><span className="eyebrow">Your workspace</span><h1>Conversation insights</h1><p>A clear view of the sentiment behind the conversation.</p></div><span className="workspace-label">TEXT ANALYSIS</span></div>
      <div className="workspace-grid">
        <aside><section className="panel upload-panel" aria-labelledby="upload-title"><span className="section-number">01 / ADD A CONVERSATION</span><h2 id="upload-title">Upload transcript</h2><p className="subtle">Start with a text file of your call.</p>
          <form onSubmit={analyze}>
            <div className={`dropzone ${dragging ? 'dragging' : ''} ${busy ? 'disabled' : ''}`} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!busy) { if (inputRef.current) inputRef.current.value = ''; selectFile(event.dataTransfer.files[0]); } }}>
              <input ref={inputRef} id="transcript" type="file" accept=".txt,text/plain" disabled={busy} onChange={event => selectFile(event.target.files?.[0])} aria-label="Choose a transcript file" aria-describedby="file-help" />
              <svg className="upload-icon" width="38" height="38" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M19 4H8v24h17V10l-6-6Z" stroke="currentColor" strokeWidth="1.5" /><path d="M19 4v7h6M11 17h10M11 21h7" stroke="currentColor" strokeWidth="1.5" /></svg>
              <strong>{file ? 'Change transcript' : 'Choose a text file'}</strong><span>or drop it here</span><small id="file-help">.txt · UTF-8 · up to 100 KB</small>
            </div>
            {file && <div className="selected-file"><span aria-hidden="true">↳</span><div><strong title={file.name}>{file.name}</strong><small>{Math.max(0.1, file.size / 1000).toFixed(1)} KB · Ready to analyze</small></div></div>}
            <label className="insights-option"><input type="checkbox" checked={includeInsights} disabled={busy} onChange={event => setIncludeInsights(event.target.checked)} /><span><strong>Add AI insights</strong><small>Summary, call KPIs, and contextual review</small></span></label>
            {includeInsights && <p className="provider-note">Sends transcript text to NVIDIA for analysis. Requires a backend API key. Up to 100 sentences / 12,000 characters.</p>}
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary" type="submit" disabled={!file || busy}>{busy ? 'Analyzing…' : 'Analyze conversation'}<span aria-hidden="true">→</span></button>
          </form>
          <p className="privacy-note">{includeInsights ? 'The app does not save transcripts. NVIDIA processes the text under its service terms.' : 'Analysis stays on this backend. The app does not save transcripts.'}</p>
        </section><div className="format-note"><h3>A little formatting helps</h3><p>Use one speaking turn per line. Add <code>Customer:</code> and <code>Agent:</code> labels to distinguish speakers.</p><p>English text · up to 500 sentences</p></div></aside>
        <div aria-busy={busy}>
          <div className="sr-only" role="status">{busy ? 'Analyzing your conversation.' : result ? `Analysis complete. Overall sentiment: ${result.overall_sentiment}. ${result.kpis.sentence_count} sentences analyzed.` : ''}</div>
          {result ? <ResultDashboard result={result} /> : <section className="empty-state panel"><div className="empty-art" aria-hidden="true"><span /><span /><span /><span /><span /></div><span className="section-number">{busy ? 'ANALYSIS IN PROGRESS' : 'READY WHEN YOU ARE'}</span><h2>{busy ? 'Reading the conversation…' : 'Your conversation, understood.'}</h2><p>{busy ? 'Analyzing each sentence and bringing the results together.' : 'Upload a transcript to explore its overall tone, sentiment breakdown, and sentence-level insights.'}</p><div className="empty-legend"><Badge sentiment="Positive" /><Badge sentiment="Negative" /><Badge sentiment="Neutral" /></div></section>}
        </div>
      </div>
    </main>
    <footer className="workspace-footer">Sentiment Analyzer<span>One conversation. A clearer perspective.</span></footer>
  </div>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loginMessage, setLoginMessage] = useState('');
  function logout(message = '') { setLoginMessage(message); setSession(null); }
  return session ? <Workspace session={session} onLogout={logout} /> : <Login onLogin={setSession} message={loginMessage} />;
}

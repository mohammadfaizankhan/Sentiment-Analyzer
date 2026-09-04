import { useEffect, useRef, useState } from 'react';
import './styles.css';
import ResultDashboard from './components/Results';

const SAMPLE = `Customer: I am frustrated because I was charged twice for my subscription.
Agent: I am sorry about the duplicate charge. I will check your account now.
Customer: I tried to contact support yesterday and nobody helped me.
Agent: I found the extra payment and have submitted a refund.
Customer: When will the money arrive?
Agent: The refund should reach your account within five business days.
Customer: Thank you, that is helpful. Please email the confirmation.
Agent: I have sent the confirmation email. Is there anything else I can help with?
Customer: No, thank you for resolving this.`;

function Logo() {
  return <div className="logo"><span className="logo-mark" aria-hidden="true">S</span>SignalSense</div>;
}

async function apiRequest(path, { method = 'POST', body, timeout = 30_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(path, {
      method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
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
    if (error instanceof TypeError) throw new Error('Cannot reach the server. Please check your connection and try again.');
    throw error;
  } finally { clearTimeout(timer); }
}

function AuthScreen({ onLogin, message }) {
  const [mode, setMode] = useState('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(message || '');
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const data = await apiRequest('/api/auth', { body: { action: mode, name, email: email.trim(), password } });
      onLogin(data.user);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell">
    <section className="auth-story"><Logo /><div className="eyebrow"><span />Conversation intelligence</div>
      <h1>Turn every call into a <em>clear next move.</em></h1>
      <p>Upload a transcript and see explainable sentiment, emotional signals, outcome quality, and the KPIs that matter.</p>
      <div className="feature-row"><div><b>Sentence-level</b><span>Explainable sentiment</span></div><div><b>Evidence-led</b><span>Optional AI insights</span></div><div><b>Privacy-first</b><span>No saved transcripts</span></div></div>
    </section>
    <section className="auth-panel"><div className="auth-card"><div className="mobile-logo"><Logo /></div>
      <p className="kicker">YOUR CONVERSATION WORKSPACE</p><h2>{mode === 'register' ? 'Start with clarity.' : 'Welcome back.'}</h2>
      <p className="muted">{mode === 'register' ? 'Create your account and turn conversations into understanding.' : 'Sign in to continue analyzing your conversations.'}</p>
      <div className="segmented" aria-label="Account access">{[['register', 'Register'], ['login', 'Sign in']].map(([value, label]) => <button type="button" key={value} className={mode === value ? 'active' : ''} aria-pressed={mode === value} disabled={busy} onClick={() => { setMode(value); setError(''); setPassword(''); setShowPassword(false); }}>{label}</button>)}</div>
      <form onSubmit={submit} aria-busy={busy}>
        {mode === 'register' && <label>Full name<input name="name" autoComplete="name" value={name} minLength={2} maxLength={60} required disabled={busy} onChange={e => { setName(e.target.value); setError(''); }} placeholder="Your full name" /></label>}
        <label>Email address<input name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} maxLength={254} required disabled={busy} onChange={e => { setEmail(e.target.value); setError(''); }} placeholder="you@example.com" /></label>
        <label htmlFor="password">Password</label><div className="password-field"><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} minLength={8} maxLength={128} required disabled={busy} onChange={e => { setPassword(e.target.value); setError(''); }} placeholder="At least 8 characters" aria-describedby={error ? 'auth-error' : undefined} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} disabled={busy}>{showPassword ? 'Hide' : 'Show'}</button></div>
        {error && <p id="auth-error" className="error" role="alert">{error}</p>}
        <button className="primary full" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in to workspace'}<span aria-hidden="true">→</span></button>
      </form><p className="terms">Your session stays signed in for 24 hours.<br />Transcripts are processed for analysis and are not saved.</p>
    </div></section>
  </main>;
}

function Workspace({ session, onLogout }) {
  const [text, setText] = useState('');
  const [filename, setFilename] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [includeInsights, setIncludeInsights] = useState(false);
  const inputRef = useRef(null);
  const locked = busy || reading || signingOut;
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [result]);
  async function selectFile(candidate) {
    setError(''); setText(''); setFilename('');
    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith('.txt')) { setError('Please choose a .txt file.'); return; }
    if (candidate.size > 100_000) { setError('Choose a file no larger than 100 KB.'); return; }
    if (!candidate.size) { setError('This file is empty. Add conversation text and try again.'); return; }
    setReading(true);
    try {
      // Fatal decoding avoids silently replacing invalid bytes before server validation.
      const content = new TextDecoder('utf-8', { fatal: true }).decode(await candidate.arrayBuffer());
      if (!content.trim()) throw new Error('This file is empty. Add conversation text and try again.');
      if ([...content].some(character => character.charCodeAt(0) < 32 && !'\n\r\t'.includes(character))) throw new Error('The file contains binary or unsupported control characters.');
      setText(content); setFilename(candidate.name);
    } catch (err) { setError(err instanceof TypeError ? 'Save your transcript as UTF-8 text and try again.' : err.message); }
    finally { setReading(false); }
  }
  async function analyze(event) {
    event.preventDefault();
    if (!text.trim() || locked) return;
    setError('');
    const file = new File([text], filename || 'pasted-transcript.txt', { type: 'text/plain' });
    if (file.size > 100_000) { setError('Choose text no larger than 100 KB.'); return; }
    setBusy(true);
    try {
      const form = new FormData(); form.append('file', file); form.append('include_insights', String(includeInsights));
      setResult(await apiRequest('/api/analyze', { body: form, timeout: includeInsights ? 65_000 : 30_000 }));
    } catch (err) {
      if (err.status === 401) { onLogout('Your session has expired. Please sign in again.'); return; }
      setError(err.message);
    } finally { setBusy(false); }
  }
  async function logout() {
    setSigningOut(true); setError('');
    try { await apiRequest('/api/auth', { body: { action: 'logout' } }); onLogout(); }
    catch (err) { setError(err.message); }
    finally { setSigningOut(false); }
  }
  return <><header><Logo /><div className="header-right"><span className="live"><i />Local analysis ready</span><span className="avatar" aria-hidden="true">{session.name?.[0]?.toUpperCase() || 'S'}</span><div className="user"><b>{session.name}</b><small>{session.email}</small></div><button className="logout" disabled={locked} onClick={logout}>{signingOut ? 'Signing out…' : 'Sign out'}</button></div></header>
    <main className="workspace">
      <div className="intro"><div><p className="kicker">CONVERSATION INTELLIGENCE</p><h1>{result ? 'Your conversation, understood.' : 'What happened in this call?'}</h1><p>Go beyond positive or negative. Understand the tone, follow the conversation, and find the moments that matter.</p></div><div className="privacy"><span aria-hidden="true">✓</span><div><b>Your transcripts stay unsaved</b><small>Local sentiment by default. AI processing only when you choose it.</small></div></div></div>
      {result ? <><button className="text-button back-button" onClick={() => { setResult(null); setError(''); }} disabled={locked}>← New analysis</button>{error && <p className="error" role="alert">{error}</p>}<ResultDashboard result={result} /></> : <div className="analyze-layout">
        <section className="upload-card" aria-labelledby="upload-title"><div className="mode-head"><h2 id="upload-title">Conversation text</h2><button className="sample-button" disabled={locked} onClick={() => { setText(SAMPLE); setFilename('sample-call.txt'); setError(''); }}>Load sample call</button></div>
          <form onSubmit={analyze}>
            <div className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); if (!locked) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (!locked) selectFile(e.dataTransfer.files[0]); }}>
              <input ref={inputRef} type="file" accept=".txt,text/plain" disabled={locked} aria-label="Choose a transcript file" onChange={e => { selectFile(e.target.files?.[0]); e.target.value = ''; }} />
              <div className="upload-icon" aria-hidden="true">↑</div><b>{reading ? 'Reading transcript…' : filename || 'Drop your transcript here'}</b><p>or click to browse · .txt · UTF-8 · up to 100 KB</p>
            </div><div className="or">OR PASTE BELOW</div>
            <label className="sr-only" htmlFor="conversation">Conversation transcript</label><textarea id="conversation" rows={10} disabled={locked} value={text} onChange={e => { setText(e.target.value); setFilename(''); setError(''); }} placeholder={'Customer: I need help with my recent order.\nAgent: Of course. Let me look into that for you…'} />
            <div className="textarea-foot"><span>{text.length.toLocaleString()} characters</span><button type="button" disabled={locked || !text} onClick={() => { setText(''); setFilename(''); setError(''); }}>Clear text</button></div>
            <label className="insights-option"><input type="checkbox" checked={includeInsights} disabled={locked} onChange={e => setIncludeInsights(e.target.checked)} /><span><strong>Add AI insights</strong><small>Summary, call outcome, emotions, and contextual review</small></span></label>
            {includeInsights && <p className="provider-note">Sends transcript text to NVIDIA. Up to 100 sentences / 12,000 characters. AI interpretations include supporting evidence.</p>}
            {error && <p className="error" role="alert">{error}</p>}<button className="primary analyze" type="submit" disabled={!text.trim() || locked}>{busy ? <><span className="spinner" aria-hidden="true" />Analyzing…</> : <>Analyze conversation<span aria-hidden="true">→</span></>}</button>
            <p className="terms">English text · up to 500 sentences. The app does not save transcripts.</p>
          </form>
        </section><aside><section className="process-card"><p className="kicker">FROM WORDS TO UNDERSTANDING</p><h2>A clearer picture.</h2>{[['Sentence sentiment', 'See positive, neutral, and negative wording.'], ['Conversation arc', 'Follow how sentiment changes throughout the call.'], ['Calculated KPIs', 'Explore speaker sentiment and score variation.'], ['Optional AI insights', 'Review emotions and outcomes with evidence.']].map(([title, description], i) => <div className="process" key={title}><span>0{i + 1}</span><div><b>{title}</b><p>{description}</p></div></div>)}</section><div className="tip"><span aria-hidden="true">✦</span><div><b>A little formatting helps</b><p>Use one speaking turn per line. Add Customer: and Agent: labels to distinguish speakers.</p></div></div></aside>
      </div>}<div className="sr-only" role="status">{busy ? 'Analyzing your conversation.' : result ? `Analysis complete. Overall sentiment: ${result.overall_sentiment}.` : ''}</div>
    </main><footer className="workspace-footer">SignalSense<span>One conversation. A clearer perspective.</span></footer></>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    apiRequest('/api/auth', { method: 'GET' }).then(data => { if (active) setSession(data.user); })
      .catch(error => { if (active) setMessage(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  if (loading) return <div className="boot"><Logo /><div className="spinner" role="status" aria-label="Checking your session" /></div>;
  return session ? <Workspace session={session} onLogout={(note = '') => { setSession(null); setMessage(note); }} /> : <AuthScreen onLogin={setSession} message={message} />;
}

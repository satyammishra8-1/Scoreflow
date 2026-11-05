import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import './AuthPage.css';

export default function AuthPage({ mode }) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [eventId, setEventId] = useState(searchParams.get('eventId') || '');
  const [password, setPassword] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const setup = mode === 'setup';
  const judge = mode === 'judge';

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = { email, password, ...(judge ? { eventId } : {}) };
      const result = await signIn(setup ? '/auth/organizer/setup' : judge ? '/auth/judge/login' : '/auth/organizer/login', payload,
        setup ? { 'X-Organizer-Setup-Token': setupToken } : undefined);
      if (setup) navigate('/organizer/dashboard', { replace: true });
      else if (judge) navigate(`/judge/${encodeURIComponent(result.eventId)}/${encodeURIComponent(result.judgeId)}`, { replace: true });
      else navigate(location.state?.from || '/organizer/dashboard', { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || 'Unable to sign in.');
    } finally { setBusy(false); }
  }

  return <main className="auth-page"><section className="auth-card">
    <div className="auth-brand-row">
      <Link to="/" className="auth-brand"><span className="dashboard-brand-mark">S</span>ScoreFlow</Link>
    </div>
    <p className="auth-eyebrow">{setup ? 'INITIAL ORGANIZER SETUP' : judge ? 'JUDGE ACCESS' : 'ORGANIZER ACCESS'}</p>
    <h1>{setup ? 'Set up your organizer account' : judge ? 'Judge sign in' : 'Welcome back'}</h1>
    <p className="auth-description">{setup ? 'Create an account for an email authorized by your deployment administrator.' : judge ? 'Use the email, password and event ID associated with your invitation.' : 'Sign in to manage your ScoreFlow events.'}</p>
    <form onSubmit={submit}>
      {setup && <label>One time setup token<input type="password" autoComplete="off" value={setupToken} onChange={(e) => setSetupToken(e.target.value)} required /></label>}
      <label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      {judge && <label>Event ID<input autoComplete="off" value={eventId} onChange={(e) => setEventId(e.target.value)} required /></label>}
      <label>Password<input type="password" autoComplete={setup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={setup ? 12 : undefined} /></label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Please wait…' : setup ? 'Create account' : 'Sign in'}</button>
    </form>
    <nav className="auth-links" aria-label="Account options">
      {!judge && <Link to="/judge/login">Judge sign in</Link>}
      {judge && <Link to="/organizer/login">Organizer sign in</Link>}
      {!setup && <Link to="/organizer/setup">Initial organizer setup</Link>}
    </nav>
  </section></main>;
}

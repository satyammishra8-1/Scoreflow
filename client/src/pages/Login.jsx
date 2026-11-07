import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import './Login.css';

export default function Login({ initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode);
  const [role, setRole] = useState('organizer');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { session, loading, signIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const registering = mode === 'register';

  if (loading) return <p className="route-loading" role="status">Checking your session…</p>;
  if (session) return <Navigate to={session.role === 'judge' ? `/judge/${session.eventId}/${session.judgeId}` : '/organizer/dashboard'} replace />;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    try {
      if (registering) {
        await signIn('/auth/organizer/setup', { email, password }, { 'x-organizer-setup-token': String(form.get('setupToken') || '') });
        navigate('/organizer/dashboard', { replace: true });
      } else if (role === 'judge') {
        const data = await signIn('/auth/judge/login', { email, password, eventId: String(form.get('eventId') || '').trim() });
        navigate(`/judge/${data.eventId}/${data.judgeId}`, { replace: true });
      } else {
        await signIn('/auth/organizer/login', { email, password });
        const destination = location.state?.from;
        navigate(destination?.pathname?.startsWith('/organizer/') ? destination.pathname : '/organizer/dashboard', { replace: true });
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || 'Unable to sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-label={registering ? 'Create organizer account' : 'Sign in'}>
        <Link className="auth-brand" to="/" aria-label="ScoreFlow home">
          <span className="auth-logo" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M7 21.5 13 15l4.2 4.2L25 10"/><path d="M19.5 10H25v5.5"/></svg></span>
          <span className="auth-brand-copy"><strong>ScoreFlow</strong><small>Competition scoring, made clear.</small></span>
        </Link>

        <div className="auth-tabs" role="tablist" aria-label="Account access">
          <button type="button" role="tab" aria-selected={!registering} className={!registering ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Log in</button>
          <button type="button" role="tab" aria-selected={registering} className={registering ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Create account</button>
        </div>

        <h1>{registering ? 'Create an organizer account' : 'Welcome back'}</h1>
        <form className="auth-form" onSubmit={submit}>
          {!registering && <label className="auth-field">Account type<select name="role" value={role} onChange={(event) => setRole(event.target.value)}><option value="organizer">Organizer</option><option value="judge">Judge</option></select></label>}
          {registering && <p className="auth-help">Organizer accounts are limited to the configured email allowlist and require an administrator setup token.</p>}
          {registering && <label className="auth-field">Setup token<input type="password" name="setupToken" autoComplete="off" required /></label>}
          {role === 'judge' && !registering && <label className="auth-field">Event ID<input type="text" name="eventId" autoComplete="off" required /></label>}
          <label className="auth-field">Email<input type="email" name="email" autoComplete="email" required /></label>
          <label className="auth-field">
            <span className="auth-label-row"><span>Password</span></span>
            <span className="password-input"><input type={showPassword ? 'text' : 'password'} name="password" autoComplete={registering ? 'new-password' : 'current-password'} minLength={registering ? 12 : undefined} required /><button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg></button></span>
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : registering ? 'Create account' : 'Log in'}</button>
        </form>
        <p className="auth-switch">{registering ? 'Already have an account?' : 'Need to create an account?'} <button type="button" onClick={() => { setMode(registering ? 'login' : 'register'); setError(''); }}>{registering ? 'Log in' : 'Create an account'}</button></p>
      </section>
    </main>
  );
}

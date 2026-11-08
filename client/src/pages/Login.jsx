import { useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { buildOrganizerSignupPayload } from '../auth/organizerSignup';
import './Login.css';

export default function Login({ initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const submitting = useRef(false);
  const { session, loading, signIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const registering = mode === 'register';

  if (loading) return <p className="route-loading" role="status">Checking your session…</p>;
  if (session) return <Navigate to={session.role === 'judge' ? `/judge/${session.eventId}/${session.judgeId}` : '/organizer/dashboard'} replace />;

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    const confirmPassword = String(form.get('confirmPassword') || '');
    if (registering && (!name || name.length > 100)) {
      setError('Enter your full name (up to 100 characters).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      setError('Enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    if (registering && (password.length < 8 || new TextEncoder().encode(password).length > 72)) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    if (registering && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      if (registering) {
        await signIn('/auth/organizer/register', buildOrganizerSignupPayload({ name, email, password }));
        setStatus('Account created. Opening your dashboard…');
        navigate('/organizer/dashboard', { replace: true });
      } else {
        await signIn('/auth/organizer/login', { email: email.toLowerCase(), password });
        const destination = location.state?.from;
        navigate(destination?.pathname?.startsWith('/organizer/') ? destination.pathname : '/organizer/dashboard', { replace: true });
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || 'Unable to sign in. Please try again.');
    } finally {
      submitting.current = false;
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
          <button type="button" role="tab" aria-selected={!registering} className={!registering ? 'active' : ''} onClick={() => { setMode('login'); setError(''); setStatus(''); }}>Log in</button>
          <button type="button" role="tab" aria-selected={registering} className={registering ? 'active' : ''} onClick={() => { setMode('register'); setError(''); setStatus(''); }}>Create account</button>
        </div>

        <h1>{registering ? 'Create an organizer account' : 'Welcome back'}</h1>
        <form className="auth-form" onSubmit={submit} noValidate>
          {registering && <label className="auth-field">Full Name<input type="text" name="name" autoComplete="name" maxLength={100} required /></label>}
          <label className="auth-field">Email Address<input type="email" name="email" autoComplete="email" required /></label>
          <label className="auth-field">
            <span className="auth-label-row"><span>Password</span></span>
            <span className="password-input"><input type={showPassword ? 'text' : 'password'} name="password" autoComplete={registering ? 'new-password' : 'current-password'} minLength={registering ? 8 : undefined} required /><button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg></button></span>
          </label>
          {registering && <label className="auth-field">
            <span className="auth-label-row"><span>Confirm Password</span></span>
            <span className="password-input"><input type={showConfirmPassword ? 'text' : 'password'} name="confirmPassword" autoComplete="new-password" minLength={8} required /><button type="button" className="password-toggle" aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'} onClick={() => setShowConfirmPassword((visible) => !visible)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg></button></span>
          </label>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          {status && <p className="auth-help" role="status">{status}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : registering ? 'Create account' : 'Log in'}</button>
        </form>
        <p className="auth-switch">{registering ? 'Already have an account?' : 'Need to create an account?'} <button type="button" onClick={() => { setMode(registering ? 'login' : 'register'); setError(''); setStatus(''); }}>{registering ? 'Log in' : 'Create an account'}</button></p>
      </section>
    </main>
  );
}

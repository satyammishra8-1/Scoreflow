import { useState } from 'react';
import { Link } from 'react-router-dom';
import './Login.css';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [showPassword, setShowPassword] = useState(false);
  const registering = mode === 'register';

  return (
    <main className="auth-page">
      <section className="auth-card" aria-label={registering ? 'Create account' : 'Login'}>
        <Link className="auth-brand" to="/" aria-label="Score Flow home">
          <span className="auth-logo" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M7 21.5 13 15l4.2 4.2L25 10"/><path d="M19.5 10H25v5.5"/></svg></span>
          <span className="auth-brand-copy"><strong>Score Flow</strong><small>Competition scoring, made clear.</small></span>
        </Link>

        <div className="auth-tabs" role="tablist" aria-label="Account access">
          <button type="button" role="tab" aria-selected={!registering} className={!registering ? 'active' : ''} onClick={() => setMode('login')}>Log in</button>
          <button type="button" role="tab" aria-selected={registering} className={registering ? 'active' : ''} onClick={() => setMode('register')}>Create account</button>
        </div>

        <h1>{registering ? 'Create your account' : 'Welcome back'}</h1>
        <form className="auth-form" onSubmit={(event) => event.preventDefault()}>
          {registering && <label className="auth-field">Name<input type="text" name="name" autoComplete="name" /></label>}
          <label className="auth-field">Email<input type="email" name="email" autoComplete="email" /></label>
          <label className="auth-field">
            <span className="auth-label-row"><span>Password</span>{!registering && <a href="#forgot" onClick={(event) => event.preventDefault()}>Forgot it?</a>}</span>
            <span className="password-input"><input type={showPassword ? 'text' : 'password'} name="password" autoComplete={registering ? 'new-password' : 'current-password'} /><button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg></button></span>
          </label>
          <button className="auth-submit" type="submit">{registering ? 'Create account' : 'Log in'}</button>
        </form>
        <p className="auth-switch">{registering ? 'Already have an account?' : 'New to Loop?'} <button type="button" onClick={() => setMode(registering ? 'login' : 'register')}>{registering ? 'Log in' : 'Create an account'}</button></p>
        <p className="auth-note">Demo — nothing is sent.</p>
      </section>
    </main>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../auth/api';

export default function OrganizerVerification() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return undefined;
    started.current = true;
    api.post('/auth/organizer/verify', { token }).then(() => {
      navigate('/login', { replace: true, state: { verificationSuccess: true } });
    }).catch((requestError) => {
      setError(requestError.response?.data?.error || 'This verification link is invalid or expired.');
    });
    return undefined;
  }, [navigate, token]);

  return <main className="auth-page"><section className="auth-card">
    <h1>Verify your email</h1>
    {error ? <><p className="auth-error" role="alert">{error}</p><Link to="/signup">Return to signup</Link></> : <p role="status">Verifying your email…</p>}
  </section></main>;
}

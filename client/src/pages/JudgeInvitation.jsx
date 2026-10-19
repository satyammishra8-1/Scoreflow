import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import './JudgeInvitation.css';

const API = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api' });

function JudgeInvitation() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    API.get(`/judge-invitations/${encodeURIComponent(token)}`)
      .then((response) => {
        if (!cancelled) setInvitation(response.data?.data || null);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(requestError.response?.status === 410
          ? 'This invitation has expired. Please ask the organizer to resend the invitation.'
          : requestError.response?.data?.error || 'This invitation link is invalid or has already been used.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  async function acceptInvitation() {
    setAccepting(true);
    setError('');
    try {
      const response = await API.post('/judge-invitations/accept', { token });
      const acceptedInvite = response.data?.data;
      if (!acceptedInvite?.eventId || !acceptedInvite?.judgeId) throw new Error('The invitation was accepted, but the judge dashboard could not be identified.');
      setAccepted(true);
      window.setTimeout(() => navigate(`/judge/${encodeURIComponent(acceptedInvite.eventId)}/${encodeURIComponent(acceptedInvite.judgeId)}`, { replace: true }), 700);
    } catch (requestError) {
      setError(requestError.response?.status === 410
        ? 'This invitation has expired. Please ask the organizer to resend the invitation.'
        : requestError.response?.data?.error || requestError.message || 'Unable to accept this invitation.');
      setAccepting(false);
    }
  }

  return (
    <main className="judge-invitation-page">
      <section className="judge-invitation-card">
        <span className="judge-invitation-brand">ScoreFlow</span>
        <h1>Judge Invitation</h1>
        {loading ? <p role="status">Checking your invitation...</p>
          : error && !invitation ? <p className="judge-invitation-error" role="alert">{error}</p>
            : invitation && <>
              <dl className="judge-invitation-details">
                <div><dt>Event</dt><dd>{invitation.eventName}</dd></div>
                <div><dt>Invited judge</dt><dd>{invitation.judgeName}</dd></div>
                {invitation.eventDate && <div><dt>Event date</dt><dd>{new Date(`${String(invitation.eventDate).slice(0, 10)}T00:00:00`).toLocaleDateString()}</dd></div>}
                <div><dt>Invitation status</dt><dd>{accepted ? 'Accepted' : 'Pending'}</dd></div>
              </dl>
              {accepted ? <p className="judge-invitation-success" role="status">Invitation accepted. Opening your Judge Dashboard...</p>
                : <><p className="judge-invitation-copy">Accept this invitation to verify your email address and access your event's Judge Dashboard.</p>
                  {error && <p className="judge-invitation-error" role="alert">{error}</p>}
                  <button className="judge-invitation-button" type="button" onClick={acceptInvitation} disabled={accepting}>{accepting ? 'Accepting...' : 'Accept Invitation'}</button>
                </>}
            </>}
      </section>
    </main>
  );
}

export default JudgeInvitation;

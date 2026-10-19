import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import OrganizerLayout from './OrganizerLayout';
import './OrganizerDashboard.css';
import './OrganizerAnnouncements.css';

const API = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api' });
const idOf = (row) => String(row?.judgeId || row?.teamId || row?._id || row?.id || '');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const getError = (error, fallback) => error?.response?.data?.error || fallback;

function OrganizerAnnouncements() {
  const { eventId = '' } = useParams();
  const [event, setEvent] = useState(null);
  const [judges, setJudges] = useState([]);
  const [teams, setTeams] = useState([]);
  const [history, setHistory] = useState([]);
  const [audienceType, setAudienceType] = useState('judges');
  const [recipientMode, setRecipientMode] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadHistory() {
    const result = await API.get(`/events/${encodeURIComponent(eventId)}/announcements`);
    setHistory(Array.isArray(result.data?.data) ? result.data.data : []);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [eventResult, judgesResult, teamsResult, historyResult] = await Promise.all([
          API.get(`/events/${encodeURIComponent(eventId)}`),
          API.get(`/events/${encodeURIComponent(eventId)}/judges`),
          API.get(`/events/${encodeURIComponent(eventId)}/teams`),
          API.get(`/events/${encodeURIComponent(eventId)}/announcements`),
        ]);
        if (cancelled) return;
        const eventData = eventResult.data?.data;
        const scopedId = String(eventData?.eventId || eventData?._id || eventId);
        if (!eventResult.data?.success || scopedId !== String(eventId)) throw new Error('Unable to load this event.');
        setEvent(eventData);
        setJudges((judgesResult.data?.data || []).filter((item) => String(item.eventId) === scopedId));
        setTeams((teamsResult.data?.data || []).filter((item) => String(item.eventId) === scopedId));
        setHistory(historyResult.data?.data || []);
      } catch (loadError) {
        if (!cancelled) setError(getError(loadError, 'Unable to load this event.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [eventId]);

  const audience = audienceType === 'judges' ? judges : teams;
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const chosen = recipientMode === 'all' ? audience : audience.filter((row) => selected.has(idOf(row)));
  const emails = chosen.flatMap((row) => audienceType === 'judges'
    ? [String(row.email || '').trim().toLowerCase()]
    : (Array.isArray(row.members) ? row.members : []).map((member) => String(member.email || '').trim().toLowerCase()))
    .filter((email) => emailPattern.test(email));
  const recipientCount = new Set(emails).size;
  const selectedCount = chosen.length;

  function changeAudience(value) {
    setAudienceType(value);
    setSelectedIds([]);
    setRecipientMode('all');
    setError('');
    setNotice('');
  }
  function toggleRecipient(id) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }
  async function sendAnnouncement() {
    setSending(true);
    setError('');
    setNotice('');
    try {
      const response = await API.post(`/events/${encodeURIComponent(eventId)}/announcements`, {
        audienceType, recipientMode,
        ...(recipientMode === 'specific' ? { recipientIds: selectedIds } : {}),
        subject: subject.trim(), message: message.trim(),
      });
      const delivery = response.data?.data;
      const deliveryNotice = `${response.data?.deliveryMessage || 'Announcement processing finished.'} ${delivery?.sentCount ?? 0} sent, ${delivery?.failedCount ?? 0} failed.`;
      if (delivery?.status === 'failed') setError(deliveryNotice);
      else setNotice(deliveryNotice);
      setSubject(''); setMessage(''); setSelectedIds([]); setRecipientMode('all');
      await loadHistory();
    } catch (sendError) {
      setError(getError(sendError, 'Unable to send this announcement.'));
    } finally {
      setSending(false); setConfirming(false);
    }
  }

  return (
    <OrganizerLayout activeKey="events" wrapperClassName="announcements-page" contentClassName="announcements-content" eventId={eventId}>
      <header className="announcements-header"><div>
        <Link className="announcement-back" to={`/organizer/events/${encodeURIComponent(eventId)}`}>← Event Workspace</Link>
        <p className="announcement-eyebrow">{event?.name || 'Event'}</p><h1>Announcements</h1><p>Send event updates to judges or team members.</p>
      </div></header>
      {loading ? <section className="announcement-panel"><p>Loading event and recipients…</p></section>
        : error && !event ? <section className="announcement-panel" role="alert"><p>{error}</p></section>
          : <>
            {error && <p className="announcement-alert" role="alert">{error}</p>}
            {notice && <p className="announcement-notice" role="status">{notice}</p>}
            <div className="announcement-layout">
              <section className="announcement-panel announcement-composer" aria-labelledby="announcement-compose-title">
                <div className="announcement-panel-heading"><div><span>COMPOSE</span><h2 id="announcement-compose-title">New announcement</h2></div></div>
                <div className="announcement-field"><span className="announcement-label">Audience</span>
                  <div className="announcement-segmented"><button type="button" className={audienceType === 'judges' ? 'active' : ''} onClick={() => changeAudience('judges')}>Judges <small>{judges.length}</small></button>
                    <button type="button" className={audienceType === 'teams' ? 'active' : ''} onClick={() => changeAudience('teams')}>Teams <small>{teams.length}</small></button></div>
                </div>
                <div className="announcement-field"><span className="announcement-label">Recipients</span>
                  <div className="announcement-radio-row"><label><input type="radio" name="recipientMode" checked={recipientMode === 'all'} onChange={() => { setRecipientMode('all'); setSelectedIds([]); }} /> All {audienceType}</label>
                    <label><input type="radio" name="recipientMode" checked={recipientMode === 'specific'} onChange={() => setRecipientMode('specific')} /> Specific</label></div>
                </div>
                {recipientMode === 'specific' && <div className="announcement-recipient-list" aria-label={`Select ${audienceType}`}>
                  {audienceType === 'teams' && <p className="announcement-help">Every member with an email on a selected team will receive the message. Duplicate email addresses are sent once.</p>}
                  {audience.map((item) => {
                    const id = idOf(item);
                    const memberEmails = audienceType === 'teams' ? new Set((item.members || []).map((member) => String(member.email || '').trim().toLowerCase()).filter((email) => emailPattern.test(email))).size : 1;
                    return <label className="announcement-recipient" key={id}><input type="checkbox" checked={selected.has(id)} onChange={() => toggleRecipient(id)} />
                      <span className="announcement-recipient-copy"><strong>{audienceType === 'judges' ? item.name : `${item.teamNumber || item.number || 'Team'} — ${item.teamName || item.name || ''}`}</strong>
                        {audienceType === 'judges' ? <small>{item.email}</small> : <small>Members: {(item.members || []).length} · Recipients: {memberEmails} email{memberEmails === 1 ? '' : 's'}</small>}</span></label>;
                  })}
                  {audience.length === 0 && <p className="announcement-help">No {audienceType} belong to this event yet.</p>}
                  <p className="announcement-selection-count">{selectedCount} {audienceType} selected</p>
                </div>}
                <label className="announcement-field"><span className="announcement-label">Subject</span><input maxLength={200} value={subject} onChange={(eventValue) => setSubject(eventValue.target.value)} placeholder="Event update" /></label>
                <label className="announcement-field"><span className="announcement-label">Message</span><textarea maxLength={10000} rows={7} value={message} onChange={(eventValue) => setMessage(eventValue.target.value)} placeholder="Write your announcement…" /><small className="announcement-character-count">{message.length} / 10000</small></label>
                <div className="announcement-preview"><div className="announcement-panel-heading"><div><span>PREVIEW</span><h3>{subject.trim() || 'Subject preview'}</h3></div></div>
                  <p className="announcement-preview-body">{message.trim() || 'Your message preview will appear here.'}</p>
                  <div className="announcement-preview-foot"><span>{recipientMode === 'all' ? `All ${audienceType}` : `${selectedCount} selected ${audienceType}`}</span><strong>{recipientCount} unique email{recipientCount === 1 ? '' : 's'}</strong></div></div>
                <button className="announcement-send-button" type="button" disabled={sending || !subject.trim() || !message.trim() || recipientCount === 0 || (recipientMode === 'specific' && selectedCount === 0)} onClick={() => setConfirming(true)}>Review and Send</button>
              </section>
              <aside className="announcement-side-note"><span>RECIPIENT SUMMARY</span><strong>{recipientCount}</strong><p>unique email address{recipientCount === 1 ? '' : 'es'} will receive this announcement.</p><small>Email addresses are resolved from the saved event records.</small></aside>
            </div>
            <section className="announcement-panel announcement-history" aria-labelledby="announcement-history-title">
              <div className="announcement-panel-heading"><div><span>EVENT RECORD</span><h2 id="announcement-history-title">Announcement history</h2></div><small>{history.length} {history.length === 1 ? 'announcement' : 'announcements'}</small></div>
              {history.length ? <div className="announcement-history-list">{history.map((item) => <article className="announcement-history-item" key={item._id}>
                <div className="announcement-history-title"><strong>{item.subject}</strong><span className={`announcement-status announcement-status-${item.status}`}>{item.status}</span></div>
                <p>{item.audienceType === 'judges' ? 'Judges' : 'Teams'} · {item.recipientMode === 'all' ? 'All recipients' : 'Specific recipients'} · {item.recipientCount ?? item.sentCount + item.failedCount} recipients</p>
                <small>{item.sentCount} sent · {item.failedCount} failed · {item.sentAt ? new Date(item.sentAt).toLocaleString() : new Date(item.createdAt).toLocaleString()}</small>
              </article>)}</div> : <p className="announcement-empty">No announcements have been sent for this event.</p>}
            </section>
          </>}
      {confirming && <div className="announcement-confirm-backdrop" role="presentation"><section className="announcement-confirm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <span>CONFIRM DELIVERY</span><h2 id="confirm-title">Send this announcement?</h2><p><strong>{recipientCount}</strong> unique email address{recipientCount === 1 ? '' : 'es'} will receive “{subject.trim()}”.</p>
        <div className="announcement-confirm-actions"><button type="button" className="announcement-cancel-button" onClick={() => setConfirming(false)} disabled={sending}>Review message</button><button type="button" className="announcement-send-button" onClick={sendAnnouncement} disabled={sending}>{sending ? 'Sending…' : 'Confirm and Send'}</button></div>
      </section></div>}
    </OrganizerLayout>
  );
}

export default OrganizerAnnouncements;

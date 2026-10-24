import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import OrganizerLayout from './OrganizerLayout';
import './OrganizerDashboard.css';
import './OrganizerAnnouncements.css';
import './JudgeInvitationTemplate.css';

const API = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api' });
const idOf = (row) => String(row?.judgeId || row?.teamId || row?._id || row?.id || '');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const getError = (error, fallback) => error?.response?.data?.error || fallback;
const formatEventDate = (value) => {
  if (!value) return 'To be announced';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? 'To be announced' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

function WritingModeSelector({ mode, onChange, manualLabel = 'Manual Write' }) {
  return (
    <div className="announcement-writing-mode" role="group" aria-label="Email writing mode">
      <button type="button" aria-pressed={mode === 'manual'} className={mode === 'manual' ? 'active' : ''} onClick={() => onChange('manual')}>{manualLabel}</button>
      <button type="button" aria-pressed={mode === 'ai'} className={mode === 'ai' ? 'active' : ''} onClick={() => onChange('ai')}>✨ Generate with AI</button>
    </div>
  );
}

function OrganizerAnnouncements() {
  const { eventId = '' } = useParams();
  const [event, setEvent] = useState(null);
  const [judges, setJudges] = useState([]);
  const [teams, setTeams] = useState([]);
  const [history, setHistory] = useState([]);
  const [communicationType, setCommunicationType] = useState('announcement');
  const [audienceType, setAudienceType] = useState('judges');
  const [recipientMode, setRecipientMode] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [announcementMode, setAnnouncementMode] = useState('manual');
  const [announcementPrompt, setAnnouncementPrompt] = useState('');
  const [announcementAiDraft, setAnnouncementAiDraft] = useState(null);
  const [hasGeneratedAnnouncementDraft, setHasGeneratedAnnouncementDraft] = useState(false);
  const [generatingAnnouncement, setGeneratingAnnouncement] = useState(false);
  const [invitationMode, setInvitationMode] = useState('manual');
  const [invitationPrompt, setInvitationPrompt] = useState('');
  const [invitationAiDraft, setInvitationAiDraft] = useState(null);
  const [generatingInvitation, setGeneratingInvitation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
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
  const eligibleJudges = judges.filter((judge) => judge.invitationStatus !== 'accepted');
  const invitationRecipients = recipientMode === 'all'
    ? eligibleJudges
    : judges.filter((judge) => selected.has(idOf(judge)) && judge.invitationStatus !== 'accepted');

  function changeCommunicationType(value) {
    setCommunicationType(value);
    setError('');
    setNotice('');
    setSelectedIds([]);
    setRecipientMode('all');
    if (value === 'judge-invitation') setAudienceType('judges');
    if (value === 'judge-invitation') setInvitationMode('manual');
    else {
      setAnnouncementMode('manual');
      setAnnouncementAiDraft(null);
      setHasGeneratedAnnouncementDraft(false);
      setShowEmailPreview(false);
    }
  }

  function changeAudience(value) {
    setAudienceType(value);
    setSelectedIds([]);
    setRecipientMode('all');
    setError('');
    setNotice('');
    setAnnouncementAiDraft(null);
    setHasGeneratedAnnouncementDraft(false);
    setShowEmailPreview(false);
  }
  function toggleRecipient(id) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function generateAnnouncementDraft() {
    setGeneratingAnnouncement(true);
    setError('');
    setNotice('');
    setAnnouncementAiDraft(null);
    setHasGeneratedAnnouncementDraft(false);
    setShowEmailPreview(false);
    try {
      const response = await API.post(`/events/${encodeURIComponent(eventId)}/announcements/ai-draft`, {
        prompt: announcementPrompt.trim(), audienceType,
      });
      const draft = response.data?.data?.emailDraft;
      if (!draft?.subject || !draft?.body) throw new Error(response.data?.error || 'AI returned an incomplete email draft.');
      setAnnouncementAiDraft({ subject: draft.subject, body: draft.body });
      setHasGeneratedAnnouncementDraft(true);
    } catch (generationError) {
      setError(getError(generationError, generationError.message || 'Unable to generate an announcement draft.'));
    } finally {
      setGeneratingAnnouncement(false);
    }
  }

  async function generateInvitationDraft() {
    setGeneratingInvitation(true);
    setError('');
    setNotice('');
    try {
      const response = await API.post(`/events/${encodeURIComponent(eventId)}/judge-invitations/ai-draft`, {
        prompt: invitationPrompt.trim(),
      });
      const draft = response.data?.data?.emailDraft;
      if (!draft?.subject || !draft?.body) throw new Error(response.data?.error || 'AI returned an incomplete invitation draft.');
      setInvitationAiDraft({ subject: draft.subject, body: draft.body });
    } catch (generationError) {
      setError(getError(generationError, generationError.message || 'Unable to generate an invitation draft.'));
    } finally {
      setGeneratingInvitation(false);
    }
  }

  const announcementSubject = announcementMode === 'ai' && hasGeneratedAnnouncementDraft ? announcementAiDraft?.subject || '' : subject;
  const announcementMessage = announcementMode === 'ai' && hasGeneratedAnnouncementDraft ? announcementAiDraft?.body || '' : message;
  const hasValidAnnouncementRecipients = recipientCount > 0 && (recipientMode !== 'specific' || selectedCount > 0);
  const canPreviewAnnouncement = announcementMode === 'manual'
    ? Boolean(subject.trim() && message.trim())
    : hasGeneratedAnnouncementDraft && Boolean(announcementAiDraft?.subject?.trim() && announcementAiDraft?.body?.trim());
  const canSendAnnouncement = hasValidAnnouncementRecipients && (announcementMode === 'manual'
    ? Boolean(subject.trim() && message.trim())
    : hasGeneratedAnnouncementDraft && Boolean(announcementAiDraft?.subject?.trim() && announcementAiDraft?.body?.trim()));
  const invitationEmailDraft = invitationMode === 'ai' ? invitationAiDraft : null;

  async function sendAnnouncement() {
    setSending(true);
    setError('');
    setNotice('');
    try {
      if (communicationType === 'judge-invitation') {
        const response = await API.post(`/events/${encodeURIComponent(eventId)}/judge-invitations`, {
          recipientMode,
          ...(recipientMode === 'specific' ? { judgeIds: selectedIds } : {}),
          ...(invitationEmailDraft ? { emailDraft: invitationEmailDraft } : {}),
        });
        const result = response.data?.data;
        const deliveryNotice = `${result?.message || 'Invitation processing finished.'} ${result?.sentCount ?? 0} sent, ${result?.failedCount ?? 0} failed.`;
        if (result?.status === 'failed') setError(deliveryNotice);
        else setNotice(deliveryNotice);
        const judgeResponse = await API.get(`/events/${encodeURIComponent(eventId)}/judges`);
        setJudges((judgeResponse.data?.data || []).filter((item) => String(item.eventId) === String(eventId)));
        setSelectedIds([]);
        setRecipientMode('all');
        return;
      }
      const response = await API.post(`/events/${encodeURIComponent(eventId)}/announcements`, {
        audienceType, recipientMode,
        ...(recipientMode === 'specific' ? { recipientIds: selectedIds } : {}),
        subject: announcementSubject.trim(), message: announcementMessage.trim(),
      });
      const delivery = response.data?.data;
      const deliveryNotice = `${response.data?.deliveryMessage || 'Announcement processing finished.'} ${delivery?.sentCount ?? 0} sent, ${delivery?.failedCount ?? 0} failed.`;
      if (delivery?.status === 'failed') setError(deliveryNotice);
      else setNotice(deliveryNotice);
      setSubject(''); setMessage(''); setAnnouncementAiDraft(null); setHasGeneratedAnnouncementDraft(false); setSelectedIds([]); setRecipientMode('all');
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
            <section className="announcement-template-picker" aria-label="Communication type">
              <button type="button" className={communicationType === 'announcement' ? 'active' : ''} onClick={() => changeCommunicationType('announcement')}>
                <span>GENERAL ANNOUNCEMENT</span><strong>Write an event update</strong><small>Send a custom message to judges or teams.</small>
              </button>
              <button type="button" className={communicationType === 'judge-invitation' ? 'active' : ''} onClick={() => changeCommunicationType('judge-invitation')}>
                <span>SECURE TEMPLATE</span><strong>Judge Invitation</strong><small>Send a personalized, single-use invitation link.</small>
              </button>
            </section>
            <div className="announcement-layout">
              <section className="announcement-panel announcement-composer" aria-labelledby="announcement-compose-title">
                <div className="announcement-panel-heading"><div><span>{communicationType === 'judge-invitation' ? 'SECURE INVITATION' : 'COMPOSE'}</span><h2 id="announcement-compose-title">{communicationType === 'judge-invitation' ? 'Invite judges' : 'New announcement'}</h2></div></div>
                {communicationType === 'announcement' && <div className="announcement-field"><span className="announcement-label">Audience</span>
                  <div className="announcement-segmented"><button type="button" className={audienceType === 'judges' ? 'active' : ''} onClick={() => changeAudience('judges')}>Judges <small>{judges.length}</small></button>
                    <button type="button" className={audienceType === 'teams' ? 'active' : ''} onClick={() => changeAudience('teams')}>Teams <small>{teams.length}</small></button></div>
                </div>}
                <div className="announcement-field"><span className="announcement-label">Recipients</span>
                  <div className="announcement-radio-row"><label><input type="radio" name="recipientMode" checked={recipientMode === 'all'} onChange={() => { setRecipientMode('all'); setSelectedIds([]); }} /> {communicationType === 'judge-invitation' ? `All Judges (${eligibleJudges.length} eligible)` : `All ${audienceType}`}</label>
                    <label><input type="radio" name="recipientMode" checked={recipientMode === 'specific'} onChange={() => setRecipientMode('specific')} /> Specific {communicationType === 'judge-invitation' ? 'Judges' : ''}</label></div>
                </div>
                {recipientMode === 'specific' && communicationType === 'announcement' && <div className="announcement-recipient-list" aria-label={`Select ${audienceType}`}>
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
                {recipientMode === 'specific' && communicationType === 'judge-invitation' && <div className="announcement-recipient-list" aria-label="Select event judges">
                  {judges.map((judge) => {
                    const id = idOf(judge);
                    const accepted = judge.invitationStatus === 'accepted';
                    const status = judge.invitationStatus || 'Not invited';
                    return <label className={`announcement-recipient ${accepted ? 'announcement-recipient-disabled' : ''}`} key={id}>
                      <input type="checkbox" checked={selected.has(id)} disabled={accepted} onChange={() => toggleRecipient(id)} />
                      <span className="announcement-recipient-copy"><strong>{judge.name}</strong><small>{judge.email}</small></span>
                      <span className={`invitation-status invitation-status-${status.toLowerCase()}`}>{status}</span>
                    </label>;
                  })}
                  {judges.length === 0 && <p className="announcement-help">No judges belong to this event yet.</p>}
                  <p className="announcement-selection-count">{invitationRecipients.length} eligible judge{invitationRecipients.length === 1 ? '' : 's'} selected</p>
                </div>}
                {communicationType === 'announcement'
                  ? <WritingModeSelector mode={announcementMode} onChange={(mode) => {
                    if (mode === announcementMode) return;
                    setAnnouncementMode(mode);
                    setAnnouncementAiDraft(null);
                    setHasGeneratedAnnouncementDraft(false);
                    setShowEmailPreview(false);
                  }} />
                  : <WritingModeSelector mode={invitationMode} onChange={setInvitationMode} manualLabel="Manual Invitation" />}
                {communicationType === 'announcement' ? <>
                  {announcementMode === 'ai' && <>
                    <label className="announcement-field"><span className="announcement-label">Describe what you want to communicate</span><textarea maxLength={2000} minLength={10} rows={4} value={announcementPrompt} onChange={(eventValue) => {
                      setAnnouncementPrompt(eventValue.target.value);
                      setAnnouncementAiDraft(null);
                      setHasGeneratedAnnouncementDraft(false);
                      setShowEmailPreview(false);
                    }} placeholder="Share the key update, tone, and details recipients need to know." /><small className="announcement-help">This is an instruction for AI. It will generate a separate editable subject and email body.</small></label>
                    <button className="announcement-ai-button" type="button" onClick={generateAnnouncementDraft} disabled={generatingAnnouncement || announcementPrompt.trim().length < 10}>{generatingAnnouncement ? 'Generating email draft…' : hasGeneratedAnnouncementDraft ? 'Regenerate Email Draft' : 'Generate Email Draft'}</button>
                    {hasGeneratedAnnouncementDraft && announcementAiDraft && <div className="announcement-ai-review"><p className="announcement-ai-review-label">Review and edit your generated draft</p>
                      <label className="announcement-field"><span className="announcement-label">Subject</span><input maxLength={200} value={announcementAiDraft.subject} onChange={(eventValue) => setAnnouncementAiDraft((draft) => ({ ...draft, subject: eventValue.target.value }))} /></label>
                      <label className="announcement-field"><span className="announcement-label">Email Body</span><textarea maxLength={10000} rows={7} value={announcementAiDraft.body} onChange={(eventValue) => setAnnouncementAiDraft((draft) => ({ ...draft, body: eventValue.target.value }))} /><small className="announcement-character-count">{announcementAiDraft.body.length} / 10000</small></label>
                    </div>}
                  </>}
                  {announcementMode === 'manual' && <label className="announcement-field"><span className="announcement-label">Subject</span><input maxLength={200} value={subject} onChange={(eventValue) => setSubject(eventValue.target.value)} placeholder="Event update" /></label>}
                  {announcementMode === 'manual' && <label className="announcement-field"><span className="announcement-label">Message</span><textarea maxLength={10000} rows={7} value={message} onChange={(eventValue) => setMessage(eventValue.target.value)} placeholder="Write your announcement…" /><small className="announcement-character-count">{message.length} / 10000</small></label>}
                  <button className="announcement-preview-button" type="button" onClick={() => setShowEmailPreview(true)} disabled={!canPreviewAnnouncement}>Preview Email</button>
                  {announcementMode === 'manual' && <div className="announcement-preview"><div className="announcement-panel-heading"><div><span>PREVIEW</span><h3>{announcementSubject.trim() || 'Subject preview'}</h3></div></div>
                    <p className="announcement-preview-body">{announcementMessage.trim() || 'Your message preview will appear here.'}</p>
                    <div className="announcement-preview-foot"><span>{recipientMode === 'all' ? `All ${audienceType}` : `${selectedCount} selected ${audienceType}`}</span><strong>{recipientCount} unique email{recipientCount === 1 ? '' : 's'}</strong></div></div>}
                </> : <>
                  {invitationMode === 'ai' && <>
                    <label className="announcement-field"><span className="announcement-label">Invitation context for AI</span><textarea maxLength={2000} minLength={10} rows={4} value={invitationPrompt} onChange={(eventValue) => setInvitationPrompt(eventValue.target.value)} placeholder="Share why you are inviting judges and any invitation tone or context." /></label>
                    <button className="announcement-ai-button" type="button" onClick={generateInvitationDraft} disabled={generatingInvitation || invitationPrompt.trim().length < 10}>{generatingInvitation ? 'Generating draft…' : invitationAiDraft ? 'Regenerate draft' : 'Generate invitation draft'}</button>
                    {invitationAiDraft && <div className="announcement-ai-review"><p className="announcement-ai-review-label">Review and edit your generated invitation</p>
                      <label className="announcement-field"><span className="announcement-label">Subject</span><input maxLength={200} value={invitationAiDraft.subject} onChange={(eventValue) => setInvitationAiDraft((draft) => ({ ...draft, subject: eventValue.target.value }))} /></label>
                      <label className="announcement-field"><span className="announcement-label">Invitation message</span><textarea maxLength={8000} rows={6} value={invitationAiDraft.body} onChange={(eventValue) => setInvitationAiDraft((draft) => ({ ...draft, body: eventValue.target.value }))} /></label>
                    </div>}
                  </>}
                  <button className="announcement-preview-button" type="button" onClick={() => setShowEmailPreview(true)} disabled={invitationMode === 'ai' && (!invitationEmailDraft?.subject?.trim() || !invitationEmailDraft?.body?.trim())}>Preview email</button>
                  <div className="invitation-email-preview">
                  <div className="invitation-email-preview-top"><span>SCOREFLOW</span><small>JUDGE INVITATION</small></div>
                  <div className="invitation-email-preview-body">
                    <p className="invitation-preview-subject">{invitationEmailDraft?.subject || `Invitation to Judge — ${event?.name || 'Event name'}`}</p>
                    <p>Dear {invitationRecipients[0]?.name || 'Judge Name'},</p>
                    <p>You have been invited to serve as a judge for <strong>{event?.name || 'Event name'}</strong>.</p>
                    <p className="invitation-preview-date"><strong>Event Date:</strong> {formatEventDate(event?.date)}</p>
                    {invitationEmailDraft?.body ? <p className="invitation-preview-custom-copy">{invitationEmailDraft.body}</p> : <p>Please click the button below to accept your invitation and access your Judge Dashboard.</p>}
                    <p className="invitation-preview-button-wrap"><span className="invitation-preview-button">Accept Invitation</span></p>
                    <p>Thank you,<br /><strong>ScoreFlow Team</strong></p>
                    <small>This secure invitation link is single-use and expires in 48 hours.</small>
                  </div>
                  <div className="announcement-preview-foot"><span>{recipientMode === 'all' ? 'All eligible judges' : 'Specific judges'}</span><strong>{invitationRecipients.length} invitation{invitationRecipients.length === 1 ? '' : 's'}</strong></div>
                  </div>
                </>}
                <button className="announcement-send-button" type="button"
                  disabled={sending || (communicationType === 'announcement' && !canSendAnnouncement) || (communicationType === 'judge-invitation' && (invitationRecipients.length === 0 || (invitationMode === 'ai' && (!invitationEmailDraft?.subject?.trim() || !invitationEmailDraft?.body?.trim()))))}
                  onClick={() => setConfirming(true)}>{communicationType === 'judge-invitation' ? 'Review and Send Invitations' : 'Review and Send'}</button>
              </section>
              <aside className="announcement-side-note"><span>{communicationType === 'judge-invitation' ? 'INVITATION SUMMARY' : 'RECIPIENT SUMMARY'}</span><strong>{communicationType === 'judge-invitation' ? invitationRecipients.length : recipientCount}</strong><p>{communicationType === 'judge-invitation' ? `eligible judge${invitationRecipients.length === 1 ? '' : 's'} will receive an individual secure invitation.` : `unique email address${recipientCount === 1 ? '' : 'es'} will receive this announcement.`}</p><small>{communicationType === 'judge-invitation' ? 'Accepted invitations are skipped. Each invitation gets its own expiring link.' : 'Email addresses are resolved from the saved event records.'}</small></aside>
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
      {showEmailPreview && <div className="announcement-confirm-backdrop" role="presentation" onMouseDown={(eventValue) => { if (eventValue.target === eventValue.currentTarget) setShowEmailPreview(false); }}><section className="announcement-email-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="email-preview-title">
        <div className="announcement-email-preview-dialog-heading"><div><span>EMAIL PREVIEW</span><h2 id="email-preview-title">{communicationType === 'judge-invitation' ? 'Judge invitation' : 'Announcement'}</h2></div><button type="button" aria-label="Close email preview" onClick={() => setShowEmailPreview(false)}>×</button></div>
        <div className="announcement-email-preview-subject"><small>SUBJECT</small><strong>{communicationType === 'judge-invitation' ? invitationEmailDraft?.subject || `Invitation to Judge — ${event?.name || 'Event name'}` : announcementSubject}</strong></div>
        {communicationType === 'judge-invitation' ? <div className="invitation-email-preview announcement-email-preview-content"><div className="invitation-email-preview-top"><span>SCOREFLOW</span><small>JUDGE INVITATION</small></div><div className="invitation-email-preview-body">
          <p className="announcement-preview-kicker">JUDGE INVITATION</p><h3>Invitation to Judge</h3><p>Dear {invitationRecipients[0]?.name || 'Judge Name'},</p><p>You have been invited to serve as a judge for <strong>{event?.name || 'Event name'}</strong>.</p><p className="invitation-preview-date"><strong>Event Date:</strong> {formatEventDate(event?.date)}</p>
          {invitationEmailDraft?.body ? <p className="invitation-preview-custom-copy">{invitationEmailDraft.body}</p> : <p>Please click the button below to accept your invitation and access your Judge Dashboard.</p>}
          <p className="invitation-preview-button-wrap"><span className="invitation-preview-button">Accept Invitation</span></p><p>Thank you,<br /><strong>ScoreFlow Team</strong></p><small>This secure invitation link is single-use and expires in 48 hours.</small>
          <p className="announcement-preview-link-note">Each judge receives their own secure invitation link when you send.</p>
        </div></div> : <article className="announcement-email-preview-content"><div className="announcement-email-preview-brand">SCOREFLOW</div><p className="announcement-preview-event-label">Announcement for {event?.name || 'ScoreFlow event'}</p><h3>{announcementSubject}</h3><p className="announcement-preview-body">{announcementMessage}</p></article>}
        <div className="announcement-confirm-actions"><button type="button" className="announcement-cancel-button" onClick={() => setShowEmailPreview(false)}>Back to editing</button></div>
      </section></div>}
      {confirming && <div className="announcement-confirm-backdrop" role="presentation"><section className="announcement-confirm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <span>CONFIRM DELIVERY</span><h2 id="confirm-title">{communicationType === 'judge-invitation' ? 'Send judge invitations?' : 'Send this announcement?'}</h2><p><strong>{communicationType === 'judge-invitation' ? invitationRecipients.length : recipientCount}</strong> {communicationType === 'judge-invitation' ? 'eligible judges will receive personalized secure invitations.' : `unique email address${recipientCount === 1 ? '' : 'es'} will receive “${announcementSubject.trim()}”.`}</p>
        <div className="announcement-confirm-actions"><button type="button" className="announcement-cancel-button" onClick={() => setConfirming(false)} disabled={sending}>Review message</button><button type="button" className="announcement-send-button" onClick={sendAnnouncement} disabled={sending}>{sending ? 'Sending…' : communicationType === 'judge-invitation' ? 'Confirm and Send' : 'Confirm and Send'}</button></div>
      </section></div>}
    </OrganizerLayout>
  );
}

export default OrganizerAnnouncements;

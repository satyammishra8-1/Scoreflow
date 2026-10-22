import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import OrganizerLayout from './OrganizerLayout';
import { buildEventResults } from '../data/resultsUtils';
import { isDeliveryCurrentForReport, reportIsQualitative, RESULT_REPORT_SECTION_TITLES as titles } from '../data/resultReportPresentation';
import './OrganizerResultReports.css';

const API = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api' });
const idOf = (value) => String(value?.teamId || value?._id || value?.id || '');
const hasValidEmail = (team) => (team?.members || []).some((member) => {
  const email = String(member?.email || '').trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
});
const newRequestId = () => globalThis.crypto?.randomUUID?.() || `report-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function OrganizerResultReports() {
  const { eventId = '' } = useParams();
  const [data, setData] = useState(null);
  const [loadedEventId, setLoadedEventId] = useState('');
  const [reports, setReports] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [previewTeamId, setPreviewTeamId] = useState('');
  const [workingTeamIds, setWorkingTeamIds] = useState([]);
  const [sendingTeamIds, setSendingTeamIds] = useState([]);
  const [bulkSending, setBulkSending] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [deliveryStatuses, setDeliveryStatuses] = useState({});
  const [actionError, setActionError] = useState('');
  const [generationErrors, setGenerationErrors] = useState({});
  const requestEventId = useRef(eventId);
  const selectedTeamContext = useRef(selectedTeamId);
  useLayoutEffect(() => {
    requestEventId.current = eventId;
    selectedTeamContext.current = selectedTeamId;
  }, [eventId, selectedTeamId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const paths = [
          `/events/${encodeURIComponent(eventId)}`,
          `/events/${encodeURIComponent(eventId)}/teams`,
          `/events/${encodeURIComponent(eventId)}/judges`,
          `/events/${encodeURIComponent(eventId)}/evaluations`,
          `/events/${encodeURIComponent(eventId)}/evaluation-config`,
          `/events/${encodeURIComponent(eventId)}/result-reports`,
          `/events/${encodeURIComponent(eventId)}/result-reports/delivery-status`,
        ];
        const responses = await Promise.all(paths.map((path) => API.get(path)));
        if (cancelled) return;
        const event = responses[0].data?.data;
        if (!responses[0].data?.success || !event) throw new Error('Event not found.');
        const teams = responses[1].data?.data || [];
        const judges = responses[2].data?.data || [];
        const evaluations = responses[3].data?.data || [];
        const config = responses[4].data?.data || null;
        const result = buildEventResults({ eventId, teams, judges, evaluations, config });
        const teamIds = new Set(teams.map((team) => idOf(team)));
        const reportMap = Object.fromEntries((responses[5].data?.data || [])
          .filter((report) => String(report.eventId) === String(eventId) && teamIds.has(String(report.teamId)))
          .map((report) => [String(report.teamId), report]));
        setSelectedTeamId('');
        setPreviewTeamId('');
        setSelectedTeamIds([]);
        setWorkingTeamIds([]);
        setSendingTeamIds([]);
        setGenerationErrors({});
        setActionError('');
        setDeliveryStatuses(responses[6].data?.data || {});
        setData({ event, ...result });
        setLoadedEventId(eventId);
        setReports(reportMap);
      } catch (loadError) {
        if (!cancelled) setError(loadError.response?.data?.error || loadError.message || 'Unable to load result reports.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [eventId]);

  const activeRow = useMemo(() => data?.teams.find((row) => idOf(row.team) === selectedTeamId), [selectedTeamId, data]);

  async function generate() {
    const teamId = selectedTeamId;
    if (!teamId || !activeRow || activeRow.status !== 'Completed' || workingTeamIds.includes(teamId)) return;
    const eventAtStart = eventId;
    setWorkingTeamIds((current) => [...new Set([...current, teamId])]);
    if (selectedTeamContext.current === teamId) setActionError('');
    setGenerationErrors((current) => ({ ...current, [teamId]: '' }));
    try {
      const response = await API.post(`/events/${encodeURIComponent(eventId)}/result-reports/${encodeURIComponent(teamId)}/generate`);
      const savedReport = response.data?.data;
      if (!response.data?.success || !savedReport?.report) throw new Error('The report service returned an invalid response.');
      if (requestEventId.current !== eventAtStart) return;
      setReports((current) => ({ ...current, [teamId]: savedReport }));
      setGenerationErrors((current) => ({ ...current, [teamId]: '' }));
      if (selectedTeamContext.current === teamId) {
        setActionError('');
        setPreviewTeamId(teamId);
      }
    } catch (requestError) {
      if (requestEventId.current !== eventAtStart) return;
      const message = requestError.response?.data?.error || requestError.message || 'Unable to generate the report.';
      setGenerationErrors((current) => ({ ...current, [teamId]: message }));
      if (selectedTeamContext.current === teamId) setActionError(message);
    } finally {
      if (requestEventId.current === eventAtStart) setWorkingTeamIds((current) => current.filter((id) => id !== teamId));
    }
  }

  async function sendOne(teamId) {
    if (teamId !== selectedTeamId) return;
    const eventAtStart = eventId;
    setSendingTeamIds((current) => [...new Set([...current, teamId])]);
    if (selectedTeamContext.current === teamId) setActionError('');
    setDeliveryStatuses((current) => ({ ...current, [teamId]: { ...current[teamId], status: 'Sending' } }));
    try {
      const response = await API.post(`/events/${encodeURIComponent(eventId)}/result-reports/${encodeURIComponent(teamId)}/send`, { requestId: newRequestId() });
      if (!response.data?.success || !response.data?.data) throw new Error(response.data?.error || 'Report delivery failed.');
      if (requestEventId.current !== eventAtStart) return;
      setDeliveryStatuses((current) => ({ ...current, [teamId]: response.data.data }));
    } catch (requestError) {
      if (requestEventId.current !== eventAtStart) return;
      setDeliveryStatuses((current) => ({ ...current, [teamId]: { ...current[teamId], status: 'Failed' } }));
      if (selectedTeamContext.current === teamId) setActionError(requestError.response?.data?.error || requestError.message || 'Unable to send this report.');
    } finally {
      if (requestEventId.current === eventAtStart) setSendingTeamIds((current) => current.filter((id) => id !== teamId));
    }
  }

  async function sendSelected() {
    if (!selectedTeamIds.length || bulkSending) return;
    const selected = [...selectedTeamIds];
    const selectedTeamAtStart = selectedTeamId;
    const eventAtStart = eventId;
    setBulkSending(true);
    setActionError('');
    setDeliveryStatuses((current) => Object.fromEntries([
      ...Object.entries(current),
      ...selected.map((teamId) => [teamId, { ...current[teamId], status: 'Sending' }]),
    ]));
    try {
      const response = await API.post(`/events/${encodeURIComponent(eventId)}/result-reports/send`, { teamIds: selected, requestId: newRequestId() });
      if (!response.data?.success || !Array.isArray(response.data?.data)) throw new Error(response.data?.error || 'Bulk report delivery failed.');
      if (requestEventId.current !== eventAtStart) return;
      setDeliveryStatuses((current) => {
        const next = { ...current };
        response.data.data.forEach((result) => {
          if (result.data) next[result.teamId] = result.data;
          else next[result.teamId] = { ...next[result.teamId], status: result.status || 'Failed', error: result.error };
        });
        return next;
      });
      const failures = response.data.data.filter((result) => result.status !== 'Sent').length;
      if (failures && selectedTeamContext.current === selectedTeamAtStart) setActionError(`${failures} selected team${failures === 1 ? '' : 's'} could not be fully delivered. Review each team’s delivery status.`);
      setSelectedTeamIds([]);
    } catch (requestError) {
      if (requestEventId.current !== eventAtStart) return;
      setDeliveryStatuses((current) => Object.fromEntries([
        ...Object.entries(current),
        ...selected.map((teamId) => [teamId, { ...current[teamId], status: 'Failed' }]),
      ]));
      if (selectedTeamContext.current === selectedTeamAtStart) setActionError(requestError.response?.data?.error || requestError.message || 'Unable to send the selected reports.');
    } finally {
      if (requestEventId.current === eventAtStart) setBulkSending(false);
    }
  }

  function toggleTeam(teamId, selected) {
    setSelectedTeamIds((current) => selected
      ? [...new Set([...current, teamId])]
      : current.filter((id) => id !== teamId));
  }

  return (
    <OrganizerLayout activeKey="reports" wrapperClassName="result-reports-page" contentClassName="result-reports-content" eventId={eventId}>
      <header className="rr-header">
        <div>
          <Link to={`/organizer/events/${eventId}`} className="rr-back-link">← Event Workspace</Link>
          <h1>Result Reports</h1>
          <p>Team feedback based on completed, verified ScoreFlow evaluations.</p>
        </div>
        {data?.event && <div className="rr-event-chip"><span>Event</span><strong>{data.event.name}</strong></div>}
      </header>

      {loading ? <section className="rr-state"><h2>Loading verified results…</h2></section>
        : error ? <section className="rr-state" role="alert"><h2>Unable to load reports</h2><p>{error}</p></section>
          : loadedEventId !== eventId ? <section className="rr-state"><h2>Loading verified results…</h2></section>
          : data && <>
            {actionError && <p className="rr-action-error" role="alert">{actionError}</p>}
            <div className="rr-bulk-actions">
              <span>{selectedTeamIds.length} eligible team{selectedTeamIds.length === 1 ? '' : 's'} selected</span>
              <button type="button" className="rr-primary-button" disabled={!selectedTeamIds.length || bulkSending} onClick={sendSelected}>
                {bulkSending ? 'Sending selected reports…' : 'Send to Selected Teams'}
              </button>
            </div>
            <section className="rr-team-list" aria-label="Team result reports">
              {data.teams.map((row) => {
                const teamId = idOf(row.team);
                const savedReport = reports[teamId];
                const reportValid = reportIsQualitative(savedReport?.report);
                const report = reportValid && savedReport?.isCurrent !== false ? savedReport : null;
                const completed = row.status === 'Completed' && row.assignedCount > 0;
                const validEmail = hasValidEmail(row.team);
                const eligible = completed && Boolean(report) && validEmail;
                const delivery = deliveryStatuses[teamId];
                const deliveryMatchesReport = isDeliveryCurrentForReport(delivery, savedReport);
                const isSending = sendingTeamIds.includes(teamId) || bulkSending && selectedTeamIds.includes(teamId) && delivery?.status === 'Sending';
                const deliveryLabel = { Sent: 'Sent', 'Partially Sent': 'Partially Sent', Failed: 'Failed', Sending: 'Sending' }[delivery?.status] || 'Not Sent';
                const recipientStatus = delivery && savedReport && !deliveryMatchesReport ? `${deliveryLabel} (previous report)` : deliveryLabel;
                return <article className={`rr-team-card${selectedTeamId === teamId ? ' rr-team-card-selected' : ''}`} key={teamId} aria-current={selectedTeamId === teamId ? 'true' : undefined}>
                  <div className="rr-team-topline">
                    <div className="rr-team-card-title"><label className="rr-team-select"><input type="checkbox" aria-label={`Select ${row.team.teamName} for report delivery`} checked={selectedTeamIds.includes(teamId)} disabled={!eligible || bulkSending || isSending} onChange={(event) => toggleTeam(teamId, event.target.checked)} />Send</label><span className="rr-team-number">Team {row.team.teamNumber || '—'}</span><h2>{row.team.teamName}</h2></div>
                    <span className={`rr-badge ${completed ? 'rr-badge-complete' : 'rr-badge-pending'}`}>{completed ? 'Completed' : 'Pending'}</span>
                  </div>
                  <button type="button" className="rr-secondary-button" aria-pressed={selectedTeamId === teamId} onClick={() => { setSelectedTeamId(teamId); setPreviewTeamId(''); setActionError(''); }}>
                    {selectedTeamId === teamId ? 'Selected team' : 'Manage this team'}
                  </button>
                  <div className="rr-team-facts">
                    <div><span>Evaluation status</span><strong>{completed ? 'All assigned evaluations complete' : 'Awaiting completed evaluations'}</strong></div>
                    <div><span>Report status</span><strong>{report ? 'Available' : savedReport ? 'Requires regeneration' : generationErrors[teamId] ? 'Generation failed' : 'Not generated'}</strong></div>
                    <div><span>Email delivery</span><strong aria-live="polite">{recipientStatus}</strong></div>
                  </div>
                  {!completed && <p className="rr-pending-note">Report generation is available after every assigned judge submits a complete evaluation.</p>}
                  {completed && !validEmail && <p className="rr-pending-note">No valid team member email address is available for delivery.</p>}
                  <div className="rr-actions">
                    <button type="button" className="rr-primary-button" disabled={selectedTeamId !== teamId || !completed || workingTeamIds.includes(teamId)} onClick={generate}>
                      {workingTeamIds.includes(teamId) ? 'Generating…' : savedReport ? 'Regenerate Report' : 'Generate Report'}
                    </button>
                    {report && <button type="button" className="rr-secondary-button" disabled={selectedTeamId !== teamId} onClick={() => setPreviewTeamId(teamId)}>View Report</button>}
                    <button type="button" className="rr-secondary-button" disabled={selectedTeamId !== teamId || !eligible || isSending || workingTeamIds.includes(teamId)} onClick={() => sendOne(teamId)}>{isSending ? 'Sending…' : 'Send Report'}</button>
                  </div>
                  {delivery?.members?.length > 0 && <ul className="rr-member-delivery" aria-label={`${row.team.teamName} member delivery results`}>
                    {delivery.members.map((member) => <li key={`${member.memberIndex}-${member.memberName}`}><strong>{member.memberName}:</strong> {member.status}{member.reason ? ` · ${member.reason}` : ''}</li>)}
                  </ul>}
                </article>;
              })}
            </section>
            {previewTeamId === selectedTeamId && activeRow && reportIsQualitative(reports[selectedTeamId]?.report) && reports[selectedTeamId]?.isCurrent !== false && <ReportPreview row={activeRow} report={reports[selectedTeamId]} onClose={() => setPreviewTeamId('')} />}
          </>}
    </OrganizerLayout>
  );
}

function ReportPreview({ row, report, onClose }) {
  const content = report.report;
  return (
    <section className="rr-preview" aria-labelledby="rr-preview-title">
      <div className="rr-preview-header">
        <div><span>ScoreFlow Evaluation Report</span><h2 id="rr-preview-title">{row.team.teamName}</h2></div>
        <button type="button" className="rr-close-button" onClick={onClose} aria-label="Close report preview">×</button>
      </div>
      <ReportSection title={titles.summary}><p>{content.summary}</p></ReportSection>
      <ReportList title={titles.strengths} items={content.strengths} />
      <ReportList title={titles.weaknesses} items={content.weaknesses} />
      <ReportSection title={titles.whyThisMatters}><p>{content.whyThisMatters}</p></ReportSection>
      <ReportList title={titles.improvementSuggestions} items={content.improvementSuggestions} />
      <ReportList title={titles.priorityAreas} items={content.priorityAreas} />
      <ReportSection title={titles.judgeFeedbackSummary}><p>{content.judgeFeedbackSummary}</p></ReportSection>
      <ReportSection title={titles.finalRemarks}><p>{content.finalRemarks}</p></ReportSection>
      <footer className="rr-report-meta">Prepared by ScoreFlow · {new Date(report.generatedAt || report.updatedAt).toLocaleDateString()}</footer>
    </section>
  );
}

function ReportSection({ title, children }) {
  return <section className="rr-report-section"><h3>{title}</h3>{children}</section>;
}

function ReportList({ title, items = [] }) {
  return <ReportSection title={title}><ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul></ReportSection>;
}

export default OrganizerResultReports;

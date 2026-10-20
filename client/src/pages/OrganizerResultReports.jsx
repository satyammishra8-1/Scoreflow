import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import OrganizerLayout from './OrganizerLayout';
import { buildEventResults } from '../data/resultsUtils';
import './OrganizerResultReports.css';

const API = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api' });
const idOf = (value) => String(value?.teamId || value?._id || value?.id || '');
const scoreText = (value) => Number.isFinite(value) ? `${Number(value.toFixed(2))} / 100` : 'Pending';

function OrganizerResultReports() {
  const { eventId = '' } = useParams();
  const [data, setData] = useState(null);
  const [reports, setReports] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTeamId, setActiveTeamId] = useState('');
  const [workingTeamId, setWorkingTeamId] = useState('');
  const [actionError, setActionError] = useState('');

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
        const reportMap = Object.fromEntries((responses[5].data?.data || []).map((report) => [String(report.teamId), report]));
        setData({ event, ...result });
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

  const activeRow = useMemo(() => data?.teams.find((row) => idOf(row.team) === activeTeamId), [activeTeamId, data]);

  async function generate(teamId) {
    setWorkingTeamId(teamId);
    setActionError('');
    try {
      const response = await API.post(`/events/${encodeURIComponent(eventId)}/result-reports/${encodeURIComponent(teamId)}/generate`);
      const savedReport = response.data?.data;
      if (!response.data?.success || !savedReport?.report) throw new Error('The report service returned an invalid response.');
      setReports((current) => ({ ...current, [teamId]: savedReport }));
      setActiveTeamId(teamId);
    } catch (requestError) {
      setActionError(requestError.response?.data?.error || requestError.message || 'Unable to generate the report.');
    } finally {
      setWorkingTeamId('');
    }
  }

  return (
    <OrganizerLayout activeKey="reports" wrapperClassName="result-reports-page" contentClassName="result-reports-content" eventId={eventId}>
      <header className="rr-header">
        <div>
          <Link to={`/organizer/events/${eventId}`} className="rr-back-link">← Event Workspace</Link>
          <h1>AI Result Reports</h1>
          <p>Team feedback based on completed, verified ScoreFlow evaluations.</p>
        </div>
        {data?.event && <div className="rr-event-chip"><span>Event</span><strong>{data.event.name}</strong></div>}
      </header>

      {loading ? <section className="rr-state"><h2>Loading verified results…</h2></section>
        : error ? <section className="rr-state" role="alert"><h2>Unable to load reports</h2><p>{error}</p></section>
          : data && <>
            {actionError && <p className="rr-action-error" role="alert">{actionError}</p>}
            <section className="rr-team-list" aria-label="Team result reports">
              {data.teams.map((row) => {
                const teamId = idOf(row.team);
                const report = reports[teamId];
                const completed = row.status === 'Completed' && row.assignedCount > 0 && Number.isFinite(row.averageWeighted);
                return <article className="rr-team-card" key={teamId}>
                  <div className="rr-team-topline">
                    <div><span className="rr-team-number">Team {row.team.teamNumber || '—'}</span><h2>{row.team.teamName}</h2></div>
                    <span className={`rr-badge ${completed ? 'rr-badge-complete' : 'rr-badge-pending'}`}>{completed ? 'Completed' : 'Pending'}</span>
                  </div>
                  <div className="rr-team-facts">
                    <div><span>Verified final score</span><strong>{scoreText(completed ? row.averageWeighted : null)}</strong></div>
                    <div><span>Evaluations</span><strong>{row.submittedCount} / {row.assignedCount} completed</strong></div>
                    <div><span>AI report</span><strong>{report ? `Generated ${new Date(report.generatedAt || report.updatedAt).toLocaleDateString()}` : 'Not generated'}</strong></div>
                  </div>
                  {!completed && <p className="rr-pending-note">Report generation is disabled until every assigned judge submits a complete evaluation with a verified score.</p>}
                  <div className="rr-actions">
                    <button type="button" className="rr-primary-button" disabled={!completed || workingTeamId === teamId} onClick={() => generate(teamId)}>
                      {workingTeamId === teamId ? 'Generating…' : report ? 'Regenerate Report' : 'Generate AI Report'}
                    </button>
                    {report && <button type="button" className="rr-secondary-button" onClick={() => { setActiveTeamId(teamId); setActionError(''); }}>View Report</button>}
                  </div>
                </article>;
              })}
            </section>
            {activeRow && reports[activeTeamId] && <ReportPreview row={activeRow} report={reports[activeTeamId]} onClose={() => setActiveTeamId('')} />}
          </>}
    </OrganizerLayout>
  );
}

function ReportPreview({ row, report, onClose }) {
  const content = report.report;
  return (
    <section className="rr-preview" aria-labelledby="rr-preview-title">
      <div className="rr-preview-header">
        <div><span>Team {row.team.teamNumber || '—'}</span><h2 id="rr-preview-title">{row.team.teamName} · Result Report</h2></div>
        <button type="button" className="rr-close-button" onClick={onClose} aria-label="Close report preview">×</button>
      </div>
      <div className="rr-score-callout"><span>Verified ScoreFlow final score</span><strong>{scoreText(row.averageWeighted)}</strong><small>This score comes from the deterministic ScoreFlow results engine.</small></div>
      <ReportSection title="Team Result Summary"><p>{content.summary}</p></ReportSection>
      <ReportList title="Strengths" items={content.strengths} />
      <ReportList title="Areas for Improvement" items={content.weaknesses} />
      <ReportList title="Priority Areas" items={content.priorityAreas} />
      <ReportSection title="Judge Feedback Summary"><p>{content.judgeFeedbackSummary}</p></ReportSection>
      <ReportSection title="Final Remarks"><p>{content.finalRemarks}</p></ReportSection>
      <footer className="rr-report-meta">Generated with {report.model} · Updated {new Date(report.generatedAt || report.updatedAt).toLocaleString()}</footer>
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

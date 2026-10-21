import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import OrganizerLayout from './OrganizerLayout';
import { buildEventResults } from '../data/resultsUtils';
import { reportIsQualitative, RESULT_REPORT_SECTION_TITLES as titles } from '../data/resultReportPresentation';
import './OrganizerResultReports.css';

const API = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api' });
const idOf = (value) => String(value?.teamId || value?._id || value?.id || '');

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
          <h1>Result Reports</h1>
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
                const savedReport = reports[teamId];
                const report = reportIsQualitative(savedReport?.report) ? savedReport : null;
                const completed = row.status === 'Completed' && row.assignedCount > 0;
                return <article className="rr-team-card" key={teamId}>
                  <div className="rr-team-topline">
                    <div><span className="rr-team-number">Team {row.team.teamNumber || '—'}</span><h2>{row.team.teamName}</h2></div>
                    <span className={`rr-badge ${completed ? 'rr-badge-complete' : 'rr-badge-pending'}`}>{completed ? 'Completed' : 'Pending'}</span>
                  </div>
                  <div className="rr-team-facts">
                    <div><span>Evaluation status</span><strong>{completed ? 'All assigned evaluations complete' : 'Awaiting completed evaluations'}</strong></div>
                    <div><span>Report status</span><strong>{report ? 'Available' : savedReport ? 'Requires regeneration' : 'Not generated'}</strong></div>
                  </div>
                  {!completed && <p className="rr-pending-note">Report generation is available after every assigned judge submits a complete evaluation.</p>}
                  <div className="rr-actions">
                    <button type="button" className="rr-primary-button" disabled={!completed || workingTeamId === teamId} onClick={() => generate(teamId)}>
                      {workingTeamId === teamId ? 'Generating…' : report ? 'Regenerate Report' : 'Generate Report'}
                    </button>
                    {report && <button type="button" className="rr-secondary-button" onClick={() => { setActiveTeamId(teamId); setActionError(''); }}>View Report</button>}
                  </div>
                </article>;
              })}
            </section>
            {activeRow && reportIsQualitative(reports[activeTeamId]?.report) && <ReportPreview row={activeRow} report={reports[activeTeamId]} onClose={() => setActiveTeamId('')} />}
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

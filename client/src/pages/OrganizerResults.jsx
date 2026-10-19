import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import OrganizerLayout from './OrganizerLayout';
import { buildEventResults } from '../data/resultsUtils';
import './OrganizerResults.css';

const API = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api' });
const MODEL_LABELS = {
  'criteria-based': 'Criteria Based',
  'open-holistic': 'Overall / Holistic',
  'live-demo': 'Live Demo',
  'ranking-voting': 'Ranking / Voting',
  'remote-async': 'Remote / Async',
  custom: 'Custom',
};
const showNumber = (value, suffix = '') => Number.isFinite(value) ? `${Number(value.toFixed(2))}${suffix}` : '—';

function OrganizerResults() {
  const { eventId = '' } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
        ];
        const responses = await Promise.all(paths.map((path) => API.get(path)));
        if (cancelled) return;
        const event = responses[0].data?.data;
        if (!responses[0].data?.success || !event) throw new Error('Event not found.');
        const result = buildEventResults({
          eventId,
          teams: responses[1].data?.data || [],
          judges: responses[2].data?.data || [],
          evaluations: responses[3].data?.data || [],
          config: responses[4].data?.data || null,
        });
        setData({ event, config: responses[4].data?.data || null, ...result });
      } catch (loadError) {
        if (!cancelled) setError(loadError.response?.data?.error || loadError.message || 'Unable to load event results.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [eventId]);

  return (
    <OrganizerLayout activeKey="events" wrapperClassName="organizer-results" contentClassName="results-content" eventId={eventId}>
      <header className="results-page-header">
        <div><Link to={`/organizer/events/${eventId}`} className="results-back-link">← Event Workspace</Link><h1>Results</h1><p>Submitted evaluation results for this event.</p></div>
      </header>
      {loading ? <section className="results-state"><h2>Loading results…</h2></section>
        : error ? <section className="results-state" role="alert"><h2>Unable to load results</h2><p>{error}</p></section>
          : data && <>
            <section className="results-event-summary" aria-label="Event results summary">
              <div className="results-event-title"><span>Event</span><h2>{data.event.name}</h2></div>
              <div><span>Evaluation type</span><strong>{MODEL_LABELS[data.config?.model] || 'Not configured'}</strong></div>
              <div><span>Teams</span><strong>{data.teams.length}</strong></div>
              <div><span>Submitted evaluations</span><strong>{data.submittedCount}</strong></div>
            </section>

            <section className="results-section" aria-labelledby="team-results-title">
              <div className="results-section-heading"><div><h2 id="team-results-title">Team Results</h2><p>Only completed evaluations contribute results.</p></div></div>
              {!data.teams.length ? <p className="results-empty">No teams are registered for this event.</p> : <div className="team-results-list">
                {data.teams.map((row) => <article className="team-result-card" key={row.team.teamId || row.team._id}>
                  <div className="team-result-heading">
                    <div><span className="team-result-number">Team {row.team.teamNumber || '—'}</span><h3>{row.team.teamName}</h3></div>
                    <span className={`result-status ${row.status === 'Completed' ? 'result-status-completed' : 'result-status-pending'}`}>{row.status}</span>
                  </div>
                  <div className="team-result-stats">
                    <span><strong>{row.submittedCount} / {row.assignedCount}</strong> evaluations completed</span>
                    {data.config?.model === 'criteria-based' && row.averageWeighted != null && <span><strong>{showNumber(row.averageWeighted)} / 100</strong> average weighted score</span>}
                    {data.config?.model === 'ranking-voting' && <span>Judge ranks are displayed individually; no event-wide rank is calculated here.</span>}
                  </div>
                  {row.submittedCount === 0 ? <p className="team-no-score">No submitted evaluations yet. No score is available.</p> : <div className="judge-result-list">
                    {row.judgeRows.filter((judgeRow) => judgeRow.evaluation).map(({ judge, scores }) => (
                      <section className="judge-result" key={judge.judgeId || judge._id}>
                        <div className="judge-result-heading"><h4>{judge.name}</h4><span>Completed</span></div>
                        {data.config?.model === 'criteria-based' ? <>
                          <div className="criteria-result-table-wrap"><table className="criteria-result-table">
                            <thead><tr><th>Criterion</th><th>Score</th><th>Maximum</th><th>Weight</th></tr></thead>
                            <tbody>{scores.criteria.map((criterion) => <tr key={criterion.id}><td>{criterion.name}</td><td>{criterion.score == null ? '—' : showNumber(criterion.score)}</td><td>{showNumber(criterion.maxMarks)}</td><td>{showNumber(criterion.weight, '%')}</td></tr>)}</tbody>
                          </table></div>
                          <p className="judge-score-summary">Raw total: {showNumber(scores.raw)} · Weighted score: {scores.weighted == null ? '—' : `${showNumber(scores.weighted)} / 100`}</p>
                        </> : data.config?.model === 'ranking-voting' ? <p className="judge-score-summary">Submitted rank: {scores.rank == null ? 'Not provided' : `#${scores.rank}`}</p>
                          : <ModelScores model={data.config?.model} scores={scores} />}
                      </section>
                    ))}
                    {row.judgeRows.filter((judgeRow) => !judgeRow.evaluation).map(({ judge }) => <p className="judge-pending-line" key={judge.judgeId || judge._id}>{judge.name}: Pending</p>)}
                  </div>}
                </article>)}
              </div>}
            </section>

            <section className="results-section" aria-labelledby="judge-results-title">
              <div className="results-section-heading"><div><h2 id="judge-results-title">Judge Results</h2><p>Completed and pending assignments for this event.</p></div></div>
              {!data.judges.length ? <p className="results-empty">No judges are assigned to this event.</p> : <div className="judge-summary-table-wrap"><table className="judge-summary-table">
                <thead><tr><th>Judge</th><th>Teams assigned</th><th>Completed</th><th>Pending</th></tr></thead>
                <tbody>{data.judges.map(({ judge, assignedCount, completedCount, pendingCount }) => <tr key={judge.judgeId || judge._id}><td>{judge.name}</td><td>{assignedCount}</td><td><span className="result-status result-status-completed">{completedCount} Completed</span></td><td><span className={`result-status ${pendingCount ? 'result-status-pending' : 'result-status-completed'}`}>{pendingCount} Pending</span></td></tr>)}</tbody>
              </table></div>}
            </section>
          </>}
    </OrganizerLayout>
  );
}

function ModelScores({ model, scores }) {
  const rows = model === 'live-demo'
    ? [...(scores.named || []), ...(scores.criteria || []).map((criterion) => ({ label: criterion.name, value: criterion.score == null ? 'Not provided' : `${showNumber(criterion.score)} / ${showNumber(criterion.maxMarks)}` }))]
    : scores.named || [];
  if (!rows.length) return <p className="judge-score-summary">Completed evaluation has no stored score fields.</p>;
  return <dl className="model-score-list">{rows.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{typeof item.value === 'number' ? showNumber(item.value) : item.value}</dd></div>)}</dl>;
}

export default OrganizerResults;

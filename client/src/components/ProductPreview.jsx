const sampleTeams = [
  { team: 'Team Alpha', score: '86/100' },
  { team: 'Team Nova', score: '91/100' },
  { team: 'Team Vision', score: '84/100' },
];

export default function ProductPreview() {
  return (
    <section className="content-section preview-section">
      <div className="container">
        <div className="section-heading">
          <span className="eyebrow eyebrow-subtle">Product preview</span>
          <h2>ScoreFlow Dashboard</h2>
        </div>

        <div className="preview-panel">
          <div className="preview-column left-column">
            <div className="preview-card small-card">
              <label>Event</label>
              <p>Annual Innovation Hackathon 2026</p>
            </div>

            <div className="stats-inline">
              <div className="preview-card compact-card">
                <label>Teams</label>
                <strong>24</strong>
              </div>
              <div className="preview-card compact-card">
                <label>Judges</label>
                <strong>8</strong>
              </div>
            </div>

            <div className="preview-card criteria-card">
              <label>Evaluation Criteria</label>
              <ul>
                <li>Innovation</li>
                <li>Technical Implementation</li>
                <li>Presentation</li>
                <li>Impact</li>
              </ul>
            </div>
          </div>

          <div className="preview-column right-column">
            <div className="preview-card leaderboard-card">
              <div className="leaderboard-header">
                <span>Leaderboard</span>
                <span className="muted-tag">Live</span>
              </div>

              <div className="leaderboard-list">
                {sampleTeams.map((entry) => (
                  <div className="leaderboard-row" key={entry.team}>
                    <span>{entry.team}</span>
                    <strong>{entry.score}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="preview-card ai-card">
              <div className="ai-header">
                <span>AI Feedback</span>
              </div>
              <p>
                <strong>Strength:</strong> Strong technical implementation and clear problem
                understanding.
              </p>
              <p>
                <strong>Improvement:</strong> Improve presentation clarity and explain the
                scalability approach.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const metrics = [
  { label: 'Competitions', value: '18+' },
  { label: 'Judges', value: '142' },
  { label: 'Teams', value: '96%' },
];

export default function Hero() {
  return (
    <section className="hero-section">
      <div className="container hero-grid">
        <div className="hero-copy">
          <span className="eyebrow">Competition evaluation platform</span>
          <h1>From Ideas to Impact</h1>
          <p>
            ScoreFlow helps colleges organize hackathons and project exhibitions with
            structured evaluation, real-time scoring, and AI-powered feedback.
          </p>

          <div className="hero-actions">
            <a href="#cta" className="button button-primary">
              Get Started
            </a>
            <a href="#how-it-works" className="button button-secondary">
              How It Works
            </a>
          </div>

          <div className="hero-metrics" aria-label="ScoreFlow impact metrics">
            {metrics.map((metric) => (
              <div key={metric.label} className="mini-metric">
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-visual" aria-label="ScoreFlow product preview">
          <div className="visual-panel">
            <div className="panel-top">
              <span className="panel-dot dot-purple" />
              <span className="panel-dot dot-silver" />
              <span className="panel-dot dot-green" />
            </div>

            <div className="panel-header-row">
              <div>
                <p className="panel-label">Annual Innovation Hackathon 2026</p>
                <h3>ScoreFlow Dashboard</h3>
              </div>
              <span className="status-pill">Live</span>
            </div>

            <div className="dashboard-grid">
              <div className="stat-box accent-box">
                <span>Average score</span>
                <strong>89.4</strong>
                <small>+12.6% vs last event</small>
              </div>

              <div className="stat-box">
                <span>Teams</span>
                <strong>24</strong>
              </div>

              <div className="stat-box">
                <span>Judges</span>
                <strong>8</strong>
              </div>
            </div>

            <div className="criteria-box">
              <div className="criteria-header">
                <span>Evaluation Criteria</span>
                <span>4 categories</span>
              </div>

              <ul>
                <li>
                  <span>Innovation</span>
                  <em>8.9</em>
                </li>
                <li>
                  <span>Technical Implementation</span>
                  <em>9.2</em>
                </li>
                <li>
                  <span>Presentation</span>
                  <em>8.7</em>
                </li>
                <li>
                  <span>Impact</span>
                  <em>9.1</em>
                </li>
              </ul>
            </div>

            <div className="team-score-list">
              <div className="list-row title-row">
                <span>Team</span>
                <span>Score</span>
              </div>
              <div className="list-row">
                <span>Team Alpha</span>
                <strong>86</strong>
              </div>
              <div className="list-row">
                <span>Team Nova</span>
                <strong>91</strong>
              </div>
              <div className="list-row">
                <span>Team Vision</span>
                <strong>84</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

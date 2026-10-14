import { useNavigate } from 'react-router-dom';

const metrics = [
  { label: 'Competitions', value: '18+' },
  { label: 'Judges', value: '142' },
  { label: 'Teams', value: '96%' },
];

export default function Hero() {
  const navigate = useNavigate();

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
            {/* Updated path to match App.jsx */}
            <button 
              onClick={() => navigate('/organizer/dashboard')} 
              className="button button-primary"
            >
              Get Started
            </button>
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

        {/* ... rest of your hero visual component ... */}
      </div>
    </section>
  );
}
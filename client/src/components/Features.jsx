const features = [
  {
    title: 'Create Events',
    description: 'Set up hackathons and project exhibitions with structured event configuration.',
  },
  {
    title: 'Structured Evaluation',
    description: 'Define evaluation criteria and scoring weights for consistent judging.',
  },
  {
    title: 'AI-Powered Feedback',
    description: 'Generate meaningful improvement suggestions based on scores and judge feedback.',
  },
  {
    title: 'Result Sharing',
    description: 'Finalize results and provide each team with a clear personalized scorecard.',
  },
];

export default function Features() {
  return (
    <section className="content-section" id="features">
      <div className="container">
        <div className="section-heading narrow-heading">
          <span className="eyebrow eyebrow-subtle">Features</span>
          <h2>Everything You Need for Better Evaluation</h2>
        </div>

        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <div className="feature-icon" aria-hidden="true">
                <span />
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

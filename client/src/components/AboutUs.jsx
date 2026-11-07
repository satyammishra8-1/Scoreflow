const principles = [
  {
    title: 'Fair, consistent judging',
    description: 'Shared criteria and weighted scorecards help every team get evaluated against the same expectations.',
  },
  {
    title: 'One place to run events',
    description: 'Organizers can manage competitions, teams, judges, evaluation settings, and results in one workspace.',
  },
  {
    title: 'Feedback teams can use',
    description: 'Clear results and personalized improvement feedback help participants understand what to build on next.',
  },
];

export default function AboutUs() {
  return (
    <section className="content-section about-section" id="about-us" aria-labelledby="about-us-title">
      <div className="container">
        <div className="section-heading about-heading scroll-reveal">
          <span className="eyebrow eyebrow-subtle">About ScoreFlow</span>
          <h2 id="about-us-title">Better organized competitions. Clearer outcomes.</h2>
          <p>
            ScoreFlow is an evaluation platform for college hackathons and project exhibitions.
            It brings organizers, judges, and teams together with a transparent process from
            event setup through final feedback.
          </p>
        </div>
        <div className="about-grid">
          {principles.map((principle) => (
            <article className="about-card scroll-reveal" key={principle.title}>
              <span className="about-card-mark" aria-hidden="true">✓</span>
              <h3>{principle.title}</h3>
              <p>{principle.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

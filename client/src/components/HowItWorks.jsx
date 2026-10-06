const steps = [
  {
    number: '01',
    title: 'Create Event',
    text: 'Create the competition and define evaluation criteria.',
  },
  {
    number: '02',
    title: 'Evaluate Teams',
    text: 'Judges score teams using structured scorecards.',
  },
  {
    number: '03',
    title: 'Finalize Results',
    text: 'Organizers review and finalize competition results.',
  },
  {
    number: '04',
    title: 'Send Feedback',
    text: 'Teams receive their scorecard and personalized improvement feedback.',
  },
];

export default function HowItWorks() {
  return (
    <section className="content-section process-section" id="how-it-works">
      <div className="container">
        <div className="section-heading">
          <span className="eyebrow eyebrow-subtle">How it works</span>
          <h2>How ScoreFlow Works</h2>
        </div>

        <div className="steps-grid">
          {steps.map((step) => (
            <article className="step-card" key={step.number}>
              <span className="step-index">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

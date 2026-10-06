const benefits = [
  'Standardized Evaluation',
  'Centralized Competition Management',
  'Automated Feedback',
];

export default function Institutions() {
  return (
    <section className="content-section institutions-section" id="institutions">
      <div className="container institutions-box">
        <div className="section-heading narrow-heading">
          <span className="eyebrow eyebrow-subtle">For institutions</span>
          <h2>Built for Institutions</h2>
        </div>

        <p className="institutions-copy">
          Give faculty and organizers a centralized system to manage competitions, standardize
          evaluation, and deliver meaningful feedback at scale.
        </p>

        <div className="benefits-grid">
          {benefits.map((benefit) => (
            <div className="benefit-item" key={benefit}>
              <span className="benefit-badge" aria-hidden="true" />
              <span>{benefit}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

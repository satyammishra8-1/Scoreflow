import { Link } from 'react-router-dom';

export default function CTA() {
  return (
    <section className="cta-section" id="cta">
      <div className="container cta-box">
        <div>
          <h2>Make evaluation simpler, fairer, and more insightful.</h2>
          <p>Bring structured evaluation and intelligent feedback to your next competition.</p>
        </div>

        <Link to="/login" className="button button-primary cta-button">
          Get Started
        </Link>
      </div>
    </section>
  );
}

const strengths = [
  'Strong technical implementation',
  'Good problem understanding',
  'Practical solution',
];

const improvements = [
  'Presentation clarity',
  'Scalability explanation',
  'User experience',
];

const nextSteps = [
  'Improve system architecture explanation',
  'Add stronger impact metrics',
  'Refine final presentation',
];

export default function AIFeedback() {
  return (
    <section className="content-section ai-feedback-section">
      <div className="container ai-layout">
        <div className="ai-copy">
          <span className="eyebrow eyebrow-subtle">AI feedback</span>
          <h2>Turn Scores Into Actionable Feedback</h2>
          <p>
            ScoreFlow uses AI to transform evaluation scores and judge feedback into personalized
            suggestions that help teams understand their strengths and improve their weaknesses.
          </p>
        </div>

        <div className="feedback-card">
          <div className="feedback-top">
            <span className="feedback-label">Overall Score</span>
            <strong>86/100</strong>
          </div>

          <div className="feedback-columns">
            <div>
              <h3>Strengths</h3>
              <ul>
                {strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div>
              <h3>Areas to Improve</h3>
              <ul>
                {improvements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="next-steps">
            <h3>Suggested Next Steps</h3>
            <ul>
              {nextSteps.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

const productLinks = [
  { label: 'Home', href: '#home' },
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
];

const companyLinks = [{ label: 'Contact', href: '#contact' }];

export default function Footer() {
  return (
    <footer className="site-footer" id="contact">
      <div className="container footer-wrap">
        <div className="footer-branding">
          <a href="#home" className="footer-brand" aria-label="ScoreFlow home">
            <span className="footer-brand-mark" aria-hidden="true" />
            <span>ScoreFlow</span>
          </a>
          <p>Structured evaluation and intelligent feedback for college competitions.</p>
        </div>

        <div className="footer-link-groups" aria-label="Footer navigation">
          <div className="footer-column">
            <h4>Product</h4>
            <nav className="footer-nav">
              {productLinks.map((link) => (
                <a href={link.href} key={link.label}>
                  {link.label}
                </a>
              ))}
            </nav>
          </div>

          <div className="footer-column">
            <h4>Company</h4>
            <nav className="footer-nav">
              {companyLinks.map((link) => (
                <a href={link.href} key={link.label}>
                  {link.label}
                </a>
              ))}
            </nav>
          </div>
        </div>
      </div>

      <div className="container footer-bottom">
        <span>© 2026 ScoreFlow. All rights reserved.</span>
      </div>
    </footer>
  );
}

import { useState } from 'react';

const navItems = [
  { label: 'Home', href: '#home' },
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'For Institutions', href: '#institutions' },
  { label: 'Contact', href: '#contact' },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="site-header" id="home">
      <div className="container nav-wrap">
        <a href="#home" className="brand" aria-label="ScoreFlow home">
          <span className="brand-mark">S</span>
          <span>ScoreFlow</span>
        </a>

        <button
          type="button"
          className="menu-toggle"
          aria-label="Toggle menu"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav className={`main-nav ${isOpen ? 'open' : ''}`} aria-label="Main navigation">
          <ul>
            {navItems.map((item) => (
              <li key={item.label}>
                <a href={item.href} onClick={() => setIsOpen(false)}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="nav-actions">
          <a href="#contact" className="nav-link-login">
            Login
          </a>
          <a href="#cta" className="button button-primary nav-button">
            Get Started
          </a>
        </div>
      </div>
    </header>
  );
}

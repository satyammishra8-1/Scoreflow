import { useState } from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

const navItems = [
  { label: 'Home', href: '#home' },
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Contact', href: '#contact' },
  { label: 'Login', to: '/login' },
  { label: 'Get Started', to: '/signup' },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="site-header" id="home">
      <div className="container nav-wrap">
        <Link to="/" className="brand" aria-label="ScoreFlow home">
          <span className="brand-mark">S</span>
          <span>ScoreFlow</span>
        </Link>

        <div className="nav-mobile-bar">
          <div className="mobile-theme-toggle"><ThemeToggle /></div>
          <button type="button" className="menu-toggle" aria-label="Toggle menu" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
            <span /><span /><span />
          </button>
        </div>

        <nav className={`main-nav ${isOpen ? 'open' : ''}`} aria-label="Main navigation">
          <ul>{navItems.map((item) => <li key={item.label}>{item.to
            ? <Link to={item.to} onClick={() => setIsOpen(false)}>{item.label}</Link>
            : <a href={item.href} onClick={() => setIsOpen(false)}>{item.label}</a>}</li>)}</ul>
        </nav>

        <div className="nav-actions">
          <ThemeToggle />
          <Link to="/login" className="nav-link-login">Login</Link>
          <Link to="/signup" className="button button-primary nav-button">Get Started</Link>
        </div>
      </div>
    </header>
  );
}

import { useTheme } from '../context/useTheme';
import './ThemeToggle.css';

export default function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="theme-toggle-container">
      <button
        type="button"
        className={`theme-toggle-btn ${isDark ? 'mode-night' : 'mode-day'}`}
        onClick={toggleTheme}
        role="switch"
        aria-checked={isDark}
        aria-label={isDark ? 'Switch to Day Mode' : 'Switch to Night Mode'}
        title={isDark ? 'Switch to Day Mode' : 'Switch to Night Mode'}
      >
        {/* Track background scenery */}
        <div className="theme-toggle-scenery" aria-hidden="true">
          <div className="scenery-day">
            <svg className="toggle-cloud toggle-cloud-1" viewBox="0 0 64 32">
              <path d="M12 28h38a12 12 0 0 0 0-24 16 16 0 0 0-30-2A12 12 0 0 0 12 28z" />
            </svg>
            <svg className="toggle-cloud toggle-cloud-2" viewBox="0 0 64 32">
              <path d="M10 26h42a10 10 0 0 0 0-20 14 14 0 0 0-26-2A10 10 0 0 0 10 26z" />
            </svg>
          </div>
          <div className="scenery-night">
            <span className="toggle-star toggle-star-1" />
            <span className="toggle-star toggle-star-2" />
            <span className="toggle-star toggle-star-3" />
            <span className="toggle-star toggle-star-4" />
            <span className="toggle-star toggle-star-5" />
            <span className="toggle-star toggle-star-6" />
          </div>
        </div>

        {/* Crossfading Labels */}
        <span className="theme-toggle-label label-day">Day Mode</span>
        <span className="theme-toggle-label label-night">Night Mode</span>

        {/* Sliding 3D Circular Bezel Knob */}
        <div className="theme-toggle-knob" aria-hidden="true">
          {/* Glowing Warm Sun */}
          <span className="theme-icon-wrap theme-icon-sun">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="5" fill="url(#toggle-sun-gradient)" />
              <circle cx="12" cy="3" r="1.3" fill="#FFE082" />
              <circle cx="12" cy="21" r="1.3" fill="#FFE082" />
              <circle cx="3" cy="12" r="1.3" fill="#FFE082" />
              <circle cx="21" cy="12" r="1.3" fill="#FFE082" />
              <circle cx="5.6" cy="5.6" r="1.2" fill="#FFE082" />
              <circle cx="18.4" cy="18.4" r="1.2" fill="#FFE082" />
              <circle cx="5.6" cy="18.4" r="1.2" fill="#FFE082" />
              <circle cx="18.4" cy="5.6" r="1.2" fill="#FFE082" />
              <defs>
                <radialGradient id="toggle-sun-gradient" cx="40%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#FFF176" />
                  <stop offset="45%" stopColor="#FBC02D" />
                  <stop offset="100%" stopColor="#F57C00" />
                </radialGradient>
              </defs>
            </svg>
          </span>

          {/* Glowing Crescent Moon + Star */}
          <span className="theme-icon-wrap theme-icon-moon">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
              <path
                d="M12.3 3.3a8.8 8.8 0 1 0 8.4 11.8 7.3 7.3 0 0 1-8.1-11.5c-.1-.1-.2-.2-.3-.3z"
                fill="url(#toggle-moon-gradient)"
              />
              <path
                d="M18 5.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4z"
                fill="#FFFFFF"
              />
              <defs>
                <linearGradient id="toggle-moon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="60%" stopColor="#E2E8F0" />
                  <stop offset="100%" stopColor="#CBD5E1" />
                </linearGradient>
              </defs>
            </svg>
          </span>
        </div>
      </button>
    </div>
  );
}

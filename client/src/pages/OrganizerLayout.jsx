import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import './OrganizerDashboard.css';

const STORAGE_KEY = 'scoreflow.sidebar.hoverCollapsed';

function readInitialCollapsed() {
  try {
    const savedPreference = window.localStorage.getItem(STORAGE_KEY);
    return savedPreference == null ? true : savedPreference === 'true';
  } catch {
    return true;
  }
}

function buildNavigation(activeKey, eventId) {
  const safeEventId = eventId || 'default';
  return [
    { key: 'dashboard', label: 'Dashboard', icon: '▦', to: '/organizer/dashboard' },
    { key: 'events', label: 'Events', icon: '▣', to: '/organizer/events' },
    { key: 'teams', label: 'Teams', icon: '♧', to: `/organizer/events/${safeEventId}/teams` },
    { key: 'judges', label: 'Judges', icon: '♙', to: `/organizer/events/${safeEventId}/judges` },
    { key: 'criteria', label: 'Evaluation Criteria', icon: '☷', to: `/organizer/events/${safeEventId}/evaluation` },
    { key: 'reports', label: 'Result Reports', icon: '✦', to: `/organizer/events/${safeEventId}/result-reports` },
  ].map((item) => ({ ...item, active: item.key === activeKey }));
}

function OrganizerSidebar({ navigation, isOpen, closeMenu, isRevealed, isCollapsed, onRevealChange }) {
  return (
    <>
      <button
        className={`dashboard-scrim ${isOpen ? 'visible' : ''}`}
        type="button"
        aria-label="Close navigation"
        onClick={closeMenu}
      />
      <aside
        className={`dashboard-sidebar ${isOpen ? 'sidebar-open' : ''} ${isRevealed ? 'sidebar-revealed' : ''}`}
        inert={isCollapsed && !isOpen && !isRevealed}
        onMouseEnter={() => isCollapsed && onRevealChange(true)}
        onMouseLeave={() => isCollapsed && onRevealChange(false)}
      >
        <Link to="/" className="dashboard-brand" onClick={closeMenu}>
          <span className="dashboard-brand-mark">S</span>
          <span>ScoreFlow</span>
        </Link>
        <nav className="sidebar-navigation" aria-label="Organizer navigation">
          {navigation.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className={`sidebar-link ${item.active ? 'sidebar-link-active' : ''}`}
              aria-current={item.active ? 'page' : undefined}
              onClick={closeMenu}
            >
              <span className="sidebar-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {item.active && <span className="active-indicator" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/organizer/settings" className="sidebar-link" onClick={closeMenu}>
            <span className="sidebar-icon" aria-hidden="true">⚙</span>
            <span>Settings</span>
          </Link>
        </div>
      </aside>
    </>
  );
}
function OrganizerLayout({
  activeKey = 'dashboard',
  eventId: eventIdProp,
  children,
  contentClassName = 'dashboard-content',
  searchPlaceholder = 'Search events, teams, judges...',
  searchValue,
  onSearchChange,
  searchAriaLabel = 'Search',
  wrapperClassName = '',
  userName = 'Organizer',
  userRole = 'Administrator',
  userInitial = 'O',
}) {
  const params = useParams();
  const eventId = eventIdProp || params.eventId || 'default';
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readInitialCollapsed);
  const [sidebarRevealed, setSidebarRevealed] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(sidebarCollapsed));
    } catch {
      // Ignore storage errors.
    }
  }, [sidebarCollapsed]);

  const navigation = buildNavigation(activeKey, eventId);
  const searchInputProps =
    typeof searchValue === 'string' && typeof onSearchChange === 'function'
      ? { value: searchValue, onChange: onSearchChange }
      : {};

  return (
    <div className={`sf-dashboard ${wrapperClassName} ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${sidebarCollapsed && sidebarRevealed ? 'sidebar-peek-open' : ''}`.trim()}>
      {sidebarCollapsed && <button
        className="sidebar-edge-trigger"
        type="button"
        aria-label="Reveal organizer sidebar"
        aria-expanded={sidebarRevealed}
        onMouseEnter={() => setSidebarRevealed(true)}
        onFocus={() => setSidebarRevealed(true)}
        onClick={() => setSidebarRevealed((visible) => !visible)}
      ><span /></button>}
      <div
        onFocusCapture={() => sidebarCollapsed && setSidebarRevealed(true)}
        onBlurCapture={(event) => {
          if (sidebarCollapsed && !event.currentTarget.contains(event.relatedTarget)) setSidebarRevealed(false);
        }}
      >
        <OrganizerSidebar
          navigation={navigation}
          isOpen={isMenuOpen}
          closeMenu={() => setIsMenuOpen(false)}
          isRevealed={sidebarRevealed}
          isCollapsed={sidebarCollapsed}
          onRevealChange={setSidebarRevealed}
        />
      </div>
      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <button
            className="desktop-menu-button"
            type="button"
            aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
            aria-expanded={!sidebarCollapsed}
            onClick={() => setSidebarCollapsed((current) => !current)}
          >
            <span />
            <span />
            <span />
          </button>
          <button
            className="mobile-menu-button"
            type="button"
            aria-label={isMenuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
          </button>
          <label className="dashboard-search">
            <span aria-hidden="true">⌕</span>
            <input aria-label={searchAriaLabel} placeholder={searchPlaceholder} {...searchInputProps} />
          </label>
          <div className="topbar-actions">
            <button className="notification-button" type="button" aria-label="Notifications">
              <span aria-hidden="true">♧</span>
              <i />
            </button>
            <span className="topbar-divider" />
            <div className="topbar-user">
              <div className="profile-avatar">{userInitial}</div>
              <div className="topbar-user-name">
                <strong>{userName}</strong>
                <span>{userRole}</span>
              </div>
              <span className="dropdown-chevron" aria-hidden="true">⌄</span>
            </div>
          </div>
        </header>
        <main className={contentClassName}>{children}</main>
      </div>
    </div>
  );
}

export default OrganizerLayout;

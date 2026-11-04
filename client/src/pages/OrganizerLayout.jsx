import { Link, useLocation, useParams } from 'react-router-dom';
import './OrganizerDashboard.css';

const EVENT_TABS = [
  { key: 'overview', label: 'Overview', suffix: '' },
  { key: 'teams', label: 'Teams', suffix: '/teams' },
  { key: 'judges', label: 'Judges', suffix: '/judges' },
  { key: 'evaluation', label: 'Evaluation', suffix: '/evaluation' },
  { key: 'announcements', label: 'Announcements', suffix: '/announcements' },
  { key: 'results', label: 'Results', suffix: '/results' },
];

function OrganizerLayout({
  activeKey = 'dashboard', eventId: eventIdProp, children,
  contentClassName = 'dashboard-content', searchPlaceholder = 'Search events, teams, judges...',
  searchValue, onSearchChange, searchAriaLabel = 'Search', wrapperClassName = '',
  userName = 'Organizer', userRole = 'Administrator', userInitial = 'O',
}) {
  const params = useParams();
  const location = useLocation();
  const eventId = eventIdProp || params.eventId;
  const isEventWorkspace = Boolean(eventId && eventId !== 'default');
  const isDashboard = location.pathname === '/organizer/dashboard' || location.pathname === '/dashboard';
  const searchInputProps = typeof searchValue === 'string' && typeof onSearchChange === 'function'
    ? { value: searchValue, onChange: onSearchChange } : {};
  const activeTab = activeKey === 'events' ? 'overview'
    : activeKey === 'criteria' ? 'evaluation'
      : activeKey === 'reports' ? 'results'
        : activeKey;

  return (
    <div className={`sf-dashboard ${wrapperClassName}`.trim()}>
      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <Link to="/organizer/dashboard" className="topbar-brand" aria-label="ScoreFlow Dashboard">
            <span className="dashboard-brand-mark">S</span><span>ScoreFlow</span>
          </Link>
          {isDashboard || typeof searchValue === 'string' ? <label className="dashboard-search">
            <span aria-hidden="true">⌕</span>
            <input aria-label={searchAriaLabel} placeholder={searchPlaceholder} {...searchInputProps} />
          </label> : <Link to="/organizer/dashboard" className="topbar-dashboard-link">← Dashboard</Link>}
          <div className="topbar-actions"><div className="topbar-user">
            <div className="profile-avatar">{userInitial}</div>
            <div className="topbar-user-name"><strong>{userName}</strong><span>{userRole}</span></div>
          </div></div>
        </header>
        {isEventWorkspace && <nav className="event-workspace-nav" aria-label="Event navigation">
          {EVENT_TABS.map((tab) => {
            const to = `/organizer/events/${encodeURIComponent(eventId)}${tab.suffix}`;
            const active = activeTab === tab.key;
            return <Link key={tab.key} to={to} className={`event-workspace-tab${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}>{tab.label}</Link>;
          })}
        </nav>}
        <main className={contentClassName}>{children}</main>
      </div>
    </div>
  );
}

export default OrganizerLayout;

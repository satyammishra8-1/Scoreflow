import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import OrganizerDashboard from './pages/OrganizerDashboard';
import EventManagement from './pages/EventManagement';
import OrganizerEventWorkspace from './pages/OrganizerEventWorkspace';
import OrganizerResults from './pages/OrganizerResults';
import OrganizerResultReports from './pages/OrganizerResultReports';
import OrganizerTeams from './pages/OrganizerTeams';
import OrganizerJudges from './pages/OrganizerJudges';
import OrganizerAnnouncements from './pages/OrganizerAnnouncements';
import EvaluationConfiguration from './pages/EvaluationConfiguration';
import EvaluationSession from './pages/EvaluationSession';
import JudgeDashboard from './pages/JudgeDashboard';
import JudgeInvitation from './pages/JudgeInvitation';
import { AuthProvider } from './auth/AuthContext';
import { useAuth } from './auth/useAuth';
import { ThemeProvider } from './context/ThemeContext';
import './App.css';

function EvaluationSessionRoute() {
  const { eventId = 'default', judgeId, teamId } = useParams();
  return <EvaluationSession key={`${eventId}-${judgeId}-${teamId}`} eventId={eventId} judgeId={judgeId} teamId={teamId} />;
}

function ProtectedRoute({ role, children }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="route-loading" role="status">Checking your session…</p>;
  if (!session || (role && session.role !== role)) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function Protected({ role, children }) {
  return <ProtectedRoute role={role}>{children}</ProtectedRoute>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Login initialMode="register" />} />
      <Route path="/judge/invite/:token" element={<JudgeInvitation />} />
      <Route path="/organizer/dashboard" element={<Protected role="organizer"><OrganizerDashboard /></Protected>} />
      <Route path="/organizer/events" element={<Protected role="organizer"><EventManagement /></Protected>} />
      <Route path="/organizer/events/:eventId" element={<Protected role="organizer"><OrganizerEventWorkspace /></Protected>} />
      <Route path="/organizer/events/:eventId/results" element={<Protected role="organizer"><OrganizerResults /></Protected>} />
      <Route path="/organizer/events/:eventId/result-reports" element={<Protected role="organizer"><OrganizerResultReports /></Protected>} />
      <Route path="/organizer/events/:eventId/announcements" element={<Protected role="organizer"><OrganizerAnnouncements /></Protected>} />
      <Route path="/organizer/events/:eventId/teams" element={<Protected role="organizer"><OrganizerTeams /></Protected>} />
      <Route path="/organizer/events/:eventId/judges" element={<Protected role="organizer"><OrganizerJudges /></Protected>} />
      <Route path="/organizer/events/:eventId/evaluation" element={<Protected role="organizer"><EvaluationConfiguration /></Protected>} />
      <Route path="/organizer/events/:eventId/judges/:judgeId/evaluation/:teamId" element={<Protected role="organizer"><EvaluationSessionRoute /></Protected>} />
      <Route path="/judge/:eventId/:judgeId" element={<Protected role="judge"><JudgeDashboard /></Protected>} />
      <Route path="/organizer/judges" element={<Protected role="organizer"><OrganizerJudges /></Protected>} />
      <Route path="/dashboard" element={<Navigate to="/organizer/dashboard" replace />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}

function App() {
  return <ThemeProvider><AuthProvider><BrowserRouter><AppRoutes /></BrowserRouter></AuthProvider></ThemeProvider>;
}

export default App;

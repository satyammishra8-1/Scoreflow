import Home from './pages/Home';
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
import AuthPage from './pages/AuthPage';
import { AuthProvider } from './auth/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import RequireAuth from './auth/RequireAuth';
import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom';
import './App.css';

function EvaluationSessionRoute() {
  const { eventId = 'default', judgeId, teamId } = useParams();
  return <EvaluationSession key={`${eventId}-${judgeId}-${teamId}`} eventId={eventId} judgeId={judgeId} teamId={teamId} />;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider><BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/organizer/login" element={<AuthPage mode="organizer" />} />
          <Route path="/organizer/setup" element={<AuthPage mode="setup" />} />
          <Route path="/judge/login" element={<AuthPage mode="judge" />} />
          <Route path="/judge/invite/:token" element={<JudgeInvitation />} />
          <Route element={<RequireAuth role="organizer" />}>
          <Route path="/organizer/dashboard" element={<OrganizerDashboard />} />
          <Route path="/organizer/events" element={<EventManagement />} />
          <Route path="/organizer/events/:eventId" element={<OrganizerEventWorkspace />} />
          <Route path="/organizer/events/:eventId/results" element={<OrganizerResults />} />
          <Route path="/organizer/events/:eventId/result-reports" element={<OrganizerResultReports />} />
          <Route path="/organizer/events/:eventId/announcements" element={<OrganizerAnnouncements />} />
          <Route path="/organizer/events/:eventId/teams" element={<OrganizerTeams />} />
          <Route path="/organizer/events/:eventId/judges" element={<OrganizerJudges />} />
          <Route path="/organizer/events/:eventId/evaluation" element={<EvaluationConfiguration />} />
          <Route path="/organizer/judges" element={<OrganizerJudges />} />
          <Route path="/dashboard" element={<OrganizerDashboard />} />
          </Route>
          <Route element={<RequireAuth role="judge" />}>
          <Route path="/judge/:eventId/:judgeId" element={<JudgeDashboard />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="/organizer/events/:eventId/judges/:judgeId/evaluation/:teamId" element={<EvaluationSessionRoute />} />
          </Route>
          <Route path="*" element={<Home />} />
        </Routes>
      </BrowserRouter></AuthProvider>
    </ThemeProvider>
  );
}

export default App;

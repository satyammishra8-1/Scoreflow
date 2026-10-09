import Home from './pages/Home';
import OrganizerDashboard from './pages/OrganizerDashboard';
import EventManagement from './pages/EventManagement';
import OrganizerTeams from './pages/OrganizerTeams';
import OrganizerJudges from './pages/OrganizerJudges';
import EvaluationCriteria from './pages/EvaluationCriteria';
import EvaluationSession from './pages/EvaluationSession';
import JudgeDashboard from './pages/JudgeDashboard';
import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom';
import './App.css';

function EvaluationSessionRoute() {
  const { eventId = 'default', judgeId, teamId } = useParams();
  return <EvaluationSession key={`${eventId}-${judgeId}-${teamId}`} eventId={eventId} judgeId={judgeId} teamId={teamId} />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/organizer/dashboard" element={<OrganizerDashboard />} />
        <Route path="/organizer/events" element={<EventManagement />} />
        <Route path="/organizer/events/:eventId/teams" element={<OrganizerTeams />} />
        <Route path="/organizer/events/:eventId/judges" element={<OrganizerJudges />} />
        <Route path="/organizer/events/:eventId/criteria" element={<EvaluationCriteria />} />
        <Route path="/organizer/events/:eventId/judges/:judgeId/evaluation/:teamId" element={<EvaluationSessionRoute />} />
        <Route path="/judge/:eventId/:judgeId" element={<JudgeDashboard />} />
        <Route path="/organizer/judges" element={<OrganizerJudges />} />
        <Route path="/dashboard" element={<OrganizerDashboard />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

import Home from './pages/Home';
import OrganizerDashboard from './pages/OrganizerDashboard';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/organizer/dashboard" element={<OrganizerDashboard />} />
        <Route path="/dashboard" element={<OrganizerDashboard />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

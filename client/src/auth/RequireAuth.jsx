import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

export default function RequireAuth({ role }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <main className="auth-loading" role="status">Checking your session…</main>;
  if (!session) return <Navigate to={role === 'judge' ? '/judge/login' : '/organizer/login'} replace state={{ from: location.pathname }} />;
  if (role && session.role !== role) return <Navigate to={session.role === 'judge' ? '/judge/login' : '/organizer/login'} replace />;
  return <Outlet />;
}

import { useEffect, useMemo, useState } from 'react';
import { api, refreshAccessToken, setAccessToken } from './api';
import { AuthContext } from './authContextValue';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    refreshAccessToken().then((data) => {
      if (mounted) setSession({ role: data.role, email: data.email, eventId: data.eventId });
    }).catch(() => {
      setAccessToken(null);
      if (mounted) setSession(null);
    }).finally(() => { if (mounted) setLoading(false); });
    const onToken = (event) => { if (!event.detail) setSession(null); };
    window.addEventListener('scoreflow-auth-token', onToken);
    return () => { mounted = false; window.removeEventListener('scoreflow-auth-token', onToken); };
  }, []);

  async function signIn(path, payload, headers) {
    const response = await api.post(path, payload, headers ? { headers } : undefined);
    const data = response.data?.data;
    if (!data?.accessToken || !data?.role) throw new Error('The server returned an invalid session.');
    setAccessToken(data.accessToken);
    setSession({ role: data.role, email: data.email, eventId: data.eventId });
    return data;
  }

  async function signOut() {
    try { await api.post('/auth/logout'); } catch { /* Clear the browser session even when the network is unavailable. */ }
    setAccessToken(null);
    setSession(null);
  }

  const value = useMemo(() => ({ session, loading, signIn, signOut }), [session, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

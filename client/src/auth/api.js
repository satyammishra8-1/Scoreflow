import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true,
});

let accessToken = null;
let refreshPromise = null;

export function setAccessToken(token) {
  accessToken = token || null;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('scoreflow-auth-token', { detail: accessToken }));
}

export function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = api.post('/auth/refresh')
      .then((response) => {
        const token = response.data?.data?.accessToken;
        if (!token) throw new Error('The session could not be refreshed.');
        setAccessToken(token);
        return response.data.data;
      })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

api.interceptors.response.use((response) => response, async (error) => {
  const original = error.config;
  const path = original?.url || '';
  if (error.response?.status !== 401 || !original || original._retried
    || /\/auth\/(?:refresh|logout|organizer\/(?:login|register)|judge\/login)$/.test(path)) throw error;
  original._retried = true;
  try {
    await refreshAccessToken();
    return api(original);
  } catch {
    setAccessToken(null);
    throw error;
  }
});

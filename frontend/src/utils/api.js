import axios from 'axios';
import useDriverAuthStore from '../store/useDriverAuthStore';
import useAdminAuthStore from '../store/useAdminAuthStore';
import useUserAuthStore from '../store/useUserAuthStore';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

/**
 * The API namespaces its auth cookies per app, so every request has to say
 * which session it belongs to. It is derived from the URL prefix, which maps
 * one-to-one onto the three route trees the backend exposes.
 */
import { AUDIENCES } from '../constants/audiences';

export { AUDIENCES };

const AUDIENCE_CONFIG = {
  [AUDIENCES.USER]: {
    refreshUrl: '/auth/refresh-token',
    store: useUserAuthStore,
  },
  [AUDIENCES.DRIVER]: {
    refreshUrl: '/driver/auth/refresh-token',
    store: useDriverAuthStore,
  },
  [AUDIENCES.ADMIN]: {
    refreshUrl: '/admin/auth/refresh-token',
    store: useAdminAuthStore,
  },
};

export function audienceForUrl(url = '') {
  if (url.startsWith('/driver')) return AUDIENCES.DRIVER;
  if (url.startsWith('/admin')) return AUDIENCES.ADMIN;
  if (url.startsWith('/auth')) return AUDIENCES.USER;

  // Routes shared by more than one app (chat, uploads, common). Fall back to
  // whichever session the browser actually has; the backend accepts any of the
  // three here and uses the header to disambiguate when several are present.
  if (useDriverAuthStore.getState().isAuthenticated) return AUDIENCES.DRIVER;
  if (useAdminAuthStore.getState().isAuthenticated) return AUDIENCES.ADMIN;
  return AUDIENCES.USER;
}

function shouldSkipTokenRefresh(config) {
  const url = config?.url || '';
  return (
    url.includes('/auth/refresh-token') ||
    url.includes('/auth/logout') ||
    url.includes('/auth/login') ||
    url.includes('/auth/google') ||
    url.includes('/auth/send-otp') ||
    url.includes('/auth/verify-otp') ||
    url.includes('/admin/auth/login') ||
    url.includes('/driver/auth/login') ||
    url.includes('/driver/auth/google') ||
    url.includes('/driver/auth/send-otp') ||
    url.includes('/driver/auth/verify-otp')
  );
}

// Tells the backend which session a shared route is being called with, so a
// browser signed into two apps at once resolves deterministically.
api.interceptors.request.use((config) => {
  config.headers['X-Auth-Audience'] = audienceForUrl(config.url || '');
  return config;
});

// Single-flight guard, per audience. When an access token expires, every
// request in flight 401s at once; without this each one fires its own refresh,
// and that burst is enough to trip the API's rate limiter.
const refreshPromises = {};

function refreshSession(audience) {
  const { refreshUrl } = AUDIENCE_CONFIG[audience];
  refreshPromises[audience] ??= api
    .post(refreshUrl, {})
    .finally(() => {
      refreshPromises[audience] = null;
    });
  return refreshPromises[audience];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (!originalRequest || shouldSkipTokenRefresh(originalRequest)) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const audience = audienceForUrl(originalRequest.url || '');
      try {
        await refreshSession(audience);
      } catch (refreshError) {
        // Only a rejected refresh token means the session is genuinely over.
        // A 429, a 5xx, or a dropped connection is transient — tearing the
        // session down for those signs out a still-valid session.
        //
        // Only this app's store is cleared: the three sessions are independent
        // now, so a dead driver session says nothing about a live customer one.
        if (refreshError.response?.status === 401) {
          AUDIENCE_CONFIG[audience].store.getState().logout();
        }
        return Promise.reject(refreshError);
      }
      // Deliberately outside the try: a failure of the *retried* request is a
      // failure of that request, not evidence that the session is invalid.
      return api(originalRequest);
    }

    return Promise.reject(error);
  },
);

export default api;

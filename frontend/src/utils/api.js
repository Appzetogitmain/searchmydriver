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

/**
 * Which app THIS TAB is currently in, derived from the URL.
 *
 * It must come from the route, not from which auth store happens to be
 * populated: the stores live in localStorage, which is shared across every tab
 * on the origin. Testing the driver app and the customer app side by side means
 * both sessions are "authenticated" in both tabs, so store precedence would
 * make the customer's tab claim to be the driver — it would then join the
 * `driver:<id>` room and never receive its own booking updates.
 */
export function audienceForCurrentApp() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  if (path.startsWith('/driver')) return AUDIENCES.DRIVER;
  if (path.startsWith('/admin')) return AUDIENCES.ADMIN;
  return AUDIENCES.USER;
}

export function audienceForUrl(url = '') {
  if (url.startsWith('/driver')) return AUDIENCES.DRIVER;
  if (url.startsWith('/admin')) return AUDIENCES.ADMIN;
  if (url.startsWith('/auth')) return AUDIENCES.USER;

  // Routes shared by more than one app (chat, uploads, common) carry no role in
  // the path, so fall back to whichever app this tab is showing.
  return audienceForCurrentApp();
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
  const audience = audienceForUrl(config.url || '');
  config.headers['X-Auth-Audience'] = audience;

  const store = AUDIENCE_CONFIG[audience]?.store;
  const token = store?.getState()?.accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Single-flight guard, per audience. When an access token expires, every
// request in flight 401s at once; without this each one fires its own refresh,
// and that burst is enough to trip the API's rate limiter.
const refreshPromises = {};

function refreshSession(audience) {
  const { refreshUrl, store } = AUDIENCE_CONFIG[audience];
  const storedRefreshToken = store?.getState()?.refreshToken;
  refreshPromises[audience] ??= api
    .post(refreshUrl, { refreshToken: storedRefreshToken || undefined })
    .then((res) => {
      const data = res.data?.data || {};
      if (data.accessToken && store?.getState()?.setAuth) {
        const state = store.getState();
        const currentEntity = state.driver || state.user || state.admin;
        state.setAuth(currentEntity, {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken || storedRefreshToken,
        });
      }
      return res;
    })
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
      // Attach the newly refreshed access token to the retried request
      const latestToken = AUDIENCE_CONFIG[audience]?.store?.getState()?.accessToken;
      if (latestToken) {
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${latestToken}`;
      }
      return api(originalRequest);
    }

    return Promise.reject(error);
  },
);

export default api;

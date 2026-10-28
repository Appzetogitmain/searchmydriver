import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { logoutOnServer } from '../utils/logoutDevice';

const useAdminAuthStore = create(
  persist(
    (set) => ({
      admin: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setAuth: (admin, tokens = {}) => {
        if (admin) {
          try {
            localStorage.removeItem('user-session');
            localStorage.removeItem('driver-session');
          } catch {
            // ignore localStorage errors
          }
        }
        set((state) => ({
          admin,
          accessToken: tokens.accessToken !== undefined ? (tokens.accessToken || null) : state.accessToken,
          refreshToken: tokens.refreshToken !== undefined ? (tokens.refreshToken || null) : state.refreshToken,
          isAuthenticated: !!admin,
        }));
      },
      // Clear local state immediately so the UI signs out without waiting on
      // the network, and tell the API in the background to drop the refresh
      // cookie and deregister this device from push.
      logout: () => {
        logoutOnServer('admin');
        set({ admin: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },
    }),
    {
      name: 'admin-session',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

export default useAdminAuthStore;

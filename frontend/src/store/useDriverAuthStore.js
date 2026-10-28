import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { logoutOnServer } from '../utils/logoutDevice';

const useDriverAuthStore = create(
  persist(
    (set) => ({
      driver: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setAuth: (driver, tokens = {}) => {
        if (driver) {
          try {
            localStorage.removeItem('user-session');
            localStorage.removeItem('admin-session');
          } catch {
            // ignore localStorage errors
          }
        }
        set((state) => ({
          driver,
          accessToken: tokens.accessToken !== undefined ? (tokens.accessToken || null) : state.accessToken,
          refreshToken: tokens.refreshToken !== undefined ? (tokens.refreshToken || null) : state.refreshToken,
          isAuthenticated: !!driver,
        }));
      },
      updateDriver: (updates) => set((state) => ({ driver: { ...state.driver, ...updates } })),
      // Clear local state immediately so the UI signs out without waiting on
      // the network, and tell the API in the background to drop the refresh
      // cookie and deregister this device from push.
      logout: () => {
        logoutOnServer('driver');
        set({ driver: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },
    }),
    {
      name: 'driver-session',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export default useDriverAuthStore;

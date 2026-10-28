import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { logoutOnServer } from '../utils/logoutDevice';

const useUserAuthStore = create(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      onboarding: null,

      setAuth: (user, tokens = {}) => {
        if (user) {
          try {
            localStorage.removeItem('driver-session');
            localStorage.removeItem('admin-session');
          } catch {
            // ignore localStorage errors
          }
        }
        set((state) => ({
          user,
          accessToken: tokens.accessToken !== undefined ? (tokens.accessToken || null) : state.accessToken,
          refreshToken: tokens.refreshToken !== undefined ? (tokens.refreshToken || null) : state.refreshToken,
          isAuthenticated: !!user,
        }));
      },
      setOnboarding: (onboarding) => set({ onboarding }),
      // Clear local state immediately so the UI signs out without waiting on
      // the network, and tell the API in the background to drop the refresh
      // cookie and deregister this device from push.
      logout: () => {
        logoutOnServer('user');
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, onboarding: null });
      },
    }),
    {
      name: 'user-session',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export default useUserAuthStore;

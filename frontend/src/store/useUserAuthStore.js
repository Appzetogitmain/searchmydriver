import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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
          } catch (e) {
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
      logout: () => set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, onboarding: null }),
    }),
    {
      name: 'user-session',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export default useUserAuthStore;

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
        set({
          user,
          accessToken: tokens.accessToken || null,
          refreshToken: tokens.refreshToken || null,
          isAuthenticated: !!user,
        });
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

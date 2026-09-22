import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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
          } catch (e) {
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
      logout: () => set({ admin: null, accessToken: null, refreshToken: null, isAuthenticated: false }),
    }),
    {
      name: 'admin-session',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

export default useAdminAuthStore;

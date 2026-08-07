import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const useAdminAuthStore = create(
  persist(
    (set) => ({
      admin: null,
      isAuthenticated: false,

      setAuth: (admin) => {
        if (admin) {
          try {
            localStorage.removeItem('user-session');
            localStorage.removeItem('driver-session');
          } catch (e) {
            // ignore localStorage errors
          }
        }
        set({ admin, isAuthenticated: !!admin });
      },
      logout: () => set({ admin: null, isAuthenticated: false }),
    }),
    {
      name: 'admin-session',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

export default useAdminAuthStore;

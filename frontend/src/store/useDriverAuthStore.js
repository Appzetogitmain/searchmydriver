import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const useDriverAuthStore = create(
  persist(
    (set) => ({
      driver: null,
      isAuthenticated: false,

      setAuth: (driver) => {
        if (driver) {
          try {
            localStorage.removeItem('user-session');
            localStorage.removeItem('admin-session');
          } catch (e) {
            // ignore localStorage errors
          }
        }
        set({ driver, isAuthenticated: !!driver });
      },
      updateDriver: (updates) => set((state) => ({ driver: { ...state.driver, ...updates } })),
      logout: () => set({ driver: null, isAuthenticated: false }),
    }),
    {
      name: 'driver-session',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export default useDriverAuthStore;

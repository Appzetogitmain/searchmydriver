import { create } from 'zustand';
import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

export const useDriverEligibleRequestsQueryStore = createQueryStore(async (params = {}) => {
  const res = await api.get('/driver/trips/eligible-requests', { params });
  return res.data?.data ?? [];
});

/**
 * Driver Trip Requests state store for real-time reactivity.
 * Syncs with the query cache and provides immediate optimistic updates
 * when sockets fire for accepted/taken/withdrawn bookings.
 */
export const useDriverTripRequestsStore = create((set, get) => ({
  liveTakenBookings: new Set(),

  markBookingTaken: (bookingId) => {
    if (!bookingId) return;
    set((state) => {
      const next = new Set(state.liveTakenBookings);
      next.add(String(bookingId));
      return { liveTakenBookings: next };
    });
  },

  clearTaken: (bookingId) => {
    if (!bookingId) return;
    set((state) => {
      const next = new Set(state.liveTakenBookings);
      next.delete(String(bookingId));
      return { liveTakenBookings: next };
    });
  },

  invalidateAll: () => {
    useDriverEligibleRequestsQueryStore.getState().invalidate();
  },
}));

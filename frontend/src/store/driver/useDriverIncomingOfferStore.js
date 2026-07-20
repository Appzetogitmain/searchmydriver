import { create } from 'zustand';
import api from '../../utils/api';

/**
 * Tracks the in-flight booking offers a driver currently holds.
 *
 * Drives `BookingOfferModal` which is mounted globally inside the driver
 * dashboard layout so the prompt appears regardless of which page the
 * driver was on when the offer landed.
 */

const useDriverIncomingOfferStore = create((set, get) => ({
  offers: [],
  /** Tracks both accept and reject so the modal can show a loading state. */
  busy: null,
  error: null,
  /** The driver's currently assigned booking once they accept. */
  activeBooking: null,

  setOffer(offer) {
    set((state) => {
      const exists = state.offers.some((o) => o.bookingId === offer.bookingId);
      if (exists) return state;
      return { offers: [...state.offers, offer], error: null };
    });
  },

  clearOffer(bookingId) {
    set((state) => {
      if (!bookingId) return { offers: [], busy: null, error: null };
      return {
        offers: state.offers.filter((o) => o.bookingId !== bookingId),
        busy: null,
        error: null,
      };
    });
  },

  async fetchPendingOffers() {
    try {
      const res = await api.get('/driver/trips/pending-offers');
      const offers = res?.data?.data || [];
      set({ offers });
      return offers;
    } catch {
      return [];
    }
  },

  setActiveBooking(booking) {
    set({ activeBooking: booking });
  },

  clearActiveBooking() {
    set({ activeBooking: null });
  },

  async fetchActive() {
    try {
      const res = await api.get('/driver/bookings/active');
      const booking = res?.data?.data?.booking || null;
      set({ activeBooking: booking });
      return booking;
    } catch {
      return null;
    }
  },

  async accept(bookingId) {
    const offer = get().offers.find((o) => o.bookingId === bookingId);
    if (!offer) return null;
    set({ busy: 'accept', error: null });
    try {
      await api.post(`/driver/bookings/${offer.bookingId}/accept`);
      set((state) => ({ 
        offers: state.offers.filter((o) => o.bookingId !== bookingId), 
        busy: null 
      }));
      const booking = await get().fetchActive();
      return booking;
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'Failed to accept';
      set({ busy: null, error: message });
      throw err;
    }
  },

  async reject(bookingId) {
    const offer = get().offers.find((o) => o.bookingId === bookingId);
    if (!offer) return null;
    set({ busy: 'reject', error: null });
    try {
      await api.post(`/driver/bookings/${offer.bookingId}/reject`);
      set((state) => ({ 
        offers: state.offers.filter((o) => o.bookingId !== bookingId), 
        busy: null 
      }));
      return true;
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'Failed to reject';
      set({ busy: null, error: message });
      throw err;
    }
  },
}));

export default useDriverIncomingOfferStore;

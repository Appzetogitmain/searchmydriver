import { create } from 'zustand';
import api from '../../utils/api';
import { createQueryStore } from '../lib/createQueryStore';

/**
 * Driver dashboard query stores.
 *
 *   useDriverHomeSummaryStore   → GET /driver/home/summary   (today + rating + active)
 *   useDriverTripsListStore     → GET /driver/trips          (paginated history)
 *   useDriverEarningsStore      → GET /driver/earnings       (today/week/month + chart)
 *   useDriverEarningsLedgerStore → GET /driver/earnings/ledger (paginated all-earnings feed)
 *
 * The first three follow the `createQueryStore` contract used by the rest
 * of the app, so `useCachedQuery` + `buildCacheKey` work out of the box.
 * The ledger store is a regular Zustand store because it owns its own
 * pagination state (Load-more / append) which doesn't map cleanly onto
 * `createQueryStore`'s "single cached payload" model.
 *
 * After a trip terminates (cancel / complete) call:
 *
 *   useDriverHomeSummaryStore.getState().invalidate('driver-home-summary');
 *   useDriverTripsListStore.getState().invalidate('driver-trips-list');
 *   useDriverEarningsStore.getState().invalidate('driver-earnings');
 *   useDriverEarningsLedgerStore.getState().refresh();
 *
 * to surface fresh data on the next render.
 */

export const useDriverHomeSummaryStore = createQueryStore(async () => {
  const res = await api.get('/driver/home/summary');
  return res.data?.data ?? null;
});

export const useDriverTripsListStore = createQueryStore(async (params = {}) => {
  const res = await api.get('/driver/trips', { params });
  return (
    res.data?.data ?? { data: [], pagination: { total: 0, page: 1, pages: 1, limit: 15 } }
  );
});

export const useDriverEarningsStore = createQueryStore(async () => {
  const res = await api.get('/driver/earnings');
  return res.data?.data ?? null;
});

const EMPTY_LEDGER_TOTALS = Object.freeze({
  totalCredits: 0,
  totalDebits: 0,
  totalAutoDeductions: 0,
  totalPenalties: 0,
  creditCount: 0,
  debitCount: 0,
  autoDeductionCount: 0,
  penaltyCount: 0,
});

/**
 * Paginated ledger of every financial transaction that moved the driver's wallet —
 * Credits (trips, topups, bonuses), Auto deductions (cash settlements, platform cuts),
 * Penalties (no kit, late cancel), and Debits (withdrawals).
 */
export const useDriverEarningsLedgerStore = create((set, get) => ({
  rows: [],
  totals: { ...EMPTY_LEDGER_TOTALS },
  category: 'all',
  page: 1,
  limit: 20,
  total: 0,
  pages: 1,
  hasMore: false,
  loading: false,
  fetched: false,
  error: null,

  async fetch({ page = 1, limit = 20, category = 'all', append = false } = {}) {
    set({ loading: true, error: null, category });
    try {
      const params = { page, limit, sort: 'newest' };
      if (category && category !== 'all') {
        params.category = category;
      }
      const res = await api.get('/driver/wallet/transactions', { params });
      const data = res?.data?.data || {};
      const next = Array.isArray(data.transactions) ? data.transactions : [];
      set((state) => ({
        rows: append ? [...state.rows, ...next] : next,
        totals: data.totals || EMPTY_LEDGER_TOTALS,
        category,
        page: Number(data.page) || page,
        limit: Number(data.limit) || limit,
        total: Number(data.total) || 0,
        pages: Number(data.pages) || 1,
        hasMore:
          next.length === limit &&
          page * limit < (Number(data.total) || 0),
        loading: false,
        fetched: true,
      }));
      return data;
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load transactions';
      set({ loading: false, error: message });
      throw err;
    }
  },

  setCategory(category) {
    return get().fetch({ page: 1, limit: get().limit, category, append: false });
  },

  refresh() {
    return get().fetch({ page: 1, limit: get().limit, category: get().category, append: false });
  },

  reset() {
    set({
      rows: [],
      totals: { ...EMPTY_LEDGER_TOTALS },
      category: 'all',
      page: 1,
      limit: 20,
      total: 0,
      pages: 1,
      hasMore: false,
      loading: false,
      fetched: false,
      error: null,
    });
  },
}));
